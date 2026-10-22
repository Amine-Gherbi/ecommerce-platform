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
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
