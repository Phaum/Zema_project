function toPlainObject(value) {
    if (!value) {
        return null;
    }

    if (typeof value.get === 'function') {
        return value.get({ plain: true });
    }

    if (typeof value.toJSON === 'function') {
        return value.toJSON();
    }

    return { ...value };
}

function cloneJson(value) {
    if (value === null || value === undefined) {
        return value;
    }

    return JSON.parse(JSON.stringify(value));
}

function sanitizeCalculationBreakdown(breakdown, { debugModeEnabled = false } = {}) {
    const cloned = cloneJson(breakdown);

    if (!cloned || typeof cloned !== 'object' || debugModeEnabled) {
        return cloned;
    }

    delete cloned.dataQuality;
    delete cloned.methodology;
    delete cloned.calculationSteps;
    delete cloned.assumptions;
    delete cloned.sensitivity;

    if (cloned.inputs && typeof cloned.inputs === 'object') {
        delete cloned.inputs.rentalRate;
        delete cloned.inputs.leasableArea;
        delete cloned.inputs.vacancyRate;
        delete cloned.inputs.opexRate;
        delete cloned.inputs.actualOccupancy;
        delete cloned.inputs.capitalizationRate;
    }

    if (cloned.market && typeof cloned.market === 'object') {
        delete cloned.market.excludedComparables;
    }

    if (cloned.summary && typeof cloned.summary === 'object') {
        delete cloned.summary.confidence;
        delete cloned.summary.confidenceNote;
        delete cloned.summary.confidenceFactors;
        delete cloned.summary.confidenceComponents;
    }

    return cloned;
}

export function shapeMarketSnapshotForViewer(snapshot, { debugModeEnabled = false } = {}) {
    const cloned = cloneJson(snapshot);

    if (!cloned || typeof cloned !== 'object' || debugModeEnabled) {
        return cloned;
    }

    delete cloned.adjustedRates;
    delete cloned.excludedDuplicates;

    return cloned;
}

export function shapeProjectResultForViewer(result, { debugModeEnabled = false } = {}) {
    const plain = toPlainObject(result);

    if (!plain) {
        return null;
    }

    return {
        ...plain,
        debugModeEnabled: Boolean(debugModeEnabled),
        market_snapshot_json: shapeMarketSnapshotForViewer(plain.market_snapshot_json, {
            debugModeEnabled,
        }),
        calculation_breakdown_json: sanitizeCalculationBreakdown(plain.calculation_breakdown_json, {
            debugModeEnabled,
        }),
    };
}
