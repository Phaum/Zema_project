import { getOrFetchCadastralRecord, resolveLandCadastralNumberCandidate, resolveLandRecord } from '../controllers/cadastralController.js';
import { geocodeByAddress, reverseGeocodeByCoords } from '../controllers/geoController.js';
import { Op } from 'sequelize';
import MarketOffer from '../models/MarketOffer.js';
import ProjectQuestionnaire from '../models/ProjectQuestionnaire.js';
import { analyzeEnvironmentByCadastralNumber } from './environmentAnalysisService.js';
import { msk64ToWgs84 } from '../utils/coordsConverter.js';
import { resolveHistoricalCenterForCoords } from '../utils/historicalCenterResolver.js';
import { resolveSpatialZoneForCoords } from '../utils/spatialZoneResolver.js';
import { findNearestMetroByCoords } from './metroFallbackService.js';
import {
    extractDistrictFromCadastralRecord,
    isPlausibleMetroDistanceMeters,
    isSuspiciousDistrictLabel,
} from '../utils/locationNormalization.js';

const CADASTRAL_REGEX = /^\d{2}:\d{2}:\d{7}:\d{1,16}$/;

function hasMeaningfulValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return true;
    return String(value).trim() !== '';
}

function normalizeFieldSourceHints(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return Object.entries(value).reduce((accumulator, [fieldName, source]) => {
        const normalizedFieldName = normalizeText(fieldName);
        const normalizedSource = normalizeText(source);

        if (!normalizedFieldName || !normalizedSource) {
            return accumulator;
        }

        accumulator[normalizedFieldName] = normalizedSource;
        return accumulator;
    }, {});
}

function resolveCadastralSourceHint(record, fallback = 'nspd') {
    return normalizeText(record?.source_provider) || fallback;
}

async function findHistoricalTotalOksAreaOnLand({ buildingCadastralNumber = null, landCadastralNumber = null } = {}) {
    const conditions = [];

    if (isValidCadastralNumber(buildingCadastralNumber)) {
        conditions.push({ buildingCadastralNumber: normalizeCadastralNumber(buildingCadastralNumber) });
    }

    if (isValidCadastralNumber(landCadastralNumber)) {
        conditions.push({ landCadastralNumber: normalizeCadastralNumber(landCadastralNumber) });
    }

    if (!conditions.length) {
        return null;
    }

    const row = await ProjectQuestionnaire.findOne({
        where: {
            totalOksAreaOnLand: {
                [Op.ne]: null,
            },
            [Op.or]: conditions,
        },
        order: [['updated_at', 'DESC']],
    });

    if (!row || row.totalOksAreaOnLand === null || row.totalOksAreaOnLand === undefined) {
        return null;
    }

    return Number(row.totalOksAreaOnLand);
}

async function findHistoricalActualAreaData({ buildingCadastralNumber = null, landCadastralNumber = null } = {}) {
    const conditions = [];

    if (isValidCadastralNumber(buildingCadastralNumber)) {
        conditions.push({ buildingCadastralNumber: normalizeCadastralNumber(buildingCadastralNumber) });
    }

    if (isValidCadastralNumber(landCadastralNumber)) {
        conditions.push({ landCadastralNumber: normalizeCadastralNumber(landCadastralNumber) });
    }

    if (!conditions.length) {
        return null;
    }

    const row = await ProjectQuestionnaire.findOne({
        where: {
            [Op.or]: [
                {
                    leasableArea: {
                        [Op.ne]: null,
                    },
                },
                {
                    occupiedArea: {
                        [Op.ne]: null,
                    },
                },
            ],
            [Op.or]: conditions,
        },
        order: [['updated_at', 'DESC']],
    });

    if (!row) {
        return null;
    }

    return {
        leasableArea: row.leasableArea === null || row.leasableArea === undefined ? null : Number(row.leasableArea),
        occupiedArea: row.occupiedArea === null || row.occupiedArea === undefined ? null : Number(row.occupiedArea),
        occupancyRate: row.occupancyRate === null || row.occupancyRate === undefined ? null : Number(row.occupancyRate),
    };
}

function normalizeCadastralNumber(value) {
    return String(value || '').trim();
}

function normalizeText(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ');
}

function toNumberOrNull(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function hasValidCoordinates(lat, lng) {
    return (
        Number.isFinite(Number(lat)) &&
        Number.isFinite(Number(lng)) &&
        Number(lat) >= -90 &&
        Number(lat) <= 90 &&
        Number(lng) >= -180 &&
        Number(lng) <= 180
    );
}

function isManualFieldSource(source) {
    return normalizeText(source).toLowerCase().startsWith('manual');
}

function calculateDistanceMeters(left, right) {
    if (!left || !right || !hasValidCoordinates(left.lat, left.lng) || !hasValidCoordinates(right.lat, right.lng)) {
        return null;
    }

    const earthRadius = 6371000;
    const toRadians = (value) => (Number(value) * Math.PI) / 180;
    const lat1 = toRadians(left.lat);
    const lat2 = toRadians(right.lat);
    const deltaLat = toRadians(Number(right.lat) - Number(left.lat));
    const deltaLng = toRadians(Number(right.lng) - Number(left.lng));

    const a = (
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2
    );
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadius * c;
}

function isValidCadastralNumber(value) {
    return CADASTRAL_REGEX.test(normalizeCadastralNumber(value));
}

function inferBusinessCenterClassByRate(rate) {
    const numericRate = Number(rate);

    if (!Number.isFinite(numericRate) || numericRate <= 0) {
        return null;
    }

    if (numericRate >= 3500) return 'A+';
    if (numericRate >= 2800) return 'A';
    if (numericRate >= 2200) return 'B+';
    if (numericRate >= 1600) return 'B';
    return 'C';
}

function normalizeClassLabel(value) {
    const normalized = normalizeText(value)
        .toUpperCase()
        .replace(/А/g, 'A')
        .replace(/В/g, 'B')
        .replace(/\s+/g, '');

    return normalized || null;
}

function getClassVariants(value) {
    const normalized = normalizeClassLabel(value);

    if (!normalized) return [];
    if (normalized === 'B+') return ['B+', 'В+'];
    if (normalized === 'B') return ['B', 'В'];
    if (normalized === 'A+') return ['A+'];
    if (normalized === 'A') return ['A'];
    if (normalized === 'C') return ['C', 'С'];
    return [normalized];
}

function toTime(value) {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
}

function getDayDiff(left, right) {
    const leftTime = toTime(left);
    const rightTime = toTime(right);

    if (leftTime === null || rightTime === null) {
        return Number.POSITIVE_INFINITY;
    }

    return Math.abs(leftTime - rightTime) / (1000 * 60 * 60 * 24);
}

function median(values = []) {
    const sorted = values
        .map(toNumberOrNull)
        .filter((value) => value !== null)
        .sort((a, b) => a - b);

    if (!sorted.length) return null;

    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
        return sorted[middle];
    }

    return (sorted[middle - 1] + sorted[middle]) / 2;
}

function mode(values = []) {
    const counts = new Map();

    values
        .map((value) => normalizeText(value))
        .filter(Boolean)
        .forEach((value) => {
            counts.set(value, (counts.get(value) || 0) + 1);
        });

    let winner = null;
    let maxCount = -1;

    counts.forEach((count, value) => {
        if (count > maxCount) {
            winner = value;
            maxCount = count;
        }
    });

    return winner;
}

function numericMode(values = []) {
    const winner = mode(
        values
            .map((value) => toNumberOrNull(value))
            .filter((value) => value !== null)
            .map((value) => String(value))
    );

    return winner === null ? null : Number(winner);
}

function uniqueValues(values = []) {
    const seen = new Set();
    const result = [];

    values
        .map((value) => normalizeText(value))
        .filter(Boolean)
        .forEach((value) => {
            if (seen.has(value)) return;
            seen.add(value);
            result.push(value);
        });

    return result;
}

function booleanMode(values = []) {
    const valid = values.filter((value) => typeof value === 'boolean');

    if (!valid.length) return null;

    const trueCount = valid.filter(Boolean).length;
    const falseCount = valid.length - trueCount;

    return trueCount >= falseCount;
}

function resolveOfferRate(offer = {}) {
    return (
        toNumberOrNull(offer.price_per_sqm_cleaned) ??
        toNumberOrNull(offer.price_without_vat_per_sqm_month) ??
        toNumberOrNull(offer.price_per_sqm_month)
    );
}

function resolveOfferCoordinates(offers = []) {
    for (const offer of offers) {
        const x = toNumberOrNull(offer?.x);
        const y = toNumberOrNull(offer?.y);

        if (x === null || y === null) {
            continue;
        }

        try {
            const converted = msk64ToWgs84(x, y);
            const lat = toNumberOrNull(converted?.lat);
            const lng = toNumberOrNull(converted?.lon);

            if (hasValidCoordinates(lat, lng)) {
                return { lat, lng };
            }
        } catch {
            // ignore invalid coordinate rows and continue with the next offer
        }
    }

    return null;
}

function inferActualUseFromOffers(offers = []) {
    const values = offers
        .map((offer) => normalizeText(offer.model_functional || offer.function_name).toLowerCase())
        .filter(Boolean);

    if (!values.length) {
        return null;
    }

    if (values.some((value) => value.includes('оф'))) {
        return 'business_center';
    }

    return null;
}

function isFirstFloor(floor = {}) {
    const normalized = normalizeText(
        [floor.id, floor.floorCategory, floor.floorLocation, floor.name, floor.label].join(' ')
    ).toLowerCase();

    return normalized.includes('above_1') || normalized.includes('first') || normalized.includes('перв');
}

function resolveReferenceUnitArea(questionnaire = {}) {
    const floors = Array.isArray(questionnaire.floors) ? questionnaire.floors : [];
    const firstFloor = floors.find(isFirstFloor) || floors[0];

    if (!firstFloor) return null;

    return (
        toNumberOrNull(firstFloor.avgLeasableRoomArea) ??
        toNumberOrNull(firstFloor.leasableArea) ??
        toNumberOrNull(firstFloor.area)
    );
}

function selectRepresentativeOffers(offers = [], { valuationDate, referenceArea } = {}) {
    let selected = offers.filter((offer) => resolveOfferRate(offer) !== null);

    if (!selected.length) return [];

    if (Number.isFinite(referenceArea) && referenceArea > 0) {
        const byArea = selected.filter((offer) => {
            const area = toNumberOrNull(offer.area_total);
            return area !== null && Math.abs(area - referenceArea) <= 200;
        });

        if (byArea.length >= 3) {
            selected = byArea;
        }
    }

    if (valuationDate) {
        const sortedByDate = [...selected].sort(
            (left, right) => getDayDiff(left.offer_date, valuationDate) - getDayDiff(right.offer_date, valuationDate)
        );
        const withinYear = sortedByDate.filter((offer) => getDayDiff(offer.offer_date, valuationDate) <= 365);

        if (withinYear.length >= 3) {
            selected = withinYear;
        } else if (sortedByDate.length >= 3) {
            selected = sortedByDate;
        }
    }

    return [...selected]
        .sort((left, right) => getDayDiff(left.offer_date, valuationDate) - getDayDiff(right.offer_date, valuationDate))
        .slice(0, Math.min(selected.length, 25));
}

async function findOffersByBuilding(buildingCadastralNumber) {
    if (!isValidCadastralNumber(buildingCadastralNumber)) {
        return [];
    }

    return MarketOffer.findAll({
        attributes: [
            'class_offer',
            'model_functional',
            'function_name',
            'district',
            'metro',
            'address_offer',
            'area_total',
            'offer_date',
            'above_ground_floors',
            'total_floors',
            'underground_floors',
            'x',
            'y',
            'price_per_sqm_cleaned',
            'price_without_vat_per_sqm_month',
            'price_per_sqm_month',
            'environment_historical_center',
            'environment_category_1',
            'environment_category_2',
            'environment_category_3',
        ],
        where: {
            building_cadastral_number: normalizeCadastralNumber(buildingCadastralNumber),
        },
        order: [['offer_date', 'DESC']],
        raw: true,
    });
}

async function findOffersByDistrictAndClass({ districts = [], businessClass }) {
    const districtCandidates = uniqueValues(districts);
    const classVariants = getClassVariants(businessClass);

    if (!districtCandidates.length || !classVariants.length) {
        return [];
    }

    return MarketOffer.findAll({
        attributes: [
            'area_total',
            'offer_date',
            'price_per_sqm_cleaned',
            'price_without_vat_per_sqm_month',
            'price_per_sqm_month',
        ],
        where: {
            district: {
                [Op.in]: districtCandidates,
            },
            class_offer: {
                [Op.in]: classVariants,
            },
            [Op.or]: [
                { price_per_sqm_cleaned: { [Op.ne]: null } },
                { price_without_vat_per_sqm_month: { [Op.ne]: null } },
                { price_per_sqm_month: { [Op.ne]: null } },
            ],
        },
        order: [['offer_date', 'DESC']],
        limit: 500,
        raw: true,
    });
}

function buildRatePayload(offers = [], { valuationDate, referenceArea, source } = {}) {
    const selected = selectRepresentativeOffers(offers, { valuationDate, referenceArea });
    const rate = median(selected.map(resolveOfferRate));

    if (!Number.isFinite(rate) || rate <= 0) {
        return null;
    }

    return {
        rate,
        source,
        sampleSize: selected.length,
    };
}

function pickMissing(target, key, value, source, autoFilledFields, sourceHints) {
    if (hasMeaningfulValue(target[key]) || !hasMeaningfulValue(value)) {
        return;
    }

    target[key] = value;
    autoFilledFields.push(key);
    sourceHints[key] = source;
}

function replaceResolvedValue(target, key, value, source, autoFilledFields, sourceHints) {
    if (!hasMeaningfulValue(value)) {
        return;
    }

    target[key] = value;
    if (!autoFilledFields.includes(key)) {
        autoFilledFields.push(key);
    }
    sourceHints[key] = source;
}

function resolveEffectiveFieldSource(target, key, sourceHints = {}) {
    return normalizeText(
        sourceHints?.[key] ||
        target?.fieldSourceHints?.[key]
    );
}

function removeResolvedValue(target, key, autoFilledFields, sourceHints) {
    target[key] = null;

    const autoFilledIndex = autoFilledFields.indexOf(key);
    if (autoFilledIndex !== -1) {
        autoFilledFields.splice(autoFilledIndex, 1);
    }

    delete sourceHints[key];

    if (target.fieldSourceHints && typeof target.fieldSourceHints === 'object') {
        const nextHints = { ...target.fieldSourceHints };
        delete nextHints[key];
        target.fieldSourceHints = nextHints;
    }
}

function formatAreaValue(value) {
    const numeric = toNumberOrNull(value);

    if (!Number.isFinite(numeric)) {
        return null;
    }

    return Number(numeric.toFixed(2));
}

export function validateTotalOksAreaOnLandCandidate(value, questionnaire = {}) {
    const candidate = toNumberOrNull(value);

    if (!Number.isFinite(candidate) || candidate <= 0) {
        return {
            isValid: false,
            violations: [
                {
                    field: 'value',
                    label: 'значение не задано или не является положительным числом',
                    referenceValue: null,
                },
            ],
        };
    }

    const comparisons = [
        {
            field: 'totalArea',
            label: 'общей площади объекта',
            referenceValue: toNumberOrNull(questionnaire?.totalArea),
        },
        {
            field: 'leasableArea',
            label: 'арендопригодной площади',
            referenceValue: toNumberOrNull(questionnaire?.leasableArea),
        },
        {
            field: 'occupiedArea',
            label: 'занятой площади',
            referenceValue: toNumberOrNull(questionnaire?.occupiedArea),
        },
    ];

    const violations = comparisons.filter(({ referenceValue }) => (
        Number.isFinite(referenceValue) && (candidate + 0.01) < referenceValue
    ));

    return {
        isValid: violations.length === 0,
        violations,
    };
}

function buildTotalOksAreaOnLandValidationWarning(value, validation, source) {
    const sourceLabel = source === 'historical_project_questionnaire'
        ? 'Историческое значение'
        : (source.includes('nspd') || source.includes('reestrnet'))
            ? 'Кадастровое значение'
            : 'Автозаполненное значение';
    const candidate = formatAreaValue(value);
    const details = validation.violations
        .filter((item) => item?.field !== 'value')
        .map((item) => `${item.label} ${formatAreaValue(item.referenceValue)} м²`)
        .join(', ');

    if (!details) {
        return `${sourceLabel} общей площади ОКС на участке отброшено: значение некорректно.`;
    }

    return `${sourceLabel} общей площади ОКС на участке ${candidate} м² отброшено: оно меньше ${details}.`;
}

export function sanitizeAutoFilledTotalOksAreaOnLand(questionnaire = {}, { sourceHints = {} } = {}) {
    const nextQuestionnaire = {
        ...questionnaire,
        fieldSourceHints: normalizeFieldSourceHints(questionnaire?.fieldSourceHints),
    };
    const source = resolveEffectiveFieldSource(nextQuestionnaire, 'totalOksAreaOnLand', sourceHints);

    if (!hasMeaningfulValue(nextQuestionnaire.totalOksAreaOnLand) || !source || isManualFieldSource(source)) {
        return {
            questionnaire: nextQuestionnaire,
            removed: false,
            source: source || null,
            validation: validateTotalOksAreaOnLandCandidate(nextQuestionnaire.totalOksAreaOnLand, nextQuestionnaire),
        };
    }

    const validation = validateTotalOksAreaOnLandCandidate(
        nextQuestionnaire.totalOksAreaOnLand,
        nextQuestionnaire
    );

    if (validation.isValid) {
        return {
            questionnaire: nextQuestionnaire,
            removed: false,
            source,
            validation,
        };
    }

    const nextHints = { ...nextQuestionnaire.fieldSourceHints };
    delete nextHints.totalOksAreaOnLand;

    return {
        questionnaire: {
            ...nextQuestionnaire,
            totalOksAreaOnLand: null,
            fieldSourceHints: nextHints,
        },
        removed: true,
        source,
        validation,
    };
}

export function shouldPreferCadastralTotalOksAreaOnLand({
    currentValue,
    currentSource = null,
    cadastralValue,
}) {
    const cadastral = toNumberOrNull(cadastralValue);

    if (!Number.isFinite(cadastral) || cadastral <= 0) {
        return false;
    }

    if (!hasMeaningfulValue(currentValue)) {
        return true;
    }

    return !isManualFieldSource(currentSource);
}

function clearInvalidAutoFilledTotalOksAreaOnLand(target, autoFilledFields, sourceHints, warnings) {
    const source = resolveEffectiveFieldSource(target, 'totalOksAreaOnLand', sourceHints);

    if (!hasMeaningfulValue(target.totalOksAreaOnLand) || !source || isManualFieldSource(source)) {
        return false;
    }

    const validation = validateTotalOksAreaOnLandCandidate(target.totalOksAreaOnLand, target);
    if (validation.isValid) {
        return false;
    }

    if (Array.isArray(warnings)) {
        const warning = buildTotalOksAreaOnLandValidationWarning(
            target.totalOksAreaOnLand,
            validation,
            source
        );

        if (!warnings.includes(warning)) {
            warnings.push(warning);
        }
    }

    removeResolvedValue(target, 'totalOksAreaOnLand', autoFilledFields, sourceHints);
    return true;
}

function buildBuildingMissingFields(questionnaire = {}) {
    return [
        'objectType',
        'objectAddress',
        'totalArea',
        'constructionYear',
        'mapPointLat',
        'mapPointLng',
        'district',
        'nearestMetro',
        'metroDistance',
        'cadCost',
        'permittedUse',
    ].filter((field) => !hasMeaningfulValue(questionnaire[field]));
}

function buildLandMissingFields(questionnaire = {}) {
    return [
        'landArea',
        'landCadCost',
        'totalOksAreaOnLand',
    ].filter((field) => !hasMeaningfulValue(questionnaire[field]));
}

export async function enrichQuestionnaireData(questionnaire = {}, { forceRefresh = false } = {}) {
    const enriched = {
        ...questionnaire,
        fieldSourceHints: normalizeFieldSourceHints(questionnaire.fieldSourceHints),
    };
    const autoFilledFields = [];
    const sourceHints = {};
    const warnings = [];
    const referenceArea = resolveReferenceUnitArea(enriched);
    let buildingRecord = null;
    let landRecord = null;

    clearInvalidAutoFilledTotalOksAreaOnLand(enriched, autoFilledFields, sourceHints, warnings);

    if (hasMeaningfulValue(enriched.buildingCadastralNumber) && isValidCadastralNumber(enriched.buildingCadastralNumber)) {
        try {
            const record = await getOrFetchCadastralRecord(enriched.buildingCadastralNumber, { forceRefresh });
            buildingRecord = record?.get ? record.get({ plain: true }) : record;
            const recordSource = resolveCadastralSourceHint(record, 'nspd_building');
            const metroSource = hasMeaningfulValue(record?.source_provider) ? recordSource : 'geo_service';
            const normalizedDistrict = extractDistrictFromCadastralRecord(buildingRecord);

            pickMissing(enriched, 'objectType', record.object_type || 'здание', recordSource, autoFilledFields, sourceHints);
            pickMissing(enriched, 'objectAddress', record.address_document || record.address_display || record.address, recordSource, autoFilledFields, sourceHints);
            pickMissing(enriched, 'totalArea', record.total_area !== null ? Number(record.total_area) : null, recordSource, autoFilledFields, sourceHints);
            pickMissing(
                enriched,
                'constructionYear',
                record.year_built ? Number(record.year_built) : (record.year_commisioning ? Number(record.year_commisioning) : null),
                recordSource,
                autoFilledFields,
                sourceHints
            );
            pickMissing(enriched, 'aboveGroundFloors', record.floor_count ? Number(record.floor_count) : null, recordSource, autoFilledFields, sourceHints);
            pickMissing(enriched, 'mapPointLat', record.latitude !== null ? Number(record.latitude) : null, recordSource, autoFilledFields, sourceHints);
            pickMissing(enriched, 'mapPointLng', record.longitude !== null ? Number(record.longitude) : null, recordSource, autoFilledFields, sourceHints);
            pickMissing(enriched, 'district', normalizedDistrict, recordSource, autoFilledFields, sourceHints);
            pickMissing(enriched, 'nearestMetro', record.nearest_metro, metroSource, autoFilledFields, sourceHints);
            pickMissing(enriched, 'metroDistance', record.metro_distance !== null ? Number(record.metro_distance) : null, metroSource, autoFilledFields, sourceHints);
            pickMissing(enriched, 'cadCost', record.cad_cost !== null ? Number(record.cad_cost) : null, recordSource, autoFilledFields, sourceHints);
            pickMissing(enriched, 'permittedUse', record.permitted_use, recordSource, autoFilledFields, sourceHints);

            enriched.nspdBuildingLoaded = true;

            if (!hasMeaningfulValue(enriched.landCadastralNumber)) {
                const directLandCad = normalizeText(record.land_plot_cadastral_number);
                if (directLandCad) {
                    pickMissing(
                        enriched,
                        'landCadastralNumber',
                        directLandCad,
                        recordSource,
                        autoFilledFields,
                        sourceHints
                    );
                }

                const resolvedLandCad = await resolveLandCadastralNumberCandidate(
                    enriched.buildingCadastralNumber,
                    {
                        relatedAddress: record.address,
                        excludeCadastralNumber: enriched.buildingCadastralNumber,
                    }
                );

                pickMissing(
                    enriched,
                    'landCadastralNumber',
                    resolvedLandCad,
                    'resolved_from_cadastral_quarter',
                    autoFilledFields,
                    sourceHints
                );
            }
        } catch (error) {
            warnings.push(`Не удалось подтянуть данные здания: ${error.message}`);
        }
    }

    if (
        (hasMeaningfulValue(enriched.buildingCadastralNumber) && isValidCadastralNumber(enriched.buildingCadastralNumber)) ||
        (hasMeaningfulValue(enriched.landCadastralNumber) && isValidCadastralNumber(enriched.landCadastralNumber))
    ) {
        try {
            const historicalActualArea = await findHistoricalActualAreaData({
                buildingCadastralNumber: enriched.buildingCadastralNumber,
                landCadastralNumber: enriched.landCadastralNumber,
            });

            pickMissing(
                enriched,
                'leasableArea',
                historicalActualArea?.leasableArea ?? null,
                'historical_project_questionnaire',
                autoFilledFields,
                sourceHints
            );
            pickMissing(
                enriched,
                'occupiedArea',
                historicalActualArea?.occupiedArea ?? null,
                'historical_project_questionnaire',
                autoFilledFields,
                sourceHints
            );
            pickMissing(
                enriched,
                'occupancyRate',
                historicalActualArea?.occupancyRate ?? null,
                'historical_project_questionnaire',
                autoFilledFields,
                sourceHints
            );
        } catch (error) {
            warnings.push(`Не удалось подтянуть фактические площади из истории проектов: ${error.message}`);
        }
    }

    if (hasMeaningfulValue(enriched.landCadastralNumber) && isValidCadastralNumber(enriched.landCadastralNumber)) {
        try {
            const historicalTotalOksArea = await findHistoricalTotalOksAreaOnLand({
                buildingCadastralNumber: enriched.buildingCadastralNumber,
                landCadastralNumber: enriched.landCadastralNumber,
            });
            const historicalValidation = validateTotalOksAreaOnLandCandidate(
                historicalTotalOksArea,
                enriched
            );

            if (historicalValidation.isValid) {
                pickMissing(
                    enriched,
                    'totalOksAreaOnLand',
                    historicalTotalOksArea,
                    'historical_project_questionnaire',
                    autoFilledFields,
                    sourceHints
                );
            } else if (hasMeaningfulValue(historicalTotalOksArea)) {
                const warning = buildTotalOksAreaOnLandValidationWarning(
                    historicalTotalOksArea,
                    historicalValidation,
                    'historical_project_questionnaire'
                );

                if (!warnings.includes(warning)) {
                    warnings.push(warning);
                }
            }
        } catch (error) {
            warnings.push(`Не удалось подтянуть общую площадь ОКС на участке из истории проектов: ${error.message}`);
        }

        try {
            const record = await resolveLandRecord(enriched.landCadastralNumber, {
                forceRefresh,
                relatedAddress: enriched.objectAddress,
            });
            landRecord = record?.get ? record.get({ plain: true }) : record;
            const recordSource = resolveCadastralSourceHint(record, 'nspd_land');
            const normalizedDistrict = extractDistrictFromCadastralRecord(landRecord);

            if (normalizeCadastralNumber(record.cadastral_number) !== normalizeCadastralNumber(enriched.landCadastralNumber)) {
                enriched.landCadastralNumber = record.cadastral_number;
                if (!autoFilledFields.includes('landCadastralNumber')) {
                    autoFilledFields.push('landCadastralNumber');
                }
                sourceHints.landCadastralNumber = 'resolved_from_cadastral_quarter';
            }

            pickMissing(enriched, 'landArea', record.land_area !== null ? Number(record.land_area) : null, recordSource, autoFilledFields, sourceHints);
            pickMissing(enriched, 'landCadCost', record.cad_cost !== null ? Number(record.cad_cost) : null, recordSource, autoFilledFields, sourceHints);
            const cadastralTotalOksArea = record.total_oks_area_on_land !== null
                ? Number(record.total_oks_area_on_land)
                : null;
            const cadastralValidation = validateTotalOksAreaOnLandCandidate(
                cadastralTotalOksArea,
                enriched
            );
            const currentTotalOksSource = resolveEffectiveFieldSource(
                enriched,
                'totalOksAreaOnLand',
                sourceHints
            );

            if (
                cadastralValidation.isValid &&
                shouldPreferCadastralTotalOksAreaOnLand({
                    currentValue: enriched.totalOksAreaOnLand,
                    currentSource: currentTotalOksSource,
                    cadastralValue: cadastralTotalOksArea,
                })
            ) {
                replaceResolvedValue(
                    enriched,
                    'totalOksAreaOnLand',
                    cadastralTotalOksArea,
                    recordSource,
                    autoFilledFields,
                    sourceHints
                );
            } else if (hasMeaningfulValue(cadastralTotalOksArea) && !cadastralValidation.isValid) {
                const warning = buildTotalOksAreaOnLandValidationWarning(
                    cadastralTotalOksArea,
                    cadastralValidation,
                    recordSource
                );

                if (!warnings.includes(warning)) {
                    warnings.push(warning);
                }
            }
            pickMissing(enriched, 'mapPointLat', record.latitude !== null ? Number(record.latitude) : null, recordSource, autoFilledFields, sourceHints);
            pickMissing(enriched, 'mapPointLng', record.longitude !== null ? Number(record.longitude) : null, recordSource, autoFilledFields, sourceHints);
            pickMissing(enriched, 'district', normalizedDistrict, recordSource, autoFilledFields, sourceHints);
            pickMissing(enriched, 'permittedUse', record.permitted_use, recordSource, autoFilledFields, sourceHints);

            enriched.nspdLandLoaded = true;
            clearInvalidAutoFilledTotalOksAreaOnLand(enriched, autoFilledFields, sourceHints, warnings);
        } catch (error) {
            warnings.push(`Не удалось подтянуть данные участка: ${error.message}`);
        }
    }

    const resolvedDistrictFromRecords =
        extractDistrictFromCadastralRecord(buildingRecord) ||
        extractDistrictFromCadastralRecord(landRecord);
    const currentDistrictSource = normalizeText(
        sourceHints.district ||
        enriched.fieldSourceHints?.district
    );

    if (
        resolvedDistrictFromRecords &&
        (!hasMeaningfulValue(enriched.district) || isSuspiciousDistrictLabel(enriched.district)) &&
        !isManualFieldSource(currentDistrictSource)
    ) {
        replaceResolvedValue(
            enriched,
            'district',
            resolvedDistrictFromRecords,
            buildingRecord ? resolveCadastralSourceHint(buildingRecord, 'nspd_building') : 'nspd_land',
            autoFilledFields,
            sourceHints
        );
    }

    let exactObjectOffers = [];

    if (hasMeaningfulValue(enriched.buildingCadastralNumber) && isValidCadastralNumber(enriched.buildingCadastralNumber)) {
        try {
            exactObjectOffers = await findOffersByBuilding(enriched.buildingCadastralNumber);

            if (exactObjectOffers.length) {
                const classFromOffers = normalizeClassLabel(mode(exactObjectOffers.map((offer) => offer.class_offer)));
                const districtFromOffers = mode(exactObjectOffers.map((offer) => offer.district));
                const metroFromOffers = mode(exactObjectOffers.map((offer) => offer.metro));
                const addressFromOffers = mode(exactObjectOffers.map((offer) => offer.address_offer));
                const historicalCenterFromOffers = booleanMode(
                    exactObjectOffers.map((offer) => offer.environment_historical_center)
                );
                const offerCoordinates = resolveOfferCoordinates(exactObjectOffers);

                pickMissing(
                    enriched,
                    'district',
                    districtFromOffers,
                    'market_offers_exact_object',
                    autoFilledFields,
                    sourceHints
                );
                pickMissing(
                    enriched,
                    'nearestMetro',
                    metroFromOffers,
                    'market_offers_exact_object',
                    autoFilledFields,
                    sourceHints
                );
                pickMissing(
                    enriched,
                    'objectAddress',
                    addressFromOffers,
                    'market_offers_exact_object',
                    autoFilledFields,
                    sourceHints
                );
                pickMissing(
                    enriched,
                    'mapPointLat',
                    offerCoordinates?.lat ?? null,
                    'market_offers_exact_object',
                    autoFilledFields,
                    sourceHints
                );
                pickMissing(
                    enriched,
                    'mapPointLng',
                    offerCoordinates?.lng ?? null,
                    'market_offers_exact_object',
                    autoFilledFields,
                    sourceHints
                );
                pickMissing(
                    enriched,
                    'businessCenterClass',
                    classFromOffers,
                    'market_offers_exact_object',
                    autoFilledFields,
                    sourceHints
                );
                pickMissing(
                    enriched,
                    'marketClassResolved',
                    classFromOffers,
                    'market_offers_exact_object',
                    autoFilledFields,
                    sourceHints
                );
                pickMissing(
                    enriched,
                    'actualUse',
                    inferActualUseFromOffers(exactObjectOffers),
                    'market_offers_exact_object',
                    autoFilledFields,
                    sourceHints
                );
                pickMissing(
                    enriched,
                    'aboveGroundFloors',
                    numericMode(exactObjectOffers.map((offer) => offer.total_floors ?? offer.above_ground_floors)),
                    'market_offers_exact_object',
                    autoFilledFields,
                    sourceHints
                );
                pickMissing(
                    enriched,
                    'undergroundFloors',
                    numericMode(exactObjectOffers.map((offer) => offer.underground_floors)),
                    'market_offers_exact_object',
                    autoFilledFields,
                    sourceHints
                );
                pickMissing(
                    enriched,
                    'isHistoricalCenter',
                    historicalCenterFromOffers,
                    'market_offers_exact_object',
                    autoFilledFields,
                    sourceHints
                );
                pickMissing(
                    enriched,
                    'environmentCategory1',
                    mode(exactObjectOffers.map((offer) => offer.environment_category_1)),
                    'market_offers_exact_object',
                    autoFilledFields,
                    sourceHints
                );
                pickMissing(
                    enriched,
                    'environmentCategory2',
                    mode(exactObjectOffers.map((offer) => offer.environment_category_2)),
                    'market_offers_exact_object',
                    autoFilledFields,
                    sourceHints
                );
                pickMissing(
                    enriched,
                    'environmentCategory3',
                    mode(exactObjectOffers.map((offer) => offer.environment_category_3)),
                    'market_offers_exact_object',
                    autoFilledFields,
                    sourceHints
                );

                const exactRatePayload = buildRatePayload(exactObjectOffers, {
                    valuationDate: enriched.valuationDate,
                    referenceArea,
                    source: 'market_offers_exact_object',
                });

                pickMissing(
                    enriched,
                    'averageRentalRate',
                    exactRatePayload?.rate ?? null,
                    exactRatePayload?.source ?? 'market_offers_exact_object',
                    autoFilledFields,
                    sourceHints
                );
            }
        } catch (error) {
            warnings.push(`Не удалось получить рыночные данные по объекту: ${error.message}`);
        }
    }

    if (
        !hasMeaningfulValue(enriched.objectAddress) &&
        hasMeaningfulValue(enriched.mapPointLat) &&
        hasMeaningfulValue(enriched.mapPointLng)
    ) {
        try {
            const reverse = await reverseGeocodeByCoords(enriched.mapPointLat, enriched.mapPointLng);
            pickMissing(
                enriched,
                'objectAddress',
                reverse.address || reverse.displayName || null,
                'reverse_geocode',
                autoFilledFields,
                sourceHints
            );
        } catch (error) {
            warnings.push(`Не удалось определить адрес по координатам: ${error.message}`);
        }
    }

    if (hasMeaningfulValue(enriched.objectAddress)) {
        try {
            const geocoded = await geocodeByAddress(enriched.objectAddress);
            const currentCoordinateSource = normalizeText(
                sourceHints.mapPointLat ||
                sourceHints.mapPointLng ||
                enriched.fieldSourceHints?.mapPointLat ||
                enriched.fieldSourceHints?.mapPointLng
            );
            const hasCurrentCoordinates = hasValidCoordinates(enriched.mapPointLat, enriched.mapPointLng);
            const geocodedPoint = {
                lat: Number(geocoded.lat),
                lng: Number(geocoded.lng),
            };
            const currentPoint = hasCurrentCoordinates
                ? {
                    lat: Number(enriched.mapPointLat),
                    lng: Number(enriched.mapPointLng),
                }
                : null;
            const shouldUseAddressCoordinates = !isManualFieldSource(currentCoordinateSource);

            if (!hasCurrentCoordinates) {
                pickMissing(
                    enriched,
                    'mapPointLat',
                    geocoded.lat,
                    'geocode_by_address_primary',
                    autoFilledFields,
                    sourceHints
                );
                pickMissing(
                    enriched,
                    'mapPointLng',
                    geocoded.lng,
                    'geocode_by_address_primary',
                    autoFilledFields,
                    sourceHints
                );
            } else if (shouldUseAddressCoordinates) {
                const distanceToGeocodedPoint = currentPoint
                    ? calculateDistanceMeters(currentPoint, geocodedPoint)
                    : null;

                replaceResolvedValue(
                    enriched,
                    'mapPointLat',
                    geocoded.lat,
                    'geocode_by_address_primary',
                    autoFilledFields,
                    sourceHints
                );
                replaceResolvedValue(
                    enriched,
                    'mapPointLng',
                    geocoded.lng,
                    'geocode_by_address_primary',
                    autoFilledFields,
                    sourceHints
                );

                if (distanceToGeocodedPoint !== null && distanceToGeocodedPoint >= 25) {
                    warnings.push(`Координаты объекта уточнены по адресу (смещение от исходной точки: ${Math.round(distanceToGeocodedPoint)} м).`);
                }
            }
        } catch (error) {
            warnings.push(`Не удалось определить координаты по адресу: ${error.message}`);
        }
    }

    if (hasValidCoordinates(enriched.mapPointLat, enriched.mapPointLng)) {
        const currentCoordinateSource = normalizeText(
            sourceHints.mapPointLat ||
            sourceHints.mapPointLng ||
            enriched.fieldSourceHints?.mapPointLat ||
            enriched.fieldSourceHints?.mapPointLng
        );
        const currentMetroSource = normalizeText(
            sourceHints.metroDistance ||
            sourceHints.nearestMetro ||
            enriched.fieldSourceHints?.metroDistance ||
            enriched.fieldSourceHints?.nearestMetro
        );
        const shouldResolveMetroByCoords =
            !isManualFieldSource(currentMetroSource) &&
            (
                !hasMeaningfulValue(enriched.nearestMetro) ||
                !isPlausibleMetroDistanceMeters(enriched.metroDistance) ||
                currentCoordinateSource === 'geocode_by_address_primary'
            );

        if (shouldResolveMetroByCoords) {
            try {
                const metro = await findNearestMetroByCoords({
                    lat: Number(enriched.mapPointLat),
                    lon: Number(enriched.mapPointLng),
                    address: enriched.objectAddress,
                    city: 'Санкт-Петербург',
                });

                if (hasMeaningfulValue(metro?.station) && isPlausibleMetroDistanceMeters(metro?.distance)) {
                    replaceResolvedValue(
                        enriched,
                        'nearestMetro',
                        metro.station,
                        'metro_by_coordinates',
                        autoFilledFields,
                        sourceHints
                    );
                    replaceResolvedValue(
                        enriched,
                        'metroDistance',
                        Number(metro.distance),
                        'metro_by_coordinates',
                        autoFilledFields,
                        sourceHints
                    );
                }
            } catch (error) {
                warnings.push(`Не удалось уточнить метро по координатам: ${error.message}`);
            }
        }
    }

    if (
        hasMeaningfulValue(enriched.buildingCadastralNumber) &&
        isValidCadastralNumber(enriched.buildingCadastralNumber) &&
        (
            !hasMeaningfulValue(enriched.nearestMetro) ||
            !isPlausibleMetroDistanceMeters(enriched.metroDistance) ||
            !hasMeaningfulValue(enriched.isHistoricalCenter) ||
            !hasMeaningfulValue(enriched.environmentCategory1) ||
            !hasMeaningfulValue(enriched.environmentCategory2) ||
            !hasMeaningfulValue(enriched.environmentCategory3)
        )
    ) {
        try {
            const environmentResult = await analyzeEnvironmentByCadastralNumber(
                enriched.buildingCadastralNumber,
                {
                    valuationDate: enriched.valuationDate || null,
                    radiusMeters: 600,
                    forceRecalculation: !isPlausibleMetroDistanceMeters(enriched.metroDistance),
                }
            );
            const environment = environmentResult?.analysis;
            const environmentSource = environmentResult?.fromCache
                ? 'environment_analysis_cache'
                : 'environment_analysis';

            pickMissing(
                enriched,
                'nearestMetro',
                environment?.nearest_metro ?? null,
                environmentSource,
                autoFilledFields,
                sourceHints
            );
            pickMissing(
                enriched,
                'metroDistance',
                environment?.nearest_metro_distance ?? null,
                environmentSource,
                autoFilledFields,
                sourceHints
            );
            pickMissing(
                enriched,
                'isHistoricalCenter',
                environment?.historical_center_status === 'inside'
                    ? true
                    : environment?.historical_center_status === 'outside'
                        ? false
                        : null,
                environmentSource,
                autoFilledFields,
                sourceHints
            );
            pickMissing(
                enriched,
                'environmentCategory1',
                environment?.environment_category_1 ?? null,
                environmentSource,
                autoFilledFields,
                sourceHints
            );
            pickMissing(
                enriched,
                'environmentCategory2',
                environment?.environment_category_2 ?? null,
                environmentSource,
                autoFilledFields,
                sourceHints
            );
            pickMissing(
                enriched,
                'environmentCategory3',
                environment?.environment_category_3 ?? null,
                environmentSource,
                autoFilledFields,
                sourceHints
            );
        } catch (error) {
            warnings.push(`Не удалось определить ближайшее окружение объекта: ${error.message}`);
        }
    }

    if (
        !hasMeaningfulValue(enriched.isHistoricalCenter) &&
        hasMeaningfulValue(enriched.mapPointLat) &&
        hasMeaningfulValue(enriched.mapPointLng)
    ) {
        try {
            const historicalCenter = await resolveHistoricalCenterForCoords(
                enriched.mapPointLat,
                enriched.mapPointLng
            );

            pickMissing(
                enriched,
                'isHistoricalCenter',
                historicalCenter,
                'historical_center_zone',
                autoFilledFields,
                sourceHints
            );
        } catch (error) {
            warnings.push(`Не удалось определить принадлежность к историческому центру: ${error.message}`);
        }
    }

    if (
        hasMeaningfulValue(enriched.mapPointLat) &&
        hasMeaningfulValue(enriched.mapPointLng)
    ) {
        try {
            const administrativeZone = await resolveSpatialZoneForCoords(
                enriched.mapPointLat,
                enriched.mapPointLng,
                { zoneType: 'administrative_zone' }
            );

            if (administrativeZone?.matched) {
                pickMissing(
                    enriched,
                    'zoneCode',
                    administrativeZone.zoneCode,
                    'spatial_zone_administrative',
                    autoFilledFields,
                    sourceHints
                );
            }
        } catch (error) {
            warnings.push(`Не удалось определить административную зону: ${error.message}`);
        }

        try {
            const valuationDistrict = await resolveSpatialZoneForCoords(
                enriched.mapPointLat,
                enriched.mapPointLng,
                { zoneType: 'valuation_district' }
            );

            if (valuationDistrict?.matched) {
                pickMissing(
                    enriched,
                    'terZone',
                    valuationDistrict.zoneCode || valuationDistrict.zoneName,
                    'spatial_zone_valuation_district',
                    autoFilledFields,
                    sourceHints
                );
            }
        } catch (error) {
            warnings.push(`Не удалось определить оценочную зону: ${error.message}`);
        }
    }

    if (!hasMeaningfulValue(enriched.averageRentalRate)) {
        try {
            const exactMarketDistrict = mode(exactObjectOffers.map((offer) => offer.district));
            const districtClassOffers = await findOffersByDistrictAndClass({
                districts: [exactMarketDistrict, enriched.district],
                businessClass: enriched.businessCenterClass || enriched.marketClassResolved,
            });

            const districtRatePayload = buildRatePayload(districtClassOffers, {
                valuationDate: enriched.valuationDate,
                referenceArea,
                source: 'market_offers_district_class',
            });

            pickMissing(
                enriched,
                'averageRentalRate',
                districtRatePayload?.rate ?? null,
                districtRatePayload?.source ?? 'market_offers_district_class',
                autoFilledFields,
                sourceHints
            );
        } catch (error) {
            warnings.push(`Не удалось определить рыночную ставку по предложениям: ${error.message}`);
        }
    }

    if (!hasMeaningfulValue(enriched.marketClassResolved) && hasMeaningfulValue(enriched.averageRentalRate)) {
        pickMissing(
            enriched,
            'marketClassResolved',
            inferBusinessCenterClassByRate(enriched.averageRentalRate),
            'derived_from_rental_rate',
            autoFilledFields,
            sourceHints
        );
    }

    if (!hasMeaningfulValue(enriched.businessCenterClass) && hasMeaningfulValue(enriched.marketClassResolved)) {
        pickMissing(
            enriched,
            'businessCenterClass',
            normalizeClassLabel(enriched.marketClassResolved),
            sourceHints.marketClassResolved || 'derived_from_market_class',
            autoFilledFields,
            sourceHints
        );
    }

    if (
        !hasMeaningfulValue(enriched.occupancyRate) &&
        hasMeaningfulValue(enriched.occupiedArea) &&
        hasMeaningfulValue(enriched.leasableArea) &&
        Number(enriched.leasableArea) > 0
    ) {
        pickMissing(
            enriched,
            'occupancyRate',
            (Number(enriched.occupiedArea) / Number(enriched.leasableArea)) * 100,
            'derived_from_occupied_and_leasable_area',
            autoFilledFields,
            sourceHints
        );
    }

    enriched.fieldSourceHints = {
        ...normalizeFieldSourceHints(questionnaire.fieldSourceHints),
        ...sourceHints,
    };

    return {
        questionnaire: enriched,
        autoFilledFields,
        sourceHints,
        warnings,
        missingBuildingFields: buildBuildingMissingFields(enriched),
        missingLandFields: buildLandMissingFields(enriched),
    };
}
