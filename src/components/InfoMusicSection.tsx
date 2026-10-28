import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Sparkles, Loader2, Trash2, RefreshCw, Ban, Save, Send, Music, Search, X, AlertTriangle, CheckCircle2, HelpCircle, Plus, Download, Upload, ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { invalidateMusicExceptionsCache } from "@/lib/musicExceptions";

interface InfoMusicRow {
  id: string;
  artista: string;
  musica: string;
  curiosidade: string;
  deezer_artist_img?: string;
  created_at: string;
  expires_at: string;
}

interface HistoryRow {
  id: string;
  artista: string;
  musica: string;
  created_at: string;
  dia: string;
  horario: string;
  curiosidade?: string;
}

const PAGE_SIZE = 50;
const HARD_CAP = 50;

const Highlight = ({ text, term }: { text: string; term: string }) => {
  if (!term.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${term})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === term.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 text-black px-0.5 rounded">
            {p}
          </mark>
        ) : (
          p
        )
      )}
    </>
  );
};

export default function InfoMusicSection({ music, effectiveUserId, curiosidade, setCuriosidade, manualCuriosityRef }: any) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false); // Forced closed by default per user request
  const [rows, setRows] = useState<InfoMusicRow[]>([]);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [testArtista, setTestArtista] = useState("");
  const [testMusica, setTestMusica] = useState("");
  const [testing, setTesting] = useState(false);
  const [excecoes, setExcecoes] = useState<any[]>([]);
  const [defaultCapaUrl, setDefaultCapaUrl] = useState<string | null>(null);
  const [defaultArtistaUrl, setDefaultArtistaUrl] = useState<string | null>(null);

  const [savingExcecoes, setSavingExcecoes] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [togglingAi, setTogglingAi] = useState(false);
  const [lastManualId, setLastManualId] = useState<string | null>(null);
  const [monthlyQuota, setMonthlyQuota] = useState({ count: 0, limit: 20 });
  const [fetchSpeed, setFetchSpeed] = useState(10); // Velocidade padrão: 10 requisições por minuto (1 a cada 6s)
  const lastFetchTimeRef = useRef<number>(0);
  const [nowPlaying, setNowPlaying] = useState<{ musica: string; artista: string; capa: string; curiosity?: string } | null>(null);
  const [lastTrackKey, setLastTrackKey] = useState<string>("");
  const [manualCuriosityText, setManualCuriosityText] = useState("");
  const [savingManualCuriosity, setSavingManualCuriosity] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const curiosityFetchKeyRef = useRef<string>("");
  const [xmlTelemetry, setXmlTelemetry] = useState<{ source: "manual" | "ai" | "none"; text: string; until?: string }>({ source: "none", text: "" });
  const [xmlCheck, setXmlCheck] = useState<{ status: "idle" | "checking" | "ok" | "diverge" | "error"; xmlText: string; checkedAt: number; error?: string }>({ status: "idle", xmlText: "", checkedAt: 0 });
  
  const [newExcecao, setNewExcecao] = useState("");
  const [newExcecaoCapa, setNewExcecaoCapa] = useState("");
  const [newExcecaoFundo, setNewExcecaoFundo] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ active: boolean; stage: string; percent: number }>({ active: false, stage: "", percent: 0 });
  const [editMusic, setEditMusic] = useState<any | null>(null);
  const [curiosidadeText, setCuriosidadeText] = useState("");
  const [search, setSearch] = useState("");
  const [filterField, setFilterField] = useState<"all" | "artista" | "musica" | "curiosidade" | "sem_curiosidade">("all");
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [importingXlsx, setImportingXlsx] = useState(false);
  const [importSummary, setImportSummary] = useState<{ filled: number; inserted: number; overwritten: number; notFound: string[] } | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [fetchingIds, setFetchingIds] = useState<string[]>([]);
  const isFetchingRef = useRef(false);
  const [allCuriosities, setAllCuriosities] = useState<InfoMusicRow[]>([]);
  const [loadingAllCuriosities, setLoadingAllCuriosities] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const importNoCuriosityRef = useRef<HTMLInputElement | null>(null);
  const [readingExcel, setReadingExcel] = useState(false);

  // Efeito para busca automática sequencial
  useEffect(() => {
    if (!aiEnabled || isFetchingRef.current || !user) return;
    
    // Controle de velocidade: verifica se passou tempo suficiente desde a última requisição
    const now = Date.now();
    const minInterval = (60 / fetchSpeed) * 1000;
    if (now - lastFetchTimeRef.current < minInterval) {
      const timer = setTimeout(() => {
        load(); // Trigger a re-render to re-run the effect
      }, minInterval - (now - lastFetchTimeRef.current));
      return () => clearTimeout(timer);
    }

    const exceptionsArray = [...excecoes.map(e => e.termo?.toLowerCase()).filter(Boolean), "break"];
    
    const noCuriosity = rows
      .filter(r => !r.curiosidade || !r.curiosidade.trim())
      .filter(r => !fetchingIds.includes(r.id))
      .filter(r => {
        const artistaLower = r.artista.toLowerCase();
        const musicaLower = r.musica.toLowerCase();
        return !exceptionsArray.some(exc => artistaLower.includes(exc) || musicaLower.includes(exc));
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (noCuriosity.length === 0) return;

    const target = noCuriosity[0];
    
    const fetchAiCuriosity = async () => {
      isFetchingRef.current = true;
      lastFetchTimeRef.current = Date.now();
      setFetchingIds(prev => [...prev, target.id]);
      
      try {
        const { data, error } = await supabase.functions.invoke("get-music-curiosity", {
          body: { artista: target.artista, musica: target.musica, userId: user.id }
        });

        if (error || !data?.curiosidade) {
          console.warn("Retorno inválido ou pulado pela função:", data);
          throw new Error(data?.reason || "Falha na busca");
        }

        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 6);

        const { error: updateError } = await supabase
          .from("infomusic")
          .update({ 
            curiosidade: data.curiosidade.trim(), 
            expires_at: expiresAt.toISOString() 
          })
          .eq("id", target.id);

        if (updateError) throw updateError;
        
        // Atualiza o estado local para mover a música de lista
        setRows(prev => prev.map(r => 
          r.id === target.id ? { ...r, curiosidade: data.curiosidade.trim() } : r
        ));
        
        // Atualiza a lista completa de curiosidades também
        setAllCuriosities(prev => [
          { ...target, curiosidade: data.curiosidade.trim() },
          ...prev
        ]);

        
      } catch (e) {
        if (e instanceof Error && e.message === "monthly_quota_exceeded") {
          setAiEnabled(false);
        } else if (e instanceof Error && e.message === "ai_disabled") {
          setAiEnabled(false);
        }
        console.error("Erro na busca automática:", e);
      } finally {
        setFetchingIds(prev => prev.filter(id => id !== target.id));
        isFetchingRef.current = false;
      }
    };

    fetchAiCuriosity();
  }, [aiEnabled, rows, fetchingIds, user, fetchSpeed]);


  const load = async (append = false) => {
    if (!user) return;
    if (!append) setLoading(true); else setLoadingMore(true);
    try {
      const { count } = await supabase.from("infomusic").select("*", { count: "exact", head: true }).eq("user_id", user.id);
      setTotalCount(count || 0);

      // 1) Fetch playback history - strictly the last 50 songs played on air
      const { data: historyData, error: historyError } = await supabase
        .from("musicas_tocadas")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (historyError) throw historyError;

      // 2) Fetch curiosity records to map to history
      const { data: infoData, error: infoError } = await supabase
        .from("infomusic")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1000); // Higher limit to ensure we match most recent history

      if (infoError) throw infoError;

      let currentRows = infoData || [];

      // 3) Auto-register any played song without curiosity into infomusic
      const missingToInsert: { user_id: string; artista: string; musica: string; curiosidade: string }[] = [];
      const existingKeys = new Set(
        currentRows.map(r => `${r.artista.trim().toLowerCase()}::${r.musica.trim().toLowerCase()}`)
      );

      (historyData || []).forEach(h => {
        const artista = (h.artista || "").trim();
        const musica = (h.musica || "").trim();
        if (!artista || !musica) return;
        const key = `${artista.toLowerCase()}::${musica.toLowerCase()}`;
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          missingToInsert.push({
            user_id: user.id,
            artista,
            musica,
            curiosidade: ""
          });
        }
      });

      if (missingToInsert.length > 0) {
        try {
          const { data: insertedRows, error: insertErr } = await supabase
            .from("infomusic")
            .insert(missingToInsert)
            .select("*");
          if (!insertErr && insertedRows) {
            currentRows = [...insertedRows, ...currentRows];
          }
        } catch (insertErr) {
          console.warn("[InfoMusic] Non-critical insert error:", insertErr);
        }
      }

      setRows(currentRows);

      const historyWithCuriosities = (historyData || []).map(h => {
        const match = currentRows.find(i => 
          i.artista.toLowerCase() === h.artista.toLowerCase() && 
          i.musica.toLowerCase() === h.musica.toLowerCase()
        );
        return {
          ...h,
          curiosidade: match?.curiosidade || ""
        };
      });

      setHistoryRows(historyWithCuriosities);
    } catch (e) {
      console.warn("[InfoMusic] Failed to load rows from Supabase:", e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadExcecoes = async () => {
    if (!user) return;
    setLoadingAllCuriosities(true);
    const [settingsRes, exceptionsRes, curiositiesRes] = await Promise.all([
      supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("infomusic_excecoes").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase
        .from("infomusic")
        .select("*", { count: 'exact' })
        .eq("user_id", user.id)
        .not("curiosidade", "is", null)
        .neq("curiosidade", "")
        .order("created_at", { ascending: false })
        .limit(5000)
    ]);
    const exceptions = exceptionsRes.data || [];
    setExcecoes(exceptions);
    setAllCuriosities(curiositiesRes.data || []);
    setLoadingAllCuriosities(false);

    const data = settingsRes.data as any;
    setDefaultCapaUrl(data?.infomusic_excecoes_capa_url || null);
    setDefaultArtistaUrl(data?.infomusic_excecoes_artista_url || null);
    setAiEnabled(data?.infomusic_ai_enabled !== false);

    setMonthlyQuota(prev => ({ ...prev, count: data?.infomusic_ai_monthly_count || 0 }));
    setLastManualId(data?.last_manual_curiosity_id || null);
    
    const di = data?.dashboard_items as any;
    if (di?.music_current_title || di?.music_current_artist) {
      setNowPlaying({
        musica: di.music_current_title || "Sem título",
        artista: di.music_current_artist || "Desconhecido",
        capa: di.music_current_cover || "",
        curiosity: di.music_current_curiosity || "",
      });
    }
  };

  /** Faz upload de uma imagem e devolve a URL pública */
  const uploadExcecaoImage = async (file: File, prefix: string): Promise<string | null> => {
    if (!user) return null;
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${user.id}/${prefix}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("xml-files").upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from("xml-files").getPublicUrl(path);
    return data.publicUrl;
  };

  const pickImage = (onPick: (file: File) => void) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) onPick(file);
    };
    input.click();
  };

  /** Salva a imagem geral da lista de EXCEÇÕES (vale para todos os termos sem imagem própria) */
  const saveDefaultExcecaoImage = async (kind: "capa" | "artista", file: File) => {
    if (!user) return;
    try {
      const url = await uploadExcecaoImage(file, `excecao-geral-${kind}`);
      if (!url) return;
      const column = kind === "capa" ? "infomusic_excecoes_capa_url" : "infomusic_excecoes_artista_url";
      const { error } = await supabase
        .from("user_settings")
        .upsert({ user_id: user.id, [column]: url } as any, { onConflict: "user_id" });
      if (error) throw error;
      if (kind === "capa") setDefaultCapaUrl(url); else setDefaultArtistaUrl(url);
      try {
        invalidateMusicExceptionsCache(user.id);
      } catch {}
      toast.success(kind === "capa" ? "Capa geral das exceções salva!" : "Foto geral do artista salva!");
    } catch (e) {
      console.error(e);
      toast.error("Erro no upload da imagem geral");
    }
  };

  const clearDefaultExcecaoImage = async (kind: "capa" | "artista") => {
    if (!user) return;
    const column = kind === "capa" ? "infomusic_excecoes_capa_url" : "infomusic_excecoes_artista_url";
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: user.id, [column]: null } as any, { onConflict: "user_id" });
    if (error) { toast.error("Erro ao remover imagem"); return; }
    if (kind === "capa") setDefaultCapaUrl(null); else setDefaultArtistaUrl(null);
    try {
      invalidateMusicExceptionsCache(user.id);
    } catch {}
    toast.success("Imagem geral removida");
  };



  useEffect(() => {
    if (music?.titulo || music?.artista) {
      setNowPlaying((prev) => {
        const isSameTrack = prev?.musica === (music.titulo || "Sem título") && prev?.artista === (music.artista || "Desconhecido");
        return {
          musica: music.titulo || prev?.musica || "Sem título",
          artista: music.artista || prev?.artista || "Desconhecido",
          capa: music.capa || (isSameTrack ? (prev?.capa || "") : ""),
          curiosity: curiosidade || (isSameTrack ? (prev?.curiosity || "") : ""),
        };
      });
      load();
    }
  }, [music?.titulo, music?.artista, music?.capa, curiosidade]);

  useEffect(() => {
    load();
    loadExcecoes();

    if (!user) return;

    // Listen for real-time updates to user_settings to update "Now Playing" and "Last Played"
    const channel = supabase
      .channel(`info-music-sync-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_settings',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const di = (payload.new as any).dashboard_items;
          if (di?.music_current_title || di?.music_current_artist) {
            setNowPlaying({
              musica: di.music_current_title || "Sem título",
              artista: di.music_current_artist || "Desconhecido",
              capa: di.music_current_cover || "",
              curiosity: di.music_current_curiosity || "",
            });
            // Also reload the rows list to get the latest 100 songs
            load();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const filteredHistoryRows = useMemo(() => {
    let list = historyRows;
    if (filterField === "sem_curiosidade") {
      list = list.filter(r => !r.curiosidade || !r.curiosidade.trim());
    } else if (filterField === "artista") {
      list = list.filter(r => r.curiosidade && r.curiosidade.trim());
    }
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter(r => 
      r.artista.toLowerCase().includes(s) || 
      r.musica.toLowerCase().includes(s) || 
      (r.curiosidade || "").toLowerCase().includes(s)
    );
  }, [historyRows, search, filterField]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (filterField === "sem_curiosidade") {
      list = list.filter(r => !r.curiosidade || !r.curiosidade.trim());
    } else if (filterField === "artista") {
      list = list.filter(r => r.curiosidade && r.curiosidade.trim());
    }
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter(r => 
      r.artista.toLowerCase().includes(s) || 
      r.musica.toLowerCase().includes(s) || 
      (r.curiosidade || "").toLowerCase().includes(s)
    );
  }, [rows, search, filterField]);

  const handleSaveCuriosity = async () => {
    if (!editMusic || !curiosidadeText.trim() || !user) return;
    try {
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 6);
      
      const { error } = await supabase
        .from("infomusic")
        .update({ curiosidade: curiosidadeText.trim(), expires_at: expiresAt.toISOString() })
        .eq("id", editMusic.id);
      
      if (error) throw error;
      toast.success("Curiosidade salva!");
      setEditMusic(null);
      setCuriosidadeText("");
      await Promise.all([load(), loadExcecoes()]);

    } catch (e) {
      toast.error("Erro ao salvar");
    }
  };

  const exportSemCuriosidadesExcel = async () => {
    try {
      setExportingXlsx(true);
      const semCuriosidade = rows.filter(r => !r.curiosidade || !r.curiosidade.trim());
      
      const data = semCuriosidade.map(r => ({
        "ARTISTA": r.artista,
        "MUSICA": r.musica,
        "CURIOSIDADE": ""
      }));

      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sem Curiosidades");
      XLSX.writeFile(wb, "musicas_sem_curiosidades.xlsx");
      toast.success("Excel exportado com sucesso!");
    } catch (e) {
      toast.error("Erro ao exportar Excel");
    } finally {
      setExportingXlsx(false);
    }
  };

  const handleImportExcelNoCuriosity = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      setReadingExcel(true);
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const bstr = evt.target?.result;
          const XLSX = await import("xlsx");
          const wb = XLSX.read(bstr, { type: "binary" });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws) as any[];

          let processed = 0;
          for (const item of data) {
            const artista = item.ARTISTA || item.Artista || item.artista || item["ARTISTA"];
            const musica = item.MUSICA || item.Musica || item.musica || item["MUSICA"];
            const curiosidade = item.CURIOSIDADE || item.Curiosidade || item.curiosidade || item["CURIOSIDADE"];

            if (artista && musica && curiosidade && String(curiosidade).trim()) {
              const expiresAt = new Date();
              expiresAt.setMonth(expiresAt.getMonth() + 6);

              const { data: existing, error: findError } = await supabase
                .from("infomusic")
                .select("id")
                .eq("user_id", user.id)
                .ilike("artista", String(artista).trim())
                .ilike("musica", String(musica).trim())
                .maybeSingle();

              if (findError) {
                console.error("Error finding record:", findError);
                continue;
              }

              if (existing) {
                const { error: updateError } = await supabase
                  .from("infomusic")
                  .update({ 
                    curiosidade: String(curiosidade).trim(), 
                    expires_at: expiresAt.toISOString() 
                  })
                  .eq("id", existing.id);

                if (!updateError) processed++;
                else console.error("Update error:", updateError);
              } else {
                const { error: insertError } = await supabase
                  .from("infomusic")
                  .insert({
                    user_id: user.id,
                    artista: String(artista).trim(),
                    musica: String(musica).trim(),
                    curiosidade: String(curiosidade).trim(),
                    expires_at: expiresAt.toISOString()
                  });

                if (!insertError) processed++;
                else console.error("Insert error:", insertError);
              }
            }
          }

          if (processed > 0) {
            toast.success(`${processed} curiosidades importadas com sucesso!`);
            load();
            loadExcecoes();
          } else {
            toast.info("Nenhuma curiosidade válida encontrada para importar.");
          }
        } catch (err) {
          toast.error("Erro ao processar arquivo Excel");
        } finally {
          setReadingExcel(false);
          if (importNoCuriosityRef.current) importNoCuriosityRef.current.value = "";
        }
      };
      reader.readAsBinaryString(file);
    } catch (err) {
      toast.error("Erro ao ler arquivo");
      setReadingExcel(false);
    }
  };

  return (
    <div
      className="relative space-y-5 rounded-3xl p-6 transition-all"
      style={{
        backgroundColor: "#ffffff",
        border: "1px solid rgba(226, 232, 240, 0.9)",
        boxShadow: "0 4px 24px rgba(0, 0, 0, 0.03)",
      }}
    >
      <div 
        className="flex items-center justify-between mb-2 cursor-pointer group" 
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 bg-[#0055ff] rounded-full" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-blue-50">
                <Music size={18} style={{ color: "#0055ff" }} />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tighter" style={{ color: "#002132" }}>
                INFO MUSIC
              </h3>
            </div>
          <div className="ml-2 transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {isOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-black/40 hover:text-black/70 hover:bg-black/5"
              onClick={() => setIsOpen(false)}
            >
              <X size={16} />
            </Button>
          )}
        </div>
      </div>

      {isOpen && (
        <>

      {/* No Ar Agora em destaque no topo */}
      {nowPlaying && (
        <div className="p-4 rounded-2xl bg-[#0055ff]/5 border border-[#0055ff]/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative group">
              {nowPlaying.capa ? (
                <img src={nowPlaying.capa} className="w-16 h-16 rounded-lg object-cover shadow-lg" alt="Capa" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center">
                  <Music className="text-gray-400" size={24} />
                </div>
              )}
              <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">NO AR</div>
            </div>
            <div className="min-w-0">
              <h4 className="text-[10px] font-bold uppercase text-[#0055ff] tracking-widest mb-1">Tocando Agora</h4>
              <div className="font-black text-lg truncate leading-tight" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{nowPlaying.musica}</div>
              <div className="text-sm opacity-70 truncate font-medium">{nowPlaying.artista}</div>
            </div>
          </div>
          {nowPlaying.curiosity && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="hidden md:block flex-1 max-w-xl bg-white/40 p-3 rounded-lg border border-white/60 italic text-xs leading-relaxed opacity-90 shadow-sm line-clamp-2 cursor-pointer">
                    <Sparkles size={14} className="text-[#0055ff] mb-1 inline mr-2" />
                    "{nowPlaying.curiosity}"
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-md p-3 text-xs leading-relaxed bg-[#0A2540] text-white border-none shadow-xl z-50">
                  <div className="flex items-start gap-2">
                    <Sparkles size={14} className="text-[#0055ff] mt-0.5 shrink-0" />
                    <span>{nowPlaying.curiosity}</span>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-amber-500 hover:bg-amber-100 hover:text-amber-600 border border-amber-200"
              onClick={async () => {
                if (!user || !nowPlaying) return;
                try {
                  const { error } = await supabase.from("infomusic_excecoes").upsert({
                    user_id: user.id,
                    termo: nowPlaying.artista
                  }, { onConflict: 'user_id,termo' });
                  
                  if (error) throw error;
                  
                  // Invalidação de cache global
                  try {
                    invalidateMusicExceptionsCache(user.id);
                  } catch (e) {
                    console.warn("Could not invalidate music exceptions cache", e);
                  }

                  loadExcecoes();
                  toast.success(`"${nowPlaying.artista}" inserido na lista de EXCEÇÕES`);
                } catch (e: any) {
                  console.error("Erro ao adicionar exceção:", e);
                  if (e.code === '23505') {
                    toast.error(`"${nowPlaying.artista}" já está na lista de exceções`);
                  } else {
                    toast.error("Erro ao adicionar exceção");
                  }
                }
              }}
            >
              <Ban size={16} className="mr-2" />
              inserir essa música na lista de EXCEÇÕES
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {/* Coluna 1: ULTIMAS TOCADAS */}
        <div className="space-y-3 flex flex-col h-[500px]">
          <div className="flex items-center justify-between flex-shrink-0 h-10">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-[#0055ff] rounded-full" />
              <h4 className="text-xs font-black uppercase tracking-wider">Últimas Tocadas ({filteredHistoryRows.length})</h4>
            </div>
          </div>
          <div style={{ overflowX: "auto", borderRadius: 16, border: "1px solid rgba(226, 232, 240, 0.9)", flex: 1, backgroundColor: "rgba(255, 255, 255, 0.5)" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#0055ff", color: "#FFFFFF" }}>
                  <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", fontSize: 10, whiteSpace: "nowrap" }}>Data / Hora</th>
                  <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", fontSize: 10, whiteSpace: "nowrap" }}>Música / Artista</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistoryRows.map((r, idx) => (
                  <tr 
                    key={r.id} 
                    className="group relative"
                    style={{ 
                      background: r.curiosidade ? "rgba(16,185,129,0.08)" : (idx % 2 === 0 ? "transparent" : "#F7FCFE"),
                      color: "#0A2540"
                    }}
                  >
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap", opacity: 0.7, fontWeight: 500 }}>
                      <div className="flex flex-col">
                        <span className="text-[10px]">{new Date(r.created_at).toLocaleDateString("pt-BR")}</span>
                        <span>{new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{r.musica}</div>
                          <div style={{ opacity: 0.6, fontSize: 11 }}>{r.artista}</div>
                          {r.curiosidade && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="mt-1 text-[10px] italic line-clamp-2 cursor-pointer" style={{ color: "#059669" }}>
                                    {r.curiosidade}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs p-2 text-xs bg-[#0A2540] text-white border-none shadow-lg z-50">
                                  {r.curiosidade}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity z-20">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-7 w-7 text-amber-500 hover:bg-amber-100 bg-white/80 shadow-sm border border-amber-200"
                            title="INSERIR O REGISTRO NA LISTA DE EXCEÇÕES"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!user) return;
                              try {
                                const { error } = await supabase.from("infomusic_excecoes").upsert({
                                  user_id: user.id,
                                  termo: r.artista
                                }, { onConflict: 'user_id,termo' });
                                
                                if (error) throw error;

                                try {
                                  invalidateMusicExceptionsCache(user.id);
                                } catch (e) {
                                  console.warn("Could not invalidate music exceptions cache", e);
                                }

                                loadExcecoes();
                                toast.success(`"${r.artista}" adicionado às exceções`);
                              } catch (e: any) {
                                console.error("Erro ao adicionar exceção:", e);
                                if (e.code === '23505') {
                                  toast.error(`"${r.artista}" já está na lista de exceções`);
                                } else {
                                  toast.error("Erro ao adicionar exceção");
                                }
                              }
                            }}
                          >
                            <Ban size={14} />
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredHistoryRows.length === 0 && (
                  <tr>
                    <td colSpan={2} style={{ padding: "40px 0", textAlign: "center", opacity: 0.4, fontStyle: "italic" }}>Nenhum registro encontrado</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coluna 2: EXCEÇÕES */}
        <div className="space-y-3 flex flex-col h-[500px]">
          <div className="flex items-center justify-between flex-shrink-0 h-10">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-amber-500 rounded-full" />
              <h4 className="text-xs font-black uppercase tracking-wider">EXCEÇÕES ({excecoes.length})</h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-wider text-gray-400">Imagens gerais</span>
              {/* Capa geral da lista */}
              <div className="flex items-center gap-1">
                {defaultCapaUrl ? (
                  <button
                    type="button"
                    title="Capa geral da lista (clique para trocar)"
                    onClick={() => pickImage((f) => void saveDefaultExcecaoImage("capa", f))}
                    className="relative h-7 w-7 rounded-md overflow-hidden border-2 border-amber-300 shadow-sm"
                  >
                    <img src={defaultCapaUrl} alt="Capa geral das exceções" className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-6 w-6 text-amber-600 border-amber-200 hover:bg-amber-50 rounded-full bg-white/50"
                    title="Cadastrar capa geral (vale para toda a lista de exceções)"
                    onClick={() => pickImage((f) => void saveDefaultExcecaoImage("capa", f))}
                  >
                    <ImagePlus size={10} />
                  </Button>
                )}
                {defaultCapaUrl && (
                  <button
                    type="button"
                    className="text-gray-300 hover:text-red-500"
                    title="Remover capa geral"
                    onClick={() => void clearDefaultExcecaoImage("capa")}
                  >
                    <X size={10} />
                  </button>
                )}
              </div>

              {/* Artista geral da lista */}
              <div className="flex items-center gap-1">
                {defaultArtistaUrl ? (
                  <button
                    type="button"
                    title="Foto geral do artista (clique para trocar)"
                    onClick={() => pickImage((f) => void saveDefaultExcecaoImage("artista", f))}
                    className="relative h-7 w-7 rounded-md overflow-hidden border-2 border-blue-300 shadow-sm"
                  >
                    <img src={defaultArtistaUrl} alt="Artista geral das exceções" className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-6 w-6 text-blue-600 border-blue-200 hover:bg-blue-50 rounded-full bg-white/50"
                    title="Cadastrar foto de artista geral (vale para toda a lista de exceções)"
                    onClick={() => pickImage((f) => void saveDefaultExcecaoImage("artista", f))}
                  >
                    <Plus size={10} />
                  </Button>
                )}
                {defaultArtistaUrl && (
                  <button
                    type="button"
                    className="text-gray-300 hover:text-red-500"
                    title="Remover foto geral do artista"
                    onClick={() => void clearDefaultExcecaoImage("artista")}
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={{ overflowX: "auto", borderRadius: 16, border: "1px solid #E5F5FB", flex: 1, backgroundColor: "rgba(255, 255, 255, 0.3)" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F59E0B", color: "#FFFFFF" }}>
                  <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", fontSize: 10, whiteSpace: "nowrap" }}>Termo</th>
                  <th style={{ padding: "12px 14px", textAlign: "center", fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", fontSize: 10, whiteSpace: "nowrap", width: 60 }}>Imagens</th>
                  <th style={{ padding: "12px 14px", textAlign: "center", fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", fontSize: 10, whiteSpace: "nowrap", width: 60 }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {excecoes.map((exc, idx) => (
                  <tr 
                    key={exc.id} 
                    style={{ 
                      background: idx % 2 === 0 ? "transparent" : "rgba(245, 158, 11, 0.03)",
                      color: "#0A2540"
                    }}
                  >
                    <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: 13 }}>{exc.termo}</td>
                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      {(() => {
                        const ownCapa = exc.capa_url || null;
                        const ownArtista = (exc as any).artista_url || null;
                        const effCapa = ownCapa || defaultCapaUrl;
                        const effArtista = ownArtista || defaultArtistaUrl;
                        const saveOwn = async (kind: "capa" | "artista", file: File) => {
                          try {
                            const url = await uploadExcecaoImage(file, `excecao-${kind}-${exc.id}`);
                            if (!url) return;
                            const column = kind === "capa" ? "capa_url" : "artista_url";
                            const { data, error } = await supabase
                              .from("infomusic_excecoes")
                              .update({ [column]: url } as any)
                              .eq("id", exc.id)
                              .eq("user_id", user?.id)
                              .select("id")
                              .maybeSingle();
                            if (error) throw error;
                            if (!data?.id) throw new Error("O banco não confirmou a atualização da imagem.");
                            invalidateMusicExceptionsCache(user?.id);
                            loadExcecoes();
                            toast.success(kind === "capa" ? "Capa específica atualizada!" : "Foto específica do artista atualizada!");
                          } catch {
                            toast.error("Erro no upload");
                          }
                        };
                        const clearOwn = async (kind: "capa" | "artista") => {
                          const column = kind === "capa" ? "capa_url" : "artista_url";
                          const { data, error } = await supabase
                            .from("infomusic_excecoes")
                            .update({ [column]: null } as any)
                            .eq("id", exc.id)
                            .eq("user_id", user?.id)
                            .select("id")
                            .maybeSingle();
                          if (error || !data?.id) { toast.error(error?.message || "O banco não confirmou a remoção."); return; }
                          invalidateMusicExceptionsCache(user?.id);
                          loadExcecoes();
                          toast.success("Voltou a usar a imagem geral da lista");
                        };
                        const Slot = ({ kind, own, eff, color }: { kind: "capa" | "artista"; own: string | null; eff: string | null; color: string }) => (
                          <div className="flex flex-col items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => pickImage((f) => void saveOwn(kind, f))}
                              title={own
                                ? `Imagem específica desta ${kind === "capa" ? "capa" : "foto de artista"} (clique para trocar)`
                                : eff
                                  ? "Usando a imagem geral da lista (clique para cadastrar uma específica)"
                                  : `Cadastrar ${kind === "capa" ? "capa" : "foto do artista"}`}
                              className="relative h-8 w-8 rounded-md overflow-hidden border-2 flex items-center justify-center bg-white/70"
                              style={{ borderColor: own ? color : eff ? `${color}55` : "#E5E7EB", opacity: own ? 1 : eff ? 0.75 : 1 }}
                            >
                              {eff ? (
                                <img src={eff} alt="" className="h-full w-full object-cover" />
                              ) : kind === "capa" ? (
                                <ImagePlus size={12} className="text-gray-400" />
                              ) : (
                                <Plus size={12} className="text-gray-400" />
                              )}
                            </button>
                            {own ? (
                              <button
                                type="button"
                                className="text-[8px] font-black uppercase text-gray-300 hover:text-red-500"
                                onClick={() => void clearOwn(kind)}
                                title="Remover imagem específica e voltar à imagem geral"
                              >
                                própria ✕
                              </button>
                            ) : (
                              <span className="text-[8px] font-black uppercase text-gray-300">{eff ? "geral" : "—"}</span>
                            )}
                          </div>
                        );
                        return (
                          <div className="flex items-start justify-center gap-2">
                            <Slot kind="capa" own={ownCapa} eff={effCapa} color="#F59E0B" />
                            <Slot kind="artista" own={ownArtista} eff={effArtista} color="#3B82F6" />
                          </div>
                        );
                      })()}
                    </td>

                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50" 
                        onClick={async () => {
                          try {
                            const { data, error } = await supabase.from("infomusic_excecoes")
                              .delete().eq("id", exc.id).eq("user_id", user?.id).select("id").maybeSingle();
                            if (error) throw error;
                            if (!data?.id) throw new Error("O banco não confirmou a exclusão da exceção.");
                            loadExcecoes();
                            toast.success("Exceção removida");
                          } catch (e) {
                            toast.error("Erro ao remover");
                          }
                        }}
                      >
                        <X size={12} />
                      </Button>
                    </td>
                  </tr>
                ))}
                {excecoes.length === 0 && (
                  <tr>
                    <td colSpan={2} style={{ padding: "40px 0", textAlign: "center", opacity: 0.4, fontStyle: "italic" }}>Nenhuma exceção</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coluna 3: MUSICAS SEM CURIOSIDADES */}
        <div className="space-y-3 flex flex-col h-[500px]">
          <div className="flex items-center justify-between flex-shrink-0 h-10">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-red-500 rounded-full" />
              <h4 className="text-xs font-black uppercase tracking-wider">MUSICAS SEM CURIOSIDADES ({rows.filter(r => !r.curiosidade || !r.curiosidade.trim()).length})</h4>
              <div className="flex gap-1 ml-auto">
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".xlsx,.xls" 
                  ref={importNoCuriosityRef}
                  onChange={handleImportExcelNoCuriosity}
                />
                <Button 
                  size="icon" 
                  variant="outline" 
                  className="h-6 w-6 text-emerald-600 border-emerald-200 hover:bg-emerald-50 rounded-full bg-white/50"
                  title="Exportar musicas sem curiosidades para Excel"
                  onClick={(e) => {
                    e.stopPropagation();
                    exportSemCuriosidadesExcel();
                  }}
                  disabled={exportingXlsx}
                >
                  {exportingXlsx ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                </Button>
                <Button 
                  size="icon" 
                  variant="outline" 
                  className="h-6 w-6 text-[#00BFF0] border-[#00BFF0]/20 hover:bg-[#00BFF0]/5 rounded-full bg-white/50"
                  title="Importar curiosidades de Excel"
                  onClick={(e) => {
                    e.stopPropagation();
                    importNoCuriosityRef.current?.click();
                  }}
                  disabled={readingExcel}
                >
                  {readingExcel ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
                </Button>
              </div>
            </div>
          </div>
          <div style={{ overflowX: "auto", borderRadius: 16, border: "1px solid #E5F5FB", flex: 1, backgroundColor: "rgba(255, 255, 255, 0.3)" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#EF4444", color: "#FFFFFF" }}>
                  <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", fontSize: 10, whiteSpace: "nowrap" }}>Música / Artista</th>
                  <th style={{ padding: "12px 14px", textAlign: "center", fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", fontSize: 10, whiteSpace: "nowrap", width: 80 }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {rows.filter(r => !r.curiosidade || !r.curiosidade.trim()).map((r, idx) => (
                  <tr 
                    key={r.id} 
                    style={{ 
                      background: idx % 2 === 0 ? "transparent" : "rgba(239, 68, 68, 0.03)",
                      color: "#0A2540"
                    }}
                  >
                    <td style={{ padding: "12px 14px" }}>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{r.musica}</div>
                          <div style={{ opacity: 0.6, fontSize: 11 }}>{r.artista}</div>
                        </div>
                        {fetchingIds.includes(r.id) && (
                          <div className="flex items-center gap-1 text-[8px] text-red-400 animate-pulse font-bold bg-red-50 px-1 rounded border border-red-100">
                            <Loader2 size={8} className="animate-spin" />
                            BUSCANDO...
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-7 text-[9px] font-bold border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1"
                        onClick={() => {
                          setEditMusic(r);
                          setCuriosidadeText("");
                        }}
                      >
                        <Plus size={10} />
                        ESCREVER
                      </Button>
                    </td>
                  </tr>
                ))}
                {rows.filter(r => !r.curiosidade || !r.curiosidade.trim()).length === 0 && (
                  <tr>
                    <td colSpan={2} style={{ padding: "40px 0", textAlign: "center", opacity: 0.4, fontStyle: "italic" }}>Tudo em dia!</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>


      {/* Seção inferior: MÚSICAS COM CURIOSIDADES CADASTRADAS */}
      <div className="space-y-3 flex flex-col mt-6 w-full col-span-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-emerald-500 rounded-full" />
            <h4 className="text-xs font-black uppercase tracking-wider">CURIOSIDADES CADASTRADAS ({allCuriosities.length})</h4>
          </div>
          {loadingAllCuriosities && <Loader2 size={14} className="animate-spin text-emerald-500" />}
        </div>
        <div style={{ maxHeight: "400px", overflowY: "auto", borderRadius: 16, border: "1px solid rgba(226, 232, 240, 0.9)" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
            <thead className="sticky top-0 z-10">
              <tr style={{ background: "#0055ff", color: "#FFFFFF" }}>
                {["Data", "Hora", "Música / Artista", "Curiosidade", "Ação"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 14px",
                      textAlign: h === "Ação" ? "center" : "left",
                      fontWeight: 800,
                      letterSpacing: 1.2,
                      textTransform: "uppercase",
                      fontSize: 10,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allCuriosities.length > 0 ? allCuriosities.map((r, idx) => (
                <tr 
                  key={r.id} 
                  style={{ 
                    background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC",
                    color: "#002132"
                  }}
                >
                  <td style={{ padding: "12px 14px", whiteSpace: "nowrap", opacity: 0.7, fontWeight: 500 }}>
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td style={{ padding: "12px 14px", whiteSpace: "nowrap", opacity: 0.7, fontWeight: 500 }}>
                    {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{r.musica}</div>
                    <div style={{ opacity: 0.6, fontSize: 11 }}>{r.artista}</div>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div className="line-clamp-2 italic" style={{ color: "#0055ff", fontSize: 11 }}>
                      {r.curiosidade}
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "center" }}>
                    <div className="flex items-center justify-center gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-7 px-2 text-[10px] font-bold text-[#0055ff] hover:bg-blue-50 border border-[#0055ff]/20"
                        onClick={async () => {
                          if (!user) return;
                          try {
                            const { error } = await supabase.from("user_settings").update({
                              dashboard_items: {
                                ...nowPlaying,
                                music_current_curiosity: r.curiosidade
                              } as any
                            }).eq("user_id", user.id);
                            
                            if (error) throw error;
                            toast.success("Curiosidade enviada ao XML!");
                          } catch (e) {
                            toast.error("Erro ao enviar");
                          }
                        }}
                      >
                        <Send size={12} className="mr-1" />
                        ENVIAR AGORA
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-7 w-7 p-0 text-[#00BFF0] hover:bg-cyan-50"
                        onClick={() => {
                          setEditMusic(r);
                          setCuriosidadeText(r.curiosidade);
                        }}
                      >
                        <Plus size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} style={{ padding: "40px 0", textAlign: "center", opacity: 0.4, fontStyle: "italic" }}>
                    Nenhuma curiosidade cadastrada
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Modal de Edição */}
      <Dialog open={!!editMusic} onOpenChange={() => setEditMusic(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar Curiosidade</DialogTitle>
          </DialogHeader>
          {editMusic && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-black/5">
                <div className="text-sm font-bold">{editMusic.musica}</div>
                <div className="text-xs opacity-70">{editMusic.artista}</div>
              </div>
              <textarea
                className="w-full h-32 p-3 text-sm border rounded-lg resize-none"
                placeholder="Digite a curiosidade aqui..."
                value={curiosidadeText}
                onChange={e => setCuriosidadeText(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditMusic(null)}>Cancelar</Button>
            <Button onClick={handleSaveCuriosity} disabled={!curiosidadeText.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  );
}
