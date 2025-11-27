from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import subprocess, time, os, threading
from dotenv import load_dotenv
import os


load_dotenv()
app = Flask(__name__)
CORS(app)

CAMERAS = {
    'Test1' : os.getenv('camera1'),
    'Test2' : os.getenv('camera2'),
}

processes = {}
last_viewer = {}

def stop_checker():
    while True:
        now = time.time()
        for cam in list(last_viewer.keys()):
            if cam in processes:
                if now - last_viewer[cam] > 60:  # 60 seconds without viewers
                    processes[cam].terminate()
                    del processes[cam]
        time.sleep(2)

threading.Thread(target=stop_checker, daemon=True).start()

@app.get("/api/allCameras")
def allCameras():
    all_cameras = list(CAMERAS.keys())
    return jsonify(all_cameras)

@app.route('/streams/<path:filename>')
def stream_file(filename):
    return send_from_directory('/var/www/html/streams', filename)

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
        os.makedirs(f"/var/www/html/streams/{cam}", exist_ok=True)

        cmd = [
            "ffmpeg",
            "-rtsp_transport", "tcp",
            "-i", CAMERAS[cam],
            "-codec:v", "copy",
            "-f", "hls",
            "-hls_time", "2",
            "-hls_list_size", "3",
            "-hls_flags", "delete_segments",
            f"/var/www/html/streams/{cam}/index.m3u8"
        ]

        processes[cam] = subprocess.Popen(cmd)

    return jsonify({
        "url": f"/streams/{cam}/index.m3u8"
    })

@app.get("/api/stop/<cam>")
def stop(cam):
    if cam in processes:
        processes[cam].terminate()
        del processes[cam]
    return "stopped"

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)