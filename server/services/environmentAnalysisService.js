import * as turf from '@turf/turf';
import CadastralData from '../models/cadastral_data.js';
import ProjectQuestionnaire from '../models/ProjectQuestionnaire.js';
import { getOrFetchCadastralRecord } from '../controllers/cadastralController.js';
import { geocodeByAddress } from '../controllers/geoController.js';
import { findNearestMetroByCoords } from './metroFallbackService.js';
import { fetchOsmEnvironment } from '../utils/osmEnvironmentClassifier.js';
import { resolveHistoricalCenterStatusForCoords } from '../utils/historicalCenterResolver.js';
import {
    findEnvironmentAnalysisByCadastralNumber,
    normalizeEnvironmentAnalysis,
    upsertEnvironmentAnalysis,
} from '../repositories/environmentAnalysisRepository.js';
import { isPlausibleMetroDistanceMeters } from '../utils/locationNormalization.js';

const DEFAULT_RADIUS_METERS = 600;
const MIN_RADIUS_METERS = 300;
const MAX_RADIUS_METERS = 1200;
const STANDARD_RADII = [300, 600, 1000];
const OVERPASS_TIMEOUT_MS = 20000;
const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
];

const BUSINESS_AMENITIES = new Set([
    'bank',
    'conference_centre',
    'courthouse',
    'community_centre',
    'hotel',
    'post_office',
    'public_building',
    'townhall',
]);

const SERVICE_AMENITIES = new Set([
    'bar',
    'bureau_de_change',
    'cafe',
    'car_rental',
    'clinic',
    'dentist',
    'doctors',
    'fast_food',
    'food_court',
    'hospital',
    'marketplace',
    'pharmacy',
    'restaurant',
]);

const FITNESS_AMENITIES = new Set([
    'fitness_centre',
    'gym',
]);

const BUSINESS_BUILDINGS = new Set([
    'civic',
    'commercial',
    'hotel',
    'office',
    'public',
    'retail',
]);

const RESIDENTIAL_BUILDINGS = new Set([
    'apartments',
    'detached',
    'dormitory',
    'house',
    'residential',
    'semidetached_house',
    'terrace',
]);

const INDUSTRIAL_BUILDINGS = new Set([
    'depot',
    'hangar',
    'industrial',
    'service',
    'transportation',
    'warehouse',
]);

const WAREHOUSE_BUILDINGS = new Set([
    'warehouse',
    'hangar',
    'depot',
]);

const MAJOR_HIGHWAYS = new Set([
    'motorway',
    'motorway_link',
    'primary',
    'primary_link',
    'trunk',
    'trunk_link',
]);

const LEISURE_TAGS = new Set([
    'fitness_centre',
    'park',
    'sports_centre',
    'stadium',
]);

function normalizeCadastralNumber(value) {
    return String(value || '').trim();
}

function normalizeText(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ');
}

function toNumberOrNull(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return null;
    }

    const factor = 10 ** digits;
    return Math.round(numeric * factor) / factor;
}

function hasMeaningfulValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return true;
    return String(value).trim() !== '';
}

function hasValidCoordinates(lat, lon) {
    return (
        Number.isFinite(Number(lat)) &&
        Number.isFinite(Number(lon)) &&
        Number(lat) >= -90 &&
        Number(lat) <= 90 &&
        Number(lon) >= -180 &&
        Number(lon) <= 180
    );
}

function minDefined(...values) {
    return values
        .map(toNumberOrNull)
        .filter((value) => value !== null)
        .sort((left, right) => left - right)[0] ?? null;
}

function normalizeRadius(radiusMeters) {
    const numeric = Number(radiusMeters);

    if (!Number.isFinite(numeric) || numeric <= 0) {
        return DEFAULT_RADIUS_METERS;
    }

    return clamp(Math.round(numeric), MIN_RADIUS_METERS, MAX_RADIUS_METERS);
}

function pickBestAddress(...values) {
    return values
        .map((value) => normalizeText(value))
        .filter(Boolean)
        .sort((left, right) => right.length - left.length)[0] || null;
}

function createPoint(lat, lon) {
    return turf.point([Number(lon), Number(lat)]);
}

function getElementCoordinates(element) {
    const lat = toNumberOrNull(element?.lat ?? element?.center?.lat);
    const lon = toNumberOrNull(element?.lon ?? element?.center?.lon);

    if (!hasValidCoordinates(lat, lon)) {
        return null;
    }

    return { lat, lon };
}

function getKindLabel(tags = {}) {
    return normalizeText(
        tags.amenity ||
        tags.shop ||
        tags.office ||
        tags.building ||
        tags.landuse ||
        tags.railway ||
        tags.highway ||
        tags.public_transport ||
        tags.tourism ||
        tags.leisure
    );
}

function buildExamplePayload(item) {
    return {
        name: normalizeText(item.name) || 'Без названия',
        kind: item.kind || 'unknown',
        distanceMeters: round(item.distanceMeters, 0),
    };
}

function isBusinessElement(tags = {}) {
    return Boolean(
        tags.office ||
        BUSINESS_AMENITIES.has(tags.amenity) ||
        BUSINESS_BUILDINGS.has(tags.building) ||
        tags.tourism === 'hotel'
    );
}

function isServiceElement(tags = {}) {
    return Boolean(
        tags.shop ||
        SERVICE_AMENITIES.has(tags.amenity) ||
        FITNESS_AMENITIES.has(tags.amenity) ||
        LEISURE_TAGS.has(tags.leisure)
    );
}

function isResidentialElement(tags = {}) {
    return Boolean(
        RESIDENTIAL_BUILDINGS.has(tags.building) ||
        tags.landuse === 'residential'
    );
}

function isIndustrialElement(tags = {}) {
    return Boolean(
        tags.landuse === 'industrial' ||
        tags.industrial ||
        INDUSTRIAL_BUILDINGS.has(tags.building)
    );
}

function isWarehouseElement(tags = {}) {
    return Boolean(
        WAREHOUSE_BUILDINGS.has(tags.building) ||
        tags.man_made === 'warehouse'
    );
}

function isRailObject(tags = {}) {
    return Boolean(tags.railway);
}

function isPublicTransportPoint(tags = {}) {
    return Boolean(
        tags.public_transport ||
        tags.highway === 'bus_stop' ||
        tags.amenity === 'bus_station' ||
        tags.railway === 'station' ||
        tags.railway === 'halt' ||
        tags.railway === 'tram_stop' ||
        tags.railway === 'subway_entrance'
    );
}

function isMajorRoad(tags = {}) {
    return MAJOR_HIGHWAYS.has(tags.highway);
}

function evaluateElementFlags(tags = {}) {
    const office = Boolean(tags.office) || tags.building === 'office';
    const coworking = tags.office === 'coworking';
    const bank = tags.amenity === 'bank';
    const hotel = tags.tourism === 'hotel' || tags.amenity === 'hotel' || tags.building === 'hotel';
    const cafeRestaurant = ['bar', 'cafe', 'fast_food', 'food_court', 'restaurant'].includes(tags.amenity);
    const shop = Boolean(tags.shop);
    const pharmacy = tags.amenity === 'pharmacy';
    const fitness = FITNESS_AMENITIES.has(tags.amenity) || LEISURE_TAGS.has(tags.leisure);
    const servicePoint = isServiceElement(tags);
    const businessBuilding = isBusinessElement(tags);
    const residential = isResidentialElement(tags);
    const industrial = isIndustrialElement(tags);
    const warehouse = isWarehouseElement(tags);
    const rail = isRailObject(tags);
    const publicTransport = isPublicTransportPoint(tags);
    const majorRoad = isMajorRoad(tags);
    const mixedUse = Boolean(
        businessBuilding ||
        servicePoint ||
        tags.landuse === 'commercial' ||
        tags.landuse === 'retail'
    );
    const leisureTourism = Boolean(tags.leisure || tags.tourism);

    return {
        office,
        coworking,
        bank,
        hotel,
        cafeRestaurant,
        shop,
        pharmacy,
        fitness,
        servicePoint,
        businessBuilding,
        residential,
        industrial,
        warehouse,
        rail,
        publicTransport,
        majorRoad,
        mixedUse,
        leisureTourism,
    };
}

function annotateElements(elements = [], objectLat, objectLon) {
    const originPoint = createPoint(objectLat, objectLon);

    return elements
        .map((element) => {
            const coords = getElementCoordinates(element);

            if (!coords) {
                return null;
            }

            const distanceKm = turf.distance(
                originPoint,
                createPoint(coords.lat, coords.lon),
                { units: 'kilometers' }
            );

            if (!Number.isFinite(distanceKm)) {
                return null;
            }

            const tags = element?.tags || {};

            return {
                id: `${element.type || 'unknown'}:${element.id || Math.random()}`,
                name: normalizeText(tags.name),
                kind: getKindLabel(tags),
                distanceMeters: distanceKm * 1000,
                tags,
                flags: evaluateElementFlags(tags),
            };
        })
        .filter(Boolean)
        .sort((left, right) => left.distanceMeters - right.distanceMeters);
}

function interpretMetric({ count = 0, nearestDistance = null }) {
    if (!count) {
        return 'В выбранном радиусе выраженных объектов не найдено';
    }

    if ((nearestDistance !== null && nearestDistance <= 200) || count >= 10) {
        return 'Высокая концентрация и хорошая доступность';
    }

    if ((nearestDistance !== null && nearestDistance <= 400) || count >= 4) {
        return 'Умеренная насыщенность окружения';
    }

    return 'Окружение присутствует, но выражено ограниченно';
}

function createCounterBucket(radiusMeters) {
    return {
        radiusMeters,
        counts: {
            transportPoints: 0,
            publicTransportStops: 0,
            railObjects: 0,
            offices: 0,
            coworking: 0,
            banks: 0,
            hotels: 0,
            businessBuildings: 0,
            cafesRestaurants: 0,
            shops: 0,
            pharmacies: 0,
            fitness: 0,
            servicePoints: 0,
            residentialBuildings: 0,
            industrialSites: 0,
            warehouseSites: 0,
            mixedUseSignals: 0,
            leisureTourism: 0,
            majorRoads: 0,
        },
        nearest: {
            transport: null,
            business: null,
            service: null,
            residential: null,
            industrial: null,
            negative: null,
        },
    };
}

function updateNearest(bucket, key, distanceMeters) {
    const numeric = toNumberOrNull(distanceMeters);

    if (numeric === null) {
        return;
    }

    bucket.nearest[key] = bucket.nearest[key] === null
        ? numeric
        : Math.min(bucket.nearest[key], numeric);
}

function buildMetricSummary({ count = 0, radiusMeters, nearestDistance = null, extra = {} }) {
    const areaSqKm = Math.PI * ((radiusMeters / 1000) ** 2);
    const density = areaSqKm > 0 ? round(count / areaSqKm, 2) : null;

    return {
        count,
        densityPerSqKm: density,
        nearestDistanceMeters: nearestDistance === null ? null : round(nearestDistance, 0),
        interpretation: interpretMetric({ count, nearestDistance }),
        ...extra,
    };
}

function summarizeAnnotatedElements(annotatedElements = [], radiusMeters, { metroInfo, historicalCenterStatus } = {}) {
    const bucket = createCounterBucket(radiusMeters);
    const insideRadius = annotatedElements.filter((item) => item.distanceMeters <= radiusMeters);

    for (const item of insideRadius) {
        const { flags, distanceMeters } = item;

        if (flags.publicTransport) {
            bucket.counts.transportPoints += 1;
            bucket.counts.publicTransportStops += 1;
            updateNearest(bucket, 'transport', distanceMeters);
        }

        if (flags.rail) {
            bucket.counts.transportPoints += 1;
            bucket.counts.railObjects += 1;
            updateNearest(bucket, 'transport', distanceMeters);
            updateNearest(bucket, 'negative', distanceMeters);
        }

        if (flags.office) {
            bucket.counts.offices += 1;
            bucket.counts.businessBuildings += 1;
            updateNearest(bucket, 'business', distanceMeters);
        }

        if (flags.coworking) {
            bucket.counts.coworking += 1;
            updateNearest(bucket, 'business', distanceMeters);
        }

        if (flags.bank) {
            bucket.counts.banks += 1;
            updateNearest(bucket, 'business', distanceMeters);
        }

        if (flags.hotel) {
            bucket.counts.hotels += 1;
            updateNearest(bucket, 'business', distanceMeters);
        }

        if (flags.businessBuilding && !flags.office) {
            bucket.counts.businessBuildings += 1;
            updateNearest(bucket, 'business', distanceMeters);
        }

        if (flags.cafeRestaurant) {
            bucket.counts.cafesRestaurants += 1;
            updateNearest(bucket, 'service', distanceMeters);
        }

        if (flags.shop) {
            bucket.counts.shops += 1;
            updateNearest(bucket, 'service', distanceMeters);
        }

        if (flags.pharmacy) {
            bucket.counts.pharmacies += 1;
            updateNearest(bucket, 'service', distanceMeters);
        }

        if (flags.fitness) {
            bucket.counts.fitness += 1;
            updateNearest(bucket, 'service', distanceMeters);
        }

        if (flags.servicePoint) {
            bucket.counts.servicePoints += 1;
            updateNearest(bucket, 'service', distanceMeters);
        }

        if (flags.residential) {
            bucket.counts.residentialBuildings += 1;
            updateNearest(bucket, 'residential', distanceMeters);
        }

        if (flags.industrial) {
            bucket.counts.industrialSites += 1;
            updateNearest(bucket, 'industrial', distanceMeters);
            updateNearest(bucket, 'negative', distanceMeters);
        }

        if (flags.warehouse) {
            bucket.counts.warehouseSites += 1;
            updateNearest(bucket, 'industrial', distanceMeters);
            updateNearest(bucket, 'negative', distanceMeters);
        }

        if (flags.mixedUse) {
            bucket.counts.mixedUseSignals += 1;
        }

        if (flags.leisureTourism) {
            bucket.counts.leisureTourism += 1;
        }

        if (flags.majorRoad) {
            bucket.counts.majorRoads += 1;
            updateNearest(bucket, 'negative', distanceMeters);
        }
    }

    const businessCount =
        bucket.counts.offices +
        bucket.counts.coworking +
        bucket.counts.banks +
        bucket.counts.hotels +
        bucket.counts.businessBuildings;

    const serviceCount =
        bucket.counts.cafesRestaurants +
        bucket.counts.shops +
        bucket.counts.pharmacies +
        bucket.counts.fitness +
        bucket.counts.servicePoints;

    const negativeCount =
        bucket.counts.industrialSites +
        bucket.counts.warehouseSites +
        bucket.counts.railObjects +
        bucket.counts.majorRoads;

    const transportNearest = minDefined(bucket.nearest.transport, metroInfo?.distanceMeters);

    return {
        radiusMeters,
        counts: {
            ...bucket.counts,
            businessCount,
            serviceCount,
            negativeCount,
        },
        metrics: {
            transport: buildMetricSummary({
                count: bucket.counts.transportPoints + (metroInfo?.distanceMeters !== null ? 1 : 0),
                radiusMeters,
                nearestDistance: transportNearest,
                extra: {
                    nearestMetro: metroInfo?.name || null,
                    nearestMetroDistanceMeters: metroInfo?.distanceMeters ?? null,
                },
            }),
            business: buildMetricSummary({
                count: businessCount,
                radiusMeters,
                nearestDistance: bucket.nearest.business,
            }),
            service: buildMetricSummary({
                count: serviceCount,
                radiusMeters,
                nearestDistance: bucket.nearest.service,
            }),
            residential: buildMetricSummary({
                count: bucket.counts.residentialBuildings,
                radiusMeters,
                nearestDistance: bucket.nearest.residential,
            }),
            industrial: buildMetricSummary({
                count: bucket.counts.industrialSites + bucket.counts.warehouseSites,
                radiusMeters,
                nearestDistance: bucket.nearest.industrial,
            }),
            negative: buildMetricSummary({
                count: negativeCount,
                radiusMeters,
                nearestDistance: bucket.nearest.negative,
            }),
        },
        historicalCenterStatus,
    };
}

function calculateEnvironmentScore(summary, { historicalCenterStatus } = {}) {
    const counts = summary.counts || {};
    const metrics = summary.metrics || {};
    const metroDistance = toNumberOrNull(metrics.transport?.nearestMetroDistanceMeters);

    let transportScore = 0;
    if (metroDistance !== null) {
        if (metroDistance <= 400) transportScore += 12;
        else if (metroDistance <= 700) transportScore += 10;
        else if (metroDistance <= 1000) transportScore += 8;
        else if (metroDistance <= 1500) transportScore += 5;
        else transportScore += 2;
    }
    transportScore += Math.min(counts.publicTransportStops || 0, 6) * 1.5;
    transportScore += Math.min(counts.transportPoints || 0, 5) * 0.6;
    transportScore = clamp(round(transportScore) || 0, 0, 25);

    let businessScore =
        (counts.offices || 0) * 2.2 +
        (counts.coworking || 0) * 3 +
        (counts.banks || 0) * 1.8 +
        (counts.hotels || 0) * 1.6 +
        (counts.businessBuildings || 0) * 1.1;
    if ((metrics.business?.nearestDistanceMeters ?? null) !== null) {
        if (metrics.business.nearestDistanceMeters <= 200) businessScore += 2;
        else if (metrics.business.nearestDistanceMeters <= 400) businessScore += 1;
    }
    businessScore = clamp(round(businessScore) || 0, 0, 20);

    let serviceScore =
        (counts.cafesRestaurants || 0) * 1.2 +
        (counts.shops || 0) * 0.8 +
        (counts.pharmacies || 0) * 1.5 +
        (counts.fitness || 0) * 1.5 +
        (counts.servicePoints || 0) * 0.5;
    if ((metrics.service?.nearestDistanceMeters ?? null) !== null) {
        if (metrics.service.nearestDistanceMeters <= 150) serviceScore += 2;
        else if (metrics.service.nearestDistanceMeters <= 300) serviceScore += 1;
    }
    serviceScore = clamp(round(serviceScore) || 0, 0, 20);

    let urbanScore = 0;
    urbanScore += Math.min(counts.mixedUseSignals || 0, 4) * 2;
    urbanScore += Math.min(counts.residentialBuildings || 0, 4) * 1.5;
    urbanScore += Math.min(counts.leisureTourism || 0, 4) * 1.5;
    if ((counts.residentialBuildings || 0) > 0 && ((counts.businessCount || 0) + (counts.serviceCount || 0)) > 0) {
        urbanScore += 4;
    }
    urbanScore = clamp(round(urbanScore) || 0, 0, 20);

    let locationScore = 0;
    if (historicalCenterStatus === 'inside') locationScore += 8;
    else if (historicalCenterStatus === 'near') locationScore += 4;

    if (metroDistance !== null) {
        if (metroDistance <= 800) locationScore += 4;
        else if (metroDistance <= 1200) locationScore += 2;
    }

    if ((counts.businessCount || 0) >= 6 && (counts.serviceCount || 0) >= 8) locationScore += 3;
    else if ((counts.businessCount || 0) >= 3 && (counts.serviceCount || 0) >= 4) locationScore += 1.5;
    locationScore = clamp(round(locationScore) || 0, 0, 15);

    let negativePenalty =
        (counts.industrialSites || 0) * 1.5 +
        (counts.warehouseSites || 0) * 2 +
        (counts.railObjects || 0) * 0.8 +
        (counts.majorRoads || 0) * 1.2;
    if (((counts.businessCount || 0) + (counts.serviceCount || 0)) <= 2) {
        negativePenalty += 3;
    }
    negativePenalty = clamp(round(negativePenalty) || 0, 0, 15);

    const totalScore = clamp(
        round(transportScore + businessScore + serviceScore + urbanScore + locationScore - negativePenalty) || 0,
        0,
        100
    );

    let interpretation = 'weak_environment';
    if (totalScore >= 75) interpretation = 'strong_environment';
    else if (totalScore >= 55) interpretation = 'medium_environment';
    else if (totalScore >= 35) interpretation = 'limited_environment';

    return {
        totalScore,
        interpretation,
        subscores: {
            transport: transportScore,
            business: businessScore,
            service: serviceScore,
            urban: urbanScore,
            location: locationScore,
            negativePenalty,
        },
        rawFactors: {
            metroDistanceMeters: metroDistance,
            publicTransportStops: counts.publicTransportStops || 0,
            businessCount: counts.businessCount || 0,
            serviceCount: counts.serviceCount || 0,
            residentialBuildings: counts.residentialBuildings || 0,
            industrialSites: counts.industrialSites || 0,
            warehouseSites: counts.warehouseSites || 0,
            majorRoads: counts.majorRoads || 0,
        },
        formula: {
            total: 'transport + business + service + urban + location - negativePenalty',
            transportMax: 25,
            businessMax: 20,
            serviceMax: 20,
            urbanMax: 20,
            locationMax: 15,
            negativePenaltyMax: 15,
        },
    };
}

function buildCategoryScores(summary, scoreResult, { historicalCenterStatus } = {}) {
    const counts = summary.counts || {};
    const metroDistance = toNumberOrNull(summary.metrics?.transport?.nearestMetroDistanceMeters);
    const businessIntensity = (counts.businessCount || 0) + (counts.coworking || 0) + (counts.banks || 0);
    const serviceIntensity = counts.serviceCount || 0;
    const residentialIntensity = counts.residentialBuildings || 0;
    const industrialIntensity = (counts.industrialSites || 0) + ((counts.warehouseSites || 0) * 1.5);
    const transportIntensity = (counts.transportPoints || 0) + (metroDistance !== null && metroDistance <= 1000 ? 4 : metroDistance !== null && metroDistance <= 1600 ? 2 : 0);
    const mixedIntensity = (counts.mixedUseSignals || 0) + (counts.leisureTourism || 0);

    const scores = {
        prime_business:
            (historicalCenterStatus === 'inside' ? 18 : 0) +
            (metroDistance !== null && metroDistance <= 800 ? 15 : metroDistance !== null && metroDistance <= 1200 ? 8 : 0) +
            businessIntensity * 2.5 +
            serviceIntensity * 1.4 +
            mixedIntensity -
            industrialIntensity * 3,
        urban_business:
            transportIntensity * 1.5 +
            businessIntensity * 2.2 +
            serviceIntensity * 1.3 +
            (historicalCenterStatus === 'near' ? 4 : 0) -
            industrialIntensity * 2.2,
        mixed_urban:
            businessIntensity * 1.3 +
            serviceIntensity * 1.4 +
            residentialIntensity * 1.4 +
            mixedIntensity * 1.6 -
            industrialIntensity * 1.5,
        residential_mixed:
            residentialIntensity * 2.2 +
            serviceIntensity * 1.2 +
            mixedIntensity * 1.1 +
            (metroDistance !== null && metroDistance <= 1200 ? 2 : 0) -
            industrialIntensity * 1.2,
        industrial_edge:
            industrialIntensity * 2.2 +
            (counts.majorRoads || 0) * 1.2 +
            (counts.railObjects || 0) * 1.2 -
            serviceIntensity * 0.8 -
            residentialIntensity * 0.9,
        warehouse_industrial:
            (counts.warehouseSites || 0) * 3.5 +
            (counts.industrialSites || 0) * 1.8 +
            (counts.majorRoads || 0) * 1.3 +
            (counts.railObjects || 0) * 1.2 -
            serviceIntensity * 0.5 -
            residentialIntensity * 1.3,
        peripheral_low_activity:
            Math.max(0, 18 - (businessIntensity * 1.1 + serviceIntensity * 0.9 + transportIntensity)) +
            (scoreResult.totalScore < 35 ? 12 : 0),
    };

    const entries = Object.entries(scores)
        .map(([key, value]) => ({ key, score: round(value) || 0 }))
        .sort((left, right) => right.score - left.score);

    return {
        primary: entries[0]?.key || 'peripheral_low_activity',
        secondary: entries[1]?.key || null,
        tertiary: entries[2]?.key || null,
        ranked: entries.slice(0, 5),
    };
}

function mapCategoryToLocationType(category) {
    switch (category) {
        case 'prime_business':
            return 'core_business';
        case 'urban_business':
            return 'urban_business';
        case 'mixed_urban':
            return 'mixed_city';
        case 'residential_mixed':
            return 'residential_urban';
        case 'industrial_edge':
            return 'industrial_edge';
        case 'warehouse_industrial':
            return 'warehouse_industrial';
        default:
            return 'peripheral_low_activity';
    }
}

function buildExamplesByCategory(annotatedElements = []) {
    const selectors = {
        transport: (item) => item.flags.publicTransport || item.flags.rail,
        business: (item) => item.flags.businessBuilding || item.flags.office || item.flags.bank || item.flags.hotel,
        service: (item) => item.flags.servicePoint,
        negative: (item) => item.flags.industrial || item.flags.warehouse || item.flags.majorRoad || item.flags.rail,
    };

    return Object.fromEntries(
        Object.entries(selectors).map(([key, matcher]) => [
            key,
            annotatedElements.filter(matcher).slice(0, 5).map(buildExamplePayload),
        ])
    );
}

async function fetchEnvironmentElementsWithFallback(lat, lon, radiusMeters) {
    const errors = [];

    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            const elements = await fetchOsmEnvironment(lat, lon, {
                radiusMeters,
                timeoutMs: OVERPASS_TIMEOUT_MS,
                endpoint,
            });

            return {
                elements,
                endpoint,
                warnings: errors,
                status: Array.isArray(elements) && elements.length ? 'ok' : 'empty',
            };
        } catch (error) {
            errors.push(`${endpoint}: ${error.message}`);
        }
    }

    return {
        elements: [],
        endpoint: null,
        warnings: errors,
        status: 'failed',
    };
}

async function resolveCoordinatesForEnvironment(cadastralNumber) {
    const normalizedCad = normalizeCadastralNumber(cadastralNumber);
    const warnings = [];
    const sourcesTried = [];

    const cadastralRecord = await CadastralData.findOne({
        where: { cadastral_number: normalizedCad },
        raw: true,
    });

    if (hasValidCoordinates(cadastralRecord?.latitude, cadastralRecord?.longitude)) {
        return {
            latitude: Number(cadastralRecord.latitude),
            longitude: Number(cadastralRecord.longitude),
            source: 'cadastral_records',
            address: pickBestAddress(
                cadastralRecord.address_document,
                cadastralRecord.address,
                cadastralRecord.address_display
            ),
            district: normalizeText(cadastralRecord.district) || null,
            metro: normalizeText(cadastralRecord.nearest_metro) || null,
            metroDistance: toNumberOrNull(cadastralRecord.metro_distance),
            warnings,
            sourcesTried: ['cadastral_records'],
            cadastralRecord,
        };
    }

    sourcesTried.push('cadastral_records');

    const latestQuestionnaire = await ProjectQuestionnaire.findOne({
        where: { buildingCadastralNumber: normalizedCad },
        order: [['updated_at', 'DESC']],
        raw: true,
    });

    if (hasValidCoordinates(latestQuestionnaire?.mapPointLat, latestQuestionnaire?.mapPointLng)) {
        return {
            latitude: Number(latestQuestionnaire.mapPointLat),
            longitude: Number(latestQuestionnaire.mapPointLng),
            source: 'project_questionnaires',
            address: pickBestAddress(latestQuestionnaire.objectAddress),
            district: normalizeText(latestQuestionnaire.district) || null,
            metro: normalizeText(latestQuestionnaire.nearestMetro) || null,
            metroDistance: toNumberOrNull(latestQuestionnaire.metroDistance),
            warnings,
            sourcesTried: [...sourcesTried, 'project_questionnaires'],
            cadastralRecord,
        };
    }

    sourcesTried.push('project_questionnaires');

    let enrichedCadastralRecord = cadastralRecord;
    try {
        const loadedRecord = await getOrFetchCadastralRecord(normalizedCad, { forceRefresh: false });
        const plainRecord = loadedRecord?.get ? loadedRecord.get({ plain: true }) : loadedRecord;
        enrichedCadastralRecord = plainRecord;

        if (hasValidCoordinates(plainRecord?.latitude, plainRecord?.longitude)) {
            return {
                latitude: Number(plainRecord.latitude),
                longitude: Number(plainRecord.longitude),
                source: 'cadastral_enrichment',
                address: pickBestAddress(
                    plainRecord.address_document,
                    plainRecord.address,
                    plainRecord.address_display
                ),
                district: normalizeText(plainRecord.district) || null,
                metro: normalizeText(plainRecord.nearest_metro) || null,
                metroDistance: toNumberOrNull(plainRecord.metro_distance),
                warnings,
                sourcesTried: [...sourcesTried, 'cadastral_enrichment'],
                cadastralRecord: plainRecord,
            };
        }
    } catch (error) {
        warnings.push(`Не удалось расширить кадастровые данные: ${error.message}`);
    }

    sourcesTried.push('cadastral_enrichment');

    const addressCandidate = pickBestAddress(
        latestQuestionnaire?.objectAddress,
        enrichedCadastralRecord?.address_document,
        enrichedCadastralRecord?.address,
        enrichedCadastralRecord?.address_display,
        cadastralRecord?.address_document,
        cadastralRecord?.address,
        cadastralRecord?.address_display
    );

    if (addressCandidate) {
        try {
            const geocoded = await geocodeByAddress(addressCandidate);

            if (hasValidCoordinates(geocoded?.lat, geocoded?.lng)) {
                return {
                    latitude: Number(geocoded.lat),
                    longitude: Number(geocoded.lng),
                    source: 'geocode_by_address',
                    address: addressCandidate,
                    district: normalizeText(latestQuestionnaire?.district || enrichedCadastralRecord?.district || cadastralRecord?.district) || null,
                    metro: normalizeText(latestQuestionnaire?.nearestMetro || enrichedCadastralRecord?.nearest_metro || cadastralRecord?.nearest_metro) || null,
                    metroDistance: toNumberOrNull(latestQuestionnaire?.metroDistance || enrichedCadastralRecord?.metro_distance || cadastralRecord?.metro_distance),
                    warnings,
                    sourcesTried: [...sourcesTried, 'geocode_by_address'],
                    cadastralRecord: enrichedCadastralRecord || cadastralRecord,
                };
            }
        } catch (error) {
            warnings.push(`Не удалось геокодировать адрес объекта: ${error.message}`);
        }
    }

    sourcesTried.push('geocode_by_address');

    return {
        latitude: null,
        longitude: null,
        source: null,
        address: addressCandidate,
        district: normalizeText(latestQuestionnaire?.district || enrichedCadastralRecord?.district || cadastralRecord?.district) || null,
        metro: normalizeText(latestQuestionnaire?.nearestMetro || enrichedCadastralRecord?.nearest_metro || cadastralRecord?.nearest_metro) || null,
        metroDistance: toNumberOrNull(latestQuestionnaire?.metroDistance || enrichedCadastralRecord?.metro_distance || cadastralRecord?.metro_distance),
        warnings,
        sourcesTried,
        cadastralRecord: enrichedCadastralRecord || cadastralRecord,
    };
}

async function resolveMetroContext({ latitude, longitude, address, cachedMetro, cachedDistance }) {
    const normalizedCachedDistance = toNumberOrNull(cachedDistance);

    if (hasMeaningfulValue(cachedMetro) && isPlausibleMetroDistanceMeters(normalizedCachedDistance)) {
        return {
            name: normalizeText(cachedMetro),
            distanceMeters: round(normalizedCachedDistance, 0),
            source: 'cached_cadastral_data',
        };
    }

    try {
        const metro = await findNearestMetroByCoords({
            lat: latitude,
            lon: longitude,
            address,
            city: 'Санкт-Петербург',
        });

        return {
            name: normalizeText(metro?.station) || null,
            distanceMeters: round(metro?.distance, 0),
            source: metro?.station ? (metro?.source || 'metro_fallback_service') : 'metro_fallback_service',
        };
    } catch (error) {
        return {
            name: normalizeText(cachedMetro) || null,
            distanceMeters: round(normalizedCachedDistance, 0),
            source: 'unresolved',
            warning: `Не удалось определить ближайшее метро: ${error.message}`,
        };
    }
}

function resolveQualityFlag({ coordinateSource, overpassStatus, historicalCenterStatus }) {
    if (!coordinateSource) {
        return 'degraded';
    }

    if (overpassStatus === 'failed') {
        return coordinateSource === 'geocode_by_address' ? 'degraded' : 'partial';
    }

    if (coordinateSource === 'geocode_by_address' || historicalCenterStatus === 'unknown') {
        return 'partial';
    }

    return 'full';
}

function buildStoredPayload({
    cadastralNumber,
    valuationDate,
    latitude,
    longitude,
    radiusUsed,
    locationType,
    historicalCenter,
    metro,
    score,
    categories,
    details,
    sourceMeta,
    qualityFlag,
}) {
    return {
        cadastral_number: cadastralNumber,
        valuation_date: valuationDate || null,
        latitude,
        longitude,
        radius_used: radiusUsed,
        location_type: locationType,
        historical_center_status: historicalCenter.status,
        historical_center_distance_meters: historicalCenter.distanceMeters,
        historical_center_source: historicalCenter.source,
        nearest_metro: metro.name,
        nearest_metro_distance: metro.distanceMeters,
        transport_score: score.subscores.transport,
        business_score: score.subscores.business,
        service_score: score.subscores.service,
        negative_score: score.subscores.negativePenalty,
        total_environment_score: score.totalScore,
        quality_flag: qualityFlag,
        environment_category_1: categories.primary,
        environment_category_2: categories.secondary,
        environment_category_3: categories.tertiary,
        environment_details_json: details,
        source_meta_json: sourceMeta,
        calculated_at: new Date(),
    };
}

export async function getSavedEnvironmentAnalysis(cadastralNumber, { radiusMeters = null } = {}) {
    const analysis = await findEnvironmentAnalysisByCadastralNumber(cadastralNumber, {
        radiusUsed: radiusMeters,
    });

    const normalized = normalizeEnvironmentAnalysis(analysis);

    if (!normalized) {
        return null;
    }

    if (!isPlausibleMetroDistanceMeters(normalized.nearest_metro_distance)) {
        return null;
    }

    return normalized;
}

export async function analyzeEnvironmentByCadastralNumber(cadastralNumber, {
    valuationDate = null,
    radiusMeters = DEFAULT_RADIUS_METERS,
    forceRecalculation = false,
} = {}) {
    const normalizedCad = normalizeCadastralNumber(cadastralNumber);
    const normalizedRadius = normalizeRadius(radiusMeters);

    if (!normalizedCad) {
        throw new Error('Кадастровый номер не указан');
    }

    if (!forceRecalculation) {
        const cached = await getSavedEnvironmentAnalysis(normalizedCad, {
            radiusMeters: normalizedRadius,
        });

        if (cached) {
            return {
                analysis: cached,
                fromCache: true,
            };
        }
    }

    const coordinateContext = await resolveCoordinatesForEnvironment(normalizedCad);

    if (!hasValidCoordinates(coordinateContext.latitude, coordinateContext.longitude)) {
        throw new Error('Не удалось определить координаты объекта для анализа окружения');
    }

    const historicalCenter = await resolveHistoricalCenterStatusForCoords(
        coordinateContext.latitude,
        coordinateContext.longitude,
        { nearBufferMeters: 400 }
    );

    const metroContext = await resolveMetroContext({
        latitude: coordinateContext.latitude,
        longitude: coordinateContext.longitude,
        address: coordinateContext.address,
        cachedMetro: coordinateContext.metro,
        cachedDistance: coordinateContext.metroDistance,
    });

    const queryRadius = Math.max(normalizedRadius, ...STANDARD_RADII);
    const overpassResult = await fetchEnvironmentElementsWithFallback(
        coordinateContext.latitude,
        coordinateContext.longitude,
        queryRadius
    );

    const annotatedElements = annotateElements(
        overpassResult.elements,
        coordinateContext.latitude,
        coordinateContext.longitude
    );

    const radiiToBuild = [...new Set([...STANDARD_RADII, normalizedRadius])].sort((left, right) => left - right);
    const radiusSummaries = Object.fromEntries(
        radiiToBuild.map((radius) => [
            String(radius),
            summarizeAnnotatedElements(annotatedElements, radius, {
                metroInfo: metroContext,
                historicalCenterStatus: historicalCenter.status,
            }),
        ])
    );

    const primarySummary = radiusSummaries[String(normalizedRadius)];
    const score = calculateEnvironmentScore(primarySummary, {
        historicalCenterStatus: historicalCenter.status,
    });
    const categories = buildCategoryScores(primarySummary, score, {
        historicalCenterStatus: historicalCenter.status,
    });
    const locationType = mapCategoryToLocationType(categories.primary);
    const qualityFlag = resolveQualityFlag({
        coordinateSource: coordinateContext.source,
        overpassStatus: overpassResult.status,
        historicalCenterStatus: historicalCenter.status,
    });

    const warnings = [
        ...coordinateContext.warnings,
        ...(overpassResult.warnings || []),
        ...(metroContext.warning ? [metroContext.warning] : []),
    ];

    const details = {
        metrics: primarySummary.metrics,
        counts: primarySummary.counts,
        radii: radiusSummaries,
        categories: {
            primary: categories.primary,
            secondary: categories.secondary,
            tertiary: categories.tertiary,
            ranked: categories.ranked,
        },
        score,
        examples: buildExamplesByCategory(annotatedElements),
        warnings,
    };

    const sourceMeta = {
        coordinateSource: coordinateContext.source,
        coordinateSourcesTried: coordinateContext.sourcesTried,
        addressUsed: coordinateContext.address,
        district: coordinateContext.district,
        metroSource: metroContext.source,
        overpass: {
            status: overpassResult.status,
            endpoint: overpassResult.endpoint,
            queriedRadiusMeters: queryRadius,
            rawElementsCount: Array.isArray(overpassResult.elements) ? overpassResult.elements.length : 0,
        },
        historicalCenterSource: historicalCenter.source,
        valuationDate: valuationDate || null,
    };

    const saved = await upsertEnvironmentAnalysis(buildStoredPayload({
        cadastralNumber: normalizedCad,
        valuationDate,
        latitude: coordinateContext.latitude,
        longitude: coordinateContext.longitude,
        radiusUsed: normalizedRadius,
        locationType,
        historicalCenter,
        metro: metroContext,
        score,
        categories,
        details,
        sourceMeta,
        qualityFlag,
    }));

    return {
        analysis: normalizeEnvironmentAnalysis(saved),
        fromCache: false,
    };
}

export async function buildEnvironmentValuationContext({
    cadastralNumber,
    valuationDate = null,
    radiusMeters = DEFAULT_RADIUS_METERS,
    forceRecalculation = false,
} = {}) {
    const { analysis, fromCache } = await analyzeEnvironmentByCadastralNumber(cadastralNumber, {
        valuationDate,
        radiusMeters,
        forceRecalculation,
    });

    return {
        fromCache,
        qualityFlag: analysis.quality_flag,
        totalEnvironmentScore: analysis.total_environment_score,
        locationType: analysis.location_type,
        historicalCenterStatus: analysis.historical_center_status,
        nearestMetro: analysis.nearest_metro,
        nearestMetroDistance: analysis.nearest_metro_distance,
        categories: [
            analysis.environment_category_1,
            analysis.environment_category_2,
            analysis.environment_category_3,
        ].filter(Boolean),
        subscores: analysis.environment_details_json?.score?.subscores || null,
        rawFactors: analysis.environment_details_json?.score?.rawFactors || null,
    };
}
