import { useEffect } from 'react';

import { ChatWidget } from '../components/ChatWidget';
import { GlobeCanvas } from '../components/GlobeCanvas';
import { GlobeControls } from '../components/GlobeControls';
import { fetchStaticVesselInfo } from '../api/vessels';

export function LandingPage() {
  useEffect(() => {
    fetchStaticVesselInfo()
      .then((vessels) => console.log('static_vessel_info:', vessels))
      .catch((error) => console.error('Failed to load static_vessel_info:', error));
  }, []);

  return (
    <main
      style={{
        position: 'relative',
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 40%, #11151b 0%, #0b0d10 70%)',
      }}
    >
      <GlobeCanvas />
      <GlobeControls />
      <ChatWidget />
    </main>
  );
}
