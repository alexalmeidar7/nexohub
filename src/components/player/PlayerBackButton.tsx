import React from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlayerBackButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  iconSize?: number;
}

export const PlayerBackButton = React.forwardRef<HTMLButtonElement, PlayerBackButtonProps>(
  ({ className, iconSize = 22, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/15 active:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--player-accent))] border border-white/10 transition shrink-0 relative group",
          className
        )}
        data-focusable
        {...props}
      >
        <div 
          className="absolute inset-[-4px] rounded-full border-2 border-transparent group-hover:border-white/20 transition-all duration-300 pointer-events-none" 
          style={{
            background: "linear-gradient(var(--player-accent, #00BFF0), var(--player-accent-hover, #C6F03C)) border-box",
            WebkitMask: "linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "destination-out",
            maskComposite: "exclude",
            animation: "interactSpin 3s linear infinite"
          }} 
        />
        <ArrowLeft size={iconSize} className="relative z-10" />
      </button>
    );
  }
);

PlayerBackButton.displayName = "PlayerBackButton";
