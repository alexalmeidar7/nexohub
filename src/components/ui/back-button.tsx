import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Padrão canônico de saída de página no painel:
 * pill cyan + ícone circular preto à esquerda + texto uppercase bold +
 * animação de seta deslizando no hover.
 *
 * Usar em toda navegação de retorno (Voltar / Back) dentro do painel principal.
 * NÃO usar dentro do Player VOD nem do Teleprompter — esses módulos têm design próprio.
 */
export interface BackButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
}

export const BackButton = React.forwardRef<HTMLButtonElement, BackButtonProps>(
  ({ className, label = "Voltar", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        {...props}
        className={cn(
          "group inline-flex items-center gap-2.5 h-11 pl-1.5 pr-5 rounded-full bg-[#00BFF0] text-white font-sans font-bold uppercase tracking-[0.08em] text-sm shadow-[0_4px_14px_-4px_rgba(0,191,240,0.55)] transition-all hover:brightness-110 hover:shadow-[0_6px_20px_-4px_rgba(0,191,240,0.65)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00BFF0]/60 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
          className,
        )}
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#0A0A0A] text-white transition-transform duration-200 group-hover:-translate-x-1">
          <ChevronLeft size={16} strokeWidth={2.75} />
        </span>
        <span>{label}</span>
      </button>
    );
  },
);
BackButton.displayName = "BackButton";
