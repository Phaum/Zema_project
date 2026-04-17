import { Op } from 'sequelize';
import User from '../../models/User.js';
import Role from '../../models/Role.js';
import { writeAdminAudit } from '../../utils/adminAudit.js';
import { sendOk, sendError, sendNotFound, sendServerError } from '../../utils/responseHelpers.js';
import { USER_STATUS, ERROR_MESSAGES } from '../../constants/auth.js';

const ALLOWED_USER_UPDATE_FIELDS = ['first_name', 'last_name', 'email', 'status', 'debug_mode'];

function serializeAdminUser(user) {
    if (!user) return null;

    const plain = typeof user.toJSON === 'function' ? user.toJSON() : user;
    const roles = Array.isArray(plain.Roles)
        ? plain.Roles.map((item) => item.role).filter(Boolean)
        : Array.isArray(plain.roles)
            ? plain.roles
            : [];

    return {
        ...plain,
        roles,
    };
}

export async function getAdminUsers(req, res) {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
        const search = String(req.query.search || '').trim();

        const where = {};

        if (search) {
            where[Op.or] = [
                { email: { [Op.iLike]: `%${search}%` } },
                { first_name: { [Op.iLike]: `%${search}%` } },
                { last_name: { [Op.iLike]: `%${search}%` } },
            ];
        }

        const { rows, count } = await User.findAndCountAll({
            where,
            include: [
                {
                    model: Role,
                    attributes: ['role'],
                    through: { attributes: [] },
                },
            ],
            distinct: true,
            order: [['created_at', 'DESC']],
            offset: (page - 1) * pageSize,
            limit: pageSize,
        });

        return sendOk(res, {
            items: rows.map(serializeAdminUser),
            total: count,
            page,
            pageSize,
        });
    } catch (error) {
        console.error('getAdminUsers error:', error);
        return sendServerError(res, 'загрузки пользователей');
    }
}

export async function getAdminUserById(req, res) {
    try {
        const user = await User.findByPk(req.params.id, {
            include: [
                {
                    model: Role,
                    attributes: ['role'],
                    through: { attributes: [] },
                },
            ],
        });

        if (!user) {
            return sendNotFound(res, 'Пользователь');
        }

        return sendOk(res, serializeAdminUser(user));
    } catch (error) {
        console.error('getAdminUserById error:', error);
        return sendServerError(res, 'загрузки пользователя');
    }
}

export async function updateAdminUser(req, res) {
    try {
        const user = await User.findByPk(req.params.id);

        if (!user) {
            return sendNotFound(res, 'Пользователь');
        }

        const beforeData = user.toJSON();
        const patch = {};

        for (const key of ALLOWED_USER_UPDATE_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(req.body, key)) {
                patch[key] = req.body[key];
            }
        }

        const allowedStatuses = Object.values(USER_STATUS);

        if (patch.status && !allowedStatuses.includes(patch.status)) {
            return sendError(res, 'Недопустимый статус', 400);
        }

        await user.update(patch);

        await writeAdminAudit({
            adminUserId: req.user.id,
            entityType: 'user',
            entityId: user.id,
            action: 'update',
            beforeData,
            afterData: user.toJSON(),
        });

        return sendOk(res, user);
    } catch (error) {
        console.error('updateAdminUser error:', error);
        return sendServerError(res, 'обновления пользователя');
    }
}

export async function blockAdminUser(req, res) {
    try {
        const user = await User.findByPk(req.params.id);

        if (!user) {
            return sendNotFound(res, 'Пользователь');
        }

        const beforeData = user.toJSON();
        await user.update({ status: USER_STATUS.BLOCKED });

        await writeAdminAudit({
            adminUserId: req.user.id,
            entityType: 'user',
            entityId: user.id,
            action: 'block',
            beforeData,
            afterData: user.toJSON(),
        });

        return sendOk(res, { message: 'Пользователь заблокирован' });
    } catch (error) {
        console.error('blockAdminUser error:', error);
        return sendServerError(res, 'блокировки пользователя');
    }
}

export async function unblockAdminUser(req, res) {
    try {
        const user = await User.findByPk(req.params.id);

        if (!user) {
            return sendNotFound(res, 'Пользователь');
        }

        const beforeData = user.toJSON();
        await user.update({ status: USER_STATUS.ACTIVE });

        await writeAdminAudit({
            adminUserId: req.user.id,
            entityType: 'user',
            entityId: user.id,
            action: 'unblock',
            beforeData,
            afterData: user.toJSON(),
        });

        return sendOk(res, { message: 'Пользователь разблокирован' });
    } catch (error) {
        console.error('unblockAdminUser error:', error);
        return sendServerError(res, 'разблокировки пользователя');
    }
}

export async function setAdminUserRoles(req, res) {
    try {
        const userId = req.params.id;
        const roles = Array.isArray(req.body?.roles) ? req.body.roles : [];

        if (!roles.length) {
            return res.status(400).json({ error: 'Нужно передать непустой массив roles' });
        }

        const normalizedRoles = [...new Set(
            roles
                .map((item) => String(item || '').trim())
                .filter(Boolean)
        )];

        if (normalizedRoles.length > 1) {
            return res.status(400).json({
                error: 'Для пользователя допускается только одна роль',
            });
        }

        const allowedRoles = ['GUEST', 'USER', 'ADMIN_ANALYST'];

        const invalidRoles = normalizedRoles.filter((role) => !allowedRoles.includes(role));
        if (invalidRoles.length) {
            return res.status(400).json({
                error: `Недопустимые роли: ${invalidRoles.join(', ')}`,
            });
        }

        const user = await User.findByPk(userId, {
            include: [
                {
                    model: Role,
                    attributes: ['id', 'role'],
                    through: { attributes: [] },
                },
            ],
        });

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const beforeRoles = (user.Roles || []).map((item) => item.role);

        const roleRows = await Role.findAll({
            where: {
                role: {
                    [Op.in]: normalizedRoles,
                },
            },
        });

        if (roleRows.length !== normalizedRoles.length) {
            const foundRoles = roleRows.map((item) => item.role);
            const missingRoles = normalizedRoles.filter((role) => !foundRoles.includes(role));

            return res.status(400).json({
                error: `Роли не найдены в базе: ${missingRoles.join(', ')}`,
            });
        }

        await user.setRoles(roleRows);

        const reloadedUser = await User.findByPk(userId, {
            include: [
                {
                    model: Role,
                    attributes: ['id', 'role'],
                    through: { attributes: [] },
                },
            ],
        });

        const afterRoles = (reloadedUser.Roles || []).map((item) => item.role);

        await writeAdminAudit({
            adminUserId: req.user.id,
            entityType: 'user',
            entityId: user.id,
            action: 'set_roles',
            beforeData: { roles: beforeRoles },
            afterData: { roles: afterRoles },
            meta: {
                targetUserId: user.id,
                targetEmail: user.email,
            },
        });

        return res.json({
            success: true,
            user: {
                id: reloadedUser.id,
                email: reloadedUser.email,
                first_name: reloadedUser.first_name,
                last_name: reloadedUser.last_name,
                status: reloadedUser.status,
                roles: afterRoles,
            },
        });
    } catch (error) {
        console.error('setAdminUserRoles error:', error);
        return res.status(500).json({ error: 'Не удалось обновить роли пользователя' });
    }
}
