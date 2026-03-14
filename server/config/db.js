import { Sequelize } from 'sequelize';

//connect to db
export const sequelize = new Sequelize('zema_db', 'project_user', 't{%IR#5BrgWgskV1AMsbZKr@w', { 
  host: 'codeak.ru',
  dialect: 'postgres', 
  logging: console.log // ТЕПЕРЬ МЫ БУДЕМ ВИДЕТЬ ЗАПРОСЫ
});