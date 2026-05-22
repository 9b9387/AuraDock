import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

interface ScreenMirrorProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  activeSerial: string | null;
  scrcpyError: string | null;
  scrcpyStatus: string;
  handleCanvasMouseEvent: (e: React.MouseEvent<HTMLCanvasElement>, action: number) => void;
  reconnecting?: boolean;
  reconnectAttempt?: number;
  reconnectFailed?: boolean;
  onManualReconnect?: () => void;
  onCancelReconnect?: () => void;
}

export const ScreenMirror: React.FC<ScreenMirrorProps> = ({
  canvasRef,
  activeSerial,
  scrcpyError,
  scrcpyStatus,
  handleCanvasMouseEvent,
  reconnecting = false,
  reconnectAttempt = 0,
  reconnectFailed = false,
  onManualReconnect,
  onCancelReconnect,
}) => {
  const isConnecting = scrcpyStatus.toLowerCase().includes('connect') && 
                       !scrcpyStatus.toLowerCase().includes('fail') && 
                       !reconnecting && 
                       !reconnectFailed;

  return (
    <>
      {scrcpyError && !reconnecting && !reconnectFailed && (
        <div className="absolute top-4 left-4 right-4 p-3 bg-red-950/80 border border-red-500/30 rounded-xl flex items-start gap-2.5 text-sm text-red-200 z-20 animate-bounce">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-red-400">连接错误</p>
            <p className="text-xs opacity-90 mt-0.5 break-all">{scrcpyError}</p>
          </div>
        </div>
      )}

      {/* Connection Loading Placeholder */}
      {activeSerial && isConnecting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 p-8 text-center bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-[2px] rounded-2xl animate-in fade-in duration-200">
          <div className="relative mb-4 flex items-center justify-center">
            <div className="absolute w-12 h-12 rounded-full bg-emerald-500/10 dark:bg-emerald-500/5 animate-pulse"></div>
            <Loader2 className="w-8 h-8 text-emerald-600 dark:text-emerald-500 animate-spin relative z-10" />
          </div>
          <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 tracking-wider">
            正在连接中...
          </h4>
        </div>
      )}

      {/* Reconnecting Overlay (Minimalist Style) */}
      {activeSerial && reconnecting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 p-8 text-center bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-[2px] rounded-2xl animate-in fade-in duration-200">
          <div className="relative mb-4 flex items-center justify-center">
            <div className="absolute w-12 h-12 rounded-full bg-emerald-500/10 dark:bg-emerald-500/5 animate-pulse"></div>
            <Loader2 className="w-8 h-8 text-emerald-600 dark:text-emerald-500 animate-spin relative z-10" />
          </div>
          <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 tracking-wider">
            自动重连中 {reconnectAttempt} / 3次...
          </h4>
        </div>
      )}

      {/* Reconnect Failed Overlay (Minimalist Style) */}
      {activeSerial && reconnectFailed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 p-8 text-center bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-[2px] rounded-2xl animate-in fade-in duration-200">
          <div className="relative mb-4 flex items-center justify-center">
            <div className="absolute w-12 h-12 rounded-full bg-red-500/10 dark:bg-red-500/5 animate-pulse"></div>
            <AlertCircle className="w-8 h-8 text-red-500 dark:text-red-400 relative z-10" />
          </div>
          <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 tracking-wider">
            与设备失去连接，请检查设备连接状态
          </h4>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={onCancelReconnect}
              className="px-4 py-1.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-[10px] font-bold rounded-full shadow-sm hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
            >
              返回
            </button>
            <button
              onClick={onManualReconnect}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-zinc-950 text-[10px] font-bold rounded-full shadow-sm hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
            >
              重新连接
            </button>
          </div>
        </div>
      )}

      <div className={`relative w-full h-full flex items-center justify-center ${!activeSerial ? 'hidden' : ''} ${isConnecting || reconnecting || reconnectFailed ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100 transition-all duration-300'}`}>
        <canvas
          ref={canvasRef}
          onMouseDown={(e) => handleCanvasMouseEvent(e, 0)}
          onMouseMove={(e) => { if (e.buttons > 0) handleCanvasMouseEvent(e, 2); }}
          onMouseUp={(e) => handleCanvasMouseEvent(e, 1)}
          className="max-w-full max-h-[75vh] shadow-2xl rounded-lg border border-zinc-200 dark:border-zinc-800 cursor-crosshair object-contain bg-black z-10"
        />
      </div>
    </>
  );
};
