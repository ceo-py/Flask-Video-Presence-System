const API = {
  url: "https://api-cameras.ceo-py.eu",
  // url: "http://127.0.0.1:5000",
  endPoint: {
    allCameras: "/api/allCameras",
    start: "/api/start",
    stop: "/api/stop",
    viewer: "/api/viewer",
    stream: "/streams",
    weather: "/api/weather/oriahovo",
    tuya: "/api/tuya",
  },
};

const grid = document.getElementById("camera-grid");
const template = document.getElementById("camera-card-template");
const channelCountEl = document.getElementById("channel-count");

// Weather Elements
const weatherTemp = document.getElementById("weather-temp");
const weatherIcon = document.getElementById("weather-icon");
const weatherPlaceholder = document.getElementById("weather-icon-placeholder");
const weatherDetails = document.getElementById("weather-details");
const weatherMinMax = document.getElementById("weather-minmax");
const weatherLabel = document.getElementById("weather-label");

// Weather Stats Elements (Humidity/Wind)
const weatherHumidity = document.getElementById("weather-humidity");
const weatherWind = document.getElementById("weather-wind");

// Tuya House Elements
const houseTemp = document.getElementById("house-temp");
const houseHumidity = document.getElementById("house-humidity");
const houseBattery = document.getElementById("house-battery");

// Tuya Tent Elements
const tentTemp = document.getElementById("tent-temp");
const tentHumidity = document.getElementById("tent-humidity");
const tentBattery = document.getElementById("tent-battery");

// Loaders
const houseLoader = document.getElementById("house-loader");
const tentLoader = document.getElementById("tent-loader");
const weatherLoader = document.getElementById("weather-loader");

async function fetchWeather() {
  try {
    const res = await fetch(`${API.url}${API.endPoint.weather}`);
    if (!res.ok) throw new Error("Weather API failed");

    // Data format: [t, t_min, t_max, feels_like, type_of_weather, weather_icon, humidity, wind_speed]
    const data = await res.json();

    if (Array.isArray(data) && data.length >= 8) {
      const temp = Math.round(data[0]);
      const tMin = Math.round(data[1]);
      const tMax = Math.round(data[2]);
      const condition = data[4];
      const iconCode = data[5];
      const humidity = data[6];
      const wind = Math.round(data[7]);

      // Update UI
      weatherTemp.textContent = `${temp}°C`;
      weatherLabel.textContent = condition.toUpperCase();

      // Icon
      const iconUrl = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
      weatherIcon.src = iconUrl;
      weatherIcon.classList.remove("hidden");
      if (weatherPlaceholder) weatherPlaceholder.classList.add("hidden");

      // Details (Feels like)
      weatherDetails.textContent = `Feels ${Math.round(data[3])}°C`;
      weatherDetails.classList.remove("hidden");

      // Min/Max
      weatherMinMax.textContent = `L:${tMin}° H:${tMax}°`;
      weatherMinMax.classList.remove("hidden");

      // Humidity & Wind
      if (weatherHumidity) weatherHumidity.textContent = `${humidity}%`;
      if (weatherWind) weatherWind.textContent = `${wind} KM/H`;

      // Hide Loader
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
    // {'va_temperature': 'N/A', 'va_humidity': 'N/A', 'battery_state': 'N/A'}

    const tempEl = target === "house" ? houseTemp : tentTemp;
    const humEl = target === "house" ? houseHumidity : tentHumidity;
    const batEl = target === "house" ? houseBattery : tentBattery;
    const loaderEl = target === "house" ? houseLoader : tentLoader;

    if (tempEl) {
      const temp = data.va_temperature;
      tempEl.textContent =
        temp !== null && temp !== undefined && temp !== "N/A"
          ? `${temp}°`
          : "--°";
    }

    if (humEl) {
      const hum = data.va_humidity;
      humEl.textContent =
        hum !== null && hum !== undefined && hum !== "N/A" ? `${hum}%` : "--%";
    }

    if (batEl) {
      const bat = data.battery_state;
      batEl.textContent = bat && bat !== "N/A" ? bat : "--";
    }

    // Hide Loader
    if (loaderEl) loaderEl.classList.add("opacity-0", "pointer-events-none");
  } catch (e) {
    console.warn(`Tuya fetch failed for ${target}`, e);
  }
}

// Grid Control Buttons
const btnListView = document.getElementById("btn-list-view");
const btnGridView = document.getElementById("btn-grid-view");

// Grid Classes
const CLASS_GRID_RESPONSIVE =
  "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6";
const CLASS_LIST_VIEW = "grid grid-cols-1 gap-6 max-w-3xl mx-auto"; // Centered list

function setViewMode(mode) {
  if (mode === "list") {
    grid.className = CLASS_LIST_VIEW;
    btnListView.classList.add("text-emerald-400", "bg-[#2a3040]");
    btnGridView.classList.remove("text-emerald-400", "bg-[#2a3040]");
  } else {
    grid.className = CLASS_GRID_RESPONSIVE;
    btnGridView.classList.add("text-emerald-400", "bg-[#2a3040]");
    btnListView.classList.remove("text-emerald-400", "bg-[#2a3040]");
  }
}

// Event Listeners
if (btnListView && btnGridView) {
  btnListView.addEventListener("click", () => setViewMode("list"));
  btnGridView.addEventListener("click", () => setViewMode("grid"));
}

// Web Worker for Heartbeats (Prevents background throttling)
const heartbeatWorkerScript = `
    let activeCameras = new Set();
    let timer = null;
    let apiUrl = '';

    self.onmessage = function(e) {
        const { type, camera, url } = e.data;
        
        if (type === 'init') {
            apiUrl = url;
            if (!timer) {
                // Heartbeat every 10 seconds (safe margin)
                timer = setInterval(sendHeartbeats, 10000); 
            }
        } else if (type === 'add') {
            activeCameras.add(camera);
            // Send immediate first beat
            sendBeat(camera);
        } else if (type === 'remove') {
            activeCameras.delete(camera);
        }
    };

    function sendHeartbeats() {
        activeCameras.forEach(cam => sendBeat(cam));
    }

    function sendBeat(cam) {
        if (!apiUrl) return;
        fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ camera: cam })
        }).catch(err => console.warn('Worker beat failed', err));
    }
`;

const heartbeatBlob = new Blob([heartbeatWorkerScript], {
  type: "application/javascript",
});
const heartbeatWorker = new Worker(URL.createObjectURL(heartbeatBlob));

// Initialize Worker with API URL
heartbeatWorker.postMessage({
  type: "init",
  url: `${API.url}${API.endPoint.viewer}`,
});

let hlsInstances = {}; // Track HLS instances by camName

async function init() {
  try {
    fetchWeather(); // Fire and forget
    fetchTuyaData("house");
    fetchTuyaData("tent");

    const cameras = await fetchCameras();
    channelCountEl.textContent = `${cameras.length} CHANNELS`;

    if (cameras.length > 0) {
      grid.innerHTML = ""; // Clear loading state
      for (const cam of cameras) {
        createCameraCard(cam);
      }
    } else {
      grid.innerHTML =
        '<div class="col-span-full text-center text-slate-500">No cameras detected.</div>';
    }
  } catch (e) {
    console.error("Initialization failed", e);
    grid.innerHTML =
      '<div class="col-span-full text-center text-red-500">System Offline. Connection Failed.</div>';
  }
}

async function fetchCameras() {
  const res = await fetch(`${API.url}${API.endPoint.allCameras}`);
  if (!res.ok) throw new Error("Failed to fetch cameras");
  return await res.json();
}

async function startStream(camName) {
  const res = await fetch(`${API.url}${API.endPoint.start}/${camName}`);
  if (!res.ok) throw new Error(`Failed to start stream for ${camName}`);
  return await res.json();
}

function createCameraCard(camName) {
  const clone = template.content.cloneNode(true);
  const cardContainer = clone.querySelector(".card-container");
  const nameEl = clone.querySelector(".cam-name");
  const video = clone.querySelector("video");
  const loader = clone.querySelector(".loading-overlay");

  // Controls

  // Set Name
  nameEl.textContent = `${camName}`;

  // Controls Logic


  // Double-Click Fullscreen
  video.addEventListener("dblclick", () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      if (video.requestFullscreen) {
        video.requestFullscreen();
      } else if (video.webkitRequestFullscreen) {
        video.webkitRequestFullscreen(); // Safari
      } else if (video.msRequestFullscreen) {
        video.msRequestFullscreen(); // IE11
      }
    }
  });

  // Robust Loading Handling
  const hideLoader = () => {
    if (!loader.classList.contains("hidden")) {
      loader.classList.add("opacity-0");
      setTimeout(() => loader.classList.add("hidden"), 300);
    }
  };

  video.addEventListener("playing", hideLoader);
  video.addEventListener("timeupdate", () => {
    if (video.currentTime > 0 && !video.paused && !video.ended && video.readyState > 2) {
      hideLoader();
    }
  });
  
  // Retry on click if stuck
  loader.addEventListener("click", () => {
      console.log(`Manual retry for ${camName}`);
      loadStream(video, camName, loader);
  });

  // Initial Load
  loadStream(video, camName, loader);

  grid.appendChild(clone);
}

// Logic to load/reload stream
function loadStream(video, camName, loader) {
  // Clean up existing HLS if any
  if (hlsInstances[camName]) {
    hlsInstances[camName].destroy();
    delete hlsInstances[camName];
  }

  loader.classList.remove("hidden", "opacity-0");

  // Start Worker Heartbeat
  heartbeatWorker.postMessage({ type: "add", camera: camName });

  startStream(camName)
    .then(async (data) => {
      // Cache busting: Append timestamp
      const streamUrl = `${API.url}${data.url}?t=${Date.now()}`;

      try {
        await checkStreamReady(streamUrl);
      } catch (e) {
        console.warn(`Stream check timed out for ${camName}`);
      }

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false, // Relaxed for stability

          // Relaxed Live Sync
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 10,
          maxLiveSyncPlaybackRate: 1.5,

          manifestLoadingMaxRetry: 10,
          manifestLoadingRetryDelay: 500,
          levelLoadingMaxRetry: 10,
          fragLoadingMaxRetry: 10,
        });

        hlsInstances[camName] = hls; // Store instance

        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, function () {
          video.play().catch((e) => console.log("Autoplay blocked/failed", e));
          loader.classList.add("opacity-0");
          setTimeout(() => loader.classList.add("hidden"), 300);
        });
        hls.on(Hls.Events.ERROR, function (event, data) {
          // Check for 404s specifically
          const is404 = data.response && data.response.code === 404;

          if (data.fatal || is404) {
            console.warn(
              `HLS Error: ${data.type} / ${data.details} (404: ${is404})`,
            );

            if (is404) {
              console.log("404 encountered. Reloading stream...");
              hls.destroy();
              if (hlsInstances[camName] === hls) delete hlsInstances[camName];

              // Retry loop
              setTimeout(() => {
                loadStream(video, camName, loader);
              }, 2000);
              return;
            }

            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                if (hlsInstances[camName] === hls) delete hlsInstances[camName];
                setTimeout(() => loadStream(video, camName, loader), 5000);
                break;
            }
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = streamUrl;
        video.addEventListener("loadedmetadata", function () {
          video.play().catch((e) => console.log("Autoplay blocked/failed", e));
          loader.classList.add("opacity-0");
          setTimeout(() => loader.classList.add("hidden"), 300);
        });
        video.addEventListener("error", function () {
          setTimeout(() => {
            loadStream(video, camName, loader);
          }, 2000);
        });
      }
    })
    .catch((err) => {
      console.error(`Stream error for ${camName}`, err);
      loader.innerHTML = '<span class="text-red-500 text-xs">OFFLINE</span>';
      // Retry eventually
      setTimeout(() => loadStream(video, camName, loader), 5000);
    });
}

// Helper: Polls for the m3u8 file until it returns 200 OK or timeout
async function checkStreamReady(url, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) return true;
    } catch (e) {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Don't throw explicitly, just return, let player try
  return false;
}

// Cleanup on unload
window.addEventListener("beforeunload", () => {
  // Worker automatically killed when page closes, essentially
  // But we can cleanup just to be safe if SPA
});

// Auto-Sync to Live Edge on Tab Focus
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    console.log("Tab visible: Syncing streams to live edge...");
    Object.values(hlsInstances).forEach((hls) => {
      if (hls.media) {
        // If latency is high (>3s), jump to live sync point
        if (hls.latency > 3) {
          hls.media.currentTime =
            hls.liveSyncPosition || hls.media.duration - 1;
        }
        hls.media.play().catch((e) => console.log("Resume play failed", e));
      }
    });
  }
});

// Start
init();
