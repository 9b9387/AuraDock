import { ipcMain } from 'electron';

export class ConfigManager {
  /**
   * Register IPC handlers for configuration retrieval.
   * Following Electron best practices, we avoid exposing raw process.env
   * and instead selectively expose only needed configuration variables.
   */
  public static setupHandlers(): void {
    ipcMain.handle('config:get-gemini-key', () => {
      // Return the API key loaded from .env or environment
      return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    });
  }
}
