import 'dotenv/config';
import { Pool } from 'pg';

const {
  PGHOST,
  PGPORT,
  PGDATABASE,
  PGUSER,
  PGPASSWORD,
  TABLE_NAME = 'analogues',
  RADIUS_METERS = '600',
  BATCH_SIZE = '500',
  REQUEST_DELAY_MS = '2000',
  CONCURRENCY = '1',
  OVERPASS_TIMEOUT_SEC = '60',
  MAX_RETRIES = '5',
  RETRY_DELAY_MS = '15000',
} = process.env;

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const pool = new Pool({
  host: PGHOST,
  port: Number(PGPORT),
  database: PGDATABASE,
  user: PGUSER,
  password: PGPASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCoords(row) {
  const lat = row.lat ?? row.y;
  const lon = row.lon ?? row.x;

  if (lat == null || lon == null) return null;

  const latNum = Number(lat);
  const lonNum = Number(lon);

  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return null;

  return { lat: latNum, lon: lonNum };
}

function buildOverpassQuery(lat, lon, radius, timeoutSec) {
  return `
[out:json][timeout:${timeoutSec}];
(
  node["amenity"](around:${radius},${lat},${lon});
  node["shop"](around:${radius},${lat},${lon});
  node["office"](around:${radius},${lat},${lon});
  node["tourism"](around:${radius},${lat},${lon});
  way["building"](around:${radius},${lat},${lon});
  way["landuse"="industrial"](around:${radius},${lat},${lon});
  way["railway"](around:${radius},${lat},${lon});
);
out center tags;
`.trim();
}

async function fetchWithTimeout(url, options, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function queryOverpass(lat, lon, radius) {
  const query = buildOverpassQuery(
    lat,
    lon,
    Number(RADIUS_METERS),
    Number(OVERPASS_TIMEOUT_SEC)
  );

  const response = await fetchWithTimeout(
    OVERPASS_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=UTF-8',
      },
      body: query,
    },
    120000
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Overpass error ${response.status}: ${text.slice(0, 400)}`);
  }

  const data = await response.json();
  return Array.isArray(data.elements) ? data.elements : [];
}

function classifyElement(tags = {}) {
  const amenity = tags.amenity || '';
  const shop = tags.shop || '';
  const building = tags.building || '';
  const office = tags.office || '';
  const tourism = tags.tourism || '';
  const landuse = tags.landuse || '';
  const railway = tags.railway || '';
  const publicTransport = tags.public_transport || '';
  const levelsRaw = tags['building:levels'];
  const levels = Number(levelsRaw);

  // Центры деловой активности
  if (
    tourism === 'hotel' ||
    !!office ||
    !!shop ||
    [
      'bank',
      'school',
      'college',
      'university',
      'kindergarten',
      'hospital',
      'clinic',
      'doctors',
      'dentist',
      'pharmacy',
      'bureau_de_change',
      'post_office',
      'townhall',
      'courthouse',
      'library',
    ].includes(amenity) ||
    [
      'commercial',
      'office',
      'retail',
      'public',
      'civic',
      'school',
      'hospital',
    ].includes(building)
  ) {
    return 'business';
  }

  // Промзона
  if (
    ['industrial', 'warehouse', 'transportation'].includes(building) ||
    landuse === 'industrial' ||
    !!railway ||
    publicTransport === 'station' ||
    amenity === 'fuel' ||
    amenity === 'bus_station' ||
    shop === 'car_repair'
  ) {
    return 'industrial';
  }

  // Жилая застройка
  if (['apartments', 'residential', 'dormitory'].includes(building)) {
    if (Number.isFinite(levels)) {
      if (levels >= 9) return 'residential_high';
      if (levels >= 3) return 'residential_mid';
    }
    return 'residential_high';
  }

  if (['house', 'terrace', 'semidetached_house', 'detached'].includes(building)) {
    return 'residential_mid';
  }

  return null;
}

function summarize(elements) {
  const counts = {
    business: 0,
    residential_high: 0,
    residential_mid: 0,
    industrial: 0,
  };

  for (const el of elements) {
    const cat = classifyElement(el.tags || {});
    if (cat) counts[cat]++;
  }

  const ranked = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  const labelMap = {
    business: 'Центры деловой активности',
    residential_high: 'Многоквартирная жилая застройка',
    residential_mid: 'Среднеэтажная жилая застройка',
    industrial: 'Промзона',
  };

  let env1 = null;
  let env2 = null;

  if (ranked.length > 0) {
    env1 = labelMap[ranked[0][0]];
  }

  if (ranked.length > 1) {
    const first = ranked[0][1];
    const second = ranked[1][1];
    if (first > 0 && second / first >= 0.7) {
      env2 = labelMap[ranked[1][0]];
    }
  }

  return {
    env1,
    env2,
    counts,
    totalRelevant:
      counts.business +
      counts.residential_high +
      counts.residential_mid +
      counts.industrial,
  };
}

async function loadRows(limit) {
  const sql = `
    select id, x, y, lat, lon
    from ${TABLE_NAME}
    where coalesce(lat, y) is not null
      and coalesce(lon, x) is not null
      and env_analyzed_at is null
    order by id
    limit $1
  `;

  const res = await pool.query(sql, [limit]);
  return res.rows;
}

async function updateResult(id, summary) {
  const sql = `
    update ${TABLE_NAME}
    set env_category_1 = $2,
        env_category_2 = $3,
        env_business_cnt = $4,
        env_residential_high_cnt = $5,
        env_residential_mid_cnt = $6,
        env_industrial_cnt = $7,
        env_osm_total_cnt = $8,
        env_analyzed_at = now()
    where id = $1
  `;

  const params = [
    id,
    summary.env1,
    summary.env2,
    summary.counts.business,
    summary.counts.residential_high,
    summary.counts.residential_mid,
    summary.counts.industrial,
    summary.totalRelevant,
  ];

  await pool.query(sql, params);
}

async function markFailed(id, errorMessage) {
  console.error(`FAILED id=${id}: ${errorMessage}`);
}

function isRetryableError(error) {
  const msg = String(error?.message || '').toLowerCase();

  return (
    msg.includes('overpass error 429') ||
    msg.includes('overpass error 502') ||
    msg.includes('overpass error 504') ||
    msg.includes('timeout') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('aborterror') ||
    msg.includes('connection terminated unexpectedly') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  );
}

async function processRow(row) {
  const coords = getCoords(row);

  if (!coords) {
    console.log(`SKIP id=${row.id}: invalid coords`);
    return false;
  }

  const maxRetries = Number(MAX_RETRIES);
  const retryDelay = Number(RETRY_DELAY_MS);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const elements = await queryOverpass(coords.lat, coords.lon, Number(RADIUS_METERS));
      const summary = summarize(elements);
      await updateResult(row.id, summary);

      console.log(
        `OK id=${row.id} env1=${summary.env1 || '-'} env2=${summary.env2 || '-'} total=${summary.totalRelevant}`
      );
      return true;
    } catch (error) {
      const retryable = isRetryableError(error);

      console.error(
        `ERROR id=${row.id} attempt=${attempt}/${maxRetries}: ${error.message}`
      );

      if (!retryable || attempt === maxRetries) {
        await markFailed(row.id, error.message);
        return false;
      }

      await sleep(retryDelay * attempt);
    }
  }

  return false;
}

async function runWorker(workerId, rows, delayMs) {
  let okCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const ok = await processRow(row);
    if (ok) okCount++;

    console.log(`Worker ${workerId}: ${i + 1}/${rows.length}`);
  }

  return okCount;
}

function splitIntoChunks(arr, parts) {
  const result = Array.from({ length: parts }, () => []);
  for (let i = 0; i < arr.length; i++) {
    result[i % parts].push(arr[i]);
  }
  return result;
}

async function getStats() {
  const sql = `
    select
      count(*) as total,
      count(env_analyzed_at) as processed,
      count(*) - count(env_analyzed_at) as remaining
    from ${TABLE_NAME}
  `;
  const res = await pool.query(sql);
  return res.rows[0];
}

async function main() {
  console.log('Starting...');
  console.log(`TABLE_NAME=${TABLE_NAME}`);
  console.log(`RADIUS_METERS=${RADIUS_METERS}`);
  console.log(`BATCH_SIZE=${BATCH_SIZE}`);
  console.log(`CONCURRENCY=${CONCURRENCY}`);
  console.log(`REQUEST_DELAY_MS=${REQUEST_DELAY_MS}`);

  let totalProcessedThisRun = 0;
  const batchSize = Number(BATCH_SIZE);
  const concurrency = Math.max(1, Number(CONCURRENCY));
  const delayMs = Number(REQUEST_DELAY_MS);

  while (true) {
    const rows = await loadRows(batchSize);

    if (rows.length === 0) {
      break;
    }

    console.log(`Loaded batch size=${rows.length}`);

    const workerChunks = splitIntoChunks(rows, Math.min(concurrency, rows.length));

    const results = await Promise.all(
      workerChunks.map((chunk, idx) => runWorker(idx + 1, chunk, delayMs))
    );

    totalProcessedThisRun += results.reduce((sum, n) => sum + n, 0);

    const stats = await getStats();
    console.log(
      `Batch done. total=${stats.total} processed=${stats.processed} remaining=${stats.remaining}`
    );
  }

  console.log(`Done. Processed this run: ${totalProcessedThisRun}`);
  await pool.end();
}

main().catch(async (error) => {
  console.error('FATAL:', error);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});