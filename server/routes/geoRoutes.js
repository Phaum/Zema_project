import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { geocode, reverseGeocode } from '../controllers/geoController.js';

const router = express.Router();

router.get('/geocode', authMiddleware, geocode);
router.get('/reverse', authMiddleware, reverseGeocode);

export default router;
