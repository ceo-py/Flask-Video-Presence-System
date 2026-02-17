# Oriahovo Command Center

A unified monitoring dashboard integrating security camera feeds, smart home sensors (Tuya), and local environmental data.

## Features
- **Video**: HLS streaming of RTSP feeds via FFmpeg/Video.js.
- **Sensors**: Real-time Tuya IoT integration (Temperature, Humidity, Battery).
- **Events**: Motion detection logging via YouTube Data API with clip playback.
- **UI**: Responsive glassmorphism dashboard (Tailwind CSS).
- **Performance**: Parallel data fetching and RAM-disk optimized streaming.

## Architecture
- **Backend**: Flask API handling stream orchestration and cloud service integration.
- **Frontend**: Single Page Application (SPA) with asynchronous UI updates.
- **Streaming**: RTSP -> FFmpeg -> HLS (.m3u8/.ts) -> Video.js.

## Environment Configuration (`.env`)
```env
# RTSP Feeds
Stairs=rtsp://...
Balcony=rtsp://...
Kitchen=rtsp://...

# Cloud APIs
API_WEATHER=...
ACCESS_ID=... # Tuya
ACCESS_SECRET=... # Tuya
SENSOR_HOUSE_ID=...
SENSOR_TENT_ID=...

# YouTube Integration
YOUTUBE_API_KEY=...
PLAYLIST_ID=...

# Infrastructure
HLS_ROOT_RAM_DISK=/dev/shm/streams
```

## Setup
1. **Requirements**: Python 3.x, FFmpeg.
2. **Backend**: `pip install -r requirements.txt && python src/api/server.py`
3. **Frontend**: Serve `src/app/index.html` via Nginx or equivalent.

## API Summary
| Endpoint | Description |
| :--- | :--- |
| `/api/allCameras` | List available camera IDs. |
| `/api/tuya/<device>` | Get sensor telemetry (house/tent). |
| `/api/weather/<town>` | Get OpenWeatherMap data. |
| `/api/recentEvents` | Retrieve motion logs from YouTube. |

## Deployment
- Use **Gunicorn/Nginx** for production backend.
- Map HLS segments to a **RAM Disk** (e.g., `/dev/shm`) to minimize I/O wait.
- Manage processes via **systemd** (see `src/api/*.service`).

## License
MIT
