import React from 'react';
import { Send, Square, PhoneOff, Loader2, MicOff, Play, Power, HelpCircle, Sparkles, X } from 'lucide-react';
import type { ConnectionStatus } from '../services/gemini-live-service';

interface VoiceCapsuleProps {
  geminiStatus: ConnectionStatus;
  textOnlyMode: boolean;
  waveBars: number[];
  handleStopLiveCall: () => void;
}

const VoiceCapsule: React.FC<VoiceCapsuleProps> = ({ 
  geminiStatus, 
  textOnlyMode, 
  waveBars, 
  handleStopLiveCall 
}) => {
  return (
    <div className="flex items-center gap-3 px-3.5 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-500/20 rounded-xl h-10 shadow-lg dark:shadow-none shrink-0">
      {geminiStatus === 'connecting' ? (
        <>
          <Loader2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-spin" />
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">连接中...</span>
        </>
      ) : textOnlyMode ? (
        <>
          <MicOff className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">已静音</span>
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          <div className="h-4 flex items-center gap-0.5 w-12 shrink-0">
            {waveBars.map((height, i) => (
              <div 
                key={i} 
                style={{ height: `${height}%` }} 
                className="w-0.5 bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-100" 
              />
            ))}
          </div>
        </>
      )}
      <div className="w-[1px] h-4 bg-zinc-200 dark:bg-emerald-500/20 mx-0.5" />
      <button 
        onClick={handleStopLiveCall} 
        className="text-rose-600 dark:text-rose-400 hover:text-rose-500 transition-colors cursor-pointer"
        title="挂断通话"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

interface ControlPanelProps {
  geminiStatus: ConnectionStatus;
  geminiChatInput: string;
  setGeminiChatInput: (val: string) => void;
  handleSendLiveChatText: () => void;
  agentInput: string;
  setAgentInput: (val: string) => void;
  agentRunning: boolean;
  activeSerial: string | null;
  handleStartAgent: () => void;
  handleGlobalStop: () => void;
  waveBars: number[];
  handleStartLiveCall: () => void;
  handleStopLiveCall: () => void;
  textOnlyMode: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  geminiStatus,
  geminiChatInput,
  setGeminiChatInput,
  handleSendLiveChatText,
  agentInput,
  setAgentInput,
  agentRunning,
  activeSerial,
  handleStartAgent,
  handleGlobalStop,
  waveBars,
  handleStartLiveCall,
  handleStopLiveCall,
  textOnlyMode,
}) => {
  const isConnected = geminiStatus === 'connected';
  const isConnecting = geminiStatus === 'connecting';
  const isCallActive = isConnected || isConnecting;

  const inputValue = isCallActive ? geminiChatInput : agentInput;
  const setInputValue = isCallActive ? setGeminiChatInput : setAgentInput;
  const placeholderText = isConnecting
    ? "正在建立连接，请稍候..."
    : isConnected
      ? "发送文本指令给实时语音助手..."
      : "给 Agent 发送指令...";

  const handleSend = () => {
    if (isCallActive) {
      handleSendLiveChatText();
    } else {
      handleStartAgent();
    }
  };

  // 1. Determine if button should act as a Stop button
  const isStopButton = !isCallActive && agentRunning;

  // 2. Compute disabled state based on role
  const isSendDisabled = isConnecting || !inputValue.trim() || (!isCallActive && !activeSerial);
  const isButtonDisabled = isStopButton ? false : isSendDisabled;

  // 3. Unified click handler
  const onButtonClick = () => {
    if (isStopButton) {
      handleGlobalStop();
    } else {
      handleSend();
    }
  };

  return (
    <div className="shrink-0">
      <div className="relative">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholderText}
          disabled={isConnecting || (!isCallActive && (agentRunning || !activeSerial))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!isButtonDisabled) {
                onButtonClick();
              }
            }
          }}
          className="block w-full h-28 bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-2xl p-4 pr-[160px] text-xs leading-relaxed text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none resize-none disabled:opacity-50 transition-colors dark:shadow-none m-0"
        />
        
        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          {/* 🛠️ 调试用语音胶囊 (预览/样式调整用，确认后可删除) */}
          {!isCallActive && (
            <div className="border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl p-0.5 flex items-center gap-1.5 bg-zinc-100/10 dark:bg-zinc-900/10">
              <span className="text-[9px] text-zinc-400 dark:text-zinc-600 font-black tracking-tight select-none px-1 uppercase">调试预览:</span>
              <VoiceCapsule 
                geminiStatus="connected" 
                textOnlyMode={false} 
                waveBars={[30, 80, 50, 90, 40]} 
                handleStopLiveCall={() => alert('DEBUG: 点击了挂断')} 
              />
            </div>
          )}

          {isCallActive ? (
            <VoiceCapsule 
              geminiStatus={geminiStatus}
              textOnlyMode={textOnlyMode}
              waveBars={waveBars} 
              handleStopLiveCall={handleStopLiveCall} 
            />
          ) : (
            <div className="relative group">
              <button
                onClick={handleStartLiveCall}
                disabled={!activeSerial}
                className="flex items-center justify-center p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-emerald-600 dark:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all active:scale-95 disabled:opacity-30 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
              </button>
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-zinc-900 dark:bg-zinc-800 text-zinc-100 dark:text-zinc-200 text-xxs font-semibold rounded-lg shadow-xl border border-zinc-200/10 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 scale-95 group-hover:scale-100">
                开启 Gemini 语音通话
              </div>
            </div>
          )}

          <div className="relative group">
            <button
              onClick={onButtonClick}
              disabled={isButtonDisabled}
              className={`flex items-center justify-center p-3 rounded-xl transition-all disabled:opacity-30 active:scale-95 cursor-pointer ${
                isStopButton 
                  ? "bg-rose-600 hover:bg-rose-500 text-white animate-pulse" 
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow"
              }`}
            >
              {isStopButton ? (
                <Power className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
            </button>
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-zinc-900 dark:bg-zinc-800 text-zinc-100 dark:text-zinc-200 text-xxs font-semibold rounded-lg shadow-xl border border-zinc-200/10 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 scale-95 group-hover:scale-100">
              {isStopButton ? "停止当前运行的 Agent" : (isCallActive ? "发送文本给语音助手" : "运行 Agent 任务指令 (Enter)")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
