import type { LabelHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  className?: string;
};

export function Label({ className, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        "text-[11px] font-medium uppercase leading-4 tracking-[0.14em] text-ink",
        className,
      )}
      {...props}
    />
  );
}
