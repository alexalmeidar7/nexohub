// Padrão global de notificações. Faz o "toast" do sonner e do use-toast
// também emitir um CustomEvent("nexo-notify") consumido pelo InlineNotification.
import { toast as sonnerToast } from "sonner";
import { initActivityMonitor } from "@/lib/activityStatus";

let patched = false;

function emit(text: string, variant: "info" | "success" | "error" | "warning" = "info") {
  if (!text || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("nexo-notify", { detail: { text, variant } }));
}

function toText(msg: unknown, opts?: any): string {
  const t = typeof msg === "string" ? msg : (msg as any)?.title || "";
  const d = opts?.description ? ` — ${opts.description}` : "";
  return `${t}${d}`.trim();
}

export function initGlobalNotifications() {
  if (patched) return;
  patched = true;
  initActivityMonitor();

  const fn: any = sonnerToast;

  const wrap = (key: "success" | "error" | "info" | "warning" | "message", variant: any) => {
    const orig = fn[key];
    if (typeof orig !== "function") return;
    fn[key] = (msg: any, opts?: any) => {
      emit(toText(msg, opts), variant);
      return orig(msg, opts);
    };
  };
  wrap("success", "success");
  wrap("error", "error");
  wrap("info", "info");
  wrap("warning", "warning");
  wrap("message", "info");

  // Também intercepta chamadas diretas: toast("mensagem")
  const origCall = fn.custom || null;
  if (typeof fn === "function") {
    const originalDirect = fn.bind(null);
    // sonner exporta como função; para chamadas diretas não conseguimos
    // sobrescrever a assinatura, mas os wrappers acima cobrem a maioria dos usos.
    void originalDirect;
    void origCall;
  }
}
