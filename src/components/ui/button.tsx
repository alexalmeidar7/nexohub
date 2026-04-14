import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_2px_8px_-2px_hsl(var(--primary)/0.4)] hover:shadow-[0_4px_16px_-2px_hsl(var(--primary)/0.5)] hover:brightness-110",
        destructive: "bg-destructive text-destructive-foreground shadow-[0_2px_8px_-2px_hsl(var(--destructive)/0.4)] hover:shadow-[0_4px_16px_-2px_hsl(var(--destructive)/0.5)] hover:brightness-110",
        outline: "border-2 border-primary/20 bg-transparent hover:bg-primary/5 hover:border-primary/40 text-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 hover:shadow-md",
        ghost: "hover:bg-accent/10 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        accent: "bg-gradient-to-r from-primary to-primary/70 text-primary-foreground shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.5)] hover:shadow-[0_8px_30px_-4px_hsl(var(--primary)/0.6)] hover:brightness-110",
        soft: "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 hover:border-primary/30",
        glass: "bg-white/10 backdrop-blur-md border border-white/15 text-foreground shadow-[0_4px_20px_-4px_hsl(0_0%_0%/0.2)] hover:bg-white/15 hover:border-white/25 hover:shadow-[0_8px_30px_-4px_hsl(0_0%_0%/0.3)]",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
        xs: "h-7 px-3 text-[11px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
