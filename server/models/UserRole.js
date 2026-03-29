import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

const UserRole = sequelize.define('UserRole', {
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
    },
    role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
    },
}, {
    tableName: 'user_roles',
    timestamps: false,
});

export default UserRole;