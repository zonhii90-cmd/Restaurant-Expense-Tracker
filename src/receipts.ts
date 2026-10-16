import { supabase } from './client';

export const RECEIPT_BUCKET = 'restaurant-receipts';
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export type ReceiptPhoto = { blob: Blob; name: string; key: string };

// Re-encode rather than trusting a filename or MIME type. This also strips EXIF
// location data and keeps phone uploads manageable while retaining invoice detail.
export async function prepareReceipt(file: File): Promise<ReceiptPhoto> {
  if (!file.size || file.size > MAX_PHOTO_BYTES) throw new Error('Choose a photo smaller than 20 MB.');
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) throw new Error('Choose a JPG, PNG, WebP or supported HEIC photo.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); } catch { throw new Error('This photo cannot be opened. Try a JPG or PNG photo, or take a new photo.'); }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60_000_000) throw new Error('This photo is too large. Take a smaller photo and try again.');
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare this photo. Please try another browser.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob || blob.size > 5 * 1024 * 1024) throw new Error('This photo is too large to upload. Take a smaller photo and try again.');
    return { blob, name: file.name, key: crypto.randomUUID() };
  } finally { URL.revokeObjectURL(url); }
}

export function receiptPath(userId: string, purchaseId: string, photoKey: string) {
  return `${userId}/${purchaseId}/${photoKey}.jpg`;
}

export async function uploadReceipt(path: string, photo: ReceiptPhoto) {
  const { error } = await supabase!.storage.from(RECEIPT_BUCKET).upload(path, photo.blob, { contentType: 'image/jpeg', upsert: false });
  // Immutable, random paths make a lost upload response safe to retry. No update
  // policy is granted, so a saved receipt can never be silently overwritten.
  if (error && String(error.statusCode) !== '409') throw error;
}

export async function receiptUrl(path: string) {
  const { data, error } = await supabase!.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw error || new Error('Receipt unavailable');
  return data.signedUrl;
}
