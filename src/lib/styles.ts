// Shared class strings for the storefront. Tailwind sees these literals at
// build time; keeping them here avoids drifting button and field treatments.
//
// Cool retail: white paper, cool greys, one deep teal, square corners, no
// shadows. Teal is the working accent; the sale colour is reserved for errors
// and refund states.

export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const primaryButtonClass = `inline-flex h-11 items-center justify-center border border-accent bg-accent px-6 text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-accent-ink transition-colors hover:border-ink hover:bg-ink disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;

export const secondaryButtonClass = `inline-flex h-11 items-center justify-center border border-control bg-transparent px-6 text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;

export const textLinkClass =
  "underline decoration-rule underline-offset-4 transition-colors hover:decoration-accent";

export const fieldClass = `h-11 w-full border border-control bg-surface px-3 text-[13px] text-ink transition-colors placeholder:text-muted focus:border-accent focus:outline-none ${focusRing}`;

export const labelClass =
  "text-[11px] font-semibold uppercase leading-4 tracking-[0.14em] text-muted";

export const eyebrowClass =
  "text-[11px] font-semibold uppercase leading-4 tracking-[0.14em] text-muted";

export const pageTitleClass =
  "text-[30px] font-semibold leading-[1.05] tracking-[-0.02em]";

export const sectionTitleClass =
  "text-[22px] font-semibold leading-7 tracking-[-0.02em]";
