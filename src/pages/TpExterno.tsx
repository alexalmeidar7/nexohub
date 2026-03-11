import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import { TP_RESPONSIVE_STYLES } from "@/components/tp/tp-utils";
import TpLogin from "@/components/tp/TpLogin";
import TpMenu from "@/components/tp/TpMenu";
import TpMessage from "@/components/tp/TpMessage";
import TpScreen from "@/components/tp/TpScreen";
import TpController from "@/components/tp/TpController";

export default function TpExterno() {
  const { user, loading: authLoading, signOut } = useAuth();
  usePageTitle("NexoHub - Tele Prompter");

  // Inject responsive styles once
  useEffect(() => {
    const id = "tp-responsive-styles";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = TP_RESPONSIVE_STYLES;
      document.head.appendChild(style);
    }
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  const [step, setStep] = useState<"login" | "menu" | "tp" | "mensagem" | "controlar">("login");

  // Redirect to menu if already logged in
  useEffect(() => {
    if (!authLoading && user && step === "login") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("view") === "tp") {
        setStep("tp");
      } else {
        setStep("menu");
      }
    }
  }, [authLoading, user, step]);

  async function handleLogout() {
    await signOut();
    setStep("login");
  }

  if (step === "login") {
    return <TpLogin authLoading={authLoading} onLoginSuccess={() => setStep("menu")} />;
  }

  if (step === "menu") {
    return (
      <TpMenu
        onMessage={() => setStep("mensagem")}
        onControl={() => setStep("controlar")}
        onOpenTp={() => window.open(`${window.location.pathname}?view=tp`, '_blank')}
        onLogout={handleLogout}
      />
    );
  }

  if (step === "mensagem" && user) {
    return <TpMessage user={user} onBack={() => setStep("menu")} />;
  }

  if (step === "controlar") {
    return <TpController user={user} onBack={() => setStep("menu")} />;
  }

  // step === "tp"
  return <TpScreen user={user} onBack={() => setStep("menu")} />;
}
