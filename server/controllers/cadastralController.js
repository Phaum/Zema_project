import { CadastralData } from '../models/index.js';
import { Op } from 'sequelize';
import { reverseGeocodeByCoords } from './geoController.js';
import { toNumber, safeString } from '../utils/dataValidation.js';
import { fetchCadastralFallbackData } from '../services/cadastralFallbackService.js';
import { calculateNearestMetro } from '../services/geoService.js';
import { getCadastralInfoFromNspd } from '../services/nspdParserService.js';
import {
  extractDistrictFromCadastralRecord,
  isPlausibleMetroDistanceMeters,
  isSuspiciousDistrictLabel,
} from '../utils/locationNormalization.js';

const CADASTRAL_REGEX = /^\d{2}:\d{2}:\d{7}:\d{1,16}$/;

function normalizeCadastralNumber(value) {
  return String(value || '').trim();
}

function isValidCadastralNumber(value) {
  return CADASTRAL_REGEX.test(normalizeCadastralNumber(value));
}

function getCadastralQuarterPrefix(cadastralNumber) {
  const normalized = normalizeCadastralNumber(cadastralNumber);
  const parts = normalized.split(':');

  if (parts.length !== 4) {
    return null;
  }

  return `${parts[0]}:${parts[1]}:${parts[2]}`;
}

function isDerivedLandPlaceholder(cadastralNumber) {
  return normalizeCadastralNumber(cadastralNumber).endsWith(':0');
}

function normalizeAddressKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyLandRecord(record) {
  const objectType = String(safeString(record?.object_type) || '').toLowerCase();

  if (objectType.includes('зем')) return true;
  if (objectType.includes('участ')) return true;
  if (objectType.includes('здан')) return false;
  if (record?.land_area !== null && record?.land_area !== undefined) return true;
  if (record?.total_area === null || record?.total_area === undefined) return true;

  return false;
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (typeof value === 'object') return true;
  return String(value).trim() !== '';
}

function hasValidCoordinates(latitude, longitude) {
  return (
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude)) &&
    Number(latitude) >= -90 &&
    Number(latitude) <= 90 &&
    Number(longitude) >= -180 &&
    Number(longitude) <= 180
  );
}

function firstMeaningful(...values) {
  for (const value of values) {
    if (hasMeaningfulValue(value)) {
      return value;
    }
  }

  return null;
}

function scoreAddressDetail(value) {
  const text = String(value || '').trim();
  if (!text) {
    return -1;
  }

  let score = text.length;
  if (/\d/u.test(text)) score += 20;
  if (/(улиц|просп|пр-кт|шоссе|наб|переул|площад|проезд)/iu.test(text)) score += 35;
  if (/(дом|д\.|строение|стр\.|литер|корпус|к\.)/iu.test(text)) score += 20;
  if (/российская федерация/iu.test(text)) score += 10;

  return score;
}

function pickBestAddress(...values) {
  return values
    .filter((value) => hasMeaningfulValue(value))
    .map((value) => String(value).trim())
    .sort((left, right) => scoreAddressDetail(right) - scoreAddressDetail(left))[0] || null;
}

function normalizeStoredRecord(record) {
  if (!record) {
    return null;
  }

  return {
    cadastral_number: safeString(record.cadastral_number),
    object_type: safeString(record.object_type),
    cadastral_quarter: safeString(record.cadastral_quarter),
    year_built: safeString(record.year_built),
    year_commisioning: safeString(record.year_commisioning),
    total_area: toNumber(record.total_area),
    land_area: toNumber(record.land_area),
    cad_cost: toNumber(record.cad_cost),
    specific_cadastral_cost: toNumber(record.specific_cadastral_cost),
    permitted_use: safeString(record.permitted_use),
    address: safeString(record.address),
    address_display: safeString(record.address_display),
    address_document: safeString(record.address_document),
    district: safeString(record.district),
    ownership_form: safeString(record.ownership_form),
    latitude: toNumber(record.latitude),
    longitude: toNumber(record.longitude),
    nearest_metro: safeString(record.nearest_metro),
    metro_distance: toNumber(record.metro_distance),
    land_plot_cadastral_number: safeString(record.land_plot_cadastral_number),
    total_oks_area_on_land: toNumber(record.total_oks_area_on_land),
    floor_count: safeString(record.floor_count),
    source_provider: safeString(record.source_provider),
    source_url: safeString(record.source_url),
    source_note: safeString(record.source_note),
    source_updated_at: safeString(record.source_updated_at),
    raw_payload_json: record.raw_payload_json ?? null,
  };
}

function normalizeParserPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  return {
    cadastral_number: safeString(parsed.cadastral_number),
    object_type: safeString(parsed.object_type),
    cadastral_quarter: safeString(parsed.cadastral_quarter),
    year_built: safeString(parsed.year_built),
    year_commisioning: safeString(parsed.year_commisioning),
    total_area: toNumber(parsed.total_area),
    land_area: toNumber(parsed.land_area),
    cad_cost: toNumber(parsed.cad_cost),
    specific_cadastral_cost: toNumber(parsed.specific_cadastral_cost),
    permitted_use: safeString(parsed.permitted_use),
    address: safeString(parsed.address),
    district: safeString(parsed.district),
    ownership_form: safeString(parsed.ownership_form),
    latitude: toNumber(parsed?.coordinates?.latitude),
    longitude: toNumber(parsed?.coordinates?.longitude),
    land_plot_cadastral_number: safeString(parsed.land_plot_cadastral_number),
    floor_count: safeString(parsed.floor_count),
    source_provider: safeString(parsed.source_provider),
    source_url: safeString(parsed.source_url),
    raw_payload_json: parsed.raw_payload_json ?? null,
  };
}

function isNormalizedRecordSufficient(record) {
  if (!record) {
    return false;
  }

  return Boolean(
    hasMeaningfulValue(record.address) ||
    hasMeaningfulValue(record.district) ||
    hasMeaningfulValue(record.cad_cost) ||
    hasMeaningfulValue(record.permitted_use) ||
    hasValidCoordinates(record.latitude, record.longitude)
  );
}

function needsRecordEnrichment(record) {
  if (!record || record.status !== 'COMPLETED') {
    return true;
  }

  if (!isNormalizedRecordSufficient(normalizeStoredRecord(record))) {
    return true;
  }

  if (!record.source_provider || !record.raw_payload_json) {
    return true;
  }

  if (!isLikelyLandRecord(record) && !hasMeaningfulValue(record.land_plot_cadastral_number)) {
    return true;
  }

  if (isSuspiciousDistrictLabel(record.district)) {
    return true;
  }

  if (hasMeaningfulValue(record.metro_distance) && !isPlausibleMetroDistanceMeters(record.metro_distance)) {
    return true;
  }

  if (!hasValidCoordinates(record.latitude, record.longitude) && hasMeaningfulValue(record.address)) {
    return true;
  }

  return false;
}

function mergeRecordPayloads({ cached = null, parsed = null, fallback = null, metroData = {} } = {}) {
  const normalizedCached = normalizeStoredRecord(cached);
  const resolvedDistrict = firstMeaningful(
    extractDistrictFromCadastralRecord(fallback),
    extractDistrictFromCadastralRecord({ district: parsed?.district }),
    extractDistrictFromCadastralRecord(normalizedCached)
  );

  return {
    cadastral_number: safeString(firstMeaningful(parsed?.cadastral_number, fallback?.cadastral_number, normalizedCached?.cadastral_number)),
    object_type: safeString(firstMeaningful(parsed?.object_type, fallback?.object_type, normalizedCached?.object_type)),
    cadastral_quarter: safeString(firstMeaningful(parsed?.cadastral_quarter, fallback?.cadastral_quarter, normalizedCached?.cadastral_quarter)),
    year_built: safeString(firstMeaningful(parsed?.year_built, normalizedCached?.year_built)),
    year_commisioning: safeString(firstMeaningful(parsed?.year_commisioning, normalizedCached?.year_commisioning)),
    total_area: toNumber(firstMeaningful(parsed?.total_area, fallback?.total_area, normalizedCached?.total_area)),
    land_area: toNumber(firstMeaningful(parsed?.land_area, fallback?.land_area, normalizedCached?.land_area)),
    cad_cost: toNumber(firstMeaningful(parsed?.cad_cost, fallback?.cad_cost, normalizedCached?.cad_cost)),
    specific_cadastral_cost: toNumber(firstMeaningful(parsed?.specific_cadastral_cost, fallback?.specific_cadastral_cost, normalizedCached?.specific_cadastral_cost)),
    permitted_use: safeString(firstMeaningful(parsed?.permitted_use, fallback?.permitted_use, normalizedCached?.permitted_use)),
    address: pickBestAddress(
      parsed?.address,
      fallback?.address_document,
      fallback?.address,
      fallback?.address_display,
      normalizedCached?.address_document,
      normalizedCached?.address,
      normalizedCached?.address_display
    ),
    address_display: safeString(firstMeaningful(fallback?.address_display, normalizedCached?.address_display)),
    address_document: safeString(firstMeaningful(fallback?.address_document, normalizedCached?.address_document)),
    district: safeString(resolvedDistrict),
    ownership_form: safeString(firstMeaningful(parsed?.ownership_form, fallback?.ownership_form, normalizedCached?.ownership_form)),
    latitude: toNumber(firstMeaningful(parsed?.latitude, fallback?.latitude, normalizedCached?.latitude)),
    longitude: toNumber(firstMeaningful(parsed?.longitude, fallback?.longitude, normalizedCached?.longitude)),
    nearest_metro: safeString(firstMeaningful(
      metroData.station,
      isPlausibleMetroDistanceMeters(normalizedCached?.metro_distance) ? normalizedCached?.nearest_metro : null
    )),
    metro_distance: toNumber(firstMeaningful(
      isPlausibleMetroDistanceMeters(metroData.distance) ? metroData.distance : null,
      isPlausibleMetroDistanceMeters(normalizedCached?.metro_distance) ? normalizedCached?.metro_distance : null
    )),
    land_plot_cadastral_number: safeString(firstMeaningful(parsed?.land_plot_cadastral_number, fallback?.land_plot_cadastral_number, normalizedCached?.land_plot_cadastral_number)),
    total_oks_area_on_land: toNumber(firstMeaningful(fallback?.total_oks_area_on_land, normalizedCached?.total_oks_area_on_land)),
    floor_count: safeString(firstMeaningful(parsed?.floor_count, fallback?.floor_count, normalizedCached?.floor_count)),
    source_provider: safeString(firstMeaningful(parsed?.source_provider, fallback?.source_provider, normalizedCached?.source_provider)),
    source_url: safeString(firstMeaningful(parsed?.source_url, fallback?.source_url, normalizedCached?.source_url)),
    source_note: safeString(firstMeaningful(fallback?.source_note, normalizedCached?.source_note)),
    source_updated_at: safeString(firstMeaningful(fallback?.source_updated_at, normalizedCached?.source_updated_at)),
    raw_payload_json: {
      ...(normalizedCached?.raw_payload_json || {}),
      ...(fallback?.raw_payload_json ? { fallback: fallback.raw_payload_json } : {}),
      ...(parsed?.raw_payload_json || {}),
    },
    status: 'COMPLETED',
  };
}

function scoreAddressSimilarity(left, right) {
  const leftTokens = new Set(normalizeAddressKey(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeAddressKey(right).split(' ').filter(Boolean));

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  let matches = 0;

  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      matches += 1;
    }
  });

  return matches;
}

async function findQuarterSiblingRecords(cadastralNumber) {
  const prefix = getCadastralQuarterPrefix(cadastralNumber);

  if (!prefix) {
    return [];
  }

  return CadastralData.findAll({
    where: {
      cadastral_number: {
        [Op.like]: `${prefix}:%`,
      },
    },
    order: [['cadastral_number', 'ASC']],
    raw: true,
  });
}

async function resolveFallbackLandCandidate(baseRecord, normalizedCad) {
  const fallback = await fetchCadastralFallbackData(normalizedCad);
  const fallbackLandCad = normalizeCadastralNumber(
    firstMeaningful(
      fallback?.land_plot_cadastral_number,
      fallback?.raw_payload_json?.related_land_plot?.cadastral_number
    )
  );

  if (fallbackLandCad && baseRecord?.id) {
    await CadastralData.update(
      { land_plot_cadastral_number: fallbackLandCad },
      { where: { id: baseRecord.id } }
    );
  }

  return fallbackLandCad;
}

export async function resolveLandCadastralNumberCandidate(
  cadastralNumber,
  { relatedAddress = null, excludeCadastralNumber = null } = {}
) {
  const normalized = normalizeCadastralNumber(cadastralNumber);
  const baseRecord = await CadastralData.findOne({
    where: { cadastral_number: normalized },
    raw: true,
  });

  const directLandCad = normalizeCadastralNumber(baseRecord?.land_plot_cadastral_number);
  if (
    directLandCad &&
    directLandCad !== normalized &&
    !isDerivedLandPlaceholder(directLandCad) &&
    (!excludeCadastralNumber || directLandCad !== normalizeCadastralNumber(excludeCadastralNumber))
  ) {
    try {
      const refreshedLandCad = await resolveFallbackLandCandidate(baseRecord, normalized);

      if (
        refreshedLandCad &&
        refreshedLandCad !== normalized &&
        !isDerivedLandPlaceholder(refreshedLandCad) &&
        (!excludeCadastralNumber || refreshedLandCad !== normalizeCadastralNumber(excludeCadastralNumber))
      ) {
        return refreshedLandCad;
      }
    } catch {
      // keep cached candidate when fallback refresh is temporarily unavailable
    }

    return directLandCad;
  }

  const siblings = await findQuarterSiblingRecords(normalized);

  let candidates = siblings.filter((row) => {
    const cad = normalizeCadastralNumber(row.cadastral_number);

    if (!cad || cad === normalized) return false;
    if (excludeCadastralNumber && cad === normalizeCadastralNumber(excludeCadastralNumber)) return false;
    if (isDerivedLandPlaceholder(cad)) return false;

    return true;
  });

  if (!candidates.length) {
    return null;
  }

  const likelyLand = candidates.filter(isLikelyLandRecord);
  if (likelyLand.length === 1) {
    return likelyLand[0].cadastral_number;
  }
  if (likelyLand.length > 1) {
    candidates = likelyLand;
  }

  if (relatedAddress) {
    const scored = candidates
      .map((candidate) => ({
        candidate,
        score: scoreAddressSimilarity(relatedAddress, candidate.address),
      }))
      .sort((left, right) => right.score - left.score);

    if (scored[0]?.score > 0) {
      return scored[0].candidate.cadastral_number;
    }
  }

  if (candidates.length === 1) {
    return candidates[0].cadastral_number;
  }

  try {
    const fallbackLandCad = await resolveFallbackLandCandidate(baseRecord, normalized);

    if (
      fallbackLandCad &&
      fallbackLandCad !== normalized &&
      !isDerivedLandPlaceholder(fallbackLandCad) &&
      (!excludeCadastralNumber || fallbackLandCad !== normalizeCadastralNumber(excludeCadastralNumber))
    ) {
      return fallbackLandCad;
    }
  } catch {
    // ignore fallback lookup failures here and preserve previous resolver behavior
  }

  return null;
}

export async function resolveLandRecord(cadastralNumber, { forceRefresh = false, relatedAddress = null } = {}) {
  const normalizedCad = normalizeCadastralNumber(cadastralNumber);

  if (!isDerivedLandPlaceholder(normalizedCad)) {
    return getOrFetchCadastralRecord(normalizedCad, { forceRefresh });
  }

  const resolvedCandidate = await resolveLandCadastralNumberCandidate(normalizedCad, {
    relatedAddress,
  });

  if (!resolvedCandidate) {
    throw new Error('Не удалось определить реальный кадастровый номер участка');
  }

  return getOrFetchCadastralRecord(resolvedCandidate, { forceRefresh });
}

async function getMetroByCoordinates(latitude, longitude, { address = null, city = null } = {}) {
  if (latitude === null || longitude === null) {
    return {
      station: null,
      distance: null,
    };
  }

  try {
    const metro = await calculateNearestMetro({
      lat: latitude,
      lon: longitude,
      address,
      city,
    });

    return {
      station: metro?.station ?? null,
      distance: metro?.distance ?? null,
    };
  } catch (error) {
    console.error('Ошибка встроенного geo-service:', error.message);
    return { station: null, distance: null };
  }
}

async function loadObjectFromParser(cadastralNumber) {
  const parsed = await getCadastralInfoFromNspd(cadastralNumber);
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  return parsed;
}

async function upsertCadastralRecord(payload) {
  const recordPayload = { ...payload };

  if (
    !hasMeaningfulValue(recordPayload.address) &&
    hasValidCoordinates(recordPayload.latitude, recordPayload.longitude)
  ) {
    try {
      const reverse = await reverseGeocodeByCoords(recordPayload.latitude, recordPayload.longitude);
      recordPayload.address = safeString(reverse.address || reverse.displayName);
    } catch (error) {
      console.error('Не удалось получить адрес по координатам:', error.message);
    }
  }

  const existing = await CadastralData.findOne({
    where: { cadastral_number: recordPayload.cadastral_number },
  });

  if (existing) {
    await existing.update(recordPayload);
    return await existing.reload();
  }

  return await CadastralData.create(recordPayload);
}

function mapBuildingResponse(record) {
  const builtYear =
      record.year_built ? Number(record.year_built) || null : null;

  const commissioningYear =
      record.year_commisioning ? Number(record.year_commisioning) || null : null;

  return {
    cadastralNumber: record.cadastral_number,
    objectType: record.object_type || 'здание',
    address: record.address || '',
    totalArea: record.total_area !== null ? Number(record.total_area) : null,
    constructionYear: builtYear || commissioningYear,
    mapPointLat: record.latitude !== null ? Number(record.latitude) : null,
    mapPointLng: record.longitude !== null ? Number(record.longitude) : null,
    nearestMetro: record.nearest_metro || null,
    metroDistance: record.metro_distance !== null ? Number(record.metro_distance) : null,
    district: record.district || null,
    cadCost: record.cad_cost !== null ? Number(record.cad_cost) : null,
    permittedUse: record.permitted_use || null,
    aboveGroundFloors: record.floor_count ? Number(record.floor_count) || null : null,
    undergroundFloors: resolveUndergroundFloorCount(record),
    sourceProvider: record.source_provider || null,
    nspdBuildingLoaded: true,
  };
}

function resolveUndergroundFloorCount(record = {}) {
  const rawPayload = record.raw_payload_json || {};
  const value =
    rawPayload?.nspd?.options?.underground_floors ??
    rawPayload?.fallback?.match?.data?.raw_fields?.['Количество подземных этажей'] ??
    rawPayload?.match?.data?.raw_fields?.['Количество подземных этажей'];
  const match = String(value ?? '').match(/\d+/);

  return match ? Number(match[0]) : null;
}

function mapLandResponse(record) {
  return {
    cadastralNumber: record.cadastral_number,
    landArea: record.land_area !== null ? Number(record.land_area) : null,
    address: record.address || '',
    mapPointLat: record.latitude !== null ? Number(record.latitude) : null,
    mapPointLng: record.longitude !== null ? Number(record.longitude) : null,
    district: record.district || null,
    cadCost: record.cad_cost !== null ? Number(record.cad_cost) : null,
    permittedUse: record.permitted_use || null,
    totalOksAreaOnLand: record.total_oks_area_on_land !== null ? Number(record.total_oks_area_on_land) : null,
    nspdLandLoaded: true,
  };
}

export async function getOrFetchCadastralRecord(cadastralNumber, { forceRefresh = false } = {}) {
  const normalizedCad = normalizeCadastralNumber(cadastralNumber);

  if (!isValidCadastralNumber(normalizedCad)) {
    throw new Error('Некорректный формат кадастрового номера');
  }

  const cached = await CadastralData.findOne({
    where: { cadastral_number: normalizedCad },
  });

  if (!forceRefresh && cached && !needsRecordEnrichment(cached)) {
    return cached;
  }

  let parsedPayload = null;
  let fallbackPayload = null;
  let parserError = null;
  let fallbackError = null;

  try {
    parsedPayload = normalizeParserPayload(await loadObjectFromParser(normalizedCad));
  } catch (error) {
    parserError = error;
  }

  if (!isNormalizedRecordSufficient(parsedPayload) || forceRefresh || needsRecordEnrichment(cached)) {
    try {
      fallbackPayload = await fetchCadastralFallbackData(normalizedCad);
    } catch (error) {
      fallbackError = error;
    }
  }

  const latitude = toNumber(firstMeaningful(parsedPayload?.latitude, fallbackPayload?.latitude));
  const longitude = toNumber(firstMeaningful(parsedPayload?.longitude, fallbackPayload?.longitude));
  const metroData = await getMetroByCoordinates(latitude, longitude, {
    address: firstMeaningful(parsedPayload?.address, fallbackPayload?.address, fallbackPayload?.address_document),
  });

  const mergedPayload = mergeRecordPayloads({
    cached,
    parsed: parsedPayload,
    fallback: fallbackPayload,
    metroData,
  });

  if (!isNormalizedRecordSufficient(mergedPayload)) {
    if (cached && isNormalizedRecordSufficient(normalizeStoredRecord(cached))) {
      cached.source_note = [
        cached.source_note,
        `Последнее обновление кадастровых данных не выполнено: ${parserError?.message || fallbackError?.message || 'внешний источник временно недоступен'}`,
      ].filter(Boolean).join(' ');
      return cached;
    }

    const message =
      parserError?.message ||
      fallbackError?.message ||
      'Не удалось получить данные по кадастровому номеру';
    throw new Error(message);
  }

  return await upsertCadastralRecord(mergedPayload);
}

export const getFullObjectInfo = async (req, res) => {
  try {
    const cadastralNumber = req.body.cadastral_number || req.body.cadastralNumber;

    if (!cadastralNumber) {
      return res.status(400).json({ error: 'Кадастровый номер не указан' });
    }

    const record = await getOrFetchCadastralRecord(cadastralNumber, {
      forceRefresh: Boolean(req.body.forceRefresh),
    });

    res.json({
      success: true,
      data: {
        cadastral_number: record.cadastral_number,
        object_type: record.object_type,
        address: record.address,
        year_built: record.year_built,
        year_commisioning: record.year_commisioning,
        total_area: record.total_area !== null ? Number(record.total_area) : null,
        land_area: record.land_area !== null ? Number(record.land_area) : null,
        cad_cost: record.cad_cost !== null ? Number(record.cad_cost) : null,
        total_oks_area_on_land: record.total_oks_area_on_land !== null ? Number(record.total_oks_area_on_land) : null,
        permitted_use: record.permitted_use,
        metro: {
          name: record.nearest_metro,
          distance_meters: record.metro_distance !== null ? Number(record.metro_distance) : null,
        },
        latitude: record.latitude !== null ? Number(record.latitude) : null,
        longitude: record.longitude !== null ? Number(record.longitude) : null,
        district: record.district,
      },
    });
  } catch (error) {
    console.error('Ошибка получения полного объекта:', error);
    res.status(500).json({
      error: error.message || 'Не удалось получить данные по кадастровому номеру',
    });
  }
};

export const getBuildingByCadastralNumber = async (req, res) => {
  try {
    const cadastralNumber = normalizeCadastralNumber(req.query.cadastralNumber);

    if (!cadastralNumber) {
      return res.status(400).json({ error: 'Не указан cadastralNumber' });
    }

    if (!isValidCadastralNumber(cadastralNumber)) {
      return res.status(400).json({ error: 'Некорректный формат cadastralNumber' });
    }

    const record = await getOrFetchCadastralRecord(cadastralNumber, {
      forceRefresh: req.query.forceRefresh === 'true',
    });

    const landCadastralNumber =
      record.land_plot_cadastral_number ||
      await resolveLandCadastralNumberCandidate(cadastralNumber, {
        relatedAddress: record.address,
        excludeCadastralNumber: cadastralNumber,
      });

    res.json({
      ...mapBuildingResponse(record),
      landCadastralNumber: landCadastralNumber || null,
    });
  } catch (error) {
    console.error('Ошибка получения здания:', error);
    res.status(500).json({
      error: error.message || 'Не удалось получить данные по зданию',
    });
  }
};

export const getLandByCadastralNumber = async (req, res) => {
  try {
    const cadastralNumber = normalizeCadastralNumber(req.query.cadastralNumber);
    const relatedAddress = req.query.relatedAddress || null;

    if (!cadastralNumber) {
      return res.status(400).json({ error: 'Не указан cadastralNumber' });
    }

    if (!isValidCadastralNumber(cadastralNumber)) {
      return res.status(400).json({ error: 'Некорректный формат cadastralNumber' });
    }

    const record = await resolveLandRecord(cadastralNumber, {
      forceRefresh: req.query.forceRefresh === 'true',
      relatedAddress,
    });

    res.json(mapLandResponse(record));
  } catch (error) {
    console.error('Ошибка получения участка:', error);
    res.status(500).json({
      error: error.message || 'Не удалось получить данные по земельному участку',
    });
  }
};
