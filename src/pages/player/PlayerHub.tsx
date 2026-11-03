import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useParams, useSearchParams } from "react-router-dom";
import { usePageTitle, usePublicHead } from "@/hooks/usePageTitle";
import { useLayoutColors } from "@/hooks/useLayoutColors";
import { usePlayerColors } from "@/hooks/usePlayerColors";
import { usePlayerHeartbeat } from "@/hooks/usePlayerHeartbeat";
import { useTvFocusAutoScroll } from "@/hooks/useTvFocusAutoScroll";
import { preloadImage } from "@/hooks/usePreloadImages";
import SplashScreen from "./SplashScreen";
import AccessScreen from "./AccessScreen";
import WelcomeScreen from "./WelcomeScreen";
import PlayerHome from "./PlayerHome";
import { resolveEffectiveOnAir } from "@/lib/onAirResolver";

// Injects <link rel="preload" as="image"> for the LCP background so the
// browser starts downloading the program cover in the highest-priority queue,
// in parallel with the React render tree, before <WelcomeScreen /> mounts.
function preloadAsLinkTag(url: string) {
  if (typeof document === "undefined" || !url) return;
  const existing = document.head.querySelector(
    `link[rel="preload"][data-nexo-welcome-bg="1"]`,
  ) as HTMLLinkElement | null;
  if (existing) {
    if (existing.href === url) return;
    existing.remove();
  }
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = url;
  (link as any).fetchPriority = "high";
  link.crossOrigin = "anonymous";
  link.setAttribute("data-nexo-welcome-bg", "1");
  document.head.appendChild(link);
}

type Step = "login" | "splash" | "welcome" | "home";

export default function PlayerHub() {
  usePageTitle("Player");
  useLayoutColors();
  const { user, loading } = useAuth();
  const { userSlug } = useParams();
  usePublicHead(userSlug && userSlug !== ":userSlug" ? userSlug : null, "Player");
  const [searchParams, setSearchParams] = useSearchParams();
  const tvGuestMode = searchParams.get("tvGuest") === "1";
  // Persistência: `?step=home` sobrevive a login/reload via localStorage por slug.
  const storageKey = `player-step-home:${userSlug || "root"}`;
  const skipToHome =
    tvGuestMode ||
    searchParams.get("step") === "home" ||
    (typeof window !== "undefined" && window.localStorage.getItem(storageKey) === "1");
  const [step, setStep] = useState<Step>(skipToHome ? "home" : "login");

  // Se chegou com ?step=home, grava a preferência e reflete na URL de forma estável.
  useEffect(() => {
    if (searchParams.get("step") === "home") {
      try { window.localStorage.setItem(storageKey, "1"); } catch {}
    } else if (skipToHome && !searchParams.get("step")) {
      // Restaura o param na URL para que reloads/back voltem à home.
      const next = new URLSearchParams(searchParams);
      next.set("step", "home");
      setSearchParams(next, { replace: true });
    }
    // Limpa a flag ao voltar para welcome via botão "trocar de perfil".
    // Isso é feito em onBackToAccess abaixo.
  }, [searchParams, setSearchParams, skipToHome, storageKey]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [channelBg, setChannelBg] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");
  const [fadeOut, setFadeOut] = useState(false);
  const [pendingStep, setPendingStep] = useState<Step | null>(null);
  const [publicUserId, setPublicUserId] = useState<string | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const { colors: playerColors, bgConfigs: playerBgConfigs } = usePlayerColors(publicUserId);

  // Real-time "connected on player" heartbeat (20s ping).
  usePlayerHeartbeat(publicUserId || user?.id || null);
  useTvFocusAutoScroll(true);


  useEffect(() => {
    const pickChannelThumb = (channels: any[] | null | undefined): string | null => {
      if (!channels || channels.length === 0) return null;
      const live = channels.filter((c) => c?.active !== false && (c?.type === "audio_live" || c?.type === "video_live"));
      const pool = live.length > 0 ? live : channels;
      const found =
        pool.find((c) => c?.logo_url) ||
        pool.find((c) => c?.cover_url) ||
        pool.find((c) => c?.background_url) ||
        pool[0];
      return found?.logo_url || found?.cover_url || found?.background_url || null;
    };

    const normalizeWeekday = (v: string) =>
      v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const DAY_MAP: Record<string, string> = { "0": "dom", "1": "seg", "2": "ter", "3": "qua", "4": "qui", "5": "sex", "6": "sab" };
    const matchesDay = (dias: string[] | null | undefined, d: Date) => {
      if (!dias || dias.length === 0) return true;
      const today = DAY_MAP[String(d.getDay())];
      return dias.some((x) => normalizeWeekday(x).startsWith(today));
    };
    const pickCurrentProgramThumb = (programs: any[] | null | undefined, source: string, tz: string | null): string | null => {
      const tag = `[WelcomeBG:${source}]`;
      if (!programs || programs.length === 0) {
        console.warn(`${tag} nenhum programa retornado — possíveis causas: (1) tabela "programas" vazia; (2) filtro ativo=true excluiu todos; (3) filtro estudio ilike "%fm%" excluiu todos; (4) para slug público, o Edge Function não retornou "programas".`);
        return null;
      }
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const todayCode = DAY_MAP[String(now.getDay())];
      const debug = programs.map((p) => ({
        nome: p?.nome,
        ini: String(p?.horario_inicio || "").slice(0, 5),
        fim: String(p?.horario_fim || "").slice(0, 5),
        dias: p?.dias_semana,
        thumb: !!p?.thumb,
        capa: !!p?.capa,
      }));
      console.log(`${tag} agora=${hhmm} (${todayCode}) tz=${tz || "browser-local"} — ${programs.length} programa(s) considerados`, debug);

      // Usa resolver com pré-carga do próximo 60s antes do fim, no fuso da emissora
      const eligible = (programs as any[]).filter((p) => matchesDay(p?.dias_semana, now));
      const { current } = resolveEffectiveOnAir(eligible as any[], now, tz);
      if (!current) {
        console.warn(`${tag} nenhum programa NO AR agora — causa provável: horário ${hhmm} (${todayCode}) não bate com nenhuma janela horario_inicio/horario_fim + dias_semana. Verifique também janelas que atravessam meia-noite.`);
        return null;
      }
      const url = current.thumb || null;
      if (!url) {
        console.warn(`${tag} programa "${current.nome}" está no ar mas NÃO tem THUMB cadastrada (capa é ignorada aqui — a tela de boas-vindas usa apenas thumb + artista Deezer).`);
      } else {
        console.log(`${tag} programa no ar: "${current.nome}" → usando thumb: ${url}`);
      }
      return url;

    };

    const fetchLogo = async () => {
      setLoadProgress(10);
      const userId = user?.id;
      if (userId) {
        setLoadProgress(25);
        const [empRes, chRes, progRes] = await Promise.all([
          supabase.from("empresa_config").select("logo, nome, timezone").eq("user_id", userId).single(),
          supabase.from("streaming_channels").select("logo_url, cover_url, background_url, type, active, numero_canal").eq("user_id", userId).eq("active", true).order("numero_canal"),
          supabase.from("programas").select("nome, horario_inicio, horario_fim, dias_semana, thumb, capa, ativo, estudio").eq("user_id", userId).eq("ativo", true).ilike("estudio", "%fm%"),
        ]);
        setLoadProgress(60);
        if (progRes.error) console.warn("[WelcomeBG:auth] erro ao buscar programas:", progRes.error);
        const tz: string | null = (empRes.data as any)?.timezone || null;
        if (empRes.data) {
          setLogoUrl(empRes.data.logo);
          setChannelName(empRes.data.nome || "");
        }
        const programThumb = pickCurrentProgramThumb(progRes.data as any[] | null, "auth", tz);
        const channelThumb = pickChannelThumb(chRes.data as any[] | null);
        const bg = programThumb || channelThumb;
        console.log("[WelcomeBG:auth] resultado final →", { programThumb, channelThumb, escolhido: bg });
        setLoadProgress(85);
        if (bg) {
          preloadAsLinkTag(bg);
          preloadImage(bg).finally(() => {
            setChannelBg(bg);
            setLoadProgress(100);
          });
        } else {
          setChannelBg(null);
          setLoadProgress(100);
        }
        setDataReady(true);
        return;
      }
      if (userSlug && userSlug !== ":userSlug") {
        setLoadProgress(30);
        try {
          const { data, error } = await supabase.functions.invoke("public-player-data", {
            body: { slug: userSlug },
          });
          setLoadProgress(75);
          if (!error && data && !data.error) {
            if (data.userId) setPublicUserId(data.userId);
            if (data.empresa?.logo) setLogoUrl(data.empresa.logo);
            if (data.empresa?.nome) setChannelName(data.empresa.nome);
            if (!data.programas) {
              console.warn("[WelcomeBG:public] Edge Function public-player-data não retornou a lista de programas — verifique se a função está atualizada.");
            }
            const programThumb = pickCurrentProgramThumb(data.programas, "public", data.empresa?.timezone || null);
            const channelThumb = pickChannelThumb(data.channels);
            const bg = programThumb || channelThumb;
            console.log("[WelcomeBG:public] resultado final →", { programThumb, channelThumb, escolhido: bg });
            if (bg) {
              preloadAsLinkTag(bg);
              preloadImage(bg).finally(() => {
                setChannelBg(bg);
                setLoadProgress(100);
              });
            } else {
              setLoadProgress(100);
            }
          } else {
            console.warn("public-player-data error:", error || data?.error);
            setLoadProgress(100);
          }
        } catch (e) {
          console.warn("Failed to fetch player data:", e);
          setLoadProgress(100);
        }
      } else {
        setLoadProgress(100);
      }
      setDataReady(true);
    };
    fetchLogo();
  }, [user, userSlug]);


  const [splashDone, setSplashDone] = useState(skipToHome);
  const [welcomeEditOnMount, setWelcomeEditOnMount] = useState(
    searchParams.get("edit") === "1"
  );

  // Se voltou do player com ?edit=1, limpa o param depois de armazenar a intenção.
  useEffect(() => {
    if (searchParams.get("edit") === "1") {
      setWelcomeEditOnMount(true);
      const next = new URLSearchParams(searchParams);
      next.delete("edit");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // onSplashFinish moved to use transitionTo below

  const transitionTo = useCallback((target: Step) => {
    setFadeOut(true);
    setPendingStep(target);
    setTimeout(() => {
      setStep(target);
      setFadeOut(false);
      setPendingStep(null);
    }, 700);
  }, []);

  useEffect(() => {
    // Re-check auth state to skip steps if needed
    if (!loading && user && step === "login") {
      transitionTo("splash");
    }
  }, [loading, user, step, transitionTo]);


  const onLoginSuccess = useCallback(() => {
    // Sequence: Login -> Splash
    transitionTo("splash");
  }, [transitionTo]);

  const onSplashFinish = useCallback(() => {
    setSplashDone(true);
    // After Splash -> Profiles (Welcome)
    transitionTo("welcome");
  }, [transitionTo]);

  const onWelcomeContinue = useCallback(() => {
    if (!tvGuestMode) {
      try { window.localStorage.setItem(storageKey, "1"); } catch {}
    }
    const next = new URLSearchParams(searchParams);
    if (next.get("step") !== "home") {
      next.set("step", "home");
      setSearchParams(next, { replace: true });
    }
    transitionTo("home");
  }, [transitionTo, storageKey, searchParams, setSearchParams, tvGuestMode]);

  // NOTE: do NOT use `scale-*` on this wrapper. Any CSS transform here creates a
  // containing block for descendants with `position: fixed` (like SplashScreen),
  // which then collapse to the wrapper's 0px height and become invisible.
  const wrapperClass = `player-scope transition-opacity duration-700 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${fadeOut ? "opacity-0" : "opacity-100"}`;

  if (step === "login") {
    return (
      <div className={wrapperClass}>
        <AccessScreen
          logoUrl={logoUrl}
          onLoginSuccess={onLoginSuccess}
        />
      </div>
    );
  }

  if (step === "splash") {
    return (
      <div className={wrapperClass}>
        <SplashScreen
          onFinish={onSplashFinish}
          ready={tvGuestMode ? true : !loading && dataReady}
          maxDurationMs={tvGuestMode ? 4200 : 5000}
          progress={loadProgress}
        />
      </div>
    );
  }

  // Se o usuário estiver deslogado, sempre renderiza a WelcomeScreen (que possui
  // os botões entrar/cadastre-se). Nunca redireciona para AccessScreen.
  if (step === "welcome" || (user && step !== "home")) {
    const userNameDisplay = user?.email?.split("@")[0] || "visitante";
    return (
      <div className={wrapperClass}>
        <WelcomeScreen
          userName={userNameDisplay}
          avatarUrl={null}
          backgroundUrl={channelBg}
          channelName={channelName}
          logoUrl={logoUrl}
          onContinue={onWelcomeContinue}
          onLoginSuccess={onLoginSuccess}
          initialEditOpen={welcomeEditOnMount}
          userSlug={userSlug && userSlug !== ":userSlug" ? userSlug : null}
          publicUserId={publicUserId}
          guestMode={tvGuestMode}
        />

      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <PlayerHome
        onBackToAccess={(openEdit?: boolean) => {
          setWelcomeEditOnMount(!!openEdit);
          // "Trocar de perfil": limpa a persistência de step=home.
          try { window.localStorage.removeItem(storageKey); } catch {}
          const next = new URLSearchParams(searchParams);
          if (next.has("step")) {
            next.delete("step");
            setSearchParams(next, { replace: true });
          }
          transitionTo("welcome");
        }}
      />
    </div>
  );
}


