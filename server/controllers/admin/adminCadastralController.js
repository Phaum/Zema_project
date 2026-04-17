import { Op } from 'sequelize';
import XLSX from 'xlsx';
import CadastralData from '../../models/cadastral_data.js';
import { writeAdminAudit } from '../../utils/adminAudit.js';
import { reverseGeocodeByCoords } from '../geoController.js';
import { getOrFetchCadastralRecord } from '../cadastralController.js';
import { sendOk, sendError, sendNotFound, sendServerError } from '../../utils/responseHelpers.js';
import { toNumber } from '../../utils/dataValidation.js';

const ALLOWED_CADASTRAL_UPDATE_FIELDS = [
    'address',
    'district',
    'latitude',
    'longitude',
    'total_area',
    'land_area',
    'cad_cost',
    'permitted_use',
    'object_type',
    'year_built',
    'year_commisioning',
];

const ALLOWED_CADASTRAL_BULK_FIELDS = ALLOWED_CADASTRAL_UPDATE_FIELDS;

export async function getAdminCadastralRecords(req, res) {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
        const search = String(req.query.search || '').trim();

        const where = {};
        if (search) {
            where[Op.or] = [
                { cadastral_number: { [Op.iLike]: `%${search}%` } },
                { address: { [Op.iLike]: `%${search}%` } },
            ];
        }

        const { rows, count } = await CadastralData.findAndCountAll({
            where,
            order: [['updated_at', 'DESC']],
            offset: (page - 1) * pageSize,
            limit: pageSize,
        });

        return sendOk(res, {
            items: rows,
            total: count,
            page,
            pageSize,
        });
    } catch (error) {
        console.error('getAdminCadastralRecords error:', error);
        return sendServerError(res, 'загрузки кадастровых записей');
    }
}

export async function getAdminCadastralRecordById(req, res) {
    try {
        const item = await CadastralData.findByPk(req.params.id);

        if (!item) {
            return sendNotFound(res, 'Кадастровая запись');
        }

        return sendOk(res, item);
    } catch (error) {
        console.error('getAdminCadastralRecordById error:', error);
        return sendServerError(res, 'загрузки кадастровой записи');
    }
}

export async function updateAdminCadastralRecord(req, res) {
    try {
        const item = await CadastralData.findByPk(req.params.id);

        if (!item) {
            return sendNotFound(res, 'Кадастровая запись');
        }

        const beforeData = item.toJSON();
        const patch = {};

        for (const key of ALLOWED_CADASTRAL_UPDATE_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(req.body, key)) {
                patch[key] = req.body[key];
            }
        }

        const nextLat = patch.latitude ?? item.latitude;
        const nextLng = patch.longitude ?? item.longitude;
        const nextAddress = patch.address ?? item.address;

        if ((!nextAddress || String(nextAddress).trim() === '') && nextLat && nextLng) {
            try {
                const reverse = await reverseGeocodeByCoords(nextLat, nextLng);
                patch.address = reverse.address || reverse.displayName || item.address;
            } catch (e) {
                console.error('reverse geocode for admin update error:', e.message);
            }
        }

        await item.update(patch);

        await writeAdminAudit({
            adminUserId: req.user.id,
            entityType: 'cadastral_record',
            entityId: item.id,
            action: 'update',
            beforeData,
            afterData: item.toJSON(),
        });

        return sendOk(res, item);
    } catch (error) {
        console.error('updateAdminCadastralRecord error:', error);
        return sendServerError(res, 'обновления кадастровой записи');
    }
}

export async function refreshAdminCadastralRecord(req, res) {
    try {
        const item = await CadastralData.findByPk(req.params.id);

        if (!item) {
            return sendNotFound(res, 'Кадастровая запись');
        }

        const beforeData = item.toJSON();
        const refreshed = await getOrFetchCadastralRecord(item.cadastral_number, {
            forceRefresh: true,
        });

        await writeAdminAudit({
            adminUserId: req.user.id,
            entityType: 'cadastral_record',
            entityId: item.id,
            action: 'refresh_from_nspd',
            beforeData,
            afterData: refreshed.toJSON(),
        });

        return sendOk(res, refreshed);
    } catch (error) {
        console.error('refreshAdminCadastralRecord error:', error);
        return sendServerError(res, 'обновления записи из НСПД');
    }
}

function normalizeNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

export async function bulkUpdateAdminCadastralRecords(req, res) {
    try {
        const items = Array.isArray(req.body?.items) ? req.body.items : [];

        if (!items.length) {
            return res.status(400).json({ error: 'Нужно передать непустой массив items' });
        }

        let updated = 0;

        for (const rawItem of items) {
            const id = rawItem?.id;
            if (!id) continue;

            const item = await CadastralData.findByPk(id);
            if (!item) continue;

            const beforeData = item.toJSON();
            const patch = {};

            for (const key of ALLOWED_CADASTRAL_BULK_FIELDS) {
                if (Object.prototype.hasOwnProperty.call(rawItem, key)) {
                    patch[key] = rawItem[key];
                }
            }

            if (Object.prototype.hasOwnProperty.call(patch, 'latitude')) {
                patch.latitude = normalizeNumber(patch.latitude);
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'longitude')) {
                patch.longitude = normalizeNumber(patch.longitude);
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'total_area')) {
                patch.total_area = normalizeNumber(patch.total_area);
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'land_area')) {
                patch.land_area = normalizeNumber(patch.land_area);
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'cad_cost')) {
                patch.cad_cost = normalizeNumber(patch.cad_cost);
            }

            const nextLat = patch.latitude ?? item.latitude;
            const nextLng = patch.longitude ?? item.longitude;
            const nextAddress = patch.address ?? item.address;

            if ((!nextAddress || String(nextAddress).trim() === '') && nextLat && nextLng) {
                try {
                    const reverse = await reverseGeocodeByCoords(nextLat, nextLng);
                    patch.address = reverse.address || reverse.displayName || item.address;
                } catch (error) {
                    console.error('bulk cadastral reverse geocode error:', error.message);
                }
            }

            await item.update(patch);
            updated += 1;

            await writeAdminAudit({
                adminUserId: req.user.id,
                entityType: 'cadastral_record',
                entityId: item.id,
                action: 'bulk_update',
                beforeData,
                afterData: item.toJSON(),
            });
        }

        return sendOk(res, {
            success: true,
            updated,
        });
    } catch (error) {
        console.error('bulkUpdateAdminCadastralRecords error:', error);
        return sendServerError(res, 'пакетного обновления кадастровых записей');
    }
}

function normalizeExcelNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
}

function mapCadastralImportRow(row) {
    return {
        cadastral_number: row['Кадастровый номер'] ? String(row['Кадастровый номер']).trim() : null,
        object_type: row['Тип объекта'] ? String(row['Тип объекта']).trim() : null,
        address: row['Адрес'] ? String(row['Адрес']).trim() : null,
        district: row['Район'] ? String(row['Район']).trim() : null,
        latitude: normalizeExcelNumber(row['Широта']),
        longitude: normalizeExcelNumber(row['Долгота']),
        total_area: normalizeExcelNumber(row['Площадь здания']),
        land_area: normalizeExcelNumber(row['Площадь участка']),
        cad_cost: normalizeExcelNumber(row['Кадастровая стоимость']),
        permitted_use: row['Разрешенное использование'] ? String(row['Разрешенное использование']).trim() : null,
        year_built: row['Год постройки'] ? String(row['Год постройки']).trim() : null,
        year_commisioning: row['Год ввода'] ? String(row['Год ввода']).trim() : null,
        nearest_metro: row['Ближайшее метро'] ? String(row['Ближайшее метро']).trim() : null,
        metro_distance: normalizeExcelNumber(row['Расстояние до метро']),
    };
}

export async function importAdminCadastralRecords(req, res) {
    try {
        if (!req.file) {
            return sendError(res, 'Не передан Excel-файл', 400);
        }

        const sheetName = String(req.body?.sheetName || '').trim();
        if (!sheetName) {
            return sendError(res, 'Нужно передать sheetName', 400);
        }

        const workbook = XLSX.read(req.file.buffer, {
            type: 'buffer',
            cellDates: true,
        });

        if (!workbook.SheetNames.includes(sheetName)) {
            return sendError(res, `Лист "${sheetName}" не найден`, 400);
        }

        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
            defval: null,
            raw: false,
        });

        if (!rows.length) {
            return sendError(res, 'Выбранный лист пустой', 400);
        }

        const requiredHeaders = ['Кадастровый номер', 'Адрес'];
        const headers = Object.keys(rows[0] || {});
        const missing = requiredHeaders.filter((header) => !headers.includes(header));

        if (missing.length) {
            return sendError(res, `В листе отсутствуют обязательные колонки: ${missing.join(', ')}`, 400);
        }

        let inserted = 0;
        let updated = 0;
        const errors = [];

        for (let i = 0; i < rows.length; i += 1) {
            try {
                const payload = mapCadastralImportRow(rows[i]);

                if (!payload.cadastral_number) {
                    errors.push({ row: i + 2, error: 'Пустой кадастровый номер' });
                    continue;
                }

                const existing = await CadastralData.findOne({
                    where: { cadastral_number: payload.cadastral_number },
                });

                if (existing) {
                    await existing.update(payload);
                    updated += 1;
                } else {
                    await CadastralData.create({
                        ...payload,
                        status: 'IMPORTED',
                    });
                    inserted += 1;
                }
            } catch (error) {
                errors.push({
                    row: i + 2,
                    error: error.message,
                });
            }
        }

        await writeAdminAudit({
            adminUserId: req.user.id,
            entityType: 'cadastral_record',
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

        return sendOk(res, {
            inserted,
            updated,
            errorsCount: errors.length,
            errors: errors.slice(0, 100),
        });
    } catch (error) {
        console.error('importAdminCadastralRecords error:', error);
        return sendServerError(res, 'импорта кадастровых данных');
    }
}

export async function exportAdminCadastralRecords(req, res) {
    try {
        const rows = await CadastralData.findAll({
            order: [['updated_at', 'DESC']],
        });

        const exportRows = rows.map((item) => ({
            'ID': item.id,
            'Кадастровый номер': item.cadastral_number,
            'Тип объекта': item.object_type,
            'Адрес': item.address,
            'Район': item.district,
            'Широта': item.latitude,
            'Долгота': item.longitude,
            'Площадь здания': item.total_area,
            'Площадь участка': item.land_area,
            'Кадастровая стоимость': item.cad_cost,
            'Разрешенное использование': item.permitted_use,
            'Год постройки': item.year_built,
            'Год ввода': item.year_commisioning,
            'Ближайшее метро': item.nearest_metro,
            'Расстояние до метро': item.metro_distance,
        }));

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(exportRows);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'cadastral_records');

        const buffer = XLSX.write(workbook, {
            type: 'buffer',
            bookType: 'xlsx',
        });

        res.setHeader(
            'Content-Disposition',
            'attachment; filename="cadastral_records_export.xlsx"'
        );
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );

        return res.send(buffer);
    } catch (error) {
        console.error('exportAdminCadastralRecords error:', error);
        return sendServerError(res, 'экспорта кадастровых данных');
    }
}