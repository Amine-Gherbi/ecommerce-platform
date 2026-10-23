// Shared class strings for the storefront. Tailwind sees these literals at
// build time; keeping them here avoids drifting button and field treatments.

export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export const primaryButtonClass = `inline-flex h-11 items-center justify-center rounded-[2px] bg-accent px-6 text-[13px] font-medium text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;

export const secondaryButtonClass = `inline-flex h-11 items-center justify-center rounded-[2px] border border-rule bg-transparent px-6 text-[13px] font-medium text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;

export const textLinkClass =
  "underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink";

export const fieldClass =
  "h-11 w-full rounded-[2px] border border-rule bg-surface px-3 text-[13px] text-ink focus:border-ink focus:outline-none";

export const labelClass =
  "text-[11px] uppercase leading-4 tracking-[0.14em] text-ink/55";

export const eyebrowClass =
  "text-[11px] uppercase leading-4 tracking-[0.16em] text-ink/55";

export const pageTitleClass =
  "text-[28px] font-medium leading-[1.1] tracking-[-0.02em] lg:text-[40px]";

export const sectionTitleClass =
  "text-[20px] font-medium leading-7 tracking-[-0.01em]";
