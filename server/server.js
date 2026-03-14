import dotenv from 'dotenv';

dotenv.config();

import express from 'express';
import cors from 'cors';
import { sequelize } from './config/db.js';
import './models/index.js'; 
import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import { getFullObjectInfo } from './controllers/cadastralController.js';
// import adminRoutes from './routes/adminRoutes.js'; // WHEN ADMINS ROUTES WILL BE ADDED


// Где-то в начале запуска приложения
await sequelize.sync({ force: false }); 
console.log("База данных пересоздана по новым моделям");
// LOADING VARIABLES FROM .env

const app = express();
app.use(express.json());

app.use(cors({ origin: 'http://localhost:3000' })); // or '*' for dev

// CONNECTING ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/cadastral', getFullObjectInfo);
// app.use('/api/admin', adminRoutes); WHEN ADMINS ROUTES WILL BE ADDED

// LAUNCHING SERVER
const PORT = process.env.PORT || 8080;

async function startServer() {
  await sequelize.sync({ alter: true });
  try {
    // CHECKING THE CONNECTION TO DB
    await sequelize.authenticate();
    console.log('Подключение к PostgreSQL успешно установлено.');

    // MODELS SYNC 
    await sequelize.sync(); 
    console.log('Модели синхронизированы с БД.');

    app.listen(PORT, () => {
      console.log(`Сервер запущен на http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Не удалось запустить сервер:', error);
  }
}

startServer();