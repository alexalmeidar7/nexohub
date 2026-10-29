import React, { useState, useEffect, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Loader2, Layout, Cpu, ChevronLeft, Clock, Wifi, WifiOff } from "lucide-react";
const VmixPage = React.lazy(() => import("@/components/VmixPage"));
import { useAuth, clearSignOutFlag } from "@/hooks/useAuth";
import vmixControlLogo from "@/assets/logo-mixcontrol.png";
import cleanVmixControlLogo from "@/assets/logo-vmixcontrol-clean.png";
import nexoLogo from "@/assets/logo-nxo.png";
import VmixControlSkeleton from "@/components/skeletons/VmixControlSkeleton";
import "@/styles/vmix-flat-palette.css";

type VmixControlProps = {
  forcedConnected?: boolean;
  cleanLayout?: boolean;
  automationMode?: boolean;
};

export default function VmixControl({ forcedConnected = false, cleanLayout = false, automationMode = false }: VmixControlProps) {
  const { user, loading, signOut } = useAuth();
  const buttonPreviewMode = new URLSearchParams(window.location.search).get("buttonPreview");
  const isButtonDevicePreview = ["mobile", "tablet", "desktop"].includes(buttonPreviewMode || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(false);
  const [headerTime, setHeaderTime] = useState(() => new Date());
  const [vmixOnline, setVmixOnline] = useState(false);
  const [headerStudioName, setHeaderStudioName] = useState("");
  const [showBridgePairing, setShowBridgePairing] = useState(false);
  const [bridgePairingCode, setBridgePairingCode] = useState("");
  const [bridgePairingError, setBridgePairingError] = useState("");
  const [bridgePairingLoading, setBridgePairingLoading] = useState(false);
  const [bridgeDeviceStatus, setBridgeDeviceStatus] = useState<{ connected: boolean; deviceName?: string | null; backendReady: boolean }>({ connected: false, backendReady: false });
  const createBridgePairing = async () => {
    setBridgePairingLoading(true); setBridgePairingError(""); setBridgePairingCode(""); setShowBridgePairing(true);
    const { data, error } = await supabase.functions.invoke("vmix-bridge-pairing");
    setBridgePairingLoading(false);
    if (error || !data?.pairingCode) { setBridgePairingError(error?.message || "Não foi possível gerar o código. Verifique se as funções do Bridge foram publicadas."); return; }
    setBridgePairingCode(data.pairingCode);
  };

  useEffect(() => {
    if (!user || !automationMode || isButtonDevicePreview) {
      setBridgeDeviceStatus({ connected: false, backendReady: false });
      return;
    }
    let cancelled = false;
    const refreshBridgeStatus = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("vmix-bridge-status");
        if (!cancelled && !error && data) {
          setBridgeDeviceStatus({ connected: Boolean(data.connected), deviceName: data.deviceName || null, backendReady: data.backendReady === true });
        } else if (!cancelled && error) {
          setBridgeDeviceStatus({ connected: false, backendReady: false });
        }
      } catch {
        if (!cancelled) setBridgeDeviceStatus({ connected: false, backendReady: false });
      }
    };
    void refreshBridgeStatus();
    const interval = window.setInterval(() => void refreshBridgeStatus(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user?.id, automationMode, isButtonDevicePreview]);

  useEffect(() => {
    const timer = window.setInterval(() => setHeaderTime(new Date()), 1000);
    const updateStatus = (event: Event) => setVmixOnline(Boolean((event as CustomEvent).detail?.connected));
    const updateStudio = (event: Event) => setHeaderStudioName(String((event as CustomEvent).detail?.studioName || "").trim());
    window.addEventListener("vmix-connection-status", updateStatus);
    window.addEventListener("vmix-studio-name", updateStudio);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("vmix-connection-status", updateStatus);
      window.removeEventListener("vmix-studio-name", updateStudio);
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSigning(true);
    clearSignOutFlag();
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setError(cleanLayout ? "Usuário/e-mail ou senha incorretos." : "E-mail ou senha incorretos.");
    setSigning(false);
  };

  const handleLogout = async () => {
    await signOut();
  };

  if (loading) return <VmixControlSkeleton cleanLayout={cleanLayout} />;

  // The clean House Mix-inspired layout is opt-in and is enabled only on /vmix-control.
  if (cleanLayout) {
    return (
      <div className="vmix-flat-palette relative min-h-screen w-full overflow-hidden flex flex-col" style={{ backgroundColor: "#111111", color: "#fff" }}>
        {!isButtonDevicePreview && (
        <header className="w-full px-4 sm:px-8 pt-6 sm:pt-8 shrink-0 relative z-20">
          <div className="relative mx-auto w-full max-w-[1656px] min-h-[54px] sm:min-h-[56px] rounded-full flex items-center px-5 sm:px-8 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]" style={{ backgroundColor: "rgba(13, 31, 62, 0.78)", backdropFilter: "blur(8px) saturate(115%)", WebkitBackdropFilter: "blur(8px) saturate(115%)" }}>
            <img src={cleanVmixControlLogo} alt="Nexo vMix Control" className="block h-auto max-h-[17px] w-auto max-w-full object-contain object-left" />

            {user && (
              automationMode && bridgeDeviceStatus.connected ? (
                <div role="status" title="Nexo Bridge ativo neste computador" className="mr-3 inline-flex max-w-[48%] shrink items-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-600 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-white animate-pulse" />
                  <span className="truncate">Ponte remota conectado ao {bridgeDeviceStatus.deviceName || "computador do estúdio"}</span>
                </div>
              ) : automationMode && !bridgeDeviceStatus.backendReady ? (
                <span role="status" title="O backend da Ponte remota ainda não foi liberado neste projeto." className="mr-3 inline-flex items-center rounded-lg bg-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white/60">Ponte remota em preparação</span>
              ) : (
                <button type="button" onClick={createBridgePairing} className="mr-3 inline-flex items-center gap-2 rounded-lg bg-[#0042A3] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-[#0065F9]" title="Vincular computador do estúdio para acesso remoto">Ponte remota</button>
              )
            )}
            {user && (
              <div className="ml-auto flex items-center gap-3 pl-4">
                <div className="relative group/account">
                  <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0055ff] text-white text-sm font-bold uppercase transition-colors hover:bg-[#0042A3] focus:outline-none focus:ring-2 focus:ring-[#0065F9]/50" title="Conta do usuário" aria-label="Abrir menu da conta">
                    {(String(user.user_metadata?.full_name || user.user_metadata?.name || user.email || "U").trim()[0] || "U").toUpperCase()}
                  </button>
                  <div className="invisible opacity-0 group-hover/account:visible group-hover/account:opacity-100 group-focus-within/account:visible group-focus-within/account:opacity-100 absolute right-0 top-full z-50 mt-2 w-64 rounded-xl bg-[#242424] p-4 text-white transition-opacity duration-150">
                    <p className="truncate text-sm font-semibold">{String(user.user_metadata?.full_name || user.user_metadata?.name || "Usuário")}</p>
                    <p className="mt-1 truncate text-xs text-white/60">{user.email}</p>
                    <button onClick={handleLogout} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#333333] px-3 py-2 text-sm font-semibold transition-colors hover:bg-[#444444]">
                      <LogOut size={15} /> Sair
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </header>
        )}

              {showBridgePairing && !isButtonDevicePreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="bridge-pairing-title">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#19191f] p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="bridge-pairing-title" className="text-lg font-bold">Ponte remota NexoHub</h2><p className="mt-2 text-sm text-white/65">Gere um código temporário para vincular o computador onde o vMix está instalado.</p></div>
              <button type="button" onClick={() => setShowBridgePairing(false)} className="rounded-full bg-white/10 px-3 py-1" aria-label="Fechar">✕</button>
            </div>
            {bridgePairingLoading ? <p className="mt-6 text-sm text-white/70">Gerando código seguro...</p> : null}
            {bridgePairingError ? <p className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{bridgePairingError}</p> : null}
            {bridgePairingCode ? <div className="mt-5 rounded-xl bg-black/40 p-4">
              <p className="text-xs uppercase tracking-widest text-white/50">Código válido por 10 minutos</p>
              <p className="my-3 break-all font-mono text-lg font-bold tracking-wider">{bridgePairingCode}</p>
              <button type="button" onClick={() => navigator.clipboard.writeText(bridgePairingCode)} className="rounded-lg bg-[#0055ff] px-4 py-2 text-sm font-semibold">Copiar código</button>
            </div> : null}
            <p className="mt-5 text-xs leading-relaxed text-white/50">Use o código no NexoHub Bridge do computador do estúdio. Não compartilhe o token gerado após o pareamento.</p>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={createBridgePairing} disabled={bridgePairingLoading} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold disabled:opacity-50">Gerar novo código</button><button type="button" onClick={() => setShowBridgePairing(false)} className="rounded-lg bg-[#0055ff] px-4 py-2 text-sm font-semibold">Fechar</button></div>
          </div>
        </div>
      )}
        <main className="relative flex-1 flex items-center justify-center px-4 py-8 sm:py-10">
          {!user ? (
            <form onSubmit={handleLogin} className="w-full max-w-[380px] min-h-[438px] rounded-[28px] px-8 py-9 sm:px-8 flex flex-col" style={{ backgroundColor: "#aaa", color: "#222" }}>
              <h1 className="mb-7 text-[18px] font-medium tracking-tight">login de acesso</h1>
              {error && <div className="mb-3 rounded-lg bg-red-100/80 px-3 py-2 text-xs font-medium text-red-800" role="alert">{error}</div>}
              <div className="flex flex-col gap-3">
                <input type="text" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuário" aria-label="Usuário ou e-mail" className="h-[51px] w-full rounded-full border-0 bg-white px-5 text-[15px] text-[#222] outline-none placeholder:text-[#b8b8b8] focus:ring-2 focus:ring-[#0055ff]/25" />
                <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="********" aria-label="Senha" className="h-[51px] w-full rounded-full border-0 bg-white px-5 text-[15px] text-[#222] outline-none placeholder:text-[#b8b8b8] focus:ring-2 focus:ring-[#0055ff]/25" />
              </div>
              <button type="submit" disabled={signing} className="mt-3 inline-flex h-[51px] w-fit min-w-[101px] items-center justify-center gap-2 rounded-full bg-[#292929] px-7 text-sm font-medium text-white hover:bg-[#202020] disabled:cursor-wait disabled:opacity-60">
                {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {signing ? "entrando" : "entrar"}
              </button>
              <div className="mt-auto pt-10 text-[15px] leading-[1.4] text-[#292929]">
                <p className="font-semibold">esqueceu login ou senha?</p>
                <p>fale com o suporte</p>
              </div>
            </form>
          ) : (
            <div className="w-full h-full min-h-[480px]" style={{ color: "#fff" }}>
              <Suspense fallback={<div className="w-full min-h-[480px]" />}><VmixPage forcedConnected={forcedConnected} cleanLayout /></Suspense>
            </div>
          )}
        </main>

        <footer className="pointer-events-none absolute bottom-5 sm:bottom-7 left-5 sm:left-8 lg:left-[max(32px,calc((100vw-1656px)/2))] z-10">
          <img src={nexoLogo} alt="Nexo soluções visuais" className="block h-auto w-[104px] sm:w-[119px] object-contain" />
        </footer>
      </div>
    );
  }

  // Original layout retained for /vmix-control/switcher and any other callers.
  if (!user) {
    return (
      <div className="vmix-flat-palette relative min-h-screen w-full flex items-center justify-center overflow-hidden px-4 py-10" style={{ backgroundColor: "#080d18", color: "#fff", backgroundImage: "radial-gradient(ellipse at 15% 0%, rgba(0,101,249,0.22), transparent 42%), radial-gradient(ellipse at 100% 100%, rgba(0,66,163,0.18), transparent 45%)" }}>
        <form onSubmit={handleLogin} className="relative w-full max-w-[360px] rounded-[22px] px-7 py-8 sm:px-8 flex flex-col gap-5" style={{ backgroundColor: "rgba(9,16,29,0.92)", border: "1px solid rgba(59,130,246,0.28)", boxShadow: "0 24px 80px rgba(0,0,0,0.38)", backdropFilter: "blur(16px)" }}>
          <div className="flex flex-col items-center gap-3 mb-1">
            <img src={cleanVmixControlLogo} alt="NEXO VMIX CONTROL" className="h-[18px] w-auto max-w-[220px] object-contain opacity-95" />
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-center" style={{ color: "#aab7ca" }}>Faça login para acessar o controle</p>
          </div>
          {error && <div className="text-xs text-center font-medium px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(220,38,38,0.12)", color: "#fca5a5", border: "1px solid rgba(248,113,113,0.25)" }} role="alert">{error}</div>}
          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: "#b9c7dc" }}>E-mail</label>
            <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500/30" style={{ backgroundColor: "rgba(255,255,255,0.035)", color: "#fff", border: "1px solid rgba(148,163,184,0.3)" }} />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: "#b9c7dc" }}>Senha</label>
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500/30" style={{ backgroundColor: "rgba(255,255,255,0.035)", color: "#fff", border: "1px solid rgba(148,163,184,0.3)" }} />
          </div>
          <button type="submit" disabled={signing} className="mt-1 w-full py-3 rounded-xl text-[11px] font-extrabold uppercase tracking-[0.16em] flex items-center justify-center gap-2 transition-all hover:brightness-110 disabled:opacity-50" style={{ background: "linear-gradient(105deg, #0065F9, #0052d4)", color: "#fff", boxShadow: "0 8px 24px rgba(0,101,249,0.22)" }}>
            {signing ? <Loader2 className="animate-spin" size={16} /> : null}
            {signing ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="vmix-flat-palette min-h-screen flex flex-col" style={{ backgroundColor: "#111111" }}>
      <header className="w-full shrink-0 px-0 pt-1 sm:pt-2 relative z-20">
        <div className={`relative mx-auto flex w-full max-w-[1440px] min-h-[44px] items-center justify-between px-4 sm:px-6 ${automationMode && !isButtonDevicePreview ? "rounded-full border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]" : isButtonDevicePreview ? "rounded-none" : "rounded-xl"}`} style={automationMode ? { backgroundColor: "rgba(13, 31, 62, 0.78)", backdropFilter: "blur(8px) saturate(115%)", WebkitBackdropFilter: "blur(8px) saturate(115%)" } : { backgroundColor: "#242424" }}>
          <img src={cleanVmixControlLogo} alt="Nexo vMix Control" className="pointer-events-none block h-auto max-h-[14px] w-auto max-w-[34%] object-contain object-left" />
          {user && !isButtonDevicePreview && (
            automationMode && bridgeDeviceStatus.connected ? (
              <div role="status" title="Nexo Bridge ativo neste computador" className="ml-auto mr-3 inline-flex max-w-[48%] shrink items-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-600 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white">
                <span className="h-2 w-2 shrink-0 rounded-full bg-white animate-pulse" />
                <span className="truncate">Ponte remota conectado ao {bridgeDeviceStatus.deviceName || "computador do estúdio"}</span>
              </div>
            ) : automationMode && !bridgeDeviceStatus.backendReady ? (
              <span role="status" title="O backend da Ponte remota ainda não foi liberado neste projeto." className="ml-auto mr-3 inline-flex shrink-0 items-center rounded-lg bg-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white/60">Ponte remota em preparação</span>
            ) : (
              <button type="button" onClick={createBridgePairing} className="ml-auto mr-3 inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#0042A3] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#0065F9]" title="Vincular computador do estúdio para acesso remoto">Ponte remota</button>
            )
          )}
          {user && (
            <div className={`${isButtonDevicePreview ? "ml-auto" : ""} flex shrink-0 items-center gap-1.5`} title={vmixOnline ? "vMix conectado" : "vMix desconectado"}>
              {vmixOnline ? <Wifi size={13} className="text-emerald-400" /> : <WifiOff size={13} className="text-red-400" />}
              <span className={`text-[9px] font-bold uppercase tracking-wide ${vmixOnline ? "text-emerald-400" : "text-red-400"}`}>{vmixOnline ? "Conectado" : "Desconectado"}</span>
            </div>
          )}
        </div>
      </header>
      {showBridgePairing && !isButtonDevicePreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="bridge-pairing-title">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#19191f] p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="bridge-pairing-title" className="text-lg font-bold">Ponte remota NexoHub</h2><p className="mt-2 text-sm text-white/65">Gere um código temporário para vincular o computador onde o vMix está instalado.</p></div>
              <button type="button" onClick={() => setShowBridgePairing(false)} className="rounded-full bg-white/10 px-3 py-1" aria-label="Fechar">✕</button>
            </div>
            {bridgePairingLoading ? <p className="mt-6 text-sm text-white/70">Gerando código seguro...</p> : null}
            {bridgePairingError ? <p className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{bridgePairingError}</p> : null}
            {bridgePairingCode ? <div className="mt-5 rounded-xl bg-black/40 p-4">
              <p className="text-xs uppercase tracking-widest text-white/50">Código válido por 10 minutos</p>
              <p className="my-3 break-all font-mono text-lg font-bold tracking-wider">{bridgePairingCode}</p>
              <button type="button" onClick={() => navigator.clipboard.writeText(bridgePairingCode)} className="rounded-lg bg-[#0055ff] px-4 py-2 text-sm font-semibold">Copiar código</button>
            </div> : null}
            <p className="mt-5 text-xs leading-relaxed text-white/50">Use o código no NexoHub Bridge do computador do estúdio. Não compartilhe o token gerado após o pareamento.</p>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={createBridgePairing} disabled={bridgePairingLoading} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold disabled:opacity-50">Gerar novo código</button><button type="button" onClick={() => setShowBridgePairing(false)} className="rounded-lg bg-[#0055ff] px-4 py-2 text-sm font-semibold">Fechar</button></div>
          </div>
        </div>
      )}
      <main className={`mx-auto w-full max-w-[1440px] flex-1 ${isButtonDevicePreview ? "p-0" : "p-6"}`} style={{ backgroundColor: "transparent" }}>
        <Suspense fallback={<div className="w-full min-h-[480px]" />}><VmixPage forcedConnected={forcedConnected} automationMode={automationMode} /></Suspense>
      </main>
    </div>
  );
}
