export function getStationLogoFallback(slug?: string | null): string | null {
  const key = (slug || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const logos: Record<string, string> = {
    positivafm: "/logos/positiva.png",
    positiva: "/logos/positiva.png",
    interativafm: "/logos/interativa.png",
    interativa: "/logos/interativa.png",
    jornalfm: "/logos/jornal.png",
    jornal: "/logos/jornal.png",
    culturafm: "/logos/cultura.png",
    cultura: "/logos/cultura.png",
  };
  return logos[key] || null;
}
