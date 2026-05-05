import { describe, expect, it } from "vitest";

import {
  eyebrowClass,
  fieldClass,
  focusRing,
  labelClass,
  pageTitleClass,
  primaryButtonClass,
  secondaryButtonClass,
  sectionTitleClass,
  textLinkClass,
} from "./styles";
import { cn } from "./utils";

describe("cn", () => {
  it("joins conditional classes and lets the last conflicting utility win", () => {
    const hidden = false;
    expect(cn("px-2", hidden && "hidden", "px-4")).toBe("px-4");
  });
});

describe("shared style tokens", () => {
  it("give every interactive control the keyboard focus ring", () => {
    expect(focusRing).toContain("focus-visible:outline");
    expect(primaryButtonClass).toContain(focusRing);
    expect(secondaryButtonClass).toContain(focusRing);
  });

  it("keeps the field and typography tokens non-empty", () => {
    for (const token of [
      textLinkClass,
      fieldClass,
      labelClass,
      eyebrowClass,
      pageTitleClass,
      sectionTitleClass,
    ]) {
      expect(token.trim().length).toBeGreaterThan(0);
    }
  });
});
