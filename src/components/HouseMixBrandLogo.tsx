import desktopSeal from "@/assets/house-mix-desktop.png";
import onlineSeal from "@/assets/house-mix-online.png";

type HouseMixBrandLogoProps = {
  className?: string;
  variant?: "light" | "dark";
};

/** Marca específica da edição instalada ou online do House Mix. */
export default function HouseMixBrandLogo({ className = "", variant = "light" }: HouseMixBrandLogoProps) {
  const isDesktop = typeof window !== "undefined" && Boolean(window.houseMixDesktop);

  return (
    <img
      src={isDesktop ? desktopSeal : onlineSeal}
      alt={isDesktop ? "Nexo House Mix Desktop" : "Nexo House Mix Online"}
      className={className}
      style={variant === "dark" ? { filter: "brightness(0)" } : undefined}
    />
  );
}
