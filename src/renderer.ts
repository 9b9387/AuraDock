import './index.css';
import type { AdbDeviceInfo } from './types';

const deviceListContainer = document.getElementById('device-list-container') as HTMLDivElement;
const deviceList = document.getElementById('device-list') as HTMLUListElement;
const refreshBtn = document.getElementById('refresh-devices') as HTMLButtonElement;

const scrcpyContainer = document.getElementById('scrcpy-container') as HTMLDivElement;
const scrcpyCanvas = document.getElementById('scrcpy-canvas') as HTMLCanvasElement;
const backBtn = document.getElementById('back-to-list') as HTMLButtonElement;
const scrcpyStatus = document.getElementById('scrcpy-status') as HTMLSpanElement;
const scrcpyError = document.getElementById('scrcpy-error') as HTMLDivElement;

const btnScreenshot = document.getElementById('btn-screenshot') as HTMLButtonElement;
const btnRecord = document.getElementById('btn-record') as HTMLButtonElement;

let currentPort: MessagePort | null = null;
let decoder: VideoDecoder | null = null;
let videoWidth = 0;
let videoHeight = 0;
let ctx: CanvasRenderingContext2D | null = null;

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

function takeScreenshot() {
  if (!scrcpyCanvas) return;
  const dataUrl = scrcpyCanvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `screenshot-${Date.now()}.png`;
  link.href = dataUrl;
  link.click();
}

function toggleRecording() {
  if (!mediaRecorder) {
    const stream = scrcpyCanvas.captureStream(30);
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    recordedChunks = [];
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `record-${Date.now()}.webm`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    };
    
    mediaRecorder.start();
    btnRecord.textContent = 'Stop Record';
    btnRecord.classList.add('recording');
  } else {
    mediaRecorder.stop();
    mediaRecorder = null;
    btnRecord.textContent = 'Start Record';
    btnRecord.classList.remove('recording');
  }
}

function sendControl(type: string, data: any = {}) {
  if (!currentPort) return;
  currentPort.postMessage({ type: 'control-action', actionType: type, data });
}

btnScreenshot.onclick = takeScreenshot;
btnRecord.onclick = toggleRecording;

async function refreshDevices() {
  deviceList.innerHTML = '<li>Loading...</li>';
  try {
    const devices = await window.adb.getDevices();
    deviceList.innerHTML = '';
    if (devices.length === 0) {
      deviceList.innerHTML = '<li>No devices found</li>';
      return;
    }
    devices.forEach((device: AdbDeviceInfo) => {
      const li = document.createElement('li');
      const serial = device.serial || (device as any).id;
      li.textContent = `${device.model || serial} (${serial})`;
      const connectBtn = document.createElement('button');
      connectBtn.textContent = 'Connect';
      connectBtn.onclick = () => startScrcpy(serial);
      li.appendChild(connectBtn);
      deviceList.appendChild(li);
    });
  } catch (error) {
    deviceList.innerHTML = `<li>Error: ${error}</li>`;
  }
}

function startScrcpy(serial: string) {
  console.log('[Renderer] Requesting scrcpy for:', serial);
  deviceListContainer.style.display = 'none';
  scrcpyContainer.style.display = 'block';
  scrcpyStatus.textContent = 'Connecting...';
  scrcpyError.style.display = 'none';

  ctx = scrcpyCanvas.getContext('2d');

  const onMessage = (event: MessageEvent) => {
    if (event.data.type === 'scrcpy-port' && event.ports[0]) {
      window.removeEventListener('message', onMessage);
      currentPort = event.ports[0];
      console.log('[Renderer] Received scrcpy port');

      currentPort.onmessage = (ev) => {
        const message = ev.data;
        if (message.type === 'metadata') {
          console.log('[Renderer] Received metadata:', message);
          if (message.width && message.height) {
            videoWidth = message.width;
            videoHeight = message.height;
            scrcpyCanvas.width = videoWidth;
            scrcpyCanvas.height = videoHeight;
            initDecoder();
            scrcpyStatus.textContent = `Streaming (${videoWidth}x${videoHeight})`;
          }
        } else if (message.type === 'packet') {
          if (!decoder) initDecoder();
          decodePacket(new Uint8Array(message.data), !!message.keyFrame, !!message.config);
        } else if (message.type === 'error') {
          console.error('[Renderer] Port error:', message.error);
          scrcpyStatus.textContent = 'Error';
          scrcpyError.textContent = message.error;
          scrcpyError.style.display = 'block';
        }
      };
      currentPort.start();
    }
  };

  window.addEventListener('message', onMessage);
  window.adb.requestScrcpy(serial);
}

let framesReceived = 0;
let framesDecoded = 0;
let hasDecodedKeyFrame = false;
let pendingConfig: Uint8Array | null = null;

function initDecoder() {
  if (decoder) {
    if (decoder.state === 'configured') return;
    decoder.close();
  }

  console.log('[Renderer] Initializing VideoDecoder');
  hasDecodedKeyFrame = false;
  decoder = new VideoDecoder({
    output: (frame) => {
      framesDecoded++;
      if (framesDecoded === 1) console.log('[Renderer] First frame decoded!');
      if (framesDecoded % 60 === 0) console.log(`[Renderer] Frames decoded: ${framesDecoded}`);
      
      if (videoWidth === 0 || scrcpyCanvas.width !== frame.displayWidth) {
        videoWidth = frame.displayWidth;
        videoHeight = frame.displayHeight;
        scrcpyCanvas.width = videoWidth;
        scrcpyCanvas.height = videoHeight;
      }
      ctx?.drawImage(frame, 0, 0, scrcpyCanvas.width, scrcpyCanvas.height);
      frame.close();
    },
    error: (e) => {
      console.error('[Renderer] WebCodecs Error:', e);
      scrcpyStatus.textContent = 'Decode Error';
    },
  });

  const decoderConfig: VideoDecoderConfig = {
    codec: 'avc1.42E01E', // Baseline profile
    optimizeForLatency: true,
  };

  decoder.configure(decoderConfig);
}

function decodePacket(data: Uint8Array, isKeyFrame: boolean, isConfig: boolean) {
  if (!decoder || decoder.state !== 'configured') return;
  
  if (isConfig) {
    console.log('[Renderer] Storing config packet (SPS/PPS)');
    pendingConfig = data;
    return;
  }

  if (!hasDecodedKeyFrame && !isKeyFrame) {
    // Skip delta frames until we get a keyframe
    return;
  }

  framesReceived++;
  
  let buffer = data;
  if (isKeyFrame && pendingConfig) {
    console.log('[Renderer] Prepending pending config to keyframe');
    const combined = new Uint8Array(pendingConfig.length + data.length);
    combined.set(pendingConfig);
    combined.set(data, pendingConfig.length);
    buffer = combined;
  }

  const chunk = new EncodedVideoChunk({
    type: isKeyFrame ? 'key' : 'delta',
    timestamp: Math.floor(performance.now() * 1000),
    data: buffer,
  });
  
  try {
    decoder.decode(chunk);
    if (isKeyFrame) hasDecodedKeyFrame = true;
  } catch (e) {
    console.error('[Renderer] Decode call failed:', e);
  }
}

function handleMouseEvent(e: MouseEvent, action: number) {
  if (!currentPort || videoWidth === 0) return;

  const rect = scrcpyCanvas.getBoundingClientRect();
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * videoWidth);
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * videoHeight);

  currentPort.postMessage({
    type: 'control',
    data: {
      action,
      pointerX: x,
      pointerY: y,
      videoWidth,
      videoHeight,
      pressure: action === 1 ? 0 : 1, // action 1 is UP
    }
  });
}

scrcpyCanvas.onmousedown = (e) => handleMouseEvent(e, 0); // DOWN
scrcpyCanvas.onmousemove = (e) => {
  if (e.buttons > 0) handleMouseEvent(e, 2); // MOVE
};
scrcpyCanvas.onmouseup = (e) => handleMouseEvent(e, 1); // UP

backBtn.onclick = () => {
  if (currentPort) {
    currentPort.close();
    currentPort = null;
  }
  if (decoder) {
    decoder.close();
    decoder = null;
  }
  scrcpyContainer.style.display = 'none';
  deviceListContainer.style.display = 'block';
  videoWidth = 0;
};

refreshBtn.onclick = refreshDevices;
refreshDevices();

// Activate the port listener
window.adb.onScrcpyPort((port) => {
  console.log('[Renderer] Scrcpy port registered via callback', port);
});
