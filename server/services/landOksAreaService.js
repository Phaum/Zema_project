import { CadastralData } from '../models/index.js';
import { getRegisteredOksObjectsOnLandFromNspd } from './nspdParserService.js';

function normalizeCadastralNumber(value) {
    return String(value || '').trim();
}

function normalizeText(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ');
}

function toNumberOrNull(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const numeric = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
    return Number.isFinite(numeric) ? numeric : null;
}

function formatAreaValue(value) {
    const numeric = toNumberOrNull(value);

    if (!Number.isFinite(numeric)) {
        return null;
    }

    return Number(numeric.toFixed(2));
}

export function isCountableRegisteredOksObject(objectType) {
    const normalized = normalizeText(objectType).toLowerCase();

    if (!normalized) {
        return false;
    }

    if (normalized.includes('земель') || normalized.includes('участ')) {
        return false;
    }

    if (normalized.includes('сооруж')) {
        return false;
    }

    return (
        normalized.includes('здан') ||
        normalized.includes('объект незаверш') ||
        normalized.includes('незаверш')
    );
}

function addObjectArea(areaByCadastralNumber, item, { source }) {
    const cadastralNumber = normalizeCadastralNumber(item?.cadastral_number);
    const objectType = normalizeText(item?.object_type);
    const totalArea = toNumberOrNull(item?.total_area);

    if (!cadastralNumber || !isCountableRegisteredOksObject(objectType)) {
        return false;
    }

    if (!Number.isFinite(totalArea) || totalArea <= 0) {
        return false;
    }

    areaByCadastralNumber.set(cadastralNumber, {
        cadastral_number: cadastralNumber,
        object_type: objectType,
        total_area: totalArea,
        source,
    });

    return true;
}

async function fetchLocalLinkedObjects(landCadastralNumber) {
    return CadastralData.findAll({
        where: {
            land_plot_cadastral_number: landCadastralNumber,
        },
        attributes: ['cadastral_number', 'object_type', 'total_area'],
    });
}

function addLocalObjects(areaByCadastralNumber, records, landCadastralNumber) {
    for (const record of records) {
        const plain = record?.get ? record.get({ plain: true }) : record;
        const cadastralNumber = normalizeCadastralNumber(plain?.cadastral_number);

        if (!cadastralNumber || cadastralNumber === landCadastralNumber) {
            continue;
        }

        addObjectArea(areaByCadastralNumber, plain, { source: 'local_cadastral_data' });
    }
}

export async function calculateRegisteredOksAreaOnLand(landCadastralNumber) {
    const normalizedLandNumber = normalizeCadastralNumber(landCadastralNumber);

    if (!normalizedLandNumber) {
        return {
            totalArea: null,
            objects: [],
            source: null,
            usedNspdObjectsList: false,
        };
    }

    const localRecords = await fetchLocalLinkedObjects(normalizedLandNumber);
    const localAreaByCadastralNumber = new Map();
    addLocalObjects(localAreaByCadastralNumber, localRecords, normalizedLandNumber);

    try {
        const nspdResult = await getRegisteredOksObjectsOnLandFromNspd(normalizedLandNumber);

        if (nspdResult.success && Array.isArray(nspdResult.objects) && nspdResult.objects.length) {
            const nspdAreaByCadastralNumber = new Map();

            for (const object of nspdResult.objects) {
                addObjectArea(nspdAreaByCadastralNumber, object, { source: 'nspd_land_objects' });
            }

            const nspdTotal = Array.from(nspdAreaByCadastralNumber.values())
                .reduce((sum, item) => sum + item.total_area, 0);

            if (nspdTotal > 0) {
                return {
                    totalArea: formatAreaValue(nspdTotal),
                    objects: Array.from(nspdAreaByCadastralNumber.values()),
                    source: 'nspd_land_objects',
                    usedNspdObjectsList: true,
                };
            }
        }
    } catch {
        // Fall back to locally cached linked records when the live NSPD objects tab is unavailable.
    }

    const localTotal = Array.from(localAreaByCadastralNumber.values())
        .reduce((sum, item) => sum + item.total_area, 0);

    return {
        totalArea: localTotal > 0 ? formatAreaValue(localTotal) : null,
        objects: Array.from(localAreaByCadastralNumber.values()),
        source: localTotal > 0 ? 'local_cadastral_data' : null,
        usedNspdObjectsList: false,
    };
}
