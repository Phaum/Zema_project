export const AUTO_BUILDING_FIELDS = [
    { name: 'objectType', label: 'Вид объекта', type: 'text' },
    { name: 'objectAddress', label: 'Адрес объекта', type: 'textarea' },
    { name: 'totalArea', label: 'Общая площадь, м²', type: 'number' },
    { name: 'constructionYear', label: 'Год постройки', type: 'number' },
    { name: 'aboveGroundFloors', label: 'Надземные этажи', type: 'number' },
    { name: 'district', label: 'Район', type: 'text' },
    { name: 'nearestMetro', label: 'Ближайшее метро', type: 'text' },
    { name: 'metroDistance', label: 'Расстояние до метро, м', type: 'number' },
    { name: 'cadCost', label: 'Кадастровая стоимость, ₽', type: 'number' },
    { name: 'permittedUse', label: 'Назначение', type: 'textarea' },
    { name: 'landCadastralNumber', label: 'Кадастровый номер участка', type: 'text' },
    { name: 'landArea', label: 'Площадь участка, м²', type: 'number' },
    { name: 'landCadCost', label: 'Кадастровая стоимость участка, ₽', type: 'number' },
    { name: 'totalOksAreaOnLand', label: 'Общая площадь ОКС на участке, м²', type: 'number' },
    { name: 'leasableArea', label: 'Арендопригодная площадь, м²', type: 'number', onlyForMethods: ['actual_market'] },
];

export const QUESTIONNAIRE_SOURCE_FIELDS = [
    { name: 'projectName', label: 'Название проекта', type: 'text' },
    { name: 'valuationDate', label: 'Дата оценки', type: 'date' },
    { name: 'buildingCadastralNumber', label: 'Кадастровый номер здания', type: 'text' },
    { name: 'objectType', label: 'Вид объекта', type: 'text' },
    { name: 'actualUse', label: 'Тип здания', type: 'text' },
    { name: 'objectAddress', label: 'Адрес объекта', type: 'textarea' },
    { name: 'businessCenterClass', label: 'Класс БЦ', type: 'text', fallbackNames: ['marketClassResolved'] },
    { name: 'totalArea', label: 'Общая площадь', type: 'area' },
    { name: 'constructionYear', label: 'Год постройки', type: 'number' },
    { name: 'aboveGroundFloors', label: 'Надземные этажи', type: 'number' },
    { name: 'undergroundFloors', label: 'Подземные этажи', type: 'number' },
    { name: 'hasBasementFloor', label: 'Цокольный этаж', type: 'yesno' },
    { name: 'district', label: 'Район', type: 'text' },
    { name: 'nearestMetro', label: 'Ближайшее метро', type: 'text' },
    { name: 'metroDistance', label: 'Расстояние до метро, м', type: 'distance' },
    { name: 'cadCost', label: 'Кадастровая стоимость, ₽', type: 'currency' },
    { name: 'permittedUse', label: 'Назначение', type: 'textarea' },
    { name: 'landCadastralNumber', label: 'Кадастровый номер участка', type: 'text' },
    { name: 'landArea', label: 'Площадь участка', type: 'area' },
    { name: 'landCadCost', label: 'Кадастровая стоимость участка', type: 'currency' },
    { name: 'totalOksAreaOnLand', label: 'Общая площадь ОКС на участке', type: 'area' },
    { name: 'leasableArea', label: 'Арендопригодная площадь', type: 'area' },
    { name: 'occupiedArea', label: 'Занятая площадь по договорам аренды', type: 'area' },
];

const LEGACY_AUTO_SOURCE_FIELDS = new Set([
    'objectAddress',
    'totalArea',
    'constructionYear',
    'aboveGroundFloors',
    'district',
    'nearestMetro',
    'metroDistance',
    'cadCost',
    'permittedUse',
    'landCadastralNumber',
    'landArea',
    'landCadCost',
    'totalOksAreaOnLand',
    'leasableArea',
    'mapPointLat',
    'mapPointLng',
]);

const MANUAL_ONLY_SOURCE_FIELDS = new Set([
    'occupiedArea',
]);

export function normalizeQuestionnaireFieldSourceHints(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return Object.entries(value).reduce((accumulator, [fieldName, source]) => {
        const normalizedFieldName = String(fieldName || '').trim();
        const normalizedSource = String(source || '').trim();

        if (!normalizedFieldName || !normalizedSource) {
            return accumulator;
        }

        accumulator[normalizedFieldName] = normalizedSource;
        return accumulator;
    }, {});
}

export function formatQuestionnaireFieldSourceLabel(source) {
    const normalized = String(source || '').trim();

    if (!normalized) return 'не указан';
    if (normalized === 'manual_input') return 'вручную';
    if (normalized === 'manual_map_selection') return 'выбор на карте';
    if (normalized === 'reverse_geocode') return 'геокодирование по координатам';
    if (normalized === 'geocode_by_address') return 'геокодирование по адресу';
    if (normalized === 'geocode_by_address_refined') return 'уточнено по адресу объекта';
    if (normalized === 'geocode_by_address_primary') return 'координаты определены по адресу';
    if (normalized === 'derived_from_floor_sum') return 'сумма по этажам';
    if (normalized === 'market_offers_exact_object') return 'рыночная база по объекту';
    if (normalized === 'market_offers_district_class') return 'рыночная база по району и классу';
    if (normalized === 'geo_service') return 'геосервис';
    if (normalized === 'environment_analysis_cache') return 'кэш анализа окружения';
    if (normalized === 'derived_from_market_class') return 'выведено из рыночного класса';
    if (normalized === 'derived_from_rental_rate_manual_action') return 'определено по ставке аренды';
    if (normalized === 'derived_from_occupied_and_leasable_area') return 'выведено из площадей';
    if (normalized === 'resolved_from_cadastral_quarter') return 'кадастровый квартал';
    if (normalized === 'legacy_autofill_building') return 'ранее автозаполнено по зданию';
    if (normalized === 'legacy_autofill_land') return 'ранее автозаполнено по участку';
    if (normalized.includes('nspd') || normalized.includes('reestrnet')) return 'НСПД / кадастровый источник';
    return normalized.replace(/_/g, ' ');
}

export function isAutomaticQuestionnaireSource(source) {
    const normalized = String(source || '').trim().toLowerCase();

    if (!normalized) return false;

    return !normalized.startsWith('manual');
}

function inferLegacyFieldSource(fieldName, questionnaire = {}) {
    if (!LEGACY_AUTO_SOURCE_FIELDS.has(fieldName)) {
        return null;
    }

    if (['landCadastralNumber', 'landArea', 'landCadCost', 'totalOksAreaOnLand'].includes(fieldName)) {
        return questionnaire?.nspdLandLoaded ? 'legacy_autofill_land' : null;
    }

    return questionnaire?.nspdBuildingLoaded ? 'legacy_autofill_building' : null;
}

function resolveDescriptorValue(descriptor, questionnaire = {}) {
    const candidateNames = [descriptor.name, ...(descriptor.fallbackNames || [])];

    for (const fieldName of candidateNames) {
        const value = questionnaire?.[fieldName];

        if (hasMeaningfulValue(value)) {
            return {
                fieldName,
                value,
            };
        }
    }

    return {
        fieldName: descriptor.name,
        value: null,
    };
}

export function getQuestionnaireSourceEntries(questionnaire = {}) {
    const sourceHints = normalizeQuestionnaireFieldSourceHints(questionnaire?.fieldSourceHints);

    return QUESTIONNAIRE_SOURCE_FIELDS.reduce((entries, descriptor) => {
        const { fieldName, value } = resolveDescriptorValue(descriptor, questionnaire);

        if (!hasMeaningfulValue(value)) {
            return entries;
        }

        const rawSource = sourceHints[fieldName] || inferLegacyFieldSource(fieldName, questionnaire);
        const source = MANUAL_ONLY_SOURCE_FIELDS.has(fieldName) && isAutomaticQuestionnaireSource(rawSource)
            ? null
            : rawSource;

        entries.push({
            ...descriptor,
            fieldName,
            value,
            source: source || null,
            isAutomatic: isAutomaticQuestionnaireSource(source),
        });

        return entries;
    }, []);
}

export function getQuestionnaireSourceBuckets(questionnaire = {}) {
    const entries = getQuestionnaireSourceEntries(questionnaire);

    return {
        autoFields: entries.filter((entry) => entry.isAutomatic),
        manualFields: entries.filter((entry) => !entry.isAutomatic),
    };
}

export function hasMeaningfulValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'number') return Number.isFinite(value);
    return String(value).trim() !== '';
}

export function buildGeneratedFloorTemplates({
    aboveGroundFloors,
    undergroundFloors,
    hasBasementFloor,
}) {
    const generatedFloors = [];
    const above = Number(aboveGroundFloors) || 0;
    const underground = Number(undergroundFloors) || 0;
    const hasBasement = hasBasementFloor === 'yes';

    for (let i = 1; i <= underground; i += 1) {
        generatedFloors.push({
            id: `underground_${i}`,
            floorLocation: underground === 1 ? 'Подвал' : `Подвал ${i}`,
            floorCategory: 'underground',
            name: underground === 1 ? 'Подвал' : `Подвал ${i}`,
            area: 0,
            leasableArea: 0,
            avgLeasableRoomArea: 0,
            premisesPurpose: '',
            occupiedArea: 0,
            isGenerated: true,
        });
    }

    if (hasBasement) {
        generatedFloors.push({
            id: 'basement',
            floorLocation: 'Цокольный',
            floorCategory: 'basement',
            name: 'Цокольный',
            area: 0,
            leasableArea: 0,
            avgLeasableRoomArea: 0,
            premisesPurpose: '',
            occupiedArea: 0,
            isGenerated: true,
        });
    }

    if (above >= 1) {
        generatedFloors.push({
            id: 'above_1',
            floorLocation: 'Первый этаж',
            floorCategory: 'first',
            name: 'Первый этаж',
            area: 0,
            leasableArea: 0,
            avgLeasableRoomArea: 0,
            premisesPurpose: '',
            occupiedArea: 0,
            isGenerated: true,
        });
    }

    if (above >= 2) {
        generatedFloors.push({
            id: 'above_2',
            floorLocation: 'Второй этаж',
            floorCategory: 'second',
            name: 'Второй этаж',
            area: 0,
            leasableArea: 0,
            avgLeasableRoomArea: 0,
            premisesPurpose: '',
            occupiedArea: 0,
            isGenerated: true,
        });
    }

    if (above >= 3) {
        generatedFloors.push({
            id: 'above_3_plus',
            floorLocation: above === 3 ? 'Третий этаж' : 'Третий этаж и выше',
            floorCategory: 'third_plus',
            name: above === 3 ? 'Третий этаж' : 'Третий этаж и выше',
            repeatFrom: 3,
            repeatTo: above,
            area: 0,
            leasableArea: 0,
            avgLeasableRoomArea: 0,
            premisesPurpose: '',
            occupiedArea: 0,
            isGenerated: true,
        });
    }

    return generatedFloors;
}

function normalizeFloorText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ');
}

function resolveTemplateIdByText(floor = {}) {
    const combined = normalizeFloorText(
        [floor.id, floor.floorCategory, floor.floorLocation, floor.name, floor.label].join(' ')
    );

    if (!combined) return null;
    if (combined.includes('underground_')) return String(floor.id);
    if (combined.includes('цок')) return 'basement';
    const undergroundMatch = combined.match(/(?:подвал|подзем)[^\d]*(\d+)/);
    if (undergroundMatch) return `underground_${undergroundMatch[1]}`;
    if (combined.includes('подвал') || combined.includes('подзем')) return 'underground_1';
    if (combined.includes('перв') || combined.includes('1 этаж')) return 'above_1';
    if (combined.includes('втор') || combined.includes('2 этаж')) return 'above_2';
    if (combined.includes('трет') || combined.includes('3 этаж') || combined.includes('выше')) return 'above_3_plus';
    if (combined.includes('first')) return 'above_1';
    if (combined.includes('second')) return 'above_2';
    if (combined.includes('third')) return 'above_3_plus';
    return null;
}

function sanitizeFloor(floor, index) {
    return {
        ...floor,
        id: floor?.id || `saved_floor_${index + 1}`,
        area: floor?.area ?? 0,
        leasableArea: floor?.leasableArea ?? 0,
        avgLeasableRoomArea: floor?.avgLeasableRoomArea ?? 0,
        premisesPurpose: floor?.premisesPurpose ?? floor?.purpose ?? '',
        occupiedArea: floor?.occupiedArea ?? 0,
    };
}

export function normalizeLoadedFloors(questionnaire = {}) {
    const rawFloors = Array.isArray(questionnaire?.floors) ? questionnaire.floors : [];
    const floors = rawFloors.map(sanitizeFloor);
    const templates = buildGeneratedFloorTemplates(questionnaire);
    const usedFloorIds = new Set();

    if (!templates.length) {
        return floors;
    }

    const byId = new Map(floors.map((floor) => [String(floor.id), floor]));
    const byResolvedTemplateId = new Map();

    floors.forEach((floor) => {
        const resolvedTemplateId = resolveTemplateIdByText(floor);
        if (resolvedTemplateId && !byResolvedTemplateId.has(resolvedTemplateId)) {
            byResolvedTemplateId.set(resolvedTemplateId, floor);
            return;
        }
    });

    const normalizedGenerated = templates.map((template) => {
        const matched =
            byId.get(String(template.id)) ||
            byResolvedTemplateId.get(String(template.id)) ||
            null;

        if (!matched) {
            return template;
        }

        usedFloorIds.add(matched.id);

        return {
            ...matched,
            ...template,
            area: matched.area ?? 0,
            leasableArea: matched.leasableArea ?? 0,
            avgLeasableRoomArea: matched.avgLeasableRoomArea ?? 0,
            premisesPurpose: matched.premisesPurpose ?? matched.purpose ?? '',
            occupiedArea: matched.occupiedArea ?? 0,
            isGenerated: true,
        };
    });

    const manualFloors = floors
        .filter((floor) => !usedFloorIds.has(floor.id) && !templates.some((template) => template.id === floor.id))
        .map((floor) => ({
            ...floor,
            isGenerated: Boolean(floor.isGenerated),
        }));

    return [...normalizedGenerated, ...manualFloors];
}

export function normalizeObjectTypeValue(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase();

    if (!normalized) {
        return 'здание';
    }

    if (
        normalized.includes('помещ') ||
        normalized === 'premises' ||
        normalized === 'office' ||
        normalized === 'retail'
    ) {
        return 'помещение';
    }

    if (
        normalized.includes('здан') ||
        normalized === 'building'
    ) {
        return 'здание';
    }

    if (['офис', 'торговля'].includes(normalized)) {
        return 'помещение';
    }

    return 'здание';
}

export function buildQuestionnaireFormValues(data = {}, project = null) {
    const normalizedFloors = normalizeLoadedFloors(data);

    return {
        ...data,
        projectName: data?.projectName || project?.name || '',
        objectType: normalizeObjectTypeValue(data?.objectType),
        hasBasementFloor: data?.hasBasementFloor === 'yes' ? 'yes' : 'no',
        leasableArea: data?.leasableArea ?? null,
        occupiedArea: data?.occupiedArea ?? null,
        fieldSourceHints: normalizeQuestionnaireFieldSourceHints(data?.fieldSourceHints),
        floors: normalizedFloors,
    };
}

export function getMissingAutoBuildingFields(questionnaire = {}) {
    return AUTO_BUILDING_FIELDS.filter((field) => {
        if (Array.isArray(field.onlyForMethods) && !field.onlyForMethods.includes(questionnaire?.calculationMethod)) {
            return false;
        }

        return !hasMeaningfulValue(questionnaire?.[field.name]);
    });
}

export function getAvailableAutoBuildingFields(questionnaire = {}) {
    return AUTO_BUILDING_FIELDS.filter((field) => hasMeaningfulValue(questionnaire?.[field.name]));
}
