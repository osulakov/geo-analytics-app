import { makeAutoObservable, runInAction } from 'mobx';

import type { AnalysisSettings } from '../analyses_configs';
import type { AuthStore } from './AuthStore';

export interface SaveJobInput {
  name: string;
  analysisConfigId: string;
  /** The analysis settings the job ran with (detection toggles, vessels). */
  analysisConfig: AnalysisSettings | null;
  aoiWkt: string | null;
  fromIso: string | null;
  toIso: string | null;
  /** How many events the run produced (events themselves are not persisted). */
  eventCount: number;
}

/** A saved job as returned by the backend. */
export interface Job extends SaveJobInput {
  id: string;
  createdAt: string;
}

/** Saves analysis jobs (and their events) to the DB under the signed-in user. */
export class JobStore {
  saving = false;
  error: string | null = null;
  /** The signed-in user's saved jobs (most recent first). */
  jobs: Job[] = [];
  /** Jobs the user has opened/applied this session (most recent first). */
  applied: Job[] = [];

  constructor(private auth: AuthStore) {
    makeAutoObservable(this, { auth: false } as never);
  }

  get canSave(): boolean {
    return Boolean(this.auth.token);
  }

  isApplied(id: string): boolean {
    return this.applied.some((j) => j.id === id);
  }

  /** Add a job to the applied list (most recent first; no duplicates). */
  apply(job: Job): void {
    this.applied = [job, ...this.applied.filter((j) => j.id !== job.id)];
  }

  unapply(id: string): void {
    this.applied = this.applied.filter((j) => j.id !== id);
  }

  /** Drop all applied jobs (Discard). */
  clearApplied(): void {
    this.applied = [];
  }

  /** Fetch the signed-in user's saved jobs into `jobs`. */
  async loadJobs(): Promise<void> {
    if (!this.auth.token) {
      runInAction(() => {
        this.jobs = [];
      });
      return;
    }
    try {
      const res = await fetch('/jobs', { headers: { Authorization: `Bearer ${this.auth.token}` } });
      if (!res.ok) return;
      const data = (await res.json()) as Job[];
      runInAction(() => {
        this.jobs = data;
      });
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  }

  async save(input: SaveJobInput): Promise<boolean> {
    if (!this.auth.token) {
      this.error = 'You must be signed in to save a job';
      return false;
    }
    this.saving = true;
    this.error = null;
    try {
      const res = await fetch('/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.auth.token}` },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        runInAction(() => {
          this.error = data.error ?? 'Failed to save job';
        });
        return false;
      }
      // Prepend the newly-saved job so Recent jobs reflects it immediately.
      const created = (await res.json()) as Job;
      runInAction(() => {
        this.jobs = [created, ...this.jobs];
      });
      return true;
    } catch {
      runInAction(() => {
        this.error = 'Could not reach the server';
      });
      return false;
    } finally {
      runInAction(() => {
        this.saving = false;
      });
    }
  }
}
