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

echo "Checking directory: $HLS_ROOT_RAM_DISK/$CAM_NAME"

if [ -d "$HLS_ROOT_RAM_DISK/$CAM_NAME" ]; then
    echo "Directory exists. Deleting contents..."
    rm -rf "$HLS_ROOT_RAM_DISK/$CAM_NAME"/* "$HLS_ROOT_RAM_DISK/$CAM_NAME"/.* 2>/dev/null
    echo "Contents deleted."
else
    echo "Directory does not exist. Creating it..."
    mkdir -p "$HLS_ROOT_RAM_DISK/$CAM_NAME"    # Create the directory if it doesn't exist
fi

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