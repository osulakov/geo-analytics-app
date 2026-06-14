import { makeAutoObservable, runInAction } from 'mobx';

import { ANALYSES, type AnalysisConfig } from '../analyses_configs';
import { aoisToWkt } from '../analyses_configs/wkt';
import { runQuery } from '../data_loaders/query';
import type { MapEvent } from '../data_loaders/events';
import type { Aoi } from './AoiStore';

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

  constructor() {
    makeAutoObservable(this);
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

  get addedConfigs(): AnalysisConfig[] {
    return this.added
      .map((id) => ANALYSES.find((a) => a.id === id))
      .filter((a): a is AnalysisConfig => Boolean(a));
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
    const wkt = aoisToWkt(aois);
    this.running = true;
    try {
      const results: JobResult[] = [];
      for (const config of configs) {
        const { sql, params } = config.buildQuery(wkt, fromIso, toIso);
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
}
