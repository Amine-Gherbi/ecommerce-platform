// Signed delivery format: `t=<unix seconds>,v1=<hmac-sha256 hex>`, where the
// MAC covers `${t}.${rawBody}`. Verification happens against the raw request
// text, before any JSON parse, so re-serialising the body cannot silently
// change what was signed.

import { createHmac, timingSafeEqual } from "node:crypto";

export interface ParsedSignature {
  timestamp: number;
  signatures: string[];
}

export function computeSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

export function parseSignatureHeader(
  header: string | null,
): ParsedSignature | null {
  if (header === null || header.trim().length === 0) {
    return null;
  }

  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const entry = part.trim();
    const separator = entry.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = entry.slice(0, separator);
    const value = entry.slice(separator + 1);
    if (value.length === 0) {
      continue;
    }

    if (key === "t") {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed >= 0) {
        timestamp = parsed;
      }
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (timestamp === null || signatures.length === 0) {
    return null;
  }

  return { timestamp, signatures };
}

export function verifySignature(
  header: string | null,
  rawBody: string,
  secret: string,
): boolean {
  const parsed = parseSignatureHeader(header);
  if (parsed === null) {
    return false;
  }

  const expected = Buffer.from(
    computeSignature(secret, String(parsed.timestamp), rawBody),
    "hex",
  );

  // Compare every provided signature in constant time. Signatures of the
  // wrong length cannot match and are skipped before timingSafeEqual, which
  // throws on different buffer lengths.
  return parsed.signatures.some((signature) => {
    if (!/^[0-9a-f]+$/i.test(signature)) {
      return false;
    }
    const provided = Buffer.from(signature, "hex");
    return (
      provided.length === expected.length && timingSafeEqual(provided, expected)
    );
  });
}
