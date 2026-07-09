/**
 * ProductIcons.css.tsx — versão CSS puro dos ícones de produto.
 *
 * Cada ícone é um <span> circular com background-color = cor do círculo e
 * um pseudo-elemento cuja `mask-image` (SVG data URI) desenha o glifo,
 * pintado com `background-color = cor do glifo`. Sem <svg> no DOM.
 *
 * As mesmas cores e formatos de `ProductIcons.tsx` são reproduzidos.
 */
import "./product-icons.css";

type CssIconProps = {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

type Variant = "business" | "chatbot" | "houseMix" | "socialDesign" | "tvApp";

const VARIANT_CLASS: Record<Variant, string> = {
  business: "pi--business",
  chatbot: "pi--chatbot",
  houseMix: "pi--house-mix",
  socialDesign: "pi--social-design",
  tvApp: "pi--tv-app",
};

function CssIcon({ variant, size = 64, className, style }: CssIconProps & { variant: Variant }) {
  return (
    <span
      role="img"
      aria-hidden="true"
      className={`pi ${VARIANT_CLASS[variant]} ${className ?? ""}`.trim()}
      style={{ ["--pi-size" as string]: `${size}px`, ...style }}
    />
  );
}

export const BusinessIconCss     = (p: CssIconProps) => <CssIcon variant="business"      {...p} />;
export const ChatbotIconCss      = (p: CssIconProps) => <CssIcon variant="chatbot"       {...p} />;
export const HouseMixIconCss     = (p: CssIconProps) => <CssIcon variant="houseMix"      {...p} />;
export const SocialDesignIconCss = (p: CssIconProps) => <CssIcon variant="socialDesign" {...p} />;
export const TvAppIconCss        = (p: CssIconProps) => <CssIcon variant="tvApp"         {...p} />;

export const PRODUCT_ICONS_CSS = {
  business: BusinessIconCss,
  chatbot: ChatbotIconCss,
  houseMix: HouseMixIconCss,
  socialDesign: SocialDesignIconCss,
  tvApp: TvAppIconCss,
} as const;

export type ProductIconCssKey = keyof typeof PRODUCT_ICONS_CSS;
