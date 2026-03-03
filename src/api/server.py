from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv
from functools import wraps
from tuya import get_sensor_data
import importlib.util
spec = importlib.util.spec_from_file_location(
    "generate_token",
    "../ip-camera/generate_token.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
get_authenticated_service = module.get_authenticated_service


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

ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD')


def require_admin_password(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        password = request.headers.get('X-Admin-Password')
        if not password or password != ADMIN_PASSWORD:
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated


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
                        "id": item['id'],  # playlistItem ID for deletion
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


@app.delete("/api/recentEvents/<playlist_item_id>")
@require_admin_password
def delete_event(playlist_item_id):
    """Remove a video from YouTube by playlist item ID"""
    youtube = get_authenticated_service()

    # Get the playlist item to find the video ID
    request = youtube.playlistItems().list(
        part="snippet",
        id=playlist_item_id
    )
    response = request.execute()
    items = response.get("items", [])

    if not items:
        return jsonify({"error": "Video not found"}), 404

    video_id = items[0]['snippet']['resourceId']['videoId']

    # Delete from playlist
    youtube.playlistItems().delete(id=playlist_item_id).execute()

    # Delete the video
    youtube.videos().delete(id=video_id).execute()

    return jsonify({"success": True})


@app.post("/api/stopAllBroadcasts")
@require_admin_password
def stop_all_broadcasts():
    """Stop all YouTube live broadcasts"""
    youtube = get_authenticated_service()

    # Get active broadcasts
    request = youtube.liveBroadcasts().list(
        part="id,status",
        broadcastStatus="active"
    )
    response = request.execute()
    broadcasts = response.get("items", [])

    # End each broadcast
    for b in broadcasts:
        try:
            youtube.liveBroadcasts().transition(
                part="status",
                broadcastStatus="complete",
                id=b["id"]
            ).execute()
            print(f"Stopped broadcast: {b['id']}")
        except Exception as e:
            print(f"Failed to end stream {b['id']}: {e}")

    return jsonify({"success": True, "message": "All broadcasts stopped"})


@app.delete("/api/youtubePlaylist")
@require_admin_password
def delete_all_playlist_videos():
    """Delete all videos from YouTube playlist"""
    youtube = get_authenticated_service()

    playlist_items = []
    next_page_token = None

    while True:
        request = youtube.playlistItems().list(
            part="id,snippet",
            playlistId=PLAYLIST_ID,
            maxResults=50,
            pageToken=next_page_token
        )
        response = request.execute()
        playlist_items.extend(response.get("items", []))
        next_page_token = response.get("nextPageToken")
        if not next_page_token:
            break

    print(f"Found {len(playlist_items)} videos in the playlist.")

    for item in playlist_items:
        video_id = item['snippet']['resourceId']['videoId']
        title = item['snippet']['title']

        # Delete video from YouTube
        youtube.videos().delete(id=video_id).execute()
        print(f"Deleted video: {title}")

    for item in playlist_items:
        youtube.playlistItems().delete(id=item['id']).execute()

    return jsonify({"success": True, "deleted": len(playlist_items)})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
