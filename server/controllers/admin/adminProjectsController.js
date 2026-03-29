import { Op } from 'sequelize';
import ValuationProject from '../../models/ValuationProject.js';
import { writeAdminAudit } from '../../utils/adminAudit.js';
import { sendOk, sendError, sendNotFound, sendServerError } from '../../utils/responseHelpers.js';

const ALLOWED_PROJECT_UPDATE_FIELDS = [
    'name',
    'status',
    'object_type',
    'owner_id',
];

export async function getAdminProjects(req, res) {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
        const search = String(req.query.search || '').trim();

        const where = {};
        if (search) {
            where[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { object_type: { [Op.iLike]: `%${search}%` } },
            ];
        }

        const { rows, count } = await ValuationProject.findAndCountAll({
            where,
            order: [['created_at', 'DESC']],
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
        console.error('getAdminProjects error:', error);
        return sendServerError(res, 'загрузки проектов');
    }
}

export async function getAdminProjectById(req, res) {
    try {
        const item = await ValuationProject.findByPk(req.params.id);

        if (!item) {
            return sendNotFound(res, 'Проект');
        }

        return sendOk(res, item);
    } catch (error) {
        console.error('getAdminProjectById error:', error);
        return sendServerError(res, 'загрузки проекта');
    }
}

export async function updateAdminProject(req, res) {
    try {
        const item = await ValuationProject.findByPk(req.params.id);

        if (!item) {
            return sendNotFound(res, 'Проект');
        }

        const beforeData = item.toJSON();
        const patch = {};

        for (const key of ALLOWED_PROJECT_UPDATE_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(req.body, key)) {
                patch[key] = req.body[key];
            }
        }

        await item.update(patch);

        await writeAdminAudit({
            adminUserId: req.user.id,
            entityType: 'project',
            entityId: item.id,
            action: 'update',
            beforeData,
            afterData: item.toJSON(),
        });

        return sendOk(res, item);
    } catch (error) {
        console.error('updateAdminProject error:', error);
        return sendServerError(res, 'обновления проекта');
    }
}

export async function archiveAdminProject(req, res) {
    try {
        const item = await ValuationProject.findByPk(req.params.id);

        if (!item) {
            return sendNotFound(res, 'Проект');
        }

        const beforeData = item.toJSON();
        await item.update({ status: 'archived' });

        await writeAdminAudit({
            adminUserId: req.user.id,
            entityType: 'project',
            entityId: item.id,
            action: 'archive',
            beforeData,
            afterData: item.toJSON(),
        });

        return sendOk(res, { message: 'Проект архивирован' });
    } catch (error) {
        console.error('archiveAdminProject error:', error);
        return sendServerError(res, 'архивирования проекта');
    }
}

export async function deleteAdminProject(req, res) {
    try {
        const item = await ValuationProject.findByPk(req.params.id);

        if (!item) {
            return sendNotFound(res, 'Проект');
        }

        const beforeData = item.toJSON();
        await item.destroy();

        await writeAdminAudit({
            adminUserId: req.user.id,
            entityType: 'project',
            entityId: item.id,
            action: 'delete',
            beforeData,
            afterData: null,
        });

        return sendOk(res, { message: 'Проект удален' });
    } catch (error) {
        console.error('deleteAdminProject error:', error);
        return sendServerError(res, 'удаления проекта');
    }
}