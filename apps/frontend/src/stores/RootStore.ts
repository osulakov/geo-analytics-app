import { AuthStore } from './AuthStore';
import { ChatStore } from './ChatStore';
import { EventStore } from './EventStore';
import { GlobeStore } from './GlobeStore';
import { GroupStore } from './GroupStore';
import { LayerStore } from '../layers_visibilities/LayerStore';
import { PingStore } from './PingStore';
import { SatelliteStore } from './SatelliteStore';
import { VesselStore } from './VesselStore';

/** Aggregates all domain stores. New stores get wired in here. */
export class RootStore {
  auth: AuthStore;
  globe: GlobeStore;
  chat: ChatStore;
  ping: PingStore;
  vessel: VesselStore;
  satellite: SatelliteStore;
  group: GroupStore;
  layers: LayerStore;
  event: EventStore;

  constructor() {
    this.auth = new AuthStore();
    this.globe = new GlobeStore();
    this.chat = new ChatStore();
    this.ping = new PingStore();
    this.vessel = new VesselStore();
    this.satellite = new SatelliteStore();
    this.group = new GroupStore();
    this.layers = new LayerStore();
    this.event = new EventStore();
  }
}
