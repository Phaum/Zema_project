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

router.use(authMiddleware);

router.get('/', getProfile);
router.get('/subscription', getProfileSubscription);
router.post('/subscription/invoice', createProfileSubscriptionInvoice);
router.post('/subscription/confirm', confirmProfileSubscriptionPayment);
router.put('/settings', updateProfileSettings);
router.put('/email', updateUserEmail);

export default router;
