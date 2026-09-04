import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ProgramaBanner {
  id: string;
  titulo?: string | null;
  nome?: string | null;
  imagem_url?: string | null;
  imagem?: string | null;
  banner_url?: string | null;
  capa?: string | null;
  thumb?: string | null;
  selo?: string | null;
  citacao?: string | null;
  frase?: string | null;
  descricao?: string | null;
}

function normalizeTitle(value?: string | null): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function normalizeImage(value?: string | null): string {
  return (value || "")
    .trim()
    .split("#")[0]
    .split("?")[0]
    .replace(/\/$/, "");
}

function getBannerTitle(banner: ProgramaBanner): string {
  return banner.titulo?.trim() || banner.nome?.trim() || "Programa";
}

function getBannerImage(banner: ProgramaBanner): string {
  return (
    banner.imagem_url ||
    banner.imagem ||
    banner.banner_url ||
    banner.capa ||
    banner.thumb ||
    banner.selo ||
    ""
  );
}

function getBannerQuote(banner: ProgramaBanner): string {
  return banner.citacao?.trim() || banner.frase?.trim() || banner.descricao?.trim() || "";
}

/**
 * Mantém somente o primeiro banner de cada grupo conectado por título ou imagem.
 * Os aliases encontrados em itens repetidos também são registrados para impedir
 * duplicações indiretas, mesmo quando título e imagem variam entre os registros.
 */
export function deduplicateProgramBanners(banners: ProgramaBanner[]): ProgramaBanner[] {
  const seenTitles = new Set<string>();
  const seenImages = new Set<string>();
  const unique: ProgramaBanner[] = [];

  for (const banner of banners) {
    const titleKey = normalizeTitle(banner.titulo || banner.nome);
    const imageKey = normalizeImage(getBannerImage(banner));
    const duplicatedByTitle = Boolean(titleKey && seenTitles.has(titleKey));
    const duplicatedByImage = Boolean(imageKey && seenImages.has(imageKey));

    if (titleKey) seenTitles.add(titleKey);
    if (imageKey) seenImages.add(imageKey);

    if (duplicatedByTitle || duplicatedByImage) continue;
    unique.push(banner);
  }

  return unique;
}

export default function Locutor() {
  const { user } = useAuth();
  const carouselRef = useRef<HTMLDivElement>(null);
  const [banners, setBanners] = useState<ProgramaBanner[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadBanners() {
      if (!user?.id) {
        if (active) setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      const { data, error: queryError } = await (supabase as any)
        .from("programas")
        .select("*")
        .eq("user_id", user.id)
        .eq("ativo", true)
        .order("horario_inicio", { ascending: true });

      if (!active) return;

      if (queryError) {
        setError("Não foi possível carregar os banners dos programas. Tente novamente em instantes.");
        setBanners([]);
      } else {
        setBanners(Array.isArray(data) ? (data as ProgramaBanner[]) : []);
      }

      setLoading(false);
    }

    loadBanners();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const uniqueBanners = useMemo(() => deduplicateProgramBanners(banners), [banners]);
  const selectedBanner = useMemo(
    () => uniqueBanners.find((banner) => banner.id === selectedId) || null,
    [selectedId, uniqueBanners],
  );

  useEffect(() => {
    if (!uniqueBanners.length) {
      setSelectedId(null);
      return;
    }

    setSelectedId((current) =>
      current && uniqueBanners.some((banner) => banner.id === current)
        ? current
        : uniqueBanners[0].id,
    );
  }, [uniqueBanners]);

  function scrollCarousel(direction: -1 | 1) {
    const carousel = carouselRef.current;
    if (!carousel) return;

    carousel.scrollBy({
      left: direction * Math.max(260, carousel.clientWidth * 0.72),
      behavior: "smooth",
    });
  }

  if (loading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3 rounded-full border border-border/60 bg-card/75 px-5 py-3 text-sm text-muted-foreground shadow-md backdrop-blur-md">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Carregando programas...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 px-4 py-10 text-foreground sm:px-6">
      <section className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
              Programação
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Programas da rádio</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Selecione uma capa para visualizar as informações correspondentes.
            </p>
          </div>

          {uniqueBanners.length > 1 && (
            <div className="hidden items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={() => scrollCarousel(-1)}
                aria-label="Ver programas anteriores"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border/60 bg-card/75 shadow-md backdrop-blur-md transition-all duration-200 hover:scale-[1.02] hover:border-primary/40 hover:shadow-primary/25 active:scale-[0.98]"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollCarousel(1)}
                aria-label="Ver próximos programas"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border/60 bg-card/75 shadow-md backdrop-blur-md transition-all duration-200 hover:scale-[1.02] hover:border-primary/40 hover:shadow-primary/25 active:scale-[0.98]"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {error ? (
          <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            {error}
          </div>
        ) : uniqueBanners.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card/75 p-8 text-center text-sm text-muted-foreground shadow-md backdrop-blur-md">
            Nenhum programa disponível no momento.
          </div>
        ) : (
          <>
            <div
              ref={carouselRef}
              className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {uniqueBanners.map((banner) => {
                const title = getBannerTitle(banner);
                const image = getBannerImage(banner);
                const selected = banner.id === selectedId;

                return (
                  <button
                    key={banner.id}
                    type="button"
                    onClick={() => setSelectedId(banner.id)}
                    className={`group relative aspect-[4/5] w-[72vw] max-w-[310px] shrink-0 snap-center cursor-pointer overflow-hidden rounded-2xl border text-left shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl sm:w-[300px] ${
                      selected ? "border-primary/60 ring-2 ring-primary/25" : "border-border/60"
                    }`}
                    aria-label={`Selecionar o programa ${title}`}
                    aria-pressed={selected}
                  >
                    {image ? (
                      <img
                        src={image}
                        alt={`Capa do programa ${title}`}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-card via-muted/40 to-background p-6 text-center">
                        <span className="text-2xl font-bold tracking-tight">{title}</span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-5 pt-16">
                      <strong className="block text-xl font-bold text-white drop-shadow-sm">{title}</strong>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedBanner && getBannerQuote(selectedBanner) && (
              <div className="mt-4 rounded-2xl border border-border/60 bg-card/75 p-5 shadow-md backdrop-blur-md sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  {getBannerTitle(selectedBanner)}
                </p>
                <blockquote className="mt-3 text-base leading-relaxed text-foreground sm:text-lg">
                  “{getBannerQuote(selectedBanner)}”
                </blockquote>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
