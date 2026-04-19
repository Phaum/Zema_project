import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Divider,
  Empty,
  Modal,
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
  formatEnvironmentCategories,
  localizeEnvironmentCategoryText,
} from '../../utils/environmentLabels';
import {
  buildLeafletBoundsFromAddressGeometry,
  hasRenderableAddressGeometry,
  ObjectLocationHighlight,
  useObjectGeometry,
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
  return localizeEnvironmentCategoryText(text);
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

function formatPreciseNumber(value, maxFractionDigits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';

  return number.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
}

function formatPreciseCurrency(value) {
  const formatted = formatPreciseNumber(value);
  return formatted === '—' ? formatted : `${formatted} ₽`;
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
      if (['cadCost', 'landCadCost'].includes(entry.name || entry.fieldName)) {
        return formatPreciseCurrency(entry.value);
      }
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
  return Number.isFinite(Number(lat))
    && Number.isFinite(Number(lng))
    && !(Number(lat) === 0 && Number(lng) === 0);
}

function normalizeComparableAddressKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getComparableIdentityKeys(item) {
  if (!item || typeof item !== 'object') {
    return [];
  }

  const keys = [
    item.id,
    item.external_id,
    item.analogId,
    item.building_cadastral_number,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const addressKey = normalizeComparableAddressKey(item.address_offer || item.address);
  if (addressKey) {
    keys.push(`addr:${addressKey}`);
  }

  return Array.from(new Set(keys));
}

function extractComparablePoint(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const candidates = [
    {
      lat: item.latitude,
      lng: item.longitude,
      source: item.coordinate_source,
    },
    {
      lat: item.lat,
      lng: item.lng,
      source: item.coordinate_source,
    },
    {
      lat: item.lat,
      lng: item.lon,
      source: item.coordinate_source,
    },
  ];

  for (const candidate of candidates) {
    if (hasValidMapCoords(candidate.lat, candidate.lng)) {
      return {
        lat: Number(candidate.lat),
        lng: Number(candidate.lng),
        source: candidate.source || null,
      };
    }
  }

  return null;
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

function LeafletCaptureBridge({ captureRef, objectPoint, comparables }) {
  const map = useMap();

  useEffect(() => {
    const node = captureRef?.current;
    if (!node) return undefined;

    node.__leafletMap = map;
    node.__leafletCapturePoints = {
      objectPoint: objectPoint
        ? {
          lat: Number(objectPoint.lat),
          lng: Number(objectPoint.lng),
          address: objectPoint.address || null,
        }
        : null,
      comparables: Array.isArray(comparables)
        ? comparables
          .filter((item) => hasValidMapCoords(item?.lat, item?.lng))
          .map((item) => ({
            lat: Number(item.lat),
            lng: Number(item.lng),
            included: item.included_in_rent_calculation !== false,
          }))
        : [],
    };

    return () => {
      if (node.__leafletMap === map) {
        delete node.__leafletMap;
        delete node.__leafletCapturePoints;
      }
    };
  }, [captureRef, comparables, map, objectPoint]);

  return null;
}

function ProjectComparablesMap({ objectPoint, comparables, captureRef = null }) {
  const { data: objectGeometry } = useObjectGeometry({
    address: objectPoint?.address,
    point: objectPoint,
    preferPoint: true,
  });
  const highlightBounds = useMemo(
    () => buildLeafletBoundsFromAddressGeometry(objectGeometry),
    [objectGeometry]
  );
  const hasObjectGeometry = hasRenderableAddressGeometry(objectGeometry);
  const fallbackCenter = objectPoint
    ? [objectPoint.lat, objectPoint.lng]
    : Number.isFinite(Number(objectGeometry?.lat)) && Number.isFinite(Number(objectGeometry?.lng))
      ? [Number(objectGeometry.lat), Number(objectGeometry.lng)]
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
        <LeafletCaptureBridge
          captureRef={captureRef}
          objectPoint={objectPoint}
          comparables={comparables}
        />
        <ResultMapBounds points={boundsPoints} highlightBounds={highlightBounds} />
        <ObjectLocationHighlight
          geometry={objectGeometry}
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

const FLOOR_CATEGORY_LABELS = {
  first: '1-й этаж',
  second: '2-й этаж',
  third_plus: '3-й этаж и выше',
  thirdplus: '3-й этаж и выше',
  basement: 'Подвал',
  attic: 'Мансарда',
};

function formatFactor(value, digits = 2) {
  if (!hasMeaningfulValue(value)) return '—';
  return `×${formatNumber(value, digits)}`;
}

function formatPlainFactor(value, digits = 4) {
  if (!hasMeaningfulValue(value)) return '—';
  return formatNumber(value, digits);
}

function formatSignedPercent(value, digits = 2) {
  if (!hasMeaningfulValue(value)) return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${numeric > 0 ? '+' : ''}${formatNumber(numeric, digits)}%`;
}

function formatDistanceKm(value) {
  if (!hasMeaningfulValue(value)) return '—';
  return `${formatNumber(value, 2)} км`;
}

function humanizeFloorCategory(value) {
  if (!value) return '—';
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, '_');
  return FLOOR_CATEGORY_LABELS[normalized] || localizeResultText(value);
}

function formatEnvironmentLabel(values = []) {
  return formatEnvironmentCategories(values);
}

function formatComparableAdjustmentDetails(adjustment) {
  const details = adjustment?.details || {};

  switch (adjustment?.key) {
    case 'date':
      return [
        details.valuationQuarter ? `Квартал оценки: ${details.valuationQuarter}` : null,
        details.analogQuarter ? `Квартал аналога: ${details.analogQuarter}` : null,
        hasMeaningfulValue(details.adjustmentPercent)
          ? `Поправка матрицы: ${formatSignedPercent(-Number(details.adjustmentPercent), 2)}`
          : null,
      ].filter(Boolean).join(' • ');
    case 'bargain':
      return hasMeaningfulValue(details.discountPercent)
        ? `Скидка на торг: ${formatNumber(details.discountPercent, 2)}%`
        : 'Единая скидка без дополнительных входных параметров';
    case 'metro':
      return [
        `Объект: ${formatDistanceKm(details.subjectDistanceKm)}`,
        `Аналог: ${formatDistanceKm(details.analogDistanceKm)}`,
      ].join(' • ');
    case 'area':
      return [
        `Объект: ${hasMeaningfulValue(details.subjectArea) ? formatSqm(details.subjectArea, 2) : '—'}`,
        `Аналог: ${hasMeaningfulValue(details.analogArea) ? formatSqm(details.analogArea, 2) : '—'}`,
        hasMeaningfulValue(details.exponentN) ? `Показатель n: ${formatNumber(details.exponentN, 2)}` : null,
      ].filter(Boolean).join(' • ');
    case 'floor':
      return [
        `Объект: ${humanizeFloorCategory(details.subjectFloorCategory)}`,
        `Аналог: ${humanizeFloorCategory(details.analogFloorCategory)}`,
      ].join(' • ');
    case 'environment':
      return [
        `Объект: ${formatEnvironmentLabel([details.subjectEnvironment])}`,
        `Аналог: ${formatEnvironmentLabel([details.analogEnvironment])}`,
        hasMeaningfulValue(details.subjectHistoricalCenter)
          ? `Ист. центр объекта: ${formatYesNo(details.subjectHistoricalCenter)}`
          : null,
        hasMeaningfulValue(details.analogHistoricalCenter)
          ? `Ист. центр аналога: ${formatYesNo(details.analogHistoricalCenter)}`
          : null,
      ].filter(Boolean).join(' • ');
    default:
      return '';
  }
}

function buildComparableAdjustmentRows(comparable = {}) {
  const safeComparable = comparable || {};
  const adjustments = Array.isArray(safeComparable.adjustments) ? safeComparable.adjustments : [];

  return adjustments.map((item) => ({
    key: item.key || item.label,
    stage: item.label || localizeResultText(item.key) || 'Корректировка',
    factor: item.factor,
    deltaPercent: item.deltaPercent,
    reasoning: localizeResultText(item.reasoning) || '—',
    details: formatComparableAdjustmentDetails(item),
  }));
}

function getComparableAdjustmentByKey(adjustments = [], key) {
  return (Array.isArray(adjustments) ? adjustments : []).find((item) => item.key === key);
}

function getRawComparableAdjustmentByKey(comparable = {}, key) {
  return (Array.isArray(comparable?.adjustments) ? comparable.adjustments : []).find((item) => item.key === key);
}

function formatComparableRate(value) {
  return hasMeaningfulValue(value) ? `${formatNumber(value, 2)} ₽/м²` : '—';
}

function buildComparableFactorLine(adjustment) {
  if (!adjustment) {
    return null;
  }

  const variableByKey = {
    date: 'Кдата',
    bargain: 'Кторг',
    metro: 'Кметро',
    area: 'Кs',
    floor: 'Кэтаж',
    environment: 'Кокружение',
  };
  const variable = variableByKey[adjustment.key] || 'К';

  return `${adjustment.stage}: ${variable} = ${formatPlainFactor(adjustment.factor)} (${formatSignedPercent(adjustment.deltaPercent, 2)})`;
}

function ComparableMathStep({ number, title, result, formula, explanation, facts = [] }) {
  return (
    <Card size="small" className="project-result-comparable-step">
      <div className="project-result-comparable-step-header">
        <Text type="secondary" className="project-result-step-eyebrow">
          Шаг {number}
        </Text>
        <Text strong>{title}</Text>
        {result && (
          <Text strong className="project-result-comparable-step-result">
            {result}
          </Text>
        )}
      </div>

      {explanation && (
        <Paragraph style={{ marginBottom: 10 }}>
          {explanation}
        </Paragraph>
      )}

      {formula && (
        <code className="project-result-formula">
          {formula}
        </code>
      )}

      {facts.length > 0 && (
        <Space direction="vertical" size={4} className="project-result-comparable-step-facts">
          {facts.filter(Boolean).map((fact, index) => (
            <Text key={`${number}-${index}`} type="secondary">
              {fact}
            </Text>
          ))}
        </Space>
      )}
    </Card>
  );
}

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
    const env = formatEnvironmentCategories([
      comp.environment_category_1,
      comp.environment_category_2,
      comp.environment_category_3
    ]);

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

  const nearbyEnvironment = formatEnvironmentCategories([
    questionnaire.environmentCategory1,
    questionnaire.environmentCategory2,
    questionnaire.environmentCategory3
  ]);

  return {
    assessmentDate: questionnaire.valuationDate,
    objectAddress: questionnaire.objectAddress || '—',
    cadastralNumber: questionnaire.buildingCadastralNumber || '—',
    totalArea,
    constructionYear: questionnaire.constructionYear,
    constructionCompletionYear: questionnaire.constructionCompletionYear || questionnaire.completionYear || null,
    commissioningYear: questionnaire.commissioningYear || questionnaire.yearCommissioning || questionnaire.year_commisioning || questionnaire.constructionYear,
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

async function waitForLeafletMapReady(element, timeoutMs = 5000) {
  if (!element) return;

  const tileImages = Array.from(element.querySelectorAll('.leaflet-tile'));
  if (!tileImages.length) {
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    return;
  }

  await new Promise((resolve) => {
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

    let remaining = tileImages.filter((img) => !img.complete).length;
    if (remaining <= 0) {
      finish();
      return;
    }

    tileImages.forEach((img) => {
      if (img.complete) {
        return;
      }

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

  await new Promise((resolve) => window.setTimeout(resolve, 400));
}

function waitForAnimationFrames(count = 2) {
  return new Promise((resolve) => {
    const tick = (remaining) => {
      if (remaining <= 0) {
        resolve();
        return;
      }

      requestAnimationFrame(() => tick(remaining - 1));
    };

    tick(count);
  });
}

async function stabilizeLeafletMapForCapture(element) {
  const map = element?.__leafletMap;
  if (!element || !map) {
    return () => {};
  }

  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || element.offsetWidth || 0));
  const height = Math.max(1, Math.round(rect.height || element.offsetHeight || 0));
  const previousStyle = {
    width: element.style.width,
    height: element.style.height,
    minWidth: element.style.minWidth,
    maxWidth: element.style.maxWidth,
  };

  element.style.width = `${width}px`;
  element.style.minWidth = `${width}px`;
  element.style.maxWidth = `${width}px`;
  element.style.height = `${height}px`;

  await waitForAnimationFrames(2);
  map.invalidateSize({ animate: false, pan: false });
  await waitForAnimationFrames(2);

  const center = map.getCenter();
  const zoom = map.getZoom();
  map.setView(center, zoom, { animate: false });
  await waitForAnimationFrames(2);

  return () => {
    element.style.width = previousStyle.width;
    element.style.height = previousStyle.height;
    element.style.minWidth = previousStyle.minWidth;
    element.style.maxWidth = previousStyle.maxWidth;
    map.invalidateSize({ animate: false, pan: false });
  };
}

function setLeafletVectorLayersVisibility(element, visible) {
  if (!element) return [];

  const layerNodes = Array.from(element.querySelectorAll([
    '.leaflet-overlay-pane',
    '.leaflet-marker-pane',
    '.leaflet-tooltip-pane',
    '.leaflet-popup-pane',
  ].join(',')));

  const previous = layerNodes.map((node) => ({
    node,
    visibility: node.style.visibility,
  }));

  layerNodes.forEach((node) => {
    node.style.visibility = visible ? '' : 'hidden';
  });

  return previous;
}

function restoreLeafletVectorLayersVisibility(previous = []) {
  previous.forEach(({ node, visibility }) => {
    node.style.visibility = visibility;
  });
}

function drawCircleOnCanvas(context, x, y, {
  radius,
  fill,
  stroke = '#ffffff',
  strokeWidth = 2,
  fillOpacity = 0.9,
}) {
  context.save();
  context.globalAlpha = 1;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.globalAlpha = fillOpacity;
  context.fill();
  context.globalAlpha = 1;
  context.lineWidth = strokeWidth;
  context.strokeStyle = stroke;
  context.stroke();
  context.restore();
}

function drawLeafletCapturePoints(canvas, element) {
  const map = element?.__leafletMap;
  const capturePoints = element?.__leafletCapturePoints;

  if (!map || !capturePoints || !canvas) {
    return;
  }

  const context = canvas.getContext('2d');
  const rect = element.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;

  const drawLatLng = (point, options) => {
    if (!hasValidMapCoords(point?.lat, point?.lng)) return;

    const projected = map.latLngToContainerPoint([Number(point.lat), Number(point.lng)]);
    drawCircleOnCanvas(context, projected.x * scaleX, projected.y * scaleY, {
      ...options,
      radius: options.radius * Math.max(scaleX, scaleY),
      strokeWidth: options.strokeWidth * Math.max(scaleX, scaleY),
    });
  };

  if (capturePoints.objectPoint) {
    drawLatLng(capturePoints.objectPoint, {
      radius: 7,
      fill: '#c026d3',
      strokeWidth: 3,
      fillOpacity: 0.96,
    });
  }

  capturePoints.comparables.forEach((point) => {
    drawLatLng(point, {
      radius: 8,
      fill: point.included ? '#52c41a' : '#8c8c8c',
      strokeWidth: 2,
      fillOpacity: point.included ? 0.9 : 0.75,
    });
  });
}

async function captureLeafletMapAsCanvasPng(element) {
  const map = element?.__leafletMap;
  if (!element || !map) {
    return null;
  }

  await waitForElementImages(element);
  await waitForLeafletMapReady(element);
  await waitForAnimationFrames(2);

  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || element.offsetWidth || 0));
  const height = Math.max(1, Math.round(rect.height || element.offsetHeight || 0));
  const pixelRatio = Math.max(2, Math.min(window.devicePixelRatio || 1, 3));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);

  const context = canvas.getContext('2d');
  context.fillStyle = '#f8fbff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const tileImages = Array.from(element.querySelectorAll('.leaflet-tile'));

  for (const tile of tileImages) {
    if (!tile.complete || tile.naturalWidth <= 0 || tile.naturalHeight <= 0) {
      continue;
    }

    const tileRect = tile.getBoundingClientRect();
    const dx = (tileRect.left - rect.left) * pixelRatio;
    const dy = (tileRect.top - rect.top) * pixelRatio;
    const dw = tileRect.width * pixelRatio;
    const dh = tileRect.height * pixelRatio;

    try {
      context.drawImage(tile, dx, dy, dw, dh);
    } catch (error) {
      console.warn('Не удалось нарисовать тайл карты на canvas:', error);
    }
  }

  drawLeafletCapturePoints(canvas, element);

  context.save();
  context.globalAlpha = 0.82;
  context.fillStyle = '#ffffff';
  context.fillRect(8 * pixelRatio, (height - 26) * pixelRatio, 190 * pixelRatio, 18 * pixelRatio);
  context.globalAlpha = 1;
  context.fillStyle = '#4b5563';
  context.font = `${10 * pixelRatio}px Arial, sans-serif`;
  context.fillText('Leaflet | © OpenStreetMap contributors', 14 * pixelRatio, (height - 13) * pixelRatio);
  context.restore();

  return canvas.toDataURL('image/png');
}

async function captureElementAsPng(element) {
  if (!element) return null;

  const ignoreAttribute = element.getAttribute('data-html2canvas-ignore');
  let restoreLeafletLayout = () => {};
  let hiddenLeafletLayers = [];

  if (ignoreAttribute !== null) {
    element.removeAttribute('data-html2canvas-ignore');
  }

  try {
    await waitForAnimationFrames(1);
    restoreLeafletLayout = await stabilizeLeafletMapForCapture(element);

    const leafletCanvasUrl = await captureLeafletMapAsCanvasPng(element);
    if (leafletCanvasUrl) {
      return leafletCanvasUrl;
    }

    await waitForElementImages(element);
    await waitForLeafletMapReady(element);
    hiddenLeafletLayers = setLeafletVectorLayersVisibility(element, false);

    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: Math.max(2, Math.min(window.devicePixelRatio || 1, 3)),
      logging: false,
      useCORS: true,
      allowTaint: false,
      imageTimeout: 15000,
      width: Math.ceil(element.getBoundingClientRect().width),
      height: Math.ceil(element.getBoundingClientRect().height),
      windowWidth: Math.max(document.documentElement.clientWidth, Math.ceil(element.getBoundingClientRect().width)),
    });

    drawLeafletCapturePoints(canvas, element);

    return canvas.toDataURL('image/png');
  } finally {
    restoreLeafletVectorLayersVisibility(hiddenLeafletLayers);
    restoreLeafletLayout();
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
  const [selectedComparable, setSelectedComparable] = useState(null);
  const comparablesMapRef = useRef(null);
  const questionnaire = project?.questionnaire || {};

  const loadResult = useCallback(async ({ showError = true, silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setShowExcludedComparables(false);
      setSelectedComparable(null);
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

  const floorInputRows = breakdown?.inputs?.floorInputRows || [];
  const floorIncomeRows = breakdown?.inputs?.floorIncomeRows || [];
  const sensitivityByNoi = breakdown?.sensitivity?.byNoi || breakdown?.sensitivity?.byGrossIncome || [];
  const sourceFloorRows = Array.isArray(questionnaire?.floors) ? questionnaire.floors : [];
  const sourceFloorLeasableTotal = sourceFloorRows.reduce(
    (sum, floor) => sum + (Number(floor?.leasableArea) || 0),
    0
  );
  const hasSourceFloorLeasableTotal = sourceFloorLeasableTotal > 0;
  const sourceFloorLeasableFormula = sourceFloorRows
    .map((floor) => Number(floor?.leasableArea) || 0)
    .filter((value) => value > 0)
    .map((value) => formatNumber(value, 2))
    .join(' + ');
  const calculationStepKeys = (breakdown?.calculationSteps || []).map((step) => String(step.step));
  const questionnaireSourceBuckets = getQuestionnaireSourceBuckets(questionnaire);
  const shouldShowLeasableAreaAfterFloors = sourceFloorRows.length > 0;
    const hideLeasableAreaFromSourceCards = (field) => (
        shouldShowLeasableAreaAfterFloors
        && (
            ['leasableArea', 'leasable_area'].includes(field?.name)
            || ['leasableArea', 'leasable_area'].includes(field?.fieldName)
        )
    );
  const manualQuestionnaireFields = questionnaireSourceBuckets.manualFields.filter((field) => !hideLeasableAreaFromSourceCards(field));
  const autoQuestionnaireFields = questionnaireSourceBuckets.autoFields.filter((field) => !hideLeasableAreaFromSourceCards(field));
  const hasAutoSourceData = autoQuestionnaireFields.length > 0;
  const objectMapPoint = hasValidMapCoords(questionnaire?.mapPointLat, questionnaire?.mapPointLng)
    ? {
      lat: Number(questionnaire.mapPointLat),
      lng: Number(questionnaire.mapPointLng),
      address: questionnaire.objectAddress,
      cadastralNumber: questionnaire.buildingCadastralNumber,
    }
    : null;
  const mapComparableSource = useMemo(() => {
    const resultComparables = Array.isArray(breakdown?.market?.topComparables)
      ? breakdown.market.topComparables
      : [];
    const fallbackComparables = Array.isArray(marketContext?.topComparables)
      ? marketContext.topComparables
      : [];

    if (!resultComparables.length) {
      return fallbackComparables;
    }

    const fallbackByKey = new Map();
    fallbackComparables.forEach((item) => {
      getComparableIdentityKeys(item).forEach((key) => {
        if (!fallbackByKey.has(key)) {
          fallbackByKey.set(key, item);
        }
      });
    });

    return resultComparables.map((item) => {
      const fallback = getComparableIdentityKeys(item)
        .map((key) => fallbackByKey.get(key))
        .find(Boolean);
      const primaryPoint = extractComparablePoint(item);
      const fallbackPoint = extractComparablePoint(fallback);
      const point = primaryPoint || fallbackPoint;

      return {
        ...(fallback || {}),
        ...item,
        latitude: point?.lat ?? null,
        longitude: point?.lng ?? null,
        coordinate_source: point?.source || item?.coordinate_source || fallback?.coordinate_source || null,
      };
    });
  }, [breakdown?.market?.topComparables, marketContext?.topComparables]);
  const comparableMapPoints = Array.isArray(mapComparableSource)
    ? mapComparableSource
      .map((item) => {
        const point = extractComparablePoint(item);
        if (!point) {
          return null;
        }

        return {
          ...item,
          lat: point.lat,
          lng: point.lng,
          latitude: point.lat,
          longitude: point.lng,
          coordinate_source: point.source || item?.coordinate_source || null,
        };
      })
      .filter(Boolean)
    : [];
  const comparableWithoutCoordsCount = Math.max(
    (mapComparableSource?.length || 0) - comparableMapPoints.length,
    0
  );
  const debugModeEnabled = Boolean(result?.debugModeEnabled);
  const topComparables = Array.isArray(breakdown?.market?.topComparables)
    ? breakdown.market.topComparables
    : [];
  const hasTopComparables = topComparables.length > 0;
  const topComparablesDetailKey = 'market-top-comparables';
  const detailCollapseKeys = hasTopComparables
    ? [
      ...calculationStepKeys.slice(0, 1),
      topComparablesDetailKey,
      ...calculationStepKeys.slice(1),
    ]
    : calculationStepKeys;
  const rentalRateSource = String(breakdown?.inputs?.rentalRate?.source || '').trim().toLowerCase();
  const rentalRateIsManual = rentalRateSource.startsWith('manual');
  const selectedComparableRank = selectedComparable
    ? topComparables.findIndex((item) => {
      const itemId = item?.id || item?.external_id;
      const selectedId = selectedComparable?.id || selectedComparable?.external_id;
      if (itemId && selectedId) {
        return String(itemId) === String(selectedId);
      }
      return item?.address_offer === selectedComparable?.address_offer;
    }) + 1
    : 0;
  const selectedComparableAdjustmentRows = useMemo(
    () => buildComparableAdjustmentRows(selectedComparable),
    [selectedComparable]
  );
  const selectedComparableAdjustmentByKey = useMemo(() => ({
    date: getComparableAdjustmentByKey(selectedComparableAdjustmentRows, 'date'),
    bargain: getComparableAdjustmentByKey(selectedComparableAdjustmentRows, 'bargain'),
    metro: getComparableAdjustmentByKey(selectedComparableAdjustmentRows, 'metro'),
    area: getComparableAdjustmentByKey(selectedComparableAdjustmentRows, 'area'),
    floor: getComparableAdjustmentByKey(selectedComparableAdjustmentRows, 'floor'),
    environment: getComparableAdjustmentByKey(selectedComparableAdjustmentRows, 'environment'),
  }), [selectedComparableAdjustmentRows]);
  const selectedComparableRawAdjustmentByKey = useMemo(() => ({
    date: getRawComparableAdjustmentByKey(selectedComparable, 'date'),
    bargain: getRawComparableAdjustmentByKey(selectedComparable, 'bargain'),
    metro: getRawComparableAdjustmentByKey(selectedComparable, 'metro'),
    area: getRawComparableAdjustmentByKey(selectedComparable, 'area'),
    floor: getRawComparableAdjustmentByKey(selectedComparable, 'floor'),
    environment: getRawComparableAdjustmentByKey(selectedComparable, 'environment'),
  }), [selectedComparable]);
  const selectedComparableWeight = selectedComparable?.normalized_weight ?? selectedComparable?.selection_weight ?? null;
  const selectedComparableFloorCategory = questionnaire?.floorCategory || questionnaire?.floorType || null;
  const selectedComparableSubjectClass = questionnaire?.businessCenterClass || questionnaire?.objectClass || '—';
  const selectedComparableSubjectArea = Number(questionnaire?.totalArea);
  const selectedComparableAnalogArea = Number(selectedComparable?.area_total);
  const selectedComparableAreaRatio = Number.isFinite(selectedComparableSubjectArea) && Number.isFinite(selectedComparableAnalogArea) && selectedComparableAnalogArea > 0
    ? selectedComparableSubjectArea / selectedComparableAnalogArea
    : null;
  const selectedComparableCorrectedRate = selectedComparable?.corrected_rate || selectedComparable?.adjusted_rate;
  const selectedComparableDateLine = buildComparableFactorLine(selectedComparableAdjustmentByKey.date);
  const selectedComparableBargainLine = buildComparableFactorLine(selectedComparableAdjustmentByKey.bargain);
  const selectedComparableMetroDetails = selectedComparableRawAdjustmentByKey.metro?.details || {};
  const selectedComparableAreaDetails = selectedComparableRawAdjustmentByKey.area?.details || {};
  const selectedComparableSecondGroupLines = [
    buildComparableFactorLine(selectedComparableAdjustmentByKey.metro),
    buildComparableFactorLine(selectedComparableAdjustmentByKey.area),
    buildComparableFactorLine(selectedComparableAdjustmentByKey.floor),
    buildComparableFactorLine(selectedComparableAdjustmentByKey.environment),
  ].filter(Boolean);
  const selectedComparableSelectionFormula = [
    `Класс аналога = ${selectedComparable?.class_offer || '—'}`,
    `Класс объекта оценки = ${selectedComparableSubjectClass}`,
    hasMeaningfulValue(selectedComparableAreaRatio)
      ? `So/Sa = ${formatNumber(selectedComparableSubjectArea, 2)} / ${formatNumber(selectedComparableAnalogArea, 2)} = ${formatNumber(selectedComparableAreaRatio, 3)}`
      : 'So/Sa = нет данных',
  ].join('\n');
  const selectedComparableRankingFormula = [
    hasMeaningfulValue(selectedComparable?.mahalanobisDistance)
      ? `Dмах = ${formatNumber(selectedComparable.mahalanobisDistance, 4)}`
      : 'Dмах = нет данных',
    hasMeaningfulValue(selectedComparable?.relevance_score)
      ? `Rрел = ${formatNumber(Number(selectedComparable.relevance_score) * 100, 1)}%`
      : 'Rрел = нет данных',
    hasMeaningfulValue(selectedComparable?.scale_similarity_score)
      ? `Rмасштаб = ${formatNumber(Number(selectedComparable.scale_similarity_score) * 100, 1)}%`
      : 'Rмасштаб = нет данных',
    selectedComparableRank > 0 ? `Место в выборке = ${selectedComparableRank}` : 'Место в выборке = —',
  ].join('\n');
  const selectedComparableFirstGroupFormula = [
    `Цисх = ${formatComparableRate(selectedComparable?.raw_rate || selectedComparable?.price_per_sqm_cleaned)}`,
    selectedComparableDateLine || `Кдата = ${formatPlainFactor(selectedComparable?.first_group_factor)}`,
    `Цдата = Цисх × Кдата = ${formatComparableRate(selectedComparable?.after_date)}`,
    selectedComparableBargainLine || 'Кторг = —',
    `Ц1гр = Цдата × Кторг = ${formatComparableRate(selectedComparable?.after_bargain)}`,
    `К1гр = Кдата × Кторг = ${formatPlainFactor(selectedComparable?.first_group_factor)}`,
  ].join('\n');
  const selectedComparableSecondGroupFormula = [
    `xо = ${formatDistanceKm(selectedComparableMetroDetails.subjectDistanceKm)}`,
    `xа = ${formatDistanceKm(selectedComparableMetroDetails.analogDistanceKm)}`,
    'y = 0.78 × x^-0.04',
    `Кметро = yо / yа = ${formatPlainFactor(selectedComparableAdjustmentByKey.metro?.factor)}`,
    hasMeaningfulValue(selectedComparableAreaDetails.exponentN)
      ? `n = ${formatNumber(selectedComparableAreaDetails.exponentN, 2)}`
      : 'n = —',
    hasMeaningfulValue(selectedComparableAreaDetails.subjectArea) &&
      hasMeaningfulValue(selectedComparableAreaDetails.analogArea) &&
      hasMeaningfulValue(selectedComparableAreaDetails.exponentN)
      ? `Кs = (So/Sa)^n = (${formatNumber(selectedComparableAreaDetails.subjectArea, 2)} / ${formatNumber(selectedComparableAreaDetails.analogArea, 2)})^${formatNumber(selectedComparableAreaDetails.exponentN, 2)} = ${formatPlainFactor(selectedComparableAdjustmentByKey.area?.factor)}`
      : `Кs = (So/Sa)^n = ${formatPlainFactor(selectedComparableAdjustmentByKey.area?.factor)}`,
    ...selectedComparableSecondGroupLines,
    `Кмульт = Кметро × Кs × Кэтаж × Кокружение = ${formatPlainFactor(selectedComparable?.second_group_multi_factor)}`,
    `Цитог = Ц1гр × Кмульт = ${formatComparableRate(selectedComparableCorrectedRate)}`,
  ].join('\n');
  const selectedComparableFinalFormula = [
    `Кобщ = К1гр × Кмульт = ${formatPlainFactor(selectedComparable?.total_adjustment_factor)}`,
    `Цитог = Цисх × Кобщ = ${formatComparableRate(selectedComparableCorrectedRate)}`,
    hasMeaningfulValue(selectedComparableWeight)
      ? `Вес аналога = ${formatNumber(Number(selectedComparableWeight) * 100, 1)}%`
      : 'Вес аналога = —',
    `Статус = ${selectedComparable?.included_in_rent_calculation === false ? 'исключён' : 'в расчёте'}`,
  ].join('\n');
  const selectedComparableSubjectEnvironment = formatEnvironmentLabel([
    questionnaire?.environmentCategory1,
    questionnaire?.environmentCategory2,
    questionnaire?.environmentCategory3,
    questionnaire?.environment_category_1,
    questionnaire?.environment_category_2,
    questionnaire?.environment_category_3,
    questionnaire?.environment,
  ]);
  const selectedComparableAnalogEnvironment = formatEnvironmentLabel([
    selectedComparable?.environment_category_1,
    selectedComparable?.environment_category_2,
    selectedComparable?.environment_category_3,
    selectedComparable?.environment,
  ]);

  const renderTopComparablesTable = () => {
    if (!hasTopComparables) {
      return null;
    }

    return (
      <div className="project-result-top-comparables-inline">
        <Text type="secondary" className="project-result-comparable-hint">
          Нажмите на строку, чтобы открыть детали отбора и пошаговый расчет корректировок по аналогу.
        </Text>
        <Table
          dataSource={topComparables}
          scroll={{ x: 1560 }}
          onRow={(record) => ({
            onClick: () => setSelectedComparable(record),
          })}
          rowClassName={() => 'project-result-comparable-row'}
          columns={[
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
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
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
    );
  };

  const handleExportPdf = async () => {
    const previousExpandedKeys = expandedStepKeys;
    const previousShowExcludedComparables = showExcludedComparables;
    const shouldExpandAll = detailCollapseKeys.some((key) => !expandedStepKeys.includes(key));
    const shouldExpandExcludedComparables = (
      !showExcludedComparables &&
      (breakdown?.market?.excludedComparables?.length || 0) > 0
    );

    try {
      setExportingPdf(true);

      if (shouldExpandAll) {
        setExpandedStepKeys(detailCollapseKeys);
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
    if (detailCollapseKeys.length) {
      setExpandedStepKeys(detailCollapseKeys);
    }
  }, [breakdown, detailCollapseKeys.join('|')]);

  if (!result && !loading) {
    return <Empty description="Результат пока не рассчитан" />;
  }

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
                  <Descriptions
                    column={1}
                    size="small"
                    bordered
                    style={{ marginTop: 16 }}
                  >
                    <Descriptions.Item label="Итого арендопригодная площадь">
                      <Space direction="vertical" size={0}>
                        <Text strong>
                          {formatSqm(sourceFloorLeasableTotal, 2)}
                        </Text>
                        <Text type="secondary">
                          {hasSourceFloorLeasableTotal && sourceFloorLeasableFormula
                            ? `${sourceFloorLeasableFormula} = ${formatNumber(sourceFloorLeasableTotal, 2)} м²`
                            : 'Сумма считается по колонке "Арендопригодная площадь, м²"'}
                        </Text>
                      </Space>
                    </Descriptions.Item>
                  </Descriptions>
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
                  value={formatPreciseCurrency(result?.land_share || 0)}
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
                  {/* <Title level={3}>
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
                  )} */}

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
                      items={(breakdown?.calculationSteps || []).flatMap((step) => {
                        const stepItem = {
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
                        };

                        if (Number(step.step) !== 1 || !hasTopComparables) {
                          return [stepItem];
                        }

                        return [
                          stepItem,
                          {
                            key: topComparablesDetailKey,
                            label: (
                              <div className="project-result-step-header">
                                <div>
                                  <Text type="secondary" className="project-result-step-eyebrow">
                                    После шага 1
                                  </Text>
                                  <div>
                                    <LineChartOutlined /> Аналогичные объекты (топ-10)
                                  </div>
                                </div>
                                <Text strong className="project-result-step-result">
                                  {topComparables.length} аналогов
                                </Text>
                              </div>
                            ),
                            children: renderTopComparablesTable(),
                          },
                        ];
                      })}
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

            <Modal
              open={Boolean(selectedComparable)}
              title={selectedComparable?.address_offer || 'Расчет по аналогу'}
              onCancel={() => setSelectedComparable(null)}
              footer={null}
              width={980}
              destroyOnHidden
            >
              {selectedComparable && (
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  <Text type="secondary">
                    Ниже показано не просто описание аналога, а логика его попадания в выборку:
                    от первичных фильтров и ранжирования до математического расчета скорректированной ставки.
                  </Text>

                  <ComparableMathStep
                    number={1}
                    title="Первичный фильтр и сопоставимость"
                    result={selectedComparable.included_in_rent_calculation === false ? 'не прошёл итоговый фильтр' : 'допущен к ранжированию'}
                    explanation="Аналог сначала проверяется на базовую пригодность: класс, общая площадь, наличие очищенной удельной цены и сопоставимых исходных признаков."
                    formula={selectedComparableSelectionFormula}
                    facts={[
                      'So — общая площадь оцениваемого объекта; Sa — общая площадь аналогичного объекта.',
                      `Адрес аналога: ${selectedComparable.address_offer || '—'}`,
                      `Метро объекта: ${formatDistanceKm(questionnaire?.metroDistance)}; метро аналога: ${formatDistanceKm(selectedComparable.distance_to_metro)}`,
                      `Этаж объекта: ${humanizeFloorCategory(selectedComparableFloorCategory)}; этаж аналога: ${humanizeFloorCategory(selectedComparable.floor_location)}`,
                      `Окружение объекта: ${selectedComparableSubjectEnvironment}; окружение аналога: ${selectedComparableAnalogEnvironment}`,
                    ]}
                  />

                  <ComparableMathStep
                    number={2}
                    title="Ранжирование аналога"
                    result={selectedComparableRank > 0 ? `место #${selectedComparableRank}` : 'место не определено'}
                    explanation="После фильтров аналог ранжируется по близости к объекту оценки. Это технический слой платформы поверх методики корректировок: он определяет, какие объекты попадут в итоговую выборку."
                    formula={selectedComparableRankingFormula}
                    facts={[
                      localizeResultText(
                        selectedComparable.decision_reason
                        || selectedComparable.exclusion_reason
                        || 'Оставлен в итоговой выборке после ранжирования'
                      ),
                    ]}
                  />

                  <ComparableMathStep
                    number={3}
                    title="Корректировки 1-й группы: дата предложения и скидка на торг"
                    result={formatComparableRate(selectedComparable?.after_bargain)}
                    explanation="Сначала удельная цена аналога приводится к дате оценки, затем от полученной ставки применяется единая скидка на торг."
                    formula={selectedComparableFirstGroupFormula}
                    facts={[
                      selectedComparableAdjustmentByKey.date?.details || null,
                      selectedComparableAdjustmentByKey.date?.reasoning || null,
                      selectedComparableAdjustmentByKey.bargain?.details || null,
                      selectedComparableAdjustmentByKey.bargain?.reasoning || null,
                    ]}
                  />

                  <ComparableMathStep
                    number={4}
                    title="Корректировки 2-й группы: метро, площадь, этаж, ближайшее окружение"
                    result={formatComparableRate(selectedComparableCorrectedRate)}
                    explanation="Во второй группе коэффициенты перемножаются в мультикорректировку. Для метро используется y = 0.78 × x^-0.04, для площади — Кs = (So/Sa)^n."
                    formula={selectedComparableSecondGroupFormula}
                    facts={selectedComparableAdjustmentRows
                      .filter((item) => ['metro', 'area', 'floor', 'environment'].includes(item.key))
                      .flatMap((item) => [
                        `${item.stage}: ${item.reasoning}`,
                        item.details,
                      ])}
                  />

                  <ComparableMathStep
                    number={5}
                    title="Итоговая рыночная ставка аналога"
                    result={selectedComparable.included_in_rent_calculation === false ? 'исключён' : 'в расчёте'}
                    explanation="Итоговая ставка аналога получается умножением ставки после первой группы на мультикорректировку второй группы. Затем аналог либо остаётся в диапазоне отбора, либо исключается как выброс."
                    formula={selectedComparableFinalFormula}
                    facts={[
                      selectedComparable.included_in_rent_calculation === false
                        ? `Причина исключения: ${localizeResultText(selectedComparable.exclusion_reason || 'не указана')}`
                        : `В итоговую ставку передана скорректированная ставка: ${formatComparableRate(selectedComparableCorrectedRate)}`,
                      hasMeaningfulValue(selectedComparableWeight)
                        ? `Вес аналога в выборке: ${formatPercent(Number(selectedComparableWeight) * 100, 1)}`
                        : 'Вес аналога не задан отдельно; используется равновесная выборка или усреднение по ставкам.',
                    ]}
                  />
                </Space>
              )}
            </Modal>

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

            {/* {debugModeEnabled && breakdown?.assumptions?.length > 0 && (
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
            )} */}

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
                        <Tag color="processing">Контур по координатам</Tag>
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
