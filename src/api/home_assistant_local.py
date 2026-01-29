import requests
import os
from dotenv import load_dotenv


load_dotenv()

ACCESS_ID = os.getenv('ACCESS_ID')

# Replace with your Home Assistant URL and access token
home_assistant_url = os.getenv('HA_URL')
access_token = os.getenv('HA_TOKEN')

# Device entity ID in Home Assistant (example: light.living_room)
entity_id = os.getenv('HA_SENSOR_HOURSE_ID')  # Replace with your actual device ID

# Headers with Authorization token
headers = {
    "Authorization": f"Bearer {access_token}",
    "Content-Type": "application/json",
}

def get_all_devices():
    # API request to get the state of all devices (entities)
    response = requests.get(f"{home_assistant_url}/api/states", headers=headers)

    # Check if the request was successful
    if response.status_code == 200:
        devices = response.json()
        print(f"Retrieved {len(devices)} devices.")
        for device in devices:
            if '.t_h_' in device['entity_id']:
                print(device)
            print(f"Entity ID: {device['entity_id']} - State: {device['state']}")
    else:
        print(f"Failed to retrieve data: {response.status_code}")

def get_device(device):
    # API request to get the state of the device
    response = requests.get(f"{home_assistant_url}/api/states/{device}", headers=headers)

    # Check if the request was successful
    if response.status_code == 200:
        data = response.json()
        print(data)
        print(f"Device state: {data['state']}")
    else:
        print(f"Failed to retrieve data: {response.status_code}")

get_all_devices()
#get_device(entity_id)