import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
    calculateMetro,
    geocode,
    geoHealth,
    reverseGeocode,
} from '../controllers/geoController.js';

const router = express.Router();

router.get('/geocode', authMiddleware, geocode);
router.get('/reverse', authMiddleware, reverseGeocode);
router.get('/health', authMiddleware, geoHealth);
router.get('/calculate', authMiddleware, calculateMetro);

export default router;
