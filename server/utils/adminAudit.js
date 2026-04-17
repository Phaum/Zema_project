import AdminAuditLog from '../models/admin_audit_log.js';

export async function writeAdminAudit({
  adminUserId,
  entityType,
  entityId,
  action,
  beforeData = null,
  afterData = null,
  meta = null,
}) {
    try {
        await AdminAuditLog.create({
            admin_user_id: adminUserId,
            entity_type: entityType,
            entity_id: String(entityId),
            action,
            before_data: beforeData,
            after_data: afterData,
            meta,
        });
    } catch (error) {
        console.error('writeAdminAudit error:', error);
    }
}