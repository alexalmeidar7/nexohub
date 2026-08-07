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
          <div className="px-2 py-0.5 rounded bg-white text-[10px] font-bold text-black border border-black/10 shadow-sm opacity-50">
            volta a seção das musicas cadastradas como EXCEÇÃO
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Coluna Esquerda: Status e IA */}
        <div className="md:col-span-1 space-y-4">
          <div className="p-4 rounded-xl bg-white/50 border border-black/5">
             <h4 className="text-xs font-bold uppercase mb-3 opacity-60">Status IA</h4>
             <div className="flex items-center justify-between">
               <span className="text-sm">Geração Automática</span>
               <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
             </div>
             <div className="mt-3 text-[10px] opacity-50">
               Cota Mensal: {monthlyQuota.count} / {monthlyQuota.limit}
             </div>
          </div>
          
          {nowPlaying && (
            <div className="p-4 rounded-xl bg-[#00BFF0]/10 border border-[#00BFF0]/20">
              <h4 className="text-[10px] font-bold uppercase text-[#00BFF0] mb-2">No Ar Agora</h4>
              <div className="flex gap-3">
                {nowPlaying.capa && <img src={nowPlaying.capa} className="w-12 h-12 rounded object-cover" />}
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{nowPlaying.musica}</div>
                  <div className="text-xs opacity-70 truncate">{nowPlaying.artista}</div>
                </div>
              </div>
              {nowPlaying.curiosity && (
                <div className="mt-2 text-[11px] italic opacity-80 line-clamp-3">
                  "{nowPlaying.curiosity}"
                </div>
              )}
            </div>
          )}
        </div>

        {/* Coluna Direita: Tabelas */}
        <div className="md:col-span-2 space-y-6">
          {/* Pendentes */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-amber-500 rounded-full" />
              <h4 className="text-xs font-bold uppercase tracking-wider">Músicas Pendentes</h4>
            </div>
            <div className="rounded-xl overflow-hidden border border-black/5 bg-white/30 max-h-[300px] overflow-y-auto">
              <div className="p-3 bg-white/50 border-b border-black/5">
                <h5 className="text-[10px] font-black uppercase text-amber-600 mb-1">Todas as músicas cadastradas na lista de exceções</h5>
                <div className="flex gap-2">
                  <input 
                    className="flex-1 text-[10px] px-2 py-1.5 rounded border bg-white focus:ring-1 focus:ring-amber-500 outline-none" 
                    placeholder="Termo (ex.: jingle ou artista)"
                  />
                  <Button size="sm" className="bg-[#C6F03C] hover:bg-[#b5dc35] text-black text-[10px] font-bold h-auto py-1 px-3">
                    + ADICIONAR EXCEÇÃO
                  </Button>
                </div>
              </div>
              <table className="w-full text-[11px]">
                <thead className="bg-amber-500 text-white sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Música / Artista</th>
                    <th className="text-center px-3 py-2 w-16">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.filter(r => !r.curiosidade || !r.curiosidade.trim()).map(r => (
                    <tr key={r.id} className="border-t border-black/5">
                      <td className="px-3 py-2">
                        <div className="font-bold">{r.musica}</div>
                        <div className="opacity-60">{r.artista}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditMusic(r); setCuriosidadeText(""); }}>
                          <Plus size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Histórico e Busca */}
          <div className="space-y-3">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-[#00BFF0] rounded-full" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">Histórico Recente</h4>
                </div>
                <div className="flex gap-2">
                  <input 
                    className="text-[10px] px-2 py-1 rounded border bg-white/50 w-32" 
                    placeholder="Buscar..." 
                    value={search} 
                    onChange={e => setSearch(e.target.value)}
                  />
                  <select 
                    className="text-[10px] px-1 py-1 rounded border bg-white/50"
                    value={filterField}
                    onChange={e => setFilterField(e.target.value as any)}
                  >
                    <option value="all">Todos</option>
                    <option value="artista">Com Curiosidade</option>
                    <option value="sem_curiosidade">Sem Curiosidade</option>
                  </select>
                </div>
             </div>
             <div className="rounded-xl overflow-hidden border border-black/5 bg-white/30 max-h-[400px] overflow-y-auto">
               <table className="w-full text-[11px]">
                 <thead className="bg-[#00BFF0] text-white sticky top-0">
                   <tr>
                     <th className="text-left px-3 py-2">Data</th>
                     <th className="text-left px-3 py-2">Música</th>
                   </tr>
                 </thead>
                 <tbody>
                   {filteredRows.map(r => (
                     <tr key={r.id} className="border-t border-black/5" style={{ backgroundColor: r.curiosidade ? "rgba(16,185,129,0.05)" : "rgba(239,68,68,0.05)" }}>
                       <td className="px-3 py-2 whitespace-nowrap opacity-50">{new Date(r.created_at).toLocaleTimeString()}</td>
                       <td className="px-3 py-2">
                         <div className="font-bold">{r.musica}</div>
                         <div className="opacity-60">{r.artista}</div>
                         {r.curiosidade && <div className="mt-1 text-[10px] italic border-l-2 border-[#00BFF0] pl-2 py-0.5">{r.curiosidade}</div>}
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
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
