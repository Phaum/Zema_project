import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { getFullObjectInfo } from '../controllers/cadastralController.js';

const router = express.Router();

router.post('/info', authMiddleware, getFullObjectInfo);

export default router;