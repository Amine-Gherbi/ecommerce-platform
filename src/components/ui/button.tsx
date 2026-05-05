import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap border text-[11px] font-medium uppercase leading-none tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-accent bg-accent text-accent-ink hover:border-ink hover:bg-ink",
        outline: "border-rule bg-surface text-ink hover:border-ink",
        secondary: "border-transparent bg-surface text-ink hover:underline",
        ghost: "border-transparent text-ink hover:underline",
        link: "border-transparent p-0 text-ink underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-6",
        sm: "h-11 px-3",
        lg: "h-12 px-8",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { className?: string };

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
