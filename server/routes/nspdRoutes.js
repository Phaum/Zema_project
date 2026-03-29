import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
    getBuildingByCadastralNumber,
    getLandByCadastralNumber,
} from '../controllers/cadastralController.js';

const router = express.Router();

router.get('/building', authMiddleware, getBuildingByCadastralNumber);
router.get('/land', authMiddleware, getLandByCadastralNumber);

export default router;