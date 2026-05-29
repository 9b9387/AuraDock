import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { ConfigManager } from './config-manager';

export interface SkillSummary {
  name: string;
  description: string;
}

export class SkillManager {
  /**
   * Read frontmatter list of all skills under the given base directory using ADK.
   * Returns an array of `{ name, description }`.
   * Falls back to empty list when the path is missing or unreadable.
   */
  public static async listSkills(skillsPath: string): Promise<SkillSummary[]> {
    if (!skillsPath || !fs.existsSync(skillsPath)) return [];

    try {
      const { loadAllSkillsInDir } = await import('@google/adk');
      const skills = await loadAllSkillsInDir(skillsPath);
      return Object.values(skills).map((s: any) => ({
        name: s.frontmatter?.name ?? '',
        description: s.frontmatter?.description ?? '',
      })).filter((s) => s.name);
    } catch (e) {
      console.error('[SkillManager] Failed to list skills:', e);
      return [];
    }
  }

  /**
   * Loads a single Skill object from the configured base path, by skill name.
   * Used by VisionAgent when constructing a SkillToolset for the LlmAgent.
   */
  public static async loadSkill(skillsPath: string, name: string): Promise<any | null> {
    if (!skillsPath || !name) return null;
    try {
      const { loadSkillFromDir } = await import('@google/adk');
      return await loadSkillFromDir(path.join(skillsPath, name));
    } catch (e) {
      console.error(`[SkillManager] Failed to load skill "${name}":`, e);
      return null;
    }
  }

  public static setupHandlers(): void {
    ipcMain.handle('skills:list', async () => {
      try {
        const settings = ConfigManager.loadSettings();
        return await this.listSkills(settings.skillsPath);
      } catch (e) {
        console.error('[SkillManager] IPC skills:list error:', e);
        return [];
      }
    });

    ipcMain.handle('skills:pick-folder', async () => {
      try {
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        const result = await dialog.showOpenDialog(win, {
          properties: ['openDirectory'],
          title: 'Select Skills Folder',
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0];
      } catch (e) {
        console.error('[SkillManager] IPC skills:pick-folder error:', e);
        return null;
      }
    });
  }
}
