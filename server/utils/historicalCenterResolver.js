import * as turf from '@turf/turf';
import SpatialZone from '../models/SpatialZone.js';

let zonesCache = null;
let zonesCacheLoadedAt = 0;
const CACHE_TTL_MS = 60 * 1000;

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
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

async function loadHistoricalCenterFeatures(forceReload = false) {
    const now = Date.now();

    if (!forceReload && zonesCache && now - zonesCacheLoadedAt < CACHE_TTL_MS) {
        return zonesCache;
    }

    const rows = await SpatialZone.findAll({
        where: {
            zone_type: 'historical_center',
            is_active: true,
        },
        order: [['id', 'ASC']],
    });

    const features = [];

    for (const row of rows) {
        const fc = row.geojson;

        if (fc?.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
            continue;
        }

        for (const feature of fc.features) {
            if (!isPolygonGeometry(feature)) continue;

            features.push({
                zoneId: row.id,
                zoneName: row.name,
                feature,
                bbox: turf.bbox(feature),
            });
        }
    }

    zonesCache = features;
    zonesCacheLoadedAt = now;

    return features;
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

function toRoundedMeters(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : null;
}

function normalizeDistanceToFeatureMeters(point, feature) {
    try {
        const polygonLine = turf.polygonToLine(feature);
        const lineFeatures = polygonLine?.type === 'FeatureCollection'
            ? polygonLine.features
            : [polygonLine];

        let bestDistance = Number.POSITIVE_INFINITY;

        for (const lineFeature of lineFeatures) {
            const distanceKm = turf.pointToLineDistance(point, lineFeature, {
                units: 'kilometers',
            });

            if (Number.isFinite(distanceKm)) {
                bestDistance = Math.min(bestDistance, distanceKm * 1000);
            }
        }

        return Number.isFinite(bestDistance) ? toRoundedMeters(bestDistance) : null;
    } catch {
        return null;
    }
}

export async function resolveHistoricalCenterStatusForCoords(lat, lon, { nearBufferMeters = 350 } = {}) {
    const normalizedLat = toNumber(lat);
    const normalizedLon = toNumber(lon);

    if (!isValidLatLon(normalizedLat, normalizedLon)) {
        return {
            status: 'unknown',
            distanceMeters: null,
            source: 'invalid_coordinates',
            zoneName: null,
        };
    }

    const features = await loadHistoricalCenterFeatures(false);

    if (!features.length) {
        return {
            status: 'unknown',
            distanceMeters: null,
            source: 'spatial_zones_empty',
            zoneName: null,
        };
    }

    const point = turf.point([normalizedLon, normalizedLat]);
    let nearestDistance = Number.POSITIVE_INFINITY;
    let nearestZoneName = null;

    for (const item of features) {
        if (!pointInsideBbox(normalizedLat, normalizedLon, item.bbox)) {
            const distanceMeters = normalizeDistanceToFeatureMeters(point, item.feature);

            if (distanceMeters !== null && distanceMeters < nearestDistance) {
                nearestDistance = distanceMeters;
                nearestZoneName = item.zoneName;
            }

            continue;
        }

        if (turf.booleanPointInPolygon(point, item.feature)) {
            return {
                status: 'inside',
                distanceMeters: 0,
                source: 'spatial_zones',
                zoneName: item.zoneName,
            };
        }

        const distanceMeters = normalizeDistanceToFeatureMeters(point, item.feature);

        if (distanceMeters !== null && distanceMeters < nearestDistance) {
            nearestDistance = distanceMeters;
            nearestZoneName = item.zoneName;
        }
    }

    const roundedDistance = Number.isFinite(nearestDistance)
        ? toRoundedMeters(nearestDistance)
        : null;

    return {
        status: roundedDistance !== null && roundedDistance <= Number(nearBufferMeters)
            ? 'near'
            : 'outside',
        distanceMeters: roundedDistance,
        source: 'spatial_zones',
        zoneName: nearestZoneName,
    };
}

export async function resolveHistoricalCenterForCoords(lat, lon) {
    const resolved = await resolveHistoricalCenterStatusForCoords(lat, lon);
    return resolved.status === 'inside';
}

export async function reloadHistoricalCenterZonesCache() {
    await loadHistoricalCenterFeatures(true);
}
