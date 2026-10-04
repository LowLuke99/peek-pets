// Small crypto helpers (Web Crypto, available in Workers and Node 20+).

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** 128-bit user id as 32 hex chars. */
export const randomId = () => hex(randomBytes(16));

/** 256-bit secret, base64url without padding (43 chars). */
export function randomSecret() {
  const b = randomBytes(32);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(s) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}

/** Compares two equal-length hex strings without an early exit. */
export function sameHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
