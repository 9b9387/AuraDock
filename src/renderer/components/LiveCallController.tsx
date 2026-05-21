import React from 'react';
import { Mic, Play, PhoneOff, MicOff } from 'lucide-react';
import type { ConnectionStatus } from '../services/gemini-live-service';

interface LiveCallControllerProps {
  activeSerial: string | null;
  geminiStatus: ConnectionStatus;
  waveBars: number[];
  handleStartLiveCall: () => void;
  handleStopLiveCall: () => void;
  textOnlyMode?: boolean;
}

export const LiveCallController: React.FC<LiveCallControllerProps> = ({
  activeSerial,
  geminiStatus,
  waveBars,
  handleStartLiveCall,
  handleStopLiveCall,
  textOnlyMode = false,
}) => {
  if (geminiStatus === 'disconnected' || geminiStatus === 'error') {
    return (
      <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-900/25 shadow-sm dark:shadow-none mb-4 shrink-0">
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
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-900 rounded-xl p-3 flex items-center justify-between relative overflow-hidden shadow-sm dark:shadow-none mb-4 shrink-0">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${textOnlyMode ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-ping'}`}></span>
        <span className="text-xxs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          {geminiStatus === 'connecting' ? '连接中...' : (textOnlyMode ? '文字通话中' : '通话中')}
        </span>
      </div>

      <div className="h-8 flex items-center justify-center gap-1 w-32 shrink-0">
        {textOnlyMode ? (
          <div className="flex items-center gap-1 text-zinc-400 dark:text-zinc-500 text-[10px] font-bold">
            <MicOff className="w-3.5 h-3.5" />
            <span>已禁用麦克风</span>
          </div>
        ) : (
          waveBars.map((height, i) => (
            <div 
              key={i} 
              style={{ height: `${height}%` }}
              className="w-1 bg-emerald-500 rounded-full transition-all duration-100 wave-bar shrink-0"
            />
          ))
        )}
      </div>

      <button
        onClick={handleStopLiveCall}
        className="flex items-center gap-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 px-3 py-1.5 rounded-lg shadow-md transition-all active:scale-95 shrink-0 cursor-pointer"
      >
        <PhoneOff className="w-3.5 h-3.5" />
        <span>挂断</span>
      </button>
    </div>
  );
};
