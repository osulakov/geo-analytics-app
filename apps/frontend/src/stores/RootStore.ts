import { ChatStore } from './ChatStore';
import { GlobeStore } from './GlobeStore';

/** Aggregates all domain stores. New stores get wired in here. */
export class RootStore {
  globe: GlobeStore;
  chat: ChatStore;

  constructor() {
    this.globe = new GlobeStore();
    this.chat = new ChatStore();
  }
}
