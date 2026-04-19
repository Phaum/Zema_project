const ENVIRONMENT_CATEGORY_LABELS = Object.freeze({
    prime_business: 'деловая активность высокого уровня',
    urban_business: 'городская деловая среда',
    mixed_urban: 'смешанная городская среда',
    residential_mixed: 'смешанная жилая среда',
    industrial_edge: 'промышленная периферия',
    warehouse_industrial: 'складская и промышленная зона',
    peripheral_low_activity: 'периферийная зона с низкой активностью',
    residential: 'жилая застройка',
    industrial: 'промзона',
});

function humanizeEnvironmentCategory(value) {
    if (!value) return '';
    const key = String(value).trim().toLowerCase();
    return ENVIRONMENT_CATEGORY_LABELS[key] || String(value).trim();
}

export function buildCalculationBreakdown(questionnaire, marketSnapshot, calculation) {
    const manualRentalRate = toNumber(calculation.manualRentalRate, 0);
    const manualOverrideApplied = Boolean(calculation.manualOverrideApplied)
        || String(calculation.rentalRateSource || '').trim().toLowerCase() === 'manual_override';
    const marketRentMonth = toNumber(calculation.marketRentMonth, 0);
    const marketRentYear = toNumber(calculation.marketRentYear, marketRentMonth * 12);
    const marketRentFirst = toNumber(calculation.marketRentFirst, marketRentMonth);
    const marketRentSecond = toNumber(calculation.marketRentSecond, marketRentFirst * 1.03);
    const marketRentThirdPlus = toNumber(calculation.marketRentThirdPlus, marketRentFirst * 0.98);
    const leasableArea = toNumber(calculation.leasableArea, 0);
    const occupiedArea = toNumber(calculation.occupiedArea, 0);
    const vacancyRate = resolveVacancyRate(calculation);
    const vacancyRatePercent = vacancyRate * 100;
    const pgi = toNumber(calculation.pgi, 0);
    const egi = toNumber(calculation.egi, 0);
    const opex = toNumber(calculation.opex, 0);
    const noi = toNumber(calculation.noi, 0);
    const capitalizationRate = toNumber(calculation.capitalizationRate, 0.1);
    const capitalizationRatePercent = capitalizationRate * 100;
    const valueTotal = toNumber(calculation.valueTotal, 0);
    const landShare = toNumber(calculation.landShare, 0);
    const finalValue = toNumber(calculation.finalValue, Math.max(0, valueTotal - landShare));
    const totalArea = toNumber(questionnaire.totalArea, 0);
    const pricePerM2 = toNumber(
        calculation.pricePerM2,
        totalArea > 0 ? finalValue / totalArea : 0
    );
    const landInput = buildLandInput(questionnaire, calculation, landShare);

    const floorInputRows = normalizeFloorInputRows(calculation.floorDetails || questionnaire.floors || []);
    const floorIncomeRows = buildFloorIncomeRows(floorInputRows, {
        marketRentFirst,
        marketRentSecond,
        marketRentThirdPlus,
    });

    const rawCalculationComparableCount = toNumber(calculation.analogsCount, null);
    const rawCalculationSelectedComparableCount = toNumber(calculation.selectedAnalogsCount, null);
    const normalizedCalculationComparableCount =
        Number.isFinite(rawCalculationComparableCount) && Number.isFinite(rawCalculationSelectedComparableCount)
            ? Math.min(rawCalculationComparableCount, rawCalculationSelectedComparableCount)
            : (Number.isFinite(rawCalculationSelectedComparableCount)
                ? rawCalculationSelectedComparableCount
                : rawCalculationComparableCount);
    const normalizedCalculationSelectedComparableCount =
        Number.isFinite(rawCalculationComparableCount) && Number.isFinite(rawCalculationSelectedComparableCount)
            ? Math.max(rawCalculationComparableCount, rawCalculationSelectedComparableCount)
            : (Number.isFinite(rawCalculationComparableCount)
                ? rawCalculationComparableCount
                : rawCalculationSelectedComparableCount);

    const comparableCount = toNumber(
        marketSnapshot?.comparableCount,
        toNumber(normalizedCalculationComparableCount, 0)
    );
    const selectedComparableCount = toNumber(
        marketSnapshot?.selectedComparableCount,
        toNumber(normalizedCalculationSelectedComparableCount, comparableCount)
    );
    const excludedComparableCount = toNumber(
        marketSnapshot?.excludedComparableCount,
        toNumber(
            calculation.excludedAnalogsCount,
            Math.max(selectedComparableCount - comparableCount, 0)
        )
    );
    const rentDiagnostics = {
        rentCalculationMode: calculation.rentCalculationMode || marketSnapshot?.rentCalculationMode || 'stable_default',
        rentSelectionMethod: calculation.rentalRateSelectionMethod || marketSnapshot?.marketRentSelectionMethod || 'stable_trimmed_mean',
        analogsInitialCount: toNumber(calculation.analogsInitialCount, marketSnapshot?.analogsInitialCount ?? selectedComparableCount),
        analogsUsedCount: toNumber(calculation.analogsUsedCount, marketSnapshot?.analogsUsedCount ?? comparableCount),
        analogsExcludedCount: toNumber(calculation.analogsExcludedCount, marketSnapshot?.analogsExcludedCount ?? excludedComparableCount),
        correctedRateMin: firstPositiveNumber(
            calculation.correctedRateMin,
            marketSnapshot?.correctedRateMin,
            calculation.marketRentMin,
            marketSnapshot?.minRentalRate
        ),
        correctedRateMedian: firstPositiveNumber(
            calculation.correctedRateMedian,
            marketSnapshot?.correctedRateMedian,
            calculation.marketRentMedian,
            marketSnapshot?.medianRentalRate
        ),
        correctedRateMax: firstPositiveNumber(
            calculation.correctedRateMax,
            marketSnapshot?.correctedRateMax,
            calculation.marketRentMax,
            marketSnapshot?.maxRentalRate
        ),
        correctedRateStdDev: toNumber(calculation.correctedRateStdDev, marketSnapshot?.correctedRateStdDev),
        correctedRateIQR: toNumber(calculation.correctedRateIQR, marketSnapshot?.correctedRateIQR),
        dispersionLevel: calculation.dispersionLevel || marketSnapshot?.dispersionLevel || null,
        sampleSizeLevel: calculation.sampleSizeLevel || marketSnapshot?.sampleSizeLevel || null,
        stabilityFlag: calculation.stabilityFlag || marketSnapshot?.stabilityFlag || null,
    };

    const opexRate = Number.isFinite(Number(calculation.opexRate))
        ? Number(calculation.opexRate)
        : (egi > 0 ? (opex / egi) : 0.21);
    const confidenceDetails = calculation.reliabilityDetails || calculateConfidenceDetailed(marketSnapshot, questionnaire, calculation, landInput);
    const methodology = buildMethodologySummary({
        questionnaire,
        calculation,
        marketSnapshot,
        marketRentFirst,
        vacancyRatePercent,
        capitalizationRatePercent,
        opexRate,
        landInput,
        comparableCount,
        selectedComparableCount,
        excludedComparableCount,
        confidenceDetails,
    });
    const fieldSourceRegistry = buildCalculationInputRegistry(questionnaire, calculation, landInput, opexRate);
    const excludedRateRows = Array.isArray(marketSnapshot?.adjustedRates)
        ? marketSnapshot.adjustedRates
            .filter((item) => item?.includedInRentCalculation === false)
            .map((item) => ({
                analogId: item.analogId || item.id || item.externalId || null,
                address_offer: item.address_offer || null,
                district: item.district || null,
                class_offer: item.class_offer || null,
                raw_rate: round2(toNumber(item.rawRate, item.baseRate)),
                corrected_rate: round2(toNumber(item.correctedRate, item.adjustedRate)),
                relevance_score: round2(toNumber(item.relevanceScore, null)),
                completeness_score: round2(toNumber(item.completenessScore, null)),
                area_ratio: round2(toNumber(item.areaRatio ?? item.scaleAreaRatio, null)),
                scale_similarity_score: round2(toNumber(item.scaleSimilarityScore, null)),
                scale_weight_penalty: round2(toNumber(item.scaleWeightPenalty, null)),
                pre_weight: round2(toNumber(item.preWeight ?? item.baseWeight, null)),
                final_weight: round2(toNumber(item.finalWeight ?? item.normalizedWeight, null)),
                exclusion_reason: item.exclusionReason || 'Исключён из итоговой выборки',
                duplicate_group_key: item.duplicateGroupKey || null,
            }))
        : [];
    const duplicateRows = Array.isArray(marketSnapshot?.excludedDuplicates)
        ? marketSnapshot.excludedDuplicates.map((item) => ({
            analogId: item.id || item.external_id || null,
            address_offer: item.address_offer || item.address || null,
            district: item.district || null,
            class_offer: item.class_offer || null,
            raw_rate: round2(toNumber(item.price_per_sqm_cleaned, item.unit_price)),
            corrected_rate: null,
            relevance_score: null,
            completeness_score: null,
            exclusion_reason: item.exclusionReason || 'Исключён как дубль объекта',
            duplicate_group_key: item.duplicateGroupKey || null,
        }))
        : [];
    const excludedComparables = [...excludedRateRows, ...duplicateRows];

    return {
        inputs: {
            rentalRate: {
                value: round2(marketRentFirst),
                annualValue: round2(marketRentYear),
                source: calculation.rentalRateSource || (manualOverrideApplied ? 'manual_override' : 'market_analogs'),
                methodLabel: humanizeRentalSelectionMethod(
                    rentDiagnostics.rentSelectionMethod
                ),
                note: manualOverrideApplied
                    ? `Основной расчет выполнен по ручному override ${formatMoney(marketRentFirst)} ₽/м²/мес. Рыночная ставка по аналогам сохранена в отчете для сравнения.`
                    : `Использована рыночная ставка для 1-го этажа в режиме ${humanizeRentCalculationMode(rentDiagnostics.rentCalculationMode).toLowerCase()}: метод ${humanizeRentalSelectionMethod(rentDiagnostics.rentSelectionMethod).toLowerCase()}, использовано ${rentDiagnostics.analogsUsedCount || comparableCount} аналогов.`,
                floorRates: {
                    first: round2(marketRentFirst),
                    second: round2(marketRentSecond),
                    thirdPlus: round2(marketRentThirdPlus),
                },
                marketData: {
                    average: round2(firstPositiveNumber(calculation.marketRentAverage, marketSnapshot?.averageRentalRate)),
                    median: round2(firstPositiveNumber(calculation.marketRentMedian, marketSnapshot?.medianRentalRate)),
                    min: round2(firstPositiveNumber(calculation.marketRentMin, marketSnapshot?.minRentalRate)),
                    max: round2(firstPositiveNumber(calculation.marketRentMax, marketSnapshot?.maxRentalRate)),
                    simpleMedian: round2(firstPositiveNumber(
                        calculation.marketRentSimpleMedian,
                        calculation.marketRentMedian,
                        marketSnapshot?.medianRentalRate
                    )),
                    simpleAverage: round2(firstPositiveNumber(
                        calculation.marketRentSimpleAverage,
                        calculation.marketRentAverage,
                        marketSnapshot?.averageRentalRate
                    )),
                    trimmedMean: round2(firstPositiveNumber(
                        calculation.marketRentTrimmedMean,
                        calculation.marketRentAverage,
                        marketSnapshot?.averageRentalRate
                    )),
                    comparableCount,
                    selectedComparableCount,
                    excludedComparableCount,
                    selectionMethod: rentDiagnostics.rentSelectionMethod,
                    calculationMode: rentDiagnostics.rentCalculationMode,
                    overrideApplied: manualOverrideApplied,
                    marketDerivedRentFirst: round2(firstPositiveNumber(calculation.marketDerivedRentFirst, marketRentFirst)),
                    diagnostics: rentDiagnostics,
                },
            },

            leasableArea: {
                value: round2(leasableArea),
                source: calculation.leasableAreaSource || (toNumber(questionnaire.leasableArea, 0) > 0 ? 'questionnaire' : 'derived'),
                note: calculation.leasableAreaSource === 'derived_from_floor_sum'
                    ? `Арендопригодная площадь в расчёте получена как сумма по этажам: ${formatNumber(leasableArea)} м²`
                    : `Арендопригодная площадь в расчёте: ${formatNumber(leasableArea)} м²`,
            },

            floorInputRows,
            floorIncomeRows,

            vacancyRate: {
                value: round2(vacancyRatePercent),
                raw: vacancyRate,
                source: calculation.vacancyRateSource || (
                    questionnaire.calculationMethod === 'actual_market'
                        ? 'factual'
                        : 'market'
                ),
                methodLabel: humanizeVacancySource(calculation.vacancyRateSource),
                note: buildVacancyExplanation(
                    questionnaire,
                    occupiedArea,
                    leasableArea,
                    vacancyRatePercent,
                    calculation
                ),
                breakdown: calculation.vacancyBreakdown || null,
            },

            opexRate: {
                value: round2(opexRate * 100),
                raw: opexRate,
                source: calculation.opexRateSource || 'profile',
                methodLabel: humanizeOpexSource(calculation.opexRateSource),
                note: buildOpexExplanation(calculation, opexRate),
                breakdown: calculation.opexBreakdown || null,
            },

            actualOccupancy: {
                occupiedArea: round2(occupiedArea),
                actualVacancyRate: Number.isFinite(Number(calculation.actualVacancyRate))
                    ? round2(Number(calculation.actualVacancyRate) * 100)
                    : null,
                note: buildActualOccupancyReference(calculation, occupiedArea, leasableArea),
            },

            capitalizationRate: {
                value: round2(capitalizationRatePercent),
                raw: capitalizationRate,
                source: calculation.capitalizationRateSource || 'fixed',
                methodLabel: humanizeCapitalizationSource(calculation.capitalizationRateSource),
                note: buildCapitalizationRateExplanation(
                    calculation.baseCapitalizationRate ?? capitalizationRate,
                    calculation.capitalizationAdjustments || [],
                    calculation.capitalizationRateSourceLabel,
                    calculation.capRateBreakdown
                ),
                breakdown: calculation.capRateBreakdown || null,
            },

            land: landInput,
        },

        methodology,
        dataQuality: {
            fieldSources: fieldSourceRegistry,
            assumptions: Array.isArray(calculation.assumptions)
                ? calculation.assumptions.map((item) => ({
                    key: item.key,
                    label: item.label,
                    penalty: round2(toNumber(item.penalty, 0)),
                }))
                : [],
        },

        calculationSteps: [
            {
                step: 1,
                title: 'Определение рыночной ставки аренды',
                formula: manualOverrideApplied
                    ? 'Ручной override ставки аренды с сохранением рыночного ориентира по аналогам'
                    : `${humanizeRentalSelectionMethod(rentDiagnostics.rentSelectionMethod)} по ставкам аналогов`,
                result: round2(marketRentFirst),
                unit: '₽/м²/мес',
                explanation: manualOverrideApplied
                    ? `Использован ручной override ${formatMoney(marketRentFirst)} ₽/м²/мес. Рыночный ориентир по аналогам составил ${formatMoney(toNumber(calculation.marketDerivedRentFirst, marketRentFirst))} ₽/м²/мес.`
                    : `Собрано ${selectedComparableCount} релевантных аналогов после дедупликации и scoring relevance. Для каждого аналога рассчитывается сопоставимая ставка, после чего применяется режим ${humanizeRentCalculationMode(rentDiagnostics.rentCalculationMode).toLowerCase()}. В итог вошло ${rentDiagnostics.analogsUsedCount || comparableCount}, исключено ${rentDiagnostics.analogsExcludedCount || excludedComparableCount}.`,
                calculation: manualOverrideApplied
                    ? `Ручной override = ${formatPlain(marketRentFirst)} ₽/м²/мес`
                    : `min ${formatPlain(rentDiagnostics.correctedRateMin)} / median ${formatPlain(rentDiagnostics.correctedRateMedian)} / max ${formatPlain(rentDiagnostics.correctedRateMax)} ₽/м²; std dev = ${formatPlain(rentDiagnostics.correctedRateStdDev)}; IQR = ${formatPlain(rentDiagnostics.correctedRateIQR)}; метод = ${rentDiagnostics.rentSelectionMethod}`,
            },
            {
                step: 2,
                title: 'Расчёт ставок аренды по этажным группам',
                formula: '1 этаж = Base; 2 этаж = Base × 1.03; 3-й этаж и выше = Base × 0.98',
                result: {
                    first: round2(marketRentFirst),
                    second: round2(marketRentSecond),
                    thirdPlus: round2(marketRentThirdPlus),
                },
                unit: '₽/м²/мес',
                rows: floorIncomeRows.map((row) => ({
                    label: row.floorLocation,
                    leasableArea: round2(row.leasableArea),
                    monthlyRate: round2(row.monthlyRate),
                    value: round2(row.monthlyRate),
                })),
            },
            {
                step: 3,
                title: 'Расчёт ПВД',
                formula: 'Σ(Арендопригодная площадь этажа × ставка этажа × 12)',
                result: round2(pgi),
                unit: '₽/год',
                calculation: buildPGIFormulaString(floorIncomeRows, pgi),
                rows: floorIncomeRows.map((row) => ({
                    label: row.floorLocation,
                    leasableArea: round2(row.leasableArea),
                    monthlyRate: round2(row.monthlyRate),
                    annualIncome: round2(row.annualIncome),
                })),
            },
            {
                step: 4,
                title: 'Определение незаполняемости',
                formula: buildVacancyFormula(questionnaire, calculation),
                result: round2(vacancyRatePercent),
                unit: '%',
                explanation: buildVacancyExplanation(
                    questionnaire,
                    occupiedArea,
                    leasableArea,
                    vacancyRatePercent,
                    calculation
                ),
            },
            {
                step: 5,
                title: 'Расчёт ДВД',
                formula: 'PGI × (1 - vacancyRate)',
                result: round2(egi),
                unit: '₽/год',
                calculation: `${formatPlain(pgi)} × (1 - ${round2(vacancyRatePercent)} / 100) = ${formatPlain(egi)}`,
            },
            {
                step: 6,
                title: 'Расчёт операционных расходов',
                formula: 'EGI × ставка операционных расходов',
                result: round2(opex),
                unit: '₽/год',
                explanation: buildOpexExplanation(calculation, opexRate),
                calculation: `${formatPlain(egi)} × ${round2(opexRate * 100)}% = ${formatPlain(opex)}`,
            },
            {
                step: 7,
                title: 'Расчёт ЧОД',
                formula: 'EGI - OPEX',
                result: round2(noi),
                unit: '₽/год',
                calculation: `${formatPlain(egi)} - ${formatPlain(opex)} = ${formatPlain(noi)}`,
            },
            {
                step: 8,
                title: 'Капитализация ЧОД',
                formula: 'NOI / ставка капитализации',
                result: round2(valueTotal),
                unit: '₽',
                explanation: buildCapitalizationRateExplanation(
                    calculation.baseCapitalizationRate ?? capitalizationRate,
                    calculation.capitalizationAdjustments || [],
                    calculation.capitalizationRateSourceLabel,
                    calculation.capRateBreakdown
                ),
                calculation: capitalizationRate > 0
                    ? `${formatPlain(noi)} / ${formatPercentPlain(capitalizationRate)} = ${formatPlain(valueTotal)}`
                    : 'Ставка капитализации не указана',
            },
            {
                step: 9,
                title: 'Вычитание стоимости земельного участка',
                formula: 'Стоимость с учетом земли - доля стоимости земли',
                result: round2(finalValue),
                unit: '₽',
                explanation: buildLandExplanation(landInput),
                calculation: buildLandStepCalculation(landInput, valueTotal, finalValue),
            },
            {
                step: 10,
                title: 'Расчёт удельной стоимости',
                formula: 'Итоговая стоимость / общая площадь ОКС',
                result: round2(pricePerM2),
                unit: '₽/м²',
                calculation: totalArea > 0
                    ? `${formatPlain(finalValue)} / ${formatPlain(totalArea)} = ${formatPlain(pricePerM2)}`
                    : 'Общая площадь не указана',
            },
        ],

        market: {
            comparableCount,
            selectedComparableCount,
            excludedComparableCount,
            district: marketSnapshot?.district || questionnaire.district || 'Не определён',
            averageRentalRate: round2(firstPositiveNumber(calculation.marketRentAverage, marketSnapshot?.averageRentalRate)),
            medianRentalRate: round2(firstPositiveNumber(calculation.marketRentMedian, marketSnapshot?.medianRentalRate)),
            minRentalRate: round2(firstPositiveNumber(calculation.marketRentMin, marketSnapshot?.minRentalRate)),
            maxRentalRate: round2(firstPositiveNumber(calculation.marketRentMax, marketSnapshot?.maxRentalRate)),
            rentalRateSource: calculation.rentalRateSource || marketSnapshot?.rentalRateSource || 'market_analogs',
            marketRentSelectionMethod: rentDiagnostics.rentSelectionMethod,
            rentCalculationMode: rentDiagnostics.rentCalculationMode,
            analogsQualityScore: toNumber(calculation.analogsQualityScore, marketSnapshot?.analogsQualityScore),
            analogsInitialCount: rentDiagnostics.analogsInitialCount,
            analogsUsedCount: rentDiagnostics.analogsUsedCount,
            analogsExcludedCount: rentDiagnostics.analogsExcludedCount,
            correctedRateMin: rentDiagnostics.correctedRateMin,
            correctedRateMedian: rentDiagnostics.correctedRateMedian,
            correctedRateMax: rentDiagnostics.correctedRateMax,
            correctedRateStdDev: rentDiagnostics.correctedRateStdDev,
            correctedRateIQR: rentDiagnostics.correctedRateIQR,
            dispersionLevel: rentDiagnostics.dispersionLevel,
            sampleSizeLevel: rentDiagnostics.sampleSizeLevel,
            stabilityFlag: rentDiagnostics.stabilityFlag,
            scaleAdjustment: {
                scale_adjustment_applied: Boolean(calculation.scaleAdjustmentApplied),
                average_scale_factor: round2(toNumber(calculation.averageScaleFactor, 1)),
                average_area_ratio: toNumber(calculation.averageAreaRatio, null) === null
                    ? null
                    : round2(toNumber(calculation.averageAreaRatio, null)),
                max_area_ratio: toNumber(calculation.maxAreaRatio, null) === null
                    ? null
                    : round2(toNumber(calculation.maxAreaRatio, null)),
                guardrail_applied: Boolean(calculation.scaleGuardrailApplied),
                guardrail_upper_limit: toNumber(calculation.scaleGuardrailUpperLimit, null) === null
                    ? null
                    : round2(toNumber(calculation.scaleGuardrailUpperLimit, null)),
                simple_median_rate: round2(toNumber(calculation.marketRentSimpleMedian, calculation.marketRentMedian)),
            },
            capRateBreakdown: calculation.capRateBreakdown || null,
            excludedComparables,
            topComparables: Array.isArray(marketSnapshot?.topComparables)
                ? marketSnapshot.topComparables.slice(0, 10)
                : [],
        },

        assumptions: Array.isArray(calculation.assumptions)
            ? calculation.assumptions.map((item) => ({
                key: item.key,
                label: item.label,
                penalty: round2(toNumber(item.penalty, 0)),
            }))
            : [],

        sensitivity: calculateSensitivity(noi, capitalizationRate, landShare),

        summary: {
            pgi: round2(pgi),
            grossIncome: round2(pgi),
            egi: round2(egi),
            opex: round2(opex),
            noi: round2(noi),
            capitalizationRate,
            capitalizationRatePercent: round2(capitalizationRatePercent),
            valueTotal: round2(valueTotal),
            landShare,
            finalValue: round2(finalValue),
            estimatedValue: round2(finalValue),
            pricePerM2: round2(pricePerM2),
            comparablesUsed: comparableCount,
            confidence: confidenceDetails.score,
            confidenceNote: confidenceDetails.note,
            confidenceFactors: confidenceDetails.factors,
            confidenceComponents: confidenceDetails.components || null,
        },
    };
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function round2(value) {
    return Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

function formatPlain(value) {
    return String(round2(value));
}

function formatNumber(value) {
    return round2(value).toLocaleString('ru-RU');
}

function formatMoney(value) {
    return round2(value).toLocaleString('ru-RU');
}

function formatPrecisePlain(value, maxFractionDigits = 6) {
    const number = toNumber(value, null);
    if (!Number.isFinite(number)) return '0';

    return number.toLocaleString('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxFractionDigits,
        useGrouping: false,
    });
}

function formatPreciseMoney(value) {
    const number = toNumber(value, null);
    if (!Number.isFinite(number)) return '0';

    return number.toLocaleString('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6,
    });
}

function formatPercentPlain(value) {
    return `${formatPlain(toNumber(value, 0) * 100)}%`;
}

function resolveVacancyRate(calculation) {
    if (Number.isFinite(Number(calculation.vacancyRate))) {
        return Number(calculation.vacancyRate);
    }

    if (Number.isFinite(Number(calculation.vacancyRatePercent))) {
        return Number(calculation.vacancyRatePercent) / 100;
    }

    return 0;
}

function normalizeFloorInputRows(rows = []) {
    return rows.map((row, index) => ({
        id: row.id || `floor_${index + 1}`,
        floorLocation: row.floorLocation || row.label || `Этаж ${index + 1}`,
        name: row.name || row.floorLocation || row.label || `Этаж ${index + 1}`,
        floorCategory: row.floorCategory || 'third_plus',
        area: toNumber(row.area, 0),
        leasableArea: toNumber(row.leasableArea, 0),
        avgLeasableRoomArea: toNumber(row.avgLeasableRoomArea, 0),
        premisesPurpose: row.premisesPurpose || row.purpose || '',
        occupiedArea: toNumber(row.occupiedArea, 0),
        monthlyRate: toNumber(row.monthlyRate, 0),
        annualIncome: toNumber(row.annualIncome, 0),
    }));
}

function getFloorRateByCategory(category, rates) {
    if (category === 'first') return rates.marketRentFirst;
    if (category === 'second') return rates.marketRentSecond;
    return rates.marketRentThirdPlus;
}

function buildFloorIncomeRows(floorInputRows, rates) {
    return floorInputRows
        .map((row) => {
            const monthlyRate = row.monthlyRate || getFloorRateByCategory(row.floorCategory, rates);
            const annualIncome = row.annualIncome || (row.leasableArea * monthlyRate * 12);

            return {
                ...row,
                monthlyRate,
                annualIncome,
            };
        })
        .filter((row) => row.leasableArea > 0);
}

function buildPGIFormulaString(floorRows, total) {
    if (!floorRows.length) {
        return `PGI = ${formatPlain(total)}`;
    }

    const parts = floorRows.map(
        (row) => `${formatPlain(row.leasableArea)} × ${formatPlain(row.monthlyRate)} × 12`
    );

    return `${parts.join(' + ')} = ${formatPlain(total)}`;
}

function buildLandInput(questionnaire, calculation, landShare) {
    const landDetails = calculation.landDetails || {};

    return {
        cadastralNumber: landDetails.cadastralNumber || questionnaire.landCadastralNumber || null,
        landCadCost: toNumber(landDetails.landCadCost, questionnaire.landCadCost),
        landArea: round2(toNumber(landDetails.landArea, questionnaire.landArea)),
        totalOksAreaOnLand: round2(toNumber(landDetails.totalOksAreaOnLand, questionnaire.totalOksAreaOnLand)),
        objectArea: round2(toNumber(landDetails.objectArea, questionnaire.totalArea)),
        allocationRatio: round2(toNumber(landDetails.allocationRatio, 0) * 100),
        landShareRatio: round2(toNumber(landDetails.landShareRatio, toNumber(landDetails.allocationRatio, 0)) * 100),
        subjectArea: round2(toNumber(landDetails.objectArea, questionnaire.totalArea)),
        subjectLandShareRatio: round2(toNumber(landDetails.allocationRatio, 0) * 100),
        landShare,
        landShareValue: landShare,
        source: landDetails.source || 'missing',
        landCalculationMode: landDetails.calculationMode || landDetails.source || 'missing',
        isCalculated: Boolean(landDetails.isCalculated),
        isComplete: Boolean(landDetails.isComplete),
        doubleSubtractionGuard: landDetails.doubleSubtractionGuard !== false,
        warnings: Array.isArray(landDetails.warnings) ? landDetails.warnings : [],
    };
}

function buildLandExplanation(landInput) {
    if (!landInput.isCalculated) {
        return landInput.warnings?.length
            ? landInput.warnings.join(' ')
            : 'Доля земли не рассчитана из-за нехватки исходных данных.';
    }

    const sourceText = landInput.source === 'proportional_by_oks_area'
        ? 'Доля земли распределена пропорционально площади оцениваемого ОКС в общей площади всех ОКС на участке.'
        : landInput.source === 'fallback_subject_exceeds_total_oks'
            ? 'Общая площадь всех ОКС на участке оказалась меньше площади объекта, поэтому применён консервативный fallback по полной стоимости участка.'
            : 'Использовано резервное допущение о единственном ОКС на участке, потому что общая площадь всех ОКС не найдена.';

    const warnings = landInput.warnings?.length ? ` ${landInput.warnings.join(' ')}` : '';

    return `${sourceText} Итоговая доля объекта в земле: ${formatNumber(landInput.allocationRatio)}%.${warnings}`.trim();
}

function buildLandStepCalculation(landInput, valueTotal, finalValue) {
    if (!landInput.isCalculated) {
        return `${formatPlain(valueTotal)} - 0 = ${formatPlain(finalValue)}`;
    }

    const shareFormula = landInput.source === 'fallback_subject_exceeds_total_oks'
        ? `${formatPrecisePlain(landInput.landCadCost)} × 1 = ${formatPrecisePlain(landInput.landShare)}`
        : landInput.totalOksAreaOnLand > 0
        ? `${formatPrecisePlain(landInput.landCadCost)} × (${formatPlain(landInput.objectArea)} / ${formatPlain(landInput.totalOksAreaOnLand)}) = ${formatPrecisePlain(landInput.landShare)}`
        : `${formatPrecisePlain(landInput.landCadCost)} × 1 = ${formatPrecisePlain(landInput.landShare)}`;

    return `${shareFormula}; ${formatPlain(valueTotal)} - ${formatPrecisePlain(landInput.landShare)} = ${formatPlain(finalValue)}`;
}

function buildVacancyFormula(questionnaire, calculation = {}) {
    const source = calculation.vacancyRateSource || (
        questionnaire.calculationMethod === 'actual_market'
            ? 'factual'
            : 'market'
    );

    if (source === 'factual' || source === 'fact_from_occupied_area' || source === 'fact_fallback') {
        return '1 - occupiedArea / leasableArea';
    }

    if (source === 'manual' || source === 'manual_input') {
        return 'Vacancy указана пользователем';
    }

    if (source === 'fallback' || source === 'default_fallback') {
        return 'Безопасный fallback-профиль незаполняемости по умолчанию';
    }

    return 'Рыночная ставка незаполняемости по профилю сегмента';
}

function buildVacancyExplanation(questionnaire, occupiedArea, leasableArea, vacancyRatePercent, calculation = {}) {
    const source = calculation.vacancyRateSource || (
        questionnaire.calculationMethod === 'actual_market'
            ? 'factual'
            : 'market'
    );

    const sourceLabel = calculation.vacancyRateSourceLabel
        ? `${calculation.vacancyRateSourceLabel}. `
        : '';
    const baseRate = Number.isFinite(Number(calculation.baseVacancyRate))
        ? `Базовое значение: ${round2(Number(calculation.baseVacancyRate) * 100)}%. `
        : '';
    const adjustments = Array.isArray(calculation.vacancyAdjustments) && calculation.vacancyAdjustments.length
        ? `Корректировки: ${calculation.vacancyAdjustments.map((item) => {
            const value = toNumber(item?.value, 0);
            const sign = value >= 0 ? '+' : '';
            return `${item?.reason || 'Корректировка'} (${sign}${round2(value * 100)}%)`;
        }).join(', ')}. `
        : '';
    const actualReference = buildActualOccupancyReference(calculation, occupiedArea, leasableArea);
    const actualText = actualReference ? ` ${actualReference}` : '';

    if (source === 'factual' || source === 'fact_from_occupied_area' || source === 'fact_fallback') {
        return `${sourceLabel}${baseRate}${adjustments}Использована фактическая незаполняемость ${round2(vacancyRatePercent)}%.${actualText}`.trim();
    }

    if (source === 'manual' || source === 'manual_input') {
        return `${sourceLabel}${baseRate}${adjustments}Использовано значение незаполняемости, введенное пользователем: ${round2(vacancyRatePercent)}%.${actualText}`.trim();
    }

    if (source === 'fallback' || source === 'default_fallback') {
        return `${sourceLabel}${baseRate}${adjustments}Использован безопасный fallback-профиль незаполняемости ${round2(vacancyRatePercent)}%.${actualText}`.trim();
    }

    return `${sourceLabel}${baseRate}${adjustments}Использована рыночная незаполняемость ${round2(vacancyRatePercent)}%.${actualText}`.trim();
}

function buildActualOccupancyReference(calculation, occupiedArea, leasableArea) {
    const actualRate = Number(calculation.actualVacancyRate);

    if (!Number.isFinite(actualRate) || occupiedArea <= 0 || leasableArea <= 0) {
        return '';
    }

    return `Фактическая незаполняемость объекта рассчитана справочно: 1 - ${formatPlain(occupiedArea)} / ${formatPlain(leasableArea)} = ${round2(actualRate * 100)}%`;
}

function buildCapitalizationRateExplanation(baseRate, adjustments, sourceLabel = null, capRateBreakdown = null) {
    const base = toNumber(baseRate, 0);
    const list = Array.isArray(adjustments) ? adjustments : [];
    const totalAdjustment = list.reduce((sum, item) => sum + toNumber(item.value, 0), 0);
    const finalRate = toNumber(capRateBreakdown?.finalCapRate, base + totalAdjustment);

    let text = sourceLabel
        ? `${sourceLabel}\n\nБазовая ставка: ${round2(base * 100)}%`
        : `Базовая ставка: ${round2(base * 100)}%`;

    if (list.length) {
        text += '\n\nКорректировки:';
        list.forEach((item) => {
            const value = toNumber(item.value, 0);
            const sign = value >= 0 ? '+' : '';
            text += `\n• ${item.reason || 'Корректировка'}: ${sign}${round2(value * 100)}%`;
        });
    }

    if (capRateBreakdown) {
        const riskLines = [
            Number.isFinite(toNumber(capRateBreakdown.reliabilityAdjustment, null))
                ? `Надёжность модели: ${formatSignedPercent(capRateBreakdown.reliabilityAdjustment)}`
                : null,
            Number.isFinite(toNumber(capRateBreakdown.dispersionAdjustment, null))
                ? `Разброс ставок: ${formatSignedPercent(capRateBreakdown.dispersionAdjustment)}`
                : null,
            Number.isFinite(toNumber(capRateBreakdown.scaleMismatchAdjustment, null))
                ? `Scale mismatch аналогов: ${formatSignedPercent(capRateBreakdown.scaleMismatchAdjustment)}`
                : null,
            Number.isFinite(toNumber(capRateBreakdown.subjectDataAdjustment, null))
                ? `Качество данных объекта: ${formatSignedPercent(capRateBreakdown.subjectDataAdjustment)}`
                : null,
        ].filter(Boolean);

        if (riskLines.length) {
            text += `\n\nРиск-факторы:\n• ${riskLines.join('\n• ')}`;
        }
    }

    text += `\n\nИтоговая ставка: ${round2(finalRate * 100)}%`;

    return text;
}

function formatSignedPercent(value) {
    const numeric = toNumber(value, 0) * 100;
    const sign = numeric >= 0 ? '+' : '';
    return `${sign}${round2(numeric)}%`;
}

function normalizeFieldSourceHints(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return Object.entries(value).reduce((acc, [key, source]) => {
        const normalizedKey = String(key || '').trim();
        const normalizedSource = String(source || '').trim();

        if (normalizedKey && normalizedSource) {
            acc[normalizedKey] = normalizedSource;
        }

        return acc;
    }, {});
}

function firstPositiveNumber(...values) {
    for (const value of values) {
        const numeric = toNumber(value, null);
        if (Number.isFinite(numeric) && numeric > 0) {
            return numeric;
        }
    }

    return null;
}

function classifySourceKind(source) {
    const normalized = String(source || '').trim().toLowerCase();

    if (!normalized) return 'unknown';
    if (normalized.startsWith('manual')) return 'manual';
    if (normalized.includes('fact') || normalized.includes('occupied')) return 'factual';
    if (normalized.includes('nspd') || normalized.includes('reestrnet') || normalized.includes('cadastral')) return 'cadastral';
    if (normalized.includes('profile')) return 'profile';
    if (normalized.includes('fallback') || normalized.includes('default')) return 'default';
    return 'automatic';
}

function humanizeSourceKind(kind) {
    switch (kind) {
        case 'manual':
            return 'Ручной ввод';
        case 'factual':
            return 'Фактические данные объекта';
        case 'cadastral':
            return 'Кадастровый / НСПД источник';
        case 'profile':
            return 'Рыночный профиль модели';
        case 'default':
            return 'Fallback / дефолт модели';
        case 'automatic':
            return 'Автоматически определено платформой';
        default:
            return 'Источник не классифицирован';
    }
}

function humanizeFieldSource(source) {
    const normalized = String(source || '').trim().toLowerCase();

    switch (normalized) {
        case 'market_analogs':
            return 'Рыночные аналоги';
        case 'market_offers_exact_object':
            return 'Рыночные предложения по точному объекту';
        case 'market_offers_district_class':
            return 'Рыночные предложения по району и классу';
        case 'metro_by_coordinates':
            return 'Метро по координатам';
        case 'environment_analysis_cache':
            return 'Кэш анализа окружения';
        case 'manual':
        case 'manual_input':
            return 'Ручной ввод';
        case 'profile':
            return 'Профиль модели';
        case 'quarter_profile':
            return 'Квартальный рыночный профиль';
        case 'rule_based_profile':
            return 'Параметрический профиль';
        case 'factual':
            return 'Фактические данные объекта';
        case 'derived_from_floor_sum':
            return 'Сумма по этажам';
        case 'cadastral_land':
            return 'Кадастровые данные участка';
        case 'nspd':
        case 'nspd_land':
        case 'nspd_building':
        case 'reestrnet':
            return 'Кадастровый / НСПД источник';
        default:
            return source ? String(source) : 'Источник не указан';
    }
}

function buildCalculationInputRegistry(questionnaire, calculation, landInput, opexRate) {
    const fieldSourceHints = normalizeFieldSourceHints(questionnaire?.fieldSourceHints);
    const entries = [
        {
            key: 'totalArea',
            label: 'Общая площадь объекта',
            value: round2(toNumber(questionnaire?.totalArea, 0)),
            source: fieldSourceHints.totalArea || 'manual_input',
        },
        {
            key: 'leasableArea',
            label: 'Арендопригодная площадь',
            value: round2(toNumber(calculation?.leasableArea, questionnaire?.leasableArea)),
            source: calculation?.leasableAreaSource || fieldSourceHints.leasableArea || 'manual_input',
        },
        {
            key: 'occupiedArea',
            label: 'Занятая площадь',
            value: round2(toNumber(questionnaire?.occupiedArea, 0)),
            source: fieldSourceHints.occupiedArea || (calculation?.vacancyRateSource === 'factual' ? 'factual' : 'manual_input'),
        },
        {
            key: 'district',
            label: 'Район',
            value: questionnaire?.district || null,
            source: fieldSourceHints.district || 'manual_input',
        },
        {
            key: 'metroDistance',
            label: 'Расстояние до метро',
            value: round2(toNumber(questionnaire?.metroDistance, 0)),
            source: fieldSourceHints.metroDistance || 'manual_input',
        },
        {
            key: 'businessCenterClass',
            label: 'Класс объекта',
            value: questionnaire?.marketClassResolved || questionnaire?.businessCenterClass || null,
            source: fieldSourceHints.marketClassResolved || fieldSourceHints.businessCenterClass || 'manual_input',
        },
        {
            key: 'rentalRate',
            label: 'Рыночная ставка аренды',
            value: round2(toNumber(calculation?.marketRentFirst, 0)),
            source: calculation?.rentalRateSource || 'market_analogs',
        },
        {
            key: 'vacancyRate',
            label: 'Vacancy',
            value: round2(toNumber(calculation?.vacancyRatePercent, 0)),
            source: calculation?.vacancyRateSource || 'profile',
        },
        {
            key: 'opexRate',
            label: 'OPEX',
            value: round2(opexRate * 100),
            source: calculation?.opexRateSource || 'profile',
        },
        {
            key: 'capitalizationRate',
            label: 'Cap rate',
            value: round2(toNumber(calculation?.capitalizationRate, 0) * 100),
            source: calculation?.capitalizationRateSource || 'profile',
        },
        {
            key: 'landCadastralNumber',
            label: 'Кадастровый номер участка',
            value: landInput?.cadastralNumber || questionnaire?.landCadastralNumber || null,
            source: fieldSourceHints.landCadastralNumber || (landInput?.source === 'missing' ? 'fallback' : 'cadastral_land'),
        },
        {
            key: 'landCadCost',
            label: 'Кадастровая стоимость участка',
            value: toNumber(landInput?.landCadCost, questionnaire?.landCadCost),
            source: fieldSourceHints.landCadCost || (landInput?.source === 'missing' ? 'fallback' : 'cadastral_land'),
        },
        {
            key: 'totalOksAreaOnLand',
            label: 'Общая площадь ОКС на участке',
            value: round2(toNumber(landInput?.totalOksAreaOnLand, questionnaire?.totalOksAreaOnLand)),
            source: fieldSourceHints.totalOksAreaOnLand || (landInput?.isComplete ? 'cadastral_land' : 'fallback'),
        },
    ];

    return entries
        .filter((item) => item.value !== null && item.value !== undefined && item.value !== '')
        .map((item) => ({
            ...item,
            sourceKind: classifySourceKind(item.source),
            sourceKindLabel: humanizeSourceKind(classifySourceKind(item.source)),
            sourceLabel: humanizeFieldSource(item.source),
        }));
}

function humanizeRentalSelectionMethod(method) {
    switch (method) {
        case 'small_sample_median':
            return 'Медиана по малой выборке';
        case 'stable_trimmed_mean':
            return 'Trimmed mean после отсечения крайних 10%';
        case 'advanced_weighted_median':
            return 'Взвешенная медиана по relevance-весам';
        case 'excel_simple_median':
            return 'Excel-compatible медиана';
        case 'excel_simple_average':
            return 'Excel-compatible среднее';
        case 'single_analogue':
            return 'Один наиболее релевантный аналог';
        case 'median_small_sample':
            return 'Медиана по малой выборке';
        case 'weighted_average':
            return 'Взвешенное среднее';
        case 'median':
            return 'Медиана';
        default:
            return method ? String(method) : 'Рыночная модель';
    }
}

function humanizeRentCalculationMode(mode) {
    switch (mode) {
        case 'excel_compatible':
            return 'Excel-compatible';
        case 'advanced_experimental':
            return 'Advanced experimental';
        case 'stable_default':
        default:
            return 'Stable default';
    }
}

function humanizeVacancySource(source) {
    switch (source) {
        case 'quarter_profile':
            return 'Квартальный рыночный профиль незаполняемости';
        case 'market':
        case 'rule_based_profile':
            return 'Рыночный профиль незаполняемости';
        case 'manual':
        case 'manual_input':
            return 'Ручной ввод vacancy';
        case 'factual':
        case 'fact_from_occupied_area':
        case 'fact_fallback':
            return 'Фактическая незаполняемость объекта';
        case 'fallback':
        case 'default_fallback':
            return 'Безопасный fallback-профиль';
        default:
            return source ? String(source) : 'Рыночный профиль';
    }
}

function humanizeCapitalizationSource(source) {
    switch (source) {
        case 'quarter_profile':
            return 'Квартальный рыночный профиль капитализации';
        case 'rule_based_profile':
            return 'Rule-based профиль капитализации';
        case 'fixed':
            return 'Фиксированная ставка';
        default:
            return source ? String(source) : 'Профиль капитализации';
    }
}

function humanizeOpexSource(source) {
    switch (source) {
        case 'quarter_profile':
            return 'Квартальный рыночный профиль операционных расходов';
        case 'profile':
        case 'rule_based_profile':
            return 'Параметрический профиль OPEX';
        case 'manual':
        case 'manual_input':
            return 'Ручной ввод OPEX';
        default:
            return source ? String(source) : 'Профиль расходов';
    }
}

function buildOpexExplanation(calculation = {}, opexRate = 0.21) {
    const sourceLabel = calculation.opexRateReasoning || calculation.opexProfileUsed || null;
    const baseRate = Number.isFinite(Number(calculation.baseOpexRate))
        ? `Базовый профиль: ${round2(Number(calculation.baseOpexRate) * 100)}%. `
        : '';
    const adjustments = Array.isArray(calculation.opexAdjustments) && calculation.opexAdjustments.length
        ? `Корректировки: ${calculation.opexAdjustments.map((item) => {
            const value = toNumber(item?.value, 0);
            const sign = value >= 0 ? '+' : '';
            return `${item?.reason || 'Корректировка'} (${sign}${round2(value * 100)}%)`;
        }).join(', ')}. `
        : '';

    return `${sourceLabel ? `${sourceLabel}. ` : ''}${baseRate}${adjustments}Итоговая ставка OPEX: ${round2(opexRate * 100)}% от EGI.`.trim();
}

function humanizeLandSource(source) {
    switch (source) {
        case 'proportional_by_oks_area':
            return 'Распределение по доле площади ОКС на участке';
        case 'single_object_fallback':
            return 'Fallback: объект считается единственным ОКС на участке';
        case 'fallback_single_object_assumption':
            return 'Fallback: общая площадь всех ОКС не найдена, принят один объект на участке';
        case 'fallback_subject_exceeds_total_oks':
            return 'Fallback: общая площадь ОКС на участке меньше площади объекта';
        case 'missing':
            return 'Недостаточно исходных данных';
        default:
            return source ? String(source) : 'Не определён';
    }
}

function formatAdjustmentLine(item) {
    const value = toNumber(item?.value, 0);
    const sign = value >= 0 ? '+' : '';
    return `${item?.reason || 'Корректировка'} (${sign}${round2(value * 100)}%)`;
}

function buildMethodologySummary({
    questionnaire,
    calculation,
    marketSnapshot,
    marketRentFirst,
    vacancyRatePercent,
    capitalizationRatePercent,
    opexRate,
    landInput,
    comparableCount,
    selectedComparableCount,
    excludedComparableCount,
    confidenceDetails,
}) {
    const environmentCategories = [
        questionnaire.environmentCategory1,
        questionnaire.environmentCategory2,
        questionnaire.environmentCategory3,
    ].filter(Boolean).map(humanizeEnvironmentCategory);

    const rentMethod = calculation.rentalRateSelectionMethod || marketSnapshot?.marketRentSelectionMethod || 'stable_trimmed_mean';
    const rentMode = calculation.rentCalculationMode || marketSnapshot?.rentCalculationMode || 'stable_default';
    const rentModeSummary = calculation.manualOverrideApplied
        ? `Ставка аренды зафиксирована ручным override ${formatMoney(calculation.manualOverrideRate || marketRentFirst)} ₽/м²/мес.`
        : `Рыночная ставка 1-го этажа определена в режиме ${humanizeRentCalculationMode(rentMode).toLowerCase()} как ${humanizeRentalSelectionMethod(rentMethod).toLowerCase()} по скорректированным аналогам.`;

    const vacancyMethod = humanizeVacancySource(calculation.vacancyRateSource);
    const opexMethod = humanizeOpexSource(calculation.opexRateSource);
    const capMethod = humanizeCapitalizationSource(calculation.capitalizationRateSource);
    const landMethod = humanizeLandSource(landInput.source);

    return {
        overview: 'Расчёт построен по доходному подходу: сначала определяется рыночная аренда по аналогам, затем рассчитываются доходы и расходы, после чего ЧОД капитализируется и корректируется на стоимость земельной доли.',
        blocks: [
            {
                key: 'location',
                title: 'Контекст объекта',
                summary: questionnaire.nearestMetro
                    ? `Объект анализируется в локации ${questionnaire.district || 'без уточнённого района'}, ближайшее метро ${questionnaire.nearestMetro}${Number.isFinite(Number(questionnaire.metroDistance)) ? ` на расстоянии ${formatNumber(questionnaire.metroDistance, 0)} м` : ''}.`
                    : `Локация объекта учитывается через район, метро, исторический центр и категории окружения.`,
                facts: [
                    questionnaire.district ? `Район: ${questionnaire.district}` : null,
                    questionnaire.nearestMetro ? `Метро: ${questionnaire.nearestMetro}` : null,
                    Number.isFinite(Number(questionnaire.metroDistance)) ? `До метро: ${formatNumber(questionnaire.metroDistance, 0)} м` : null,
                    questionnaire.isHistoricalCenter === true
                        ? 'Исторический центр: да'
                        : questionnaire.isHistoricalCenter === false
                            ? 'Исторический центр: нет'
                            : null,
                    environmentCategories.length ? `Категории окружения: ${environmentCategories.join(' / ')}` : null,
                ].filter(Boolean),
            },
            {
                key: 'rent',
                title: 'Как выбрана ставка аренды',
                summary: rentModeSummary,
                facts: [
                    `Режим: ${humanizeRentCalculationMode(rentMode)}`,
                    `Метод: ${humanizeRentalSelectionMethod(rentMethod)}`,
                    `Аналогов до стабилизации: ${toNumber(calculation.analogsInitialCount, marketSnapshot?.analogsInitialCount || selectedComparableCount)}`,
                    `В итоговой ставке использовано: ${toNumber(calculation.analogsUsedCount, marketSnapshot?.analogsUsedCount || comparableCount)}`,
                    `Исключено из итоговой ставки: ${toNumber(calculation.analogsExcludedCount, marketSnapshot?.analogsExcludedCount || excludedComparableCount)}`,
                    `Разброс: ${calculation.dispersionLevel || marketSnapshot?.dispersionLevel || 'n/a'}, размер выборки: ${calculation.sampleSizeLevel || marketSnapshot?.sampleSizeLevel || 'n/a'}, флаг: ${calculation.stabilityFlag || marketSnapshot?.stabilityFlag || 'n/a'}`,
                    `Итоговая ставка 1-го этажа: ${formatMoney(marketRentFirst)} ₽/м²/мес`,
                ],
            },
            {
                key: 'vacancy',
                title: 'Как выбрана незаполняемость',
                summary: `${vacancyMethod}. В расчет вошло ${formatNumber(vacancyRatePercent, 2)}%.`,
                facts: [
                    Number.isFinite(Number(calculation.baseVacancyRate))
                        ? `Базовое значение: ${formatNumber(Number(calculation.baseVacancyRate) * 100, 2)}%`
                        : null,
                    calculation.vacancyRateSourceLabel || null,
                    Number.isFinite(Number(calculation.actualVacancyRate))
                        ? `Фактическая vacancy объекта справочно: ${formatNumber(Number(calculation.actualVacancyRate) * 100, 2)}%`
                        : null,
                ].filter(Boolean),
            },
            {
                key: 'cap-rate',
                title: 'Как выбрана ставка капитализации',
                summary: `${capMethod}. Итоговая ставка капитализации составила ${formatNumber(capitalizationRatePercent, 2)}%.`,
                facts: [
                    Number.isFinite(Number(calculation.baseCapitalizationRate))
                        ? `Базовая ставка: ${formatNumber(Number(calculation.baseCapitalizationRate) * 100, 2)}%`
                        : null,
                    calculation.capitalizationRateSourceLabel || null,
                ].filter(Boolean),
            },
            {
                key: 'opex',
                title: 'Как выбраны операционные расходы',
                summary: `${opexMethod}. В расчете использовано ${formatNumber(opexRate * 100, 2)}% от EGI.`,
                facts: [
                    Number.isFinite(Number(calculation.baseOpexRate))
                        ? `Базовый профиль: ${formatNumber(Number(calculation.baseOpexRate) * 100, 2)}%`
                        : null,
                    calculation.opexRateReasoning || calculation.opexProfileUsed || null,
                ].filter(Boolean),
            },
            {
                key: 'land',
                title: 'Как учтена земля',
                summary: landInput.isCalculated
                    ? `${landMethod}. Из стоимости объекта вычтена доля земли ${formatPreciseMoney(landInput.landShare)} ₽.`
                    : 'Земельная доля не была рассчитана полноценно, поэтому результат требует ручной проверки входных данных по участку.',
                facts: [
                    landInput.cadastralNumber ? `Участок: ${landInput.cadastralNumber}` : null,
                    landInput.landCalculationMode ? `Режим расчета земли: ${landInput.landCalculationMode}` : null,
                    landInput.landCadCost > 0 ? `Кадастровая стоимость участка: ${formatPreciseMoney(landInput.landCadCost)} ₽` : null,
                    landInput.totalOksAreaOnLand > 0 ? `Общая площадь ОКС на участке: ${formatNumber(landInput.totalOksAreaOnLand)} м²` : null,
                    landInput.objectArea > 0 ? `Площадь оцениваемого ОКС: ${formatNumber(landInput.objectArea)} м²` : null,
                    landInput.landShareRatio > 0 ? `Доля объекта в земле: ${formatNumber(landInput.landShareRatio, 2)}%` : null,
                    landInput.doubleSubtractionGuard ? 'Контроль двойного вычитания земли: пройден' : null,
                    ...(Array.isArray(landInput.warnings) ? landInput.warnings : []),
                ].filter(Boolean),
            },
            {
                key: 'confidence',
                title: 'Почему такой уровень доверия',
                summary: `Индекс надежности расчета: ${confidenceDetails.score}%.`,
                facts: confidenceDetails.factors?.length
                    ? confidenceDetails.factors.slice(0, 5)
                    : ['Качество расчета соответствует базовому уровню модели'],
            },
        ],
    };
}

function calculateSensitivity(noi, capitalizationRate, landShare) {
    const safeCapRate = capitalizationRate > 0 ? capitalizationRate : 0.1;
    const baseValue = (noi / safeCapRate) - landShare;

    const byNoi = [
        { label: 'ЧОД -10%', noi: noi * 0.9 },
        { label: 'ЧОД -5%', noi: noi * 0.95 },
        { label: 'ЧОД +5%', noi: noi * 1.05 },
        { label: 'ЧОД +10%', noi: noi * 1.1 },
    ].map((item) => {
        const estimatedValue = (item.noi / safeCapRate) - landShare;

        return {
            ...item,
            grossIncome: item.noi,
            estimatedValue,
            change: baseValue !== 0
                ? ((estimatedValue - baseValue) / baseValue) * 100
                : 0,
        };
    });

    const byCapRate = [
        {
            label: 'Ставка капитализации -0.5%',
            capitalizationRate: safeCapRate - 0.005,
        },
        {
            label: 'Ставка капитализации +0.5%',
            capitalizationRate: safeCapRate + 0.005,
        },
    ].map((item) => {
        const capRate = item.capitalizationRate > 0 ? item.capitalizationRate : safeCapRate;
        const estimatedValue = (noi / capRate) - landShare;

        return {
            ...item,
            estimatedValue,
            change: baseValue !== 0
                ? ((estimatedValue - baseValue) / baseValue) * 100
                : 0,
        };
    });

    return {
        baseValue,
        byNoi,
        byGrossIncome: byNoi,
        byCapRate,
    };
}

function calculateConfidenceDetailed(marketSnapshot, questionnaire, calculation, landInput) {
    let score = 35;
    const factors = [];
    const comparableCount =
        toNumber(calculation?.analogsCount, 0) ||
        toNumber(marketSnapshot?.comparableCount, 0);
    const comparableCompleteness = toNumber(calculation?.analogsQualityScore, marketSnapshot?.analogsQualityScore);
    const selectedComparableCount = toNumber(
        calculation?.selectedAnalogsCount,
        marketSnapshot?.selectedComparableCount
    );
    const spread = toNumber(marketSnapshot?.maxRentalRate, 0) - toNumber(marketSnapshot?.minRentalRate, 0);
    const medianRate = toNumber(marketSnapshot?.medianRentalRate, 0);
    const spreadRatio = medianRate > 0 ? spread / medianRate : 1;

    if (comparableCount >= 8) {
        score += 18;
        factors.push('достаточное число качественных аналогов');
    } else if (comparableCount >= 5) {
        score += 12;
        factors.push('достаточная выборка аналогов');
    } else if (comparableCount >= 3) {
        score += 6;
        factors.push('ограниченная, но рабочая выборка аналогов');
    } else {
        score -= 10;
        factors.push('аналогов недостаточно для устойчивой ставки');
    }

    if (comparableCompleteness >= 0.75) {
        score += 12;
        factors.push('аналоги хорошо заполнены по ключевым полям');
    } else if (comparableCompleteness >= 0.6) {
        score += 7;
    } else if (Number.isFinite(comparableCompleteness)) {
        score -= 5;
        factors.push('по части аналогов есть пропуски в данных');
    }

    if (questionnaire.mapPointLat && questionnaire.mapPointLng) {
        score += 6;
    } else {
        score -= 4;
        factors.push('нет точных координат объекта');
    }

    if (questionnaire.nearestMetro && questionnaire.metroDistance) {
        score += 4;
    }

    if (landInput.isCalculated && landInput.isComplete) {
        score += 15;
        factors.push('доля земли рассчитана по полным кадастровым данным');
    } else if (landInput.isCalculated) {
        score += 4;
        factors.push('доля земли рассчитана по резервной логике');
    } else {
        score -= 15;
        factors.push('доля земли не рассчитана корректно');
    }

    if (calculation.vacancyRateSource === 'market') {
        score += 8;
    } else if (calculation.vacancyRateSource === 'factual') {
        score += 2;
        factors.push('vacancy основана на фактической загрузке, а не на рынке');
    } else {
        score -= 8;
        factors.push('vacancy взята из fallback-профиля');
    }

    if (calculation.rentalRateSource === 'market_analogs') {
        score += 10;
    } else {
        score -= 10;
        factors.push('ставка аренды задана вручную через override');
    }

    if (spreadRatio <= 0.35) {
        score += 10;
        factors.push('диапазон ставок аналогов достаточно узкий');
    } else if (spreadRatio <= 0.6) {
        score += 6;
    } else if (spreadRatio > 1) {
        score -= 8;
        factors.push('диапазон ставок аналогов широкий, выборка неоднородна');
    }

    if (questionnaire.isHistoricalCenter !== null && questionnaire.isHistoricalCenter !== undefined) {
        score += 2;
    }

    if (
        questionnaire.environmentCategory1 ||
        questionnaire.environmentCategory2 ||
        questionnaire.environmentCategory3
    ) {
        score += 3;
    }

    if (selectedComparableCount > 0 && comparableCount < selectedComparableCount) {
        factors.push(`из ${selectedComparableCount} отобранных аналогов в ставке использовано ${comparableCount}`);
    }

    if (calculation.sampleSizeLevel === 'small') {
        score -= 6;
        factors.push('малая выборка аналогов снижает устойчивость ставки');
    }

    if (calculation.dispersionLevel === 'high') {
        score -= 8;
        factors.push('высокий разброс ставок снижает надежность');
    }

    if (calculation.stabilityFlag === 'unstable') {
        score -= 6;
        factors.push('ставка помечена как нестабильная');
    }

    if (calculation.rentCalculationMode === 'advanced_experimental') {
        score -= 3;
        factors.push('использован advanced experimental режим ставки');
    } else if (calculation.rentCalculationMode === 'excel_compatible') {
        score -= 1;
    }

    const finalScore = Math.min(Math.max(Math.round(score), 15), 100);
    const note = factors.length
        ? factors.slice(0, 4).join('; ')
        : 'Качество расчета соответствует базовому уровню модели';

    return {
        score: finalScore,
        factors,
        note,
    };
}
