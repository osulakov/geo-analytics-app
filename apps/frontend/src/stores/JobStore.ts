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

/** Saves analysis jobs (and their events) to the DB under the signed-in user. */
export class JobStore {
  saving = false;
  error: string | null = null;

  constructor(private auth: AuthStore) {
    makeAutoObservable(this, { auth: false } as never);
  }

  get canSave(): boolean {
    return Boolean(this.auth.token);
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
