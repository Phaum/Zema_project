import AdminAuditLog from '../../models/admin_audit_log.js';

export async function getAdminAuditLogs(req, res) {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);

        const { rows, count } = await AdminAuditLog.findAndCountAll({
            order: [['created_at', 'DESC']],
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
        console.error('getAdminAuditLogs error:', error);
        return res.status(500).json({ error: 'Не удалось загрузить audit log' });
    }
}