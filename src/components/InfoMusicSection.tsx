import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Trash2, RefreshCw, Ban, Save, Send, Music, Search, X, AlertTriangle, CheckCircle2, HelpCircle, Plus } from "lucide-react";
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
  const [xmlCheck, setXmlCheck] = useState<{ status: "idle" | "checking" | "ok" | "diverge" | "error"; xmlText: string; checkedAt: number; error?: string }>({ status: "idle", xmlText: "", checkedAt: 0 });
  const [showHowTo, setShowHowTo] = useState(false);
  const [showAiToggle, setShowAiToggle] = useState(false);

  const [newExcecao, setNewExcecao] = useState("");

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

  const saveExcecoesValue = async (val: string) => {
    if (!user) return;
    setSavingExcecoes(true);
    try {
      const { error } = await supabase
        .from("user_settings")
        .upsert({ user_id: user.id, infomusic_excecoes: val }, { onConflict: "user_id" });
      if (error) throw error;
      setExcecoes(val);
      setExcecoesInitial(val);
    } catch (e) {
      toast.error("Erro ao salvar exceções");
    }
    setSavingExcecoes(false);
  };

  const saveExcecoes = async () => {
    await saveExcecoesValue(excecoes);
    toast.success("Exceções salvas");
  };

  const excecaoList = useMemo(
    () => excecoes.split(",").map((s) => s.trim()).filter(Boolean),
    [excecoes]
  );

  const addExcecao = async () => {
    const v = newExcecao.trim();
    if (!v) return;
    if (excecaoList.some((x) => x.toLowerCase() === v.toLowerCase())) {
      toast.error("Palavra já cadastrada");
      return;
    }
    const next = [...excecaoList, v].join(", ");
    setNewExcecao("");
    await saveExcecoesValue(next);
    toast.success("Exceção adicionada");
  };

  const removeExcecao = async (word: string) => {
    const next = excecaoList.filter((x) => x !== word).join(", ");
    await saveExcecoesValue(next);
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
  const [pendingEdits, setPendingEdits] = useState<Record<string, string>>({});
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  const saveRowCuriosity = async (row: InfoMusicRow) => {
    const val = (pendingEdits[row.id] ?? "").trim();
    if (!val) { toast.error("Digite a curiosidade antes de salvar"); return; }
    setSavingRowId(row.id);
    const { error } = await supabase.from("infomusic").update({ curiosidade: val }).eq("id", row.id);
    setSavingRowId(null);
    if (error) { toast.error("Erro ao salvar"); return; }
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, curiosidade: val } : r));
    setPendingEdits(prev => { const n = { ...prev }; delete n[row.id]; return n; });
    toast.success("Curiosidade cadastrada!");
  };


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

  // Actively fetch curiosity for the currently playing song if the dashboard doesn't already have one.
  // Also resets the manual-form toggle whenever the track changes.
  useEffect(() => {
    if (!nowPlaying || !user) return;
    const key = `${nowPlaying.artista}::${nowPlaying.musica}`.toLowerCase();
    if (curiosityFetchKeyRef.current !== key) {
      curiosityFetchKeyRef.current = key;
      setShowManualForm(false);
      setManualCuriosityText("");
    }
    if (nowPlaying.curiosity) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("get-music-curiosity", {
          body: { artista: nowPlaying.artista, musica: nowPlaying.musica, userId: user.id },
        });
        if (cancelled) return;
        const txt = (data as { curiosidade?: string })?.curiosidade;
        if (!txt) {
          // Nothing found — still register a blank row in infomusic so the user
          // can fill the curiosidade manually later from the saved list.
          try {
            const { data: existing } = await supabase
              .from("infomusic")
              .select("id")
              .eq("user_id", user.id)
              .ilike("artista", nowPlaying.artista)
              .ilike("musica", nowPlaying.musica)
              .maybeSingle();
            if (!existing) {
              await supabase.from("infomusic").insert({
                user_id: user.id,
                artista: nowPlaying.artista,
                musica: nowPlaying.musica,
                curiosidade: "",
              });
              // Refresh the saved list so the new blank entry appears immediately
              load();
            }
          } catch (err) {
            console.warn("[InfoMusicSection] blank infomusic insert failed", err);
          }
          return;
        }
        // Reflect immediately in UI
        setNowPlaying(prev => prev && prev.musica === nowPlaying.musica && prev.artista === nowPlaying.artista
          ? { ...prev, curiosity: txt } : prev);
        // Persist to dashboard so the XML picks it up
        const currentDashboard = (await supabase.from("user_settings").select("dashboard_items").eq("user_id", user.id).maybeSingle()).data?.dashboard_items as any || {};
        await supabase.from("user_settings").update({
          dashboard_items: { ...currentDashboard, music_current_curiosity: txt },
        }).eq("user_id", user.id);

      } catch (e) {
        console.warn("[InfoMusicSection] curiosity fetch failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [nowPlaying?.musica, nowPlaying?.artista, nowPlaying?.curiosity, user]);

  // ============ XML Verifier ============
  // Fetch the live broadcast XML and compare its <curiosidade> value with the text
  // displayed in the "Curiosidade da música no ar" card. Alerts on divergence.
  const normalizeCuriosity = (s: string) =>
    (s || "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, " ")
      .trim();

  const runXmlCheck = async () => {
    if (!user) return;
    setXmlCheck(prev => ({ ...prev, status: "checking" }));
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-xml-broadcast?user_id=${user.id}&_=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const m = xml.match(/<curiosidade>([\s\S]*?)<\/curiosidade>/i);
      const xmlText = normalizeCuriosity(m?.[1] || "");
      const cardText = normalizeCuriosity(nowPlaying?.curiosity || xmlTelemetry.text || "");
      const status: "ok" | "diverge" = xmlText === cardText ? "ok" : "diverge";
      setXmlCheck({ status, xmlText, checkedAt: Date.now() });
    } catch (e) {
      setXmlCheck({ status: "error", xmlText: "", checkedAt: Date.now(), error: (e as Error).message });
    }
  };

  useEffect(() => {
    if (!user) return;
    runXmlCheck();
    const id = setInterval(runXmlCheck, 15000);
    return () => clearInterval(id);
     
  }, [user, nowPlaying?.curiosity, xmlTelemetry.text]);

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

  const quotaExhausted = monthlyQuota.count >= monthlyQuota.limit;

  return (
    <div className="space-y-5">
      {/* ── Header row: status crédito IA + botão "?" ── */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setShowAiToggle(v => !v)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold hover:opacity-90 transition-opacity"
          title={`Créditos de geração por IA usados este mês (${monthlyQuota.count} de ${monthlyQuota.limit}). Clique para configurar.`}
          style={{
            backgroundColor: quotaExhausted
              ? "color-mix(in srgb, #ef4444 12%, transparent)"
              : "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)",
            color: quotaExhausted ? "#ef4444" : "var(--layout-accent-color, #2563eb)",
            border: `1px solid ${quotaExhausted
              ? "color-mix(in srgb, #ef4444 30%, transparent)"
              : "color-mix(in srgb, var(--layout-accent-color, #2563eb) 25%, transparent)"}`,
          }}
        >
          <Sparkles size={13} />
          <span className="uppercase tracking-wider opacity-75">Créditos IA</span>
          <span className="tabular-nums font-black">
            {Math.max(0, monthlyQuota.limit - monthlyQuota.count)}
            <span className="opacity-50 font-normal"> / {monthlyQuota.limit}</span>
          </span>
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${aiEnabled ? "animate-pulse" : ""}`}
            style={{
              backgroundColor: !aiEnabled ? "#9ca3af" : quotaExhausted ? "#ef4444" : "#10b981",
            }}
          />
        </button>

        {showAiToggle && (
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold"
            style={{
              backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 96%, var(--layout-border-color, #333))",
              border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)",
              color: "var(--layout-page-text, #1a1a1a)",
            }}
          >
            <Sparkles size={12} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
            <span className="uppercase tracking-wider opacity-70">Geração por IA</span>
            <button
              onClick={toggleAi}
              disabled={togglingAi}
              role="switch"
              aria-checked={aiEnabled}
              className="relative inline-flex h-4 w-8 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
              style={{
                backgroundColor: aiEnabled
                  ? "var(--layout-accent-color, #2563eb)"
                  : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 25%, transparent)",
              }}
            >
              <span
                className="inline-block h-3 w-3 transform rounded-full bg-white transition-transform shadow"
                style={{ transform: aiEnabled ? "translateX(18px)" : "translateX(2px)" }}
              />
            </button>
            <span className="text-[10px] opacity-60">
              {aiEnabled ? "Ativo" : "Desativado"}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowHowTo(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
          style={{
            backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent)",
            color: "var(--layout-accent-color, #2563eb)",
            border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 25%, transparent)",
          }}
          title="Como funciona"
        >
          <HelpCircle size={13} />
          Como funciona?
        </button>
      </div>


      {showHowTo && (
        <div
          onClick={() => setShowHowTo(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483000,
            background: "rgba(10, 37, 64, 0.55)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="rounded-2xl overflow-hidden"
            style={{
              backgroundColor: "var(--layout-page-bg, #fff)",
              border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 30%, transparent)",
              maxWidth: 520,
              width: "100%",
              boxShadow: "0 24px 60px rgba(10,37,64,0.25)",
            }}
          >
            <div className="flex items-center justify-between px-5 py-3" style={{ background: "linear-gradient(135deg, var(--layout-accent-color, #2563eb), color-mix(in srgb, var(--layout-accent-color, #2563eb) 70%, #000))", color: "#fff" }}>
              <div className="flex items-center gap-2">
                <Sparkles size={16} />
                <h4 className="text-sm font-bold uppercase tracking-wider">Como funciona o Info Music</h4>
              </div>
              <button onClick={() => setShowHowTo(false)} className="p-1 rounded-full hover:bg-white/15" aria-label="Fechar">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs leading-relaxed" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                Ao tocar uma nova música, o sistema consulta a tabela <strong>InfoMusic</strong>.
                Se não houver curiosidade salva, a IA gera uma frase curta e a envia ao XML
                <code className="mx-1 px-1 rounded" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>&lt;curiosidade&gt;</code>
                entre <strong>10s e 25s</strong>. Curiosidades ficam salvas por <strong>6 meses</strong>.
                Cota de IA: <strong>20/mês</strong> por usuário.
              </p>
              <div className="rounded-lg px-3 py-2 flex items-start gap-2 text-[11px] leading-snug" style={{
                backgroundColor: "color-mix(in srgb, #10b981 12%, transparent)",
                border: "1px solid color-mix(in srgb, #10b981 30%, transparent)",
                color: "var(--layout-page-text, #1a1a1a)",
              }}>
                <CheckCircle2 size={12} className="mt-0.5 shrink-0" style={{ color: "#10b981" }} />
                <span>
                  <strong>Mesmo sem cota</strong> ou com IA desabilitada, curiosidades já salvas no banco continuam sendo enviadas ao XML normalmente.
                </span>
              </div>
              <p className="text-[11px] opacity-70" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                A lista de <strong>exceções</strong> bloqueia a geração para músicas ou artistas cujo nome contenha alguma das palavras cadastradas (ex.: <em>jingle</em>, <em>vinheta</em>).
              </p>
            </div>
          </div>
        </div>
      )}



      {/* ── NO AR AGORA (esquerda) + Exceções (direita) ── */}
      <div className={nowPlaying ? "grid md:grid-cols-2 gap-4 items-start" : ""}>
        {nowPlaying && (
          <div className="rounded-2xl overflow-hidden relative" style={{
            backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 94%, var(--layout-accent-color, #2563eb))",
            border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 25%, transparent)",
          }}>
            <div className="p-4 flex items-center gap-4 relative z-10 border-b" style={{ borderColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent)" }}>
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
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 border border-green-500/20">
                  No Ar Agora
                </span>
                <h3 className="mt-1 text-sm font-bold truncate leading-tight" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
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

            {/* Curiosidade inline — dois estados */}
            <div className="p-4">
              {nowPlaying.curiosity ? (
                <div
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: "color-mix(in srgb, #10b981 12%, var(--layout-page-bg, #fff))",
                    border: "1px solid color-mix(in srgb, #10b981 35%, transparent)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={14} style={{ color: "#10b981" }} />
                    <h4 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#10b981" }}>
                      Curiosidade encontrada e enviada ao XML
                    </h4>
                    <span
                      className="ml-auto inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: "rgba(16,185,129,0.18)", color: "#10b981" }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Ativa
                    </span>
                  </div>
                  <p
                    className="text-xs italic leading-relaxed"
                    style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 90%, transparent)" }}
                  >
                    "{nowPlaying.curiosity}"
                  </p>
                </div>
              ) : (
                <div
                  className="rounded-xl p-4 space-y-3"
                  style={{
                    backgroundColor: "color-mix(in srgb, #f59e0b 10%, var(--layout-page-bg, #fff))",
                    border: "1px dashed color-mix(in srgb, #f59e0b 45%, transparent)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl leading-none">🤔</div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: "#b45309" }}>
                        Nada encontrado sobre esta música
                      </h4>
                      <p className="text-xs leading-relaxed" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                        Ihh, não achei nada sobre essa música — vou pôr na lista pra gente cadastrar manualmente depois.
                      </p>
                      {quotaExhausted && (
                        <p className="mt-1 text-[11px]" style={{ color: "#ef4444" }}>
                          Cota mensal de IA esgotada — novas gerações voltam no próximo mês. Cache continua ativo.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="absolute top-0 right-0 -mt-4 -mr-4 opacity-[0.03] pointer-events-none">
              <Music size={120} />
            </div>
          </div>
        )}

        <div className="rounded-xl p-4 space-y-3" style={{
          backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 96%, var(--layout-border-color, #333))",
          border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 12%, transparent)",
        }}>
          <div className="flex items-center gap-2">
            <Ban size={14} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
            <h4 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              Exceções ({excecaoList.length})
            </h4>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 65%, transparent)" }}>
            Quando o artista ou música contiver qualquer palavra abaixo, a tag <code>&lt;curiosidade&gt;</code> fica vazia.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Adicionar palavra (ex.: jingle)"
              value={newExcecao}
              onChange={(e) => setNewExcecao(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExcecao(); } }}
              className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
              style={{
                backgroundColor: "var(--layout-page-bg, #fff)",
                color: "var(--layout-page-text, #1a1a1a)",
                border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)",
              }}
            />
            <Button variant="save" onClick={addExcecao} disabled={savingExcecoes || !newExcecao.trim()}>
              {savingExcecoes ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Adicionar
            </Button>
          </div>
          <div
            className="rounded-lg overflow-hidden"
            style={{
              border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)",
              backgroundColor: "var(--layout-page-bg, #fff)",
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {excecaoList.length === 0 ? (
              <div className="text-center py-6 text-[11px] opacity-55" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                Nenhuma palavra cadastrada.
              </div>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {excecaoList.map((w, i) => (
                    <tr
                      key={w + i}
                      style={{
                        borderTop: i > 0 ? "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)" : undefined,
                      }}
                    >
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                        {w}
                      </td>
                      <td className="px-3 py-2 text-right w-10">
                        <button
                          onClick={() => removeExcecao(w)}
                          className="opacity-50 hover:opacity-100 transition-opacity"
                          style={{ color: "#dc2626" }}
                          title="Remover"
                          disabled={savingExcecoes}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>



      {/* ── XML: telemetria + verificador (grid 2 col) ── */}
      <div className="grid md:grid-cols-2 gap-3">
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

      {/* XML Verifier: compares card text vs live XML */}
      <div className="rounded-xl p-3 flex items-start gap-3" style={{
        backgroundColor: xmlCheck.status === "diverge"
          ? "color-mix(in srgb, var(--layout-page-bg, #fff) 88%, #ef4444)"
          : xmlCheck.status === "ok"
            ? "color-mix(in srgb, var(--layout-page-bg, #fff) 94%, #10b981)"
            : "color-mix(in srgb, var(--layout-page-bg, #fff) 96%, #6b7280)",
        border: `1px solid ${
          xmlCheck.status === "diverge" ? "color-mix(in srgb, #ef4444 45%, transparent)" :
          xmlCheck.status === "ok" ? "color-mix(in srgb, #10b981 30%, transparent)" :
          "color-mix(in srgb, #6b7280 25%, transparent)"
        }`,
      }}>
        <div className="shrink-0 pt-0.5">
          {xmlCheck.status === "checking" ? (
            <Loader2 size={14} className="animate-spin" style={{ color: "#6b7280" }} />
          ) : xmlCheck.status === "diverge" ? (
            <AlertTriangle size={14} style={{ color: "#ef4444" }} />
          ) : xmlCheck.status === "error" ? (
            <AlertTriangle size={14} style={{ color: "#f59e0b" }} />
          ) : (
            <CheckCircle2 size={14} style={{ color: "#10b981" }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              Verificador XML ↔ Card
            </span>
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                backgroundColor:
                  xmlCheck.status === "diverge" ? "rgba(239,68,68,0.18)" :
                  xmlCheck.status === "ok" ? "rgba(16,185,129,0.15)" :
                  xmlCheck.status === "error" ? "rgba(245,158,11,0.18)" :
                  "rgba(107,114,128,0.15)",
                color:
                  xmlCheck.status === "diverge" ? "#ef4444" :
                  xmlCheck.status === "ok" ? "#10b981" :
                  xmlCheck.status === "error" ? "#f59e0b" : "#6b7280",
              }}
            >
              {xmlCheck.status === "diverge" ? "Divergente" :
               xmlCheck.status === "ok" ? "Sincronizado" :
               xmlCheck.status === "error" ? "Erro" :
               xmlCheck.status === "checking" ? "Verificando…" : "Aguardando"}
            </span>
            {xmlCheck.checkedAt > 0 && (
              <span className="text-[10px] opacity-60 font-mono" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                {new Date(xmlCheck.checkedAt).toLocaleTimeString("pt-BR")}
              </span>
            )}
            <button
              onClick={runXmlCheck}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 opacity-70 hover:opacity-100"
              style={{ color: "var(--layout-page-text, #1a1a1a)" }}
            >
              <RefreshCw size={10} /> Reverificar
            </button>
          </div>
          {xmlCheck.status === "diverge" ? (
            <div className="space-y-1 mt-1">
              <p className="text-[11px] font-bold" style={{ color: "#ef4444" }}>
                ⚠ O texto no XML difere do exibido no card.
              </p>
              <div className="grid gap-1 text-[11px]">
                <div className="flex gap-1.5">
                  <span className="opacity-60 shrink-0" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Card:</span>
                  <span className="italic break-words" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                    "{normalizeCuriosity(nowPlaying?.curiosity || xmlTelemetry.text || "") || "— vazio —"}"
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <span className="opacity-60 shrink-0" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>XML:</span>
                  <span className="italic break-words" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                    "{xmlCheck.xmlText || "— vazio —"}"
                  </span>
                </div>
              </div>
            </div>
          ) : xmlCheck.status === "error" ? (
            <p className="text-[11px]" style={{ color: "#f59e0b" }}>
              Não foi possível ler o XML: {xmlCheck.error}
            </p>
          ) : (
            <p className="text-[11px] opacity-70" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              XML e card com o mesmo texto de curiosidade.
            </p>
          )}
        </div>
      </div>
      </div>


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
                      <Button variant="save"
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
                      </Button>
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
                          {r.curiosidade && r.curiosidade.trim() ? (
                            <div className="line-clamp-3 leading-relaxed">
                              {(filterField === "all" || filterField === "curiosidade") ? <Highlight text={r.curiosidade} term={search} /> : r.curiosidade}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#f59e0b" }}>
                                Aguardando cadastro manual
                              </span>
                              <textarea
                                value={pendingEdits[r.id] ?? ""}
                                onChange={(e) => setPendingEdits(p => ({ ...p, [r.id]: e.target.value }))}
                                placeholder="Digite a curiosidade sobre esta música..."
                                rows={2}
                                className="w-full px-2 py-1.5 rounded-md text-xs outline-none resize-y"
                                style={{
                                  backgroundColor: "var(--layout-page-bg, #fff)",
                                  color: "var(--layout-page-text, #1a1a1a)",
                                  border: "1px dashed color-mix(in srgb, #f59e0b 50%, transparent)",
                                }}
                              />
                              <div className="flex justify-end">
                                <Button
                                  variant="save"
                                  onClick={() => saveRowCuriosity(r)}
                                  disabled={savingRowId === r.id || !(pendingEdits[r.id] ?? "").trim()}
                                >
                                  {savingRowId === r.id ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                                  Salvar
                                </Button>
                              </div>
                            </div>
                          )}
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
