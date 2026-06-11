import { ChatStore } from './ChatStore';
import { GlobeStore } from './GlobeStore';
import { GroupStore } from './GroupStore';
import { PingStore } from './PingStore';
import { VesselStore } from './VesselStore';

/** Aggregates all domain stores. New stores get wired in here. */
export class RootStore {
  globe: GlobeStore;
  chat: ChatStore;
  ping: PingStore;
  vessel: VesselStore;
  group: GroupStore;

  constructor() {
    this.globe = new GlobeStore();
    this.chat = new ChatStore();
    this.ping = new PingStore();
    this.vessel = new VesselStore();
    this.group = new GroupStore();
  }
}
