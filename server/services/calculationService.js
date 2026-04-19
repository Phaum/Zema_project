import { mahalanobisDistance } from '../utils/mahalanobis.js';
import { toNumber } from '../utils/dataValidation.js';
import { CadastralData } from '../models/index.js';
import { calculateMarketRentByNewAlgorithm } from './rentCalculationService.js';

const EXCEL_PARITY_CONFIG = {
    selector: {
        maxAnalogs: 10,
        areaMinFactor: 0.35,
        areaMaxFactor: 3,
    },
    adjustments: {
        marketConditionMultiplier: 0.95,
        dateAdjustmentBins: [
            { monthsTo: 3, value: 0.01 },
            { monthsTo: 6, value: 0.07 },
            { monthsTo: 12, value: 0.18 },
        ],
        floorCoefficients: {
            first: 1.0,
            second: 1.03,
            third_plus: 0.98,
            basement: 0.88,
            underground: 0.88,
        },
    },
    valuation: {
        opexRate: 0.21,
        capitalizationRate: 0.10,
        floor2Multiplier: 1.03,
        floor3PlusMultiplier: 0.98,
        defaultVacancyRate: 0.09,
    },
};

const CAPITALIZATION_RATE_BY_CLASS = {
    'A+': 0.09,
    A: 0.095,
    'B+': 0.10,
    B: 0.105,
    C: 0.11,
    unknown: 0.10,
};

const VACANCY_RATE_BY_CLASS = {
    'A+': 0.07,
    A: 0.08,
    'B+': 0.09,
    B: 0.10,
    C: 0.12,
    unknown: 0.09,
};

const OPEX_RATE_BY_CLASS = {
    'A+': 0.18,
    A: 0.19,
    'B+': 0.21,
    B: 0.23,
    C: 0.25,
    unknown: 0.22,
};

const QUARTER_MARKET_PROFILE_BY_PERIOD = {
    '2025-Q1': {
        capitalizationRate: 0.10,
        vacancyRate: 0.09,
        opexRate: 0.21,
    },
    '2025-Q2': {
        capitalizationRate: 0.10,
        vacancyRate: 0.11,
        opexRate: 0.21,
    },
    '2025-Q3': {
        capitalizationRate: 0.12,
        vacancyRate: 0.14,
        opexRate: 0.26,
    },
    '2025-Q4': {
        capitalizationRate: 0.10,
        vacancyRate: 0.14,
        opexRate: 0.25,
    },
    '2026-Q1': {
        capitalizationRate: 0.08,
        vacancyRate: 0.14,
        opexRate: 0.24,
    },
};

const CLASS_ORDER = {
    unknown: 0,
    C: 1,
    B: 2,
    'B+': 3,
    A: 4,
    'A+': 5,
};

const MIN_RELEVANCE_SCORE = 0.45;
const MIN_COMPLETENESS_SCORE = 0.35;
const SCALE_ADJUSTMENT_POWER = -0.10;
const RENT_GUARDRAIL_MULTIPLIER = 1.15;
const DEFAULT_RENT_SELECTION_MODE = 'stable_default';
const SMALL_SAMPLE_THRESHOLD = 7;
const STABLE_TRIM_RATIO = 0.10;
const MAX_ABSOLUTE_RENT_ADJUSTMENT = 0.25;

const CENTRAL_DISTRICT_KEYS = new Set([
    'центральный',
    'адмиралтейский',
    'петроградский',
    'василеостровский',
]);

const OUTER_DISTRICT_KEYS = new Set([
    'колпинский',
    'красносельский',
    'кронштадтский',
    'курортный',
    'петродворцовый',
    'пушкинский',
]);

const SLEEPING_DISTRICT_KEYS = new Set([
    'выборгский',
    'калининский',
    'кировский',
    'красногвардейский',
    'московский',
    'невский',
    'приморский',
    'фрунзенский',
]);

function average(values = []) {
    const arr = values.map(Number).filter(Number.isFinite);
    if (!arr.length) return 0;
    return arr.reduce((sum, value) => sum + value, 0) / arr.length;
}

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

function percentile(values = [], ratio = 0.5) {
    const arr = values
        .map((value) => Number(value))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

    if (!arr.length) return null;
    if (arr.length === 1) return arr[0];

    const index = clamp(ratio, 0, 1) * (arr.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
        return arr[lower];
    }

    const weight = index - lower;
    return arr[lower] + ((arr[upper] - arr[lower]) * weight);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function round2(value) {
    return Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

function safeDivide(numerator, denominator, fallback = 0) {
    const num = toNumber(numerator, null);
    const den = toNumber(denominator, null);

    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
        return fallback;
    }

    return num / den;
}

export function normalizeMetroDistanceKm(value) {
    const distance = toNumber(value, null);

    if (!Number.isFinite(distance) || distance <= 0) {
        return null;
    }

    if (distance > 25) {
        return distance / 1000;
    }

    return distance;
}

function weightedAverage(items = [], valueKey = 'adjustedRate', weightKey = 'normalizedWeight') {
    const rows = items.filter((item) => (
        Number.isFinite(toNumber(item?.[valueKey], null)) &&
        Number.isFinite(toNumber(item?.[weightKey], null)) &&
        toNumber(item?.[weightKey], 0) > 0
    ));

    if (!rows.length) return null;

    const totalWeight = rows.reduce((sum, item) => sum + toNumber(item[weightKey], 0), 0);
    if (!totalWeight) return null;

    return rows.reduce(
        (sum, item) => sum + (toNumber(item[valueKey], 0) * toNumber(item[weightKey], 0)),
        0
    ) / totalWeight;
}

function weightedMedian(items = [], valueKey = 'adjustedRate', weightKey = 'normalizedWeight') {
    const rows = items
        .filter((item) => (
            Number.isFinite(toNumber(item?.[valueKey], null)) &&
            Number.isFinite(toNumber(item?.[weightKey], null)) &&
            toNumber(item?.[weightKey], 0) > 0
        ))
        .sort((a, b) => toNumber(a?.[valueKey], 0) - toNumber(b?.[valueKey], 0));

    if (!rows.length) return null;

    const totalWeight = rows.reduce((sum, item) => sum + toNumber(item[weightKey], 0), 0);
    if (!totalWeight) return null;

    let cumulativeWeight = 0;
    for (const row of rows) {
        cumulativeWeight += toNumber(row[weightKey], 0);
        if (cumulativeWeight >= (totalWeight / 2)) {
            return toNumber(row[valueKey], null);
        }
    }

    return toNumber(rows.at(-1)?.[valueKey], null);
}

function trimmedValues(values = [], trimRatio = STABLE_TRIM_RATIO) {
    const arr = values
        .map((value) => Number(value))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

    if (!arr.length) return [];
    if (arr.length < SMALL_SAMPLE_THRESHOLD) return arr;

    const trimCount = Math.max(1, Math.floor(arr.length * trimRatio));
    if ((trimCount * 2) >= arr.length) {
        return arr;
    }

    return arr.slice(trimCount, arr.length - trimCount);
}

function trimmedMean(values = [], trimRatio = STABLE_TRIM_RATIO) {
    const arr = trimmedValues(values, trimRatio);
    return arr.length ? average(arr) : null;
}

function resolveRentCalculationMode(questionnaire = {}) {
    const rawMode = String(
        questionnaire?.rentCalculationMode ||
        questionnaire?.rentalRateMode ||
        questionnaire?.rentalSelectionMode ||
        questionnaire?.marketRentMode ||
        ''
    )
        .trim()
        .toLowerCase();

    if (['excel_compatible', 'stable_default', 'advanced_experimental'].includes(rawMode)) {
        return rawMode;
    }

    return DEFAULT_RENT_SELECTION_MODE;
}

function getTrimCount(count, trimRatio = STABLE_TRIM_RATIO) {
    if (count < SMALL_SAMPLE_THRESHOLD) return 0;
    return Math.max(1, Math.floor(count * trimRatio));
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

function isStableMarketProfileAvailable(questionnaire = {}) {
    const normalizedClass = normalizeBusinessCenterClass(
        questionnaire?.marketClassResolved ||
        questionnaire?.businessCenterClass ||
        questionnaire?.objectClass
    );

    return normalizedClass !== 'unknown';
}

function normalizeComparableText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/район/gi, '')
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function encodeDistrictGroup(value) {
    const normalized = normalizeComparableText(value);

    if (!normalized) return 0;
    if (CENTRAL_DISTRICT_KEYS.has(normalized)) return 1;
    if (SLEEPING_DISTRICT_KEYS.has(normalized)) return 2;
    if (OUTER_DISTRICT_KEYS.has(normalized)) return 3;
    return 0;
}

export function encodeTerritorialZoneCategory(value) {
    const normalized = String(value || '')
        .trim()
        .toUpperCase();

    if (!normalized) return 0;

    if (normalized.startsWith('ТЖ')) return 1;
    if (
        normalized.startsWith('ТП') ||
        normalized.startsWith('ТИ') ||
        normalized.startsWith('ТТИ')
    ) {
        return 2;
    }
    if (
        normalized.startsWith('ТД') ||
        normalized.startsWith('ТСМ')
    ) {
        return 3;
    }

    return 0;
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

function resolveDistrictBucket(value) {
    const normalized = normalizeComparableText(value);

    if (!normalized) return 'neutral';
    if (CENTRAL_DISTRICT_KEYS.has(normalized)) return 'central';
    if (OUTER_DISTRICT_KEYS.has(normalized)) return 'outer';
    return 'neutral';
}

function resolveValuationYear(value) {
    return parseYear(value) || 0;
}

function resolveValuationDateParts(value) {
    if (!value) {
        return null;
    }

    const normalized = String(value).trim();
    if (!normalized) {
        return null;
    }

    let match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
        return {
            year: Number(match[1]),
            month: Number(match[2]),
            day: Number(match[3]),
        };
    }

    match = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (match) {
        return {
            year: Number(match[3]),
            month: Number(match[2]),
            day: Number(match[1]),
        };
    }

    match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
        return {
            year: Number(match[3]),
            month: Number(match[2]),
            day: Number(match[1]),
        };
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return {
        year: parsed.getFullYear(),
        month: parsed.getMonth() + 1,
        day: parsed.getDate(),
    };
}

function resolveValuationQuarterKey(value) {
    const parts = resolveValuationDateParts(value);
    const year = Number(parts?.year);
    const month = Number(parts?.month);

    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return null;
    }

    return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

function humanizeQuarterKey(value) {
    const match = String(value || '').match(/^(\d{4})-Q([1-4])$/);
    if (!match) {
        return null;
    }

    return `${match[2]} кв. ${match[1]}`;
}

function resolveQuarterMarketProfile(questionnaire = {}) {
    const key = resolveValuationQuarterKey(questionnaire?.valuationDate);
    const profile = key ? QUARTER_MARKET_PROFILE_BY_PERIOD[key] || null : null;

    return {
        key,
        label: humanizeQuarterKey(key),
        profile,
    };
}

function sumAdjustments(items = []) {
    return items.reduce((sum, item) => sum + toNumber(item?.value, 0), 0);
}

function clampProfileRate(value, min = 0.06, max = 0.14) {
    return clamp(value, min, max);
}

function truncateTo(value, digits = 0) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return 0;
    }

    const factor = 10 ** digits;
    return Math.trunc(numeric * factor) / factor;
}

function standardDeviation(values = []) {
    const arr = values
        .map((value) => Number(value))
        .filter(Number.isFinite);

    if (!arr.length) return 0;

    const mean = average(arr);
    const variance = average(arr.map((value) => ((value - mean) ** 2)));
    return Math.sqrt(Math.max(variance, 0));
}

function medianAbsoluteDeviation(values = []) {
    const arr = values
        .map((value) => Number(value))
        .filter(Number.isFinite);

    if (!arr.length) return 0;

    const med = median(arr);
    if (!Number.isFinite(med)) return 0;

    const deviations = arr.map((value) => Math.abs(value - med));
    return median(deviations) || 0;
}

function getClassStepDifference(subjectClass, analogClass) {
    return (CLASS_ORDER[subjectClass] || 0) - (CLASS_ORDER[analogClass] || 0);
}

function getLocationQualityScore({ district, environment, isHistoricalCenter }) {
    let score = 1;
    const bucket = resolveDistrictBucket(district);
    const environmentScore = calculateEnvironmentScore(environment);
    const historicalCenterFlag = encodeBooleanLike(isHistoricalCenter) === 1;

    if (bucket === 'central') {
        score += 0.05;
    } else if (bucket === 'outer') {
        score -= 0.04;
    }

    if (historicalCenterFlag) {
        score += 0.03;
    }

    if (environmentScore !== null) {
        score += clamp((environmentScore - 0.78) * 0.18, -0.04, 0.04);
    }

    return clamp(score, 0.9, 1.12);
}

function clampFactor(value, min, max) {
    return clamp(Number.isFinite(Number(value)) ? Number(value) : 1, min, max);
}

function round4(value) {
    return Math.round((toNumber(value, 0) + Number.EPSILON) * 10000) / 10000;
}

function getSubjectScaleArea(subjectLike = {}) {
    const totalArea = toNumber(subjectLike?.totalArea, null);
    if (Number.isFinite(totalArea) && totalArea > 0) {
        return totalArea;
    }

    return getCalculationArea(subjectLike);
}

function getAreaRatio(subjectArea, analogArea) {
    const normalizedSubjectArea = toNumber(subjectArea, null);
    const normalizedAnalogArea = toNumber(analogArea, null);

    if (!normalizedSubjectArea || !normalizedAnalogArea || normalizedSubjectArea <= 0 || normalizedAnalogArea <= 0) {
        return null;
    }

    return Math.max(normalizedSubjectArea, normalizedAnalogArea) / Math.max(Math.min(normalizedSubjectArea, normalizedAnalogArea), 1);
}

function getSubjectToAnalogAreaRatio(subjectArea, analogArea) {
    const normalizedSubjectArea = toNumber(subjectArea, null);
    const normalizedAnalogArea = toNumber(analogArea, null);

    if (!normalizedSubjectArea || !normalizedAnalogArea || normalizedSubjectArea <= 0 || normalizedAnalogArea <= 0) {
        return null;
    }

    return normalizedSubjectArea / normalizedAnalogArea;
}

function getScaleSimilarityScore(subjectArea, analogArea) {
    const ratio = getAreaRatio(subjectArea, analogArea);

    if (!Number.isFinite(ratio) || ratio <= 0) return 0.3;
    if (ratio <= 1.5) return 1.0;
    if (ratio <= 2) return 0.9;
    if (ratio <= 3) return 0.75;
    if (ratio <= 5) return 0.55;
    if (ratio <= 10) return 0.35;
    return 0.2;
}

function getScaleWeightPenalty(subjectArea, analogArea) {
    const ratio = getAreaRatio(subjectArea, analogArea);

    if (!Number.isFinite(ratio) || ratio <= 0) return 0.7;
    if (ratio <= 1.5) return 1.0;
    if (ratio <= 2) return 0.9;
    if (ratio <= 3) return 0.75;
    if (ratio <= 5) return 0.55;
    if (ratio <= 10) return 0.35;
    return 0.2;
}

function calculateSizeSimilarity(subjectArea, analogArea) {
    const subject = toNumber(subjectArea, null);
    const analog = toNumber(analogArea, null);

    if (!Number.isFinite(subject) || !Number.isFinite(analog) || subject <= 0 || analog <= 0) {
        return 0.7;
    }

    return clamp(Math.min(subject, analog) / Math.max(subject, analog), 0, 1);
}

function calculateEnvironmentSimilarity(questionnaire, analog) {
    const subjectScore = calculateEnvironmentScore(resolveQuestionnaireEnvironment(questionnaire));
    const analogScore = calculateEnvironmentScore(resolveAnalogEnvironment(analog));

    if (subjectScore === null && analogScore === null) return 0.72;
    if (subjectScore === null || analogScore === null) return 0.68;

    const relativeDifference = Math.abs(subjectScore - analogScore) / Math.max(subjectScore, analogScore, 0.1);
    return clamp(1 - (relativeDifference * 0.8), 0.55, 1);
}

function calculateHistoricalCenterSimilarity(questionnaire, analog) {
    const subject = encodeBooleanLike(resolveQuestionnaireHistoricalCenter(questionnaire));
    const comparable = encodeBooleanLike(resolveAnalogHistoricalCenter(analog));

    if (subject === comparable) return 1;
    return 0.72;
}

function normalizeSegmentType(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/ё/g, 'е');

    if (!normalized) return 'unknown';

    if (normalized.includes('торгов') || normalized.includes('трк') || normalized.includes('retail')) {
        return 'retail';
    }

    if (
        normalized.includes('бизнес') ||
        normalized.includes('офис') ||
        normalized.includes('административ') ||
        normalized.includes('office')
    ) {
        return 'office';
    }

    if (normalized.includes('склад') || normalized.includes('industrial')) {
        return 'industrial';
    }

    return 'unknown';
}

function resolveSubjectSegment(questionnaire) {
    return normalizeSegmentType(
        questionnaire?.actualUse ||
        questionnaire?.objectType ||
        questionnaire?.segment ||
        null
    );
}

function resolveAnalogSegment(analog) {
    return normalizeSegmentType(
        analog?.segment ||
        analog?.source_type ||
        analog?.building_name ||
        analog?.address_offer ||
        null
    );
}

function calculateSegmentSimilarity(questionnaire, analog) {
    const subjectSegment = resolveSubjectSegment(questionnaire);
    const analogSegment = resolveAnalogSegment(analog);

    if (subjectSegment === 'unknown' && analogSegment === 'unknown') return 0.72;
    if (subjectSegment === 'unknown' || analogSegment === 'unknown') return 0.76;
    if (subjectSegment === analogSegment) return 1;
    return 0.55;
}

function calculateLocationSimilarity(questionnaire, analog) {
    const districtSimilarity = calculateDistrictWeight(questionnaire, analog);
    const environmentSimilarity = calculateEnvironmentSimilarity(questionnaire, analog);
    const historicalSimilarity = calculateHistoricalCenterSimilarity(questionnaire, analog);

    return clamp(
        (districtSimilarity * 0.55) +
        (environmentSimilarity * 0.30) +
        (historicalSimilarity * 0.15),
        0.45,
        1
    );
}

function getSignedMonthsDifference(offerDate, valuationDate, offerQuarter = null) {
    const offerQuarterIndex = getQuarterIndex(offerQuarter || offerDate);
    const valuationQuarterIndex = getQuarterIndex(valuationDate);

    if (offerQuarterIndex !== null && valuationQuarterIndex !== null) {
        return (valuationQuarterIndex - offerQuarterIndex) * 3;
    }

    if (!offerDate || !valuationDate) return null;

    const offer = new Date(offerDate);
    const valuation = new Date(valuationDate);

    if (Number.isNaN(offer.getTime()) || Number.isNaN(valuation.getTime())) {
        return null;
    }

    return (valuation - offer) / (1000 * 60 * 60 * 24 * 30);
}

function createAdjustmentRecord(key, label, factor, reasoning, details = {}) {
    const normalizedFactor = clampFactor(factor, 0, Number.MAX_SAFE_INTEGER);

    return {
        key,
        label,
        factor: normalizedFactor,
        deltaPercent: round2((normalizedFactor - 1) * 100),
        reasoning,
        details,
    };
}

function calculateTimeAdjustmentRecord(analog, questionnaire) {
    const signedMonthsDiff = getSignedMonthsDifference(
        analog?.offer_date,
        questionnaire?.valuationDate,
        analog?.quarter
    );

    if (!Number.isFinite(signedMonthsDiff)) {
        return createAdjustmentRecord('time', 'Дата', 1, 'Нет сопоставимых дат для временной корректировки');
    }

    const monthlyTrend = 0.0035;
    const factor = clampFactor(1 + (signedMonthsDiff * monthlyTrend), 0.90, 1.10);

    return createAdjustmentRecord(
        'time',
        'Дата',
        factor,
        'Корректировка по временному лагу между датой оценки и датой предложения',
        {
            monthsDiff: round2(signedMonthsDiff),
            monthlyTrend,
        }
    );
}

function calculateSizeAdjustmentRecord(questionnaire, analog) {
    const subjectArea = getCalculationArea(questionnaire);
    const analogArea = toNumber(analog?.area_total, null);

    if (!Number.isFinite(subjectArea) || !Number.isFinite(analogArea) || subjectArea <= 0 || analogArea <= 0) {
        return createAdjustmentRecord('size', 'Площадь', 1, 'Недостаточно данных по площади для корректировки');
    }

    const sizeElasticity = 0.12;
    const sizeRatio = subjectArea / analogArea;
    const factor = clampFactor(Math.pow(sizeRatio, sizeElasticity), 0.90, 1.10);

    return createAdjustmentRecord(
        'size',
        'Площадь',
        factor,
        'Сглаженная корректировка на различие в размере объекта и аналога',
        {
            subjectArea: round2(subjectArea),
            analogArea: round2(analogArea),
            sizeElasticity,
        }
    );
}

function calculateMetroAdjustmentRecord(questionnaire, analog) {
    const subjectDistance = normalizeMetroDistanceKm(questionnaire?.metroDistance);
    const analogDistance = normalizeMetroDistanceKm(analog?.distance_to_metro);

    if (!Number.isFinite(subjectDistance) || !Number.isFinite(analogDistance)) {
        return createAdjustmentRecord('metro', 'Метро', 1, 'Нет сопоставимых данных по удаленности от метро');
    }

    const deltaKm = analogDistance - subjectDistance;
    const factor = clampFactor(1 + (deltaKm * 0.05), 0.92, 1.08);

    return createAdjustmentRecord(
        'metro',
        'Метро',
        factor,
        'Мягкая корректировка на различие в удаленности от метро',
        {
            subjectDistanceKm: round2(subjectDistance),
            analogDistanceKm: round2(analogDistance),
            deltaKm: round2(deltaKm),
        }
    );
}

function calculateClassAdjustmentRecord(questionnaire, analog) {
    const subjectClass = normalizeBusinessCenterClass(
        questionnaire?.marketClassResolved ||
        questionnaire?.businessCenterClass ||
        questionnaire?.objectClass
    );
    const analogClass = normalizeBusinessCenterClass(analog?.class_offer);

    if (subjectClass === 'unknown' || analogClass === 'unknown') {
        return createAdjustmentRecord('class', 'Класс', 1, 'Недостаточно данных по классу объекта или аналога');
    }

    const stepDiff = getClassStepDifference(subjectClass, analogClass);
    const factor = clampFactor(1 + (stepDiff * 0.04), 0.90, 1.10);

    return createAdjustmentRecord(
        'class',
        'Класс',
        factor,
        'Корректировка на различие в классе качества объекта и аналога',
        {
            subjectClass,
            analogClass,
            stepDiff,
        }
    );
}

function calculateLocationAdjustmentRecord(questionnaire, analog) {
    const subjectScore = getLocationQualityScore({
        district: questionnaire?.district,
        environment: resolveQuestionnaireEnvironment(questionnaire),
        isHistoricalCenter: resolveQuestionnaireHistoricalCenter(questionnaire),
    });
    const analogScore = getLocationQualityScore({
        district: analog?.district,
        environment: resolveAnalogEnvironment(analog),
        isHistoricalCenter: resolveAnalogHistoricalCenter(analog),
    });

    if (!Number.isFinite(subjectScore) || !Number.isFinite(analogScore) || analogScore <= 0) {
        return createAdjustmentRecord('location', 'Локация', 1, 'Недостаточно данных о локации и окружении');
    }

    const factor = clampFactor(subjectScore / analogScore, 0.93, 1.07);

    return createAdjustmentRecord(
        'location',
        'Локация',
        factor,
        'Корректировка на район, исторический центр и качество окружения',
        {
            subjectLocationScore: round2(subjectScore),
            analogLocationScore: round2(analogScore),
        }
    );
}

function calculateYearConditionAdjustmentRecord(questionnaire, analog) {
    const subjectYear = parseYear(questionnaire?.constructionYear);
    const analogYear = parseYear(analog?.year_built_commissioning);

    if (!subjectYear || !analogYear) {
        return createAdjustmentRecord('condition_year', 'Возраст/состояние', 1, 'Нет сопоставимых данных по году постройки');
    }

    const yearDiff = subjectYear - analogYear;
    const factor = clampFactor(1 + (yearDiff * 0.002), 0.95, 1.07);

    return createAdjustmentRecord(
        'condition_year',
        'Возраст/состояние',
        factor,
        'Мягкая корректировка на различие в возрасте и вероятном состоянии зданий',
        {
            subjectYear,
            analogYear,
            yearDiff,
        }
    );
}

function calculateFloorAdjustmentRecord(questionnaire, analog) {
    const factor = getFloorAdjustment(
        getQuestionnaireReferenceFloorCategory(questionnaire),
        parseFloorCategory(analog?.floor_location)
    );

    return createAdjustmentRecord(
        'floor',
        'Этаж',
        clampFactor(factor, 0.88, 1.12),
        'Корректировка на этажную группу предложения'
    );
}

export function resolveCapitalizationRateProfile(questionnaire, selectedAnalogs = [], context = {}) {
    const marketProfile = resolveQuarterMarketProfile(questionnaire);
    const normalizedClass = normalizeBusinessCenterClass(
        questionnaire?.marketClassResolved ||
        questionnaire?.businessCenterClass ||
        questionnaire?.objectClass
    );
    const districtBucket = resolveDistrictBucket(questionnaire?.district);
    const valuationYear = resolveValuationYear(questionnaire?.valuationDate);
    const comparableCount = toNumber(
        context?.marketRentAnalysis?.includedCount,
        Array.isArray(selectedAnalogs) ? selectedAnalogs.length : 0
    );
    const environmentScore = calculateEnvironmentScore(resolveQuestionnaireEnvironment(questionnaire));
    const baseRate = toNumber(
        marketProfile.profile?.capitalizationRate,
        EXCEL_PARITY_CONFIG.valuation.capitalizationRate
    );

    return {
        rate: baseRate,
        baseRate,
        adjustments: [],
        source: 'quarter_profile',
        sourceLabel: marketProfile.label
            ? `Квартальный рыночный профиль капитализации (${marketProfile.label})`
            : 'Квартальный рыночный профиль капитализации',
        normalizedClass,
        districtBucket,
        valuationYear,
        comparableCount,
        comparableQuality: null,
        historicalCenterFlag: encodeBooleanLike(resolveQuestionnaireHistoricalCenter(questionnaire)) === 1,
        environmentScore,
        profileQuarterKey: marketProfile.key,
        profileQuarterLabel: marketProfile.label,
    };
}

export function resolveVacancyRateProfile(questionnaire, context = {}) {
    const marketProfile = resolveQuarterMarketProfile(questionnaire);
    const normalizedClass = normalizeBusinessCenterClass(
        questionnaire?.marketClassResolved ||
        questionnaire?.businessCenterClass ||
        questionnaire?.objectClass
    );
    const districtBucket = resolveDistrictBucket(questionnaire?.district);
    const valuationYear = resolveValuationYear(questionnaire?.valuationDate);
    const actualVacancyRate = toNumber(context?.actualVacancyRate, null);
    const marketRate = clamp(
        toNumber(marketProfile.profile?.vacancyRate, EXCEL_PARITY_CONFIG.valuation.defaultVacancyRate),
        0,
        1
    );

    if (Number.isFinite(actualVacancyRate) && actualVacancyRate >= 0 && actualVacancyRate < marketRate) {
        return {
            rate: clamp(actualVacancyRate, 0, 1),
            baseRate: marketRate,
            adjustments: [],
            source: 'factual',
            sourceLabel: marketProfile.label
                ? `Фактическая незаполняемость ниже квартального рыночного профиля (${marketProfile.label})`
                : 'Фактическая незаполняемость ниже квартального рыночного профиля',
            normalizedClass,
            districtBucket,
            valuationYear,
            environmentScore: calculateEnvironmentScore(resolveQuestionnaireEnvironment(questionnaire)),
            historicalCenterFlag: encodeBooleanLike(resolveQuestionnaireHistoricalCenter(questionnaire)) === 1,
            profileQuarterKey: marketProfile.key,
            profileQuarterLabel: marketProfile.label,
        };
    }

    return {
        rate: marketRate,
        baseRate: marketRate,
        adjustments: [],
        source: 'quarter_profile',
        sourceLabel: marketProfile.label
            ? `Квартальный рыночный профиль незаполняемости (${marketProfile.label})`
            : 'Квартальный рыночный профиль незаполняемости',
        normalizedClass,
        districtBucket,
        valuationYear,
        environmentScore: calculateEnvironmentScore(resolveQuestionnaireEnvironment(questionnaire)),
        historicalCenterFlag: encodeBooleanLike(resolveQuestionnaireHistoricalCenter(questionnaire)) === 1,
        profileQuarterKey: marketProfile.key,
        profileQuarterLabel: marketProfile.label,
    };
}

function hashDistrict(district) {
    const normalized = normalizeComparableText(district);
    if (!normalized) return 0;

    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
        hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
        hash |= 0;
    }

    return Math.abs(hash);
}

function hashZone(zone) {
    const normalized = normalizeComparableText(zone);
    if (!normalized) return 0;

    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
        hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
        hash |= 0;
    }

    return Math.abs(hash);
}

function parseYear(value) {
    const match = String(value || '').match(/\d{4}/);
    return match ? Number(match[0]) : 0;
}

function resolveQuestionnaireConstructionYear(questionnaire = {}) {
    return parseYear(
        questionnaire?.constructionYear ??
        questionnaire?.construction_year ??
        questionnaire?.yearBuilt ??
        questionnaire?.year_built ??
        questionnaire?.commissioningYear ??
        questionnaire?.year_commissioning ??
        0
    );
}

function parseFloorCategory(value) {
    const s = String(value || '').toLowerCase();

    if (s === 'underground') return 'underground';
    if (s === 'basement') return 'basement';
    if (s === 'first') return 'first';
    if (s === 'second') return 'second';
    if (s === 'third_plus' || s === 'third-plus' || s === 'third plus') return 'third_plus';
    if (s.includes('подвал') || s.includes('underground')) return 'underground';
    if (s.includes('цокол') || s.includes('basement')) return 'basement';
    if (s.includes('перв') || s === '1' || s.includes('1 этаж')) return 'first';
    if (s.includes('втор') || s === '2' || s.includes('2 этаж')) return 'second';
    return 'third_plus';
}

function toPlainComparable(analog) {
    if (!analog) return {};

    if (typeof analog.toJSON === 'function') {
        return analog.toJSON();
    }

    if (analog.dataValues && typeof analog.dataValues === 'object') {
        return { ...analog.dataValues };
    }

    return { ...analog };
}

function getFloorCoefficientByCategory(category) {
    const normalized = parseFloorCategory(category);
    return EXCEL_PARITY_CONFIG.adjustments.floorCoefficients[normalized] || 0.88;
}

function encodeFloorCategory(category) {
    const normalized = parseFloorCategory(category);
    if (normalized === 'first') return 1;
    if (normalized === 'second') return 2;
    if (normalized === 'third_plus') return 3;
    if (normalized === 'basement') return -1;
    if (normalized === 'underground') return -2;
    return 0;
}

export function encodeFloorCategoryForMahalanobis(category) {
    const normalized = parseFloorCategory(category);
    if (normalized === 'underground') return 1;
    if (normalized === 'basement') return 2;
    if (normalized === 'first') return 3;
    if (normalized === 'second') return 4;
    if (normalized === 'third_plus') return 5;
    return 0;
}

function encodeBooleanLike(value) {
    if (value === true) return 1;
    if (value === false) return 0;

    const s = String(value || '').trim().toLowerCase();
    if (['1', 'true', 'да', 'yes'].includes(s)) return 1;
    if (['0', 'false', 'нет', 'no'].includes(s)) return 0;
    return 0;
}

function getFloorAdjustment(objectCategory, analogCategory) {
    return (
        getFloorCoefficientByCategory(objectCategory) /
        getFloorCoefficientByCategory(analogCategory)
    );
}

function getQuestionnaireReferenceFloorCategory(questionnaire) {
    const explicitCategory = questionnaire?.referenceFloorCategory;
    if (explicitCategory) {
        return parseFloorCategory(explicitCategory);
    }

    const floors = Array.isArray(questionnaire?.floors) ? questionnaire.floors : [];
    const firstNonEmpty = floors.find((floor) => toNumber(floor?.leasableArea, 0) > 0);

    if (firstNonEmpty?.floorCategory || firstNonEmpty?.floorLocation || firstNonEmpty?.label) {
        return parseFloorCategory(
            firstNonEmpty.floorCategory ||
            firstNonEmpty.floorLocation ||
            firstNonEmpty.label
        );
    }

    return 'first';
}

// function mapEnvironmentTokenToCoefficient(value) {
//     if (value === undefined || value === null || value === '') {
//         return null;
//     }

//     const numeric = toNumber(value, null);
//     if (numeric !== null && Number.isFinite(numeric)) {
//         return numeric;
//     }

//     const s = String(value).toLowerCase();

//     if (s.includes('пром')) return 0.62;
//     if (s.includes('обществен') || s.includes('делов')) return 0.89;
//     if (s.includes('жил')) return 0.8;

//     return null;
// }

function mapEnvironmentTokenToCoefficient(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const numeric = toNumber(value, null);
    if (numeric !== null && Number.isFinite(numeric)) {
        return numeric;
    }

    const normalized = String(value)
        .trim()
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ');

    if (!normalized || normalized === '0') return null;

    if (normalized.includes('культур') || normalized.includes('истор')) return 1.00;
    if (normalized.includes('делов')) return 0.91;
    if (normalized.includes('многоквартир')) return 0.83;
    if (normalized.includes('среднеэтаж')) return 0.80;
    if (normalized.includes('пром')) return 0.61;
    if (normalized.includes('автомагистра')) return 0.79;

    return null;
}

function calculateEnvironmentScore(values = []) {
    const scores = values
        .map(mapEnvironmentTokenToCoefficient)
        .filter((value) => Number.isFinite(value) && value > 0);

    if (!scores.length) return null;
    return average(scores);
}

function getEnvironmentAdjustment(objectEnvironment, analogEnvironment) {
    const objectScore = calculateEnvironmentScore(objectEnvironment);
    const analogScore = calculateEnvironmentScore(analogEnvironment);

    if (!objectScore || !analogScore) return 1;
    return objectScore / analogScore;
}

function resolveQuestionnaireZone(questionnaire) {
    return (
        questionnaire?.zoneCode ||
        questionnaire?.zone_code ||
        questionnaire?.terZone ||
        questionnaire?.ter_zone ||
        null
    );
}

function resolveAnalogZone(analog) {
    return (
        analog?.zone_code ||
        analog?.ter_zone ||
        analog?.source_sheet_name ||
        null
    );
}

// function resolveQuestionnaireEnvironment(questionnaire) {
//     return [
//         questionnaire?.environmentCategory1,
//         questionnaire?.environmentCategory2,
//         questionnaire?.environmentCategory3,
//         questionnaire?.environmentIndustrial,
//         questionnaire?.environmentBusiness,
//         questionnaire?.environmentResidential,
//     ];
// }

function resolveQuestionnaireEnvironment(questionnaire) {
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

// function resolveAnalogEnvironment(analog) {
//     return [
//         analog?.environment_category_1,
//         analog?.environment_category_2,
//         analog?.environment_category_3,
//     ];
// }

function resolveAnalogEnvironment(analog) {
    return [
        analog?.env_category_1,
        analog?.env_category_2,
        analog?.environment_category_1,
        analog?.environment_category_2,
        analog?.environment_category_3,
        analog?.environment,
    ];
}

// function resolveQuestionnaireHistoricalCenter(questionnaire) {
//     return (
//         questionnaire?.isHistoricalCenter ??
//         questionnaire?.environmentHistoricalCenter ??
//         false
//     );
// }

function resolveQuestionnaireHistoricalCenter(questionnaire) {
    return (
        questionnaire?.historicalCenter ??
        questionnaire?.isHistoricalCenter ??
        questionnaire?.historicCenter ??
        questionnaire?.historical_center ??
        questionnaire?.historic_center ??
        questionnaire?.historicalCentre ??
        questionnaire?.historicCentre ??
        questionnaire?.environmentHistoricalCenter ??
        false
    );
}

// function resolveAnalogHistoricalCenter(analog) {
//     return analog?.environment_historical_center ?? false;
// }

function resolveAnalogHistoricalCenter(analog) {
    return (
        analog?.historical_center ??
        analog?.historic_center ??
        analog?.historicalCenter ??
        analog?.historicCenter ??
        analog?.isHistoricalCenter ??
        analog?.is_historical_center ??
        analog?.historicalCentre ??
        analog?.historicCentre ??
        analog?.environment_historical_center ??
        false
    );
}

function normalizeEnvironmentTokenForSelection(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[()]/g, ' ')
        .replace(/\s+/g, ' ');

    if (!normalized || normalized === '0') return null;
    if (normalized.includes('истор') || normalized.includes('культур')) return null;
    if (normalized.includes('обществен') || normalized.includes('делов')) return 'business';
    if (normalized.includes('многоквартир') || normalized.includes('мкд')) return 'multifamily';
    if (normalized.includes('среднеэтаж')) return 'midrise_residential';
    if (normalized.includes('пром')) return 'industrial';
    return null;
}

function encodeEnvironmentSelectionCode(values = []) {
    const categories = new Set(
        values
            .map(normalizeEnvironmentTokenForSelection)
            .filter(Boolean)
    );

    if (!categories.size) return 0;
    if (categories.has('business') && categories.has('multifamily') && categories.has('industrial')) return 7;
    if (categories.has('multifamily') && categories.has('industrial')) return 6;
    if (categories.has('business') && categories.has('multifamily')) return 5;
    if (categories.has('industrial')) return 4;
    if (categories.has('midrise_residential')) return 3;
    if (categories.has('business')) return 2;
    if (categories.has('multifamily')) return 1;
    return 0;
}

function encodeHistoricalCenterSelectionCode(value) {
    if (value === undefined || value === null || value === '') {
        return 0;
    }

    return encodeBooleanLike(value) === 1 ? 1 : 2;
}

function removeConstantColumns(objectVector, analogVectors) {
    if (!analogVectors.length) {
        return { objectVector, analogVectors };
    }

    const columnCount = objectVector.length;
    const keepIndexes = [];

    for (let col = 0; col < columnCount; col += 1) {
        const values = analogVectors.map((row) => Number(row[col])).filter(Number.isFinite);
        if (!values.length) continue;

        const first = values[0];
        const isConstant = values.every((v) => v === first);

        if (!isConstant) {
            keepIndexes.push(col);
        }
    }

    if (!keepIndexes.length) {
        return {
            objectVector: [objectVector[0]],
            analogVectors: analogVectors.map((row) => [row[0]]),
        };
    }

    return {
        objectVector: keepIndexes.map((idx) => objectVector[idx]),
        analogVectors: analogVectors.map((row) => keepIndexes.map((idx) => row[idx])),
    };
}

export function getCalculationArea(questionnaire) {
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

function buildObjectVector(questionnaire) {
    return [
        getCalculationArea(questionnaire),
        resolveQuestionnaireConstructionYear(questionnaire),
        normalizeMetroDistanceKm(questionnaire?.metroDistance) ?? 0,
        encodeDistrictGroup(questionnaire?.district),
        encodeTerritorialZoneCategory(resolveQuestionnaireZone(questionnaire)),
        encodeEnvironmentSelectionCode(resolveQuestionnaireEnvironment(questionnaire)),
        encodeFloorCategoryForMahalanobis(getQuestionnaireReferenceFloorCategory(questionnaire)),
        encodeHistoricalCenterSelectionCode(resolveQuestionnaireHistoricalCenter(questionnaire)),
    ];
}

function buildAnalogVectors(analogs) {
    return analogs.map((analog) => [
        toNumber(analog.area_total, 0),
        parseYear(analog.year_built_commissioning),
        normalizeMetroDistanceKm(analog.distance_to_metro) ?? 0,
        encodeDistrictGroup(analog.district),
        encodeTerritorialZoneCategory(resolveAnalogZone(analog)),
        encodeEnvironmentSelectionCode(resolveAnalogEnvironment(analog)),
        encodeFloorCategoryForMahalanobis(analog.floor_location),
        encodeHistoricalCenterSelectionCode(resolveAnalogHistoricalCenter(analog)),
    ]);
}

export function selectAnalogsByMahalanobis(questionnaire, analogs) {
    const normalizedAnalogs = Array.isArray(analogs)
        ? analogs.map((analog) => toPlainComparable(analog))
        : [];

    if (normalizedAnalogs.length < 2) {
        const ranked = normalizedAnalogs.slice();
        return {
            selected: ranked.slice(0, EXCEL_PARITY_CONFIG.selector.maxAnalogs),
            ranked,
            distances: [],
        };
    }

    try {
        const rawObjectVector = buildObjectVector(questionnaire);
        const rawAnalogVectors = buildAnalogVectors(normalizedAnalogs);

        const { objectVector, analogVectors } = removeConstantColumns(
            rawObjectVector,
            rawAnalogVectors
        );

        const distances = mahalanobisDistance(objectVector, analogVectors);

        const withDistances = normalizedAnalogs.map((analog, index) => ({
            ...analog,
            mahalanobisDistance: Number.isFinite(distances[index]) ? distances[index] : 0,
        }));

        const ranked = withDistances
            .sort((a, b) => a.mahalanobisDistance - b.mahalanobisDistance);

        const selected = ranked.slice(0, EXCEL_PARITY_CONFIG.selector.maxAnalogs);

        return {
            selected,
            ranked,
            distances: selected.map((item) => item.mahalanobisDistance),
        };
    } catch (error) {
        console.warn('Ошибка расчёта расстояния Махаланобиса. Используется fallback.', error);
        const ranked = normalizedAnalogs.slice();
        return {
            selected: ranked.slice(0, EXCEL_PARITY_CONFIG.selector.maxAnalogs),
            ranked,
            distances: [],
        };
    }
}

function getQuarterIndex(value) {
    if (!value) return null;

    const raw = String(value).trim();
    const normalized = raw.toUpperCase().replace(/\s+/g, ' ');
    const yearMatch = normalized.match(/(20\d{2}|19\d{2})/);
    const quarterMatch = normalized.match(/(?:Q|КВ|КВАРТАЛ)\s*([1-4])|([1-4])\s*(?:Q|КВ|КВАРТАЛ)/);
    const quarterNumber = quarterMatch?.[1] || quarterMatch?.[2] || normalized.match(/\b([1-4])\b/)?.[1];

    if (yearMatch && quarterNumber) {
        return (Number(yearMatch[1]) * 4) + Number(quarterNumber);
    }

    const parsedDate = new Date(raw);
    if (Number.isNaN(parsedDate.getTime())) {
        return null;
    }

    return (parsedDate.getFullYear() * 4) + Math.floor(parsedDate.getMonth() / 3) + 1;
}

function getDateAdjustment(offerDate, valuationDate, offerQuarter = null) {
    const offerQuarterIndex = getQuarterIndex(offerQuarter || offerDate);
    const valuationQuarterIndex = getQuarterIndex(valuationDate);

    if (offerQuarterIndex !== null && valuationQuarterIndex !== null) {
        const quarterDiff = Math.abs(offerQuarterIndex - valuationQuarterIndex);

        if (quarterDiff <= 1) {
            return EXCEL_PARITY_CONFIG.adjustments.dateAdjustmentBins[0]?.value || 0;
        }
        if (quarterDiff <= 2) {
            return EXCEL_PARITY_CONFIG.adjustments.dateAdjustmentBins[1]?.value || 0;
        }
        if (quarterDiff <= 3) {
            return EXCEL_PARITY_CONFIG.adjustments.dateAdjustmentBins[2]?.value || 0;
        }
    }

    const offer = new Date(offerDate);
    const valuation = new Date(valuationDate);

    if (Number.isNaN(offer.getTime()) || Number.isNaN(valuation.getTime())) {
        return 0;
    }

    const monthsDiff = Math.abs((valuation - offer) / (1000 * 60 * 60 * 24 * 30));

    for (const bin of EXCEL_PARITY_CONFIG.adjustments.dateAdjustmentBins) {
        if (monthsDiff <= bin.monthsTo) {
            return bin.value;
        }
    }

    return EXCEL_PARITY_CONFIG.adjustments.dateAdjustmentBins.at(-1)?.value || 0;
}

function getMetroAdjustment(distanceObject, distanceAnalog) {
    const dObj = normalizeMetroDistanceKm(distanceObject);
    const dAna = normalizeMetroDistanceKm(distanceAnalog);

    if (!dObj || !dAna || dObj <= 0 || dAna <= 0) {
        return 1;
    }

    const kObj = 0.78 * Math.pow(dObj, -0.04);
    const kAna = 0.78 * Math.pow(dAna, -0.04);

    if (!kAna) return 1;
    return kObj / kAna;
}

function getAreaAdjustment(areaObject, areaAnalog) {
    const sObj = toNumber(areaObject, null);
    const sAna = toNumber(areaAnalog, null);

    if (!sObj || !sAna || sObj <= 0 || sAna <= 0) {
        return 1;
    }

    return Math.pow(sObj / sAna, 0.18);
}

function getScaleAdjustmentFactor(subjectArea, analogArea) {
    const subjectToAnalogRatio = getSubjectToAnalogAreaRatio(subjectArea, analogArea);

    if (!Number.isFinite(subjectToAnalogRatio) || subjectToAnalogRatio <= 0) {
        return 1;
    }

    return Math.pow(subjectToAnalogRatio, SCALE_ADJUSTMENT_POWER);
}

function calculateScaleAdjustmentRecord(questionnaire, analog) {
    const subjectArea = toNumber(questionnaire?.totalArea, null);
    const analogArea = toNumber(analog?.area_total, null);

    if (!Number.isFinite(subjectArea) || !Number.isFinite(analogArea) || subjectArea <= 0 || analogArea <= 0) {
        return createAdjustmentRecord('scale', 'Масштаб объекта', 1, 'Недостаточно данных для корректировки на масштаб');
    }

    const scaleFactor = getScaleAdjustmentFactor(subjectArea, analogArea);
    const areaRatio = getAreaRatio(subjectArea, analogArea);
    const subjectToAnalogAreaRatio = getSubjectToAnalogAreaRatio(subjectArea, analogArea);

    return createAdjustmentRecord(
        'scale',
        'Масштаб объекта',
        scaleFactor,
        'Корректировка на общий масштаб объекта оценки относительно площади аналога',
        {
            subjectArea: round2(subjectArea),
            analogArea: round2(analogArea),
            areaRatio: round2(areaRatio),
            subjectToAnalogAreaRatio: Number.isFinite(subjectToAnalogAreaRatio) ? round2(subjectToAnalogAreaRatio) : null,
            elasticity: SCALE_ADJUSTMENT_POWER,
        }
    );
}

export function adjustAnalogRate(analog, questionnaire, baseRate) {
    const effectiveBaseRate = toNumber(
        baseRate,
        toNumber(analog?.price_per_sqm_cleaned, null)
    );

    const preparedAnalog = {
        ...analog,
        price_per_sqm_cleaned: effectiveBaseRate,
    };

    const marketRentAnalysis = calculateMarketRentByNewAlgorithm(
        [preparedAnalog],
        questionnaire
    );

    const row = Array.isArray(marketRentAnalysis?.adjustedRates)
        ? marketRentAnalysis.adjustedRates[0]
        : null;

    if (!row) {
        return {
            rawRate: null,
            baseRate: null,
            correctedRate: null,
            adjustedRate: null,
            totalAdjustmentFactor: 1,
            dateAdjustment: 1,
            bargainAdjustment: 1,
            metroAdjustment: 1,
            areaAdjustment: 1,
            floorAdjustment: 1,
            environmentAdjustment: 1,
            includedInCalculation: false,
            exclusionReason: 'Не удалось рассчитать корректировки по новому алгоритму аренды',
            adjustments: [],
            adjustmentSummary: null,
        };
    }

    return {
        rawRate: row.rawRate,
        baseRate: row.baseRate,
        afterDate: row.afterDate ?? null,
        afterBargain: row.afterBargain ?? null,
        correctedRate: row.correctedRate,
        adjustedRate: row.adjustedRate ?? row.correctedRate,

        totalAdjustmentFactor: row.totalAdjustmentFactor ?? 1,
        firstGroupFactor: row.firstGroupFactor ?? 1,
        secondGroupMultiFactor: row.secondGroupMultiFactor ?? 1,

        dateAdjustment: row.dateAdjustment ?? 1,
        bargainAdjustment: row.bargainAdjustment ?? 1,
        metroAdjustment: row.metroAdjustment ?? 1,
        areaAdjustment: row.areaAdjustment ?? 1,
        floorAdjustment: row.floorAdjustment ?? 1,
        environmentAdjustment: row.environmentAdjustment ?? 1,

        includedInCalculation: row.includedInCalculation !== false,
        includedInRentCalculation: row.includedInRentCalculation !== false,
        exclusionReason: row.exclusionReason ?? null,

        adjustments: row.adjustments ?? [],
        adjustmentSummary: row.adjustmentSummary ?? null,
    };
}

function getMonthsDifference(offerDate, valuationDate) {
    if (!offerDate || !valuationDate) return null;

    const offer = new Date(offerDate);
    const valuation = new Date(valuationDate);

    if (Number.isNaN(offer.getTime()) || Number.isNaN(valuation.getTime())) {
        return null;
    }

    return Math.abs((valuation - offer) / (1000 * 60 * 60 * 24 * 30));
}

function calculateComparableCompleteness(analog) {
    const fields = [
        analog?.address_offer,
        analog?.district,
        analog?.class_offer,
        analog?.area_total,
        analog?.distance_to_metro,
        analog?.offer_date,
        analog?.floor_location,
        analog?.price_per_sqm_cleaned,
    ];

    const knownCount = fields.filter((value) => value !== null && value !== undefined && value !== '').length;
    return safeDivide(knownCount, fields.length, 0);
}

function calculateComparableKeyFieldCoverage(analog) {
    const checks = [
        toNumber(analog?.price_per_sqm_cleaned, null) > 0,
        toNumber(analog?.area_total, null) > 0,
        Boolean(normalizeBusinessCenterClass(analog?.class_offer) !== 'unknown'),
        Boolean(analog?.address_offer || analog?.building_name || analog?.building_cadastral_number),
        Boolean(analog?.offer_date || analog?.quarter),
    ];

    const populated = checks.filter(Boolean).length;
    return safeDivide(populated, checks.length, 0);
}

function calculateDistrictWeight(questionnaire, analog) {
    const objectDistrict = normalizeComparableText(questionnaire?.district);
    const analogDistrict = normalizeComparableText(analog?.district);

    if (!objectDistrict && !analogDistrict) return 0.7;
    if (!objectDistrict || !analogDistrict) return 0.78;
    if (objectDistrict === analogDistrict) return 1;
    if (resolveDistrictBucket(objectDistrict) === resolveDistrictBucket(analogDistrict)) return 0.88;
    return 0.72;
}

function calculateMetroWeight(questionnaire, analog) {
    const objectMetroDistance = normalizeMetroDistanceKm(questionnaire?.metroDistance);
    const analogMetroDistance = normalizeMetroDistanceKm(analog?.distance_to_metro);

    if (!Number.isFinite(objectMetroDistance) && !Number.isFinite(analogMetroDistance)) return 0.72;
    if (!Number.isFinite(objectMetroDistance) || !Number.isFinite(analogMetroDistance)) return 0.76;

    const denominator = Math.max(objectMetroDistance, analogMetroDistance, 300);
    const relativeDiff = Math.abs(objectMetroDistance - analogMetroDistance) / denominator;
    return clamp(1 - (relativeDiff * 0.45), 0.55, 1);
}

function calculateClassWeight(questionnaire, analog) {
    const objectClass = normalizeBusinessCenterClass(
        questionnaire?.marketClassResolved ||
        questionnaire?.businessCenterClass ||
        questionnaire?.objectClass
    );
    const analogClass = normalizeBusinessCenterClass(analog?.class_offer);

    if (objectClass === 'unknown' && analogClass === 'unknown') return 0.7;
    if (objectClass === 'unknown' || analogClass === 'unknown') return 0.78;
    if (objectClass === analogClass) return 1;
    return 0.68;
}

function calculateAreaWeight(questionnaire, analog) {
    const objectArea = getSubjectScaleArea(questionnaire);
    const analogArea = toNumber(analog?.area_total, null);

    if (!Number.isFinite(objectArea) && !Number.isFinite(analogArea)) return 0.7;
    if (!Number.isFinite(objectArea) || !Number.isFinite(analogArea) || objectArea <= 0 || analogArea <= 0) {
        return 0.76;
    }

    return getScaleWeightPenalty(objectArea, analogArea);
}

function calculateDateWeight(analog, questionnaire) {
    const monthsDiff = getMonthsDifference(analog?.offer_date, questionnaire?.valuationDate);

    if (!Number.isFinite(monthsDiff)) return 0.72;
    return clamp(1 - ((Math.min(monthsDiff, 24) / 24) * 0.45), 0.55, 1);
}

function calculateMahalanobisWeight(analog) {
    const distance = toNumber(analog?.mahalanobisDistance, null);
    if (!Number.isFinite(distance)) return 0.72;
    return clamp(1 / (1 + distance), 0.35, 1);
}

function buildAdjustmentSummary(adjustments) {
    const rows = Array.isArray(adjustments?.adjustments)
        ? adjustments.adjustments
        : Array.isArray(adjustments)
            ? adjustments
            : [];

    return rows.map((item) => ({
        key: item.key,
        label: item.label,
        factor: round2(toNumber(item.factor, 1)),
        deltaPercent: round2(toNumber(item.deltaPercent, 0)),
        reasoning: item.reasoning || null,
    }));
}

export function scoreAnalogueRelevance(questionnaire, analog) {
    const subjectArea = getSubjectScaleArea(questionnaire);
    const analogArea = toNumber(analog?.area_total, null);
    const areaRatio = getAreaRatio(subjectArea, analogArea);
    const classSimilarity = (() => {
        const subjectClass = normalizeBusinessCenterClass(
            questionnaire?.marketClassResolved ||
            questionnaire?.businessCenterClass ||
            questionnaire?.objectClass
        );
        const analogClass = normalizeBusinessCenterClass(analog?.class_offer);

        if (subjectClass === 'unknown' && analogClass === 'unknown') return 0.7;
        if (subjectClass === 'unknown' || analogClass === 'unknown') return 0.72;
        if (subjectClass === analogClass) return 1;

        const stepDiff = Math.abs(getClassStepDifference(subjectClass, analogClass));
        return clamp(1 - (stepDiff * 0.2), 0.45, 1);
    })();
    const sizeSimilarity = calculateSizeSimilarity(subjectArea, analogArea);
    const scaleSimilarity = getScaleSimilarityScore(subjectArea, analogArea);
    const locationSimilarity = calculateLocationSimilarity(questionnaire, analog);
    const metroSimilarity = calculateMetroWeight(questionnaire, analog);
    const dateRecency = calculateDateWeight(analog, questionnaire);
    const completenessScore = calculateComparableCompleteness(analog);
    const keyFieldCoverage = calculateComparableKeyFieldCoverage(analog);
    const segmentSimilarity = calculateSegmentSimilarity(questionnaire, analog);
    const environmentSimilarity = calculateEnvironmentSimilarity(questionnaire, analog);

    const components = {
        classSimilarity,
        sizeSimilarity,
        scaleSimilarity,
        areaRatio: Number.isFinite(areaRatio) ? round2(areaRatio) : null,
        locationSimilarity,
        metroSimilarity,
        dateRecency,
        dataCompleteness: completenessScore,
        segmentSimilarity,
        environmentSimilarity,
        keyFieldCoverage,
    };

    const score = clamp(
        (classSimilarity * 0.18) +
        (locationSimilarity * 0.15) +
        (metroSimilarity * 0.10) +
        (dateRecency * 0.12) +
        (completenessScore * 0.10) +
        (segmentSimilarity * 0.10) +
        (scaleSimilarity * 0.25),
        0,
        1
    );

    return {
        score: round4(score),
        completenessScore: round4(completenessScore),
        keyFieldCoverage: round4(keyFieldCoverage),
        components,
    };
}

export function calculateAnalogWeight(analog, questionnaire) {
    const relevance = scoreAnalogueRelevance(questionnaire, analog);
    const completenessScore = calculateComparableCompleteness(analog);
    const subjectArea = getSubjectScaleArea(questionnaire);
    const analogArea = toNumber(analog?.area_total, null);
    const scaleWeightPenalty = getScaleWeightPenalty(subjectArea, analogArea);
    const areaRatio = getAreaRatio(subjectArea, analogArea);
    const components = {
        relevance: relevance.score,
        mahalanobis: calculateMahalanobisWeight(analog),
        district: calculateDistrictWeight(questionnaire, analog),
        metro: calculateMetroWeight(questionnaire, analog),
        class: calculateClassWeight(questionnaire, analog),
        area: calculateAreaWeight(questionnaire, analog),
        date: calculateDateWeight(analog, questionnaire),
        completeness: clamp(0.55 + (completenessScore * 0.45), 0.55, 1),
        segment: calculateSegmentSimilarity(questionnaire, analog),
        scaleSimilarity: relevance.components.scaleSimilarity,
        areaRatio: Number.isFinite(areaRatio) ? round2(areaRatio) : null,
        scalePenalty: scaleWeightPenalty,
        scaleWeightPenalty,
    };

    const preWeight = clamp(relevance.score * scaleWeightPenalty, 0.01, 1);

    return {
        weight: round4(preWeight),
        preWeight: round4(preWeight),
        baseWeight: round4(preWeight),
        relevanceScore: relevance.score,
        completenessScore: round4(relevance.completenessScore),
        keyFieldCoverage: round4(relevance.keyFieldCoverage),
        components,
        relevanceComponents: relevance.components,
    };
}

export function detectAnalogOutlierBounds(rows = []) {
    const rates = rows
        .map((row) => toNumber(row?.adjustedRate, null))
        .filter((value) => Number.isFinite(value) && value > 0);

    if (rates.length < 4) {
        return null;
    }

    const q1 = percentile(rates, 0.25);
    const q3 = percentile(rates, 0.75);
    const iqr = toNumber(q3, 0) - toNumber(q1, 0);

    if (!Number.isFinite(q1) || !Number.isFinite(q3) || iqr < 0) {
        return null;
    }

    return {
        q1,
        q3,
        iqr,
        lower: q1 - (iqr * 1.5),
        upper: q3 + (iqr * 1.5),
    };
}

function trimComparableRows(rows = [], trimRatio = STABLE_TRIM_RATIO) {
    const sortedRows = (Array.isArray(rows) ? rows : [])
        .filter((row) => Number.isFinite(toNumber(row?.correctedRate, null)))
        .slice()
        .sort((left, right) => toNumber(left.correctedRate, 0) - toNumber(right.correctedRate, 0));

    if (sortedRows.length < SMALL_SAMPLE_THRESHOLD) {
        return {
            rows: sortedRows,
            trimCountPerSide: 0,
        };
    }

    const trimCountPerSide = getTrimCount(sortedRows.length, trimRatio);
    if ((trimCountPerSide * 2) >= sortedRows.length) {
        return {
            rows: sortedRows,
            trimCountPerSide: 0,
        };
    }

    return {
        rows: sortedRows.slice(trimCountPerSide, sortedRows.length - trimCountPerSide),
        trimCountPerSide,
    };
}

function buildRentStabilityMetrics(rows = [], baselineCount = null) {
    const correctedRates = (Array.isArray(rows) ? rows : [])
        .map((row) => toNumber(row?.correctedRate, null))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((a, b) => a - b);

    const correctedRateMedian = median(correctedRates);
    const correctedRateStdDev = standardDeviation(correctedRates);
    const q1 = percentile(correctedRates, 0.25);
    const q3 = percentile(correctedRates, 0.75);
    const correctedRateIQR = Number.isFinite(q1) && Number.isFinite(q3)
        ? Math.max(0, q3 - q1)
        : null;
    const sampleSizeLevel = getSampleSizeLevel(Number.isFinite(baselineCount) ? baselineCount : correctedRates.length);
    const dispersionLevel = getDispersionLevel({
        medianValue: correctedRateMedian,
        stdDev: correctedRateStdDev,
        iqr: correctedRateIQR,
    });
    const stabilityFlag = sampleSizeLevel === 'small' || dispersionLevel === 'high'
        ? 'unstable'
        : 'stable';

    return {
        correctedRateMin: correctedRates.length ? round2(correctedRates[0]) : null,
        correctedRateMedian: Number.isFinite(correctedRateMedian) ? round2(correctedRateMedian) : null,
        correctedRateMax: correctedRates.length ? round2(correctedRates.at(-1)) : null,
        correctedRateStdDev: correctedRates.length ? round2(correctedRateStdDev) : null,
        correctedRateIQR: Number.isFinite(correctedRateIQR) ? round2(correctedRateIQR) : null,
        dispersionLevel,
        sampleSizeLevel,
        stabilityFlag,
    };
}

function buildComparableDecisionReason(row) {
    if (!row?.includedInRentCalculation) {
        return row?.exclusionReason || 'Исключен из расчета ставки';
    }

    const majorSignals = [];
    const components = row?.weightComponents || {};

    if (toNumber(components.mahalanobis, 0) >= 0.8) {
        majorSignals.push('хорошее сходство по совокупности признаков');
    }

    if (toNumber(components.district, 0) >= 0.88) {
        majorSignals.push('сопоставимая локация');
    }

    if (toNumber(components.area, 0) >= 0.85) {
        majorSignals.push('близкая площадь');
    }

    if (toNumber(components.date, 0) >= 0.8) {
        majorSignals.push('актуальная дата предложения');
    }

    if (!majorSignals.length) {
        majorSignals.push('оставлен после ранжирования и взвешивания');
    }

    return `Оставлен в расчете: ${majorSignals.join(', ')}`;
}

export function getRentableRatio(rentableArea, totalArea) {
    const rentable = toNumber(rentableArea, 0);
    const total = toNumber(totalArea, 0);

    if (!total) return 1;
    return rentable / total;
}

export function getVacancyRate(occupiedArea, rentableArea) {
    const occupied = toNumber(occupiedArea, 0);
    const rentable = toNumber(rentableArea, 0);

    if (!rentable) return 0;
    return clamp(1 - (occupied / rentable), 0, 1);
}

export function calculatePGI(rentableArea, monthlyRate) {
    return toNumber(rentableArea, 0) * toNumber(monthlyRate, 0) * 12;
}

export function calculateEGI(pgi, vacancyRate) {
    return toNumber(pgi, 0) * (1 - clamp(toNumber(vacancyRate, 0), 0, 1));
}

function normalizeRatioInput(value) {
    const numeric = toNumber(value, null);
    if (!Number.isFinite(numeric)) return null;
    if (numeric > 1) return numeric / 100;
    return numeric;
}

export function calculateVacancyRate({ questionnaire, subject = {}, marketContext = {}, analogStats = {} }) {
    const manualVacancy = normalizeRatioInput(
        questionnaire?.vacancyRate ??
        questionnaire?.vacancyPercent ??
        questionnaire?.manualVacancyRate
    );
    const leasableArea = toNumber(
        subject?.leasableArea ?? questionnaire?.leasableArea,
        null
    );
    const occupiedArea = toNumber(
        subject?.occupiedArea ?? questionnaire?.occupiedArea,
        null
    );
    const marketProfile = resolveQuarterMarketProfile(questionnaire);
    const marketRate = clamp(
        toNumber(marketProfile.profile?.vacancyRate, EXCEL_PARITY_CONFIG.valuation.defaultVacancyRate),
        0,
        1
    );
    const actualVacancyRate = (
        Number.isFinite(leasableArea) &&
        leasableArea > 0 &&
        Number.isFinite(occupiedArea) &&
        occupiedArea >= 0
    )
        ? clamp(1 - (occupiedArea / leasableArea), 0, 1)
        : null;

    if (Number.isFinite(manualVacancy) && manualVacancy >= 0 && manualVacancy <= marketRate) {
        return {
            rate: clamp(manualVacancy, 0, 1),
            source: 'manual_input',
            sourceLabel: marketProfile.label
                ? `Значение клиента ниже квартального рыночного профиля (${marketProfile.label})`
                : 'Значение клиента ниже квартального рыночного профиля',
            reasoning: 'Использовано значение незаполняемости, введенное клиентом, так как оно ниже квартального рыночного профиля.',
            details: {
                priority: 'client_min_market',
                enteredValue: round2(manualVacancy * 100),
                marketRate: round2(marketRate * 100),
                valuationQuarterKey: marketProfile.key,
                valuationQuarterLabel: marketProfile.label,
            },
            baseRate: marketRate,
            adjustments: [],
            profileUsed: marketProfile.key || null,
            breakdown: {
                vacancySource: 'manual_input',
                vacancyBaseValue: round4(marketRate),
                vacancyAdjustments: [],
                vacancyFinalValue: round4(clamp(manualVacancy, 0, 1)),
                valuationQuarterKey: marketProfile.key,
            },
        };
    }

    if (Number.isFinite(actualVacancyRate) && actualVacancyRate >= 0 && actualVacancyRate <= marketRate) {
        return {
            rate: actualVacancyRate,
            source: 'factual',
            sourceLabel: marketProfile.label
                ? `Фактическая незаполняемость ниже квартального рыночного профиля (${marketProfile.label})`
                : 'Фактическая незаполняемость ниже квартального рыночного профиля',
            reasoning: 'Использована фактическая незаполняемость объекта, так как она ниже квартального рыночного профиля.',
            details: {
                priority: 'client_min_market',
                leasableArea: round2(leasableArea),
                occupiedArea: round2(occupiedArea),
                actualVacancyRate: round2(actualVacancyRate * 100),
                marketRate: round2(marketRate * 100),
                valuationQuarterKey: marketProfile.key,
                valuationQuarterLabel: marketProfile.label,
            },
            baseRate: marketRate,
            adjustments: [],
            profileUsed: marketProfile.key || null,
            breakdown: {
                vacancySource: 'factual',
                vacancyBaseValue: round4(marketRate),
                vacancyAdjustments: [],
                vacancyFinalValue: round4(actualVacancyRate),
                valuationQuarterKey: marketProfile.key,
            },
        };
    }

    return {
        rate: marketRate,
        source: 'quarter_profile',
        sourceLabel: marketProfile.label
            ? `Квартальный рыночный профиль незаполняемости (${marketProfile.label})`
            : 'Квартальный рыночный профиль незаполняемости',
        reasoning: 'Незаполняемость взята из квартального рыночного профиля без дополнительных корректировок.',
        details: {
            priority: 'market',
            marketRate: round2(marketRate * 100),
            valuationQuarterKey: marketProfile.key,
            valuationQuarterLabel: marketProfile.label,
            analogQuality: toNumber(analogStats?.qualityScore ?? analogStats?.stats?.averageCompleteness, null),
            marketContextQuality: toNumber(marketContext?.qualityScore, null),
        },
        baseRate: marketRate,
        adjustments: [],
        profileUsed: marketProfile.key || 'vacancy_default_fallback',
        breakdown: {
            vacancySource: 'quarter_profile',
            vacancyBaseValue: round4(marketRate),
            vacancyAdjustments: [],
            vacancyFinalValue: round4(marketRate),
            valuationQuarterKey: marketProfile.key,
        },
    };
}

export function calculateOpexRate({ subject = {}, questionnaire = {}, marketContext = {} }) {
    const marketProfile = resolveQuarterMarketProfile(questionnaire);
    const opexRate = toNumber(
        marketProfile.profile?.opexRate,
        EXCEL_PARITY_CONFIG.valuation.opexRate
    );

    return {
        opexRate,
        source: 'quarter_profile',
        reasoning: marketProfile.label
            ? `Квартальный рыночный профиль операционных расходов (${marketProfile.label})`
            : 'Квартальный рыночный профиль операционных расходов',
        profileUsed: marketProfile.key || null,
        profileQuarterLabel: marketProfile.label,
        baseRate: opexRate,
        adjustments: [],
        breakdown: {
            opexBase: round4(opexRate),
            opexAdjustments: [],
            opexFinal: round4(opexRate),
            opexSource: 'quarter_profile',
            valuationQuarterKey: marketProfile.key,
        },
        details: {
            valuationQuarterKey: marketProfile.key,
            valuationQuarterLabel: marketProfile.label,
            marketContextQuality: toNumber(marketContext?.qualityScore, null),
            subjectArea: toNumber(subject?.totalArea ?? questionnaire?.totalArea, null),
        },
    };
}

function calculateSubjectDataQualityMetrics(subject = {}) {
    const subjectFields = [
        subject?.totalArea,
        subject?.constructionYear,
        subject?.district,
        subject?.metroDistance,
        subject?.mapPointLat,
        subject?.mapPointLng,
        subject?.marketClassResolved || subject?.businessCenterClass || subject?.objectClass,
        subject?.leasableArea,
    ];
    const completeness = safeDivide(
        subjectFields.filter((value) => value !== null && value !== undefined && value !== '').length,
        subjectFields.length,
        0
    );

    return {
        normalizedScore: clamp(completeness, 0, 1),
        score15: round2(clamp(completeness, 0, 1) * 15),
    };
}

function calculateAverageAreaRatio(selectedAnalogs = [], subjectArea = null) {
    const resolvedSubjectArea = toNumber(subjectArea, null);
    if (!Number.isFinite(resolvedSubjectArea) || resolvedSubjectArea <= 0) {
        return null;
    }

    const ratios = (Array.isArray(selectedAnalogs) ? selectedAnalogs : [])
        .map((item) => getAreaRatio(resolvedSubjectArea, item?.area_total))
        .filter((value) => Number.isFinite(value) && value > 0);

    if (!ratios.length) {
        return null;
    }

    return average(ratios);
}

function getScaleMismatchReliabilityScore(avgAreaRatio) {
    if (!Number.isFinite(avgAreaRatio) || avgAreaRatio <= 0) return 3;
    if (avgAreaRatio <= 1.5) return 10;
    if (avgAreaRatio <= 2) return 9;
    if (avgAreaRatio <= 3) return 7;
    if (avgAreaRatio <= 5) return 5;
    if (avgAreaRatio <= 10) return 2;
    return 0;
}

function getReliabilityCapAdjustment(reliabilityScore) {
    if (!Number.isFinite(reliabilityScore)) return 0.003;
    if (reliabilityScore >= 85) return 0.0;
    if (reliabilityScore >= 75) return 0.0015;
    if (reliabilityScore >= 65) return 0.003;
    if (reliabilityScore >= 55) return 0.005;
    return 0.0075;
}

function getDispersionCapAdjustment(dispersionPct) {
    if (!Number.isFinite(dispersionPct)) return 0.002;
    if (dispersionPct <= 10) return 0.0;
    if (dispersionPct <= 15) return 0.001;
    if (dispersionPct <= 20) return 0.002;
    if (dispersionPct <= 25) return 0.003;
    if (dispersionPct <= 30) return 0.004;
    return 0.006;
}

function getScaleMismatchCapAdjustment(avgAreaRatio) {
    if (!Number.isFinite(avgAreaRatio)) return 0.0025;
    if (avgAreaRatio <= 2) return 0.0;
    if (avgAreaRatio <= 3) return 0.001;
    if (avgAreaRatio <= 5) return 0.0025;
    if (avgAreaRatio <= 8) return 0.004;
    return 0.006;
}

function getSubjectDataCapAdjustment(subjectDataQualityScoreNormalized) {
    if (!Number.isFinite(subjectDataQualityScoreNormalized)) return 0.0025;
    if (subjectDataQualityScoreNormalized >= 0.85) return 0.0;
    if (subjectDataQualityScoreNormalized >= 0.70) return 0.001;
    if (subjectDataQualityScoreNormalized >= 0.50) return 0.0025;
    if (subjectDataQualityScoreNormalized >= 0.30) return 0.004;
    return 0.006;
}

export function calculateReliabilityScore({
    selectedAnalogs = [],
    excludedAnalogs = [],
    subject = {},
    landData = {},
    assumptions = [],
    dispersionStats = {},
    rentDiagnostics = {},
    vacancyResult = {},
    rentalRateSource = null,
    rentCalculationMode = DEFAULT_RENT_SELECTION_MODE,
}) {
    const analogCount = selectedAnalogs.length;
    const averageCompleteness = average(selectedAnalogs.map((item) => toNumber(item.completenessScore, null))) || 0;
    const dispersionRatio = toNumber(dispersionStats?.dispersionRatio, null);
    const dispersionPct = Number.isFinite(dispersionRatio) ? (dispersionRatio * 100) : null;
    const subjectDataQuality = calculateSubjectDataQualityMetrics(subject);
    const subjectCompleteness = subjectDataQuality.normalizedScore;
    const averageAreaRatio = calculateAverageAreaRatio(selectedAnalogs, getSubjectScaleArea(subject));
    const sampleSizeLevel = rentDiagnostics?.sampleSizeLevel || getSampleSizeLevel(analogCount);
    const dispersionLevel = rentDiagnostics?.dispersionLevel || getDispersionLevel({
        medianValue: 100,
        stdDev: Number.isFinite(dispersionPct) ? dispersionPct : 0,
        iqr: Number.isFinite(toNumber(rentDiagnostics?.correctedRateIQR, null))
            ? toNumber(rentDiagnostics.correctedRateIQR, 0)
            : 0,
    });
    const stabilityFlag = rentDiagnostics?.stabilityFlag || (
        sampleSizeLevel === 'small' || dispersionLevel === 'high'
            ? 'unstable'
            : 'stable'
    );
    const vacancySource = String(vacancyResult?.source || '').trim().toLowerCase();
    const normalizedRentSource = String(rentalRateSource || '').trim().toLowerCase();

    const analogCountScore = analogCount >= 10 ? 18 : analogCount >= SMALL_SAMPLE_THRESHOLD ? 12 : analogCount >= 4 ? 8 : analogCount >= 2 ? 4 : 1;
    const analogueCompletenessScore = round2(clamp(averageCompleteness, 0, 1) * 20);
    const analogueDispersionScore = Number.isFinite(dispersionRatio)
        ? round2(clamp(1 - (dispersionRatio / 0.45), 0, 1) * 15)
        : 6;
    const subjectDataQualityScore = subjectDataQuality.score15;
    const scaleMismatchScore = getScaleMismatchReliabilityScore(averageAreaRatio);
    const landDataScore = landData?.isCalculated
        ? landData?.isComplete
            ? 10
            : 6
        : 0;
    const vacancySourceScore = vacancySource === 'market' || vacancySource === 'quarter_profile'
        ? 6
        : vacancySource === 'factual'
            ? 3
            : vacancySource === 'manual' || vacancySource === 'manual_input'
                ? 4
                : 0;
    const rentalSourceScore = normalizedRentSource === 'market_analogs'
        ? 8
        : normalizedRentSource === 'manual_override'
            ? 2
            : 5;
    const rentModeScore = rentCalculationMode === 'advanced_experimental'
        ? 4
        : rentCalculationMode === 'excel_compatible'
            ? 5
            : 6;
    const instabilityPenalty = stabilityFlag === 'unstable'
        ? 8
        : 0;
    const stabilityScore = round2(clamp(
        average([
            sampleSizeLevel === 'good' ? 1 : sampleSizeLevel === 'medium' ? 0.7 : 0.4,
            clamp(1 - safeDivide(excludedAnalogs.length, Math.max(selectedAnalogs.length + excludedAnalogs.length, 1), 0), 0, 1),
            clamp(1 - (toNumber(dispersionRatio, 0.45) / 0.45), 0, 1),
        ]) || 0,
        0,
        1
    ) * 20);
    const assumptionsPenalty = assumptions.reduce((sum, item) => sum + Math.abs(toNumber(item?.penalty, 0)), 0);

    const rawScore = analogCountScore +
        analogueCompletenessScore +
        analogueDispersionScore +
        subjectDataQualityScore +
        scaleMismatchScore +
        landDataScore +
        vacancySourceScore +
        rentalSourceScore +
        rentModeScore +
        stabilityScore -
        instabilityPenalty -
        assumptionsPenalty;

    const score = clamp(Math.round(rawScore), 0, 100);
    const factors = [
        `Аналогов в расчете: ${analogCount}`,
        `Средняя полнота аналогов: ${round2(averageCompleteness * 100)}%`,
        Number.isFinite(dispersionPct) ? `Разброс ставок: ${round2(dispersionPct)}%` : 'Разброс ставок оценен как умеренный',
        `Полнота данных объекта: ${round2(subjectCompleteness * 100)}%`,
        Number.isFinite(averageAreaRatio) ? `Средний area ratio аналогов: ${round2(averageAreaRatio)}` : 'Scale mismatch аналогов оценен как умеренный',
        `Размер выборки: ${sampleSizeLevel}`,
        `Стабильность ставки: ${stabilityFlag}`,
        vacancySource ? `Источник vacancy: ${vacancySource}` : null,
        rentCalculationMode ? `Режим расчета ставки: ${rentCalculationMode}` : null,
        landData?.isCalculated
            ? landData?.isComplete
                ? 'Земельные данные полные'
                : 'Земля рассчитана по fallback-логике'
            : 'Земельные данные неполные',
        ...assumptions.map((item) => item?.label).filter(Boolean),
    ];

    return {
        score,
        components: {
            analogCountScore,
            analogueCompletenessScore,
            analogueDispersionScore,
            subjectDataQualityScore,
            scaleMismatchScore,
            landDataScore,
            vacancySourceScore,
            rentalSourceScore,
            rentModeScore,
            stabilityScore,
            instabilityPenalty: round2(instabilityPenalty),
            assumptionsPenalty: round2(assumptionsPenalty),
        },
        metrics: {
            subjectDataQualityScoreNormalized: round4(subjectCompleteness),
            averageAreaRatio: Number.isFinite(averageAreaRatio) ? round2(averageAreaRatio) : null,
            dispersionPct: Number.isFinite(dispersionPct) ? round2(dispersionPct) : null,
            sampleSizeLevel,
            dispersionLevel,
            stabilityFlag,
            vacancySource,
            rentCalculationMode,
        },
        factors,
        note: factors.slice(0, 4).join('; '),
        assumptions,
    };
}

export function calculateCapitalizationRate({
    subject = {},
    questionnaire = {},
    analogStats = {},
    reliability = {},
    vacancyResult = {},
}) {
    const marketProfile = resolveQuarterMarketProfile(questionnaire);
    const normalizedClass = normalizeBusinessCenterClass(
        questionnaire?.marketClassResolved ||
        questionnaire?.businessCenterClass ||
        questionnaire?.objectClass
    );
    const districtBucket = resolveDistrictBucket(questionnaire?.district);
    const baseCapRate = toNumber(
        marketProfile.profile?.capitalizationRate,
        EXCEL_PARITY_CONFIG.valuation.capitalizationRate
    );
    const environmentScore = calculateEnvironmentScore(resolveQuestionnaireEnvironment(questionnaire));
    const reliabilityScore = toNumber(reliability?.score, null);
    const dispersionPct = toNumber(
        reliability?.metrics?.dispersionPct,
        Number.isFinite(toNumber(analogStats?.stats?.dispersionRatio, null))
            ? toNumber(analogStats?.stats?.dispersionRatio, 0) * 100
            : null
    );
    const averageAreaRatio = toNumber(
        reliability?.metrics?.averageAreaRatio,
        analogStats?.averageAreaRatio ?? analogStats?.stats?.averageAreaRatio
    );
    const subjectDataQualityScoreNormalized = toNumber(
        reliability?.metrics?.subjectDataQualityScoreNormalized,
        calculateSubjectDataQualityMetrics(subject).normalizedScore
    );

    const capRateBreakdown = {
        baseCapRate: round4(baseCapRate),
        locationAdjustment: null,
        environmentAdjustment: null,
        vacancyRiskAdjustment: null,
        reliabilityAdjustment: null,
        dispersionAdjustment: null,
        scaleMismatchAdjustment: null,
        subjectDataAdjustment: null,
        finalCapRate: round4(baseCapRate),
        reliabilityScore: Number.isFinite(reliabilityScore) ? round2(reliabilityScore) : null,
        dispersionPct: null,
        averageAreaRatio: Number.isFinite(averageAreaRatio) ? round2(averageAreaRatio) : null,
        subjectDataQualityScoreNormalized: Number.isFinite(subjectDataQualityScoreNormalized)
            ? round4(subjectDataQualityScoreNormalized)
            : null,
        valuationQuarterKey: marketProfile.key,
    };

    return {
        finalCapRate: baseCapRate,
        baseCapRate,
        source: 'quarter_profile',
        sourceLabel: marketProfile.label
            ? `Квартальный рыночный профиль капитализации (${marketProfile.label})`
            : 'Квартальный рыночный профиль капитализации',
        reasoning: 'Ставка капитализации взята из квартального рыночного профиля без дополнительных корректировок.',
        adjustments: [],
        capRateBreakdown,
        details: {
            normalizedClass,
            districtBucket,
            environmentScore: Number.isFinite(environmentScore) ? round2(environmentScore) : null,
            vacancyRate: Number.isFinite(toNumber(vacancyResult?.rate, null)) ? round2(toNumber(vacancyResult.rate, 0) * 100) : null,
            reliabilityScore: Number.isFinite(reliabilityScore) ? round2(reliabilityScore) : null,
            dispersionPct: Number.isFinite(dispersionPct) ? round2(dispersionPct) : null,
            averageAreaRatio: Number.isFinite(averageAreaRatio) ? round2(averageAreaRatio) : null,
            subjectDataQualityScoreNormalized: Number.isFinite(subjectDataQualityScoreNormalized)
                ? round4(subjectDataQualityScoreNormalized)
                : null,
            valuationQuarterKey: marketProfile.key,
            valuationQuarterLabel: marketProfile.label,
        },
    };
}

export function calculateOPEX(egi, opexRate = EXCEL_PARITY_CONFIG.valuation.opexRate) {
    return toNumber(egi, 0) * toNumber(opexRate, EXCEL_PARITY_CONFIG.valuation.opexRate);
}

export function calculateNOI(egi, opex) {
    return toNumber(egi, 0) - toNumber(opex, 0);
}

export async function calculateLandShareDetails(questionnaire) {
    const landCadNumber = questionnaire?.landCadastralNumber;
    const details = {
        cadastralNumber: landCadNumber || null,
        landCadCost: toNumber(questionnaire?.landCadCost, 0),
        landArea: toNumber(questionnaire?.landArea, 0),
        totalOksAreaOnLand: toNumber(questionnaire?.totalOksAreaOnLand, 0),
        objectArea: toNumber(questionnaire?.totalArea, 0),
        allocationRatio: 0,
        landShareRatio: 0,
        share: 0,
        source: 'missing',
        calculationMode: 'missing',
        isCalculated: false,
        isComplete: false,
        doubleSubtractionGuard: true,
        warnings: [],
    };

    if (!landCadNumber) {
        details.warnings.push('Не указан кадастровый номер земельного участка');
        return details;
    }

    let cadastralData = null;
    const needsLookup =
        !details.landCadCost ||
        !details.totalOksAreaOnLand;

    if (needsLookup) {
        cadastralData = await CadastralData.findOne({
            where: { cadastral_number: landCadNumber },
        });
    }

    if (!details.landCadCost) {
        details.landCadCost = toNumber(cadastralData?.cad_cost, 0);
    }

    if (!details.landCadCost) {
        details.landCadCost = toNumber(cadastralData?.specific_cadastral_cost, 0) * toNumber(cadastralData?.land_area, 0);
    }

    if (!details.landArea) {
        details.landArea = toNumber(cadastralData?.land_area, 0) || toNumber(cadastralData?.total_area, 0);
    }

    if (!details.totalOksAreaOnLand) {
        details.totalOksAreaOnLand = toNumber(cadastralData?.total_oks_area_on_land, 0);
    }

    if (!details.landCadCost) {
        details.warnings.push('Не найдена кадастровая стоимость земельного участка');
        return details;
    }

    if (!details.objectArea) {
        details.warnings.push('Не указана площадь оцениваемого объекта');
        return details;
    }

    if (details.totalOksAreaOnLand > 0) {
        if (details.totalOksAreaOnLand < details.objectArea) {
            details.allocationRatio = 1;
            details.landShareRatio = 1;
            details.share = details.landCadCost;
            details.source = 'fallback_subject_exceeds_total_oks';
            details.calculationMode = 'controlled_fallback';
            details.isCalculated = true;
            details.isComplete = false;
            details.warnings.push('Общая площадь всех ОКС на участке меньше площади оцениваемого объекта; доля земли рассчитана по консервативному fallback 100%');
            return details;
        }

        const rawAllocationRatio = clamp(details.objectArea / details.totalOksAreaOnLand, 0, 1);
        details.allocationRatio = rawAllocationRatio >= 0.9995
            ? 1
            : truncateTo(rawAllocationRatio, 3);
        details.landShareRatio = details.allocationRatio;
        details.share = details.landCadCost * details.allocationRatio;
        details.source = 'proportional_by_oks_area';
        details.calculationMode = 'proportional_by_oks_area';
        details.isCalculated = true;
        details.isComplete = true;
        return details;
    }

    details.allocationRatio = 1;
    details.landShareRatio = 1;
    details.share = details.landCadCost;
    details.source = 'fallback_single_object_assumption';
    details.calculationMode = 'controlled_fallback';
    details.isCalculated = true;
    details.isComplete = false;
    details.warnings.push('Не найдена общая площадь всех ОКС на участке; использовано допущение, что участок относится только к оцениваемому объекту');
    return details;
}

function normalizeFloorRow(floor, index) {
    const floorLocation = floor.floorLocation || floor.label || `Этаж ${index + 1}`;
    const floorCategory = floor.floorCategory || parseFloorCategory(floor.floorLocation || floor.label);

    return {
        id: floor.id || `floor_${index + 1}`,
        floorLocation,
        floorCategory,
        name: floor.name || floorLocation,
        area: toNumber(floor.area, 0),
        leasableArea: toNumber(floor.leasableArea, 0),
        avgLeasableRoomArea: toNumber(floor.avgLeasableRoomArea, 0),
        premisesPurpose: floor.premisesPurpose || floor.purpose || '',
        occupiedArea: toNumber(floor.occupiedArea, 0),
    };
}

export function normalizeFloorsData(questionnaire) {
    const floors = Array.isArray(questionnaire?.floors) ? questionnaire.floors : [];
    return floors.map((floor, index) => normalizeFloorRow(floor, index));
}

export function calculateIncomeValuation({
                                             totalArea,
                                             leasableAreaFloor1,
                                             leasableAreaFloor2,
                                             leasableAreaFloor3Plus,
                                             marketRentFirst,
                                             occupiedArea = null,
                                             vacancyRate = null,
                                             opexRate = EXCEL_PARITY_CONFIG.valuation.opexRate,
                                             capitalizationRate = EXCEL_PARITY_CONFIG.valuation.capitalizationRate,
                                             landShare = 0,
                                             floor2Multiplier = EXCEL_PARITY_CONFIG.valuation.floor2Multiplier,
                                             floor3PlusMultiplier = EXCEL_PARITY_CONFIG.valuation.floor3PlusMultiplier,
                                         }) {
    const totalAreaNum = toNumber(totalArea, 0);
    const area1 = toNumber(leasableAreaFloor1, 0);
    const area2 = toNumber(leasableAreaFloor2, 0);
    const area3 = toNumber(leasableAreaFloor3Plus, 0);
    const rent1 = toNumber(marketRentFirst, 0);
    const rent2 = rent1 * toNumber(floor2Multiplier, EXCEL_PARITY_CONFIG.valuation.floor2Multiplier);
    const rent3 = rent1 * toNumber(floor3PlusMultiplier, EXCEL_PARITY_CONFIG.valuation.floor3PlusMultiplier);
    const leasableAreaTotal = area1 + area2 + area3;

    if (totalAreaNum <= 0) {
        throw new Error('Общая площадь должна быть больше 0');
    }

    if (leasableAreaTotal <= 0) {
        throw new Error('Суммарная арендопригодная площадь должна быть больше 0');
    }

    let vacancyRateNum;

    if (vacancyRate !== null && vacancyRate !== undefined) {
        vacancyRateNum = toNumber(vacancyRate, 0);
    } else if (occupiedArea !== null && occupiedArea !== undefined) {
        vacancyRateNum = 1 - (toNumber(occupiedArea, 0) / leasableAreaTotal);
    } else {
        throw new Error('Нужно передать либо occupiedArea, либо vacancyRate');
    }

    vacancyRateNum = clamp(vacancyRateNum, 0, 1);

    const opexRateNum = toNumber(opexRate, EXCEL_PARITY_CONFIG.valuation.opexRate);
    const capRateNum = toNumber(capitalizationRate, EXCEL_PARITY_CONFIG.valuation.capitalizationRate);
    const landShareNum = toNumber(landShare, 0);

    if (capRateNum <= 0) {
        throw new Error('Ставка капитализации должна быть больше 0');
    }

    const floor1Income = area1 * rent1 * 12;
    const floor2Income = area2 * rent2 * 12;
    const floor3PlusIncome = area3 * rent3 * 12;
    const pgi = floor1Income + floor2Income + floor3PlusIncome;
    const egi = pgi * (1 - vacancyRateNum);
    const opex = egi * opexRateNum;
    const noi = egi - opex;
    const valueTotal = noi / capRateNum;
    const finalValue = Math.max(0, valueTotal - landShareNum);
    const pricePerM2 = totalAreaNum > 0 ? finalValue / totalAreaNum : 0;

    return {
        marketRentFirst: round2(rent1),
        marketRentSecond: round2(rent2),
        marketRentThirdPlus: round2(rent3),
        floor1Income: round2(floor1Income),
        floor2Income: round2(floor2Income),
        floor3PlusIncome: round2(floor3PlusIncome),
        leasableAreaTotal: round2(leasableAreaTotal),
        vacancyRate: vacancyRateNum,
        vacancyRatePercent: round2(vacancyRateNum * 100),
        pgi: round2(pgi),
        egi: round2(egi),
        opex: round2(opex),
        noi: round2(noi),
        valueTotal: round2(valueTotal),
        landShare: landShareNum,
        finalValue: round2(finalValue),
        pricePerM2: round2(pricePerM2),
    };
}

function sumLeasableByCategory(floors, category) {
    return floors
        .filter((floor) => floor.floorCategory === category)
        .reduce((sum, floor) => sum + toNumber(floor.leasableArea, 0), 0);
}

export async function calculateValuation(questionnaire, selectedAnalogs, userManualRate = 0) {
    const marketRentAnalysis = calculateMarketRentByNewAlgorithm(selectedAnalogs, questionnaire);
    const manualOverrideRate = toNumber(userManualRate, 0);
    const manualOverrideApplied = manualOverrideRate > 0;
    const rentalRateSource = manualOverrideApplied ? 'manual_override' : 'market_analogs';

    const floorRows = normalizeFloorsData(questionnaire);
    const areaFloor1 = sumLeasableByCategory(floorRows, 'first');
    const areaFloor2 = sumLeasableByCategory(floorRows, 'second');
    const areaFloor3Plus = sumLeasableByCategory(floorRows, 'third_plus');

    const floorLeasableTotal = areaFloor1 + areaFloor2 + areaFloor3Plus;
    const actualOccupiedArea = toNumber(questionnaire?.occupiedArea, null);
    const inputLeasableArea = toNumber(questionnaire?.leasableArea, 0);
    const effectiveLeasableArea = floorLeasableTotal > 0
        ? floorLeasableTotal
        : (inputLeasableArea > 0 ? inputLeasableArea : toNumber(questionnaire?.totalArea, 0));
    const leasableAreaSource = floorLeasableTotal > 0
        ? 'derived_from_floor_sum'
        : (inputLeasableArea > 0 ? 'questionnaire' : 'fallback_total_area');
    const actualVacancyRate = effectiveLeasableArea > 0
        && Number.isFinite(actualOccupiedArea)
        ? getVacancyRate(actualOccupiedArea, effectiveLeasableArea)
        : null;
    const selectedMarketRentFirst = manualOverrideApplied
        ? manualOverrideRate
        : marketRentAnalysis.marketRentFirst;
    const selectedMarketRentSecond = round2(selectedMarketRentFirst * EXCEL_PARITY_CONFIG.valuation.floor2Multiplier);
    const selectedMarketRentThirdPlus = round2(selectedMarketRentFirst * EXCEL_PARITY_CONFIG.valuation.floor3PlusMultiplier);
    const landDetails = await calculateLandShareDetails(questionnaire);
    const landShare = toNumber(landDetails.share, 0);
    const subjectContext = {
        ...questionnaire,
        leasableArea: effectiveLeasableArea,
        occupiedArea: Number.isFinite(actualOccupiedArea) ? actualOccupiedArea : questionnaire?.occupiedArea,
    };
    const vacancyResult = calculateVacancyRate({
        questionnaire,
        subject: subjectContext,
        analogStats: marketRentAnalysis,
    });
    const opexResult = calculateOpexRate({
        subject: subjectContext,
        questionnaire,
        marketContext: marketRentAnalysis,
    });
    const assumptions = [];

    if (manualOverrideApplied) {
        assumptions.push({
            key: 'manual_rent_override',
            label: 'Ставка аренды задана вручную',
            penalty: 10,
        });
    }
    if (vacancyResult.source === 'market') {
        assumptions.push({
            key: 'profile_vacancy',
            label: 'Vacancy взята из рыночного профиля',
            penalty: 2,
        });
    }
    if (vacancyResult.source === 'fallback') {
        assumptions.push({
            key: 'fallback_vacancy',
            label: 'Vacancy взята из fallback-профиля',
            penalty: 8,
        });
    }
    if (opexResult.source === 'profile') {
        assumptions.push({
            key: 'profile_opex',
            label: 'OPEX взят из параметрического профиля',
            penalty: 4,
        });
    }
    if (!landDetails.isComplete) {
        assumptions.push({
            key: 'land_fallback',
            label: 'Земля рассчитана по fallback-логике',
            penalty: landDetails.isCalculated ? 4 : 10,
        });
    }

    const provisionalReliability = calculateReliabilityScore({
        selectedAnalogs: marketRentAnalysis.adjustedRates.filter((item) => item.includedInRentCalculation),
        excludedAnalogs: marketRentAnalysis.adjustedRates.filter((item) => item.includedInRentCalculation === false),
        subject: subjectContext,
        landData: landDetails,
        assumptions,
        dispersionStats: marketRentAnalysis.stats,
        rentDiagnostics: marketRentAnalysis,
        vacancyResult,
        rentalRateSource,
        rentCalculationMode: marketRentAnalysis.rentCalculationMode,
    });
    const capRateResult = calculateCapitalizationRate({
        subject: subjectContext,
        questionnaire,
        analogStats: marketRentAnalysis,
        reliability: provisionalReliability,
        vacancyResult,
    });

    assumptions.push({
        key: 'profile_cap_rate',
        label: 'Cap rate получен из параметрического профиля',
        penalty: capRateResult.source === 'rule_based_profile' ? 4 : 0,
    });

    const reliabilityDetails = calculateReliabilityScore({
        selectedAnalogs: marketRentAnalysis.adjustedRates.filter((item) => item.includedInRentCalculation),
        excludedAnalogs: marketRentAnalysis.adjustedRates.filter((item) => item.includedInRentCalculation === false),
        subject: subjectContext,
        landData: landDetails,
        assumptions,
        dispersionStats: marketRentAnalysis.stats,
        rentDiagnostics: marketRentAnalysis,
        vacancyResult,
        rentalRateSource,
        rentCalculationMode: marketRentAnalysis.rentCalculationMode,
    });

    if (
        questionnaire?.calculationMethod === 'actual_market' &&
        floorRows.length > 0 &&
        floorLeasableTotal <= 0
    ) {
        throw new Error('Для расчета по фактическим данным необходимо заполнить арендопригодные площади по этажам');
    }

    let formulaResult;

    if (floorLeasableTotal > 0) {
        formulaResult = calculateIncomeValuation({
            totalArea: questionnaire?.totalArea,
            leasableAreaFloor1: areaFloor1,
            leasableAreaFloor2: areaFloor2,
            leasableAreaFloor3Plus: areaFloor3Plus,
            marketRentFirst: selectedMarketRentFirst,
            occupiedArea: null,
            vacancyRate: vacancyResult.rate,
            opexRate: opexResult.opexRate,
            capitalizationRate: capRateResult.finalCapRate,
            landShare,
        });
    } else {
        const vacancyRateUsed = vacancyResult.rate;
        const fallbackLeasableArea = effectiveLeasableArea || toNumber(questionnaire?.totalArea, 0);

        const pgi = calculatePGI(fallbackLeasableArea, selectedMarketRentFirst);
        const egi = calculateEGI(pgi, vacancyRateUsed);
        const opex = calculateOPEX(egi, opexResult.opexRate);
        const noi = calculateNOI(egi, opex);
        const capitalizationRate = capRateResult.finalCapRate;
        const valueTotal = noi / capitalizationRate;
        const finalValue = Math.max(0, valueTotal - landShare);
        const pricePerM2 = toNumber(questionnaire?.totalArea, 0) > 0
            ? finalValue / toNumber(questionnaire?.totalArea, 0)
            : 0;

        formulaResult = {
            marketRentFirst: round2(selectedMarketRentFirst),
            marketRentSecond: round2(selectedMarketRentSecond),
            marketRentThirdPlus: round2(selectedMarketRentThirdPlus),
            floor1Income: 0,
            floor2Income: 0,
            floor3PlusIncome: 0,
            leasableAreaTotal: round2(fallbackLeasableArea),
            vacancyRate: vacancyRateUsed,
            vacancyRatePercent: round2(vacancyRateUsed * 100),
            pgi: round2(pgi),
            egi: round2(egi),
            opex: round2(opex),
            noi: round2(noi),
            valueTotal: round2(valueTotal),
            landShare,
            finalValue: round2(finalValue),
            pricePerM2: round2(pricePerM2),
        };
    }

    const floorDetails = floorRows.map((row) => {
        let monthlyRate = formulaResult.marketRentThirdPlus;

        if (row.floorCategory === 'first') {
            monthlyRate = formulaResult.marketRentFirst;
        } else if (row.floorCategory === 'second') {
            monthlyRate = formulaResult.marketRentSecond;
        }

        return {
            ...row,
            monthlyRate,
            annualIncome: round2(toNumber(row.leasableArea, 0) * monthlyRate * 12),
        };
    });

    return {
        marketRentMonth: formulaResult.marketRentFirst,
        marketRentYear: formulaResult.marketRentFirst * 12,
        marketRentFirst: formulaResult.marketRentFirst,
        marketRentSecond: formulaResult.marketRentSecond,
        marketRentThirdPlus: formulaResult.marketRentThirdPlus,
        rentalRateSource,
        rentalRateSelectionMethod: marketRentAnalysis.selectionMethod,
        manualOverrideApplied,
        manualOverrideRate: manualOverrideApplied ? manualOverrideRate : null,
        marketDerivedRentFirst: marketRentAnalysis.marketRentFirst,
        marketDerivedRentSecond: marketRentAnalysis.marketRentSecond,
        marketDerivedRentThirdPlus: marketRentAnalysis.marketRentThirdPlus,
        marketRentAverage: marketRentAnalysis.simpleAverageRate,
        marketRentMedian: marketRentAnalysis.correctedRateMedian ?? marketRentAnalysis.simpleMedianRate,
        marketRentCorrectedMedian: marketRentAnalysis.correctedRateMedian ?? marketRentAnalysis.simpleMedianRate,
        marketRentSimpleMedian: marketRentAnalysis.simpleMedianRate,
        marketRentSimpleAverage: marketRentAnalysis.simpleAverageRate,
        marketRentTrimmedMean: marketRentAnalysis.trimmedMeanRate,
        marketRentMin: marketRentAnalysis.minAdjustedRate,
        marketRentMax: marketRentAnalysis.maxAdjustedRate,
        rentCalculationMode: marketRentAnalysis.rentCalculationMode,
        scaleAdjustmentApplied: marketRentAnalysis.scaleAdjustmentApplied,
        averageScaleFactor: marketRentAnalysis.averageScaleFactor,
        averageAreaRatio: marketRentAnalysis.averageAreaRatio,
        maxAreaRatio: marketRentAnalysis.maxAreaRatio,
        scaleGuardrailApplied: marketRentAnalysis.scaleGuardrailApplied,
        scaleGuardrailUpperLimit: marketRentAnalysis.scaleGuardrailUpperLimit,
        analogsInitialCount: marketRentAnalysis.analogsInitialCount,
        analogsUsedCount: marketRentAnalysis.analogsUsedCount,
        analogsExcludedCount: marketRentAnalysis.analogsExcludedCount,
        correctedRateMin: marketRentAnalysis.correctedRateMin,
        correctedRateMedian: marketRentAnalysis.correctedRateMedian,
        correctedRateMax: marketRentAnalysis.correctedRateMax,
        correctedRateStdDev: marketRentAnalysis.correctedRateStdDev,
        correctedRateIQR: marketRentAnalysis.correctedRateIQR,
        dispersionLevel: marketRentAnalysis.dispersionLevel,
        sampleSizeLevel: marketRentAnalysis.sampleSizeLevel,
        stabilityFlag: marketRentAnalysis.stabilityFlag,
        floorDetails,
        floorLeasableAreaTotal: round2(floorLeasableTotal),
        leasableAreaSource,
        leasableArea: round2(effectiveLeasableArea > 0 ? effectiveLeasableArea : formulaResult.leasableAreaTotal),
        occupiedArea: Number.isFinite(actualOccupiedArea) ? actualOccupiedArea : 0,
        vacancyRate: formulaResult.vacancyRate,
        vacancyRatePercent: formulaResult.vacancyRatePercent,
        pgi: formulaResult.pgi,
        egi: formulaResult.egi,
        opex: formulaResult.opex,
        noi: formulaResult.noi,
        opexRate: opexResult.opexRate,
        opexRateSource: opexResult.source,
        opexRateReasoning: opexResult.reasoning,
        opexProfileUsed: opexResult.profileUsed,
        opexAdjustments: opexResult.adjustments,
        baseOpexRate: opexResult.baseRate,
        opexBreakdown: opexResult.breakdown,
        capitalizationRate: capRateResult.finalCapRate,
        capitalizationRateSource: capRateResult.source,
        capitalizationRateSourceLabel: capRateResult.sourceLabel,
        baseCapitalizationRate: capRateResult.baseCapRate,
        capitalizationAdjustments: capRateResult.adjustments,
        capRateBreakdown: capRateResult.capRateBreakdown,
        valueTotal: formulaResult.valueTotal,
        landShare: formulaResult.landShare,
        landDetails,
        finalValue: Math.max(0, formulaResult.finalValue),
        pricePerM2: formulaResult.pricePerM2,
        vacancyRateSource: vacancyResult.source,
        vacancyRateSourceLabel: vacancyResult.sourceLabel,
        baseVacancyRate: vacancyResult.baseRate,
        vacancyAdjustments: vacancyResult.adjustments,
        vacancyBreakdown: vacancyResult.breakdown,
        actualVacancyRate,
        actualVacancyRatePercent: actualVacancyRate === null ? null : round2(actualVacancyRate * 100),
        analogsCount: marketRentAnalysis.analogCount,
        selectedAnalogsCount: marketRentAnalysis.selectedCount,
        excludedAnalogsCount: marketRentAnalysis.excludedCount,
        analogsQualityScore: marketRentAnalysis.qualityScore,
        adjustedRates: marketRentAnalysis.adjustedRates || [],
        marketRentStats: marketRentAnalysis.stats,
        reliabilityScore: reliabilityDetails.score,
        reliabilityDetails,
        assumptions,
    };
}
