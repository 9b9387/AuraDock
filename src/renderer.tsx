import './index.css';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Smartphone, Bot, Mic, RefreshCw, Send, Play, Square, 
  Camera, Video, AlertCircle, Cpu, Sparkles, Check, 
  ChevronDown, PhoneOff, List, Circle, ArrowLeft, ArrowUp
} from 'lucide-react';

import { ScrcpyAudioQueue } from './renderer/services/scrcpy-audio-queue';
import { AudioMixer } from './renderer/services/audio-mixer';
import { GeminiVoicePlayer } from './renderer/services/gemini-voice-player';
import { VideoFramePush } from './renderer/services/video-frame-push';
import { GeminiLiveService, ConnectionStatus } from './renderer/services/gemini-live-service';
import type { AdbDeviceInfo } from './types';

// Instantiate persistent audio/video/live services as singletons
const scrcpyAudioQueue = new ScrcpyAudioQueue();
const audioMixer = new AudioMixer(scrcpyAudioQueue);
const geminiVoicePlayer = new GeminiVoicePlayer();
const geminiLiveService = new GeminiLiveService();

// Helper: Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

interface LogEntry {
  type: 'thought' | 'action' | 'status';
  message: string;
  timestamp: number;
}

export function App() {
  // Device Selection & Connection State
  const [devices, setDevices] = useState<AdbDeviceInfo[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [activeSerial, setActiveSerial] = useState<string | null>(null);
  const [activeDeviceModel, setActiveDeviceModel] = useState<string | null>(null);
  const [scrcpyStatus, setScrcpyStatus] = useState<string>('Disconnected');
  const [scrcpyError, setScrcpyError] = useState<string | null>(null);
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false);

  // Layout & Workspace Toggles

  // Vision Agent State
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentInput, setAgentInput] = useState('');
  const [agentLogs, setAgentLogs] = useState<LogEntry[]>([]);

  const agentRunningRef = useRef(agentRunning);
  useEffect(() => {
    agentRunningRef.current = agentRunning;
  }, [agentRunning]);

  // Gemini Live Call State
  const [geminiStatus, setGeminiStatus] = useState<ConnectionStatus>('disconnected');
  const [geminiLogs, setGeminiLogs] = useState<LogEntry[]>([]);
  const [geminiChatInput, setGeminiChatInput] = useState('');
  const [waveBars, setWaveBars] = useState<number[]>([10, 10, 10, 10, 10, 10, 10, 10]);

  const geminiLogsRef = useRef(geminiLogs);
  useEffect(() => {
    geminiLogsRef.current = geminiLogs;
  }, [geminiLogs]);

  // Video Streaming Canvas Ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // VideoDecoder & MessagePort Stream Refs
  const currentPortRef = useRef<MessagePort | null>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const videoWidthRef = useRef<number>(0);
  const videoHeightRef = useRef<number>(0);
  const hasDecodedKeyFrameRef = useRef<boolean>(false);
  const pendingConfigRef = useRef<Uint8Array | null>(null);
  const framesReceivedRef = useRef<number>(0);
  const framesDecodedRef = useRef<number>(0);

  // Ref for auto-scrolling log containers
  const unifiedLogEndRef = useRef<HTMLDivElement | null>(null);

  // Load and refresh connected ADB devices
  const refreshDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const devList = await (window as any).adb.getDevices();
      setDevices(devList);
    } catch (err: any) {
      console.error('[Renderer] Error loading devices:', err);
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  // Poll device list on mount
  useEffect(() => {
    refreshDevices();
    const interval = setInterval(refreshDevices, 8000);
    return () => clearInterval(interval);
  }, [refreshDevices]);

  // Activate the port listener on mount so the preload script forwards scrcpy-port via postMessage
  useEffect(() => {
    const unsubscribe = (window as any).adb.onScrcpyPort(() => {
      console.log('[Renderer] Preload registered scrcpy port forwarding');
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Auto-scroll logs to bottom when updated
  useEffect(() => {
    unifiedLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentLogs, geminiLogs]);

  // Handle active stream waveform animation
  useEffect(() => {
    let animId: any;
    if (geminiStatus === 'connected') {
      const updateWave = () => {
        setWaveBars(Array.from({ length: 12 }, () => Math.floor(Math.random() * 80) + 15));
        animId = setTimeout(updateWave, 100);
      };
      updateWave();
    } else {
      setWaveBars([10, 10, 10, 10, 10, 10, 10, 10]);
    }
    return () => clearTimeout(animId);
  }, [geminiStatus]);

  // Wire Vision Agent Callback Events
  useEffect(() => {
    const handleLog = (log: any) => {
      setAgentLogs((prev) => [
        ...prev,
        { type: log.type, message: log.message, timestamp: Date.now() }
      ]);
      if (
        log.message.includes('stopped') || 
        log.message.includes('successfully') || 
        log.message.includes('max turns') || 
        log.message.includes('Error')
      ) {
        setAgentRunning(false);
      }
    };

    const handleScreenshotRequest = () => {
      if (!canvasRef.current) return;
      const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
      const base64 = dataUrl.split(',')[1];
      (window as any).adb.sendScreenshot(base64);
    };

    (window as any).adb.onAgentLog(handleLog);
    (window as any).adb.onScreenshotRequest(handleScreenshotRequest);
  }, []);

  // Initialize Video Decoder
  const initDecoder = useCallback(() => {
    if (decoderRef.current) {
      if (decoderRef.current.state === 'configured') return;
      decoderRef.current.close();
    }

    console.log('[Renderer] Initializing VideoDecoder');
    hasDecodedKeyFrameRef.current = false;
    framesDecodedRef.current = 0;

    decoderRef.current = new VideoDecoder({
      output: (frame) => {
        framesDecodedRef.current++;
        if (framesDecodedRef.current === 1) console.log('[Renderer] First frame decoded!');
        if (framesDecodedRef.current % 600 === 0) {
          console.log(`[Renderer] Mirroring stream active. Total frames decoded: ${framesDecodedRef.current}`);
        }

        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (videoWidthRef.current === 0 || canvas.width !== frame.displayWidth) {
            videoWidthRef.current = frame.displayWidth;
            videoHeightRef.current = frame.displayHeight;
            canvas.width = frame.displayWidth;
            canvas.height = frame.displayHeight;
          }
          ctx?.drawImage(frame, 0, 0, canvas.width, canvas.height);
        }
        frame.close();
      },
      error: (e) => {
        console.error('[Renderer] WebCodecs Error:', e);
        setScrcpyStatus('Decode Error');
      },
    });

    decoderRef.current.configure({
      codec: 'avc1.42E01E', // Baseline profile
      optimizeForLatency: true,
    });
  }, []);

  // Decode Incoming H264/H265 Video Packet
  const decodePacket = useCallback((data: Uint8Array, isKeyFrame: boolean, isConfig: boolean) => {
    if (!decoderRef.current || decoderRef.current.state !== 'configured') return;

    if (isConfig) {
      pendingConfigRef.current = data;
      return;
    }

    if (!hasDecodedKeyFrameRef.current && !isKeyFrame) {
      return;
    }

    framesReceivedRef.current++;

    let buffer = data;
    if (isKeyFrame && pendingConfigRef.current) {
      const combined = new Uint8Array(pendingConfigRef.current.length + data.length);
      combined.set(pendingConfigRef.current);
      combined.set(data, pendingConfigRef.current.length);
      buffer = combined;
    }

    const chunk = new EncodedVideoChunk({
      type: isKeyFrame ? 'key' : 'delta',
      timestamp: Math.floor(performance.now() * 1000),
      data: buffer,
    });

    try {
      decoderRef.current.decode(chunk);
      if (isKeyFrame) hasDecodedKeyFrameRef.current = true;
    } catch (e) {
      console.error('[Renderer] Decode call failed:', e);
    }
  }, []);

  // Connect to Scrcpy for Selected Device
  const startScrcpy = useCallback((serial: string, modelName?: string) => {
    console.log('[Renderer] Requesting scrcpy for:', serial);
    setActiveSerial(serial);
    setActiveDeviceModel(modelName || serial);
    setScrcpyStatus('Connecting...');
    setScrcpyError(null);
    setDeviceDropdownOpen(false);

    const onMessage = (event: MessageEvent) => {
      if (event.data.type === 'scrcpy-port' && event.ports[0]) {
        window.removeEventListener('message', onMessage);
        currentPortRef.current = event.ports[0];
        console.log('[Renderer] Received scrcpy port');

        currentPortRef.current.onmessage = (ev) => {
          const message = ev.data;
          if (message.type === 'metadata') {
            console.log('[Renderer] Received metadata:', message);
            if (message.width && message.height) {
              videoWidthRef.current = message.width;
              videoHeightRef.current = message.height;
              if (canvasRef.current) {
                canvasRef.current.width = message.width;
                canvasRef.current.height = message.height;
              }
              initDecoder();
              setScrcpyStatus(`Streaming (${message.width}x${message.height})`);
            }
          } else if (message.type === 'packet') {
            if (!decoderRef.current) initDecoder();
            decodePacket(new Uint8Array(message.data), !!message.keyFrame, !!message.config);
          } else if (message.type === 'audio-packet') {
            scrcpyAudioQueue.write(new Uint8Array(message.data));
          } else if (message.type === 'error') {
            console.error('[Renderer] Port error:', message.error);
            setScrcpyStatus('Error');
            setScrcpyError(message.error);
          }
        };
        currentPortRef.current.start();
      }
    };

    window.addEventListener('message', onMessage);
    (window as any).adb.requestScrcpy(serial);
  }, [initDecoder, decodePacket]);

  // Disconnect Scrcpy stream
  const disconnectScrcpy = useCallback(() => {
    // 1. Disconnect Gemini Live Call
    geminiLiveService.disconnect();

    // 2. Stop audio/video mixers
    audioMixer.stop();
    geminiVoicePlayer.stop();
    scrcpyAudioQueue.clear();

    // 3. Stop Video Stream Port
    if (currentPortRef.current) {
      currentPortRef.current.close();
      currentPortRef.current = null;
    }
    if (decoderRef.current) {
      decoderRef.current.close();
      decoderRef.current = null;
    }

    // 4. Reset state
    setActiveSerial(null);
    setActiveDeviceModel(null);
    setScrcpyStatus('Disconnected');
    setScrcpyError(null);
    videoWidthRef.current = 0;
    videoHeightRef.current = 0;
  }, []);

  // Handle Touch/Mouse Click coordinates over Scrcpy Canvas
  const handleCanvasMouseEvent = useCallback((e: React.MouseEvent<HTMLCanvasElement>, action: number) => {
    if (!currentPortRef.current || videoWidthRef.current === 0 || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * videoWidthRef.current);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * videoHeightRef.current);

    currentPortRef.current.postMessage({
      type: 'control',
      data: {
        action,
        pointerX: x,
        pointerY: y,
        videoWidth: videoWidthRef.current,
        videoHeight: videoHeightRef.current,
        pressure: action === 1 ? 0 : 1, // action 1 is UP
      }
    });
  }, []);

  // Android Navigation bar key execution
  const executeSystemKey = useCallback(async (key: 'BACK' | 'HOME' | 'APP_SWITCH') => {
    if (!activeSerial) return;
    try {
      await (window as any).adb.executeTool(activeSerial, 'key_event', { key });
    } catch (err) {
      console.error('[Renderer] System key event error:', err);
    }
  }, [activeSerial]);

  // Take Canvas Screenshot
  const handleTakeScreenshot = useCallback(() => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `screenshot-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }, []);

  // Run Autonomous Vision Agent Task
  const handleStartAgent = useCallback(() => {
    const task = agentInput.trim();
    if (!task) return;

    (window as any).adb.startAgent(task);
    setAgentLogs((prev) => [
      ...prev,
      { type: 'status', message: `Starting task: ${task}`, timestamp: Date.now() }
    ]);
    setAgentRunning(true);
  }, [agentInput]);

  // Stop Autonomous Vision Agent Task
  const handleStopAgent = useCallback(() => {
    (window as any).adb.stopAgent();
    setAgentRunning(false);
    setAgentLogs((prev) => [
      ...prev,
      { type: 'status', message: 'Task stopped by user.', timestamp: Date.now() }
    ]);
  }, []);

  // Wire Gemini Live Call Callback Events
  useEffect(() => {
    const videoPusher = new VideoFramePush(canvasRef.current as any);

    geminiLiveService.onStatusChanged = (status, msg) => {
      setGeminiStatus(status);
      setGeminiLogs((prev) => [
        ...prev,
        { type: 'status', message: `Live Call Status: ${status.toUpperCase()} ${msg || ''}`, timestamp: Date.now() }
      ]);

      if (status === 'connected') {
        // Start audio mixing and sending
        audioMixer.start((pcmData) => {
          const base64 = arrayBufferToBase64(pcmData);
          geminiLiveService.sendAudioChunk(base64);
        }).then(() => {
          const sharedCtx = (audioMixer as any).audioCtx;
          geminiVoicePlayer.start(sharedCtx);
        }).catch(err => {
          console.error('[Renderer] Audio mixer start failed:', err);
          setGeminiLogs((prev) => [
            ...prev,
            { type: 'status', message: `Audio input error: ${err.message}`, timestamp: Date.now() }
          ]);
          geminiLiveService.disconnect();
        });

        // Start 1 FPS image pushing
        if (canvasRef.current) {
          (videoPusher as any).sourceCanvas = canvasRef.current;
          videoPusher.start((jpegBase64) => {
            geminiLiveService.sendImageFrame(jpegBase64);
          });
        }
      } else if (status === 'disconnected' || status === 'error') {
        audioMixer.stop();
        videoPusher.stop();
        geminiVoicePlayer.stop();
        scrcpyAudioQueue.clear();

        if (agentRunningRef.current) {
          const chatLogs = geminiLogsRef.current
            .filter(l => l.type === 'thought' || l.type === 'action')
            .slice(-3)
            .map(l => l.message)
            .join('; ');
          
          const consensus = chatLogs 
            ? `During the voice call, user and assistant discussed: "${chatLogs}". Please continue the task with this new guidance.`
            : 'Voice call ended. Please observe screen and continue the task.';

          (window as any).adb.resumeAgent(consensus);
          setAgentLogs((prev) => [
            ...prev,
            { type: 'status', message: `💡 实时通话已挂断，Agent 自动恢复运行。通话共识: ${consensus}`, timestamp: Date.now() }
          ]);
        }
      }
    };

    geminiLiveService.onAudioReceived = (pcmBuffer) => {
      geminiVoicePlayer.playRawPCM(pcmBuffer);
    };

    geminiLiveService.onTextReceived = (text) => {
      setGeminiLogs((prev) => [
        ...prev,
        { type: 'thought', message: `Gemini: ${text}`, timestamp: Date.now() }
      ]);
    };

    geminiLiveService.onInterrupted = () => {
      geminiVoicePlayer.interrupt();
      setGeminiLogs((prev) => [
        ...prev,
        { type: 'status', message: '[Interrupted: AI voice cutoff]', timestamp: Date.now() }
      ]);
    };

    geminiLiveService.onLogMessage = (type, message) => {
      setGeminiLogs((prev) => [
        ...prev,
        { type, message, timestamp: Date.now() }
      ]);
    };

    return () => {
      videoPusher.stop();
    };
  }, []);

  // Connect Gemini Live Call
  const handleStartLiveCall = useCallback(async () => {
    try {
      const apiKey = await (window as any).adb.getGeminiApiKey();
      if (!apiKey) {
        setGeminiLogs((prev) => [
          ...prev,
          { type: 'status', message: 'Missing GEMINI_API_KEY in environment/.env', timestamp: Date.now() }
        ]);
        return;
      }
      if (!activeSerial) {
        setGeminiLogs((prev) => [
          ...prev,
          { type: 'status', message: 'No active device stream connected. Please connect a device first.', timestamp: Date.now() }
        ]);
        return;
      }

      let systemInstruction: string | undefined = undefined;

      // If Vision Agent is running, pause it and inherit state
      if (agentRunningRef.current) {
        setGeminiLogs((prev) => [
          ...prev,
          { type: 'status', message: 'Detecting running Agent. Pausing Agent to synchronize session...', timestamp: Date.now() }
        ]);
        
        // Signal main process to pause the agent loop
        (window as any).adb.pauseAgent();

        // Retrieve current context/state from the paused Agent loop
        const agentState = await (window as any).adb.getAgentState();
        if (agentState) {
          const { task, currentPlan, currentContext, actionHistory } = agentState;
          
          systemInstruction = `You are a real-time voice and vision assistant. We are currently executing an autonomous agent task and you are now TAKING OVER!

[THE USER'S TASK]
${task}

[CURRENT PLAN]
${currentPlan}

[CURRENT CONTEXT]
${currentContext}

[LAST 3 COMPLETED STEPS]
${actionHistory.slice(-3).join('\n') || 'None yet.'}

INSTRUCTION FOR TAKE-OVER:
- Acknowledge that you are temporarily taking over the agent loop.
- Speak to the user naturally about what you currently see on their Android screen.
- Inform them what the previous Agent has done, and ask for their voice guidance to proceed.
- If they ask you to perform actions, use the provided tools (tap, swipe, input_text, key_event) directly.
- Keep responses short, lively, and conversational.`;

          setAgentLogs((prev) => [
            ...prev,
            { type: 'status', message: '⏸️ Agent 运行暂停。已启动实时通话接管。', timestamp: Date.now() }
          ]);
        }
      }

      geminiLiveService.connect(apiKey, activeSerial, systemInstruction);
    } catch (err: any) {
      setGeminiLogs((prev) => [
        ...prev,
        { type: 'status', message: `Failed to fetch API key or initialize handover: ${err.message}`, timestamp: Date.now() }
      ]);
    }
  }, [activeSerial]);

  // Disconnect Gemini Live Call
  const handleStopLiveCall = useCallback(() => {
    geminiLiveService.disconnect();
  }, []);

  // Send Text Input to Gemini Live (Alternative to Voice)
  const handleSendLiveChatText = useCallback(() => {
    const text = geminiChatInput.trim();
    if (!text) return;

    if (geminiLiveService.connectionStatus !== 'connected') {
      setGeminiLogs((prev) => [
        ...prev,
        { type: 'status', message: 'Cannot send message: Gemini Live is not connected.', timestamp: Date.now() }
      ]);
      return;
    }

    setGeminiLogs((prev) => [
      ...prev,
      { type: 'action', message: `You: ${text}`, timestamp: Date.now() }
    ]);
    geminiLiveService.sendTextMessage(text);
    setGeminiChatInput('');
  }, [geminiChatInput]);

  // Global Emergency Stop Everything
  const handleGlobalStop = useCallback(() => {
    console.log('[Renderer] Emergency Stop Triggered.');
    (window as any).adb.stopAgent();
    agentRunningRef.current = false; // Directly prevent race-conditioned resume
    setAgentRunning(false);
    setAgentLogs((prev) => [
      ...prev,
      { type: 'status', message: 'Emergency Stop: Vision Agent halted.', timestamp: Date.now() }
    ]);

    geminiLiveService.disconnect();
  }, []);

  const unifiedLogs = [...agentLogs, ...geminiLogs].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans antialiased selection:bg-zinc-800">
      
      {/* LEFT PANEL: Phone screen mirroring & canvas stream */}
      <div className="flex flex-col flex-[3] border-r border-zinc-900 bg-zinc-950 p-4 h-full min-w-0 relative">
        
        {/* Mirror Header Section */}
        <div className="flex items-center justify-between mb-4 z-20">
          <div className="relative">
            {/* Device selection Dropdown */}
            <button 
              onClick={() => setDeviceDropdownOpen(!deviceDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-medium hover:bg-zinc-800 transition-colors"
            >
              <Smartphone className={`w-4 h-4 ${activeSerial ? 'text-emerald-500' : 'text-zinc-500'}`} />
              <span className="max-w-[120px] truncate">
                {activeDeviceModel || '选择设备'}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${deviceDropdownOpen ? 'transform rotate-180' : ''}`} />
            </button>

            {/* Dropdown Content */}
            {deviceDropdownOpen && (
              <div className="absolute left-0 mt-2 w-72 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-zinc-800 mb-1">
                  <span className="text-xs font-semibold text-zinc-400">Android 设备</span>
                  <button 
                    onClick={refreshDevices}
                    disabled={loadingDevices}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingDevices ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {devices.length === 0 ? (
                    <div className="text-center py-6 text-sm text-zinc-500">未发现可用设备</div>
                  ) : (
                    devices.map((device) => {
                      const serial = device.serial || (device as any).id;
                      const isConnected = activeSerial === serial;
                      return (
                        <div 
                          key={serial} 
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-800/60 transition-colors"
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <span className="text-sm font-medium truncate text-zinc-100">
                              {device.model || '未知设备'}
                            </span>
                            <span className="text-xxs font-mono text-zinc-500 truncate mt-0.5">
                              {serial}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              if (isConnected) {
                                disconnectScrcpy();
                              } else {
                                startScrcpy(serial, device.model);
                              }
                            }}
                            className={`text-xs px-2.5 py-1.5 rounded-md font-semibold transition-colors shrink-0 ${
                              isConnected 
                                ? 'bg-zinc-800 hover:bg-red-950 hover:text-red-400 text-zinc-300' 
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            }`}
                          >
                            {isConnected ? '断开' : '连接'}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
              {scrcpyStatus}
            </span>
          </div>
        </div>

        {/* Video Canvas Mirror Stream area */}
        <div ref={containerRef} className="flex-1 flex items-center justify-center bg-zinc-900/40 rounded-2xl border border-zinc-900 overflow-hidden relative group">
          {scrcpyError && (
            <div className="absolute top-4 left-4 right-4 p-3 bg-red-950/80 border border-red-500/30 rounded-xl flex items-start gap-2.5 text-sm text-red-200 z-10 animate-bounce">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-red-400">连接错误</p>
                <p className="text-xs opacity-90 mt-0.5 break-all">{scrcpyError}</p>
              </div>
            </div>
          )}

          {!activeSerial && (
            <div className="flex flex-col items-center justify-center p-8 max-w-sm text-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-blue-500/10 rounded-full blur-3xl animate-pulse-slow"></div>
                <div className="w-16 h-16 rounded-2xl border border-zinc-800 bg-zinc-900 flex items-center justify-center text-zinc-400 shadow-xl relative z-10">
                  <Smartphone className="w-8 h-8" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-zinc-100">未连接 Android 设备</h3>
              <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
                选择一台已授权的设备开始投流。请点击下方按钮选择或从左上角下拉菜单选择。
              </p>
              <button
                onClick={() => setDeviceDropdownOpen(true)}
                className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold shadow-lg transition-colors text-sm"
              >
                <Smartphone className="w-4 h-4 text-zinc-950" />
                <span>选择设备</span>
              </button>
            </div>
          )}

          <div className={`relative max-h-full max-w-full flex items-center justify-center ${!activeSerial ? 'hidden' : ''}`}>
            <canvas
              ref={canvasRef}
              onMouseDown={(e) => handleCanvasMouseEvent(e, 0)}
              onMouseMove={(e) => { if (e.buttons > 0) handleCanvasMouseEvent(e, 2); }}
              onMouseUp={(e) => handleCanvasMouseEvent(e, 1)}
              className="max-w-full max-h-[75vh] shadow-2xl rounded-lg border border-zinc-800 cursor-crosshair object-contain bg-black"
            />
            
            {/* Floating Camera icon on Canvas hover */}
            <div className="absolute top-4 right-4 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button 
                onClick={handleTakeScreenshot}
                title="屏幕截图"
                className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-100 text-zinc-400 transition-colors"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Custom Android Navigation Control Bar */}
        {activeSerial && (
          <div className="mt-4 flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800/80 z-10 shrink-0">
            {/* Resolution Left */}
            <span className="text-xxs font-semibold text-zinc-500">
              {videoWidthRef.current > 0 ? `分辨率 ${videoWidthRef.current}x${videoHeightRef.current}` : '分辨率 -'}
            </span>

            {/* Navigation Keys Middle */}
            <div className="flex items-center gap-8">
              <button 
                onClick={() => executeSystemKey('BACK')}
                title="返回"
                className="flex items-center justify-center w-8 h-8 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all active:scale-90"
              >
                {/* ◀ shape back */}
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => executeSystemKey('HOME')}
                title="主页"
                className="flex items-center justify-center w-8 h-8 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all active:scale-90"
              >
                {/* ● shape home */}
                <Circle className="w-4 h-4 fill-zinc-400 hover:fill-zinc-200 text-transparent" />
              </button>
              <button 
                onClick={() => executeSystemKey('APP_SWITCH')}
                title="最近应用"
                className="flex items-center justify-center w-8 h-8 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all active:scale-90"
              >
                {/* ■ shape app switcher */}
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Frame rate Right */}
            <span className="text-xxs font-semibold text-zinc-500">
              帧率 60fps
            </span>
          </div>
        )}
      </div>

      {/* RIGHT PANEL: Integrated Unified Workspace (Vision Agent + Gemini Live Call) */}
      <div className="flex flex-col flex-[2] bg-zinc-950 p-4 h-full min-w-[380px] max-w-[480px]">
        
        {/* Workspace header */}
        <div className="flex items-center gap-2 border-b border-zinc-900 pb-3 mb-4 shrink-0">
          <Sparkles className="w-4.5 h-4.5 text-blue-400" />
          <h2 className="text-sm font-extrabold text-zinc-100 tracking-wider">智能协作空间 (WORKSPACE)</h2>
          {geminiStatus === 'connected' && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-auto"></span>}
        </div>

        {/* 1. TOP WIDGET: Real-time Voice Call Controller */}
        <div className="mb-4 shrink-0">
          {geminiStatus === 'disconnected' || geminiStatus === 'error' ? (
            /* DISCONNECTED COMPACT BANNER */
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-900 bg-zinc-900/25">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center text-emerald-400">
                  <Mic className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-zinc-200">实时语音通话</span>
                  <span className="text-xxs text-zinc-500 mt-0.5">
                    {agentRunning ? 'Agent 运行中 - 拨入可实时接管' : '拨入开始音视频协同控制'}
                  </span>
                </div>
              </div>
              <button
                onClick={handleStartLiveCall}
                disabled={!activeSerial}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white font-bold text-xs shadow-md transition-all active:scale-95 shrink-0"
              >
                <Play className="w-3 h-3 fill-white" />
                <span>开启语音</span>
              </button>
            </div>
          ) : (
            /* CONNECTED SOUND WAVES AND PHONE OFF */
            <div className="bg-zinc-900/40 border border-zinc-900 rounded-xl p-3 flex items-center justify-between relative overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                <span className="text-xxs font-bold text-zinc-400 uppercase tracking-wider">
                  {geminiStatus === 'connecting' ? '连接中...' : '通话中'}
                </span>
              </div>

              {/* Sound Wave bars */}
              <div className="h-8 flex items-end justify-center gap-1 w-32 shrink-0">
                {waveBars.map((height, i) => (
                  <div 
                    key={i} 
                    style={{ height: `${height}%` }}
                    className="w-1 bg-emerald-500 rounded-full transition-all duration-100 wave-bar shrink-0"
                  />
                ))}
              </div>

              <button
                onClick={handleStopLiveCall}
                className="flex items-center gap-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 px-3 py-1.5 rounded-lg shadow-md transition-all active:scale-95 shrink-0"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>挂断</span>
              </button>
            </div>
          )}
        </div>

        {/* 2. MIDDLE SECTION: Unified Chronological Log Feed */}
        <div className="flex-1 overflow-y-auto bg-zinc-900/10 border border-zinc-900/60 rounded-2xl p-4 mb-4 space-y-3 min-h-[250px]">
          {unifiedLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <Bot className="w-12 h-12 text-zinc-600 mb-3" />
              <p className="text-sm font-bold text-zinc-400">等待接收任务指令</p>
              <p className="text-xs text-zinc-600 mt-1">在下方输入框描述你的任务目标并运行</p>
            </div>
          ) : (
            unifiedLogs.map((log, index) => {
              // Decide if it is a Chat/Speech bubble or an Agent thought/action card
              const isUserSpeech = log.message.startsWith('You:');
              const isGeminiSpeech = log.message.startsWith('Gemini:');

              if (isUserSpeech || isGeminiSpeech) {
                const displayText = log.message.replace(/^(Gemini:|You:)/, '').trim();
                return (
                  <div 
                    key={index} 
                    className={`flex ${isGeminiSpeech ? 'justify-start' : 'justify-end'} animate-in fade-in duration-150`}
                  >
                    <div className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed ${
                      isGeminiSpeech 
                        ? 'bg-zinc-900 text-zinc-100 border border-zinc-800/40 rounded-tl-none' 
                        : 'bg-emerald-600 text-white rounded-tr-none font-semibold shadow-md'
                    }`}>
                      <p>{displayText}</p>
                      <span className="block text-[9px] text-zinc-500 text-right mt-1 font-mono opacity-60">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              }

              // Otherwise it's an Agent thought, action, or status log card
              let badgeColor = 'bg-zinc-800 text-zinc-400';
              let icon = <Cpu className="w-3.5 h-3.5" />;
              let cardBg = 'bg-zinc-900/50 border-zinc-800/40';
              let textColor = 'text-zinc-300';

              if (log.type === 'thought') {
                badgeColor = 'bg-blue-500/10 text-blue-400 border border-blue-500/10';
                icon = <Sparkles className="w-3.5 h-3.5" />;
                cardBg = 'bg-blue-500/[0.02] border-blue-500/10';
                textColor = 'text-blue-200';
              } else if (log.type === 'action') {
                badgeColor = 'bg-amber-500/10 text-amber-400 border border-amber-500/10';
                icon = <Play className="w-3.5 h-3.5" />;
                cardBg = 'bg-amber-500/[0.02] border-amber-500/10';
                textColor = 'text-amber-200';
              } else if (log.type === 'status') {
                badgeColor = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10';
                icon = <Check className="w-3.5 h-3.5" />;
                cardBg = 'bg-emerald-500/[0.02] border-emerald-500/10';
                textColor = 'text-emerald-200';
              }

              return (
                <div 
                  key={index}
                  className={`p-3 rounded-xl border ${cardBg} space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`flex items-center gap-1 text-xxs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeColor}`}>
                      {icon}
                      {log.type}
                    </span>
                    <span className="text-xxs text-zinc-600 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <p className={`text-xs leading-relaxed font-sans ${textColor}`}>
                    {log.message}
                  </p>
                </div>
              );
            })
          )}
          <div ref={unifiedLogEndRef} />
        </div>

        {/* 3. BOTTOM PANEL: Controls & Input Panel */}
        <div className="space-y-4 shrink-0 bg-zinc-900/30 p-3 rounded-2xl border border-zinc-900">
          {/* Task / Chat Text input */}
          <div className="relative">
            {geminiStatus === 'connected' ? (
              /* If live voice call is connected, show text chat input to Gemini */
              <div className="flex items-center gap-2 p-1.5 rounded-xl bg-zinc-950 border border-zinc-800">
                <input
                  type="text"
                  value={geminiChatInput}
                  onChange={(e) => setGeminiChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendLiveChatText(); }}
                  placeholder="发送文本指令给实时语音助手..."
                  className="flex-1 bg-transparent border-none focus:outline-none text-xs text-zinc-100 placeholder:text-zinc-600 px-2 py-2"
                />
                <button
                  onClick={handleSendLiveChatText}
                  disabled={!geminiChatInput.trim()}
                  className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow disabled:opacity-30 transition-all shrink-0 active:scale-95"
                >
                  <Send className="w-3.5 h-3.5 fill-white text-transparent" />
                </button>
              </div>
            ) : (
              /* Otherwise, show main Agent task textarea */
              <>
                <textarea
                  value={agentInput}
                  onChange={(e) => setAgentInput(e.target.value)}
                  placeholder="给 Agent 发送指令... (例如：打开浏览器搜索最新AI新闻)"
                  disabled={agentRunning || !activeSerial}
                  className="w-full h-20 bg-zinc-950/80 border border-zinc-800 focus:border-zinc-700 rounded-xl p-3 text-xs leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:outline-none resize-none disabled:opacity-50 transition-colors"
                />
                
                {/* Run / Stop buttons */}
                <div className="absolute bottom-3 right-3">
                  {!agentRunning ? (
                    <button
                      onClick={handleStartAgent}
                      disabled={!agentInput.trim() || !activeSerial}
                      className="flex items-center justify-center p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all disabled:opacity-30 active:scale-95"
                      title="发送任务指令"
                    >
                      <Send className="w-3.5 h-3.5 fill-white text-transparent" />
                    </button>
                  ) : (
                    <button
                      onClick={handleGlobalStop}
                      className="flex items-center justify-center p-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow transition-all active:scale-95 animate-pulse"
                      title="紧急停止 Agent 与通话"
                    >
                      <Square className="w-3.5 h-3.5 fill-white text-transparent" />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Initial entry point rendering
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
