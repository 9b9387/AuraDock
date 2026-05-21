import './index.css';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Smartphone, Bot, Mic, RefreshCw, Send, Play, Square, 
  Camera, AlertCircle, Cpu, Sparkles, Check, 
  PhoneOff, List, Circle, ArrowLeft,
  MessageSquare, Settings, X, Shield,
  Languages, Key, Eye, EyeOff, Save, Link2Off
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
  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light' | 'system') || 'system';
  });
  
  // App Settings State
  const [settings, setSettings] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [localSettings, setLocalSettings] = useState<any>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  // Real OS-level Microphone permission state
  const [micPermissionStatus, setMicPermissionStatus] = useState<'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'>('unknown');
  
  // Agent Panel Show/Hide State
  const [showWorkspace, setShowWorkspace] = useState(true);

  // Device Selection & Connection State
  const [devices, setDevices] = useState<AdbDeviceInfo[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [activeSerial, setActiveSerial] = useState<string | null>(null);
  const [activeDeviceModel, setActiveDeviceModel] = useState<string | null>(null);
  const [scrcpyStatus, setScrcpyStatus] = useState<string>('Disconnected');
  const [scrcpyError, setScrcpyError] = useState<string | null>(null);

  // Load configuration from Electron on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await (window as any).adb.getSettings();
        if (res) {
          setSettings(res);
          setTheme(res.theme);
          geminiLiveService.setModel(res.geminiLiveModel);
        }
      } catch (e) {
        console.error('[Renderer] Error loading settings:', e);
      }
    };
    loadConfig();
  }, []);

  // Synchronize theme with local storage, document.documentElement, and Electron nativeTheme
  useEffect(() => {
    localStorage.setItem('theme', theme);

    const applyTheme = async () => {
      const res = await (window as any).adb.setTheme(theme);
      const isDark = res.isDark;

      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.add('light');
      }
    };

    applyTheme();
  }, [theme]);

  // Listen for native OS theme changes to keep Tailwind CSS in sync when theme is "system"
  useEffect(() => {
    const unsubscribe = (window as any).adb.onThemeUpdated((data: { isDark: boolean; themeSource: 'dark' | 'light' | 'system' }) => {
      if (theme === 'system') {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        if (data.isDark) {
          root.classList.add('dark');
        } else {
          root.classList.add('light');
        }
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [theme]);

  const fetchMicPermissionStatus = useCallback(async () => {
    try {
      const status = await (window as any).adb.getMicrophoneStatus();
      setMicPermissionStatus(status);
    } catch (err) {
      console.error('[Renderer] Error fetching microphone status:', err);
    }
  }, []);

  // Sync settings state to local state and fetch OS microphone status when modal opens
  useEffect(() => {
    if (showSettings && settings) {
      setLocalSettings(JSON.parse(JSON.stringify(settings)));
      fetchMicPermissionStatus();

      // Listen for window focus to refresh permission status when user returns from system settings
      const handleWindowFocus = () => {
        fetchMicPermissionStatus();
      };
      window.addEventListener('focus', handleWindowFocus);

      // Also set a polling interval when modal is open to refresh status automatically
      const intervalId = setInterval(() => {
        fetchMicPermissionStatus();
      }, 2000);

      return () => {
        window.removeEventListener('focus', handleWindowFocus);
        clearInterval(intervalId);
      };
    }
  }, [showSettings, settings, fetchMicPermissionStatus]);

  const handleRequestMicPermission = async () => {
    try {
      const status = await (window as any).adb.requestMicrophone();
      setMicPermissionStatus(status);
    } catch (err) {
      console.error('[Renderer] Error requesting microphone permission:', err);
    }
  };

  const handleOpenSystemSettings = async () => {
    try {
      await (window as any).adb.openSystemSettings();
    } catch (err) {
      console.error('[Renderer] Error opening system settings:', err);
    }
  };

  // Save Settings from modal securely to Electron config-manager
  const handleSaveSettings = async () => {
    if (!localSettings) return;
    setSaveStatus('saving');
    try {
      const res = await (window as any).adb.saveSettings(localSettings);
      if (res && res.success) {
        setSettings(res.settings);
        setTheme(res.settings.theme);
        
        // Dynamically notify geminiLiveService of its model choice
        geminiLiveService.setModel(res.settings.geminiLiveModel);

        setSaveStatus('saved');
        setTimeout(() => {
          setSaveStatus('idle');
          setShowSettings(false);
        }, 1000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (err) {
      console.error('[Renderer] Error saving settings:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

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
    };

    const handleScreenshotRequest = () => {
      if (!canvasRef.current) return;
      const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
      const base64 = dataUrl.split(',')[1];
      (window as any).adb.sendScreenshot(base64);
    };

    const unsubscribeStatus = (window as any).adb.onAgentStatusChange((status: { running: boolean }) => {
      console.log('[Renderer] Agent status changed:', status);
      setAgentRunning(status.running);
    });

    (window as any).adb.onAgentLog(handleLog);
    (window as any).adb.onScreenshotRequest(handleScreenshotRequest);

    return () => {
      if (unsubscribeStatus) unsubscribeStatus();
    };
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
  const isMac = navigator.userAgent.includes('Mac');

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white text-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 font-sans antialiased selection:bg-zinc-200 dark:selection:bg-zinc-800 transition-colors duration-200">
      
      {/* Custom Draggable Title Bar */}
      <div 
        className="flex items-center justify-between h-9 px-4 border-b bg-zinc-50 border-zinc-200 dark:bg-zinc-950 dark:border-zinc-900 shrink-0 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className={`flex items-center gap-2 ${isMac ? 'pl-20' : ''}`}>
          <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-500 animate-pulse-slow" />
          <span className="text-xs font-bold tracking-wider text-zinc-700 dark:text-zinc-300">Omni Agent</span>
        </div>
        
        {/* Centered Device & Streaming Status Info (no-drag) */}
        <div className="flex-1 h-full flex items-center justify-center">
          {activeSerial && (
            <div className="text-xs font-bold text-zinc-600 dark:text-zinc-400 tracking-wide flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>设备：{activeDeviceModel}</span>
              <span className="text-zinc-300 dark:text-zinc-700">|</span>
              <span className="text-emerald-600 dark:text-emerald-400">
                {scrcpyStatus.toLowerCase().includes('stream') 
                  ? '推流中' 
                  : scrcpyStatus.toLowerCase().includes('connect') 
                  ? '连接中' 
                  : scrcpyStatus}
              </span>
            </div>
          )}
        </div>

        {/* Action controls (No-drag) */}
        <div 
          className={`flex items-center gap-1.5 ${!isMac ? 'pr-[140px]' : ''}`}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Workspace Toggle Button */}
          <button
            onClick={() => setShowWorkspace(!showWorkspace)}
            className={`flex items-center justify-center p-1.5 rounded-lg transition-all active:scale-95 cursor-pointer ${
              showWorkspace 
                ? 'bg-zinc-100 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-500 hover:bg-zinc-200 dark:hover:bg-zinc-700/80' 
                : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-100'
            }`}
            title={showWorkspace ? "隐藏智能协作空间" : "显示智能协作空间"}
          >
            <MessageSquare className="w-4 h-4" />
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center justify-center p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 transition-all active:scale-95 cursor-pointer"
            title="偏好设置"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 h-[calc(100vh-36px)] w-full overflow-hidden">
        
        {/* LEFT PANEL: Phone screen mirroring & canvas stream */}
        <div 
          className="flex flex-col flex-[3] border-r border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950 pt-4 px-4 h-full min-w-0 relative overflow-hidden transition-colors duration-200"
          style={{ paddingBottom: '12px', boxSizing: 'border-box' } as React.CSSProperties}
        >
          

          {/* Video Canvas Mirror Stream area */}
          <div ref={containerRef} className="flex-1 flex items-center justify-center bg-zinc-100/40 dark:bg-zinc-900/40 rounded-2xl border border-zinc-200 dark:border-zinc-900 overflow-hidden relative group transition-colors duration-200">
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
              <div className="flex flex-col items-center justify-center p-8 w-full max-w-md text-center">
                <div className="relative mb-4">
                  <div className="absolute inset-0 bg-emerald-500/10 rounded-full blur-3xl animate-pulse-slow"></div>
                  <div className="w-14 h-16 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-zinc-400 dark:text-zinc-500 shadow-xl relative z-10">
                    <Smartphone className="w-8 h-8 text-emerald-600 dark:text-emerald-500" />
                  </div>
                </div>
                <h3 className="text-md font-bold text-zinc-800 dark:text-zinc-100 mb-1">Android 设备连接舱</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6 max-w-sm leading-relaxed">
                  检测到本地 ADB 授权设备。请选择一台设备并连接开始智能协同投流控制。
                </p>

                {/* Device List Box */}
                <div className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-900">
                    <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">可用设备列表 ({devices.length})</span>
                    <button 
                      onClick={refreshDevices}
                      disabled={loadingDevices}
                      className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors disabled:opacity-50 cursor-pointer"
                      title="刷新设备列表"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingDevices ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  <div className="p-3 max-h-56 overflow-y-auto space-y-2 text-left">
                    {devices.length === 0 ? (
                      <div className="py-8 flex flex-col items-center justify-center text-center">
                        <AlertCircle className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mb-2" />
                        <p className="text-xs text-zinc-400 dark:text-zinc-600">未发现可用设备</p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-1 max-w-[280px] text-center">
                          请确保已开启手机的“USB调试”模式，并使用数据线稳定连接电脑。
                        </p>
                      </div>
                    ) : (
                      devices.map((device) => {
                        const serial = device.serial || (device as any).id;
                        return (
                          <div 
                            key={serial} 
                            className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-900 hover:border-zinc-200 dark:hover:border-zinc-800 transition-all"
                          >
                            <div className="flex flex-col min-w-0 pr-2">
                              <span className="text-xs font-bold truncate text-zinc-800 dark:text-zinc-100">
                                {device.model || '未知安卓设备'}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500 truncate mt-0.5">
                                {serial}
                              </span>
                            </div>
                            <button
                              onClick={() => startScrcpy(serial, device.model)}
                              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all active:scale-95 cursor-pointer shrink-0"
                            >
                              连接
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className={`relative max-h-full max-w-full flex items-center justify-center ${!activeSerial ? 'hidden' : ''}`}>
              <canvas
                ref={canvasRef}
                onMouseDown={(e) => handleCanvasMouseEvent(e, 0)}
                onMouseMove={(e) => { if (e.buttons > 0) handleCanvasMouseEvent(e, 2); }}
                onMouseUp={(e) => handleCanvasMouseEvent(e, 1)}
                className="max-w-full max-h-[75vh] shadow-2xl rounded-lg border border-zinc-200 dark:border-zinc-800 cursor-crosshair object-contain bg-black"
              />
            </div>
          </div>

          {/* Custom Android Navigation Control Bar */}
          {activeSerial && (
            <div className="mt-4 flex items-center justify-between px-4 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 z-10 shrink-0 transition-colors duration-200">
              {/* Left Slot: Placeholder / Balanced Space */}
              <div className="w-20" />

              {/* Navigation Keys Middle */}
              <div className="flex items-center gap-8">
                <button 
                  onClick={() => executeSystemKey('BACK')}
                  title="返回"
                  className="flex items-center justify-center w-8 h-8 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all active:scale-90 cursor-pointer"
                >
                  {/* ◀ shape back */}
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => executeSystemKey('HOME')}
                  title="主页"
                  className="flex items-center justify-center w-8 h-8 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all active:scale-90 cursor-pointer"
                >
                  {/* ● shape home */}
                  <Circle className="w-4 h-4 fill-zinc-500 dark:fill-zinc-400 hover:fill-zinc-800 dark:hover:fill-zinc-200 text-transparent" />
                </button>
                <button 
                  onClick={() => executeSystemKey('APP_SWITCH')}
                  title="最近应用"
                  className="flex items-center justify-center w-8 h-8 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all active:scale-90 cursor-pointer"
                >
                  {/* ■ shape app switcher */}
                  <List className="w-4 h-4" />
                </button>
              </div>

              {/* Combined Controls on the Right (Screenshot + Disconnect with Icons) */}
              <div className="w-20 flex justify-end items-center gap-2">
                <button 
                  onClick={handleTakeScreenshot}
                  title="屏幕截图"
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <button 
                  onClick={disconnectScrcpy}
                  title="断开手机连接"
                  className="flex items-center justify-center w-7 h-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-100/60 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                >
                  <Link2Off className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Integrated Unified Workspace (Vision Agent + Gemini Live Call) */}
        {showWorkspace && (
          <div 
            className="flex flex-col flex-[2] bg-zinc-50 dark:bg-zinc-950 pt-4 px-4 h-full min-w-[380px] max-w-[480px] overflow-hidden transition-colors duration-200"
            style={{ paddingBottom: '12px', boxSizing: 'border-box' } as React.CSSProperties}
          >
            
            {/* Workspace header */}
            <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-900 pb-3 mb-4 shrink-0">
              <Sparkles className="w-4.5 h-4.5 text-blue-400" />
              <h2 className="text-sm font-extrabold text-zinc-700 dark:text-zinc-100 tracking-wider">智能协作</h2>
              {geminiStatus === 'connected' && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-auto"></span>}
            </div>

            {/* 1. TOP WIDGET: Real-time Voice Call Controller */}
            <div className="mb-4 shrink-0">
              {geminiStatus === 'disconnected' || geminiStatus === 'error' ? (
                /* DISCONNECTED COMPACT BANNER */
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-900/25 shadow-sm dark:shadow-none">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                      <Mic className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">实时语音通话</span>
                      <span className="text-xxs text-zinc-500 dark:text-zinc-500 mt-0.5">
                        连接语音助手
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleStartLiveCall}
                    disabled={!activeSerial}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white font-bold text-xs shadow-md transition-all active:scale-95 shrink-0 cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-white" />
                    <span>开启语音</span>
                  </button>
                </div>
              ) : (
                /* CONNECTED SOUND WAVES AND PHONE OFF */
                <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-900 rounded-xl p-3 flex items-center justify-between relative overflow-hidden shadow-sm dark:shadow-none">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                    <span className="text-xxs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
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
                    className="flex items-center gap-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 px-3 py-1.5 rounded-lg shadow-md transition-all active:scale-95 shrink-0 cursor-pointer"
                  >
                    <PhoneOff className="w-3.5 h-3.5" />
                    <span>挂断</span>
                  </button>
                </div>
              )}
            </div>

            {/* 2. MIDDLE SECTION: Unified Chronological Log Feed */}
            <div className="flex-1 overflow-y-auto bg-white dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-900/60 rounded-2xl p-4 mb-4 space-y-3 min-h-[250px] shadow-inner">
              {unifiedLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6">
                  <Bot className="w-12 h-12 text-zinc-400 dark:text-zinc-600 mb-3" />
                  <p className="text-sm font-bold text-zinc-500 dark:text-zinc-400">等待接收任务指令</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">在下方输入框描述你的任务目标并运行</p>
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
                            ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800/40 rounded-tl-none' 
                            : 'bg-emerald-600 text-white rounded-tr-none font-semibold shadow-md'
                        }`}>
                          <p>{displayText}</p>
                          <span className="block text-[9px] text-zinc-400 dark:text-zinc-500 text-right mt-1 font-mono opacity-60">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  // Otherwise it's an Agent thought, action, or status log card
                  let badgeColor = 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400';
                  let icon = <Cpu className="w-3.5 h-3.5" />;
                  let cardBg = 'bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800/40';
                  let textColor = 'text-zinc-700 dark:text-zinc-300';

                  if (log.type === 'thought') {
                    badgeColor = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10';
                    icon = <Sparkles className="w-3.5 h-3.5" />;
                    cardBg = 'bg-blue-500/[0.02] border-blue-500/10';
                    textColor = 'text-blue-800 dark:text-blue-200';
                  } else if (log.type === 'action') {
                    badgeColor = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/10';
                    icon = <Play className="w-3.5 h-3.5" />;
                    cardBg = 'bg-amber-500/[0.02] border-amber-500/10';
                    textColor = 'text-amber-800 dark:text-amber-200';
                  } else if (log.type === 'status') {
                    badgeColor = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10';
                    icon = <Check className="w-3.5 h-3.5" />;
                    cardBg = 'bg-emerald-500/[0.02] border-emerald-500/10';
                    textColor = 'text-emerald-800 dark:text-emerald-200';
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
                        <span className="text-xxs text-zinc-400 dark:text-zinc-600 font-mono">
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
            <div className="shrink-0">
              {/* Task / Chat Text input */}
              <div className="relative">
                {geminiStatus === 'connected' ? (
                  /* If live voice call is connected, show text chat input to Gemini */
                  <div className="flex items-center gap-2 p-2 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                    <input
                      type="text"
                      value={geminiChatInput}
                      onChange={(e) => setGeminiChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSendLiveChatText(); }}
                      placeholder="发送文本指令给实时语音助手..."
                      className="flex-1 bg-transparent border-none focus:outline-none text-xs text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 px-3 py-3"
                    />
                    <button
                      onClick={handleSendLiveChatText}
                      disabled={!geminiChatInput.trim()}
                      className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow disabled:opacity-30 transition-all shrink-0 active:scale-95 cursor-pointer mr-1"
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
                      className="block w-full h-24 bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-2xl p-4 text-xs leading-relaxed text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none resize-none disabled:opacity-50 transition-colors dark:shadow-none m-0"
                    />
                    
                    {/* Run / Stop buttons */}
                    <div className="absolute bottom-4 right-4">
                      {!agentRunning ? (
                        <button
                          onClick={handleStartAgent}
                          disabled={!agentInput.trim() || !activeSerial}
                          className="flex items-center justify-center p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all disabled:opacity-30 active:scale-95 cursor-pointer"
                          title="发送任务指令"
                        >
                          <Send className="w-3.5 h-3.5 fill-white text-transparent" />
                        </button>
                      ) : (
                        <button
                          onClick={handleGlobalStop}
                          className="flex items-center justify-center p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow transition-all active:scale-95 animate-pulse cursor-pointer"
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
        )}
      </div>

      {/* Settings Modal Overlay */}
      {showSettings && localSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-zinc-800 dark:text-zinc-100 animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Settings className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-500 animate-spin-slow" />
                <h3 className="font-bold text-sm tracking-wide">偏好设置 (PREFERENCES)</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Section 1: API & Model */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold text-zinc-400 dark:text-zinc-500 tracking-wider uppercase flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-800 pb-1.5">
                  <Key className="w-3.5 h-3.5" />
                  <span>API 与模型配置 (GEMINI API)</span>
                </h4>
                
                {/* Gemini API Key */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">Gemini 密钥</label>
                  <div className="relative flex items-center">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={localSettings.geminiApiKey || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, geminiApiKey: e.target.value })}
                      placeholder="输入您的 Gemini API 密钥..."
                      className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl px-3 py-2.5 pr-10 focus:outline-none transition-colors text-zinc-800 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                    >
                      {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    * 秘钥保存在本地安全的 UserData 路径，仅用于调用官方 Gemini Live 与 ADK Agent 服务。
                  </p>
                </div>

                {/* HTTP Proxy Configuration */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">HTTP 代理配置 (选填)</label>
                  <input
                    type="text"
                    value={localSettings.proxy || ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, proxy: e.target.value })}
                    placeholder="例如: http://127.0.0.1:7890 (不填则默认使用系统/环境变量代理)"
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl px-3 py-2.5 focus:outline-none transition-colors text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                  />
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    * 在中国大陆地区，设置本地代理服务器可确保稳定连接 Google Gemini。修改代理后，建议重启应用完全生效。
                  </p>
                </div>

                {/* Models Configuration */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">实时语音模型 (Live Call)</label>
                    <select
                      value={localSettings.geminiLiveModel || 'models/gemini-3.1-flash-live-preview'}
                      onChange={(e) => setLocalSettings({ ...localSettings, geminiLiveModel: e.target.value })}
                      className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors cursor-pointer text-zinc-800 dark:text-zinc-100"
                    >
                      <option value="models/gemini-3.1-flash-live-preview">gemini-3.1-flash-live-preview</option>
                      <option value="models/gemini-2.0-flash-exp">gemini-2.0-flash-exp</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">智能体模型 (Vision Agent)</label>
                    <select
                      value={localSettings.visionAgentModel || 'gemini-3-flash-preview'}
                      onChange={(e) => setLocalSettings({ ...localSettings, visionAgentModel: e.target.value })}
                      className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors cursor-pointer text-zinc-800 dark:text-zinc-100"
                    >
                      <option value="gemini-3-flash-preview">gemini-3-flash-preview</option>
                      <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                      <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Appearance & Lang */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold text-zinc-400 dark:text-zinc-500 tracking-wider uppercase flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-800 pb-1.5">
                  <Languages className="w-3.5 h-3.5" />
                  <span>常规与显示</span>
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  {/* Theme */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">系统主题</label>
                    <select
                      value={localSettings.theme || 'system'}
                      onChange={(e) => setLocalSettings({ ...localSettings, theme: e.target.value as any })}
                      className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors cursor-pointer text-zinc-800 dark:text-zinc-100"
                    >
                      <option value="light">浅色模式</option>
                      <option value="dark">深色模式</option>
                      <option value="system">系统默认</option>
                    </select>
                  </div>
                  {/* Language */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">界面语言</label>
                    <select
                      value={localSettings.language || 'zh'}
                      onChange={(e) => setLocalSettings({ ...localSettings, language: e.target.value as any })}
                      className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors cursor-pointer text-zinc-800 dark:text-zinc-100"
                    >
                      <option value="zh">简体中文</option>
                      <option value="en">English (暂未支持)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 3: Permissions */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold text-zinc-400 dark:text-zinc-500 tracking-wider uppercase flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-800 pb-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  <span>系统安全与权限</span>
                </h4>

                <div className="space-y-3">
                  {/* Microphone Permission Info */}
                  <div className="flex items-center justify-between p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-900 rounded-xl">
                    <div className="flex flex-col min-w-0 pr-3">
                      <span className="text-xs font-bold">麦克风权限</span>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 leading-relaxed">
                        允许 App 访问系统麦克风。此权限为实时双向语音通话的必需权限。
                      </span>
                    </div>

                    <div className="shrink-0">
                      {/* Authorized state */}
                      {micPermissionStatus === 'granted' && (
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                          已授权
                        </span>
                      )}

                      {/* Not determined state (Never asked before) */}
                      {micPermissionStatus === 'not-determined' && (
                        <button
                          onClick={handleRequestMicPermission}
                          className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
                        >
                          请求授权
                        </button>
                      )}

                      {/* Denied or Restricted state */}
                      {(micPermissionStatus === 'denied' || micPermissionStatus === 'restricted') && (
                        <button
                          onClick={handleOpenSystemSettings}
                          className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
                        >
                          去授权
                        </button>
                      )}

                      {/* Unknown state fallback */}
                      {micPermissionStatus === 'unknown' && (
                        <button
                          onClick={handleOpenSystemSettings}
                          className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
                        >
                          去授权
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 shrink-0">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={saveStatus === 'saving'}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-md transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                {saveStatus === 'saving' && '正在保存...'}
                {saveStatus === 'saved' && '保存成功 ✓'}
                {saveStatus === 'error' && '保存失败 ✗'}
                {saveStatus === 'idle' && '保存设置'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Initial entry point rendering
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
