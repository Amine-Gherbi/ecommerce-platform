// Quantity rule for the one-time anonymous → account cart merge.
//
// A variant that exists in both carts keeps the higher of the two quantities,
// not their sum: the merge runs once per sign-in, and replaying it must not
// inflate the basket.
export function mergeCartQuantity(
  existingQuantity: number | null,
  incomingQuantity: number,
): number {
  const incoming = Math.trunc(incomingQuantity);
  if (existingQuantity === null) {
    return incoming;
  }
  return Math.max(Math.trunc(existingQuantity), incoming);
}
