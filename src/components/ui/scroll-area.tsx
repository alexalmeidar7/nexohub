import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/lib/utils";

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">{children}</ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" && "h-full w-[3px] border-l-0 p-0",
      orientation === "horizontal" && "h-[3px] flex-col border-t-0 p-0",
      className,
    )}
    style={{
      background: orientation === "vertical"
        ? "linear-gradient(to bottom, transparent 0%, hsl(var(--foreground) / 0.18) 2%, hsl(var(--foreground) / 0.18) 98%, transparent 100%)"
        : "linear-gradient(to right, transparent 0%, hsl(var(--foreground) / 0.18) 2%, hsl(var(--foreground) / 0.18) 98%, transparent 100%)",
    }}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb
      className="relative rounded-full"
      style={{
        background: "hsl(0, 72%, 50%)",
        width: orientation === "vertical" ? 12 : undefined,
        height: orientation === "horizontal" ? 12 : undefined,
        marginLeft: orientation === "vertical" ? -4.5 : undefined,
        marginTop: orientation === "horizontal" ? -4.5 : undefined,
        borderRadius: "50%",
        minHeight: 12,
        minWidth: 12,
        maxHeight: orientation === "vertical" ? 12 : undefined,
        maxWidth: orientation === "horizontal" ? 12 : undefined,
        flex: "none",
      }}
    />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
