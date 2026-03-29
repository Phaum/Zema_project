function normalizeText(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ');
}

function uniqueValues(values = []) {
    const seen = new Set();
    const result = [];

    values
        .map((value) => normalizeText(value))
        .filter(Boolean)
        .forEach((value) => {
            const key = value.toLowerCase();
            if (seen.has(key)) {
                return;
            }

            seen.add(key);
            result.push(value);
        });

    return result;
}

export function isSuspiciousDistrictLabel(value) {
    const normalized = normalizeText(value).toLowerCase();

    if (!normalized) {
        return true;
    }

    if (/[№#]/u.test(normalized) || /\d/u.test(normalized)) {
        return true;
    }

    return /(улиц|просп|пр-кт|шосс|наб|переул|проезд|бульвар|аллея|дорог|тракт|округ|микрорайон|квартал)/iu.test(normalized);
}

export function normalizeDistrictLabel(value) {
    const normalized = normalizeText(value)
        .replace(/\s+кадастровый район$/iu, '')
        .replace(/\s+район$/iu, '')
        .trim();

    if (!normalized || isSuspiciousDistrictLabel(normalized)) {
        return null;
    }

    return normalized;
}

export function extractDistrictFromCadastralRecord(record = {}) {
    const rawPayload = record?.raw_payload_json || {};
    const candidates = [
        rawPayload?.match?.data?.cadastral_district,
        rawPayload?.match?.data?.details_ru?.['Кадастровый район'],
        rawPayload?.match?.raw?.html_fields?.['Кадастровый район'],
        rawPayload?.fallback?.cadastral_district,
        record?.district,
    ];

    for (const candidate of candidates) {
        const normalized = normalizeDistrictLabel(candidate);
        if (normalized) {
            return normalized;
        }
    }

    return null;
}

export function isPlausibleMetroDistanceMeters(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100000;
}

function ensureSpbPrefix(value) {
    const normalized = normalizeText(value);

    if (!normalized) {
        return '';
    }

    if (/санкт[-\s]?петербург/iu.test(normalized)) {
        return normalized;
    }

    return `Санкт-Петербург, ${normalized}`;
}

function cleanupAddressForQuery(value) {
    return normalizeText(value)
        .replace(/^Российская Федерация,\s*/iu, '')
        .replace(/внутригородское муниципальное образование города федерального значения Санкт-Петербурга\s*/iu, '')
        .replace(/муниципальный округ\s*№?\s*\d+\s*(?=,|улиц|просп|пр-кт|шосс|наб|переул|проезд|бульвар|аллея|дорог|$)/iu, '')
        .replace(/муниципальный округ\s+[\p{L}\s-]+(?=,|улиц|просп|пр-кт|шосс|наб|переул|проезд|бульвар|аллея|дорог|$)/iu, '')
        .replace(/муниципальный округ[^,]*,\s*/iu, '')
        .replace(/Северо-Западный федеральный округ,?\s*/iu, '')
        .replace(/\bг\.\s*Санкт-Петербург\b/giu, 'Санкт-Петербург')
        .replace(/\bг Санкт-Петербург\b/giu, 'Санкт-Петербург')
        .replace(/\s+,/g, ',')
        .replace(/,\s*,/g, ',')
        .replace(/\s+/g, ' ')
        .replace(/,\s*$/u, '')
        .trim();
}

function compactAddressForQuery(value) {
    return normalizeText(value)
        .replace(/(?:^|[\s,])дом\s*(\d+[^\s,]*)/iu, ' $1')
        .replace(/(?:^|[\s,])д\.\s*(\d+[^\s,]*)/iu, ' $1')
        .replace(/(?:^|[\s,])корпус\s*([\p{L}\p{N}-]+)/iu, ' к$1')
        .replace(/(?:^|[\s,])к\.\s*([\p{L}\p{N}-]+)/iu, ' к$1')
        .replace(/(?:^|[\s,])строение\s*([\p{L}\p{N}-]+)/iu, ' с$1')
        .replace(/(?:^|[\s,])стр\.\s*([\p{L}\p{N}-]+)/iu, ' с$1')
        .replace(/(?:^|[\s,])литера\s*([\p{L}\p{N}-]+)/iu, ' лит $1')
        .replace(/,\s*к/giu, ' к')
        .replace(/,\s*с/giu, ' с')
        .replace(/,\s*лит/giu, ' лит')
        .replace(/\s+,/g, ',')
        .replace(/,\s*,/g, ',')
        .replace(/\s+/g, ' ')
        .replace(/,\s*$/u, '')
        .trim();
}

function segmentLooksAddressSpecific(value) {
    const normalized = normalizeText(value).toLowerCase();

    if (!normalized) {
        return false;
    }

    return /\d/u.test(normalized)
        || /(улиц|просп|пр-кт|шосс|наб|переул|проезд|бульвар|аллея|дорог|тракт|дом|д\.|корп|к\.|строен|стр\.|лит)/iu.test(normalized);
}

function stripLeadingPoiSegments(value) {
    const parts = normalizeText(value)
        .split(',')
        .map((part) => normalizeText(part))
        .filter(Boolean);

    if (parts.length <= 1) {
        return normalizeText(value);
    }

    while (
        parts.length > 1
        && !segmentLooksAddressSpecific(parts[0])
        && parts.slice(1).some(segmentLooksAddressSpecific)
    ) {
        parts.shift();
    }

    return parts.join(', ');
}

export function buildGeocodeQueryVariants(address) {
    const base = cleanupAddressForQuery(address);

    if (!base) {
        return [];
    }

    const poiStripped = cleanupAddressForQuery(stripLeadingPoiSegments(address));
    const withCity = ensureSpbPrefix(base);
    const withCityNoPoi = ensureSpbPrefix(poiStripped);
    const compact = compactAddressForQuery(withCity);
    const compactWithoutPoi = compactAddressForQuery(withCityNoPoi);
    const withoutStructure = compact
        .replace(/(?:^|\s)с[0-9a-zа-я]{1,3}(?=$|\s|,)/iu, '')
        .replace(/(?:^|\s)лит\s*[0-9a-zа-я]{1,3}(?=$|\s|,)/iu, '')
        .replace(/^,\s*/u, '')
        .replace(/\s+/g, ' ')
        .trim();
    const withoutBuildingPart = withoutStructure
        .replace(/(?:^|\s)к[0-9a-zа-я]{1,3}(?=$|\s|,)/iu, '')
        .replace(/^,\s*/u, '')
        .replace(/\s+/g, ' ')
        .trim();

    return uniqueValues([
        compactWithoutPoi,
        compact,
        withoutStructure,
        withoutBuildingPart,
        withCityNoPoi,
        withCity,
        poiStripped,
        address,
    ]);
}
