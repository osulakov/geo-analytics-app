import { makeAutoObservable } from 'mobx';

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 80;

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
  /** Auto-rotation speed in revolutions per minute. */
  rpm = 1;

  /** Whether the globe is auto-rotating. */
  spinning = true;

  /** Scale multiplier applied to the base projection radius. */
  zoom = 1;

  /** Rotation around the polar axis, in degrees (longitude at centre). */
  rotationLambda = 0;

  /** Tilt of the globe, in degrees (passed to the projection's 2nd angle). */
  rotationPhi = DEFAULT_PHI;

  /** Whether the latitude/longitude grid (graticule) is drawn. */
  showGraticule = true;

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

  setSpinning(spinning: boolean): void {
    this.spinning = spinning;
  }

  toggleSpinning(): void {
    this.spinning = !this.spinning;
  }

  toggleGraticule(): void {
    this.showGraticule = !this.showGraticule;
  }

  setRpm(rpm: number): void {
    this.rpm = rpm;
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
