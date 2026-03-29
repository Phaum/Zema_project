import express from 'express';
import {
  confirmProfileSubscriptionPayment,
  createProfileSubscriptionInvoice,
  getProfile,
  getProfileSubscription,
  updateProfileSettings,
  updateUserEmail,
} from '../controllers/authController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', authMiddleware, getProfile);
router.get('/subscription', authMiddleware, getProfileSubscription);
router.post('/subscription/invoice', authMiddleware, createProfileSubscriptionInvoice);
router.post('/subscription/confirm', authMiddleware, confirmProfileSubscriptionPayment);
router.put('/settings', authMiddleware, updateProfileSettings);
router.put('/email', authMiddleware, updateUserEmail);

export default router;
