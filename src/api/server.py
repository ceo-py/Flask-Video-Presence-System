from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import subprocess
import time
import os
import threading
from dotenv import load_dotenv


load_dotenv()
app = Flask(__name__)
CORS(app)

CAMERAS = {
    'Test1': os.getenv('camera1'),
    'Test2': os.getenv('camera2'),
}

HLS_ROOT = os.getenv('HLS_ROOT')
STREAM_IDLE_TIMEOUT = int(os.getenv('STREAM_IDLE_TIMEOUT'))
FFMPEG_HLS_TIME = os.getenv('FFMPEG_HLS_TIME')
FFMPEG_HLS_LIST_SIZE = os.getenv('FFMPEG_HLS_LIST_SIZE')
INDEX_M3U8 = os.getenv('INDEX_M3U8')

processes = {}
last_viewer = {}
test = []

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
                if now - last_viewer[cam] > STREAM_IDLE_TIMEOUT:  # seconds without viewers
                    processes[cam].terminate()
                    del processes[cam]
                    empty_stream_directory(cam)

        time.sleep(2)


threading.Thread(target=stop_checker, daemon=True).start()


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
            "-hls_flags", "delete_segments",
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
        del processes[cam]
        empty_stream_directory(cam)
    return "stopped"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
