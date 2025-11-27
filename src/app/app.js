/* Retro Matrix Cameras - minimal, mobile friendly, multiple local webcams
   - Uses getUserMedia per tile
   - Add/remove cameras, set number with slider
   - Keeps UI within a single viewport (no scrolling)
*/

const matrix = document.getElementById('matrix');
const grid = document.getElementById('grid');
const addBtn = document.getElementById('addCamera');
const countDisplay = document.getElementById('countDisplay');
const template = document.getElementById('tile-template');
const devicesList = document.getElementById('devices-list');

const API = {
  url: "http://127.0.0.1:5000",
  endPoint : {
    allCameras: "/api/allCameras",
    start: "/api/start",
    stop: "/api/stop",
    viewer: "/api/viewer",
    stream: "/streams",
  }
}

// Function to fetch all cameras
async function getAllCameras() {
  try {
    const response = await fetch(API.url + API.endPoint.allCameras);
    
    if (!response.ok) {
      throw new Error('Failed to fetch cameras');
    }

    const cameras = await response.json();

    return cameras;
  } catch (error) {
    console.error('Error fetching cameras:', error);
  }
}

async function starCamera(cameraName) {
  try {
    const response = await fetch(`${API.url}${API.endPoint.start}/${cameraName}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch start camera');
    }

    const cameraUrl = await response.json();

    return cameraUrl;
  } catch (error) {
    console.error('Error fetching start camera:', error);
  }
}

let tiles = [];
let streams = new Map();

/* initialize canvas context early so drawMatrix can use it */
const ctx = matrix.getContext('2d');

function resizeCanvas() {
  matrix.width = innerWidth * devicePixelRatio;
  matrix.height = innerHeight * devicePixelRatio;
  matrix.style.width = innerWidth + 'px';
  matrix.style.height = innerHeight + 'px';
  drawMatrix(); // redraw static background after resize
}
addEventListener('resize', resizeCanvas, {passive:true});
resizeCanvas();

/* Static Matrix background (draw once per resize, no animation) */
function drawMatrix(){
  // fill background and draw sparse static characters for a retro look
  ctx.clearRect(0,0,matrix.width,matrix.height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0,0,matrix.width,matrix.height);
  ctx.fillStyle = '#7cff9d';
  ctx.font = (12*devicePixelRatio) + 'px monospace';

  const cols = Math.floor(innerWidth / 14);
  const rows = Math.floor(innerHeight / 18);
  for(let i=0;i<cols;i++){
    for(let j=0;j<rows;j++){
      if(Math.random() > 0.975) {
        const x = i * 14 * devicePixelRatio;
        const y = j * 14 * devicePixelRatio;
        const char = String.fromCharCode(0x30A0 + Math.floor(Math.random()*96));
        ctx.fillText(char, x, y);
      }
    }
  }
}

/* get media devices list */
async function refreshDevices(){
  try{
    await navigator.mediaDevices.getUserMedia({video:true, audio:false}).then(s => { s.getTracks().forEach(t=>t.stop()); }).catch(()=>{});
    const list = await navigator.mediaDevices.enumerateDevices();
    devicesList.innerHTML = '';
    list.filter(d=>d.kind==='videoinput').forEach(d=>{
      const opt = document.createElement('option');
      opt.value = d.deviceName;
      opt.label = d.label || 'Camera';
      devicesList.appendChild(opt);
    });
  }catch(e){
    // ignore
  }
}
refreshDevices();
navigator.mediaDevices && navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener('devicechange', refreshDevices);

/* Tile creation and control */
function createTile(deviceName){
  const el = template.content.firstElementChild.cloneNode(true);
  const title = el.querySelector('.title-camera');
  const video = el.querySelector('video.cam');
  const playBtn = el.querySelector('.btn-play');
  const stopBtn = el.querySelector('.btn-stop');
  const deviceSelect = el.querySelector('.device-select');
  const fullscreenBtn = el.querySelector('.btn-fullscreen');

  title.textContent = deviceName
  starCamera(deviceName).then(cameraUrl => {
  
  if (deviceSelect && cameraUrl) {
    deviceSelect.value = `${API.url}${cameraUrl.url}`;  // Set the value of the input field to the camera URL
    console.log('Set device select input value to:', deviceSelect.value);
  } else {
    console.log('Device select input not found or camera URL is invalid');
  }
}).catch(error => {
  console.error('Error:', error);
});

  // fullscreen toggle
  fullscreenBtn.addEventListener('click', async () => {
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
      console.warn('fs error', err);
    }
  });

  // deviceSelect.addEventListener('dblclick', ()=>refreshDevices());
  // // set placeholder to devices list first option if present
  // const firstOpt = devicesList.querySelector('option');
  // if(firstOpt) deviceSelect.placeholder = firstOpt.label;

  playBtn.addEventListener('click', async () => {
    if (streams.get(video)) return;
    try{
      const val = deviceSelect.value && deviceSelect.value.trim();
      // If user provided an m3u8/http URL, attempt HLS playback
      if (val && (val.startsWith('http://') || val.startsWith('https://')) && val.toLowerCase().includes('.m3u8')) {
        // lazy-load hls.js from esm.sh
        const { default: Hls } = await import('https://esm.sh/hls.js@1.4.0');
        if (Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(val);
          hls.attachMedia(video);
          streams.set(video, { type: 'hls', hls });
          video.muted = false;
          await video.play().catch(()=>{});
        } else {
          // native HLS (Safari)
          video.src = val;
          streams.set(video, { type: 'native-hls' });
          video.muted = false;
          await video.play().catch(()=>{});
        }
        return;
      }

    }catch(err){
      console.warn('camera/error', err);
      alert('Unable to access camera or play stream: ' + (err && err.message ? err.message : err));
    }
  });

  stopBtn.addEventListener('click', ()=>{
    stopVideo(video);
  });

  // When device input value changed, try auto-play for that tile
  deviceSelect.addEventListener('change', async () => {
    if (streams.get(video)) {
      stopVideo(video);
      // small delay to allow device switch
      setTimeout(()=>playBtn.click(), 150);
    }
  });

  grid.appendChild(el);
  tiles.push(el);
  updateCount();
  return el;
}

function stopVideo(video){
  const entry = streams.get(video);
  if(!entry) return;
  if(entry.type === 'stream') {
    entry.stream.getTracks().forEach(t=>t.stop());
  } else if(entry.type === 'hls') {
    try{ entry.hls.destroy(); }catch(e){}
  } else if(entry.type === 'native-hls') {
    try{ video.pause(); video.src = ''; }catch(e){}
  }
  streams.delete(video);
  try{ video.srcObject = null; }catch(e){}
}

/* Add initial tiles based on slider value */
// function ensureTiles(n){
//   while(tiles.length < n){
//     createTile();
//   }
//   while(tiles.length > n){
//     const t = tiles.pop();
//     const v = t.querySelector('video.cam');
//     stopVideo(v);
//     t.remove();
//   }
//   updateCount();
// }

countDisplay.textContent = '0';
addBtn.addEventListener('click', ()=>{ createTile(); });

/* create default tiles */
// ensureTiles(3);

// Example usage of the function
// getAllCameras().then(cameras => {
//   // Do something with the camera data
//   console.log('All cameras:', cameras);
// });

getAllCameras().then(cameras => {
  cameras.forEach(camera => {
    createTile(camera);
  });
});

updateCount();

/* stop all streams when page hides/unloads */
function stopAll(){
  for(const [v,e] of streams.entries()){
    if(e.type === 'stream') e.stream.getTracks().forEach(t=>t.stop());
    else if(e.type === 'hls') try{ e.hls.destroy(); }catch(_){} 
    else if(e.type === 'native-hls') try{ v.pause(); v.src=''; }catch(_){}
  }
  streams.clear();
}
addEventListener('pagehide', stopAll);
addEventListener('beforeunload', stopAll);

function updateCount(){
  countDisplay.textContent = String(tiles.length);
}