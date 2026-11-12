// A passphrase names a synced library; it is not a password and guards nothing secret. Devices that
// type the same words share favourites and archive. Only its hash leaves the device, as the key.
export const SYNC_PATH = "sync/";
// The Worker refuses larger libraries; thousands of saved posts fit well under it.
export const MAX_SYNC_BYTES = 4 * 1024 * 1024;

export function normalizePassphrase(passphrase: string): string {
  return passphrase.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function syncKey(passphrase: string): Promise<string> {
  const bytes = new TextEncoder().encode(`happy-feed:${normalizePassphrase(passphrase)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const isSyncKey = (key: string): boolean => /^[0-9a-f]{64}$/.test(key);
