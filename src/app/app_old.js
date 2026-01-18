/* Retro Matrix Cameras - minimal, mobile friendly, multiple local webcams
   - Uses getUserMedia per tile
   - Add/remove cameras, set number with slider
   - Keeps UI within a single viewport (no scrolling)
*/

const matrix = document.getElementById("matrix");
const grid = document.getElementById("grid");
const addBtn = document.getElementById("addCamera");
const countDisplay = document.getElementById("countDisplay");
const template = document.getElementById("tile-template");
const devicesList = document.getElementById("devices-list");

const API = {
  url: "http://127.0.0.1:5000",
  endPoint: {
    allCameras: "/api/allCameras",
    start: "/api/start",
    stop: "/api/stop",
    viewer: "/api/viewer",
    stream: "/streams",
  },
};

let viewerNotificationIntervals = {}; // Object to store interval IDs for each camera

// Function to notify the backend that the viewer is still watching a specific camera
async function notifyViewer(camName) {
  try {
    await fetch(API.url + API.endPoint.viewer, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ camera: camName }),
    });
  } catch (error) {
    console.error("Error notifying viewer for camera " + camName + ":", error);
  }
}

// Function to fetch all cameras
async function getAllCameras() {
  try {
    const response = await fetch(API.url + API.endPoint.allCameras);

    if (!response.ok) {
      throw new Error("Failed to fetch cameras");
    }

    const cameras = await response.json();

    return cameras;
  } catch (error) {
    console.error("Error fetching cameras:", error);
  }
}

async function starCamera(cameraName) {
  try {
    const response = await fetch(
      `${API.url}${API.endPoint.start}/${cameraName}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch start camera");
    }

    const cameraUrl = await response.json();

    return cameraUrl;
  } catch (error) {
    console.error("Error fetching start camera:", error);
  }
}

let tiles = [];
let streams = new Map();

/* initialize canvas context early so drawMatrix can use it */
const ctx = matrix.getContext("2d");

function resizeCanvas() {
  matrix.width = innerWidth * devicePixelRatio;
  matrix.height = innerHeight * devicePixelRatio;
  matrix.style.width = innerWidth + "px";
  matrix.style.height = innerHeight + "px";
  drawMatrix(); // redraw static background after resize
}
addEventListener("resize", resizeCanvas, { passive: true });
resizeCanvas();

/* Static Matrix background (draw once per resize, no animation) */
function drawMatrix() {
  // fill background and draw sparse static characters for a retro look
  ctx.clearRect(0, 0, matrix.width, matrix.height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, matrix.width, matrix.height);
  ctx.fillStyle = "#7cff9d";
  ctx.font = 12 * devicePixelRatio + "px monospace";

  const cols = Math.floor(innerWidth / 14);
  const rows = Math.floor(innerHeight / 18);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (Math.random() > 0.975) {
        const x = i * 14 * devicePixelRatio;
        const y = j * 14 * devicePixelRatio;
        const char = String.fromCharCode(
          0x30a0 + Math.floor(Math.random() * 96)
        );
        ctx.fillText(char, x, y);
      }
    }
  }
}

/* Tile creation and control */
function createTile(deviceName) {
  const el = template.content.firstElementChild.cloneNode(true);
  const title = el.querySelector(".title-camera");
  const video = el.querySelector("video.cam");
  const playBtn = el.querySelector(".btn-play");
  const stopBtn = el.querySelector(".btn-stop");
  const deviceSelect = el.querySelector(".device-select");
  const fullscreenBtn = el.querySelector(".btn-fullscreen");

  // Mute by default to satisfy browser autoplay policies
  video.muted = true;

  title.textContent = deviceName;
  stopVideo(video, deviceName);
  starCamera(deviceName)
    .then((cameraUrl) => {
      if (deviceSelect && cameraUrl) {
        deviceSelect.value = `${API.url}${cameraUrl.url}`; // Set the value of the input field to the camera URL
        console.log("Set device select input value to:", deviceSelect.value);
        // Auto-start playback when URL is ready
        playBtn.click();
      } else {
        console.log("Device select input not found or camera URL is invalid");
      }
    })
    .catch((error) => {
      console.error("Error:", error);
    });
  // fullscreen toggle
  fullscreenBtn.addEventListener("click", async () => {
    try {
      // prefer making the tile element fullscreen so header/controls remain visible in fullscreen
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    } catch (err) {
      console.warn("fs error", err);
    }
  });

  playBtn.addEventListener("click", async () => {
    stopVideo(video, deviceName);
    try {
      const val = deviceSelect.value && deviceSelect.value.trim();
      // If user provided an m3u8/http URL, attempt HLS playback
      if (
        val &&
        (val.startsWith("http://") || val.startsWith("https://")) &&
        val.toLowerCase().includes(".m3u8")
      ) {
        // lazy-load hls.js from esm.sh
        const { default: Hls } = await import("https://esm.sh/hls.js@1.4.0");
        if (Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(val);
          hls.attachMedia(video);
          streams.set(video, { type: "hls", hls });
          video.muted = true;
          video.controls = true;
          await video.play().catch(() => {});
        } else {
          // native HLS (Safari)
          video.src = val;
          streams.set(video, { type: "native-hls" });
          video.muted = true;
          video.controls = true;
          await video.play().catch(() => {});
        }
        notifyViewer(deviceName);
        // Start sending periodic notifications every 30 seconds for this camera
        if (!viewerNotificationIntervals[deviceName]) {
          viewerNotificationIntervals[deviceName] = setInterval(() => {
            notifyViewer(deviceName); // Notify that the viewer is still watching this camera
          }, 30000); // Every 30 seconds
        }
        return;
      }
    } catch (err) {
      console.warn("camera/error", err);
      alert(
        "Unable to access camera or play stream: " +
          (err && err.message ? err.message : err)
      );
    }
  });

  stopBtn.addEventListener("click", () => {
    stopVideo(video, deviceName);
  });

  // When device input value changed, try auto-play for that tile
  deviceSelect.addEventListener("change", async () => {
    if (streams.get(video)) {
      stopVideo(video);
      // small delay to allow device switch
      setTimeout(() => playBtn.click(), 150);
    }
  });

  grid.appendChild(el);
  tiles.push(el);
  updateCount();
  return el;
}

function stopVideo(video, deviceName) {
  const entry = streams.get(video);
  if (!entry) return;
  if (entry.type === "stream") {
    entry.stream.getTracks().forEach((t) => t.stop());
  } else if (entry.type === "hls") {
    try {
      entry.hls.destroy();
    } catch (e) {}
  } else if (entry.type === "native-hls") {
    try {
      video.pause();
      video.src = "";
    } catch (e) {}
  }
  streams.delete(video);
  if (viewerNotificationIntervals[deviceName]) {
    clearInterval(viewerNotificationIntervals[deviceName]);
    delete viewerNotificationIntervals[deviceName];
  }
  try {
    video.srcObject = null;
  } catch (e) {}
}

countDisplay.textContent = "0";

getAllCameras().then((cameras) => {
  cameras.forEach((camera) => {
    createTile(camera);
  });
});

updateCount();

/* stop all streams when page hides/unloads */
function stopAll() {
  for (const [v, e] of streams.entries()) {
    if (e.type === "stream") e.stream.getTracks().forEach((t) => t.stop());
    else if (e.type === "hls")
      try {
        e.hls.destroy();
      } catch (_) {}
    else if (e.type === "native-hls")
      try {
        v.pause();
        v.src = "";
      } catch (_) {}
  }
  streams.clear();
}
addEventListener("pagehide", stopAll);
addEventListener("beforeunload", stopAll);

function updateCount() {
  countDisplay.textContent = String(tiles.length);
}
