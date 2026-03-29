import XLSX from 'xlsx';
import { Op } from 'sequelize';
import Analogue from '../../models/Analogue.js';
import { writeAdminAudit } from '../../utils/adminAudit.js';
import {
    ANALOGUE_COLUMNS,
    REQUIRED_ANALOGUE_HEADERS,
} from '../../utils/analogueTemplate.js';

function normalizeString(value) {
    if (value === undefined || value === null || value === '') return null;
    return String(value).trim();
}

function normalizeNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
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
    if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

    return null;
}

function mapRowToPayload(row) {
    const payload = {};

    for (const col of ANALOGUE_COLUMNS) {
        const raw = row[col.header];

        if (col.type === 'number') payload[col.field] = normalizeNumber(raw);
        else if (col.type === 'date') payload[col.field] = normalizeDate(raw);
        else payload[col.field] = normalizeString(raw);
    }

    return payload;
}

function validateHeaders(rows) {
    if (!rows.length) {
        return { ok: false, error: 'Выбранный лист пустой' };
    }

    const headers = Object.keys(rows[0] || {});
    const missing = REQUIRED_ANALOGUE_HEADERS.filter((header) => !headers.includes(header));

    if (missing.length) {
        return {
            ok: false,
            error: `В листе отсутствуют обязательные колонки: ${missing.join(', ')}`,
        };
    }

    return { ok: true };
}

export async function getAdminAnalogues(req, res) {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
        const search = String(req.query.search || '').trim();

        const where = {};
        if (search) {
            where[Op.or] = [
                { id: { [Op.iLike]: `%${search}%` } },
                { address: { [Op.iLike]: `%${search}%` } },
                { cadastral: { [Op.iLike]: `%${search}%` } },
                { district: { [Op.iLike]: `%${search}%` } },
                { model_func: { [Op.iLike]: `%${search}%` } },
                { building: { [Op.iLike]: `%${search}%` } },
            ];
        }

        const { rows, count } = await Analogue.findAndCountAll({
            where,
            order: [['date_offer', 'DESC'], ['id', 'ASC']],
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
        console.error('getAdminAnalogues error:', error);
        return res.status(500).json({ error: 'Не удалось загрузить базу аналогов' });
    }
}

export async function importAdminAnalogues(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Не передан Excel-файл' });
        }

        const sheetName = String(req.body.sheetName || '').trim();
        if (!sheetName) {
            return res.status(400).json({ error: 'Нужно передать sheetName' });
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });

        if (!workbook.SheetNames.includes(sheetName)) {
            return res.status(400).json({
                error: `Лист "${sheetName}" не найден`,
                availableSheets: workbook.SheetNames,
            });
        }

        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: false });

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
                const payload = mapRowToPayload(rows[index]);

                if (!payload.id) {
                    errors.push({ row: index + 2, error: 'Не заполнен id' });
                    continue;
                }

                const existing = await Analogue.findByPk(payload.id);

                if (existing) {
                    await existing.update(payload);
                    updated += 1;
                } else {
                    await Analogue.create(payload);
                    inserted += 1;
                }
            } catch (error) {
                errors.push({
                    row: index + 2,
                    error: error?.message || 'unknown_error',
                });
            }
        }

        await writeAdminAudit({
            adminUserId: req.user.id,
            entityType: 'analogue',
            entityId: 'import',
            action: 'import',
            meta: { inserted, updated, errorsCount: errors.length },
        });

        return res.json({
            success: true,
            inserted,
            updated,
            errors: errors.slice(0, 100),
        });
    } catch (error) {
        console.error('importAdminAnalogues error:', error);
        return res.status(500).json({ error: 'Не удалось импортировать аналоги' });
    }
}

export async function exportAdminAnalogues(req, res) {
    try {
        const items = await Analogue.findAll({
            order: [['date_offer', 'DESC'], ['id', 'ASC']],
        });

        const rows = items.map((item) => {
            const row = {};
            for (const col of ANALOGUE_COLUMNS) {
                row[col.header] = item[col.field];
            }
            return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'analogues');

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader(
            'Content-Disposition',
            'attachment; filename="analogues_export.xlsx"'
        );
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );

        return res.send(buffer);
    } catch (error) {
        console.error('exportAdminAnalogues error:', error);
        return res.status(500).json({ error: 'Не удалось экспортировать аналоги' });
    }
}

export async function bulkUpdateAdminAnalogues(req, res) {
    try {
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        if (!items.length) {
            return res.status(400).json({ error: 'Нужно передать непустой массив items' });
        }

        const allowedFields = ANALOGUE_COLUMNS.map((item) => item.field).filter((field) => field !== 'id');

        let updated = 0;

        for (const rawItem of items) {
            const item = await Analogue.findByPk(rawItem?.id);
            if (!item) continue;

            const beforeData = item.toJSON();
            const patch = {};

            for (const key of allowedFields) {
                if (!Object.prototype.hasOwnProperty.call(rawItem, key)) continue;

                const column = ANALOGUE_COLUMNS.find((col) => col.field === key);
                if (!column) continue;

                if (column.type === 'number') patch[key] = normalizeNumber(rawItem[key]);
                else if (column.type === 'date') patch[key] = normalizeDate(rawItem[key]);
                else patch[key] = normalizeString(rawItem[key]);
            }

            await item.update(patch);
            updated += 1;

            await writeAdminAudit({
                adminUserId: req.user.id,
                entityType: 'analogue',
                entityId: item.id,
                action: 'bulk_update',
                beforeData,
                afterData: item.toJSON(),
            });
        }

        return res.json({ success: true, updated });
    } catch (error) {
        console.error('bulkUpdateAdminAnalogues error:', error);
        return res.status(500).json({ error: 'Не удалось сохранить изменения в базе аналогов' });
    }
}

export async function clearAdminAnalogues(req, res) {
    try {
        const count = await Analogue.count();

        await Analogue.destroy({
            where: {},
            truncate: false,
        });

        await writeAdminAudit({
            adminUserId: req.user.id,
            entityType: 'analogue',
            entityId: 'database',
            action: 'clear_database',
            meta: { deletedCount: count },
        });

        return res.json({
            success: true,
            deletedCount: count,
            message: `База аналогов очищена. Удалено ${count} записей.`,
        });
    } catch (error) {
        console.error('clearAdminAnalogues error:', error);
        return res.status(500).json({ error: 'Не удалось очистить базу аналогов' });
    }
}