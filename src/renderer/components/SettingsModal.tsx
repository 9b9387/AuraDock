import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, X, Key, Eye, EyeOff, Languages, Shield, Save, FolderOpen, Sparkles } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
  onSettingsSaved: (settings: any) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  onSettingsSaved,
}) => {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<any>(null);
  const [localSettings, setLocalSettings] = useState<any>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [micPermissionStatus, setMicPermissionStatus] = useState<'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'>('unknown');

  const handleCancel = () => {
    if (settings && settings.language) {
      i18n.changeLanguage(settings.language);
    }
    onClose();
  };

  // Load configuration from Electron on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await (window as any).adb.getSettings();
        if (res) {
          setSettings(res);
          setLocalSettings(JSON.parse(JSON.stringify(res)));
        }
      } catch (e) {
        console.error('[SettingsModal] Error loading settings:', e);
      }
    };
    loadConfig();
  }, []);

  const fetchMicPermissionStatus = useCallback(async () => {
    try {
      const status = await (window as any).adb.getMicrophoneStatus();
      setMicPermissionStatus(status);
    } catch (err) {
      console.error('[SettingsModal] Error fetching microphone status:', err);
    }
  }, []);

  // Fetch OS microphone status and poll
  useEffect(() => {
    fetchMicPermissionStatus();

    const handleWindowFocus = () => {
      fetchMicPermissionStatus();
    };
    window.addEventListener('focus', handleWindowFocus);

    const intervalId = setInterval(() => {
      fetchMicPermissionStatus();
    }, 2000);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      clearInterval(intervalId);
    };
  }, [fetchMicPermissionStatus]);

  const handleRequestMicPermission = async () => {
    try {
      const status = await (window as any).adb.requestMicrophone();
      setMicPermissionStatus(status);
    } catch (err) {
      console.error('[SettingsModal] Error requesting microphone permission:', err);
    }
  };

  const handleOpenSystemSettings = async () => {
    try {
      await (window as any).adb.openSystemSettings();
    } catch (err) {
      console.error('[SettingsModal] Error opening system settings:', err);
    }
  };

  const handlePickSkillsFolder = async () => {
    try {
      const folder = await (window as any).adb.skills.pickFolder();
      if (folder) {
        setLocalSettings({ ...localSettings, skillsPath: folder });
      }
    } catch (err) {
      console.error('[SettingsModal] Error picking skills folder:', err);
    }
  };

  const handleSaveSettings = async () => {
    if (!localSettings) return;
    setSaveStatus('saving');
    try {
      const res = await (window as any).adb.saveSettings(localSettings);
      if (res && res.success) {
        setSettings(res.settings);
        onSettingsSaved(res.settings);

        setSaveStatus('saved');
        setTimeout(() => {
          setSaveStatus('idle');
          onClose();
        }, 1000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (err) {
      console.error('[SettingsModal] Error saving settings:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  if (!localSettings) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-zinc-800 dark:text-zinc-100 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Settings className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-500 animate-spin-slow" />
            <h3 className="font-bold text-sm tracking-wide">{t('settings.title')}</h3>
          </div>
          <button
            onClick={handleCancel}
            className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Section 1: API & Model */}
          <div className="space-y-4">
            <h4 className="text-xs font-extrabold text-zinc-400 dark:text-zinc-500 tracking-wider uppercase flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-800 pb-1.5">
              <Key className="w-3.5 h-3.5" />
              <span>{t('settings.apiModelConfig')}</span>
            </h4>
            
            {/* Gemini API Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{t('settings.geminiApiKey')}</label>
              <div className="relative flex items-center">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={localSettings.geminiApiKey || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, geminiApiKey: e.target.value })}
                  placeholder={t('settings.geminiApiKeyPlaceholder')}
                  className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl px-3 py-2.5 pr-10 focus:outline-none transition-colors text-zinc-800 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                {t('settings.geminiApiKeyTip')}
              </p>
            </div>

            {/* HTTP Proxy Configuration */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{t('settings.proxyConfig')}</label>
              <input
                type="text"
                value={localSettings.proxy || ''}
                onChange={(e) => setLocalSettings({ ...localSettings, proxy: e.target.value })}
                placeholder={t('settings.proxyPlaceholder')}
                className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl px-3 py-2.5 focus:outline-none transition-colors text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              />
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                {t('settings.proxyTip')}
              </p>
            </div>

            {/* Models Configuration */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{t('settings.liveCallModel')}</label>
                <select
                  value={localSettings.geminiLiveModel || 'models/gemini-3.1-flash-live-preview'}
                  onChange={(e) => setLocalSettings({ ...localSettings, geminiLiveModel: e.target.value })}
                  className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors cursor-pointer text-zinc-800 dark:text-zinc-100"
                >
                  <option value="models/gemini-3.1-flash-live-preview">gemini-3.1-flash-live-preview</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{t('settings.visionAgentModel')}</label>
                <select
                  value={localSettings.visionAgentModel || 'gemini-3-flash-preview'}
                  onChange={(e) => setLocalSettings({ ...localSettings, visionAgentModel: e.target.value })}
                  className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors cursor-pointer text-zinc-800 dark:text-zinc-100"
                >
                  <option value="gemini-3.5-flash">gemini-3.5-flash</option>
                  <option value="gemini-3-flash-preview">gemini-3-flash-preview</option>
                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Appearance & Lang */}
          <div className="space-y-4">
            <h4 className="text-xs font-extrabold text-zinc-400 dark:text-zinc-500 tracking-wider uppercase flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-800 pb-1.5">
              <Languages className="w-3.5 h-3.5" />
              <span>{t('settings.appearanceLang')}</span>
            </h4>

            <div className="grid grid-cols-2 gap-4">
              {/* Theme */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{t('settings.systemTheme')}</label>
                <select
                  value={localSettings.theme || 'system'}
                  onChange={(e) => setLocalSettings({ ...localSettings, theme: e.target.value as any })}
                  className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors cursor-pointer text-zinc-800 dark:text-zinc-100"
                >
                  <option value="light">{t('settings.themeLight')}</option>
                  <option value="dark">{t('settings.themeDark')}</option>
                  <option value="system">{t('settings.themeSystem')}</option>
                </select>
              </div>
              {/* Language */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{t('settings.interfaceLang')}</label>
                <select
                  value={localSettings.language || 'zh'}
                  onChange={(e) => {
                    const lang = e.target.value;
                    setLocalSettings({ ...localSettings, language: lang as any });
                    i18n.changeLanguage(lang);
                  }}
                  className="w-full text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors cursor-pointer text-zinc-800 dark:text-zinc-100"
                >
                  <option value="zh">{t('settings.langZh')}</option>
                  <option value="en">{t('settings.langEn')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2.5: Skills */}
          <div className="space-y-4">
            <h4 className="text-xs font-extrabold text-zinc-400 dark:text-zinc-500 tracking-wider uppercase flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-800 pb-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('settings.skillsSection') || 'SKILLS'}</span>
            </h4>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                {t('settings.skillsPath') || 'Skills 路径'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={localSettings.skillsPath || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, skillsPath: e.target.value })}
                  placeholder={t('settings.skillsPathPlaceholder') || '选择包含若干 SKILL.md 子目录的根目录'}
                  className="flex-1 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl px-3 py-2.5 focus:outline-none transition-colors text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                />
                <button
                  type="button"
                  onClick={handlePickSkillsFolder}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors cursor-pointer shrink-0"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {t('settings.browse') || '浏览…'}
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                {t('settings.skillsPathTip') || '* 指定 ADK Skills 根目录，每个子目录应包含 SKILL.md（遵循 ADK Agent Skill 规范）。在输入框输入 / 即可选择。'}
              </p>
            </div>
          </div>

          {/* Section 3: Permissions */}
          <div className="space-y-4">
            <h4 className="text-xs font-extrabold text-zinc-400 dark:text-zinc-500 tracking-wider uppercase flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-800 pb-1.5">
              <Shield className="w-3.5 h-3.5" />
              <span>{t('settings.securityPermissions')}</span>
            </h4>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-900 rounded-xl">
                <div className="flex flex-col min-w-0 pr-3">
                  <span className="text-xs font-bold">{t('settings.micPermission')}</span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 leading-relaxed">
                    {t('settings.micPermissionDesc')}
                  </span>
                </div>

                <div className="shrink-0">
                  {micPermissionStatus === 'granted' && (
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                      {t('settings.authorized')}
                    </span>
                  )}

                  {micPermissionStatus === 'not-determined' && (
                    <button
                      onClick={handleRequestMicPermission}
                      className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
                    >
                      {t('settings.requestAuth')}
                    </button>
                  )}

                  {(micPermissionStatus === 'denied' || micPermissionStatus === 'restricted' || micPermissionStatus === 'unknown') && (
                    <button
                      onClick={handleOpenSystemSettings}
                      className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
                    >
                      {t('settings.goAuthorize')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 shrink-0">
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            {t('settings.cancel')}
          </button>
          <button
            onClick={handleSaveSettings}
            disabled={saveStatus === 'saving'}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-md transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {saveStatus === 'saving' && t('settings.saving')}
            {saveStatus === 'saved' && t('settings.saveSuccess')}
            {saveStatus === 'error' && t('settings.saveError')}
            {saveStatus === 'idle' && t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  );
};
