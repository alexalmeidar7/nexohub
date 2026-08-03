import ElegantLoader from "@/components/player/ElegantLoader";

interface PlayerSyncLoaderProps {
  /** Tamanho do spinner (padrão 44). */
  size?: number;
  /** Quando true, ocupa a tela inteira em posição fixa (overlay). */
  overlay?: boolean;
  className?: string;
}

/**
 * Loader global do /player.
 *
 * Padrão único de sincronização em todas as telas do player:
 * fundo preto, apenas o spinner centralizado (sem texto, sem splash).
 * Use este componente em todo lugar que precise mostrar carregamento
 * ou sincronização dentro do player.
 */
export default function PlayerSyncLoader({
  size = 44,
  overlay = false,
  className = "",
}: PlayerSyncLoaderProps) {
  return (
    <div
      className={`${
        overlay ? "fixed inset-0 z-[9999]" : "h-screen w-screen"
      } bg-black flex items-center justify-center animate-fade-in ${className}`}
    >
      <ElegantLoader size={size} />
    </div>
  );
}
