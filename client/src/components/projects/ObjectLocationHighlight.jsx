import React, { useEffect, useMemo, useState } from 'react';
import { GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import api from './api';

const objectGeometryCache = new Map();

function normalizeAddressKey(address) {
    return `v2:${String(address || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()}`;
}

function hasValidMapCoords(lat, lng) {
    return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function normalizePointKey(point) {
    if (!hasValidMapCoords(point?.lat, point?.lng)) {
        return '';
    }

    return `coords:v1:${Number(point.lat).toFixed(6)}:${Number(point.lng).toFixed(6)}`;
}

function normalizeBounds(bounds) {
    if (!bounds) {
        return null;
    }

    if (Array.isArray(bounds) && bounds.length === 2) {
        return bounds;
    }

    const south = Number(bounds?.south);
    const north = Number(bounds?.north);
    const west = Number(bounds?.west);
    const east = Number(bounds?.east);

    if (![south, north, west, east].every(Number.isFinite)) {
        return null;
    }

    return [
        [south, west],
        [north, east],
    ];
}

function hasPolygonGeometry(geojson) {
    const type = geojson?.type;

    if (type === 'FeatureCollection') {
        return Array.isArray(geojson.features) && geojson.features.some((feature) => (
            feature?.geometry?.type === 'Polygon' || feature?.geometry?.type === 'MultiPolygon'
        ));
    }

    if (type === 'Feature') {
        return geojson.geometry?.type === 'Polygon' || geojson.geometry?.type === 'MultiPolygon';
    }

    return type === 'Polygon' || type === 'MultiPolygon';
}

export function hasRenderableAddressGeometry(geometry) {
    return hasPolygonGeometry(geometry?.geojson);
}

export function buildLeafletBoundsFromAddressGeometry(geometry) {
    if (!geometry) {
        return null;
    }

    if (geometry.geojson) {
        try {
            const geoJsonLayer = L.geoJSON(geometry.geojson);
            const bounds = geoJsonLayer.getBounds();
            return bounds?.isValid?.() ? bounds : null;
        } catch {
            // ignore invalid geometry and fall back to bounds below
        }
    }

    const normalizedBounds = normalizeBounds(geometry.bounds);
    if (!normalizedBounds) {
        return null;
    }

    const bounds = L.latLngBounds(normalizedBounds);
    return bounds.isValid() ? bounds : null;
}

function normalizeGeometryResponse(data, { address = '', point = null, source = null } = {}) {
    return {
        geojson: data?.geojson || null,
        bounds: data?.bounds || null,
        lat: Number.isFinite(Number(data?.lat))
            ? Number(data.lat)
            : (hasValidMapCoords(point?.lat, point?.lng) ? Number(point.lat) : null),
        lng: Number.isFinite(Number(data?.lng))
            ? Number(data.lng)
            : (hasValidMapCoords(point?.lat, point?.lng) ? Number(point.lng) : null),
        address: data?.address || data?.displayName || address || '',
        source,
    };
}

async function loadGeometryByAddress(address) {
    const { data } = await api.get('/geo/geocode', {
        params: { address },
    });

    return normalizeGeometryResponse(data, {
        address,
        source: 'address',
    });
}

async function loadGeometryByPoint(point, address = '') {
    const { data } = await api.get('/geo/reverse', {
        params: {
            lat: Number(point.lat),
            lng: Number(point.lng),
        },
    });

    return normalizeGeometryResponse(data, {
        address,
        point,
        source: 'coords',
    });
}

export function useObjectGeometry({ address, point = null, preferPoint = true } = {}) {
    const pointKey = useMemo(() => normalizePointKey(point), [point]);
    const addressKey = useMemo(() => normalizeAddressKey(address), [address]);
    const primaryKey = preferPoint && pointKey ? pointKey : addressKey;

    const [state, setState] = useState(() => {
        if (!primaryKey || !objectGeometryCache.has(primaryKey)) {
            return {
                loading: false,
                data: null,
            };
        }

        return {
            loading: false,
            data: objectGeometryCache.get(primaryKey),
        };
    });

    useEffect(() => {
        if (!primaryKey) {
            setState({
                loading: false,
                data: null,
            });
            return undefined;
        }

        if (objectGeometryCache.has(primaryKey)) {
            setState({
                loading: false,
                data: objectGeometryCache.get(primaryKey),
            });
            return undefined;
        }

        let cancelled = false;

        async function loadGeometry() {
            try {
                setState((previous) => ({
                    ...previous,
                    loading: true,
                }));

                let normalizedData = null;

                if (preferPoint && pointKey) {
                    try {
                        normalizedData = await loadGeometryByPoint(point, address);
                    } catch {
                        normalizedData = null;
                    }
                }

                if (!normalizedData && addressKey) {
                    normalizedData = await loadGeometryByAddress(address);
                }

                if (normalizedData) {
                    objectGeometryCache.set(primaryKey, normalizedData);
                }

                if (!cancelled) {
                    setState({
                        loading: false,
                        data: normalizedData,
                    });
                }
            } catch (error) {
                if (!cancelled) {
                    setState({
                        loading: false,
                        data: null,
                    });
                }
            }
        }

        loadGeometry();

        return () => {
            cancelled = true;
        };
    }, [address, addressKey, point, pointKey, preferPoint, primaryKey]);

    return state;
}

export function useAddressGeometry(address) {
    return useObjectGeometry({ address, preferPoint: false });
}

export function ObjectLocationHighlight({
    geometry,
    color = '#c026d3',
    fillColor = '#d946ef',
}) {
    const glowPathOptions = useMemo(() => ({
        color: '#ffffff',
        weight: 11,
        opacity: 0.92,
        fillColor,
        fillOpacity: 0.1,
        className: 'object-location-highlight-glow',
    }), [fillColor]);
    const accentPathOptions = useMemo(() => ({
        color: '#7e22ce',
        weight: 6,
        opacity: 0.3,
        fillColor,
        fillOpacity: 0.14,
        className: 'object-location-highlight-accent',
    }), [fillColor]);
    const pathOptions = useMemo(() => ({
        color,
        weight: 2.75,
        opacity: 1,
        fillColor,
        fillOpacity: 0.22,
        className: 'object-location-highlight-shape',
    }), [color, fillColor]);
    const hasRenderablePolygon = hasRenderableAddressGeometry(geometry);

    if (hasRenderablePolygon) {
        return (
            <>
                <GeoJSON
                    data={geometry.geojson}
                    style={() => glowPathOptions}
                    interactive={false}
                />
                <GeoJSON
                    data={geometry.geojson}
                    style={() => accentPathOptions}
                    interactive={false}
                />
                <GeoJSON
                    data={geometry.geojson}
                    style={() => pathOptions}
                    interactive={false}
                />
            </>
        );
    }

    return null;
}
