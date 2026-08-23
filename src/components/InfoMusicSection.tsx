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
          toast.error("Cota mensal de IA atingida (20/mês).");
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

      const query = supabase
        .from("infomusic")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      const { data, error } = await query;
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      toast.error("Erro ao carregar dados");
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

    const data = settingsRes.data;
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

  const exportSemCuriosidadesExcel = () => {
    try {
      setExportingXlsx(true);
      const semCuriosidade = rows.filter(r => !r.curiosidade || !r.curiosidade.trim());
      
      const data = semCuriosidade.map(r => ({
        "ARTISTA": r.artista,
        "MUSICA": r.musica,
        "CURIOSIDADE": ""
      }));

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
          const wb = XLSX.read(bstr, { type: "binary" });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws) as any[];

          let processed = 0;
          for (const item of data) {
            const artista = item.ARTISTA || item.Artista || item.artista;
            const musica = item.MUSICA || item.Musica || item.musica;
            const curiosidade = item.CURIOSIDADE || item.Curiosidade || item.curiosidade;

            if (artista && musica && curiosidade && String(curiosidade).trim()) {
              const expiresAt = new Date();
              expiresAt.setMonth(expiresAt.getMonth() + 6);

              // Update in DB
              const { error } = await supabase
                .from("infomusic")
                .update({ 
                  curiosidade: String(curiosidade).trim(), 
                  expires_at: expiresAt.toISOString() 
                })
                .eq("user_id", user.id)
                .ilike("artista", artista.trim())
                .ilike("musica", musica.trim());

              if (!error) processed++;
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
    <div className="relative space-y-5 rounded-2xl p-5" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 88%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 14%, transparent)" }}>
      <div 
        className="flex items-center justify-between mb-2 cursor-pointer group" 
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 bg-[#00BFF0] rounded-full" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-cyan-50">
                <Music size={18} style={{ color: "#00BFF0" }} />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tighter" style={{ color: "#00BFF0" }}>
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
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => load()} 
            disabled={loading}
            className="rounded-full bg-white/50 border-black/5 hover:bg-white shadow-sm"
          >
            <RefreshCw size={14} className={loading ? "animate-spin mr-2" : "mr-2"} />
            Atualizar
          </Button>
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
        <div className="p-4 rounded-xl bg-[#00BFF0]/10 border border-[#00BFF0]/20 flex items-center justify-between gap-4">
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
              <h4 className="text-[10px] font-bold uppercase text-[#00BFF0] tracking-widest mb-1">Tocando Agora</h4>
              <div className="font-black text-lg truncate leading-tight" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{nowPlaying.musica}</div>
              <div className="text-sm opacity-70 truncate font-medium">{nowPlaying.artista}</div>
            </div>
          </div>
          {nowPlaying.curiosity && (
            <div className="hidden md:block flex-1 max-w-xl bg-white/40 p-3 rounded-lg border border-white/60 italic text-xs leading-relaxed opacity-90 shadow-sm">
              <Sparkles size={14} className="text-[#00BFF0] mb-1 inline mr-2" />
              "{nowPlaying.curiosity}"
            </div>
          )}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-amber-500 hover:bg-amber-100 hover:text-amber-600 border border-amber-200"
              onClick={async () => {
                if (!user || !nowPlaying) return;
                try {
                  const { error } = await supabase.from("infomusic_excecoes").insert({
                    user_id: user.id,
                    termo: nowPlaying.artista
                  });
                  if (error) throw error;
                  loadExcecoes();
                  toast.success(`"${nowPlaying.artista}" inserido na lista de EXCEÇÕES`);
                } catch (e) {
                  toast.error("Erro ao adicionar exceção");
                }
              }}
            >
              <Ban size={16} className="mr-2" />
              inserir essa musica na lista de EXCEÇÕES
            </Button>

            <Button 
              variant="ghost" 
              size="sm" 
              className="text-[#00BFF0] hover:bg-[#00BFF0]/10"
              onClick={() => {
                setEditMusic({ musica: nowPlaying.musica, artista: nowPlaying.artista, id: "now-playing" });
                setCuriosidadeText(nowPlaying.curiosity || "");
              }}
            >
              <Plus size={16} className="mr-2" />
              CADASTRAR CURIOSIDADE
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {/* Coluna 1: ULTIMAS TOCADAS */}
        <div className="space-y-3 flex flex-col h-[500px]">
          <div className="flex items-center justify-between flex-shrink-0 h-10">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-[#00BFF0] rounded-full" />
              <h4 className="text-xs font-black uppercase tracking-wider">em musica no ar - info music - a tabela ULTIMAS TOCADAS - precisa refletir as ultimas musicas tocadas e toda vez que muda a musica essa musica entra nessa tabela, veja que a ultima musica inserida nes ({filteredRows.length})</h4>
            </div>
          </div>
          <div style={{ overflowX: "auto", borderRadius: 16, border: "1px solid #E5F5FB", flex: 1, backgroundColor: "rgba(255, 255, 255, 0.3)" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#00BFF0", color: "#FFFFFF" }}>
                  <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", fontSize: 10, whiteSpace: "nowrap" }}>Data / Hora</th>
                  <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", fontSize: 10, whiteSpace: "nowrap" }}>Música / Artista</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, idx) => (
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
                            <div className="mt-1 text-[10px] italic line-clamp-2" style={{ color: "#059669" }}>
                              {r.curiosidade}
                            </div>
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
                                const { error } = await supabase.from("infomusic_excecoes").insert({
                                  user_id: user.id,
                                  termo: r.artista
                                });
                                if (error) throw error;
                                loadExcecoes();
                                toast.success(`"${r.artista}" adicionado às exceções`);
                              } catch (e) {
                                toast.error("Erro ao adicionar exceção");
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
                {filteredRows.length === 0 && (
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
            <div className="flex gap-1">
              <input 
                type="file" 
                className="hidden" 
                accept="image/*" 
                id="upload-excecao-capa"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    toast.info("Upload de capa iniciado (mock)");
                    // Logica de upload viria aqui
                  }
                }}
              />
              <Button 
                size="icon" 
                variant="outline" 
                className="h-6 w-6 text-amber-600 border-amber-200 hover:bg-amber-50 rounded-full bg-white/50"
                title="Cadastrar imagem da capa para exceção"
                onClick={() => document.getElementById("upload-excecao-capa")?.click()}
              >
                <ImagePlus size={10} />
              </Button>

              <input 
                type="file" 
                className="hidden" 
                accept="image/*" 
                id="upload-excecao-artista"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    toast.info("Upload de artista iniciado (mock)");
                  }
                }}
              />
              <Button 
                size="icon" 
                variant="outline" 
                className="h-6 w-6 text-blue-600 border-blue-200 hover:bg-blue-50 rounded-full bg-white/50"
                title="Cadastrar imagem do artista para exceção"
                onClick={() => document.getElementById("upload-excecao-artista")?.click()}
              >
                <Plus size={10} />
              </Button>
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
                      <div className="flex items-center justify-center gap-1">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className={`h-6 w-6 rounded-full ${exc.capa_url ? "text-emerald-500 bg-emerald-50" : "text-gray-400 hover:text-amber-500 hover:bg-amber-50"}`}
                          title="Cadastrar imagem da capa"
                          onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "image/*";
                            input.onchange = async (e: any) => {
                              const file = e.target.files?.[0];
                              if (!file || !user) return;
                              try {
                                const fileName = `excecao-capa-${exc.id}-${Date.now()}`;
                                const { data: upData, error: upErr } = await supabase.storage
                                  .from("xml-files")
                                  .upload(`${user.id}/${fileName}`, file);
                                if (upErr) throw upErr;
                                
                                const { data: { publicUrl } } = supabase.storage
                                  .from("xml-files")
                                  .getPublicUrl(`${user.id}/${fileName}`);
                                  
                                await supabase.from("infomusic_excecoes").update({ capa_url: publicUrl } as any).eq("id", exc.id);
                                loadExcecoes();
                                toast.success("Capa atualizada!");
                              } catch (err) {
                                toast.error("Erro no upload");
                              }
                            };
                            input.click();
                          }}
                        >
                          <ImagePlus size={12} />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className={`h-6 w-6 rounded-full ${(exc as any).artista_url ? "text-blue-500 bg-blue-50" : "text-gray-400 hover:text-blue-500 hover:bg-blue-50"}`}
                          title="Cadastrar imagem do artista"
                          onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "image/*";
                            input.onchange = async (e: any) => {
                              const file = e.target.files?.[0];
                              if (!file || !user) return;
                              try {
                                const fileName = `excecao-artista-${exc.id}-${Date.now()}`;
                                const { data: upData, error: upErr } = await supabase.storage
                                  .from("xml-files")
                                  .upload(`${user.id}/${fileName}`, file);
                                if (upErr) throw upErr;
                                
                                const { data: { publicUrl } } = supabase.storage
                                  .from("xml-files")
                                  .getPublicUrl(`${user.id}/${fileName}`);
                                  
                                await supabase.from("infomusic_excecoes").update({ artista_url: publicUrl } as any).eq("id", exc.id);
                                loadExcecoes();
                                toast.success("Foto do artista atualizada!");
                              } catch (err) {
                                toast.error("Erro no upload");
                              }
                            };
                            input.click();
                          }}
                        >
                          <Plus size={12} />
                        </Button>
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50" 
                        onClick={async () => {
                          try {
                            const { error } = await supabase.from("infomusic_excecoes").delete().eq("id", exc.id);
                            if (error) throw error;
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
        <div style={{ maxHeight: "400px", overflowY: "auto", borderRadius: 16, border: "1px solid #E5F5FB" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
            <thead className="sticky top-0 z-10">
              <tr style={{ background: "#00BFF0", color: "#FFFFFF" }}>
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
                    background: idx % 2 === 0 ? "#FFFFFF" : "#F7FCFE",
                    color: "#0A2540"
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
                    <div className="line-clamp-2 italic" style={{ color: "#00BFF0", fontSize: 11 }}>
                      {r.curiosidade}
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "center" }}>
                    <div className="flex items-center justify-center gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-7 px-2 text-[10px] font-bold text-[#00BFF0] hover:bg-cyan-50 border border-[#00BFF0]/20"
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
