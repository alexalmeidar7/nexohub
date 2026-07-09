import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Loader2, Trash2, RefreshCw, Ban, Save, Send, Music, Search, X } from "lucide-react";
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
  const [nowPlaying, setNowPlaying] = useState<{ musica: string; artista: string; capa: string; curiosity?: string } | null>(null);
  const [lastTrackKey, setLastTrackKey] = useState<string>("");
  const [manualCuriosityText, setManualCuriosityText] = useState("");
  const [savingManualCuriosity, setSavingManualCuriosity] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const curiosityFetchKeyRef = useRef<string>("");
  const [xmlTelemetry, setXmlTelemetry] = useState<{ source: "manual" | "ai" | "none"; text: string; until?: string }>({ source: "none", text: "" });

  const loadExcecoes = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_settings")
      .select("infomusic_excecoes, infomusic_ai_enabled, infomusic_ai_monthly_count, last_manual_curiosity_id, dashboard_items")
      .eq("user_id", user.id)
      .maybeSingle();
    const v = (data?.infomusic_excecoes || "") as string;
    setExcecoes(v);
    setExcecoesInitial(v);
    setAiEnabled((data as { infomusic_ai_enabled?: boolean })?.infomusic_ai_enabled !== false);
    setMonthlyQuota(prev => ({ ...prev, count: data?.infomusic_ai_monthly_count || 0 }));
    setLastManualId(data?.last_manual_curiosity_id || null);
    
    // Parse now playing data from dashboard_items
    const di = data?.dashboard_items as any;
    const currentTrackKey = `${di?.music_current_title || ""}-${di?.music_current_artist || ""}`;

    // Always refresh nowPlaying (curiosity may arrive after the track key)
    if (di?.music_current_title || di?.music_current_artist) {
      setNowPlaying(prev => {
        const next = {
          musica: di.music_current_title || "Sem título",
          artista: di.music_current_artist || "Desconhecido",
          capa: di.music_current_cover || "",
          curiosity: di.music_current_curiosity || "",
        };
        if (
          prev &&
          prev.musica === next.musica &&
          prev.artista === next.artista &&
          prev.capa === next.capa &&
          prev.curiosity === next.curiosity
        ) return prev;
        return next;
      });
      if (currentTrackKey !== lastTrackKey) setLastTrackKey(currentTrackKey);
    }

    // Derive XML telemetry (what's actually going out on <curiosidade>)
    const manualText = di?.music_curiosity_manual as string | undefined;
    const manualUntil = di?.music_curiosity_manual_until as string | undefined;
    const manualActive = !!(manualText && manualUntil && new Date(manualUntil).getTime() > Date.now());
    const effective = manualActive
      ? { source: "manual" as const, text: manualText!, until: manualUntil }
      : di?.music_current_curiosity
        ? { source: "ai" as const, text: di.music_current_curiosity as string, until: undefined }
        : { source: "none" as const, text: "", until: undefined };
    setXmlTelemetry(effective);
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

  const PAGE_SIZE = 50;
  const HARD_CAP = 1000;
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [filterField, setFilterField] = useState<"all" | "artista" | "musica" | "curiosidade" | "sem_curiosidade">("all");
  const [missingRows, setMissingRows] = useState<{ artista: string; musica: string; ultima: string }[]>([]);
  const [loadingMissing, setLoadingMissing] = useState(false);
  const [missingInputs, setMissingInputs] = useState<Record<string, string>>({});
  const [savingMissingKey, setSavingMissingKey] = useState<string | null>(null);

  const loadMissing = async () => {
    setLoadingMissing(true);
    try {
      const { data: played } = await supabase
        .from("musicas_tocadas")
        .select("artista, musica, created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      const { data: infos } = await supabase
        .from("infomusic")
        .select("artista, musica")
        .limit(2000);
      const known = new Set((infos || []).map(i => `${(i.artista || "").trim().toLowerCase()}::${(i.musica || "").trim().toLowerCase()}`));
      const seen = new Set<string>();
      const missing: { artista: string; musica: string; ultima: string }[] = [];
      for (const p of played || []) {
        const key = `${(p.artista || "").trim().toLowerCase()}::${(p.musica || "").trim().toLowerCase()}`;
        if (!key || known.has(key) || seen.has(key)) continue;
        seen.add(key);
        missing.push({ artista: p.artista || "", musica: p.musica || "", ultima: p.created_at });
      }
      setMissingRows(missing);
    } catch (e) {
      toast.error("Erro ao carregar músicas sem curiosidade");
    }
    setLoadingMissing(false);
  };

  const filteredMissing = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return missingRows;
    return missingRows.filter(m =>
      m.artista.toLowerCase().includes(q) || m.musica.toLowerCase().includes(q)
    );
  }, [missingRows, search]);

  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const Highlight = ({ text, term }: { text: string; term: string }) => {
    if (!term || !text) return <>{text}</>;
    const parts = text.split(new RegExp(`(${escapeRegex(term)})`, "gi"));
    return (
      <>
        {parts.map((part, idx) =>
          part.toLowerCase() === term.toLowerCase() ? (
            <mark
              key={idx}
              className="rounded px-0.5"
              style={{
                backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 30%, transparent)",
                color: "inherit",
              }}
            >
              {part}
            </mark>
          ) : (
            <span key={idx}>{part}</span>
          )
        )}
      </>
    );
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => {
      const artista = (r.artista || "").toLowerCase();
      const musica = (r.musica || "").toLowerCase();
      const curiosidade = (r.curiosidade || "").toLowerCase();
      if (filterField === "artista") return artista.includes(q);
      if (filterField === "musica") return musica.includes(q);
      if (filterField === "curiosidade") return curiosidade.includes(q);
      return artista.includes(q) || musica.includes(q) || curiosidade.includes(q);
    });
  }, [rows, search, filterField]);

  const load = async () => {
    setLoading(true);
    const { data, count } = await supabase
      .from("infomusic")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1);
    setRows(data || []);
    setTotalCount(count || 0);
    setLoading(false);
  };

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const from = rows.length;
    const to = Math.min(from + PAGE_SIZE, HARD_CAP) - 1;
    const { data } = await supabase
      .from("infomusic")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (data && data.length) setRows(prev => [...prev, ...data]);
    setLoadingMore(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (filterField === "sem_curiosidade" && missingRows.length === 0 && !loadingMissing) {
      loadMissing();
    }
  }, [filterField]);
  useEffect(() => { 
    loadExcecoes();
    // Auto refresh every 5 seconds to keep "Now Playing" updated
    const interval = setInterval(loadExcecoes, 5000);
    return () => clearInterval(interval);
  }, [user]);

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


      {nowPlaying && (
        <div className="rounded-xl p-4 overflow-hidden relative group" style={{
          backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 94%, var(--layout-accent-color, #2563eb))",
          border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)",
        }}>
          <div className="flex items-center gap-4 relative z-10">
            <div className="relative shrink-0">
              {nowPlaying.capa ? (
                <img 
                  src={nowPlaying.capa} 
                  alt={nowPlaying.artista} 
                  className="w-16 h-16 rounded-lg object-cover shadow-lg border border-white/20"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-black/10 flex items-center justify-center border border-dashed border-black/20">
                  <Music size={24} className="opacity-20" />
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 bg-green-500 w-3 h-3 rounded-full border-2 border-white animate-pulse" title="No ar agora" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 border border-green-500/20">
                  No Ar Agora
                </span>
              </div>
              <h3 className="text-sm font-bold truncate leading-tight" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                {nowPlaying.musica}
              </h3>
              <p className="text-xs font-medium truncate opacity-70" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                {nowPlaying.artista}
              </p>
            </div>
            
            <button 
              onClick={loadExcecoes}
              className="p-2 rounded-full hover:bg-black/5 transition-colors shrink-0"
              title="Atualizar música"
            >
              <RefreshCw size={14} className="opacity-40" />
            </button>
          </div>
          
          {/* Background Decorative Element */}
          <div className="absolute top-0 right-0 -mt-4 -mr-4 opacity-[0.03] pointer-events-none">
            <Music size={120} />
          </div>
        </div>
      )}

      <div className="rounded-xl p-3 flex items-start gap-3" style={{
        backgroundColor: xmlTelemetry.source === "none"
          ? "color-mix(in srgb, var(--layout-page-bg, #fff) 96%, #6b7280)"
          : "color-mix(in srgb, var(--layout-page-bg, #fff) 92%, #10b981)",
        border: `1px solid ${xmlTelemetry.source === "none"
          ? "color-mix(in srgb, #6b7280 25%, transparent)"
          : "color-mix(in srgb, #10b981 30%, transparent)"}`,
      }}>
        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
          <span
            className={`w-2 h-2 rounded-full ${xmlTelemetry.source !== "none" ? "animate-pulse" : ""}`}
            style={{ backgroundColor: xmlTelemetry.source === "none" ? "#6b7280" : "#10b981" }}
          />
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            XML
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide opacity-70" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              Enviando agora em &lt;curiosidade&gt;
            </span>
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: xmlTelemetry.source === "manual"
                  ? "rgba(37,99,235,0.15)"
                  : xmlTelemetry.source === "ai"
                    ? "rgba(16,185,129,0.15)"
                    : "rgba(107,114,128,0.15)",
                color: xmlTelemetry.source === "manual" ? "#2563eb" : xmlTelemetry.source === "ai" ? "#10b981" : "#6b7280",
              }}
            >
              {xmlTelemetry.source === "manual" ? "Manual" : xmlTelemetry.source === "ai" ? "Auto/IA" : "Vazio"}
            </span>
            {xmlTelemetry.source === "manual" && xmlTelemetry.until && (
              <span className="text-[10px] opacity-60 font-mono" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                expira {new Date(xmlTelemetry.until).toLocaleTimeString("pt-BR")}
              </span>
            )}
          </div>
          <p className="text-xs italic leading-snug break-words" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 85%, transparent)" }}>
            {xmlTelemetry.text ? `"${xmlTelemetry.text}"` : "— nenhum texto sendo enviado no momento —"}
          </p>
        </div>
      </div>

      {nowPlaying && (
        <div className="rounded-xl p-4" style={{
          backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 96%, var(--layout-accent-color, #2563eb))",
          border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 25%, transparent)",
        }}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
            <h4 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              Curiosidade da música no ar
            </h4>
          </div>
          {nowPlaying.curiosity ? (
            <p className="text-xs italic leading-relaxed" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 85%, transparent)" }}>
              "{nowPlaying.curiosity}"
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs opacity-60" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                Nenhuma curiosidade encontrada para <strong>{nowPlaying.musica}</strong> — {nowPlaying.artista}.
                {monthlyQuota.count >= monthlyQuota.limit && (
                  <span className="block mt-1 text-[11px]" style={{ color: "#ef4444" }}>
                    Cota mensal de IA esgotada. Cadastre manualmente abaixo:
                  </span>
                )}
              </p>
              <textarea
                value={manualCuriosityText}
                onChange={e => setManualCuriosityText(e.target.value)}
                placeholder="Digite uma curiosidade sobre esta música ou artista..."
                rows={2}
                maxLength={280}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
                style={{
                  backgroundColor: "var(--layout-page-bg, #fff)",
                  color: "var(--layout-page-text, #1a1a1a)",
                  border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)",
                }}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] opacity-50" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  {manualCuriosityText.length}/280 · salva no banco por 6 meses e vai ao XML por 30s
                </span>
                <button
                  onClick={async () => {
                    if (!manualCuriosityText.trim() || !user) return;
                    setSavingManualCuriosity(true);
                    try {
                      const expiresAt = new Date();
                      expiresAt.setMonth(expiresAt.getMonth() + 6);
                      const { data: inserted, error } = await supabase
                        .from("infomusic")
                        .insert({
                          user_id: user.id,
                          artista: nowPlaying.artista,
                          musica: nowPlaying.musica,
                          curiosidade: manualCuriosityText.trim(),
                          deezer_artist_img: null,
                          expires_at: expiresAt.toISOString(),
                        })
                        .select()
                        .maybeSingle();
                      if (error) throw error;

                      const until = new Date(Date.now() + 30_000).toISOString();
                      const currentDashboard = (await supabase.from("user_settings").select("dashboard_items").eq("user_id", user.id).maybeSingle()).data?.dashboard_items as any || {};
                      await supabase.from("user_settings").update({
                        last_manual_curiosity_id: inserted?.id,
                        dashboard_items: {
                          ...currentDashboard,
                          music_current_curiosity: manualCuriosityText.trim(),
                          music_curiosity_manual: manualCuriosityText.trim(),
                          music_curiosity_manual_until: until,
                          music_curiosity_manual_img: "",
                        },
                      }).eq("user_id", user.id);

                      window.dispatchEvent(new CustomEvent("manual-music-curiosity", { detail: { text: manualCuriosityText.trim() } }));
                      toast.success("Curiosidade cadastrada e enviada ao XML!");
                      setManualCuriosityText("");
                      await load();
                      await loadExcecoes();
                    } catch (e) {
                      toast.error((e as Error).message || "Erro ao salvar");
                    }
                    setSavingManualCuriosity(false);
                  }}
                  disabled={savingManualCuriosity || !manualCuriosityText.trim()}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-opacity hover:opacity-90 disabled:opacity-40 inline-flex items-center justify-center gap-1.5 shrink-0"
                  style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "#fff" }}
                >
                  {savingManualCuriosity ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                  Salvar e enviar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            Curiosidades salvas ({search ? `${filteredRows.length} de ${rows.length}` : `${rows.length}${totalCount > rows.length ? ` de ${totalCount}` : ""}`})
          </h4>
          <button onClick={load} className="text-xs opacity-60 hover:opacity-100 inline-flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            <RefreshCw size={11} /> Atualizar
          </button>
        </div>
        <div className="flex flex-col md:flex-row gap-2 mb-2">
          <div className="flex-1 relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por artista, música ou texto da curiosidade..."
              className="w-full pl-8 pr-8 py-2 rounded-lg text-xs outline-none"
              style={{
                backgroundColor: "var(--layout-page-bg, #fff)",
                color: "var(--layout-page-text, #1a1a1a)",
                border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-black/5"
                title="Limpar busca"
              >
                <X size={12} className="opacity-60" />
              </button>
            )}
          </div>
          <select
            value={filterField}
            onChange={e => setFilterField(e.target.value as typeof filterField)}
            className="px-3 py-2 rounded-lg text-xs outline-none cursor-pointer"
            style={{
              backgroundColor: "var(--layout-page-bg, #fff)",
              color: "var(--layout-page-text, #1a1a1a)",
              border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)",
            }}
          >
            <option value="all">Todos os campos</option>
            <option value="artista">Somente artista</option>
            <option value="musica">Somente música</option>
            <option value="curiosidade">Somente curiosidade</option>
            <option value="sem_curiosidade">Músicas sem curiosidades</option>
          </select>
        </div>
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 12%, transparent)" }}>
          {filterField === "sem_curiosidade" ? (
            loadingMissing ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>
                <Loader2 size={14} className="animate-spin" /> Carregando músicas sem curiosidade...
              </div>
            ) : filteredMissing.length === 0 ? (
              <div className="text-center py-10 text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                {missingRows.length === 0
                  ? "Todas as músicas tocadas já possuem curiosidade cadastrada."
                  : `Nenhum resultado para "${search}".`}
                <div className="mt-3">
                  <button onClick={loadMissing} className="inline-flex items-center gap-1 opacity-70 hover:opacity-100">
                    <RefreshCw size={11} /> Recarregar
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-auto">
                <div className="flex items-center justify-between px-3 py-2 text-[10px] uppercase font-bold" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)", backgroundColor: "color-mix(in srgb, var(--layout-header-bg, #0d0446) 6%, var(--layout-page-bg, #fff))" }}>
                  <span>{filteredMissing.length} música(s) sem curiosidade</span>
                  <button onClick={loadMissing} className="inline-flex items-center gap-1 opacity-70 hover:opacity-100 normal-case">
                    <RefreshCw size={10} /> Atualizar
                  </button>
                </div>
                {filteredMissing.map((m, i) => {
                  const key = `${m.artista}::${m.musica}`.toLowerCase();
                  const val = missingInputs[key] || "";
                  const isSaving = savingMissingKey === key;
                  return (
                    <div key={key} className="p-3 flex flex-col md:flex-row gap-2 items-start md:items-center" style={{ borderTop: i > 0 ? "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)" : undefined }}>
                      <div className="min-w-0 md:w-56 shrink-0">
                        <div className="text-xs font-semibold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}><Highlight text={m.artista} term={search} /></div>
                        <div className="text-[11px] truncate opacity-70" style={{ color: "var(--layout-page-text, #1a1a1a)" }}><Highlight text={m.musica} term={search} /></div>
                        <div className="text-[10px] opacity-50 mt-0.5 font-mono">{new Date(m.ultima).toLocaleDateString("pt-BR")}</div>
                      </div>
                      <input
                        type="text"
                        value={val}
                        onChange={e => setMissingInputs(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder="Digite uma curiosidade sobre esta música..."
                        maxLength={280}
                        className="flex-1 min-w-0 w-full px-3 py-2 rounded-lg text-xs outline-none"
                        style={{
                          backgroundColor: "var(--layout-page-bg, #fff)",
                          color: "var(--layout-page-text, #1a1a1a)",
                          border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)",
                        }}
                      />
                      <button
                        onClick={async () => {
                          if (!val.trim() || !user) return;
                          setSavingMissingKey(key);
                          try {
                            const expiresAt = new Date();
                            expiresAt.setMonth(expiresAt.getMonth() + 6);
                            const { error } = await supabase.from("infomusic").insert({
                              user_id: user.id,
                              artista: m.artista,
                              musica: m.musica,
                              curiosidade: val.trim(),
                              deezer_artist_img: null,
                              expires_at: expiresAt.toISOString(),
                            });
                            if (error) throw error;
                            toast.success("Curiosidade cadastrada!");
                            setMissingRows(prev => prev.filter(x => `${x.artista}::${x.musica}`.toLowerCase() !== key));
                            setMissingInputs(prev => { const n = { ...prev }; delete n[key]; return n; });
                            await load();
                          } catch (e) {
                            toast.error((e as Error).message || "Erro ao salvar");
                          }
                          setSavingMissingKey(null);
                        }}
                        disabled={isSaving || !val.trim()}
                        className="px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-opacity hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1.5 shrink-0"
                        style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "#fff" }}
                      >
                        {isSaving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                        Salvar
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>
              <Loader2 size={14} className="animate-spin" /> Carregando...
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
              Nenhuma curiosidade salva ainda. As curiosidades aparecerão aqui automaticamente conforme as músicas tocarem.
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-10 text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
              Nenhuma curiosidade encontrada para "<strong>{search}</strong>".
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
                  {filteredRows.map((r, i) => {
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
                            {(filterField === "all" || filterField === "artista") ? <Highlight text={r.artista} term={search} /> : r.artista}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                          {(filterField === "all" || filterField === "musica") ? <Highlight text={r.musica} term={search} /> : r.musica}
                        </td>
                        <td className="px-3 py-2 align-top" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 75%, transparent)", maxWidth: 480 }}>
                          <div className="line-clamp-3 leading-relaxed">
                            {(filterField === "all" || filterField === "curiosidade") ? <Highlight text={r.curiosidade} term={search} /> : r.curiosidade}
                          </div>
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
              {rows.length < Math.min(totalCount, HARD_CAP) && (
                <div className="p-3 flex items-center justify-center" style={{ borderTop: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)" }}>
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-opacity hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2"
                    style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "#fff" }}
                  >
                    {loadingMore ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Carregar mais ({Math.min(PAGE_SIZE, Math.min(totalCount, HARD_CAP) - rows.length)})
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
