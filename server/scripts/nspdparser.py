import json
import re
import sys
import time
import logging
from typing import Any, Dict, Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

from pynspd import Nspd


def to_float(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def safe_get(data: Dict[str, Any], *keys, default=None):
    current = data
    for key in keys:
        if not isinstance(current, dict):
            return default
        current = current.get(key)
        if current is None:
            return default
    return current


def extract_coordinates(geometry) -> tuple[Optional[float], Optional[float]]:
    """
    Пытаемся безопасно достать координаты из geometry.
    Поддерживаем несколько типовых вариантов структуры.
    """
    if geometry is None:
        return None, None

    try:
        # Вариант 1: geometry.coordinates = [lon, lat]
        coords = getattr(geometry, "coordinates", None)
        if isinstance(coords, (list, tuple)) and len(coords) >= 2:
            lon = to_float(coords[0])
            lat = to_float(coords[1])
            return lat, lon

        # Вариант 2: model_dump()
        if hasattr(geometry, "model_dump"):
            g = geometry.model_dump()

            # Point
            coords = g.get("coordinates")
            if isinstance(coords, (list, tuple)) and len(coords) >= 2:
                lon = to_float(coords[0])
                lat = to_float(coords[1])
                return lat, lon

            # GeoJSON-like nested structures
            if g.get("type") == "Point" and isinstance(g.get("coordinates"), (list, tuple)):
                raw = g["coordinates"]
                if len(raw) >= 2:
                    lon = to_float(raw[0])
                    lat = to_float(raw[1])
                    return lat, lon
    except Exception:
        pass

    return None, None


def classify_object(object_type: Optional[str]) -> str:
    if not object_type:
        return "unknown"

    text = str(object_type).lower()

    if "земель" in text or "участ" in text:
        return "land"

    if "здан" in text or "строен" in text or "сооруж" in text or "бизнес" in text:
        return "building"

    return "unknown"


def extract_district_from_address(address: Optional[str]) -> Optional[str]:
    """
    Пытаемся извлечь район из адреса.
    Адрес обычно имеет формат: "..., муниципальный округ ХХХ, ..."
    """
    if not address:
        return None

    try:
        # Ищем "муниципальный округ" в адресе
        parts = str(address).split(",")
        for part in parts:
            part = part.strip()
            if "муниципальный округ" in part.lower():
                # Извлекаем название района
                district = part.replace("внутригородское муниципальное образование города федерального значения Санкт-Петербурга муниципальный округ", "").strip()
                if district and not re.search(r"\d|№|улиц|просп|шосс|наб|переул|проезд|бульвар|аллея", district, re.IGNORECASE):
                    return district
    except Exception:
        pass

    return None


def build_result(
    cadastral_number: str,
    data: Dict[str, Any],
    lat: Optional[float],
    lon: Optional[float],
) -> Dict[str, Any]:
    object_type = data.get("object_type") or data.get("type")
    object_kind = classify_object(object_type)

    year_built = data.get("year_built")
    year_comm = data.get("year_commisioning") or data.get("year_commissioning")
    address = data.get("readable_address") or data.get("address")

    # Извлекаем район из адреса
    district = data.get("district") or extract_district_from_address(address)

    total_area = (
        data.get("area")
        or data.get("total_area")
        or data.get("square")
        or data.get("build_record_area")
    )

    land_area = (
        data.get("land_area")
        or data.get("parcel_area")
        or data.get("area_value")
        if object_kind == "land" else data.get("land_area")
    )

    # Ищем кадастровую стоимость в правильных полях
    cad_cost = (
        data.get("cost_value")  # Главный ключ от NSPD API
        or data.get("cad_cost")
        or data.get("cadastral_cost")
        or data.get("cadastre_cost")
    )

    # Ищем вид использования в правильных полях
    permitted_use = (
        data.get("purpose")  # Главный ключ от NSPD API
        or data.get("permitted_use")
        or data.get("permitteduse")
        or data.get("land_use")
        or data.get("usage")
    )

    return {
        "success": True,
        "modeDetected": object_kind,
        "cadastral_number": cadastral_number,
        "object_type": str(object_type) if object_type is not None else None,
        "year_built": int(year_built) if str(year_built).isdigit() else year_built,
        "year_commisioning": int(year_comm) if str(year_comm).isdigit() else year_comm,
        "address": str(address) if address is not None else None,
        "district": str(district) if district is not None else None,
        "total_area": to_float(total_area),
        "land_area": to_float(land_area),
        "cad_cost": to_float(cad_cost),
        "permitted_use": str(permitted_use) if permitted_use is not None else None,
        "coordinates": {
            "latitude": lat,
            "longitude": lon,
        },
    }


def get_cadastral_info(num: str, mode: str = "auto") -> Dict[str, Any]:
    nspd = Nspd()
    retries = 5
    delay = 1.0

    for attempt in range(retries):
        try:
            feat = nspd.find(num)

            if not feat:
                return {
                    "success": False,
                    "error": "Объект не найден",
                    "cadastral_number": num,
                    "modeRequested": mode,
                }

            selected_dump = feat.properties.options.model_dump()
            lat, lon = extract_coordinates(feat.geometry)

            return build_result(
                cadastral_number=num,
                data=selected_dump,
                lat=lat,
                lon=lon,
            )

        except Exception as e:
            msg = str(e)

            if "429" in msg and attempt < retries - 1:
                logger.warning("429 Too Many Requests. Повтор через %.1f сек.", delay)
                time.sleep(delay)
                delay *= 2
                continue

            return {
                "success": False,
                "error": msg,
                "cadastral_number": num,
                "modeRequested": mode,
            }

    return {
        "success": False,
        "error": "Превышено количество попыток запроса",
        "cadastral_number": num,
        "modeRequested": mode,
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": "Не передан кадастровый номер",
                },
                ensure_ascii=False,
            )
        )
        sys.exit(1)

    cadastral_number = sys.argv[1].strip()
    mode = sys.argv[2].strip().lower() if len(sys.argv) > 2 else "auto"

    if mode not in {"auto", "building", "land"}:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": f"Некорректный режим: {mode}",
                },
                ensure_ascii=False,
            )
        )
        sys.exit(1)

    result = get_cadastral_info(cadastral_number, mode)
    print(json.dumps(result, ensure_ascii=False), flush=True)
