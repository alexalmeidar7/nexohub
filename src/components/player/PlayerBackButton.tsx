import React from "react";
import { Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlayerBackButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  iconSize?: number;
}
/** Botão Voltar padronizado para todas as janelas do Nexo Player. */
export const PlayerBackButton = React.forwardRef<HTMLButtonElement, PlayerBackButtonProps>(
  ({ className, iconSize = 22, style, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn("flex items-center justify-center w-12 h-12 rounded-full bg-[#303030] text-white border-0 shadow-none hover:bg-[#404040] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white transition-colors shrink-0", className)}
      style={{ backgroundColor: "#303030", color: "#fff", boxShadow: "none", ...style }}
      data-focusable
      {...props}
    >
      <Undo2 size={iconSize} strokeWidth={2.5} aria-hidden="true" />
    </button>
  ),
);
PlayerBackButton.displayName = "PlayerBackButton";
