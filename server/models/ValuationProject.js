import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

const ValuationProject = sequelize.define('ValuationProject', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },

    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },

    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },

    object_type: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },

    status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'questionnaire',
    },

    payment_status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'unpaid',
    },

    payment_tariff_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },

    payment_amount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
    },

    payment_currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'RUB',
    },

    payment_details_json: {
        type: DataTypes.JSONB,
        allowNull: true,
    },

    paid_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    tableName: 'valuation_projects',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['user_id'],
            name: 'valuation_projects_user_id_idx',
        },
        {
            fields: ['status'],
            name: 'valuation_projects_status_idx',
        },
    ],
});

export default ValuationProject;
