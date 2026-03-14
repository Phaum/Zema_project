import sys
import json
import time
from pynspd import Nspd

# Настройки повторов для стабильности
MAX_RETRIES = 5
INITIAL_DELAY = 2

def extract_centroid(geometry):
    if not geometry or not geometry.coordinates:
        return None, None
    
    g_type = geometry.type.lower()
    coords = geometry.coordinates

    try:
        if g_type == 'point':
            return coords[0], coords[1]
        
        elif g_type == 'polygon':
            # Берем среднее арифметическое всех точек внешнего кольца
            external_ring = coords[0]
            lng = sum(p[0] for p in external_ring) / len(external_ring)
            lat = sum(p[1] for p in external_ring) / len(external_ring)
            return lng, lat
        
        elif g_type == 'multipolygon':
            # Берем первую точку первого полигона (для простоты)
            first_point = coords[0][0][0]
            return first_point[0], first_point[1]
            
    except Exception:
        return None, None
    return None, None

def get_cadastral_info(num):
    delay = INITIAL_DELAY
    
    with Nspd() as nspd:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                feat = nspd.find(num)
                
                # 1. Проверка на существование номера
                if feat is None:
                    return {"error": "номер не найден в базе НСПД"}

                # Получаем свойства для адреса и годов
                data = feat.properties.options.model_dump()

                # 2. Получаем координаты из геометрии объекта
                lng, lat = extract_centroid(feat.geometry)

                # 3. Сбор всех данных
                year_built = data.get('year_built')
                year_comm = data.get('year_commisioning')
                address = data.get('address')
                district = data.get('district')

                return {
                    "cadastral_number": num,
                    "object_type": str(data.get('object_type', 'неизвестно')),
                    "year_built": str(year_built) if year_built is not None else 'год не указан',
                    "year_commisioning": str(year_comm) if year_comm is not None else 'год не указан',
                    "address": str(address) if address is not None else 'адрес не указан',
                    "district": str(district) if district is not None else 'район не указан',
                    "coordinates": {
                        "latitude": lat if lat is not None else 'не указано',
                        "longitude": lng if lng is not None else 'не указано'
                    },
                    "success": True
                }
            except Exception as e:
                error_msg = str(e).lower()
                # Обработка лимитов (Error 429)
                if '429' in error_msg or 'too many requests' in error_msg:
                    if attempt < MAX_RETRIES:
                        time.sleep(delay)
                        delay *= 2
                        continue
                
                return {"error": f"системная ошибка: {str(e)}"}
                
    return {"error": "превышено время ожидания ответа от сервера"}

if __name__ == "__main__":
    # Читаем номер из аргумента командной строки
    if len(sys.argv) > 1:
        target_number = sys.argv[1].strip()
        result = get_cadastral_info(target_number)
        
        # Выводим результат в формате JSON (единственный вывод в stdout)
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(json.dumps({"error": "аргумент с кадастровым номером отсутствует"}))