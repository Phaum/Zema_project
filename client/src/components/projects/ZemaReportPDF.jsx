import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { translateEnvironmentCategory } from '../../utils/environmentLabels';

export const exportZemaReportToPDF = async (projectId, data) => {
  const {
    assessmentDate = 'не указана',
    calculationDate = null,
    reportDate: providedReportDate = null,
    objectAddress = 'не указан',
    cadastralNumber = 'не указан',
    totalArea = 0,
    constructionYear = null,
    constructionCompletionYear = null,
    commissioningYear = null,
    estimatedValue = 0,
    estimatedValueMin = 0,
    estimatedValueMax = 0,
    pricePerM2 = 0,
    pricePerM2Min = 0,
    pricePerM2Max = 0,
    cadastralValue = null,
    grossIncome = 0,
    egi = 0,
    noi = 0,
    estimatedValueWithLand = 0,
    landCadastralNumber = '—',
    landArea = 0,
    landAreaUsed = 0,
    landAreaUsedPercent = 0,
    landShareValue = 0,
    leasableArea = null,
    leasableAreaPercent = null,
    marketAverageRate = 0,
    marketRateMin = 0,
    marketRateMax = 0,
    objectType = 'не указан',
    propertyType = 'не указан',
    businessClass = 'не классифицирован',
    classConfirmedByRGUD = false,
    district = 'не указан',
    nearestMetro = 'не указано',
    distanceToMetro = null,
    isHistoricalCenter = false,
    territorialZone = 'не определена',
    objectLocationDescription = '—',
    nearbyEnvironment = '—',
    floors = [],
    comparables = [],
    quarterlyDistribution = [],
    marketDynamics = [],
    photoUrls = [],
    mapImageUrl = null,
    environmentMapImageUrl = null,
    comparablesMapImageUrl = null,
    quarterlyChartUrl = null,
    dynamicsChartUrl = null,
  } = data;

  const reportDate = providedReportDate || calculationDate || new Date().toISOString();

  const formatNumber = (num, digits = 2) => {
    if (num === undefined || num === null || isNaN(num)) return '0';
    return Number(num).toLocaleString('ru-RU', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  };

  const formatCurrency = (num, digits = 2) =>
    (num === undefined || num === null || isNaN(num)) ? '0 ₽' : `${formatNumber(num, digits)} ₽`;

  const formatOptionalNumber = (num, digits = 2) => {
    const value = Number(num);
    return Number.isFinite(value) && value > 0 ? formatNumber(value, digits) : '—';
  };

  const hasPositiveNumber = (num) => {
    const value = Number(num);
    return Number.isFinite(value) && value > 0;
  };

  const formatPreciseNumber = (num, maxFractionDigits = 6) => {
    if (num === undefined || num === null || isNaN(num)) return '0';

    return Number(num).toLocaleString('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFractionDigits,
    });
  };

  const formatPreciseCurrency = (num) =>
    (num === undefined || num === null || isNaN(num)) ? '0 ₽' : `${formatPreciseNumber(num)} ₽`;

  const formatDate = (date) => {
    if (!date || date === 'не указана') return 'не указана';
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    return d.toLocaleDateString('ru-RU');
  };

  const formatYesNo = (val) => (val === true || val === 'yes' || val === 'Да' ? 'Да' : 'Нет');

  const hasTextValue = (value) => {
    if (value === undefined || value === null) return false;
    const text = String(value).trim().toLowerCase();
    return Boolean(text) && !['—', '-', 'null', 'undefined', 'не указан', 'не указано', 'не определена', 'не определен'].includes(text);
  };

  const hasBooleanLikeValue = (value) => {
    if (value === true || value === false) return true;
    const normalized = String(value || '').trim().toLowerCase();
    return ['yes', 'no', 'да', 'нет', 'true', 'false', '1', '0'].includes(normalized);
  };

  const formatOptionalYesNo = (value) => (
    hasBooleanLikeValue(value) ? formatYesNo(value) : '—'
  );

  const formatYear = (value) => {
    if (value === undefined || value === null || value === '') return '';
    const normalized = String(value).trim();
    return normalized && normalized !== '0' ? normalized : '';
  };

  const completionYearDisplay = formatYear(constructionCompletionYear);
  const commissioningYearDisplay = formatYear(commissioningYear || constructionYear);
  const yearDisplay = `${completionYearDisplay || '—'} / ${commissioningYearDisplay || '—'}`;

  const cadastralDisplay = (!cadastralValue || cadastralValue === 0)
    ? 'не определена'
    : formatPreciseCurrency(cadastralValue);
  const cadastralUnitDisplay = (!cadastralValue || cadastralValue === 0 || !totalArea)
    ? 'не определена'
    : formatNumber(cadastralValue / totalArea, 2);

  let diffPercent = '0';
  if (cadastralValue && cadastralValue !== 0 && estimatedValue && estimatedValue !== 0) {
    diffPercent = (((estimatedValue / cadastralValue) - 1) * 100).toFixed(1);
  } else if (cadastralValue === 0 || !cadastralValue) {
    diffPercent = 'не определен (нет кадастровой стоимости)';
  }

  const formatDistanceKm = (value) => {
    if (value === undefined || value === null || value === '' || isNaN(value)) return '—';
    const numeric = Number(value);
    const km = numeric > 100 ? numeric / 1000 : numeric;
    return formatPreciseNumber(km, 6);
  };

  const distanceToMetroKm = formatDistanceKm(distanceToMetro);
  const effectiveEstimatedValueWithLand = estimatedValueWithLand
    || ((estimatedValue || 0) + (landShareValue || 0));
  const landAreaUsedDisplay = [
    `${formatNumber(landAreaUsed)} м²`,
    `${formatNumber(landAreaUsedPercent)}%`,
    `${formatCurrency(landShareValue)}`,
  ].join(' / ');

  const getComparableOfferRate = (comp = {}) => {
    const candidates = [
      comp.rawOfferRate,
      comp.price_per_sqm_month,
      comp.offer_rate,
      comp.advertised_rate,
      comp.raw_rate,
      comp.price_per_sqm_cleaned,
      comp.price_per_sqm,
      comp.unit_price,
    ];

    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }

    return 0;
  };

  const normalizedComparables = comparables
    .filter(comp => comp?.included_in_rent_calculation !== false)
    .map(comp => ({
      ...comp,
      rawOfferRate: getComparableOfferRate(comp),
      correctedRate: comp.corrected_rate ?? comp.adjusted_rate ?? comp.correctedRate ?? null,
      priceWithoutVatRate: comp.price_without_vat_per_sqm_month ?? comp.priceWithoutVatRate ?? null,
      sourceCleanedRate: comp.raw_rate ?? comp.base_rate ?? comp.price_per_sqm_cleaned ?? comp.price_per_sqm ?? comp.unit_price ?? null,
      price_per_sqm_cleaned: comp.price_per_sqm_cleaned ?? comp.price_per_sqm ?? comp.unit_price ?? 0,
      buildingName: comp.buildingName || comp.building_name || comp.complex_name || '—',
      class_offer: comp.class_offer || '—',
      address_offer: comp.address_offer || '—',
      area_total: comp.area_total || 0,
      floor: comp.floor || '—',
      district: comp.district || '—',
      nearestMetro: comp.nearestMetro || '—',
      distanceToMetro: comp.distanceToMetro,
      isHistoricalCenter: comp.environment_historical_center ?? comp.is_historical_center ?? comp.isHistoricalCenter,
      territorialZone: comp.territorialZone || comp.ter_zone || comp.zone_code || '—',
      territorialZoneDescription: comp.territorialZoneDescription || comp.zone_name || comp.zoneName || comp.zone_description || comp.zoneDescription || '—',
      nearbyEnvironment: translateEnvironmentCategory(comp.nearbyEnvironment || comp.environment || '—'),
    }));

  const loadLogoDataURL = () => new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = '/zema_logo.png';
  });

  const logoDataURL = await loadLogoDataURL();
  const logoSvg = logoDataURL
    ? `<img src="${logoDataURL}" alt="ЗЕМА" style="height: 45px; object-fit: contain;">`
    : '<span class="logo-text">ЗЕМА</span>';

  const renderFloorsTable = () => {
    if (!floors.length) return '<p>Нет данных</p>';
    return `
      <table class="data-table">
        <thead><tr><th>Этаж</th><th>Площадь, м²</th><th>Арендопригодная, м²</th><th>Ср. площадь помещения, м²</th><th>Назначение помещений</th></tr></thead>
        <tbody>
          ${floors.map(f => `<tr>
            <td>${f.floorLocation || f.name || '—'}</td>
            <td>${formatNumber(f.area)}</td>
            <td>${formatNumber(f.leasableArea)}</td>
            <td>${formatNumber(f.avgRoomArea)}</td>
            <td>${f.premisesPurpose || f.purpose || '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;
  };

  const renderComparablesTable = () => {
    if (!normalizedComparables.length) return '<p>Нет данных об аналогах</p>';
    const hasVatCleanedRates = normalizedComparables.some((item) => hasPositiveNumber(item.priceWithoutVatRate));
    const cleanupSteps = [
      'ставка из объявления',
      hasVatCleanedRates ? 'цена очищенная от НДС' : null,
      'Цисх, очищенная от коммунальных услуг и эксплуатационных расходов',
      'ставка после корректировки',
    ].filter(Boolean).join(' &rarr; ');
    const columns = [
      { title: 'Наименование', render: (c) => c.buildingName },
      { title: 'Класс', render: (c) => c.class_offer },
      { title: 'Адрес', render: (c) => c.address_offer },
      { title: 'Площадь, м²', render: (c) => formatOptionalNumber(c.area_total), hasValue: (c) => hasPositiveNumber(c.area_total) },
      { title: 'Этаж', render: (c) => c.floor },
      { title: 'Ставка из объявления, ₽/м²', render: (c) => formatOptionalNumber(c.rawOfferRate), hasValue: (c) => hasPositiveNumber(c.rawOfferRate) },
      {
        title: 'Цена очищенная от НДС, ₽/м²',
        render: (c) => formatOptionalNumber(c.priceWithoutVatRate),
        hasValue: (c) => hasPositiveNumber(c.priceWithoutVatRate),
        optional: true,
      },
      { title: 'Цисх: очищена от КУ и ЭР, ₽/м²', render: (c) => formatOptionalNumber(c.sourceCleanedRate), hasValue: (c) => hasPositiveNumber(c.sourceCleanedRate) },
      { title: 'Ставка после корректировки, ₽/м²', render: (c) => formatOptionalNumber(c.correctedRate), hasValue: (c) => hasPositiveNumber(c.correctedRate) },
      { title: 'Район', render: (c) => c.district, hasValue: (c) => hasTextValue(c.district), optional: true },
      { title: 'Тер. зона', render: (c) => c.territorialZone, hasValue: (c) => hasTextValue(c.territorialZone), optional: true },
      { title: 'Расшифровка тер. зоны', render: (c) => c.territorialZoneDescription, hasValue: (c) => hasTextValue(c.territorialZoneDescription), optional: true },
      { title: 'Ист. центр', render: (c) => formatOptionalYesNo(c.isHistoricalCenter), hasValue: (c) => hasBooleanLikeValue(c.isHistoricalCenter), optional: true },
      { title: 'Ближ. окружение', render: (c) => c.nearbyEnvironment, hasValue: (c) => hasTextValue(c.nearbyEnvironment), optional: true },
      { title: 'Метро', render: (c) => c.nearestMetro, hasValue: (c) => hasTextValue(c.nearestMetro), optional: true },
      { title: 'Расст., км', render: (c) => formatDistanceKm(c.distanceToMetro), hasValue: (c) => hasPositiveNumber(c.distanceToMetro), optional: true },
    ].filter((column) => !column.optional || normalizedComparables.some(column.hasValue));

    return `
      <p class="table-note">Этапы очистки ставки: ${cleanupSteps}.</p>
      <table class="data-table comparables-table">
        <thead>
          <tr>
            ${columns.map((column) => `<th>${column.title}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${normalizedComparables.map(c => `<tr>
            ${columns.map((column) => `<td>${column.render(c) || '—'}</td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    `;
  };

  const getPageHTML = (pageNumber) => {
    const header = `
      <div class="header">
        <div class="logo-area">${logoSvg}</div>
        <div class="report-meta">Платформа рыночной экспресс-оценки<br>коммерческой недвижимости | zema.codeak.ru</div>
      </div>
    `;
    const footer = '<div class="footer">ЗЕМА — платформа рыночной экспресс-оценки коммерческой недвижимости | zema.codeak.ru</div>';

    switch (pageNumber) {
      case 1:
        return `
          <div class="page">
            ${header}
            <div class="title">ЗАКЛЮЧЕНИЕ</div>
            <div class="subtitle">от ${formatDate(reportDate)}</div>
            <div class="section">
              <div class="section-title">РЕЗУЛЬТАТЫ ОЦЕНКИ</div>
              <table class="data-table">
                <tr><td style="width:55%"><strong>Рыночная стоимость по состоянию на ${formatDate(assessmentDate)} (без учета стоимости земельного участка)</strong></td><td class="value-highlight">${formatCurrency(estimatedValue)}</td></tr>
                <tr><td><strong>Удельная рыночная стоимость</strong></td><td>${formatNumber(pricePerM2)} руб./м²</td></tr>
                <tr><td><strong>Диапазон рыночной стоимости</strong></td><td>${formatCurrency(estimatedValueMin)} – ${formatCurrency(estimatedValueMax)}</td></tr>
                <tr><td><strong>Диапазон удельной рыночной стоимости</strong></td><td>${formatNumber(pricePerM2Min)} – ${formatNumber(pricePerM2Max)} руб./м²</td></tr>
                <tr><td><strong>Кадастровая стоимость (на 01.01.2025)</strong></td><td>${cadastralDisplay}</td></tr>
                <tr><td><strong>Удельная кадастровая стоимость</strong></td><td>${cadastralUnitDisplay} руб./м²</td></tr>
                <tr><td><strong>% расхождения</strong></td><td>${diffPercent}</td></tr>
              </table>
            </div>
            ${footer}
          </div>
        `;

      case 2:
        return `
          <div class="page">
            ${header}
            <div class="section">
              <div class="section-title">ИСХОДНЫЕ ДАННЫЕ</div>
              <table class="data-table">
                <tr><td style="width:45%"><strong>Дата оценки</strong></td><td>${formatDate(assessmentDate)}</td></tr>
                <tr><td><strong>Вид объекта</strong></td><td>${objectType}</td></tr>
                <tr><td><strong>Тип объекта</strong></td><td>${propertyType}</td></tr>
                <tr><td><strong>Класс БЦ</strong></td><td>${businessClass}</td></tr>
                <tr><td><strong>Кадастровый номер объекта оценки</strong></td><td>${cadastralNumber}</td></tr>
                <tr><td><strong>Адрес</strong></td><td>${objectAddress}</td></tr>
                <tr><td><strong>Завершение строительства / ввод в эксплуатацию</strong></td><td>${yearDisplay}</td></tr>
                <tr><td><strong>Общая площадь, м²</strong></td><td>${formatNumber(totalArea)}</td></tr>
                <tr><td colspan="2"><strong>Состав (этажи)</strong>${renderFloorsTable()}</td></tr>
                <tr><td><strong>Арендопригодная площадь, м² (%)</strong></td><td>${formatNumber(leasableArea)} (${formatNumber(leasableAreaPercent)}%)</td></tr>
                <tr><td><strong>Кадастровый номер земельного участка, на котором расположен объект оценки</strong></td><td>${landCadastralNumber}</td></tr>
                <tr><td><strong>Площадь земельного участка, м²</strong></td><td>${formatNumber(landArea)}</td></tr>
                <tr><td><strong>Площадь ЗУ в расчёте, м² (%)</strong></td><td>${landAreaUsedDisplay}</td></tr>
              </table>
            </div>
            ${footer}
          </div>
        `;

      case 3:
        return `
          <div class="page">
            ${header}
            <div class="section">
              <div class="section-title">СОБРАННЫЕ ДАННЫЕ ОБ ОБЪЕКТЕ</div>
              <div class="photo-placeholder">
                ${photoUrls.length ? `<img src="${photoUrls[0]}" style="max-width:100%; max-height:240px;">` : 'Фото не предоставлены'}
              </div>
              <table class="data-table">
                <tr><td style="width:40%"><strong>Район</strong></td><td>${district}</td></tr>
                <tr><td><strong>Ближайшая станция метро</strong></td><td>${nearestMetro}</td></tr>
                <tr><td><strong>Расстояние до метро, км</strong></td><td>${distanceToMetroKm}</td></tr>
                <tr><td><strong>Исторический центр</strong></td><td>${formatYesNo(isHistoricalCenter)}</td></tr>
                <tr><td><strong>Ближайшее окружение (600 м)</strong></td><td>${translateEnvironmentCategory(nearbyEnvironment)}</td></tr>
              </table>
              ${mapImageUrl ? `<img src="${mapImageUrl}" class="map-image">` : ''}
              ${environmentMapImageUrl ? `
                <div class="mini-section-title">АНАЛИЗ БЛИЖАЙШЕГО ОКРУЖЕНИЯ</div>
                <img src="${environmentMapImageUrl}" class="map-image environment-map-image">
              ` : ''}
            </div>
            ${footer}
          </div>
        `;

      case 4:
        return `
          <div class="page page-landscape" data-orientation="landscape">
            ${header}
            <div class="section">
              <div class="section-title">ОБЪЕКТЫ-АНАЛОГИ, ВЗЯТЫЕ В РАСЧЕТ</div>
              ${renderComparablesTable()}
              <p style="margin-top:8px"><strong>Средняя ставка:</strong> ${formatNumber(marketAverageRate)} руб./м² (диапазон: ${formatNumber(marketRateMin)} – ${formatNumber(marketRateMax)} руб./м²)</p>
            </div>
            ${footer}
          </div>
        `;

      case 5:
        if (!comparablesMapImageUrl) return '';
        return `
          <div class="page page-landscape" data-orientation="landscape">
            ${header}
            <div class="section">
              <div class="section-title">КАРТА ОБЪЕКТОВ-АНАЛОГОВ</div>
              <p style="margin-bottom:8px"><strong>Средняя ставка:</strong> ${formatNumber(marketAverageRate)} руб./м² (диапазон: ${formatNumber(marketRateMin)} – ${formatNumber(marketRateMax)} руб./м²)</p>
              <img src="${comparablesMapImageUrl}" class="map-image comparables-map-image">
            </div>
            ${footer}
          </div>
        `;

      case 6:
        return `
          <div class="page">
            ${header}
            <div class="section">
              <div class="section-title">РАСЧЁТ РЫНОЧНОЙ СТОИМОСТИ</div>
              <table class="data-table">
                <tr><td style="width:55%"><strong>Потенциальный валовой доход (ПВД), руб./год</strong></td><td>${formatCurrency(grossIncome)}</td></tr>
                <tr><td><strong>Действительный валовой доход (ДВД), руб./год</strong></td><td>${formatCurrency(egi)}</td></tr>
                <tr><td><strong>Чистый операционный доход (ЧОД), руб./год</strong></td><td>${formatCurrency(noi)}</td></tr>
                <tr><td><strong>Рыночная стоимость единого объекта недвижимости (здание + земельный участок), руб., без НДС</strong></td><td>${formatCurrency(effectiveEstimatedValueWithLand)}</td></tr>
                <tr><td><strong>Рыночная стоимость объекта оценки (без стоимости земельного участка), руб., без НДС</strong></td><td class="value-highlight">${formatCurrency(estimatedValue)}</td></tr>
                <tr><td><strong>Диапазон рыночной стоимости (без земли)</strong></td><td>${formatCurrency(estimatedValueMin)} – ${formatCurrency(estimatedValueMax)}</td></tr>
                <tr><td><strong>Удельная рыночная стоимость (без земли), руб./м²</strong></td><td>${formatNumber(pricePerM2)}</td></tr>
                <tr><td><strong>Кадастровая стоимость, руб.</strong></td><td>${cadastralDisplay}</td></tr>
                <tr><td><strong>Удельная кадастровая стоимость, руб./м²</strong></td><td>${cadastralUnitDisplay}</td></tr>
                <tr><td><strong>% расхождения</strong></td><td>${diffPercent}</td></tr>
              </table>
            </div>
            <div class="disclaimer">
              <p><strong>Обращаем Ваше внимание</strong>, что данное заключение не является Отчетом об оценке и для него не требуется соответствие Федеральному закону «Об оценочной деятельности в Российской Федерации» от 29.07.1998 № 135-ФЗ и Федеральным стандартам оценки.</p>
              <p>Для подготовки отчета об индивидуальной рыночной оценке рекомендуем обратиться в компанию «АВЕРС»: <a href="https://www.avg.ru/">www.avg.ru</a>, +7 (812) 320-97-75.</p>
            </div>
            ${footer}
          </div>
        `;

      default:
        return '';
    }
  };

  const fullHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',Roboto,'Times New Roman',serif; background:#fff; width:900px; margin:0 auto; font-size:12px; }
    .page { width:580px; background:#fff; margin:0 auto; }
    .page-landscape { width:900px; }
    .header { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1e466e; padding-bottom:8px; margin-bottom:18px; }
    .logo-area .logo-text { font-size:24px; font-weight:800; color:#1e466e; }
    .report-meta { font-size:10px; color:#555; text-align:right; }
    .title { font-size:24px; font-weight:800; text-align:center; margin:6px 0 4px; color:#1e466e; }
    .subtitle { text-align:center; font-size:13px; color:#666; margin-bottom:20px; }
    .section { margin-bottom:20px; }
    .section-title { font-size:18px; font-weight:700; margin-bottom:10px; border-bottom:1px solid #ccc; color:#1e466e; }
    .mini-section-title { font-size:14px; font-weight:700; margin:14px 0 6px; color:#1e466e; }
    .data-table { width:100%; border-collapse:collapse; margin-bottom:12px; font-size:11px; }
    .data-table th { background:#f0f4f8; border:1px solid #aaa; padding:6px 5px; font-weight:700; }
    .data-table td { border:1px solid #aaa; padding:5px; vertical-align:top; }
    .table-note { font-size:9px; color:#555; margin:0 0 6px; line-height:1.35; }
    .comparables-table { font-size:7px; table-layout:auto; }
    .comparables-table th, .comparables-table td { padding:3px 2px; }
    .value-highlight { font-weight:800; color:#1e466e; }
    .map-image { width:100%; margin:10px 0; border:1px solid #ddd; }
    .disclaimer { margin-top:20px; padding:10px; background:#fef3e2; border-left:4px solid #f0ad4e; font-size:9px; color:#555; }
    .footer { text-align:center; font-size:9px; color:#888; margin-top:14px; padding-top:6px; border-top:1px solid #ddd; }
    .photo-placeholder { background:#fafafa; border:1px dashed #aaa; padding:8px; text-align:center; font-size:11px; margin-bottom:12px; }
  </style></head><body>
    ${Array.from({ length: 6 }, (_, i) => getPageHTML(i + 1)).join('')}
  </body></html>`;

  const previousScroll = {
    x: window.scrollX,
    y: window.scrollY,
  };
  const container = document.createElement('div');
  container.innerHTML = fullHTML;
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '900px';
  container.style.backgroundColor = '#fff';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '-1';
  container.style.contain = 'layout style paint';
  document.body.appendChild(container);

  try {
    await new Promise(resolve => setTimeout(resolve, 300));

    const horizontalMargin = 15;
    const verticalMargin = 15;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pages = container.querySelectorAll('.page');
    for (let i = 0; i < pages.length; i++) {
      const orientation = pages[i].dataset.orientation === 'landscape' ? 'landscape' : 'portrait';
      if (i !== 0) {
        pdf.addPage('a4', orientation);
      }

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const availableWidth = pdfWidth - horizontalMargin * 2;
      const availableHeight = pdfHeight - verticalMargin * 2;
      const canvas = await html2canvas(pages[i], {
        scale: 2.5,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        allowTaint: false,
        scrollX: 0,
        scrollY: 0,
      });

      const imgWidthMm = (canvas.width * 25.4) / 96;
      const imgHeightMm = (canvas.height * 25.4) / 96;
      const scale = Math.min(availableWidth / imgWidthMm, availableHeight / imgHeightMm);
      const finalWidthMm = imgWidthMm * scale;
      const finalHeightMm = imgHeightMm * scale;
      const xOffset = horizontalMargin + (availableWidth - finalWidthMm) / 2;
      const yOffset = verticalMargin;

      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', xOffset, yOffset, finalWidthMm, finalHeightMm, undefined, 'FAST');
    }

    pdf.save(`Справка_ЗЕМА_${projectId || 'проект'}_${Date.now()}.pdf`);
  } finally {
    document.body.removeChild(container);
    window.scrollTo(previousScroll.x, previousScroll.y);
  }
};
