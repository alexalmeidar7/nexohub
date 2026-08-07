import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, Loader2, Trash2, RefreshCw, Ban, Save, Send, Music, Search, X, AlertTriangle, CheckCircle2, HelpCircle, Plus, Download, Upload, ImagePlus } from "lucide-react";
import * as XLSX from "xlsx";
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
  const [excecoes, setExcecoes] = useState<any[]>([]);
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
  const [newExcecaoCapa, setNewExcecaoCapa] = useState("");
  const [newExcecaoFundo, setNewExcecaoFundo] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ active: boolean; stage: string; percent: number }>({ active: false, stage: "", percent: 0 });
  const [previewImage, setPreviewImage] = useState<{ url: string; type: "Capa" | "Fundo" } | null>(null);

  const loadExcecoes = async () => {
    if (!user) return;
    const [settingsRes, exceptionsRes] = await Promise.all([
      supabase
        .from("user_settings")
        .select("infomusic_ai_enabled, infomusic_ai_monthly_count, last_manual_curiosity_id, dashboard_items")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("infomusic_excecoes")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
    ]);

    const data = settingsRes.data;
    setExcecoes(exceptionsRes.data || []);
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

  const purgeExceptionsFromTocadas = async (words: string[]) => {
    if (!user) return;
    const list = words.map((w) => w.trim()).filter(Boolean);
    if (list.length === 0) return;
    try {
      // Delete every infomusic row whose artista OR musica contains any exception word
      for (const w of list) {
        const like = `%${w.replace(/[%_]/g, "")}%`;
        await supabase.from("infomusic").delete().eq("user_id", user.id).ilike("artista", like);
        await supabase.from("infomusic").delete().eq("user_id", user.id).ilike("musica", like);
        // Também apaga do histórico de músicas tocadas para não aparecer no player
        await supabase.from("musicas_tocadas").delete().eq("user_id", user.id).ilike("artista", like);
        await supabase.from("musicas_tocadas").delete().eq("user_id", user.id).ilike("musica", like);
      }
      // Update local state immediately so UI reflects removal
      setRows((prev) =>
        prev.filter((r) => {
          const a = (r.artista || "").toLowerCase();
          const m = (r.musica || "").toLowerCase();
          return !list.some((w) => {
            const ww = w.toLowerCase();
            return a.includes(ww) || m.includes(ww);
          });
        }),
      );
    } catch (e) {
      console.warn("[InfoMusicSection] purge exceptions failed", e);
    }
  };

  const addExcecao = async () => {
    const v = newExcecao.trim();
    if (!v) return;
    if (excecoes.some((x) => x.termo.toLowerCase() === v.toLowerCase())) {
      toast.error("Termo já cadastrado");
      return;
    }
    
    setSavingExcecoes(true);
    setUploadProgress({ active: true, stage: "Iniciando...", percent: 10 });
    
    try {
      let capaFinal = newExcecaoCapa.trim();
      let fundoFinal = newExcecaoFundo.trim();
      const timestamp = Date.now();
      const { uploadImageToStorage } = await import("@/lib/uploadImageToStorage");

      if (capaFinal.startsWith("data:") && user?.id) {
        setUploadProgress({ active: true, stage: "Processando Capa...", percent: 30 });
        capaFinal = await uploadImageToStorage(
          capaFinal, 
          "empresa-assets", 
          `${user.id}/excecoes/${timestamp}_capa.webp`,
          1080
        );
        setUploadProgress({ active: true, stage: "Capa concluída", percent: 50 });
      }

      if (fundoFinal.startsWith("data:") && user?.id) {
        setUploadProgress({ active: true, stage: "Processando Fundo...", percent: 60 });
        fundoFinal = await uploadImageToStorage(
          fundoFinal, 
          "empresa-assets", 
          `${user.id}/excecoes/${timestamp}_fundo.webp`,
          1920
        );
        setUploadProgress({ active: true, stage: "Fundo concluído", percent: 80 });
      }

      setUploadProgress({ active: true, stage: "Salvando dados...", percent: 90 });
      const { error } = await supabase
        .from("infomusic_excecoes")
        .insert({
          user_id: user?.id,
          termo: v,
          capa_url: capaFinal || null,
          background_url: fundoFinal || null
        });
      
      if (error) throw error;
      
      setNewExcecao("");
      setNewExcecaoCapa("");
      setNewExcecaoFundo("");
      await loadExcecoes();
      setUploadProgress({ active: true, stage: "Sucesso!", percent: 100 });
      setTimeout(() => setUploadProgress({ active: false, stage: "", percent: 0 }), 1000);
      toast.success("Exceção adicionada");
    } catch (e) {
      setUploadProgress({ active: false, stage: "", percent: 0 });
      toast.error("Erro ao adicionar exceção");
    }
    setSavingExcecoes(false);
  };

  const removeExcecao = async (id: string) => {
    try {
      const { error } = await supabase
        .from("infomusic_excecoes")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      await loadExcecoes();
      toast.success("Exceção removida");
    } catch (e) {
      toast.error("Erro ao remover exceção");
    }
  };


  const updateExcecaoAsset = async (id: string, field: "capa_url" | "background_url", value: string | null) => {
    if (!user) return;
    setSavingExcecoes(true);
    try {
      let finalValue = value;
      if (value && value.startsWith("data:")) {
        const timestamp = Date.now();
        const { uploadImageToStorage } = await import("@/lib/uploadImageToStorage");
        const suffix = field === "capa_url" ? "capa" : "fundo";
        const size = field === "capa_url" ? 1080 : 1920;
        
        setUploadProgress({ active: true, stage: `Processando ${field === "capa_url" ? "Capa" : "Fundo"}...`, percent: 40 });
        
        finalValue = await uploadImageToStorage(
          value,
          "empresa-assets",
          `${user.id}/excecoes/${timestamp}_${suffix}.webp`,
          size
        );
        setUploadProgress({ active: true, stage: "Upload concluído", percent: 80 });
      }

      const { error } = await supabase
        .from("infomusic_excecoes")
        .update({ [field]: finalValue })
        .eq("id", id);

      if (error) throw error;
      
      await loadExcecoes();
      setUploadProgress({ active: true, stage: "Sucesso!", percent: 100 });
      setTimeout(() => setUploadProgress({ active: false, stage: "", percent: 0 }), 1000);
      toast.success(field === "capa_url" ? "Capa atualizada" : "Fundo atualizado");
    } catch (e) {
      setUploadProgress({ active: false, stage: "", percent: 0 });
      toast.error("Erro ao atualizar asset");
    }
    setSavingExcecoes(false);
  };

  const PAGE_SIZE = 50;
  const HARD_CAP = 50;
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
  const [importingXlsx, setImportingXlsx] = useState(false);
  const [importSummary, setImportSummary] = useState<{ filled: number; inserted: number; overwritten: number; notFound: string[] } | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  const handleExportMissing = () => {
    try {
      const list = filteredMissing.length > 0 ? filteredMissing : missingRows;
      if (!list.length) { toast.info("Nenhuma música sem curiosidade para exportar"); return; }
      const data = list.map(m => ({ ARTISTA: m.artista, MUSICA: m.musica, CURIOSIDADE: "" }));
      const ws = XLSX.utils.json_to_sheet(data, { header: ["ARTISTA", "MUSICA", "CURIOSIDADE"] });
      ws["!cols"] = [{ wch: 32 }, { wch: 40 }, { wch: 80 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "SemCuriosidade");
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `musicas-sem-curiosidade-${stamp}.xlsx`);
      toast.success(`Exportadas ${data.length} músicas`);
    } catch (e) {
      toast.error("Erro ao exportar: " + ((e as Error).message || "desconhecido"));
    }
  };

  const handleImportMissing = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setImportingXlsx(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // Read positionally (col A = artista, col B = musica, col C = curiosidade),
      // ignoring headers. Works whether the sheet has a header row or not.
      const rowsIn = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
      const norm = (s: string) => s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
      const parsed = rowsIn
        .map(r => ({
          artista: String(r?.[0] ?? "").trim(),
          musica: String(r?.[1] ?? "").trim(),
          curiosidade: String(r?.[2] ?? "").trim(),
        }))
        .filter(r => {
          if (!r.artista || !r.musica || !r.curiosidade) return false;
          // skip header row if present
          const a = norm(r.artista), m = norm(r.musica);
          if (a === "artista" && m === "musica") return false;
          return true;
        });

      if (!parsed.length) {
        toast.error("Nenhuma linha válida (colunas A=Artista, B=Música, C=Curiosidade)");
        setImportingXlsx(false);
        return;
      }

      // Load existing rows for this user once (match against Tocadas)
      const { data: existingRows } = await supabase
        .from("infomusic")
        .select("id, artista, musica, curiosidade")
        .eq("user_id", user.id);
      const byKey = new Map<string, { id: string; curiosidade: string | null }>();
      for (const row of existingRows || []) {
        byKey.set(`${norm(row.artista || "")}::${norm(row.musica || "")}`, { id: row.id, curiosidade: row.curiosidade });
      }

      // Also load Tocadas so we can fill items that only exist in musicas_tocadas
      const { data: playedRows } = await supabase
        .from("musicas_tocadas")
        .select("artista, musica")
        .limit(5000);
      const playedKeys = new Set<string>();
      for (const p of playedRows || []) {
        playedKeys.add(`${norm(p.artista || "")}::${norm(p.musica || "")}`);
      }

      let filled = 0;
      let inserted = 0;
      let overwritten = 0;
      const notFound: string[] = [];
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 6);

      for (const item of parsed) {
        const key = `${norm(item.artista)}::${norm(item.musica)}`;
        const match = byKey.get(key);
        if (match) {
          const wasEmpty = !match.curiosidade || !match.curiosidade.trim();
          const { error } = await supabase
            .from("infomusic")
            .update({ curiosidade: item.curiosidade, expires_at: expiresAt.toISOString() })
            .eq("id", match.id);
          if (!error) {
            if (wasEmpty) filled++; else overwritten++;
          }
          continue;
        }
        // No infomusic row — insert only if the track is in Tocadas (musicas_tocadas)
        if (playedKeys.has(key)) {
          const { error } = await supabase.from("infomusic").insert({
            user_id: user.id,
            artista: item.artista,
            musica: item.musica,
            curiosidade: item.curiosidade,
            deezer_artist_img: null,
            expires_at: expiresAt.toISOString(),
          });
          if (!error) inserted++;
          else notFound.push(`${item.artista} — ${item.musica}`);
        } else {
          notFound.push(`${item.artista} — ${item.musica}`);
        }
      }

      const parts: string[] = [];
      if (filled) parts.push(`${filled} preenchida(s)`);
      if (inserted) parts.push(`${inserted} inserida(s)`);
      if (overwritten) parts.push(`${overwritten} sobrescrita(s)`);
      if (notFound.length) parts.push(`${notFound.length} não encontrada(s) em Tocadas`);
      toast.success(parts.join(" · ") || "Nada a importar");
      setImportSummary({ filled, inserted, overwritten, notFound });
      await Promise.all([load(), loadMissing()]);
    } catch (err) {
      toast.error("Erro ao importar: " + ((err as Error).message || "desconhecido"));
    }
    setImportingXlsx(false);
  };


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
      const { computeMissingCuriosities, fetchAllInfomusic } = await import("@/lib/missingCuriosities");

      // Fetch ALL infomusic rows in chunks — source of truth.
      const allInfos = await fetchAllInfomusic(async (from, to) => {
        const res = await supabase
          .from("infomusic")
          .select("artista, musica, curiosidade, created_at")
          .order("created_at", { ascending: false })
          .range(from, to);
        return { data: res.data, error: res.error };
      });

      // Recent musicas_tocadas so played-but-never-in-infomusic tracks surface.
      const { data: played } = await supabase
        .from("musicas_tocadas")
        .select("artista, musica, created_at")
        .order("created_at", { ascending: false })
        .limit(5000);

      const missing = computeMissingCuriosities(allInfos, played || []);
      setMissingRows(missing);
    } catch (e) {
      toast.error("Erro ao carregar músicas sem curiosidade");
    }
    setLoadingMissing(false);
  };


  const filteredMissing = useMemo(() => {
    const excLower = excecoes.map(ex => ex.termo.trim().toLowerCase());
    const notExcepted = missingRows.filter(m => {
      const a = (m.artista || "").toLowerCase();
      const mu = (m.musica || "").toLowerCase();
      return !excLower.some(w => a.includes(w) || mu.includes(w));
    });
    const q = search.trim().toLowerCase();
    if (!q) return notExcepted;
    return notExcepted.filter(m =>
      m.artista.toLowerCase().includes(q) || m.musica.toLowerCase().includes(q)
    );
  }, [missingRows, search, excecoes]);

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
    // 1. Filtrar Exceções
    const excLower = excecoes.map(ex => ex.termo.toLowerCase());
    const notExcepted = rows.filter(r => {
      const artista = (r.artista || "").toLowerCase();
      const musica = (r.musica || "").toLowerCase();
      return !excLower.some(w => artista.includes(w) || musica.includes(w));
    });

    const q = search.trim().toLowerCase();

    // 2. Aplicar filtro de campo (somente se não houver busca, ou se o usuário explicitamente desejar)
    // Regra: Se houver busca (q), ignoramos o filtro de "Músicas com curiosidades" para buscar em TUDO.
    const filteredByField = notExcepted.filter(r => {
      if (q) return true; // Se está buscando, busca em todas as músicas carregadas
      
      const hasCuriosity = !!(r.curiosidade && r.curiosidade.trim());
      if (filterField === "artista") return hasCuriosity;
      return true;
    });

    if (!q) return filteredByField;

    // 3. Aplicar busca em todos os campos
    return filteredByField.filter(r => {
      const artista = (r.artista || "").toLowerCase();
      const musica = (r.musica || "").toLowerCase();
      const curiosidade = (r.curiosidade || "").toLowerCase();
      return artista.includes(q) || musica.includes(q) || curiosidade.includes(q);
    });
  }, [rows, search, filterField, excecoes]);




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
  // Guarantee: any row in "Tocadas" that matches the current exception list is purged from DB + UI
  useEffect(() => {
    if (!user || excecoes.length === 0 || rows.length === 0) return;
    const hasMatch = rows.some((r) => {
      const a = (r.artista || "").toLowerCase();
      const m = (r.musica || "").toLowerCase();
      return excecoes.some((ex) => {
        const ww = ex.termo.toLowerCase();
        return a.includes(ww) || m.includes(ww);
      });
    });
    if (hasMatch) {
      purgeExceptionsFromTocadas(excecoes.map(ex => ex.termo));
    }
  }, [excecoes, rows, user]);
  useEffect(() => {
    if (filterField === "sem_curiosidade" && !loadingMissing) {
      loadMissing();
    }
  }, [filterField, rows]);

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

    // Skip if artist/music matches any exception word (case-insensitive substring)
    const hay = `${nowPlaying.artista} ${nowPlaying.musica}`.toLowerCase();
    const isException = excecoes.some((ex) => {
      const ww = ex.termo.trim().toLowerCase();
      return !!ww && hay.includes(ww);
    });
    if (isException) return;

    let cancelled = false;
    (async () => {
      // 1) Ensure a row exists in "Tocadas" for every played track (blank curiosity by default)
      let existingId: string | null = null;
      let existingCuriosity = "";
      try {
        const { data: existing } = await supabase
          .from("infomusic")
          .select("id, curiosidade")
          .eq("user_id", user.id)
          .ilike("artista", nowPlaying.artista)
          .ilike("musica", nowPlaying.musica)
          .maybeSingle();
        if (existing) {
          existingId = existing.id;
          existingCuriosity = existing.curiosidade || "";
        } else {
          const { data: inserted } = await supabase
            .from("infomusic")
            .insert({
              user_id: user.id,
              artista: nowPlaying.artista,
              musica: nowPlaying.musica,
              curiosidade: nowPlaying.curiosity || "",
            })
            .select("id")
            .maybeSingle();
          existingId = inserted?.id || null;
          existingCuriosity = nowPlaying.curiosity || "";
          load();
        }
      } catch (err) {
        console.warn("[InfoMusicSection] tocadas upsert failed", err);
      }

      if (cancelled) return;
      if (nowPlaying.curiosity || existingCuriosity) return;

      // 2) Try to fetch curiosity for this track
      try {
        const { data } = await supabase.functions.invoke("get-music-curiosity", {
          body: { artista: nowPlaying.artista, musica: nowPlaying.musica, userId: user.id },
        });
        if (cancelled) return;
        const txt = (data as { curiosidade?: string })?.curiosidade;
        if (!txt) return;
        setNowPlaying(prev => prev && prev.musica === nowPlaying.musica && prev.artista === nowPlaying.artista
          ? { ...prev, curiosity: txt } : prev);
        const currentDashboard = (await supabase.from("user_settings").select("dashboard_items").eq("user_id", user.id).maybeSingle()).data?.dashboard_items as any || {};
        await supabase.from("user_settings").update({
          dashboard_items: { ...currentDashboard, music_current_curiosity: txt },
        }).eq("user_id", user.id);
        // Update the "Tocadas" row so table reflects the newly fetched curiosity
        if (existingId) {
          await supabase.from("infomusic").update({ curiosidade: txt }).eq("id", existingId);
          load();
        }
      } catch (e) {
        console.warn("[InfoMusicSection] curiosity fetch failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [nowPlaying?.musica, nowPlaying?.artista, nowPlaying?.curiosity, user, excecoes]);

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
    <div
      className="relative space-y-5 rounded-2xl p-5"
      style={{
        backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 88%, transparent)",
        border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 14%, transparent)",
        boxShadow: "0 8px 28px -14px color-mix(in srgb, var(--layout-page-text, #1a1a1a) 22%, transparent)",
      }}
    >
      {/* Upload Progress Overlay */}
      {uploadProgress.active && (
        <div 
          className="absolute inset-0 z-[200] flex flex-col items-center justify-center rounded-2xl backdrop-blur-md"
          style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 85%, transparent)" }}
        >
          <div className="w-full max-w-[280px] space-y-4 px-6">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              <span className="flex items-center gap-2">
                <Loader2 size={12} className="animate-spin text-cyan-500" />
                {uploadProgress.stage}
              </span>
              <span className="tabular-nums">{uploadProgress.percent}%</span>
            </div>
            
            <div className="h-1.5 w-full rounded-full bg-black/5 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-cyan-400 to-cyan-600 transition-all duration-300 ease-out shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                style={{ width: `${uploadProgress.percent}%` }}
              />
            </div>
            
            <p className="text-[10px] text-center opacity-60 font-medium" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              Otimizando e salvando suas imagens de alta resolução...
            </p>
          </div>
        </div>
      )}

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
            backgroundColor: "var(--layout-page-bg, #fff)",
            border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 35%, transparent)",
            boxShadow: "0 10px 24px -14px color-mix(in srgb, var(--layout-accent-color, #2563eb) 40%, transparent)",
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

              <div className="flex items-center gap-1 shrink-0">
                {(() => {
                  const hay = `${nowPlaying.artista} ${nowPlaying.musica}`.toLowerCase();
                  const isException = excecoes.some((ex) => {
                    const ww = ex.termo.trim().toLowerCase();
                    return !!ww && hay.includes(ww);
                  });
                  if (!isException) return null;
                  return (
                    <span
                      className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"
                      style={{ boxShadow: "0 0 8px rgba(239,68,68,0.8)" }}
                      title="Esta música está na lista de EXCEÇÕES"
                    />
                  );
                })()}
                <button
                  onClick={loadExcecoes}
                  className="p-2 rounded-full hover:bg-black/5 transition-colors"
                  title="Atualizar música"
                >
                  <RefreshCw size={14} className="opacity-40" />
                </button>
              </div>
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

        <div className="rounded-2xl overflow-hidden" style={{
          backgroundColor: "var(--layout-page-bg, #fff)",
          border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 22%, transparent)",
          boxShadow: "0 10px 24px -16px color-mix(in srgb, var(--layout-page-text, #1a1a1a) 30%, transparent)",
        }}>
          <div
            className="px-4 py-3 flex items-center gap-2 border-b"
            style={{
              background: "linear-gradient(135deg, color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent), color-mix(in srgb, var(--layout-accent-color, #2563eb) 4%, transparent))",
              borderColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)",
            }}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 18%, transparent)" }}
            >
              <Ban size={14} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              Exceções
            </h4>
            <span
              className="ml-auto text-[10px] font-black tabular-nums px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent)",
                color: "var(--layout-accent-color, #2563eb)",
              }}
            >
              {excecoes.length}
            </span>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-[11px] leading-relaxed font-bold" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 85%, transparent)" }}>
              TODAS AS MUSICAS CADASTRADAS NA LISTA DE EXCEÇÕES
            </p>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Termo (ex.: jingle ou artista)"
                value={newExcecao}
                onChange={(e) => setNewExcecao(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExcecao(); } }}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none focus:ring-2 transition-shadow"
                style={{
                  backgroundColor: "var(--layout-page-bg, #fff)",
                  color: "var(--layout-page-text, #1a1a1a)",
                  border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 25%, transparent)",
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex gap-1">
                    <input
                      type="text"
                      placeholder="URL da Capa"
                      value={newExcecaoCapa}
                      onChange={(e) => setNewExcecaoCapa(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
                      style={{
                        backgroundColor: "var(--layout-page-bg, #fff)",
                        color: "var(--layout-page-text, #1a1a1a)",
                        border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 25%, transparent)",
                      }}
                    />
                    <label className="shrink-0 p-2 rounded-lg cursor-pointer hover:bg-black/5 transition-colors border border-dashed border-black/20 flex items-center justify-center bg-cyan-500/10" title="Upload da Capa (1080x1080)">
                      <Upload size={14} className="text-cyan-600" />
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => setNewExcecaoCapa(ev.target?.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                  {newExcecaoCapa && (
                    <div className="flex items-center gap-1 px-1">
                      <div className="text-[9px] opacity-60 font-bold text-cyan-600">Capa carregada ✓</div>
                      <button 
                        onClick={() => setPreviewImage({ url: newExcecaoCapa, type: "Capa" })}
                        className="text-[9px] text-cyan-600 hover:underline font-bold"
                      >
                        (Ver prévia)
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex gap-1">
                    <input
                      type="text"
                      placeholder="URL do Fundo"
                      value={newExcecaoFundo}
                      onChange={(e) => setNewExcecaoFundo(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
                      style={{
                        backgroundColor: "var(--layout-page-bg, #fff)",
                        color: "var(--layout-page-text, #1a1a1a)",
                        border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 25%, transparent)",
                      }}
                    />
                    <label className="shrink-0 p-2 rounded-lg cursor-pointer hover:bg-black/5 transition-colors border border-dashed border-black/20 flex items-center justify-center bg-cyan-500/10" title="Upload do Fundo (1920x1080)">
                      <Upload size={14} className="text-cyan-600" />
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => setNewExcecaoFundo(ev.target?.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                  {newExcecaoFundo && (
                    <div className="flex items-center gap-1 px-1">
                      <div className="text-[9px] opacity-60 font-bold text-cyan-600">Fundo carregado ✓</div>
                      <button 
                        onClick={() => setPreviewImage({ url: newExcecaoFundo, type: "Fundo" })}
                        className="text-[9px] text-cyan-600 hover:underline font-bold"
                      >
                        (Ver prévia)
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <Button variant="save" className="w-full" onClick={addExcecao} disabled={savingExcecoes || !newExcecao.trim()}>
                {savingExcecoes ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                Adicionar Exceção
              </Button>
            </div>

            <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
              <DialogContent className="max-w-[90vw] w-fit p-0 overflow-hidden border-none bg-black/90">
                <div className="relative group">
                  <img 
                    src={previewImage?.url} 
                    alt={`Prévia ${previewImage?.type}`}
                    className="max-h-[85vh] object-contain"
                  />
                  <div className="absolute top-4 left-4 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-white text-xs font-bold border border-white/10">
                    Prévia: {previewImage?.type}
                  </div>
                  <button 
                    onClick={() => setPreviewImage(null)}
                    className="absolute top-4 right-4 p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-black/80 transition-colors border border-white/10"
                  >
                    <X size={18} />
                  </button>
                </div>
              </DialogContent>
            </Dialog>
            <div
              className="rounded-xl overflow-hidden"
              style={{
                border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 18%, transparent)",
                backgroundColor: "var(--layout-page-bg, #fff)",
                maxHeight: 280,
                overflowY: "auto",
              }}
            >
              {excecoes.length === 0 ? (
                <div className="text-center py-6 text-[11px] opacity-60" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  Nenhuma palavra cadastrada.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10" style={{
                    background: "linear-gradient(180deg, color-mix(in srgb, var(--layout-header-bg, #0d0446) 10%, var(--layout-page-bg, #fff)), color-mix(in srgb, var(--layout-header-bg, #0d0446) 5%, var(--layout-page-bg, #fff)))",
                    boxShadow: "0 1px 0 0 color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)",
                  }}>
                    <tr>
                      <th className="text-left px-3 py-2 font-black uppercase text-[10px] tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 78%, transparent)" }}>
                        Palavra / Artista
                      </th>
                      <th className="text-left px-3 py-2 font-black uppercase text-[10px] tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 78%, transparent)" }}>
                        Capa / Fundo
                      </th>
                      <th className="text-right px-3 py-2 font-black uppercase text-[10px] tracking-wider w-16" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 78%, transparent)" }}>
                        Ação
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {excecoes.map((ex, i) => (
                      <tr
                        key={ex.id}
                        className="excecao-row transition-colors"
                        style={{
                          borderTop: i > 0 ? "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)" : undefined,
                          backgroundColor: i % 2 === 1 ? "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)" : undefined,
                        }}
                      >
                        <td className="px-3 py-2 font-medium truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                          {ex.termo}
                        </td>
                        <td className="px-3 py-2 text-[10px] opacity-70" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                          <div className="flex flex-col gap-0.5">
                            {ex.capa_url ? (
                              <div className="flex items-center gap-1.5 group/asset">
                                <button 
                                  onClick={() => setPreviewImage({ url: ex.capa_url, type: "Capa" })}
                                  className="text-emerald-500 font-bold hover:underline text-left"
                                >
                                  ✓ Capa
                                </button>
                                <button 
                                  onClick={() => updateExcecaoAsset(ex.id, "capa_url", null)}
                                  className="opacity-0 group-hover/asset:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                                  title="Remover Capa"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            ) : (
                              <label className="cursor-pointer text-[9px] text-cyan-600 hover:underline flex items-center gap-1">
                                <Plus size={10} /> Adicionar Capa
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  className="hidden" 
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = (ev) => updateExcecaoAsset(ex.id, "capa_url", ev.target?.result as string);
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                />
                              </label>
                            )}
                            {ex.background_url ? (
                              <div className="flex items-center gap-1.5 group/asset">
                                <button 
                                  onClick={() => setPreviewImage({ url: ex.background_url, type: "Fundo" })}
                                  className="text-emerald-500 font-bold hover:underline text-left"
                                >
                                  ✓ Fundo
                                </button>
                                <button 
                                  onClick={() => updateExcecaoAsset(ex.id, "background_url", null)}
                                  className="opacity-0 group-hover/asset:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                                  title="Remover Fundo"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            ) : (
                              <label className="cursor-pointer text-[9px] text-cyan-600 hover:underline flex items-center gap-1">
                                <Plus size={10} /> Adicionar Fundo
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  className="hidden" 
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = (ev) => updateExcecaoAsset(ex.id, "background_url", ev.target?.result as string);
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => removeExcecao(ex.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all hover:scale-105"
                            style={{ backgroundColor: "color-mix(in srgb, #dc2626 12%, transparent)", color: "#dc2626", border: "1px solid color-mix(in srgb, #dc2626 25%, transparent)" }}
                            title="Remover exceção"
                            disabled={savingExcecoes}
                          >
                            <Trash2 size={11} />
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <style>{`
              .excecao-row:hover {
                background-color: color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent) !important;
              }
            `}</style>
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


      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="w-1 h-5 rounded-full"
                style={{ backgroundColor: "var(--layout-accent-color, #2563eb)" }}
              />
              <h4 className="text-sm font-black uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                Últimas 50 Músicas Tocadas
              </h4>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums"
              style={{
                backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent)",
                color: "var(--layout-accent-color, #2563eb)",
              }}
            >
              {search ? `${filteredRows.length} de ${rows.length}` : (
                <div className="flex items-center gap-2">
                  <span>{rows.length}{totalCount > rows.length ? ` de ${totalCount}` : ""}</span>
                  <div className="flex items-center gap-1.5 border-l border-primary/20 pl-2">
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={10} />
                      {rows.filter(r => r.curiosidade && r.curiosidade.trim()).length}
                    </span>
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <HelpCircle size={10} />
                      {rows.filter(r => !r.curiosidade || !r.curiosidade.trim()).length}
                    </span>
                  </div>
                </div>
              )}

            </span>
          </div>
          <button onClick={load} className="text-[11px] font-semibold opacity-70 hover:opacity-100 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors hover:bg-black/5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
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
            <option value="all">Todas as músicas</option>
            <option value="sem_curiosidade">Músicas sem curiosidade</option>
            <option value="artista">Músicas com curiosidades cadastradas</option>
          </select>

        </div>
        <div className="rounded-2xl overflow-hidden" style={{
          border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)",
          backgroundColor: "var(--layout-page-bg, #fff)",
          boxShadow: "0 8px 24px -18px color-mix(in srgb, var(--layout-page-text, #1a1a1a) 30%, transparent)",
        }}>
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
                <div className="flex items-center justify-between px-3 py-2 text-[10px] uppercase font-bold gap-2 flex-wrap" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)", backgroundColor: "color-mix(in srgb, var(--layout-header-bg, #0d0446) 6%, var(--layout-page-bg, #fff))" }}>
                  <span>{filteredMissing.length} música(s) sem curiosidade</span>
                  <div className="flex items-center gap-1.5 normal-case">
                    <button
                      onClick={handleExportMissing}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-opacity hover:opacity-90"
                      style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 14%, transparent)", color: "var(--layout-accent-color, #2563eb)", border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 28%, transparent)" }}
                      title="Baixar Excel com as músicas sem curiosidade"
                    >
                      <Download size={11} /> Exportar
                    </button>
                    <button
                      onClick={() => importFileRef.current?.click()}
                      disabled={importingXlsx}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: "color-mix(in srgb, #16a34a 14%, transparent)", color: "#15803d", border: "1px solid color-mix(in srgb, #16a34a 32%, transparent)" }}
                      title="Importar Excel com curiosidades"
                    >
                      {importingXlsx ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Importar
                    </button>
                    <input
                      ref={importFileRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleImportMissing}
                    />
                    <button onClick={loadMissing} className="inline-flex items-center gap-1 opacity-70 hover:opacity-100">
                      <RefreshCw size={10} /> Atualizar
                    </button>
                  </div>
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
                      <button
                        onClick={async () => {
                          const nameRaw = (m.artista || "").trim();
                          if (!nameRaw) return;
                          if (excecoes.some(x => x.termo.toLowerCase() === nameRaw.toLowerCase())) {
                            toast.info(`"${nameRaw}" já está nas exceções`);
                            setMissingRows(prev => prev.filter(x => `${x.artista}::${x.musica}`.toLowerCase() !== key));
                            return;
                          }
                          
                          setSavingExcecoes(true);
                          await supabase.from("infomusic_excecoes").insert({ user_id: user?.id, termo: nameRaw });
                          await loadExcecoes();
                          setSavingExcecoes(false);
                          
                          setMissingRows(prev => prev.filter(x => `${x.artista}::${x.musica}`.toLowerCase() !== key));
                          toast.success(`"${nameRaw}" adicionado às exceções`);
                        }}
                        title="Adicionar este artista à lista de exceções (não gera curiosidade)"
                        className="px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide inline-flex items-center gap-1.5 shrink-0 transition-opacity hover:opacity-90"
                        style={{
                          backgroundColor: "color-mix(in srgb, #dc2626 12%, transparent)",
                          color: "#dc2626",
                          border: "1px solid color-mix(in srgb, #dc2626 30%, transparent)",
                        }}
                      >
                        <Ban size={11} /> Exceção
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
                <thead className="sticky top-0 z-10" style={{
                  background: "linear-gradient(180deg, color-mix(in srgb, var(--layout-header-bg, #0d0446) 12%, var(--layout-page-bg, #fff)), color-mix(in srgb, var(--layout-header-bg, #0d0446) 6%, var(--layout-page-bg, #fff)))",
                  boxShadow: "0 1px 0 0 color-mix(in srgb, var(--layout-page-text, #1a1a1a) 12%, transparent)",
                }}>
                  <tr>
                    <th className="text-left px-3 py-2.5 font-black uppercase text-[10px] tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 82%, transparent)" }}>Artista</th>
                    <th className="text-left px-3 py-2.5 font-black uppercase text-[10px] tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 82%, transparent)" }}>Música</th>
                    <th className="text-left px-3 py-2.5 font-black uppercase text-[10px] tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 82%, transparent)" }}>Curiosidade</th>
                    <th className="text-left px-3 py-2.5 font-black uppercase text-[10px] tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 82%, transparent)" }}>Data/Hora</th>
                    <th className="text-center px-3 py-2.5 font-black uppercase text-[10px] tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 82%, transparent)" }}>Enviar</th>
                    <th className="text-center px-3 py-2.5 font-black uppercase text-[10px] tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 82%, transparent)" }}>Exceções</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r, i) => {
                    const isLastManual = r.id === lastManualId;
                    return (
                      <tr key={r.id} className="transition-colors hover:brightness-[0.98]" style={{ 
                        borderTop: i > 0 ? "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 7%, transparent)" : undefined,
                        backgroundColor: isLastManual
                          ? "rgba(var(--layout-accent-color-rgb, 37, 99, 235), 0.10)"
                          : (i % 2 === 1 ? "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)" : undefined),
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
                       <td className="px-3 py-2 align-top text-center">
                         {(() => {
                           const ex = excecoes.find(x => x.termo.toLowerCase() === r.artista.trim().toLowerCase());
                           const handleToggle = async () => {
                             const nameRaw = r.artista.trim();
                             if (!nameRaw) return;
                             if (ex) {
                               await removeExcecao(ex.id);
                             } else {
                               setNewExcecao(nameRaw);
                             }
                           };
                           return (
                             <div
                               className="inline-flex items-center justify-center"
                               title={ex ? "Remover da lista de exceções" : "Adicionar artista à lista de exceções"}
                             >
                               <Switch checked={!!ex} onCheckedChange={handleToggle} />
                             </div>
                           );
                         })()}
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

        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="w-1 h-5 rounded-full"
                style={{ backgroundColor: "#10b981" }}
              />
              <h4 className="text-sm font-black uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                Músicas com Curiosidades Cadastradas
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => importFileRef.current?.click()}
                disabled={importingXlsx}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "color-mix(in srgb, #16a34a 12%, transparent)", color: "#16a34a", border: "1px solid color-mix(in srgb, #16a34a 25%, transparent)" }}
              >
                {importingXlsx ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                Importar Excel
              </button>
              <button
                onClick={() => {
                  try {
                    const data = rows
                      .filter(r => r.curiosidade && r.curiosidade.trim())
                      .map(r => ({ ARTISTA: r.artista, MUSICA: r.musica, CURIOSIDADE: r.curiosidade }));
                    if (!data.length) { toast.info("Nenhuma curiosidade para exportar"); return; }
                    const ws = XLSX.utils.json_to_sheet(data);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Curiosidades");
                    XLSX.writeFile(wb, `curiosidades-${new Date().toISOString().slice(0, 10)}.xlsx`);
                    toast.success("Excel exportado com sucesso!");
                  } catch (e) {
                    toast.error("Erro ao exportar");
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-opacity hover:opacity-90"
                style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent)", color: "var(--layout-accent-color, #2563eb)", border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 25%, transparent)" }}
              >
                <Download size={12} />
                Exportar Excel
              </button>
            </div>
          </div>
          
          <div className="rounded-2xl overflow-hidden border border-black/10 bg-white/50 backdrop-blur-sm shadow-sm max-h-[400px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-[#00BFF0] text-white">
                <tr>
                  <th className="text-left px-4 py-3 font-bold uppercase tracking-wider">Artista</th>
                  <th className="text-left px-4 py-3 font-bold uppercase tracking-wider">Música</th>
                  <th className="text-left px-4 py-3 font-bold uppercase tracking-wider">Curiosidade</th>
                </tr>
              </thead>
              <tbody>
                {rows.filter(r => r.curiosidade && r.curiosidade.trim()).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center opacity-50 italic">
                      Nenhuma música cadastrada com curiosidade no usuário.
                    </td>
                  </tr>
                ) : (
                  rows
                    .filter(r => r.curiosidade && r.curiosidade.trim())
                    .map((r, i) => (
                      <tr key={r.id} className="border-t border-black/5 hover:bg-black/5 transition-colors">
                        <td className="px-4 py-3 font-semibold">{r.artista}</td>
                        <td className="px-4 py-3">{r.musica}</td>
                        <td className="px-4 py-3 opacity-80 leading-relaxed">{r.curiosidade}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
        </div>
      </div>

      <Dialog open={!!importSummary} onOpenChange={(o) => { if (!o) setImportSummary(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              Resumo da importação
            </DialogTitle>
          </DialogHeader>
          {importSummary && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <div className="text-2xl font-bold text-emerald-500">{importSummary.filled + importSummary.inserted}</div>
                  <div className="text-xs text-muted-foreground mt-1">Curiosidades preenchidas</div>
                  {(importSummary.overwritten > 0) && (
                    <div className="text-[10px] text-muted-foreground/70 mt-1">+ {importSummary.overwritten} sobrescrita(s)</div>
                  )}
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="text-2xl font-bold text-amber-500">{importSummary.notFound.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Não encontradas em Tocadas</div>
                </div>
              </div>

              {importSummary.notFound.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                    Músicas não encontradas
                  </div>
                  <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-muted/30">
                    <ul className="divide-y divide-border">
                      {importSummary.notFound.map((n, i) => (
                        <li key={i} className="px-3 py-2 text-xs">{n}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setImportSummary(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
