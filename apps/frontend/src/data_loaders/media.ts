export interface UploadedImage {
  id: string;
  filename: string;
  contentType: string;
  ext: string;
  wkt: string | null;
  satelliteName: string | null;
  timestamp: string | null;
  size: number;
  createdAt: string;
}

/** Upload an image + metadata to the media bucket service. */
export async function uploadImage(
  file: File,
  satelliteName: string,
  wkt: string,
  timestamp: string,
): Promise<UploadedImage> {
  const form = new FormData();
  form.append('image', file);
  if (satelliteName.trim()) form.append('satelliteName', satelliteName.trim());
  if (wkt.trim()) form.append('wkt', wkt.trim());
  if (timestamp.trim()) form.append('timestamp', timestamp.trim());

  const response = await fetch('/media/images', { method: 'POST', body: form });
  if (!response.ok) {
    throw new Error(`Failed to upload image: ${response.status}`);
  }
  return (await response.json()) as UploadedImage;
}

/** List all stored images (metadata only), newest first. */
export async function listImages(): Promise<UploadedImage[]> {
  const response = await fetch('/media/images');
  if (!response.ok) {
    throw new Error(`Failed to list images: ${response.status}`);
  }
  return (await response.json()) as UploadedImage[];
}

/** URL serving the raw image bytes for a stored image. */
export function imageUrl(id: string): string {
  return `/media/images/${id}`;
}
