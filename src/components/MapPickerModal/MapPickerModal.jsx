import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Button, Space, Typography, Alert, Spin, Segmented } from 'antd';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../../shared/api';

const { Text } = Typography;

const DEFAULT_PROVIDER = process.env.REACT_APP_MAP_PROVIDER || 'osm';
const YANDEX_API_KEY = process.env.REACT_APP_YANDEX_MAPS_API_KEY || '';
const HAS_YANDEX = Boolean(YANDEX_API_KEY);

const markerIcon = new L.Icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

function hasValidCoords(point) {
    return (
        point &&
        typeof point.lat === 'number' &&
        Number.isFinite(point.lat) &&
        typeof point.lng === 'number' &&
        Number.isFinite(point.lng)
    );
}

function OSMMapClickHandler({ value, onChange }) {
    useMapEvents({
        click(e) {
            onChange({
                lat: Number(e.latlng.lat.toFixed(8)),
                lng: Number(e.latlng.lng.toFixed(8)),
            });
        },
    });

    if (!hasValidCoords(value)) return null;
    return <Marker position={[value.lat, value.lng]} icon={markerIcon} />;
}

function OSMMapResizer({ active, center }) {
    const map = useMap();

    useEffect(() => {
        if (!active) return;

        const t1 = setTimeout(() => {
            map.invalidateSize();
            if (Array.isArray(center) && center.length === 2) {
                map.setView(center);
            }
        }, 150);

        const t2 = setTimeout(() => {
            map.invalidateSize();
        }, 350);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
        };
    }, [map, active, center]);

    return null;
}

function OSMMapView({ active, center, point, setPoint }) {
    return (
        <MapContainer
            center={center}
            zoom={13}
            scrollWheelZoom
            style={{ height: '100%', width: '100%' }}
        >
            <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <OSMMapResizer active={active} center={center} />
            <OSMMapClickHandler value={point} onChange={setPoint} />
        </MapContainer>
    );
}

function loadYandexMapsScript(apiKey) {
    return new Promise((resolve, reject) => {
        if (window.ymaps3) {
            resolve(window.ymaps3);
            return;
        }

        const existing = document.querySelector('script[data-yandex-maps="true"]');
        if (existing) {
            existing.addEventListener('load', async () => {
                try {
                    await window.ymaps3.ready;
                    resolve(window.ymaps3);
                } catch (e) {
                    reject(e);
                }
            });
            existing.addEventListener('error', reject);
            return;
        }

        const script = document.createElement('script');
        script.src = `https://api-maps.yandex.ru/v3/?apikey=${apiKey}&lang=ru_RU`;
        script.async = true;
        script.dataset.yandexMaps = 'true';

        script.onload = async () => {
            try {
                await window.ymaps3.ready;
                resolve(window.ymaps3);
            } catch (e) {
                reject(e);
            }
        };

        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function YandexMapView({ active, center, point, setPoint }) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const markerRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!active) return;

        let cancelled = false;

        async function init() {
            try {
                setLoading(true);
                setError('');

                const ymaps3 = await loadYandexMapsScript(YANDEX_API_KEY);
                if (cancelled || !containerRef.current) return;

                if (mapRef.current) {
                    mapRef.current.destroy();
                    mapRef.current = null;
                }

                const map = new ymaps3.YMap(
                    containerRef.current,
                    {
                        location: {
                            center: [center[1], center[0]],
                            zoom: 13,
                        },
                    },
                    [
                        new ymaps3.YMapDefaultSchemeLayer({}),
                        new ymaps3.YMapDefaultFeaturesLayer({}),
                    ]
                );

                map.addChild(
                    new ymaps3.YMapListener({
                        layer: 'any',
                        onClick: (object, event) => {
                            const coords = event?.coordinates;
                            if (!coords || coords.length !== 2) return;

                            setPoint({
                                lat: Number(coords[1].toFixed(8)),
                                lng: Number(coords[0].toFixed(8)),
                            });
                        },
                    })
                );

                mapRef.current = map;
                setLoading(false);
            } catch (e) {
                console.error('Yandex map init error:', e);
                if (!cancelled) {
                    setError('Не удалось загрузить Яндекс.Карту');
                    setLoading(false);
                }
            }
        }

        init();

        return () => {
            cancelled = true;
        };
    }, [active, center, setPoint]);

    useEffect(() => {
        const ymaps3 = window.ymaps3;
        const map = mapRef.current;
        if (!ymaps3 || !map) return;

        map.update({
            location: {
                center: [center[1], center[0]],
                zoom: 13,
            },
        });
    }, [center]);

    useEffect(() => {
        const ymaps3 = window.ymaps3;
        const map = mapRef.current;
        if (!ymaps3 || !map) return;

        if (markerRef.current) {
            map.removeChild(markerRef.current);
            markerRef.current = null;
        }

        if (hasValidCoords(point)) {
            const marker = new ymaps3.YMapMarker(
                {
                    coordinates: [point.lng, point.lat],
                    draggable: false,
                },
                (() => {
                    const el = document.createElement('div');
                    el.style.width = '18px';
                    el.style.height = '18px';
                    el.style.borderRadius = '50%';
                    el.style.background = '#1677ff';
                    el.style.border = '3px solid #ffffff';
                    el.style.boxShadow = '0 2px 10px rgba(0,0,0,0.25)';
                    return el;
                })()
            );

            map.addChild(marker);
            markerRef.current = marker;
        }
    }, [point]);

    useEffect(() => {
        return () => {
            if (mapRef.current) {
                mapRef.current.destroy();
                mapRef.current = null;
            }
        };
    }, []);

    if (loading) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Space>
                    <Spin />
                    <Text type="secondary">Загружаем Яндекс.Карту…</Text>
                </Space>
            </div>
        );
    }

    if (error) {
        return <Alert type="error" showIcon message={error} />;
    }

    return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />;
}

export default function MapPickerModal({
   open,
   initialValue,
   onCancel,
   onConfirm,
}) {
    const [provider, setProvider] = useState(HAS_YANDEX ? DEFAULT_PROVIDER : 'osm');
    const [point, setPoint] = useState(initialValue || null);
    const [addressData, setAddressData] = useState(null);
    const [addressLoading, setAddressLoading] = useState(false);
    const [addressResolved, setAddressResolved] = useState(false);

    useEffect(() => {
        if (open) {
            setPoint(initialValue || null);
            setAddressData(null);
            setAddressResolved(false);
            setProvider(HAS_YANDEX ? DEFAULT_PROVIDER : 'osm');
        }
    }, [open, initialValue]);

    useEffect(() => {
        if (!HAS_YANDEX && provider !== 'osm') {
            setProvider('osm');
        }
    }, [provider]);

    useEffect(() => {
        let ignore = false;

        async function reverseGeocode() {
            if (!hasValidCoords(point)) {
                setAddressData(null);
                setAddressResolved(false);
                setAddressLoading(false);
                return;
            }

            setAddressData(null);
            setAddressResolved(false);
            setAddressLoading(true);

            try {
                const { data } = await api.get('/geo/reverse', {
                    params: {
                        lat: point.lat,
                        lng: point.lng,
                    },
                });

                if (!ignore) {
                    setAddressData(data || null);
                    setAddressResolved(true);
                }
            } catch (error) {
                console.error('Reverse geocode error:', error);
                if (!ignore) {
                    setAddressData(null);
                    setAddressResolved(true);
                }
            } finally {
                if (!ignore) {
                    setAddressLoading(false);
                }
            }
        }

        reverseGeocode();

        return () => {
            ignore = true;
        };
    }, [point]);

    const center = useMemo(() => {
        if (hasValidCoords(point)) {
            return [point.lat, point.lng];
        }
        return [59.9386, 30.3141];
    }, [point]);

    const handleConfirm = () => {
        if (!hasValidCoords(point)) return;

        onConfirm({
            lat: point.lat,
            lng: point.lng,
            address: addressData?.address || '',
            displayName: addressData?.displayName || '',
            mapProvider: provider,
        });
    };

    const addressText = !hasValidCoords(point)
        ? 'Точка ещё не выбрана.'
        : addressLoading
            ? null
            : (addressData?.displayName || addressData?.address || (addressResolved ? 'Не удалось определить' : '—'));

    return (
        <Modal
            title="Выбор объекта на карте"
            open={open}
            onCancel={onCancel}
            width={920}
            destroyOnHidden={false}
            footer={
                <Space>
                    <Button onClick={onCancel}>Отмена</Button>
                    <Button type="primary" onClick={handleConfirm} disabled={!hasValidCoords(point)}>
                        Подтвердить точку
                    </Button>
                </Space>
            }
        >
            <div style={{ marginBottom: 12 }}>
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <Alert
                        type="info"
                        showIcon
                        message="Кликните по карте, чтобы выбрать местоположение объекта. После выбора адрес будет определён автоматически."
                    />

                    {HAS_YANDEX ? (
                        <Segmented
                            block
                            value={provider}
                            onChange={setProvider}
                            options={[
                                { label: 'OpenStreetMap', value: 'osm' },
                                { label: 'Яндекс.Карты', value: 'yandex' },
                            ]}
                        />
                    ) : null}
                </Space>
            </div>

            <div
                style={{
                    height: 460,
                    overflow: 'hidden',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: '#f5f5f5',
                }}
            >
                {provider === 'yandex' && HAS_YANDEX ? (
                    <YandexMapView
                        active={open && provider === 'yandex'}
                        center={center}
                        point={point}
                        setPoint={setPoint}
                    />
                ) : (
                    <OSMMapView
                        active={open && provider === 'osm'}
                        center={center}
                        point={point}
                        setPoint={setPoint}
                    />
                )}
            </div>

            <div style={{ marginTop: 16 }}>
                {!hasValidCoords(point) ? (
                    <Text type="secondary">{addressText}</Text>
                ) : (
                    <Space direction="vertical" size={4}>
                        <Text>
                            Координаты: {point.lat}, {point.lng}
                        </Text>

                        {addressLoading ? (
                            <Space>
                                <Spin size="small" />
                                <Text type="secondary">Определяем адрес…</Text>
                            </Space>
                        ) : (
                            <Text>
                                Адрес: {addressText}
                            </Text>
                        )}
                    </Space>
                )}
            </div>
        </Modal>
    );
}
