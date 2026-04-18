import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Divider,
  Empty,
  Typography,
  message,
  Collapse,
  Table,
  Space,
  Row,
  Col,
  Tag,
  Statistic,
  Tooltip,
} from 'antd';
import html2canvas from 'html2canvas';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  DollarOutlined,
  CalculatorOutlined,
  LineChartOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  FilePdfOutlined,
  InfoCircleOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import api from '../../components/projects/api';
import { useAuth } from '../../context/AuthContext';
import { exportDetailedResultToPDF } from '../../utils/pdfExport';
import { exportZemaReportToPDF } from './ZemaReportPDF';
import { getFieldTooltip } from '../../utils/fieldTranslations';
import {
  formatQuestionnaireFieldSourceLabel,
  getQuestionnaireSourceBuckets,
  hasMeaningfulValue,
} from '../../utils/projectQuestionnaire';
import {
  buildLeafletBoundsFromAddressGeometry,
  hasRenderableAddressGeometry,
  ObjectLocationHighlight,
  useAddressGeometry,
} from './ObjectLocationHighlight';
import './ProjectResultDetailedPanel.css';

const { Title, Text, Paragraph } = Typography;

const RESULT_TEXT_REPLACEMENTS = [
  [/reliability score/giu, 'индекс надёжности'],
  [/scoring relevance/giu, 'оценки релевантности'],
  [/advanced experimental/giu, 'экспериментальный режим'],
  [/excel-compatible/giu, 'совместимый с Excel'],
  [/trimmed mean/giu, 'усечённое среднее'],
  [/stable default/giu, 'стабильный режим'],
  [/fallback-профиля/giu, 'резервного профиля'],
  [/fallback-профиль/giu, 'резервный профиль'],
  [/fallback-логике/giu, 'резервной логике'],
  [/fallback-логика/giu, 'резервная логика'],
  [/\bVacancy\b/gu, 'Незаполняемость'],
  [/\bvacancy\b/gu, 'незаполняемость'],
  [/\bCap rate\b/giu, 'ставка капитализации'],
  [/\barea ratio\b/giu, 'соотношение площадей'],
  [/\bScale mismatch\b/giu, 'масштабное расхождение'],
  [/\bstd dev\b/giu, 'стандартное отклонение'],
  [/\bIQR\b/gu, 'межквартильный размах'],
  [/\bPGI\b/gu, 'ПВД'],
  [/\bEGI\b/gu, 'ДВД'],
  [/\bNOI\b/gu, 'ЧОД'],
  [/\bOPEX\b/gu, 'операционные расходы'],
  [/\bN\/A\b/gu, '—'],
  [/\bmanual_override\b/gu, 'ручной ввод'],
  [/\bmarket_analogs\b/gu, 'рыночные аналоги'],
  [/\brule_based_profile\b/gu, 'параметрический профиль'],
  [/\bstable_trimmed_mean\b/gu, 'усечённое среднее'],
  [/\badvanced_weighted_median\b/gu, 'взвешенная медиана'],
  [/\bexcel_simple_median\b/gu, 'медиана, совместимая с Excel'],
  [/\bexcel_simple_average\b/gu, 'среднее, совместимое с Excel'],
  [/\bsmall_sample_median\b/gu, 'медиана по малой выборке'],
  [/\bsingle_analogue\b/gu, 'один аналог'],
  [/\bweighted_average\b/gu, 'взвешенное среднее'],
  [/\badvanced_experimental\b/gu, 'экспериментальный режим'],
  [/\bexcel_compatible\b/gu, 'совместимый с Excel'],
  [/\bBase\b/gu, 'базовая ставка'],
  [/\boverride\b/giu, 'переопределение'],
  [/\bquestionnaire\b/gu, 'анкета'],
  [/\bderived\b/gu, 'расчётное значение'],
  [/\bfactual\b/gu, 'фактические данные'],
  [/\bfixed\b/gu, 'фиксированное значение'],
  [/\bstable_default\b/gu, 'стабильный режим'],
  [/\bRelevance\b/gu, 'Релевантность'],
  [/\bPenalty\b/gu, 'Штраф'],
];

function localizeResultText(value) {
  if (value === null || value === undefined || value === '') {
    return value;
  }

  let text = String(value);
  for (const [pattern, replacement] of RESULT_TEXT_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function humanizeResultKey(key) {
  switch (String(key || '')) {
    case 'first':
      return '1-й этаж';
    case 'second':
      return '2-й этаж';
    case 'thirdPlus':
      return '3-й этаж и выше';
    case 'analogCountScore':
      return 'Количество аналогов';
    case 'analogueCompletenessScore':
      return 'Полнота аналогов';
    case 'analogueDispersionScore':
      return 'Однородность аналогов';
    case 'subjectDataQualityScore':
      return 'Качество данных объекта';
    case 'scaleMismatchScore':
      return 'Сопоставимость по масштабу';
    case 'landDataScore':
      return 'Полнота данных по земле';
    case 'vacancySourceScore':
      return 'Источник незаполняемости';
    case 'rentalSourceScore':
      return 'Источник ставки аренды';
    case 'rentModeScore':
      return 'Режим расчёта ставки';
    case 'stabilityScore':
      return 'Стабильность выборки';
    case 'instabilityPenalty':
      return 'Штраф за нестабильность';
    case 'assumptionsPenalty':
      return 'Штраф за допущения';
    default:
      return localizeResultText(key);
  }
}

function formatNumber(value, digits = 2) {
  const number = Number(value || 0);
  return number.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatCurrency(value, digits = 2) {
  return `${formatNumber(value, digits)} ₽`;
}

function formatSqm(value, digits = 2) {
  return `${formatNumber(value, digits)} м²`;
}

function formatPercent(value, digits = 2) {
  return `${formatNumber(value, digits)}%`;
}

function formatDate(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('ru-RU');
}

function formatYesNo(value) {
  if (value === 'yes' || value === true) return 'Да';
  if (value === 'no' || value === false) return 'Нет';
  return '—';
}

function formatValue(value, suffix = '') {
  if (!hasMeaningfulValue(value)) return '—';
  if (typeof value === 'number') {
    return suffix ? `${formatNumber(value, 2)} ${suffix}` : formatNumber(value, 2);
  }
  const localizedValue = localizeResultText(String(value));
  return suffix ? `${localizedValue} ${suffix}` : localizedValue;
}

function formatQuestionnaireEntryValue(entry) {
  switch (entry?.type) {
    case 'date':
      return formatDate(entry.value);
    case 'area':
      return formatValue(entry.value, 'м²');
    case 'distance':
      return formatValue(entry.value, 'м');
    case 'currency':
      return formatValue(entry.value, '₽');
    case 'yesno':
      return formatYesNo(entry.value);
    case 'textarea':
      return renderMultilineText(entry.value);
    default:
      return formatValue(entry.value);
  }
}

function renderMultilineText(value) {
  return String(value || '')
    .split('\n')
    .map((line, index) => <div key={index}>{line}</div>);
}

function renderLocalizedMultilineText(value) {
  return String(value || '')
    .split('\n')
    .map((line, index) => <div key={index}>{localizeResultText(line)}</div>);
}

function renderStepResult(step) {
  if (step?.result && typeof step.result === 'object' && !Array.isArray(step.result)) {
    return (
      <Space direction="vertical" size="small">
        {Object.entries(step.result).map(([key, value]) => (
          <Tag key={key} color="blue">
            {humanizeResultKey(key)}: {formatNumber(value, 3)} {localizeResultText(step.unit)}
          </Tag>
        ))}
      </Space>
    );
  }

  return (
    <Tag color="blue">
      Результат: {formatNumber(step?.result || 0, 3)} {localizeResultText(step?.unit)}
    </Tag>
  );
}

function formatStepSummary(step) {
  if (step?.result && typeof step.result === 'object' && !Array.isArray(step.result)) {
    const items = Object.entries(step.result);
    if (!items.length) return 'См. детали';
    return items
      .map(([key, value]) => `${humanizeResultKey(key)}: ${formatNumber(value, 2)} ${localizeResultText(step.unit)}`)
      .join(' • ');
  }

  if (step?.result !== undefined && step?.result !== null) {
    return `${formatNumber(step.result, 2)} ${localizeResultText(step.unit || '')}`.trim();
  }

  return 'См. детали';
}

function IncomeMetricCard({ title, value, note, toneClass }) {
  return (
    <Card size="small" className={`project-result-metric-card ${toneClass || ''}`}>
      <div className="project-result-metric-head">{title}</div>
      <div className="project-result-metric-value">{value}</div>
      <div className="project-result-metric-note">{note}</div>
    </Card>
  );
}

function MethodologyBlock({ title, summary, facts = [] }) {
  return (
    <Card size="small" className="project-result-method-card">
      <div className="project-result-method-title">{localizeResultText(title)}</div>
      <Paragraph className="project-result-method-summary">
        {localizeResultText(summary)}
      </Paragraph>
      {facts.length > 0 && (
        <div className="project-result-method-facts">
          {facts.map((fact, index) => (
            <Tag key={`${title}_${index}`} className="project-result-method-fact">
              {localizeResultText(fact)}
            </Tag>
          ))}
        </div>
      )}
    </Card>
  );
}

function hasValidMapCoords(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function ResultMapBounds({ points, highlightBounds }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length && !highlightBounds) return undefined;

    const frame = requestAnimationFrame(() => {
      map.invalidateSize();

      if (highlightBounds) {
        const nextBounds = highlightBounds.pad(0.18);
        points.forEach((point) => {
          nextBounds.extend(L.latLng(point.lat, point.lng));
        });
        map.fitBounds(nextBounds, { padding: [36, 36], animate: false });
        return;
      }

      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], 14, { animate: false });
        return;
      }

      const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng]));
      map.fitBounds(bounds, { padding: [36, 36], animate: false });
    });

    return () => cancelAnimationFrame(frame);
  }, [highlightBounds, map, points]);

  return null;
}

function ProjectComparablesMap({ objectPoint, comparables, captureRef = null }) {
  const { data: addressGeometry } = useAddressGeometry(objectPoint?.address);
  const highlightBounds = useMemo(
    () => buildLeafletBoundsFromAddressGeometry(addressGeometry),
    [addressGeometry]
  );
  const hasObjectGeometry = hasRenderableAddressGeometry(addressGeometry);
  const fallbackCenter = objectPoint
    ? [objectPoint.lat, objectPoint.lng]
    : Number.isFinite(Number(addressGeometry?.lat)) && Number.isFinite(Number(addressGeometry?.lng))
      ? [Number(addressGeometry.lat), Number(addressGeometry.lng)]
    : comparables.length
      ? [comparables[0].lat, comparables[0].lng]
      : [59.9386, 30.3141];

  const boundsPoints = [
    ...(objectPoint ? [objectPoint] : []),
    ...comparables,
  ];

  return (
    <div
      ref={captureRef}
      className="project-result-map-shell"
      data-html2canvas-ignore="true"
    >
      <MapContainer
        key={[
          objectPoint ? `${objectPoint.lat}_${objectPoint.lng}` : 'no-object',
          ...comparables.map((item) => item.id || item.external_id || `${item.lat}_${item.lng}`),
        ].join('|')}
        center={fallbackCenter}
        zoom={12}
        scrollWheelZoom={false}
        zoomAnimation={false}
        fadeAnimation={false}
        markerZoomAnimation={false}
        className="project-result-map"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          crossOrigin="anonymous"
        />
        <ResultMapBounds points={boundsPoints} highlightBounds={highlightBounds} />
        <ObjectLocationHighlight
          geometry={addressGeometry}
          color="#c026d3"
          fillColor="#d946ef"
        />

        {objectPoint && !hasObjectGeometry && (
          <CircleMarker
            center={[objectPoint.lat, objectPoint.lng]}
            radius={7}
            pathOptions={{
              color: '#ffffff',
              weight: 3,
              fillColor: '#c026d3',
              fillOpacity: 0.96,
            }}
          >
            <Popup>
              <div>
                <strong>Оцениваемый объект</strong>
                <div>{objectPoint.address || 'Адрес не указан'}</div>
                <div>{objectPoint.cadastralNumber || '—'}</div>
              </div>
            </Popup>
          </CircleMarker>
        )}

        {comparables.map((item) => {
          const included = item.included_in_rent_calculation !== false;

          return (
            <CircleMarker
              key={item.id || item.external_id || `${item.lat}_${item.lng}`}
              center={[item.lat, item.lng]}
              radius={8}
              pathOptions={{
                color: '#ffffff',
                weight: 2,
                fillColor: included ? '#52c41a' : '#8c8c8c',
                fillOpacity: included ? 0.9 : 0.75,
              }}
            >
              <Popup>
                <div className="project-result-map-popup">
                  <strong>{item.address_offer || item.id || 'Аналог'}</strong>
                  {/* <div>ID: {item.id || item.external_id || '—'}</div> */}
                  <div>Класс: {item.class_offer || '—'}</div>
                  <div>Ставка: {formatNumber(item.price_per_sqm_cleaned, 2)} ₽/м²</div>
                  <div>Скорр. ставка: {item.adjusted_rate ? `${formatNumber(item.adjusted_rate, 2)} ₽/м²` : '—'}</div>
                  <div>Вес: {item.normalized_weight ? `${formatNumber(Number(item.normalized_weight) * 100, 1)}%` : '—'}</div>
                  <div>Статус: {included ? 'В расчёте' : 'Исключён'}</div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

const OBJECT_TYPE_LABELS = {
  'здание': 'Здание',
  'помещение': 'Помещение',
};

const PROPERTY_TYPE_LABELS = {
  'business_center': 'Бизнес-центр',
  'administrative_building': 'Административное здание',
  'shopping_center': 'Торговый центр',
  'shopping_entertainment_complex': 'Торгово-развлекательный комплекс',
};

const ENV_CATEGORY_LABELS = {
  mixed_urban: 'смешанная городская застройка',
  prime_business: 'деловой центр',
  urban_business: 'городская деловая застройка',
  residential: 'жилая застройка',
  industrial: 'промзона',
};

const translateEnvCategory = (value) => {
  if (!value) return '';
  const key = String(value).trim().toLowerCase();
  return ENV_CATEGORY_LABELS[key] || value;
};

function prepareReportData(projectId, project, breakdown, result) {
  const questionnaire = project?.questionnaire || {};

  const floorRows = (breakdown?.inputs?.floorInputRows || []).map(floor => ({
    floorLocation: floor.floorLocation || floor.name || '—',
    area: floor.area,
    leasableArea: floor.leasableArea,
    avgRoomArea: floor.avgLeasableRoomArea,
  }));

  const rawComparables = breakdown?.market?.topComparables || [];

  const includedRates = rawComparables
    .filter(c => c.included_in_rent_calculation !== false)
    .map(c => c.price_per_sqm_cleaned)
    .filter(v => v != null && v > 0);

  let calculatedAverageRate = breakdown?.market?.averageRate;
  if (includedRates.length > 0) {
    const avgFromIncluded = includedRates.reduce((a, b) => a + b, 0) / includedRates.length;
    if (!calculatedAverageRate || Math.abs(calculatedAverageRate - avgFromIncluded) / avgFromIncluded > 0.2) {
      calculatedAverageRate = avgFromIncluded;
    }
  }

  const marketRateMin = includedRates.length ? Math.min(...includedRates) : 0;
  const marketRateMax = includedRates.length ? Math.max(...includedRates) : 0;

  const comparables = rawComparables.map(comp => {
    const metro = comp.metro || comp.nearestMetro || '—';
    const distance = comp.distance_to_metro ?? comp.distanceToMetro ?? comp.metro_distance ?? null;
    const terZone = comp.ter_zone || comp.territorialZone || '—';
    const env = [
      comp.environment_category_1,
      comp.environment_category_2,
      comp.environment_category_3
    ].filter(Boolean).join(', ') || '—';

    return {
      ...comp,
      buildingName: comp.building_name || comp.complex_name || '—',
      class_offer: comp.class_offer || '—',
      address_offer: comp.address_offer || '—',
      area_total: comp.area_total || 0,
      floor: comp.floor || comp.floor_location || '—',
      price_per_sqm_cleaned: comp.price_per_sqm_cleaned ?? comp.price_per_sqm ?? comp.unit_price ?? 0,
      district: comp.district || '—',
      nearestMetro: metro,
      distanceToMetro: distance,
      isHistoricalCenter: comp.is_historical_center ?? comp.isHistoricalCenter ?? false,
      territorialZone: terZone === null || terZone === 'null' ? '—' : terZone,
      nearbyEnvironment: env,
    };
  });

  const totalArea = questionnaire.totalArea || 0;
  const landArea = questionnaire.landArea || 0;
  const landAreaUsed = breakdown?.inputs?.landArea?.value ?? questionnaire.landAreaUsed ?? 0;
  const landAreaUsedPercent = landArea > 0 ? (landAreaUsed / landArea) * 100 : 0;

  const leasableAreaValue = breakdown?.inputs?.leasableArea?.value ?? questionnaire.leasableArea ?? 0;
  const leasablePercent = totalArea > 0 ? (leasableAreaValue / totalArea) * 100 : 0;

  const estimatedValueWithLand = result?.estimated_value_with_land
    ?? (result?.estimated_value || 0) + (result?.land_share || 0);

  const cadastralValue = project?.cadastralValue
    ?? questionnaire.cadCost
    ?? breakdown?.summary?.cadastralValue
    ?? 0;

  const nearbyEnvRaw = [
    questionnaire.environmentCategory1,
    questionnaire.environmentCategory2,
    questionnaire.environmentCategory3
  ].filter(Boolean).join(', ');
  const nearbyEnvironment = nearbyEnvRaw
    ? nearbyEnvRaw.split(', ').map(translateEnvCategory).join(', ')
    : '—';

  return {
    assessmentDate: questionnaire.valuationDate,
    objectAddress: questionnaire.objectAddress || '—',
    cadastralNumber: questionnaire.buildingCadastralNumber || '—',
    totalArea,
    constructionYear: questionnaire.constructionYear,
    reconstructionYear: questionnaire.reconstructionYear,   
    hasReconstruction: questionnaire.hasReconstruction || false,

    objectType: OBJECT_TYPE_LABELS[questionnaire.objectType] || questionnaire.objectType || '—',
    propertyType: PROPERTY_TYPE_LABELS[questionnaire.actualUse] || questionnaire.actualUse || '—',

    businessClass: questionnaire.businessCenterClass || '—',
    classConfirmedByRGUD: true,

    district: questionnaire.district || '—',
    nearestMetro: questionnaire.nearestMetro || '—',
    distanceToMetro: questionnaire.metroDistance,
    isHistoricalCenter: questionnaire.isHistoricalCenter || false,
    territorialZone: questionnaire.terZone || '—',
    objectLocationDescription: questionnaire.locationDescription || '—',
    nearbyEnvironment,   

    floors: floorRows,
    landCadastralNumber: questionnaire.landCadastralNumber || '—',
    landArea,
    landAreaUsed,
    landAreaUsedPercent,   

    leasableArea: leasableAreaValue,
    leasableAreaPercent: leasablePercent,
    marketAverageRate: calculatedAverageRate || 0,
    marketRateMin,   
    marketRateMax,  

    cadastralValue,

    estimatedValue: result?.estimated_value || 0,
    estimatedValueMin: (result?.estimated_value || 0) * 0.9,
    estimatedValueMax: (result?.estimated_value || 0) * 1.1,
    pricePerM2: result?.price_per_m2 || 0,
    pricePerM2Min: (result?.price_per_m2 || 0) * 0.9,
    pricePerM2Max: (result?.price_per_m2 || 0) * 1.1,
    grossIncome: result?.gross_income || 0,
    egi: result?.egi || 0,
    noi: result?.noi || 0,
    estimatedValueWithLand,

    comparables,

    quarterlyDistribution: breakdown?.analytics?.quarterlyDistribution || [],
    marketDynamics: breakdown?.analytics?.marketDynamics || [],

    photoUrls: project?.photos || [],
    mapImageUrl: null,
    comparablesMapImageUrl: null,
    quarterlyChartUrl: null,
    dynamicsChartUrl: null,
  };
}

function waitForElementImages(element, timeoutMs = 4000) {
  const images = Array.from(element?.querySelectorAll?.('img') || []);
  const pendingImages = images.filter((img) => !img.complete);

  if (!pendingImages.length) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const cleanups = [];

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanups.forEach((cleanup) => cleanup());
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);
    cleanups.push(() => window.clearTimeout(timer));

    let remaining = pendingImages.length;
    pendingImages.forEach((img) => {
      const handleDone = () => {
        remaining -= 1;
        if (remaining <= 0) {
          finish();
        }
      };

      img.addEventListener('load', handleDone, { once: true });
      img.addEventListener('error', handleDone, { once: true });
      cleanups.push(() => {
        img.removeEventListener('load', handleDone);
        img.removeEventListener('error', handleDone);
      });
    });
  });
}

async function captureElementAsPng(element) {
  if (!element) return null;

  const ignoreAttribute = element.getAttribute('data-html2canvas-ignore');

  if (ignoreAttribute !== null) {
    element.removeAttribute('data-html2canvas-ignore');
  }

  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  await waitForElementImages(element);
  await new Promise((resolve) => window.setTimeout(resolve, 250));
  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: Math.max(2, Math.min(window.devicePixelRatio || 1, 3)),
      logging: false,
      useCORS: true,
      allowTaint: false,
      imageTimeout: 15000,
    });

    return canvas.toDataURL('image/png');
  } finally {
    if (ignoreAttribute !== null) {
      element.setAttribute('data-html2canvas-ignore', ignoreAttribute);
    }
  }
}

// ========== ОСНОВНОЙ КОМПОНЕНТ ==========
export default function ProjectResultDetailedPanel({ projectId, project, marketContext, onBack }) {
  const { user, refreshProfile } = useAuth();
  const [result, setResult] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [expandedStepKeys, setExpandedStepKeys] = useState([]);
  const [showExcludedComparables, setShowExcludedComparables] = useState(false);
  const comparablesMapRef = useRef(null);
  const questionnaire = project?.questionnaire || {};

  const loadResult = useCallback(async ({ showError = true, silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setShowExcludedComparables(false);
      const { data } = await api.get(`/projects/${projectId}/result`);
      setResult(data);
      setBreakdown(data?.calculation_breakdown_json || null);
      return data;
    } catch (error) {
      if (showError) message.error(error?.response?.data?.error || 'Не удалось загрузить результат');
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadResult();
  }, [loadResult]);

  useEffect(() => {
    if (user?.debugMode === undefined || result === null) return;
    if (Boolean(user.debugMode) !== Boolean(result?.debugModeEnabled)) {
      loadResult({ showError: false, silent: true });
    }
  }, [loadResult, result, user?.debugMode]);

  useEffect(() => {
    let active = true;
    const syncDebugState = async () => {
      if (!active || document.visibilityState === 'hidden') return;
      try {
        const profile = await refreshProfile();
        if (!active) return;
        const nextDebugMode = Boolean(profile?.debugMode);
        if (nextDebugMode !== Boolean(result?.debugModeEnabled)) {
          await loadResult({ showError: false, silent: true });
        }
      } catch (error) {
        console.error('Не удалось синхронизировать debug mode:', error);
      }
    };
    window.addEventListener('focus', syncDebugState);
    document.addEventListener('visibilitychange', syncDebugState);
    return () => {
      active = false;
      window.removeEventListener('focus', syncDebugState);
      document.removeEventListener('visibilitychange', syncDebugState);
    };
  }, [loadResult, refreshProfile, result?.debugModeEnabled]);

  if (!result && !loading) {
    return <Empty description="Результат пока не рассчитан" />;
  }

  const floorInputRows = breakdown?.inputs?.floorInputRows || [];
  const floorIncomeRows = breakdown?.inputs?.floorIncomeRows || [];
  const sensitivityByNoi = breakdown?.sensitivity?.byNoi || breakdown?.sensitivity?.byGrossIncome || [];
  const sourceFloorRows = Array.isArray(questionnaire?.floors) ? questionnaire.floors : [];
  const calculationStepKeys = (breakdown?.calculationSteps || []).map((step) => String(step.step));
  const questionnaireSourceBuckets = getQuestionnaireSourceBuckets(questionnaire);
  const manualQuestionnaireFields = questionnaireSourceBuckets.manualFields;
  const autoQuestionnaireFields = questionnaireSourceBuckets.autoFields;
  const hasAutoSourceData = autoQuestionnaireFields.length > 0;
  const objectMapPoint = hasValidMapCoords(questionnaire?.mapPointLat, questionnaire?.mapPointLng)
    ? {
      lat: Number(questionnaire.mapPointLat),
      lng: Number(questionnaire.mapPointLng),
      address: questionnaire.objectAddress,
      cadastralNumber: questionnaire.buildingCadastralNumber,
    }
    : null;
  const mapComparableSource = (() => {
    const resultComparables = Array.isArray(breakdown?.market?.topComparables)
      ? breakdown.market.topComparables
      : [];
    const resultHasCoords = resultComparables.some((item) => hasValidMapCoords(item?.latitude, item?.longitude));

    if (resultHasCoords) {
      return resultComparables;
    }

    return Array.isArray(marketContext?.topComparables) && marketContext.topComparables.length
      ? marketContext.topComparables
      : resultComparables;
  })();
  const comparableMapPoints = Array.isArray(mapComparableSource)
    ? mapComparableSource
      .filter((item) => hasValidMapCoords(item?.latitude, item?.longitude))
      .map((item) => ({
        ...item,
        lat: Number(item.latitude),
        lng: Number(item.longitude),
      }))
    : [];
  const comparableWithoutCoordsCount = Math.max(
    (mapComparableSource?.length || 0) - comparableMapPoints.length,
    0
  );
  const debugModeEnabled = Boolean(result?.debugModeEnabled);
  const rentalRateSource = String(breakdown?.inputs?.rentalRate?.source || '').trim().toLowerCase();
  const rentalRateIsManual = rentalRateSource.startsWith('manual');

  const handleExportPdf = async () => {
    const previousExpandedKeys = expandedStepKeys;
    const previousShowExcludedComparables = showExcludedComparables;
    const shouldExpandAll = calculationStepKeys.some((key) => !expandedStepKeys.includes(key));
    const shouldExpandExcludedComparables = (
      !showExcludedComparables &&
      (breakdown?.market?.excludedComparables?.length || 0) > 0
    );

    try {
      setExportingPdf(true);

      if (shouldExpandAll) {
        setExpandedStepKeys(calculationStepKeys);
      }

      if (shouldExpandExcludedComparables) {
        setShowExcludedComparables(true);
      }

      if (shouldExpandAll || shouldExpandExcludedComparables) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      await exportDetailedResultToPDF(projectId, project?.name);
    } catch (error) {
      console.error('Не удалось экспортировать PDF:', error);
      message.error('Не удалось экспортировать PDF');
    } finally {
      if (shouldExpandAll) {
        setExpandedStepKeys(previousExpandedKeys);
      }
      if (shouldExpandExcludedComparables) {
        setShowExcludedComparables(previousShowExcludedComparables);
      }
      setExportingPdf(false);
    }
  };

  const handleExportZemaReport = async () => {
    try {
      setExportingPdf(true);
      const reportData = prepareReportData(projectId, project, breakdown, result);
      const comparablesMapImageUrl = await captureElementAsPng(comparablesMapRef.current)
        .catch((error) => {
          console.error('Не удалось сделать снимок карты аналогов:', error);
          return null;
        });

      if (comparablesMapImageUrl) {
        reportData.comparablesMapImageUrl = comparablesMapImageUrl;
        reportData.mapImageUrl = reportData.mapImageUrl || comparablesMapImageUrl;
      }

      await exportZemaReportToPDF(projectId, reportData);
      message.success('Справка ЗЕМА успешно экспортирована');
    } catch (error) {
      console.error('Ошибка экспорта справки:', error);
      message.error('Не удалось экспортировать справку ЗЕМА');
    } finally {
      setExportingPdf(false);
    }
  };

  useEffect(() => {
    if (calculationStepKeys.length) {
      setExpandedStepKeys(calculationStepKeys);
    }
  }, [breakdown, calculationStepKeys.join('|')]);

  return (
    <Card loading={loading} className="project-result-card project-step-shell">
      <div id="result-content" className="project-result-shell">
        <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div className="project-result-section">
          <Title level={2}>Результат оценки</Title>
          <Card
            className="project-result-hero"
          >
            <Text className="project-result-hero-label" strong>
              Стоимость объекта недвижимости
            </Text>
            <Title level={1} className="project-result-hero-value">
              {formatCurrency(result?.estimated_value || 0, 2)}
            </Title>
            <Text className="project-result-hero-subvalue">
              {formatNumber(result?.price_per_m2 || 0, 2)} ₽/м²
            </Text>
          </Card>
        </div>

        {project?.questionnaire && (
          <>
            <Divider />
            <div>
              <Title level={3}>Исходные данные объекта</Title>
              <Row gutter={16}>
                <Col xs={24} xl={12}>
                  <Card title="Введено в анкете" size="small" className="project-result-section-card">
                    {manualQuestionnaireFields.length > 0 ? (
                      <Descriptions column={1} size="small">
                        {manualQuestionnaireFields.map((field) => (
                          <Descriptions.Item key={field.name} label={field.label}>
                            {formatQuestionnaireEntryValue(field)}
                          </Descriptions.Item>
                        ))}
                      </Descriptions>
                    ) : (
                      <Text type="secondary">
                        Вручную заполненные поля не обнаружены. По текущей анкете данные пришли автоматически.
                      </Text>
                    )}
                  </Card>
                </Col>

                <Col xs={24} xl={12}>
                  <Card title="Данные платформы" size="small" className="project-result-section-card">
                    {hasAutoSourceData ? (
                      <Descriptions column={1} size="small">
                        {autoQuestionnaireFields.map((field) => (
                          <Descriptions.Item key={field.name} label={field.label}>
                            <div>{formatQuestionnaireEntryValue(field)}</div>
                            {/* <Text type="secondary">
                              Источник: {formatQuestionnaireFieldSourceLabel(field.source)}
                            </Text> */}
                          </Descriptions.Item>
                        ))}
                      </Descriptions>
                    ) : (
                      <Text type="secondary">
                        Данные платформы отсутствуют. Для расчёта использовались только заполненные значения анкеты.
                      </Text>
                    )}
                  </Card>
                </Col>
              </Row>

              {sourceFloorRows.length > 0 && (
                <Card title="Введённые данные по этажам" size="small" style={{ marginTop: 16 }} className="project-result-section-card">
                  <Table
                    dataSource={sourceFloorRows}
                    pagination={false}
                    size="small"
                    scroll={{ x: 960 }}
                    rowKey={(record) => record.id}
                    columns={[
                      {
                        title: 'Этаж',
                        dataIndex: 'floorLocation',
                        key: 'floorLocation',
                        render: (_, record) => record.floorLocation || record.name || 'Этаж',
                      },
                      {
                        title: 'Площадь, м²',
                        dataIndex: 'area',
                        key: 'area',
                        render: (value) => formatSqm(value, 2),
                      },
                      {
                        title: 'Арендопригодная площадь, м²',
                        dataIndex: 'leasableArea',
                        key: 'leasableArea',
                        render: (value) => formatSqm(value, 2),
                      },
                      {
                        title: 'Средняя площадь помещения, м²',
                        dataIndex: 'avgLeasableRoomArea',
                        key: 'avgLeasableRoomArea',
                        render: (value) => formatSqm(value, 2),
                      },
                    ]}
                  />
                </Card>
              )}
            </div>
          </>
        )}

        {result && (
          <>
            <Divider />
            <div>
              <Title level={3}>
                <DollarOutlined />
                <Tooltip title="Основные показатели дохода">
                  Поток доходов <InfoCircleOutlined />
                </Tooltip>
              </Title>
              <div className="project-result-metrics-grid">
                <IncomeMetricCard
                  title="ПВД"
                  value={formatCurrency(result?.gross_income || 0, 2)}
                  note="Потенциальный валовой доход"
                  toneClass="is-pgi"
                />
                <IncomeMetricCard
                  title="ЭВД"
                  value={formatCurrency(result?.egi || 0, 2)}
                  note="Эффективный валовой доход"
                  toneClass="is-egi"
                />
                <IncomeMetricCard
                  title="Операционные расходы"
                  value={formatCurrency(result?.opex || 0, 2)}
                  note="Эксплуатационные и управленческие расходы"
                  toneClass="is-opex"
                />
                <IncomeMetricCard
                  title="ЧОД"
                  value={formatCurrency(result?.noi || 0, 2)}
                  note="Чистый операционный доход"
                  toneClass="is-noi"
                />
                <IncomeMetricCard
                  title="Капитализация"
                  value={formatPercent(Number(result?.capitalization_rate || 0) * 100, 2)}
                  note="Ставка"
                  toneClass="is-cap-rate"
                />
                <IncomeMetricCard
                  title="Земля"
                  value={formatCurrency(result?.land_share || 0, 2)}
                  note="Доля земли"
                  toneClass="is-land"
                />
              </div>
            </div>
          </>
        )}

        {breakdown && (
          <>
            {debugModeEnabled && (
              <>
                <Divider />

                <div>
                  <Title level={3}>
                    <CalculatorOutlined />
                    <Tooltip title="Анализ надежности и качества расчета">
                      Качество расчёта <InfoCircleOutlined />
                    </Tooltip>
                  </Title>
                  <Row gutter={16}>
                    <Col xs={24} sm={12}>
                      <Card className="project-result-section-card">
                        <Tooltip title={getFieldTooltip('confidence')}>
                          <div>
                            <Statistic
                              title="Уровень доверия"
                              value={Math.round(breakdown?.summary?.confidence || 50)}
                              suffix="%"
                              prefix={
                                (breakdown?.summary?.confidence || 0) >= 70 ? (
                                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                                ) : (
                                  <WarningOutlined style={{ color: '#faad14' }} />
                                )
                              }
                            />
                            {breakdown?.summary?.confidenceNote && (
                              <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                                {localizeResultText(breakdown.summary.confidenceNote)}
                              </Paragraph>
                            )}
                          </div>
                        </Tooltip>
                      </Card>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Card className="project-result-section-card">
                        <Tooltip title={getFieldTooltip('comparableCount')}>
                          <Statistic
                            title="Использовано аналогов"
                            value={breakdown?.market?.comparableCount || 0}
                            suffix="объектов"
                          />
                        </Tooltip>
                      </Card>
                    </Col>
                  </Row>

                  {breakdown?.summary?.confidenceComponents && (
                    <Card style={{ marginTop: 16 }} className="project-result-section-card">
                      <Title level={4}>Из чего сложился индекс надёжности</Title>
                      <Row gutter={16}>
                        {Object.entries(breakdown.summary.confidenceComponents).map(([key, value]) => (
                          <Col xs={24} sm={12} md={8} key={key}>
                            <Statistic
                              title={humanizeResultKey(key)}
                              value={Number(value || 0)}
                            />
                          </Col>
                        ))}
                      </Row>
                    </Card>
                  )}

                  {breakdown?.dataQuality?.fieldSources?.length > 0 && (
                    <Card style={{ marginTop: 16 }} className="project-result-section-card">
                      <Title level={4}>Источники ключевых входных данных</Title>
                      <Table
                        dataSource={breakdown.dataQuality.fieldSources}
                        pagination={false}
                        size="small"
                        rowKey={(record) => record.key}
                        columns={[
                          {
                            title: 'Параметр',
                            dataIndex: 'label',
                            key: 'label',
                            render: (value) => localizeResultText(value) || '—',
                          },
                          {
                            title: 'Значение',
                            dataIndex: 'value',
                            key: 'value',
                            render: (value) => value === null || value === undefined ? '—' : localizeResultText(value),
                          },
                          {
                            title: 'Источник',
                            dataIndex: 'sourceKindLabel',
                            key: 'sourceKindLabel',
                            render: (value, record) => (
                              <Space direction="vertical" size={0}>
                                <Text>{localizeResultText(value)}</Text>
                                <Text type="secondary">{localizeResultText(record.sourceLabel || record.source)}</Text>
                              </Space>
                            ),
                          },
                        ]}
                      />
                    </Card>
                  )}
                </div>

                <Divider />

                <div className="project-result-pdf-break-before">
                  {breakdown?.methodology?.blocks?.length > 0 && (
                    <>
                      <Title level={3}>
                        <CalculatorOutlined /> Логика расчёта
                      </Title>
                      <Paragraph type="secondary" className="project-result-details-intro">
                        {localizeResultText(
                          breakdown?.methodology?.overview || 'Ниже показано, по каким правилам модель выбирает ключевые параметры расчёта.'
                        )}
                      </Paragraph>
                      <div className="project-result-method-grid">
                        {breakdown.methodology.blocks.map((block) => (
                          <MethodologyBlock
                            key={block.key || block.title}
                            title={block.title}
                            summary={block.summary}
                            facts={Array.isArray(block.facts) ? block.facts : []}
                          />
                        ))}
                      </div>
                      <Divider />
                    </>
                  )}

                  <div>
                    <Title level={3}>
                      <BarChartOutlined /> Детали расчёта
                    </Title>
                    <Paragraph type="secondary" className="project-result-details-intro">
                      {breakdown?.methodology?.overview
                        ? `${localizeResultText(breakdown.methodology.overview)} Ниже расчёт разложен по шагам: что берётся на вход, какая формула применяется и какой промежуточный результат получается на каждом этапе.`
                        : 'Ниже расчёт разложен по шагам: что берётся на вход, какая формула применяется и какой промежуточный результат получается на каждом этапе.'}
                    </Paragraph>
                    <Collapse
                      ghost
                      activeKey={expandedStepKeys}
                      onChange={(keys) => setExpandedStepKeys(Array.isArray(keys) ? keys.map(String) : [])}
                      items={(breakdown?.calculationSteps || []).map((step) => ({
                        key: String(step.step),
                        label: (
                          <div className="project-result-step-header">
                            <div>
                              <Text type="secondary" className="project-result-step-eyebrow">
                                Шаг {step.step}
                              </Text>
                              <div>{localizeResultText(step.title)}</div>
                            </div>
                            <Text strong className="project-result-step-result">
                              {formatStepSummary(step)}
                            </Text>
                          </div>
                        ),
                        children: (
                          <div>
                            <div className="project-result-detail-block">
                              <Text strong className="project-result-detail-label">
                                Что посчитано
                              </Text>
                              <Paragraph style={{ marginBottom: 0 }}>
                                {localizeResultText(step.formula)}
                              </Paragraph>
                            </div>

                            {step.explanation && (
                              <div className="project-result-detail-block">
                                <Text strong className="project-result-detail-label">
                                  Почему именно так
                                </Text>
                                <Paragraph style={{ marginBottom: 0 }}>
                                  {renderLocalizedMultilineText(step.explanation)}
                                </Paragraph>
                              </div>
                            )}

                            {step.calculation && (
                              <div className="project-result-detail-block">
                                <Text strong className="project-result-detail-label">
                                  Как посчитано
                                </Text>
                                <code className="project-result-formula">
                                  {localizeResultText(step.calculation)}
                                </code>
                              </div>
                            )}

                            {Array.isArray(step.rows) && step.rows.length > 0 && (
                              <Table
                                className="project-result-step-table"
                                size="small"
                                pagination={false}
                                scroll={{ x: 960 }}
                                rowKey={(record, index) => record.label || index}
                                dataSource={step.rows}
                                columns={[
                                  {
                                    title: 'Показатель',
                                    dataIndex: 'label',
                                    key: 'label',
                                    render: (value) => localizeResultText(value) || '-',
                                  },
                                  {
                                    title: 'Площадь',
                                    dataIndex: 'leasableArea',
                                    key: 'leasableArea',
                                    render: (value) => value !== undefined ? formatSqm(value, 2) : '-',
                                  },
                                  {
                                    title: 'Ставка',
                                    dataIndex: 'monthlyRate',
                                    key: 'monthlyRate',
                                    render: (value) => value !== undefined ? `${formatNumber(value, 3)} ₽/м²/мес` : '-',
                                  },
                                  {
                                    title: 'Доход / Значение',
                                    dataIndex: 'annualIncome',
                                    key: 'annualIncome',
                                    render: (_, record) => {
                                      if (record.annualIncome !== undefined) {
                                        return formatCurrency(record.annualIncome, 2);
                                      }

                                      if (record.value !== undefined) {
                                        return `${formatNumber(record.value, 3)} ${localizeResultText(step.unit)}`;
                                      }

                                      return '-';
                                    },
                                  },
                                ]}
                              />
                            )}

                            {!(Array.isArray(step.rows) && step.rows.length > 0 && step?.result && typeof step.result === 'object') && (
                              renderStepResult(step)
                            )}
                          </div>
                        ),
                      }))}
                    />
                  </div>
                </div>

                <Divider />
              </>
            )}

            {floorInputRows.length > 0 && (
              <div>
                <Title level={3}>
                  <BarChartOutlined />
                  <Tooltip title="Детальные данные по каждому этажу здания">
                    Данные по этажам <InfoCircleOutlined />
                  </Tooltip>
                </Title>
                <Table
                  dataSource={floorInputRows}
                  scroll={{ x: 1100 }}
                  columns={[
                    {
                      title: <Tooltip title={getFieldTooltip('floorLocation')}>Этаж расположения</Tooltip>,
                      dataIndex: 'floorLocation',
                      key: 'floorLocation',
                      width: '22%',
                    },
                    {
                      title: 'Название',
                      dataIndex: 'name',
                      key: 'name',
                      width: '18%',
                    },
                    {
                      title: <Tooltip title={getFieldTooltip('area')}>Площадь, м²</Tooltip>,
                      dataIndex: 'area',
                      key: 'area',
                      width: '15%',
                      render: (value) => formatSqm(value, 2),
                    },
                    {
                      title: <Tooltip title={getFieldTooltip('leasableArea')}>Арендопригодная площадь, м²</Tooltip>,
                      dataIndex: 'leasableArea',
                      key: 'leasableArea',
                      width: '18%',
                      render: (value) => formatSqm(value, 2),
                    },
                    {
                      title: <Tooltip title={getFieldTooltip('avgLeasableRoomArea')}>Средняя площадь помещения, м²</Tooltip>,
                      dataIndex: 'avgLeasableRoomArea',
                      key: 'avgLeasableRoomArea',
                      width: '17%',
                      render: (value) => formatSqm(value, 2),
                    },
                    {
                      title: <Tooltip title={getFieldTooltip('monthlyRate')}>Ставка, ₽/м²/мес</Tooltip>,
                      dataIndex: 'monthlyRate',
                      key: 'monthlyRate',
                      width: '15%',
                      render: (value) => value ? formatNumber(value, 3) : '-',
                    },
                  ]}
                  pagination={false}
                  size="small"
                  rowKey={(record) => record.id}
                />
              </div>
            )}

            {floorIncomeRows.length > 0 && (
              <>
                <Divider />
                <div>
                  <Title level={4}>Доход по этажным группам</Title>
                  <Table
                    dataSource={floorIncomeRows}
                    pagination={false}
                    size="small"
                    scroll={{ x: 840 }}
                    rowKey={(record) => record.id}
                    columns={[
                      {
                        title: 'Этаж',
                        dataIndex: 'floorLocation',
                        key: 'floorLocation',
                      },
                      {
                        title: 'Арендопригодная площадь',
                        dataIndex: 'leasableArea',
                        key: 'leasableArea',
                        render: (value) => formatSqm(value, 2),
                      },
                      {
                        title: 'Ставка',
                        dataIndex: 'monthlyRate',
                        key: 'monthlyRate',
                        render: (value) => `${formatNumber(value, 3)} ₽/м²/мес`,
                      },
                      {
                        title: 'Годовой доход',
                        dataIndex: 'annualIncome',
                        key: 'annualIncome',
                        render: (value) => formatCurrency(value, 2),
                      },
                    ]}
                  />
                </div>
              </>
            )}

            {debugModeEnabled && (
              <>
                <Divider />

                <div>
                  <Title level={3}>
                    <CalculatorOutlined />
                    <Tooltip title="Параметры, которые были использованы в расчетах">
                      Используемые параметры <InfoCircleOutlined />
                    </Tooltip>
                  </Title>

                  <Row gutter={16}>
                    <Col xs={24} sm={12}>
                      <Card className="project-result-section-card">
                        <Statistic
                          title="Ставка аренды"
                          value={Number(breakdown?.inputs?.rentalRate?.value || 0)}
                          suffix="₽/м²"
                          prefix={
                            rentalRateIsManual ? (
                              <Tag color="orange">Вручную</Tag>
                            ) : (
                              <Tag color="cyan">Рынок</Tag>
                            )
                          }
                        />
                        {breakdown?.inputs?.rentalRate?.methodLabel && (
                          <Text type="secondary">
                            {localizeResultText(breakdown.inputs.rentalRate.methodLabel)}
                          </Text>
                        )}
                        {breakdown?.inputs?.rentalRate?.note && (
                          <Text type="secondary">
                            {localizeResultText(breakdown.inputs.rentalRate.note)}
                          </Text>
                        )}
                      </Card>
                    </Col>

                    <Col xs={24} sm={12}>
                      <Card className="project-result-section-card">
                        <Statistic
                          title="Сдаваемая площадь"
                          value={Number(breakdown?.inputs?.leasableArea?.value || 0)}
                          suffix="м²"
                        />
                        {breakdown?.inputs?.actualOccupancy?.note && (
                          <Text type="secondary">
                            {localizeResultText(breakdown.inputs.actualOccupancy.note)}
                          </Text>
                        )}
                      </Card>
                    </Col>
                  </Row>

                  <Row gutter={16} style={{ marginTop: 16 }}>
                    <Col xs={24} sm={8}>
                      <Card className="project-result-section-card">
                        <Statistic
                          title="Незаполняемость"
                          value={Number(breakdown?.inputs?.vacancyRate?.value || 0)}
                          suffix="%"
                        />
                        {breakdown?.inputs?.vacancyRate?.methodLabel && (
                          <Text type="secondary">
                            {localizeResultText(breakdown.inputs.vacancyRate.methodLabel)}
                          </Text>
                        )}
                        {breakdown?.inputs?.vacancyRate?.note && (
                          <Text type="secondary">
                            {localizeResultText(breakdown.inputs.vacancyRate.note)}
                          </Text>
                        )}
                      </Card>
                    </Col>

                    <Col xs={24} sm={8}>
                      <Card className="project-result-section-card">
                        <Statistic
                          title="Операционные расходы"
                          value={Number(breakdown?.inputs?.opexRate?.value || 0)}
                          suffix="%"
                        />
                        {breakdown?.inputs?.opexRate?.methodLabel && (
                          <Text type="secondary">
                            {localizeResultText(breakdown.inputs.opexRate.methodLabel)}
                          </Text>
                        )}
                        {breakdown?.inputs?.opexRate?.note && (
                          <Text type="secondary">
                            {localizeResultText(breakdown.inputs.opexRate.note)}
                          </Text>
                        )}
                      </Card>
                    </Col>

                    <Col xs={24} sm={8}>
                      <Card className="project-result-section-card">
                        <Statistic
                          title="Ставка капитализации"
                          value={(Number(breakdown?.summary?.capitalizationRate || 0) * 100).toFixed(2)}
                          suffix="%"
                        />
                        {breakdown?.inputs?.capitalizationRate?.methodLabel && (
                          <Text type="secondary">
                            {localizeResultText(breakdown.inputs.capitalizationRate.methodLabel)}
                          </Text>
                        )}
                        {breakdown?.inputs?.capitalizationRate?.note && (
                          <Text type="secondary">
                            {localizeResultText(breakdown.inputs.capitalizationRate.note)}
                          </Text>
                        )}
                      </Card>
                    </Col>
                  </Row>

                  {breakdown?.inputs?.rentalRate?.marketData && (
                    <Card style={{ marginTop: 16 }} className="project-result-section-card">
                      <Title level={4}>Рыночный диапазон ставок аренды</Title>
                      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                        {localizeResultText(
                          breakdown?.inputs?.rentalRate?.methodLabel || 'Итоговая ставка выбирается по рыночной модели аналогов.'
                        )}
                        {breakdown?.market?.selectedComparableCount ? ` Отобрано ${breakdown.market.selectedComparableCount}, в итог вошло ${breakdown.market.comparableCount}, исключено ${breakdown.market.excludedComparableCount || 0}.` : ''}
                      </Paragraph>
                      <Row gutter={16}>
                        <Col xs={24} sm={8}>
                          <Statistic
                            title="Минимум"
                            value={formatNumber(breakdown?.inputs?.rentalRate?.marketData?.min || 0, 2)}
                            suffix="₽/м²"
                          />
                        </Col>
                        <Col xs={24} sm={8}>
                          <Statistic
                            title="Медиана"
                            value={formatNumber(breakdown?.inputs?.rentalRate?.marketData?.median || 0, 2)}
                            suffix="₽/м²"
                          />
                        </Col>
                        <Col xs={24} sm={8}>
                          <Statistic
                            title="Максимум"
                            value={formatNumber(breakdown?.inputs?.rentalRate?.marketData?.max || 0, 2)}
                            suffix="₽/м²"
                          />
                        </Col>
                      </Row>
                    </Card>
                  )}
                </div>
              </>
            )}

            <Divider />

            {breakdown?.market?.topComparables?.length > 0 && (
              <div className="project-result-pdf-break-before">
                <Title level={3}>
                  <LineChartOutlined />
                  <Tooltip title="Похожие объекты недвижимости, используемые для расчета рыночной ставки аренды">
                    Аналогичные объекты (топ-10) <InfoCircleOutlined />
                  </Tooltip>
                </Title>
                <Table
                  dataSource={breakdown.market.topComparables}
                  scroll={{ x: 1560 }}
                  columns={[
                    // {
                    //   title: 'ID',
                    //   dataIndex: 'id',
                    //   key: 'id',
                    //   width: '12%',
                    //   render: (value, record) => value || record.external_id || '—',
                    // },
                    {
                      title: <Tooltip title={getFieldTooltip('address_offer')}>Адрес</Tooltip>,
                      dataIndex: 'address_offer',
                      key: 'address_offer',
                      width: '24%',
                      render: (text) => <Text ellipsis>{localizeResultText(text) || '—'}</Text>,
                    },
                    {
                      title: <Tooltip title={getFieldTooltip('class_offer')}>Класс</Tooltip>,
                      dataIndex: 'class_offer',
                      key: 'class_offer',
                      width: '8%',
                    },
                    {
                      title: 'Квартал',
                      dataIndex: 'quarter',
                      key: 'quarter',
                      width: '10%',
                      render: (value) => value || '—',
                    },
                    {
                      title: <Tooltip title={getFieldTooltip('area_total')}>Площадь</Tooltip>,
                      dataIndex: 'area_total',
                      key: 'area_total',
                      width: '12%',
                      render: (value) => formatSqm(value, 2),
                    },
                    {
                      title: <Tooltip title={getFieldTooltip('price_per_sqm_cleaned')}>Ставка</Tooltip>,
                      dataIndex: 'price_per_sqm_cleaned',
                      key: 'price_per_sqm_cleaned',
                      width: '12%',
                      render: (value) => <Text strong>{formatNumber(value, 2)} ₽/м²</Text>,
                    },
                    {
                      title: 'Скорр. ставка',
                      dataIndex: 'adjusted_rate',
                      key: 'adjusted_rate',
                      width: '12%',
                      render: (value) => value ? <Text>{formatNumber(value, 2)} ₽/м²</Text> : '—',
                    },
                    {
                      title: 'Релевантность',
                      dataIndex: 'relevance_score',
                      key: 'relevance_score',
                      width: '8%',
                      render: (value) => value ? `${formatNumber(Number(value) * 100, 1)}%` : '—',
                    },
                    {
                      title: 'Вес',
                      dataIndex: 'normalized_weight',
                      key: 'normalized_weight',
                      width: '8%',
                      render: (_, record) => {
                        const value = record.normalized_weight ?? record.selection_weight;
                        return value ? `${formatNumber(Number(value) * 100, 1)}%` : '—';
                      },
                    },
                    {
                      title: 'Статус',
                      dataIndex: 'included_in_rent_calculation',
                      key: 'included_in_rent_calculation',
                      width: '10%',
                      render: (value, record) => (
                        <Tooltip title={localizeResultText(record.decision_reason || record.exclusion_reason || '—')}>
                          <Tag color={value === false ? 'default' : 'green'}>
                            {value === false ? 'Исключён' : 'В расчёте'}
                          </Tag>
                        </Tooltip>
                      ),
                    },
                    {
                      title: <Tooltip title={getFieldTooltip('offer_date')}>Дата</Tooltip>,
                      dataIndex: 'offer_date',
                      key: 'offer_date',
                      width: '10%',
                      render: (value) => {
                        if (!value) return '—';
                        return new Date(value).toLocaleDateString('ru-RU');
                      },
                    },
                    {
                      title: <Tooltip title="Переход к источнику информации об объекте">Ссылка</Tooltip>,
                      dataIndex: 'link',
                      key: 'link',
                      width: '14%',
                      render: (link) => {
                        if (!link) return <Text type="secondary">—</Text>;
                        return (
                          <Tooltip title={link}>
                            <a href={link} target="_blank" rel="noopener noreferrer">
                              <Button type="link" icon={<LinkOutlined />} className="project-result-link-btn">
                                Источник
                              </Button>
                            </a>
                          </Tooltip>
                        );
                      },
                    },
                  ]}
                  pagination={false}
                  size="small"
                  rowKey={(record) => record.id || record.external_id}
                />
              </div>
            )}

            {debugModeEnabled && breakdown?.market?.excludedComparables?.length > 0 && (
              <>
                <Divider />
                <div className="project-result-pdf-break-before">
                  <Title level={3}>
                    <WarningOutlined />
                    <Tooltip title="Аналоги, которые были отброшены как слабые, выбросы или дубли">
                      Исключённые аналоги <InfoCircleOutlined />
                    </Tooltip>
                  </Title>
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Text type="secondary">
                      Исключено аналогов: {breakdown.market.excludedComparables.length}. По умолчанию список скрыт, чтобы не перегружать итоговый отчет.
                    </Text>
                    <Button onClick={() => setShowExcludedComparables((prev) => !prev)}>
                      {showExcludedComparables ? 'Скрыть исключённые аналоги' : 'Показать исключённые аналоги'}
                    </Button>
                    {showExcludedComparables && (
                      <Table
                        dataSource={breakdown.market.excludedComparables}
                        scroll={{ x: 1280 }}
                        pagination={false}
                        size="small"
                        rowKey={(record, index) => `${record.analogId || record.address_offer || 'excluded'}_${index}`}
                        columns={[
                          {
                            title: 'Адрес',
                            dataIndex: 'address_offer',
                            key: 'address_offer',
                            width: '28%',
                            render: (value) => value || '—',
                          },
                          {
                            title: 'Класс',
                            dataIndex: 'class_offer',
                            key: 'class_offer',
                            width: '8%',
                            render: (value) => value || '—',
                          },
                          {
                            title: 'Ставка',
                            dataIndex: 'raw_rate',
                            key: 'raw_rate',
                            width: '10%',
                            render: (value) => value ? `${formatNumber(value, 2)} ₽/м²` : '—',
                          },
                          {
                            title: 'Скорр. ставка',
                            dataIndex: 'corrected_rate',
                            key: 'corrected_rate',
                            width: '12%',
                            render: (value) => value ? `${formatNumber(value, 2)} ₽/м²` : '—',
                          },
                          {
                            title: 'Релевантность',
                            dataIndex: 'relevance_score',
                            key: 'relevance_score',
                            width: '8%',
                            render: (value) => value ? `${formatNumber(Number(value) * 100, 1)}%` : '—',
                          },
                          {
                            title: 'Причина исключения',
                            dataIndex: 'exclusion_reason',
                            key: 'exclusion_reason',
                            width: '34%',
                            render: (value) => localizeResultText(value) || '—',
                          },
                        ]}
                      />
                    )}
                  </Space>
                </div>
              </>
            )}

            {debugModeEnabled && breakdown?.assumptions?.length > 0 && (
              <>
                <Divider />
                <div className="project-result-pdf-break-before">
                  <Title level={3}>
                    <CalculatorOutlined />
                    <Tooltip title="Использованные профили и допущения, которые снижают надежность модели">
                      Допущения модели <InfoCircleOutlined />
                    </Tooltip>
                  </Title>
                  <Table
                    dataSource={breakdown.assumptions}
                    pagination={false}
                    size="small"
                    rowKey={(record) => record.key || record.label}
                    columns={[
                      {
                        title: 'Допущение',
                        dataIndex: 'label',
                        key: 'label',
                        render: (value) => localizeResultText(value) || '—',
                      },
                      {
                        title: 'Штраф',
                        dataIndex: 'penalty',
                        key: 'penalty',
                        width: 140,
                        render: (value) => `-${formatNumber(value, 2)}`,
                      },
                    ]}
                  />
                </div>
              </>
            )}

            {(objectMapPoint || comparableMapPoints.length > 0) && (
              <>
                <Divider />
                <div>
                  <Title level={3}>
                    <LineChartOutlined />
                    <Tooltip title="Карта расположения оцениваемого объекта и найденных аналогов">
                      Карта аналогов <InfoCircleOutlined />
                    </Tooltip>
                  </Title>
                  <Card className="project-result-section-card">
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <div className="project-result-map-meta">
                        <Tag color="magenta">Объект</Tag>
                        <Tag color="processing">Контур по адресу</Tag>
                        <Tag color="green">Аналог в расчёте</Tag>
                        <Tag>Исключённый аналог</Tag>
                        <Text type="secondary">
                          На карте показано аналогов с координатами: {comparableMapPoints.length}
                          {comparableWithoutCoordsCount > 0 ? `, без координат: ${comparableWithoutCoordsCount}` : ''}
                        </Text>
                      </div>
                      <ProjectComparablesMap
                        captureRef={comparablesMapRef}
                        objectPoint={objectMapPoint}
                        comparables={comparableMapPoints}
                      />
                    </Space>
                  </Card>
                </div>
              </>
            )}

            {debugModeEnabled && breakdown?.sensitivity && (
              <>
                <Divider />
                <div className="project-result-pdf-break-before">
                  <Title level={3}>
                    <BarChartOutlined />
                    <Tooltip title={getFieldTooltip('sensitivity')}>
                      Анализ чувствительности <InfoCircleOutlined />
                    </Tooltip>
                  </Title>
                  <Paragraph type="secondary">
                    Показывает, как изменится стоимость объекта при изменении ключевых параметров:
                  </Paragraph>

                  <Title level={4}>При изменении ЧОД:</Title>
                  <Table
                    dataSource={sensitivityByNoi}
                    scroll={{ x: 860 }}
                    columns={[
                      {
                        title: 'Сценарий',
                        dataIndex: 'label',
                        key: 'label',
                        render: (value) => localizeResultText(value) || '—',
                      },
                      {
                        title: 'ЧОД',
                        dataIndex: 'noi',
                        key: 'noi',
                        render: (value) => formatCurrency(value, 2),
                      },
                      {
                        title: 'Стоимость объекта',
                        dataIndex: 'estimatedValue',
                        key: 'estimatedValue',
                        render: (value) => <Text strong>{formatCurrency(value, 2)}</Text>,
                      },
                      {
                        title: 'Изменение',
                        dataIndex: 'change',
                        key: 'change',
                        render: (value) => (
                          <Text type={value > 0 ? 'success' : 'danger'}>
                            {value > 0 ? '+' : ''}
                            {formatNumber(value, 2)}%
                          </Text>
                        ),
                      },
                    ]}
                    pagination={false}
                    size="small"
                    rowKey={(record) => record.label}
                  />

                  <Title level={4} style={{ marginTop: 24 }}>
                    При изменении ставки капитализации:
                  </Title>
                  <Table
                    dataSource={breakdown.sensitivity.byCapRate || []}
                    scroll={{ x: 860 }}
                    columns={[
                      {
                        title: 'Сценарий',
                        dataIndex: 'label',
                        key: 'label',
                        render: (value) => localizeResultText(value) || '—',
                      },
                      {
                        title: 'Ставка капитализации',
                        dataIndex: 'capitalizationRate',
                        key: 'capitalizationRate',
                        render: (value) => formatPercent(Number(value || 0) * 100, 2),
                      },
                      {
                        title: 'Стоимость объекта',
                        dataIndex: 'estimatedValue',
                        key: 'estimatedValue',
                        render: (value) => <Text strong>{formatCurrency(value, 2)}</Text>,
                      },
                      {
                        title: 'Изменение',
                        dataIndex: 'change',
                        key: 'change',
                        render: (value) => (
                          <Text type={value > 0 ? 'success' : 'danger'}>
                            {value > 0 ? '+' : ''}
                            {formatNumber(value, 2)}%
                          </Text>
                        ),
                      },
                    ]}
                    pagination={false}
                    size="small"
                    rowKey={(record) => record.label}
                  />
                </div>
              </>
            )}

            <Divider />

            <div>
              <Title level={3}>
                <Tooltip title="Суммарные показатели проекта в целом">
                  Итоговые показатели <InfoCircleOutlined />
                </Tooltip>
              </Title>
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Card className="project-result-section-card">
                    <Statistic
                      title="ПВД"
                      value={Number(breakdown?.summary?.pgi || 0)}
                      suffix="₽"
                      prefix={<DollarOutlined />}
                    />
                  </Card>
                </Col>
                <Col xs={24} md={8}>
                  <Card className="project-result-section-card">
                    <Statistic
                      title="Ставка капитализации"
                      value={(Number(breakdown?.summary?.capitalizationRate || 0) * 100).toFixed(2)}
                      suffix="%"
                      prefix={<CalculatorOutlined />}
                    />
                  </Card>
                </Col>
                <Col xs={24} md={8}>
                  <Card className="project-result-section-card">
                    <Statistic
                      title="Стоимость объекта"
                      value={Number(breakdown?.summary?.estimatedValue || 0)}
                      suffix="₽"
                      prefix={<BarChartOutlined />}
                    />
                  </Card>
                </Col>
              </Row>
            </div>
          </>
        )}

        <Divider />
      </Space>
      </div>

      <div className="project-result-actions project-step-actions">
        <Space wrap className="project-step-actions-left">
          <Button onClick={onBack} type="primary">
            Назад к оплате
          </Button>
        </Space>
        <Space wrap className="project-step-actions-right">
          <Button
            icon={<FilePdfOutlined />}
            loading={exportingPdf}
            onClick={handleExportZemaReport}
          >
            Справка ЗЕМА
          </Button>
        </Space>
      </div>
    </Card>
  );
}
