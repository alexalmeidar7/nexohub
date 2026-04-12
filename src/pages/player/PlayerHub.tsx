import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useParams, useSearchParams } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useLayoutColors } from "@/hooks/useLayoutColors";
import { usePlayerColors } from "@/hooks/usePlayerColors";
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
  const [searchParams] = useSearchParams();
  const skipToHome = searchParams.get("step") === "home";
  const [step, setStep] = useState<Step>(skipToHome ? "home" : "splash");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");
  const [fadeOut, setFadeOut] = useState(false);
  const [pendingStep, setPendingStep] = useState<Step | null>(null);
  const [publicUserId, setPublicUserId] = useState<string | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const { colors: playerColors, bgConfigs: playerBgConfigs } = usePlayerColors(publicUserId);

  useEffect(() => {
    const fetchLogo = async () => {
      const userId = user?.id;
      if (userId) {
        const { data } = await supabase.from("empresa_config").select("logo, nome").eq("user_id", userId).single();
        if (data) {
          setLogoUrl(data.logo);
          setChannelName(data.nome || "");
        }
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

  const [splashDone, setSplashDone] = useState(false);

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
    }, 500);
  }, []);

  useEffect(() => {
    if (!splashDone || loading || !dataReady) return;
    // If user is already logged in (returning user), go straight to welcome
    const target: Step = user ? "welcome" : "access";
    transitionTo(target);
  }, [splashDone, loading, dataReady, user, transitionTo]);

  const onLoginSuccess = useCallback(() => {
    transitionTo("welcome");
  }, [transitionTo]);

  const onGuest = useCallback(() => {
    transitionTo("home");
  }, [transitionTo]);

  const onWelcomeContinue = useCallback(() => {
    transitionTo("home");
  }, [transitionTo]);

  const wrapperClass = `transition-opacity duration-500 ease-in-out ${fadeOut ? "opacity-0" : "opacity-100"}`;

  if (step === "splash") {
    return (
      <div className={wrapperClass}>
        <SplashScreen logoUrl={logoUrl} channelName={channelName} onFinish={onSplashFinish} />
      </div>
    );
  }

  if (step === "access") {
    return (
      <div className={wrapperClass}>
        <AccessScreen logoUrl={logoUrl} onLoginSuccess={onLoginSuccess} onGuest={onGuest} />
      </div>
    );
  }

  if (step === "welcome") {
    const userName = user?.email?.split("@")[0] || "Visitante";
    return (
      <div className={wrapperClass}>
        <WelcomeScreen userName={userName} avatarUrl={null} onContinue={onWelcomeContinue} />
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <PlayerHome onBackToAccess={() => transitionTo("access")} />
    </div>
  );
}
