import { Op } from 'sequelize';
import User from '../../models/User.js';
import ValuationProject from '../../models/ValuationProject.js';
import CadastralData from '../../models/cadastral_data.js';
import AdminAuditLog from '../../models/admin_audit_log.js';

export async function getAdminOverview(req, res) {
    try {
        const [
            usersCount,
            projectsCount,
            cadastralCount,
            recordsWithoutCoords,
            recordsWithoutAddress,
            recentAudit,
        ] = await Promise.all([
            User.count(),
            ValuationProject.count(),
            CadastralData.count(),
            CadastralData.count({
                where: {
                    [Op.or]: [
                        { latitude: null },
                        { longitude: null },
                    ],
                },
            }),
            CadastralData.count({
                where: {
                    [Op.or]: [
                        { address: null },
                        { address: '' },
                    ],
                },
            }),
            AdminAuditLog.findAll({
                order: [['created_at', 'DESC']],
                limit: 10,
            }),
        ]);

        return res.json({
            usersCount,
            projectsCount,
            cadastralCount,
            recordsWithoutCoords,
            recordsWithoutAddress,
            recentAudit,
        });
    } catch (error) {
        console.error('getAdminOverview error:', error);
        return res.status(500).json({ error: 'Не удалось загрузить обзор админ-панели' });
    }
}