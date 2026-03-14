import express from 'express';
import { getFullObjectInfo } from '../controllers/cadastralController.js';
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/info', getFullObjectInfo);

export default router;