import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

interface ScreenMirrorProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  activeSerial: string | null;
  scrcpyError: string | null;
  scrcpyStatus: string;
  handleCanvasMouseEvent: (e: React.MouseEvent<HTMLCanvasElement>, action: number) => void;
}

export const ScreenMirror: React.FC<ScreenMirrorProps> = ({
  canvasRef,
  activeSerial,
  scrcpyError,
  scrcpyStatus,
  handleCanvasMouseEvent,
}) => {
  const isConnecting = scrcpyStatus.toLowerCase().includes('connect');

  return (
    <>
      {scrcpyError && (
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
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 p-8 text-center animate-in fade-in duration-200">
          <div className="relative mb-4">
            <Loader2 className="w-8 h-8 text-emerald-600 dark:text-emerald-500 animate-spin" />
          </div>
          
          <h4 className="text-xs font-bold text-zinc-600 dark:text-zinc-400 tracking-wider">
            正在连接中...
          </h4>
        </div>
      )}

      <div className={`relative w-full h-full flex items-center justify-center ${!activeSerial ? 'hidden' : ''} ${isConnecting ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100 transition-all duration-300'}`}>
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
