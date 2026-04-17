export const DEFAULT_USER_SETTINGS = Object.freeze({
    emailNotifications: true,
    cabinetNotifications: true,
    compactMode: false,
    showQuestionnaireHints: true,
    confirmImportantActions: true,
    rememberLastProject: true,
});

export function normalizeUserSettings(rawSettings) {
    const source =
        rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings)
            ? rawSettings
            : {};

    return Object.keys(DEFAULT_USER_SETTINGS).reduce((acc, key) => {
        acc[key] =
            typeof source[key] === 'boolean'
                ? source[key]
                : DEFAULT_USER_SETTINGS[key];
        return acc;
    }, {});
}

export function getLastProjectStorageKey(userId) {
    return `zema_last_project_${userId || 'guest'}`;
}
