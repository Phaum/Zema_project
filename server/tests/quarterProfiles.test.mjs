import test from 'node:test';
import assert from 'node:assert/strict';

import {
    calculateCapitalizationRate,
    calculateOpexRate,
    calculateVacancyRate,
} from '../services/calculationService.js';

test('calculateCapitalizationRate uses quarter market profile without adjustments', () => {
    const result = calculateCapitalizationRate({
        questionnaire: {
            valuationDate: '2025-01-01',
            businessCenterClass: 'B+',
        },
    });

    assert.equal(result.finalCapRate, 0.10);
    assert.equal(result.baseCapRate, 0.10);
    assert.equal(result.source, 'quarter_profile');
    assert.deepEqual(result.adjustments, []);
});

test('calculateOpexRate uses quarter market profile without adjustments', () => {
    const result = calculateOpexRate({
        questionnaire: {
            valuationDate: '2025-09-15',
            businessCenterClass: 'B+',
        },
    });

    assert.equal(result.opexRate, 0.26);
    assert.equal(result.baseRate, 0.26);
    assert.equal(result.source, 'quarter_profile');
    assert.deepEqual(result.adjustments, []);
});

test('calculateVacancyRate uses base profile when factual vacancy is below market quarter profile', () => {
    const result = calculateVacancyRate({
        questionnaire: {
            valuationDate: '2025-01-01',
            calculationMethod: 'actual_market',
            leasableArea: 1000,
            occupiedArea: 952.5,
        },
        subject: {
            leasableArea: 1000,
            occupiedArea: 952.5,
        },
    });

    assert.equal(result.source, 'quarter_profile');
    assert.equal(result.baseRate, 0.09);
    assert.equal(result.rate, 0.09);
    assert.equal(result.details.priority, 'base_floor_over_actual');
    assert.equal(result.details.actualVacancyRate, 4.75);
    assert.deepEqual(result.adjustments, []);
});

test('calculateVacancyRate uses factual vacancy when it is above market quarter profile', () => {
    const result = calculateVacancyRate({
        questionnaire: {
            valuationDate: '2025-01-01',
            calculationMethod: 'actual_market',
            leasableArea: 1000,
            occupiedArea: 800,
        },
        subject: {
            leasableArea: 1000,
            occupiedArea: 800,
        },
    });

    assert.equal(result.source, 'factual');
    assert.equal(result.baseRate, 0.09);
    assert.ok(Math.abs(result.rate - 0.2) < 0.00001);
    assert.deepEqual(result.adjustments, []);
});
