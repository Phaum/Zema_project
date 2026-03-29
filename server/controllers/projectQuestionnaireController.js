import { ProjectQuestionnaire, ValuationProject } from '../models/index.js';
import { enrichQuestionnaireData } from '../services/questionnaireEnrichmentService.js';

function toNumberOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    const num = Number(String(value).replace(',', '.').trim());
    return Number.isFinite(num) ? num : null;
}

function toIntegerOrNull(value) {
    const num = toNumberOrNull(value);
    return Number.isFinite(num) ? Math.trunc(num) : null;
}

function toBooleanOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'boolean') return value;

    const s = String(value).trim().toLowerCase();

    if (['1', 'true', 'да', 'yes'].includes(s)) return true;
    if (['0', 'false', 'нет', 'no'].includes(s)) return false;

    return null;
}

function pickFirst(...values) {
    for (const value of values) {
        if (value !== undefined) return value;
    }
    return undefined;
}

function normalizeFieldSourceHints(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const normalized = Object.entries(value).reduce((accumulator, [fieldName, source]) => {
        const normalizedFieldName = String(fieldName || '').trim();
        const normalizedSource = String(source || '').trim();

        if (!normalizedFieldName || !normalizedSource) {
            return accumulator;
        }

        accumulator[normalizedFieldName] = normalizedSource;
        return accumulator;
    }, {});

    return Object.keys(normalized).length > 0 ? normalized : {};
}

function normalizeOutgoing(row) {
    if (!row) return null;
    const plain = row.get ? row.get({ plain: true }) : row;

    return {
        ...plain,
        averageRentalRate: plain.averageRentalRate !== null ? Number(plain.averageRentalRate) : null,
        mapPointLat: plain.mapPointLat !== null ? Number(plain.mapPointLat) : null,
        mapPointLng: plain.mapPointLng !== null ? Number(plain.mapPointLng) : null,
        totalArea: plain.totalArea !== null ? Number(plain.totalArea) : null,
        landArea: plain.landArea !== null ? Number(plain.landArea) : null,
        leasableArea: plain.leasableArea !== null ? Number(plain.leasableArea) : null,
        occupancyRate: plain.occupancyRate !== null ? Number(plain.occupancyRate) : null,
        occupiedArea: plain.occupiedArea !== null ? Number(plain.occupiedArea) : null,
        metroDistance: plain.metroDistance !== null ? Number(plain.metroDistance) : null,
        cadCost: plain.cadCost !== null ? Number(plain.cadCost) : null,
        landCadCost: plain.landCadCost !== null ? Number(plain.landCadCost) : null,
        totalOksAreaOnLand: plain.totalOksAreaOnLand !== null ? Number(plain.totalOksAreaOnLand) : null,
        isHistoricalCenter: plain.isHistoricalCenter === null ? null : Boolean(plain.isHistoricalCenter),
        floors: Array.isArray(plain.floors) ? plain.floors : [],
        fieldSourceHints: normalizeFieldSourceHints(plain.fieldSourceHints) || {},
    };
}

function stripQuestionnaireMeta(payload = {}) {
    const cleaned = { ...payload };
    delete cleaned.id;
    delete cleaned.created_at;
    delete cleaned.updated_at;
    return cleaned;
}

async function getOwnedProject(projectId, userId) {
    return ValuationProject.findOne({
        where: { id: projectId, user_id: userId },
    });
}

async function getOwnedProjectWithQuestionnaire(projectId, userId) {
    const project = await getOwnedProject(projectId, userId);

    if (!project) {
        return { project: null, questionnaire: null };
    }

    const questionnaire = await ProjectQuestionnaire.findOne({
        where: { project_id: project.id },
    });

    return { project, questionnaire };
}

function buildQuestionnairePayload(body = {}, project = {}) {
    const payload = {
        project_id: project.id,

        projectName: pickFirst(body.projectName, project.name),
        calculationMethod: pickFirst(body.calculationMethod, 'market'),
        buildingCadastralNumber: pickFirst(body.buildingCadastralNumber, null),
        valuationDate: pickFirst(body.valuationDate, null),
        objectType: pickFirst(body.objectType, null),
        actualUse: pickFirst(body.actualUse, null),
        businessCenterClass: pickFirst(body.businessCenterClass, null),

        averageRentalRate: toNumberOrNull(
            pickFirst(body.averageRentalRate, body.average_rental_rate, null)
        ),

        mapPointLat: toNumberOrNull(
            pickFirst(body.mapPointLat, body.map_point_lat, null)
        ),
        mapPointLng: toNumberOrNull(
            pickFirst(body.mapPointLng, body.map_point_lng, null)
        ),

        objectAddress: pickFirst(body.objectAddress, body.object_address, null),
        addressConfirmed: Boolean(pickFirst(body.addressConfirmed, body.address_confirmed, false)),
        district: pickFirst(body.district, null),
        nearestMetro: pickFirst(body.nearestMetro, body.nearest_metro, null),

        metroDistance: toNumberOrNull(
            pickFirst(body.metroDistance, body.metro_distance, null)
        ),

        cadCost: toNumberOrNull(
            pickFirst(body.cadCost, body.cad_cost, null)
        ),

        permittedUse: pickFirst(body.permittedUse, body.permitted_use, null),

        totalArea: toNumberOrNull(
            pickFirst(body.totalArea, body.total_area, null)
        ),

        constructionYear: toIntegerOrNull(
            pickFirst(body.constructionYear, body.construction_year, null)
        ),

        aboveGroundFloors: toIntegerOrNull(
            pickFirst(body.aboveGroundFloors, body.above_ground_floors, null)
        ),

        hasBasementFloor: pickFirst(body.hasBasementFloor, body.has_basement_floor, null),

        undergroundFloors: toIntegerOrNull(
            pickFirst(body.undergroundFloors, body.underground_floors, null)
        ),

        landCadastralNumber: pickFirst(body.landCadastralNumber, body.land_cadastral_number, null),

        landArea: toNumberOrNull(
            pickFirst(body.landArea, body.land_area, null)
        ),

        hasPrepayment: pickFirst(body.hasPrepayment, body.has_prepayment, null),
        hasSecurityDeposit: pickFirst(body.hasSecurityDeposit, body.has_security_deposit, null),

        leasableArea: toNumberOrNull(
            pickFirst(body.leasableArea, body.leasable_area, null)
        ),

        occupancyRate: toNumberOrNull(
            pickFirst(body.occupancyRate, body.occupancy_rate, null)
        ),

        occupiedArea: toNumberOrNull(
            pickFirst(body.occupiedArea, body.occupied_area, null)
        ),

        nspdBuildingLoaded: Boolean(
            pickFirst(body.nspdBuildingLoaded, body.nspd_building_loaded, false)
        ),

        nspdLandLoaded: Boolean(
            pickFirst(body.nspdLandLoaded, body.nspd_land_loaded, false)
        ),

        marketClassResolved: pickFirst(body.marketClassResolved, body.market_class_resolved, null),

        floors: Array.isArray(body.floors) ? body.floors : [],

        landCadCost: toNumberOrNull(
            pickFirst(body.landCadCost, body.land_cad_cost, null)
        ),

        totalOksAreaOnLand: toNumberOrNull(
            pickFirst(body.totalOksAreaOnLand, body.total_oks_area_on_land, null)
        ),

        referenceFloorCategory: pickFirst(
            body.referenceFloorCategory,
            body.reference_floor_category,
            null
        ),

        isHistoricalCenter: toBooleanOrNull(
            pickFirst(
                body.isHistoricalCenter,
                body.is_historical_center,
                null
            )
        ),

        zoneCode: pickFirst(
            body.zoneCode,
            body.zone_code,
            null
        ),

        terZone: pickFirst(
            body.terZone,
            body.ter_zone,
            null
        ),

        environmentCategory1: pickFirst(
            body.environmentCategory1,
            body.environment_category_1,
            null
        ),

        environmentCategory2: pickFirst(
            body.environmentCategory2,
            body.environment_category_2,
            null
        ),

        environmentCategory3: pickFirst(
            body.environmentCategory3,
            body.environment_category_3,
            null
        ),
    };

    const fieldSourceHints = normalizeFieldSourceHints(body.fieldSourceHints);
    if (fieldSourceHints !== undefined) {
        payload.fieldSourceHints = fieldSourceHints;
    }

    return payload;
}

export const getProjectQuestionnaire = async (req, res) => {
    try {
        const project = await getOwnedProject(req.params.projectId, req.user.id);

        if (!project) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        const questionnaire = await ProjectQuestionnaire.findOne({
            where: { project_id: project.id },
        });

        res.json(normalizeOutgoing(questionnaire));
    } catch (error) {
        console.error('Ошибка получения анкеты проекта:', error);
        res.status(500).json({ error: 'Не удалось получить анкету проекта' });
    }
};

export const saveProjectQuestionnaire = async (req, res) => {
    try {
        const { project, questionnaire: existingQuestionnaire } = await getOwnedProjectWithQuestionnaire(
            req.params.projectId,
            req.user.id
        );

        if (!project) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        const payload = buildQuestionnairePayload(req.body, project);

        const baseValues = existingQuestionnaire
            ? normalizeOutgoing(existingQuestionnaire)
            : {};

        const mergedPayload = {
            ...stripQuestionnaireMeta(baseValues),
            ...payload,
            project_id: project.id,
        };

        const enrichment = await enrichQuestionnaireData(mergedPayload, {
            forceRefresh: Boolean(req.body.forceRefresh),
        });

        let questionnaire = existingQuestionnaire;

        if (questionnaire) {
            await questionnaire.update(stripQuestionnaireMeta(enrichment.questionnaire));
        } else {
            questionnaire = await ProjectQuestionnaire.create(stripQuestionnaireMeta(enrichment.questionnaire));
        }

        await project.update({
            status: 'validation',
            name: req.body.projectName || project.name,
            object_type: req.body.objectType || project.object_type,
        });

        res.json({
            success: true,
            questionnaire: normalizeOutgoing(questionnaire),
            enrichment: {
                autoFilledFields: enrichment.autoFilledFields,
                sourceHints: enrichment.sourceHints,
                warnings: enrichment.warnings,
                missingBuildingFields: enrichment.missingBuildingFields,
                missingLandFields: enrichment.missingLandFields,
            },
        });
    } catch (error) {
        console.error('Ошибка сохранения анкеты проекта:', error);
        res.status(500).json({ error: 'Не удалось сохранить анкету проекта' });
    }
};

export const enrichProjectQuestionnaire = async (req, res) => {
    try {
        const { project, questionnaire: existingQuestionnaire } = await getOwnedProjectWithQuestionnaire(
            req.params.projectId,
            req.user.id
        );

        if (!project) {
            return res.status(404).json({ error: 'Проект не найден' });
        }

        const baseValues = existingQuestionnaire
            ? stripQuestionnaireMeta(normalizeOutgoing(existingQuestionnaire))
            : {
                projectName: project.name || '',
                objectType: project.object_type || 'здание',
            };

        const payload = buildQuestionnairePayload(req.body, project);

        const mergedPayload = {
            ...baseValues,
            ...payload,
            project_id: project.id,
        };

        const enrichment = await enrichQuestionnaireData(mergedPayload, {
            forceRefresh: Boolean(req.body.forceRefresh),
        });

        let questionnaire = existingQuestionnaire;

        if (questionnaire) {
            await questionnaire.update(stripQuestionnaireMeta(enrichment.questionnaire));
            questionnaire = await questionnaire.reload();
        }

        res.json({
            success: true,
            questionnaire: normalizeOutgoing(questionnaire || enrichment.questionnaire),
            enrichment: {
                autoFilledFields: enrichment.autoFilledFields,
                sourceHints: enrichment.sourceHints,
                warnings: enrichment.warnings,
                missingBuildingFields: enrichment.missingBuildingFields,
                missingLandFields: enrichment.missingLandFields,
            },
        });
    } catch (error) {
        console.error('Ошибка обогащения анкеты проекта:', error);
        res.status(500).json({ error: 'Не удалось дополнить анкету проекта' });
    }
};
