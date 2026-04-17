import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

const EnvironmentAnalysis = sequelize.define('EnvironmentAnalysis', {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },

    cadastral_number: {
        type: DataTypes.STRING(64),
        allowNull: false,
    },

    valuation_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },

    latitude: {
        type: DataTypes.DECIMAL(12, 8),
        allowNull: false,
    },

    longitude: {
        type: DataTypes.DECIMAL(12, 8),
        allowNull: false,
    },

    radius_used: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 600,
    },

    location_type: {
        type: DataTypes.STRING(80),
        allowNull: true,
    },

    historical_center_status: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },

    historical_center_distance_meters: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
    },

    historical_center_source: {
        type: DataTypes.STRING(120),
        allowNull: true,
    },

    nearest_metro: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    nearest_metro_distance: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
    },

    transport_score: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: true,
    },

    business_score: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: true,
    },

    service_score: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: true,
    },

    negative_score: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: true,
    },

    total_environment_score: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: true,
    },

    quality_flag: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'partial',
    },

    environment_category_1: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    environment_category_2: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    environment_category_3: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    environment_details_json: {
        type: DataTypes.JSONB,
        allowNull: true,
    },

    source_meta_json: {
        type: DataTypes.JSONB,
        allowNull: true,
    },

    calculated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
}, {
    tableName: 'environment_analyses',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            unique: true,
            fields: ['cadastral_number', 'radius_used'],
            name: 'environment_analyses_cadnum_radius_uq',
        },
        {
            fields: ['cadastral_number'],
            name: 'environment_analyses_cadnum_idx',
        },
    ],
});

export default EnvironmentAnalysis;
