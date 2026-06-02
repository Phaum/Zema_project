import {
    ValuationProject,
    ProjectQuestionnaire,
    ProjectResult,
    CadastralData,
    User,
} from '../models/index.js';
import { Op } from 'sequelize';
import Analogue from '../models/Analogue.js';
import { toNumber } from '../utils/dataValidation.js';
import { buildCalculationBreakdown } from '../utils/calculationBreakdown.js';
import {
    shapeMarketSnapshotForViewer,
    shapeProjectResultForViewer,
} from '../utils/projectResultVisibility.js';
import { PAYMENT_STATUS, hasActiveSubscription } from '../constants/payment.js';
import { msk64ToWgs84 } from '../utils/coordsConverter.js';
import {
    selectAnalogsByMahalanobis,
    calculateValuation,
    getCalculationArea,
    normalizeMetroDistanceKm,
} from '../services/calculationService.js';
import {
    calculateMetroDistanceToStation,
    calculateNearestMetro,
} from '../services/geoService.js';
import {
    sanitizeAutoFilledLeasableArea,
    sanitizeAutoFilledOccupiedArea,
    sanitizeAutoFilledTotalOksAreaOnLand,
} from '../services/questionnaireEnrichmentService.js';
import {
    analyzeEnvironmentByCadastralNumber,
    getSavedEnvironmentAnalysis,
} from '../services/environmentAnalysisService.js';
import { resolveSpatialZoneForCoords } from '../utils/spatialZoneResolver.js';

const MIN_FINAL_RENT_ANALOGS = 5;
const MAX_RENT_ANALOG_CANDIDATES = 10;

function median(values = []) {
    const arr = values
        .map((value) => Number(value))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

    if (!arr.length) return null;
    const mid = Math.floor(arr.length / 2);

    return arr.length % 2 === 0
        ? (arr[mid - 1] + arr[mid]) / 2
        : arr[mid];
}

function average(values = []) {
    const arr = values.map(Number).filter(Number.isFinite);
    if (!arr.length) return null;
    return arr.reduce((sum, value) => sum + value, 0) / arr.length;
}

function hasMeaningfulValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return true;
    return String(value).trim() !== '';
}

function toComparablePlain(row) {
    if (!row) return {};
    if (typeof row.toJSON === 'function') return row.toJSON();
    if (row.dataValues && typeof row.dataValues === 'object') return { ...row.dataValues };
    return { ...row };
}

function isPremisesObjectType(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/ё/g, 'е');

    return normalized.includes('помещ')
        || ['premises', 'office', 'retail', 'офис', 'торговля'].includes(normalized);
}

function firstFinite(...values) {
    for (const value of values) {
        const num = toNumber(value, null);
        if (Number.isFinite(num)) return num;
    }
    return null;
}

function toTimestamp(value) {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    const time = parsed.getTime();
    return Number.isFinite(time) ? time : null;
}

function hasValidWgs84Coordinates(lat, lon) {
    return Number.isFinite(lat)
        && Number.isFinite(lon)
        && lat >= -90
        && lat <= 90
        && lon >= -180
        && lon <= 180
        && !(lat === 0 && lon === 0);
}

function normalizeFieldSourceHints(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return Object.entries(value).reduce((accumulator, [fieldName, source]) => {
        const normalizedFieldName = String(fieldName || '').trim();
        const normalizedSource = String(source || '').trim();

        if (!normalizedFieldName || !normalizedSource) {
            return accumulator;
        }

        accumulator[normalizedFieldName] = normalizedSource;
        return accumulator;
    }, {});
}

function hasExplicitManualOverrideRequest(requestBody = {}) {
    return ['manualRate', 'averageRentalRate']
        .some((key) => Object.prototype.hasOwnProperty.call(requestBody || {}, key));
}

function isManualSource(source) {
    return String(source || '').trim().toLowerCase().startsWith('manual');
}

export function resolveManualRentalOverrideRate({ requestBody = {}, questionnaire = {} } = {}) {
    const hasManualRateInRequest = hasExplicitManualOverrideRequest(requestBody);
    const manualRateFromRequest = toNumber(
        requestBody?.manualRate ?? requestBody?.averageRentalRate,
        null
    );

    if (hasManualRateInRequest) {
        return Number.isFinite(manualRateFromRequest) && manualRateFromRequest > 0
            ? manualRateFromRequest
            : null;
    }

    const manualRateFromQuestionnaire = toNumber(questionnaire?.averageRentalRate, null);
    if (!Number.isFinite(manualRateFromQuestionnaire) || manualRateFromQuestionnaire <= 0) {
        return null;
    }

    const fieldSourceHints = normalizeFieldSourceHints(questionnaire?.fieldSourceHints);
    const averageRentalRateSource = String(fieldSourceHints?.averageRentalRate || '').trim();

    if (!averageRentalRateSource) {
        return manualRateFromQuestionnaire;
    }

    return isManualSource(averageRentalRateSource)
        ? manualRateFromQuestionnaire
        : null;
}

export function shouldReuseStoredProjectResult({
    resultRecord = null,
    questionnaireRecord = null,
    requestBody = {},
    forceRecalculate = false,
} = {}) {
    if (forceRecalculate) {
        return false;
    }

    if (!resultRecord) {
        return false;
    }

    if (hasExplicitManualOverrideRequest(requestBody)) {
        return false;
    }

    const resultUpdatedAt = toTimestamp(
        resultRecord?.updated_at
        ?? resultRecord?.updatedAt
        ?? resultRecord?.created_at
        ?? resultRecord?.createdAt
    );
    if (!Number.isFinite(resultUpdatedAt)) {
        return false;
    }

    const questionnaireUpdatedAt = toTimestamp(
        questionnaireRecord?.updated_at
        ?? questionnaireRecord?.updatedAt
        ?? questionnaireRecord?.created_at
        ?? questionnaireRecord?.createdAt
    );

    if (!Number.isFinite(questionnaireUpdatedAt)) {
        return true;
    }

    return resultUpdatedAt >= questionnaireUpdatedAt;
}

export function resolveComparableCoordinates(row) {
    const latitude = firstFinite(row?.latitude, row?.lat);
    const longitude = firstFinite(row?.longitude, row?.lon);

    if (hasValidWgs84Coordinates(latitude, longitude)) {
        return {
            lat: latitude,
            lon: longitude,
            source: Number.isFinite(firstFinite(row?.latitude))
                || Number.isFinite(firstFinite(row?.longitude))
                ? 'latitude_longitude'
                : 'lat_lon',
        };
    }

    const x = firstFinite(row?.x);
    const y = firstFinite(row?.y);

    if (Number.isFinite(x) && Number.isFinite(y)) {
        try {
            const converted = msk64ToWgs84(x, y);
            const convertedLat = firstFinite(converted?.lat);
            const convertedLon = firstFinite(converted?.lon);

            if (Number.isFinite(convertedLat) && Number.isFinite(convertedLon)) {
                return {
                    lat: convertedLat,
                    lon: convertedLon,
                    source: 'msk64_xy',
                };
            }
        } catch (error) {
            console.warn('Не удалось конвертировать координаты аналога', row?.id, error);
        }
    }

    return {
        lat: null,
        lon: null,
        source: null,
    };
}

function normalizeBooleanLike(value) {
    if (value === true || value === false) return value;

    const s = String(value || '').trim().toLowerCase();
    if (['1', 'true', 'да', 'yes'].includes(s)) return true;
    if (['0', 'false', 'нет', 'no'].includes(s)) return false;

    return null;
}

export function normalizeComparableClass(value) {
    if (!value) return null;

    const normalized = String(value)
        .trim()
        .toUpperCase()
        .replace(/А/g, 'A')
        .replace(/В/g, 'B')
        .replace(/С/g, 'C');

    const map = {
        'A+': 'A+',
        A: 'A',
        'B+': 'B+',
        B: 'B',
        C: 'C',
    };

    return map[normalized] || null;
}

function normalizeDistrictKey(value) {
    if (!value) return null;

    return String(value)
        .toLowerCase()
        .replace(/район/gi, '')
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeAddressKey(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeFloorKey(value) {
    const normalized = String(value || '').toLowerCase().trim();

    if (!normalized) return 'unknown';
    if (normalized.includes('цокол')) return 'basement';
    if (normalized.includes('подвал')) return 'underground';
    if (normalized.includes('перв') || normalized === '1') return 'first';
    if (normalized.includes('втор') || normalized === '2') return 'second';
    return normalized;
}

function toComparableRate(row) {
    return firstFinite(
        row?.price_per_sqm_cleaned,
        row?.unit_price,
        row?.price_per_meter_cut_nds,
        row?.price_per_meter
    );
}

async function resolveComparableMetroDistanceKm(row) {
    const directDistance = normalizeMetroDistanceKm(row?.distance_to_station);
    if (Number.isFinite(directDistance)) {
        return directDistance;
    }

    const coords = resolveComparableCoordinates(row);
    if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) {
        return null;
    }

    if (hasMeaningfulValue(row?.station_name)) {
        try {
            const stationDistance = await calculateMetroDistanceToStation({
                stationName: row?.station_name,
                lat: coords.lat,
                lon: coords.lon,
                address: row?.address,
                city: 'Санкт-Петербург',
                preferWalkingRoute: true,
            });
            const namedDistanceKm = normalizeMetroDistanceKm(stationDistance?.distance);
            if (Number.isFinite(namedDistanceKm)) {
                return namedDistanceKm;
            }
        } catch (error) {
            console.warn('Не удалось определить дистанцию до метро по названию станции для аналога', row?.id, error?.message || error);
        }
    }

    try {
        const nearestMetro = await calculateNearestMetro({
            lat: coords.lat,
            lon: coords.lon,
            address: row?.address || 'Санкт-Петербург',
            city: 'Санкт-Петербург',
            preferWalkingRoute: true,
        });

        return normalizeMetroDistanceKm(nearestMetro?.distance);
    } catch (error) {
        console.warn('Не удалось определить ближайшее метро для аналога', row?.id, error?.message || error);
    }

    return null;
}

function buildAnalogueDuplicateKey(rawRow) {
    const row = toComparablePlain(rawRow);
    const addressKey = normalizeAddressKey(row.address_offer || row.address || row.building || row.cadastral || row.id);
    const classKey = normalizeComparableClass(row.class_offer) || String(row.class_offer || '').trim().toUpperCase();
    const floorKey = normalizeFloorKey(row.floor_location || row.floor);
    const comparableRate = toComparableRate(row);
    const rateKey = Number.isFinite(comparableRate) ? comparableRate.toFixed(2) : 'NO_RATE';
    const area = firstFinite(row.total_area, row.area_total, row.area);
    const areaBucket = Number.isFinite(area) ? Math.round(area / 100) * 100 : 'NO_AREA';

    return [addressKey, classKey, floorKey, rateKey, areaBucket].join('__');
}

function buildAnalogueObjectKey(rawRow) {
    const row = toComparablePlain(rawRow);

    const addressKey = normalizeAddressKey(row.address_offer || row.address);
    if (addressKey) {
        return `addr__${addressKey}`;
    }

    const buildingKey = normalizeAddressKey(row.building_name || row.building);
    if (buildingKey) {
        return `building__${buildingKey}`;
    }

    const cadastralKey = String(row.building_cadastral_number || row.cadastral || '').trim();
    if (cadastralKey) {
        return `cad__${cadastralKey}`;
    }

    const lat = firstFinite(row.latitude, row.lat);
    const lon = firstFinite(row.longitude, row.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return `coords__${lat.toFixed(4)}__${lon.toFixed(4)}`;
    }

    return `id__${row.id || row.external_id || 'unknown'}`;
}

function calculateComparableCompleteness(row) {
    const fields = [
        row?.price_per_sqm_cleaned ?? row?.unit_price ?? row?.price_per_meter_cut_nds ?? row?.price_per_meter,
        row?.area_total ?? row?.total_area,
        row?.class_offer,
        row?.address_offer ?? row?.address,
        row?.offer_date ?? row?.date_offer,
        row?.district,
        row?.distance_to_metro ?? row?.distance_to_station,
    ];

    return fields.filter((value) => value !== null && value !== undefined && value !== '').length;
}

function compareDuplicatePriority(left, right, valuationTime) {
    const leftTime = parseDateSafe(left.offer_date || left.date_offer)?.getTime() ?? Date.now();
    const rightTime = parseDateSafe(right.offer_date || right.date_offer)?.getTime() ?? Date.now();
    const leftDateDistance = Math.abs(leftTime - valuationTime);
    const rightDateDistance = Math.abs(rightTime - valuationTime);

    if (leftDateDistance !== rightDateDistance) {
        return leftDateDistance - rightDateDistance;
    }

    const leftCompleteness = calculateComparableCompleteness(left);
    const rightCompleteness = calculateComparableCompleteness(right);
    if (leftCompleteness !== rightCompleteness) {
        return rightCompleteness - leftCompleteness;
    }

    const leftRate = toNumber(left.price_per_sqm_cleaned, toNumber(left.unit_price, null));
    const rightRate = toNumber(right.price_per_sqm_cleaned, toNumber(right.unit_price, null));
    const leftHasCore = Number.isFinite(leftRate) ? 1 : 0;
    const rightHasCore = Number.isFinite(rightRate) ? 1 : 0;

    if (leftHasCore !== rightHasCore) {
        return rightHasCore - leftHasCore;
    }

    return rightTime - leftTime;
}

export function deduplicateAnaloguesByObject(items, valuationDate, maxPerObject = 2) {
    if (!items?.length) {
        return {
            selectedAnalogs: [],
            excludedDuplicates: [],
        };
    }

    const valuationTime = parseDateSafe(valuationDate)?.getTime() ?? Date.now();
    const grouped = new Map();

    for (const rawRow of items) {
        const row = toComparablePlain(rawRow);
        const key = buildAnalogueObjectKey(row);

        if (!grouped.has(key)) {
            grouped.set(key, []);
        }

        grouped.get(key).push(row);
    }

    const selectedAnalogs = [];
    const excludedDuplicates = [];

    for (const [groupKey, group] of grouped.entries()) {
        const sorted = group
            .slice()
            .sort((left, right) => compareDuplicatePriority(left, right, valuationTime));
        const selectedForGroup = [];
        const selectedDuplicateKeys = new Set();

        for (const candidate of sorted) {
            const duplicateKey = buildAnalogueDuplicateKey(candidate);
            if (selectedDuplicateKeys.has(duplicateKey)) {
                continue;
            }

            selectedForGroup.push(candidate);
            selectedDuplicateKeys.add(duplicateKey);

            if (selectedForGroup.length >= maxPerObject) {
                break;
            }
        }

        const best = selectedForGroup[0] || sorted[0];
        selectedAnalogs.push(...selectedForGroup);

        const selectedIds = new Set(
            selectedForGroup
                .map((row) => row.id || row.external_id || null)
                .filter(Boolean)
        );

        for (const duplicate of sorted) {
            const duplicateId = duplicate.id || duplicate.external_id || null;
            if (duplicateId && selectedIds.has(duplicateId)) {
                continue;
            }
            excludedDuplicates.push({
                ...duplicate,
                duplicateGroupKey: groupKey,
                duplicateOf: best.id || best.external_id || null,
                exclusionReason: `Исключен как дубль объекта: лимит ${maxPerObject} предложений на один объект`,
            });
        }
    }

    return {
        selectedAnalogs,
        excludedDuplicates,
    };
}

function parseDateSafe(value) {
    if (!value) return null;

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolveAnalogueQuarterKey(rawRow) {
    const row = toComparablePlain(rawRow);
    const rawQuarter = String(row.quarter || '').trim();

    if (rawQuarter) {
        const normalized = rawQuarter
            .toUpperCase()
            .replace(/\s+/g, ' ');

        const yearMatch = normalized.match(/(20\d{2}|19\d{2})/);
        const quarterMatch = normalized.match(/(?:Q|КВ|КВАРТАЛ)\s*([1-4])|([1-4])\s*(?:Q|КВ|КВАРТАЛ)/);
        const quarterNumber = quarterMatch?.[1] || quarterMatch?.[2] || normalized.match(/\b([1-4])\b/)?.[1];

        if (yearMatch && quarterNumber) {
            return `${yearMatch[1]}-Q${quarterNumber}`;
        }

        return normalized;
    }

    const offerDate = parseDateSafe(row.date_offer);
    if (!offerDate) return 'NO_QUARTER';

    const quarter = Math.floor(offerDate.getMonth() / 3) + 1;
    return `${offerDate.getFullYear()}-Q${quarter}`;
}

function getFirstFloorComparableArea(questionnaire) {
    const floors = Array.isArray(questionnaire?.floors) ? questionnaire.floors : [];
    const firstFloor = floors.find((floor) => {
        const category = String(floor?.floorCategory || '').toLowerCase();
        const location = String(floor?.floorLocation || floor?.label || '').toLowerCase();

        return category === 'first' || location.includes('перв') || location.includes('1 этаж');
    });

    return firstFinite(
        firstFloor?.avgLeasableRoomArea,
        firstFloor?.leasableArea,
        firstFloor?.area,
        getCalculationArea(questionnaire)
    );
}

export function buildAreaRangeByCalculationArea(questionnaire) {
    const area = getFirstFloorComparableArea(questionnaire);
    if (!area) return null;

    if (area <= 200) {
        return {
            [Op.between]: [Math.max(area * 0.5, 0), area * 1.5],
        };
    }

    return {
        [Op.between]: [Math.max(area - 200, 0), area + 200],
    };
}

export function deduplicateAnaloguesByClosestDatePerQuarter(items, valuationDate) {
    if (!items?.length) return [];

    const valuationTime = parseDateSafe(valuationDate)?.getTime() ?? Date.now();
    const grouped = new Map();

    for (const rawRow of items) {
        const row = toComparablePlain(rawRow);
        const objectKey =
            row.cadastral ||
            row.building ||
            row.address ||
            row.id;
        const quarterKey = resolveAnalogueQuarterKey(row);
        const key = `${objectKey}__${quarterKey}`;

        if (!grouped.has(key)) {
            grouped.set(key, []);
        }

        grouped.get(key).push(row);
    }

    return Array.from(grouped.values()).map((group) => {
        return group.reduce((best, current) => {
            const bestTime = parseDateSafe(best.date_offer)?.getTime() ?? Date.now();
            const currentTime = parseDateSafe(current.date_offer)?.getTime() ?? Date.now();
            const bestDistance = Math.abs(bestTime - valuationTime);
            const currentDistance = Math.abs(currentTime - valuationTime);

            if (currentDistance !== bestDistance) {
                return currentDistance < bestDistance ? current : best;
            }

            return currentTime > bestTime ? current : best;
        });
    });
}

export function deduplicateAnaloguesForSelection(items, valuationDate) {
    if (!items?.length) return [];

    const valuationTime = parseDateSafe(valuationDate)?.getTime() ?? Date.now();
    const grouped = new Map();

    for (const rawRow of items) {
        const row = toComparablePlain(rawRow);
        const key = buildAnalogueDuplicateKey(row);

        if (!grouped.has(key)) {
            grouped.set(key, []);
        }

        grouped.get(key).push(row);
    }

    return Array.from(grouped.values()).map((group) => (
        group.reduce((best, current) => {
            const bestTime = parseDateSafe(best.date_offer)?.getTime() ?? Date.now();
            const currentTime = parseDateSafe(current.date_offer)?.getTime() ?? Date.now();
            const bestDistance = Math.abs(bestTime - valuationTime);
            const currentDistance = Math.abs(currentTime - valuationTime);

            if (currentDistance !== bestDistance) {
                return currentDistance < bestDistance ? current : best;
            }

            return currentTime > bestTime ? current : best;
        })
    ));
}

export function deduplicateRankedAnalogsByObject(items, valuationDate, maxCount = 10, maxPerObject = 2) {
    if (!items?.length) return [];

    const valuationTime = parseDateSafe(valuationDate)?.getTime() ?? Date.now();
    const grouped = new Map();

    for (const rawRow of items) {
        const row = toComparablePlain(rawRow);
        const key = buildAnalogueObjectKey(row);
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }

        grouped.get(key).push(row);
    }

    const selectedByObject = [];
    for (const group of grouped.values()) {
        selectedByObject.push(
            ...group
                .slice()
                .sort((a, b) => {
                    const aDistance = toNumber(a.mahalanobisDistance, Number.MAX_SAFE_INTEGER);
                    const bDistance = toNumber(b.mahalanobisDistance, Number.MAX_SAFE_INTEGER);
                    if (aDistance !== bDistance) return aDistance - bDistance;

                    const aTime = parseDateSafe(a.offer_date || a.date_offer)?.getTime() ?? Date.now();
                    const bTime = parseDateSafe(b.offer_date || b.date_offer)?.getTime() ?? Date.now();
                    const aDateDistance = Math.abs(aTime - valuationTime);
                    const bDateDistance = Math.abs(bTime - valuationTime);
                    if (aDateDistance !== bDateDistance) return aDateDistance - bDateDistance;

                    return bTime - aTime;
                })
                .slice(0, maxPerObject)
        );
    }

    return selectedByObject
        .sort((a, b) => {
            const aDistance = toNumber(a.mahalanobisDistance, Number.MAX_SAFE_INTEGER);
            const bDistance = toNumber(b.mahalanobisDistance, Number.MAX_SAFE_INTEGER);
            if (aDistance !== bDistance) {
                return aDistance - bDistance;
            }

            const aTime = parseDateSafe(a.offer_date || a.date_offer)?.getTime() ?? Date.now();
            const bTime = parseDateSafe(b.offer_date || b.date_offer)?.getTime() ?? Date.now();

            return Math.abs(aTime - valuationTime) - Math.abs(bTime - valuationTime);
        })
        .slice(0, maxCount);
}

function getComparableStableId(row) {
    const plain = toComparablePlain(row);
    return String(plain.id || plain.external_id || plain.address_offer || plain.address || '');
}

function refillSelectedAnalogsForMinimumCalculation({
    selectedAnalogs = [],
    rankingPool = [],
    valuation = {},
    minFinalAnalogs = MIN_FINAL_RENT_ANALOGS,
    maxCandidates = MAX_RENT_ANALOG_CANDIDATES,
} = {}) {
    const includedIds = new Set(
        (Array.isArray(valuation?.adjustedRates) ? valuation.adjustedRates : [])
            .filter((row) => row?.includedInRentCalculation !== false)
            .map((row) => String(row.analogId || row.externalId || ''))
            .filter(Boolean)
    );
    const selectedIds = new Set(
        (Array.isArray(selectedAnalogs) ? selectedAnalogs : [])
            .map(getComparableStableId)
            .filter(Boolean)
    );
    const includedAnalogs = (Array.isArray(selectedAnalogs) ? selectedAnalogs : [])
        .filter((row) => includedIds.has(getComparableStableId(row)));

    if (includedAnalogs.length >= minFinalAnalogs || !Array.isArray(rankingPool) || !rankingPool.length) {
        return selectedAnalogs;
    }

    const usedIds = new Set(includedAnalogs.map(getComparableStableId).filter(Boolean));
    const refilled = [...includedAnalogs];

    for (const candidate of rankingPool) {
        const candidateId = getComparableStableId(candidate);
        if (!candidateId || usedIds.has(candidateId) || selectedIds.has(candidateId)) {
            continue;
        }

        refilled.push(candidate);
        usedIds.add(candidateId);

        if (refilled.length >= maxCandidates) {
            break;
        }
    }

    return refilled.length >= minFinalAnalogs && refilled.length > includedAnalogs.length
        ? refilled
        : selectedAnalogs;
}

function numberOrZero(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function buildEnvironmentAnalysisSummaryPayload(analysis, questionnaire = {}) {
    const details = analysis?.environment_details_json || {};
    const counts = details.counts || {};
    const score = details.score || {};
    const categories = details.categories || {};
    const lat = numberOrZero(analysis?.latitude || questionnaire?.mapPointLat);
    const lng = numberOrZero(analysis?.longitude || questionnaire?.mapPointLng);

    if (!lat || !lng) {
        return null;
    }

    const categoryValues = Array.from(new Set([
        analysis?.environment_category_1 || categories.primary,
        analysis?.environment_category_2 || categories.secondary,
        analysis?.environment_category_3 || categories.tertiary,
        questionnaire?.environmentCategory1,
        questionnaire?.environmentCategory2,
        questionnaire?.environmentCategory3,
    ].filter(Boolean)));
    const categoryText = categoryValues.join(' ').toLowerCase();
    const businessCount = numberOrZero(counts.businessActivityCenter || counts.analogueBusinessCount || counts.businessCount);
    const industrialCount = numberOrZero(counts.industrialZone || counts.analogueIndustrialCount)
        || (numberOrZero(counts.industrialSites) + numberOrZero(counts.warehouseSites));
    const explicitMidriseCount = numberOrZero(counts.residentialMidrise || counts.midriseResidential);
    const explicitHighriseCount = numberOrZero(counts.residentialHighrise || counts.multiApartmentResidential);
    const residentialCount = numberOrZero(counts.residentialBuildings)
        || explicitMidriseCount + explicitHighriseCount;
    const hasMidriseSignal = /средне|до\s*8|midrise/.test(categoryText);
    const hasHighriseSignal = /много|multi|apartment/.test(categoryText);
    const midriseCount = explicitMidriseCount
        || (hasMidriseSignal && hasHighriseSignal ? Math.round(residentialCount / 2) : 0)
        || (hasMidriseSignal ? residentialCount : 0);
    const highriseCount = explicitHighriseCount
        || (hasMidriseSignal && hasHighriseSignal ? Math.max(0, residentialCount - midriseCount) : 0)
        || (hasHighriseSignal ? residentialCount : 0);

    return {
        latitude: lat,
        longitude: lng,
        radiusMeters: numberOrZero(analysis?.radius_used) || 600,
        totalScore: analysis?.total_environment_score ?? score.totalScore ?? null,
        qualityFlag: analysis?.quality_flag || null,
        locationType: analysis?.location_type || null,
        historicalCenterStatus: analysis?.historical_center_status || null,
        nearestMetro: analysis?.nearest_metro || null,
        nearestMetroDistance: analysis?.nearest_metro_distance ?? null,
        categories: categoryValues,
        rankedCategories: categories.ranked || [],
        counts: {
            business: businessCount,
            industrialWarehouse: industrialCount,
            highriseResidential: highriseCount,
            midriseResidential: midriseCount,
            residentialTotal: residentialCount,
            service: numberOrZero(counts.serviceCount),
            transport: numberOrZero(counts.transportPoints),
        },
        metrics: details.metrics || null,
        subscores: score.subscores || null,
        rawFactors: score.rawFactors || details.rawFactors || null,
        warnings: Array.isArray(details.warnings) ? details.warnings : [],
    };
}

async function resolveObjectEnvironmentAnalysis(questionnaire = {}) {
    const cadastralNumber = questionnaire?.buildingCadastralNumber || questionnaire?.building_cadastral_number;
    if (!cadastralNumber) {
        return null;
    }

    try {
        const cached = await getSavedEnvironmentAnalysis(cadastralNumber, { radiusMeters: 600 });

        if (cached) {
            return cached;
        }

        const { analysis } = await analyzeEnvironmentByCadastralNumber(cadastralNumber, {
            valuationDate: questionnaire?.valuationDate || null,
            radiusMeters: 600,
            latestQuestionnaire: questionnaire,
        });

        return analysis;
    } catch (error) {
        console.warn('[environmentAnalysis] Не удалось получить анализ окружения объекта', error?.message || error);
        return null;
    }
}

function mergeObjectEnvironmentIntoQuestionnaire(questionnaire = {}, analysis = null) {
    if (!analysis) {
        return questionnaire;
    }

    const historicalCenter = analysis.historical_center_status === 'inside'
        ? true
        : analysis.historical_center_status === 'outside'
            ? false
            : null;
    const historicalCenterSource = String(questionnaire?.fieldSourceHints?.isHistoricalCenter || '').trim();
    const shouldKeepHistoricalCenter = hasMeaningfulValue(questionnaire?.isHistoricalCenter) &&
        historicalCenterSource.toLowerCase().startsWith('manual');

    return {
        ...questionnaire,
        nearestMetro: hasMeaningfulValue(questionnaire?.nearestMetro)
            ? questionnaire.nearestMetro
            : analysis.nearest_metro ?? questionnaire?.nearestMetro ?? null,
        metroDistance: hasMeaningfulValue(questionnaire?.metroDistance)
            ? questionnaire.metroDistance
            : analysis.nearest_metro_distance ?? questionnaire?.metroDistance ?? null,
        isHistoricalCenter: shouldKeepHistoricalCenter || historicalCenter === null
            ? questionnaire.isHistoricalCenter
            : historicalCenter,
        environmentCategory1: hasMeaningfulValue(questionnaire?.environmentCategory1)
            ? questionnaire.environmentCategory1
            : analysis.environment_category_1 ?? questionnaire?.environmentCategory1 ?? null,
        environmentCategory2: hasMeaningfulValue(questionnaire?.environmentCategory2)
            ? questionnaire.environmentCategory2
            : analysis.environment_category_2 ?? questionnaire?.environmentCategory2 ?? null,
        environmentCategory3: hasMeaningfulValue(questionnaire?.environmentCategory3)
            ? questionnaire.environmentCategory3
            : analysis.environment_category_3 ?? questionnaire?.environmentCategory3 ?? null,
    };
}

function buildResolvedObjectEnvironmentSummary(questionnaire = {}, analysis = null) {
    return buildEnvironmentAnalysisSummaryPayload(analysis, questionnaire);
}

async function mapAnalogueToComparable(rawRow) {
    const row = toComparablePlain(rawRow);
    const coords = resolveComparableCoordinates(row);
    const metroDistanceKm = await resolveComparableMetroDistanceKm(row);

    const comparableRate = firstFinite(
        row.unit_price,
        row.price_per_meter_cut_nds,
        row.price_per_meter
    );
    const offerRate = firstFinite(
        row.price_per_meter,
        row.price_per_meter_cut_nds,
        row.unit_price
    );

    return {
        id: row.id,
        source_type: 'analogue',
        external_id: row.id,
        address_offer: row.address || null,
        district: row.district || null,
        class_offer: row.class_offer || null,
        area_total: row.total_area !== null ? Number(row.total_area) : null,
        price_per_sqm_month: offerRate,
        price_per_sqm_cleaned: comparableRate,
        comparison_price_per_sqm: comparableRate,
        latitude: coords.lat,
        longitude: coords.lon,
        coordinate_source: coords.source,
        metro: row.station_name || null,
        offer_date: row.date_offer || null,
        quarter: resolveAnalogueQuarterKey(row),
        link: row.link || row.offer_url || null,
        environment_category_1: row.env_category_1 || null,
        environment_category_2: row.env_category_2 || null,
        environment_category_3: null,
        environment_historical_center: normalizeBooleanLike(row.is_historical_center),
        mahalanobisDistance: null,
        year_built_commissioning: row.built_year || row.expl_year || null,
        floor_location: row.floor || null,
        distance_to_metro: metroDistanceKm,
        building_cadastral_number: row.cadastral || null,
        building_name: row.building || null,
        zone_code: row.zone_code || null,
        ter_zone: row.ter_zone || null,
        raw_source: row,
    };
}

export function buildAnalogueClassCandidates(rawClass) {
    const normalized = normalizeComparableClass(rawClass);
    if (!normalized) return [];

    const equivalents = {
        'A+': ['A+', 'А+'],
        A: ['A', 'А'],
        'B+': ['B+', 'В+'],
        B: ['B', 'В'],
        C: ['C', 'С'],
    };

    return equivalents[normalized] || [normalized];
}

function buildAnalogueClassWhere(rawClass, { allowEmptyFallback = false } = {}) {
    const candidates = buildAnalogueClassCandidates(rawClass);
    if (!candidates.length) return null;

    if (!allowEmptyFallback) {
        return {
            [Op.in]: candidates,
        };
    }

    return {
        [Op.or]: [
            { [Op.in]: candidates },
            { [Op.is]: null },
            '',
        ],
    };
}

async function findComparableAnalogues(questionnaire) {
    const selectionQuestionnaireBase = await ensureSelectionSpatialContext(questionnaire);
    const objectClassRaw =
        selectionQuestionnaireBase.businessCenterClass ||
        selectionQuestionnaireBase.objectClass ||
        null;

    const cadastralRecord = selectionQuestionnaireBase.buildingCadastralNumber
        ? await CadastralData.findOne({
            where: { cadastral_number: selectionQuestionnaireBase.buildingCadastralNumber },
        })
        : null;

    const districtRaw = selectionQuestionnaireBase.district || cadastralRecord?.district || null;
    const selectionQuestionnaire = {
        ...selectionQuestionnaireBase,
        district: districtRaw,
        constructionYear:
            selectionQuestionnaireBase?.constructionYear ||
            selectionQuestionnaireBase?.construction_year ||
            cadastralRecord?.year_built ||
            cadastralRecord?.year_commisioning ||
            null,
    };

    const baseWhere = {
        [Op.or]: [
            { price_per_meter_cut_nds: { [Op.ne]: null } },
            { unit_price: { [Op.ne]: null } },
            { price_per_meter: { [Op.ne]: null } },
        ],
    };

    const strictWhere = { ...baseWhere };

    const strictClassWhere = buildAnalogueClassWhere(objectClassRaw, { allowEmptyFallback: false });

    if (strictClassWhere) {
        strictWhere.class_offer = strictClassWhere;
    }

    const areaRangeWhere = buildAreaRangeByCalculationArea(selectionQuestionnaire);
    if (areaRangeWhere) {
        strictWhere.total_area = areaRangeWhere;
    }

    console.log('[findComparableAnalogues] objectClassRaw =', objectClassRaw);
    console.log('[findComparableAnalogues] strictClassCandidates =', buildAnalogueClassCandidates(objectClassRaw));
    console.log('[findComparableAnalogues] districtRaw =', districtRaw);
    console.log('[findComparableAnalogues] areaRange =', areaRangeWhere || null);
    console.log('[findComparableAnalogues] selectionMode = strict_class_then_mahalanobis');

    let allRows = await Analogue.findAll({
        where: strictWhere,
        order: [['date_offer', 'DESC'], ['id', 'ASC']],
    });

    console.log('[findComparableAnalogues] strict found before dedupe =', allRows.length);
    console.log('[findComparableAnalogues] filterMode = strict_exact_class');

    const normalized = await Promise.all(allRows.map(mapAnalogueToComparable));
    const objectDedupe = deduplicateAnaloguesByObject(
        normalized,
        selectionQuestionnaire.valuationDate
    );
    const uniqueAnalogs = objectDedupe.selectedAnalogs;
    const { selected, ranked } = selectAnalogsByMahalanobis(selectionQuestionnaire, uniqueAnalogs);

    console.log('[findComparableAnalogues] normalized count =', normalized.length);
    console.log('[findComparableAnalogues] unique after object dedupe =', uniqueAnalogs.length);
    console.log('[findComparableAnalogues] excluded object duplicates =', objectDedupe.excludedDuplicates.length);
    console.log('[findComparableAnalogues] selected after mahalanobis =', selected.length);

    return {
        district: districtRaw,
        allAnalogs: uniqueAnalogs,
        rankingPool: ranked,
        selectedAnalogs: selected,
        excludedDuplicates: objectDedupe.excludedDuplicates,
    };
}

export async function ensureSelectionSpatialContext(
    questionnaire = {},
    { zoneResolver = resolveSpatialZoneForCoords } = {}
) {
    const lat = toNumber(questionnaire?.mapPointLat, null);
    const lng = toNumber(questionnaire?.mapPointLng, null);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return questionnaire;
    }

    let nextQuestionnaire = questionnaire;

    if (!hasMeaningfulValue(questionnaire?.zoneCode)) {
        const administrativeZone = await zoneResolver(lat, lng, {
            zoneType: 'administrative_zone',
        });

        if (administrativeZone?.matched && hasMeaningfulValue(administrativeZone.zoneCode)) {
            nextQuestionnaire = {
                ...nextQuestionnaire,
                zoneCode: administrativeZone.zoneCode,
            };
        }
    }

    if (!hasMeaningfulValue(nextQuestionnaire?.terZone)) {
        const valuationDistrict = await zoneResolver(lat, lng, {
            zoneType: 'valuation_district',
        });

        const resolvedTerZone = valuationDistrict?.zoneCode || valuationDistrict?.zoneName || null;
        if (valuationDistrict?.matched && hasMeaningfulValue(resolvedTerZone)) {
            nextQuestionnaire = {
                ...nextQuestionnaire,
                terZone: resolvedTerZone,
            };
        }
    }

    return nextQuestionnaire;
}

function buildComparableAdjustmentMap(adjustedRates = []) {
    const map = new Map();

    for (const row of adjustedRates) {
        const key = String(row.analogId);
        map.set(key, row);
    }

    return map;
}

export function buildMarketSnapshot(questionnaire, selectedAnalogs, allAnalogs, marketMeta = {}) {
    const adjustedRateRows = Array.isArray(marketMeta.adjustedRates) ? marketMeta.adjustedRates : [];
    const adjustmentMap = buildComparableAdjustmentMap(adjustedRateRows);

    const includedAdjustedRows = adjustedRateRows.filter((item) => item?.includedInRentCalculation !== false);
    const excludedAdjustedRows = adjustedRateRows.filter((item) => item?.includedInRentCalculation === false);
    const selectedRates = includedAdjustedRows.length
        ? includedAdjustedRows
            .map((item) => toNumber(item.adjustedRate, null))
            .filter((value) => Number.isFinite(value))
        : (selectedAnalogs || [])
            .map((item) => toNumber(toComparablePlain(item).price_per_sqm_cleaned, null))
            .filter((value) => Number.isFinite(value));
    const correctedRates = includedAdjustedRows
        .map((item) => toNumber(item.correctedRate ?? item.adjustedRate, null))
        .filter((value) => Number.isFinite(value) && value > 0);
    const comparableCount = includedAdjustedRows.length
        || toNumber(marketMeta.selectedComparableCount, null)
        || toNumber(marketMeta.includedComparableCount, null)
        || (selectedAnalogs?.length ?? 0);
    const selectedComparableCount = adjustedRateRows.length
        || toNumber(marketMeta.includedComparableCount, null)
        || toNumber(marketMeta.selectedComparableCount, null)
        || (selectedAnalogs?.length ?? 0);
    const excludedComparableCount = excludedAdjustedRows.length
        || toNumber(marketMeta.excludedComparableCount, null)
        || 0;

    const allRates = (allAnalogs || [])
        .map((item) => toNumber(toComparablePlain(item).price_per_sqm_cleaned, null))
        .filter((value) => Number.isFinite(value));

    const topComparables = (selectedAnalogs || []).slice(0, 10).map((rawRow) => {
        const row = toComparablePlain(rawRow);
        const adjustment = adjustmentMap.get(String(row.id));
        const coords = resolveComparableCoordinates(row);

        return {
            id: row.id,
            source_type: row.source_type || 'analogue',
            external_id: row.external_id || null,
            address_offer: row.address_offer || null,
            district: row.district || null,
            class_offer: row.class_offer || null,
            area_total: toNumber(row.area_total, null),
            price_per_sqm_month: toNumber(row.price_per_sqm_month, null),
            offer_rate: toNumber(row.offer_rate ?? row.price_per_sqm_month, null),
            price_without_vat_per_sqm_month: toNumber(row.price_without_vat_per_sqm_month, null),
            price_per_sqm_cleaned: toNumber(row.price_per_sqm_cleaned, null),
            raw_rate: toNumber(adjustment?.rawRate, null),
            adjusted_rate: toNumber(adjustment?.adjustedRate, null),
            base_rate: toNumber(adjustment?.baseRate, null),
            after_date: toNumber(adjustment?.afterDate, null),
            after_bargain: toNumber(adjustment?.afterBargain, null),
            corrected_rate: toNumber(adjustment?.correctedRate, null),
            first_group_factor: toNumber(adjustment?.firstGroupFactor, null),
            second_group_multi_factor: toNumber(adjustment?.secondGroupMultiFactor, null),
            total_adjustment_factor: toNumber(adjustment?.totalAdjustmentFactor, null),
            area_ratio: toNumber(adjustment?.areaRatio ?? adjustment?.scaleAreaRatio, null),
            scale_similarity_score: toNumber(adjustment?.scaleSimilarityScore, null),
            scale_weight_penalty: toNumber(adjustment?.scaleWeightPenalty, null),
            pre_weight: toNumber(adjustment?.preWeight ?? adjustment?.baseWeight, null),
            final_weight: toNumber(adjustment?.finalWeight ?? adjustment?.normalizedWeight, null),
            latitude: coords.lat,
            longitude: coords.lon,
            coordinate_source: coords.source || row.coordinate_source || null,
            selection_weight: toNumber(adjustment?.weight, null),
            normalized_weight: toNumber(adjustment?.normalizedWeight, null),
            relevance_score: toNumber(adjustment?.relevanceScore, null),
            completeness_score: toNumber(adjustment?.completenessScore, null),
            included_in_rent_calculation: adjustment?.includedInRentCalculation !== false,
            decision_reason: adjustment?.decisionReason || null,
            exclusion_reason: adjustment?.exclusionReason || null,
            adjustment_summary: adjustment?.adjustmentSummary || null,
            metro: row.metro || null,
            offer_date: row.offer_date || null,
            quarter: row.quarter || null,
            link: row.link || row.raw_source?.link || row.raw_source?.offer_url || null,
            environment_category_1: row.environment_category_1 || null,
            environment_category_2: row.environment_category_2 || null,
            environment_category_3: row.environment_category_3 || null,
            environment_historical_center: row.environment_historical_center ?? null,
            is_historical_center: row.environment_historical_center ?? null,
            mahalanobisDistance: row.mahalanobisDistance ?? null,
            year_built_commissioning: row.year_built_commissioning || null,
            floor_location: row.floor_location || null,
            distance_to_metro: row.distance_to_metro || null,
            building_cadastral_number: row.building_cadastral_number || null,
            building_name: row.building_name || null,
            ter_zone: row.ter_zone || null,
            zone_code: row.zone_code || null,
            zone_name: row.zone_name || null,
            adjustments: adjustment?.adjustments || null,
        };
    });

    return {
        comparableCount,
        includedComparableCount: comparableCount,
        selectedComparableCount,
        excludedComparableCount,
        totalAvailable: allAnalogs?.length || 0,

        objectComparableCount: comparableCount,
        objectTotalAvailable: allAnalogs?.length || 0,

        district: marketMeta.district || questionnaire.district || null,
        objectEnvironmentAnalysis: marketMeta.objectEnvironmentAnalysis || null,

        averageRentalRate: marketMeta.marketRentAverage ?? average(selectedRates),
        medianRentalRate: marketMeta.marketRentMedian ?? median(selectedRates),
        minRentalRate: selectedRates.length ? Math.min(...selectedRates) : null,
        maxRentalRate: selectedRates.length ? Math.max(...selectedRates) : null,

        allMinRate: allRates.length ? Math.min(...allRates) : null,
        allMaxRate: allRates.length ? Math.max(...allRates) : null,
        allMedianRate: median(allRates),

        marketRentMonth: marketMeta.marketRentMonth ?? null,
        marketRentSelectionMethod: marketMeta.marketRentSelectionMethod || 'stable_trimmed_mean',
        rentCalculationMode: marketMeta.rentCalculationMode || 'stable_default',
        rentalRateSource: marketMeta.rentalRateSource || 'market_analogs',
        manualOverrideApplied: Boolean(marketMeta.manualOverrideApplied),
        analogsQualityScore: marketMeta.analogsQualityScore ?? null,
        excludedDuplicates: Array.isArray(marketMeta.excludedDuplicates) ? marketMeta.excludedDuplicates : [],
        reliabilityScore: marketMeta.reliabilityScore ?? null,
        analogsInitialCount: marketMeta.analogsInitialCount ?? selectedComparableCount,
        analogsUsedCount: marketMeta.analogsUsedCount ?? comparableCount,
        analogsExcludedCount: marketMeta.analogsExcludedCount ?? excludedComparableCount,
        correctedRateMin: marketMeta.correctedRateMin ?? (correctedRates.length ? Math.min(...correctedRates) : null),
        correctedRateMedian: marketMeta.correctedRateMedian ?? (correctedRates.length ? median(correctedRates) : null),
        correctedRateMax: marketMeta.correctedRateMax ?? (correctedRates.length ? Math.max(...correctedRates) : null),
        correctedRateStdDev: marketMeta.correctedRateStdDev ?? null,
        correctedRateIQR: marketMeta.correctedRateIQR ?? null,
        dispersionLevel: marketMeta.dispersionLevel ?? null,
        sampleSizeLevel: marketMeta.sampleSizeLevel ?? null,
        stabilityFlag: marketMeta.stabilityFlag ?? null,
        adjustedRates: adjustedRateRows,
        topComparables,
        topObjectComparables: topComparables,
    };
}

export const calculateProject = async (req, res) => {
    try {
        const project = await ValuationProject.findOne({
            where: {
                id: req.params.projectId,
                user_id: req.user.id,
            },
        });

        if (!project) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        const user = await User.findByPk(req.user.id, {
            attributes: ['id', 'subscription_status', 'subscription_expires_at'],
        });

        const subscriptionActive = hasActiveSubscription(user);
        const projectPaid = project.payment_status === PAYMENT_STATUS.PAID;

        if (!subscriptionActive && !projectPaid) {
            return res.status(400).json({
                error: 'Перед формированием результата нужно подтвердить оплату или активировать подписку',
            });
        }

        const questionnaireRecord = await ProjectQuestionnaire.findOne({
            where: { project_id: project.id },
        });

        if (!questionnaireRecord) {
            return res.status(400).json({ error: 'Анкета проекта не заполнена' });
        }

        let questionnaire = sanitizeAutoFilledTotalOksAreaOnLand(
            sanitizeAutoFilledOccupiedArea(
                sanitizeAutoFilledLeasableArea(
                    questionnaireRecord.get ? questionnaireRecord.get({ plain: true }) : questionnaireRecord
                ).questionnaire
            ).questionnaire
        ).questionnaire;

        if (isPremisesObjectType(questionnaire.objectType)) {
            return res.status(400).json({
                error: 'Расчёт для вида объекта «помещение» пока недоступен. Выберите вид объекта «здание».',
            });
        }

        if (!questionnaire.mapPointLat || !questionnaire.mapPointLng) {
            return res.status(400).json({ error: 'Координаты объекта не указаны' });
        }

        const objectEnvironmentAnalysisRaw = await resolveObjectEnvironmentAnalysis(questionnaire);
        questionnaire = mergeObjectEnvironmentIntoQuestionnaire(questionnaire, objectEnvironmentAnalysisRaw);

        const {
            district,
            allAnalogs,
            excludedDuplicates,
            rankingPool,
            selectedAnalogs,
        } = await findComparableAnalogues(questionnaire);

        if (!allAnalogs || allAnalogs.length === 0) {
            return res.status(400).json({ error: 'Нет аналогов в базе analogues' });
        }

        const manualRate = resolveManualRentalOverrideRate({
            requestBody: req.body,
            questionnaire,
        });

        let calculationSelectedAnalogs = selectedAnalogs;
        let valuation = await calculateValuation(
            questionnaire,
            calculationSelectedAnalogs,
            manualRate
        );

        if (valuation.selectedAnalogsCount < MIN_FINAL_RENT_ANALOGS) {
            const refilledAnalogs = refillSelectedAnalogsForMinimumCalculation({
                selectedAnalogs: calculationSelectedAnalogs,
                rankingPool,
                valuation,
            });

            if (refilledAnalogs !== calculationSelectedAnalogs) {
                calculationSelectedAnalogs = refilledAnalogs;
                valuation = await calculateValuation(questionnaire, calculationSelectedAnalogs, manualRate);
                console.log(
                    `[projectCalculation] Добор аналогов для ставки: итоговых ${valuation.selectedAnalogsCount}, кандидатов ${calculationSelectedAnalogs.length}`
                );
            }
        }

        if (calculationSelectedAnalogs.length < 10) {
            console.warn(`Найдено только ${calculationSelectedAnalogs.length} аналогов, требуется 10`);
        }

        const objectEnvironmentAnalysis = buildResolvedObjectEnvironmentSummary(
            questionnaire,
            objectEnvironmentAnalysisRaw
        );

        const marketSnapshot = buildMarketSnapshot(
            questionnaire,
            calculationSelectedAnalogs,
            allAnalogs,
            {
                district,
                objectEnvironmentAnalysis,
                adjustedRates: valuation.adjustedRates,
                marketRentAverage: valuation.marketRentAverage,
                marketRentMedian: valuation.marketRentMedian,
                marketRentMonth: valuation.marketRentMonth,
                marketRentSelectionMethod: valuation.rentalRateSelectionMethod,
                rentCalculationMode: valuation.rentCalculationMode,
                includedComparableCount: valuation.analogsCount,
                selectedComparableCount: valuation.selectedAnalogsCount,
                excludedComparableCount: valuation.excludedAnalogsCount,
                analogsQualityScore: valuation.analogsQualityScore,
                rentalRateSource: valuation.rentalRateSource,
                manualOverrideApplied: valuation.manualOverrideApplied,
                excludedDuplicates,
                reliabilityScore: valuation.reliabilityScore,
                analogsInitialCount: valuation.analogsInitialCount,
                analogsUsedCount: valuation.analogsUsedCount,
                analogsExcludedCount: valuation.analogsExcludedCount,
                correctedRateMin: valuation.correctedRateMin,
                correctedRateMedian: valuation.correctedRateMedian,
                correctedRateMax: valuation.correctedRateMax,
                correctedRateStdDev: valuation.correctedRateStdDev,
                correctedRateIQR: valuation.correctedRateIQR,
                dispersionLevel: valuation.dispersionLevel,
                sampleSizeLevel: valuation.sampleSizeLevel,
                stabilityFlag: valuation.stabilityFlag,
            }
        );

        const breakdown = buildCalculationBreakdown(questionnaire, marketSnapshot, {
            manualRentalRate: manualRate,
            rentalRateSource: valuation.rentalRateSource,
            rentalRateSelectionMethod: valuation.rentalRateSelectionMethod,
            manualOverrideApplied: valuation.manualOverrideApplied,
            manualOverrideRate: valuation.manualOverrideRate,
            marketDerivedRentFirst: valuation.marketDerivedRentFirst,
            marketRentAverage: valuation.marketRentAverage,
            marketRentMedian: valuation.marketRentMedian,
            marketRentCorrectedMedian: valuation.marketRentCorrectedMedian,
            marketRentSimpleAverage: valuation.marketRentSimpleAverage,
            marketRentTrimmedMean: valuation.marketRentTrimmedMean,
            marketRentMin: valuation.marketRentMin,
            marketRentMax: valuation.marketRentMax,
            marketRentMonth: valuation.marketRentMonth,
            marketRentYear: valuation.marketRentYear,
            marketRentFirst: valuation.marketRentFirst,
            marketRentSecond: valuation.marketRentSecond,
            marketRentThirdPlus: valuation.marketRentThirdPlus,
            rentCalculationMode: valuation.rentCalculationMode,
            leasableArea: valuation.leasableArea,
            occupiedArea: valuation.occupiedArea,
            vacancyRate: valuation.vacancyRate,
            vacancyRatePercent: valuation.vacancyRatePercent,
            vacancyBreakdown: valuation.vacancyBreakdown,
            pgi: valuation.pgi,
            egi: valuation.egi,
            opex: valuation.opex,
            opexRate: valuation.opexRate,
            opexRateSource: valuation.opexRateSource,
            opexRateReasoning: valuation.opexRateReasoning,
            opexProfileUsed: valuation.opexProfileUsed,
            opexAdjustments: valuation.opexAdjustments,
            baseOpexRate: valuation.baseOpexRate,
            opexBreakdown: valuation.opexBreakdown,
            noi: valuation.noi,
            capitalizationRate: valuation.capitalizationRate,
            valueTotal: valuation.valueTotal,
            landShare: valuation.landShare,
            landDetails: valuation.landDetails,
            finalValue: valuation.finalValue,
            pricePerM2: valuation.pricePerM2,
            analogsCount: valuation.analogsCount,
            selectedAnalogsCount: valuation.selectedAnalogsCount,
            excludedAnalogsCount: valuation.excludedAnalogsCount,
            analogsQualityScore: valuation.analogsQualityScore,
            floorDetails: valuation.floorDetails,
            capitalizationRateSource: valuation.capitalizationRateSource,
            capitalizationRateSourceLabel: valuation.capitalizationRateSourceLabel,
            baseCapitalizationRate: valuation.baseCapitalizationRate,
            capitalizationAdjustments: valuation.capitalizationAdjustments,
            vacancyRateSource: valuation.vacancyRateSource,
            vacancyRateSourceLabel: valuation.vacancyRateSourceLabel,
            baseVacancyRate: valuation.baseVacancyRate,
            vacancyAdjustments: valuation.vacancyAdjustments,
            actualVacancyRate: valuation.actualVacancyRate,
            actualVacancyRatePercent: valuation.actualVacancyRatePercent,
            analogsInitialCount: valuation.analogsInitialCount,
            analogsUsedCount: valuation.analogsUsedCount,
            analogsExcludedCount: valuation.analogsExcludedCount,
            correctedRateMin: valuation.correctedRateMin,
            correctedRateMedian: valuation.correctedRateMedian,
            correctedRateMax: valuation.correctedRateMax,
            correctedRateStdDev: valuation.correctedRateStdDev,
            correctedRateIQR: valuation.correctedRateIQR,
            dispersionLevel: valuation.dispersionLevel,
            sampleSizeLevel: valuation.sampleSizeLevel,
            stabilityFlag: valuation.stabilityFlag,
            reliabilityScore: valuation.reliabilityScore,
            reliabilityDetails: valuation.reliabilityDetails,
            assumptions: valuation.assumptions,
        });

        let result = await ProjectResult.findOne({
            where: { project_id: project.id },
        });

        const occupancyRatePercent = Math.max(0, 100 - toNumber(valuation.vacancyRatePercent, 0));

        const payload = {
            project_id: project.id,
            rental_rate: valuation.marketRentMonth,
            leasable_area: valuation.leasableArea,
            occupancy_rate: occupancyRatePercent,
            gross_income: valuation.pgi,
            capitalization_rate: valuation.capitalizationRate,
            estimated_value: valuation.finalValue,
            market_snapshot_json: marketSnapshot,
            calculation_breakdown_json: breakdown,
            egi: valuation.egi,
            opex: valuation.opex,
            noi: valuation.noi,
            price_per_m2: valuation.pricePerM2,
            land_share: valuation.landShare,
            rental_rate_source: valuation.rentalRateSource,
        };

        if (result) {
            await result.update(payload);
        } else {
            result = await ProjectResult.create(payload);
        }

        await project.update({ status: 'completed' });

        return res.json({
            success: true,
            result: shapeProjectResultForViewer(result, {
                debugModeEnabled: Boolean(req.user?.debug_mode),
            }),
        });
    } catch (error) {
        console.error('Ошибка расчёта проекта:', error);
        return res.status(500).json({ error: 'Не удалось выполнить расчёт' });
    }
};

export const getProjectResult = async (req, res) => {
    try {
        const project = await ValuationProject.findOne({
            where: {
                id: req.params.projectId,
                user_id: req.user.id,
            },
        });

        if (!project) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        const result = await ProjectResult.findOne({
            where: { project_id: project.id },
        });

        return res.json(shapeProjectResultForViewer(result, {
            debugModeEnabled: Boolean(req.user?.debug_mode),
        }));
    } catch (error) {
        console.error('Ошибка получения результата проекта:', error);
        return res.status(500).json({ error: 'Не удалось получить результат проекта' });
    }
};

export const getProjectMarketContext = async (req, res) => {
    try {
        const projectId = req.params.projectId;

        const project = await ValuationProject.findByPk(projectId, {
            include: [
                {
                    model: ProjectQuestionnaire,
                    as: 'questionnaire',
                },
            ],
        });

        if (!project) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        let questionnaire = project.questionnaire
            ? toComparablePlain(project.questionnaire)
            : null;
        if (!questionnaire) {
            return res.status(400).json({ error: 'Для проекта отсутствует опросный лист' });
        }

        if (isPremisesObjectType(questionnaire.objectType)) {
            return res.status(400).json({
                error: 'Рыночный контекст для вида объекта «помещение» пока недоступен. Выберите вид объекта «здание».',
            });
        }

        const objectEnvironmentAnalysisRaw = await resolveObjectEnvironmentAnalysis(questionnaire);
        questionnaire = mergeObjectEnvironmentIntoQuestionnaire(questionnaire, objectEnvironmentAnalysisRaw);

        const {
            district,
            allAnalogs,
            excludedDuplicates,
            rankingPool,
            selectedAnalogs,
        } = await findComparableAnalogues(questionnaire);

        let calculationSelectedAnalogs = selectedAnalogs;
        let valuationPreview = await calculateValuation(questionnaire, calculationSelectedAnalogs, 0);

        if (valuationPreview.selectedAnalogsCount < MIN_FINAL_RENT_ANALOGS) {
            const refilledAnalogs = refillSelectedAnalogsForMinimumCalculation({
                selectedAnalogs: calculationSelectedAnalogs,
                rankingPool,
                valuation: valuationPreview,
            });

            if (refilledAnalogs !== calculationSelectedAnalogs) {
                calculationSelectedAnalogs = refilledAnalogs;
                valuationPreview = await calculateValuation(questionnaire, calculationSelectedAnalogs, 0);
            }
        }

        const objectEnvironmentAnalysis = buildResolvedObjectEnvironmentSummary(
            questionnaire,
            objectEnvironmentAnalysisRaw
        );

        const snapshot = buildMarketSnapshot(
            questionnaire,
            calculationSelectedAnalogs,
            allAnalogs,
            {
                district,
                objectEnvironmentAnalysis,
                adjustedRates: valuationPreview.adjustedRates,
                marketRentAverage: valuationPreview.marketRentAverage,
                marketRentMedian: valuationPreview.marketRentMedian,
                marketRentMonth: valuationPreview.marketRentMonth,
                marketRentSelectionMethod: valuationPreview.rentalRateSelectionMethod,
                rentCalculationMode: valuationPreview.rentCalculationMode,
                includedComparableCount: valuationPreview.analogsCount,
                selectedComparableCount: valuationPreview.selectedAnalogsCount,
                excludedComparableCount: valuationPreview.excludedAnalogsCount,
                analogsQualityScore: valuationPreview.analogsQualityScore,
                rentalRateSource: valuationPreview.rentalRateSource,
                manualOverrideApplied: valuationPreview.manualOverrideApplied,
                excludedDuplicates,
                reliabilityScore: valuationPreview.reliabilityScore,
                analogsInitialCount: valuationPreview.analogsInitialCount,
                analogsUsedCount: valuationPreview.analogsUsedCount,
                analogsExcludedCount: valuationPreview.analogsExcludedCount,
                correctedRateMin: valuationPreview.correctedRateMin,
                correctedRateMedian: valuationPreview.correctedRateMedian,
                correctedRateMax: valuationPreview.correctedRateMax,
                correctedRateStdDev: valuationPreview.correctedRateStdDev,
                correctedRateIQR: valuationPreview.correctedRateIQR,
                dispersionLevel: valuationPreview.dispersionLevel,
                sampleSizeLevel: valuationPreview.sampleSizeLevel,
                stabilityFlag: valuationPreview.stabilityFlag,
            }
        );

        return res.json({
            ...shapeMarketSnapshotForViewer(snapshot, {
                debugModeEnabled: Boolean(req.user?.debug_mode),
            }),
            debugModeEnabled: Boolean(req.user?.debug_mode),
        });
    } catch (error) {
        console.error('Ошибка получения рыночного контекста:', error);
        return res.status(500).json({
            error: 'Не удалось получить рыночный контекст',
            details: error.message,
        });
    }
};
