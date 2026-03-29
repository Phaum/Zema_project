import User from './User.js';
import Role from './Role.js';
import UserRole from './UserRole.js';
import CadastralData from './cadastral_data.js';
import ValuationProject from './ValuationProject.js';
import ProjectQuestionnaire from './ProjectQuestionnaire.js';
import ProjectResult from './ProjectResult.js';
import SpatialZone from './SpatialZone.js';
import EnvironmentAnalysis from './EnvironmentAnalysis.js';
import BillingPlan from './BillingPlan.js';

User.belongsToMany(Role, {
  through: UserRole,
  foreignKey: 'user_id',
  otherKey: 'role_id',
});

Role.belongsToMany(User, {
  through: UserRole,
  foreignKey: 'role_id',
  otherKey: 'user_id',
});

User.hasMany(ValuationProject, {
  foreignKey: 'user_id',
  as: 'projects',
  onDelete: 'CASCADE',
});

ValuationProject.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
});

ValuationProject.hasOne(ProjectQuestionnaire, {
  foreignKey: 'project_id',
  as: 'questionnaire',
  onDelete: 'CASCADE',
});

ProjectQuestionnaire.belongsTo(ValuationProject, {
  foreignKey: 'project_id',
  as: 'project',
});

ValuationProject.hasOne(ProjectResult, {
  foreignKey: 'project_id',
  as: 'result',
  onDelete: 'CASCADE',
});

ProjectResult.belongsTo(ValuationProject, {
  foreignKey: 'project_id',
  as: 'project',
});

export {
  User,
  Role,
  UserRole,
  CadastralData,
  ValuationProject,
  ProjectQuestionnaire,
  ProjectResult,
  SpatialZone,
  EnvironmentAnalysis,
  BillingPlan,
};
