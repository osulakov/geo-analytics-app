import { createContext, useContext, useRef, type ReactNode } from 'react';

import { RootStore } from './RootStore';

const StoreContext = createContext<RootStore | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  // One RootStore instance for the app lifetime.
  const storeRef = useRef<RootStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = new RootStore();
  }

  return <StoreContext.Provider value={storeRef.current}>{children}</StoreContext.Provider>;
}

export function useStores(): RootStore {
  const store = useContext(StoreContext);
  if (store === null) {
    throw new Error('useStores must be used within a StoreProvider');
  }
  return store;
}
