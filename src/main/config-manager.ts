import { app, ipcMain, nativeTheme, BrowserWindow, systemPreferences, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { setGlobalDispatcher, ProxyAgent } from 'undici';

export type WatchStopMode = 'manual' | 'duration' | 'until';

export interface WatchStopConfig {
  mode: WatchStopMode;
  /** For mode 'duration': run for this many milliseconds, then auto-stop. */
  durationMs?: number;
  /** For mode 'until': epoch milliseconds at which to auto-stop. */
  until?: number;
  /** Optional cap on the number of triggered actions before auto-stop. */
  maxTriggers?: number;
}

/**
 * A "watch task". Fully skill-driven: a single Watch Skill (one per app) supplies the
 * relevance condition, the zero-token notification pre-filter (packages/keywords), the
 * action, and the UI-navigation know-how. No per-app configuration lives here.
 */
export interface WatchConfig {
  /** Name of the Watch Skill that defines what to watch and how to act. */
  skillName: string;
  triggers: { notification: boolean; screenDiff: boolean };
  stop: WatchStopConfig;
}

export interface WatchModeSettings {
  /** Cheap model used by the Layer-1 classifier gate. */
  classifierModel: string;
  /** Notification polling interval in ms (no-token adb dumpsys). */
  pollIntervalMs: number;
  /** Cooldown after a triggered action before detection resumes. */
  cooldownMs: number;
  /** Last WatchConfig used, persisted so the panel restores it. */
  lastConfig: WatchConfig | null;
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  language: 'zh' | 'en';
  geminiApiKey: string;
  geminiLiveModel: string;
  visionAgentModel: string;
  proxy: string;
  skillsPath: string;
  permissions: {
    camera: boolean;
    microphone: boolean;
    notifications: boolean;
    screenCapture: boolean;
  };
  watchMode: WatchModeSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'zh',
  geminiApiKey: '',
  geminiLiveModel: 'models/gemini-3.1-flash-live-preview',
  visionAgentModel: 'gemini-3-flash-preview',
  proxy: '',
  skillsPath: '',
  permissions: {
    camera: true,
    microphone: true,
    notifications: false,
    screenCapture: false,
  },
  watchMode: {
    classifierModel: 'gemini-3-flash-preview',
    pollIntervalMs: 2500,
    cooldownMs: 8000,
    lastConfig: null,
  }
};

export class ConfigManager {
  private static getSettingsPath(): string {
    return path.join(app.getPath('userData'), 'settings.json');
  }

  /**
   * Loads settings from disk safely. If file does not exist, returns default settings
   * with potential fallback to environment variables for API key to ensure seamless migration.
   */
  public static loadSettings(): AppSettings {
    const settingsPath = this.getSettingsPath();
    let settings: Partial<AppSettings> = {};

    try {
      if (fs.existsSync(settingsPath)) {
        const fileContent = fs.readFileSync(settingsPath, 'utf-8');
        settings = JSON.parse(fileContent);
      }
    } catch (e) {
      console.error('[ConfigManager] Error reading settings file, using defaults:', e);
    }

    // Merge loaded settings with defaults to guarantee type-safety and structural completeness
    const merged: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...settings,
      permissions: {
        ...DEFAULT_SETTINGS.permissions,
        ...(settings.permissions || {})
      },
      watchMode: {
        ...DEFAULT_SETTINGS.watchMode,
        ...(settings.watchMode || {})
      }
    };

    // Migration / Fallback: If API key is empty but exists in process.env, import it
    if (!merged.geminiApiKey) {
      const envKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
      if (envKey) {
        merged.geminiApiKey = envKey;
        // Save back so it persists in the settings file
        this.saveSettings(merged);
      }
    }

    return merged;
  }

  /**
   * Persist the most recently used WatchConfig without touching unrelated settings.
   */
  public static saveWatchConfig(config: WatchConfig | null): boolean {
    const settings = this.loadSettings();
    settings.watchMode = { ...settings.watchMode, lastConfig: config };
    return this.saveSettings(settings);
  }

  /**
   * Saves settings to disk securely in the userData directory.
   */
  public static saveSettings(settings: AppSettings): boolean {
    const settingsPath = this.getSettingsPath();
    try {
      // Ensure the directory exists
      const dir = path.dirname(settingsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Restrict file permission: read/write for owner only (0600) for security compliance
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), {
        encoding: 'utf-8',
        mode: 0o600
      });

      // Synchronize nativeTheme themeSource with current settings
      nativeTheme.themeSource = settings.theme;

      // Update process.env so existing systems reliant on process.env get synchronized
      if (settings.geminiApiKey) {
        process.env.GEMINI_API_KEY = settings.geminiApiKey;
        process.env.GOOGLE_API_KEY = settings.geminiApiKey;
      }

      // Update global proxy dispatcher dynamically
      const runtimeProxyUrl = settings.proxy || process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
      if (runtimeProxyUrl) {
        try {
          const proxyAgent = new ProxyAgent(runtimeProxyUrl);
          setGlobalDispatcher(proxyAgent);
          console.log(`[ConfigManager] Global proxy updated dynamically to: ${runtimeProxyUrl}`);
        } catch (e) {
          console.error('[ConfigManager] Failed to update global proxy dynamically:', e);
        }
      }

      return true;
    } catch (e) {
      console.error('[ConfigManager] Error saving settings:', e);
      return false;
    }
  }

  /**
   * Register IPC handlers for configuration retrieval and storage.
   * Following Electron best practices, we avoid exposing raw process.env
   * or direct FS pathways to the renderer.
   */
  public static setupHandlers(): void {
    // Legacy support fallback
    ipcMain.handle('config:get-gemini-key', () => {
      const settings = this.loadSettings();
      return settings.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    });

    // Secure JSON configuration endpoints
    ipcMain.handle('settings:get', () => {
      try {
        return this.loadSettings();
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    });

    ipcMain.handle('settings:save', (_event, newSettings: AppSettings) => {
      try {
        // Validation: Verify structures and critical enum options
        if (!newSettings || typeof newSettings !== 'object') {
          throw new Error('Invalid settings object structure');
        }

        const validThemes = ['dark', 'light', 'system'];
        if (!validThemes.includes(newSettings.theme)) {
          throw new Error(`Invalid theme option: ${newSettings.theme}`);
        }

        const validLanguages = ['zh', 'en'];
        if (!validLanguages.includes(newSettings.language)) {
          throw new Error(`Invalid language option: ${newSettings.language}`);
        }

        const success = this.saveSettings(newSettings);
        if (success) {
          // Sync theme to all open windows (including process.platform custom borders)
          const isDark = nativeTheme.shouldUseDarkColors;
          
          if (process.platform !== 'darwin') {
            BrowserWindow.getAllWindows().forEach(win => {
              win.setTitleBarOverlay({
                color: isDark ? '#09090b' : '#ffffff',
                symbolColor: isDark ? '#f4f4f5' : '#09090b',
                height: 36,
              });
            });
          }

          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('dark-mode:updated', {
              isDark,
              themeSource: nativeTheme.themeSource,
            });
          });

          return { success: true, settings: newSettings };
        } else {
          throw new Error('FileSystem write operation failed');
        }
      } catch (e: any) {
        console.error('[ConfigManager] IPC settings:save error:', e);
        return { success: false, error: e.message };
      }
    });

    // Real system permission checks (Electron-safe, secure queries)
    ipcMain.handle('permission:get-microphone-status', () => {
      if (process.platform === 'darwin') {
        try {
          return systemPreferences.getMediaAccessStatus('microphone'); // 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'
        } catch (e) {
          return 'unknown';
        }
      } else if (process.platform === 'win32') {
        try {
          return systemPreferences.getMediaAccessStatus('microphone');
        } catch (e) {
          return 'granted';
        }
      }
      return 'granted'; // Default fallback for other OS types
    });

    ipcMain.handle('permission:request-microphone', async () => {
      if (process.platform === 'darwin') {
        try {
          const granted = await systemPreferences.askForMediaAccess('microphone');
          return granted ? 'granted' : 'denied';
        } catch (e) {
          return 'denied';
        }
      }
      return 'granted';
    });

    ipcMain.handle('permission:open-system-settings', async () => {
      try {
        if (process.platform === 'darwin') {
          await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
        } else if (process.platform === 'win32') {
          await shell.openExternal('ms-settings:privacy-microphone');
        }
        return true;
      } catch (e) {
        console.error('[ConfigManager] Failed to open system settings:', e);
        return false;
      }
    });
  }
}
