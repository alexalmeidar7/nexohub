import { Suspense, Component, Fragment, useEffect, type ReactNode } from "react";
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
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import ResetPassword from "./pages/ResetPassword";
import InlineNotification from "@/components/InlineNotification";
import { initGlobalNotifications } from "@/lib/notify";
initGlobalNotifications();
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import PlayerSyncLoader from "@/components/player/PlayerSyncLoader";

import LayoutVersionGuard from "@/components/LayoutVersionGuard";
import PlayerSplashPrefetch from "@/components/PlayerSplashPrefetch";
import DailyUpdateGuard from "@/components/DailyUpdateGuard";
import { isChunkErrorMessage, lazyRetry, recoverFromChunkFailure } from "@/lib/lazyRetry";

// Lazy-loaded heavy pages with automatic retry
const PlayerHub = lazyRetry(() => import("./pages/player/PlayerHub"));
const PlayerPage = lazyRetry(() => import("./pages/Player"));
const PlayerTvWelcome = lazyRetry(() => import("./pages/player/PlayerTvWelcome"));
const PairPage = lazyRetry(() => import("./pages/PairPage"));
const EntregaPremio = lazyRetry(() => import("./pages/EntregaPremio"));
const GoogleCheckPage = lazyRetry(() => import("./pages/GoogleCheckPage"));
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

interface ErrorBoundaryState {
  hasError: boolean;
  retryCount: number;
  remountKey: number;
}

// Auto-heal delays: remount the failing subtree in place instead of showing a
// dead-end error screen. Only after all attempts fail do we surface the UI.
const AUTO_HEAL_DELAYS_MS = [250, 700, 1800];

class ChunkErrorBoundary extends Component<{ children: ReactNode; locationKey: string }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, retryCount: 0, remountKey: 0 };
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    const isChunkError = isChunkErrorMessage(error.message);

    console.error("[NavigationErrorBoundary]", {
      message: error.message,
      path: window.location.pathname,
      isChunkError,
      attempt: this.state.retryCount,
    });

    // A rejected React.lazy import is cached by React, so remounting it cannot
    // recover on its own — reload once (cache-busted) when allowed.
    if (isChunkError && recoverFromChunkFailure()) return;

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
        this.setState({ hasError: false, retryCount: 0 });
      }
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  handleRetry = () => {
    this.setState((prev) => ({ hasError: false, retryCount: 0, remountKey: prev.remountKey + 1 }));
  };

  handleReload = () => {
    if (!recoverFromChunkFailure(true)) window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isPlayer = typeof window !== "undefined" && window.location.pathname.includes("/player");
      const healing = this.state.retryCount < AUTO_HEAL_DELAYS_MS.length;

      if (isPlayer && healing) {
        return <PlayerSyncLoader size={32} />;
      }

      return (
        <div
          className="h-screen w-screen flex flex-col items-center justify-center gap-4"
          style={{ backgroundColor: isPlayer ? "#000" : "#131519", color: "#fff" }}
        >
          {healing ? (
            <>
              <LoadingSpinner size={32} />
              <p className="text-sm opacity-60">
                Sincronizando ambiente...
              </p>
            </>
          ) : (

            <>
              <p className="text-lg font-semibold">Erro ao carregar a página</p>
              <div className="flex gap-3">
                <button
                  onClick={this.handleRetry}
                  className="px-6 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "#268ffa" }}
                >
                  Tentar novamente
                </button>
                <button
                  onClick={this.handleReload}
                  className="px-6 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                >
                  Recarregar página
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
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <OAuthReturnHandler />
          <PlayerSplashPrefetch />
          <NavigationErrorBoundary>
          <Suspense fallback={<RouteProgress />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<OAuthCallbackRedirect />} />
            <Route path="/~oauth/callback" element={<OAuthCallbackRedirect />} />

            {/* Main routes */}
            <Route path="/home" element={<MasterViewHome />} />
            <Route path="/telapromo" element={<PromocoesKiosk />} />
            <Route path="/player" element={<PlayerHub />} />
            <Route path="/player/watch" element={<PlayerPage />} />
            <Route path="/player/catalog" element={<PlayerCatalog />} />
            <Route path="/player/app" element={<PlayerApp />} />
            <Route path="/tp-externo" element={<TpExterno />} />
            <Route path="/vmix-control" element={<VmixControl />} />
            <Route path="/vmix-control/switcher" element={<VmixControl forcedConnected={true} />} />
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
