import https from 'https';
import axios from 'axios';

const NSPD_BASE_URL = process.env.NSPD_BASE_URL || 'https://nspd.gov.ru';
const NSPD_SEARCH_PATH = '/api/geoportal/v2/search/geoportal';
const NSPD_TAB_VALUES_PATH = '/api/geoportal/v1/tab-values-data';
const NSPD_TAB_GROUP_PATH = '/api/geoportal/v1/tab-group-data';
const NSPD_TIMEOUT_MS = Number(process.env.NSPD_TIMEOUT_MS || 20000);
const NSPD_RETRIES = Number(process.env.NSPD_RETRIES || 5);
const NSPD_RETRY_DELAY_MS = Number(process.env.NSPD_RETRY_DELAY_MS || 1000);
const NSPD_THEME_REAL_ESTATE_OBJECTS = 1;

const nspdHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
  ciphers: 'ALL:@SECLEVEL=1',
});

function toFloat(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function safeString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyObject(objectType) {
  const text = String(objectType || '').toLowerCase();

  if (!text) return 'unknown';
  if (text.includes('земель') || text.includes('участ')) return 'land';
  if (text.includes('здан') || text.includes('строен') || text.includes('сооруж') || text.includes('бизнес')) return 'building';

  return 'unknown';
}

function extractDistrictFromAddress(address) {
  if (!address) {
    return null;
  }

  const parts = String(address).split(',');
  for (const rawPart of parts) {
    const part = rawPart.trim();
    const lower = part.toLowerCase();

    if (!lower.includes('муниципальный округ')) {
      continue;
    }

    const district = part
      .replace(/внутригородское муниципальное образование города федерального значения санкт-петербурга муниципальный округ/iu, '')
      .replace(/муниципальный округ/iu, '')
      .trim();

    if (district && !/(\d|№|улиц|просп|шосс|наб|переул|проезд|бульвар|аллея)/iu.test(district)) {
      return district;
    }
  }

  return null;
}

function flattenCoordinatePairs(value, result = []) {
  if (!Array.isArray(value)) {
    return result;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  ) {
    result.push([value[0], value[1]]);
    return result;
  }

  value.forEach((item) => flattenCoordinatePairs(item, result));
  return result;
}

function webMercatorToWgs84(x, y) {
  const longitude = (Number(x) / 20037508.34) * 180;
  let latitude = (Number(y) / 20037508.34) * 180;
  latitude = (180 / Math.PI) * (2 * Math.atan(Math.exp((latitude * Math.PI) / 180)) - Math.PI / 2);

  return { latitude, longitude };
}

function isValidWgs84(latitude, longitude) {
  return (
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude)) &&
    Number(latitude) >= -90 &&
    Number(latitude) <= 90 &&
    Number(longitude) >= -180 &&
    Number(longitude) <= 180
  );
}

export function extractCoordinates(geometry = null) {
  const pairs = flattenCoordinatePairs(geometry?.coordinates);
  if (!pairs.length) {
    return { latitude: null, longitude: null };
  }

  const avgX = pairs.reduce((sum, pair) => sum + Number(pair[0] || 0), 0) / pairs.length;
  const avgY = pairs.reduce((sum, pair) => sum + Number(pair[1] || 0), 0) / pairs.length;
  const crsName = String(geometry?.crs?.properties?.name || '').toUpperCase();

  if (crsName.includes('3857') || Math.abs(avgX) > 180 || Math.abs(avgY) > 90) {
    const converted = webMercatorToWgs84(avgX, avgY);
    return isValidWgs84(converted.latitude, converted.longitude)
      ? converted
      : { latitude: null, longitude: null };
  }

  return isValidWgs84(avgY, avgX)
    ? { latitude: avgY, longitude: avgX }
    : { latitude: null, longitude: null };
}

function getFeatureOptions(feature = {}) {
  return feature?.properties?.options && typeof feature.properties.options === 'object'
    ? feature.properties.options
    : {};
}

function parseIntegerText(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function extractCadastralNumbers(values = []) {
  return (Array.isArray(values) ? values : [])
    .flatMap((value) => String(value || '').match(/\d{2}:\d{2}:\d{7}:\d{1,16}/g) || [])
    .filter((value, index, items) => items.indexOf(value) === index);
}

function featureContainsExactQuery(feature, query) {
  const properties = feature?.properties || {};
  const options = getFeatureOptions(feature);
  const normalizedQuery = String(query || '').trim();
  const directValues = [
    properties.descr,
    properties.externalKey,
    properties.label,
    options.cad_num,
    options.cad_number,
    options.cadastral_number,
  ];

  if (directValues.some((value) => String(value || '').trim() === normalizedQuery)) {
    return true;
  }

  return Object.entries(options).some(([key, value]) => (
    !String(key).toLowerCase().includes('parent') &&
    String(value || '').trim() === normalizedQuery
  ));
}

function pickFeature(features = [], query) {
  const candidates = Array.isArray(features) ? features : [];
  const exact = candidates.filter((feature) => featureContainsExactQuery(feature, query));

  if (exact.length === 1) {
    return exact[0];
  }

  if (exact.length > 1) {
    const visibleExact = exact.filter((feature) => feature?.properties?.categoryName);
    if (visibleExact.length === 1) {
      return visibleExact[0];
    }

    throw new Error(`Найдено несколько объектов по кадастровому номеру ${query}`);
  }

  return candidates.length === 1 ? candidates[0] : null;
}

export function buildNspdParserResult(cadastralNumber, feature, { relatedLandCadastralNumbers = [] } = {}) {
  const data = getFeatureOptions(feature);
  const properties = feature?.properties || {};
  const objectType = data.object_type ||
    data.type ||
    data.build_record_type_value ||
    data.object_under_construction_record_record_type_value ||
    data.object_under_construction_record_name ||
    data.land_record_type ||
    properties.categoryName;
  const objectKind = classifyObject(objectType);
  const yearBuilt = data.year_built;
  const yearCommissioning = data.year_commisioning || data.year_commissioning;
  const address = data.readable_address || data.address || data.address_readable_address;
  const district = data.district || extractDistrictFromAddress(address);
  const totalArea = data.area || data.total_area || data.square || data.build_record_area;
  const constructionArea = data.built_up_area || data.params_built_up_area;
  const landArea = objectKind === 'land'
    ? (data.land_area || data.parcel_area || data.area_value || data.specified_area || data.declared_area || data.area)
    : data.land_area;
  const cadCost = data.cost_value || data.cad_cost || data.cadastral_cost || data.cadastre_cost;
  const specificCadCost = data.cost_index || data.specific_cadastral_cost || data.specific_cad_cost;
  const permittedUse = data.purpose ||
    data.permitted_use ||
    data.permitteduse ||
    data.land_use ||
    data.usage ||
    data.permitted_use_established_by_document ||
    data.permitted_use_name;
  const coordinates = extractCoordinates(feature?.geometry);
  const relatedLandPlots = extractCadastralNumbers(relatedLandCadastralNumbers);

  return {
    success: true,
    modeDetected: objectKind,
    cadastral_number: cadastralNumber,
    object_type: safeString(objectType),
    year_built: /^\d+$/.test(String(yearBuilt || '')) ? Number(yearBuilt) : safeString(yearBuilt),
    year_commisioning: /^\d+$/.test(String(yearCommissioning || '')) ? Number(yearCommissioning) : safeString(yearCommissioning),
    address: safeString(address),
    district: safeString(district),
    cadastral_quarter: safeString(data.quarter_cad_number || data.cadastral_quarter),
    total_area: toFloat(totalArea ?? constructionArea),
    land_area: toFloat(landArea),
    cad_cost: toFloat(cadCost),
    specific_cadastral_cost: toFloat(specificCadCost),
    permitted_use: safeString(permittedUse),
    ownership_form: safeString(data.ownership_type || data.ownership_form),
    floor_count: safeString(data.floors || data.floor_count || data.floor_count_total),
    underground_floor_count: parseIntegerText(data.underground_floors),
    land_plot_cadastral_number: relatedLandPlots[0] || null,
    coordinates,
    source_provider: 'nspd-js',
    source_url: `${NSPD_BASE_URL}/map?thematic=Default&theme_id=1&selectedCard=${encodeURIComponent(`${feature?.id || ''},${properties.category || ''},${cadastralNumber}`)}`,
    raw_payload_json: {
      nspd: {
        feature,
        options: data,
        related_land_plots: relatedLandPlots,
      },
    },
  };
}

async function requestSearch(cadastralNumber) {
  const response = await axios.get(`${NSPD_BASE_URL}${NSPD_SEARCH_PATH}`, {
    params: {
      query: cadastralNumber,
      thematicSearchId: NSPD_THEME_REAL_ESTATE_OBJECTS,
    },
    timeout: NSPD_TIMEOUT_MS,
    httpsAgent: nspdHttpsAgent,
    headers: {
      accept: 'application/json',
      referer: `${NSPD_BASE_URL}/map?thematic=PKK`,
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    },
  });

  return response.data;
}

async function requestTabValues(feature, tabClass) {
  const options = getFeatureOptions(feature);
  const properties = feature?.properties || {};
  const noCoords = Boolean(options.geocoderObject);
  const params = noCoords
    ? {
      tabClass,
      objdocId: options.objdocId,
      registersId: options.registersId,
    }
    : {
      tabClass,
      categoryId: properties.category,
      geomId: feature?.id,
    };

  if (!params.objdocId && !params.registersId && (!params.categoryId || !params.geomId)) {
    return null;
  }

  const response = await axios.get(`${NSPD_BASE_URL}${NSPD_TAB_VALUES_PATH}`, {
    params,
    timeout: NSPD_TIMEOUT_MS,
    httpsAgent: nspdHttpsAgent,
    headers: {
      accept: 'application/json',
      referer: `${NSPD_BASE_URL}/map?thematic=PKK`,
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    },
  });

  return response.data?.value || null;
}

async function requestTabGroup(feature, tabClass) {
  const options = getFeatureOptions(feature);
  const properties = feature?.properties || {};
  const noCoords = Boolean(options.geocoderObject);
  const params = noCoords
    ? {
      tabClass,
      objdocId: options.objdocId,
      registersId: options.registersId,
    }
    : {
      tabClass,
      categoryId: properties.category,
      geomId: feature?.id,
    };

  if (!params.objdocId && !params.registersId && (!params.categoryId || !params.geomId)) {
    return null;
  }

  const response = await axios.get(`${NSPD_BASE_URL}${NSPD_TAB_GROUP_PATH}`, {
    params,
    timeout: NSPD_TIMEOUT_MS,
    httpsAgent: nspdHttpsAgent,
    headers: {
      accept: 'application/json',
      referer: `${NSPD_BASE_URL}/map?thematic=PKK`,
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    },
  });

  return response.data || null;
}

async function getRelatedLandCadastralNumbers(feature) {
  try {
    return extractCadastralNumbers(await requestTabValues(feature, 'landLinks'));
  } catch (error) {
    if (error?.response?.status === 404) {
      return [];
    }

    throw error;
  }
}

async function getRelatedObjectCadastralNumbers(feature) {
  try {
    const tabGroup = await requestTabGroup(feature, 'objectsList');
    const values = Array.isArray(tabGroup?.object)
      ? tabGroup.object.flatMap((group) => group?.value || [])
      : [];

    return extractCadastralNumbers(values);
  } catch (error) {
    if (error?.response?.status === 404) {
      return [];
    }

    throw error;
  }
}

export async function getRegisteredOksObjectsOnLandFromNspd(landCadastralNumber) {
  const normalized = String(landCadastralNumber || '').trim();
  let delay = NSPD_RETRY_DELAY_MS;
  let lastError = null;

  for (let attempt = 0; attempt < NSPD_RETRIES; attempt += 1) {
    try {
      const payload = await requestSearch(normalized);
      const features = payload?.data?.features || payload?.features || [];
      const landFeature = pickFeature(features, normalized);

      if (!landFeature) {
        return {
          success: false,
          error: 'Земельный участок не найден',
          cadastral_number: normalized,
          objects: [],
        };
      }

      const relatedObjectCadastralNumbers = await getRelatedObjectCadastralNumbers(landFeature);
      const objects = [];

      for (const objectCadastralNumber of relatedObjectCadastralNumbers) {
        const parsed = await getCadastralInfoFromNspd(objectCadastralNumber);

        objects.push({
          cadastral_number: objectCadastralNumber,
          success: parsed.success,
          object_type: parsed.object_type || null,
          total_area: parsed.total_area ?? null,
          source_provider: parsed.source_provider || null,
          error: parsed.success ? null : parsed.error,
        });
      }

      return {
        success: true,
        cadastral_number: normalized,
        objects,
        source_provider: 'nspd-land-objects',
      };
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const retryable = status === 429 || status >= 500 || error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT';

      if (retryable && attempt < NSPD_RETRIES - 1) {
        await sleep(delay);
        delay *= 2;
        continue;
      }

      return {
        success: false,
        error: error?.response?.data?.message || error.message || 'Ошибка запроса списка ОКС на участке',
        cadastral_number: normalized,
        objects: [],
      };
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Превышено количество попыток запроса списка ОКС на участке',
    cadastral_number: normalized,
    objects: [],
  };
}

export async function getCadastralInfoFromNspd(cadastralNumber, { mode = 'auto' } = {}) {
  const normalized = String(cadastralNumber || '').trim();
  let delay = NSPD_RETRY_DELAY_MS;
  let lastError = null;

  for (let attempt = 0; attempt < NSPD_RETRIES; attempt += 1) {
    try {
      const payload = await requestSearch(normalized);
      const features = payload?.data?.features || payload?.features || [];
      const feature = pickFeature(features, normalized);

      if (!feature) {
        return {
          success: false,
          error: 'Объект не найден',
          cadastral_number: normalized,
          modeRequested: mode,
        };
      }

      const relatedLandCadastralNumbers = await getRelatedLandCadastralNumbers(feature);

      return buildNspdParserResult(normalized, feature, {
        relatedLandCadastralNumbers,
      });
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const retryable = status === 429 || status >= 500 || error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT';

      if (retryable && attempt < NSPD_RETRIES - 1) {
        await sleep(delay);
        delay *= 2;
        continue;
      }

      return {
        success: false,
        error: error?.response?.data?.message || error.message || 'Ошибка запроса НСПД',
        cadastral_number: normalized,
        modeRequested: mode,
      };
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Превышено количество попыток запроса',
    cadastral_number: normalized,
    modeRequested: mode,
  };
}
