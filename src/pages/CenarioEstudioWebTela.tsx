import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cenário Estúdio — Web
 * Renderiza um "cenário" em página web para ser usado como fonte no navegador do vMix.
 * Rota: /cenario-estudio-web/:userSlug/:id
 *
 * Consome public-cenario-data (locutor no ar + música tocando) e a tabela
 * public.cenario_estudio_web (layout/opções escolhidas pelo usuário).
 */

interface WebSceneConfig {
  id: string;
  user_id: string;
  nome: string;
  orientation: "horizontal" | "vertical";
  tv_count: number;
  content: {
    gradient?: boolean;
    presenter?: boolean;
    artist?: boolean;
    sponsors?: boolean;
  };
}

interface PublicData {
  userId?: string;
  programa?: {
    nome?: string;
    apresentadorFoto?: string;
    apresentadoresFotos?: string[];
    apresentador?: string;
  } | null;
  musica?: { titulo?: string; artista?: string; capa?: string } | null;
  logos?: Array<{ logo_url: string; nome?: string }>;
}

export default function CenarioEstudioWebTela() {
  const { userSlug, id } = useParams<{ userSlug: string; id: string }>();
  const [params] = useSearchParams();
  const previewSlot = Number(params.get("slot") || 0); // if >0, renderiza só uma TV isolada

  const [cfg, setCfg] = useState<WebSceneConfig | null>(null);
  const [data, setData] = useState<PublicData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.margin = "0";
    document.body.style.background = "#000";
    return () => {
      document.body.style.margin = "";
      document.body.style.background = "";
    };
  }, []);

  // Carrega config a cada 30s (permite ao usuário editar sem recarregar o vMix)
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const load = async () => {
      const { data: row, error: err } = await supabase
        .from("cenario_estudio_web" as any)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!alive) return;
      if (err || !row) {
        setError("Cenário não encontrado");
        return;
      }
      setCfg(row as any);
    };
    load();
    const t = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  // Carrega dados públicos (locutor no ar / música / logos) a cada 8s
  useEffect(() => {
    if (!userSlug) return;
    let alive = true;
    const load = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(
          `${supabaseUrl}/functions/v1/public-cenario-data?slug=${encodeURIComponent(userSlug)}`,
          { headers: { apikey: anonKey } },
        );
        const json = await res.json();
        if (!alive) return;
        if (!res.ok || json?.error) {
          setError("Usuário não encontrado");
          return;
        }
        setData(json);
      } catch {
        /* ignore transient errors */
      }
    };
    load();
    const t = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [userSlug]);

  const gradient = useMemo(() => {
    // Degrade elegante derivado do accent do layout (fallback azul-marinho profundo)
    return "linear-gradient(135deg, #0A2540 0%, #0F3460 45%, #1e3a8a 100%)";
  }, []);

  if (error) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
        <div style={{ opacity: 0.6, fontSize: 14 }}>{error}</div>
      </div>
    );
  }
  if (!cfg) {
    return <div style={{ position: "fixed", inset: 0, background: "#000" }} />;
  }

  const tvs = Array.from({ length: Math.max(1, cfg.tv_count) });
  const orientationHorizontal = cfg.orientation === "horizontal";

  // Cada TV renderiza um conteúdo com prioridade: artista → apresentador → gradiente
  const renderTV = (index: number) => {
    const content = cfg.content || {};
    const presenterFoto = data?.programa?.apresentadoresFotos?.[index] || data?.programa?.apresentadorFoto || "";
    const artistImg = data?.musica?.capa || "";
    const musicTitle = data?.musica?.titulo || "";
    const musicArtist = data?.musica?.artista || "";
    const logos = data?.logos || [];

    // Distribui o "tipo" de conteúdo entre as TVs para variedade
    let tvType: "artist" | "presenter" | "sponsors" | "gradient" = "gradient";
    const rotation: Array<"artist" | "presenter" | "sponsors"> = [];
    if (content.artist && artistImg) rotation.push("artist");
    if (content.presenter && presenterFoto) rotation.push("presenter");
    if (content.sponsors && logos.length > 0) rotation.push("sponsors");
    if (rotation.length > 0) {
      tvType = rotation[index % rotation.length];
    }

    return (
      <div
        key={index}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: content.gradient !== false ? gradient : "#000",
        }}
      >
        {tvType === "artist" && artistImg && (
          <>
            <img
              src={artistImg}
              alt=""
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: "blur(24px) saturate(1.2)",
                transform: "scale(1.15)",
                opacity: 0.55,
              }}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.75) 100%)" }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "6%" }}>
              <img
                src={artistImg}
                alt=""
                style={{ width: "62%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
              />
              {(musicTitle || musicArtist) && (
                <div style={{ marginTop: 24, textAlign: "center", color: "#fff", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
                  <div style={{ fontSize: "clamp(18px, 3vw, 42px)", fontWeight: 700, letterSpacing: 0.3 }}>{musicTitle}</div>
                  <div style={{ fontSize: "clamp(14px, 2vw, 28px)", opacity: 0.75, marginTop: 6 }}>{musicArtist}</div>
                </div>
              )}
            </div>
          </>
        )}

        {tvType === "presenter" && presenterFoto && (
          <>
            <div style={{ position: "absolute", inset: 0, background: gradient }} />
            <img
              src={presenterFoto}
              alt=""
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "top center",
                opacity: 0.95,
              }}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.85) 100%)" }} />
            {data?.programa?.apresentador && (
              <div style={{ position: "absolute", left: 0, right: 0, bottom: "6%", textAlign: "center", color: "#fff", fontFamily: "system-ui" }}>
                <div style={{ fontSize: "clamp(20px, 3.2vw, 48px)", fontWeight: 800, letterSpacing: 0.4 }}>{data.programa.apresentador}</div>
                {data.programa.nome && (
                  <div style={{ fontSize: "clamp(12px, 1.6vw, 22px)", opacity: 0.7, marginTop: 6, textTransform: "uppercase", letterSpacing: 3 }}>{data.programa.nome}</div>
                )}
              </div>
            )}
          </>
        )}

        {tvType === "sponsors" && logos.length > 0 && (
          <>
            <div style={{ position: "absolute", inset: 0, background: gradient }} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                gridTemplateColumns: logos.length > 4 ? "repeat(3, 1fr)" : `repeat(${Math.min(logos.length, 2)}, 1fr)`,
                gap: 24,
                padding: "8%",
                alignContent: "center",
                justifyItems: "center",
              }}
            >
              {logos.slice(0, 9).map((l, i) => (
                <img
                  key={i}
                  src={l.logo_url}
                  alt={l.nome || ""}
                  style={{ maxWidth: "100%", maxHeight: 220, objectFit: "contain", filter: "drop-shadow(0 6px 24px rgba(0,0,0,0.35))" }}
                />
              ))}
            </div>
          </>
        )}

        {tvType === "gradient" && content.gradient !== false && (
          <div style={{ position: "absolute", inset: 0, background: gradient }} />
        )}
      </div>
    );
  };

  // Preview isolado de uma "TV" — útil se você quiser abrir cada TV como um input separado no vMix
  if (previewSlot > 0) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#000" }}>
        {renderTV(previewSlot - 1)}
      </div>
    );
  }

  // Painel de N TVs em 1920x1080 (dimensiona-se responsivamente)
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        gridTemplateColumns: orientationHorizontal ? `repeat(${cfg.tv_count}, 1fr)` : "1fr",
        gridTemplateRows: orientationHorizontal ? "1fr" : `repeat(${cfg.tv_count}, 1fr)`,
        gap: 8,
        padding: 8,
        background: "#000",
      }}
    >
      {tvs.map((_, i) => renderTV(i))}
    </div>
  );
}
