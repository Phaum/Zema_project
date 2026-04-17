import test from 'node:test';
import assert from 'node:assert/strict';

import {
    shapeMarketSnapshotForViewer,
    shapeProjectResultForViewer,
} from '../utils/projectResultVisibility.js';

test('shapeProjectResultForViewer hides debug-only breakdown blocks when debug mode is off', () => {
    const shaped = shapeProjectResultForViewer({
        id: 1,
        market_snapshot_json: {
            topComparables: [{ id: 'a1' }],
            adjustedRates: [{ analogId: 'a1' }],
            excludedDuplicates: [{ id: 'dup-1' }],
        },
        calculation_breakdown_json: {
            inputs: {
                rentalRate: { value: 1000 },
                floorInputRows: [{ id: 'f1' }],
                floorIncomeRows: [{ id: 'g1' }],
            },
            dataQuality: { fieldSources: [{ key: 'district' }] },
            methodology: { blocks: [{ key: 'rent' }] },
            calculationSteps: [{ step: 1 }],
            assumptions: [{ key: 'profile_cap_rate' }],
            sensitivity: { byNoi: [{ label: 'base' }] },
            market: {
                topComparables: [{ id: 'a1' }],
                excludedComparables: [{ analogId: 'x1' }],
            },
            summary: {
                confidence: 88,
                confidenceNote: 'ok',
                confidenceFactors: ['x'],
                confidenceComponents: { analogCountScore: 12 },
            },
        },
    }, {
        debugModeEnabled: false,
    });

    assert.equal(shaped.debugModeEnabled, false);
    assert.equal(shaped.market_snapshot_json.adjustedRates, undefined);
    assert.equal(shaped.market_snapshot_json.excludedDuplicates, undefined);
    assert.ok(Array.isArray(shaped.market_snapshot_json.topComparables));
    assert.equal(shaped.calculation_breakdown_json.dataQuality, undefined);
    assert.equal(shaped.calculation_breakdown_json.methodology, undefined);
    assert.equal(shaped.calculation_breakdown_json.calculationSteps, undefined);
    assert.equal(shaped.calculation_breakdown_json.assumptions, undefined);
    assert.equal(shaped.calculation_breakdown_json.sensitivity, undefined);
    assert.equal(shaped.calculation_breakdown_json.market.excludedComparables, undefined);
    assert.equal(shaped.calculation_breakdown_json.inputs.rentalRate, undefined);
    assert.ok(Array.isArray(shaped.calculation_breakdown_json.inputs.floorInputRows));
    assert.equal(shaped.calculation_breakdown_json.summary.confidence, undefined);
    assert.equal(shaped.calculation_breakdown_json.summary.confidenceComponents, undefined);
});

test('shapeProjectResultForViewer keeps debug breakdown blocks when debug mode is on', () => {
    const source = {
        id: 2,
        market_snapshot_json: {
            adjustedRates: [{ analogId: 'a1' }],
        },
        calculation_breakdown_json: {
            calculationSteps: [{ step: 1 }],
            assumptions: [{ key: 'x' }],
        },
    };

    const shaped = shapeProjectResultForViewer(source, {
        debugModeEnabled: true,
    });

    assert.equal(shaped.debugModeEnabled, true);
    assert.deepEqual(shaped.market_snapshot_json.adjustedRates, [{ analogId: 'a1' }]);
    assert.deepEqual(shaped.calculation_breakdown_json.calculationSteps, [{ step: 1 }]);
    assert.deepEqual(shaped.calculation_breakdown_json.assumptions, [{ key: 'x' }]);
});

test('shapeMarketSnapshotForViewer strips internal market diagnostics for non-debug users', () => {
    const shaped = shapeMarketSnapshotForViewer({
        topComparables: [{ id: 'a1' }],
        adjustedRates: [{ analogId: 'a1' }],
        excludedDuplicates: [{ id: 'dup-1' }],
    }, {
        debugModeEnabled: false,
    });

    assert.deepEqual(shaped.topComparables, [{ id: 'a1' }]);
    assert.equal(shaped.adjustedRates, undefined);
    assert.equal(shaped.excludedDuplicates, undefined);
});
