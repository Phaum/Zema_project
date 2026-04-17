import html2pdf from 'html2pdf.js';
import { exportZemaReportToPDF } from '../components/projects/ZemaReportPDF';

const BASE_OPTIONS = {
  margin: [8, 8, 10, 8],
  image: { type: 'jpeg', quality: 0.98 },
  html2canvas: {
    scale: 2.2,
    useCORS: true,
    backgroundColor: '#ffffff',
    scrollX: 0,
    scrollY: 0,
    windowWidth: 1440,
  },
  jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' },
  pagebreak: {
    mode: ['css', 'legacy'],
    avoid: [
      '.project-result-pdf-avoid-break',
      '.project-result-metric-card',
      '.project-result-section-card',
      '.project-result-method-card',
      '.project-result-detail-block',
      '.ant-collapse-item',
      '.ant-descriptions',
      '.ant-table-wrapper',
      '.project-result-step-table',
      'thead',
      'tr',
    ],
    before: '.project-result-pdf-break-before',
  },
};

function sanitizeFilenamePart(value, fallback = 'проект') {
  const normalized = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, 80);
}

function buildResultPdfFilename(projectId, projectName) {
  const date = new Date().toLocaleDateString('ru-RU');
  const safeProjectName = sanitizeFilenamePart(projectName, `проект_${projectId}`);
  return `Результат_оценки_${safeProjectName}_${projectId}_${date}.pdf`;
}

export const exportToPDF = (element, filename, overrides = {}) => {
  const opt = {
    ...BASE_OPTIONS,
    ...overrides,
    filename,
    html2canvas: {
      ...BASE_OPTIONS.html2canvas,
      ...(overrides.html2canvas || {}),
    },
    jsPDF: {
      ...BASE_OPTIONS.jsPDF,
      ...(overrides.jsPDF || {}),
    },
    pagebreak: {
      ...BASE_OPTIONS.pagebreak,
      ...(overrides.pagebreak || {}),
    },
  };
  return html2pdf().set(opt).from(element).save();
};

// НОВАЯ ФУНКЦИЯ - экспорт в формате справки ЗЕМА
export const exportAsZemaReport = async (projectId, projectData) => {
  return exportZemaReportToPDF(projectId, projectData);
};

// Старая функция для обычного экспорта (оставляем на всякий случай)
function prepareResultExportClone(element) {
  const host = document.createElement('div');
  host.className = 'pdf-export-host';

  const clone = element.cloneNode(true);
  clone.classList.add('pdf-export-mode');
  clone.removeAttribute('id');

  clone
    .querySelectorAll(
      '.project-result-section-card, .project-result-metric-card, .project-result-method-card, .project-result-detail-block, .ant-collapse-item, .ant-table-wrapper, .project-result-step-table, .ant-descriptions'
    )
    .forEach((node) => node.classList.add('project-result-pdf-avoid-break'));

  host.appendChild(clone);
  document.body.appendChild(host);

  const style = document.createElement('style');
  style.setAttribute('data-pdf-export-style', 'true');
  style.textContent = DETAILED_EXPORT_CSS;
  document.head.appendChild(style);

  return { host, clone, style };
}

const DETAILED_EXPORT_CSS = `
  .pdf-export-host {
    position: fixed !important;
    left: 0 !important;
    top: 0 !important;
    width: 1280px !important;
    padding: 0 !important;
    background: #ffffff !important;
    opacity: 0.01 !important;
    pointer-events: none !important;
    z-index: -1 !important;
    overflow: hidden !important;
  }

  .pdf-export-mode {
    width: 1280px !important;
    background: #ffffff !important;
    color: #101828 !important;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }

  .pdf-export-mode .project-result-actions,
  .pdf-export-mode [data-html2canvas-ignore="true"] {
    display: none !important;
  }
`;

function cleanupResultExportClone({ host, style }) {
  if (host?.parentNode) {
    host.parentNode.removeChild(host);
  }
  if (style?.parentNode) {
    style.parentNode.removeChild(style);
  }
}

export const exportDetailedResultToPDF = async (projectId, projectName = '') => {
  const element = document.getElementById('result-content');
  if (!element) {
    console.error('Result content element not found');
    return;
  }

  const filename = buildResultPdfFilename(projectId, projectName);
  const exportContext = prepareResultExportClone(element);

  try {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await exportToPDF(exportContext.clone, filename, {
      margin: [6, 6, 8, 6],
      jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4' },
      html2canvas: { scale: 2.4, windowWidth: 1440 },
    });
  } finally {
    cleanupResultExportClone(exportContext);
  }
};