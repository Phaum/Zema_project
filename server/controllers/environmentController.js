import {
    analyzeEnvironmentByCadastralNumber,
    getSavedEnvironmentAnalysis,
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

function buildAnalysisResponse(analysis, { fromCache = false } = {}) {
    return {
        success: true,
        data: analysis,
        meta: {
            fromCache,
            qualityFlag: analysis?.quality_flag || null,
            categories: [
                analysis?.environment_category_1,
                analysis?.environment_category_2,
                analysis?.environment_category_3,
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
