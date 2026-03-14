import User from './User.js';
import Role from './Role.js';
import Questionnaire from './Questionnaire.js';

User.belongsToMany(Role, {
  through: 'user_roles',
  foreignKey: 'user_id',
  otherKey: 'role_id',
});

Role.belongsToMany(User, {
  through: 'user_roles',
  foreignKey: 'role_id',
  otherKey: 'user_id',
});

export { User, Role, Questionnaire };