const API = {
  url: "https://api-cameras.ceo-py.eu",
  endPoint: {
    allCameras: "/api/allCameras",
    streams: "/streams",
    weather: "/api/weather/oryahovo",
    tuya: "/api/tuya",
    recentEvents: "/api/recentEvents",
    stopBroadcasts: "/api/stopAllBroadcasts",
    deletePlaylist: "/api/youtubePlaylist",
  },
};

const grid = document.getElementById("camera-grid");
const template = document.getElementById("camera-card-template");
const channelCountEl = document.getElementById("channel-count");

// UI Elements
const weatherTemp = document.getElementById("weather-temp");
const weatherDetails = document.getElementById("weather-details");
const weatherMinMax = document.getElementById("weather-minmax");
const weatherLabel = document.getElementById("weather-label");
const weatherIcon = document.getElementById("weather-icon");
const weatherHumidity = document.getElementById("weather-humidity");
const weatherWind = document.getElementById("weather-wind");
const weatherLoader = document.getElementById("weather-loader");
const weatherPlaceholder = document.getElementById("weather-icon-placeholder");

const houseTemp = document.getElementById("house-temp");
const houseHumidity = document.getElementById("house-humidity");
const houseBattery = document.getElementById("house-battery");
const houseLoader = document.getElementById("house-loader");

const tentTemp = document.getElementById("tent-temp");
const tentHumidity = document.getElementById("tent-humidity");
const tentBattery = document.getElementById("tent-battery");
const tentLoader = document.getElementById("tent-loader");

const eventsTableBody = document.getElementById("events-table-body");
const eventCountEl = document.getElementById("event-count");

let videoPlayers = {};
let initTime = {};

// ─── Data Fetchers ──────────────────────────────────────────

async function fetchWeather() {
  try {
    const res = await fetch(`${API.url}${API.endPoint.weather}`);
    if (!res.ok) throw new Error("Weather API failed");
    const data = await res.json();
    if (Array.isArray(data) && data.length >= 8) {
      weatherTemp.textContent = `${Math.round(data[0])}°C`;
      weatherLabel.textContent = data[4].toUpperCase();
      weatherIcon.src = `https://openweathermap.org/img/wn/${data[5]}@2x.png`;
      weatherIcon.classList.remove("hidden");
      if (weatherPlaceholder) weatherPlaceholder.classList.add("hidden");
      weatherDetails.textContent = `Feels ${Math.round(data[3])}°C`;
      weatherMinMax.textContent = `L:${Math.round(data[1])}° H:${Math.round(data[2])}°`;
      if (weatherHumidity) weatherHumidity.textContent = `${data[6]}%`;
      if (weatherWind) weatherWind.textContent = `${Math.round(data[7])} KM/H`;
      if (weatherLoader) weatherLoader.classList.add("opacity-0", "pointer-events-none");
    }
  } catch (e) {
    console.warn("Weather fetch failed", e);
  }
}

async function fetchTuyaData(target) {
  try {
    const res = await fetch(`${API.url}${API.endPoint.tuya}/${target}`);
    if (!res.ok) throw new Error(`Tuya API failed for ${target}`);
    const data = await res.json();
    const tempEl = target === "house" ? houseTemp : tentTemp;
    const humEl = target === "house" ? houseHumidity : tentHumidity;
    const batEl = target === "house" ? houseBattery : tentBattery;
    const loaderEl = target === "house" ? houseLoader : tentLoader;

    if (tempEl) tempEl.textContent = data.va_temperature ? `${data.va_temperature}°` : "--°";
    if (humEl) humEl.textContent = data.va_humidity ? `${data.va_humidity}%` : "--%";
    if (batEl) batEl.textContent = data.battery_state && data.battery_state !== "N/A" ? data.battery_state : "--";
    if (loaderEl) loaderEl.classList.add("opacity-0", "pointer-events-none");
  } catch (e) {
    console.warn(`Tuya fetch failed for ${target}`, e);
  }
}

async function fetchRecentEvents() {
  try {
    const res = await fetch(`${API.url}${API.endPoint.recentEvents}`);
    const events = await res.json();
    if (!eventsTableBody) return;
    if (eventCountEl) eventCountEl.textContent = `${events.length} EVENTS`;
    eventsTableBody.innerHTML = events.length === 0
      ? '<tr><td colspan="4" class="px-6 py-8 text-center text-slate-500 italic">No recent events detected.</td></tr>'
      : "";
    
    events.forEach((event) => {
      const tr = document.createElement("tr");
      tr.className = "border-b border-white/5 hover:bg-white/10 transition-colors group";
      tr.innerHTML = `
        <td class="px-6 py-4 font-medium text-slate-300">${event.timestamp}</td>
        <td class="px-6 py-4 font-semibold text-white">${event.device}</td>
        <td class="px-6 py-4"><div class="flex items-center gap-2"><div class="w-1.5 h-1.5 rounded-full bg-orange-500"></div><span class="text-slate-300 font-medium">Motion</span></div></td>
        <td class="px-6 py-4">
          <button class="delete-event-btn p-2 rounded-lg hover:bg-red-500/20 text-red-400 hover:text-red-300" data-id="${event.id}" title="Delete">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </td>
      `;
      tr.addEventListener("click", (e) => {
        if (e.target.closest(".delete-event-btn")) return;
        window.open(event.videoUrl, "_blank");
      });
      eventsTableBody.appendChild(tr);
    });

    // Add delete event handlers
    document.querySelectorAll(".delete-event-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const password = prompt("Enter admin password:");
        if (!password) return;
        try {
          const res = await fetch(`${API.url}${API.endPoint.recentEvents}/${id}`, {
            method: "DELETE",
            headers: { "X-Admin-Password": password }
          });
          if (res.ok) {
            btn.closest("tr").remove();
            if (eventCountEl) {
              const count = eventsTableBody.querySelectorAll("tr").length;
              eventCountEl.textContent = `${count} EVENTS`;
            }
          } else {
            alert("Invalid password or failed to delete");
          }
        } catch (err) {
          console.error("Delete failed", err);
          alert("Failed to delete event");
        }
      });
    });
  } catch (e) {
    console.warn("Recent events fetch failed", e);
  }
}

// Delete all events
document.getElementById("delete-all-events-btn")?.addEventListener("click", async () => {
  if (!confirm("Delete ALL event videos from YouTube playlist? This cannot be undone.")) return;
  const password = prompt("Enter admin password:");
  if (!password) return;
  try {
    const res = await fetch(`${API.url}${API.endPoint.deletePlaylist}`, {
      method: "DELETE",
      headers: { "X-Admin-Password": password }
    });
    if (res.ok) {
      eventsTableBody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-slate-500 italic">All events deleted.</td></tr>';
      if (eventCountEl) eventCountEl.textContent = "0 EVENTS";
    } else {
      alert("Invalid password or failed to delete");
    }
  } catch (err) {
    console.error("Delete all failed", err);
    alert("Failed to delete all events");
  }
});

// Stop all broadcasts
document.getElementById("stop-all-btn")?.addEventListener("click", async () => {
  const password = prompt("Enter admin password:");
  if (!password) return;
  try {
    const res = await fetch(`${API.url}${API.endPoint.stopBroadcasts}`, {
      method: "POST",
      headers: { "X-Admin-Password": password }
    });
    if (res.ok) {
      alert("All broadcasts stopped");
    } else {
      alert("Invalid password or failed to stop broadcasts");
    }
  } catch (err) {
    console.error("Stop broadcasts failed", err);
    alert("Failed to stop broadcasts");
  }
});

// ─── Camera Logic ───────────────────────────────────────────

function createCameraCard(camName) {
  const clone = template.content.cloneNode(true);
  const video = clone.querySelector("video");
  const loader = clone.querySelector(".loading-overlay");
  clone.querySelector(".cam-name").textContent = camName;
  
  video.id = `video-${camName}`;
  video.muted = true;
  video.autoplay = true;
  video.setAttribute('playsinline', '');

  video.addEventListener("dblclick", () => {
    toggleFullscreen(video);
  });

  // Mobile double-tap fullscreen
  let lastTouchEnd = 0;
  video.addEventListener("touchend", () => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      toggleFullscreen(video);
    }
    lastTouchEnd = now;
  });

  function toggleFullscreen(v) {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      v.style.objectFit = "cover";
    } else {
      if (v.requestFullscreen) {
        v.requestFullscreen();
      } else if (v.webkitRequestFullscreen) {
        v.webkitRequestFullscreen();
      } else if (v.webkitEnterFullscreen) {
        v.webkitEnterFullscreen();
      }
      v.style.objectFit = "contain";
    }
  }

  video.addEventListener("playing", () => {
    loader.classList.add("opacity-0");
    setTimeout(() => loader.classList.add("hidden"), 300);
  });
  
  grid.appendChild(clone);
  return { video, camName, loader };
}

function loadStream(video, camName, loader) {
  initTime[camName] = Date.now();
  
  // Dispose existing player if it exists
  if (videoPlayers[camName]) {
    videoPlayers[camName].dispose();
    delete videoPlayers[camName];
  }

  loader.classList.remove("hidden", "opacity-0");
  const streamUrl = `${API.url}${API.endPoint.streams}/${camName}/index.m3u8?cb=${Date.now()}`;
  
  // Initialize Video.js
  const player = videojs(video, {
    autoplay: true,
    muted: true,
    controls: false,
    liveui: true,
    fluid: true,
    html5: {
      vhs: {
        overrideNative: !videojs.browser.IS_SAFARI,
        enableLowLatency: true,
        fastQualityChange: true,
        // Forcing to start after 1st segment since segments are long (20s)
        liveSyncDurationCount: 1, 
        // Allow more buffer to prevent stalls with long segments
        maxBufferLength: 60,
      }
    },
    sources: [{
      src: streamUrl,
      type: 'application/x-mpegURL'
    }]
  });

  videoPlayers[camName] = player;

  player.on('playing', () => {
    loader.classList.add("opacity-0");
    setTimeout(() => loader.classList.add("hidden"), 300);
  });

  player.on('error', () => {
    console.warn(`[VideoJS] Error on ${camName}, retrying in 5s...`);
    setTimeout(() => {
      if (videoPlayers[camName]) {
        loadStream(video, camName, loader);
      }
    }, 5000);
  });
}

// ─── Play Guardian ──────────────────────────────────────────
// Keeps the decoders alive and handles edge-case Chromium stalls
// Video.js handles most stalls and sync issues internally.
// We'll keep a minimal sync-check to ensure players don't drift too far.
setInterval(() => {
  Object.keys(videoPlayers).forEach((camName) => {
    const player = videoPlayers[camName];
    if (!player || player.paused()) return;
    
    // If the live tracker says we are too far behind, seek to live
    if (player.liveTracker && player.liveTracker.atLiveEdge && !player.liveTracker.atLiveEdge()) {
        const liveWindow = player.liveTracker.liveWindow();
        if (liveWindow > 10) { // If behind by more than 10s
             console.log(`[Sync] Nudging ${camName} to live edge`);
             player.liveTracker.seekToLiveEdge();
        }
    }
  });
}, 10000);

// ─── Initialization ─────────────────────────────────────────

async function init() {
  try {
    // Parallel UI data fetching
    Promise.all([fetchWeather(), fetchTuyaData("house"), fetchTuyaData("tent"), fetchRecentEvents()]);

    const res = await fetch(`${API.url}${API.endPoint.allCameras}`);
    const cameras = await res.json();
    channelCountEl.textContent = `${cameras.length} CHANNELS`;
    grid.innerHTML = "";

    // Parallel Camera Loading
    cameras.forEach(cam => {
      const { video, loader } = createCameraCard(cam);
      loadStream(video, cam, loader);
    });
  } catch (e) {
    console.error("Init failed", e);
  }
}

init();