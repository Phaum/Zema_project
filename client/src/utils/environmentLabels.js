export const ENVIRONMENT_CATEGORY_LABELS = Object.freeze({
  historical_center: 'культурный и исторический центр',
  business_activity_center: 'центры деловой активности',
  multi_apartment_residential: 'многоквартирная жилая застройка',
  midrise_residential: 'среднеэтажная жилая застройка',
  industrial_zone: 'окраины городов, промзоны',
  prime_business: 'центры деловой активности',
  urban_business: 'общественно-деловая застройка',
  mixed_urban: 'общественно-деловая застройка',
  residential_mixed: 'многоквартирная жилая застройка',
  industrial_edge: 'окраины городов, промзоны',
  warehouse_industrial: 'промзона',
  residential: 'многоквартирная жилая застройка',
  industrial: 'промзона',
  business: 'общественно-деловая застройка',
  'деловая активность высокого уровня': 'центры деловой активности',
  'городская деловая среда': 'общественно-деловая застройка',
  'смешанная городская среда': 'общественно-деловая застройка',
  'смешанная жилая среда': 'многоквартирная жилая застройка',
  'промышленная периферия': 'окраины городов, промзоны',
  'складская и промышленная зона': 'промзона',
  'жилая застройка': 'многоквартирная жилая застройка',
});

const IGNORED_ENVIRONMENT_CATEGORY_KEYS = new Set([
  'peripheral_low_activity',
  'район крупных автомагистралей города',
  'периферийная зона с низкой активностью',
]);

const ENVIRONMENT_SPLIT_PATTERN = /\s*(?:\/|;|\|)\s*/u;

function normalizeEnvironmentCategoryKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

export function isIgnoredEnvironmentCategory(value) {
  return IGNORED_ENVIRONMENT_CATEGORY_KEYS.has(normalizeEnvironmentCategoryKey(value));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function translateEnvironmentCategory(value) {
  if (value === null || value === undefined || value === '') return '';

  const text = String(value).trim();
  if (!text || text === '—') return text;
  if (isIgnoredEnvironmentCategory(text)) return '';

  const parts = text.split(ENVIRONMENT_SPLIT_PATTERN).filter(Boolean);
  if (parts.length > 1) {
    return parts.map(translateEnvironmentCategory).filter(Boolean).join(' / ');
  }

  const key = normalizeEnvironmentCategoryKey(text);
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
  if (isIgnoredEnvironmentCategory(value)) return '';

  return Object.entries(ENVIRONMENT_CATEGORY_LABELS).reduce((text, [key, label]) => {
    if (/^[a-z0-9_]+$/i.test(key)) {
      const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(key)}(?=$|[^A-Za-z0-9_])`, 'gi');
      return text.replace(pattern, `$1${label}`);
    }

    return text.replace(new RegExp(escapeRegExp(key), 'gi'), label);
  }, String(value));
}
