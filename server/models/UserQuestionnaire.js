import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

const UserQuestionnaire = sequelize.define('UserQuestionnaire', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },

    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },

    calculationMethod: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'market',
    },

    projectName: {
        type: DataTypes.STRING(255),
        allowNull: false,
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
}, {
    tableName: 'user_questionnaires',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['user_id'],
            name: 'user_questionnaires_user_id_idx',
        },
    ],
});

export default UserQuestionnaire;