import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
    calculateEnvironmentByCadastralNumber,
    getEnvironmentByCadastralNumber,
    recalculateEnvironmentByCadastralNumber,
} from '../controllers/environmentController.js';

const router = express.Router();

router.post('/by-cadastral-number', authMiddleware, calculateEnvironmentByCadastralNumber);
router.get('/:cadastralNumber', authMiddleware, getEnvironmentByCadastralNumber);
router.post('/:cadastralNumber/recalculate', authMiddleware, recalculateEnvironmentByCadastralNumber);

export default router;
