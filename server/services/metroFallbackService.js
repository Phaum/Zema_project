const METRO_DATASET_URLS = {
  moscow: 'https://raw.githubusercontent.com/jarosluv/russian_infrastructure/master/moscow/metro_stations.json',
  saint_petersburg: 'https://raw.githubusercontent.com/jarosluv/russian_infrastructure/master/saint_petersburg/metro_stations.json',
};

const datasetCache = new Map();

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[–—-]\s*\d+\b/g, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectMetroDatasetKey({ address = null, city = null } = {}) {
  const source = normalizeText(city || address);

  if (source.includes('санкт-петербург') || source.includes('спб')) {
    return 'saint_petersburg';
  }

  if (source.includes('москва')) {
    return 'moscow';
  }

  return null;
}

export function haversineDistanceMeters(left, right) {
  const lat1 = Number(left?.lat);
  const lon1 = Number(left?.lon);
  const lat2 = Number(right?.lat);
  const lon2 = Number(right?.lon);

  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) {
    return null;
  }

  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

async function loadMetroDataset(datasetKey) {
  if (!METRO_DATASET_URLS[datasetKey]) {
    return [];
  }

  if (datasetCache.has(datasetKey)) {
    return datasetCache.get(datasetKey);
  }

  const response = await fetch(METRO_DATASET_URLS[datasetKey], {
    signal: AbortSignal.timeout(15000),
    headers: {
      accept: 'application/json',
      'user-agent': 'ZemaApp/1.0 (metro-fallback)',
    },
  });

  if (!response.ok) {
    throw new Error(`Не удалось загрузить датасет метро: ${response.status}`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : [];
  const stations = rows.flatMap((row) => {
    if (Array.isArray(row?.stations)) {
      return row.stations.map((station) => ({
        ...station,
        line: row.line?.name || row.line?.id || null,
        lat: Array.isArray(station?.latlon) ? Number(station.latlon[0]) : Number(station?.lat),
        lon: Array.isArray(station?.latlon) ? Number(station.latlon[1]) : Number(station?.lon),
      }));
    }

    return [
      {
        ...row,
        lat: Number(row?.lat),
        lon: Number(row?.lon),
      },
    ];
  });

  datasetCache.set(datasetKey, stations);
  return stations;
}

export async function findMetroStationByName({ stationName, address = null, city = null } = {}) {
  const normalizedName = normalizeText(stationName);
  if (!normalizedName) {
    return null;
  }

  const datasetKey = detectMetroDatasetKey({ address, city });
  if (!datasetKey) {
    return null;
  }

  const stations = await loadMetroDataset(datasetKey);
  if (!stations.length) {
    return null;
  }

  const exact = stations.find((station) => {
    const stationNameNormalized = normalizeText(station?.name || station?.title);
    return stationNameNormalized === normalizedName;
  });

  if (exact) {
    return exact;
  }

  return stations.find((station) => {
    const stationNameNormalized = normalizeText(station?.name || station?.title);
    return stationNameNormalized.includes(normalizedName) || normalizedName.includes(stationNameNormalized);
  }) || null;
}

export async function calculateDistanceToMetroStation({
  stationName,
  lat,
  lon,
  address = null,
  city = null,
} = {}) {
  const station = await findMetroStationByName({ stationName, address, city });
  if (!station) {
    return null;
  }

  const distance = haversineDistanceMeters(
    { lat, lon },
    { lat: station.lat, lon: station.lon }
  );

  if (!Number.isFinite(distance)) {
    return null;
  }

  return {
    station: station.name || station.title || null,
    distance: Math.round(distance),
    lat: Number(station.lat),
    lon: Number(station.lon),
    source: `github:${detectMetroDatasetKey({ address, city })}:station_match`,
  };
}

export async function findNearestMetroCandidatesByCoords({
  lat,
  lon,
  address = null,
  city = null,
  limit = 6,
} = {}) {
  const datasetKey = detectMetroDatasetKey({ address, city });
  if (!datasetKey) {
    return [];
  }

  const stations = await loadMetroDataset(datasetKey);
  if (!stations.length) {
    return [];
  }

  return stations
    .map((station) => ({
      station: station.name || station.title || null,
      lat: Number(station.lat),
      lon: Number(station.lon),
      distance: haversineDistanceMeters(
        { lat, lon },
        { lat: station.lat, lon: station.lon }
      ),
      source: `github:${datasetKey}`,
    }))
    .filter((item) => item.station && Number.isFinite(item.lat) && Number.isFinite(item.lon) && Number.isFinite(item.distance))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, Math.max(1, Number(limit) || 1))
    .map((item) => ({
      ...item,
      distance: Math.round(item.distance),
    }));
}

export async function findNearestMetroByCoords({ lat, lon, address = null, city = null } = {}) {
  const [nearest] = await findNearestMetroCandidatesByCoords({
    lat,
    lon,
    address,
    city,
    limit: 1,
  });

  if (!nearest) {
    return null;
  }

  return nearest;
}

export async function getMetroDatasetHealth({ address = null, city = null } = {}) {
  const datasetKey = detectMetroDatasetKey({ address, city });

  if (!datasetKey) {
    return {
      status: 'degraded',
      datasetKey: null,
      stationsCount: 0,
      message: 'Не удалось определить город для датасета метро',
    };
  }

  const stations = await loadMetroDataset(datasetKey);

  return {
    status: stations.length > 0 ? 'ok' : 'degraded',
    datasetKey,
    stationsCount: stations.length,
  };
}
