/**
 * ProductIcons — ícones dos produtos renderizados em SVG inline (CSS puro),
 * reproduzindo cores e formatos das artes originais anexadas pelo usuário.
 *
 * Uso:
 *   import { HouseMixIcon, BusinessIcon, ChatbotIcon, SocialDesignIcon, TvAppIcon } from "@/components/ProductIcons";
 *   <HouseMixIcon size={64} />
 */

type IconProps = {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

/* Paleta oficial dos produtos (extraída dos PNGs enviados) */
export const PRODUCT_COLORS = {
  business:      { bg: "#d9ff65", fg: "#00dbff" },
  chatbot:       { bg: "#9fca1d", fg: "#d9ff65" },
  houseMix:      { bg: "#00dbff", fg: "#e6fc88" },
  socialDesign:  { bg: "#a44dff", fg: "#00dbff" },
  tvApp:         { bg: "#7befff", fg: "#00b8d9" },
} as const;

function Base({
  size = 64,
  className,
  style,
  bg,
  children,
  viewBox = "0 0 100 100",
}: IconProps & { bg: string; children: React.ReactNode; viewBox?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={size}
      height={size}
      className={className}
      style={style}
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="50" fill={bg} />
      {children}
    </svg>
  );
}

/* ───────── BUSINESS — círculo verde-limão com cifrão cyan ───────── */
export function BusinessIcon(props: IconProps) {
  const { bg, fg } = PRODUCT_COLORS.business;
  return (
    <Base {...props} bg={bg}>
      <g fill="none" stroke={fg} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M50 22 V30 M50 70 V78" />
        <path d="M62 34 C62 30 57 28 50 28 C42 28 37 31 37 36 C37 41 43 43 50 45 C57 47 63 49 63 55 C63 60 57 63 50 63 C42 63 37 61 37 57" />
      </g>
    </Base>
  );
}

/* ───────── CHATBOT — círculo verde com balão de fala ───────── */
export function ChatbotIcon(props: IconProps) {
  const { bg, fg } = PRODUCT_COLORS.chatbot;
  return (
    <Base {...props} bg={bg}>
      <g fill="none" stroke={fg} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M28 40 Q28 30 38 30 H62 Q72 30 72 40 V54 Q72 64 62 64 H46 L36 74 V64 H38 Q28 64 28 54 Z" />
      </g>
      <g fill={fg}>
        <circle cx="41" cy="47" r="3" />
        <circle cx="50" cy="47" r="3" />
        <circle cx="59" cy="47" r="3" />
      </g>
    </Base>
  );
}

/* ───────── HOUSE MIX — círculo cyan com casa + play amarelo ───────── */
export function HouseMixIcon(props: IconProps) {
  const { bg, fg } = PRODUCT_COLORS.houseMix;
  return (
    <Base {...props} bg={bg}>
      <g fill="none" stroke={fg} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        {/* telhado */}
        <path d="M22 52 L50 26 L78 52" />
        {/* corpo da casa */}
        <path d="M30 50 V72 Q30 76 34 76 H66 Q70 76 70 72 V50" />
      </g>
      {/* botão play */}
      <path d="M44 46 L60 55 L44 64 Z" fill={fg} />
    </Base>
  );
}

/* ───────── SOCIAL DESIGN — círculo roxo com câmera do Instagram ───────── */
export function SocialDesignIcon(props: IconProps) {
  const { bg, fg } = PRODUCT_COLORS.socialDesign;
  return (
    <Base {...props} bg={bg}>
      <g fill="none" stroke={fg} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="26" y="26" width="48" height="48" rx="12" ry="12" />
        <circle cx="50" cy="50" r="11" />
      </g>
      <circle cx="64" cy="36" r="3" fill={fg} />
    </Base>
  );
}

/* ───────── TV APP — círculo cyan claro com monitor de TV ───────── */
export function TvAppIcon(props: IconProps) {
  const { bg, fg } = PRODUCT_COLORS.tvApp;
  return (
    <Base {...props} bg={bg}>
      <g fill="none" stroke={fg} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="22" y="28" width="56" height="38" rx="6" ry="6" />
        <path d="M42 74 H58" />
        <path d="M50 66 V74" />
      </g>
    </Base>
  );
}

/* Mapa para uso dinâmico por chave */
export const PRODUCT_ICONS = {
  business: BusinessIcon,
  chatbot: ChatbotIcon,
  houseMix: HouseMixIcon,
  socialDesign: SocialDesignIcon,
  tvApp: TvAppIcon,
} as const;

export type ProductIconKey = keyof typeof PRODUCT_ICONS;
