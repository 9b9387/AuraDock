import React from 'react';
import { Send, Square, Mic, PhoneOff } from 'lucide-react';
import type { ConnectionStatus } from '../services/gemini-live-service';

interface VoiceCapsuleProps {
  waveBars: number[];
  handleStopLiveCall: () => void;
}

const VoiceCapsule: React.FC<VoiceCapsuleProps> = ({ waveBars, handleStopLiveCall }) => {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/45 border border-emerald-200 dark:border-emerald-500/30 rounded-full h-8 shadow-lg shrink-0">
      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
      <div className="h-3 flex items-center gap-0.5 w-10 shrink-0">
        {waveBars.map((height, i) => (
          <div 
            key={i} 
            style={{ height: `${height}%` }} 
            className="w-0.5 bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all" 
          />
        ))}
      </div>
      <div className="w-[1px] h-3 bg-zinc-200 dark:bg-emerald-500/20 mx-0.5" />
      <button 
        onClick={handleStopLiveCall} 
        className="text-rose-600 dark:text-rose-400 hover:text-rose-500 cursor-pointer"
        title="挂断通话"
      >
        <PhoneOff className="w-3.5 h-3.5" />
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
}) => {
  const isConnected = geminiStatus === 'connected';
  const inputValue = isConnected ? geminiChatInput : agentInput;
  const setInputValue = isConnected ? setGeminiChatInput : setAgentInput;
  const placeholderText = isConnected 
    ? "发送文本指令给实时语音助手..." 
    : "给 Agent 发送指令... (例如：打开浏览器搜索最新AI新闻)";

  const handleSend = () => {
    if (isConnected) {
      handleSendLiveChatText();
    } else {
      handleStartAgent();
    }
  };

  // 1. Determine if button should act as a Stop button
  const isStopButton = !isConnected && agentRunning;

  // 2. Compute disabled state based on role
  const isSendDisabled = !inputValue.trim() || (!isConnected && !activeSerial);
  const isButtonDisabled = isStopButton ? false : isSendDisabled;

  // 3. Unified click handler
  const onButtonClick = (e: React.MouseEvent) => {
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
          disabled={!isConnected && (agentRunning || !activeSerial)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!isButtonDisabled) {
                onButtonClick(e as any);
              }
            }
          }}
          className="block w-full h-24 bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-2xl p-4 text-xs leading-relaxed text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none resize-none disabled:opacity-50 transition-colors dark:shadow-none m-0"
        />
        
        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          {isConnected ? (
            <VoiceCapsule waveBars={waveBars} handleStopLiveCall={handleStopLiveCall} />
          ) : (
            <button
              onClick={handleStartLiveCall}
              disabled={!activeSerial}
              className="flex items-center justify-center p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-emerald-600 dark:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all active:scale-95 disabled:opacity-30 cursor-pointer"
              title="开启实时语音通话"
            >
              <Mic className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={onButtonClick}
            disabled={isButtonDisabled}
            className={`flex items-center justify-center p-2.5 rounded-xl transition-all disabled:opacity-30 active:scale-95 cursor-pointer ${
              isStopButton 
                ? "bg-rose-600 hover:bg-rose-500 text-white animate-pulse" 
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow"
            }`}
            title={isStopButton ? "紧急停止 Agent" : (isConnected ? "发送文本" : "发送任务指令")}
          >
            {isStopButton ? (
              <Square className="w-3.5 h-3.5 fill-white text-transparent" />
            ) : (
              <Send className="w-3.5 h-3.5 fill-white text-transparent" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
