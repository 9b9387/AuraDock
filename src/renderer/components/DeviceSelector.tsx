import React from 'react';
import { Smartphone, RefreshCw, AlertCircle } from 'lucide-react';
import type { AdbDeviceInfo } from '../../types';

interface DeviceSelectorProps {
  devices: AdbDeviceInfo[];
  loadingDevices: boolean;
  refreshDevices: () => void;
  startScrcpy: (serial: string, modelName?: string) => void;
}

export const DeviceSelector: React.FC<DeviceSelectorProps> = ({
  devices,
  loadingDevices,
  refreshDevices,
  startScrcpy,
}) => {
  return (
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
  );
};
