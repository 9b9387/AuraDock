import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ScreenMirrorProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  activeSerial: string | null;
  scrcpyError: string | null;
  handleCanvasMouseEvent: (e: React.MouseEvent<HTMLCanvasElement>, action: number) => void;
}

export const ScreenMirror: React.FC<ScreenMirrorProps> = ({
  canvasRef,
  activeSerial,
  scrcpyError,
  handleCanvasMouseEvent,
}) => {
  return (
    <>
      {scrcpyError && (
        <div className="absolute top-4 left-4 right-4 p-3 bg-red-950/80 border border-red-500/30 rounded-xl flex items-start gap-2.5 text-sm text-red-200 z-10 animate-bounce">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-red-400">连接错误</p>
            <p className="text-xs opacity-90 mt-0.5 break-all">{scrcpyError}</p>
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
    </>
  );
};
