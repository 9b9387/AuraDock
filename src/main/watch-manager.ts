import { ipcMain, BrowserWindow } from 'electron';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { ConfigManager, WatchConfig, WatchModeSettings } from './config-manager';
import { EventClassifier, ClassifyResult, WatchMatcher } from './agent/event-classifier';
import { SkillManager } from './skill-manager';
import type { VisionAgent } from './vision-agent';

const execAsync = promisify(exec);

interface ParsedNotif {
  pkg: string;
  key: string;
  category: string;
  channel: string;
  /** Post timestamp; updates on every new message even when the app collapses chats. */
  when: string;
  /** Whether the notification has been seen on the notification panel. */
  seen: boolean;
  title: string;
  text: string;
  number: string;
  /** `key|when` — stable while idle, changes per new message; the per-poll snapshot key. */
  signature: string;
}

/**
 * WatchManager implements "值守模式" (Watch Mode) as a three-tier funnel:
 *
 *  Layer 0 (zero token): notification polling (adb dumpsys) + canvas frame-diff signals.
 *  Layer 1 (cheap):       a single structured LLM call gating whether a candidate is real.
 *  Layer 2 (expensive):   the existing VisionAgent loop, only on confirmed events.
 *
 * Idle cost is essentially zero tokens; timeliness comes from push-like signals rather
 * than frequent LLM polling.
 */
export class WatchManager {
  private running = false;
  private config: WatchConfig | null = null;
  private settings: WatchModeSettings | null = null;

  private pollTimer: NodeJS.Timeout | null = null;
  private stopTimer: NodeJS.Timeout | null = null;

  /**
   * Snapshot of the previous poll's notification signatures. We trigger on lines present
   * now but absent in the previous poll. Unlike a cumulative "seen" set, this re-fires when
   * an unread line disappears (message read) and later re-appears (new message), which fixes
   * "only the first message is detected".
   */
  private prevSignatures = new Set<string>();
  private triggerCount = 0;
  /** Zero-token pre-filter, sourced from the selected Watch Skill's metadata. */
  private matcher: WatchMatcher = { keywords: [], packageHints: [] };
  /** Relevance condition and action, both supplied by the Watch Skill. */
  private condition = '';
  private action = '';

  private classifying = false;
  /** Detection is ignored while now < suppressedUntil (during action + cooldown). */
  private suppressedUntil = 0;

  constructor(private visionAgent: VisionAgent) {
    this.setupIpc();
  }

  // ---------------------------------------------------------------------------
  // IPC
  // ---------------------------------------------------------------------------
  private setupIpc() {
    ipcMain.on('watch:start', async (_e, config: WatchConfig) => {
      await this.start(config);
    });

    ipcMain.on('watch:stop', () => {
      this.stop('Stopped by user.');
    });

    ipcMain.on('watch:screen-signal', () => {
      this.onScreenSignal();
    });

    ipcMain.handle('watch:get-status', () => {
      return {
        running: this.running,
        config: ConfigManager.loadSettings().watchMode.lastConfig,
      };
    });

    ipcMain.handle('watch:update-config', (_e, config: WatchConfig) => {
      try {
        ConfigManager.saveWatchConfig(config);
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  private async start(config: WatchConfig) {
    if (this.running) this.stop('Restarting watch mode.');

    const serial = this.visionAgent.getActiveDeviceSerial();
    if (!serial) {
      this.log('status', 'No active device connected; cannot start watch mode.');
      this.notifyStatus(false);
      return;
    }

    if (!config.triggers?.notification && !config.triggers?.screenDiff) {
      this.log('status', 'No trigger source enabled; enable notification and/or screen-diff.');
      this.notifyStatus(false);
      return;
    }

    if (!config.skillName) {
      this.log('status', '未选择值守 Skill；请先选择一个带 metadata.watch 的 Skill。');
      this.notifyStatus(false);
      return;
    }

    // The Watch Skill is the single source of truth for what/how to watch.
    const skillsPath = ConfigManager.loadSettings().skillsPath;
    const meta = await SkillManager.getWatchMeta(skillsPath, config.skillName);
    if (!meta) {
      this.log('status', `Skill "${config.skillName}" 未声明 metadata.watch，无法用于值守。`);
      this.notifyStatus(false);
      return;
    }

    this.config = config;
    this.settings = ConfigManager.loadSettings().watchMode;
    this.running = true;
    this.triggerCount = 0;
    this.prevSignatures = new Set();
    this.suppressedUntil = 0;
    this.condition = meta.condition;
    this.action = meta.action;
    this.matcher = {
      keywords: meta.keywords,
      packageHints: meta.packages.map((p) => p.toLowerCase()),
    };

    ConfigManager.saveWatchConfig(config);
    this.notifyStatus(true);

    this.log('status', `值守模式已启动（Skill：${config.skillName}）。空闲检测不消耗 token。`);

    // Layer 0a: notification polling. We do NOT seed a baseline on start, so any unread
    // messages already present when watch mode starts are handled once immediately.
    if (config.triggers.notification) {
      const hints = [...this.matcher.packageHints, ...this.matcher.keywords];
      this.log('status', hints.length
        ? `Skill 声明的预过滤：${hints.slice(0, 8).join('、')}${hints.length > 8 ? '…' : ''}`
        : '该 Skill 未声明 packages/keywords，将判定全部新通知（仍便宜且去重）。');
      this.prevSignatures = new Set();
      this.startPolling();
    }

    // Layer 0b: ask the renderer to start emitting frame-diff signals.
    this.enableFrameDiff(!!config.triggers.screenDiff);

    // Auto-stop timer.
    this.scheduleAutoStop();
  }

  stop(reason: string) {
    if (!this.running && !this.pollTimer && !this.stopTimer) return;
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.enableFrameDiff(false);
    this.notifyStatus(false);
    this.log('status', `值守模式已停止：${reason}`);
  }

  private scheduleAutoStop() {
    const stop = this.config?.stop;
    if (!stop) return;
    let delay = 0;
    if (stop.mode === 'duration' && stop.durationMs && stop.durationMs > 0) {
      delay = stop.durationMs;
    } else if (stop.mode === 'until' && stop.until) {
      delay = stop.until - Date.now();
    }
    if (delay > 0) {
      this.stopTimer = setTimeout(() => this.stop('Scheduled time reached.'), delay);
      const mins = Math.round(delay / 60000);
      this.log('status', `将在约 ${mins} 分钟后自动停止。`);
    }
  }

  // ---------------------------------------------------------------------------
  // Layer 0: notification polling (no token)
  // ---------------------------------------------------------------------------
  private startPolling() {
    const interval = this.settings?.pollIntervalMs ?? 2500;
    this.pollTimer = setInterval(() => {
      this.pollNotifications().catch((e) => {
        console.error('[WatchManager] poll error:', e);
      });
    }, interval);
  }

  /**
   * Pull each active NotificationRecord block (header + following lines) at the shell level
   * to keep the payload small, e.g.:
   *   dumpsys notification --noredact | grep -A 45 'NotificationRecord.*pkg=com.tencent.mm'
   * We need the block (not just the header) because the fields that actually change on every
   * new message live below the header: `when=` (post time), `seen=`, and the message
   * `android.title` / `android.text`. `--noredact` exposes the message content (this is local
   * automation on the user's own device). Package list comes from metadata.watch.packages.
   */
  private buildNotificationCommand(serial: string): string {
    const pkgs = this.matcher.packageHints.filter(Boolean).map((p) => p.replace(/'/g, ''));
    let grepCmd = "grep -A 45 'NotificationRecord('";
    if (pkgs.length === 1) {
      grepCmd = `grep -A 45 'NotificationRecord.*pkg=${pkgs[0]}'`;
    } else if (pkgs.length > 1) {
      grepCmd = `grep -A 45 -E 'NotificationRecord.*pkg=(${pkgs.join('|')})'`;
    }
    return `adb -s ${serial} shell "dumpsys notification --noredact | ${grepCmd}"`;
  }

  private async fetchNotifications(): Promise<ParsedNotif[]> {
    const serial = this.visionAgent.getActiveDeviceSerial();
    if (!serial) return [];
    try {
      const { stdout } = await execAsync(this.buildNotificationCommand(serial), {
        maxBuffer: 1024 * 1024 * 4,
      });
      return this.parseNotifications(stdout);
    } catch (e: any) {
      // grep exits with code 1 when nothing matches: that's "no notifications", not a failure.
      if (e && e.code === 1) return [];
      console.warn('[WatchManager] dumpsys notification failed:', e?.message);
      return [];
    }
  }

  /** Snapshot the currently-unread notifications as the baseline without triggering. */
  private async reseedBaseline() {
    const notifs = await this.fetchNotifications();
    this.prevSignatures = new Set(notifs.filter((n) => !n.seen).map((n) => n.signature));
  }

  private async pollNotifications() {
    if (!this.running) return;
    if (Date.now() < this.suppressedUntil) return;
    if (this.classifying || this.visionAgent.isBusy()) return;

    const notifs = await this.fetchNotifications();
    // "Unread" = not yet seen on the panel. Fresh = unread now whose key|when signature
    // wasn't in the previous poll, so a new message (new `when`) re-fires even within the
    // same collapsed chat notification.
    const unread = notifs.filter((n) => !n.seen);
    const fresh = unread.filter((n) => !this.prevSignatures.has(n.signature));
    this.prevSignatures = new Set(unread.map((n) => n.signature));
    if (fresh.length === 0) return;

    // We now have the real sender + message text from the notification itself, which gives
    // the Layer-1 classifier strong signal and the Layer-2 agent useful context.
    const candidate = fresh[fresh.length - 1];
    const contextText = [
      `App: ${candidate.pkg}`,
      candidate.title ? `发信人: ${candidate.title}` : '',
      candidate.text ? `消息: ${candidate.text}` : '',
      candidate.number && candidate.number !== '1' ? `未读条数: ${candidate.number}` : '',
      candidate.category ? `Category: ${candidate.category}` : '',
    ].filter(Boolean).join('\n');
    await this.handleCandidate('notification', contextText);
  }

  /**
   * Parse `grep -A` output of NotificationRecord blocks. grep separates blocks with `--`.
   * Each block's header carries pkg/key/category/channel; the indented body carries the
   * changing fields (when/seen/number) and the message (android.title / android.text).
   */
  private parseNotifications(out: string): ParsedNotif[] {
    const results: ParsedNotif[] = [];
    let cur: ParsedNotif | null = null;
    const flush = () => {
      if (cur && cur.pkg) {
        cur.signature = `${cur.key}|${cur.when}`;
        results.push(cur);
      }
      cur = null;
    };
    for (const rawLine of out.split('\n')) {
      const header = /NotificationRecord\(.*?pkg=(\S+)/.exec(rawLine);
      if (header) {
        flush();
        cur = {
          pkg: header[1],
          key: (/key=([^\s:]+)/.exec(rawLine)?.[1]) || '',
          category: (/category=(\S+)/.exec(rawLine)?.[1]) || '',
          channel: (/channel=(\S+)/.exec(rawLine)?.[1]) || '',
          when: '',
          seen: false,
          title: '',
          text: '',
          number: '',
          signature: '',
        };
        continue;
      }
      const t = rawLine.trim();
      if (t === '--') { flush(); continue; }
      if (!cur) continue;
      if (t.startsWith('when=')) {
        cur.when = (/when=(\d+)/.exec(t)?.[1]) || cur.when;
      } else if (t.startsWith('seen=')) {
        cur.seen = /seen=true/.test(t);
      } else if (t.startsWith('number=')) {
        cur.number = (/number=(\d+)/.exec(t)?.[1]) || cur.number;
      } else if (t.startsWith('android.title=String')) {
        cur.title = (/android\.title=String \((.*)\)\s*$/.exec(t)?.[1]) || cur.title;
      } else if (t.startsWith('android.text=String')) {
        cur.text = (/android\.text=String \((.*)\)\s*$/.exec(t)?.[1]) || cur.text;
      } else if (!cur.text && t.startsWith('tickerText=')) {
        cur.text = t.slice('tickerText='.length).trim();
      }
    }
    flush();
    return results;
  }

  // ---------------------------------------------------------------------------
  // Layer 0b: frame-diff signal from renderer
  // ---------------------------------------------------------------------------
  private onScreenSignal() {
    if (!this.running) return;
    if (Date.now() < this.suppressedUntil) return;
    if (this.classifying || this.visionAgent.isBusy()) return;
    // Screen path has no cheap text; classifier will use a screenshot.
    void this.handleCandidate('screen', '');
  }

  // ---------------------------------------------------------------------------
  // Layer 1 + Layer 2: gate, then act
  // ---------------------------------------------------------------------------
  private async handleCandidate(source: 'notification' | 'screen', contextText: string) {
    if (!this.running || this.classifying || this.visionAgent.isBusy()) return;
    if (Date.now() < this.suppressedUntil) return;

    this.classifying = true;
    try {
      this.log('status', `检测到${source === 'notification' ? '新通知' : '画面变化'}，正在用便宜模型判断…`);

      let screenshot: string | undefined;
      if (source === 'screen') {
        try {
          screenshot = await this.visionAgent.captureScreenshot();
        } catch {
          /* best-effort; classifier can still reason from condition alone */
        }
      }

      const result = await EventClassifier.classify({
        condition: this.condition,
        contextText,
        screenshotBase64: screenshot,
        model: this.settings?.classifierModel || 'gemini-3-flash-preview',
        source,
      });

      if (!this.running) return;

      if (!result.shouldAct) {
        this.log('status', `已忽略：${result.reason || '不是目标事件'}`);
        return;
      }

      this.log('thought', this.describeEvent(result));

      // Suppress detection while the agent operates the screen.
      this.suppressedUntil = Number.MAX_SAFE_INTEGER;
      this.triggerCount++;

      const task = this.buildActionTask(result);
      await this.visionAgent.runTask(task, this.config?.skillName ?? null);

      // The agent's own actions changed the screen/notifications: re-seed baseline,
      // then start a cooldown before detection resumes.
      if (this.config?.triggers.notification) {
        await this.reseedBaseline();
      }
      const cooldown = this.settings?.cooldownMs ?? 8000;
      this.suppressedUntil = Date.now() + cooldown;
      this.log('status', `已完成回复动作，冷却 ${Math.round(cooldown / 1000)}s 后恢复检测。`);

      const max = this.config?.stop.maxTriggers;
      if (max && this.triggerCount >= max) {
        this.stop(`已达到最大触发次数 (${max})。`);
      }
    } catch (e: any) {
      this.log('status', `值守处理出错：${e?.message || e}`);
      // Make sure detection can resume even if the action threw.
      if (this.suppressedUntil === Number.MAX_SAFE_INTEGER) {
        this.suppressedUntil = Date.now() + (this.settings?.cooldownMs ?? 8000);
      }
    } finally {
      this.classifying = false;
    }
  }

  private describeEvent(r: ClassifyResult): string {
    const parts = [`事件确认：${r.reason}`];
    if (r.sender) parts.push(`来自：${r.sender}`);
    if (r.message) parts.push(`内容："${r.message}"`);
    return parts.join(' | ');
  }

  private buildActionTask(r: ClassifyResult): string {
    const base = this.action || '根据消息内容自动回复。';
    const ctx: string[] = [];
    if (r.sender) ctx.push(`发信人: ${r.sender}`);
    if (r.message) ctx.push(`收到的消息: "${r.message}"`);
    const ctxStr = ctx.length ? `\n\n上下文:\n${ctx.join('\n')}` : '';
    return `${base}${ctxStr}\n\n请打开对应的聊天会话，理解消息后生成并发送一条得体的回复。发送完成后停止，不要执行多余操作。`;
  }

  // ---------------------------------------------------------------------------
  // Renderer notifications
  // ---------------------------------------------------------------------------
  private getWindow(): BrowserWindow | undefined {
    return BrowserWindow.getAllWindows()[0];
  }

  private notifyStatus(running: boolean) {
    this.getWindow()?.webContents.send('watch:status-change', { running });
  }

  private enableFrameDiff(enabled: boolean) {
    this.getWindow()?.webContents.send('watch:enable-framediff', enabled);
  }

  private log(type: 'thought' | 'action' | 'status', message: string) {
    this.getWindow()?.webContents.send('watch:log', { type, message });
    console.log(`[Watch ${type.toUpperCase()}] ${message}`);
  }
}
