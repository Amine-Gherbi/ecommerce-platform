import { describe, expect, it } from "vitest";

import {
  firstSentence,
  orderDescription,
  productDescription,
  searchDescription,
} from "@/lib/seo";

describe("firstSentence", () => {
  it("flattens whitespace and stops at the first sentence", () => {
    expect(
      firstSentence(
        "A closed-back headphone.\nThe earcups fold flat for storage.",
      ),
    ).toBe("A closed-back headphone.");
  });

  it("returns the whole line when there is no terminator", () => {
    expect(firstSentence("  A direct-drive turntable  ")).toBe(
      "A direct-drive turntable",
    );
  });

  it("returns an empty string for an empty description", () => {
    expect(firstSentence("   \n  ")).toBe("");
  });
});

describe("productDescription", () => {
  it("starts with the product's own name and uses one line of its description", () => {
    const description = productDescription(
      "Technics SL-120",
      "A direct-drive turntable with a static-balanced tonearm. The pitch control covers ±8 percent.",
    );

    expect(description).toBe(
      "Technics SL-120: A direct-drive turntable with a static-balanced tonearm.",
    );
    expect(description).not.toContain("pitch control");
  });

  it("does not reuse the root layout's shop description", () => {
    expect(productDescription("KEF LS50", "A standmount speaker.")).not.toContain(
      "small hi-fi shop in Lyon",
    );
  });

  it("falls back to the name when the description is empty", () => {
    expect(productDescription("KEF LS50", "")).toBe("KEF LS50");
  });

  it("caps a long description at a word boundary", () => {
    const description = productDescription(
      "Long Product",
      "A ".repeat(200).trim(),
    );

    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.endsWith("…")).toBe(true);
    expect(description).not.toContain("  ");
  });
});

describe("searchDescription", () => {
  it("names the query the customer typed", () => {
    expect(searchDescription("turntable")).toBe(
      "Search results for “turntable” at Kestrel Audio.",
    );
  });

  it("describes the catalogue when no query was given", () => {
    expect(searchDescription("")).toContain("Search the Kestrel Audio catalogue");
  });
});

describe("orderDescription", () => {
  it("identifies the order without exposing customer data", () => {
    expect(orderDescription("KS-100024")).toBe(
      "Order KS-100024 at Kestrel Audio.",
    );
  });
});
