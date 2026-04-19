import {
  calculateDistanceToMetroStation,
  findNearestMetroCandidatesByCoords,
  findNearestMetroByCoords,
  getMetroDatasetHealth,
} from './metroFallbackService.js';
import {
  calculateWalkingRouteDistance,
  calculateWalkingRoutesToPoints,
} from './pedestrianRoutingService.js';

const DEFAULT_CITY = process.env.GEO_DEFAULT_CITY || 'Санкт-Петербург';
const METRO_CANDIDATE_LIMIT = Number(process.env.GEO_METRO_CANDIDATE_LIMIT || 6);

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isValidLatitude(value) {
  return value !== null && value >= -90 && value <= 90;
}

function isValidLongitude(value) {
  return value !== null && value >= -180 && value <= 180;
}

export async function getGeoServiceHealth({ city = DEFAULT_CITY } = {}) {
  const dataset = await getMetroDatasetHealth({ city });

  return {
    status: dataset.status,
    engine: 'js-monolith',
    city,
    metroLoaded: dataset.status === 'ok',
    stationsCount: dataset.stationsCount,
    datasetKey: dataset.datasetKey,
    distanceMode: 'walking_route',
  };
}

export async function calculateNearestMetro({
  lat,
  lon,
  address = null,
  city = DEFAULT_CITY,
} = {}) {
  const latitude = toFiniteNumber(lat);
  const longitude = toFiniteNumber(lon);

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    throw new Error('Некорректные координаты');
  }

  const candidates = await findNearestMetroCandidatesByCoords({
    lat: latitude,
    lon: longitude,
    address,
    city,
    limit: METRO_CANDIDATE_LIMIT,
  });

  if (!candidates.length) {
    throw new Error('Не удалось определить ближайшее метро');
  }

  try {
    const routes = await calculateWalkingRoutesToPoints({
      origin: { lat: latitude, lon: longitude },
      destinations: candidates.map((candidate) => ({
        ...candidate,
        lat: candidate.lat,
        lon: candidate.lon,
      })),
    });
    const bestWalkingRoute = routes
      .filter((route) => route.station && Number.isFinite(Number(route.walkingDistance)))
      .sort((left, right) => Number(left.walkingDistance) - Number(right.walkingDistance))[0];

    if (bestWalkingRoute) {
      return {
        status: 'success',
        station: bestWalkingRoute.station,
        distance: Math.round(Number(bestWalkingRoute.walkingDistance)),
        straightDistance: Math.round(Number(bestWalkingRoute.distance)),
        source: 'js_monolith_geo_service',
        datasetSource: bestWalkingRoute.source || null,
        distanceMode: 'walking_route',
      };
    }
  } catch (error) {
    console.error('Ошибка расчета пешеходного маршрута до метро:', error.message);
  }

  const metro = candidates[0] || await findNearestMetroByCoords({
    lat: latitude,
    lon: longitude,
    address,
    city,
  });

  if (!metro?.station || !Number.isFinite(Number(metro.distance))) {
    throw new Error('Не удалось определить ближайшее метро');
  }

  return {
    status: 'success',
    station: metro.station,
    distance: Math.round(Number(metro.distance)),
    source: 'js_monolith_geo_service',
    datasetSource: metro.source || null,
    distanceMode: 'great_circle_fallback',
  };
}

export async function calculateMetroDistanceToStation({
  stationName,
  lat,
  lon,
  address = null,
  city = DEFAULT_CITY,
} = {}) {
  const latitude = toFiniteNumber(lat);
  const longitude = toFiniteNumber(lon);

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    throw new Error('Некорректные координаты');
  }

  const result = await calculateDistanceToMetroStation({
    stationName,
    lat: latitude,
    lon: longitude,
    address,
    city,
  });

  if (!result?.station || !Number.isFinite(Number(result.distance))) {
    throw new Error('Не удалось определить расстояние до указанной станции метро');
  }

  try {
    const walkingDistance = await calculateWalkingRouteDistance({
      origin: { lat: latitude, lon: longitude },
      destination: {
        lat: result.lat,
        lon: result.lon,
        station: result.station,
      },
    });

    if (Number.isFinite(Number(walkingDistance))) {
      return {
        status: 'success',
        station: result.station,
        distance: Math.round(Number(walkingDistance)),
        straightDistance: Math.round(Number(result.distance)),
        source: 'js_monolith_geo_service',
        datasetSource: result.source || null,
        distanceMode: 'walking_route',
      };
    }
  } catch (error) {
    console.error('Ошибка расчета пешеходного маршрута до станции метро:', error.message);
  }

  return {
    status: 'success',
    station: result.station,
    distance: Math.round(Number(result.distance)),
    source: 'js_monolith_geo_service',
    datasetSource: result.source || null,
    distanceMode: 'great_circle_fallback',
  };
}
