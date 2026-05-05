import { useEffect, useState } from "react";
import { Sparkles, Loader2, Trash2, RefreshCw, Ban, Save, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface InfoMusicRow {
  id: string;
  artista: string;
  musica: string;
  curiosidade: string;
  deezer_artist_img?: string;
  created_at: string;
  expires_at: string;
}

export default function InfoMusicSection() {
  const { user } = useAuth();
  const [rows, setRows] = useState<InfoMusicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [testArtista, setTestArtista] = useState("");
  const [testMusica, setTestMusica] = useState("");
  const [testing, setTesting] = useState(false);
  const [excecoes, setExcecoes] = useState("");
  const [excecoesInitial, setExcecoesInitial] = useState("");
  const [savingExcecoes, setSavingExcecoes] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [togglingAi, setTogglingAi] = useState(false);
  const [lastManualId, setLastManualId] = useState<string | null>(null);
  const [monthlyQuota, setMonthlyQuota] = useState({ count: 0, limit: 20 });

  const loadExcecoes = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_settings")
      .select("infomusic_excecoes, infomusic_ai_enabled, infomusic_ai_monthly_count, last_manual_curiosity_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const v = (data?.infomusic_excecoes || "") as string;
    setExcecoes(v);
    setExcecoesInitial(v);
    setAiEnabled((data as { infomusic_ai_enabled?: boolean })?.infomusic_ai_enabled !== false);
    setMonthlyQuota(prev => ({ ...prev, count: data?.infomusic_ai_monthly_count || 0 }));
    setLastManualId(data?.last_manual_curiosity_id || null);
  };

  const toggleAi = async () => {
    if (!user) return;
    setTogglingAi(true);
    const next = !aiEnabled;
    try {
      const { error } = await supabase
        .from("user_settings")
        .upsert({ user_id: user.id, infomusic_ai_enabled: next }, { onConflict: "user_id" });
      if (error) throw error;
      setAiEnabled(next);
      toast.success(next ? "Geração por IA habilitada" : "Geração por IA desabilitada");
    } catch (e) {
      toast.error("Erro ao atualizar");
    }
    setTogglingAi(false);
  };

  const saveExcecoes = async () => {
    if (!user) return;
    setSavingExcecoes(true);
    try {
      const { error } = await supabase
        .from("user_settings")
        .upsert({ user_id: user.id, infomusic_excecoes: excecoes }, { onConflict: "user_id" });
      if (error) throw error;
      setExcecoesInitial(excecoes);
      toast.success("Exceções salvas");
    } catch (e) {
      toast.error("Erro ao salvar exceções");
    }
    setSavingExcecoes(false);
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("infomusic")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { loadExcecoes(); }, [user]);

  const handleTest = async () => {
    if (!testArtista.trim() || !testMusica.trim()) {
      toast.error("Informe artista e música");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-music-curiosity", {
        body: { artista: testArtista.trim(), musica: testMusica.trim() },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error?: string }).error);
      if (!(data as { cached?: boolean }).cached) {
        setMonthlyQuota(prev => ({ ...prev, count: prev.count + 1 }));
      }
      toast.success((data as { cached?: boolean }).cached ? "Curiosidade do cache" : "Curiosidade gerada pela IA");
      setTestArtista("");
      setTestMusica("");
      await load();
    } catch (e) {
      toast.error((e as Error).message || "Erro ao gerar");
    }
    setTesting(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("infomusic").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    setRows(prev => prev.filter(r => r.id !== id));
    toast.success("Removido");
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl p-4" style={{
        backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 92%, var(--layout-accent-color, #2563eb))",
        border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 12%, transparent)",
      }}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
          <h4 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            Como funciona
          </h4>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 70%, transparent)" }}>
          Toda vez que uma nova música começar a tocar, o sistema consulta a tabela <strong>InfoMusic</strong>. 
          Se não houver curiosidade salva, a IA (Gemini Pro) gera um texto de até 5 linhas com uma curiosidade real sobre a música ou o artista. 
          A curiosidade é exibida no XML <code className="px-1 rounded" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>&lt;curiosidade&gt;</code> entre os <strong>10s e 25s</strong> da música. 
          Cada curiosidade fica salva por <strong>6 meses</strong> e depois é excluída automaticamente. A cota é de <strong>20 gerações mensais</strong> por usuário.
        </p>
      </div>

      <div className="rounded-xl p-4 flex items-center justify-between gap-4" style={{
        backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 96%, var(--layout-border-color, #333))",
        border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 12%, transparent)",
      }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
            <h4 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              Geração de novas curiosidades por IA
            </h4>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 65%, transparent)" }}>
            {aiEnabled
              ? `Habilitado: novas músicas geram curiosidade pela IA (limite de 20/mês).`
              : "Desabilitado: o sistema apenas consulta o banco de curiosidades já cadastradas (6 meses). Nada novo será gerado pela IA."}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-black/5 overflow-hidden">
              <div 
                className="h-full transition-all duration-500" 
                style={{ 
                  width: `${Math.min(100, (monthlyQuota.count / monthlyQuota.limit) * 100)}%`,
                  backgroundColor: monthlyQuota.count >= monthlyQuota.limit ? "#ef4444" : "var(--layout-accent-color, #2563eb)"
                }}
              />
            </div>
            <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: monthlyQuota.count >= monthlyQuota.limit ? "#ef4444" : "var(--layout-page-text, #1a1a1a)" }}>
              {monthlyQuota.count} / {monthlyQuota.limit} gerações/mês
            </span>
          </div>
        </div>
        <button
          onClick={toggleAi}
          disabled={togglingAi}
          role="switch"
          aria-checked={aiEnabled}
          className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
          style={{
            backgroundColor: aiEnabled
              ? "var(--layout-accent-color, #2563eb)"
              : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 25%, transparent)",
          }}
        >
          <span
            className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow"
            style={{ transform: aiEnabled ? "translateX(24px)" : "translateX(4px)" }}
          />
        </button>
      </div>

      <div className="rounded-xl p-4 space-y-3" style={{
        backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 96%, var(--layout-border-color, #333))",
        border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 12%, transparent)",
      }}>
        <div className="flex items-center gap-2">
          <Ban size={14} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
          <h4 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            Exceções (não gerar curiosidade)
          </h4>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 65%, transparent)" }}>
          Liste palavras separadas por vírgula. Quando o <strong>artista</strong> ou a <strong>música</strong> contiver alguma dessas palavras, nenhuma curiosidade será gerada e a tag <code>&lt;curiosidade&gt;</code> ficará vazia no XML. Ex.: <em>TRILHAS PROMO, JINGLE, VINHETA</em>.
        </p>
        <div className="flex flex-col md:flex-row gap-2">
          <input
            type="text"
            placeholder="trilhas promo, jingle, vinheta..."
            value={excecoes}
            onChange={e => setExcecoes(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
            style={{
              backgroundColor: "var(--layout-page-bg, #fff)",
              color: "var(--layout-page-text, #1a1a1a)",
              border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)",
            }}
          />
          <button
            onClick={saveExcecoes}
            disabled={savingExcecoes || excecoes === excecoesInitial}
            className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-opacity hover:opacity-90 disabled:opacity-40 inline-flex items-center justify-center gap-2"
            style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "#fff" }}
          >
            {savingExcecoes ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Salvar
          </button>
        </div>
      </div>

      <div className="rounded-xl p-4 space-y-3" style={{
        backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 96%, var(--layout-border-color, #333))",
        border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 12%, transparent)",
      }}>
        <div className="flex items-center gap-2">
          <RefreshCw size={14} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
          <h4 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            Testar / Pré-gerar curiosidade
          </h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            type="text"
            placeholder="Nome do artista"
            value={testArtista}
            onChange={e => setTestArtista(e.target.value)}
            className="px-3 py-2 rounded-lg text-xs outline-none"
            style={{
              backgroundColor: "var(--layout-page-bg, #fff)",
              color: "var(--layout-page-text, #1a1a1a)",
              border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)",
            }}
          />
          <input
            type="text"
            placeholder="Nome da música"
            value={testMusica}
            onChange={e => setTestMusica(e.target.value)}
            className="px-3 py-2 rounded-lg text-xs outline-none"
            style={{
              backgroundColor: "var(--layout-page-bg, #fff)",
              color: "var(--layout-page-text, #1a1a1a)",
              border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)",
            }}
          />
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-opacity hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "#fff" }}
          >
            {testing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            Gerar
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            Curiosidades salvas ({rows.length})
          </h4>
          <button onClick={load} className="text-xs opacity-60 hover:opacity-100 inline-flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            <RefreshCw size={11} /> Atualizar
          </button>
        </div>
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 12%, transparent)" }}>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>
              <Loader2 size={14} className="animate-spin" /> Carregando...
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
              Nenhuma curiosidade salva ainda. As curiosidades aparecerão aqui automaticamente conforme as músicas tocarem.
            </div>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0" style={{ backgroundColor: "color-mix(in srgb, var(--layout-header-bg, #0d0446) 6%, var(--layout-page-bg, #fff))" }}>
                  <tr>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>Artista</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>Música</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>Curiosidade</th>
                    <th className="text-left px-3 py-2 font-bold uppercase text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>Data/Hora</th>
                    <th className="text-center px-3 py-2 font-bold uppercase text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>Enviar</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const isLastManual = r.id === lastManualId;
                    return (
                      <tr key={r.id} style={{ 
                        borderTop: i > 0 ? "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)" : undefined,
                        backgroundColor: isLastManual ? "rgba(var(--layout-accent-color-rgb, 37, 99, 235), 0.1)" : undefined
                      }}>
                        <td className="px-3 py-2 font-semibold align-top" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                          <div className="flex flex-col gap-1">
                            {r.deezer_artist_img && (
                              <img src={r.deezer_artist_img} alt={r.artista} className="w-8 h-8 rounded-full object-cover border border-white/10" />
                            )}
                            {r.artista}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{r.musica}</td>
                        <td className="px-3 py-2 align-top" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 75%, transparent)", maxWidth: 480 }}>
                          <div className="line-clamp-3 leading-relaxed">{r.curiosidade}</div>
                        </td>
                        <td className="px-3 py-2 align-top font-mono text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>
                          {new Date(r.created_at).toLocaleString("pt-BR")}
                        </td>
                      <td className="px-3 py-2 align-top text-center">
                        <button 
                          onClick={async () => {
                            try {
                              const until = new Date(Date.now() + 30_000).toISOString();
                              const currentDashboard = (await supabase.from("user_settings").select("dashboard_items").eq("user_id", user?.id).maybeSingle()).data?.dashboard_items as any || {};
                              
                              await supabase.from("user_settings").update({
                                last_manual_curiosity_id: r.id,
                                dashboard_items: {
                                  ...currentDashboard,
                                  music_curiosity_manual: r.curiosidade,
                                  music_curiosity_manual_until: until,
                                  music_curiosity_manual_img: r.deezer_artist_img || ""
                                }
                              }).eq("user_id", user?.id);
                              
                              setLastManualId(r.id);
                              
                              window.dispatchEvent(new CustomEvent("manual-music-curiosity", { detail: { text: r.curiosidade } }));
                              toast.success("Enviado para o vMix!");
                            } catch (e) {
                              toast.error("Erro ao enviar");
                            }
                          }}
                          className="p-1 rounded-lg hover:bg-black/5 transition-colors"
                          style={{ color: "var(--layout-accent-color, #2563eb)" }}
                          title="Enviar manualmente para o XML"
                        >
                          <Send size={14} />
                         </button>
                       </td>
                       <td className="px-3 py-2 align-top text-right">
                         <button onClick={() => handleDelete(r.id)} className="opacity-50 hover:opacity-100 transition-opacity" style={{ color: "#dc2626" }}>
                           <Trash2 size={13} />
                         </button>
                       </td>
                     </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
