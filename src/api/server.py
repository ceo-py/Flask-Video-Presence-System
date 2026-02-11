from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import requests
import subprocess
import threading
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
STREAM_IDLE_TIMEOUT = int(os.getenv('STREAM_IDLE_TIMEOUT'))
FFMPEG_HLS_TIME = os.getenv('FFMPEG_HLS_TIME')
FFMPEG_HLS_LIST_SIZE = os.getenv('FFMPEG_HLS_LIST_SIZE')
INDEX_M3U8 = os.getenv('INDEX_M3U8')

YOUTUBE_API_KEY = os.getenv('YOUTUBE_API_KEY')
PLAYLIST_ID = os.getenv('PLAYLIST_ID')
YOUTUBE_URL = os.getenv('YOUTUBE_URL')
YOUTUBE_API_URL = os.getenv('YOUTUBE_API_URL')

def stop_streams():
    subprocess.run(["pkill", "-f", "ffmpeg.*hls"])

def start_stream(cam):
    os.makedirs(f"{HLS_ROOT}/{cam}", exist_ok=True)

    # FFmpeg command for the stream
    cmd = [
        "ffmpeg",
        "-rtsp_transport", "tcp",
        "-i", CAMERAS[cam],
        "-codec:v", "copy",
        "-f", "hls",
        "-hls_time", FFMPEG_HLS_TIME,
        "-hls_list_size", FFMPEG_HLS_LIST_SIZE,
        "-hls_flags", "delete_segments+temp_file",
        "-reconnect", "1",                # Enable reconnect
        "-reconnect_at_eof", "1",         # Reconnect at EOF
        "-reconnect_on_network_error", "1",  # Reconnect on network error
        "-reconnect_streamed", "1",       # Reconnect for non-seekable streams (RTSP)
        "-reconnect_delay_max", "30",     # Max delay before giving up on reconnection
        "-max_reload", "0",               # Retry indefinitely (no max reload)
        f"{HLS_ROOT}/{cam}/{INDEX_M3U8}"  # Output HLS playlist
    ]

    while True:
        try:
            print(f"Starting stream for camera {cam}...")

            # Run FFmpeg process in the background (non-blocking)
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

            # Log FFmpeg output in case of errors (non-blocking)
            stdout, stderr = process.communicate()

            # If FFmpeg fails, print the error and retry after 5 seconds
            if process.returncode != 0:
                print(f"FFmpeg for {cam} failed with error code {process.returncode}. Retrying...")
                print(f"FFmpeg stderr: {stderr.decode()}")
            else:
                print(f"Stream for {cam} ended successfully.")
                break  # Exit loop if FFmpeg finishes successfully

        except Exception as e:
            print(f"Error occurred while starting the stream for {cam}: {e}")

        # Retry after a delay
        print(f"Retrying in 5 seconds for camera {cam}...")
        time.sleep(5)

def start_all_streams(cameras):
    """Start all streams concurrently for multiple cameras."""
    threads = []

    for cam in cameras:
        # Start each stream in its own thread
        thread = threading.Thread(target=start_stream, args=(cam,))
        thread.daemon = True  # Allow thread to exit when the main program exits
        threads.append(thread)
        thread.start()

    # Optionally, you can wait for all threads to finish if needed
    for thread in threads:
        thread.join()


start_all_streams(CAMERAS.keys())

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
    return send_from_directory(HLS_ROOT, filename)


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