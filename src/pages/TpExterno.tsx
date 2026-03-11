import { lazy, Suspense } from "react";
import { AuthProvider } from "@/hooks/useAuth";

const TeleprompterPage = lazy(() => import("@/components/TeleprompterPage"));

export default function TpExterno() {
  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: "#0d0446" }}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">TP — Teleprompter</h1>
        <div className="rounded-2xl p-6" style={{ backgroundColor: "#ffffff" }}>
          <Suspense fallback={<div className="text-center py-10 text-white/50">Carregando...</div>}>
            <TeleprompterPage />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
