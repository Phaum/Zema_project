import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

const AdminAuditLog = sequelize.define(
    'AdminAuditLog',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        admin_user_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        entity_type: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        entity_id: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        action: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        before_data: {
            type: DataTypes.JSONB,
            allowNull: true,
        },
        after_data: {
            type: DataTypes.JSONB,
            allowNull: true,
        },
        meta: {
            type: DataTypes.JSONB,
            allowNull: true,
        },
    },
    {
        tableName: 'admin_audit_logs',
        underscored: true,
    }
);

export default AdminAuditLog;