export const MARKET_OFFER_ID_HEADER = 'ID';

export const MARKET_OFFER_SEGMENTS = Object.freeze({
    garages: 'гаражи',
    offices: 'офисы, административные здания',
    trade: 'торговля',
    tourism: 'туризм',
    industrialWarehouse: 'произв.складское',
    publicBuildings: 'общественные здания',
    other: 'прочие',
});

export function extractQuarterNumber(value) {
    if (value === undefined || value === null || value === '') return null;

    const normalized = String(value).trim();
    const quarterMatch = normalized.match(/(?:Q|КВ|КВАРТАЛ)\s*([1-4])|([1-4])\s*(?:Q|КВ|КВАРТАЛ)/i);
    const standaloneQuarter = normalized.match(/\b([1-4])\b/);
    const quarter = quarterMatch?.[1] || quarterMatch?.[2] || standaloneQuarter?.[1];

    return quarter ? Number(quarter) : null;
}

export function extractQuarterNumberFromLegacyId(value) {
    if (!value) return null;

    const match = String(value).trim().match(/^V_(?:puo|mkd)_(\d{4})_(\d{1,2})_/i);
    if (!match) return null;

    const rawPeriod = Number(match[2]);
    if (!Number.isFinite(rawPeriod) || rawPeriod < 1) return null;

    if (rawPeriod <= 4) return rawPeriod;
    if (rawPeriod <= 12) return Math.ceil(rawPeriod / 3);

    return null;
}

export function buildMarketOfferZemaId({ id, externalId, quarter }) {
    const current = String(externalId || '').trim();
    if (current.toLowerCase().startsWith('zema_id_2025_')) {
        return current;
    }

    const quarterNumber =
        extractQuarterNumber(quarter) ||
        extractQuarterNumberFromLegacyId(current) ||
        'x';
    const suffix = id || current.replace(/^V_(?:puo|mkd)_\d{4}_\d{1,2}_/i, '') || 'unknown';

    return `zema_id_2025_${quarterNumber}_${suffix}`;
}

export function extractCianOfferIdFromUrl(value) {
    const match = String(value || '').match(/cian\.ru\/rent\/commercial\/(\d+)/i);
    return match?.[1] || null;
}

export function resolveMarketOfferCianId(payload = {}) {
    const current = String(payload.cian_id || payload.external_id || '').trim();
    const cianId = extractCianOfferIdFromUrl(payload.offer_url);

    if (cianId) {
        return cianId;
    }

    if (/^\d{6,}$/.test(current)) {
        return current;
    }

    return null;
}

export function deriveMarketOfferSegment(value) {
    if (value === undefined || value === null || value === '') return null;

    const normalized = String(value).trim();
    const lower = normalized.toLowerCase();
    const existingSegments = new Set(Object.values(MARKET_OFFER_SEGMENTS).map((item) => item.toLowerCase()));

    if (existingSegments.has(lower)) {
        return normalized;
    }

    if (/^03/.test(normalized)) return MARKET_OFFER_SEGMENTS.garages;
    if (/^06/.test(normalized) || /^6\d*/.test(normalized)) return MARKET_OFFER_SEGMENTS.offices;
    if (/^04/.test(normalized)) return MARKET_OFFER_SEGMENTS.trade;
    if (/^05/.test(normalized)) return MARKET_OFFER_SEGMENTS.tourism;
    if (/^07/.test(normalized)) return MARKET_OFFER_SEGMENTS.industrialWarehouse;
    if (/^08/.test(normalized)) return MARKET_OFFER_SEGMENTS.publicBuildings;
    if (/^(09|1100)/.test(normalized)) return MARKET_OFFER_SEGMENTS.other;

    return MARKET_OFFER_SEGMENTS.other;
}
