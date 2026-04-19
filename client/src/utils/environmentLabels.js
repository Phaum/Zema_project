export const ENVIRONMENT_CATEGORY_LABELS = Object.freeze({
  prime_business: 'деловая активность высокого уровня',
  urban_business: 'городская деловая среда',
  mixed_urban: 'смешанная городская среда',
  residential_mixed: 'смешанная жилая среда',
  industrial_edge: 'промышленная периферия',
  warehouse_industrial: 'складская и промышленная зона',
  peripheral_low_activity: 'периферийная зона с низкой активностью',
  residential: 'жилая застройка',
  industrial: 'промзона',
});

const ENVIRONMENT_SPLIT_PATTERN = /\s*(?:\/|,|;|\|)\s*/u;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function translateEnvironmentCategory(value) {
  if (value === null || value === undefined || value === '') return '';

  const text = String(value).trim();
  if (!text || text === '—') return text;

  const parts = text.split(ENVIRONMENT_SPLIT_PATTERN).filter(Boolean);
  if (parts.length > 1) {
    return parts.map(translateEnvironmentCategory).join(' / ');
  }

  const key = text.toLowerCase();
  return ENVIRONMENT_CATEGORY_LABELS[key] || text;
}

export function formatEnvironmentCategories(values = [], separator = ', ') {
  const labels = values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(translateEnvironmentCategory)
    .filter(Boolean);

  return labels.length ? labels.join(separator) : '—';
}

export function localizeEnvironmentCategoryText(value) {
  if (value === null || value === undefined || value === '') return value;

  return Object.entries(ENVIRONMENT_CATEGORY_LABELS).reduce((text, [key, label]) => {
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(key)}(?=$|[^A-Za-z0-9_])`, 'gi');
    return text.replace(pattern, `$1${label}`);
  }, String(value));
}
