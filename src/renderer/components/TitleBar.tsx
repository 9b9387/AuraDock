import React from 'react';
import { Bot, MessageSquare, Settings } from 'lucide-react';

interface TitleBarProps {
  activeSerial: string | null;
  activeDeviceModel: string | null;
  scrcpyStatus: string;
  showWorkspace: boolean;
  setShowWorkspace: (val: boolean) => void;
  setShowSettings: (val: boolean) => void;
  isMac: boolean;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  activeSerial,
  activeDeviceModel,
  scrcpyStatus,
  showWorkspace,
  setShowWorkspace,
  setShowSettings,
  isMac,
}) => {
  return (
    <div 
      className="flex items-center justify-between h-9 px-4 border-b bg-zinc-50 border-zinc-200 dark:bg-zinc-950 dark:border-zinc-900 shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className={`flex items-center gap-2 ${isMac ? 'pl-20' : ''}`}>
        <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-500 animate-pulse-slow" />
        <span className="text-xs font-bold tracking-wider text-zinc-700 dark:text-zinc-300">Omni Agent</span>
      </div>
      
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

      <div 
        className={`flex items-center gap-1.5 ${!isMac ? 'pr-[140px]' : ''}`}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
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

        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center justify-center p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 transition-all active:scale-95 cursor-pointer"
          title="偏好设置"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
