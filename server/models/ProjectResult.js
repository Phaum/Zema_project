import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

const ProjectResult = sequelize.define('ProjectResult', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },

    project_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
    },

    rental_rate: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
    },

    leasable_area: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
    },

    occupancy_rate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
    },

    gross_income: {
        type: DataTypes.DECIMAL(16, 2),
        allowNull: true,
    },

    capitalization_rate: {
        type: DataTypes.DECIMAL(8, 6),
        allowNull: false,
        defaultValue: 0.1,
    },

    estimated_value: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
    },

    // Extended fields for detailed calculation
    egi: {
        type: DataTypes.DECIMAL(16, 2),
        allowNull: true,
        comment: 'Effective Gross Income',
    },

    opex: {
        type: DataTypes.DECIMAL(16, 2),
        allowNull: true,
        comment: 'Operating Expenses',
    },

    noi: {
        type: DataTypes.DECIMAL(16, 2),
        allowNull: true,
        comment: 'Net Operating Income',
    },

    price_per_m2: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
        comment: 'Final value per square meter',
    },

    land_share: {
        type: DataTypes.DECIMAL(20, 6),
        allowNull: true,
        comment: 'Land value to deduct',
    },

    rental_rate_source: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Source of rental rate: manual or market',
    },

    market_snapshot_json: {
        type: DataTypes.JSONB,
        allowNull: true,
    },

    calculation_breakdown_json: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Detailed breakdown of calculation steps for transparency',
    },
}, {
    tableName: 'project_results',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

export default ProjectResult;
