import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useParams, useSearchParams } from "react-router-dom";
import SplashScreen from "./SplashScreen";
import AccessScreen from "./AccessScreen";
import WelcomeScreen from "./WelcomeScreen";
import PlayerHome from "./PlayerHome";

type Step = "splash" | "access" | "welcome" | "home";

export default function PlayerHub() {
  const { user, loading } = useAuth();
  const { userSlug } = useParams();
  const [step, setStep] = useState<Step>("splash");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");
  const [fadeOut, setFadeOut] = useState(false);
  const [pendingStep, setPendingStep] = useState<Step | null>(null);

  useEffect(() => {
    const fetchLogo = async () => {
      let userId = user?.id;
      if (userSlug) {
        const { data } = await supabase.functions.invoke("public-player-data", {
          body: { slug: userSlug },
        });
        if (data?.empresa?.logo) setLogoUrl(data.empresa.logo);
        if (data?.empresa?.nome) setChannelName(data.empresa.nome);
        return;
      }
      if (!userId) return;
      const { data } = await supabase.from("empresa_config").select("logo, nome").eq("user_id", userId).single();
      if (data) {
        setLogoUrl(data.logo);
        setChannelName(data.nome || "");
      }
    };
    fetchLogo();
  }, [user, userSlug]);

  const [splashDone, setSplashDone] = useState(false);

  const onSplashFinish = useCallback(() => {
    setSplashDone(true);
  }, []);

  useEffect(() => {
    if (!splashDone || loading) return;
    if (user) {
      setStep("welcome");
    } else {
      setStep("access");
    }
  }, [splashDone, loading, user]);

  const transitionTo = useCallback((target: Step) => {
    setFadeOut(true);
    setPendingStep(target);
    setTimeout(() => {
      setStep(target);
      setFadeOut(false);
      setPendingStep(null);
    }, 500);
  }, []);

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
    return <SplashScreen logoUrl={logoUrl} channelName={channelName} onFinish={onSplashFinish} />;
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
