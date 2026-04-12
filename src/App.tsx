import { lazy, Suspense, Component, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

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
const IntercomListener = lazyRetry(() => import("./pages/IntercomListener"));

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
          style={{ backgroundColor: "#0f1058", color: "#fff" }}
        >
          {this.state.retryCount < 2 ? (
            <>
              <Loader2 className="animate-spin" size={32} style={{ color: "#268ffa" }} />
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
      <AuthProvider>
        <BrowserRouter>
          <ChunkErrorBoundary>
          <Suspense fallback={<div className="h-screen w-screen flex items-center justify-center" style={{ backgroundColor: "#0f1058" }}><Loader2 className="animate-spin" size={32} style={{ color: "#268ffa" }} /></div>}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* User / NexoHub routes */}
            <Route path="/user" element={<Navigate to="/user/nexohub/home" replace />} />
            <Route path="/user/login" element={<Index />} />
            <Route path="/user/nexohub/home" element={<MasterViewHome />} />
            <Route path="/user/nexohub/telapromo" element={<PromocoesKiosk />} />
            <Route path="/user/:userSlug/nexohub/telapromo" element={<PromocoesKiosk />} />
            <Route path="/user/nexohub/player" element={<PlayerHub />} />
            <Route path="/user/:userSlug/nexohub/player" element={<PlayerHub />} />
            <Route path="/user/nexohub/player/watch" element={<PlayerPage />} />
            <Route path="/user/:userSlug/nexohub/player/watch" element={<PlayerPage />} />
            <Route path="/user/nexohub/player/catalog" element={<PlayerCatalog />} />
            <Route path="/user/:userSlug/nexohub/player/catalog" element={<PlayerCatalog />} />
            <Route path="/user/nexohub/player/app" element={<PlayerApp />} />
            <Route path="/user/:userSlug/nexohub/player/app" element={<PlayerApp />} />
            <Route path="/user/:userSlug/telainterativatelao" element={<TelaInterativa />} />

            {/* Legacy redirects */}
            <Route path="/masterview/home" element={<Navigate to="/user/nexohub/home" replace />} />
            <Route path="/modulo-tela-estudio-promocao" element={<Navigate to="/user/nexohub/telapromo" replace />} />
            <Route path="/player" element={<Navigate to="/user/nexohub/player" replace />} />
            <Route path="/jornal-export" element={<JornalExport />} />
            <Route path="/roteiro-export" element={<RoteiroExport />} />
            <Route path="/roteiro-apresentador-edit" element={<RoteiroApresentadorEdit />} />
            <Route path="/tp-externo" element={<TpExterno />} />
            <Route path="/vmix-control" element={<VmixControl />} />
            <Route path="/cenario-tela" element={<CenarioTela />} />
            <Route path="/intercom" element={<IntercomListener />} />

            {/* Admin routes */}
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/modules" element={<AdminModules />} />
            <Route path="/admin/plans" element={<AdminPlans />} />
            <Route path="/admin/messages" element={<AdminMessages />} />

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
