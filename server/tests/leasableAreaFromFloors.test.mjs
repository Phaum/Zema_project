import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateValuation } from '../services/calculationService.js';

function buildAnalog(id, rate = 1000) {
    return {
        id,
        price_per_sqm_cleaned: rate,
        area_total: 120,
        class_offer: 'B+',
        district: 'Приморский',
        distance_to_metro: 1,
        floor_location: 'первый',
        offer_date: '2025-01-15',
        quarter: '2025-Q1',
        environment_category_1: 'Центры деловой активности',
        environment_historical_center: false,
    };
}

test('calculateValuation derives leasable area from floor rows before questionnaire field', async () => {
    const questionnaire = {
        totalArea: 1000,
        leasableArea: 9999,
        occupiedArea: 300,
        valuationDate: '2025-01-01',
        calculationMethod: 'actual_market',
        businessCenterClass: 'B+',
        marketClassResolved: 'B+',
        district: 'Приморский',
        metroDistance: 1,
        floors: [
            {
                id: 'first',
                floorCategory: 'first',
                floorLocation: 'Первый этаж',
                area: 150,
                leasableArea: 100,
                avgLeasableRoomArea: 100,
            },
            {
                id: 'second',
                floorCategory: 'second',
                floorLocation: 'Второй этаж',
                area: 250,
                leasableArea: 200,
                avgLeasableRoomArea: 100,
            },
            {
                id: 'third',
                floorCategory: 'third_plus',
                floorLocation: 'Третий этаж и выше',
                area: 600,
                leasableArea: 300,
                avgLeasableRoomArea: 100,
            },
        ],
    };
    const analogs = Array.from({ length: 10 }, (_, index) => buildAnalog(`a${index + 1}`, 1000 + index));

    const valuation = await calculateValuation(questionnaire, analogs, 0);

    assert.equal(valuation.leasableArea, 600);
    assert.equal(valuation.floorLeasableAreaTotal, 600);
    assert.equal(valuation.leasableAreaSource, 'derived_from_floor_sum');
    assert.equal(valuation.actualVacancyRate, 0.5);

    const expectedPgi = valuation.marketRentFirst * (100 + (200 * 1.03) + (300 * 0.98)) * 12;
    assert.ok(Math.abs(valuation.pgi - expectedPgi) < 0.01);
});
