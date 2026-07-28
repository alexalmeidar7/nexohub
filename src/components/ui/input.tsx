import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "nx-input flex h-11 w-full rounded-full border border-[#0A0A0A]/10 bg-white px-5 py-2 font-sans text-sm font-medium text-[#0A0A0A] shadow-[inset_0_1px_2px_rgba(10,10,10,0.06)] ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-[#0A0A0A] placeholder:text-[#0A0A0A]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00BFF0]/60 focus-visible:border-[#00BFF0] disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
