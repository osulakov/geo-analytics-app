import { makeAutoObservable, runInAction } from 'mobx';

import type { AuthStore } from './AuthStore';

export interface SaveJobInput {
  name: string;
  analysisConfigId: string;
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

  constructor(private auth: AuthStore) {
    makeAutoObservable(this, { auth: false } as never);
  }

  get canSave(): boolean {
    return Boolean(this.auth.token);
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
