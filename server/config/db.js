import { Sequelize } from 'sequelize';
import { env } from './env.js';

export const sequelize = new Sequelize({
    database: env.DB_NAME,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    host: env.DB_HOST,
    port: env.DB_PORT,
    dialect: 'postgres',
    logging: env.DB_LOGGING ? console.log : false,
});
