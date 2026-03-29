import test from 'node:test';
import assert from 'node:assert/strict';
import { Op } from 'sequelize';

import {
    normalizeComparableClass,
    buildAnalogueClassCandidates,
    buildAreaRangeByCalculationArea,
    deduplicateAnaloguesByObject,
    deduplicateAnaloguesByClosestDatePerQuarter,
    deduplicateAnaloguesForSelection,
    deduplicateRankedAnalogsByObject,
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
