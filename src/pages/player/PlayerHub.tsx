import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useParams, useSearchParams } from "react-router-dom";
import { usePageTitle, usePublicHead } from "@/hooks/usePageTitle";
import { useLayoutColors } from "@/hooks/useLayoutColors";
import { usePlayerColors } from "@/hooks/usePlayerColors";
import { usePlayerHeartbeat } from "@/hooks/usePlayerHeartbeat";
import SplashScreen from "./SplashScreen";
import AccessScreen from "./AccessScreen";
import WelcomeScreen from "./WelcomeScreen";
import PlayerHome from "./PlayerHome";

type Step = "splash" | "access" | "welcome" | "home";

export default function PlayerHub() {
  usePageTitle("Player");
  useLayoutColors();
  const { user, loading } = useAuth();
  const { userSlug } = useParams();
  usePublicHead(userSlug && userSlug !== ":userSlug" ? userSlug : null, "Player");
  const [searchParams, setSearchParams] = useSearchParams();
  // Persistência: `?step=home` sobrevive a login/reload via localStorage por slug.
  const storageKey = `player-step-home:${userSlug || "root"}`;
  const skipToHome =
    searchParams.get("step") === "home" ||
    (typeof window !== "undefined" && window.localStorage.getItem(storageKey) === "1");
  const [step, setStep] = useState<Step>(skipToHome ? "home" : "splash");

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
  const { colors: playerColors, bgConfigs: playerBgConfigs } = usePlayerColors(publicUserId);

  // Real-time "connected on player" heartbeat (20s ping).
  usePlayerHeartbeat(publicUserId || user?.id || null);


  useEffect(() => {
    const pickChannelThumb = (channels: any[] | null | undefined): string | null => {
      if (!channels || channels.length === 0) return null;
      const live = channels.filter((c) => c?.active !== false && (c?.type === "audio_live" || c?.type === "video_live"));
      const pool = live.length > 0 ? live : channels;
      // Priority: logo_url (Thumb do Canal 1920×1080) → cover_url (Capa 1080×1920) → background_url (Logo)
      const found =
        pool.find((c) => c?.logo_url) ||
        pool.find((c) => c?.cover_url) ||
        pool.find((c) => c?.background_url) ||
        pool[0];
      return found?.logo_url || found?.cover_url || found?.background_url || null;
    };

    const fetchLogo = async () => {
      const userId = user?.id;
      if (userId) {
        const [empRes, chRes] = await Promise.all([
          supabase.from("empresa_config").select("logo, nome").eq("user_id", userId).single(),
          supabase.from("streaming_channels").select("logo_url, cover_url, background_url, type, active, numero_canal").eq("user_id", userId).eq("active", true).order("numero_canal"),
        ]);
        if (empRes.data) {
          setLogoUrl(empRes.data.logo);
          setChannelName(empRes.data.nome || "");
        }
        setChannelBg(pickChannelThumb(chRes.data as any[] | null));
        setDataReady(true);
        return;
      }
      if (userSlug && userSlug !== ":userSlug") {
        try {
          const { data, error } = await supabase.functions.invoke("public-player-data", {
            body: { slug: userSlug },
          });
          if (!error && data && !data.error) {
            if (data.userId) setPublicUserId(data.userId);
            if (data.empresa?.logo) setLogoUrl(data.empresa.logo);
            if (data.empresa?.nome) setChannelName(data.empresa.nome);
            setChannelBg(pickChannelThumb(data.channels));
          } else {
            console.warn("public-player-data error:", error || data?.error);
          }
        } catch (e) {
          console.warn("Failed to fetch player data:", e);
        }
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

  const onSplashFinish = useCallback(() => {
    setSplashDone(true);
  }, []);

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
    if (!splashDone || loading || !dataReady) return;
    // A WelcomeScreen agora cobre AMBOS os estados (logado e deslogado),
    // mostrando os botões "entrar com google" / "cadastre-se" quando não há
    // usuário. Assim, após o logout o usuário permanece na welcome.
    // Home continua protegido: se não estiver logado, cai na welcome.
    const target: Step = user && skipToHome ? "home" : "welcome";
    setStep((current) => {
      if (current === target) return current;
      transitionTo(target);
      return current;
    });
  }, [splashDone, loading, dataReady, user, skipToHome, transitionTo]);


  const onLoginSuccess = useCallback(() => {
    // Após login, se o fluxo pediu ?step=home, vai direto para home.
    transitionTo(skipToHome ? "home" : "welcome");
  }, [transitionTo, skipToHome]);

  const onWelcomeContinue = useCallback(() => {
    try { window.localStorage.setItem(storageKey, "1"); } catch {}
    const next = new URLSearchParams(searchParams);
    if (next.get("step") !== "home") {
      next.set("step", "home");
      setSearchParams(next, { replace: true });
    }
    transitionTo("home");
  }, [transitionTo, storageKey, searchParams, setSearchParams]);

  // NOTE: do NOT use `scale-*` on this wrapper. Any CSS transform here creates a
  // containing block for descendants with `position: fixed` (like SplashScreen),
  // which then collapse to the wrapper's 0px height and become invisible.
  const wrapperClass = `player-scope transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${fadeOut ? "opacity-0" : "opacity-100"}`;

  if (step === "splash") {
    return (
      <div className={wrapperClass}>
        <SplashScreen logoUrl={logoUrl} channelName={channelName} onFinish={onSplashFinish} ready={!loading && dataReady} />
      </div>
    );
  }

  // Se o usuário estiver deslogado, sempre renderiza a WelcomeScreen (que possui
  // os botões entrar/cadastre-se). Nunca redireciona para AccessScreen.
  if (step === "welcome" || !user) {
    const userName = user?.email?.split("@")[0] || "Visitante";
    return (
      <div className={wrapperClass}>
        <WelcomeScreen
          userName={userName}
          avatarUrl={null}
          backgroundUrl={channelBg}
          channelName={channelName}
          logoUrl={logoUrl}
          onContinue={onWelcomeContinue}
          onLoginSuccess={onLoginSuccess}
          initialEditOpen={welcomeEditOnMount}
          userSlug={userSlug && userSlug !== ":userSlug" ? userSlug : null}
          publicUserId={publicUserId}
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


