from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv
from tuya import get_sensor_data


load_dotenv()
app = Flask(__name__)
CORS(app)

CAMERAS = {
    'Stairs': os.getenv('Stairs'),
    'Balcony': os.getenv('Balcony'),
    'Kitchen': os.getenv('Kitchen'),
}

API_KEY = os.getenv('API_WEATHER')
BASE_URL_WEATHER = os.getenv('BASE_URL_WEATHER')

HLS_ROOT = os.getenv('HLS_ROOT_RAM_DISK')

YOUTUBE_API_KEY = os.getenv('YOUTUBE_API_KEY')
PLAYLIST_ID = os.getenv('PLAYLIST_ID')
YOUTUBE_URL = os.getenv('YOUTUBE_URL')
YOUTUBE_API_URL = os.getenv('YOUTUBE_API_URL')


def weather_check(arg) -> tuple:
    with requests.get(
        f"{BASE_URL_WEATHER}{arg}&appid={API_KEY}&units=metric"
    ) as x:
        x = x.json()
        t = x["main"]["temp"]
        t_min = x["main"]["temp_min"]
        t_max = x["main"]["temp_max"]
        feels_like = x["main"]["feels_like"]
        type_of_weather = x["weather"][0]["main"]
        weather_icon = x["weather"][0]["icon"]
        humidity = x["main"]["humidity"]
        wind = x["wind"]["speed"]
        return t, t_min, t_max, feels_like, type_of_weather, weather_icon, humidity, wind


@app.get("/api/tuya/<device>")
def tuya(device):
    return jsonify(get_sensor_data(device))


@app.get("/api/weather/<town>")
def weather(town):
    return jsonify(weather_check(
        town))


@app.get("/api/allCameras")
def allCameras():
    all_cameras = list(CAMERAS.keys())
    return jsonify(all_cameras)


@app.route('/streams/<path:filename>')
def stream_file(filename):
    response = send_from_directory(HLS_ROOT, filename)

    # Set correct Content-Type for HLS
    if filename.endswith('.m3u8'):
        response.headers['Content-Type'] = 'application/vnd.apple.mpegurl'
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    elif filename.endswith('.ts'):
        response.headers['Content-Type'] = 'video/MP2T'
        response.headers['Cache-Control'] = 'public, max-age=3600'

    return response

@app.get("/api/recentEvents")
def recent_events():
    events = []
    next_page_token = None

    try:
        while True:
            url = (
                f"{YOUTUBE_API_URL}"
                f"?part=snippet"
                f"&playlistId={PLAYLIST_ID}"
                f"&maxResults=50"
                f"&key={YOUTUBE_API_KEY}"
            )
            if next_page_token:
                url += f"&pageToken={next_page_token}"

            with requests.get(url) as response:
                if response.status_code != 200:
                    print(
                        f"YouTube API Error: {response.status_code} - {response.text}")
                    break

                data = response.json()
                items = data.get('items', [])

                for item in items:
                    title = item['snippet']['title']
                    video_id = item['snippet']['resourceId']['videoId']

                    # More robust split in case camera name has spaces
                    parts = title.rsplit(' ', 1)
                    if len(parts) == 2:
                        camera = parts[0]
                        timestamp = parts[1].replace('T', ' ')
                    else:
                        camera = title
                        timestamp = "N/A"

                    events.append({
                        "device": camera,
                        "timestamp": timestamp,
                        "videoUrl": f"{YOUTUBE_URL}{video_id}",
                        "eventType": "Motion Detection",
                        "status": "Logged"
                    })

                next_page_token = data.get('nextPageToken')
                if not next_page_token:
                    break

        return jsonify(events)
    except Exception as e:
        print(f"Error fetching YouTube data: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)