// The only place cents become a human-readable string.
//
// No floating point is involved: the whole-dollar part is an integer and the
// cents part is string-padded. `Intl.NumberFormat` only ever sees an integer.
const wholeFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/**
 * Formats integer cents as USD, e.g. 2499 -> "$24.99".
 *
 * @throws RangeError when `cents` is not a safe integer. Money must stay an
 * integer at every layer; a float reaching this function is a bug, not input.
 */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`formatCents expects integer cents, received ${String(cents)}`);
  }

  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");

  return `${sign}$${wholeFormatter.format(whole)}.${fraction}`;
}
