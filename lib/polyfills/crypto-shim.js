/**
 * Minimal shim for node:crypto used by program-specification-language.
 * Only implements createHash("sha256") with a simple FNV-1a variant
 * sufficient for deterministic source hashing (not security-critical).
 */

function createHash(algorithm) {
  let data = "";

  return {
    update(input) {
      data += typeof input === "string" ? input : String(input);
      return this;
    },
    digest(encoding) {
      // FNV-1a 64-bit split into two 32-bit halves for a longer hex string
      let h1 = 0x811c9dc5 >>> 0;
      let h2 = 0xc4ceb9fe >>> 0;

      for (let i = 0; i < data.length; i++) {
        const c = data.charCodeAt(i);
        h1 ^= c;
        h1 = Math.imul(h1, 0x01000193) >>> 0;
        h2 ^= c ^ (i & 0xff);
        h2 = Math.imul(h2, 0x01000193) >>> 0;
      }

      const hex =
        h1.toString(16).padStart(8, "0") +
        h2.toString(16).padStart(8, "0") +
        (h1 ^ h2).toString(16).padStart(8, "0") +
        (h1 + h2).toString(16).padStart(8, "0");

      return hex;
    },
  };
}

module.exports = { createHash };
