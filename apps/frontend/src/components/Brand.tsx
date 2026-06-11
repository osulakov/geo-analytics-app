import { MainLogo } from '../assets/logo';

/** App logo with a glowing tagline, shown atop the left stack. */
export function Brand() {
  return (
    <div className="brand">
      <div className="brand__logo">
        <MainLogo />
      </div>
      <p className="brand__motto">Maritime intelligence for the modern fleet</p>
    </div>
  );
}
