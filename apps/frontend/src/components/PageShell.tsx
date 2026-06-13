import type { ReactNode } from 'react';

import { MainLogo } from '../assets/logo';
import { AuthBadge } from './AuthBadge';
import { SpinningGlobe } from './SpinningGlobe';

interface PageShellProps {
  children: ReactNode;
  /** Show the LAND·WATER·SPACE·AIR strip under the logo (default true). */
  showDomains?: boolean;
  /** Use the narrower panel (login/signup) instead of the wide landing one. */
  narrow?: boolean;
}

/**
 * Uniform layout for the public pages (/, /login, /signup): a spinning globe
 * background, a top-right auth badge, and a centered panel with the logo on
 * top. Each page supplies the panel body via `children`.
 */
export function PageShell({ children, showDomains = true, narrow = false }: PageShellProps) {
  return (
    <main className="landing">
      <SpinningGlobe />
      <AuthBadge />

      <div className={`landing__panel${narrow ? ' landing__panel--narrow' : ''}`}>
        <div className="landing__logo">
          <MainLogo />
        </div>

        {showDomains && (
          <div className="landing__domains">
            <span className="landing__domain landing__domain--land">Land</span>
            <span className="landing__domain-dot" />
            <span className="landing__domain landing__domain--water">Water</span>
            <span className="landing__domain-dot" />
            <span className="landing__domain landing__domain--space">Space</span>
            <span className="landing__domain-dot" />
            <span className="landing__domain landing__domain--air">Air</span>
          </div>
        )}

        {children}
      </div>
    </main>
  );
}
