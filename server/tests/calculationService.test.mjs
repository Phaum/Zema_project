import test from 'node:test';
import assert from 'node:assert/strict';

import {
    adjustAnalogRate,
    calculateAnalogWeight,
    calculateCapitalizationRate,
    calculateLandShareDetails,
    calculateMarketRent,
    calculateOpexRate,
    calculateValuation,
    calculateVacancyRate,
    calculateReliabilityScore,
    scoreAnalogueRelevance,
    selectAnalogsByMahalanobis,
} from '../services/calculationService.js';

function buildAnalog(id, adjustedRate) {
    const baseRate = adjustedRate / 0.95;

    return {
        id,
        price_per_sqm_cleaned: baseRate,
        area_total: 685,
        distance_to_metro: 1,
        floor_location: 'первый',
        offer_date: null,
        environment_category_1: null,
        environment_category_2: null,
        environment_category_3: null,
    };
}

test('adjustAnalogRate applies downward scale adjustment for substantially smaller analogs', () => {
    const questionnaire = {
        totalArea: 18000,
        valuationDate: '2025-01-01',
        businessCenterClass: 'B+',
        marketClassResolved: 'B+',
    };

    const analog = {
        id: 'scale-1',
        area_total: 500,
        class_offer: 'B+',
        distance_to_metro: 1,
        floor_location: 'первый',
        offer_date: '2025-01-01',
        district: 'Приморский',
    };

    const result = adjustAnalogRate(analog, questionnaire, 1000);

    assert.ok(result.scaleAdjustment < 1);
    assert.equal(result.scaleAreaRatio, 36);
    assert.ok(result.correctedRate < 1000);
});

test('adjustAnalogRate clamps total corrected rate deviation to 25 percent', () => {
    const questionnaire = {
        totalArea: 120000,
        valuationDate: '2025-01-01',
        businessCenterClass: 'A+',
        marketClassResolved: 'A+',
        district: 'Центральный',
        metroDistance: 0.2,
        constructionYear: 2025,
        isHistoricalCenter: true,
    };

    const analog = {
        id: 'clamp-1',
        area_total: 200,
        class_offer: 'C',
        district: 'Колпинский',
        distance_to_metro: 8,
        floor_location: 'подвал',
        offer_date: '2023-01-01',
        year_built_commissioning: 1980,
    };

    const result = adjustAnalogRate(analog, questionnaire, 1000);

    assert.equal(result.adjustmentClampApplied, true);
    assert.ok(result.totalAdjustmentFactor <= 1.25);
    assert.ok(result.totalAdjustmentFactor >= 0.75);
});

test('calculateAnalogWeight applies soft penalty to much smaller analogs', () => {
    const questionnaire = {
        totalArea: 18000,
        district: 'Приморский',
        metroDistance: 0.8,
        valuationDate: '2025-01-01',
        businessCenterClass: 'B+',
        marketClassResolved: 'B+',
    };

    const baseAnalog = {
        class_offer: 'B+',
        district: 'Приморский',
        distance_to_metro: 0.8,
        offer_date: '2025-01-01',
        floor_location: 'первый',
        price_per_sqm_cleaned: 1000,
    };

    const smallAnalogWeight = calculateAnalogWeight(
        { ...baseAnalog, id: 'small', area_total: 500 },
        questionnaire
    );
    const largerAnalogWeight = calculateAnalogWeight(
        { ...baseAnalog, id: 'large', area_total: 9000 },
        questionnaire
    );

    assert.equal(smallAnalogWeight.components.scaleWeightPenalty, 0.2);
    assert.equal(largerAnalogWeight.components.scaleWeightPenalty, 0.9);
    assert.ok(smallAnalogWeight.weight < largerAnalogWeight.weight);
});

test('scoreAnalogueRelevance strongly penalizes analogs with severe scale mismatch', () => {
    const questionnaire = {
        totalArea: 18000,
        district: 'Приморский',
        metroDistance: 0.8,
        valuationDate: '2025-01-01',
        businessCenterClass: 'B+',
        marketClassResolved: 'B+',
        objectType: 'business_center',
    };

    const closeAnalog = {
        class_offer: 'B+',
        district: 'Приморский',
        area_total: 12000,
        distance_to_metro: 0.85,
        offer_date: '2025-01-15',
        address_offer: 'Санкт-Петербург, Приморский проспект, 1',
    };
    const tinyAnalog = {
        class_offer: 'B+',
        district: 'Приморский',
        area_total: 450,
        distance_to_metro: 0.85,
        offer_date: '2025-01-15',
        address_offer: 'Санкт-Петербург, Приморский проспект, 2',
    };

    const closeScore = scoreAnalogueRelevance(questionnaire, closeAnalog);
    const tinyScore = scoreAnalogueRelevance(questionnaire, tinyAnalog);

    assert.ok(closeScore.score > tinyScore.score);
    assert.ok(closeScore.components.scaleSimilarity > tinyScore.components.scaleSimilarity);
    assert.ok((closeScore.components.areaRatio || 0) < (tinyScore.components.areaRatio || 999));
});

test('calculateMarketRent applies guardrail when weighted result drifts above simple median', () => {
    const questionnaire = {
        totalArea: 18000,
        district: 'Приморский',
        metroDistance: 0.8,
        valuationDate: '2025-01-01',
        businessCenterClass: 'B+',
        marketClassResolved: 'B+',
        calculationMethod: 'market',
        rentCalculationMode: 'advanced_experimental',
    };

    const result = calculateMarketRent([
        {
            id: 'high-1',
            price_per_sqm_cleaned: 2000,
            area_total: 9000,
            class_offer: 'B+',
            district: 'Приморский',
            distance_to_metro: 0.8,
            floor_location: 'первый',
            offer_date: '2025-01-10',
        },
        {
            id: 'high-2',
            price_per_sqm_cleaned: 2100,
            area_total: 8500,
            class_offer: 'B+',
            district: 'Приморский',
            distance_to_metro: 0.75,
            floor_location: 'первый',
            offer_date: '2025-01-15',
        },
        {
            id: 'low-1',
            price_per_sqm_cleaned: 1000,
            area_total: 600,
            class_offer: 'B',
            district: 'Колпинский',
            distance_to_metro: 6,
            floor_location: 'первый',
            offer_date: '2024-01-01',
        },
        {
            id: 'low-2',
            price_per_sqm_cleaned: 950,
            area_total: 650,
            class_offer: 'B',
            district: 'Красносельский',
            distance_to_metro: 5,
            floor_location: 'первый',
            offer_date: '2024-02-01',
        },
    ], questionnaire);

    assert.equal(result.scaleGuardrailApplied, true);
    assert.ok(result.weightedMedianRate > result.simpleMedianRate);
    assert.ok(result.marketRentFirst <= (((result.simpleMedianRate || 0) * 1.15) + 0.01));
    assert.ok(result.adjustedRates.every((item) => Number.isFinite(item.preWeight)));
    assert.ok(result.adjustedRates.every((item) => item.includedInRentCalculation === false || Number.isFinite(item.finalWeight)));
});

test('calculateMarketRent uses stable trimmed mean by default for 7+ valid analogs', () => {
    const questionnaire = {
        totalArea: 12000,
        district: 'Приморский',
        metroDistance: 0.9,
        valuationDate: '2025-01-01',
        businessCenterClass: 'B+',
        marketClassResolved: 'B+',
    };

    const analogs = [900, 920, 940, 960, 980, 1000, 2600].map((rate, index) => ({
        id: `stable-${index + 1}`,
        price_per_sqm_cleaned: rate,
        area_total: 11000 + (index * 100),
        class_offer: 'B+',
        district: 'Приморский',
        distance_to_metro: 0.85,
        floor_location: 'первый',
        offer_date: '2025-01-10',
    }));

    const result = calculateMarketRent(analogs, questionnaire);

    assert.equal(result.rentCalculationMode, 'stable_default');
    assert.equal(result.selectionMethod, 'stable_trimmed_mean');
    assert.equal(result.sampleSizeLevel, 'medium');
    assert.equal(result.analogsInitialCount, 7);
    assert.equal(result.analogsUsedCount, 5);
    assert.equal(result.analogsExcludedCount, 2);
    assert.equal(result.marketRentFirst, result.trimmedMeanRate);
    assert.equal(result.stabilityFlag, 'stable');
});

test('calculateMarketRent supports advanced experimental weighted median mode', () => {
    const questionnaire = {
        totalArea: 12000,
        district: 'Приморский',
        metroDistance: 0.9,
        valuationDate: '2025-01-01',
        businessCenterClass: 'B+',
        marketClassResolved: 'B+',
        rentCalculationMode: 'advanced_experimental',
    };

    const analogs = [900, 930, 960, 990, 1020, 1050, 1080].map((rate, index) => ({
        id: `advanced-${index + 1}`,
        price_per_sqm_cleaned: rate,
        area_total: 10000 + (index * 250),
        class_offer: 'B+',
        district: 'Приморский',
        distance_to_metro: 0.9,
        floor_location: 'первый',
        offer_date: '2025-01-10',
    }));

    const result = calculateMarketRent(analogs, questionnaire);

    assert.equal(result.rentCalculationMode, 'advanced_experimental');
    assert.equal(result.selectionMethod, 'advanced_weighted_median');
    assert.ok(result.analogsUsedCount >= 5);
});

test('calculateVacancyRate prioritizes market profile over factual occupancy when profile is available', () => {
    const result = calculateVacancyRate({
        questionnaire: {
            businessCenterClass: 'B+',
            marketClassResolved: 'B+',
            district: 'Приморский',
            valuationDate: '2025-01-01',
        },
        subject: {
            leasableArea: 1000,
            occupiedArea: 400,
        },
        analogStats: {
            qualityScore: 0.8,
            stats: {
                dispersionRatio: 0.12,
            },
        },
    });

    assert.equal(result.source, 'market');
    assert.ok(result.rate > 0);
    assert.equal(result.breakdown.vacancySource, 'market');
});

test('calculateValuation builds stable market-driven result for Lakhta-like case', async () => {
    const questionnaire = {
        buildingCadastralNumber: '78:34:0413901:1010',
        totalArea: 18023.4,
        leasableArea: 12757.2,
        occupiedArea: 9697.3,
        aboveGroundFloors: 6,
        undergroundFloors: 1,
        metroDistance: 0.95,
        district: 'Приморский',
        valuationDate: '2025-01-01',
        calculationMethod: 'actual_market',
        businessCenterClass: 'B+',
        marketClassResolved: 'B+',
        landCadastralNumber: '78:34:0413901:8',
        landCadCost: 52878166.88,
        totalOksAreaOnLand: 18023.4,
        floors: [
            {
                id: 'first',
                floorCategory: 'first',
                floorLocation: 'Первый этаж',
                area: 3753,
                leasableArea: 3218.7,
                avgLeasableRoomArea: 183,
            },
            {
                id: 'second',
                floorCategory: 'second',
                floorLocation: 'Второй этаж',
                area: 1200,
                leasableArea: 1060.2,
                avgLeasableRoomArea: 183,
            },
            {
                id: 'third_plus',
                floorCategory: 'third_plus',
                floorLocation: 'Третий этаж и выше',
                area: 13070.4,
                leasableArea: 8478.3,
                avgLeasableRoomArea: 183,
            },
        ],
        environmentCategory1: 'промзона',
        environmentCategory2: 'общественно-деловая застройка',
        environmentCategory3: 'многоквартирная жилая застройка',
        isHistoricalCenter: false,
        zoneCode: 'ТП3',
    };

    const selectedAnalogs = [
        {
            id: 'V_puo_2025_9_321659355',
            price_per_sqm_cleaned: 800,
            area_total: 381,
            class_offer: 'B+',
            district: 'Московский',
            distance_to_metro: 0.73,
            floor_location: 'Цоколь',
            offer_date: '2025-09-17',
            quarter: '2025-Q3',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
            zone_code: 'ТД1-1',
            year_built_commissioning: 1997,
        },
        {
            id: 'V_puo_2025_8_316756411',
            price_per_sqm_cleaned: 1097.4539069359087,
            area_total: 153,
            class_offer: 'B+',
            district: 'Фрунзенский',
            distance_to_metro: 1.27,
            floor_location: 'первый',
            offer_date: '2025-08-15',
            quarter: '2025-Q3',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
            zone_code: 'ТП3',
            year_built_commissioning: 2017,
        },
        {
            id: 'V_puo_2025_9_320596280',
            price_per_sqm_cleaned: 1170.6175007316358,
            area_total: 69.4,
            class_offer: 'B+',
            district: 'Приморский',
            distance_to_metro: 1.05,
            floor_location: 'второй',
            offer_date: '2025-09-17',
            quarter: '2025-Q3',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
            zone_code: 'ТП3',
            year_built_commissioning: 2006,
        },
        {
            id: 'V_puo_2025_10_322807700',
            price_per_sqm_cleaned: 1202.4406779661017,
            area_total: 295,
            class_offer: 'B+',
            district: 'Московский',
            distance_to_metro: 1.4,
            floor_location: 'первый',
            offer_date: '2025-10-14',
            quarter: '2025-Q4',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
            zone_code: 'ТД3',
            year_built_commissioning: 1975,
        },
        {
            id: 'V_puo_2025_5_316376249',
            price_per_sqm_cleaned: 1250,
            area_total: 74,
            class_offer: 'B+',
            district: 'Приморский',
            distance_to_metro: 1.27,
            floor_location: 'первый',
            offer_date: '2025-05-15',
            quarter: '2025-Q2',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
            zone_code: 'ТП3',
            year_built_commissioning: 2016,
        },
        {
            id: 'V_puo_2025_9_321659350',
            price_per_sqm_cleaned: 1300,
            area_total: 222,
            class_offer: 'B+',
            district: 'Московский',
            distance_to_metro: 0.73,
            floor_location: 'Цоколь',
            offer_date: '2025-09-17',
            quarter: '2025-Q3',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
            zone_code: 'ТД1-1',
            year_built_commissioning: 1997,
        },
        {
            id: 'V_puo_2025_9_321659346',
            price_per_sqm_cleaned: 1300,
            area_total: 180,
            class_offer: 'B+',
            district: 'Московский',
            distance_to_metro: 0.73,
            floor_location: 'Цоколь',
            offer_date: '2025-09-17',
            quarter: '2025-Q3',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
            zone_code: 'ТД1-1',
            year_built_commissioning: 1997,
        },
        {
            id: 'V_puo_2025_9_320465726',
            price_per_sqm_cleaned: 1311.4754098360656,
            area_total: 305,
            class_offer: 'B+',
            district: 'Выборгский',
            distance_to_metro: 0.96,
            floor_location: 'первый',
            offer_date: '2025-09-17',
            quarter: '2025-Q3',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
            zone_code: 'ТД1-1',
            year_built_commissioning: 2003,
        },
    ];

    const valuation = await calculateValuation(questionnaire, selectedAnalogs, 0);

    assert.ok(valuation.marketRentFirst > 0);
    assert.ok(valuation.marketRentSecond > valuation.marketRentFirst);
    assert.ok(valuation.marketRentThirdPlus < valuation.marketRentFirst);
    assert.equal(valuation.vacancyRateSource, 'market');
    assert.equal(valuation.rentalRateSelectionMethod, 'stable_trimmed_mean');
    assert.equal(valuation.opexRateSource, 'profile');
    assert.equal(valuation.capitalizationRateSource, 'rule_based_profile');
    assert.ok(valuation.reliabilityScore > 0 && valuation.reliabilityScore < 100);
    assert.ok(valuation.pgi > 0);
    assert.ok(Math.abs(valuation.landShare - 52878166.88) < 0.01);
    assert.ok(valuation.finalValue > 0);
    assert.ok(valuation.pricePerM2 > 0);
    assert.ok(Array.isArray(valuation.adjustedRates));
    assert.ok(valuation.adjustedRates.every((row) => Array.isArray(row.adjustments?.adjustments)));
});

test('calculateValuation keeps explainable output for Premier Liga-like case', async () => {
    const questionnaire = {
        buildingCadastralNumber: '78:14:0753001:178',
        totalArea: 18850.6,
        leasableArea: 16547,
        occupiedArea: 15760.8,
        aboveGroundFloors: 13,
        undergroundFloors: 0,
        metroDistance: 0.68,
        district: 'Московский',
        valuationDate: '2025-01-01',
        calculationMethod: 'actual_market',
        businessCenterClass: 'B+',
        marketClassResolved: 'B+',
        landCadastralNumber: '78:14:0753001:20',
        landCadCost: 433631521.03,
        totalOksAreaOnLand: 42011.2,
        floors: [
            {
                id: 'first',
                floorCategory: 'first',
                floorLocation: 'Первый этаж',
                area: 1450,
                leasableArea: 1205,
                avgLeasableRoomArea: 685,
            },
            {
                id: 'second',
                floorCategory: 'second',
                floorLocation: 'Второй этаж',
                area: 1450,
                leasableArea: 1313.2,
                avgLeasableRoomArea: 685,
            },
            {
                id: 'third_plus',
                floorCategory: 'third_plus',
                floorLocation: 'Третий этаж и выше',
                area: 15950.6,
                leasableArea: 14028.8,
                avgLeasableRoomArea: 685,
            },
        ],
        environmentCategory1: 'промзона',
        environmentCategory2: 'общественно-деловая застройка',
        environmentCategory3: 'многоквартирная жилая застройка',
        isHistoricalCenter: false,
    };

    const selectedAnalogs = [
        {
            id: 'a1',
            price_per_sqm_cleaned: 800,
            area_total: 844,
            class_offer: 'B+',
            district: 'Московский',
            distance_to_metro: 0.7331,
            floor_location: 'цоколь',
            offer_date: null,
            quarter: '2025-Q4',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
        },
        {
            id: 'a2',
            price_per_sqm_cleaned: 951.1267193444543,
            area_total: 538,
            class_offer: 'B+',
            district: 'Московский',
            distance_to_metro: 1.43312,
            floor_location: 'второй',
            offer_date: null,
            quarter: '2025-Q2',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
        },
        {
            id: 'a3',
            price_per_sqm_cleaned: 961.5384615384615,
            area_total: 650,
            class_offer: 'B+',
            district: 'Московский',
            distance_to_metro: 1.67267,
            floor_location: 'первый',
            offer_date: null,
            quarter: '2025-Q2',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
        },
        {
            id: 'a4',
            price_per_sqm_cleaned: 1166.6666666666667,
            area_total: 708.9,
            class_offer: 'B+',
            district: 'Московский',
            distance_to_metro: 1.4235,
            floor_location: 'первый',
            offer_date: null,
            quarter: '2025-Q3',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
        },
        {
            id: 'a5',
            price_per_sqm_cleaned: 1166.6666666666667,
            area_total: 708.9,
            class_offer: 'B+',
            district: 'Московский',
            distance_to_metro: 1.4235,
            floor_location: 'первый',
            offer_date: null,
            quarter: '2025-Q4',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
        },
        {
            id: 'a6',
            price_per_sqm_cleaned: 1243.7810945273632,
            area_total: 700.5,
            class_offer: 'B+',
            district: 'Московский',
            distance_to_metro: 1.70089,
            floor_location: 'третий и выше',
            offer_date: null,
            quarter: '2025-Q3',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
        },
        {
            id: 'a7',
            price_per_sqm_cleaned: 1243.7810945273632,
            area_total: 718.4,
            class_offer: 'B+',
            district: 'Московский',
            distance_to_metro: 1.70089,
            floor_location: 'третий и выше',
            offer_date: null,
            quarter: '2025-Q3',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
        },
        {
            id: 'a8',
            price_per_sqm_cleaned: 1300,
            area_total: 500,
            class_offer: 'B+',
            district: 'Московский',
            distance_to_metro: 3.31373,
            floor_location: 'второй',
            offer_date: null,
            quarter: '2025-Q4',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
        },
        {
            id: 'a9',
            price_per_sqm_cleaned: 1300,
            area_total: 500,
            class_offer: 'B+',
            district: 'Московский',
            distance_to_metro: 3.31373,
            floor_location: 'второй',
            offer_date: null,
            quarter: '2025-Q4',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
        },
        {
            id: 'a10',
            price_per_sqm_cleaned: 1562.5,
            area_total: 750,
            class_offer: 'B+',
            district: 'Московский',
            distance_to_metro: 1.12537,
            floor_location: 'третий и выше',
            offer_date: null,
            quarter: '2025-Q3',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
        },
    ];

    const valuation = await calculateValuation(questionnaire, selectedAnalogs, 0);

    assert.ok(valuation.marketRentFirst > 0);
    assert.equal(valuation.vacancyRateSource, 'market');
    assert.equal(valuation.rentalRateSelectionMethod, 'stable_trimmed_mean');
    assert.equal(valuation.opexRateSource, 'profile');
    assert.equal(valuation.capitalizationRateSource, 'rule_based_profile');
    assert.ok(valuation.capitalizationRate >= 0.08 && valuation.capitalizationRate <= 0.14);
    assert.ok(valuation.pgi > 0);
    assert.ok(Math.abs(valuation.landShare - 194266921.42144) < 0.05);
    assert.ok(valuation.finalValue > 0);
    assert.ok(valuation.pricePerM2 > 0);
    assert.ok(valuation.reliabilityScore > 0 && valuation.reliabilityScore < 100);
    assert.ok(valuation.marketRentStats.averageRelevance > 0);
});

test('calculateValuation resolves vacancy, OPEX and cap rate from profiles when fact data absent', async () => {
    const questionnaire = {
        totalArea: 1000,
        leasableArea: 900,
        occupiedArea: null,
        aboveGroundFloors: 5,
        metroDistance: 300,
        district: 'Центральный',
        businessCenterClass: 'A',
        valuationDate: '2026-03-01',
        calculationMethod: 'market',
        floors: [
            {
                id: 'first',
                floorCategory: 'first',
                floorLocation: 'Первый этаж',
                area: 300,
                leasableArea: 250,
                avgLeasableRoomArea: 120,
            },
            {
                id: 'second',
                floorCategory: 'second',
                floorLocation: 'Второй этаж',
                area: 300,
                leasableArea: 250,
                avgLeasableRoomArea: 120,
            },
            {
                id: 'third_plus',
                floorCategory: 'third_plus',
                floorLocation: 'Третий этаж и выше',
                area: 400,
                leasableArea: 400,
                avgLeasableRoomArea: 120,
            },
        ],
    };

    const selectedAnalogs = Array.from({ length: 10 }, (_, index) => buildAnalog(`m${index + 1}`, 1000 + index));

    const valuation = await calculateValuation(questionnaire, selectedAnalogs, 0);

    assert.equal(valuation.capitalizationRateSource, 'rule_based_profile');
    assert.ok(Math.abs(valuation.baseCapitalizationRate - 0.095) < 0.0001);
    assert.ok(valuation.capitalizationRate >= 0.08 && valuation.capitalizationRate <= 0.14);
    assert.ok(valuation.capitalizationAdjustments.length >= 1);
    assert.equal(valuation.vacancyRateSource, 'market');
    assert.ok(Math.abs(valuation.baseVacancyRate - 0.08) < 0.0001);
    assert.ok(valuation.vacancyRate >= 0.03 && valuation.vacancyRate <= 0.20);
    assert.ok(valuation.vacancyAdjustments.length >= 1);
    assert.equal(valuation.opexRateSource, 'profile');
    assert.ok(valuation.opexRate >= 0.16 && valuation.opexRate <= 0.28);
    assert.ok(valuation.opexAdjustments.length >= 1);
});

test('calculateCapitalizationRate increases with weak reliability, dispersion and scale mismatch', () => {
    const baseInput = {
        questionnaire: {
            businessCenterClass: 'B+',
            marketClassResolved: 'B+',
            district: 'Приморский',
            environmentCategory1: 'общественно-деловая застройка',
            environmentCategory2: 'многоквартирная жилая застройка',
        },
        subject: {
            totalArea: 18000,
            district: 'Приморский',
            metroDistance: 0.8,
            marketClassResolved: 'B+',
            leasableArea: 12000,
            mapPointLat: 59.9,
            mapPointLng: 30.3,
        },
        vacancyResult: { rate: 0.09 },
    };

    const strong = calculateCapitalizationRate({
        ...baseInput,
        analogStats: { stats: { dispersionRatio: 0.08 }, averageAreaRatio: 1.8 },
        reliability: {
            score: 88,
            metrics: {
                dispersionPct: 8,
                averageAreaRatio: 1.8,
                subjectDataQualityScoreNormalized: 0.9,
            },
        },
    });

    const weak = calculateCapitalizationRate({
        ...baseInput,
        analogStats: { stats: { dispersionRatio: 0.28 }, averageAreaRatio: 8.5 },
        reliability: {
            score: 52,
            metrics: {
                dispersionPct: 28,
                averageAreaRatio: 8.5,
                subjectDataQualityScoreNormalized: 0.35,
            },
        },
        vacancyResult: { rate: 0.12 },
    });

    assert.ok(weak.finalCapRate > strong.finalCapRate);
    assert.ok((weak.capRateBreakdown?.reliabilityAdjustment || 0) > 0);
    assert.ok((weak.capRateBreakdown?.dispersionAdjustment || 0) > 0);
    assert.ok((weak.capRateBreakdown?.scaleMismatchAdjustment || 0) > 0);
    assert.ok((weak.capRateBreakdown?.subjectDataAdjustment || 0) > 0);
});

test('calculateLandShareDetails flags inconsistent total Oks area and falls back conservatively', async () => {
    const details = await calculateLandShareDetails({
        landCadastralNumber: '78:00:0000000:1',
        landCadCost: 1000000,
        totalOksAreaOnLand: 900,
        totalArea: 1200,
    });

    assert.equal(details.isCalculated, true);
    assert.equal(details.isComplete, false);
    assert.equal(details.source, 'fallback_subject_exceeds_total_oks');
    assert.equal(details.share, 1000000);
    assert.ok(details.warnings.some((item) => item.includes('меньше площади оцениваемого объекта')));
});

test('calculateMarketRent excludes rate outliers and keeps comparable weights', () => {
    const questionnaire = {
        businessCenterClass: 'B+',
        district: 'Московский',
        valuationDate: '2026-03-01',
        metroDistance: 600,
        rentCalculationMode: 'advanced_experimental',
        floors: [
            {
                id: 'first',
                floorCategory: 'first',
                floorLocation: 'Первый этаж',
                area: 1400,
                leasableArea: 1200,
                avgLeasableRoomArea: 650,
            },
        ],
    };

    const selectedAnalogs = [
        {
            id: 'normal_1',
            district: 'Московский',
            class_offer: 'B+',
            price_per_sqm_cleaned: 980,
            area_total: 640,
            distance_to_metro: 550,
            floor_location: 'первый',
            offer_date: '2026-02-10',
            mahalanobisDistance: 0.2,
        },
        {
            id: 'normal_2',
            district: 'Московский',
            class_offer: 'B+',
            price_per_sqm_cleaned: 1020,
            area_total: 670,
            distance_to_metro: 700,
            floor_location: 'первый',
            offer_date: '2026-01-20',
            mahalanobisDistance: 0.25,
        },
        {
            id: 'normal_3',
            district: 'Московский',
            class_offer: 'B+',
            price_per_sqm_cleaned: 1010,
            area_total: 630,
            distance_to_metro: 620,
            floor_location: 'первый',
            offer_date: '2025-12-18',
            mahalanobisDistance: 0.23,
        },
        {
            id: 'normal_4',
            district: 'Московский',
            class_offer: 'B+',
            price_per_sqm_cleaned: 995,
            area_total: 660,
            distance_to_metro: 610,
            floor_location: 'первый',
            offer_date: '2026-02-01',
            mahalanobisDistance: 0.21,
        },
        {
            id: 'outlier',
            district: 'Московский',
            class_offer: 'B+',
            price_per_sqm_cleaned: 2400,
            area_total: 660,
            distance_to_metro: 610,
            floor_location: 'первый',
            offer_date: '2026-02-01',
            mahalanobisDistance: 0.2,
        },
    ];

    const marketRent = calculateMarketRent(selectedAnalogs, questionnaire);
    const outlier = marketRent.adjustedRates.find((item) => item.analogId === 'outlier');
    const included = marketRent.adjustedRates.filter((item) => item.includedInRentCalculation);

    assert.equal(outlier?.includedInRentCalculation, false);
    assert.equal(included.length, 4);
    assert.ok(marketRent.marketRentFirst > 0);
    assert.ok(included.every((item) => item.normalizedWeight > 0));
    assert.ok(included.every((item) => item.relevanceScore >= 0));
    assert.ok(included.every((item) => Number.isFinite(item.totalAdjustmentFactor)));
});

test('scoreAnalogueRelevance prefers same-class and same-location analogues', () => {
    const questionnaire = {
        businessCenterClass: 'B+',
        district: 'Московский',
        valuationDate: '2026-03-01',
        metroDistance: 600,
        objectType: 'business_center',
        floors: [
            {
                floorCategory: 'first',
                floorLocation: 'Первый этаж',
                avgLeasableRoomArea: 650,
                leasableArea: 1200,
            },
        ],
    };

    const strongAnalog = {
        class_offer: 'B+',
        district: 'Московский',
        area_total: 640,
        distance_to_metro: 620,
        offer_date: '2026-02-10',
        address_offer: 'Санкт-Петербург, Московский проспект, 1',
    };
    const weakAnalog = {
        class_offer: 'C',
        district: 'Колпинский',
        area_total: 200,
        distance_to_metro: 4000,
        offer_date: '2024-01-10',
        address_offer: 'Санкт-Петербург, Колпино, 1',
    };

    const strongScore = scoreAnalogueRelevance(questionnaire, strongAnalog);
    const weakScore = scoreAnalogueRelevance(questionnaire, weakAnalog);

    assert.ok(strongScore.score > weakScore.score);
    assert.ok(strongScore.components.classSimilarity > weakScore.components.classSimilarity);
    assert.ok(strongScore.components.locationSimilarity > weakScore.components.locationSimilarity);
});

test('profile helpers return bounded explainable values', () => {
    const questionnaire = {
        businessCenterClass: 'B+',
        marketClassResolved: 'B+',
        district: 'Московский',
        valuationDate: '2026-03-01',
        totalArea: 18000,
        constructionYear: 2008,
        leasableArea: 12000,
        occupiedArea: 11000,
        mapPointLat: 59.9,
        mapPointLng: 30.3,
    };

    const vacancyResult = calculateVacancyRate({ questionnaire, subject: questionnaire, analogStats: { qualityScore: 0.7, stats: { dispersionRatio: 0.18 } } });
    const opexResult = calculateOpexRate({ questionnaire, subject: questionnaire, marketContext: {} });
    const reliability = calculateReliabilityScore({
        selectedAnalogs: [
            { completenessScore: 0.8 },
            { completenessScore: 0.75 },
            { completenessScore: 0.78 },
        ],
        excludedAnalogs: [{}, {}],
        subject: questionnaire,
        landData: { isCalculated: true, isComplete: false },
        assumptions: [{ label: 'profile vacancy', penalty: 4 }],
        dispersionStats: { dispersionRatio: 0.18 },
    });
    const capRateResult = calculateCapitalizationRate({
        subject: questionnaire,
        questionnaire,
        analogStats: { qualityScore: 0.7, stats: { averageCompleteness: 0.75 } },
        reliability,
        vacancyResult,
    });

    assert.ok(vacancyResult.rate >= 0.03 && vacancyResult.rate <= 0.20);
    assert.ok(opexResult.opexRate >= 0.16 && opexResult.opexRate <= 0.28);
    assert.ok(capRateResult.finalCapRate >= 0.08 && capRateResult.finalCapRate <= 0.14);
    assert.ok(reliability.score >= 0 && reliability.score <= 100);
    assert.ok(Array.isArray(capRateResult.adjustments));
});

test('selectAnalogsByMahalanobis accounts for meter-to-kilometer normalization and coded zone/floor features', () => {
    const questionnaire = {
        valuationDate: '2025-01-01',
        district: 'Приморский',
        metroDistance: 950,
        zoneCode: 'ТП3',
        constructionYear: 2006,
        floors: [
            {
                id: 'first',
                floorCategory: 'first',
                floorLocation: 'Первый этаж',
                area: 3753,
                leasableArea: 3218.7,
                avgLeasableRoomArea: 183,
            },
        ],
    };

    const analogs = [
        {
            id: 'best',
            area_total: 183,
            year_built_commissioning: 2006,
            distance_to_metro: 1.0,
            floor_location: 'первый',
            district: 'Приморский',
            zone_code: 'ТП3',
        },
        {
            id: 'wrong_zone',
            area_total: 183,
            year_built_commissioning: 2006,
            distance_to_metro: 1.0,
            floor_location: 'первый',
            district: 'Приморский',
            zone_code: 'ТД1-1',
        },
        {
            id: 'wrong_floor',
            area_total: 183,
            year_built_commissioning: 2006,
            distance_to_metro: 1.0,
            floor_location: 'третий и выше',
            district: 'Приморский',
            zone_code: 'ТП3',
        },
        {
            id: 'wrong_district',
            area_total: 183,
            year_built_commissioning: 2006,
            distance_to_metro: 1.0,
            floor_location: 'первый',
            district: 'Центральный',
            zone_code: 'ТП3',
        },
    ];

    const { ranked } = selectAnalogsByMahalanobis(questionnaire, analogs);

    assert.equal(ranked[0]?.id, 'best');
    assert.ok(ranked[0]?.mahalanobisDistance < ranked[1]?.mahalanobisDistance);
});
