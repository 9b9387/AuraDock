import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import started from 'electron-squirrel-startup';
import { scrcpyManager } from './main/scrcpy-manager';
import { VisionAgent } from './main/vision-agent';
import { ConfigManager } from './main/config-manager';
import { setGlobalDispatcher, ProxyAgent } from 'undici';

// Load .env manually
if (existsSync('.env')) {
  const envContent = readFileSync('.env', 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      process.env[key.trim()] = value;
    }
  });
}

// Setup Proxy for ADK/GenAI fetch
const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
if (proxyUrl) {
  try {
    const proxyAgent = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(proxyAgent);
    console.log(`[Main] Global proxy set to: ${proxyUrl}`);
  } catch (e) {
    console.error('[Main] Failed to set global proxy:', e);
  }
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  const isDark = nativeTheme.shouldUseDarkColors;

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform !== 'darwin' ? {
      color: isDark ? '#09090b' : '#ffffff',
      symbolColor: isDark ? '#f4f4f5' : '#09090b',
      height: 36,
    } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  // Setup Config handlers
  ConfigManager.setupHandlers();

  // Setup Scrcpy handlers once at startup
  scrcpyManager.setupHandlers();

  // Initialize VisionAgent
  const visionAgent = new VisionAgent();
  console.log('[Main] VisionAgent initialized');

  // Setup theme IPC handlers
  ipcMain.handle('dark-mode:set', (_event, theme: 'dark' | 'light' | 'system') => {
    nativeTheme.themeSource = theme;
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
    
    return { isDark, themeSource: nativeTheme.themeSource };
  });

  ipcMain.handle('dark-mode:get-current', () => {
    return {
      isDark: nativeTheme.shouldUseDarkColors,
      themeSource: nativeTheme.themeSource,
    };
  });

  // Listen for native OS theme changes
  nativeTheme.on('updated', () => {
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
  });

  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up background scrcpy/adb stream services on exit to prevent ghost processes and audio capture locks.
app.on('before-quit', () => {
  console.log('[Main] App is quitting. Cleaning up background services...');
  scrcpyManager.stopAll();
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
