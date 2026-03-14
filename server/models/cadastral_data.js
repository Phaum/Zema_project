import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

const CadastralData = sequelize.define('CadastralData', {
  cadastral_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  object_type: DataTypes.STRING(100),
  year_built: DataTypes.STRING(100),
  year_commisioning: DataTypes.STRING(100),
  address: DataTypes.TEXT,
  district: DataTypes.STRING(255),
  
  // Координаты
  latitude: DataTypes.DECIMAL(11, 8),
  longitude: DataTypes.DECIMAL(11, 8),
  
  // Метро
  nearest_metro: DataTypes.STRING(255),
  metro_distance: DataTypes.INTEGER,
  
  status: {
    type: DataTypes.ENUM('PENDING', 'COMPLETED', 'ERROR'),
    defaultValue: 'PENDING',
  }
}, {
  tableName: 'cadastral_records',
  underscored: true,
  timestamps: true,
});

export default CadastralData;