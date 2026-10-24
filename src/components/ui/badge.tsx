import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center border px-2 py-0.5 text-[11px] font-medium uppercase leading-4 tracking-[0.14em]",
  {
    variants: {
      variant: {
        default: "border-transparent bg-ink text-surface",
        secondary: "border-transparent bg-surface text-ink",
        outline: "border-ink text-ink",
        destructive: "border-transparent bg-sale text-accent-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & { className?: string };

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
