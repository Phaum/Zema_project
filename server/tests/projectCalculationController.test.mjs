import test from 'node:test';
import assert from 'node:assert/strict';
import { Op } from 'sequelize';

import {
    normalizeComparableClass,
    buildAnalogueClassCandidates,
    buildAreaRangeByCalculationArea,
    buildMarketSnapshot,
    deduplicateAnaloguesByObject,
    deduplicateAnaloguesByClosestDatePerQuarter,
    deduplicateAnaloguesForSelection,
    deduplicateRankedAnalogsByObject,
    ensureSelectionSpatialContext,
    resolveComparableCoordinates,
    resolveManualRentalOverrideRate,
    resolveAnalogueQuarterKey,
} from '../controllers/projectCalculationController.js';

test('normalizeComparableClass accepts Cyrillic business center classes', () => {
    assert.equal(normalizeComparableClass('В+'), 'B+');
    assert.equal(normalizeComparableClass('В'), 'B');
    assert.equal(normalizeComparableClass('С'), 'C');
    assert.equal(normalizeComparableClass('А+'), 'A+');
});

test('buildAnalogueClassCandidates keeps strict class matching within alphabet variants only', () => {
    assert.deepEqual(buildAnalogueClassCandidates('B+'), ['B+', 'В+']);
    assert.deepEqual(buildAnalogueClassCandidates('В+'), ['B+', 'В+']);
    assert.deepEqual(buildAnalogueClassCandidates('B'), ['B', 'В']);
    assert.deepEqual(buildAnalogueClassCandidates('В'), ['B', 'В']);
    assert.deepEqual(buildAnalogueClassCandidates('C'), ['C', 'С']);
    assert.deepEqual(buildAnalogueClassCandidates('С'), ['C', 'С']);
});

test('buildAreaRangeByCalculationArea uses first-floor area plus-minus 200 sqm', () => {
    const questionnaire = {
        floors: [
            {
                floorCategory: 'first',
                floorLocation: 'Первый этаж',
                avgLeasableRoomArea: 685,
                leasableArea: 1205,
                area: 1450,
            },
            {
                floorCategory: 'second',
                floorLocation: 'Второй этаж',
                avgLeasableRoomArea: 540,
            },
        ],
        totalArea: 18850.6,
    };

    const areaRange = buildAreaRangeByCalculationArea(questionnaire);

    assert.deepEqual(areaRange?.[Op.between], [485, 885]);
});

test('resolveAnalogueQuarterKey prefers explicit quarter and normalizes it', () => {
    assert.equal(resolveAnalogueQuarterKey({ quarter: '1 кв. 2025' }), '2025-Q1');
    assert.equal(resolveAnalogueQuarterKey({ quarter: 'Q3 2024' }), '2024-Q3');
    assert.equal(resolveAnalogueQuarterKey({ date_offer: '2025-05-17' }), '2025-Q2');
});

test('resolveManualRentalOverrideRate ignores auto-filled questionnaire rental rate', () => {
    const manualRate = resolveManualRentalOverrideRate({
        questionnaire: {
            averageRentalRate: 772.22,
            fieldSourceHints: {
                averageRentalRate: 'market_offers_district_class',
            },
        },
    });

    assert.equal(manualRate, null);
});

test('resolveManualRentalOverrideRate keeps manual questionnaire rental rate', () => {
    const manualRate = resolveManualRentalOverrideRate({
        questionnaire: {
            averageRentalRate: 772.22,
            fieldSourceHints: {
                averageRentalRate: 'manual_input',
            },
        },
    });

    assert.equal(manualRate, 772.22);
});

test('resolveManualRentalOverrideRate prioritizes explicit request manual rate', () => {
    const manualRate = resolveManualRentalOverrideRate({
        requestBody: {
            manualRate: 1500,
        },
        questionnaire: {
            averageRentalRate: 772.22,
            fieldSourceHints: {
                averageRentalRate: 'market_offers_district_class',
            },
        },
    });

    assert.equal(manualRate, 1500);
});

test('resolveComparableCoordinates accepts pre-normalized latitude and longitude fields', () => {
    const coords = resolveComparableCoordinates({
        latitude: '59.9386300',
        longitude: '30.3141300',
    });

    assert.equal(coords.lat, 59.93863);
    assert.equal(coords.lon, 30.31413);
    assert.equal(coords.source, 'latitude_longitude');
});

test('buildMarketSnapshot uses normalized comparable coordinates for report map', () => {
    const snapshot = buildMarketSnapshot(
        {},
        [
            {
                id: 'analog-1',
                address_offer: 'САНКТ-ПЕТЕРБУРГ. МЕЛЬНИЧНАЯ УЛИЦА. 18',
                lat: '59.9104426560',
                lon: '30.3876050610',
            },
            {
                id: 'analog-2',
                address_offer: 'САНКТ-ПЕТЕРБУРГ. ШПАЛЕРНАЯ УЛИЦА. 2/4',
                x: '91468.2800000000',
                y: '117755.1700000000',
            },
        ],
        []
    );

    assert.equal(snapshot.topComparables.length, 2);
    assert.equal(snapshot.topComparables[0].latitude, 59.910442656);
    assert.equal(snapshot.topComparables[0].longitude, 30.387605061);
    assert.equal(snapshot.topComparables[0].coordinate_source, 'lat_lon');
    assert.ok(Math.abs(snapshot.topComparables[1].latitude - 59.91049) < 0.01);
    assert.ok(Math.abs(snapshot.topComparables[1].longitude - 30.38984) < 0.01);
    assert.equal(snapshot.topComparables[1].coordinate_source, 'msk64_xy');
});

test('deduplicateAnaloguesByClosestDatePerQuarter keeps nearest analogue within each quarter', () => {
    const rows = [
        {
            id: 'a-q1-far',
            cadastral: '78:01:0001:1',
            quarter: '1 кв. 2025',
            date_offer: '2025-01-15',
        },
        {
            id: 'a-q1-near',
            cadastral: '78:01:0001:1',
            quarter: '1 кв. 2025',
            date_offer: '2025-03-27',
        },
        {
            id: 'a-q2-near',
            cadastral: '78:01:0001:1',
            quarter: '2 кв. 2025',
            date_offer: '2025-04-03',
        },
        {
            id: 'a-q2-far',
            cadastral: '78:01:0001:1',
            quarter: '2 кв. 2025',
            date_offer: '2025-06-20',
        },
    ];

    const deduped = deduplicateAnaloguesByClosestDatePerQuarter(rows, '2025-04-01');

    assert.equal(deduped.length, 2);
    assert.deepEqual(
        deduped.map((row) => row.id).sort(),
        ['a-q1-near', 'a-q2-near']
    );
});

test('deduplicateAnaloguesForSelection collapses technical duplicates by address, rate, floor and close area', () => {
    const rows = [
        {
            id: 'dup-oct',
            address: 'САНКТ-ПЕТЕРБУРГ. ПОС. ШУШАРЫ. УЛИЦА ПОСЕЛКОВАЯ. 12В',
            class_offer: 'B+',
            floor: '2',
            total_area: 568,
            price_per_meter_cut_nds: 833.33,
            date_offer: '2025-10-14',
        },
        {
            id: 'dup-nov',
            address: 'САНКТ-ПЕТЕРБУРГ. ПОС. ШУШАРЫ. УЛИЦА ПОСЕЛКОВАЯ. 12В',
            class_offer: 'B+',
            floor: '2',
            total_area: 600,
            price_per_meter_cut_nds: 833.33,
            date_offer: '2025-11-12',
        },
        {
            id: 'unique',
            address: 'САНКТ-ПЕТЕРБУРГ. ОКТЯБРЬСКАЯ НАБЕРЕЖНАЯ. 10К1',
            class_offer: 'B+',
            floor: '2',
            total_area: 750,
            price_per_meter_cut_nds: 1200,
            date_offer: '2025-11-12',
        },
    ];

    const deduped = deduplicateAnaloguesForSelection(rows, '2025-11-01');

    assert.equal(deduped.length, 2);
    assert.deepEqual(
        deduped.map((row) => row.id).sort(),
        ['dup-nov', 'unique']
    );
});

test('deduplicateRankedAnalogsByObject keeps only one analogue per address in final ranked set', () => {
    const rows = [
        {
            id: 'dom16_best',
            address_offer: 'САНКТ-ПЕТЕРБУРГ. ДОМОСТРОИТЕЛЬНАЯ УЛИЦА. 16',
            class_offer: 'B+',
            offer_date: '2025-06-16',
            mahalanobisDistance: 0.11,
        },
        {
            id: 'dom16_second',
            address_offer: 'САНКТ-ПЕТЕРБУРГ. ДОМОСТРОИТЕЛЬНАЯ УЛИЦА. 16',
            class_offer: 'B+',
            offer_date: '2025-01-15',
            mahalanobisDistance: 0.19,
        },
        {
            id: 'dom16_third',
            address_offer: 'САНКТ-ПЕТЕРБУРГ. ДОМОСТРОИТЕЛЬНАЯ УЛИЦА. 16',
            class_offer: 'B+',
            offer_date: '2025-06-16',
            mahalanobisDistance: 0.23,
        },
        {
            id: 'other',
            address_offer: 'САНКТ-ПЕТЕРБУРГ. УЛИЦА ПРОФЕССОРА КАЧАЛОВА. 7',
            class_offer: 'B+',
            offer_date: '2025-09-17',
            mahalanobisDistance: 0.14,
        },
    ];

    const deduped = deduplicateRankedAnalogsByObject(rows, '2025-07-01', 10);

    assert.equal(deduped.length, 2);
    assert.deepEqual(
        deduped.map((row) => row.id),
        ['dom16_best', 'other']
    );
});

test('deduplicateAnaloguesByObject excludes duplicates with reasons before ranking', () => {
    const rows = [
        {
            id: 'best',
            building_cadastral_number: '78:01:0001:1',
            address_offer: 'САНКТ-ПЕТЕРБУРГ. ОПТИКОВ. 4',
            price_per_sqm_cleaned: 1000,
            area_total: 600,
            class_offer: 'B+',
            offer_date: '2025-09-01',
        },
        {
            id: 'older',
            building_cadastral_number: '78:01:0001:1',
            address_offer: 'САНКТ-ПЕТЕРБУРГ. ОПТИКОВ. 4',
            price_per_sqm_cleaned: 1000,
            area_total: 600,
            class_offer: 'B+',
            offer_date: '2025-05-01',
        },
    ];

    const result = deduplicateAnaloguesByObject(rows, '2025-10-01');

    assert.equal(result.selectedAnalogs.length, 1);
    assert.equal(result.excludedDuplicates.length, 1);
    assert.equal(result.selectedAnalogs[0].id, 'best');
    assert.match(result.excludedDuplicates[0].exclusionReason, /дубль объекта/i);
});

test('deduplicateAnaloguesByObject collapses repeated final-table analogues by object address', () => {
    const rows = [
        {
            id: 'rzhovskaya-q2',
            address_offer: 'САНКТ-ПЕТЕРБУРГ. РЖОВСКАЯ УЛИЦА. 5',
            class_offer: 'B+',
            quarter: '2025-Q2',
            area_total: 812,
            price_per_sqm_cleaned: 2199.99,
            offer_date: '2025-06-20',
        },
        {
            id: 'rzhovskaya-q1',
            address_offer: 'САНКТ-ПЕТЕРБУРГ. РЖОВСКАЯ УЛИЦА. 5',
            building_cadastral_number: '78:01:0000000:101',
            class_offer: 'B+',
            quarter: '2025-Q1',
            area_total: 812,
            price_per_sqm_cleaned: 2001.97,
            offer_date: '2025-02-10',
        },
        {
            id: 'sinopskaya-main',
            address_offer: 'САНКТ-ПЕТЕРБУРГ. СИНОПСКАЯ НАБЕРЕЖНАЯ. 52',
            class_offer: 'B+',
            quarter: '2025-Q4',
            area_total: 656,
            price_per_sqm_cleaned: 1682.76,
            offer_date: '2025-10-12',
        },
        {
            id: 'sinopskaya-copy',
            address_offer: 'САНКТ-ПЕТЕРБУРГ. СИНОПСКАЯ НАБЕРЕЖНАЯ. 52',
            class_offer: 'B+',
            quarter: '2025-Q4',
            area_total: 656,
            price_per_sqm_cleaned: 1682.76,
            offer_date: '2025-10-12',
        },
        {
            id: 'unique',
            address_offer: 'САНКТ-ПЕТЕРБУРГ. ЛЕВАШОВСКИЙ ПРОСПЕКТ. 12',
            class_offer: 'B+',
            quarter: '2025-Q4',
            area_total: 824,
            price_per_sqm_cleaned: 1829.09,
            offer_date: '2025-10-01',
        },
    ];

    const result = deduplicateAnaloguesByObject(rows, '2025-10-01');

    assert.equal(result.selectedAnalogs.length, 3);
    assert.equal(result.excludedDuplicates.length, 2);
    assert.deepEqual(
        result.selectedAnalogs.map((row) => row.id).sort(),
        ['rzhovskaya-q2', 'sinopskaya-main', 'unique']
    );
});

test('ensureSelectionSpatialContext restores missing zone fields from spatial zones before selection', async () => {
    const calls = [];
    const questionnaire = {
        mapPointLat: 59.9891,
        mapPointLng: 30.2402,
        zoneCode: null,
        terZone: null,
    };

    const enriched = await ensureSelectionSpatialContext(questionnaire, {
        zoneResolver: async (_lat, _lng, { zoneType } = {}) => {
            calls.push(zoneType);

            if (zoneType === 'administrative_zone') {
                return {
                    matched: true,
                    zoneCode: 'ТП3',
                };
            }

            return {
                matched: true,
                zoneCode: 'ТП3_1',
                zoneName: 'ТП3_1',
            };
        },
    });

    assert.equal(enriched.zoneCode, 'ТП3');
    assert.equal(enriched.terZone, 'ТП3_1');
    assert.deepEqual(calls, ['administrative_zone', 'valuation_district']);
});
