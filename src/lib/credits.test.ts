import { describe, expect, it } from "vitest";

import { PHOTO_CREDITS } from "./credits";

describe("photo credits", () => {
  it("attributes every catalogue photograph", () => {
    expect(PHOTO_CREDITS.length).toBeGreaterThan(0);

    for (const credit of PHOTO_CREDITS) {
      expect(credit.product.length).toBeGreaterThan(0);
      expect(credit.file.length).toBeGreaterThan(0);
      expect(credit.licence.length).toBeGreaterThan(0);
      expect(credit.author.length).toBeGreaterThan(0);
      expect(credit.source).toMatch(/^https:\/\//);
    }
  });

  it("names each image file once", () => {
    const files = PHOTO_CREDITS.map((credit) => credit.file);
    expect(new Set(files).size).toBe(files.length);
  });
});
