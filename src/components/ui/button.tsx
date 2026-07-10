import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-sans text-sm font-bold uppercase tracking-wide ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97]",
  {
    variants: {
      variant: {
        // Cyan pill primary (matches mockup "VOLTAR")
        default:
          "bg-[#00BFF0] text-white shadow-[0_4px_14px_-4px_rgba(0,191,240,0.55)] hover:brightness-110 hover:shadow-[0_6px_20px_-4px_rgba(0,191,240,0.65)]",
        // Lime/green pill for save actions (matches mockup "SALVAR")
        save: "bg-[#C6F03C] text-[#0A0A0A] shadow-[0_4px_14px_-4px_rgba(198,240,60,0.55)] hover:brightness-105 hover:shadow-[0_6px_20px_-4px_rgba(198,240,60,0.7)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_2px_8px_-2px_hsl(var(--destructive)/0.4)] hover:shadow-[0_4px_16px_-2px_hsl(var(--destructive)/0.5)] hover:brightness-110",
        outline:
          "border-2 border-[#0A0A0A]/15 bg-white text-[#0A0A0A] hover:border-[#00BFF0] hover:text-[#00BFF0]",
        secondary:
          "bg-[#0A0A0A] text-white shadow-sm hover:brightness-125",
        ghost: "hover:bg-[#00BFF0]/10 hover:text-[#00BFF0]",
        link: "text-[#00BFF0] underline-offset-4 hover:underline normal-case tracking-normal",
        accent:
          "bg-gradient-to-r from-[#00BFF0] to-[#00A5D0] text-white shadow-[0_4px_20px_-4px_rgba(0,191,240,0.55)] hover:shadow-[0_8px_30px_-4px_rgba(0,191,240,0.7)] hover:brightness-110",
        soft: "bg-[#D6F4FB] text-[#0A0A0A] border border-[#00BFF0]/20 hover:bg-[#c0edf7]",
        glass:
          "bg-white/10 backdrop-blur-md border border-white/15 text-foreground shadow-[0_4px_20px_-4px_hsl(0_0%_0%/0.2)] hover:bg-white/15 hover:border-white/25",
      },
      size: {
        default: "h-11 px-6 py-2",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-11 w-11",
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
