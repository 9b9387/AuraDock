import React from 'react';
import { useTranslation } from 'react-i18next';
import { Triangle, Circle, Square, Camera, Link2Off, Volume2, VolumeX, Keyboard, Send, Loader2, Trash2, Delete } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';

interface NavigationBarProps {
  activeSerial: string | null;
  executeSystemKey: (key: 'BACK' | 'HOME' | 'APP_SWITCH') => void;
  handleTakeScreenshot: () => void;
  disconnectScrcpy: () => void;
  audioEnabled: boolean;
  setAudioEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

export const NavigationBar: React.FC<NavigationBarProps> = ({
  activeSerial,
  executeSystemKey,
  handleTakeScreenshot,
  disconnectScrcpy,
  audioEnabled,
  setAudioEnabled,
}) => {
  const { t } = useTranslation();
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const [textValue, setTextValue] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');

  React.useEffect(() => {
    if (!isPopoverOpen) {
      setErrorMsg('');
    }
  }, [isPopoverOpen]);

  React.useEffect(() => {
    if (isPopoverOpen && activeSerial) {
      const fetchFocusedText = async () => {
        try {
          const res = await (window as any).adb.executeTool(activeSerial, 'get_focused_text', {});
          if (res && res.status === 'success' && res.text !== undefined) {
            setTextValue(res.text);
          }
        } catch (err) {
          console.error('[NavigationBar] Failed to fetch focused text:', err);
        }
      };
      fetchFocusedText();
    }
  }, [isPopoverOpen, activeSerial]);

  if (!activeSerial) return null;

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textValue.trim() || isSending) return;

    setIsSending(true);
    setErrorMsg('');
    try {
      await (window as any).adb.executeTool(activeSerial, 'input_text', { text: textValue });
      setTextValue('');
      setIsPopoverOpen(false);
    } catch (err: any) {
      console.error('[NavigationBar] Failed to send text:', err);
      setErrorMsg(err.message || t('nav.sendFailed'));
    } finally {
      setIsSending(false);
    }
  };

  const handleClearText = async () => {
    setErrorMsg('');
    try {
      await (window as any).adb.executeTool(activeSerial, 'clear_text', {});
      setTextValue('');
    } catch (err: any) {
      console.error('[NavigationBar] Failed to clear text:', err);
      setErrorMsg(err.message || t('nav.sendFailed'));
    }
  };

  const handleBackspace = async () => {
    setErrorMsg('');
    try {
      await (window as any).adb.executeTool(activeSerial, 'key_event', { key: 'DEL' });
      setTextValue(prev => prev.slice(0, -1));
    } catch (err: any) {
      console.error('[NavigationBar] Failed to backspace:', err);
      setErrorMsg(err.message || t('nav.sendFailed'));
    }
  };

  return (
    <div className="mt-4 flex items-center justify-between px-4 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 z-10 shrink-0 transition-colors duration-200">
      {/* Left Slot: Audio output & keyboard text input */}
      <div className="w-24 flex justify-start items-center gap-2">
        <Tooltip content={audioEnabled ? t('nav.muteAudio') : t('nav.unmuteAudio')} position="top">
          <button 
            onClick={() => setAudioEnabled(prev => !prev)}
            className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors cursor-pointer ${
              audioEnabled 
                ? "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/40" 
                : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800/80"
            }`}
          >
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </Tooltip>

        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <button 
              className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors cursor-pointer ${
                isPopoverOpen 
                  ? "text-emerald-500 bg-emerald-100/60 dark:bg-emerald-950/40" 
                  : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800/80"
              }`}
            >
              <Keyboard className="w-4 h-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent 
            side="top" 
            align="start" 
            sideOffset={12}
            className="w-80 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl flex flex-col gap-2"
          >
            <form onSubmit={handleSendText} className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-zinc-600 dark:text-zinc-300 px-0.5">
                {t('nav.inputText')}
              </div>
              <div className="flex gap-2 items-center">
                {/* Embedded input group */}
                <div className="flex-1 flex items-center gap-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus-within:border-emerald-500 rounded-lg px-2 py-1 transition-colors">
                  <input
                    type="text"
                    autoFocus
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    placeholder={t('nav.inputTextPlaceholder')}
                    className="flex-1 text-xs bg-transparent border-none focus:outline-none text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 pr-1"
                    disabled={isSending}
                  />
                  {textValue && (
                    <button
                      type="button"
                      onClick={handleClearText}
                      disabled={isSending}
                      title={t('nav.clearAll')}
                      className="p-1 rounded text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleBackspace}
                    disabled={isSending}
                    title={t('nav.backspace')}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <Delete className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                {/* Submit Send Button */}
                <button
                  type="submit"
                  disabled={isSending || !textValue.trim()}
                  className="flex items-center justify-center size-8 shrink-0 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-sm transition-colors cursor-pointer"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
              {errorMsg && (
                <div className="text-[10px] text-rose-500 dark:text-rose-400 font-medium px-0.5">
                  {errorMsg}
                </div>
              )}
            </form>
          </PopoverContent>
        </Popover>
      </div>

      {/* Navigation Keys Middle */}
      <div className="flex items-center gap-8">
        <Tooltip content={t('nav.back')} position="top">
          <button 
            onClick={() => executeSystemKey('BACK')}
            className="flex items-center justify-center w-8 h-8 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all active:scale-90 cursor-pointer"
          >
            <Triangle className="w-3.5 h-3.5 -rotate-90" />
          </button>
        </Tooltip>

        <Tooltip content={t('nav.home')} position="top">
          <button 
            onClick={() => executeSystemKey('HOME')}
            className="flex items-center justify-center w-8 h-8 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all active:scale-90 cursor-pointer"
          >
            <Circle className="w-3.5 h-3.5" />
          </button>
        </Tooltip>

        <Tooltip content={t('nav.recentApps')} position="top">
          <button 
            onClick={() => executeSystemKey('APP_SWITCH')}
            className="flex items-center justify-center w-8 h-8 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all active:scale-90 cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
      </div>

      {/* Combined Controls on the Right */}
      <div className="w-24 flex justify-end items-center gap-2">
        <Tooltip content={t('nav.screenshot')} position="top">
          <button 
            onClick={handleTakeScreenshot}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <Camera className="w-4 h-4" />
          </button>
        </Tooltip>

        <Tooltip content={t('nav.disconnect')} position="top">
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
