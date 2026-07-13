import { lazy, Suspense, Component, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import RouteProgress from "@/components/RouteProgress";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";

// Redirect helper that interpolates :userSlug from the current URL params.
// Plain <Navigate to="/:userSlug/..."> does NOT substitute params and would
// send the browser literally to "/:userSlug/...", producing a blank page.
function SlugRedirect({ template }: { template: string }) {
  const { userSlug = "" } = useParams();
  return <Navigate to={template.replace(":userSlug", userSlug)} replace />;
}
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import LayoutVersionGuard from "@/components/LayoutVersionGuard";

// Retry wrapper for lazy imports — retries up to 3 times on chunk load failure
function lazyRetry(factory: () => Promise<{ default: React.ComponentType<any> }>, retries = 3) {
  return lazy(() =>
    factory().catch((err) => {
      if (retries > 0) {
        return new Promise<{ default: React.ComponentType<any> }>((resolve) =>
          setTimeout(() => resolve(lazyRetry(factory, retries - 1) as any), 800)
        );
      }
      throw err;
    })
  );
}

// Lazy-loaded heavy pages with automatic retry
const PlayerHub = lazyRetry(() => import("./pages/player/PlayerHub"));
const PlayerPage = lazyRetry(() => import("./pages/Player"));
const PlayerApp = lazyRetry(() => import("./pages/PlayerApp"));
const PromocoesKiosk = lazyRetry(() => import("./pages/Promocoes"));
const AdminDashboard = lazyRetry(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazyRetry(() => import("./pages/admin/AdminUsers"));
const AdminModules = lazyRetry(() => import("./pages/admin/AdminModules"));
const AdminPlans = lazyRetry(() => import("./pages/admin/AdminPlans"));
const AdminMessages = lazyRetry(() => import("./pages/admin/AdminMessages"));
const MasterViewHome = lazyRetry(() => import("./pages/masterview/MasterViewHome"));
const AdminLogin = lazyRetry(() => import("./pages/admin/AdminLogin"));
const JornalExport = lazyRetry(() => import("./pages/JornalExport"));
const RoteiroExport = lazyRetry(() => import("./pages/RoteiroExport"));
const RoteiroApresentadorEdit = lazyRetry(() => import("./pages/RoteiroApresentadorEdit"));
const TpExterno = lazyRetry(() => import("./pages/TpExterno"));
const PlayerCatalog = lazyRetry(() => import("./pages/player/PlayerCatalog"));
const VmixControl = lazyRetry(() => import("./pages/VmixControl"));
const CenarioTela = lazyRetry(() => import("./pages/CenarioTela"));
const TelaInterativa = lazyRetry(() => import("./pages/TelaInterativa"));
const CenarioTelaFull = lazyRetry(() => import("./pages/CenarioTelaFull"));
const IntercomListener = lazyRetry(() => import("./pages/IntercomListener"));
const SitePreview = lazyRetry(() => import("./pages/SitePreview"));
const DesignSystemDemo = lazyRetry(() => import("./pages/DesignSystemDemo"));

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

    // Auto-retry chunk errors up to 2 times
    if (isChunkError && this.state.retryCount < 2) {
      this.retryTimer = setTimeout(() => {
        this.setState((prev) => ({ hasError: false, retryCount: prev.retryCount + 1 }));
      }, 1500);
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
      return (
        <div
          className="h-screen w-screen flex flex-col items-center justify-center gap-4"
          style={{ backgroundColor: "#131519", color: "#fff" }}
        >
          {this.state.retryCount < 2 ? (
            <>
              <LoadingSpinner size={32} />
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
                Reconectando...
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
      <Toaster />
      <Sonner />
      <LayoutVersionGuard />
      <AuthProvider>
        <BrowserRouter>
          <ChunkErrorBoundary>
          <Suspense fallback={<RouteProgress />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Main routes */}
            <Route path="/home" element={<MasterViewHome />} />
            <Route path="/telapromo" element={<PromocoesKiosk />} />
            <Route path="/player" element={<PlayerHub />} />
            <Route path="/player/watch" element={<PlayerPage />} />
            <Route path="/player/catalog" element={<PlayerCatalog />} />
            <Route path="/player/app" element={<PlayerApp />} />
            <Route path="/jornal-export" element={<JornalExport />} />
            <Route path="/roteiro-export" element={<RoteiroExport />} />
            <Route path="/roteiro-apresentador-edit" element={<RoteiroApresentadorEdit />} />
            <Route path="/tp-externo" element={<TpExterno />} />
            <Route path="/vmix-control" element={<VmixControl />} />
            <Route path="/cenario-tela" element={<CenarioTela />} />
            <Route path="/intercom" element={<IntercomListener />} />
            <Route path="/cenario-tela-full" element={<CenarioTelaFull />} />
            <Route path="/telainterativatelao" element={<TelaInterativa />} />
            <Route path="/site-preview" element={<SitePreview />} />
            <Route path="/design-system" element={<DesignSystemDemo />} />

            {/* Slug routes for dynamic access */}
            <Route path="/:userSlug/telapromo" element={<PromocoesKiosk />} />
            <Route path="/:userSlug/player" element={<PlayerHub />} />
            <Route path="/:userSlug/player/watch" element={<PlayerPage />} />
            <Route path="/:userSlug/player/catalog" element={<PlayerCatalog />} />
            <Route path="/:userSlug/player/app" element={<PlayerApp />} />
            <Route path="/:userSlug/telainterativatelao" element={<TelaInterativa />} />

            {/* Admin routes */}
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/modules" element={<AdminModules />} />
            <Route path="/admin/plans" element={<AdminPlans />} />
            <Route path="/admin/messages" element={<AdminMessages />} />

            {/* User / NexoHub legacy redirects */}
            <Route path="/user" element={<Navigate to="/home" replace />} />
            <Route path="/user/login" element={<Index />} />
            <Route path="/user/nexohub/home" element={<Navigate to="/home" replace />} />
            <Route path="/user/nexohub/telapromo" element={<Navigate to="/telapromo" replace />} />
            <Route path="/user/:userSlug/nexohub/telapromo" element={<Navigate to="/:userSlug/telapromo" replace />} />
            <Route path="/user/nexohub/player" element={<Navigate to="/player" replace />} />
            <Route path="/user/:userSlug/nexohub/player" element={<Navigate to="/:userSlug/player" replace />} />
            <Route path="/user/nexohub/player/watch" element={<Navigate to="/player/watch" replace />} />
            <Route path="/user/:userSlug/nexohub/player/watch" element={<Navigate to="/:userSlug/player/watch" replace />} />
            <Route path="/user/nexohub/player/catalog" element={<Navigate to="/player/catalog" replace />} />
            <Route path="/user/:userSlug/nexohub/player/catalog" element={<Navigate to="/:userSlug/player/catalog" replace />} />
            <Route path="/user/nexohub/player/app" element={<Navigate to="/player/app" replace />} />
            <Route path="/user/:userSlug/nexohub/player/app" element={<Navigate to="/:userSlug/player/app" replace />} />
            <Route path="/user/:userSlug/telainterativatelao" element={<Navigate to="/:userSlug/telainterativatelao" replace />} />

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
