from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests
import subprocess
import time
import os
import threading
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
STREAM_IDLE_TIMEOUT = int(os.getenv('STREAM_IDLE_TIMEOUT'))
FFMPEG_HLS_TIME = os.getenv('FFMPEG_HLS_TIME')
FFMPEG_HLS_LIST_SIZE = os.getenv('FFMPEG_HLS_LIST_SIZE')
INDEX_M3U8 = os.getenv('INDEX_M3U8')

YOUTUBE_API_KEY = os.getenv('YOUTUBE_API_KEY')
PLAYLIST_ID = os.getenv('PLAYLIST_ID')
YOUTUBE_URL = os.getenv('YOUTUBE_URL')
YOUTUBE_API_URL = os.getenv('YOUTUBE_API_URL')

processes = {}
last_viewer = {}


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


def empty_stream_directory(camera):
    stream_dir = f"{HLS_ROOT}/{camera}"
    if os.path.exists(stream_dir):
        for file in os.listdir(stream_dir):
            if ".ts" not in file:
                continue
            file_path = os.path.join(stream_dir, file)
            try:
                if os.path.isfile(file_path):
                    os.remove(file_path)
            except Exception as e:
                print(f"Error removing file {file_path}: {e}")


def stop_checker():
    while True:
        now = time.time()
        for cam in list(last_viewer.keys()):
            if cam in processes:
                # seconds without viewers
                if now - last_viewer[cam] > STREAM_IDLE_TIMEOUT:
                    processes[cam].terminate()
                    processes[cam].wait()
                    del processes[cam]
                    empty_stream_directory(cam)

        time.sleep(2)


threading.Thread(target=stop_checker, daemon=True).start()





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
    return send_from_directory(HLS_ROOT, filename)


@app.post("/api/viewer")
def viewer():
    cam = request.json["camera"]
    last_viewer[cam] = time.time()
    return "ok"


@app.get("/api/start/<cam>")
def start(cam):
    if cam not in CAMERAS:
        return "unknown camera", 404

    last_viewer[cam] = time.time()
    if cam not in processes:
        os.makedirs(f"{HLS_ROOT}/{cam}", exist_ok=True)

        cmd = [
            "ffmpeg",
            "-rtsp_transport", "tcp",
            "-i", CAMERAS[cam],
            "-codec:v", "copy",
            "-f", "hls",
            "-hls_time", FFMPEG_HLS_TIME,
            "-hls_list_size", FFMPEG_HLS_LIST_SIZE,
            #"-hls_flags", "delete_segments",
            "-hls_flags", "delete_segments+temp_file",
            f"{HLS_ROOT}/{cam}/{INDEX_M3U8}"
        ]

        processes[cam] = subprocess.Popen(cmd)

    return jsonify({
        "url": f"/streams/{cam}/{INDEX_M3U8}"
    })


@app.get("/api/stop/<cam>")
def stop(cam):
    if cam in processes:
        processes[cam].terminate()
        processes[cam].wait()
        del processes[cam]
        empty_stream_directory(cam)
    return "stopped"


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
                    print(f"YouTube API Error: {response.status_code} - {response.text}")
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