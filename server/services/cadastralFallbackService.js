import { geocodeByAddress } from '../controllers/geoController.js';
import {
  fetchReestrnetObject,
  findBuildingsOnLandPlotByReestrnet,
  findRelatedLandPlotByReestrnet,
} from './cadastralFallback/reestrnetProvider.js';
import { cleanupText } from './cadastralFallback/valueUtils.js';
import { normalizeDistrictLabel } from '../utils/locationNormalization.js';

function toNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasCoordinates(lat, lng) {
  return (
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    Number(lat) >= -90 &&
    Number(lat) <= 90 &&
    Number(lng) >= -180 &&
    Number(lng) <= 180
  );
}

function isLandPlotType(value) {
  return cleanupText(value).toLowerCase().includes('земельный участок');
}

function pickBestAddress(...values) {
  const candidates = values
    .map((value) => cleanupText(value))
    .filter(Boolean);

  if (!candidates.length) {
    return null;
  }

  const scored = candidates
    .map((value) => {
      let score = value.length;
      if (/\d/u.test(value)) score += 25;
      if (/(улиц|просп|пр-кт|шоссе|наб|переул|площад|проезд)/iu.test(value)) score += 40;
      if (/(дом|д\.|строение|стр\.|литер|корпус|к\.)/iu.test(value)) score += 20;
      if (/российская федерация/iu.test(value)) score += 10;

      return { value, score };
    })
    .sort((left, right) => right.score - left.score);

  return scored[0].value;
}

export async function fetchCadastralFallbackData(cadastralNumber) {
  const enableRelatedBuildingsScan = process.env.REESTRNET_OKS_SCAN_ENABLED === 'true';
  const match = await fetchReestrnetObject(cadastralNumber);
  const objectData = match?.data || {};
  const areaValue = toNumberOrNull(objectData?.area?.value);

  let latitude = toNumberOrNull(match?.center?.lat);
  let longitude = toNumberOrNull(match?.center?.lon);
  let geocodedLocation = null;

  const address = pickBestAddress(objectData.address_document, objectData.address, objectData.address_display);
  if (address) {
    try {
      geocodedLocation = await geocodeByAddress(address);
      const geocodedLat = toNumberOrNull(geocodedLocation?.lat);
      const geocodedLng = toNumberOrNull(geocodedLocation?.lng);

      if (hasCoordinates(geocodedLat, geocodedLng)) {
        latitude = geocodedLat;
        longitude = geocodedLng;
      }
    } catch {
      geocodedLocation = null;
    }
  }

  let relatedLandPlot = null;
  let relatedBuildings = null;
  if (!isLandPlotType(objectData.object_type)) {
    try {
      relatedLandPlot = await findRelatedLandPlotByReestrnet(match);
    } catch {
      relatedLandPlot = null;
    }
  } else if (enableRelatedBuildingsScan) {
    try {
      relatedBuildings = await findBuildingsOnLandPlotByReestrnet(match);
    } catch {
      relatedBuildings = null;
    }
  }

  const landPlotCadastralNumber =
    cleanupText(objectData.land_plot_cadastral_number) ||
    cleanupText(relatedLandPlot?.cadastral_number) ||
    null;

  return {
    cadastral_number: cleanupText(objectData.cadastral_number || cadastralNumber) || cadastralNumber,
    cadastral_quarter: cleanupText(objectData.cadastral_quarter) || null,
    object_type: cleanupText(objectData.object_type) || null,
    total_area: isLandPlotType(objectData.object_type) ? null : areaValue,
    land_area: isLandPlotType(objectData.object_type) ? areaValue : null,
    cad_cost: toNumberOrNull(objectData?.cadastral_cost?.value),
    specific_cadastral_cost: toNumberOrNull(objectData?.specific_cadastral_cost?.value),
    permitted_use: cleanupText(objectData.permitted_use) || null,
    address,
    address_display: cleanupText(objectData.address_display) || null,
    address_document: cleanupText(objectData.address_document) || null,
    district: normalizeDistrictLabel(objectData.cadastral_district),
    latitude: hasCoordinates(latitude, longitude) ? latitude : null,
    longitude: hasCoordinates(latitude, longitude) ? longitude : null,
    ownership_form: cleanupText(objectData.ownership_form) || null,
    land_plot_cadastral_number: landPlotCadastralNumber,
    floor_count: cleanupText(objectData.floor || objectData.floor_count_total) || null,
    total_oks_area_on_land: toNumberOrNull(relatedBuildings?.total_oks_area_on_land),
    source_provider: cleanupText(match?.source_provider) || 'reestrnet',
    source_url: cleanupText(match?.source_url) || null,
    source_note: cleanupText(match?.source_note) || null,
    source_updated_at: cleanupText(objectData.source_updated_at) || null,
    raw_payload_json: {
      match,
      related_land_plot: relatedLandPlot || null,
      related_buildings: relatedBuildings || null,
      geocoding: geocodedLocation || null,
    },
  };
}
