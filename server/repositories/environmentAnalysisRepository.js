import EnvironmentAnalysis from '../models/EnvironmentAnalysis.js';

const DEFAULT_RADIUS_METERS = 600;

function normalizeCadastralNumber(value) {
    return String(value || '').trim();
}

function normalizeRadius(radiusUsed) {
    const numeric = Number(radiusUsed);

    if (!Number.isFinite(numeric) || numeric <= 0) {
        return DEFAULT_RADIUS_METERS;
    }

    return Math.round(numeric);
}

function toNumberOrNull(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeEnvironmentAnalysis(row) {
    if (!row) {
        return null;
    }

    const plain = row.get ? row.get({ plain: true }) : row;

    return {
        ...plain,
        latitude: toNumberOrNull(plain.latitude),
        longitude: toNumberOrNull(plain.longitude),
        radius_used: toNumberOrNull(plain.radius_used),
        historical_center_distance_meters: toNumberOrNull(plain.historical_center_distance_meters),
        nearest_metro_distance: toNumberOrNull(plain.nearest_metro_distance),
        transport_score: toNumberOrNull(plain.transport_score),
        business_score: toNumberOrNull(plain.business_score),
        service_score: toNumberOrNull(plain.service_score),
        negative_score: toNumberOrNull(plain.negative_score),
        total_environment_score: toNumberOrNull(plain.total_environment_score),
    };
}

export async function findEnvironmentAnalysisByCadastralNumber(cadastralNumber, { radiusUsed = null } = {}) {
    const normalizedCad = normalizeCadastralNumber(cadastralNumber);

    if (!normalizedCad) {
        return null;
    }

    const where = {
        cadastral_number: normalizedCad,
    };

    if (radiusUsed !== null && radiusUsed !== undefined) {
        where.radius_used = normalizeRadius(radiusUsed);
    }

    return EnvironmentAnalysis.findOne({
        where,
        order: [['updated_at', 'DESC']],
    });
}

export async function upsertEnvironmentAnalysis(payload = {}) {
    const normalizedCad = normalizeCadastralNumber(payload.cadastral_number);
    const normalizedRadius = normalizeRadius(payload.radius_used);

    const existing = await EnvironmentAnalysis.findOne({
        where: {
            cadastral_number: normalizedCad,
            radius_used: normalizedRadius,
        },
    });

    const normalizedPayload = {
        ...payload,
        cadastral_number: normalizedCad,
        radius_used: normalizedRadius,
    };

    if (existing) {
        await existing.update(normalizedPayload);
        return existing.reload();
    }

    return EnvironmentAnalysis.create(normalizedPayload);
}
