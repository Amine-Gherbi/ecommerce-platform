import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// Deliberately a native <select> rather than the Radix-based shadcn Select:
// this control lives inside a GET form, so it must work with JavaScript
// disabled. Same tokens as Input, no client bundle.
export type NativeSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  className?: string;
};

export function NativeSelect({ className, children, ...props }: NativeSelectProps) {
  return (
    <select
      className={cn(
        "flex h-11 w-full border border-input bg-background px-3 py-1 text-[13px] text-ink transition-colors focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
