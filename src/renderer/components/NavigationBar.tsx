import React from 'react';
import { Triangle, Circle, Square, Camera, Link2Off } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface NavigationBarProps {
  activeSerial: string | null;
  executeSystemKey: (key: 'BACK' | 'HOME' | 'APP_SWITCH') => void;
  handleTakeScreenshot: () => void;
  disconnectScrcpy: () => void;
}

export const NavigationBar: React.FC<NavigationBarProps> = ({
  activeSerial,
  executeSystemKey,
  handleTakeScreenshot,
  disconnectScrcpy,
}) => {
  if (!activeSerial) return null;

  return (
    <div className="mt-4 flex items-center justify-between px-4 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 z-10 shrink-0 transition-colors duration-200">
      {/* Left Slot */}
      <div className="w-20" />

      {/* Navigation Keys Middle */}
      <div className="flex items-center gap-8">
        <Tooltip content="返回" position="top">
          <button 
            onClick={() => executeSystemKey('BACK')}
            className="flex items-center justify-center w-8 h-8 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all active:scale-90 cursor-pointer"
          >
            <Triangle className="w-3.5 h-3.5 -rotate-90" />
          </button>
        </Tooltip>

        <Tooltip content="主页" position="top">
          <button 
            onClick={() => executeSystemKey('HOME')}
            className="flex items-center justify-center w-8 h-8 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all active:scale-90 cursor-pointer"
          >
            <Circle className="w-3.5 h-3.5" />
          </button>
        </Tooltip>

        <Tooltip content="最近应用" position="top">
          <button 
            onClick={() => executeSystemKey('APP_SWITCH')}
            className="flex items-center justify-center w-8 h-8 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all active:scale-90 cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
      </div>

      {/* Combined Controls on the Right */}
      <div className="w-20 flex justify-end items-center gap-2">
        <Tooltip content="屏幕截图" position="top">
          <button 
            onClick={handleTakeScreenshot}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <Camera className="w-4 h-4" />
          </button>
        </Tooltip>

        <Tooltip content="断开手机连接" position="top">
          <button 
            onClick={disconnectScrcpy}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-100/60 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
          >
            <Link2Off className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};
