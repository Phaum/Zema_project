import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import authRoutes from './authRoutes.js';
import cadastralRoutes from './cadastralRoutes.js';
import geoRoutes from './geoRoutes.js';
import nspdRoutes from './nspdRoutes.js';
import environmentRoutes from './environmentRoutes.js';
import profileRoutes from './profileRoutes.js';
import projectRoutes from './projectRoutes.js';
import adminRoutes from './adminRoutes.js';

function createAuthRouter() {
    const authRouter = Router();

    const loginLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5,
        standardHeaders: true,
        legacyHeaders: false,
        message: 'Слишком много попыток входа, попробуйте позже',
    });

    const registerLimiter = rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
    });

    authRouter.use('/login', loginLimiter);
    authRouter.use('/register', registerLimiter);
    authRouter.use(authRoutes);

    return authRouter;
}

export function createApiRouter() {
    const router = Router();

    router.use('/auth', createAuthRouter());
    router.use('/cadastral', cadastralRoutes);
    router.use('/geo', geoRoutes);
    router.use('/nspd', nspdRoutes);
    router.use('/environment', environmentRoutes);
    router.use('/profile', profileRoutes);
    router.use('/projects', projectRoutes);
    router.use('/admin', adminRoutes);

    router.get('/health', (req, res) => {
        res.json({ success: true });
    });

    return router;
}

export function registerRoutes(app) {
    app.use('/api', createApiRouter());
}
