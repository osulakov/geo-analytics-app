import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

import { MainLogo } from '../assets/logo';
import { SpinningGlobe } from '../components/SpinningGlobe';

interface Workspace {
  id: string;
  name: string;
  description: string;
  to?: string;
}

const WORKSPACES: Workspace[] = [
  {
    id: 'maritime',
    name: 'Maritime',
    description: 'Vessel tracks, EEZ crossings & geofence events',
    to: '/explore',
  },
  {
    id: 'gnss',
    name: 'GNSS Interference',
    description: 'Jamming & spoofing detection',
  },
  {
    id: 'land-usage',
    name: 'Land Usage',
    description: 'Terrain & land-cover change',
  },
  {
    id: 'object-detection',
    name: 'Object Detections',
    description: 'Imagery-derived object detections',
  },
];

interface Scenario {
  sector: string;
  name: string;
  description: string;
  layers: string[];
}

const SCENARIOS: Scenario[] = [
  // Military / Defense
  {
    sector: 'Military',
    name: 'Dark-Vessel Hunting',
    description: 'Flag vessels going AIS-dark inside a jamming zone, then task imagery to relocate them.',
    layers: ['Maritime', 'GNSS', 'Object Det'],
  },
  {
    sector: 'Military',
    name: 'Spoofing-Corridor Mapping',
    description: 'Correlate position-spoofing clusters with contested straits to map electronic-warfare corridors.',
    layers: ['GNSS', 'Maritime'],
  },
  {
    sector: 'Military',
    name: 'Naval Base Activity Index',
    description: 'Count ships, aircraft & vehicles across passes; flag new construction as a readiness signal.',
    layers: ['Object Det', 'Satellites', 'Land Usage'],
  },
  {
    sector: 'Military',
    name: 'Amphibious Staging Detection',
    description: 'Detect landing-craft concentrations offshore plus new vehicle hardstand onshore.',
    layers: ['Maritime', 'Object Det'],
  },
  {
    sector: 'Military',
    name: 'Sanctions-Evasion STS Transfers',
    description: 'Detect rafted vessels loitering outside port, confirmed by imagery and AIS gaps.',
    layers: ['Maritime', 'Object Det'],
  },
  // Supply Chain / Logistics
  {
    sector: 'Supply Chain',
    name: 'Port Congestion Early-Warning',
    description: 'Anchorage dwell-time + counted ships and box stacks to forecast berth delays.',
    layers: ['Maritime', 'Object Det'],
  },
  {
    sector: 'Supply Chain',
    name: 'Chokepoint Disruption Monitor',
    description: 'Throughput at Hormuz/Suez plus interference spikes that force reroutes and raise risk.',
    layers: ['Maritime', 'GNSS'],
  },
  {
    sector: 'Supply Chain',
    name: 'Commodity-Flow Nowcasting',
    description: 'Tanker/bulker counts + terminal fill levels to estimate exports before official stats.',
    layers: ['Maritime', 'Object Det'],
  },
  {
    sector: 'Supply Chain',
    name: 'Re-Routing Under GNSS Denial',
    description: 'Map jamming footprints over road networks so fleets pre-plan dead-reckoning fallbacks.',
    layers: ['GNSS', 'Land Usage'],
  },
  {
    sector: 'Supply Chain',
    name: 'Cold-Chain Reefer Surge',
    description: 'Reefer-ship arrivals + counted reefer containers to anticipate perishable surges.',
    layers: ['Maritime', 'Object Det'],
  },
  // Commercial / Markets
  {
    sector: 'Commercial',
    name: 'Refinery & Terminal Utilization',
    description: 'Floating-roof tank levels + inbound tanker cadence as an energy-market trading signal.',
    layers: ['Object Det', 'Satellites', 'Maritime'],
  },
  {
    sector: 'Commercial',
    name: 'Retail Demand Proxy',
    description: 'Parking-lot car counts and DC truck activity as a same-store-sales indicator.',
    layers: ['Object Det', 'Land Usage'],
  },
  {
    sector: 'Commercial',
    name: 'Mine & Quarry Output',
    description: 'Pit expansion and stockpile change paired with bulk-carrier loadings at the export port.',
    layers: ['Land Usage', 'Object Det', 'Maritime'],
  },
  {
    sector: 'Commercial',
    name: 'Cargo Insurance Scoring',
    description: 'Route piracy exposure, EEZ-crossing frequency and interference incidents to price policies.',
    layers: ['Maritime', 'GNSS'],
  },
  {
    sector: 'Commercial',
    name: 'Competitor Capacity Intel',
    description: 'Track build-out at rivals’ plants, warehouses and data centers over repeat passes.',
    layers: ['Object Det', 'Satellites'],
  },
  // Real Estate / Infrastructure
  {
    sector: 'Real Estate',
    name: 'Construction Progress',
    description: 'Footprint growth, crane counts and material staging to validate developer milestones.',
    layers: ['Land Usage', 'Object Det', 'Satellites'],
  },
  {
    sector: 'Real Estate',
    name: 'Greenfield Site Selection',
    description: 'Screen coastal parcels for port access, vessel traffic and land-cover constraints.',
    layers: ['Land Usage', 'Maritime'],
  },
  {
    sector: 'Real Estate',
    name: 'Distressed-Asset Detection',
    description: 'Empty lots, stalled construction or vegetation reclaiming a site as early distress signals.',
    layers: ['Object Det', 'Land Usage'],
  },
  // Agriculture
  {
    sector: 'Agriculture',
    name: 'Crop-Health & Export Linkage',
    description: 'Land-cover yield estimates tied to grain-terminal queues and bulk-carrier departures.',
    layers: ['Land Usage', 'Object Det', 'Maritime'],
  },
  {
    sector: 'Agriculture',
    name: 'Water-Stress Under GNSS Denial',
    description: 'Detect field-level stress while flagging regions where precision-ag autosteer degrades.',
    layers: ['Land Usage', 'GNSS'],
  },
];

/** Sector display order for the scenarios modal. */
const SECTORS = ['Military', 'Supply Chain', 'Commercial', 'Real Estate', 'Agriculture'];

/**
 * Entry page: a spinning globe behind a centered workspace chooser. Only the
 * Maritime workspace is wired up (→ /explore); the others are placeholders.
 */
export function LandingPage() {
  const navigate = useNavigate();
  const [problem, setProblem] = useState('');
  const [showMore, setShowMore] = useState(false);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setProblem('');
  };

  return (
    <main className="landing">
      <SpinningGlobe />

      <div className="landing__panel">
        <div className="landing__logo">
          <MainLogo />
        </div>

        <div className="landing__domains">
          <span className="landing__domain landing__domain--land">Land</span>
          <span className="landing__domain-dot" />
          <span className="landing__domain landing__domain--water">Water</span>
          <span className="landing__domain-dot" />
          <span className="landing__domain landing__domain--space">Space</span>
          <span className="landing__domain-dot" />
          <span className="landing__domain landing__domain--air">Air</span>
        </div>

        <div className="landing__prompt">Choose a workspace</div>

        <div className="landing__workspaces">
          {WORKSPACES.map((workspace) => {
            const enabled = Boolean(workspace.to);
            return (
              <button
                key={workspace.id}
                type="button"
                className={`workspace-card${enabled ? '' : ' is-disabled'}`}
                disabled={!enabled}
                onClick={() => workspace.to && navigate(workspace.to)}
              >
                <span className="workspace-card__name">{workspace.name}</span>
                <span className="workspace-card__desc">{workspace.description}</span>
                {!enabled && <span className="workspace-card__badge">Soon</span>}
              </button>
            );
          })}
        </div>

        <button type="button" className="landing__more" onClick={() => setShowMore(true)}>
          More options
        </button>

        <form className="chat-widget__input landing__chat" onSubmit={handleSubmit}>
          <input
            type="text"
            value={problem}
            onChange={(event) => setProblem(event.target.value)}
            placeholder="Describe your problem"
            aria-label="Describe your problem"
          />
          <button type="submit" aria-label="Send" disabled={problem.trim().length === 0}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.993.993 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
            </svg>
          </button>
        </form>
      </div>

      {showMore &&
        createPortal(
          <div className="more-modal__overlay" onClick={() => setShowMore(false)}>
            <div className="more-modal" onClick={(event) => event.stopPropagation()}>
              <div className="more-modal__header">
                <span className="more-modal__title">All scenarios</span>
                <button
                  type="button"
                  className="more-modal__close"
                  aria-label="Close"
                  onClick={() => setShowMore(false)}
                >
                  ×
                </button>
              </div>

              <div className="scenario-sections">
                {SECTORS.map((sector) => (
                  <section key={sector} className="scenario-section">
                    <h3 className="scenario-section__title">{sector}</h3>
                    <div className="scenario-grid">
                      {SCENARIOS.filter((scenario) => scenario.sector === sector).map(
                        (scenario) => (
                          <div key={scenario.name} className="scenario-card">
                            <span className="scenario-card__name">{scenario.name}</span>
                            <span className="scenario-card__desc">{scenario.description}</span>
                            <span className="scenario-card__layers">
                              {scenario.layers.map((layer) => (
                                <span key={layer} className="scenario-tag">
                                  {layer}
                                </span>
                              ))}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </main>
  );
}
