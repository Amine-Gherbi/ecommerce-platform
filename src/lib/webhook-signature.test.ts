import { describe, expect, it } from "vitest";

import {
  computeSignature,
  parseSignatureHeader,
  verifySignature,
} from "./webhook-signature";

const SECRET = "whsec_test";
const BODY = '{"id":"evt_1"}';
const TIMESTAMP = 1_700_000_000;
const SIGNATURE =
  "c89214b5b5da833daed6f0b8c5bb6bd58cea9022bd80ccc78230f3942d632925";
const HEADER = `t=${TIMESTAMP},v1=${SIGNATURE}`;

describe("computeSignature", () => {
  it("signs the timestamp and raw body with HMAC-SHA256", () => {
    expect(computeSignature(SECRET, String(TIMESTAMP), BODY)).toBe(SIGNATURE);
  });
});

describe("parseSignatureHeader", () => {
  it("reads the timestamp and every v1 signature", () => {
    expect(
      parseSignatureHeader(`t=${TIMESTAMP},v1=${SIGNATURE},v1=deadbeef`),
    ).toEqual({
      timestamp: TIMESTAMP,
      signatures: [SIGNATURE, "deadbeef"],
    });
  });

  it("rejects a missing, empty or malformed header", () => {
    expect(parseSignatureHeader(null)).toBeNull();
    expect(parseSignatureHeader("")).toBeNull();
    expect(parseSignatureHeader("v1=abc")).toBeNull();
    expect(parseSignatureHeader("t=not-a-number,v1=abc")).toBeNull();
    expect(parseSignatureHeader(`t=${TIMESTAMP}`)).toBeNull();
  });
});

describe("verifySignature", () => {
  it("accepts a correctly signed body", () => {
    expect(verifySignature(HEADER, BODY, SECRET)).toBe(true);
  });

  it("accepts one matching signature when several are present", () => {
    expect(
      verifySignature(`t=${TIMESTAMP},v1=deadbeef,v1=${SIGNATURE}`, BODY, SECRET),
    ).toBe(true);
  });

  it("rejects a tampered body, wrong secret or wrong signature", () => {
    expect(verifySignature(HEADER, `${BODY} `, SECRET)).toBe(false);
    expect(verifySignature(HEADER, BODY, "whsec_other")).toBe(false);
    expect(verifySignature(`t=${TIMESTAMP},v1=deadbeef`, BODY, SECRET)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifySignature(null, BODY, SECRET)).toBe(false);
  });
});
