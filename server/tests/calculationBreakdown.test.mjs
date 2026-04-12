import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCalculationBreakdown } from '../utils/calculationBreakdown.js';

test('buildCalculationBreakdown keeps manual rental override source', () => {
    const breakdown = buildCalculationBreakdown(
        {
            totalArea: 1000,
            district: 'Московский',
            calculationMethod: 'market',
        },
        {},
        {
            manualRentalRate: 1500,
            manualOverrideApplied: true,
            rentalRateSource: 'manual_override',
            marketRentMonth: 1500,
            marketRentYear: 18000,
            marketRentFirst: 1500,
            marketRentSecond: 1545,
            marketRentThirdPlus: 1470,
            leasableArea: 900,
            occupiedArea: 900,
            vacancyRate: 0.09,
            vacancyRatePercent: 9,
            pgi: 16200000,
            egi: 14742000,
            opex: 3095820,
            opexRate: 0.21,
            noi: 11646180,
            capitalizationRate: 0.1085,
            valueTotal: 107338986.18,
            landShare: 1000000,
            finalValue: 106338986.18,
            pricePerM2: 106338.99,
            analogsCount: 8,
            selectedAnalogsCount: 10,
            excludedAnalogsCount: 2,
            capitalizationRateSource: 'rule_based_profile',
            baseCapitalizationRate: 0.1,
            capitalizationAdjustments: [],
            vacancyRateSource: 'market',
            vacancyRateSourceLabel: 'Рыночный профиль vacancy',
            baseVacancyRate: 0.09,
            vacancyAdjustments: [],
            reliabilityDetails: {
                score: 80,
                note: 'Тестовая уверенность',
                factors: [],
                components: {},
            },
            assumptions: [],
        }
    );

    assert.equal(breakdown.inputs.rentalRate.source, 'manual_override');
});

test('buildCalculationBreakdown shows capitalization formula with exact percent rate', () => {
    const breakdown = buildCalculationBreakdown(
        {
            totalArea: 1000,
            district: 'Московский',
            calculationMethod: 'market',
        },
        {},
        {
            marketRentMonth: 1500,
            marketRentYear: 18000,
            marketRentFirst: 1500,
            marketRentSecond: 1545,
            marketRentThirdPlus: 1470,
            leasableArea: 900,
            occupiedArea: 900,
            vacancyRate: 0.09,
            vacancyRatePercent: 9,
            pgi: 16200000,
            egi: 14742000,
            opex: 3095820,
            opexRate: 0.21,
            noi: 11646180,
            capitalizationRate: 0.1085,
            valueTotal: 107338986.18,
            landShare: 1000000,
            finalValue: 106338986.18,
            pricePerM2: 106338.99,
            analogsCount: 8,
            selectedAnalogsCount: 10,
            excludedAnalogsCount: 2,
            capitalizationRateSource: 'rule_based_profile',
            baseCapitalizationRate: 0.1,
            capitalizationAdjustments: [],
            vacancyRateSource: 'market',
            vacancyRateSourceLabel: 'Рыночный профиль vacancy',
            baseVacancyRate: 0.09,
            vacancyAdjustments: [],
            reliabilityDetails: {
                score: 80,
                note: 'Тестовая уверенность',
                factors: [],
                components: {},
            },
            assumptions: [],
        }
    );

    const capStep = breakdown.calculationSteps.find((step) => step.step === 8);

    assert.equal(capStep?.calculation, '11646180 / 10.85% = 107338986.18');
});
