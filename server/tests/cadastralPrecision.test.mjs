import test from 'node:test';
import assert from 'node:assert/strict';

import {
    calculateIncomeValuation,
    calculateLandShareDetails,
} from '../services/calculationService.js';
import { buildCalculationBreakdown } from '../utils/calculationBreakdown.js';

test('calculateLandShareDetails keeps cadastral cost precision in proportional land share', async () => {
    const details = await calculateLandShareDetails({
        landCadastralNumber: '78:00:0000000:1',
        landCadCost: 1000000.123456,
        totalOksAreaOnLand: 2000,
        totalArea: 1000,
    });

    assert.equal(details.landCadCost, 1000000.123456);
    assert.equal(details.allocationRatio, 0.5);
    assert.equal(details.share, 500000.061728);
});

test('calculateLandShareDetails prefers registered OKS sum over stale questionnaire total', async () => {
    const details = await calculateLandShareDetails(
        {
            buildingCadastralNumber: '78:14:0753001:178',
            landCadastralNumber: '78:14:0753001:20',
            landCadCost: 433631521.03,
            totalOksAreaOnLand: 18850.6,
            totalArea: 18850.6,
            fieldSourceHints: {
                totalOksAreaOnLand: 'manual_input',
            },
        },
        {
            registeredOksAreaResolver: async () => ({
                totalArea: 42011.2,
                source: 'nspd_land_objects',
                usedNspdObjectsList: true,
                objects: Array.from({ length: 11 }, (_, index) => ({
                    cadastral_number: `78:14:0753001:${index + 1}`,
                    object_type: 'Здание',
                    total_area: 100,
                })),
            }),
        }
    );

    assert.equal(details.totalOksAreaOnLand, 42011.2);
    assert.equal(details.totalOksAreaOnLandSource, 'nspd_land_objects');
    assert.equal(details.registeredOksObjectsCount, 11);
    assert.equal(details.usedNspdObjectsList, true);
    assert.equal(details.allocationRatio, 0.448);
    assert.equal(details.landShareRatio, 0.448);
    assert.equal(details.share, 194266921.42144);
    assert.match(details.warnings[0], /пересчитана по зарегистрированным объектам/);
});

test('valuation and breakdown keep unrounded land cadastral share for output diagnostics', () => {
    const valuation = calculateIncomeValuation({
        totalArea: 1000,
        leasableAreaFloor1: 100,
        leasableAreaFloor2: 0,
        leasableAreaFloor3Plus: 0,
        marketRentFirst: 1000,
        vacancyRate: 0.1,
        opexRate: 0.2,
        capitalizationRate: 0.1,
        landShare: 123456.123456,
    });

    const breakdown = buildCalculationBreakdown(
        {
            totalArea: 1000,
            landCadCost: 246912.246912,
            landCadastralNumber: '78:00:0000000:1',
            totalOksAreaOnLand: 2000,
            floors: [
                {
                    floorCategory: 'first',
                    floorLocation: 'Первый этаж',
                    leasableArea: 100,
                },
            ],
        },
        {},
        {
            ...valuation,
            marketRentMonth: 1000,
            marketRentFirst: 1000,
            marketRentSecond: 1030,
            marketRentThirdPlus: 980,
            leasableArea: 100,
            occupiedArea: 90,
            capitalizationRate: 0.1,
            landShare: 123456.123456,
            landDetails: {
                cadastralNumber: '78:00:0000000:1',
                landCadCost: 246912.246912,
                landArea: 1000,
                totalOksAreaOnLand: 2000,
                objectArea: 1000,
                allocationRatio: 0.5,
                landShareRatio: 0.5,
                share: 123456.123456,
                source: 'proportional_by_oks_area',
                calculationMode: 'proportional_by_oks_area',
                isCalculated: true,
                isComplete: true,
            },
        }
    );

    assert.equal(valuation.landShare, 123456.123456);
    assert.equal(breakdown.inputs.land.landCadCost, 246912.246912);
    assert.equal(breakdown.inputs.land.landShare, 123456.123456);
    assert.equal(breakdown.summary.landShare, 123456.123456);
    assert.match(breakdown.calculationSteps.at(-2).calculation, /246912,246912/);
    assert.match(breakdown.calculationSteps.at(-2).calculation, /123456,123456/);
});
