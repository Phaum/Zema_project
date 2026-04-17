import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

const CadastralData = sequelize.define('CadastralData', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  cadastral_number: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
  },
  object_type: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  cadastral_quarter: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  year_built: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  year_commisioning: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  total_area: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: true,
  },
  land_area: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: true,
  },
  cad_cost: {
    type: DataTypes.DECIMAL(18, 2),
    allowNull: true,
  },
  specific_cadastral_cost: {
    type: DataTypes.DECIMAL(18, 6),
    allowNull: true,
  },
  permitted_use: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  address_display: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  address_document: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  district: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  ownership_form: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  latitude: {
    type: DataTypes.DECIMAL(12, 8),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(12, 8),
    allowNull: true,
  },
  nearest_metro: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  metro_distance: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  land_plot_cadastral_number: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  total_oks_area_on_land: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: true,
  },
  floor_count: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  source_provider: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  source_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  source_note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  source_updated_at: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  raw_payload_json: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'COMPLETED',
  },
}, {
  tableName: 'cadastral_records',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['cadastral_number'],
      name: 'cadastral_records_cadastral_number_uq',
    },
  ],
});

export default CadastralData;
