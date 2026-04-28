import { createApiClient, unwrapDataEnvelope } from '../../shared/api';

const adminApi = createApiClient({
    scope: '/admin',
    transportLabel: 'admin',
    transformResponse: unwrapDataEnvelope,
});

export async function fetchAdminOverview() {
    const { data } = await adminApi.get('/overview');
    return data;
}

export async function fetchAdminUsers(params = {}) {
    const { data } = await adminApi.get('/users', { params });
    return data;
}

export async function fetchAdminUserById(id) {
    const { data } = await adminApi.get(`/users/${id}`);
    return data;
}

export async function updateAdminUser(id, payload) {
    const { data } = await adminApi.patch(`/users/${id}`, payload);
    return data;
}

export async function blockAdminUser(id) {
    const { data } = await adminApi.post(`/users/${id}/block`);
    return data;
}

export async function unblockAdminUser(id) {
    const { data } = await adminApi.post(`/users/${id}/unblock`);
    return data;
}

export async function setAdminUserRoles(id, roles) {
    const { data } = await adminApi.post(`/users/${id}/roles`, { roles });
    return data;
}

export async function fetchAdminProjects(params = {}) {
    const { data } = await adminApi.get('/projects', { params });
    return data;
}

export async function fetchAdminProjectById(id) {
    const { data } = await adminApi.get(`/projects/${id}`);
    return data;
}

export async function updateAdminProject(id, payload) {
    const { data } = await adminApi.patch(`/projects/${id}`, payload);
    return data;
}

export async function archiveAdminProject(id) {
    const { data } = await adminApi.post(`/projects/${id}/archive`);
    return data;
}

export async function deleteAdminProject(id) {
    const { data } = await adminApi.delete(`/projects/${id}`);
    return data;
}

export async function fetchAdminCadastralRecords(params = {}) {
    const { data } = await adminApi.get('/cadastral-records', { params });
    return data;
}

export async function fetchAdminCadastralRecordById(id) {
    const { data } = await adminApi.get(`/cadastral-records/${id}`);
    return data;
}

export async function updateAdminCadastralRecord(id, payload) {
    const { data } = await adminApi.patch(`/cadastral-records/${id}`, payload);
    return data;
}

export async function refreshAdminCadastralRecord(id) {
    const { data } = await adminApi.post(`/cadastral-records/${id}/refresh`);
    return data;
}

export async function fetchAdminAudit(params = {}) {
    const { data } = await adminApi.get('/audit', { params });
    return data;
}

export async function fetchAdminMarketOffers(params = {}) {
    const { data } = await adminApi.get('/market-offers', { params });
    return data;
}

export async function importAdminMarketOffers(file, sheetName) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sheetName', sheetName);

    const { data } = await adminApi.post('/market-offers/import', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });

    return data;
}

export async function exportAdminMarketOffers() {
    const response = await adminApi.get('/market-offers/export', {
        responseType: 'blob',
    });

    return response.data;
}

export async function bulkUpdateAdminCadastralRecords(items) {
    const { data } = await adminApi.patch('/cadastral-records/bulk', { items });
    return data;
}

export async function importAdminCadastralRecords(file, sheetName) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sheetName', sheetName);

    const { data } = await adminApi.post('/cadastral-records/import', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });

    return data;
}

export async function exportAdminCadastralRecords() {
    const response = await adminApi.get('/cadastral-records/export', {
        responseType: 'blob',
    });

    return response.data;
}

export async function bulkUpdateAdminMarketOffers(items) {
    const { data } = await adminApi.patch('/market-offers/bulk', { items });
    return data;
}

export async function calculateAdminMarketOfferEnvironment(id) {
    const { data } = await adminApi.post(`/market-offers/${id}/calculate-environment`);
    return data;
}

export async function bulkCalculateAdminMarketOfferEnvironment(ids = []) {
    const { data } = await adminApi.post('/market-offers/calculate-environment-bulk', { ids });
    return data;
}

export async function clearAdminMarketOffers() {
    const { data } = await adminApi.delete('/market-offers');
    return data;
}

export async function fetchAdminSpatialZones(params = {}) {
    const { data } = await adminApi.get('/spatial-zones', { params });
    return data;
}

export async function createAdminSpatialZone(payload) {
    const { data } = await adminApi.post('/spatial-zones', payload);
    return data;
}

export async function updateAdminSpatialZone(id, payload) {
    const { data } = await adminApi.patch(`/spatial-zones/${id}`, payload);
    return data;
}

export async function deleteAdminSpatialZone(id) {
    const { data } = await adminApi.delete(`/spatial-zones/${id}`);
    return data;
}

export async function fetchAdminAnalogues(params = {}) {
    const { data } = await adminApi.get('/analogues', { params });
    return data;
}

export async function importAdminAnalogues(file, sheetName) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sheetName', sheetName);

    const { data } = await adminApi.post('/analogues/import', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });

    return data;
}

export async function exportAdminAnalogues() {
    const response = await adminApi.get('/analogues/export', {
        responseType: 'blob',
    });

    return response.data;
}

export async function bulkUpdateAdminAnalogues(items) {
    const { data } = await adminApi.patch('/analogues/bulk', { items });
    return data;
}

export async function clearAdminAnalogues() {
    const { data } = await adminApi.delete('/analogues');
    return data;
}

export async function fetchAdminBillingPlans() {
    const { data } = await adminApi.get('/billing/plans');
    return data;
}

export async function createAdminBillingPlan(payload) {
    const { data } = await adminApi.post('/billing/plans', payload);
    return data;
}

export async function updateAdminBillingPlan(id, payload) {
    const { data } = await adminApi.patch(`/billing/plans/${id}`, payload);
    return data;
}

export async function deleteAdminBillingPlan(id) {
    const { data } = await adminApi.delete(`/billing/plans/${id}`);
    return data;
}

export async function fetchAdminSubscriptions(params = {}) {
    const { data } = await adminApi.get('/billing/subscriptions', { params });
    return data;
}

export async function updateAdminSubscription(userId, payload) {
    const { data } = await adminApi.patch(`/billing/subscriptions/${userId}`, payload);
    return data;
}

export default adminApi;
