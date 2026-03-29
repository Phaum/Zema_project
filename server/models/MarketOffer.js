import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

const MarketOffer = sequelize.define('MarketOffer', {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },

    external_id: {
        type: DataTypes.STRING(120),
        allowNull: false,
        unique: true,
    },

    parent_object_type: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    model_functional: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    subgroup_2025: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    function_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    area_total: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
    },

    class_offer: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },

    metro: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    address_offer: {
        type: DataTypes.TEXT,
        allowNull: true,
    },

    building_name: {
        type: DataTypes.TEXT,
        allowNull: true,
    },

    year_built_commissioning: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },

    floor_location: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },

    above_ground_floors: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },

    total_floors: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },

    underground_floors: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },

    price_total_month: {
        type: DataTypes.DECIMAL(16, 2),
        allowNull: true,
    },

    price_per_sqm_month: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
    },

    vat: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },

    vat_description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },

    price_without_vat_per_sqm_month: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
    },

    description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },

    utilities_included: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },

    utilities_description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },

    opex_description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },

    price_per_sqm_cleaned: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
    },

    building_cadastral_number: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },

    x: {
        type: DataTypes.DECIMAL(16, 8),
        allowNull: true,
    },

    y: {
        type: DataTypes.DECIMAL(16, 8),
        allowNull: true,
    },

    district: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    offer_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },

    quarter: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },

    room_condition: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    offer_url: {
        type: DataTypes.TEXT,
        allowNull: true,
    },

    screenshot: {
        type: DataTypes.TEXT,
        allowNull: true,
    },

    source_sheet_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    environment_historical_center: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
    },

    environment_category_1: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },

    environment_category_2: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },

    environment_category_3: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },

    environment_score_json: {
        type: DataTypes.JSONB,
        allowNull: true,
    },

    environment_last_calculated_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    tableName: 'market_offers',
    underscored: true,
});

export default MarketOffer;