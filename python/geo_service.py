import osmnx as ox
import networkx as nx
import numpy as np
from scipy.spatial import cKDTree
from fastapi import FastAPI, HTTPException
import uvicorn

app = FastAPI(title="Geo-Metro Service")

# Глобальные переменные для кэширования графа
G = None
METRO_TREE = None
METRO_NAMES = None
METRO_COORDS = None

CITY_NAME = "Санкт-Петербург, Россия"
EXCLUDED_STATIONS = ['броневая']

@app.on_event("startup")
def load_geo_data():
    """Загрузка графа и метро один раз при старте сервера"""
    global G, METRO_TREE, METRO_NAMES, METRO_COORDS
    print(f"🌍 Загрузка пешеходного графа для {CITY_NAME}...")
    
    # Загружаем граф (может занять 1-2 минуты, делается 1 раз)
    G = ox.graph_from_place(CITY_NAME, network_type='walk')
    
    print("🚇 Сбор данных по станциям метро...")
    metro_points = ox.features_from_place(CITY_NAME, tags={
        'railway': ['subway_entrance'], 
        'station': 'subway'
    })
    
    raw_coords = []
    raw_names = []
    
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
    print("✅ Сервис готов к работе!")

@app.get("/calculate")
async def calculate_metro(lat: float, lon: float):
    if G is None:
        raise HTTPException(status_code=503, detail="Граф еще загружается")

    try:
        # 1. Быстрый поиск ближайшей точки через дерево (KD-Tree)
        _, idx = METRO_TREE.query((lat, lon))
        m_lat, m_lon = METRO_COORDS[idx]
        station_name = METRO_NAMES[idx]

        # 2. Поиск ближайших узлов в графе дорог
        n_from = ox.distance.nearest_nodes(G, X=lon, Y=lat)
        n_to = ox.distance.nearest_nodes(G, X=m_lon, Y=m_lat)

        # 3. Расчет кратчайшего пути (пешком)
        walk_dist = nx.shortest_path_length(G, n_from, n_to, weight='length')

        return {
            "station": station_name,
            "distance": round(walk_dist, 1),
            "status": "success"
        }
    except Exception as e:
        return {
            "station": "Не определено",
            "distance": 0,
            "status": f"error: {str(e)}"
        }

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)