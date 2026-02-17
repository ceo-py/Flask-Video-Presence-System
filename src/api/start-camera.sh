#!/bin/bash
set -a
source /.env   # path to your .env
set +a

CAM_NAME="$1"
RTSP_URL="${!CAM_NAME}"

if [ -z "$RTSP_URL" ]; then
    echo "RTSP URL for $CAM_NAME not found in .env"
    exit 1
fi

mkdir -p "$HLS_ROOT_RAM_DISK/$CAM_NAME"

exec /usr/bin/ffmpeg \
  -rtsp_transport tcp \
  -timeout 5000000 \
  -i "$RTSP_URL" \
  -codec:v copy \
  -f hls \
  -hls_segment_type fmp4 \
  -hls_time "$FFMPEG_HLS_TIME" \
  -hls_list_size "$FFMPEG_HLS_LIST_SIZE" \
  -hls_flags delete_segments+temp_file+independent_segments \
  "$HLS_ROOT_RAM_DISK/$CAM_NAME/$INDEX_M3U8"