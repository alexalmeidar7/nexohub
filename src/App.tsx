import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

// Lazy-loaded heavy pages
const PlayerPage = lazy(() => import("./pages/Player"));
const PlayerApp = lazy(() => import("./pages/PlayerApp"));
const PromocoesKiosk = lazy(() => import("./pages/Promocoes"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminModules = lazy(() => import("./pages/admin/AdminModules"));
const AdminPlans = lazy(() => import("./pages/admin/AdminPlans"));
const AdminMessages = lazy(() => import("./pages/admin/AdminMessages"));
const MasterViewHome = lazy(() => import("./pages/masterview/MasterViewHome"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
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
          <Suspense fallback={<div className="h-screen w-screen bg-black" />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* User / NexoHub routes */}
            <Route path="/user" element={<Navigate to="/user/nexohub/home" replace />} />
            <Route path="/user/login" element={<Index />} />
            <Route path="/user/nexohub/home" element={<MasterViewHome />} />
            <Route path="/user/nexohub/telapromo" element={<PromocoesKiosk />} />
            <Route path="/user/:userSlug/nexohub/telapromo" element={<PromocoesKiosk />} />
            <Route path="/user/nexohub/player" element={<PlayerPage />} />
            <Route path="/user/:userSlug/nexohub/player" element={<PlayerPage />} />

            {/* Legacy redirects */}
            <Route path="/masterview/home" element={<Navigate to="/user/nexohub/home" replace />} />
            <Route path="/modulo-tela-estudio-promocao" element={<Navigate to="/user/nexohub/telapromo" replace />} />
            <Route path="/player" element={<Navigate to="/user/nexohub/player" replace />} />

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
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
