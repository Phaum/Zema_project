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

test('buildCalculationBreakdown does not mark auto-filled questionnaire rental rate as manual override by numeric value alone', () => {
    const breakdown = buildCalculationBreakdown(
        {
            totalArea: 1000,
            district: 'Московский',
            calculationMethod: 'market',
            fieldSourceHints: {
                averageRentalRate: 'market_offers_district_class',
            },
        },
        {},
        {
            manualRentalRate: 772.22,
            manualOverrideApplied: false,
            rentalRateSource: 'market_analogs',
            marketRentMonth: 1502.72,
            marketRentYear: 18032.64,
            marketRentFirst: 1502.72,
            marketRentSecond: 1547.8,
            marketRentThirdPlus: 1472.67,
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

    assert.equal(breakdown.inputs.rentalRate.source, 'market_analogs');
    assert.match(String(breakdown.inputs.rentalRate.note || ''), /рыночн/i);
    assert.doesNotMatch(String(breakdown.inputs.rentalRate.note || ''), /ручн/i);
});

test('buildCalculationBreakdown keeps rent diagnostics and source labels human-readable', () => {
    const breakdown = buildCalculationBreakdown(
        {
            totalArea: 18023.4,
            district: 'Приморский',
            calculationMethod: 'actual_market',
            landCadCost: 52878166.88,
            landCadastralNumber: '78:34:0413901:8',
            totalOksAreaOnLand: 18023.4,
            fieldSourceHints: {
                totalOksAreaOnLand: 'historical_project_questionnaire',
            },
        },
        {
            comparableCount: 4,
            selectedComparableCount: 10,
            excludedComparableCount: 6,
            averageRentalRate: 1500.19,
            medianRentalRate: 1502.92,
            minRentalRate: 1430.12,
            maxRentalRate: 1564.81,
        },
        {
            marketRentMonth: 1500.19,
            marketRentYear: 18002.28,
            marketRentFirst: 1500.19,
            marketRentSecond: 1545.2,
            marketRentThirdPlus: 1470.19,
            marketRentAverage: 0,
            marketRentMedian: 0,
            marketRentMin: 0,
            marketRentMax: 0,
            leasableArea: 12757.2,
            occupiedArea: 9697.3,
            vacancyRate: 0.09,
            vacancyRatePercent: 9,
            pgi: 227178692.32,
            egi: 206732610.01,
            opex: 43413848.1,
            opexRate: 0.21,
            noi: 163318761.91,
            capitalizationRate: 0.118,
            valueTotal: 1384057304.33,
            landShare: 52878166.88,
            finalValue: 1331179137.45,
            pricePerM2: 73858.38,
            analogsCount: 10,
            selectedAnalogsCount: 4,
            excludedAnalogsCount: 6,
            capitalizationRateSource: 'rule_based_profile',
            baseCapitalizationRate: 0.1,
            capitalizationAdjustments: [],
            vacancyRateSource: 'market',
            vacancyRateSourceLabel: 'Рыночный профиль vacancy',
            baseVacancyRate: 0.09,
            vacancyAdjustments: [],
            reliabilityDetails: {
                score: 36,
                note: 'Тестовая уверенность',
                factors: [],
                components: {},
            },
            assumptions: [],
        }
    );

    const rentStep = breakdown.calculationSteps.find((step) => step.step === 1);
    const rentMethodology = breakdown.methodology.blocks.find((block) => block.key === 'rent');
    const landSource = breakdown.dataQuality.fieldSources.find((item) => item.key === 'totalOksAreaOnLand');

    assert.equal(breakdown.market.comparableCount, 4);
    assert.equal(breakdown.market.selectedComparableCount, 10);
    assert.equal(breakdown.inputs.rentalRate.marketData.simpleAverage, 1500.19);
    assert.equal(breakdown.inputs.rentalRate.marketData.simpleMedian, 1502.92);
    assert.match(String(rentStep?.calculation || ''), /1430\.12/);
    assert.match(String(rentStep?.calculation || ''), /1502\.92/);
    assert.match(String(rentStep?.calculation || ''), /1564\.81/);
    assert.ok(rentMethodology?.facts?.includes('Аналогов до стабилизации: 10'));
    assert.ok(rentMethodology?.facts?.includes('В итоговой ставке использовано: 4'));
    assert.ok(rentMethodology?.facts?.includes('Исключено из итоговой ставки: 6'));
    assert.equal(landSource?.sourceLabel, 'История анкет по объекту');
});

test('buildCalculationBreakdown hides correction lines for quarter-based cap, vacancy and opex profiles', () => {
    const breakdown = buildCalculationBreakdown(
        {
            totalArea: 1000,
            district: 'Приморский',
            calculationMethod: 'actual_market',
            leasableArea: 1000,
            occupiedArea: 952.5,
        },
        {},
        {
            marketRentMonth: 1500,
            marketRentYear: 18000,
            marketRentFirst: 1500,
            marketRentSecond: 1545,
            marketRentThirdPlus: 1470,
            correctedRateMin: 1527.08,
            correctedRateMedian: 1700,
            correctedRateMax: 1919.55,
            correctedRateStdDev: 120,
            correctedRateIQR: 80,
            rentCalculationMode: 'stable_default',
            rentalRateSelectionMethod: 'stable_trimmed_mean',
            analogsInitialCount: 5,
            analogsUsedCount: 5,
            analogsExcludedCount: 0,
            leasableArea: 1000,
            occupiedArea: 952.5,
            vacancyRate: 0.0475,
            vacancyRatePercent: 4.75,
            vacancyRateSource: 'factual',
            vacancyRateSourceLabel: 'Фактическая незаполняемость ниже квартального рыночного профиля (1 кв. 2025)',
            baseVacancyRate: 0.09,
            vacancyAdjustments: [],
            pgi: 18000000,
            egi: 17145000,
            opex: 3600450,
            opexRate: 0.21,
            opexRateSource: 'quarter_profile',
            opexRateReasoning: 'Квартальный рыночный профиль операционных расходов (1 кв. 2025)',
            baseOpexRate: 0.21,
            opexAdjustments: [],
            noi: 13544550,
            capitalizationRate: 0.10,
            capitalizationRateSource: 'quarter_profile',
            capitalizationRateSourceLabel: 'Квартальный рыночный профиль капитализации (1 кв. 2025)',
            baseCapitalizationRate: 0.10,
            capitalizationAdjustments: [],
            valueTotal: 135445500,
            landShare: 1000000,
            finalValue: 134445500,
            pricePerM2: 134445.5,
            actualVacancyRate: 0.0475,
            reliabilityDetails: {
                score: 80,
                note: 'Тестовая уверенность',
                factors: [],
                components: {},
            },
            assumptions: [],
        }
    );

    const rentBlock = breakdown.methodology.blocks.find((block) => block.key === 'rent');
    const vacancyBlock = breakdown.methodology.blocks.find((block) => block.key === 'vacancy');
    const capBlock = breakdown.methodology.blocks.find((block) => block.key === 'cap-rate');
    const opexBlock = breakdown.methodology.blocks.find((block) => block.key === 'opex');

    assert.ok(rentBlock);
    assert.ok(vacancyBlock);
    assert.ok(capBlock);
    assert.ok(opexBlock);
    assert.equal(rentBlock.facts.some((item) => /Диапазон скорректированных ставок/i.test(String(item))), false);
    assert.equal(vacancyBlock.facts.some((item) => /Корректировки/i.test(String(item))), false);
    assert.equal(capBlock.facts.some((item) => /Корректировки|Разброс скорректированных ставок/i.test(String(item))), false);
    assert.equal(opexBlock.facts.some((item) => /Корректировки/i.test(String(item))), false);
});
