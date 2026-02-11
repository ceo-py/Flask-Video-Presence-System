import subprocess
import threading
import time
import os
from dotenv import load_dotenv

load_dotenv()


CAMERAS = {
    'Stairs': os.getenv('Stairs'),
    'Balcony': os.getenv('Balcony'),
    'Kitchen': os.getenv('Kitchen'),
}

HLS_ROOT = os.getenv('HLS_ROOT_RAM_DISK')
FFMPEG_HLS_TIME = os.getenv('FFMPEG_HLS_TIME')
FFMPEG_HLS_LIST_SIZE = os.getenv('FFMPEG_HLS_LIST_SIZE')
INDEX_M3U8 = os.getenv('INDEX_M3U8')


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