// Metadata copy shared by the storefront's dynamic routes. A description must
// be derived from the page's own content, not repeated from the root layout,
// and it must stay within the length search engines display.

const MAX_DESCRIPTION_LENGTH = 160;

/** The first sentence of `text`, flattened to one line. */
export function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length === 0) {
    return "";
  }
  const end = /[.!?](?:\s|$)/.exec(line);
  return end === null ? line : line.slice(0, end.index + 1).trim();
}

function truncate(text: string, maximum: number): string {
  if (text.length <= maximum) {
    return text;
  }
  const clipped = text.slice(0, maximum - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

/**
 * A product page description: the product's own name plus one line of its
 * description, so two products in the same category never share copy.
 */
export function productDescription(title: string, description: string): string {
  const summary = firstSentence(description);
  return truncate(summary.length > 0 ? `${title}: ${summary}` : title, MAX_DESCRIPTION_LENGTH);
}

/** A search page description that names the query the customer typed. */
export function searchDescription(query: string): string {
  return query.length > 0
    ? `Search results for “${truncate(query, 80)}” at Kestrel Audio.`
    : "Search the Kestrel Audio catalogue of headphones, speakers, turntables and accessories.";
}

/** A private order page description; contains the order number only. */
export function orderDescription(number: string): string {
  return `Order ${number} at Kestrel Audio.`;
}
