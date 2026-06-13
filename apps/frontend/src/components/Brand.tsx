import { Link } from 'react-router-dom';

import { MainLogo } from '../assets/logo';

/** App logo with a glowing tagline, shown atop the left stack. The logo links
 *  back to the landing page. */
export function Brand() {
  return (
    <div className="brand">
      <Link to="/" className="brand__logo" aria-label="Back to home">
        <MainLogo />
      </Link>
      <p className="brand__motto">Maritime intelligence for the modern fleet</p>
    </div>
  );
}
