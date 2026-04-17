import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

const BillingPlan = sequelize.define('BillingPlan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  kind: {
    type: DataTypes.STRING(30),
    allowNull: false,
  },
  code: {
    type: DataTypes.STRING(60),
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  price: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'RUB',
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  features_json: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  },
  turnaround_text: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  period_months: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 100,
  },
  metadata_json: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
}, {
  tableName: 'billing_plans',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['kind', 'code'],
      name: 'billing_plans_kind_code_uidx',
    },
    {
      fields: ['kind', 'is_active', 'sort_order'],
      name: 'billing_plans_kind_active_sort_idx',
    },
  ],
});

export default BillingPlan;
