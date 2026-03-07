import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useParams } from "react-router-dom";
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

  // Fetch logo for splash/access screens
  useEffect(() => {
    const fetchLogo = async () => {
      let userId = user?.id;
      if (userSlug) {
        // Use edge function for slug-based access
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

  // Advance step once splash animation is done AND auth is resolved
  useEffect(() => {
    if (!splashDone || loading) return;
    if (user) {
      setStep("welcome");
    } else {
      setStep("access");
    }
  }, [splashDone, loading, user]);

  const onLoginSuccess = useCallback(() => {
    setStep("welcome");
  }, []);

  const onGuest = useCallback(() => {
    setStep("home");
  }, []);

  const onWelcomeContinue = useCallback(() => {
    setStep("home");
  }, []);

  if (step === "splash") {
    return <SplashScreen logoUrl={logoUrl} channelName={channelName} onFinish={onSplashFinish} />;
  }

  if (step === "access") {
    return <AccessScreen logoUrl={logoUrl} onLoginSuccess={onLoginSuccess} onGuest={onGuest} />;
  }

  if (step === "welcome") {
    const userName = user?.email?.split("@")[0] || "Visitante";
    return <WelcomeScreen userName={userName} onContinue={onWelcomeContinue} />;
  }

  return <PlayerHome />;
}
