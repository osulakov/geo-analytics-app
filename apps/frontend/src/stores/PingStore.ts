import { makeAutoObservable, runInAction } from 'mobx';

import { fetchLatestPings, type LatestPing } from '../api/pings';

/** Holds the latest ping per vessel for plotting on the globe. */
export class PingStore {
  pings: LatestPing[] = [];
  loaded = false;

  constructor() {
    makeAutoObservable(this);
  }

  async load(): Promise<void> {
    try {
      const pings = await fetchLatestPings();
      runInAction(() => {
        this.pings = pings;
        this.loaded = true;
      });
    } catch (error) {
      console.error('Failed to load latest pings:', error);
    }
  }
}
