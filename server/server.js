import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { initDatabase } from './utils/initDatabase.js';
import { errorHandler, notFoundHandler } from './utils/errorHandler.js';

import './models/index.js';
import authRoutes from './routes/authRoutes.js';
import cadastralRoutes from './routes/cadastralRoutes.js';
import geoRoutes from './routes/geoRoutes.js';
import nspdRoutes from './routes/nspdRoutes.js';
import environmentRoutes from './routes/environmentRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'CLIENT_URL', 'DB_HOST', 'DB_NAME', 'DB_USER'];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingEnvVars.length > 0) {
  console.error(`Отсутствуют переменные окружения: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const app = express();

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

// Rate limiting for login to prevent brute force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Слишком много попыток входа, попробуйте позже',
});

// Apply rate limiter to auth routes
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 registrations per hour
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/cadastral', cadastralRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/nspd', nspdRoutes);
app.use('/api/environment', environmentRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true });
});

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

const PORT = Number(process.env.PORT || 5000);

async function startServer() {
  try {
    await initDatabase();

    const server = app.listen(PORT, () => {
      console.log(`Сервер запущен на порту ${PORT}`);
    });

    // Handle port already in use
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Порт ${PORT} уже в использовании`);
        process.exit(1);
      }
      throw error;
    });

    // Handle graceful shutdown
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
