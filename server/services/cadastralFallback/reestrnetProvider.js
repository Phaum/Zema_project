import * as cheerio from 'cheerio';
import {
  calculateSpecificCost,
  capitalizeFirst,
  cleanupText,
  deriveCadastralQuarter,
  parseAreaText,
  parseMoneyText,
} from './valueUtils.js';

const REESTRNET_BASE_URL = process.env.REESTRNET_BASE_URL || 'https://xn--e1aaa5amcgid.xn--p1ai';
const REESTRNET_TOKEN = process.env.REESTRNET_TOKEN || 'r158251afeg';
const DEFAULT_LAND_SCAN_LIMIT = Number(process.env.REESTRNET_LAND_SCAN_LIMIT || 60);
const DEFAULT_BUILDING_SCAN_LIMIT = Number(process.env.REESTRNET_OKS_SCAN_LIMIT || 220);
const DEFAULT_SCAN_BATCH_SIZE = Number(process.env.REESTRNET_LAND_SCAN_BATCH || 20);
const DEFAULT_SCAN_CONCURRENCY = Number(process.env.REESTRNET_LAND_SCAN_CONCURRENCY || 10);
const DEFAULT_BUILDING_SCAN_BATCH_SIZE = Number(process.env.REESTRNET_OKS_SCAN_BATCH || 50);
const DEFAULT_BUILDING_SCAN_CONCURRENCY = Number(process.env.REESTRNET_OKS_SCAN_CONCURRENCY || 25);
const DEFAULT_SCAN_TIMEOUT_MS = Number(process.env.REESTRNET_LAND_SCAN_TIMEOUT_MS || 5000);
const DEFAULT_QUERY_TIMEOUT_MS = Number(process.env.REESTRNET_LAND_QUERY_TIMEOUT_MS || 2500);
const DEFAULT_BUILDING_QUERY_TIMEOUT_MS = Number(process.env.REESTRNET_OKS_QUERY_TIMEOUT_MS || 2000);

const ADDRESS_STOP_WORDS = new Set([
  'российская',
  'федерация',
  'санкт',
  'петербург',
  'внутригородское',
  'муниципальное',
  'образование',
  'города',
  'федерального',
  'значения',
  'муниципальный',
  'округ',
  'город',
  'г',
  'дом',
  'д',
  'строение',
  'стр',
  'литера',
  'лит',
  'земельныйучасток',
  'земельный',
  'участок',
  'зу',
]);

function cadastralNumberToSlug(cadastralNumber) {
  return cleanupText(cadastralNumber).replace(/[:/]/g, '-');
}

function extractLabeledFields($) {
  const fields = {};
  const items = $('.test__data')
    .first()
    .children('div')
    .toArray();

  for (const item of items) {
    const clone = $(item).clone();
    clone.find('.main_block__icon, .main_block__tooltip').remove();

    const text = cleanupText(clone.text());
    const delimiterIndex = text.indexOf(':');
    if (delimiterIndex === -1) {
      continue;
    }

    const label = cleanupText(text.slice(0, delimiterIndex));
    const value = cleanupText(text.slice(delimiterIndex + 1));

    if (label && value) {
      fields[label] = value;
    }
  }

  return fields;
}

function isLandPlotType(value) {
  return cleanupText(value).toLowerCase().includes('земельный участок');
}

function isBuildingType(value) {
  const normalized = cleanupText(value).toLowerCase();

  if (!normalized || isLandPlotType(normalized)) {
    return false;
  }

  return normalized.includes('здан') || normalized.includes('строен') || normalized.includes('сооруж');
}

function getNumericCadastralSuffix(cadastralNumber) {
  const suffix = cleanupText(cadastralNumber).split(':').pop();
  if (!/^\d+$/.test(suffix)) {
    return null;
  }

  return Number(suffix);
}

function normalizeAddressForComparison(value) {
  return cleanupText(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/з\/у/gi, ' земельныйучасток ')
    .replace(/(^|\s)д\.\s*/giu, '$1дом ')
    .replace(/(^|\s)ул\.\s*/giu, '$1улица ')
    .replace(/\bпр-кт\b/gi, ' проспект ')
    .replace(/\bк\./gi, ' корпус ')
    .replace(/муниципальный\s+округ\s*№?\s*\d+/giu, ' ')
    .replace(/\bокруг\s*№?\s*\d+\b/giu, ' ')
    .replace(/\b\d{6}\b/gu, ' ')
    .replace(/пр-кт/gi, ' проспект ')
    .replace(/[.,]/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/[^\p{L}\p{N}\s/-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeAddress(value) {
  return new Set(
    normalizeAddressForComparison(value)
      .split(' ')
      .filter((token) => token.length > 1 && !ADDRESS_STOP_WORDS.has(token))
  );
}

function extractHouseToken(value) {
  const normalized = normalizeAddressForComparison(value);
  const explicitMatch = normalized.match(/(?:дом|д|земельныйучасток)\s*([0-9]+[0-9a-zа-я/-]*)/u);
  if (explicitMatch) {
    return explicitMatch[1];
  }

  const fallbackMatches = [...normalized.matchAll(/\b([0-9]+[0-9a-zа-я/-]*)\b/gu)]
    .map((match) => match[1])
    .filter(Boolean);

  return fallbackMatches.length ? fallbackMatches[fallbackMatches.length - 1] : null;
}

function extractHouseCore(token) {
  const match = cleanupText(token).match(/^(\d+)/);
  return match ? match[1] : null;
}

function extractBuildingPartToken(value) {
  const normalized = normalizeAddressForComparison(value);

  const explicitBuildingPart = normalized.match(/корпус\s*([0-9]+[0-9a-zа-я/-]*)/u);
  if (explicitBuildingPart) {
    return explicitBuildingPart[1];
  }

  const bracketBuildingPart = normalized.match(/дом\s*[0-9]+[0-9a-zа-я/-]*\s*\(\s*([0-9]+)\s*\)/u);
  if (bracketBuildingPart) {
    return bracketBuildingPart[1];
  }

  const compactBuildingPart = normalized.match(/\b[0-9]+к([0-9]+[0-9a-zа-я/-]*)\b/u);
  if (compactBuildingPart) {
    return compactBuildingPart[1];
  }

  return null;
}

function getMatchAddress(match) {
  return (
    match?.data?.raw_fields?.['Адрес полный'] ||
    match?.data?.address_document ||
    match?.data?.address ||
    match?.data?.address_display ||
    null
  );
}

function scoreRelatedLandPlotCandidate(targetMatch, candidateMatch) {
  if (!isLandPlotType(candidateMatch?.data?.object_type)) {
    return null;
  }

  const targetAddress = getMatchAddress(targetMatch);
  const candidateAddress = getMatchAddress(candidateMatch);
  const targetHouseCore = extractHouseCore(extractHouseToken(targetAddress));
  const candidateHouseCore = extractHouseCore(extractHouseToken(candidateAddress));
  const targetBuildingPart = cleanupText(extractBuildingPartToken(targetAddress)).toLowerCase();
  const candidateBuildingPart = cleanupText(extractBuildingPartToken(candidateAddress)).toLowerCase();

  if (!targetHouseCore || !candidateHouseCore || targetHouseCore !== candidateHouseCore) {
    return null;
  }

  const targetTokens = tokenizeAddress(targetAddress);
  const candidateTokens = tokenizeAddress(candidateAddress);
  const overlap = [...targetTokens].filter((token) => candidateTokens.has(token));
  const status = cleanupText(candidateMatch?.data?.status).toLowerCase();
  const rawFields = candidateMatch?.data?.raw_fields || {};
  const fullAddress = cleanupText(rawFields['Адрес полный']).toLowerCase();
  const documentAddress = cleanupText(candidateMatch?.data?.address_document || candidateMatch?.data?.address).toLowerCase();
  const candidateArea = Number(candidateMatch?.data?.area?.value || 0);

  let score = 40;

  if (targetTokens.size && candidateTokens.size) {
    score += Math.round((overlap.length / Math.max(targetTokens.size, candidateTokens.size)) * 20);
  }

  if (fullAddress.includes('з/у') || fullAddress.includes('земельный')) {
    score += 8;
  }

  if (targetBuildingPart && candidateBuildingPart) {
    if (targetBuildingPart === candidateBuildingPart) {
      score += 22;
    } else {
      score -= 28;
    }
  } else if (targetBuildingPart && !candidateBuildingPart) {
    score -= 16;
  }

  if (rawFields['Разрешенное использование'] || rawFields['Категория земель']) {
    score += 24;
  }

  if (candidateArea >= 5000) {
    score += 12;
  } else if (candidateArea >= 1000) {
    score += 4;
  }

  if (documentAddress.includes('литера') || documentAddress.includes('строение') || documentAddress.includes('стр.')) {
    score += 6;
  }

  if (status.includes('снят')) {
    score -= 60;
  } else if (status.includes('архив')) {
    score -= 45;
  } else if (status.includes('учтен')) {
    score += 20;
  } else if (status) {
    score += 10;
  }

  return {
    score,
    overlap,
    status,
  };
}

function isLikelySameBaseAddress(targetAddress, candidateAddress) {
  const targetHouseCore = extractHouseCore(extractHouseToken(targetAddress));
  const candidateHouseCore = extractHouseCore(extractHouseToken(candidateAddress));
  if (!targetHouseCore || !candidateHouseCore || targetHouseCore !== candidateHouseCore) {
    return false;
  }

  const targetTokens = tokenizeAddress(targetAddress);
  const candidateTokens = tokenizeAddress(candidateAddress);
  const overlap = [...targetTokens].filter((token) => candidateTokens.has(token));
  return overlap.length > 0;
}

function chooseBestRelatedLandPlotCandidate(targetMatch, candidateMatches = []) {
  const majorCandidates = candidateMatches.filter((candidateMatch) => {
    const areaValue = Number(candidateMatch?.data?.area?.value || 0);
    return Boolean(candidateMatch?.data?.permitted_use || candidateMatch?.data?.land_category || areaValue >= 5000);
  });

  const pool = majorCandidates.length ? majorCandidates : candidateMatches;
  const scoredCandidates = pool
    .map((candidateMatch) => {
      const ranked = scoreRelatedLandPlotCandidate(targetMatch, candidateMatch);
      if (!ranked) {
        return null;
      }

      return {
        match: candidateMatch,
        ...ranked,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  if (!scoredCandidates.length) {
    return null;
  }

  const [best, second] = scoredCandidates;
  const isConfident =
    best.score >= 55 &&
    (!second || best.score - second.score >= 12 || cleanupText(second.status).includes('снят'));

  if (!isConfident) {
    return null;
  }

  return {
    cadastralNumber: best.match.cadastral_number,
    score: best.score,
    overlap: best.overlap,
    alternatives: scoredCandidates.slice(1, 5).map((item) => ({
      cadastral_number: item.match.cadastral_number,
      score: item.score,
      status: item.match.data.status,
    })),
  };
}

async function searchReestrnetByCadastralNumber(cadastralNumber, options = {}) {
  const baseUrl = options.baseUrl || REESTRNET_BASE_URL;
  const timeoutMs = options.queryTimeoutMs || DEFAULT_QUERY_TIMEOUT_MS;
  const url = new URL('/ajax/get_egrn_by_b.json', baseUrl);
  const body = new URLSearchParams({
    b: Buffer.from(cleanupText(cadastralNumber), 'utf8').toString('base64'),
    p: '1',
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/javascript, */*; q=0.01',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-reestr-token': REESTRNET_TOKEN,
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Reestrnet search request failed: ${response.status} ${response.statusText}`);
  }

  return text ? JSON.parse(text) : {};
}

async function scanLandPlotBatch(quarter, targetAddress, start, end, options = {}) {
  const concurrency = options.concurrency || DEFAULT_SCAN_CONCURRENCY;
  const candidates = [];

  for (let suffix = start; suffix <= end; suffix += 1) {
    candidates.push(`${quarter}:${suffix}`);
  }

  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < candidates.length) {
      const index = cursor;
      cursor += 1;
      const cadastralNumber = candidates[index];

      try {
        const payload = await searchReestrnetByCadastralNumber(cadastralNumber, options);
        const matchedAddress = cleanupText(payload?.egrn?.[cadastralNumber]);
        if (matchedAddress && isLikelySameBaseAddress(targetAddress, matchedAddress)) {
          results.push({
            cadastral_number: cadastralNumber,
            address: matchedAddress,
          });
        }
      } catch {
        // ignore inaccessible candidates in best-effort scan
      }
    }
  }

  const workerCount = Math.min(concurrency, candidates.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function scanBuildingBatch(quarter, targetAddress, start, end, options = {}) {
  const candidates = await scanLandPlotBatch(quarter, targetAddress, start, end, options);

  return candidates.filter((candidate) => {
    const cad = cleanupText(candidate.cadastral_number);
    return cad && !cad.endsWith(':0');
  });
}

export function parseReestrnetHtml(html, { cadastralNumber, sourceUrl } = {}) {
  const $ = cheerio.load(html);
  const fields = extractLabeledFields($);

  if (!Object.keys(fields).length) {
    return null;
  }

  const sourceUpdatedAt = cleanupText($('.test__rightblock_update').first().text())
    .replace(/^Дата выгрузки\s*/i, '')
    .replace(/\s*Обновить$/i, '');

  const area = parseAreaText(fields['Площадь']);
  const cadastralCost = parseMoneyText(fields['Кадастровая стоимость']);
  const specificCost = calculateSpecificCost(cadastralCost, area);
  const resolvedCadastralNumber = fields['Кадастровый номер'] || cadastralNumber;

  const data = {
    cadastral_number: resolvedCadastralNumber,
    cadastral_quarter: deriveCadastralQuarter(resolvedCadastralNumber),
    object_type: capitalizeFirst(fields['Тип']),
    status: capitalizeFirst(fields['Статус']),
    address: fields['Адрес по документам'] || fields['Адрес полный'] || null,
    address_display: fields['Адрес полный'] || null,
    address_document: fields['Адрес по документам'] || null,
    region: fields['Регион'] || null,
    cadastral_district: fields['Кадастровый район'] || null,
    area,
    area_text: fields['Площадь'] || null,
    ownership_form: capitalizeFirst(fields['Форма собственности']),
    cadastral_cost: cadastralCost,
    cadastral_cost_text: fields['Кадастровая стоимость'] || null,
    specific_cadastral_cost: specificCost,
    date_assigned: fields['Дата постановки на учёт'] || null,
    permitted_use: fields['Разрешенное использование'] || fields['По документу числится'] || null,
    land_category: fields['Категория земель'] || null,
    source_updated_at: sourceUpdatedAt || null,
    floor: fields['Этаж'] || null,
    raw_fields: fields,
  };

  return {
    id: null,
    cadastral_number: resolvedCadastralNumber,
    label: resolvedCadastralNumber,
    area_type: null,
    area_type_name: 'HTML-карточка объекта',
    center: null,
    source_provider: 'reestrnet',
    source_url: sourceUrl || null,
    source_note: 'Данные получены из HTML-карточки reestrnet; часть полей может быть устаревшей.',
    data,
    geometry: null,
    geojson: null,
    raw: {
      html_fields: fields,
    },
  };
}

export async function fetchReestrnetObject(cadastralNumber, options = {}) {
  const baseUrl = options.baseUrl || REESTRNET_BASE_URL;
  const timeoutMs = options.timeoutMs || 30000;
  const slug = cadastralNumberToSlug(cadastralNumber);
  const url = new URL(`/kadastr/${slug}`, baseUrl);

  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const html = await response.text();
  if (!response.ok) {
    throw new Error(`Reestrnet request failed: ${response.status} ${response.statusText}`);
  }

  const parsed = parseReestrnetHtml(html, {
    cadastralNumber,
    sourceUrl: url.toString(),
  });

  if (!parsed) {
    throw new Error('No object card found in Reestrnet HTML');
  }

  return parsed;
}

export async function findRelatedLandPlotByReestrnet(targetMatch, options = {}) {
  const targetQuarter = cleanupText(targetMatch?.data?.cadastral_quarter || deriveCadastralQuarter(targetMatch?.cadastral_number));
  const targetCadastralNumber = cleanupText(targetMatch?.cadastral_number);
  const targetAddress = getMatchAddress(targetMatch);
  const targetSuffix = getNumericCadastralSuffix(targetCadastralNumber);
  const scanLimit = Number(options.scanLimit || DEFAULT_LAND_SCAN_LIMIT);
  const batchSize = Number(options.batchSize || DEFAULT_SCAN_BATCH_SIZE);

  if (!targetQuarter || !targetAddress || isLandPlotType(targetMatch?.data?.object_type)) {
    return null;
  }

  const upperBound = targetSuffix && targetSuffix > 1 ? Math.min(targetSuffix - 1, scanLimit) : scanLimit;
  if (!upperBound || upperBound < 1) {
    return null;
  }

  const collected = [];
  const seen = new Set();

  for (let batchStart = 1; batchStart <= upperBound; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize - 1, upperBound);
    const batchCandidates = await scanLandPlotBatch(targetQuarter, targetAddress, batchStart, batchEnd, options);

    for (const candidate of batchCandidates) {
      if (seen.has(candidate.cadastral_number)) {
        continue;
      }

      try {
        const match = await fetchReestrnetObject(candidate.cadastral_number, {
          timeoutMs: options.scanTimeoutMs || DEFAULT_SCAN_TIMEOUT_MS,
        });

        if (isLandPlotType(match?.data?.object_type)) {
          seen.add(candidate.cadastral_number);
          collected.push(match);
        }
      } catch {
        // ignore HTML cards that cannot be opened for a candidate
      }
    }

    const chosen = chooseBestRelatedLandPlotCandidate(targetMatch, collected);
    if (chosen) {
      return {
        source_provider: 'reestrnet-quarter-scan',
        cadastral_number: chosen.cadastralNumber,
        score: chosen.score,
        scanned_until: batchEnd,
        scanned_count: collected.length,
        alternatives: chosen.alternatives,
      };
    }
  }

  return null;
}

export async function findBuildingsOnLandPlotByReestrnet(targetLandMatch, options = {}) {
  const targetQuarter = cleanupText(
    targetLandMatch?.data?.cadastral_quarter || deriveCadastralQuarter(targetLandMatch?.cadastral_number)
  );
  const targetCadastralNumber = cleanupText(targetLandMatch?.cadastral_number);
  const targetAddress = getMatchAddress(targetLandMatch);
  const scanLimit = Number(options.scanLimit || DEFAULT_BUILDING_SCAN_LIMIT);
  const batchSize = Number(options.batchSize || DEFAULT_BUILDING_SCAN_BATCH_SIZE);

  if (!targetQuarter || !targetAddress || !isLandPlotType(targetLandMatch?.data?.object_type)) {
    return null;
  }

  const collected = [];
  const seen = new Set();

  for (let batchStart = 1; batchStart <= scanLimit; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize - 1, scanLimit);
    const batchCandidates = await scanBuildingBatch(targetQuarter, targetAddress, batchStart, batchEnd, {
      ...options,
      queryTimeoutMs: options.queryTimeoutMs || DEFAULT_BUILDING_QUERY_TIMEOUT_MS,
      concurrency: options.concurrency || DEFAULT_BUILDING_SCAN_CONCURRENCY,
    });

    for (const candidate of batchCandidates) {
      const candidateCad = cleanupText(candidate.cadastral_number);

      if (!candidateCad || candidateCad === targetCadastralNumber || seen.has(candidateCad)) {
        continue;
      }

      try {
        const match = await fetchReestrnetObject(candidateCad, {
          timeoutMs: options.scanTimeoutMs || DEFAULT_SCAN_TIMEOUT_MS,
        });

        if (!isBuildingType(match?.data?.object_type)) {
          seen.add(candidateCad);
          continue;
        }

        const status = cleanupText(match?.data?.status).toLowerCase();
        if (status.includes('архив') || status.includes('снят')) {
          seen.add(candidateCad);
          continue;
        }

        const areaValue = Number(match?.data?.area?.value || 0);
        if (!Number.isFinite(areaValue) || areaValue <= 0) {
          seen.add(candidateCad);
          continue;
        }

        seen.add(candidateCad);
        collected.push({
          cadastral_number: candidateCad,
          object_type: match?.data?.object_type || null,
          address: getMatchAddress(match),
          total_area: areaValue,
          status: match?.data?.status || null,
          source_url: match?.source_url || null,
        });
      } catch {
        // ignore candidates that cannot be fully resolved during best-effort scan
      }
    }
  }

  if (!collected.length) {
    return null;
  }

  const uniqueBuildings = collected
    .sort((left, right) => left.cadastral_number.localeCompare(right.cadastral_number))
    .filter((item, index, items) => index === items.findIndex((candidate) => candidate.cadastral_number === item.cadastral_number));

  const totalArea = uniqueBuildings.reduce((sum, item) => sum + Number(item.total_area || 0), 0);

  return {
    source_provider: 'reestrnet-quarter-building-scan',
    scan_limit: scanLimit,
    building_count: uniqueBuildings.length,
    total_oks_area_on_land: Number(totalArea.toFixed(2)),
    buildings: uniqueBuildings,
  };
}
