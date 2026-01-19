import os
from dotenv import load_dotenv
from tuya_connector import TuyaOpenAPI
from cachetools import cached, TTLCache


sensor_cache = TTLCache(maxsize=100, ttl=1800)



load_dotenv()

ACCESS_ID = os.getenv('ACCESS_ID')
ACCESS_SECRET = os.getenv('ACCESS_SECRET')
ENDPOINT = os.getenv('END_POINT')
DEVICES = {'house': os.getenv('SENSOR_HOUSE_ID'), 'tent': os.getenv('SENSOR_TENT_ID')}

openapi = TuyaOpenAPI(ENDPOINT, ACCESS_ID, ACCESS_SECRET)

def device_status_url(device_id: str) -> str:
    return f"/v1.0/iot-03/devices/{device_id}/status"


def convert_sensor_values(value: int) -> float:
    try:
        value = value / 10
    except:
        value = 0

    return value

@cached(cache=sensor_cache)
def get_sensor_data(device_id: str) -> dict[str:str]:
    data = openapi.get(device_status_url(DEVICES[device_id]), dict())

    try:
        result = data.get("result", [])
    except:
        result = []

    sensor = {
        "va_temperature": "N/A",
        "va_humidity": "N/A",
        "battery_state": "N/A",
    }

    for data in result[:3]:
        try:
            code, value = data.values()
        except:
            continue

        if code == "va_temperature":
            temp = convert_sensor_values(value)
            sensor['va_temperature'] = temp
            continue

        sensor[code] = value

    return sensor