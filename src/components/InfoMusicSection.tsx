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
        .limit(append ? rows.length + PAGE_SIZE : PAGE_SIZE);

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
    const [settingsRes, exceptionsRes] = await Promise.all([
      supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("infomusic_excecoes").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
    ]);
    setExcecoes(exceptionsRes.data || []);
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
      await load();
    } catch (e) {
      toast.error("Erro ao salvar");
    }
  };

  return (
    <div className="relative space-y-5 rounded-2xl p-5" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 88%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 14%, transparent)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-black uppercase tracking-tighter" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            Música no Ar & Curiosidades
          </h3>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </Button>
      </div>

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
          <Button 
            variant="ghost" 
            size="sm" 
            className="flex-shrink-0 text-[#00BFF0] hover:bg-[#00BFF0]/10"
            onClick={() => {
              setEditMusic({ musica: nowPlaying.musica, artista: nowPlaying.artista, id: "now-playing" });
              setCuriosidadeText(nowPlaying.curiosity || "");
            }}
          >
            <Plus size={16} className="mr-2" />
            CADASTRAR CURIOSIDADE
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Coluna 1: ULTIMAS TOCADAS */}
        <div className="space-y-3 flex flex-col h-[600px]">
          <div className="flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-[#00BFF0] rounded-full" />
              <h4 className="text-xs font-black uppercase tracking-wider">ULTIMAS TOCADAS ({rows.length})</h4>
            </div>
            <div className="flex gap-1">
              <input 
                className="text-[9px] px-2 py-1 rounded border bg-white/50 w-24 outline-none focus:ring-1 focus:ring-[#00BFF0]" 
                placeholder="Buscar..." 
                value={search} 
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 rounded-xl overflow-hidden border border-black/5 bg-white/30 overflow-y-auto custom-scrollbar shadow-sm">
            <table className="w-full text-[10px]">
              <thead className="bg-[#00BFF0] text-white sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 w-16">Hora</th>
                  <th className="text-left px-3 py-2">Música / Artista</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filteredRows.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-black/5" style={{ backgroundColor: r.curiosidade ? "rgba(16,185,129,0.03)" : "rgba(239,68,68,0.03)" }}>
                    <td className="px-3 py-2 whitespace-nowrap opacity-50 font-medium">{new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-3 py-2">
                      <div className="font-bold text-[#1a1a1a] truncate">{r.musica}</div>
                      <div className="opacity-60 truncate">{r.artista}</div>
                      {r.curiosidade && (
                        <div className="mt-1 text-[9px] italic text-[#00BFF0] bg-[#00BFF0]/5 p-1 rounded border-l border-[#00BFF0] line-clamp-2">
                          {r.curiosidade}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-3 py-10 text-center opacity-40 italic">Nenhum registro encontrado</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coluna 2: EXCEÇÕES */}
        <div className="space-y-3 flex flex-col h-[600px]">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-1 h-4 bg-amber-500 rounded-full" />
            <h4 className="text-xs font-black uppercase tracking-wider">EXCEÇÕES ({excecoes.length})</h4>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/50 flex-shrink-0">
            <h5 className="text-[9px] font-black uppercase text-amber-700 mb-2">Bloquear artista ou termo</h5>
            <div className="flex gap-2">
              <input 
                className="flex-1 text-[10px] px-2 py-1.5 rounded border border-amber-200 bg-white focus:ring-1 focus:ring-amber-500 outline-none" 
                placeholder="Ex: Jingle, Comercial..."
                value={newExcecao}
                onChange={(e) => setNewExcecao(e.target.value)}
              />
              <Button 
                size="sm" 
                className="bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-bold h-auto py-1 px-3"
                onClick={async () => {
                  if (!newExcecao.trim() || !user) return;
                  try {
                    const { error } = await supabase.from("infomusic_excecoes").insert({
                      user_id: user.id,
                      termo: newExcecao.trim()
                    });
                    if (error) throw error;
                    setNewExcecao("");
                    loadExcecoes();
                    toast.success("Exceção adicionada!");
                  } catch (e) {
                    toast.error("Erro ao adicionar");
                  }
                }}
              >
                + ADD
              </Button>
            </div>
          </div>
          <div className="flex-1 rounded-xl overflow-hidden border border-black/5 bg-white/30 overflow-y-auto custom-scrollbar shadow-sm">
            <table className="w-full text-[10px]">
              <thead className="bg-amber-500 text-white sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2">Termo</th>
                  <th className="text-center px-3 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {excecoes.map(exc => (
                  <tr key={exc.id} className="hover:bg-amber-50/50">
                    <td className="px-3 py-2 font-medium">{exc.termo}</td>
                    <td className="px-3 py-2 text-center">
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
                    <td colSpan={2} className="px-3 py-10 text-center opacity-40 italic">Nenhuma exceção</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coluna 3: MUSICAS SEM CURIOSIDADES */}
        <div className="space-y-3 flex flex-col h-[600px]">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-1 h-4 bg-red-500 rounded-full" />
            <h4 className="text-xs font-black uppercase tracking-wider">MUSICAS SEM CURIOSIDADES</h4>
          </div>
          <div className="flex-1 rounded-xl overflow-hidden border border-black/5 bg-white/30 overflow-y-auto custom-scrollbar shadow-sm">
            <table className="w-full text-[10px]">
              <thead className="bg-red-500 text-white sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2">Música / Artista</th>
                  <th className="text-center px-3 py-2 w-16">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {rows.filter(r => !r.curiosidade || !r.curiosidade.trim()).map(r => (
                  <tr key={r.id} className="hover:bg-red-50/30">
                    <td className="px-3 py-2">
                      <div className="font-bold truncate">{r.musica}</div>
                      <div className="opacity-60 truncate">{r.artista}</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-7 text-[9px] font-bold border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => {
                          setEditMusic(r);
                          setCuriosidadeText("");
                        }}
                      >
                        ADD
                      </Button>
                    </td>
                  </tr>
                ))}
                {rows.filter(r => !r.curiosidade || !r.curiosidade.trim()).length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-3 py-10 text-center opacity-40 italic">Tudo em dia!</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
    </div>
  );
}
