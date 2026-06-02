import {
    analyzeEnvironmentByCadastralNumber,
    getSavedEnvironmentAnalysis,
    toProjectEnvironmentCategory,
} from '../services/environmentAnalysisService.js';

function normalizeCadastralNumber(value) {
    return String(value || '').trim();
}

function toOptionalNumber(value) {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
}

function uniqueCategories(values = []) {
    return Array.from(new Set(
        values
            .map(toProjectEnvironmentCategory)
            .filter(Boolean)
    ));
}

function normalizeRankedCategories(items = []) {
    const seen = new Set();

    return (Array.isArray(items) ? items : []).reduce((accumulator, item) => {
        const key = toProjectEnvironmentCategory(item?.key || item);
        if (!key || seen.has(key)) {
            return accumulator;
        }

        seen.add(key);
        accumulator.push(
            item && typeof item === 'object'
                ? { ...item, internalKey: item.internalKey || item.key, key }
                : key
        );
        return accumulator;
    }, []);
}

function normalizeAnalysisCategories(analysis) {
    if (!analysis) {
        return analysis;
    }

    const details = analysis.environment_details_json && typeof analysis.environment_details_json === 'object'
        ? analysis.environment_details_json
        : null;
    const categories = details?.categories || {};
    const normalized = uniqueCategories([
        analysis.environment_category_1 || categories.primary,
        analysis.environment_category_2 || categories.secondary,
        analysis.environment_category_3 || categories.tertiary,
        ...(Array.isArray(categories.ranked) ? categories.ranked.map((item) => item?.key || item) : []),
    ]);

    const nextDetails = details
        ? {
            ...details,
            categories: {
                ...categories,
                primary: normalized[0] || null,
                secondary: normalized[1] || null,
                tertiary: normalized[2] || null,
                ranked: normalizeRankedCategories(categories.ranked),
            },
        }
        : details;

    return {
        ...analysis,
        environment_category_1: normalized[0] || null,
        environment_category_2: normalized[1] || null,
        environment_category_3: normalized[2] || null,
        environment_details_json: nextDetails,
    };
}

function buildAnalysisResponse(analysis, { fromCache = false } = {}) {
    const normalizedAnalysis = normalizeAnalysisCategories(analysis);

    return {
        success: true,
        data: normalizedAnalysis,
        meta: {
            fromCache,
            qualityFlag: normalizedAnalysis?.quality_flag || null,
            categories: [
                normalizedAnalysis?.environment_category_1,
                normalizedAnalysis?.environment_category_2,
                normalizedAnalysis?.environment_category_3,
            ].filter(Boolean),
        },
    };
}

export async function calculateEnvironmentByCadastralNumber(req, res) {
    try {
        const cadastralNumber = normalizeCadastralNumber(
            req.body?.cadastralNumber || req.body?.cadastral_number
        );

        if (!cadastralNumber) {
            return res.status(400).json({
                success: false,
                error: 'Не указан кадастровый номер',
            });
        }

        const result = await analyzeEnvironmentByCadastralNumber(cadastralNumber, {
            valuationDate: req.body?.valuationDate || req.body?.valuation_date || null,
            radiusMeters: toOptionalNumber(req.body?.radiusMeters ?? req.body?.radius_meters),
            forceRecalculation: Boolean(req.body?.forceRecalculation || req.body?.force_recalculation),
        });

        res.json(buildAnalysisResponse(result.analysis, {
            fromCache: result.fromCache,
        }));
    } catch (error) {
        console.error('Ошибка расчёта ближайшего окружения:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Не удалось рассчитать ближайшее окружение',
        });
    }
}

export async function getEnvironmentByCadastralNumber(req, res) {
    try {
        const cadastralNumber = normalizeCadastralNumber(req.params.cadastralNumber);

        if (!cadastralNumber) {
            return res.status(400).json({
                success: false,
                error: 'Не указан кадастровый номер',
            });
        }

        const analysis = await getSavedEnvironmentAnalysis(cadastralNumber, {
            radiusMeters: toOptionalNumber(req.query?.radiusMeters ?? req.query?.radius_meters),
        });

        if (!analysis) {
            return res.status(404).json({
                success: false,
                error: 'Сохранённый анализ окружения не найден',
            });
        }

        res.json(buildAnalysisResponse(analysis, {
            fromCache: true,
        }));
    } catch (error) {
        console.error('Ошибка получения сохранённого анализа окружения:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Не удалось получить анализ окружения',
        });
    }
}

export async function recalculateEnvironmentByCadastralNumber(req, res) {
    try {
        const cadastralNumber = normalizeCadastralNumber(req.params.cadastralNumber);

        if (!cadastralNumber) {
            return res.status(400).json({
                success: false,
                error: 'Не указан кадастровый номер',
            });
        }

        const result = await analyzeEnvironmentByCadastralNumber(cadastralNumber, {
            valuationDate: req.body?.valuationDate || req.body?.valuation_date || null,
            radiusMeters: toOptionalNumber(req.body?.radiusMeters ?? req.body?.radius_meters),
            forceRecalculation: true,
        });

        res.json(buildAnalysisResponse(result.analysis, {
            fromCache: false,
        }));
    } catch (error) {
        console.error('Ошибка принудительного пересчёта окружения:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Не удалось пересчитать анализ окружения',
        });
    }
}
