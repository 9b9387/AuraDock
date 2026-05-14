import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import started from 'electron-squirrel-startup';
import { scrcpyManager } from './main/scrcpy-manager';
import { VisionAgent } from './main/vision-agent';
import { existsSync as existsSyncExtra, copySync } from 'fs-extra';
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

const ensureAssets = () => {
  const assetsSrc = path.join(__dirname, '../../src/scrcpy/assets');
  const assetsDest = path.join(__dirname, 'assets');
  if (existsSync(assetsSrc)) {
    copySync(assetsSrc, assetsDest, { overwrite: true });
  }
};

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
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
  // Ensure scrcpy assets are available in the build directory
  ensureAssets();

  // Setup Scrcpy handlers once at startup
  scrcpyManager.setupHandlers();

  // Initialize VisionAgent
  const visionAgent = new VisionAgent();
  console.log('[Main] VisionAgent initialized');

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

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
