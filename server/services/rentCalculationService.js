import { toNumber } from '../utils/dataValidation.js';

const RENT_CONFIG = {
    selector: {
        maxAnalogs: 10,
        areaMinFactor: 0.35,
        areaMaxFactor: 3,
    },
    adjustments: {
        dateAdjustmentMatrix: {
            '2025Q1': {
                '2025Q1': 0.00,
                '2025Q2': 0.01,
                '2025Q3': 0.07,
                '2025Q4': 0.18,
            },
            '2025Q2': {
                '2025Q1': -0.01,
                '2025Q2': 0.00,
                '2025Q3': 0.06,
                '2025Q4': 0.17,
            },
            '2025Q3': {
                '2025Q1': -0.07,
                '2025Q2': -0.06,
                '2025Q3': 0.00,
                '2025Q4': 0.11,
            },
            '2025Q4': {
                '2025Q1': -0.18,
                '2025Q2': -0.17,
                '2025Q3': -0.11,
                '2025Q4': 0.00,
            },
            '2026Q1': {
                '2025Q1': -0.18,
                '2025Q2': -0.17,
                '2025Q3': -0.11,
                '2025Q4': 0.00,
                '2026Q1': 0.00,
            },
        },

        bargainDiscount: 0.05,

        areaExponentByQuarter: {
            '2025Q1': -0.18,
            '2025Q2': -0.17,
            '2025Q3': -0.17,
            '2025Q4': -0.16,
            '2026Q1': -0.16,
        },

        floorCoefficientsByQuarter: {
            '2025Q1': {
                underground: 0.88,
                basement: 0.88,
                first: 1.00,
                second: 1.03,
                third_plus: 0.98,
            },
            '2025Q2': {
                underground: 0.89,
                basement: 0.89,
                first: 1.00,
                second: 1.03,
                third_plus: 0.99,
            },
            '2025Q3': {
                underground: 0.89,
                basement: 0.89,
                first: 1.00,
                second: 1.03,
                third_plus: 0.99,
            },
            '2025Q4': {
                underground: 0.90,
                basement: 0.90,
                first: 1.00,
                second: 1.03,
                third_plus: 0.99,
            },
            '2026Q1': {
                underground: 0.89,
                basement: 0.89,
                first: 1.00,
                second: 1.03,
                third_plus: 0.99,
            },
        },

        environmentCoefficients: {
            'культурный и исторический центр': 1.00,
            'исторический центр': 1.00,
            'центры деловой активности': 0.91,
            'многоквартирная жилая застройка': 0.83,
            'среднеэтажная жилая застройка': 0.80,
            'окраины городов, промзоны': 0.61,
            'промзона': 0.61,
            'район крупных автомагистралей города': 0.79,
        },

        outlierRangeLimit: 0.30,
    },
};

const SMALL_SAMPLE_THRESHOLD = 7;

function round2(value) {
    return Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

function round4(value) {
    return Math.round((toNumber(value, 0) + Number.EPSILON) * 10000) / 10000;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function roundFactor2(value) {
    return Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

function average(values = []) {
    const arr = values.map(Number).filter(Number.isFinite);
    if (!arr.length) return 0;
    return arr.reduce((sum, value) => sum + value, 0) / arr.length;
}

function median(values = []) {
    const arr = values
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

    if (!arr.length) return null;

    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 === 0
        ? (arr[mid - 1] + arr[mid]) / 2
        : arr[mid];
}

function safeDivide(numerator, denominator, fallback = 0) {
    const num = toNumber(numerator, null);
    const den = toNumber(denominator, null);

    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
        return fallback;
    }

    return num / den;
}

function standardDeviation(values = []) {
    const arr = values.map(Number).filter(Number.isFinite);
    if (!arr.length) return 0;
    const mean = average(arr);
    const variance = average(arr.map((value) => ((value - mean) ** 2)));
    return Math.sqrt(Math.max(variance, 0));
}

function percentile(values = [], quantile = 0.5) {
    const arr = values
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

    if (!arr.length) return null;
    if (arr.length === 1) return arr[0];

    const q = clamp(toNumber(quantile, 0.5), 0, 1);
    const index = (arr.length - 1) * q;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
        return arr[lower];
    }

    const weight = index - lower;
    return arr[lower] + (arr[upper] - arr[lower]) * weight;
}

function getSampleSizeLevel(count) {
    if (count >= 10) return 'good';
    if (count >= SMALL_SAMPLE_THRESHOLD) return 'medium';
    return 'small';
}

function getDispersionLevel({ medianValue, stdDev, iqr }) {
    const medianSafe = toNumber(medianValue, null);
    const stdRatio = Number.isFinite(medianSafe) && medianSafe > 0
        ? safeDivide(stdDev, medianSafe, 0)
        : null;
    const iqrRatio = Number.isFinite(medianSafe) && medianSafe > 0
        ? safeDivide(iqr, medianSafe, 0)
        : null;
    const severity = Math.max(toNumber(stdRatio, 0), toNumber(iqrRatio, 0));

    if (severity >= 0.30) return 'high';
    if (severity >= 0.16) return 'medium';
    return 'low';
}

function normalizeComparableText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeBusinessCenterClass(value) {
    const normalized = String(value || '')
        .trim()
        .toUpperCase()
        .replace(/А/g, 'A')
        .replace(/В/g, 'B')
        .replace(/С/g, 'C');

    if (['A+', 'A', 'B+', 'B', 'C'].includes(normalized)) {
        return normalized;
    }

    return 'unknown';
}

function normalizeMetroDistanceKm(value) {
    const distance = toNumber(value, null);
    if (!Number.isFinite(distance) || distance <= 0) return null;
    if (distance > 25) return distance / 1000;
    return distance;
}

function parseFloorCategory(value) {
    const s = String(value || '').trim().toLowerCase();

    if (s === 'underground') return 'underground';
    if (s === 'basement') return 'basement';
    if (s === 'first') return 'first';
    if (s === 'second') return 'second';
    if (s === 'third_plus' || s === 'third-plus' || s === 'third plus') return 'third_plus';

    if (s.includes('подвал') || s.includes('подзем') || s.includes('underground')) return 'underground';
    if (s.includes('цокол') || s.includes('basement')) return 'basement';
    if (s.includes('перв') || s === '1' || s.includes('1 этаж')) return 'first';
    if (s.includes('втор') || s === '2' || s.includes('2 этаж')) return 'second';

    return 'third_plus';
}

function parseQuarterKey(value) {
    if (!value) return null;

    const raw = String(value).trim();
    const normalized = raw
        .toUpperCase()
        .replace(/Ё/g, 'Е')
        .replace(/\s+/g, ' ');

    const yearMatch = normalized.match(/(20\d{2}|19\d{2})/);
    if (!yearMatch) return null;

    const quarterMatch =
        normalized.match(/(?:^|\s)([1-4])\s*(?:КВ\.?|КВАРТАЛ|Q)(?=\s|$)/i) ||
        normalized.match(/(?:^|\s)(?:Q|КВ\.?|КВАРТАЛ)\s*([1-4])(?=\s|$)/i);

    if (quarterMatch) {
        return `${yearMatch[1]}Q${quarterMatch[1]}`;
    }

    const dotDateMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dotDateMatch) {
        const month = Number(dotDateMatch[2]);
        if (month >= 1 && month <= 12) {
            const q = Math.floor((month - 1) / 3) + 1;
            return `${dotDateMatch[3]}Q${q}`;
        }
    }

    const isoDateMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoDateMatch) {
        const month = Number(isoDateMatch[2]);
        if (month >= 1 && month <= 12) {
            const q = Math.floor((month - 1) / 3) + 1;
            return `${isoDateMatch[1]}Q${q}`;
        }
    }

    const parsedDate = new Date(raw);
    if (!Number.isNaN(parsedDate.getTime())) {
        const q = Math.floor(parsedDate.getMonth() / 3) + 1;
        return `${parsedDate.getFullYear()}Q${q}`;
    }

    return null;
}

function firstResolvedQuarter(...values) {
    for (const value of values) {
        const parsed = parseQuarterKey(value);
        if (parsed) return parsed;
    }
    return null;
}

function resolveValuationQuarter(questionnaire = {}) {
    return firstResolvedQuarter(
        questionnaire?.valuationQuarter,
        questionnaire?.valuationDate,
        questionnaire?.dateOfValuation
    );
}

function resolveAnalogQuarter(analog = {}) {
    return firstResolvedQuarter(
        analog?.quarter,
        analog?.offerQuarter,
        analog?.offer_date
    );
}

// function resolveValuationQuarterForAreaAndFloor(questionnaire = {}) {
//     return resolveValuationQuarter(questionnaire) || '2025Q1';
// }

function resolveValuationQuarterForAreaAndFloor(questionnaire = {}) {
    return resolveValuationQuarter(questionnaire);
}

function getMetroCoefficient(distanceKm) {
    const d = normalizeMetroDistanceKm(distanceKm);
    if (!Number.isFinite(d) || d <= 0) return null;
    return 0.78 * Math.pow(d, -0.04);
}

function getMetroAdjustment(subjectDistance, analogDistance) {
    const subjectCoeff = getMetroCoefficient(subjectDistance);
    const analogCoeff = getMetroCoefficient(analogDistance);

    if (!Number.isFinite(subjectCoeff) || !Number.isFinite(analogCoeff) || analogCoeff === 0) {
        return 1;
    }

    return subjectCoeff / analogCoeff;
}

// function getAreaAdjustment(subjectArea, analogArea, valuationQuarter) {
//     const subject = toNumber(subjectArea, null);
//     const analog = toNumber(analogArea, null);
//     const exponent = toNumber(
//         RENT_CONFIG.adjustments.areaExponentByQuarter?.[valuationQuarter],
//         toNumber(RENT_CONFIG.adjustments.areaExponentByQuarter?.['2025Q1'], -0.18)
//     );

//     if (!Number.isFinite(subject) || !Number.isFinite(analog) || subject <= 0 || analog <= 0) {
//         return 1;
//     }

//     const subjectCoefficient = Math.pow(subject / subject, exponent);
//     const analogCoefficient = Math.pow(subject / analog, exponent);

//     if (!Number.isFinite(subjectCoefficient) || !Number.isFinite(analogCoefficient) || analogCoefficient === 0) {
//         return 1;
//     }

//     return subjectCoefficient / analogCoefficient;
// }

function getAreaAdjustment(subjectArea, analogArea, valuationQuarter) {
    const subject = toNumber(subjectArea, null);
    const analog = toNumber(analogArea, null);
    const exponent = toNumber(
        RENT_CONFIG.adjustments.areaExponentByQuarter?.[valuationQuarter],
        null
    );

    if (!Number.isFinite(subject) || !Number.isFinite(analog) || subject <= 0 || analog <= 0) {
        return 1;
    }

    if (!Number.isFinite(exponent)) {
        return 1;
    }

    return Math.pow(subject / analog, exponent);
}

function getFloorCoefficient(floorCategory, valuationQuarter) {
    const quarterMap =
        RENT_CONFIG.adjustments.floorCoefficientsByQuarter?.[valuationQuarter]
        || RENT_CONFIG.adjustments.floorCoefficientsByQuarter?.['2025Q1'];

    return toNumber(quarterMap?.[parseFloorCategory(floorCategory)], 1);
}

// function getFloorAdjustment(subjectFloorCategory, analogFloorCategory, valuationQuarter) {
//     const subjectCoeff = getFloorCoefficient(subjectFloorCategory, valuationQuarter);
//     const analogCoeff = getFloorCoefficient(analogFloorCategory, valuationQuarter);

//     if (!Number.isFinite(subjectCoeff) || !Number.isFinite(analogCoeff) || analogCoeff === 0) {
//         return 1;
//     }

//     return subjectCoeff / analogCoeff;
// }

function getFloorAdjustment(subjectFloorCategory, analogFloorCategory, valuationQuarter) {
    const subjectCategory = parseFloorCategory(subjectFloorCategory);
    const analogCategory = parseFloorCategory(analogFloorCategory);

    const quarterMap =
        RENT_CONFIG.adjustments.floorCoefficientsByQuarter?.[valuationQuarter]
        || null;

    if (!quarterMap) {
        return 1;
    }

    if (subjectCategory === 'first') {
        if (analogCategory === 'first') return 1;
        return toNumber(quarterMap?.[analogCategory], 1);
    }

    const subjectCoeff = toNumber(quarterMap?.[subjectCategory], 1);
    const analogCoeff = toNumber(quarterMap?.[analogCategory], 1);

    if (!Number.isFinite(subjectCoeff) || !Number.isFinite(analogCoeff) || analogCoeff === 0) {
        return 1;
    }

    return subjectCoeff / analogCoeff;
}

function getComparableSubjectArea(questionnaire = {}) {
    const floors = Array.isArray(questionnaire?.floors) ? questionnaire.floors : [];

    const firstFloor = floors.find((floor) => {
        const category = parseFloorCategory(floor?.floorCategory || floor?.floorLocation || floor?.label);
        return category === 'first';
    });

    const firstFloorComparableArea = toNumber(
        firstFloor?.avgLeasableRoomArea ?? firstFloor?.leasableArea ?? firstFloor?.area,
        null
    );

    if (Number.isFinite(firstFloorComparableArea) && firstFloorComparableArea > 0) {
        return firstFloorComparableArea;
    }

    const roomAreas = floors
        .map((floor) => toNumber(floor?.avgLeasableRoomArea, null))
        .filter((value) => Number.isFinite(value) && value > 0);

    if (roomAreas.length) {
        return average(roomAreas);
    }

    const leasableArea = toNumber(questionnaire?.leasableArea, 0);
    const aboveGroundFloors = Number(questionnaire?.aboveGroundFloors) || 0;

    if (leasableArea > 0 && aboveGroundFloors > 0) {
        return leasableArea / aboveGroundFloors;
    }

    return toNumber(questionnaire?.totalArea, 0);
}

function getEnvironmentCoefficientSingle(value) {
    const normalized = normalizeComparableText(value);
    if (!normalized || normalized === '0') return null;

    const direct = RENT_CONFIG.adjustments.environmentCoefficients[normalized];
    if (Number.isFinite(direct)) return direct;

    if (normalized.includes('культур') || normalized.includes('истор')) return 1.00;
    if (normalized.includes('делов')) return 0.91;
    if (normalized.includes('многоквартир')) return 0.83;
    if (normalized.includes('среднеэтаж')) return 0.80;
    if (normalized.includes('пром')) return 0.61;
    if (normalized.includes('автомагистра')) return 0.79;

    return null;
}

function isTruthyHistoricalCenter(value) {
    const normalized = normalizeComparableText(value);
    return ['да', 'yes', 'true', '1'].includes(normalized);
}

function resolveQuestionnaireHistoricalCenter(questionnaire = {}) {
    return (
        questionnaire?.historicalCenter ??
        questionnaire?.isHistoricalCenter ??
        questionnaire?.historicCenter ??
        questionnaire?.historical_center ??
        questionnaire?.historic_center ??
        questionnaire?.historicalCentre ??
        questionnaire?.historicCentre ??
        null
    );
}

function resolveAnalogHistoricalCenter(analog = {}) {
    return (
        analog?.historical_center ??
        analog?.historic_center ??
        analog?.historicalCenter ??
        analog?.historicCenter ??
        analog?.isHistoricalCenter ??
        analog?.is_historical_center ??
        analog?.historicalCentre ??
        analog?.historicCentre ??
        null
    );
}

function getEnvironmentCoefficient(values = [], historicalCenter = null) {
    if (isTruthyHistoricalCenter(historicalCenter)) {
        return 1;
    }

    const coeffs = (Array.isArray(values) ? values : [values])
        .flat()
        .map(getEnvironmentCoefficientSingle)
        .filter(Number.isFinite);

    if (!coeffs.length) return 1;

    return average(coeffs);
}

function resolveQuestionnaireEnvironment(questionnaire = {}) {
    return [
        questionnaire?.env_category_1,
        questionnaire?.env_category_2,
        questionnaire?.environment_category_1,
        questionnaire?.environment_category_2,
        questionnaire?.environmentCategory1,
        questionnaire?.environmentCategory2,
        questionnaire?.environmentCategory3,
        questionnaire?.environmentIndustrial,
        questionnaire?.environmentBusiness,
        questionnaire?.environmentResidential,
        questionnaire?.environment,
    ];
}

function resolveAnalogEnvironment(analog = {}) {
    return [
        analog?.env_category_1,
        analog?.env_category_2,
        analog?.environment_category_1,
        analog?.environment_category_2,
        analog?.environment_category_3,
        analog?.environment,
    ];
}

function getEnvironmentAdjustment(questionnaire, analog) {
    const subjectCoeff = getEnvironmentCoefficient(
        resolveQuestionnaireEnvironment(questionnaire),
        resolveQuestionnaireHistoricalCenter(questionnaire)
    );

    const analogCoeff = getEnvironmentCoefficient(
        resolveAnalogEnvironment(analog),
        resolveAnalogHistoricalCenter(analog)
    );

    if (!Number.isFinite(subjectCoeff) || !Number.isFinite(analogCoeff) || analogCoeff === 0) {
        return 1;
    }

    return subjectCoeff / analogCoeff;
}

function createAdjustmentRecord(key, label, factor, reasoning, details = {}) {
    const normalizedFactor = Number.isFinite(factor) ? factor : 1;

    return {
        key,
        label,
        factor: round4(normalizedFactor),
        deltaPercent: round2((normalizedFactor - 1) * 100),
        reasoning,
        details,
    };
}

function calculateDateAdjustmentRecord(questionnaire, analog) {
    const valuationQuarter = resolveValuationQuarter(questionnaire);
    const analogQuarter = resolveAnalogQuarter(analog);

    if (!valuationQuarter || !analogQuarter) {
        return createAdjustmentRecord(
            'date',
            'Дата предложения',
            1,
            'Не удалось определить квартал оценки или квартал аналога',
            {
                valuationQuarter,
                analogQuarter,
                valuationDateRaw: questionnaire?.valuationDate ?? null,
                valuationQuarterRaw: questionnaire?.valuationQuarter ?? null,
                analogQuarterRaw: analog?.quarter ?? null,
                analogOfferDateRaw: analog?.offer_date ?? null,
            }
        );
    }

    const rawPercent = RENT_CONFIG.adjustments.dateAdjustmentMatrix?.[valuationQuarter]?.[analogQuarter];
    const adjustmentPercent = toNumber(rawPercent, 0);
    const factor = 1 - adjustmentPercent;

    return createAdjustmentRecord(
        'date',
        'Дата предложения',
        factor,
        'Корректировка по квартальной матрице',
        {
            valuationQuarter,
            analogQuarter,
            adjustmentPercent: round2(adjustmentPercent * 100),
        }
    );
}

function calculateBargainAdjustmentRecord() {
    const discount = toNumber(RENT_CONFIG.adjustments.bargainDiscount, 0.05);

    return createAdjustmentRecord(
        'bargain',
        'Скидка на торг',
        1 - discount,
        'Единая скидка на торг',
        { discountPercent: round2(discount * 100) }
    );
}

function calculateMetroAdjustmentRecord(questionnaire, analog) {
    const factor = getMetroAdjustment(
        questionnaire?.metroDistance,
        analog?.distance_to_metro
    );

    return createAdjustmentRecord(
        'metro',
        'Удаленность от метро',
        factor,
        'К объекта / К аналога по формуле y = 0.78 * x^-0.04',
        {
            subjectDistanceKm: normalizeMetroDistanceKm(questionnaire?.metroDistance),
            analogDistanceKm: normalizeMetroDistanceKm(analog?.distance_to_metro),
        }
    );
}

function calculateAreaAdjustmentRecord(questionnaire, analog) {
    const valuationQuarter = resolveValuationQuarterForAreaAndFloor(questionnaire);
    const subjectArea = getComparableSubjectArea(questionnaire);
    const analogArea = toNumber(analog?.area_total, null);

    const factor = getAreaAdjustment(subjectArea, analogArea, valuationQuarter);

    return createAdjustmentRecord(
        'area',
        'Общая площадь',
        factor,
        'Кs = (So / Sa)^n',
        {
            valuationQuarter,
            exponentN: toNumber(RENT_CONFIG.adjustments.areaExponentByQuarter?.[valuationQuarter], null),
            subjectArea: round2(subjectArea),
            analogArea: round2(analogArea),
        }
    );
}

function calculateFloorAdjustmentRecord(questionnaire, analog) {
    const valuationQuarter = resolveValuationQuarterForAreaAndFloor(questionnaire);
    const subjectFloorCategory = questionnaire?.floorCategory || questionnaire?.floorType || 'first';
    const analogFloorCategory = analog?.floor_location || analog?.floor_type || analog?.floorCategory;

    const factor = getFloorAdjustment(subjectFloorCategory, analogFloorCategory, valuationQuarter);

    return createAdjustmentRecord(
        'floor',
        'Этаж расположения',
        factor,
        'Корректировка по квартальной таблице этажности',
        {
            valuationQuarter,
            subjectFloorCategory: parseFloorCategory(subjectFloorCategory),
            analogFloorCategory: parseFloorCategory(analogFloorCategory),
        }
    );
}

function calculateEnvironmentAdjustmentRecord(questionnaire, analog) {
    const subjectHistoricalCenter = resolveQuestionnaireHistoricalCenter(questionnaire);
    const analogHistoricalCenter = resolveAnalogHistoricalCenter(analog);
    const factor = getEnvironmentAdjustment(questionnaire, analog);

    return createAdjustmentRecord(
        'environment',
        'Ближайшее окружение',
        factor,
        'Корректировка по отношению коэффициентов окружения',
        {
            subjectEnvironment: resolveQuestionnaireEnvironment(questionnaire),
            analogEnvironment: resolveAnalogEnvironment(analog),
            subjectHistoricalCenter,
            analogHistoricalCenter,
        }
    );
}

// function adjustAnalogRateByNewAlgorithm(analog, questionnaire, baseRate) {
//     const rawRate = toNumber(baseRate, null);

//     if (!Number.isFinite(rawRate) || rawRate <= 0) {
//         return {
//             rawRate: null,
//             baseRate: null,
//             afterDate: null,
//             afterBargain: null,
//             correctedRate: null,
//             dateAdjustment: 1,
//             bargainAdjustment: 1,
//             metroAdjustment: 1,
//             areaAdjustment: 1,
//             floorAdjustment: 1,
//             environmentAdjustment: 1,
//             firstGroupFactor: 1,
//             secondGroupMultiFactor: 1,
//             totalAdjustmentFactor: 1,
//             adjustments: [],
//             adjustmentSummary: null,
//         };
//     }

//     const dateRecord = calculateDateAdjustmentRecord(questionnaire, analog);
//     const afterDate = rawRate * dateRecord.factor;

//     const bargainRecord = calculateBargainAdjustmentRecord();
//     const afterBargain = afterDate * bargainRecord.factor;

//     const metroRecord = calculateMetroAdjustmentRecord(questionnaire, analog);
//     const areaRecord = calculateAreaAdjustmentRecord(questionnaire, analog);
//     const floorRecord = calculateFloorAdjustmentRecord(questionnaire, analog);
//     const environmentRecord = calculateEnvironmentAdjustmentRecord(questionnaire, analog);

//     const secondGroupMultiFactor =
//         metroRecord.factor *
//         areaRecord.factor *
//         floorRecord.factor *
//         environmentRecord.factor;

//     const correctedRate = afterBargain * secondGroupMultiFactor;
//     const firstGroupFactor = dateRecord.factor * bargainRecord.factor;
//     const totalAdjustmentFactor = firstGroupFactor * secondGroupMultiFactor;

//     const adjustments = [
//         dateRecord,
//         bargainRecord,
//         metroRecord,
//         areaRecord,
//         floorRecord,
//         environmentRecord,
//     ];

//     return {
//         rawRate: round2(rawRate),
//         baseRate: round2(rawRate),
//         afterDate: round2(afterDate),
//         afterBargain: round2(afterBargain),
//         correctedRate: round2(correctedRate),
//         adjustedRate: round2(correctedRate),

//         dateAdjustment: round4(dateRecord.factor),
//         bargainAdjustment: round4(bargainRecord.factor),
//         metroAdjustment: round4(metroRecord.factor),
//         areaAdjustment: round4(areaRecord.factor),
//         floorAdjustment: round4(floorRecord.factor),
//         environmentAdjustment: round4(environmentRecord.factor),

//         firstGroupFactor: round4(firstGroupFactor),
//         secondGroupMultiFactor: round4(secondGroupMultiFactor),
//         totalAdjustmentFactor: round4(totalAdjustmentFactor),

//         adjustments,
//         adjustmentSummary: {
//             firstGroup: [
//                 {
//                     key: 'date',
//                     factor: round4(dateRecord.factor),
//                     deltaPercent: round2((dateRecord.factor - 1) * 100),
//                 },
//                 {
//                     key: 'bargain',
//                     factor: round4(bargainRecord.factor),
//                     deltaPercent: round2((bargainRecord.factor - 1) * 100),
//                 },
//             ],
//             secondGroup: [
//                 {
//                     key: 'metro',
//                     factor: round4(metroRecord.factor),
//                     deltaPercent: round2((metroRecord.factor - 1) * 100),
//                 },
//                 {
//                     key: 'area',
//                     factor: round4(areaRecord.factor),
//                     deltaPercent: round2((areaRecord.factor - 1) * 100),
//                 },
//                 {
//                     key: 'floor',
//                     factor: round4(floorRecord.factor),
//                     deltaPercent: round2((floorRecord.factor - 1) * 100),
//                 },
//                 {
//                     key: 'environment',
//                     factor: round4(environmentRecord.factor),
//                     deltaPercent: round2((environmentRecord.factor - 1) * 100),
//                 },
//             ],
//         },
//     };
// }

function adjustAnalogRateByNewAlgorithm(analog, questionnaire, baseRate) {
    const rawRate = toNumber(baseRate, null);

    if (!Number.isFinite(rawRate) || rawRate <= 0) {
        return {
            rawRate: null,
            baseRate: null,
            afterDate: null,
            afterBargain: null,
            correctedRate: null,
            adjustedRate: null,

            dateAdjustment: 1,
            bargainAdjustment: 1,
            metroAdjustment: 1,
            areaAdjustment: 1,
            floorAdjustment: 1,
            environmentAdjustment: 1,

            firstGroupFactor: 1,
            secondGroupMultiFactor: 1,
            totalAdjustmentFactor: 1,

            adjustments: [],
            adjustmentSummary: null,
        };
    }

    const dateRecord = calculateDateAdjustmentRecord(questionnaire, analog);
    dateRecord.factor = roundFactor2(dateRecord.factor);
    dateRecord.deltaPercent = round2((dateRecord.factor - 1) * 100);

    const afterDate = round2(rawRate * dateRecord.factor);

    const bargainRecord = calculateBargainAdjustmentRecord();
    bargainRecord.factor = roundFactor2(bargainRecord.factor);
    bargainRecord.deltaPercent = round2((bargainRecord.factor - 1) * 100);

    const afterBargain = round2(afterDate * bargainRecord.factor);

    const metroRecord = calculateMetroAdjustmentRecord(questionnaire, analog);
    metroRecord.factor = roundFactor2(metroRecord.factor);
    metroRecord.deltaPercent = round2((metroRecord.factor - 1) * 100);

    const areaRecord = calculateAreaAdjustmentRecord(questionnaire, analog);
    areaRecord.factor = roundFactor2(areaRecord.factor);
    areaRecord.deltaPercent = round2((areaRecord.factor - 1) * 100);

    const floorRecord = calculateFloorAdjustmentRecord(questionnaire, analog);
    floorRecord.factor = roundFactor2(floorRecord.factor);
    floorRecord.deltaPercent = round2((floorRecord.factor - 1) * 100);

    const environmentRecord = calculateEnvironmentAdjustmentRecord(questionnaire, analog);
    environmentRecord.factor = roundFactor2(environmentRecord.factor);
    environmentRecord.deltaPercent = round2((environmentRecord.factor - 1) * 100);

    const secondGroupMultiFactor = roundFactor2(
        metroRecord.factor *
        areaRecord.factor *
        floorRecord.factor *
        environmentRecord.factor
    );

    const correctedRate = round2(afterBargain * secondGroupMultiFactor);

    const firstGroupFactor = roundFactor2(
        dateRecord.factor * bargainRecord.factor
    );

    const totalAdjustmentFactor = roundFactor2(
        firstGroupFactor * secondGroupMultiFactor
    );

    const adjustments = [
        dateRecord,
        bargainRecord,
        metroRecord,
        areaRecord,
        floorRecord,
        environmentRecord,
    ];

    return {
        rawRate: round2(rawRate),
        baseRate: round2(rawRate),
        afterDate,
        afterBargain,
        correctedRate,
        adjustedRate: correctedRate,

        dateAdjustment: dateRecord.factor,
        bargainAdjustment: bargainRecord.factor,
        metroAdjustment: metroRecord.factor,
        areaAdjustment: areaRecord.factor,
        floorAdjustment: floorRecord.factor,
        environmentAdjustment: environmentRecord.factor,

        firstGroupFactor,
        secondGroupMultiFactor,
        totalAdjustmentFactor,

        adjustments,
        adjustmentSummary: {
            firstGroup: [
                {
                    key: 'date',
                    factor: dateRecord.factor,
                    deltaPercent: dateRecord.deltaPercent,
                },
                {
                    key: 'bargain',
                    factor: bargainRecord.factor,
                    deltaPercent: bargainRecord.deltaPercent,
                },
            ],
            secondGroup: [
                {
                    key: 'metro',
                    factor: metroRecord.factor,
                    deltaPercent: metroRecord.deltaPercent,
                },
                {
                    key: 'area',
                    factor: areaRecord.factor,
                    deltaPercent: areaRecord.deltaPercent,
                },
                {
                    key: 'floor',
                    factor: floorRecord.factor,
                    deltaPercent: floorRecord.deltaPercent,
                },
                {
                    key: 'environment',
                    factor: environmentRecord.factor,
                    deltaPercent: environmentRecord.deltaPercent,
                },
            ],
        },
    };
}

function filterAnalogsBySameClass(questionnaire = {}, analogs = []) {
    const subjectClass = normalizeBusinessCenterClass(
        questionnaire?.businessCenterClass ||
        questionnaire?.objectClass ||
        questionnaire?.marketClassResolved
    );

    const normalizedAnalogs = analogs.map((analog) => ({
        ...analog,
        __normalizedClass: normalizeBusinessCenterClass(analog?.class_offer),
    }));

    if (subjectClass === 'unknown') {
        return {
            selected: normalizedAnalogs,
            excluded: [],
            subjectClass,
            strictClassFilterApplied: false,
        };
    }

    const selected = normalizedAnalogs.filter((analog) => analog.__normalizedClass === subjectClass);
    const excluded = normalizedAnalogs.filter((analog) => analog.__normalizedClass !== subjectClass);

    if (!selected.length) {
        return {
            selected: normalizedAnalogs,
            excluded: [],
            subjectClass,
            strictClassFilterApplied: false,
        };
    }

    return {
        selected,
        excluded,
        subjectClass,
        strictClassFilterApplied: true,
    };
}

function filterAnalogsByRangeLimit(rows = [], limit = 0.30) {
    const working = rows
        .filter((row) => row.includedInRentCalculation !== false)
        .filter((row) => Number.isFinite(toNumber(row.correctedRate, null)) && toNumber(row.correctedRate, 0) > 0)
        .slice()
        .sort((a, b) => toNumber(a.correctedRate, 0) - toNumber(b.correctedRate, 0));

    if (working.length <= 2) {
        return {
            keptRows: working,
            removedRows: [],
            rangeRatio: 0,
        };
    }

    const removedRows = [];

    while (working.length > 2) {
        const min = toNumber(working[0]?.correctedRate, 0);
        const max = toNumber(working.at(-1)?.correctedRate, 0);
        const ratio = min > 0 ? (max - min) / min : 0;

        if (ratio <= limit) {
            return {
                keptRows: working,
                removedRows,
                rangeRatio: ratio,
            };
        }

        const avg = average(working.map((row) => toNumber(row.correctedRate, 0)));
        const lowDiff = Math.abs(min - avg);
        const highDiff = Math.abs(max - avg);

        if (highDiff >= lowDiff) {
            removedRows.push(working.pop());
        } else {
            removedRows.push(working.shift());
        }
    }

    const min = toNumber(working[0]?.correctedRate, 0);
    const max = toNumber(working.at(-1)?.correctedRate, 0);
    const ratio = min > 0 ? (max - min) / min : 0;

    return {
        keptRows: working,
        removedRows,
        rangeRatio: ratio,
    };
}

function buildOutlierRangeCheck(rows = []) {
    const valid = rows
        .map((row) => toNumber(row?.correctedRate, null))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((a, b) => a - b);

    if (!valid.length) {
        return {
            min: null,
            max: null,
            ratio: null,
            withinLimit: false,
        };
    }

    const min = valid[0];
    const max = valid.at(-1);
    const ratio = min > 0 ? (max - min) / min : null;

    return {
        min: round2(min),
        max: round2(max),
        ratio: Number.isFinite(ratio) ? round4(ratio) : null,
        withinLimit: Number.isFinite(ratio)
            ? ratio <= RENT_CONFIG.adjustments.outlierRangeLimit
            : false,
    };
}

function buildQualityScore(includedRows = [], allRows = []) {
    const usedCountFactor = safeDivide(includedRows.length, Math.max(allRows.length, 1), 0);
    const dispersion = buildOutlierRangeCheck(includedRows);
    const dispersionScore = clamp(1 - toNumber(dispersion.ratio, 1), 0, 1);

    return round2(
        average([
            usedCountFactor,
            dispersionScore,
            includedRows.length >= 5 ? 1 : includedRows.length >= 3 ? 0.75 : includedRows.length > 0 ? 0.5 : 0,
        ]) * 100
    );
}

export function calculateMarketRentByNewAlgorithm(analogs = [], questionnaire = {}) {
    const {
        selected: classFiltered,
        excluded: classExcluded,
        subjectClass,
        strictClassFilterApplied,
    } = filterAnalogsBySameClass(questionnaire, analogs);

    const limitedAnalogs = classFiltered.slice(0, RENT_CONFIG.selector.maxAnalogs);

    const preparedRows = limitedAnalogs.map((analog) => {
        const baseRate = toNumber(analog?.price_per_sqm_cleaned, null);

        if (!Number.isFinite(baseRate) || baseRate <= 0) {
            return {
                analogId: analog?.id ?? null,
                externalId: analog?.external_id ?? null,
                address_offer: analog?.address_offer ?? null,
                building_name: analog?.building_name ?? null,
                district: analog?.district ?? null,
                class_offer: analog?.class_offer ?? null,
                offer_date: analog?.offer_date ?? null,
                quarter: analog?.quarter ?? null,
                floor_location: analog?.floor_location ?? null,
                area_total: toNumber(analog?.area_total, null),
                distance_to_metro: toNumber(analog?.distance_to_metro, null),

                rawRate: null,
                baseRate: null,
                afterDate: null,
                afterBargain: null,
                correctedRate: null,
                adjustedRate: null,

                dateAdjustment: 1,
                bargainAdjustment: 1,
                metroAdjustment: 1,
                areaAdjustment: 1,
                floorAdjustment: 1,
                environmentAdjustment: 1,
                firstGroupFactor: 1,
                secondGroupMultiFactor: 1,
                totalAdjustmentFactor: 1,

                adjustments: [],
                adjustmentSummary: null,

                includedInRentCalculation: false,
                includedInCalculation: false,
                exclusionReason: 'Нет корректной очищенной ставки price_per_sqm_cleaned',
                normalizedWeight: 0,
                finalWeight: 0,
            };
        }

        const result = adjustAnalogRateByNewAlgorithm(analog, questionnaire, baseRate);

        return {
            analogId: analog?.id ?? null,
            externalId: analog?.external_id ?? null,
            address_offer: analog?.address_offer ?? null,
            building_name: analog?.building_name ?? null,
            district: analog?.district ?? null,
            class_offer: analog?.class_offer ?? null,
            offer_date: analog?.offer_date ?? null,
            quarter: analog?.quarter ?? analog?.offer_date ?? null,
            floor_location: analog?.floor_location ?? null,
            area_total: toNumber(analog?.area_total, null),
            distance_to_metro: toNumber(analog?.distance_to_metro, null),

            rawRate: result.rawRate,
            baseRate: result.baseRate,
            afterDate: result.afterDate,
            afterBargain: result.afterBargain,
            correctedRate: result.correctedRate,
            adjustedRate: result.correctedRate,

            dateAdjustment: result.dateAdjustment,
            bargainAdjustment: result.bargainAdjustment,
            metroAdjustment: result.metroAdjustment,
            areaAdjustment: result.areaAdjustment,
            floorAdjustment: result.floorAdjustment,
            environmentAdjustment: result.environmentAdjustment,
            firstGroupFactor: result.firstGroupFactor,
            secondGroupMultiFactor: result.secondGroupMultiFactor,
            totalAdjustmentFactor: result.totalAdjustmentFactor,

            adjustments: result.adjustments,
            adjustmentSummary: result.adjustmentSummary,

            includedInRentCalculation: true,
            includedInCalculation: true,
            exclusionReason: null,
            normalizedWeight: 1,
            finalWeight: 1,
        };
    });

    const rowsForRangeFilter = preparedRows.filter(
        (row) => row.includedInRentCalculation !== false
            && Number.isFinite(toNumber(row.correctedRate, null))
            && toNumber(row.correctedRate, 0) > 0
    );

    const rangeFilterResult = filterAnalogsByRangeLimit(
        rowsForRangeFilter,
        RENT_CONFIG.adjustments.outlierRangeLimit
    );

    const keptIds = new Set(rangeFilterResult.keptRows.map((row) => row.analogId));
    const removedIds = new Set(rangeFilterResult.removedRows.map((row) => row.analogId));

    const finalRows = preparedRows.map((row) => {
        if (!Number.isFinite(toNumber(row.correctedRate, null)) || toNumber(row.correctedRate, 0) <= 0) {
            return row;
        }

        if (removedIds.has(row.analogId)) {
            return {
                ...row,
                includedInRentCalculation: false,
                includedInCalculation: false,
                exclusionReason: 'Исключен по правилу диапазона 30%',
                normalizedWeight: 0,
                finalWeight: 0,
            };
        }

        if (keptIds.has(row.analogId)) {
            return {
                ...row,
                includedInRentCalculation: true,
                includedInCalculation: true,
                exclusionReason: null,
            };
        }

        return row;
    });

    const includedRows = finalRows.filter((row) => row.includedInRentCalculation !== false);
    const includedRates = includedRows
        .map((row) => toNumber(row.correctedRate, null))
        .filter((value) => Number.isFinite(value) && value > 0);

    const marketRentFirst = includedRates.length ? round2(average(includedRates)) : 0;
    const marketRentMedian = includedRates.length ? round2(median(includedRates)) : 0;
    const minIncludedRate = includedRates.length ? round2(Math.min(...includedRates)) : 0;
    const maxIncludedRate = includedRates.length ? round2(Math.max(...includedRates)) : 0;
    const stdDev = includedRates.length ? round2(standardDeviation(includedRates)) : 0;
    const q1 = includedRates.length ? percentile(includedRates, 0.25) : null;
    const q3 = includedRates.length ? percentile(includedRates, 0.75) : null;
    const correctedRateIQR = Number.isFinite(q1) && Number.isFinite(q3)
        ? round2(Math.max(0, q3 - q1))
        : null;
    const sampleSizeLevel = getSampleSizeLevel(preparedRows.length);
    const dispersionLevel = includedRates.length
        ? getDispersionLevel({
            medianValue: marketRentMedian,
            stdDev,
            iqr: correctedRateIQR,
        })
        : null;
    const stabilityFlag = includedRates.length
        ? (sampleSizeLevel === 'small' || dispersionLevel === 'high' ? 'unstable' : 'stable')
        : null;

    const outlierRangeCheck = buildOutlierRangeCheck(includedRows);
    const qualityScore = buildQualityScore(includedRows, preparedRows);
    const analogsInitialCount = preparedRows.length;
    const analogsUsedCount = includedRows.length;
    const analogsExcludedCount = finalRows.filter((row) => row.includedInRentCalculation === false).length;

    return {
        algorithm: 'market_rent_word_strict_v1',

        marketRentFirst,
        marketRentSecond: round2(marketRentFirst * 1.03),
        marketRentThirdPlus: round2(marketRentFirst * 0.98),

        marketRentMedian,
        simpleAverageRate: marketRentFirst,
        simpleMedianRate: marketRentMedian,
        trimmedMeanRate: marketRentFirst,
        averageAdjustedRate: marketRentFirst,
        selectedAverageRate: marketRentFirst,
        minAdjustedRate: includedRates.length ? minIncludedRate : null,
        maxAdjustedRate: includedRates.length ? maxIncludedRate : null,

        rows: finalRows,
        analogsProcessed: finalRows,
        selectedAnalogs: includedRows,
        excludedAnalogs: [
            ...classExcluded.map((analog) => ({
                analogId: analog?.id ?? null,
                externalId: analog?.external_id ?? null,
                address_offer: analog?.address_offer ?? null,
                exclusionReason: strictClassFilterApplied
                    ? `Класс аналога (${analog?.class_offer ?? 'unknown'}) не совпадает с классом объекта (${subjectClass})`
                    : 'Исключен из выборки',
            })),
            ...finalRows
                .filter((row) => row.includedInRentCalculation === false && row.exclusionReason)
                .map((row) => ({
                    analogId: row.analogId,
                    externalId: row.externalId,
                    address_offer: row.address_offer,
                    exclusionReason: row.exclusionReason,
                })),
        ],

        adjustedRates: finalRows,
        analogCount: preparedRows.length,
        selectedCount: includedRows.length,
        excludedCount: analogsExcludedCount,
        totalCount: preparedRows.length,
        analogsInitialCount,
        analogsUsedCount,
        analogsExcludedCount,
        correctedRateMin: includedRates.length ? minIncludedRate : null,
        correctedRateMedian: includedRates.length ? marketRentMedian : null,
        correctedRateMax: includedRates.length ? maxIncludedRate : null,
        correctedRateStdDev: includedRates.length ? stdDev : null,
        correctedRateIQR,
        dispersionLevel,
        sampleSizeLevel,
        stabilityFlag,

        outlierRangeCheck: {
            ...outlierRangeCheck,
            removedCount: rangeFilterResult.removedRows.length,
            rangeLimit: RENT_CONFIG.adjustments.outlierRangeLimit,
        },

        stats: {
            count: includedRows.length,
            min: minIncludedRate,
            max: maxIncludedRate,
            avg: marketRentFirst,
            median: marketRentMedian,
            stdDev,
        },

        qualityScore,
        subjectClass,
        strictClassFilterApplied,
    };
}
