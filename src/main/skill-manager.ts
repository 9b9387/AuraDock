import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { ConfigManager } from './config-manager';

/**
 * Watch-mode metadata declared by a skill under `frontmatter.metadata.watch`.
 * A "watch skill" is the per-app pack that replaces manual per-app configuration:
 * it declares which notifications are relevant (packages/keywords), the relevance
 * condition, and the action to perform. The skill's instructions body additionally
 * teaches the Layer-2 agent how to navigate that app's UI to reply.
 */
export interface WatchSkillMeta {
  /** Android package fragments used for the zero-token Layer-0 pre-filter. */
  packages: string[];
  /** Title/text keywords used for the zero-token Layer-0 pre-filter. */
  keywords: string[];
  /** Natural-language relevance condition fed to the Layer-1 classifier. */
  condition: string;
  /** Natural-language action used to build the Layer-2 reply task. */
  action: string;
}

export interface SkillSummary {
  name: string;
  description: string;
  /** Present only when the skill declares `metadata.watch`. */
  watch?: WatchSkillMeta;
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
        watch: this.normalizeWatchMeta(s.frontmatter?.metadata?.watch, s.frontmatter?.description),
      })).filter((s) => s.name);
    } catch (e) {
      console.error('[SkillManager] Failed to list skills:', e);
      return [];
    }
  }

  /**
   * Load and normalize a single skill's watch metadata, for the WatchManager.
   */
  public static async getWatchMeta(skillsPath: string, name: string): Promise<WatchSkillMeta | undefined> {
    const skill = await this.loadSkill(skillsPath, name);
    if (!skill) return undefined;
    return this.normalizeWatchMeta(skill.frontmatter?.metadata?.watch, skill.frontmatter?.description);
  }

  /** Defensively coerce a freeform `metadata.watch` block into WatchSkillMeta. */
  private static normalizeWatchMeta(raw: any, description?: string): WatchSkillMeta | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const toStrArr = (v: any): string[] =>
      Array.isArray(v)
        ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
        : typeof v === 'string' && v.trim()
          ? [v.trim()]
          : [];
    const packages = toStrArr(raw.packages);
    const keywords = toStrArr(raw.keywords);
    const condition = typeof raw.condition === 'string' && raw.condition.trim()
      ? raw.condition.trim()
      : (description || '').trim();
    const action = typeof raw.action === 'string' && raw.action.trim() ? raw.action.trim() : '';
    if (!packages.length && !keywords.length && !condition && !action) return undefined;
    return { packages, keywords, condition, action };
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
