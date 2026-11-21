import { ReactNode } from "react";

interface OttCoverButtonProps {
  label: string;
  icon?: ReactNode;
  coverImage?: string;
  onClick: () => void;
  selected?: boolean;
  disabled?: boolean;
  className?: string;
  showCover?: boolean;
  aspectRatio?: "square" | "wide";
}

export default function OttCoverButton({
  label,
  icon,
  coverImage,
  onClick,
  selected = false,
  disabled = false,
  className = "",
  showCover = true,
  aspectRatio = "square"
}: OttCoverButtonProps) {

  const aspectRatioClass = aspectRatio === "wide" ? "aspect-[16/9]" : "aspect-square";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`ott-cover-button ${className} ${selected ? 'ott-cover-button-selected' : ''}`}
      data-tv-focusable
      aria-label={label}
      aria-pressed={selected}
    >
      {/* Container principal */}
      <div className={`ott-cover-button-container ${aspectRatioClass}`}>
        {/* Overlay de gradiente */}
        <div className="ott-cover-button-overlay" />

        {/* Imagem de capa */}
        {showCover && coverImage && (
          <div className="ott-cover-button-image-container">
            <img
              src={coverImage}
              alt={`Capa de ${label}`}
              className="ott-cover-button-image"
              loading="lazy"
            />
            <div className="ott-cover-button-image-overlay" />
          </div>
        )}

        {/* Fallback se não houver imagem */}
        {showCover && !coverImage && (
          <div className="ott-cover-button-fallback">
            <div className="ott-cover-button-fallback-icon">
              {icon || '📻'}
            </div>
          </div>
        )}

        {/* Conteúdo do botão */}
        <div className="ott-cover-button-content">
          {icon && (
            <div className="ott-cover-button-icon" aria-hidden="true">
              {icon}
            </div>
          )}
          <span className="ott-cover-button-label">{label}</span>
        </div>

        {/* Indicador de seleção */}
        {selected && (
          <div className="ott-cover-button-selection-indicator" />
        )}

        {/* Efeito de foco */}
        <div className="ott-cover-button-focus-ring" />
      </div>
    </button>
  );
}
