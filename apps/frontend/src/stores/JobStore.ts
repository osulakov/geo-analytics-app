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
  /** The applied job currently loaded into the create widgets for editing. */
  editingId: string | null = null;

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
    if (this.editingId === id) this.editingId = null;
  }

  /** Replace an applied job's fields (used to re-run an edited job in place). */
  updateApplied(id: string, patch: Partial<Job>): void {
    this.applied = this.applied.map((j) => (j.id === id ? { ...j, ...patch } : j));
  }

  /** The applied job being edited in the create widgets, if any. */
  setEditing(id: string | null): void {
    this.editingId = id;
  }

  /** Drop all applied jobs (Discard). */
  clearApplied(): void {
    this.applied = [];
    this.editingId = null;
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

  /** Create a job row in the DB and return it (used by analyses that need a
   *  job_id before they run, e.g. object detection). Prepends to `jobs` so it
   *  shows up in Recent jobs immediately. Returns null if not signed in / on error. */
  async createRemote(input: SaveJobInput): Promise<Job | null> {
    if (!this.auth.token) {
      this.error = 'You must be signed in to run this job';
      return null;
    }
    try {
      const res = await fetch('/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.auth.token}` },
        body: JSON.stringify(input),
      });
      if (!res.ok) return null;
      const created = (await res.json()) as Job;
      runInAction(() => {
        this.jobs = [created, ...this.jobs];
      });
      return created;
    } catch (error) {
      console.error('Failed to create job:', error);
      return null;
    }
  }

  /** Delete a saved job from the DB (its events + detections cascade). Removes
   *  it from the Recent jobs list; leaves the applied list untouched. */
  async deleteJob(id: string): Promise<boolean> {
    if (!this.auth.token) return false;
    try {
      const res = await fetch(`/jobs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.auth.token}` },
      });
      if (!res.ok && res.status !== 404) return false;
      runInAction(() => {
        this.jobs = this.jobs.filter((j) => j.id !== id);
      });
      return true;
    } catch (error) {
      console.error('Failed to delete job:', error);
      return false;
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
