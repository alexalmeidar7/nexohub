import { Suspense, Component, Fragment, useEffect, useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import RouteProgress from "@/components/RouteProgress";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate, useLocation } from "react-router-dom";
import { consumeOAuthReturnPath } from "@/lib/oauthReturn";

// Redirect helper that interpolates :userSlug from the current URL params.
// Plain <Navigate to="/:userSlug/..."> does NOT substitute params and would
// send the browser literally to "/:userSlug/...", producing a blank page.
function SlugRedirect({ template }: { template: string }) {
  const { userSlug = "" } = useParams();
  const { search, hash } = window.location;
  return <Navigate to={`${template.replace(":userSlug", userSlug)}${search}${hash}`} replace />;
}

// Slug guard: valida o :userSlug ANTES de renderizar rotas dinâmicas. Se o
// parâmetro chegar vazio, como placeholder literal (":userslug"), ou com
// caracteres inválidos, redireciona para a home em vez de disparar o edge
// function com um slug inexistente e mostrar tela em branco.
const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/i;
function SlugGuard({ children }: { children: ReactNode }) {
  const { userSlug = "" } = useParams();
  const clean = (userSlug || "").trim();
  if (!clean || !SLUG_RE.test(clean) || clean.toLowerCase() === ":userslug") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function OAuthReturnHandler() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/auth/popup-callback") return;
    const target = consumeOAuthReturnPath();
    if (!target) return;
    if (target === `${location.pathname}${location.search}${location.hash}`) return;
    navigate(target, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

  return null;
}

function OAuthCallbackRedirect() {
  const target = consumeOAuthReturnPath() || "/";
  return <Navigate to={target} replace />;
}

function DesktopWindowControls() {
  const [windowState, setWindowState] = useState<{ auxiliary: boolean; fullscreen: boolean } | null>(null);
  useEffect(() => {
    if (!window.houseMixDesktop) return;
    const refresh = () => void window.houseMixDesktop?.getWindowState().then(setWindowState).catch(() => setWindowState(null));
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!windowState?.auxiliary) return null;
  return (
    <button
      type="button"
      onClick={() => void window.houseMixDesktop?.toggleFullscreen().then((fullscreen) => setWindowState((state) => state ? { ...state, fullscreen } : state))}
      className="fixed right-3 top-3 z-[10000] flex items-center gap-2 rounded-lg bg-slate-950/85 px-3 py-2 text-sm font-semibold text-white shadow-lg ring-1 ring-white/20 backdrop-blur hover:bg-blue-700"
      title={windowState.fullscreen ? "Sair da tela cheia (Esc)" : "Exibir em tela cheia"}
    >
      {windowState.fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      {windowState.fullscreen ? "Sair da tela cheia" : "Tela cheia"}
    </button>
  );
}
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import ResetPassword from "./pages/ResetPassword";
import InlineNotification from "@/components/InlineNotification";
import LocalImageCache from "@/components/LocalImageCache";
import DesktopLocalMediaSync from "@/components/DesktopLocalMediaSync";
import { initGlobalNotifications } from "@/lib/notify";
initGlobalNotifications();
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import PlayerSyncLoader from "@/components/player/PlayerSyncLoader";
import { pruneLocalStorageEmergency } from "@/lib/musicStorageKeys";

import LayoutVersionGuard from "@/components/LayoutVersionGuard";
import DailyUpdateGuard from "@/components/DailyUpdateGuard";
import { isChunkErrorMessage, lazyRetry, recoverFromChunkFailure } from "@/lib/lazyRetry";

// Lazy-loaded heavy pages with automatic retry
const PlayerHub = lazyRetry(() => import("./pages/player/PlayerHub"));
const PlayerPage = lazyRetry(() => import("./pages/Player"));
const PlayerTvWelcome = lazyRetry(() => import("./pages/player/PlayerTvWelcome"));
const PairPage = lazyRetry(() => import("./pages/PairPage"));
const EntregaPremio = lazyRetry(() => import("./pages/EntregaPremio"));
const GoogleCheckPage = lazyRetry(() => import("./pages/GoogleCheckPage"));
const OAuthPopupCallback = lazyRetry(() => import("./pages/OAuthPopupCallback"));
const TvPairingEventsPage = lazyRetry(() => import("./pages/TvPairingEventsPage"));
const PlayerApp = lazyRetry(() => import("./pages/PlayerApp"));
const PromocoesKiosk = lazyRetry(() => import("./pages/Promocoes"));
const MasterViewHome = lazyRetry(() => import("./pages/masterview/MasterViewHome"));
const TpExterno = lazyRetry(() => import("./pages/TpExterno"));
const PlayerCatalog = lazyRetry(() => import("./pages/player/PlayerCatalog"));
const VmixControl = lazyRetry(() => import("./pages/VmixControl"));
const CenarioTela = lazyRetry(() => import("./pages/CenarioTela"));
const TelaInterativa = lazyRetry(() => import("./pages/TelaInterativa"));
const CenarioTelaFull = lazyRetry(() => import("./pages/CenarioTelaFull"));
const CenarioEstudioWebTela = lazyRetry(() => import("./pages/CenarioEstudioWebTela"));
const IntercomListener = lazyRetry(() => import("./pages/IntercomListener"));
const VmixAssunto = lazyRetry(() => import("./pages/VmixAssunto"));
const XmlPublicEndpoint = lazyRetry(() => import("./pages/XmlPublicEndpoint"));

interface ErrorBoundaryState {
  hasError: boolean;
  retryCount: number;
  remountKey: number;
  errorMessage?: string;
}

// Auto-heal delays: remount the failing subtree in place instead of showing a
// dead-end error screen. Only after all attempts fail do we surface the UI.
const AUTO_HEAL_DELAYS_MS = [250, 700, 1800];

class ChunkErrorBoundary extends Component<{ children: ReactNode; locationKey: string }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, retryCount: 0, remountKey: 0 };
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error?.message || String(error) };
  }

  componentDidCatch(error: Error) {
    const isChunkError = isChunkErrorMessage(error.message);

    console.error("[NavigationErrorBoundary]", {
      message: error.message,
      stack: error.stack,
      path: window.location.pathname,
      isChunkError,
      attempt: this.state.retryCount,
    });

    this.setState({ errorMessage: error?.message || String(error) });

    const msg = (error?.message || "").toLowerCase();
    if (msg.includes("quota") || msg.includes("setitem") || error?.name === "QuotaExceededError") {
      try {
        pruneLocalStorageEmergency();
      } catch {}
    }

    // A rejected React.lazy import is cached by React, so remounting it cannot
    // recover on its own — reload once (cache-busted) when allowed.
    if (isChunkError && recoverFromChunkFailure(true)) return;

    const delay = AUTO_HEAL_DELAYS_MS[this.state.retryCount];
    if (delay === undefined) {
      if (isChunkError) {
        recoverFromChunkFailure(true);
        return;
      }
      // Out of in-place attempts: show the manual recovery UI.
      this.setState({ retryCount: AUTO_HEAL_DELAYS_MS.length });
      return;
    }

    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.setState((prev) => ({
        hasError: false,
        retryCount: prev.retryCount + 1,
        remountKey: prev.remountKey + 1,
      }));
    }, delay);
  }

  componentDidUpdate(previousProps: Readonly<{ children: ReactNode; locationKey: string }>) {
    // A new route is a clean slate — forget previous failures.
    if (previousProps.locationKey !== this.props.locationKey) {
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      if (this.state.hasError || this.state.retryCount > 0) {
        this.setState({ hasError: false, retryCount: 0, errorMessage: undefined });
      }
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  handleRetry = () => {
    if (this.state.errorMessage && isChunkErrorMessage(this.state.errorMessage)) {
      if (recoverFromChunkFailure(true)) return;
      window.location.reload();
      return;
    }
    this.setState((prev) => ({ hasError: false, retryCount: 0, remountKey: prev.remountKey + 1, errorMessage: undefined }));
  };

  handleReload = () => {
    if (!recoverFromChunkFailure(true)) window.location.reload();
  };

  handleClearCacheAndLogin = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      const isPlayer = typeof window !== "undefined" && window.location.pathname.includes("/player");
      const healing = this.state.retryCount < AUTO_HEAL_DELAYS_MS.length;

      if (isPlayer && healing) {
        return <PlayerSyncLoader size={44} />;
      }

      return (
        <div
          className="h-screen w-screen flex flex-col items-center justify-center gap-4 px-4 text-center"
          style={{ backgroundColor: isPlayer ? "#000" : "#000000", color: "#fff" }}
        >
          {healing ? (
            <>
              <LoadingSpinner size={44} color="#ffffff" />
              <p className="text-sm opacity-60">
                Sincronizando ambiente...
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold">Erro ao carregar a página</p>
              {this.state.errorMessage && (
                <div className="max-w-xl p-3 bg-red-950/40 border border-red-500/30 rounded-lg text-xs text-red-200 font-mono text-left break-words">
                  {this.state.errorMessage}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={this.handleRetry}
                  className="px-6 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 cursor-pointer"
                  style={{ backgroundColor: "#268ffa" }}
                >
                  Tentar novamente
                </button>
                <button
                  onClick={this.handleReload}
                  className="px-6 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 cursor-pointer"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                >
                  Recarregar página
                </button>
                <button
                  onClick={this.handleClearCacheAndLogin}
                  className="px-6 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 cursor-pointer text-amber-300 border border-amber-500/40"
                  style={{ backgroundColor: "rgba(245, 158, 11, 0.1)" }}
                >
                  Limpar sessão e ir para Login
                </button>
              </div>
            </>
          )}
        </div>
      );
    }
    return <Fragment key={this.state.remountKey}>{this.props.children}</Fragment>;
  }
}

function NavigationErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <ChunkErrorBoundary locationKey={`${location.pathname}${location.search}${location.hash}`}>
      {children}
    </ChunkErrorBoundary>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <InlineNotification mode="fixed" />
      <LayoutVersionGuard />
      <DailyUpdateGuard />
      
      <AuthProvider>
        <DesktopLocalMediaSync />
        <LocalImageCache />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <DesktopWindowControls />
          <OAuthReturnHandler />
          <NavigationErrorBoundary>
          <Suspense fallback={<RouteProgress />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<OAuthCallbackRedirect />} />
            <Route path="/auth/popup-callback" element={<OAuthPopupCallback />} />
            <Route path="/~oauth/callback" element={<OAuthCallbackRedirect />} />

            {/* Main routes */}
            <Route path="/home" element={<MasterViewHome />} />
            <Route path="/telapromo" element={<PromocoesKiosk />} />
            <Route path="/player" element={<PlayerHub />} />
            <Route path="/player/watch" element={<PlayerPage />} />
            <Route path="/player/catalog" element={<PlayerCatalog />} />
            <Route path="/player/app" element={<PlayerApp />} />
            <Route path="/tp-externo" element={<TpExterno />} />
            <Route path="/vmix-control" element={<VmixControl cleanLayout={true} />} />
            <Route path="/vmix-control/switcher" element={<Navigate to="/vmix-control/automation" replace />} />
            <Route path="/vmix-control/automation" element={<VmixControl forcedConnected={true} automationMode={true} />} />
            <Route path="/cenario-tela" element={<CenarioTela />} />
            <Route path="/intercom" element={<IntercomListener />} />
            <Route path="/cenario-tela-full" element={<CenarioTelaFull />} />
            <Route path="/telainterativatelao" element={<TelaInterativa />} />
            <Route path="/cenario-estudio-web/:userSlug/:id" element={<CenarioEstudioWebTela />} />
            <Route path="/vmix/assunto/:userId" element={<VmixAssunto />} />

            {/* Slug routes for dynamic access */}
            <Route path="/:userSlug/telapromo" element={<PromocoesKiosk />} />
            <Route path="/:userSlug/locutor" element={<PromocoesKiosk />} />
            <Route path="/locutor" element={<PromocoesKiosk />} />
            <Route path="/:userSlug/player" element={<SlugGuard><PlayerHub /></SlugGuard>} />
            <Route path="/:userSlug/player/tv" element={<SlugGuard><PlayerTvWelcome /></SlugGuard>} />
            <Route path="/player/tv" element={<Navigate to="/" replace />} />
            <Route path="/:userSlug/pair" element={<PairPage />} />
            <Route path="/entrega/:token" element={<EntregaPremio />} />
            <Route path="/google-check" element={<GoogleCheckPage />} />
            <Route path="/:userSlug/google-check" element={<GoogleCheckPage />} />
            <Route path="/tv-pairing-events" element={<TvPairingEventsPage />} />
            <Route path="/:userSlug/player/watch" element={<PlayerPage />} />
            <Route path="/:userSlug/player/catalog" element={<PlayerCatalog />} />
            <Route path="/:userSlug/player/app" element={<PlayerApp />} />
            <Route path="/:userSlug/telainterativatelao" element={<TelaInterativa />} />

            {/* Public XML Feeds */}
            <Route path="/xml/:slug/:file" element={<XmlPublicEndpoint />} />
            <Route path="/xml/:file" element={<XmlPublicEndpoint />} />

            {/* Supabase Edge Function & Storage compatibility endpoints */}
            <Route path="/functions/v1/:functionName" element={<XmlPublicEndpoint />} />
            <Route path="/storage/v1/object/public/xml-files/:fileName" element={<XmlPublicEndpoint />} />




            {/* User / NexoHub legacy redirects */}
            <Route path="/user" element={<Navigate to="/home" replace />} />
            <Route path="/user/login" element={<Index />} />
            <Route path="/user/nexohub/home" element={<Navigate to="/home" replace />} />
            <Route path="/user/nexohub/telapromo" element={<Navigate to="/telapromo" replace />} />
            <Route path="/user/:userSlug/nexohub/telapromo" element={<SlugRedirect template="/:userSlug/telapromo" />} />
            <Route path="/user/nexohub/locutor" element={<Navigate to="/locutor" replace />} />
            <Route path="/user/:userSlug/nexohub/locutor" element={<SlugRedirect template="/:userSlug/locutor" />} />
            <Route path="/user/nexohub/player" element={<Navigate to="/player" replace />} />
            <Route path="/user/:userSlug/nexohub/player" element={<SlugRedirect template="/:userSlug/player" />} />
            <Route path="/user/nexohub/player/watch" element={<Navigate to="/player/watch" replace />} />
            <Route path="/user/:userSlug/nexohub/player/watch" element={<SlugRedirect template="/:userSlug/player/watch" />} />
            <Route path="/user/nexohub/player/catalog" element={<Navigate to="/player/catalog" replace />} />
            <Route path="/user/:userSlug/nexohub/player/catalog" element={<SlugRedirect template="/:userSlug/player/catalog" />} />
            <Route path="/user/nexohub/player/app" element={<Navigate to="/player/app" replace />} />
            <Route path="/user/:userSlug/nexohub/player/app" element={<SlugRedirect template="/:userSlug/player/app" />} />
            <Route path="/user/:userSlug/telainterativatelao" element={<SlugRedirect template="/:userSlug/telainterativatelao" />} />

            {/* Legacy redirects */}
            <Route path="/masterview/home" element={<Navigate to="/home" replace />} />
            <Route path="/modulo-tela-estudio-promocao" element={<Navigate to="/telapromo" replace />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </NavigationErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
