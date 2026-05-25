import React from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, RefreshCw } from 'lucide-react';
import type { AdbDeviceInfo } from '../../types';
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription } from './ui/empty';

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
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center p-8 w-full max-w-md text-center">
      <Empty className="flex-row items-center justify-start gap-4 p-0 mb-6 border-none text-left md:p-0">
        <EmptyMedia className="mb-0 relative shrink-0">
          <div className="absolute inset-0 bg-emerald-500/10 rounded-full blur-3xl animate-pulse-slow"></div>
          <div className="size-12 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-zinc-400 dark:text-zinc-500 relative z-10">
            <Smartphone className="size-6 text-emerald-600 dark:text-emerald-500" />
          </div>
        </EmptyMedia>
        <EmptyHeader className="items-start text-left gap-0.5 max-w-none">
          <EmptyTitle className="text-md font-bold text-zinc-800 dark:text-zinc-100">
            {t('deviceSelector.androidConnection')}
          </EmptyTitle>
          <EmptyDescription className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-xs">
            {t('deviceSelector.selectDeviceTip')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>

      <div className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-900">
          <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{t('deviceSelector.availableDevices', { count: devices.length })}</span>
          <button 
            onClick={refreshDevices}
            disabled={loadingDevices}
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors disabled:opacity-50 cursor-pointer"
            title={t('deviceSelector.refreshList') || undefined}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingDevices ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="p-3 max-h-56 overflow-y-auto space-y-2 text-left">
          {devices.length === 0 ? (
            <div className="py-8 flex flex-col items-center justify-center text-center">
              <p className="text-xs text-zinc-400 dark:text-zinc-600 mb-2">{t('deviceSelector.noDevicesFound')}</p>
              <div className="flex flex-col items-start text-left">
                <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-1">
                  {t('deviceSelector.step1')}
                </p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-1">
                  {t('deviceSelector.step2')}
                </p>
              </div>
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
                      {device.model || t('deviceSelector.unknownAndroidDevice')}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500 truncate mt-0.5">
                      {serial}
                    </span>
                  </div>
                  <button
                    onClick={() => startScrcpy(serial, device.model)}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all active:scale-95 cursor-pointer shrink-0"
                  >
                    {t('deviceSelector.connect')}
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
