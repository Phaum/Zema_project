import { createApiClient } from '../../shared/api';

const api = createApiClient({
    transportLabel: 'projects',
});

export default api;
