import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, MicOff, ShieldAlert, AlertTriangle, MessageSquare, Settings } from 'lucide-react';

export type MicErrorType = 'no-mic' | 'permission-denied' | 'unusable';

interface MicCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorType: MicErrorType | null;
  onOpenSettings: () => void;
  onFallbackToText: () => void;
}

export const MicCheckModal: React.FC<MicCheckModalProps> = ({
  isOpen,
  onClose,
  errorType,
  onOpenSettings,
  onFallbackToText,
}) => {
  const { t } = useTranslation();

  if (!isOpen || !errorType) return null;

  // Render content based on error type
  const renderContent = () => {
    switch (errorType) {
      case 'no-mic':
        return {
          icon: <MicOff className="w-12 h-12 text-zinc-400 dark:text-zinc-500 animate-pulse" />,
          title: t('micCheck.noMicTitle'),
          englishTitle: 'NO MICROPHONE DETECTED',
          description: t('micCheck.noMicDesc'),
          primaryAction: (
            <button
              onClick={onFallbackToText}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              <span>{t('micCheck.textDialogue')}</span>
            </button>
          ),
        };
      case 'permission-denied':
        return {
          icon: <ShieldAlert className="w-12 h-12 text-rose-500 dark:text-rose-400 animate-bounce" />,
          title: t('micCheck.permissionDeniedTitle'),
          englishTitle: 'MICROPHONE ACCESS DENIED',
          description: t('micCheck.permissionDeniedDesc'),
          primaryAction: (
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={onOpenSettings}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <Settings className="w-4 h-4 animate-spin-slow" />
                <span>{t('micCheck.openSystemSettings')}</span>
              </button>
              <button
                onClick={onFallbackToText}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{t('micCheck.textDialogueFirst')}</span>
              </button>
            </div>
          ),
        };
      case 'unusable':
      default:
        return {
          icon: <AlertTriangle className="w-12 h-12 text-amber-500 dark:text-amber-400" />,
          title: t('micCheck.micUnavailableTitle'),
          englishTitle: 'MICROPHONE UNUSABLE',
          description: t('micCheck.micUnavailableDesc'),
          primaryAction: (
            <button
              onClick={onFallbackToText}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              <span>{t('micCheck.textDialogue')}</span>
            </button>
          ),
        };
    }
  };

  const content = renderContent();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200 p-4">
      <div className="relative w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col p-6 text-zinc-800 dark:text-zinc-100 animate-in zoom-in-95 duration-200 items-center text-center">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Dynamic Icon */}
        <div className="mt-4 mb-4 p-4 rounded-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-900/50">
          {content.icon}
        </div>

        {/* Title */}
        <h3 className="font-bold text-base tracking-wide text-zinc-900 dark:text-zinc-50">
          {content.title}
        </h3>
        <p className="text-[9px] font-extrabold text-zinc-400 dark:text-zinc-500 tracking-widest uppercase mt-0.5 mb-3">
          {content.englishTitle}
        </p>

        {/* Description */}
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed px-2 mb-6">
          {content.description}
        </p>

        {/* Action Button Row */}
        <div className="w-full space-y-2">
          {content.primaryAction}
          
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            {t('micCheck.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
