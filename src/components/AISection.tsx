import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Bot, AlertCircle, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export default function AISection() {
  const { user } = useAuth();
  const [aiEnabled, setAiEnabled] = useState(true);
  const [updatingAi, setUpdatingAi] = useState(false);

  const fetchAiSetting = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("ai_enabled").eq("user_id", user.id).maybeSingle();
    if (data) setAiEnabled(data.ai_enabled ?? true);
  }, [user]);

  useEffect(() => {
    fetchAiSetting();
  }, [fetchAiSetting]);

  const toggleAi = async (checked: boolean) => {
    if (!user) return;
    setUpdatingAi(true);
    try {
      const { error } = await supabase.from("profiles").update({ ai_enabled: checked }).eq("user_id", user.id);
      if (error) throw error;
      setAiEnabled(checked);
      toast.success(checked ? "IA habilitada ✨" : "Todas as funcionalidades IA desabilitadas ⏹️");
    } catch (err) {
      toast.error("Erro ao atualizar configuração de IA");
    } finally {
      setUpdatingAi(false);
    }
  };

  return (
    <div className="space-y-4 pt-4 border-t" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 10%, transparent)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Bot size={16} style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
        <h4 className="text-sm font-bold uppercase tracking-tight" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Inteligência Artificial</h4>
      </div>

      <div
        className="rounded-2xl p-5 space-y-4 transition-all"
        style={{
          backgroundColor: aiEnabled ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 5%, var(--layout-page-bg, #fff) 95%)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, var(--layout-page-bg, #fff) 97%)",
          border: `1px solid ${aiEnabled ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)" : "color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)"}`,
          boxShadow: aiEnabled ? "0 8px 30px -10px color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent)" : "none"
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-500"
              style={{
                background: aiEnabled ? "linear-gradient(135deg, var(--layout-accent-color, #2563eb), color-mix(in srgb, var(--layout-accent-color, #2563eb) 70%, #000))" : "var(--layout-border-color, #333)",
                transform: aiEnabled ? "rotate(0deg)" : "rotate(-10deg)"
              }}
            >
              <Bot size={24} className="text-white" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Inteligência Artificial</h3>
              <p className="text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
                Controle o processamento inteligente de notícias, melhoria de texto e enquetes.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {updatingAi && <Loader2 size={16} className="animate-spin" style={{ color: "var(--layout-accent-color, #2563eb)" }} />}
            <Switch
              checked={aiEnabled}
              onCheckedChange={toggleAi}
              disabled={updatingAi}
              className="data-[state=checked]:bg-[var(--layout-accent-color)]"
            />
          </div>
        </div>

        {!aiEnabled && (
          <div
            className="flex items-start gap-3 p-3.5 rounded-xl border animate-in fade-in slide-in-from-top-2 duration-300"
            style={{ backgroundColor: "rgba(245,158,11,0.05)", borderColor: "rgba(245,158,11,0.2)", color: "#b45309" }}
          >
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider">IA Desativada Temporariamente</p>
              <p className="text-[11px] leading-relaxed opacity-90">
                Resumos automáticos, melhoria de texto e geração inteligente de enquetes foram suspensos. O sistema funcionará apenas com dados manuais ou pré-configurados.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
