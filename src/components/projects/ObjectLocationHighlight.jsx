import React, { useEffect, useMemo, useState } from 'react';
import { GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import api from './api';

const addressGeometryCache = new Map();

function normalizeAddressKey(address) {
    return `v2:${String(address || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()}`;
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

export function useAddressGeometry(address) {
    const normalizedKey = useMemo(() => normalizeAddressKey(address), [address]);
    const [state, setState] = useState(() => {
        if (!normalizedKey || !addressGeometryCache.has(normalizedKey)) {
            return {
                loading: false,
                data: null,
            };
        }

        return {
            loading: false,
            data: addressGeometryCache.get(normalizedKey),
        };
    });

    useEffect(() => {
        if (!normalizedKey) {
            setState({
                loading: false,
                data: null,
            });
            return undefined;
        }

        if (addressGeometryCache.has(normalizedKey)) {
            setState({
                loading: false,
                data: addressGeometryCache.get(normalizedKey),
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

                const { data } = await api.get('/geo/geocode', {
                    params: { address },
                });

                const normalizedData = {
                    geojson: data?.geojson || null,
                    bounds: data?.bounds || null,
                    lat: Number(data?.lat),
                    lng: Number(data?.lng),
                    address: data?.address || data?.displayName || address,
                };

                addressGeometryCache.set(normalizedKey, normalizedData);

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
    }, [address, normalizedKey]);

    return state;
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
