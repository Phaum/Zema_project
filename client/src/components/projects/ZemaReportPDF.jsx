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
    diffPercent = ((1 - estimatedValue / cadastralValue) * 100).toFixed(1);
  } else if (cadastralValue === 0 || !cadastralValue) {
    diffPercent = 'не определен (нет кадастровой стоимости)';
  }

  const distanceToMetroKm = distanceToMetro
    ? (distanceToMetro > 100 ? (distanceToMetro / 1000).toFixed(1) : distanceToMetro.toFixed(1))
    : '—';

  const normalizedComparables = comparables.map(comp => ({
    ...comp,
    price_per_sqm_cleaned: comp.price_per_sqm_cleaned ?? comp.price_per_sqm ?? comp.unit_price ?? 0,
    buildingName: comp.buildingName || comp.building_name || comp.complex_name || '—',
    class_offer: comp.class_offer || '—',
    address_offer: comp.address_offer || '—',
    area_total: comp.area_total || 0,
    floor: comp.floor || '—',
    district: comp.district || '—',
    nearestMetro: comp.nearestMetro || '—',
    distanceToMetro: comp.distanceToMetro,
    isHistoricalCenter: comp.isHistoricalCenter,
    territorialZone: comp.territorialZone || '—',
    nearbyEnvironment: comp.nearbyEnvironment || '—',
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
    return `
      <table class="data-table comparables-table">
        <thead>
          <tr>
            <th>Наименование</th>
            <th>Класс</th>
            <th>Адрес</th>
            <th>Площадь, м²</th>
            <th>Этаж</th>
            <th>Ставка, ₽/м²</th>
            <th>Район</th>
            <th>Метро</th>
            <th>Расст., км</th>
          </tr>
        </thead>
        <tbody>
          ${normalizedComparables.map(c => `<tr>
            <td>${c.buildingName}</td>
            <td>${c.class_offer}</td>
            <td>${c.address_offer}</td>
            <td>${formatNumber(c.area_total)}</td>
            <td>${c.floor}</td>
            <td>${formatNumber(c.price_per_sqm_cleaned)}</td>
            <td>${c.district}</td>
            <td>${c.nearestMetro}</td>
            <td>${c.distanceToMetro?.toFixed(1) || '—'}</td>
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
                <tr><td><strong>Диапазон стоимости</strong></td><td>${formatCurrency(estimatedValueMin)} – ${formatCurrency(estimatedValueMax)}</td></tr>
                <tr><td><strong>Удельная стоимость</strong></td><td>${formatNumber(pricePerM2)} руб./м²</td></tr>
                <tr><td><strong>Диапазон удельной стоимости</strong></td><td>${formatNumber(pricePerM2Min)} – ${formatNumber(pricePerM2Max)} руб./м²</td></tr>
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
                <tr><td><strong>Площадь ЗУ в расчёте, м² (%)</strong></td><td>${formatNumber(landAreaUsed)} (${formatNumber(landAreaUsedPercent)}%)</td></tr>
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
                <tr><td><strong>Описание расположения</strong></td><td>${objectLocationDescription}</td></tr>
                <tr><td><strong>Ближайшая станция метро</strong></td><td>${nearestMetro}</td></tr>
                <tr><td><strong>Расстояние до метро, км</strong></td><td>${distanceToMetroKm}</td></tr>
                <tr><td><strong>Исторический центр</strong></td><td>${formatYesNo(isHistoricalCenter)}</td></tr>
                <tr><td><strong>Территориальная зона</strong></td><td>${territorialZone}</td></tr>
                <tr><td><strong>Ближайшее окружение (600 м)</strong></td><td>${translateEnvironmentCategory(nearbyEnvironment)}</td></tr>
              </table>
              ${mapImageUrl ? `<img src="${mapImageUrl}" class="map-image">` : ''}
            </div>
            ${footer}
          </div>
        `;

      case 4:
        return `
          <div class="page">
            ${header}
            <div class="section">
              <div class="section-title">ОБЪЕКТЫ-АНАЛОГИ, ВЗЯТЫЕ В РАСЧЕТ</div>
              ${renderComparablesTable()}
              <p style="margin-top:8px"><strong>Средневзвешенная ставка:</strong> ${formatNumber(marketAverageRate)} руб./м² (диапазон: ${formatNumber(marketRateMin)} – ${formatNumber(marketRateMax)})</p>
              ${comparablesMapImageUrl ? `<img src="${comparablesMapImageUrl}" class="map-image">` : ''}
            </div>
            ${footer}
          </div>
        `;

      case 5:
        return `
          <div class="page">
            ${header}
            <div class="section">
              <div class="section-title">АНАЛИТИКА</div>
              <p><strong>Распределение объектов, выставленных в аренду, поквартально (2025 год)</strong></p>
              ${quarterlyDistribution.length ? `
                <table class="data-table">
                  <thead><tr><th>Квартал</th><th>Интервал, м²</th><th>Кол-во</th></tr></thead>
                  <tbody>${quarterlyDistribution.map(q => `<tr><td>${q.quarter}</td><td>${q.interval}</td><td>${q.count}</td></tr>`).join('')}</tbody>
                </table>
              ` : '<p>Нет данных</p>'}
              ${quarterlyChartUrl ? `<img src="${quarterlyChartUrl}" class="map-image">` : ''}
              <p style="margin-top:22px"><strong>Средневзвешенная удельная арендная ставка, руб./кв.м, без НДС (класс ${businessClass})</strong></p>
              ${marketDynamics.length ? `
                <table class="data-table">
                  <thead><tr><th>Квартал</th><th>Класс</th><th>Ставка</th></tr></thead>
                  <tbody>${marketDynamics.map(d => `<tr><td>${d.quarter}</td><td>${d.class}</td><td>${formatNumber(d.rate)}</td></tr>`).join('')}</tbody>
                </table>
              ` : '<p>Нет данных</p>'}
              ${dynamicsChartUrl ? `<img src="${dynamicsChartUrl}" class="map-image">` : ''}
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
                <tr><td><strong>Рыночная стоимость единого объекта недвижимости (здание + земельный участок), руб., без НДС</strong></td><td>${formatCurrency(estimatedValueWithLand)}</td></tr>
                <tr><td><strong>Рыночная стоимость объекта оценки (без стоимости земельного участка), руб., без НДС</strong></td><td class="value-highlight">${formatCurrency(estimatedValue)}</td></tr>
                <tr><td><strong>Диапазон стоимости (без земли)</strong></td><td>${formatCurrency(estimatedValueMin)} – ${formatCurrency(estimatedValueMax)}</td></tr>
                <tr><td><strong>Удельная стоимость (без земли), руб./м²</strong></td><td>${formatNumber(pricePerM2)}</td></tr>
                <tr><td><strong>Кадастровая стоимость, руб.</strong></td><td>${cadastralDisplay}</td></tr>
                <tr><td><strong>Удельная кадастровая стоимость, руб./м²</strong></td><td>${cadastralUnitDisplay}</td></tr>
                <tr><td><strong>% расхождения</strong></td><td>${diffPercent}</td></tr>
              </table>
            </div>
            <div class="disclaimer">
              <p><strong>Обращаем Ваше внимание</strong>, что данное заключение не является Отчетом об оценке и для него не требуется соответствие Федеральному закону «Об оценочной деятельности в Российской Федерации» от 29.07.1998 № 135-ФЗ и Федеральным стандартам оценки.</p>
              <p>Рекомендуем обратиться в компанию «АВЕРС»: <a href="https://www.avg.ru/">www.avg.ru</a>, +7 (812) 320-97-75.</p>
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
    body { font-family:'Segoe UI',Roboto,'Times New Roman',serif; background:#fff; width:580px; margin:0 auto; font-size:12px; }
    .page { width:100%; background:#fff; }
    .header { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1e466e; padding-bottom:8px; margin-bottom:18px; }
    .logo-area .logo-text { font-size:24px; font-weight:800; color:#1e466e; }
    .report-meta { font-size:10px; color:#555; text-align:right; }
    .title { font-size:24px; font-weight:800; text-align:center; margin:6px 0 4px; color:#1e466e; }
    .subtitle { text-align:center; font-size:13px; color:#666; margin-bottom:20px; }
    .section { margin-bottom:20px; }
    .section-title { font-size:18px; font-weight:700; margin-bottom:10px; border-bottom:1px solid #ccc; color:#1e466e; }
    .data-table { width:100%; border-collapse:collapse; margin-bottom:12px; font-size:11px; }
    .data-table th { background:#f0f4f8; border:1px solid #aaa; padding:6px 5px; font-weight:700; }
    .data-table td { border:1px solid #aaa; padding:5px; vertical-align:top; }
    .comparables-table { font-size:8px; }
    .comparables-table th, .comparables-table td { padding:3px 2px; }
    .value-highlight { font-weight:800; color:#1e466e; }
    .map-image { width:100%; margin:10px 0; border:1px solid #ddd; }
    .disclaimer { margin-top:20px; padding:10px; background:#fef3e2; border-left:4px solid #f0ad4e; font-size:9px; color:#555; }
    .footer { text-align:center; font-size:9px; color:#888; margin-top:14px; padding-top:6px; border-top:1px solid #ddd; }
    .photo-placeholder { background:#fafafa; border:1px dashed #aaa; padding:8px; text-align:center; font-size:11px; margin-bottom:12px; }
  </style></head><body>
    ${Array.from({ length: 6 }, (_, i) => getPageHTML(i + 1)).join('')}
  </body></html>`;

  const container = document.createElement('div');
  container.innerHTML = fullHTML;
  container.style.position = 'fixed';
  container.style.top = '-10000px';
  container.style.left = '-10000px';
  container.style.width = '580px';
  container.style.backgroundColor = '#fff';
  document.body.appendChild(container);

  await new Promise(resolve => setTimeout(resolve, 300));

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const horizontalMargin = 15;
  const availableWidth = pdfWidth - horizontalMargin * 2;

  const pages = container.querySelectorAll('.page');
  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], {
      scale: 2.5,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      allowTaint: false,
    });

    const imgWidthMm = (canvas.width * 25.4) / 96;
    const imgHeightMm = (canvas.height * 25.4) / 96;
    const scale = availableWidth / imgWidthMm;
    const finalWidthMm = imgWidthMm * scale;
    const finalHeightMm = imgHeightMm * scale;
    const xOffset = horizontalMargin + (availableWidth - finalWidthMm) / 2;
    const yOffset = 15;

    if (i !== 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', xOffset, yOffset, finalWidthMm, finalHeightMm, undefined, 'FAST');
  }

  pdf.save(`Справка_ЗЕМА_${projectId || 'проект'}_${Date.now()}.pdf`);
  document.body.removeChild(container);
};
