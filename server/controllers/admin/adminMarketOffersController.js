import XLSX from 'xlsx';
import { Op } from 'sequelize';
import MarketOffer from '../../models/MarketOffer.js';
import { writeAdminAudit } from '../../utils/adminAudit.js';
import {
    MARKET_OFFER_COLUMNS,
    REQUIRED_MARKET_OFFER_HEADERS,
} from '../../utils/marketOfferTemplate.js';
import { msk64ToWgs84 } from "../../utils/coordsConverter.js";
import { fetchOsmEnvironment, classifyEnvironment } from '../../utils/osmEnvironmentClassifier.js';
import { resolveHistoricalCenterForCoords } from '../../utils/historicalCenterResolver.js';


function normalizeString(value) {
    if (value === undefined || value === null || value === '') return null;
    return String(value).trim();
}

function normalizeNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const normalized = String(value)
        .trim()
        .replace(/\s+/g, '')
        .replace(',', '.');

    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
}

function normalizeDate(value) {
    if (!value) return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    if (typeof value === 'number') {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) {
            const yyyy = String(parsed.y).padStart(4, '0');
            const mm = String(parsed.m).padStart(2, '0');
            const dd = String(parsed.d).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        }
    }

    const raw = String(value).trim();

    const ruMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (ruMatch) {
        return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }

    return null;
}

function mapRowToPayload(row, sourceSheetName) {
    const payload = { source_sheet_name: sourceSheetName };

    for (const col of MARKET_OFFER_COLUMNS) {
        const raw = row[col.header];

        if (col.type === 'number') {
            payload[col.field] = normalizeNumber(raw);
        } else if (col.type === 'date') {
            payload[col.field] = normalizeDate(raw);
        } else {
            payload[col.field] = normalizeString(raw);
        }
    }

    return payload;
}

function validateHeaders(rows) {
    if (!rows.length) {
        return { ok: false, error: 'Выбранный лист пустой' };
    }

    const headers = Object.keys(rows[0] || {});
    const missing = REQUIRED_MARKET_OFFER_HEADERS.filter((header) => !headers.includes(header));

    if (missing.length) {
        return {
            ok: false,
            error: `В листе отсутствуют обязательные колонки: ${missing.join(', ')}`,
        };
    }

    return { ok: true };
}

export async function getAdminMarketOffers(req, res) {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
        const search = String(req.query.search || '').trim();

        const where = {};
        if (search) {
            where[Op.or] = [
                { external_id: { [Op.iLike]: `%${search}%` } },
                { address_offer: { [Op.iLike]: `%${search}%` } },
                { building_cadastral_number: { [Op.iLike]: `%${search}%` } },
                { district: { [Op.iLike]: `%${search}%` } },
                { model_functional: { [Op.iLike]: `%${search}%` } },
            ];
        }

        const { rows, count } = await MarketOffer.findAndCountAll({
            where,
            order: [['offer_date', 'DESC'], ['id', 'DESC']],
            offset: (page - 1) * pageSize,
            limit: pageSize,
        });

        return res.json({
            items: rows,
            total: count,
            page,
            pageSize,
        });
    } catch (error) {
        console.error('getAdminMarketOffers error:', error);
        return res.status(500).json({ error: 'Не удалось загрузить рыночную базу' });
    }
}

export async function importMarketOffers(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Не передан Excel-файл' });
        }

        const sheetName = String(req.body.sheetName || '').trim();
        if (!sheetName) {
            return res.status(400).json({ error: 'Нужно передать sheetName' });
        }

        const workbook = XLSX.read(req.file.buffer, {
            type: 'buffer',
            cellDates: true,
        });

        if (!workbook.SheetNames.includes(sheetName)) {
            return res.status(400).json({
                error: `Лист "${sheetName}" не найден`,
                availableSheets: workbook.SheetNames,
            });
        }

        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
            defval: null,
            raw: false,
        });

        const validation = validateHeaders(rows);
        if (!validation.ok) {
            return res.status(400).json({
                error: validation.error,
                availableSheets: workbook.SheetNames,
            });
        }

        let inserted = 0;
        let updated = 0;
        const errors = [];

        for (let index = 0; index < rows.length; index += 1) {
            try {
                const payload = mapRowToPayload(rows[index], sheetName);

                if (!payload.external_id) {
                    errors.push({
                        row: index + 2,
                        error: 'Пустой ID',
                    });
                    continue;
                }

                const existing = await MarketOffer.findOne({
                    where: { external_id: payload.external_id },
                });

                if (existing) {
                    await existing.update(payload);
                    updated += 1;
                } else {
                    await MarketOffer.create(payload);
                    inserted += 1;
                }
            } catch (error) {
                errors.push({
                    row: index + 2,
                    error: error.message,
                });
            }
        }

        await writeAdminAudit({
            adminUserId: req.user.id,
            entityType: 'market_offer',
            entityId: 'bulk_import',
            action: 'import_excel',
            meta: {
                fileName: req.file.originalname,
                sheetName,
                inserted,
                updated,
                errorsCount: errors.length,
            },
        });

        return res.json({
            success: true,
            fileName: req.file.originalname,
            sheetName,
            inserted,
            updated,
            errorsCount: errors.length,
            errors: errors.slice(0, 100),
        });
    } catch (error) {
        console.error('importMarketOffers error:', error);
        return res.status(500).json({ error: 'Не удалось импортировать Excel-файл' });
    }
}

export async function exportMarketOffers(req, res) {
    try {
        const items = await MarketOffer.findAll({
            order: [['offer_date', 'DESC'], ['id', 'DESC']],
        });

        const rows = items.map((item) => ({
            'ID': item.external_id,
            'Тип родительского объекта': item.parent_object_type,
            'Функционал для модели': item.model_functional,
            'подгруппа 2025': item.subgroup_2025,
            'Функция': item.function_name,
            'Общая площадь по объявлению, кв. м': item.area_total,
            'Класс  по объявлению': item.class_offer,
            'Метро': item.metro,
            'Адрес по объявлению': item.address_offer,
            'Здание': item.building_name,
            'Год постройки/ввода в эксплуатацию': item.year_built_commissioning,
            'Этаж расположения': item.floor_location,
            'Кол-во наземных этажей': item.above_ground_floors,
            'Кол-во этажей всего': item.total_floors,
            'Кол-во подземных этажей': item.underground_floors,
            ' Цена по объявлению (руб./месяц) ': item.price_total_month,
            ' Цена руб./кв.м./месяц ': item.price_per_sqm_month,
            'НДС': item.vat,
            'НДС_описание': item.vat_description,
            'Цена очищенная от НДС, руб./кв.м/мес.': item.price_without_vat_per_sqm_month,
            'Описание': item.description,
            'КУ': item.utilities_included,
            'Коммунальные_услуги_описание': item.utilities_description,
            'Эксплуатационные_расходы_описание': item.opex_description,
            'Удельная цена, руб./кв.м. (очищена от КУ и ЭР)': item.price_per_sqm_cleaned,
            'КН здания': item.building_cadastral_number,
            'x': item.x,
            'y': item.y,
            'Район': item.district,
            'Дата предложения': item.offer_date,
            'Квартал': item.quarter,
            'Состояние помещения': item.room_condition,
            'Ссылка на объявление': item.offer_url,
            'Принтскрин': item.screenshot,
        }));

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(rows, {
            header: MARKET_OFFER_COLUMNS.map((item) => item.header),
        });

        XLSX.utils.book_append_sheet(workbook, worksheet, 'market_offers');

        const buffer = XLSX.write(workbook, {
            type: 'buffer',
            bookType: 'xlsx',
        });

        res.setHeader(
            'Content-Disposition',
            'attachment; filename="market_offers_export.xlsx"'
        );
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );

        return res.send(buffer);
    } catch (error) {
        console.error('exportMarketOffers error:', error);
        return res.status(500).json({ error: 'Не удалось экспортировать рыночную базу' });
    }
}

const ALLOWED_MARKET_OFFER_BULK_FIELDS = [
    'parent_object_type',
    'model_functional',
    'subgroup_2025',
    'function_name',
    'area_total',
    'class_offer',
    'metro',
    'address_offer',
    'building_name',
    'year_built_commissioning',
    'floor_location',
    'above_ground_floors',
    'total_floors',
    'underground_floors',
    'price_total_month',
    'price_per_sqm_month',
    'vat',
    'vat_description',
    'price_without_vat_per_sqm_month',
    'description',
    'utilities_included',
    'utilities_description',
    'opex_description',
    'price_per_sqm_cleaned',
    'building_cadastral_number',
    'x',
    'y',
    'district',
    'offer_date',
    'quarter',
    'room_condition',
    'offer_url',
    'screenshot',
];

function normalizeBulkNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

export async function bulkUpdateAdminMarketOffers(req, res) {
    try {
        const items = Array.isArray(req.body?.items) ? req.body.items : [];

        if (!items.length) {
            return res.status(400).json({ error: 'Нужно передать непустой массив items' });
        }

        let updated = 0;

        for (const rawItem of items) {
            const id = rawItem?.id;
            if (!id) continue;

            const item = await MarketOffer.findByPk(id);
            if (!item) continue;

            const beforeData = item.toJSON();
            const patch = {};

            for (const key of ALLOWED_MARKET_OFFER_BULK_FIELDS) {
                if (Object.prototype.hasOwnProperty.call(rawItem, key)) {
                    patch[key] = rawItem[key];
                }
            }

            const numericFields = [
                'area_total',
                'above_ground_floors',
                'total_floors',
                'underground_floors',
                'price_total_month',
                'price_per_sqm_month',
                'price_without_vat_per_sqm_month',
                'price_per_sqm_cleaned',
                'x',
                'y',
            ];

            for (const key of numericFields) {
                if (Object.prototype.hasOwnProperty.call(patch, key)) {
                    patch[key] = normalizeBulkNumber(patch[key]);
                }
            }

            await item.update(patch);
            updated += 1;

            await writeAdminAudit({
                adminUserId: req.user.id,
                entityType: 'market_offer',
                entityId: item.id,
                action: 'bulk_update',
                beforeData,
                afterData: item.toJSON(),
            });
        }

        return res.json({
            success: true,
            updated,
        });
    } catch (error) {
        console.error('bulkUpdateAdminMarketOffers error:', error);
        return res.status(500).json({ error: 'Не удалось пакетно обновить рыночную базу' });
    }
}

async function calculateEnvironmentForOffer(item) {
    let lat;
    let lon;
    console.log('[ENV] source coords', {
        id: item.id,
        x: item.x,
        y: item.y,
    });
    try {
        const converted = msk64ToWgs84(item.x, item.y);
        lat = Number(converted?.lat);
        lon = Number(converted?.lon);
    } catch (error) {
        throw new Error(
            `Не удалось преобразовать координаты МСК-64: ${error?.message || 'unknown_error'}`
        );
    }
    console.log('[ENV] converted coords', {
        id: item.id,
        lat,
        lon,
    });

    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
    ) {
        throw new Error(
            `После преобразования координаты некорректны: lat=${lat}, lon=${lon}`
        );
    }

    let historicalCenter = false;
    let historicalCenterError = null;

    try {
        historicalCenter = await resolveHistoricalCenterForCoords(lat, lon);
    } catch (error) {
        historicalCenterError =
            error?.message || 'resolveHistoricalCenterForCoords failed';
        console.error('resolveHistoricalCenterForCoords error:', error);
    }

    let elements = [];
    let osmError = null;

    try {
        elements = await fetchOsmEnvironment(lat, lon);
    } catch (error) {
        osmError = error?.message || 'fetchOsmEnvironment failed';
        console.error('fetchOsmEnvironment error:', error);
    }

    const result = classifyEnvironment(elements, { historicalCenter });

    const environmentPayload = {
        environment_historical_center: result.historicalCenter,
        environment_category_1: result.topCategories?.[0] || null,
        environment_category_2: result.topCategories?.[1] || null,
        environment_category_3: result.topCategories?.[2] || null,
        environment_score_json: {
            ...result,
            diagnostics: {
                osmError,
                historicalCenterError,
                usedFallback: Boolean(osmError || historicalCenterError),
                calculatedAt: new Date().toISOString(),
                coordSource: 'MSK-64 -> WGS84',
                wgs84: { lat, lon },
            },
        },
        environment_last_calculated_at: new Date(),
    };

    await item.update(environmentPayload);

    return {
        item,
        lat,
        lon,
        result: environmentPayload.environment_score_json,
        warnings: {
            osmError,
            historicalCenterError,
        },
    };
}

export async function calculateMarketOfferEnvironment(req, res) {
    try {
        const item = await MarketOffer.findByPk(req.params.id);

        if (!item) {
            return res.status(404).json({
                error: 'Запись рыночной базы не найдена',
            });
        }

        const beforeData = item.toJSON();
        const calculation = await calculateEnvironmentForOffer(item);
        const afterData = item.toJSON();

        await writeAdminAudit({
            adminUserId: req.user.id,
            entityType: 'market_offer',
            entityId: item.id,
            action: 'calculate_environment',
            beforeData,
            afterData,
            meta: {
                lat: calculation.lat,
                lon: calculation.lon,
                ...calculation.warnings,
                usedFallback: Boolean(
                    calculation.warnings.osmError ||
                    calculation.warnings.historicalCenterError
                ),
            },
        });

        return res.json({
            success: true,
            id: item.id,
            environment_historical_center: item.environment_historical_center,
            environment_category_1: item.environment_category_1,
            environment_category_2: item.environment_category_2,
            environment_category_3: item.environment_category_3,
            environment_score_json: item.environment_score_json,
            warnings: calculation.warnings,
        });
    } catch (error) {
        console.error('calculateMarketOfferEnvironment error:', error);

        return res.status(500).json({
            error: 'Не удалось рассчитать окружение аналога',
            details: error?.message || 'unknown_error',
        });
    }
}

export async function bulkCalculateMarketOfferEnvironment(req, res) {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];

        const where = ids.length
            ? { id: { [Op.in]: ids } }
            : {
                x: { [Op.ne]: null },
                y: { [Op.ne]: null },
            };

        const items = await MarketOffer.findAll({ where });

        let processed = 0;
        const errors = [];

        for (const item of items) {
            try {
                await calculateEnvironmentForOffer(item);
                processed += 1;
            } catch (error) {
                console.error(`bulkCalculateMarketOfferEnvironment item ${item.id} error:`, error);

                errors.push({
                    id: item.id,
                    error: error?.message || 'unknown_error',
                });
            }
        }

        await writeAdminAudit({
            adminUserId: req.user.id,
            entityType: 'market_offer',
            entityId: 'bulk_environment',
            action: 'calculate_environment_bulk',
            meta: {
                requestedIds: ids,
                processed,
                errorsCount: errors.length,
                errorsPreview: errors.slice(0, 20),
            },
        });

        return res.json({
            success: true,
            processed,
            errorsCount: errors.length,
            errors: errors.slice(0, 100),
        });
    } catch (error) {
        console.error('bulkCalculateMarketOfferEnvironment error:', error);

        return res.status(500).json({
            error: 'Не удалось пакетно рассчитать окружение',
            details: error?.message || 'unknown_error',
        });
    }
}

export async function clearMarketOffers(req, res) {
    try {
        const count = await MarketOffer.count();

        await MarketOffer.destroy({
            where: {},
            truncate: false,
        });

        await writeAdminAudit({
            adminUserId: req.user.id,
            entityType: 'market_offer',
            entityId: 'database',
            action: 'clear_database',
            meta: {
                deletedCount: count,
            },
        });

        return res.json({
            success: true,
            deletedCount: count,
            message: `Рыночная база очищена. Удалено ${count} записей.`,
        });
    } catch (error) {
        console.error('clearMarketOffers error:', error);

        return res.status(500).json({
            error: 'Не удалось очистить рыночную базу',
            details: error?.message || 'unknown_error',
        });
    }
}