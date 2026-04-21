import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateMarketRentByNewAlgorithm } from '../services/rentCalculationService.js';

test('calculateMarketRentByNewAlgorithm aligns area and floor corrections with Excel-style comparable unit', () => {
    const questionnaire = {
        totalArea: 18023.4,
        leasableArea: 12757.2,
        aboveGroundFloors: 6,
        metroDistance: 0.95,
        valuationDate: '2025-01-01',
        businessCenterClass: 'B+',
        marketClassResolved: 'B+',
        environmentCategory1: 'промзона',
        environmentCategory2: 'общественно-деловая застройка',
        environmentCategory3: 'многоквартирная жилая застройка',
        floors: [
            {
                id: 'first',
                floorCategory: 'first',
                floorLocation: 'Первый этаж',
                leasableArea: 3218.7,
                avgLeasableRoomArea: 183,
            },
        ],
    };

    const analogs = [
        {
            id: 'excel_like_basement',
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
    ];

    const result = calculateMarketRentByNewAlgorithm(analogs, questionnaire);
    const analog = result.adjustedRates[0];

    assert.equal(result.marketRentFirst, analog.correctedRate);
    assert.ok(Math.abs(analog.areaAdjustment - 1.1411) < 0.001, `unexpected area adjustment: ${analog.areaAdjustment}`);
    assert.ok(Math.abs(analog.floorAdjustment - 1.1364) < 0.001, `unexpected floor adjustment: ${analog.floorAdjustment}`);
    assert.ok(Math.abs(analog.correctedRate - 906.91) < 0.5, `unexpected corrected rate: ${analog.correctedRate}`);
});

test('calculateMarketRentByNewAlgorithm calculates Ks directly as (So / Sa)^n', () => {
    const questionnaire = {
        totalArea: 1000,
        leasableArea: 1000,
        aboveGroundFloors: 1,
        metroDistance: 1,
        valuationDate: '2025-01-01',
        businessCenterClass: 'B+',
        marketClassResolved: 'B+',
        floors: [
            {
                id: 'first',
                floorCategory: 'first',
                floorLocation: 'Первый этаж',
                leasableArea: 1000,
                avgLeasableRoomArea: 183,
            },
        ],
    };

    const analogs = [
        {
            id: 'area_481_2',
            price_per_sqm_cleaned: 1000,
            area_total: 481.2,
            class_offer: 'B+',
            distance_to_metro: 1,
            floor_location: 'Первый этаж',
            offer_date: '2025-01-15',
            quarter: '2025-Q1',
            environment_historical_center: false,
        },
    ];

    const result = calculateMarketRentByNewAlgorithm(analogs, questionnaire);
    const analog = result.adjustedRates[0];

    assert.ok(Math.abs(analog.areaAdjustment - 1.1901) < 0.0001, `unexpected Ks: ${analog.areaAdjustment}`);
});

test('calculateMarketRentByNewAlgorithm returns non-zero diagnostics for included corrected rates', () => {
    const questionnaire = {
        totalArea: 18023.4,
        leasableArea: 12757.2,
        aboveGroundFloors: 6,
        metroDistance: 0.95,
        valuationDate: '2025-01-01',
        businessCenterClass: 'B+',
        marketClassResolved: 'B+',
        environmentCategory1: 'промзона',
        environmentCategory2: 'общественно-деловая застройка',
        environmentCategory3: 'многоквартирная жилая застройка',
        floors: [
            {
                id: 'first',
                floorCategory: 'first',
                floorLocation: 'Первый этаж',
                leasableArea: 3218.7,
                avgLeasableRoomArea: 183,
            },
        ],
    };

    const analogs = [
        {
            id: 'a1',
            price_per_sqm_cleaned: 1300,
            area_total: 183,
            class_offer: 'B+',
            district: 'Приморский',
            distance_to_metro: 0.95,
            floor_location: '1',
            offer_date: '2025-01-15',
            quarter: '2025-Q1',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
        },
        {
            id: 'a2',
            price_per_sqm_cleaned: 1400,
            area_total: 183,
            class_offer: 'B+',
            district: 'Приморский',
            distance_to_metro: 0.95,
            floor_location: '1',
            offer_date: '2025-01-15',
            quarter: '2025-Q1',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
        },
        {
            id: 'a3',
            price_per_sqm_cleaned: 1500,
            area_total: 183,
            class_offer: 'B+',
            district: 'Приморский',
            distance_to_metro: 0.95,
            floor_location: '1',
            offer_date: '2025-01-15',
            quarter: '2025-Q1',
            environment_category_1: 'промзона',
            environment_category_2: 'общественно-деловая застройка',
            environment_category_3: 'многоквартирная жилая застройка',
            environment_historical_center: false,
        },
    ];

    const result = calculateMarketRentByNewAlgorithm(analogs, questionnaire);

    assert.equal(result.analogsInitialCount, 3);
    assert.equal(result.analogsUsedCount, 3);
    assert.equal(result.analogsExcludedCount, 0);
    assert.equal(result.correctedRateMin, result.stats.min);
    assert.equal(result.correctedRateMedian, result.marketRentMedian);
    assert.equal(result.correctedRateMax, result.stats.max);
    assert.equal(result.minAdjustedRate, result.stats.min);
    assert.equal(result.maxAdjustedRate, result.stats.max);
    assert.equal(result.simpleAverageRate, result.marketRentFirst);
    assert.equal(result.simpleMedianRate, result.marketRentMedian);
    assert.equal(result.trimmedMeanRate, result.marketRentFirst);
    assert.equal(result.sampleSizeLevel, 'small');
    assert.equal(result.stabilityFlag, 'unstable');
    assert.ok(result.correctedRateIQR > 0);
});

test('calculateMarketRentByNewAlgorithm maps environment analysis category codes to coefficients', () => {
    const questionnaire = {
        totalArea: 1000,
        leasableArea: 1000,
        aboveGroundFloors: 1,
        metroDistance: 0.8,
        valuationDate: '2025-01-01',
        businessCenterClass: 'B+',
        marketClassResolved: 'B+',
        environmentCategory1: 'mixed_urban',
        environmentCategory2: 'residential_mixed',
        environmentCategory3: 'prime_business',
        isHistoricalCenter: false,
        floors: [
            {
                id: 'first',
                floorCategory: 'first',
                floorLocation: 'Первый этаж',
                leasableArea: 1000,
                avgLeasableRoomArea: 1000,
            },
        ],
    };

    const analogs = [
        {
            id: 'industrial-edge',
            price_per_sqm_cleaned: 1000,
            area_total: 1000,
            class_offer: 'B+',
            district: 'Приморский',
            distance_to_metro: 0.8,
            floor_location: 'Первый этаж',
            offer_date: '2025-01-15',
            quarter: '2025-Q1',
            environment_category_1: 'industrial_edge',
            environment_historical_center: false,
        },
    ];

    const result = calculateMarketRentByNewAlgorithm(analogs, questionnaire);
    const analog = result.adjustedRates[0];

    assert.ok(analog, 'expected adjusted analogue');
    assert.ok(
        Math.abs(analog.environmentAdjustment - 1.4262) < 0.0001,
        `unexpected environment adjustment: ${analog.environmentAdjustment}`
    );
});
