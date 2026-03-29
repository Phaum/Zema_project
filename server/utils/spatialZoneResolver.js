import * as turf from '@turf/turf';
import SpatialZone from '../models/SpatialZone.js';

let zonesCache = null;
let zonesCacheLoadedAt = 0;
const CACHE_TTL_MS = 60 * 1000;

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function normalizeText(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ');
}

function isValidLatLon(lat, lon) {
    return (
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        lat >= -90 &&
        lat <= 90 &&
        lon >= -180 &&
        lon <= 180
    );
}

function isPolygonGeometry(feature) {
    const type = feature?.geometry?.type;
    return type === 'Polygon' || type === 'MultiPolygon';
}

function pointInsideBbox(lat, lon, bbox) {
    if (!Array.isArray(bbox) || bbox.length !== 4) return false;

    const [minLon, minLat, maxLon, maxLat] = bbox;

    return (
        lon >= minLon &&
        lon <= maxLon &&
        lat >= minLat &&
        lat <= maxLat
    );
}

function normalizeZoneTypeFilter(zoneType) {
    if (Array.isArray(zoneType)) {
        return zoneType
            .map((value) => normalizeText(value))
            .filter(Boolean);
    }

    const normalized = normalizeText(zoneType);
    return normalized ? [normalized] : [];
}

async function loadSpatialZoneFeatures(forceReload = false) {
    const now = Date.now();

    if (!forceReload && zonesCache && now - zonesCacheLoadedAt < CACHE_TTL_MS) {
        return zonesCache;
    }

    const rows = await SpatialZone.findAll({
        where: {
            is_active: true,
        },
        order: [
            ['priority', 'DESC'],
            ['id', 'ASC'],
        ],
    });

    const features = [];

    for (const row of rows) {
        const fc = row.geojson;

        if (fc?.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
            continue;
        }

        for (const feature of fc.features) {
            if (!isPolygonGeometry(feature)) continue;

            let area = null;
            try {
                area = turf.area(feature);
            } catch {
                area = null;
            }

            features.push({
                zoneId: row.id,
                zoneName: normalizeText(row.name) || null,
                zoneCode: normalizeText(row.code) || null,
                zoneType: normalizeText(row.zone_type) || null,
                priority: toNumber(row.priority) ?? 0,
                feature,
                bbox: turf.bbox(feature),
                area,
            });
        }
    }

    zonesCache = features;
    zonesCacheLoadedAt = now;

    return features;
}

function chooseBestMatchingZone(matches = []) {
    if (!matches.length) return null;

    return [...matches].sort((left, right) => {
        if (left.priority !== right.priority) {
            return right.priority - left.priority;
        }

        const leftArea = Number.isFinite(left.area) ? left.area : Number.POSITIVE_INFINITY;
        const rightArea = Number.isFinite(right.area) ? right.area : Number.POSITIVE_INFINITY;

        if (leftArea !== rightArea) {
            return leftArea - rightArea;
        }

        return left.zoneId - right.zoneId;
    })[0];
}

export async function resolveSpatialZoneForCoords(lat, lon, { zoneType, forceReload = false } = {}) {
    const normalizedLat = toNumber(lat);
    const normalizedLon = toNumber(lon);

    if (!isValidLatLon(normalizedLat, normalizedLon)) {
        return {
            matched: false,
            source: 'invalid_coordinates',
            zoneId: null,
            zoneType: null,
            zoneName: null,
            zoneCode: null,
            priority: null,
        };
    }

    const zoneTypes = normalizeZoneTypeFilter(zoneType);
    const features = await loadSpatialZoneFeatures(forceReload);
    const filtered = zoneTypes.length
        ? features.filter((item) => zoneTypes.includes(item.zoneType))
        : features;

    if (!filtered.length) {
        return {
            matched: false,
            source: 'spatial_zones_empty',
            zoneId: null,
            zoneType: zoneTypes[0] || null,
            zoneName: null,
            zoneCode: null,
            priority: null,
        };
    }

    const point = turf.point([normalizedLon, normalizedLat]);
    const matches = [];

    for (const item of filtered) {
        if (!pointInsideBbox(normalizedLat, normalizedLon, item.bbox)) {
            continue;
        }

        if (turf.booleanPointInPolygon(point, item.feature)) {
            matches.push(item);
        }
    }

    const winner = chooseBestMatchingZone(matches);

    if (!winner) {
        return {
            matched: false,
            source: 'spatial_zones',
            zoneId: null,
            zoneType: zoneTypes[0] || null,
            zoneName: null,
            zoneCode: null,
            priority: null,
        };
    }

    return {
        matched: true,
        source: 'spatial_zones',
        zoneId: winner.zoneId,
        zoneType: winner.zoneType,
        zoneName: winner.zoneName,
        zoneCode: winner.zoneCode || winner.zoneName,
        priority: winner.priority,
    };
}

export async function reloadSpatialZonesCache() {
    await loadSpatialZoneFeatures(true);
}
