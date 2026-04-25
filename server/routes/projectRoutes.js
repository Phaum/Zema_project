import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
    getProjects,
    createProject,
    getProjectById,
    getProjectObjectPhoto,
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

router.use(authMiddleware);

router.get('/', getProjects);
router.post('/', createProject);
router.get('/:projectId', getProjectById);
router.patch('/:projectId', updateProject);
router.delete('/:projectId', deleteProject);
router.get('/:projectId/object-photo', getProjectObjectPhoto);

router.get('/:projectId/questionnaire', getProjectQuestionnaire);
router.post('/:projectId/questionnaire', saveProjectQuestionnaire);
router.post('/:projectId/questionnaire/enrich', enrichProjectQuestionnaire);

router.post('/:projectId/calculate', calculateProject);
router.get('/:projectId/result', getProjectResult);
router.get('/:projectId/market-context', getProjectMarketContext);
router.get('/:projectId/payment', getProjectPaymentInfo);
router.post('/:projectId/payment/invoice', createProjectInvoice);
router.post('/:projectId/payment/confirm', confirmProjectPayment);
router.post('/:projectId/payment/subscription/invoice', createSubscriptionInvoice);
router.post('/:projectId/payment/subscription/confirm', confirmSubscriptionPayment);

export default router;
