import { makeAutoObservable, runInAction } from 'mobx';

import { fetchGeofenceEvents, type MapEvent } from '../api/events';
import type { ViewportCap } from '../api/pings';

function isAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError';
}

/** Holds analytics events (currently geofence enter/exit) for the map. */
export class EventStore {
  geofence: MapEvent[] = [];

  controller: AbortController | null = null;

  constructor() {
    makeAutoObservable(this, { controller: false });
  }

  /** Load geofence events within the given ISO range + viewport cap. */
  async loadGeofence(fromIso: string, toIso: string, cap?: ViewportCap | null): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    try {
      const events = await fetchGeofenceEvents(fromIso, toIso, cap, controller.signal);
      if (this.controller !== controller) return;
      runInAction(() => {
        this.geofence = events;
      });
    } catch (error) {
      if (!isAbort(error)) console.error('Failed to load geofence events:', error);
    }
  }
}
