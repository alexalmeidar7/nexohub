import { useMemo, useRef, useState } from "react";
import {
  Film, Music, MessageCircle, Upload, CalendarIcon, Plus, Save, Settings2,
  BarChart3, Radio, Trash2, ShieldCheck, Link2, X,
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
import adsBanner from "@/assets/ads-banner.png";

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

/* ------------------------------------------------------------------ *
 * MOCK DATA
 * ------------------------------------------------------------------ */
const MOCK_REPORTS = [
  { id: "1", campanha: "Promoção Dia dos Pais", cliente: "Supermercado Nexo", views: 18450, clicks: 1230, status: "Ativa" },
  { id: "2", campanha: "Black Friday Antecipada", cliente: "Loja Vitória", views: 42980, clicks: 3810, status: "Ativa" },
  { id: "3", campanha: "Institucional Verão", cliente: "Prefeitura", views: 9120, clicks: 340, status: "Encerrada" },
  { id: "4", campanha: "Lançamento Podcast", cliente: "Nexo Brasil", views: 2310, clicks: 190, status: "Pausada" },
];

const MOCK_BREAK_PLAYLIST = [
  { id: "b1", titulo: "Spot 30s — Supermercado Nexo", duracao: "00:30", cliente: "Supermercado Nexo" },
  { id: "b2", titulo: "VT 15s — Loja Vitória", duracao: "00:15", cliente: "Loja Vitória" },
  { id: "b3", titulo: "Institucional Rádio", duracao: "00:20", cliente: "Interno" },
  { id: "b4", titulo: "Spot 30s — Auto Center", duracao: "00:30", cliente: "Auto Center" },
];

/* ------------------------------------------------------------------ *
 * LÓGICA DE GATILHO DO BREAK COMERCIAL (mock / referência)
 * ------------------------------------------------------------------
 * O player "escuta" o metadado da música no ar. Quando o nome do
 * artista for igual à palavra-chave configurada (default: 'BREAK'),
 * o streaming ao vivo é pausado e a playlist de break é executada em
 * ordem randomizada. Quando o metadado volta a ser diferente, o
 * player retorna ao stream ao vivo.
 * ------------------------------------------------------------------ */
export function handleMetadataTick(
  nomeDoArtista: string,
  palavraChave: string,
  playlist: { id: string; titulo: string }[],
) {
  if (nomeDoArtista.trim().toUpperCase() === palavraChave.trim().toUpperCase()) {
    // pausa o streaming ao vivo
    const randomizada = [...playlist].sort(() => Math.random() - 0.5);
    return { action: "PLAY_BREAK" as const, playlist: randomizada };
  }
  // retorna para o stream ao vivo
  return { action: "RESUME_LIVE" as const, playlist: [] };
}

export default function AdsPage() {
  /* ---------------- ABA 1: estado local do formulário ---------------- */
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

  function saveCampaign() {
    if (!name.trim() || !client.trim()) {
      toast({ title: "Preencha nome da campanha e cliente", variant: "destructive" });
      return;
    }
    if (!chVideo && !chAudio && !chChatbot) {
      toast({ title: "Selecione ao menos um posicionamento", variant: "destructive" });
      return;
    }
    const payload = {
      name: name.trim(),
      client: client.trim(),
      startDate: startDate ? startDate.toISOString() : null,
      endDate: endDate ? endDate.toISOString() : null,
      placements: {
        video: chVideo ? { slot: videoSlot } : null,
        audio: chAudio ? { slot: "preroll" } : null,
        chatbot: chChatbot ? { message: botMessage, link: botLink } : null,
      },
      media: file ? { name: file.name, type: file.type, size: file.size } : null,
    };
    // MOCK POST
    console.log("[ADS] POST /campaigns", payload);
    toast({ title: "Campanha pronta para envio", description: "Payload enviado no console (mock)." });
  }

  /* ---------------- ABA 2: relatórios e breaks ---------------- */
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<typeof MOCK_REPORTS[number] | null>(null);
  const [reportFreq, setReportFreq] = useState("semanal");

  const [breaksOn, setBreaksOn] = useState(true);
  const [triggerWord, setTriggerWord] = useState("BREAK");
  const [playlist, setPlaylist] = useState(MOCK_BREAK_PLAYLIST);

  const totals = useMemo(() => ({
    views: MOCK_REPORTS.reduce((a, r) => a + r.views, 0),
    clicks: MOCK_REPORTS.reduce((a, r) => a + r.clicks, 0),
  }), []);

  const toggleCard = (active: boolean, onClick: () => void, Icon: any, label: string, hint: string) => (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-2xl p-4 transition-all"
      style={{
        background: active ? LIME : "#fff",
        border: `2px solid ${active ? INK : `${CYAN}33`}`,
        boxShadow: active ? `0 8px 24px ${LIME}66` : "0 4px 14px rgba(0,33,50,0.05)",
      }}
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
        style={{ background: active ? "rgba(0,33,50,0.12)" : `${CYAN}15`, color: active ? INK : CYAN }}>
        <Icon size={19} />
      </div>
      <div className="text-sm font-black" style={{ color: INK }}>{label}</div>
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

  return (
    <div className="nexo-scope animate-fade-in" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
      <div className="relative rounded-2xl overflow-hidden mb-5" style={{ background: BG, boxShadow: "0 8px 32px rgba(0,0,0,0.10)" }}>
        <img src={adsBanner} alt="Como você quer anunciar?" style={{ width: "100%", height: "auto", display: "block" }} />
      </div>

      <div className="rounded-3xl p-6" style={{ background: BG }}>
        <Tabs defaultValue="nova">
          <TabsList className="bg-white/70 rounded-full p-1 mb-5">
            <TabsTrigger value="nova" className="rounded-full text-xs font-bold uppercase tracking-wider data-[state=active]:bg-[#C6F03C] data-[state=active]:text-[#002132]">
              <Plus size={14} className="mr-1.5" /> Nova campanha
            </TabsTrigger>
            <TabsTrigger value="gestao" className="rounded-full text-xs font-bold uppercase tracking-wider data-[state=active]:bg-[#C6F03C] data-[state=active]:text-[#002132]">
              <Settings2 size={14} className="mr-1.5" /> Gestão de campanhas
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
                  <input className={inputCls} value={client} onChange={e => setClient(e.target.value)} placeholder="Ex: Supermercado Nexo" />
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
                        <SelectContent>
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

              <div className="flex justify-end mt-5">
                <button type="button" onClick={saveCampaign}
                  className="h-11 px-6 rounded-full text-sm font-black flex items-center gap-2 transition hover:brightness-95"
                  style={{ background: LIME, color: INK, boxShadow: `0 6px 20px ${LIME}55` }}>
                  <Save size={16} /> Salvar campanha
                </button>
              </div>
            </div>
          </TabsContent>

          {/* ================= ABA 2 ================= */}
          <TabsContent value="gestao" className="mt-0">
            <Tabs defaultValue="relatorios">
              <TabsList className="bg-white/70 rounded-full p-1 mb-5">
                <TabsTrigger value="relatorios" className="rounded-full text-xs font-bold uppercase tracking-wider data-[state=active]:bg-[#00BFF0] data-[state=active]:text-white">
                  <BarChart3 size={14} className="mr-1.5" /> Relatórios
                </TabsTrigger>
                <TabsTrigger value="breaks" className="rounded-full text-xs font-bold uppercase tracking-wider data-[state=active]:bg-[#00BFF0] data-[state=active]:text-white">
                  <Radio size={14} className="mr-1.5" /> Break comercial
                </TabsTrigger>
              </TabsList>

              {/* SUB-ABA RELATÓRIOS */}
              <TabsContent value="relatorios" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: "Campanhas", value: MOCK_REPORTS.length },
                    { label: "Views totais", value: totals.views.toLocaleString("pt-BR") },
                    { label: "Clicks totais", value: totals.clicks.toLocaleString("pt-BR") },
                  ].map(k => (
                    <div key={k.label} className="rounded-2xl bg-white p-4" style={cardStyle}>
                      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: `${INK}80` }}>{k.label}</div>
                      <div className="text-2xl font-black mt-1" style={{ color: INK }}>{k.value}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl bg-white overflow-hidden" style={cardStyle}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: CYAN }}>
                          {["Campanha", "Cliente", "Views", "Clicks", "Status", ""].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-[11px] font-black uppercase tracking-wider text-white">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {MOCK_REPORTS.map(r => (
                          <tr key={r.id} className="border-b last:border-0" style={{ borderColor: `${INK}10` }}>
                            <td className="px-4 py-3 font-bold" style={{ color: INK }}>{r.campanha}</td>
                            <td className="px-4 py-3" style={{ color: `${INK}CC` }}>{r.cliente}</td>
                            <td className="px-4 py-3 tabular-nums" style={{ color: INK }}>{r.views.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-3 tabular-nums" style={{ color: INK }}>{r.clicks.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-3">
                              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                                style={{
                                  background: r.status === "Ativa" ? `${LIME}55` : r.status === "Pausada" ? "rgba(234,179,8,0.2)" : "rgba(0,33,50,0.1)",
                                  color: r.status === "Pausada" ? "#a16207" : INK,
                                }}>{r.status}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button type="button"
                                onClick={() => { setReportTarget(r); setReportOpen(true); }}
                                className="h-9 px-4 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5"
                                style={{ background: `${CYAN}15`, color: CYAN }}>
                                <Settings2 size={13} /> Configurar relatório
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>

              {/* SUB-ABA BREAKS */}
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

                  <div className="mt-4 rounded-2xl p-4 text-[11px] leading-relaxed" style={{ background: `${CYAN}0F`, color: INK }}>
                    <b>Lógica do gatilho:</b> o player escuta o metadado da música no ar. Se
                    {" "}<code className="font-mono">nomeDoArtista === "{triggerWord || "BREAK"}"</code>, o streaming ao vivo é pausado e a
                    playlist de break roda em ordem randomizada (<code className="font-mono">Math.random()</code>). Quando o metadado muda,
                    o player retorna ao stream ao vivo.
                  </div>
                </div>

                <div className="rounded-2xl bg-white overflow-hidden" style={cardStyle}>
                  <div className="px-5 py-3.5 flex items-center gap-2 border-b" style={{ borderColor: `${INK}12` }}>
                    <div className="text-sm font-black" style={{ color: INK }}>Playlist do break</div>
                    <div className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${CYAN}15`, color: CYAN }}>{playlist.length}</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: `${INK}08` }}>
                          {["Vídeo", "Cliente", "Duração", ""].map(h => (
                            <th key={h} className="text-left px-4 py-2.5 text-[11px] font-black uppercase tracking-wider" style={{ color: `${INK}99` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {playlist.map(p => (
                          <tr key={p.id} className="border-b last:border-0" style={{ borderColor: `${INK}0F` }}>
                            <td className="px-4 py-3 font-bold" style={{ color: INK }}>{p.titulo}</td>
                            <td className="px-4 py-3" style={{ color: `${INK}CC` }}>{p.cliente}</td>
                            <td className="px-4 py-3 tabular-nums" style={{ color: INK }}>{p.duracao}</td>
                            <td className="px-4 py-3 text-right">
                              <button type="button" onClick={() => setPlaylist(list => list.filter(i => i.id !== p.id))}
                                className="w-9 h-9 rounded-full inline-flex items-center justify-center"
                                style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}><Trash2 size={15} /></button>
                            </td>
                          </tr>
                        ))}
                        {playlist.length === 0 && (
                          <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: `${INK}66` }}>Playlist vazia.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>

      {/* MODAL DE RELATÓRIO */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-md" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
          <DialogHeader>
            <DialogTitle style={{ color: INK }}>Configurar relatório</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-[11px]" style={{ color: `${INK}99` }}>
              Campanha: <b style={{ color: INK }}>{reportTarget?.campanha}</b>
            </div>
            <div>
              <div className={labelCls}>Frequência de envio por e-mail</div>
              <Select value={reportFreq} onValueChange={setReportFreq}>
                <SelectTrigger className={cn(inputCls, "justify-between")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="quinzenal">Quinzenal</SelectItem>
                  <SelectItem value="fim">Fim da campanha</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => {
              console.log("[ADS] agendar relatório", { campanha: reportTarget?.campanha, frequencia: reportFreq });
              toast({ title: "Envio agendado", description: `Relatório ${reportFreq} configurado (mock).` });
              setReportOpen(false);
            }}
              className="h-11 px-6 rounded-full text-sm font-black"
              style={{ background: LIME, color: INK }}>Salvar agendamento</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
