import { makeAutoObservable, runInAction } from 'mobx';

import { fetchEvents, type MapEvent } from '../data_loaders/events';
import type { ViewportCap } from '../data_loaders/pings';

function isAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError';
}

/**
 * Holds analytics events for the map. A single `/events` call fetches every
 * event type for the range + viewport; the result is split here by event_type
 * into plain arrays (geofence enter/exit and AIS-off) the renderer reads.
 */
export class EventStore {
  geofence: MapEvent[] = [];
  aisOff: MapEvent[] = [];
  /** When a job has been run, the map shows that job's events only and the
   *  viewport-driven DB fetch is suppressed. */
  jobMode = false;

  controller: AbortController | null = null;

  constructor() {
    makeAutoObservable(this, { controller: false });
  }

  /** Load all events within the given ISO range + viewport cap (one request),
   *  then split them by event type. No-op while showing a job's events. */
  async load(fromIso: string, toIso: string, cap?: ViewportCap | null): Promise<void> {
    if (this.jobMode) return;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    try {
      const events = await fetchEvents(fromIso, toIso, cap, controller.signal);
      if (this.controller !== controller) return;
      runInAction(() => {
        this.geofence = events.filter((e) => e.eventType === 'geofence_enter_exit');
        this.aisOff = events.filter((e) => e.eventType === 'ais_off');
      });
    } catch (error) {
      if (!isAbort(error)) console.error('Failed to load events:', error);
    }
  }

  /** Show a job's produced events (no DB fetch); future viewport loads are
   *  suppressed until `clearJob()`. */
  setJobEvents(events: MapEvent[]): void {
    this.controller?.abort();
    this.controller = null;
    this.jobMode = true;
    this.geofence = events.filter((e) => e.eventType === 'geofence_enter_exit');
    this.aisOff = events.filter((e) => e.eventType === 'ais_off');
  }

  /** Resume normal viewport-driven event loading. */
  clearJob(): void {
    this.jobMode = false;
    this.geofence = [];
    this.aisOff = [];
  }
}
