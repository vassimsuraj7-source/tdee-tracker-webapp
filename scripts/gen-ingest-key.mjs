// Generate an Ingestion API key plus the salted hash to store as Supabase secrets.
// Run locally:  node scripts/gen-ingest-key.mjs
//
// It prints three things:
//   1. INGEST_API_KEY      — the raw key; put it in the export bridge's X-API-Key header.
//   2. INGEST_API_KEY_SALT — set as a Supabase secret.
//   3. INGEST_API_KEY_HASH — set as a Supabase secret (sha256(salt + key)).
//
// The raw key is NOT stored anywhere server-side (Req 1.3): the Edge Function only
// ever sees the salt + hash and re-derives the hash from the presented key.

import { randomBytes, createHash } from "node:crypto";

const rawKey = randomBytes(32).toString("base64url"); // high-entropy API key
const salt = randomBytes(16).toString("hex");
const hash = createHash("sha256").update(salt + rawKey).digest("hex");

console.log("\n=== Ingestion API credentials (store securely; shown once) ===\n");
console.log("INGEST_API_KEY  (bridge X-API-Key header):");
console.log("  " + rawKey + "\n");
console.log("Set these two as Supabase secrets:");
console.log("  INGEST_API_KEY_SALT=" + salt);
console.log("  INGEST_API_KEY_HASH=" + hash + "\n");
console.log("Example:");
console.log(`  supabase secrets set INGEST_API_KEY_SALT=${salt} INGEST_API_KEY_HASH=${hash}\n`);
