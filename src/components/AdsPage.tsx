import { useEffect, useMemo, useRef, useState } from "react";
import {
  Film, Music, MessageCircle, Upload, CalendarIcon, Plus, Save, Settings2,
  BarChart3, Radio, Trash2, ShieldCheck, Link2, X, Check, Pause, Play,
  Pencil, Eye, UserPlus, Loader2, ListMusic, Clock,
} from "lucide-react";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const BG = "#D6F4FB";
const INK = "#002132";

const inputCls =
  "w-full h-11 px-4 rounded-full text-sm bg-white outline-none transition-all " +
  "border-2 border-[#00BFF0]/30 focus:border-[#00BFF0] focus:ring-4 focus:ring-[#00BFF0]/15 " +
  "placeholder:text-[#002132]/40 text-[#002132]";

const textareaCls =
  "w-full px-4 py-3 rounded-2xl text-sm bg-white outline-none transition-all resize-none " +
  "border-2 border-[#00BFF0]/30 focus:border-[#00BFF0] focus:ring-4 focus:ring-[#00BFF0]/15 " +
  "placeholder:text-[#002132]/40 text-[#002132]";

const labelCls =
  "text-[11px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 text-[#002132]";

const cardCls = "rounded-2xl bg-white p-5";
const cardStyle = { boxShadow: "0 4px 20px rgba(0,33,50,0.06)" } as const;

type VideoSlot = "preroll" | "midroll" | "break";

interface Campanha {
  id: string;
  nome: string;
  cliente: string;
  inicio: string | null;
  fim: string | null;
  canais: string[];
  status: "Ativa" | "Pausada";
  views: number;
  clicks: number;
  midia: string | null;
}

interface BreakItem { id: string; titulo: string; duracao: string; campanha?: string }
interface BreakPlaylist {
  id: string;
  nome: string;
  usarHorario: boolean;
  horaInicio: string;
  horaFim: string;
  dias: number[];
  itens: BreakItem[];
}

const DIAS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

/* ------------------------------------------------------------------ *
 * LÓGICA DE GATILHO DO BREAK COMERCIAL
 * ------------------------------------------------------------------ */
export function handleMetadataTick(
  nomeDoArtista: string,
  palavraChave: string,
  playlist: { id: string; titulo: string }[],
) {
  if (nomeDoArtista.trim().toUpperCase() === palavraChave.trim().toUpperCase()) {
    const randomizada = [...playlist].sort(() => Math.random() - 0.5);
    return { action: "PLAY_BREAK" as const, playlist: randomizada };
  }
  return { action: "RESUME_LIVE" as const, playlist: [] };
}

export default function AdsPage() {
  const { user } = useAuth();

  /* ---------------- CLIENTES ---------------- */
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [novoClienteOpen, setNovoClienteOpen] = useState(false);
  const [salvandoCliente, setSalvandoCliente] = useState(false);
  const [novoCliente, setNovoCliente] = useState({
    nome: "", cnpj: "", telefone: "", endereco: "", cliente_desde: "", executiva_venda: "",
  });

  const loadClientes = async () => {
    setLoadingClientes(true);
    try {
      const { data } = await supabase
        .from("logos_patrocinadores")
        .select("id, nome")
        .eq("excluido", false)
        .order("nome");
      const seen = new Set<string>();
      const list: { id: string; nome: string }[] = [];
      (data || []).forEach((c: any) => {
        const key = c.nome?.trim().toUpperCase();
        if (key && !seen.has(key)) { seen.add(key); list.push({ id: c.id, nome: c.nome }); }
      });
      setClientes(list);
    } finally {
      setLoadingClientes(false);
    }
  };

  useEffect(() => { loadClientes(); }, []);

  async function salvarNovoCliente() {
    if (!novoCliente.nome.trim()) {
      toast({ title: "Informe a razão social", variant: "destructive" });
      return;
    }
    setSalvandoCliente(true);
    try {
      const nome = novoCliente.nome.trim().toUpperCase();
      const { error } = await supabase.from("logos_patrocinadores").insert({
        nome,
        user_id: user?.id,
        ativo: true,
        excluido: false,
        data_final: new Date(new Date().getFullYear() + 10, 11, 31).toISOString().split("T")[0],
      } as any);
      if (error) throw error;
      toast({ title: "Cliente cadastrado", description: nome });
      setClient(nome);
      setNovoClienteOpen(false);
      setNovoCliente({ nome: "", cnpj: "", telefone: "", endereco: "", cliente_desde: "", executiva_venda: "" });
      loadClientes();
    } catch (e: any) {
      toast({ title: "Erro ao salvar cliente", description: e.message, variant: "destructive" });
    } finally {
      setSalvandoCliente(false);
    }
  }

  /* ---------------- FORMULÁRIO ---------------- */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const [chVideo, setChVideo] = useState(false);
  const [chAudio, setChAudio] = useState(false);
  const [chChatbot, setChChatbot] = useState(false);

  const [videoSlot, setVideoSlot] = useState<VideoSlot>("preroll");
  const [botMessage, setBotMessage] = useState("");
  const [botLink, setBotLink] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isVideoFile = !!file && file.type.startsWith("video");

  function attachFile(f: File | null) {
    if (!f) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function resetForm() {
    setEditingId(null);
    setName(""); setClient(""); setStartDate(undefined); setEndDate(undefined);
    setChVideo(false); setChAudio(false); setChChatbot(false);
    setVideoSlot("preroll"); setBotMessage(""); setBotLink("");
    clearFile();
  }

  /* ---------------- CAMPANHAS ---------------- */
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [previewCampanha, setPreviewCampanha] = useState<Campanha | null>(null);

  function saveCampaign() {
    if (!name.trim() || !client.trim()) {
      toast({ title: "Preencha nome da campanha e cliente", variant: "destructive" });
      return;
    }
    if (!chVideo && !chAudio && !chChatbot) {
      toast({ title: "Selecione ao menos um posicionamento", variant: "destructive" });
      return;
    }
    const canais = [
      chVideo ? `Vídeo (${videoSlot})` : null,
      chAudio ? "Áudio (pre-roll)" : null,
      chChatbot ? "Chatbot" : null,
    ].filter(Boolean) as string[];

    if (editingId) {
      setCampanhas(list => list.map(c => c.id === editingId ? {
        ...c,
        nome: name.trim(), cliente: client.trim(),
        inicio: startDate ? format(startDate, "dd/MM/yyyy") : null,
        fim: endDate ? format(endDate, "dd/MM/yyyy") : null,
        canais, midia: file ? file.name : c.midia,
      } : c));
      toast({ title: "Campanha atualizada" });
    } else {
      setCampanhas(list => [{
        id: crypto.randomUUID(),
        nome: name.trim(), cliente: client.trim(),
        inicio: startDate ? format(startDate, "dd/MM/yyyy") : null,
        fim: endDate ? format(endDate, "dd/MM/yyyy") : null,
        canais, status: "Ativa", views: 0, clicks: 0,
        midia: file ? file.name : null,
      }, ...list]);
      toast({ title: "Campanha salva", description: "Disponível na tabela de campanhas ativas." });
    }
    resetForm();
  }

  function editCampanha(c: Campanha) {
    setEditingId(c.id);
    setName(c.nome);
    setClient(c.cliente);
    setChVideo(c.canais.some(x => x.startsWith("Vídeo")));
    setChAudio(c.canais.some(x => x.startsWith("Áudio")));
    setChChatbot(c.canais.includes("Chatbot"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------------- RELATÓRIO ---------------- */
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<Campanha | null>(null);
  const [reportFreq, setReportFreq] = useState("semanal");
  const [reportMetrics, setReportMetrics] = useState<string[]>(["views", "clicks"]);
  const [reportFrom, setReportFrom] = useState<Date | undefined>();
  const [reportTo, setReportTo] = useState<Date | undefined>();
  const [reportEmail, setReportEmail] = useState("");

  /* ---------------- BREAKS ---------------- */
  const [breaksOn, setBreaksOn] = useState(true);
  const [triggerWord, setTriggerWord] = useState("BREAK");
  const [playlists, setPlaylists] = useState<BreakPlaylist[]>([{
    id: "pl-1",
    nome: "Break padrão",
    usarHorario: false,
    horaInicio: "12:00",
    horaFim: "13:00",
    dias: [1, 2, 3, 4, 5],
    itens: [],
  }]);
  const [selectedPl, setSelectedPl] = useState("pl-1");
  const breakFileRef = useRef<HTMLInputElement>(null);

  /* Biblioteca de mídias: arquivos das campanhas ativas */
  const biblioteca = useMemo<BreakItem[]>(
    () => campanhas
      .filter(c => c.status === "Ativa" && c.midia)
      .map(c => ({ id: `cmp-${c.id}`, titulo: c.midia as string, duracao: "--:--", campanha: c.nome })),
    [campanhas],
  );
  const [dragOverPl, setDragOverPl] = useState(false);

  const currentPl = playlists.find(p => p.id === selectedPl) || null;

  function dropMidiaNaPlaylist(midiaId: string) {
    const pl = playlists.find(p => p.id === selectedPl);
    const midia = biblioteca.find(m => m.id === midiaId);
    if (!pl || !midia) return;
    if (pl.itens.some(i => i.origemId === midia.id)) return;
    updatePl(pl.id, { itens: [...pl.itens, { ...midia, id: crypto.randomUUID(), origemId: midia.id }] });
  }

  /* Mídias de campanhas pausadas/excluídas saem das playlists */
  useEffect(() => {
    const validos = new Set(biblioteca.map(m => m.id));
    setPlaylists(list => list.map(p => {
      const itens = p.itens.filter(i => !i.origemId || validos.has(i.origemId));
      return itens.length === p.itens.length ? p : { ...p, itens };
    }));
  }, [biblioteca]);

  function updatePl(id: string, patch: Partial<BreakPlaylist>) {
    setPlaylists(list => list.map(p => p.id === id ? { ...p, ...patch } : p));
  }

  function novaPlaylist() {
    const id = crypto.randomUUID();
    setPlaylists(list => [...list, { id, nome: `Break ${list.length + 1}`, usarHorario: false, horaInicio: "12:00", horaFim: "13:00", dias: [1, 2, 3, 4, 5], itens: [] }]);
    setSelectedPl(id);
  }

  function addBreakFiles(files: FileList | null) {
    if (!files || !currentPl) return;
    const novos: BreakItem[] = Array.from(files).map(f => ({
      id: crypto.randomUUID(), titulo: f.name, duracao: "--:--",
    }));
    updatePl(currentPl.id, { itens: [...currentPl.itens, ...novos] });
    if (breakFileRef.current) breakFileRef.current.value = "";
  }

  const totals = useMemo(() => ({
    views: campanhas.reduce((a, r) => a + r.views, 0),
    clicks: campanhas.reduce((a, r) => a + r.clicks, 0),
  }), [campanhas]);

  const toggleCard = (active: boolean, onClick: () => void, Icon: any, label: string, hint: string) => (
    <button
      type="button"
      onClick={onClick}
      className="relative text-left p-4 transition-all"
      style={{
        background: active ? LIME : "#fff",
        border: `2px solid ${active ? INK : `${CYAN}33`}`,
        boxShadow: active ? `0 10px 26px ${LIME}66` : "0 4px 14px rgba(0,33,50,0.05)",
      }}
    >
      <span
        className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center transition-all"
        style={{
          background: active ? INK : "transparent",
          border: `2px solid ${active ? INK : `${CYAN}55`}`,
          color: LIME,
        }}
      >
        {active && <Check size={13} strokeWidth={4} />}
      </span>
      <div className="w-11 h-11 flex items-center justify-center mb-2"
        style={{ background: active ? "rgba(0,33,50,0.12)" : `${CYAN}15`, color: active ? INK : CYAN }}>

        <Icon size={20} />
      </div>
      <div className="text-sm font-black uppercase tracking-wide" style={{ color: INK }}>{label}</div>
      <div className="text-[11px] mt-0.5" style={{ color: `${INK}99` }}>{hint}</div>
    </button>
  );

  const datePicker = (value: Date | undefined, onChange: (d?: Date) => void, placeholder: string) => (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(inputCls, "text-left flex items-center")}>
          <CalendarIcon className="mr-2 h-4 w-4 opacity-60" />
          {value ? format(value, "dd/MM/yyyy") : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className="p-3 pointer-events-auto" />
      </PopoverContent>
    </Popover>
  );

  const [clienteAberto, setClienteAberto] = useState(false);
  const clientesFiltrados = useMemo(() => {
    const q = client.trim().toLowerCase();
    if (!q) return clientes.slice(0, 8);
    return clientes.filter(c => c.nome.toLowerCase().includes(q)).slice(0, 8);
  }, [client, clientes]);

  return (
    <div className="nexo-scope animate-fade-in" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>


      <div className="rounded-3xl p-6" style={{ background: BG }}>
        <Tabs defaultValue="nova">
          <TabsList className="bg-white/70 rounded-full p-1 mb-5">
            <TabsTrigger value="nova" className="rounded-full text-xs font-bold uppercase tracking-wider data-[state=active]:bg-[#C6F03C] data-[state=active]:text-[#002132]">
              <Plus size={14} className="mr-1.5" /> Nova campanha
            </TabsTrigger>
            <TabsTrigger value="breaks" className="rounded-full text-xs font-bold uppercase tracking-wider data-[state=active]:bg-[#C6F03C] data-[state=active]:text-[#002132]">
              <Radio size={14} className="mr-1.5" /> Break comercial
            </TabsTrigger>
          </TabsList>

          {/* ================= ABA 1 ================= */}
          <TabsContent value="nova" className="space-y-5 mt-0">
            {/* BLOCO 1 */}
            <div className={cardCls} style={cardStyle}>
              <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: CYAN }}>1 · Dados básicos</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className={labelCls}>Nome da campanha</div>
                  <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Promoção Dia dos Pais" />
                </div>
                <div>
                  <div className={labelCls}>Cliente</div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        className={inputCls}
                        value={client}
                        onChange={e => { setClient(e.target.value); setClienteAberto(true); }}
                        onFocus={() => setClienteAberto(true)}
                        onBlur={() => setTimeout(() => setClienteAberto(false), 150)}
                        placeholder={loadingClientes ? "Carregando..." : "Digite o nome do cliente"}
                      />
                      {clienteAberto && clientesFiltrados.length > 0 && (
                        <div className="absolute left-0 right-0 top-[46px] z-50 rounded-2xl bg-white overflow-hidden max-h-56 overflow-y-auto"
                          style={{ border: `2px solid ${CYAN}33`, boxShadow: "0 12px 30px rgba(0,33,50,0.14)" }}>
                          {clientesFiltrados.map(c => (
                            <button key={c.id} type="button"
                              onMouseDown={e => { e.preventDefault(); setClient(c.nome); setClienteAberto(false); }}
                              className="w-full text-left px-4 py-2.5 text-[13px] font-bold hover:bg-[#00BFF0]/10"
                              style={{ color: INK }}>
                              {c.nome}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => setNovoClienteOpen(true)}
                      title="Cadastrar novo cliente"
                      className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center transition hover:brightness-95"
                      style={{ background: LIME, color: INK }}>
                      <UserPlus size={17} />
                    </button>
                  </div>
                  {!loadingClientes && client.trim().length > 1 && clientesFiltrados.length === 0 && (
                    <div className="text-[11px] mt-1.5" style={{ color: `${INK}99` }}>
                      Cliente não encontrado.{" "}
                      <button type="button" onClick={() => { setNovoCliente(n => ({ ...n, nome: client })); setNovoClienteOpen(true); }} className="font-black underline" style={{ color: CYAN }}>
                        Cadastrar cliente
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <div className={labelCls}><CalendarIcon size={14} /> Data de início</div>
                  {datePicker(startDate, setStartDate, "Selecionar data")}
                </div>
                <div>
                  <div className={labelCls}><CalendarIcon size={14} /> Data de término</div>
                  {datePicker(endDate, setEndDate, "Selecionar data")}
                </div>
              </div>
            </div>

            {/* BLOCO 2 */}
            <div className={cardCls} style={cardStyle}>
              <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: CYAN }}>2 · Posicionamentos</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {toggleCard(chVideo, () => setChVideo(v => !v), Film, "Vídeo", "Player de vídeo e lives")}
                {toggleCard(chAudio, () => setChAudio(v => !v), Music, "Áudio", "Streaming de rádio")}
                {toggleCard(chChatbot, () => setChChatbot(v => !v), MessageCircle, "Chatbot", "Disparo em massa")}
              </div>

              {(chVideo || chAudio || chChatbot) && (
                <div className="mt-5 space-y-4">
                  {chVideo && (
                    <div className="rounded-2xl p-4" style={{ background: `${CYAN}0F` }}>
                      <div className={labelCls}><Film size={14} /> Formato do vídeo</div>
                      <Select value={videoSlot} onValueChange={v => setVideoSlot(v as VideoSlot)}>
                        <SelectTrigger className={cn(inputCls, "justify-between")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white z-50">
                          <SelectItem value="preroll">Pre-roll</SelectItem>
                          <SelectItem value="midroll">Mid-roll</SelectItem>
                          <SelectItem value="break">Break Comercial</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {chAudio && (
                    <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: `${CYAN}0F` }}>
                      <div className={cn(labelCls, "mb-0")}><Music size={14} /> Áudio</div>
                      <span className="text-[10px] font-black px-3 py-1 rounded-full" style={{ background: LIME, color: INK }}>PRE-ROLL</span>
                      <span className="text-[11px]" style={{ color: `${INK}88` }}>formato fixo para streaming de áudio</span>
                    </div>
                  )}

                  {chChatbot && (
                    <div className="rounded-2xl p-4 space-y-3" style={{ background: `${CYAN}0F` }}>
                      <div>
                        <div className={labelCls}><MessageCircle size={14} /> Mensagem</div>
                        <textarea rows={4} className={textareaCls} value={botMessage} onChange={e => setBotMessage(e.target.value)}
                          placeholder="Digite a mensagem que será enviada..." maxLength={4096} />
                      </div>
                      <div>
                        <div className={labelCls}><Link2 size={14} /> Link de conversão</div>
                        <input className={inputCls} value={botLink} onChange={e => setBotLink(e.target.value)} placeholder="https://..." />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* BLOCO 3 */}
            <div className={cardCls} style={cardStyle}>
              <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: CYAN }}>3 · Mídia e pré-visualização</div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <label
                  htmlFor="ads-file"
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); attachFile(e.dataTransfer.files?.[0] || null); }}
                  className="min-h-[220px] rounded-2xl border-2 border-dashed cursor-pointer flex flex-col items-center justify-center text-center px-6 transition"
                  style={{ borderColor: dragging ? INK : `${CYAN}55`, background: dragging ? `${LIME}33` : "transparent" }}
                >
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: `${CYAN}15`, color: CYAN }}>
                    <Upload size={26} />
                  </div>
                  <div className="text-sm font-black" style={{ color: INK }}>Arraste o arquivo aqui</div>
                  <div className="text-[11px] mt-1" style={{ color: `${INK}88` }}>ou clique para selecionar · vídeo, imagem ou áudio</div>
                  {file && <div className="text-[11px] mt-3 font-bold" style={{ color: CYAN }}>{file.name}</div>}
                </label>
                <input id="ads-file" ref={fileRef} type="file" accept="video/*,image/*,audio/*" className="hidden"
                  onChange={e => attachFile(e.target.files?.[0] || null)} />

                <div className="rounded-2xl overflow-hidden flex flex-col" style={{ border: `2px solid ${CYAN}22` }}>
                  <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider flex items-center justify-between" style={{ background: `${CYAN}12`, color: INK }}>
                    Preview local
                    {file && (
                      <button type="button" onClick={clearFile} className="flex items-center gap-1 text-[10px] font-bold" style={{ color: "#dc2626" }}>
                        <X size={12} /> remover
                      </button>
                    )}
                  </div>
                  <div className="flex-1 min-h-[200px] flex items-center justify-center" style={{ background: "#0b1620" }}>
                    {!previewUrl ? (
                      <div className="text-[11px] text-white/50">Nenhuma mídia selecionada</div>
                    ) : isVideoFile ? (
                      <video src={previewUrl} controls className="w-full max-h-[280px]" />
                    ) : file?.type.startsWith("audio") ? (
                      <audio src={previewUrl} controls className="w-full px-4" />
                    ) : (
                      <img src={previewUrl} alt="preview" className="w-full max-h-[280px] object-contain" />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-5">
                {editingId && (
                  <button type="button" onClick={resetForm}
                    className="h-11 px-5 rounded-full text-sm font-bold"
                    style={{ background: "#fff", border: `2px solid ${CYAN}`, color: INK }}>
                    Cancelar edição
                  </button>
                )}
                <button type="button" onClick={saveCampaign}
                  className="h-11 px-6 rounded-full text-sm font-black flex items-center gap-2 transition hover:brightness-95"
                  style={{ background: LIME, color: INK, boxShadow: `0 6px 20px ${LIME}55` }}>
                  <Save size={16} /> {editingId ? "Atualizar campanha" : "Salvar campanha"}
                </button>
              </div>
            </div>

            {/* CAMPANHAS ATIVAS */}
            <div className="rounded-2xl bg-white overflow-hidden" style={cardStyle}>
              <div className="px-5 py-3.5 flex items-center gap-2 border-b" style={{ borderColor: `${INK}12` }}>
                <BarChart3 size={16} style={{ color: CYAN }} />
                <div className="text-sm font-black uppercase tracking-wide" style={{ color: INK }}>Campanhas ativas</div>
                <div className="ml-auto flex items-center gap-2 text-[11px] font-bold">
                  <span className="px-2.5 py-1 rounded-full" style={{ background: `${CYAN}15`, color: CYAN }}>{campanhas.length} campanhas</span>
                  <span className="px-2.5 py-1 rounded-full" style={{ background: `${LIME}55`, color: INK }}>{totals.views.toLocaleString("pt-BR")} views</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: CYAN }}>
                      {["Campanha", "Cliente", "Período", "Canais", "Views", "Status", "Ações", "Relatório"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[11px] font-black uppercase tracking-wider text-white whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campanhas.map(c => (
                      <tr key={c.id} className="border-b last:border-0" style={{ borderColor: `${INK}10` }}>
                        <td className="px-4 py-3 font-bold" style={{ color: INK }}>{c.nome}</td>
                        <td className="px-4 py-3" style={{ color: `${INK}CC` }}>{c.cliente}</td>
                        <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: `${INK}AA` }}>
                          {c.inicio || "—"} {c.fim ? `→ ${c.fim}` : ""}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {c.canais.map(x => (
                              <span key={x} className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${CYAN}15`, color: CYAN }}>{x}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums" style={{ color: INK }}>{c.views.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                            style={{
                              background: c.status === "Ativa" ? `${LIME}55` : "rgba(234,179,8,0.2)",
                              color: c.status === "Pausada" ? "#a16207" : INK,
                            }}>{c.status}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button type="button" title="Editar" onClick={() => editCampanha(c)}
                              className="w-9 h-9 rounded-full inline-flex items-center justify-center" style={{ background: `${CYAN}15`, color: CYAN }}>
                              <Pencil size={15} />
                            </button>
                            <button type="button" title={c.status === "Ativa" ? "Pausar" : "Retomar"}
                              onClick={() => setCampanhas(l => l.map(x => x.id === c.id ? { ...x, status: x.status === "Ativa" ? "Pausada" : "Ativa" } : x))}
                              className="w-9 h-9 rounded-full inline-flex items-center justify-center" style={{ background: `${LIME}66`, color: INK }}>
                              {c.status === "Ativa" ? <Pause size={15} /> : <Play size={15} />}
                            </button>
                            <button type="button" title="Prévia de views" onClick={() => setPreviewCampanha(c)}
                              className="w-9 h-9 rounded-full inline-flex items-center justify-center" style={{ background: `${INK}0F`, color: INK }}>
                              <Eye size={15} />
                            </button>
                            <button type="button" title="Excluir" onClick={() => setCampanhas(l => l.filter(x => x.id !== c.id))}
                              className="w-9 h-9 rounded-full inline-flex items-center justify-center" style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => { setReportTarget(c); setReportOpen(true); }}
                            className="h-9 px-4 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
                            style={{ background: `${CYAN}15`, color: CYAN }}>
                            <Settings2 size={13} /> Relatório
                          </button>
                        </td>
                      </tr>
                    ))}
                    {campanhas.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-sm" style={{ color: `${INK}66` }}>
                        Nenhuma campanha salva ainda.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* ================= ABA 2 · BREAK COMERCIAL ================= */}
          <TabsContent value="breaks" className="space-y-4 mt-0">
            <div className={cardCls} style={cardStyle}>
              <div className="flex flex-col md:flex-row md:items-end gap-4">
                <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: `${CYAN}0F` }}>
                  <Switch checked={breaksOn} onCheckedChange={setBreaksOn} />
                  <div>
                    <div className="text-sm font-black" style={{ color: INK }}>Ativar sistema de breaks</div>
                    <div className="text-[11px]" style={{ color: `${INK}88` }}>{breaksOn ? "Escutando metadados do streaming" : "Desativado"}</div>
                  </div>
                </div>
                <div className="flex-1">
                  <div className={labelCls}><ShieldCheck size={14} /> Palavra-chave do gatilho</div>
                  <input className={inputCls} value={triggerWord} onChange={e => setTriggerWord(e.target.value)} placeholder="BREAK" />
                </div>
              </div>
            </div>

            {/* BIBLIOTECA DE MÍDIAS (das campanhas ativas) */}
            <div className="rounded-2xl bg-white overflow-hidden mb-4" style={cardStyle}>
              <div className="px-5 py-3.5 flex items-center gap-2 border-b" style={{ borderColor: `${INK}12` }}>
                <ListMusic size={15} style={{ color: CYAN }} />
                <div className="text-sm font-black" style={{ color: INK }}>Mídias cadastradas</div>
                <div className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${CYAN}15`, color: CYAN }}>{biblioteca.length}</div>
                <div className="text-[11px] ml-2" style={{ color: `${INK}77` }}>Arraste para o break que está sendo criado</div>
              </div>
              <div className="p-3 space-y-2 overflow-y-auto" style={{ maxHeight: 5 * 56 + 16 }}>
                {biblioteca.map(m => (
                  <div key={m.id} draggable
                    onDragStart={e => e.dataTransfer.setData("text/nexo-midia", m.id)}
                    onDoubleClick={() => dropMidiaNaPlaylist(m.id)}
                    title="Arraste para a playlist do break"
                    className="px-3 py-2.5 flex items-center gap-3 cursor-grab active:cursor-grabbing select-none"
                    style={{ background: `${CYAN}0F`, border: `2px solid ${CYAN}33`, color: INK, height: 48 }}>
                    <Film size={14} style={{ color: CYAN }} />
                    <span className="text-[12px] font-bold truncate flex-1">{m.titulo}</span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5" style={{ background: `${LIME}66`, color: INK }}>{m.campanha}</span>
                    <span className="text-[11px] tabular-nums" style={{ color: `${INK}77` }}>{m.duracao}</span>
                  </div>
                ))}
                {biblioteca.length === 0 && (
                  <div className="py-6 w-full text-center text-[12px]" style={{ color: `${INK}66` }}>
                    Nenhuma mídia. Cadastre um arquivo em uma campanha ativa na aba "Nova campanha".
                  </div>
                )}
              </div>
            </div>


            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">

              {/* LISTA DE PLAYLISTS */}
              <div className="rounded-2xl bg-white overflow-hidden h-fit" style={cardStyle}>
                <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ borderColor: `${INK}12` }}>
                  <ListMusic size={15} style={{ color: CYAN }} />
                  <div className="text-xs font-black uppercase tracking-wider" style={{ color: INK }}>Playlists</div>
                  <button type="button" onClick={novaPlaylist}
                    className="ml-auto h-8 px-3 rounded-full text-[11px] font-black inline-flex items-center gap-1"
                    style={{ background: LIME, color: INK }}>
                    <Plus size={13} /> Novo break
                  </button>
                </div>
                <div className="p-2 space-y-1">
                  {playlists.map(p => (
                    <button key={p.id} type="button" onClick={() => setSelectedPl(p.id)}
                      className="w-full text-left px-3 py-2.5 rounded-xl transition"
                      style={{
                        background: p.id === selectedPl ? `${CYAN}15` : "transparent",
                        border: `2px solid ${p.id === selectedPl ? CYAN : "transparent"}`,
                      }}>
                      <div className="text-sm font-bold" style={{ color: INK }}>{p.nome}</div>
                      <div className="text-[11px]" style={{ color: `${INK}88` }}>
                        {p.itens.length} arquivos · {p.usarHorario ? `${p.horaInicio}–${p.horaFim} · ${p.dias.map(d => DIAS[d]).join(" ")}` : "sem horário"}
                      </div>
                    </button>
                  ))}
                  {playlists.length === 0 && (
                    <div className="px-3 py-6 text-center text-[12px]" style={{ color: `${INK}66` }}>Nenhuma playlist.</div>
                  )}
                </div>
              </div>

              {/* DETALHE DA PLAYLIST */}
              {currentPl ? (
                <div className="space-y-4">
                  <div className={cardCls} style={cardStyle}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className={labelCls}>Nome da playlist</div>
                        <input className={inputCls} value={currentPl.nome}
                          onChange={e => updatePl(currentPl.id, { nome: e.target.value })} placeholder="Ex: Break manhã" />
                      </div>
                      <div>
                        <div className={labelCls}><Clock size={14} /> Faixa de horário</div>
                        <div className="flex items-center gap-2 h-11">
                          <Switch checked={currentPl.usarHorario} onCheckedChange={v => updatePl(currentPl.id, { usarHorario: v })} />
                          <input type="time" disabled={!currentPl.usarHorario} value={currentPl.horaInicio}
                            onChange={e => updatePl(currentPl.id, { horaInicio: e.target.value })}
                            className={cn(inputCls, "w-28", !currentPl.usarHorario && "opacity-40")} />
                          <span className="text-xs font-black" style={{ color: `${INK}77` }}>até</span>
                          <input type="time" disabled={!currentPl.usarHorario} value={currentPl.horaFim}
                            onChange={e => updatePl(currentPl.id, { horaFim: e.target.value })}
                            className={cn(inputCls, "w-28", !currentPl.usarHorario && "opacity-40")} />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className={labelCls}>Dias da semana</div>
                      <div className="flex flex-wrap gap-2">
                        {DIAS.map((d, i) => {
                          const on = currentPl.dias.includes(i);
                          return (
                            <button key={d} type="button"
                              onClick={() => updatePl(currentPl.id, {
                                dias: on ? currentPl.dias.filter(x => x !== i) : [...currentPl.dias, i].sort(),
                              })}
                              className="h-9 px-4 rounded-full text-[11px] font-black transition"
                              style={{
                                background: on ? LIME : "#fff",
                                border: `2px solid ${on ? INK : `${CYAN}33`}`,
                                color: INK,
                              }}>{d}</button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div
                    className="rounded-2xl bg-white overflow-hidden"
                    style={{ ...cardStyle, outline: dragOverPl ? `2px dashed ${CYAN}` : "none", outlineOffset: -4 }}
                    onDragOver={e => { e.preventDefault(); setDragOverPl(true); }}
                    onDragLeave={() => setDragOverPl(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOverPl(false);
                      const id = e.dataTransfer.getData("text/nexo-midia");
                      if (id) dropMidiaNaPlaylist(id);
                    }}
                  >
                    <div className="px-5 py-3.5 flex items-center gap-2 border-b" style={{ borderColor: `${INK}12` }}>
                      <div className="text-sm font-black" style={{ color: INK }}>Arquivos da playlist</div>
                      <div className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${CYAN}15`, color: CYAN }}>{currentPl.itens.length}</div>
                      <div className="text-[11px] ml-2" style={{ color: `${INK}77` }}>Arraste as mídias para cá</div>
                      <button type="button" onClick={() => breakFileRef.current?.click()}
                        className="ml-auto h-9 px-4 rounded-full text-[11px] font-black inline-flex items-center gap-1.5"
                        style={{ background: LIME, color: INK }}>
                        <Plus size={13} /> Incluir arquivos
                      </button>
                      <input ref={breakFileRef} type="file" multiple accept="video/*,audio/*" className="hidden"
                        onChange={e => addBreakFiles(e.target.files)} />
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: `${INK}08` }}>
                            {["#", "Arquivo", "Duração", ""].map(h => (
                              <th key={h} className="text-left px-4 py-2.5 text-[11px] font-black uppercase tracking-wider" style={{ color: `${INK}99` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {currentPl.itens.map((p, i) => (
                            <tr key={p.id} className="border-b last:border-0" style={{ borderColor: `${INK}0F` }}>
                              <td className="px-4 py-3 tabular-nums" style={{ color: `${INK}66` }}>{i + 1}</td>
                              <td className="px-4 py-3 font-bold" style={{ color: INK }}>{p.titulo}</td>
                              <td className="px-4 py-3 tabular-nums" style={{ color: INK }}>{p.duracao}</td>
                              <td className="px-4 py-3 text-right">
                                <button type="button"
                                  onClick={() => updatePl(currentPl.id, { itens: currentPl.itens.filter(x => x.id !== p.id) })}
                                  className="w-9 h-9 rounded-full inline-flex items-center justify-center"
                                  style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}><Trash2 size={15} /></button>
                              </td>
                            </tr>
                          ))}
                          {currentPl.itens.length === 0 && (
                            <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: `${INK}66` }}>Playlist vazia.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button type="button" onClick={() => toast({ title: "Break salvo", description: currentPl.nome })}
                      className="h-11 px-6 rounded-full text-sm font-black flex items-center gap-2"
                      style={{ background: LIME, color: INK }}>
                      <Save size={16} /> Salvar break
                    </button>
                  </div>
                </div>
              ) : (
                <div className={cardCls} style={cardStyle}>
                  <div className="py-10 text-center text-sm" style={{ color: `${INK}66` }}>Crie um break para começar.</div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* MODAL NOVO CLIENTE */}
      <Dialog open={novoClienteOpen} onOpenChange={setNovoClienteOpen}>
        <DialogContent className="sm:max-w-2xl bg-white" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
          <DialogHeader>
            <DialogTitle style={{ color: INK }}>Cadastro de cliente</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <div className={labelCls}>Razão social</div>
              <input className={inputCls} value={novoCliente.nome} onChange={e => setNovoCliente(n => ({ ...n, nome: e.target.value }))} placeholder="Nome da empresa" />
            </div>
            <div>
              <div className={labelCls}>CNPJ</div>
              <input className={inputCls} value={novoCliente.cnpj} onChange={e => setNovoCliente(n => ({ ...n, cnpj: e.target.value }))} placeholder="00.000.000/0000-00" />
            </div>
            <div>
              <div className={labelCls}>Telefone</div>
              <input className={inputCls} value={novoCliente.telefone} onChange={e => setNovoCliente(n => ({ ...n, telefone: e.target.value }))} placeholder="(00) 00000-0000" />
            </div>
            <div className="md:col-span-2">
              <div className={labelCls}>Endereço</div>
              <input className={inputCls} value={novoCliente.endereco} onChange={e => setNovoCliente(n => ({ ...n, endereco: e.target.value }))} placeholder="Rua, número, bairro, cidade - UF" />
            </div>
            <div>
              <div className={labelCls}>Cliente desde</div>
              <input type="date" className={inputCls} value={novoCliente.cliente_desde} onChange={e => setNovoCliente(n => ({ ...n, cliente_desde: e.target.value }))} />
            </div>
            <div>
              <div className={labelCls}>Gerente executiva</div>
              <input className={inputCls} value={novoCliente.executiva_venda} onChange={e => setNovoCliente(n => ({ ...n, executiva_venda: e.target.value }))} placeholder="Nome da gerente" />
            </div>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setNovoClienteOpen(false)}
              className="h-11 px-5 rounded-full text-sm font-bold" style={{ background: "#fff", border: `2px solid ${CYAN}`, color: INK }}>
              Cancelar
            </button>
            <button type="button" onClick={salvarNovoCliente} disabled={salvandoCliente}
              className="h-11 px-6 rounded-full text-sm font-black inline-flex items-center gap-2 disabled:opacity-60"
              style={{ background: LIME, color: INK }}>
              {salvandoCliente ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar cliente
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL PRÉVIA DE VIEWS */}
      <Dialog open={!!previewCampanha} onOpenChange={o => !o && setPreviewCampanha(null)}>
        <DialogContent className="sm:max-w-md bg-white" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
          <DialogHeader>
            <DialogTitle style={{ color: INK }}>Prévia · {previewCampanha?.nome}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: "Views", v: previewCampanha?.views ?? 0 },
              { l: "Clicks", v: previewCampanha?.clicks ?? 0 },
            ].map(k => (
              <div key={k.l} className="rounded-2xl p-4" style={{ background: `${CYAN}0F` }}>
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: `${INK}88` }}>{k.l}</div>
                <div className="text-2xl font-black" style={{ color: INK }}>{k.v.toLocaleString("pt-BR")}</div>
              </div>
            ))}
          </div>
          <div className="text-[11px]" style={{ color: `${INK}99` }}>
            Cliente: <b style={{ color: INK }}>{previewCampanha?.cliente}</b> · Mídia: {previewCampanha?.midia || "—"}
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL DE RELATÓRIO */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-lg bg-white" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
          <DialogHeader>
            <DialogTitle style={{ color: INK }}>Relatório da campanha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl p-3 text-[12px]" style={{ background: `${CYAN}0F`, color: INK }}>
              Campanha: <b>{reportTarget?.nome}</b> · Cliente: <b>{reportTarget?.cliente}</b>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={labelCls}>Período de</div>
                {datePicker(reportFrom, setReportFrom, "Início")}
              </div>
              <div>
                <div className={labelCls}>Período até</div>
                {datePicker(reportTo, setReportTo, "Fim")}
              </div>
            </div>
            <div>
              <div className={labelCls}>Métricas</div>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "views", label: "Views" },
                  { id: "clicks", label: "Clicks" },
                  { id: "ctr", label: "CTR" },
                  { id: "alcance", label: "Alcance" },
                  { id: "conversao", label: "Conversão" },
                ].map(m => {
                  const on = reportMetrics.includes(m.id);
                  return (
                    <button key={m.id} type="button"
                      onClick={() => setReportMetrics(l => on ? l.filter(x => x !== m.id) : [...l, m.id])}
                      className="h-9 px-4 rounded-full text-[11px] font-black transition"
                      style={{ background: on ? LIME : "#fff", border: `2px solid ${on ? INK : `${CYAN}33`}`, color: INK }}>
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className={labelCls}>Frequência de envio</div>
                <Select value={reportFreq} onValueChange={setReportFreq}>
                  <SelectTrigger className={cn(inputCls, "justify-between")}><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white z-50">
                    <SelectItem value="diario">Diário</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="quinzenal">Quinzenal</SelectItem>
                    <SelectItem value="fim">Fim da campanha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className={labelCls}>E-mail do cliente</div>
                <input className={inputCls} value={reportEmail} onChange={e => setReportEmail(e.target.value)} placeholder="cliente@email.com" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => {
              toast({ title: "Relatório configurado", description: `${reportMetrics.length} métricas · envio ${reportFreq}` });
              setReportOpen(false);
            }}
              className="h-11 px-6 rounded-full text-sm font-black"
              style={{ background: LIME, color: INK }}>Salvar relatório</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
