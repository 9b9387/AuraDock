import './index.css';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

import { TitleBar } from './renderer/components/TitleBar';
import { DeviceSelector } from './renderer/components/DeviceSelector';
import { ScreenMirror } from './renderer/components/ScreenMirror';
import { NavigationBar } from './renderer/components/NavigationBar';
import { UnifiedLogs } from './renderer/components/UnifiedLogs';
import { ControlPanel } from './renderer/components/ControlPanel';
import { SettingsModal } from './renderer/components/SettingsModal';
import { MicCheckModal, MicErrorType } from './renderer/components/MicCheckModal';

import { 
  scrcpyAudioQueue, 
  audioMixer, 
  geminiVoicePlayer, 
  geminiLiveService,
  arrayBufferToBase64
} from './renderer/services/singletons';
import { VideoFramePush } from './renderer/services/video-frame-push';
import type { ConnectionStatus } from './renderer/services/gemini-live-service';
import type { AdbDeviceInfo } from './types';
import type { LogEntry } from './renderer/types';

export function App() {
  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light' | 'system') || 'system';
  });
  
  // App Settings State visibility
  const [showSettings, setShowSettings] = useState(false);

  // Microphone Check Modal States
  const [micCheckOpen, setMicCheckOpen] = useState(false);
  const [micErrorType, setMicErrorType] = useState<MicErrorType | null>(null);
  const [textOnlyMode, setTextOnlyMode] = useState(false);
  const textOnlyModeRef = useRef(false);

  const setTextOnlyModeSync = useCallback((val: boolean) => {
    textOnlyModeRef.current = val;
    setTextOnlyMode(val);
  }, []);
  
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
  const [waveBars, setWaveBars] = useState<number[]>(Array(24).fill(10));

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

  // Reconnection States
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectFailed, setReconnectFailed] = useState(false);

  const reconnectTimeoutIdRef = useRef<any>(null);
  const reconnectCheckTimeoutIdRef = useRef<any>(null);

  const scrcpyStatusRef = useRef(scrcpyStatus);
  useEffect(() => {
    scrcpyStatusRef.current = scrcpyStatus;
  }, [scrcpyStatus]);

  const activeSerialRef = useRef(activeSerial);
  useEffect(() => {
    activeSerialRef.current = activeSerial;
  }, [activeSerial]);

  const activeDeviceModelRef = useRef(activeDeviceModel);
  useEffect(() => {
    activeDeviceModelRef.current = activeDeviceModel;
  }, [activeDeviceModel]);

  const reconnectingRef = useRef(reconnecting);
  useEffect(() => {
    reconnectingRef.current = reconnecting;
  }, [reconnecting]);

  const reconnectFailedRef = useRef(reconnectFailed);
  useEffect(() => {
    reconnectFailedRef.current = reconnectFailed;
  }, [reconnectFailed]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutIdRef.current) clearTimeout(reconnectTimeoutIdRef.current);
      if (reconnectCheckTimeoutIdRef.current) clearTimeout(reconnectCheckTimeoutIdRef.current);
    };
  }, []);

  // Circular dependency resolver
  const startScrcpyRef = useRef<any>(null);

  // Reconnection Attempt Function
  const attemptReconnection = useCallback((attempt: number, serial: string, modelName: string | null) => {
    if (attempt > 3) {
      console.error('[Renderer] Auto-reconnection failed after 3 attempts.');
      setReconnecting(false);
      setReconnectFailed(true);
      setReconnectAttempt(0);
      setScrcpyStatus('Connection Failed');
      setScrcpyError('自动重新连接失败。请检查物理连接后手动重试。');
      
      setAgentLogs((prev) => [
        ...prev,
        { type: 'status', message: '自动重新连接失败。请手动点击“重新连接”按钮。', timestamp: Date.now() }
      ]);
      return;
    }

    setReconnectAttempt(attempt);

    // Increase interval: Attempt 1 = 2s, Attempt 2 = 4s, Attempt 3 = 8s
    const delay = attempt === 1 ? 2000 : attempt === 2 ? 4000 : 8000;

    if (reconnectTimeoutIdRef.current) clearTimeout(reconnectTimeoutIdRef.current);
    if (reconnectCheckTimeoutIdRef.current) clearTimeout(reconnectCheckTimeoutIdRef.current);

    reconnectTimeoutIdRef.current = setTimeout(async () => {
      console.log(`[Renderer] Auto-reconnect executing attempt #${attempt}...`);
      
      let devicePresent = false;
      try {
        const devList = await (window as any).adb.getDevices();
        devicePresent = devList.some((d: any) => d.serial === serial);
      } catch (err) {
        console.error('[Renderer] Error polling devices during reconnect:', err);
      }

      if (devicePresent) {
        if (startScrcpyRef.current) {
          startScrcpyRef.current(serial, modelName || undefined);
        }
      } else {
        console.warn(`[Renderer] Attempt #${attempt}: Device ${serial} is not connected via USB. Skipping scrcpy request.`);
      }

      reconnectCheckTimeoutIdRef.current = setTimeout(() => {
        const currentStatus = scrcpyStatusRef.current;
        if (currentStatus.toLowerCase().includes('streaming')) {
          console.log('[Renderer] Auto-reconnection succeeded!');
          setReconnecting(false);
          setReconnectAttempt(0);
          setReconnectFailed(false);
          setAgentLogs((prev) => [
            ...prev,
            { type: 'status', message: '设备连接已成功恢复！', timestamp: Date.now() }
          ]);
        } else {
          console.warn(`[Renderer] Attempt #${attempt} did not establish stream (status: ${currentStatus}). Trying next...`);
          attemptReconnection(attempt + 1, serial, modelName);
        }
      }, 5000);

    }, delay);
  }, []);

  // Connection Lost Handler
  const handleDeviceDisconnection = useCallback((reason: string, errorMessage?: string) => {
    if (reconnectingRef.current || reconnectFailedRef.current) return;
    if (!activeSerialRef.current) return;

    console.warn(`[Renderer] Device connection lost due to ${reason}. Initiating auto-reconnect flow...`);
    
    // 1. If running an agent task, stop it and notify in logs
    if (agentRunningRef.current) {
      console.log('[Renderer] Stopping vision agent due to device disconnect');
      (window as any).adb.stopAgent();
      agentRunningRef.current = false;
      setAgentRunning(false);
      setAgentLogs((prev) => [
        ...prev,
        { type: 'status', message: '因与设备失去连接，任务中断。', timestamp: Date.now() }
      ]);
    }

    // 2. Set reconnecting states
    setReconnecting(true);
    setReconnectFailed(false);
    setReconnectAttempt(1);
    
    setAgentLogs((prev) => [
      ...prev,
      { type: 'status', message: `设备连接中断 (${errorMessage || '推流中断'})。正在尝试自动重新连接...`, timestamp: Date.now() }
    ]);

    // 3. Clear/disconnect current stream resources (keep activeSerial active so mirror view stays visible)
    geminiLiveService.disconnect();
    audioMixer.stop();
    geminiVoicePlayer.stop();
    scrcpyAudioQueue.clear();
    
    if (currentPortRef.current) {
      currentPortRef.current.close();
      currentPortRef.current = null;
    }
    if (decoderRef.current) {
      decoderRef.current.close();
      decoderRef.current = null;
    }
    videoWidthRef.current = 0;
    videoHeightRef.current = 0;

    // 4. Start reconnection attempts
    const serial = activeSerialRef.current;
    const modelName = activeDeviceModelRef.current;
    attemptReconnection(1, serial, modelName);
  }, [attemptReconnection]);

  // Manual Reconnection Handler
  const handleManualReconnect = useCallback(() => {
    if (!activeSerialRef.current) return;
    setReconnectFailed(false);
    setReconnecting(false);
    setReconnectAttempt(0);
    
    if (reconnectTimeoutIdRef.current) clearTimeout(reconnectTimeoutIdRef.current);
    if (reconnectCheckTimeoutIdRef.current) clearTimeout(reconnectCheckTimeoutIdRef.current);
    
    if (startScrcpyRef.current) {
      startScrcpyRef.current(activeSerialRef.current, activeDeviceModelRef.current || undefined);
    }
  }, []);

  // Load and refresh connected ADB devices
  const refreshDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const devList = await (window as any).adb.getDevices();
      setDevices(devList);

      // If active device is lost during polling
      if (activeSerialRef.current) {
        const stillConnected = devList.some((d: any) => d.serial === activeSerialRef.current);
        if (!stillConnected) {
          console.warn('[Renderer] Active device disconnected from system:', activeSerialRef.current);
          handleDeviceDisconnection('device-lost', '设备断开连接');
        }
      }
    } catch (err: any) {
      console.error('[Renderer] Error loading devices:', err);
    } finally {
      setLoadingDevices(false);
    }
  }, [handleDeviceDisconnection]);

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

  // Handle active stream waveform animation
  useEffect(() => {
    let animId: any;
    if (geminiStatus === 'connected') {
      if (textOnlyMode) {
        const updateWave = () => {
          setWaveBars(Array.from({ length: 24 }, () => Math.floor(Math.random() * 20) + 10));
          animId = setTimeout(updateWave, 150);
        };
        updateWave();
      } else {
        (audioMixer as any).setOnMicWave((bars: number[]) => {
          setWaveBars(bars);
        });
      }
    } else {
      setWaveBars(Array(24).fill(10));
    }
    return () => {
      clearTimeout(animId);
      if (typeof (audioMixer as any).setOnMicWave === 'function') {
        (audioMixer as any).setOnMicWave(null);
      }
    };
  }, [geminiStatus, textOnlyMode]);

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
            handleDeviceDisconnection('port-error', message.error);
          }
        };
        currentPortRef.current.start();
      }
    };

    window.addEventListener('message', onMessage);
    (window as any).adb.requestScrcpy(serial);
  }, [initDecoder, decodePacket]);

  useEffect(() => {
    startScrcpyRef.current = startScrcpy;
  }, [startScrcpy]);

  // Disconnect Scrcpy stream
  const disconnectScrcpy = useCallback(() => {
    // Clear reconnection states and timers
    if (reconnectTimeoutIdRef.current) clearTimeout(reconnectTimeoutIdRef.current);
    if (reconnectCheckTimeoutIdRef.current) clearTimeout(reconnectCheckTimeoutIdRef.current);
    reconnectTimeoutIdRef.current = null;
    reconnectCheckTimeoutIdRef.current = null;
    setReconnecting(false);
    setReconnectAttempt(0);
    setReconnectFailed(false);

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
        pressure: action === 1 ? 0 : 1,
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
      
      // Localize status log message into beautiful Chinese
      let statusChineseMessage = '';
      if (status === 'connecting') {
        statusChineseMessage = '🔍 正在尝试连接至 Gemini Live 语音服务器...';
      } else if (status === 'connected') {
        statusChineseMessage = '✅ 已成功连接到 Gemini Live。现在可以开始对话了！';
      } else if (status === 'disconnected') {
        statusChineseMessage = `📴 语音通话已断开 ${msg ? `(${msg})` : ''}`;
      } else if (status === 'error') {
        statusChineseMessage = `❌ 语音通话连接发生错误。请检查网络代理配置或 API 密钥是否有效。 ${msg ? `(${msg})` : ''}`;
      }

      setGeminiLogs((prev) => [
        ...prev,
        { type: 'status', message: statusChineseMessage, timestamp: Date.now() }
      ]);

      if (status === 'connected') {
        if (textOnlyModeRef.current) {
          // Bypassing audioMixer in text-only mode (we have no microphone)
          setGeminiLogs((prev) => [
            ...prev,
            { type: 'status', message: '💡 已开启文字对话模式（无麦克风输入，仅接收回复语音/文字）', timestamp: Date.now() }
          ]);
          geminiVoicePlayer.start();
        } else {
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
        }

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
  // Internal helper to actually initiate Gemini Live Call (normal or text-only)
  const startLiveCallInternal = useCallback(async (isTextOnly: boolean) => {
    console.log('[LiveCall] startLiveCallInternal called. isTextOnly =', isTextOnly);
    setTextOnlyModeSync(isTextOnly);
    setMicCheckOpen(false);

    try {
      console.log('[LiveCall] Fetching Gemini API Key...');
      const apiKey = await (window as any).adb.getGeminiApiKey();
      if (!apiKey) {
        console.error('[LiveCall] Gemini API Key is missing!');
        setGeminiLogs((prev) => [
          ...prev,
          { type: 'status', message: '⚠️ 未配置 GEMINI_API_KEY。已自动为您打开偏好设置，请在设置中填写您的 API 密钥并保存。', timestamp: Date.now() }
        ]);
        setShowSettings(true);
        return;
      }
      if (!activeSerial) {
        console.error('[LiveCall] No active device stream connected.');
        setGeminiLogs((prev) => [
          ...prev,
          { type: 'status', message: 'No active device stream connected. Please connect a device first.', timestamp: Date.now() }
        ]);
        return;
      }

      let systemInstruction: string | undefined = undefined;

      // If Vision Agent is running, pause it and inherit state
      if (agentRunningRef.current) {
        console.log('[LiveCall] Vision Agent is running, pausing and taking over state...');
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

      console.log('[LiveCall] Connecting via geminiLiveService.connect...');
      geminiLiveService.connect(apiKey, activeSerial, systemInstruction);
    } catch (err: any) {
      console.error('[LiveCall] startLiveCallInternal exception:', err);
      setGeminiLogs((prev) => [
        ...prev,
        { type: 'status', message: `Failed to fetch API key or initialize handover: ${err.message}`, timestamp: Date.now() }
      ]);
    }
  }, [activeSerial, setTextOnlyModeSync]);

  // Connect Gemini Live Call with step-by-step Microphone checks
  const handleStartLiveCall = useCallback(async () => {
    console.log('[LiveCall] handleStartLiveCall triggered!');
    try {
      console.log('[LiveCall] activeSerial:', activeSerial);
      if (!activeSerial) {
        console.warn('[LiveCall] Cannot start call because activeSerial is null/falsy.');
        setGeminiLogs((prev) => [
          ...prev,
          { type: 'status', message: 'No active device stream connected. Please connect a device first.', timestamp: Date.now() }
        ]);
        return;
      }

      setGeminiLogs((prev) => [
        ...prev,
        { type: 'status', message: '🔍 正在检查音频输入设备与权限...', timestamp: Date.now() }
      ]);

      // 1. Check for hardware microphone device presence
      console.log('[LiveCall] Step 1: Checking for hardware mic...');
      const devices = await navigator.mediaDevices.enumerateDevices();
      console.log('[LiveCall] Devices found:', devices);
      const hasMic = devices.some(device => device.kind === 'audioinput');
      console.log('[LiveCall] hasMic:', hasMic);
      if (!hasMic) {
        console.warn('[LiveCall] No microphone hardware device detected!');
        setGeminiLogs((prev) => [
          ...prev,
          { type: 'status', message: '⚠️ 未检测到任何麦克风硬件设备。', timestamp: Date.now() }
        ]);
        setMicErrorType('no-mic');
        setMicCheckOpen(true);
        return;
      }

      // 2. Check for microphone permission
      console.log('[LiveCall] Step 2: Checking mic permission...');
      const permStatus = await (window as any).adb.getMicrophoneStatus();
      console.log('[LiveCall] Microphone permission status from systemPreferences:', permStatus);
      if (permStatus === 'denied' || permStatus === 'restricted') {
        console.warn('[LiveCall] Microphone permission is denied or restricted by OS.');
        setGeminiLogs((prev) => [
          ...prev,
          { type: 'status', message: '⚠️ 麦克风权限已被系统拒绝。请在系统设置中授权。', timestamp: Date.now() }
        ]);
        setMicErrorType('permission-denied');
        setMicCheckOpen(true);
        return;
      }

      if (permStatus === 'not-determined') {
        console.log('[LiveCall] Microphone permission is not determined. Requesting permission...');
        setGeminiLogs((prev) => [
          ...prev,
          { type: 'status', message: '🎙️ 正在向系统请求麦克风访问权限...', timestamp: Date.now() }
        ]);
        const reqResult = await (window as any).adb.requestMicrophone();
        console.log('[LiveCall] requestMicrophone result:', reqResult);
        if (reqResult !== 'granted') {
          console.warn('[LiveCall] Microphone permission request was not granted.');
          setGeminiLogs((prev) => [
            ...prev,
            { type: 'status', message: '⚠️ 麦克风授权失败。', timestamp: Date.now() }
          ]);
          setMicErrorType('permission-denied');
          setMicCheckOpen(true);
          return;
        }
      }

      // 3. Check for microphone usability/availability
      console.log('[LiveCall] Step 3: Checking microphone usability with getUserMedia...');
      let micUsable = false;
      let checkStream: MediaStream | null = null;
      try {
        checkStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micUsable = true;
        console.log('[LiveCall] getUserMedia succeeded, microphone is usable.');
      } catch (err: any) {
        console.error('[LiveCall] [Mic Check] getUserMedia failed:', err);
      } finally {
        if (checkStream) {
          checkStream.getTracks().forEach(track => {
            console.log('[LiveCall] Stopping check stream track:', track.label);
            track.stop();
          });
        }
      }

      if (!micUsable) {
        console.warn('[LiveCall] Microphone device is not usable.');
        setGeminiLogs((prev) => [
          ...prev,
          { type: 'status', message: '⚠️ 麦克风设备不可用（可能被其他程序独占或发生驱动错误）。', timestamp: Date.now() }
        ]);
        setMicErrorType('unusable');
        setMicCheckOpen(true);
        return;
      }

      console.log('[LiveCall] Mic is ready.');
      setGeminiLogs((prev) => [
        ...prev,
        { type: 'status', message: '✅ 麦克风就绪。', timestamp: Date.now() }
      ]);

      // All checks passed! Proceed with normal voice connection
      console.log('[LiveCall] All mic checks passed. Calling startLiveCallInternal...');
      await startLiveCallInternal(false);
    } catch (err: any) {
      console.error('[LiveCall] handleStartLiveCall exception caught:', err);
      setGeminiLogs((prev) => [
        ...prev,
        { type: 'status', message: `检查麦克风时出错: ${err.message}`, timestamp: Date.now() }
      ]);
    }
  }, [activeSerial, startLiveCallInternal]);

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
      <TitleBar
        activeSerial={activeSerial}
        activeDeviceModel={activeDeviceModel}
        scrcpyStatus={scrcpyStatus}
        showWorkspace={showWorkspace}
        setShowWorkspace={setShowWorkspace}
        setShowSettings={setShowSettings}
        isMac={isMac}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 h-[calc(100vh-36px)] w-full overflow-hidden">
        
        {/* LEFT PANEL: Phone screen mirroring & canvas stream */}
        <div 
          className="flex flex-col flex-[3] border-r border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950 pt-4 px-4 h-full min-w-0 relative overflow-hidden transition-colors duration-200"
          style={{ paddingBottom: '12px', boxSizing: 'border-box' } as React.CSSProperties}
        >
          {/* Video Canvas Mirror Stream area */}
          <div ref={containerRef} className="flex-1 flex items-center justify-center bg-zinc-100/40 dark:bg-zinc-900/40 rounded-2xl border border-zinc-200 dark:border-zinc-900 overflow-hidden relative group transition-colors duration-200 tech-grid">
            {!activeSerial && (
              <DeviceSelector
                devices={devices}
                loadingDevices={loadingDevices}
                refreshDevices={refreshDevices}
                startScrcpy={startScrcpy}
              />
            )}

            <ScreenMirror
              canvasRef={canvasRef}
              activeSerial={activeSerial}
              scrcpyError={scrcpyError}
              scrcpyStatus={scrcpyStatus}
              handleCanvasMouseEvent={handleCanvasMouseEvent}
              reconnecting={reconnecting}
              reconnectAttempt={reconnectAttempt}
              reconnectFailed={reconnectFailed}
              onManualReconnect={handleManualReconnect}
              onCancelReconnect={disconnectScrcpy}
            />
          </div>

          {/* Custom Android Navigation Control Bar */}
          <NavigationBar
            activeSerial={activeSerial}
            executeSystemKey={executeSystemKey}
            handleTakeScreenshot={handleTakeScreenshot}
            disconnectScrcpy={disconnectScrcpy}
          />
        </div>

        {/* RIGHT PANEL: Integrated Unified Workspace (Vision Agent + Gemini Live Call) */}
        {showWorkspace && (
          <div 
            className="flex flex-col flex-[2] bg-zinc-50 dark:bg-zinc-950 pt-4 px-4 h-full min-w-[380px] max-w-[480px] overflow-hidden transition-colors duration-200"
            style={{ paddingBottom: '12px', boxSizing: 'border-box' } as React.CSSProperties}
          >
            {/* Workspace header */}
            <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-900 pb-3 mb-4 shrink-0">
              <span className="text-sm font-extrabold text-zinc-700 dark:text-zinc-100 tracking-wider">智能协作</span>
              {geminiStatus === 'connected' && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-auto"></span>}
            </div>

            {/* 1. MIDDLE SECTION: Unified Chronological Log Feed */}
            <UnifiedLogs
              unifiedLogs={unifiedLogs}
            />

            {/* 2. BOTTOM PANEL: Controls & Input Panel */}
            <ControlPanel
              geminiStatus={geminiStatus}
              geminiChatInput={geminiChatInput}
              setGeminiChatInput={setGeminiChatInput}
              handleSendLiveChatText={handleSendLiveChatText}
              agentInput={agentInput}
              setAgentInput={setAgentInput}
              agentRunning={agentRunning}
              activeSerial={activeSerial}
              handleStartAgent={handleStartAgent}
              handleGlobalStop={handleGlobalStop}
              waveBars={waveBars}
              handleStartLiveCall={handleStartLiveCall}
              handleStopLiveCall={handleStopLiveCall}
              textOnlyMode={textOnlyMode}
            />
          </div>
        )}
      </div>

      {/* Settings Modal Overlay */}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSettingsSaved={(newSettings) => {
            setTheme(newSettings.theme);
            geminiLiveService.setModel(newSettings.geminiLiveModel);
          }}
        />
      )}

      {/* Microphone Check Modal Overlay */}
      <MicCheckModal
        isOpen={micCheckOpen}
        onClose={() => setMicCheckOpen(false)}
        errorType={micErrorType}
        onOpenSettings={async () => {
          await (window as any).adb.openSystemSettings();
        }}
        onFallbackToText={() => {
          startLiveCallInternal(true);
        }}
      />
    </div>
  );
}

// Initial entry point rendering
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}