import { env } from './config/env.js';
import { initDatabase } from './utils/initDatabase.js';
import { createApp } from './app.js';

import './models/index.js';
const app = createApp();

async function startServer() {
  try {
    await initDatabase();

    const server = app.listen(env.PORT, () => {
      console.log(`Сервер запущен на порту ${env.PORT}`);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Порт ${env.PORT} уже в использовании`);
        process.exit(1);
      }
      throw error;
    });

    process.on('SIGTERM', () => {
      console.log('SIGTERM получен, завершаю работу...');
      server.close(() => {
      console.log('Сервер завершил работу');
      process.exit(0);
      });
    });
  } catch (error) {
    console.error('Не удалось запустить сервер:', error);
    process.exit(1);
  }
}

startServer();
