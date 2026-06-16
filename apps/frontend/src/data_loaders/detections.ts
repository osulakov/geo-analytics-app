/** A persisted object detection (GeoJSON Polygon + metadata + timestamp). */
export interface DetectedObject {
  id: string;
  jobId: string;
  imageId: string | null;
  geojson: { type: 'Polygon'; coordinates: number[][][] } | null;
  metadata: Record<string, unknown> | null;
  ts: string | null;
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Run object detection for a job (calls OpenAI on the backend) and return the
 *  freshly persisted detections. */
export async function runObjectDetection(jobId: string, token: string): Promise<DetectedObject[]> {
  const res = await fetch(`/jobs/${jobId}/object-detection`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Object detection failed: ${res.status}`);
  }
  return (await res.json()) as DetectedObject[];
}

/** Read a job's persisted detections (no re-run). */
export async function loadObjectDetections(jobId: string, token: string): Promise<DetectedObject[]> {
  const res = await fetch(`/jobs/${jobId}/object-detection`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Failed to load detections: ${res.status}`);
  return (await res.json()) as DetectedObject[];
}
