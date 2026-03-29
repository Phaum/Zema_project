import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

const ProjectQuestionnaire = sequelize.define('ProjectQuestionnaire', {
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

    calculationMethod: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'market',
    },

    projectName: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    buildingCadastralNumber: {
        type: DataTypes.STRING(64),
        allowNull: true,
    },

    valuationDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },

    objectType: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },

    actualUse: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },

    businessCenterClass: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },

    averageRentalRate: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
    },

    mapPointLat: {
        type: DataTypes.DECIMAL(12, 8),
        allowNull: true,
    },

    mapPointLng: {
        type: DataTypes.DECIMAL(12, 8),
        allowNull: true,
    },

    district: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    nearestMetro: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    metroDistance: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
    },

    cadCost: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
    },

    permittedUse: {
        type: DataTypes.TEXT,
        allowNull: true,
    },

    objectAddress: {
        type: DataTypes.TEXT,
        allowNull: true,
    },

    addressConfirmed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },

    totalArea: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
    },

    constructionYear: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },

    aboveGroundFloors: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },

    hasBasementFloor: {
        type: DataTypes.STRING(10),
        allowNull: true,
    },

    undergroundFloors: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },

    landCadastralNumber: {
        type: DataTypes.STRING(64),
        allowNull: true,
    },

    landArea: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
    },

    hasPrepayment: {
        type: DataTypes.STRING(10),
        allowNull: true,
    },

    hasSecurityDeposit: {
        type: DataTypes.STRING(10),
        allowNull: true,
    },

    leasableArea: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
    },

    occupancyRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
    },

    occupiedArea: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
    },

    nspdBuildingLoaded: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },

    nspdLandLoaded: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },

    marketClassResolved: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },

    // Floor data - array of floor objects
    floors: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Array of floor objects with floor data',
    },

    fieldSourceHints: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
    },

    landCadCost: {
    type: DataTypes.DECIMAL(18, 2),
    allowNull: true,
    },

    totalOksAreaOnLand: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
    },

    referenceFloorCategory: {
        type: DataTypes.STRING(30),
        allowNull: true,
    },

    isHistoricalCenter: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
    },

    zoneCode: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },

    terZone: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },

    environmentCategory1: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    environmentCategory2: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },

    environmentCategory3: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
}, {
    tableName: 'project_questionnaires',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

export default ProjectQuestionnaire;
