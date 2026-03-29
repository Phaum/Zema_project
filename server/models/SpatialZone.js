import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

const SpatialZone = sequelize.define('SpatialZone', {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },

    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },

    zone_type: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },

    code: {
        type: DataTypes.STRING(120),
        allowNull: true,
    },

    priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },

    geojson: {
        type: DataTypes.JSONB,
        allowNull: false,
    },

    color: {
        type: DataTypes.STRING(32),
        allowNull: true,
        defaultValue: '#1890ff',
    },

    description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },

    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    tableName: 'spatial_zones',
    underscored: true,
});

export default SpatialZone;
