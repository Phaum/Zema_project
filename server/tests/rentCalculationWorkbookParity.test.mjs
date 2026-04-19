import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateMarketRentByNewAlgorithm } from '../services/rentCalculationService.js';

test('calculateMarketRentByNewAlgorithm reproduces Lakhta workbook corrected rates and average', () => {
    const questionnaire = {
        totalArea: 18023.4,
        leasableArea: 12757.2,
        occupiedArea: 9697.3,
        aboveGroundFloors: 6,
        undergroundFloors: 1,
        metroDistance: 0.95,
        district: 'Приморский',
        valuationDate: '2025-01-01',
        businessCenterClass: 'B+',
        marketClassResolved: 'B+',
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
    };

    const analogs = [
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
        },
    ];

    const result = calculateMarketRentByNewAlgorithm(analogs, questionnaire);
    const correctedById = Object.fromEntries(
        result.adjustedRates.map((row) => [row.analogId, row.correctedRate])
    );
    const includedIds = result.adjustedRates
        .filter((row) => row.includedInRentCalculation)
        .map((row) => row.analogId);

    assert.ok(Math.abs(correctedById.V_puo_2025_9_321659355 - 696.6) < 0.5);
    assert.ok(Math.abs(correctedById.V_puo_2025_8_316756411 - 1013.06) < 0.5);
    assert.ok(Math.abs(correctedById.V_puo_2025_9_320596280 - 1200.37) < 0.5);
    assert.ok(Math.abs(correctedById.V_puo_2025_10_322807700 - 873.08) < 0.5);
    assert.ok(Math.abs(correctedById.V_puo_2025_5_316376249 - 1399.89) < 0.5);
    assert.ok(Math.abs(correctedById.V_puo_2025_9_321659350 - 1247.56) < 0.5);
    assert.ok(Math.abs(correctedById.V_puo_2025_9_321659346 - 1295.56) < 0.5);
    assert.ok(Math.abs(correctedById.V_puo_2025_9_320465726 - 1057.14) < 0.5);
    assert.deepEqual(
        includedIds,
        [
            'V_puo_2025_8_316756411',
            'V_puo_2025_9_320596280',
            'V_puo_2025_5_316376249',
            'V_puo_2025_9_321659350',
            'V_puo_2025_9_321659346',
            'V_puo_2025_9_320465726',
        ]
    );
    assert.ok(Math.abs(result.marketRentFirst - 1202.26) < 0.5);
});

test('calculateMarketRentByNewAlgorithm reproduces Premier workbook corrected rates and average', () => {
    const questionnaire = {
        totalArea: 18850.6,
        leasableArea: 16547,
        occupiedArea: 15760.8,
        aboveGroundFloors: 13,
        undergroundFloors: 0,
        metroDistance: 0.68,
        district: 'Московский',
        valuationDate: '2025-01-01',
        businessCenterClass: 'B+',
        marketClassResolved: 'B+',
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

    const analogs = [
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

    const result = calculateMarketRentByNewAlgorithm(analogs, questionnaire);
    const correctedById = Object.fromEntries(
        result.adjustedRates.map((row) => [row.analogId, row.correctedRate])
    );
    const includedIds = result.adjustedRates
        .filter((row) => row.includedInRentCalculation)
        .map((row) => row.analogId);

    assert.ok(Math.abs(correctedById.a1 - 684.12) < 0.5);
    assert.ok(Math.abs(correctedById.a2 - 934.53) < 0.5);
    assert.ok(Math.abs(correctedById.a3 - 946.37) < 0.5);
    assert.ok(Math.abs(correctedById.a4 - 1055.13) < 0.5);
    assert.ok(Math.abs(correctedById.a5 - 930.33) < 0.5);
    assert.ok(Math.abs(correctedById.a6 - 1158.52) < 0.5);
    assert.ok(Math.abs(correctedById.a7 - 1153.27) < 0.5);
    assert.ok(Math.abs(correctedById.a8 - 1108.58) < 0.5);
    assert.ok(Math.abs(correctedById.a9 - 1108.58) < 0.5);
    assert.ok(Math.abs(correctedById.a10 - 1414.05) < 0.5);
    assert.deepEqual(
        includedIds,
        ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10']
    );
    assert.ok(Math.abs(result.marketRentFirst - 1049.41) < 0.5);
});
