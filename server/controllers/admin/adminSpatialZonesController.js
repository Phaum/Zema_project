import SpatialZone from '../../models/SpatialZone.js';
import { Op } from 'sequelize';
import { writeAdminAudit } from '../../utils/adminAudit.js';
import { reloadHistoricalCenterZonesCache } from '../../utils/historicalCenterResolver.js';
import { reloadSpatialZonesCache } from '../../utils/spatialZoneResolver.js';

function isValidPolygonFeature(feature) {
    const type = feature?.geometry?.type;
    return type === 'Polygon' || type === 'MultiPolygon';
}

function normalizeGeoJson(input) {
    if (!input || typeof input !== 'object') {
        throw new Error('GeoJSON не передан');
    }

    if (input.type === 'FeatureCollection') {
        const features = Array.isArray(input.features) ? input.features : [];
        const polygonFeatures = features.filter(isValidPolygonFeature);

        if (!polygonFeatures.length) {
            throw new Error('GeoJSON должен содержать хотя бы один Polygon/MultiPolygon');
        }

        return {
            type: 'FeatureCollection',
            features: polygonFeatures,
        };
    }

    if (input.type === 'Feature' && isValidPolygonFeature(input)) {
        return {
            type: 'FeatureCollection',
            features: [input],
        };
    }

    if (input.type === 'Polygon' || input.type === 'MultiPolygon') {
        return {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    properties: {},
                    geometry: input,
                },
            ],
        };
    }

    throw new Error('Поддерживаются только Polygon, MultiPolygon или FeatureCollection');
}

export async function getAdminSpatialZones(req, res) {
    try {
        const search = String(req.query.search || '').trim();
        const zoneType = String(req.query.zoneType || '').trim();

        const where = {};
        if (search) {
            where[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { code: { [Op.iLike]: `%${search}%` } },
                { description: { [Op.iLike]: `%${search}%` } },
            ];
        }
        if (zoneType) {
            where.zone_type = zoneType;
        }

        const rows = await SpatialZone.findAll({
            where,
            order: [['priority', 'DESC'], ['updated_at', 'DESC'], ['id', 'DESC']],
        });

        return res.json({ items: rows });
    } catch (error) {
        console.error('getAdminSpatialZones error:', error);
        return res.status(500).json({ error: 'Не удалось загрузить полигоны' });
    }
}

export async function createAdminSpatialZone(req, res) {
    try {
        const geojson = normalizeGeoJson(req.body.geojson);

        const row = await SpatialZone.create({
            name: String(req.body.name || '').trim() || 'Новая зона',
            zone_type: String(req.body.zoneType || 'historical_center').trim(),
            code: req.body.code ? String(req.body.code).trim() : null,
            priority: Number.isFinite(Number(req.body.priority)) ? Number(req.body.priority) : 0,
            geojson,
            color: String(req.body.color || '#1890ff').trim(),
            description: req.body.description ? String(req.body.description) : null,
            is_active: req.body.isActive !== false,
        });

        await writeAdminAudit(req, {
            action: 'spatial_zone_create',
            entity_type: 'spatial_zone',
            entity_id: row.id,
            payload: { name: row.name, zone_type: row.zone_type },
        });

        await reloadSpatialZonesCache();
        await reloadHistoricalCenterZonesCache();

        return res.status(201).json(row);
    } catch (error) {
        console.error('createAdminSpatialZone error:', error);
        return res.status(400).json({ error: error.message || 'Не удалось создать полигон' });
    }
}

export async function updateAdminSpatialZone(req, res) {
    try {
        const row = await SpatialZone.findByPk(req.params.id);
        if (!row) {
            return res.status(404).json({ error: 'Полигон не найден' });
        }

        const payload = {};

        if (req.body.name !== undefined) payload.name = String(req.body.name || '').trim() || row.name;
        if (req.body.zoneType !== undefined) payload.zone_type = String(req.body.zoneType || '').trim() || row.zone_type;
        if (req.body.code !== undefined) payload.code = req.body.code ? String(req.body.code).trim() : null;
        if (req.body.priority !== undefined) payload.priority = Number.isFinite(Number(req.body.priority)) ? Number(req.body.priority) : 0;
        if (req.body.color !== undefined) payload.color = String(req.body.color || '').trim() || '#1890ff';
        if (req.body.description !== undefined) payload.description = req.body.description ? String(req.body.description) : null;
        if (req.body.isActive !== undefined) payload.is_active = Boolean(req.body.isActive);
        if (req.body.geojson !== undefined) payload.geojson = normalizeGeoJson(req.body.geojson);

        await row.update(payload);

        await writeAdminAudit(req, {
            action: 'spatial_zone_update',
            entity_type: 'spatial_zone',
            entity_id: row.id,
            payload,
        });

        await reloadSpatialZonesCache();
        await reloadHistoricalCenterZonesCache();

        return res.json(row);
    } catch (error) {
        console.error('updateAdminSpatialZone error:', error);
        return res.status(400).json({ error: error.message || 'Не удалось обновить полигон' });
    }
}

export async function deleteAdminSpatialZone(req, res) {
    try {
        const row = await SpatialZone.findByPk(req.params.id);
        if (!row) {
            return res.status(404).json({ error: 'Полигон не найден' });
        }

        await row.destroy();

        await writeAdminAudit(req, {
            action: 'spatial_zone_delete',
            entity_type: 'spatial_zone',
            entity_id: row.id,
            payload: { name: row.name, zone_type: row.zone_type },
        });

        await reloadSpatialZonesCache();
        await reloadHistoricalCenterZonesCache();

        return res.json({ success: true });
    } catch (error) {
        console.error('deleteAdminSpatialZone error:', error);
        return res.status(500).json({ error: 'Не удалось удалить полигон' });
    }
}
