import { useState } from 'react';

interface CoordinatePopupProps {
  lon: number;
  lat: number;
  /** Screen position of the double-click. */
  x: number;
  y: number;
  onClose: () => void;
}

/** Small popup at a double-clicked point: shows lat/lon and copies them. */
export function CoordinatePopup({ lon, lat, x, y, onClose }: CoordinatePopupProps) {
  const [copied, setCopied] = useState(false);
  const text = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — ignore.
    }
  };

  return (
    <div className="coord-popup" style={{ left: x + 12, top: y + 12 }}>
      <button type="button" className="coord-popup__close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <div className="coord-popup__title">Coordinates</div>
      <dl className="coord-popup__rows">
        <div>
          <dt>Lat</dt>
          <dd>{lat.toFixed(5)}°</dd>
        </div>
        <div>
          <dt>Lon</dt>
          <dd>{lon.toFixed(5)}°</dd>
        </div>
      </dl>
      <button type="button" className="coord-popup__copy" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
