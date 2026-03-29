import os
import logging
from pathlib import Path

import osmnx as ox
import networkx as nx
import pandas as pd
from scipy.spatial import KDTree
from fastapi import FastAPI, HTTPException
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("geo_service")

CITY_NAME = os.getenv("CITY_NAME", "Санкт-Петербург, Россия")
HOST = os.getenv("GEO_HOST", "127.0.0.1")
PORT = int(os.getenv("GEO_PORT", "8000"))
GRAPH_CACHE_FILE = os.getenv("GRAPH_CACHE_FILE", "spb_walk.graphml")

app = FastAPI(title="Geo Service", version="1.0.0")

G = None
METRO_TREE = None
METRO_NAMES = []
METRO_COORDS = []

EXCLUDED_STATIONS = {
    "депо",
    "электродепо",
}


def normalize_station_name(value):
    if value is None:
        return None
    return str(value).strip()


def load_or_build_graph():
    cache_path = Path(GRAPH_CACHE_FILE)

    if cache_path.exists():
        logger.info("Загрузка графа из кэша: %s", cache_path)
        return ox.load_graphml(cache_path)

    logger.info("Кэш графа не найден, загружаем граф из OSM для: %s", CITY_NAME)
    graph = ox.graph_from_place(CITY_NAME, network_type="walk")
    ox.save_graphml(graph, cache_path)
    logger.info("Граф сохранён в кэш: %s", cache_path)
    return graph


def build_metro_index():
    logger.info("Загрузка станций метро из OSM для: %s", CITY_NAME)

    metro_points = ox.features_from_place(
        CITY_NAME,
        tags={
            "railway": ["subway_entrance"],
            "station": "subway",
        },
    )

    if metro_points.empty:
        raise RuntimeError("Не удалось загрузить станции метро из OSM")

    seen = set()
    coords = []
    names = []

    for _, row in metro_points.iterrows():
        raw_name = row.get("name") or row.get("station")
        name = normalize_station_name(raw_name)

        if not name:
            continue

        normalized = name.lower()
        if normalized in seen:
            continue

        if any(bad in normalized for bad in EXCLUDED_STATIONS):
            continue

        geom = row.geometry
        if geom is None:
            continue

        point = geom.representative_point()
        lat = float(point.y)
        lon = float(point.x)

        coords.append([lat, lon])
        names.append(name)
        seen.add(normalized)

    if not coords:
        raise RuntimeError("После фильтрации не осталось станций метро")

    logger.info("Загружено уникальных станций/входов метро: %s", len(coords))
    return KDTree(coords), names, coords


@app.on_event("startup")
def load_geo_data():
    global G, METRO_TREE, METRO_NAMES, METRO_COORDS

    try:
        logger.info("Инициализация геосервиса...")
        G = load_or_build_graph()
        METRO_TREE, METRO_NAMES, METRO_COORDS = build_metro_index()
        logger.info("Геосервис готов к работе")
    except Exception as e:
        logger.exception("Ошибка инициализации геосервиса: %s", e)
        G = None
        METRO_TREE = None
        METRO_NAMES = []
        METRO_COORDS = []


@app.get("/health")
async def health():
    return {
        "status": "ok" if G is not None and METRO_TREE is not None else "degraded",
        "city": CITY_NAME,
        "graph_loaded": G is not None,
        "metro_loaded": METRO_TREE is not None,
        "stations_count": len(METRO_NAMES),
    }


@app.get("/calculate")
async def calculate_metro(lat: float, lon: float):
    if G is None or METRO_TREE is None:
        raise HTTPException(status_code=503, detail="Геоданные ещё не загружены")

    try:
        _, idx = METRO_TREE.query((lat, lon))
        m_lat, m_lon = METRO_COORDS[idx]
        station_name = METRO_NAMES[idx]

        n_from = ox.distance.nearest_nodes(G, X=lon, Y=lat)
        n_to = ox.distance.nearest_nodes(G, X=m_lon, Y=m_lat)

        walk_dist = nx.shortest_path_length(G, n_from, n_to, weight="length")

        return {
            "status": "success",
            "station": station_name,
            "distance": round(float(walk_dist), 1),
        }
    except nx.NetworkXNoPath:
        raise HTTPException(status_code=404, detail="Не найден пешеходный маршрут до метро")
    except Exception as e:
        logger.exception("Ошибка расчёта расстояния до метро: %s", e)
        raise HTTPException(status_code=500, detail=f"Ошибка расчёта метро: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)