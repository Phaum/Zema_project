import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

const Role = sequelize.define('Role', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  role: {
    type: DataTypes.ENUM('GUEST', 'USER', 'ADMIN_ANALYST'),
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
}, {
  tableName: 'roles',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['role'],
      name: 'roles_role_unique',
    },
  ],
});

export default Role;