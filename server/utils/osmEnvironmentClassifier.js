import axios from 'axios';

const OSM_RADIUS_METERS = 600;
const OVERPASS_DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter';

const BUSINESS_AMENITIES = new Set([
    'bank',
    'university',
    'college',
    'school',
    'kindergarten',
    'hospital',
    'clinic',
    'doctors',
    'dentist',
    'pharmacy',
    'restaurant',
    'cafe',
    'fast_food',
    'food_court',
    'public_building',
    'community_centre',
    'conference_centre',
    'theatre',
    'cinema',
    'courthouse',
    'townhall',
    'post_office',
    'hotel',
]);

const BUSINESS_BUILDINGS = new Set([
    'office',
    'commercial',
    'retail',
    'hotel',
    'civic',
    'public',
    'school',
    'university',
    'college',
    'hospital',
    'kindergarten',
]);

const INDUSTRIAL_BUILDINGS = new Set([
    'industrial',
    'warehouse',
    'service',
    'transportation',
    'hangar',
    'depot',
]);

const RESIDENTIAL_MULTI = new Set([
    'apartments',
    'residential',
    'dormitory',
]);

const RESIDENTIAL_LOW_MID = new Set([
    'house',
    'detached',
    'semidetached_house',
    'terrace',
]);

function safeTags(element) {
    return element?.tags || {};
}

function getLevels(tags) {
    const raw = tags['building:levels'] || tags.levels || tags['addr:levels'];
    const n = Number(String(raw || '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

function addScore(scores, key, weight = 1) {
    scores[key] = (scores[key] || 0) + weight;
}

function classifyElement(element, scores, details) {
    const tags = safeTags(element);

    const building = tags.building;
    const amenity = tags.amenity;
    const office = tags.office;
    const shop = tags.shop;
    const landuse = tags.landuse;
    const railway = tags.railway;
    const industrial = tags.industrial;

    if (landuse === 'industrial' || industrial || INDUSTRIAL_BUILDINGS.has(building)) {
        addScore(scores, 'industrial_zone', 3);
        details.industrial_zone.push(tags);
    }

    if (amenity === 'fuel' || shop === 'car_repair' || amenity === 'bus_station' || railway === 'station') {
        addScore(scores, 'industrial_zone', 2);
        details.industrial_zone.push(tags);
    }

    if (office || shop || BUSINESS_AMENITIES.has(amenity) || BUSINESS_BUILDINGS.has(building)) {
        addScore(scores, 'business_activity_center', 2);
        details.business_activity_center.push(tags);
    }

    if (RESIDENTIAL_MULTI.has(building)) {
        const levels = getLevels(tags);

        if (levels !== null && levels <= 5) {
            addScore(scores, 'midrise_residential', 2);
            details.midrise_residential.push(tags);
        } else {
            addScore(scores, 'multi_apartment_residential', 2);
            details.multi_apartment_residential.push(tags);
        }
    }

    if (RESIDENTIAL_LOW_MID.has(building)) {
        addScore(scores, 'midrise_residential', 2);
        details.midrise_residential.push(tags);
    }
}

function pickTopCategories(scores) {
    const entries = Object.entries(scores)
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
        return [];
    }

    const topScore = entries[0][1];
    const selected = entries.filter(([, value]) => value >= topScore * 0.6).slice(0, 3);

    return selected.map(([key]) => key);
}

export function buildOverpassEnvironmentQuery(lat, lon, radiusMeters = OSM_RADIUS_METERS) {
    const radius = Number.isFinite(Number(radiusMeters)) && Number(radiusMeters) > 0
        ? Math.round(Number(radiusMeters))
        : OSM_RADIUS_METERS;

    return `
    [out:json][timeout:25];
    (
      node(around:${radius},${lat},${lon})[building];
      way(around:${radius},${lat},${lon})[building];
      relation(around:${radius},${lat},${lon})[building];

      node(around:${radius},${lat},${lon})[amenity];
      way(around:${radius},${lat},${lon})[amenity];
      relation(around:${radius},${lat},${lon})[amenity];

      node(around:${radius},${lat},${lon})[office];
      way(around:${radius},${lat},${lon})[office];
      relation(around:${radius},${lat},${lon})[office];

      node(around:${radius},${lat},${lon})[shop];
      way(around:${radius},${lat},${lon})[shop];
      relation(around:${radius},${lat},${lon})[shop];

      node(around:${radius},${lat},${lon})[landuse];
      way(around:${radius},${lat},${lon})[landuse];
      relation(around:${radius},${lat},${lon})[landuse];

      node(around:${radius},${lat},${lon})[industrial];
      way(around:${radius},${lat},${lon})[industrial];
      relation(around:${radius},${lat},${lon})[industrial];

      node(around:${radius},${lat},${lon})[railway];
      way(around:${radius},${lat},${lon})[railway];
      relation(around:${radius},${lat},${lon})[railway];

      node(around:${radius},${lat},${lon})[public_transport];
      way(around:${radius},${lat},${lon})[public_transport];
      relation(around:${radius},${lat},${lon})[public_transport];

      node(around:${radius},${lat},${lon})[highway];
      way(around:${radius},${lat},${lon})[highway];
      relation(around:${radius},${lat},${lon})[highway];

      node(around:${radius},${lat},${lon})[tourism];
      way(around:${radius},${lat},${lon})[tourism];
      relation(around:${radius},${lat},${lon})[tourism];

      node(around:${radius},${lat},${lon})[leisure];
      way(around:${radius},${lat},${lon})[leisure];
      relation(around:${radius},${lat},${lon})[leisure];
    );
    out tags center;
  `;
}

export async function fetchOsmEnvironment(lat, lon, options = {}) {
    const {
        radiusMeters = OSM_RADIUS_METERS,
        timeoutMs = 30000,
        endpoint = OVERPASS_DEFAULT_ENDPOINT,
    } = options;

    const query = buildOverpassEnvironmentQuery(lat, lon, radiusMeters);

    const { data } = await axios.post(
        endpoint,
        query,
        {
            timeout: timeoutMs,
            headers: {
                'Content-Type': 'text/plain',
            },
        }
    );

    return Array.isArray(data?.elements) ? data.elements : [];
}

export function classifyEnvironment(elements, { historicalCenter = false } = {}) {
    const scores = {
        business_activity_center: 0,
        multi_apartment_residential: 0,
        midrise_residential: 0,
        industrial_zone: 0,
    };

    const details = {
        business_activity_center: [],
        multi_apartment_residential: [],
        midrise_residential: [],
        industrial_zone: [],
    };

    for (const element of elements) {
        classifyElement(element, scores, details);
    }

    const topCategories = pickTopCategories(scores);

    if (historicalCenter) {
        topCategories.unshift('historical_center');
    }

    return {
        historicalCenter: Boolean(historicalCenter),
        scores,
        topCategories: topCategories.slice(0, 3),
        elementsCount: elements.length,
        detailsCount: {
            business_activity_center: details.business_activity_center.length,
            multi_apartment_residential: details.multi_apartment_residential.length,
            midrise_residential: details.midrise_residential.length,
            industrial_zone: details.industrial_zone.length,
        },
    };
}
