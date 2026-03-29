import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { registerRoutes } from './routes/index.js';
import { errorHandler, notFoundHandler } from './utils/errorHandler.js';

export function createApp() {
    const app = express();

    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ limit: '1mb', extended: true }));

    app.use(
        cors({
            origin: env.CLIENT_URL,
            credentials: true,
        })
    );

    registerRoutes(app);
    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}
