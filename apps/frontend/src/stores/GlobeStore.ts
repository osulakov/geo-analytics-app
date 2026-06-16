import { makeAutoObservable } from 'mobx';

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 1000;

const MAX_PHI = 89;
const DEFAULT_PHI = -12;
const ZOOM_STEP = 1.3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * View + interaction state for the landing-page globe. The render loop reads
 * these values every frame (see GlobeCanvas); the controls UI and gesture
 * handlers mutate them through the actions below.
 */
export class GlobeStore {
  /**
   * Auto-rotation speed in revolutions per minute. Real time at speed 1×: one
   * full rotation per 24 h (1440 min), i.e. the Earth's actual rotation rate.
   */
  rpm = 1 / 1440;

  /** Whether the globe is auto-rotating. */
  spinning = false;

  /** Playback speed multiplier for spin + satellite motion (1, 2, 5, 10). */
  speed = 1;

  /** Scale multiplier applied to the base projection radius. */
  zoom = 1;

  /** Rotation around the polar axis, in degrees (longitude at centre). */
  rotationLambda = 0;

  /** Tilt of the globe, in degrees (passed to the projection's 2nd angle). */
  rotationPhi = DEFAULT_PHI;

  /** Whether the latitude/longitude grid (graticule) is drawn. */
  showGraticule = true;

  /** Whether the Exclusive Economic Zone (EEZ) boundaries are drawn. */
  showEez = false;

  /** A user-dropped pin (lon/lat), shown on the globe. Null when none. */
  pin: { lon: number; lat: number } | null = null;

  /** Smooth "fly to" animation state. */
  flying = false;
  private targetLambda = 0;
  private targetPhi = DEFAULT_PHI;
  // Target zoom for the current flight, or null to leave zoom unchanged.
  private targetZoom: number | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  /** Degrees of longitude the globe advances per millisecond when spinning. */
  get degreesPerMs(): number {
    return (this.rpm * 360) / 60_000;
  }

  get canZoomIn(): boolean {
    return this.zoom < MAX_ZOOM;
  }

  get canZoomOut(): boolean {
    return this.zoom > MIN_ZOOM;
  }

  /** Advance the auto-rotation by the elapsed frame time. */
  advanceSpin(dtMs: number): void {
    this.rotationLambda = (this.rotationLambda + this.degreesPerMs * dtMs) % 360;
  }

  /** Apply a relative rotation, used by drag / trackpad panning. */
  rotateBy(dLambda: number, dPhi: number): void {
    this.rotationLambda = (this.rotationLambda + dLambda) % 360;
    this.rotationPhi = clamp(this.rotationPhi + dPhi, -MAX_PHI, MAX_PHI);
  }

  /** Set the absolute orientation in degrees (phi clamped to the safe range). */
  setRotation(lambda: number, phi: number): void {
    this.rotationLambda = lambda % 360;
    this.rotationPhi = clamp(phi, -MAX_PHI, MAX_PHI);
  }

  /** Smoothly rotate so (lon, lat) ends up at the centre. When `zoom` is given,
   *  the view also animates to that zoom level; otherwise zoom is unchanged. */
  flyTo(lon: number, lat: number, zoom?: number): void {
    this.targetLambda = -lon;
    this.targetPhi = clamp(-lat, -MAX_PHI, MAX_PHI);
    this.targetZoom = zoom != null ? clamp(zoom, MIN_ZOOM, MAX_ZOOM) : null;
    this.spinning = false;
    this.flying = true;
  }

  cancelFlight(): void {
    this.flying = false;
  }

  /** Advance the fly-to animation by one frame; no-op when not flying. */
  flyStep(dtMs: number): void {
    if (!this.flying) return;
    const alpha = 1 - Math.exp(-dtMs * 0.008);

    // Shortest angular path for longitude rotation.
    let dLambda = (this.targetLambda - this.rotationLambda) % 360;
    if (dLambda > 180) dLambda -= 360;
    if (dLambda < -180) dLambda += 360;
    const dPhi = this.targetPhi - this.rotationPhi;
    const dZoom = this.targetZoom != null ? this.targetZoom - this.zoom : 0;

    if (Math.abs(dLambda) < 0.05 && Math.abs(dPhi) < 0.05 && Math.abs(dZoom) < 0.01) {
      this.rotationLambda = this.targetLambda;
      this.rotationPhi = this.targetPhi;
      if (this.targetZoom != null) this.zoom = this.targetZoom;
      this.flying = false;
      return;
    }

    this.rotationLambda += dLambda * alpha;
    this.rotationPhi += dPhi * alpha;
    if (this.targetZoom != null) this.zoom += dZoom * alpha;
  }

  setSpinning(spinning: boolean): void {
    this.spinning = spinning;
  }

  toggleSpinning(): void {
    this.spinning = !this.spinning;
  }

  toggleGraticule(): void {
    this.showGraticule = !this.showGraticule;
  }

  toggleEez(): void {
    this.showEez = !this.showEez;
  }

  /** Drop a pin at (lon, lat) and fly to it at a close zoom. */
  dropPin(lon: number, lat: number): void {
    this.pin = { lon, lat };
    this.flyTo(lon, lat, 100);
  }

  clearPin(): void {
    this.pin = null;
  }

  setRpm(rpm: number): void {
    this.rpm = rpm;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  setZoom(zoom: number): void {
    this.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  }

  /** Multiply the current zoom (factor > 1 zooms in). */
  zoomBy(factor: number): void {
    this.setZoom(this.zoom * factor);
  }

  zoomIn(): void {
    this.zoomBy(ZOOM_STEP);
  }

  zoomOut(): void {
    this.zoomBy(1 / ZOOM_STEP);
  }

  /** Restore the default orientation and zoom. */
  resetView(): void {
    this.rotationLambda = 0;
    this.rotationPhi = DEFAULT_PHI;
    this.zoom = 1;
  }
}
