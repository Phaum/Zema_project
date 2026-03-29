import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
    getProjects,
    createProject,
    getProjectById,
    updateProject,
    deleteProject,
} from '../controllers/projectController.js';
import {
    getProjectQuestionnaire,
    saveProjectQuestionnaire,
    enrichProjectQuestionnaire,
} from '../controllers/projectQuestionnaireController.js';
import {
    calculateProject,
    getProjectResult,
    getProjectMarketContext,
} from '../controllers/projectCalculationController.js';
import {
    confirmProjectPayment,
    confirmSubscriptionPayment,
    createProjectInvoice,
    createSubscriptionInvoice,
    getProjectPaymentInfo,
} from '../controllers/projectPaymentController.js';

const router = express.Router();

router.get('/', authMiddleware, getProjects);
router.post('/', authMiddleware, createProject);
router.get('/:projectId', authMiddleware, getProjectById);
router.patch('/:projectId', authMiddleware, updateProject);
router.delete('/:projectId', authMiddleware, deleteProject);

router.get('/:projectId/questionnaire', authMiddleware, getProjectQuestionnaire);
router.post('/:projectId/questionnaire', authMiddleware, saveProjectQuestionnaire);
router.post('/:projectId/questionnaire/enrich', authMiddleware, enrichProjectQuestionnaire);

router.post('/:projectId/calculate', authMiddleware, calculateProject);
router.get('/:projectId/result', authMiddleware, getProjectResult);
router.get('/:projectId/market-context', authMiddleware, getProjectMarketContext);
router.get('/:projectId/payment', authMiddleware, getProjectPaymentInfo);
router.post('/:projectId/payment/invoice', authMiddleware, createProjectInvoice);
router.post('/:projectId/payment/confirm', authMiddleware, confirmProjectPayment);
router.post('/:projectId/payment/subscription/invoice', authMiddleware, createSubscriptionInvoice);
router.post('/:projectId/payment/subscription/confirm', authMiddleware, confirmSubscriptionPayment);

export default router;
