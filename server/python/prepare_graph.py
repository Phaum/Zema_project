import osmnx as ox
import os

CITY_NAME = "Санкт-Петербург, Россия"
GRAPH_PATH = "./python/spb_walk.graphml"

def save_graph():
    print(f"📡 Скачивание графа для {CITY_NAME}... Это займет время.")
    # Используем cache=True, чтобы OSMnx не качал одно и то же дважды
    G = ox.graph_from_place(CITY_NAME, network_type='walk')
    
    print(f"💾 Сохранение графа в {GRAPH_PATH}...")
    ox.save_graphml(G, GRAPH_PATH)
    print("✅ Готово! Теперь сервис будет запускаться мгновенно.")

if __name__ == "__main__":
    save_graph()