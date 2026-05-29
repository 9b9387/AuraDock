import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Radar, Bell, MonitorSmartphone, Sparkles, Play, Power, PackageOpen } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

export interface WatchSkillMeta {
  packages: string[];
  keywords: string[];
  condition: string;
  action: string;
}

export interface SkillSummary {
  name: string;
  description: string;
  watch?: WatchSkillMeta;
}

type WatchStopMode = 'manual' | 'duration' | 'until';

interface WatchConfig {
  skillName: string;
  triggers: { notification: boolean; screenDiff: boolean };
  stop: { mode: WatchStopMode; durationMs?: number; until?: number; maxTriggers?: number };
}

const DEFAULT_CONFIG: WatchConfig = {
  skillName: '',
  triggers: { notification: true, screenDiff: false },
  stop: { mode: 'manual', durationMs: 30 * 60 * 1000 },
};

interface WatchModePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  running: boolean;
  activeSerial: string | null;
  skills: SkillSummary[];
  onLoadSkills?: () => void;
}

export const WatchModePanel: React.FC<WatchModePanelProps> = ({
  open,
  onOpenChange,
  running,
  activeSerial,
  skills,
  onLoadSkills,
}) => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<WatchConfig>(DEFAULT_CONFIG);
  const [durationMin, setDurationMin] = useState<number>(30);
  const [untilLocal, setUntilLocal] = useState<string>('');
  const [maxTriggers, setMaxTriggers] = useState<string>('');

  // Only skills that declare metadata.watch can drive watch mode.
  const watchSkills = useMemo(() => skills.filter((s) => !!s.watch), [skills]);
  const selectedSkill = useMemo(
    () => watchSkills.find((s) => s.name === config.skillName) || null,
    [watchSkills, config.skillName]
  );

  // Load persisted config + refresh skills whenever the panel opens.
  useEffect(() => {
    if (!open) return;
    onLoadSkills?.();
    (window as any).adb.watch.getStatus().then((s: { config: WatchConfig | null }) => {
      if (s?.config) {
        const c = { ...DEFAULT_CONFIG, ...s.config, stop: { ...DEFAULT_CONFIG.stop, ...s.config.stop } };
        setConfig(c);
        if (c.stop.durationMs) setDurationMin(Math.round(c.stop.durationMs / 60000));
        if (c.stop.maxTriggers) setMaxTriggers(String(c.stop.maxTriggers));
        if (c.stop.until) {
          const d = new Date(c.stop.until);
          const pad = (n: number) => String(n).padStart(2, '0');
          setUntilLocal(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
        }
      }
    }).catch(() => {});
  }, [open, onLoadSkills]);

  const patch = (p: Partial<WatchConfig>) => setConfig((prev) => ({ ...prev, ...p }));
  const patchStop = (p: Partial<WatchConfig['stop']>) =>
    setConfig((prev) => ({ ...prev, stop: { ...prev.stop, ...p } }));

  const buildConfig = (): WatchConfig => {
    const stop: WatchConfig['stop'] = { mode: config.stop.mode };
    if (config.stop.mode === 'duration') stop.durationMs = Math.max(1, durationMin) * 60000;
    if (config.stop.mode === 'until' && untilLocal) stop.until = new Date(untilLocal).getTime();
    const max = parseInt(maxTriggers, 10);
    if (!Number.isNaN(max) && max > 0) stop.maxTriggers = max;
    return { skillName: config.skillName, triggers: config.triggers, stop };
  };

  const isValid = useMemo(() => {
    if (!activeSerial) return false;
    if (!config.skillName || !selectedSkill) return false;
    if (!config.triggers.notification && !config.triggers.screenDiff) return false;
    if (config.stop.mode === 'until' && !untilLocal) return false;
    return true;
  }, [activeSerial, config, selectedSkill, untilLocal]);

  const handleStart = () => {
    const c = buildConfig();
    (window as any).adb.watch.updateConfig(c);
    (window as any).adb.watch.start(c);
    onOpenChange(false);
  };

  const handleStop = () => {
    (window as any).adb.watch.stop();
  };

  const labelCls = 'text-xs font-semibold text-zinc-600 dark:text-zinc-300';
  const sectionCls = 'flex flex-col gap-2';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radar className="w-4 h-4 text-emerald-500" />
            {t('watch.title') || '值守模式'}
            {running && (
              <Badge className="bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />
                {t('watch.running') || '监听中'}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {t('watch.description') || '由 Watch Skill 驱动：选择一个 Skill 即可，监听条件、动作与 App 导航均来自它。空闲时零 token。'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          {/* Watch Skill (the app pack) */}
          <div className={sectionCls}>
            <label className={`${labelCls} flex items-center gap-1`}>
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
              {t('watch.skill') || '值守 Skill（每个 App 一个）'}
            </label>
            {watchSkills.length === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                <PackageOpen className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{t('watch.noWatchSkills') || '未找到值守 Skill。请在 Skills 目录创建带 metadata.watch（packages/keywords/condition/action）的 SKILL.md。'}</span>
              </div>
            ) : (
              <Select value={config.skillName} onValueChange={(v) => patch({ skillName: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('watch.selectSkill') || '选择一个值守 Skill'} />
                </SelectTrigger>
                <SelectContent>
                  {watchSkills.map((s) => (
                    <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Read-only preview of what the selected skill watches/does */}
            {selectedSkill?.watch && (
              <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 px-3 py-2.5">
                {selectedSkill.description && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">{selectedSkill.description}</p>
                )}
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-2 text-xs">
                    <span className="shrink-0 font-semibold text-zinc-500 dark:text-zinc-400 w-12">{t('watch.watches') || '监听'}</span>
                    <span className="text-zinc-700 dark:text-zinc-200">{selectedSkill.watch.condition || '—'}</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="shrink-0 font-semibold text-zinc-500 dark:text-zinc-400 w-12">{t('watch.does') || '动作'}</span>
                    <span className="text-zinc-700 dark:text-zinc-200">{selectedSkill.watch.action || '—'}</span>
                  </div>
                  {(selectedSkill.watch.packages.length > 0 || selectedSkill.watch.keywords.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">{t('watch.prefilter') || '预过滤'}</span>
                      {[...selectedSkill.watch.packages, ...selectedSkill.watch.keywords].slice(0, 8).map((h) => (
                        <Badge key={h} variant="secondary" className="text-[10px] font-normal">{h}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Triggers */}
          <div className={sectionCls}>
            <label className={labelCls}>{t('watch.triggers') || '检测信号 (零 token)'}</label>
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Bell className="w-4 h-4 text-zinc-500 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-zinc-800 dark:text-zinc-100">{t('watch.triggerNotification') || '通知监听'}</span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">{t('watch.triggerNotificationDesc') || '轮询系统通知，推送式近实时'}</span>
                </div>
              </div>
              <Switch
                checked={config.triggers.notification}
                onCheckedChange={(v) => patch({ triggers: { ...config.triggers, notification: v } })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <MonitorSmartphone className="w-4 h-4 text-zinc-500 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-zinc-800 dark:text-zinc-100">{t('watch.triggerScreen') || '画面变化'}</span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">{t('watch.triggerScreenDesc') || '感知哈希帧差分，纯前端无 token'}</span>
                </div>
              </div>
              <Switch
                checked={config.triggers.screenDiff}
                onCheckedChange={(v) => patch({ triggers: { ...config.triggers, screenDiff: v } })}
              />
            </div>
          </div>

          {/* Stop policy */}
          <div className={sectionCls}>
            <label className={labelCls}>{t('watch.stopPolicy') || '停止方式'}</label>
            <Select
              value={config.stop.mode}
              onValueChange={(v) => patchStop({ mode: v as WatchStopMode })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">{t('watch.stopManual') || '手动停止'}</SelectItem>
                <SelectItem value="duration">{t('watch.stopDuration') || '运行一段时间后停止'}</SelectItem>
                <SelectItem value="until">{t('watch.stopUntil') || '到指定时间停止'}</SelectItem>
              </SelectContent>
            </Select>

            {config.stop.mode === 'duration' && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={durationMin}
                  onChange={(e) => setDurationMin(parseInt(e.target.value, 10) || 0)}
                  className="w-24"
                />
                <span className="text-xs text-zinc-500">{t('watch.minutes') || '分钟'}</span>
              </div>
            )}
            {config.stop.mode === 'until' && (
              <Input
                type="datetime-local"
                value={untilLocal}
                onChange={(e) => setUntilLocal(e.target.value)}
              />
            )}

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">{t('watch.maxTriggers') || '最多触发次数 (可选)'}</span>
              <Input
                type="number"
                min={1}
                value={maxTriggers}
                onChange={(e) => setMaxTriggers(e.target.value)}
                placeholder="∞"
                className="w-24"
              />
            </div>
          </div>

          {!activeSerial && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t('watch.noDevice') || '请先连接并镜像一台设备后再启动值守。'}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          {running ? (
            <Button variant="destructive" onClick={handleStop}>
              <Power className="w-4 h-4" />
              {t('watch.stop') || '停止值守'}
            </Button>
          ) : (
            <Button
              onClick={handleStart}
              disabled={!isValid}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <Play className="w-4 h-4 fill-current" />
              {t('watch.start') || '启动值守'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
