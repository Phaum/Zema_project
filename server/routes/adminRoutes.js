import { Router } from 'express';
import {authMiddleware} from '../middlewares/authMiddleware.js';
import requireAdmin from '../middlewares/requireAdmin.js';


import { getAdminOverview } from '../controllers/admin/adminOverviewController.js';
import {
    getAdminUsers,
    getAdminUserById,
    updateAdminUser,
    blockAdminUser,
    unblockAdminUser,
    setAdminUserRoles,
} from '../controllers/admin/adminUsersController.js';
import {
    getAdminProjects,
    getAdminProjectById,
    updateAdminProject,
    archiveAdminProject,
    deleteAdminProject,
} from '../controllers/admin/adminProjectsController.js';
import {
    getAdminCadastralRecords,
    getAdminCadastralRecordById,
    updateAdminCadastralRecord,
    refreshAdminCadastralRecord,
    bulkUpdateAdminCadastralRecords,
    importAdminCadastralRecords,
    exportAdminCadastralRecords,
} from '../controllers/admin/adminCadastralController.js';
import { getAdminAuditLogs } from '../controllers/admin/adminAuditController.js';
import uploadExcel from '../middlewares/uploadExcel.js';
import {
    getAdminMarketOffers,
    importMarketOffers,
    exportMarketOffers,
    bulkUpdateAdminMarketOffers,
    calculateMarketOfferEnvironment,
    bulkCalculateMarketOfferEnvironment,
    clearMarketOffers,
} from '../controllers/admin/adminMarketOffersController.js';
import {
    getAdminSpatialZones,
    createAdminSpatialZone,
    updateAdminSpatialZone,
    deleteAdminSpatialZone,
} from '../controllers/admin/adminSpatialZonesController.js';
import {
    getAdminAnalogues,
    importAdminAnalogues,
    exportAdminAnalogues,
    bulkUpdateAdminAnalogues,
    clearAdminAnalogues,
} from '../controllers/admin/adminAnaloguesController.js';
import {
    createAdminBillingPlan,
    getAdminBillingPlans,
    getAdminSubscriptions,
    updateAdminBillingPlan,
    updateAdminSubscription,
} from '../controllers/admin/adminBillingController.js';

const router = Router();

router.use(authMiddleware);
router.use(requireAdmin);

router.get('/overview', getAdminOverview);

router.get('/users', getAdminUsers);
router.get('/users/:id', getAdminUserById);
router.patch('/users/:id', updateAdminUser);
router.post('/users/:id/block', blockAdminUser);
router.post('/users/:id/unblock', unblockAdminUser);
router.post('/users/:id/roles', setAdminUserRoles);

router.get('/projects', getAdminProjects);
router.get('/projects/:id', getAdminProjectById);
router.patch('/projects/:id', updateAdminProject);
router.post('/projects/:id/archive', archiveAdminProject);
router.delete('/projects/:id', deleteAdminProject);

router.get('/cadastral-records', getAdminCadastralRecords);
router.get('/cadastral-records/:id', getAdminCadastralRecordById);
router.patch('/cadastral-records/:id', updateAdminCadastralRecord);
router.patch('/cadastral-records/bulk', bulkUpdateAdminCadastralRecords);
router.post('/cadastral-records/:id/refresh', refreshAdminCadastralRecord);
router.post('/cadastral-records/import', uploadExcel.single('file'), importAdminCadastralRecords);
router.get('/cadastral-records/export', exportAdminCadastralRecords);

router.get('/audit', getAdminAuditLogs);

router.get('/market-offers', getAdminMarketOffers);
router.patch('/market-offers/bulk', bulkUpdateAdminMarketOffers);
router.post('/market-offers/:id/calculate-environment', calculateMarketOfferEnvironment);
router.post('/market-offers/calculate-environment-bulk', bulkCalculateMarketOfferEnvironment);
router.post('/market-offers/import', uploadExcel.single('file'), importMarketOffers);
router.get('/market-offers/export', exportMarketOffers);
router.delete('/market-offers', clearMarketOffers);

router.get('/analogues', getAdminAnalogues);
router.patch('/analogues/bulk', bulkUpdateAdminAnalogues);
router.post('/analogues/import', uploadExcel.single('file'), importAdminAnalogues);
router.get('/analogues/export', exportAdminAnalogues);
router.delete('/analogues', clearAdminAnalogues);

router.get('/spatial-zones', getAdminSpatialZones);
router.post('/spatial-zones', createAdminSpatialZone);
router.patch('/spatial-zones/:id', updateAdminSpatialZone);
router.delete('/spatial-zones/:id', deleteAdminSpatialZone);

router.get('/billing/plans', getAdminBillingPlans);
router.post('/billing/plans', createAdminBillingPlan);
router.patch('/billing/plans/:id', updateAdminBillingPlan);
router.get('/billing/subscriptions', getAdminSubscriptions);
router.patch('/billing/subscriptions/:userId', updateAdminSubscription);

export default router;
