// API-key verification for the Ingestion API (Req 1). The raw key is never stored;
// only a salted SHA-256 hash is configured (Req 1.3). Verification is a
// constant-time comparison to avoid timing side channels.

/** Hex SHA-256 of the input string (Web Crypto, available in Deno). */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Length-safe, constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * True when `providedKey` matches the configured salted hash.
 * expectedHash must equal sha256Hex(salt + rawKey) — see scripts/gen-ingest-key.mjs.
 */
export async function verifyApiKey(
  providedKey: string | null,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  if (!providedKey || !salt || !expectedHash) return false;
  const computed = await sha256Hex(salt + providedKey);
  return timingSafeEqual(computed, expectedHash);
}
