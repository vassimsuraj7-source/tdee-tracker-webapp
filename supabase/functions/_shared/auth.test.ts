import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { sha256Hex, timingSafeEqual, verifyApiKey } from "./auth.ts";

describe("auth helpers", () => {
  it("sha256Hex matches Node's crypto (generator/verifier agree)", async () => {
    const input = "salt123rawkeyABC";
    const viaWebCrypto = await sha256Hex(input);
    const viaNode = createHash("sha256").update(input).digest("hex");
    expect(viaWebCrypto).toBe(viaNode);
  });

  it("timingSafeEqual is correct", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  it("verifyApiKey accepts the correct key and rejects others", async () => {
    // Mirror scripts/gen-ingest-key.mjs: hash = sha256(salt + rawKey)
    const salt = "0123456789abcdef";
    const rawKey = "super-secret-key";
    const expectedHash = createHash("sha256").update(salt + rawKey).digest("hex");

    expect(await verifyApiKey(rawKey, salt, expectedHash)).toBe(true);
    expect(await verifyApiKey("wrong-key", salt, expectedHash)).toBe(false);
    expect(await verifyApiKey(null, salt, expectedHash)).toBe(false);
    expect(await verifyApiKey(rawKey, "", expectedHash)).toBe(false);
    expect(await verifyApiKey(rawKey, salt, "")).toBe(false);
  });
});
