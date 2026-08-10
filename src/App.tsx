import { lazy, Suspense, Component, useEffect, type ReactNode } from "react";
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

// Retry wrapper for lazy imports — retries the import promise up to `retries`
// times on chunk load failure, with exponential backoff. IMPORTANT: retries
// must resolve with a real module object ({ default: Component }), NOT with a
// nested lazy component — React.lazy would then fail to render.
export function lazyRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 3,
  delay = 400 // Reduced delay from 800ms to 400ms
) {
  return lazy(() => {
    const attempt = (left: number, wait: number): Promise<{ default: T }> =>
      factory().catch((err) => {
        if (left <= 0) throw err;
        return new Promise<{ default: T }>((resolve, reject) => {
          setTimeout(() => attempt(left - 1, wait * 1.5).then(resolve, reject), wait);
        });
      });
    return attempt(retries, delay);
  });
}


// Lazy-loaded heavy pages with automatic retry
const PlayerHub = lazyRetry(() => import("./pages/player/PlayerHub"));
const PlayerPage = lazyRetry(() => import("./pages/Player"));
const PlayerTvWelcome = lazyRetry(() => import("./pages/player/PlayerTvWelcome"));
const PairPage = lazyRetry(() => import("./pages/PairPage"));
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
}

class ChunkErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, retryCount: 0 };
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    const isChunkError =
      error.message?.includes("Failed to fetch dynamically imported module") ||
      error.message?.includes("Loading chunk") ||
      error.message?.includes("Loading CSS chunk") ||
      error.message?.includes("dynamically imported module");

    // Auto-retry chunk errors up to 3 times with faster logic
    if (isChunkError && this.state.retryCount < 3) {
      this.retryTimer = setTimeout(() => {
        this.setState((prev) => ({ hasError: false, retryCount: prev.retryCount + 1 }));
      }, 400); // Reduced delay from 800ms to 400ms
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  handleRetry = () => {
    this.setState({ hasError: false, retryCount: 0 });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isPlayer = typeof window !== "undefined" && window.location.pathname.includes("/player");

      if (isPlayer && this.state.retryCount < 3) {
        return <PlayerSyncLoader size={32} />;
      }


      return (
        <div
          className="h-screen w-screen flex flex-col items-center justify-center gap-4"
          style={{ backgroundColor: isPlayer ? "#000" : "#131519", color: "#fff" }}
        >
          {this.state.retryCount < 3 ? (
            <>
              <LoadingSpinner size={32} />
              <p className="text-sm opacity-60">
                alterar texto
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
    return this.props.children;
  }
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
          <ChunkErrorBoundary>
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
          </ChunkErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
