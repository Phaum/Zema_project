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
    calculateDistanceToMetroStation,
    findNearestMetroByCoords,
} from '../services/metroFallbackService.js';

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

function toComparablePlain(row) {
    if (!row) return {};
    if (typeof row.toJSON === 'function') return row.toJSON();
    if (row.dataValues && typeof row.dataValues === 'object') return { ...row.dataValues };
    return { ...row };
}

function firstFinite(...values) {
    for (const value of values) {
        const num = toNumber(value, null);
        if (Number.isFinite(num)) return num;
    }
    return null;
}

function resolveComparableCoordinates(row) {
    const lat = firstFinite(row?.lat);
    const lon = firstFinite(row?.lon);

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return {
            lat,
            lon,
            source: 'lat_lon',
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

    try {
        const stationDistance = await calculateDistanceToMetroStation({
            stationName: row?.station_name,
            lat: coords.lat,
            lon: coords.lon,
            address: row?.address,
            city: 'Санкт-Петербург',
        });
        const namedDistanceKm = normalizeMetroDistanceKm(stationDistance?.distance);
        if (Number.isFinite(namedDistanceKm)) {
            return namedDistanceKm;
        }
    } catch (error) {
        console.warn('Не удалось определить дистанцию до метро по названию станции для аналога', row?.id, error?.message || error);
    }

    try {
        const nearestMetro = await findNearestMetroByCoords({
            lat: coords.lat,
            lon: coords.lon,
            address: row?.address || 'Санкт-Петербург',
            city: 'Санкт-Петербург',
        });

        return normalizeMetroDistanceKm(nearestMetro?.distance);
    } catch (error) {
        console.warn('Не удалось определить ближайшее метро для аналога', row?.id, error?.message || error);
    }

    return null;
}

function buildAnalogueDuplicateKey(rawRow) {
    const row = toComparablePlain(rawRow);
    const addressKey = normalizeAddressKey(row.address || row.building || row.cadastral || row.id);
    const classKey = normalizeComparableClass(row.class_offer) || String(row.class_offer || '').trim().toUpperCase();
    const floorKey = normalizeFloorKey(row.floor);
    const comparableRate = toComparableRate(row);
    const rateKey = Number.isFinite(comparableRate) ? comparableRate.toFixed(2) : 'NO_RATE';
    const area = firstFinite(row.total_area, row.area_total, row.area);
    const areaBucket = Number.isFinite(area) ? Math.round(area / 100) * 100 : 'NO_AREA';

    return [addressKey, classKey, floorKey, rateKey, areaBucket].join('__');
}

function buildAnalogueObjectKey(rawRow) {
    const row = toComparablePlain(rawRow);

    const cadastralKey = String(row.building_cadastral_number || row.cadastral || '').trim();
    if (cadastralKey) {
        return `cad__${cadastralKey}`;
    }

    const buildingKey = normalizeAddressKey(row.building_name || row.building);
    if (buildingKey) {
        return `building__${buildingKey}`;
    }

    const addressKey = normalizeAddressKey(row.address_offer || row.address);
    if (addressKey) {
        return `addr__${addressKey}`;
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

export function deduplicateAnaloguesByObject(items, valuationDate) {
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
        const best = sorted[0];
        selectedAnalogs.push(best);

        for (const duplicate of sorted.slice(1)) {
            excludedDuplicates.push({
                ...duplicate,
                duplicateGroupKey: groupKey,
                duplicateOf: best.id || best.external_id || null,
                exclusionReason: 'Исключен как дубль объекта: выбран более близкий по дате и/или более полный аналог',
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

export function deduplicateRankedAnalogsByObject(items, valuationDate, maxCount = 10) {
    if (!items?.length) return [];

    const valuationTime = parseDateSafe(valuationDate)?.getTime() ?? Date.now();
    const bestByObject = new Map();

    for (const rawRow of items) {
        const row = toComparablePlain(rawRow);
        const key = buildAnalogueObjectKey(row);
        const currentBest = bestByObject.get(key);

        if (!currentBest) {
            bestByObject.set(key, row);
            continue;
        }

        const currentDistance = toNumber(row.mahalanobisDistance, Number.MAX_SAFE_INTEGER);
        const bestDistance = toNumber(currentBest.mahalanobisDistance, Number.MAX_SAFE_INTEGER);

        if (currentDistance !== bestDistance) {
            if (currentDistance < bestDistance) {
                bestByObject.set(key, row);
            }
            continue;
        }

        const currentTime = parseDateSafe(row.offer_date || row.date_offer)?.getTime() ?? Date.now();
        const bestTime = parseDateSafe(currentBest.offer_date || currentBest.date_offer)?.getTime() ?? Date.now();
        const currentDateDistance = Math.abs(currentTime - valuationTime);
        const bestDateDistance = Math.abs(bestTime - valuationTime);

        if (currentDateDistance !== bestDateDistance) {
            if (currentDateDistance < bestDateDistance) {
                bestByObject.set(key, row);
            }
            continue;
        }

        if (currentTime > bestTime) {
            bestByObject.set(key, row);
        }
    }

    return Array.from(bestByObject.values())
        .sort((a, b) => {
            const aDistance = toNumber(a.mahalanobisDistance, Number.MAX_SAFE_INTEGER);
            const bDistance = toNumber(b.mahalanobisDistance, Number.MAX_SAFE_INTEGER);
            return aDistance - bDistance;
        })
        .slice(0, maxCount);
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

    return {
        id: row.id,
        source_type: 'analogue',
        external_id: row.id,
        address_offer: row.address || null,
        district: row.district || null,
        class_offer: row.class_offer || null,
        area_total: row.total_area !== null ? Number(row.total_area) : null,
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
    const objectClassRaw =
        questionnaire.marketClassResolved ||
        questionnaire.businessCenterClass ||
        questionnaire.objectClass ||
        null;

    const cadastralRecord = questionnaire.buildingCadastralNumber
        ? await CadastralData.findOne({
            where: { cadastral_number: questionnaire.buildingCadastralNumber },
        })
        : null;

    const districtRaw = questionnaire.district || cadastralRecord?.district || null;
    const districtKey = normalizeDistrictKey(districtRaw);
    const areaRange = buildAreaRangeByCalculationArea(questionnaire);

    const baseWhere = {
        [Op.or]: [
            { price_per_meter_cut_nds: { [Op.ne]: null } },
            { unit_price: { [Op.ne]: null } },
            { price_per_meter: { [Op.ne]: null } },
        ],
    };

    if (areaRange) {
        baseWhere.total_area = areaRange;
    }

    // Excel parity: the workbook ranks the whole comparable pool by similarity
    // and does not pre-cut candidates to the same district.
    const strictWhere = { ...baseWhere };
    const relaxedWhere = { ...baseWhere };

    const strictClassWhere = buildAnalogueClassWhere(objectClassRaw, { allowEmptyFallback: false });
    const relaxedClassWhere = buildAnalogueClassWhere(objectClassRaw, { allowEmptyFallback: true });

    if (strictClassWhere) {
        strictWhere.class_offer = strictClassWhere;
    }

    if (relaxedClassWhere) {
        relaxedWhere.class_offer = relaxedClassWhere;
    }

    console.log('[findComparableAnalogues] objectClassRaw =', objectClassRaw);
    console.log('[findComparableAnalogues] strictClassCandidates =', buildAnalogueClassCandidates(objectClassRaw));
    console.log('[findComparableAnalogues] districtRaw =', districtRaw);
    console.log('[findComparableAnalogues] districtKey =', districtKey);
    console.log('[findComparableAnalogues] areaRange =', areaRange || null);

    let allRows = await Analogue.findAll({
        where: strictWhere,
        order: [['date_offer', 'DESC'], ['id', 'ASC']],
    });

    console.log('[findComparableAnalogues] strict found before dedupe =', allRows.length);

    console.log('[findComparableAnalogues] filterMode = strict_exact_class');

    console.log('[findComparableAnalogues] found after excel_parity_pool =', allRows.length);

    const normalized = await Promise.all(allRows.map(mapAnalogueToComparable));
    const deduplicated = deduplicateAnaloguesByObject(normalized, questionnaire.valuationDate);

    console.log('[findComparableAnalogues] normalized count =', normalized.length);
    console.log('[findComparableAnalogues] excluded duplicates =', deduplicated.excludedDuplicates.length);

    const { selected, ranked } = selectAnalogsByMahalanobis(questionnaire, deduplicated.selectedAnalogs);
    const uniqueSelected = deduplicateRankedAnalogsByObject(
        ranked || selected,
        questionnaire.valuationDate,
        10
    );

    console.log('[findComparableAnalogues] selected after mahalanobis =', selected.length);
    console.log('[findComparableAnalogues] selected after object_dedup =', uniqueSelected.length);

    return {
        district: districtRaw,
        allAnalogs: normalized,
        rankingPool: deduplicated.selectedAnalogs,
        selectedAnalogs: uniqueSelected,
        excludedDuplicates: deduplicated.excludedDuplicates,
    };
}

function buildComparableAdjustmentMap(adjustedRates = []) {
    const map = new Map();

    for (const row of adjustedRates) {
        const key = String(row.analogId);
        map.set(key, row);
    }

    return map;
}

function buildMarketSnapshot(questionnaire, selectedAnalogs, allAnalogs, marketMeta = {}) {
    const adjustedRateRows = Array.isArray(marketMeta.adjustedRates) ? marketMeta.adjustedRates : [];
    const adjustmentMap = buildComparableAdjustmentMap(adjustedRateRows);

    const includedAdjustedRows = adjustedRateRows.filter((item) => item?.includedInRentCalculation !== false);
    const selectedRates = includedAdjustedRows.length
        ? includedAdjustedRows
            .map((item) => toNumber(item.adjustedRate, null))
            .filter((value) => Number.isFinite(value))
        : (selectedAnalogs || [])
            .map((item) => toNumber(toComparablePlain(item).price_per_sqm_cleaned, null))
            .filter((value) => Number.isFinite(value));

    const allRates = (allAnalogs || [])
        .map((item) => toNumber(toComparablePlain(item).price_per_sqm_cleaned, null))
        .filter((value) => Number.isFinite(value));

    const topComparables = (selectedAnalogs || []).slice(0, 10).map((rawRow) => {
        const row = toComparablePlain(rawRow);
        const adjustment = adjustmentMap.get(String(row.id));

        return {
            id: row.id,
            source_type: row.source_type || 'analogue',
            external_id: row.external_id || null,
            address_offer: row.address_offer || null,
            district: row.district || null,
            class_offer: row.class_offer || null,
            area_total: toNumber(row.area_total, null),
            price_per_sqm_cleaned: toNumber(row.price_per_sqm_cleaned, null),
            raw_rate: toNumber(adjustment?.rawRate, null),
            adjusted_rate: toNumber(adjustment?.adjustedRate, null),
            base_rate: toNumber(adjustment?.baseRate, null),
            corrected_rate: toNumber(adjustment?.correctedRate, null),
            total_adjustment_factor: toNumber(adjustment?.totalAdjustmentFactor, null),
            area_ratio: toNumber(adjustment?.areaRatio ?? adjustment?.scaleAreaRatio, null),
            scale_similarity_score: toNumber(adjustment?.scaleSimilarityScore, null),
            scale_weight_penalty: toNumber(adjustment?.scaleWeightPenalty, null),
            pre_weight: toNumber(adjustment?.preWeight ?? adjustment?.baseWeight, null),
            final_weight: toNumber(adjustment?.finalWeight ?? adjustment?.normalizedWeight, null),
            latitude: toNumber(row.latitude, null),
            longitude: toNumber(row.longitude, null),
            coordinate_source: row.coordinate_source || null,
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
            mahalanobisDistance: row.mahalanobisDistance ?? null,
            year_built_commissioning: row.year_built_commissioning || null,
            floor_location: row.floor_location || null,
            distance_to_metro: row.distance_to_metro || null,
            building_cadastral_number: row.building_cadastral_number || null,
            building_name: row.building_name || null,
            adjustments: adjustment?.adjustments || null,
        };
    });

    return {
        comparableCount: marketMeta.includedComparableCount ?? selectedAnalogs?.length ?? 0,
        includedComparableCount: marketMeta.includedComparableCount ?? selectedAnalogs?.length ?? 0,
        selectedComparableCount: marketMeta.selectedComparableCount ?? selectedAnalogs?.length ?? 0,
        excludedComparableCount: marketMeta.excludedComparableCount ?? 0,
        totalAvailable: allAnalogs?.length || 0,

        objectComparableCount: marketMeta.includedComparableCount ?? selectedAnalogs?.length ?? 0,
        objectTotalAvailable: allAnalogs?.length || 0,

        district: marketMeta.district || questionnaire.district || null,

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
        analogsInitialCount: marketMeta.analogsInitialCount ?? null,
        analogsUsedCount: marketMeta.analogsUsedCount ?? null,
        analogsExcludedCount: marketMeta.analogsExcludedCount ?? null,
        correctedRateMin: marketMeta.correctedRateMin ?? null,
        correctedRateMedian: marketMeta.correctedRateMedian ?? null,
        correctedRateMax: marketMeta.correctedRateMax ?? null,
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

        const questionnaire = await ProjectQuestionnaire.findOne({
            where: { project_id: project.id },
        });

        if (!questionnaire) {
            return res.status(400).json({ error: 'Анкета проекта не заполнена' });
        }

        if (!questionnaire.mapPointLat || !questionnaire.mapPointLng) {
            return res.status(400).json({ error: 'Координаты объекта не указаны' });
        }

        const {
            district,
            allAnalogs,
            excludedDuplicates,
            selectedAnalogs,
        } = await findComparableAnalogues(questionnaire);

        if (!allAnalogs || allAnalogs.length === 0) {
            return res.status(400).json({ error: 'Нет аналогов в базе analogues' });
        }

        const hasManualRateInRequest = ['manualRate', 'averageRentalRate']
            .some((key) => Object.prototype.hasOwnProperty.call(req.body || {}, key));
        const manualRateFromRequest = toNumber(
            req.body?.manualRate ?? req.body?.averageRentalRate,
            null
        );
        const manualRateFromQuestionnaire = toNumber(questionnaire?.averageRentalRate, null);
        const resolvedManualRate = hasManualRateInRequest
            ? manualRateFromRequest
            : manualRateFromQuestionnaire;
        const manualRate = Number.isFinite(resolvedManualRate) && resolvedManualRate > 0
            ? resolvedManualRate
            : null;

        const valuation = await calculateValuation(
            questionnaire,
            selectedAnalogs,
            manualRate
        );

        if (selectedAnalogs.length < 10) {
            console.warn(`Найдено только ${selectedAnalogs.length} аналогов, требуется 10`);
        }

        const marketSnapshot = buildMarketSnapshot(
            questionnaire,
            selectedAnalogs,
            allAnalogs,
            {
                district,
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

        const questionnaire = project.questionnaire;
        if (!questionnaire) {
            return res.status(400).json({ error: 'Для проекта отсутствует опросный лист' });
        }

        const {
            district,
            allAnalogs,
            excludedDuplicates,
            selectedAnalogs,
        } = await findComparableAnalogues(questionnaire);

        const valuationPreview = await calculateValuation(questionnaire, selectedAnalogs, 0);

        const snapshot = buildMarketSnapshot(
            questionnaire,
            selectedAnalogs,
            allAnalogs,
            {
                district,
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


