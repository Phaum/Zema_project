import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';
import { DEFAULT_USER_SETTINGS } from '../constants/userSettings.js';

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  first_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  last_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'active',
  },
  debug_mode: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  settings_json: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: { ...DEFAULT_USER_SETTINGS },
  },
  subscription_status: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'inactive',
  },
  subscription_plan_code: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  subscription_started_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  subscription_expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  subscription_details_json: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

export default User;
