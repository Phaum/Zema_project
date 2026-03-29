import axios from 'axios';
import { buildGeocodeQueryVariants } from '../utils/locationNormalization.js';

function normalizeText(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ');
}

function scoreAddressSpecificity(value) {
    const normalized = normalizeText(value).toLowerCase();

    if (!normalized) return 0;

    let score = 0;

    score += Math.min(normalized.length / 20, 5);
    score += normalized.split(',').filter(Boolean).length;

    if (/(улиц|просп|пер|проезд|наб|шоссе|бульвар|дорога|аллея)/iu.test(normalized)) {
        score += 3;
    }

    if (/(дом|д\.|корп|к\.|строен|стр\.|лит|пом|офис|бизнес-центр)/iu.test(normalized)) {
        score += 3;
    }

    if (/\d/.test(normalized)) {
        score += 2;
    }

    if (/россия,\s*санкт-петербург$/u.test(normalized)) {
        score -= 4;
    }

    return score;
}

function tokenizeForMatch(value) {
    return new Set(
        normalizeText(value)
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[^\p{L}\p{N}\s/-]+/gu, ' ')
            .split(' ')
            .filter((token) => token.length > 0)
    );
}

function parseBoundingBoxArea(rawBoundingBox) {
    if (!Array.isArray(rawBoundingBox) || rawBoundingBox.length !== 4) {
        return null;
    }

    const south = Number(rawBoundingBox[0]);
    const north = Number(rawBoundingBox[1]);
    const west = Number(rawBoundingBox[2]);
    const east = Number(rawBoundingBox[3]);

    if (![south, north, west, east].every(Number.isFinite)) {
        return null;
    }

    return Math.abs((north - south) * (east - west));
}

function hasHouseOrBuildingIntent(value) {
    const normalized = normalizeText(value).toLowerCase();
    return /\d/u.test(normalized)
        || /(дом|д\.|корп|к\.|строен|стр\.|лит|улиц|просп|пр-кт|шосс|наб|переул|проезд|бульвар|аллея|дорог)/iu.test(normalized);
}

function hasPolygonGeometry(item) {
    const type = item?.geojson?.type;
    return type === 'Polygon' || type === 'MultiPolygon';
}

function scoreGeocodeCandidate(item, query) {
    const displayName = normalizeText(item?.display_name || '');
    const addressText = normalizeForwardAddress(item);
    const haystackTokens = tokenizeForMatch(`${displayName} ${addressText}`);
    const queryTokens = [...tokenizeForMatch(query)];
    let overlapScore = 0;

    queryTokens.forEach((token) => {
        if (haystackTokens.has(token)) {
            overlapScore += token.length >= 3 ? 4 : 2;
        }
    });

    let score = Math.max(
        scoreAddressSpecificity(displayName),
        scoreAddressSpecificity(addressText)
    );

    score += overlapScore;

    const lowerQuery = query.toLowerCase();
    const lowerDisplay = `${displayName} ${addressText}`.toLowerCase();
    const houseNumberMatch = lowerQuery.match(/\b(\d+)\b/u);
    const addresstype = String(item?.addresstype || '').toLowerCase();
    const type = String(item?.type || '').toLowerCase();
    const osmClass = String(item?.class || '').toLowerCase();
    const bboxArea = parseBoundingBoxArea(item?.boundingbox);
    const hasBuildingIntent = hasHouseOrBuildingIntent(query);

    const corpusPattern = /(^|[\s,])к\s*[\p{L}\p{N}-]+/iu;
    const structurePattern = /(^|[\s,])с\s*[\p{L}\p{N}-]+/iu;
    const literaPattern = /(^|[\s,])лит\s*[\p{L}\p{N}-]+/iu;

    if (houseNumberMatch) {
        score += new RegExp(`\\b${houseNumberMatch[1]}\\b`, 'u').test(lowerDisplay) ? 12 : -8;
    }

    if (corpusPattern.test(query)) {
        score += corpusPattern.test(lowerDisplay) ? 12 : -12;
    }

    if (structurePattern.test(query) || literaPattern.test(query)) {
        score += structurePattern.test(lowerDisplay) || literaPattern.test(lowerDisplay) ? 6 : -4;
    }

    if (hasPolygonGeometry(item)) {
        score += 14;
    } else {
        score -= 10;
    }

    if (['building', 'house', 'commercial', 'retail'].includes(addresstype)) {
        score += 10;
    } else if (hasBuildingIntent && ['road', 'street'].includes(addresstype)) {
        score -= 20;
    }

    if (['office', 'commercial', 'retail', 'house', 'apartments', 'yes'].includes(type)) {
        score += 5;
    }

    if (['amenity', 'shop', 'tourism', 'leisure'].includes(osmClass) && hasBuildingIntent) {
        score -= 10;
    }

    if (['steps', 'staircase', 'entrance', 'service', 'footway', 'corridor'].includes(type)) {
        score -= 28;
    }

    if (hasBuildingIntent && bboxArea !== null && bboxArea < 0.00000003) {
        score -= 12;
    }

    return score;
}

function buildStructuredAddress(data, { includePoi = false } = {}) {
    const address = data?.address || {};
    const houseAndRoad = [address.house_number, address.road].filter(Boolean).join(', ');
    const district = address.city_district || address.suburb;
    const city = address.city || address.town || address.village;

    const parts = [
        address.house,
        address.building,
        houseAndRoad,
        district,
        city,
        includePoi ? address.amenity : null,
        includePoi ? address.office : null,
        includePoi ? address.shop : null,
        address.country,
        address.state,
    ].filter(Boolean);

    return normalizeText(parts.join(', '));
}

function normalizeAddress(data) {
    return buildStructuredAddress(data) || normalizeText(data?.display_name || '');
}

function normalizeForwardAddress(data) {
    return buildStructuredAddress(data) || normalizeText(data?.display_name || '');
}

function parseBoundingBox(rawBoundingBox) {
    if (!Array.isArray(rawBoundingBox) || rawBoundingBox.length !== 4) {
        return null;
    }

    const south = Number(rawBoundingBox[0]);
    const north = Number(rawBoundingBox[1]);
    const west = Number(rawBoundingBox[2]);
    const east = Number(rawBoundingBox[3]);

    if (![south, north, west, east].every(Number.isFinite)) {
        return null;
    }

    return {
        south,
        north,
        west,
        east,
        leafletBounds: [
            [south, west],
            [north, east],
        ],
    };
}

export async function reverseGeocodeByCoords(lat, lng) {
    const numLat = Number(lat);
    const numLng = Number(lng);

    if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
        throw new Error('Некорректные координаты');
    }

    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: {
            lat: numLat,
            lon: numLng,
            format: 'jsonv2',
            addressdetails: 1,
            zoom: 18,
        },
        timeout: 8000,
        headers: {
            'User-Agent': 'ZemaApp/1.0 (contact: admin@zema.local)',
            Accept: 'application/json',
        },
    });

    const data = response.data || {};

    return {
        lat: numLat,
        lng: numLng,
        displayName: data.display_name || '',
        address: normalizeAddress(data),
        raw: data,
    };
}

export async function geocodeByAddress(address) {
    const normalizedAddress = String(address || '').trim();

    if (!normalizedAddress) {
        throw new Error('Некорректный адрес');
    }

    const queries = buildGeocodeQueryVariants(normalizedAddress);
    let item = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const query of queries) {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                q: query,
                format: 'jsonv2',
                addressdetails: 1,
                limit: 5,
                polygon_geojson: 1,
                countrycodes: 'ru',
            },
            timeout: 8000,
            headers: {
                'User-Agent': 'ZemaApp/1.0 (contact: admin@zema.local)',
                Accept: 'application/json',
            },
        });

        const results = Array.isArray(response.data) ? response.data : [];
        for (const candidate of results) {
            const score = scoreGeocodeCandidate(candidate, query);
            if (score > bestScore) {
                bestScore = score;
                item = candidate;
            }
        }
    }

    if (!item) {
        throw new Error(`Не удалось определить координаты по адресу`);
    }

    return {
        lat: Number(item.lat),
        lng: Number(item.lon),
        displayName: item.display_name || normalizedAddress,
        address: normalizeForwardAddress(item),
        bounds: parseBoundingBox(item.boundingbox),
        geojson: item.geojson || null,
        raw: item,
    };
}

export const reverseGeocode = async (req, res) => {
    try {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);

        const result = await reverseGeocodeByCoords(lat, lng);
        res.json(result);
    } catch (error) {
        console.error('Ошибка reverse geocoding:', error?.response?.data || error.message);
        res.status(500).json({
            error: 'Не удалось определить адрес по координатам',
        });
    }
};

export const geocode = async (req, res) => {
    try {
        const address = req.query.address || req.query.q;
        const result = await geocodeByAddress(address);
        res.json(result);
    } catch (error) {
        console.error('Ошибка geocoding:', error?.response?.data || error.message);
        res.status(500).json({
            error: 'Не удалось определить координаты по адресу',
        });
    }
};

