import { DataTypes } from 'sequelize';
import {sequelize} from '../config/db.js';
import User from './User.js';

const Questionnaire = sequelize.define('Questionnaire', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  cadastral_number: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('in_progress', 'completed'),
    defaultValue: 'in_progress'
  },
  current_step: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  steps_data: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  parsed_data: {
    type: DataTypes.JSON,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'questionnaires',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default Questionnaire;