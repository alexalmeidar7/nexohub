import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "nx-textarea flex min-h-[96px] w-full rounded-3xl border border-[#0A0A0A]/10 bg-white px-5 py-3 font-sans text-sm font-medium text-[#0A0A0A] shadow-[inset_0_1px_2px_rgba(10,10,10,0.06)] ring-offset-background placeholder:text-[#0A0A0A]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00BFF0]/60 focus-visible:border-[#00BFF0] disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
