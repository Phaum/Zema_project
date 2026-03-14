import osmnx as ox
import networkx as nx
import numpy as np
from scipy.spatial import cKDTree
from fastapi import FastAPI, HTTPException
import uvicorn
import os

app = FastAPI(title="Geo-Metro Service")

# Глобальные переменные
G = None
METRO_TREE = None
METRO_NAMES = None
METRO_COORDS = None

GRAPH_PATH = "./python/spb_walk.graphml"
CITY_NAME = "Санкт-Петербург, Россия"
EXCLUDED_STATIONS = ['броневая']

@app.on_event("startup")
def load_geo_data():
    global G, METRO_TREE, METRO_NAMES, METRO_COORDS
    
    if not os.path.exists(GRAPH_PATH):
        raise FileNotFoundError(f"Файл графа не найден! Сначала запустите prepare_graph.py")

    print("🚀 Быстрая загрузка графа из файла...")
    G = ox.load_graphml(GRAPH_PATH)
    
    print("🚇 Сбор данных по станциям метро...")
    # Оставляем этот блок здесь, так как он работает быстро
    metro_points = ox.features_from_place(CITY_NAME, tags={
        'railway': ['subway_entrance'], 
        'station': 'subway'
    })
    
    raw_coords, raw_names = [], []
    for _, row in metro_points.iterrows():
        name = row.get('name') or row.get('station')
        if not name or any(ex in str(name).lower() for ex in EXCLUDED_STATIONS):
            continue
        point = row.geometry.representative_point()
        raw_coords.append([point.y, point.x])
        raw_names.append(str(name))
    
    METRO_COORDS = np.array(raw_coords)
    METRO_NAMES = raw_names
    METRO_TREE = cKDTree(METRO_COORDS)
    print("✅ Geo-сервис готов!")

# Убираем async! Это позволит FastAPI выполнять расчеты в разных потоках
@app.get("/calculate")
def calculate_metro(lat: float, lon: float):
    if G is None:
        raise HTTPException(status_code=503, detail="Граф не загружен")

    try:
        # 1. Поиск в KD-Tree
        _, idx = METRO_TREE.query((lat, lon))
        m_lat, m_lon = METRO_COORDS[idx]
        station_name = METRO_NAMES[idx]

        # 2. Поиск ближайших узлов
        n_from = ox.distance.nearest_nodes(G, X=lon, Y=lat)
        n_to = ox.distance.nearest_nodes(G, X=m_lon, Y=m_lat)

        # 3. Расчет пути с обработкой отсутствия маршрута
        try:
            walk_dist = nx.shortest_path_length(G, n_from, n_to, weight='length')
        except nx.NetworkXNoPath:
            # Fallback: если пути по дорогам нет, считаем расстояние по прямой
            # Это спасет от 0 в базе при разрывах в данных OSM
            walk_dist = ox.distance.great_circle_vec(lat, lon, m_lat, m_lon)

        return {
            "station": station_name,
            "distance": round(walk_dist, 1),
            "status": "success"
        }
    except Exception as e:
        return {"station": "Ошибка", "distance": 0, "status": f"error: {str(e)}"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)