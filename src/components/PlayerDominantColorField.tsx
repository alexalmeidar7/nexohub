import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { mergeUserDashboardItems } from "@/lib/userSettings";
import { defaultPlayerColors } from "@/components/PlayerLayoutCustomizer";
import { toast } from "sonner";

export default function PlayerDominantColorField({ userId }: { userId: string | null }) {
  const [color, setColor] = useState(defaultPlayerColors.dominantColor);
  const [draft, setDraft] = useState(defaultPlayerColors.dominantColor);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (!userId) return;
    void supabase.from("user_settings").select("dashboard_items").eq("user_id", userId).maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const playerColors = (data?.dashboard_items as any)?.player_colors || {};
        const savedColor = typeof playerColors.dominantColor === "string"
          ? playerColors.dominantColor
          : typeof playerColors.homeAccent === "string" ? playerColors.homeAccent : defaultPlayerColors.dominantColor;
        if (/^#[0-9a-f]{6}$/i.test(savedColor)) {
          setColor(savedColor);
          setDraft(savedColor);
        }
      });
    return () => { active = false; };
  }, [userId]);

  const normalizedDraft = draft.trim().startsWith("#") ? draft.trim() : `#${draft.trim()}`;
  const validDraft = /^#[0-9a-f]{6}$/i.test(normalizedDraft);

  const saveColor = async () => {
    if (!userId) {
      toast.error("Entre na conta da emissora para salvar a cor do Player.");
      return;
    }
    if (!validDraft) {
      toast.error("Digite uma cor hexadecimal válida, como #E30613.");
      return;
    }
    setSaving(true);
    try {
      const nextColor = normalizedDraft.toUpperCase();
      await mergeUserDashboardItems(userId, { player_colors: { dominantColor: nextColor } });
      setColor(nextColor);
      setDraft(nextColor);
      window.dispatchEvent(new Event("player-colors-updated"));
      toast.success("Cor predominante do Player salva.");
    } catch (error) {
      console.error("Falha ao salvar a cor predominante do Player:", error);
      toast.error("Não foi possível salvar a cor predominante.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
      <label htmlFor="player-dominant-color" className="whitespace-nowrap text-[9px] font-bold uppercase tracking-wider text-slate-500">
        Cor predominante
      </label>
      <input
        aria-label="Selecionar cor predominante do Player"
        type="color"
        value={validDraft ? normalizedDraft : color}
        onChange={(event) => setDraft(event.target.value.toUpperCase())}
        className="h-8 w-9 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
      />
      <input
        id="player-dominant-color"
        aria-label="Código hexadecimal da cor predominante"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") void saveColor(); }}
        placeholder="#E30613"
        maxLength={7}
        className="h-8 w-[92px] rounded-lg border border-slate-200 bg-white px-2 font-mono text-xs uppercase text-slate-700 outline-none focus:border-blue-500"
      />
      <button
        type="button"
        onClick={() => void saveColor()}
        disabled={saving || !validDraft || !userId}
        aria-label="Salvar cor predominante"
        title="Salvar cor predominante"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0055ff] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
      </button>
    </div>
  );
}
