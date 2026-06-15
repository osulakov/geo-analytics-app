import { makeAutoObservable, runInAction } from 'mobx';

import {
  ANALYSES,
  type AnalysisConfig,
  type AnalysisSettings,
  type SupportedWidget,
} from '../analyses_configs';
import { aoisToWkt } from '../analyses_configs/wkt';
import { runQuery } from '../data_loaders/query';
import type { MapEvent } from '../data_loaders/events';
import type { Aoi } from './AoiStore';

function defaultSettingsFor(id: string): AnalysisSettings {
  const config = ANALYSES.find((a) => a.id === id);
  return config
    ? { ...config.defaultSettings, mmsis: [...config.defaultSettings.mmsis] }
    : { detectEezCrossing: true, detectAoiCrossing: false, mmsis: [] };
}

export interface JobResult {
  analysisId: string;
  analysisName: string;
  rows: Record<string, unknown>[];
}

/**
 * Holds the user's selected ("Added") analyses and runs them. A run executes
 * each added analysis' query scoped to the given AOIs (or globally when none)
 * and the supplied date range.
 */
export class AnalysisStore {
  added: string[] = [];
  running = false;
  lastResults: JobResult[] = [];
  /** True when the current results came from opening a saved job (Save → "Save
   *  As"); false after a fresh Run Job. */
  fromSavedJob = false;
  /** Name of the opened saved job (prefilled into the Save As modal). */
  openedJobName: string | null = null;
  /** Per-analysis settings, keyed by analysis id (defaults applied lazily). */
  settingsById: Record<string, AnalysisSettings> = {};

  constructor() {
    makeAutoObservable(this);
  }

  /** Current settings for an analysis (its defaults until edited). */
  getSettings(id: string): AnalysisSettings {
    return this.settingsById[id] ?? defaultSettingsFor(id);
  }

  /** Merge a settings patch for an analysis. */
  setSettings(id: string, patch: Partial<AnalysisSettings>): void {
    this.settingsById = {
      ...this.settingsById,
      [id]: { ...this.getSettings(id), ...patch },
    };
  }

  isAdded(id: string): boolean {
    return this.added.includes(id);
  }

  add(id: string): void {
    if (!this.added.includes(id)) this.added = [...this.added, id];
  }

  remove(id: string): void {
    this.added = this.added.filter((x) => x !== id);
  }

  /** Clear all selected analyses, results and per-analysis settings (Discard). */
  reset(): void {
    this.added = [];
    this.lastResults = [];
    this.fromSavedJob = false;
    this.openedJobName = null;
    this.settingsById = {};
  }

  /** Replace the Added list with the given analysis ids (known ones only). */
  setAdded(ids: string[]): void {
    this.added = ids.filter((id) => ANALYSES.some((a) => a.id === id));
  }

  /** Remember the opened saved job's name (for the Save As modal). */
  setOpenedJobName(name: string | null): void {
    this.openedJobName = name;
  }

  get addedConfigs(): AnalysisConfig[] {
    return this.added
      .map((id) => ANALYSES.find((a) => a.id === id))
      .filter((a): a is AnalysisConfig => Boolean(a));
  }

  /** Whether any added analysis lists the given widget in supported_widgets. */
  supportsWidget(widget: SupportedWidget): boolean {
    return this.addedConfigs.some((c) => c.supported_widgets.includes(widget));
  }

  /** Flattened result rows as map events (for rendering the produced events). */
  get resultEvents(): MapEvent[] {
    return this.lastResults.flatMap((result) => {
      const config = ANALYSES.find((a) => a.id === result.analysisId);
      const eventType = config?.eventType ?? '';
      return result.rows.map((row) => ({
        mmsi: String(row.mmsi ?? ''),
        eventType,
        subtype: (row.subtype as string | null) ?? null,
        ts: String(row.ts ?? ''),
        lon: Number(row.lon),
        lat: Number(row.lat),
        details: (row.details as Record<string, unknown> | null) ?? null,
      }));
    });
  }

  /** Run every added analysis for the given AOIs (or global) and date range. */
  async run(aois: Aoi[], fromIso: string | null, toIso: string | null): Promise<JobResult[]> {
    const configs = this.addedConfigs;
    if (configs.length === 0 || this.running) return [];
    this.fromSavedJob = false;
    this.openedJobName = null;
    const wkt = aoisToWkt(aois);
    this.running = true;
    try {
      const results: JobResult[] = [];
      for (const config of configs) {
        const { sql, params } = config.buildQuery(wkt, fromIso, toIso, this.getSettings(config.id));
        const rows = await runQuery(sql, params);
        results.push({ analysisId: config.id, analysisName: config.name, rows });
        console.log(
          `[Run Job] ${config.name} — ${rows.length} rows (AOI: ${wkt ? 'scoped' : 'global'})`,
        );
      }
      runInAction(() => {
        this.lastResults = results;
      });
      return results;
    } catch (error) {
      console.error('Run Job failed:', error);
      return [];
    } finally {
      runInAction(() => {
        this.running = false;
      });
    }
  }

  /**
   * Run several saved jobs and combine their results. Each job runs its own
   * analysis query (with its saved AOI/date range/settings); the combined
   * events are stored as `lastResults` and returned.
   */
  async runJobs(
    jobs: {
      analysisConfigId: string;
      wkt: string | null;
      fromIso: string | null;
      toIso: string | null;
      settings?: AnalysisSettings;
    }[],
  ): Promise<MapEvent[]> {
    if (this.running) return this.resultEvents;
    this.fromSavedJob = true;
    this.running = true;
    try {
      const results: JobResult[] = [];
      for (const j of jobs) {
        const config = ANALYSES.find((a) => a.id === j.analysisConfigId);
        if (!config) continue;
        const settings = j.settings ?? this.getSettings(j.analysisConfigId);
        const { sql, params } = config.buildQuery(j.wkt, j.fromIso, j.toIso, settings);
        const rows = await runQuery(sql, params);
        results.push({ analysisId: config.id, analysisName: config.name, rows });
      }
      runInAction(() => {
        this.lastResults = results;
      });
      return this.resultEvents;
    } catch (error) {
      console.error('Apply jobs failed:', error);
      return [];
    } finally {
      runInAction(() => {
        this.running = false;
      });
    }
  }

  /**
   * Re-run a single saved job: execute its analysis' query against the stored
   * AOI WKT + date range, store the result, and return the produced events.
   * (Saved jobs persist only metadata, so the events are recomputed.)
   */
  async runConfig(
    analysisConfigId: string,
    wkt: string | null,
    fromIso: string | null,
    toIso: string | null,
    settings?: AnalysisSettings,
  ): Promise<MapEvent[]> {
    const config = ANALYSES.find((a) => a.id === analysisConfigId);
    if (!config || this.running) return [];
    this.fromSavedJob = true;
    // Restore the job's saved settings so the modal + a later run reflect them.
    if (settings) this.setSettings(analysisConfigId, settings);
    this.running = true;
    try {
      const { sql, params } = config.buildQuery(wkt, fromIso, toIso, this.getSettings(analysisConfigId));
      const rows = await runQuery(sql, params);
      runInAction(() => {
        this.lastResults = [{ analysisId: config.id, analysisName: config.name, rows }];
      });
      return this.resultEvents;
    } catch (error) {
      console.error('Open Job failed:', error);
      return [];
    } finally {
      runInAction(() => {
        this.running = false;
      });
    }
  }
}
