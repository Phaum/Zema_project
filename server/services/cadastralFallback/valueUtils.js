export function cleanupText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function capitalizeFirst(value) {
  const text = cleanupText(value);
  if (!text) {
    return null;
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function deriveCadastralQuarter(cadastralNumber) {
  const text = cleanupText(cadastralNumber);
  if (!text) {
    return null;
  }

  const parts = text.split(':');
  if (parts.length < 3) {
    return null;
  }

  return parts.slice(0, 3).join(':');
}

export function parseLocalizedNumber(value) {
  const text = cleanupText(value);
  if (!text) {
    return null;
  }

  const normalized = text
    .replace(/[^\d,.\-]/g, '')
    .replace(/(,)(?=.*[,])/g, '')
    .replace(/\.(?=.*\.)/g, '')
    .replace(',', '.');

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function parseAreaText(value) {
  const text = cleanupText(value);
  if (!text) {
    return null;
  }

  const match = text.match(/^([\d\s,.-]+)\s*(.*)$/);
  if (!match) {
    return null;
  }

  const areaValue = parseLocalizedNumber(match[1]);
  if (areaValue === null) {
    return null;
  }

  return {
    value: areaValue,
    unit: cleanupText(match[2]) || 'кв. м',
    text,
  };
}

export function parseMoneyText(value, defaultUnit = 'руб.') {
  const text = cleanupText(value);
  if (!text) {
    return null;
  }

  const match = text.match(/^([\d\s,.-]+)\s*(.*)$/);
  if (!match) {
    return null;
  }

  const numericValue = parseLocalizedNumber(match[1]);
  if (numericValue === null) {
    return null;
  }

  return {
    value: numericValue,
    unit: cleanupText(match[2]) || defaultUnit,
    text,
  };
}

export function calculateSpecificCost(cadastralCost, area) {
  if (!cadastralCost?.value || !area?.value) {
    return null;
  }

  return {
    value: cadastralCost.value / area.value,
    unit: 'руб./ кв. м',
  };
}
