import { Loader2 } from "lucide-react";

export default function RouteProgress() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4"
      style={{ backgroundColor: "#131519" }}
    >
      <Loader2 className="animate-spin" size={48} style={{ color: "#d9ff65" }} />
      <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
        Carregando...
      </p>
    </div>
  );
}
