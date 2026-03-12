import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { usePdfPopup, PdfPopup } from "@/components/PdfPopup";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, FileText, Building2, Clock, Plus, X, Download, UserPlus, Check, Bold, Underline, Highlighter, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Type, Trash2, Pencil, Save, History, ArrowLeft, Send, MessageSquare, Code2, Copy, Columns, Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { injectPerguntaActions } from "@/lib/roteiroActions";
import { sanitizeRoteiroHtml } from "@/lib/sanitizeRoteiroHtml";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

const NoticiasPanel = lazy(() => import("./NoticiasPanel"));
const WhatsAppSendDialog = lazy(() => import("./WhatsAppSendDialog"));

interface Apresentador {
  id: string;
  nome: string;
  cargo: string;
  instagram?: string;
  whatsapp?: string;
  ativo: boolean;
}

interface Programa {
  id: string;
  nome: string;
  estudio: string;
  tipo_programa: string | null;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: string[];
  apresentador_id: string | null;
  capa: string | null;
  selo: string | null;
}

export default function RoteiroPrograma() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const pdfPopup = usePdfPopup();
  const [estudio, setEstudio] = useState("");
  const [programaNome, setProgramaNome] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [horario, setHorario] = useState("");
  const [tipoPrograma, setTipoPrograma] = useState("");
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const [loading, setLoading] = useState(true);
  const [estudios, setEstudios] = useState<string[]>([]);
  const [tiposPrograma, setTiposPrograma] = useState<string[]>([]);
  const [showRoteiro, setShowRoteiro] = useState(false);
  const [roteiroTitulo, setRoteiroTitulo] = useState("");
  const [roteiroSubtitulo, setRoteiroSubtitulo] = useState("");
  const [roteiroTexto, setRoteiroTexto] = useState("");
  const [assuntoSubtitulo, setAssuntoSubtitulo] = useState("");
  const [fontSize, setFontSize] = useState("14");
  const [perguntaCount, setPerguntaCount] = useState(1);
  const editorRef = useRef<HTMLDivElement>(null);
  const exportViewRef = useRef<HTMLDivElement>(null);
  const [participantes, setParticipantes] = useState<{ nome: string; categoria: string; cargo: string; instagram: string; whatsapp?: string }[]>([]);
  
  const [newNome, setNewNome] = useState("");
  const [newCategoria, setNewCategoria] = useState("Apresentador(a)");
  const [newCargoText, setNewCargoText] = useState("");
  const [newInstagram, setNewInstagram] = useState("");
  const [newWhatsapp, setNewWhatsapp] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedFromDb, setSelectedFromDb] = useState(false);
  const [cadastroMsg, setCadastroMsg] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isAgendado = selectedDate > new Date(new Date().toDateString());

  // Histórico de roteiros
  const [historico, setHistorico] = useState<any[]>([]);
  const [editingRoteiroId, setEditingRoteiroId] = useState<string | null>(null);
  const [numeroRoteiro, setNumeroRoteiro] = useState<number | null>(null);
  const [savingRoteiro, setSavingRoteiro] = useState(false);
  const [showParticipantForm, setShowParticipantForm] = useState(false);
  const [showExportView, setShowExportView] = useState(false);
  const [apresentadorStatus, setApresentadorStatus] = useState<{ editado: boolean; editadoAt: string | null; login: string | null } | null>(null);
  const [mergeCells, setMergeCells] = useState<HTMLTableCellElement[]>([]);
  const mergeHighlightColor = "rgba(38,143,250,0.18)";
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [whatsAppHistoricoData, setWhatsAppHistoricoData] = useState<any>(null);

  const fetchApresentadorStatus = async (roteiroId: string) => {
    const { data } = await supabase.from("roteiros").select("apresentador_editado, editado_at, share_login").eq("id", roteiroId).maybeSingle();
    if (data) setApresentadorStatus({ editado: !!data.apresentador_editado, editadoAt: data.editado_at, login: data.share_login });
  };

  // Auto-refresh apresentador status while export view is open
  useEffect(() => {
    if (!showExportView || !editingRoteiroId) return;
    const interval = setInterval(() => fetchApresentadorStatus(editingRoteiroId), 5000);
    return () => clearInterval(interval);
  }, [showExportView, editingRoteiroId]);

  const categorias = ["Apresentador(a)", "Jornalista", "Convidado(a)"];

  // Filter suggestions based on typed name
  const nameSuggestions = newNome.trim().length >= 2
    ? apresentadores.filter(a => a.nome.toLowerCase().includes(newNome.toLowerCase().trim()))
    : [];

  // Derive tipos filtered by estudio
  const tiposFiltrados = estudio
    ? [...new Set(programas.filter(p => p.estudio === estudio).map(p => p.tipo_programa).filter(Boolean))] as string[]
    : [...new Set(programas.map(p => p.tipo_programa).filter(Boolean))] as string[];

  // Filter programs by estudio + tipo
  const programasFiltrados = programas.filter(p => {
    if (estudio && p.estudio !== estudio) return false;
    if (tipoPrograma && p.tipo_programa !== tipoPrograma) return false;
    return true;
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const [progRes, apresRes] = await Promise.all([
        supabase.from("programas").select("id, nome, estudio, tipo_programa, horario_inicio, horario_fim, dias_semana, apresentador_id, capa, selo").eq("ativo", true),
        supabase.from("apresentadores").select("id, nome, cargo, instagram, whatsapp, ativo").eq("ativo", true),
      ]);
      const progs = progRes.data || [];
      const apres = apresRes.data || [];
      setProgramas(progs);
      setApresentadores(apres);

      const uniqueEstudios = [...new Set(progs.map(p => p.estudio).filter(Boolean))] as string[];
      setEstudios(uniqueEstudios);

      setLoading(false);
    };
    load();
  }, [user]);

  // Fetch historico
  const fetchHistorico = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("roteiros")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    setHistorico(data || []);
  };

  useEffect(() => {
    if (user) fetchHistorico();
  }, [user]);

  const salvarRoteiro = async () => {
    if (!user) return;
    setSavingRoteiro(true);
    const now = new Date();
    const status = isAgendado ? "agendado" : "salvo";
    const payload = {
      user_id: user.id,
      programa_nome: programaNome,
      estudio,
      tipo_programa: tipoPrograma,
      data_programa: format(selectedDate, "yyyy-MM-dd"),
      horario,
      titulo: roteiroTitulo,
      subtitulo: JSON.stringify({ titulo: roteiroSubtitulo, obs: assuntoSubtitulo }),
      conteudo_html: sanitizeRoteiroHtml(editorRef.current?.innerHTML || roteiroTexto),
      participantes: JSON.stringify(participantes),
      status,
    };

    let error;
    if (editingRoteiroId) {
      const { error: updateError, data: updatedData } = await supabase.from("roteiros").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingRoteiroId).select("numero_roteiro").single();
      error = updateError;
      if (updatedData) setNumeroRoteiro(updatedData.numero_roteiro);
    } else {
      // Check for duplicate (same programa + data + user)
      const { data: existing } = await supabase
        .from("roteiros")
        .select("id")
        .eq("user_id", user.id)
        .eq("programa_nome", programaNome)
        .eq("data_programa", format(selectedDate, "yyyy-MM-dd"))
        .maybeSingle();

      if (existing) {
        // Replace existing roteiro
        const { error: replaceError, data: replacedData } = await supabase.from("roteiros").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", existing.id).select("numero_roteiro").single();
        error = replaceError;
        if (replacedData) setNumeroRoteiro(replacedData.numero_roteiro);
        setEditingRoteiroId(existing.id);
      } else {
        const { error: insertError, data: insertedData } = await supabase.from("roteiros").insert(payload).select("numero_roteiro").single();
        error = insertError;
        if (insertedData) setNumeroRoteiro(insertedData.numero_roteiro);
      }
    }

    setSavingRoteiro(false);
    if (error) {
      toast.error("Erro ao salvar roteiro");
    } else {
      toast.success(editingRoteiroId ? "Roteiro atualizado!" : "Roteiro salvo!");

      // Se data futura, criar evento na agenda
      if (isAgendado && !editingRoteiroId) {
        const descricao = `Roteiro: ${programaNome}${roteiroTitulo ? ` — ${roteiroTitulo}` : ""}`;
        await supabase.from("agenda_eventos").insert({
          user_id: user.id,
          data: format(selectedDate, "yyyy-MM-dd"),
          descricao,
          local: estudio || "",
          prioridade: "normal",
          recorrencia: "unico",
          programa_id: programas.find(p => p.nome === programaNome)?.id || null,
        });
      }

      setEditingRoteiroId(null);
      fetchHistorico();
      
      // Reopen export view and scroll to end
      setShowExportView(true);
      setTimeout(() => {
        if (exportViewRef.current) {
          exportViewRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      }, 300);
    }
  };

  const excluirRoteiro = async (id: string) => {
    // Find the roteiro to get its details for agenda cleanup
    const roteiro = historico.find(r => r.id === id);
    const { error } = await supabase.from("roteiros").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir roteiro");
    } else {
      // Remove associated agenda event
      if (roteiro && user) {
        const descricao = `Roteiro: ${roteiro.programa_nome}${roteiro.titulo ? ` — ${roteiro.titulo}` : ""}`;
        await supabase.from("agenda_eventos").delete()
          .eq("user_id", user.id)
          .eq("data", roteiro.data_programa)
          .like("descricao", `Roteiro: ${roteiro.programa_nome}%`);
      }
      toast.success("Roteiro excluído");
      fetchHistorico();
    }
  };

  // Restore editor content when showRoteiro becomes true and roteiroTexto has content
  useEffect(() => {
    if (!showRoteiro || !roteiroTexto) return;
    const tryRestore = () => {
      if (editorRef.current && !editorRef.current.innerHTML.trim()) {
        editorRef.current.innerHTML = roteiroTexto;
        injectPerguntaActions(editorRef.current);
      }
    };
    // Try immediately and with delays to handle rendering timing
    tryRestore();
    const t1 = setTimeout(tryRestore, 100);
    const t2 = setTimeout(tryRestore, 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [showRoteiro, roteiroTexto]);

  const editarRoteiro = (r: any) => {
    setEstudio(r.estudio || "");
    setTipoPrograma(r.tipo_programa || "");
    setProgramaNome(r.programa_nome || "");
    setSelectedDate(new Date(r.data_programa + "T12:00:00"));
    setHorario(r.horario || "");
    setRoteiroTitulo(r.titulo || "");
    try {
      const sub = JSON.parse(r.subtitulo || "{}");
      if (sub && typeof sub === "object" && ("titulo" in sub || "obs" in sub)) {
        setRoteiroSubtitulo(sub.titulo || "");
        setAssuntoSubtitulo(sub.obs || "");
      } else {
        setRoteiroSubtitulo(r.subtitulo || "");
        setAssuntoSubtitulo("");
      }
    } catch {
      setRoteiroSubtitulo(r.subtitulo || "");
      setAssuntoSubtitulo("");
    }
    setRoteiroTexto(r.conteudo_html || "");
    try {
      setParticipantes(typeof r.participantes === "string" ? JSON.parse(r.participantes) : r.participantes || []);
    } catch { setParticipantes([]); }
    setEditingRoteiroId(r.id);
    setNumeroRoteiro(r.numero_roteiro || null);
    setShowRoteiro(true);
    setShowExportView(false);
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = r.conteudo_html || "";
        injectPerguntaActions(editorRef.current);
      }
    }, 150);
  };

  const handleEstudioChange = (val: string) => {
    setEstudio(val);
    setProgramaNome("");
    setHorario("");
    // Auto-select tipo if only one option
    const tipos = val
      ? [...new Set(programas.filter(p => p.estudio === val).map(p => p.tipo_programa).filter(Boolean))] as string[]
      : [...new Set(programas.map(p => p.tipo_programa).filter(Boolean))] as string[];
    setTipoPrograma(tipos.length === 1 ? tipos[0] : "");
  };

  const handleTipoChange = (tipo: string) => {
    setTipoPrograma(tipo);
    setProgramaNome("");
    setHorario("");
  };

  const handleProgramaChange = (nome: string) => {
    setProgramaNome(nome);
    const prog = programas.find(p => p.nome === nome);
    if (prog) {
      if (prog.horario_inicio) {
        setHorario(prog.horario_inicio.slice(0, 5));
      }
    }
  };

  const handleMontarRoteiro = () => {
    const prog = programas.find(p => p.nome === programaNome);
    const defaultParticipantes: { nome: string; categoria: string; cargo: string; instagram: string; whatsapp?: string }[] = [];
    if (prog?.apresentador_id) {
      const apres = apresentadores.find(a => a.id === prog.apresentador_id);
      if (apres) {
        defaultParticipantes.push({ nome: apres.nome, categoria: apres.cargo || "Apresentador(a)", cargo: apres.cargo || "", instagram: apres.instagram || "", whatsapp: apres.whatsapp || "" });
      }
    }
    setParticipantes(defaultParticipantes);
    setRoteiroTitulo("");
    setRoteiroSubtitulo("");
    setRoteiroTexto("");
    setShowRoteiro(true);
    setNumeroRoteiro(null);
    setEditingRoteiroId(null);

    const tdStyle = "border:1px solid rgba(13,4,70,0.10);padding:10px 12px;word-wrap:break-word;overflow-wrap:break-word;vertical-align:top;line-height:1.6";
    const thStyle = `${tdStyle};text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;color:#0d0446;background:rgba(38,143,250,0.06)`;
    const actionBtnStyle = "cursor:pointer;padding:2px 6px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:13px";
    const perguntaActions = `<td style="${tdStyle};white-space:nowrap;text-align:center;width:90px" contenteditable="false"><span data-action="move-up" style="${actionBtnStyle};color:#268ffa" title="Mover para cima">▲</span> <span data-action="move-down" style="${actionBtnStyle};color:#268ffa" title="Mover para baixo">▼</span> <span data-action="delete-pergunta" style="${actionBtnStyle};color:#dc2626" title="Remover pergunta">🗑</span></td>`;
    const elStyle = `${tdStyle};font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.3px;color:#0d0446`;
    const timeStyle = `${tdStyle};font-family:monospace;font-size:12px;color:rgba(13,4,70,0.5);text-align:center`;

    const defaultContent = `<table style="width:100%;border-collapse:collapse;font-size:13px;color:#0d0446;table-layout:fixed">
<colgroup><col style="width:70px"><col style="width:130px"><col><col style="width:90px"></colgroup>
<thead>
<tr>
<th style="${thStyle}">Tempo</th>
<th style="${thStyle}">Elemento</th>
<th style="${thStyle}">Descrição / Texto</th>
<th style="${thStyle};text-align:center">Ações</th>
</tr>
</thead>
<tbody>
<tr>
<td style="${timeStyle}">--:--</td>
<td style="${elStyle}">Vinheta</td>
<td style="${tdStyle}">Abertura padrão do programa (Áudio + Vídeo).</td>
<td style="${tdStyle}"></td>
</tr>
<tr>
<td style="${timeStyle}">--:--</td>
<td style="${elStyle}">Off / Cabeça</td>
<td style="${tdStyle}"><strong>APRESENTADOR:</strong> "Olá! Hoje o tema é sério. Vamos falar sobre como a informação é o melhor caminho contra a dependência química."</td>
<td style="${tdStyle};font-size:11px;color:rgba(13,4,70,0.5)">Abertura do programa</td>
</tr>
<tr>
<td style="${tdStyle};background:rgba(38,143,250,0.04)"></td>
<td style="${tdStyle};font-weight:700;color:#268ffa;background:rgba(38,143,250,0.04)" colspan="3">ENTREVISTA</td>
</tr>
<tr data-pergunta="1">
<td style="${timeStyle}">--:--</td>
<td style="${elStyle}">Pergunta 1</td>
<td style="${tdStyle}">[Insira a pergunta aqui]</td>
${perguntaActions}
</tr>
<tr data-action-row="true" contenteditable="false">
<td style="${tdStyle}" colspan="4">
<span data-action="add-pergunta" style="color:#268ffa;font-weight:600;font-size:12px;cursor:pointer">＋ adicionar pergunta</span>
</td>
</tr>
<tr>
<td style="${timeStyle}">--:--</td>
<td style="${elStyle}">Observações</td>
<td style="${tdStyle}">Inserir imagens de apoio (família conversando, centros de apoio) enquanto o convidado fala.</td>
<td style="${tdStyle}"></td>
</tr>
<tr>
<td style="${timeStyle}">--:--</td>
<td style="${elStyle}">Encerramento</td>
<td style="${tdStyle}"><strong>APRESENTADOR:</strong> "Agradecemos ao [Nome]. Se você precisa de ajuda, ligue para o [Número/CAPS]. Até amanhã."</td>
<td style="${tdStyle};font-size:11px;color:rgba(13,4,70,0.5)">Encerrar programa</td>
</tr>
</tbody>
</table>`;

    setPerguntaCount(1);

    // Preenche o editor com a estrutura padrão após render
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = defaultContent;
        setRoteiroTexto(defaultContent);
      }
    }, 100);
  };

  const selectSuggestion = (apres: Apresentador) => {
    setNewNome(apres.nome);
    const cargo = apres.cargo || "";
    const matchesCategoria = categorias.some(c => c.toLowerCase() === cargo.toLowerCase());
    setNewCategoria(matchesCategoria ? cargo : (cargo ? "Convidado(a)" : "Apresentador(a)"));
    setNewCargoText(matchesCategoria ? "" : cargo);
    setNewInstagram(apres.instagram || "");
    setNewWhatsapp(apres.whatsapp || "");
    setSelectedFromDb(true);
    setShowSuggestions(false);
  };

  const addParticipante = async () => {
    if (!newNome.trim()) return;
    const isNew = !selectedFromDb && !apresentadores.some(a => a.nome.toLowerCase() === newNome.trim().toLowerCase());
    
    setParticipantes(prev => [...prev, { nome: newNome.trim(), categoria: newCategoria, cargo: newCargoText.trim(), instagram: newInstagram.trim(), whatsapp: newWhatsapp.trim() }]);
    
    // If not from DB, register as new apresentador
    if (isNew && user) {
      await supabase.from("apresentadores").insert({
        nome: newNome.trim(),
        cargo: newCategoria,
        instagram: newInstagram.trim(),
        user_id: user.id,
        ativo: true,
      });
      const { data } = await supabase.from("apresentadores").select("id, nome, cargo, instagram, whatsapp, ativo").eq("ativo", true);
      if (data) setApresentadores(data);
      setCadastroMsg(true);
      setTimeout(() => setCadastroMsg(false), 4000);
    }
    
    setNewNome("");
    setNewCategoria("Apresentador(a)");
    setNewCargoText("");
    setNewInstagram("");
    setNewWhatsapp("");
    setSelectedFromDb(false);
  };

  const removeParticipante = (idx: number) => {
    setParticipantes(prev => prev.filter((_, i) => i !== idx));
  };

  if (loading) return <ModulePageSkeleton />;

  return (
    <div className="animate-fade-in space-y-5">
      {/* ── STEP 1: Configuração do Programa ── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#ffffff", boxShadow: "0 4px 24px rgba(13,4,70,0.08)", border: "1px solid rgba(13,4,70,0.06)" }}>
        {/* Section Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)", borderBottom: "1px solid rgba(13,4,70,0.06)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
              <FileText size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Roteiro de Programa</h3>
              <p className="text-[10px] text-white/50">Passo 1 — Selecione o programa e a data</p>
            </div>
          </div>
          {editingRoteiroId && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}>
              <Code2 size={14} className="text-white" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-white/80">XML</span>
              <button
                onClick={() => {
                  const xmlUrl = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/roteiro-xml?id=${editingRoteiroId}`;
                  navigator.clipboard.writeText(xmlUrl).then(() => toast.success("URL do XML copiada!")).catch(() => toast.error("Erro ao copiar"));
                }}
                className="p-1 rounded hover:bg-white/20 transition-colors"
                title="Copiar URL do XML"
              >
                <Copy size={12} className="text-white" />
              </button>
            </div>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* Row 1: Estúdio + Tipo + Programa */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "rgba(13,4,70,0.4)" }}>Identificação do programa</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "#0d0446" }}>
                  <Building2 size={12} style={{ color: "#268ffa" }} />Estúdio
                </label>
                <select
                  data-field="estudio"
                  value={estudio}
                  onChange={e => handleEstudioChange(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-xs outline-none transition-all focus:ring-2 focus:ring-[#268ffa]/20"
                  style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid rgba(13,4,70,0.1)", color: "#0d0446" }}
                >
                  <option value="">Selecione o estúdio</option>
                  {estudios.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold mb-1.5 block" style={{ color: "#0d0446" }}>Tipo de Programa</label>
                <select
                  value={tipoPrograma}
                  onChange={e => handleTipoChange(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-xs outline-none transition-all focus:ring-2 focus:ring-[#268ffa]/20"
                  style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid rgba(13,4,70,0.1)", color: "#0d0446" }}
                >
                  <option value="">Todos os tipos</option>
                  {tiposFiltrados.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "#0d0446" }}>
                  <FileText size={12} style={{ color: "#268ffa" }} />Programa
                </label>
                <select
                  data-field="programa"
                  value={programaNome}
                  onChange={e => handleProgramaChange(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-xs outline-none transition-all focus:ring-2 focus:ring-[#268ffa]/20"
                  style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid rgba(13,4,70,0.1)", color: "#0d0446" }}
                >
                  <option value="">Selecione o programa</option>
                  {programasFiltrados.map(p => <option key={p.id} value={p.nome}>{p.nome}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px" style={{ backgroundColor: "rgba(13,4,70,0.06)" }} />

          {/* Row 2: Data + Horário + Título */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "rgba(13,4,70,0.4)" }}>Data, horário e título</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "#0d0446" }}>
                  <CalendarIcon size={12} style={{ color: "#268ffa" }} />Data do Programa
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="w-full px-3 py-2.5 rounded-xl text-xs text-left flex items-center gap-2 outline-none transition-all hover:border-[#268ffa]/30"
                      style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid rgba(13,4,70,0.1)", color: "#0d0446" }}
                    >
                      <CalendarIcon size={12} style={{ color: "#268ffa" }} />
                      {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 border-none shadow-xl bg-white" align="start" style={{ borderRadius: "16px", overflow: "hidden" }}>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(d) => d && setSelectedDate(d)}
                      locale={ptBR}
                      className="p-4 pointer-events-auto"
                      classNames={{
                        months: "flex flex-col space-y-4",
                        month: "space-y-3",
                        caption: "flex justify-center pt-1 relative items-center",
                        caption_label: "text-sm font-bold",
                        nav: "space-x-1 flex items-center",
                        nav_button: "h-7 w-7 rounded-full flex items-center justify-center hover:opacity-100 transition-all",
                        nav_button_previous: "absolute left-1",
                        nav_button_next: "absolute right-1",
                        table: "w-full border-collapse",
                        head_row: "flex",
                        head_cell: "rounded-md w-9 font-semibold text-[0.7rem] uppercase",
                        row: "flex w-full mt-1",
                        cell: "h-9 w-9 text-center text-sm p-0 relative rounded-full",
                        day: "h-9 w-9 p-0 font-medium rounded-full transition-all hover:bg-[rgba(38,143,250,0.12)]",
                        day_selected: "bg-[#268ffa] text-white hover:bg-[#268ffa] focus:bg-[#268ffa] font-bold shadow-md",
                        day_today: "bg-[rgba(13,4,70,0.08)] font-bold",
                        day_outside: "opacity-30",
                        day_disabled: "opacity-30",
                        day_hidden: "invisible",
                      }}
                      styles={{
                        caption_label: { color: "#0d0446" },
                        head_cell: { color: "rgba(13,4,70,0.45)" },
                        day: { color: "#0d0446" },
                        nav_button: { color: "#268ffa", backgroundColor: "rgba(38,143,250,0.08)" },
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "#0d0446" }}>
                  <Clock size={12} style={{ color: "#268ffa" }} />Horário
                </label>
                <input
                  data-field="horario"
                  type="time"
                  value={horario}
                  onChange={e => setHorario(e.target.value)}
                  placeholder="Ex: 08:00"
                  className="w-full px-3 py-2.5 rounded-xl text-xs outline-none transition-all focus:ring-2 focus:ring-[#268ffa]/20"
                  style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid rgba(13,4,70,0.1)", color: "#0d0446" }}
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "#0d0446" }}>
                  <Type size={12} style={{ color: "#268ffa" }} />Título do Roteiro
                </label>
                <input
                  data-field="titulo"
                  value={roteiroTitulo}
                  onChange={e => setRoteiroTitulo(e.target.value)}
                  placeholder="Ex: Gravação de Podcast"
                  className="w-full px-3 py-2.5 rounded-xl outline-none transition-all focus:ring-2 focus:ring-[#268ffa]/20 uppercase text-sm font-bold"
                  style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid rgba(13,4,70,0.1)", color: "#0d0446" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Botão Montar Roteiro */}
      {!showRoteiro && programaNome && (
        <button
          onClick={handleMontarRoteiro}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff", boxShadow: "0 4px 16px rgba(38,143,250,0.3)" }}
        >
          Montar Roteiro
        </button>
      )}

      {/* Histórico de Roteiros */}
      {historico.length > 0 && (
        <div className="rounded-xl p-4 mt-4" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.08)" }}>
          <div className="flex items-center gap-2 mb-3">
            <History size={14} style={{ color: "#268ffa" }} />
            <p className="text-xs font-bold" style={{ color: "#0d0446" }}>Últimos roteiros</p>
          </div>
          <div className="space-y-2">
            {historico.map(r => {
              const dataFormatada = format(new Date(r.data_programa), "dd/MM/yyyy");
              const isAgd = r.status === "agendado";
              return (
                <div key={r.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg" style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid rgba(13,4,70,0.06)" }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold truncate" style={{ color: "#0d0446" }}>
                        {r.programa_nome || "Sem programa"}
                        {r.numero_roteiro && <span className="text-xs font-semibold" style={{ color: "rgba(13,4,70,0.5)" }}> #{r.numero_roteiro}</span>}
                      </p>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                        style={{
                          backgroundColor: isAgd ? "rgba(38,143,250,0.1)" : "rgba(13,4,70,0.06)",
                          color: isAgd ? "#268ffa" : "rgba(13,4,70,0.5)",
                        }}
                      >
                        {isAgd ? "agendado" : r.status}
                      </span>
                    </div>
                    <p className="text-xs font-medium mt-0.5" style={{ color: "rgba(13,4,70,0.6)" }}>
                      {dataFormatada} {r.horario ? `· ${r.horario}` : ""} {r.titulo ? `· ${r.titulo}` : ""}
                    </p>
                    {r.editado_at && (
                      <p className="text-[10px] mt-0.5" style={{ color: "rgba(13,4,70,0.4)" }}>
                        Editado por último em: {format(new Date(r.editado_at), "dd/MM/yyyy 'às' HH:mm")}
                        {r.share_login ? ` por: ${r.share_login}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button onClick={() => editarRoteiro(r)} className="h-7 w-7 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(38,143,250,0.08)" }} title="Editar">
                      <Pencil size={12} style={{ color: "#268ffa" }} />
                    </button>
                    <button onClick={() => excluirRoteiro(r.id)} className="h-7 w-7 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(220,38,38,0.08)" }} title="Excluir">
                      <Trash2 size={12} style={{ color: "#dc2626" }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Roteiro Form */}
      {showRoteiro && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "#ffffff", boxShadow: "0 4px 24px rgba(13,4,70,0.08)", border: "1px solid rgba(13,4,70,0.06)" }}>
          {/* Section Header */}
          <div className="px-6 py-4" style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)" }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Passo 2 — Conteúdo do Roteiro</p>
                <h2 className="text-lg font-bold text-white mt-0.5">
                  {programaNome}
                  {numeroRoteiro && <span className="text-sm font-medium ml-2 text-white/60">#{numeroRoteiro}</span>}
                </h2>
              </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={async () => { await salvarRoteiro(); fetchHistorico(); setShowRoteiro(false); setShowExportView(false); setEditingRoteiroId(null); }}
                    className="px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-all hover:bg-white/30"
                    style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff" }}
                  >
                    <X size={12} />
                    Fechar
                  </button>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#ffffff" }}>
                    Estúdio {estudio || "—"}
                </span>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#ffffff" }}>
                  {format(selectedDate, "dd/MM/yy", { locale: ptBR })} · {horario || "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Assunto */}
            <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(38,143,250,0.03)", border: "1px solid rgba(38,143,250,0.1)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "#268ffa" }}>
                Assunto do {tipoPrograma?.toLowerCase() || "programa"}
              </p>
              <input
                value={roteiroSubtitulo}
                onChange={e => setRoteiroSubtitulo(e.target.value)}
                placeholder="Título da entrevista"
                className="w-full px-3 py-2.5 rounded-xl text-sm font-bold outline-none mb-2 transition-all focus:ring-2 focus:ring-[#268ffa]/20"
                style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.08)", color: "#0d0446" }}
              />
              <input
                value={assuntoSubtitulo}
                onChange={e => setAssuntoSubtitulo(e.target.value)}
                placeholder="Subtítulo ou observação"
                className="w-full px-3 py-2.5 rounded-xl text-xs outline-none transition-all focus:ring-2 focus:ring-[#268ffa]/20"
                style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.08)", color: "#0d0446" }}
              />
            </div>

            {/* Divider */}
            <div className="h-px" style={{ backgroundColor: "rgba(13,4,70,0.06)" }} />

            {/* Participantes */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "rgba(13,4,70,0.4)" }}>Participantes</p>
            <div className="space-y-2">
              {participantes.map((p, idx) => (
                <div key={idx} className="rounded-xl p-3" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.08)" }}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-[10px] font-bold mb-1" style={{ color: "#268ffa" }}>Participante {idx + 1}</p>
                      <p className="text-xs font-bold" style={{ color: "#0d0446" }}>{p.nome}</p>
                      <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.5)" }}>{p.categoria}{p.cargo ? ` · ${p.cargo}` : ""}</p>
                      {p.instagram && <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.4)" }}>@{p.instagram.replace("@", "")}</p>}
                      {p.whatsapp && <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.4)" }}>📱 {p.whatsapp}</p>}
                    </div>
                    <button onClick={() => removeParticipante(idx)} className="hover:opacity-70 mt-1">
                      <X size={12} style={{ color: "rgba(13,4,70,0.3)" }} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Cadastro message */}
              {cadastroMsg && (
                <div className="rounded-xl p-3 flex items-center gap-2" style={{ backgroundColor: "rgba(38,143,250,0.1)", border: "1px solid rgba(38,143,250,0.3)" }}>
                  <Check size={14} style={{ color: "#268ffa" }} />
                  <p className="text-xs font-semibold" style={{ color: "#268ffa" }}>Cadastrei esse participante na nossa agenda!</p>
                </div>
              )}

              {/* Inline add participant fields */}
              {showParticipantForm ? (
                <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: "#ffffff", border: "1px dashed rgba(13,4,70,0.15)" }}>
                  <p className="text-[10px] font-bold" style={{ color: "#268ffa" }}>Participante {participantes.length + 1}</p>
                  
                  {/* Nome with autocomplete */}
                  <div className="relative">
                    <input
                      ref={nameInputRef}
                      value={newNome}
                      onChange={e => {
                        setNewNome(e.target.value);
                        setSelectedFromDb(false);
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="nome"
                      className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                      style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.08)", color: "#0d0446" }}
                    />
                    {showSuggestions && nameSuggestions.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 mt-1 rounded-lg overflow-hidden shadow-lg" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.12)" }}>
                        {nameSuggestions.map(s => (
                          <button
                            key={s.id}
                            onMouseDown={() => selectSuggestion(s)}
                            className="w-full text-left px-3 py-2 hover:bg-[rgba(38,143,250,0.08)] transition-colors flex items-center gap-2"
                          >
                            <UserPlus size={11} style={{ color: "#268ffa" }} />
                            <div>
                              <p className="text-xs font-semibold" style={{ color: "#0d0446" }}>{s.nome}</p>
                              <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.4)" }}>{s.cargo}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Categoria */}
                  <select
                    value={newCategoria}
                    onChange={e => setNewCategoria(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.08)", color: "#0d0446" }}
                  >
                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  {/* Cargo */}
                  <input
                    value={newCargoText}
                    onChange={e => setNewCargoText(e.target.value)}
                    placeholder="cargo (ex: Diretor, Produtor...)"
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.08)", color: "#0d0446" }}
                  />

                  <input
                    value={newInstagram}
                    onChange={e => setNewInstagram(e.target.value)}
                    placeholder="rede social (@usuario)"
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.08)", color: "#0d0446" }}
                   />
                  <input
                    value={newWhatsapp}
                    onChange={e => setNewWhatsapp(e.target.value)}
                    placeholder="whatsapp (ex: +55 11 99999-9999)"
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.08)", color: "#0d0446" }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        addParticipante();
                        // Keep form open, fields reset for next participant
                      }}
                      disabled={!newNome.trim()}
                      className="flex-1 py-2 rounded-lg text-xs font-bold transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5"
                      style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff" }}
                    >
                      <Save size={12} />
                      salvar participante
                    </button>
                    <button
                      onClick={() => setShowParticipantForm(false)}
                      className="px-3 py-2 rounded-lg text-xs font-bold transition-all hover:opacity-90"
                      style={{ border: "1px solid rgba(13,4,70,0.1)", color: "rgba(13,4,70,0.5)" }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowParticipantForm(true)}
                  className="w-full py-2.5 rounded-xl text-xs font-bold transition-all hover:opacity-90 flex items-center justify-center gap-1.5"
                  style={{ border: "1px dashed rgba(38,143,250,0.4)", color: "#268ffa", backgroundColor: "rgba(38,143,250,0.04)" }}
                >
                  <Plus size={12} />
                  adicionar participante
                </button>
              )}
            </div>
            </div>

            {/* Divider */}
            <div className="h-px" style={{ backgroundColor: "rgba(13,4,70,0.06)" }} />

            {/* Texto Roteiro */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "rgba(13,4,70,0.4)" }}>Conteúdo do roteiro</p>
              <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(13,4,70,0.02)", border: "1px solid rgba(13,4,70,0.06)" }}>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1 mb-3 pb-3" style={{ borderBottom: "1px solid rgba(13,4,70,0.08)" }}>
              {/* Font size */}
              <select
                value={fontSize}
                onChange={e => {
                  setFontSize(e.target.value);
                  document.execCommand("fontSize", false, "7");
                  // Override the font size via span styling
                  const sel = window.getSelection();
                  if (sel && sel.rangeCount > 0) {
                    const fonts = editorRef.current?.querySelectorAll('font[size="7"]');
                    fonts?.forEach(f => {
                      const span = document.createElement("span");
                      span.style.fontSize = e.target.value + "px";
                      span.innerHTML = f.innerHTML;
                      f.replaceWith(span);
                    });
                  }
                }}
                className="h-8 px-2 rounded-lg text-xs outline-none cursor-pointer"
                style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.08)", color: "#0d0446" }}
              >
                <option value="12">12px</option>
                <option value="14">14px</option>
                <option value="16">16px</option>
                <option value="18">18px</option>
                <option value="20">20px</option>
                <option value="24">24px</option>
                <option value="28">28px</option>
              </select>

              <div className="w-px h-5 mx-1" style={{ backgroundColor: "rgba(13,4,70,0.1)" }} />

              <button type="button" onClick={() => document.execCommand("bold")} className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(13,4,70,0.04)" }} title="Negrito">
                <Bold size={14} style={{ color: "#0d0446" }} />
              </button>
              <button type="button" onClick={() => document.execCommand("underline")} className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(13,4,70,0.04)" }} title="Sublinhado">
                <Underline size={14} style={{ color: "#0d0446" }} />
              </button>
              <button type="button" onClick={() => document.execCommand("hiliteColor", false, "#fef08a")} className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(13,4,70,0.04)" }} title="Grifar / Realçar">
                <Highlighter size={14} style={{ color: "#0d0446" }} />
              </button>

              <div className="w-px h-5 mx-1" style={{ backgroundColor: "rgba(13,4,70,0.1)" }} />

              <button type="button" onClick={() => document.execCommand("justifyLeft")} className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(13,4,70,0.04)" }} title="Alinhar à esquerda">
                <AlignLeft size={14} style={{ color: "#0d0446" }} />
              </button>
              <button type="button" onClick={() => document.execCommand("justifyCenter")} className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(13,4,70,0.04)" }} title="Centralizar">
                <AlignCenter size={14} style={{ color: "#0d0446" }} />
              </button>
              <button type="button" onClick={() => document.execCommand("justifyRight")} className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(13,4,70,0.04)" }} title="Alinhar à direita">
                <AlignRight size={14} style={{ color: "#0d0446" }} />
              </button>

              <div className="w-px h-5 mx-1" style={{ backgroundColor: "rgba(13,4,70,0.1)" }} />

              <button type="button" onClick={() => document.execCommand("insertUnorderedList")} className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(13,4,70,0.04)" }} title="Lista com marcadores">
                <List size={14} style={{ color: "#0d0446" }} />
              </button>
              <button type="button" onClick={() => document.execCommand("insertOrderedList")} className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-70 transition" style={{ backgroundColor: "rgba(13,4,70,0.04)" }} title="Lista numerada">
                <ListOrdered size={14} style={{ color: "#0d0446" }} />
              </button>

              <div className="w-px h-5 mx-1" style={{ backgroundColor: "rgba(13,4,70,0.1)" }} />

              <button
                type="button"
                onClick={() => {
                  if (mergeCells.length < 2) {
                    toast.error("Ctrl+clique em pelo menos 2 células para mesclar");
                    return;
                  }
                  const firstRow = mergeCells[0].parentElement;
                  const sameRow = mergeCells.every(c => c.parentElement === firstRow);
                  if (!sameRow) {
                    toast.error("Selecione células da mesma linha");
                    mergeCells.forEach(c => { c.style.outline = ""; c.style.backgroundColor = ""; });
                    setMergeCells([]);
                    return;
                  }
                  // Sort by DOM order
                  const sorted = [...mergeCells].sort((a, b) => {
                    const cells = Array.from(firstRow!.children);
                    return cells.indexOf(a) - cells.indexOf(b);
                  });
                  const first = sorted[0];
                  let totalColspan = 0;
                  sorted.forEach((cell, i) => {
                    totalColspan += parseInt(cell.getAttribute("colspan") || "1", 10);
                    if (i > 0) {
                      if (cell.textContent?.trim()) first.innerHTML += " " + cell.innerHTML;
                      cell.remove();
                    }
                  });
                  first.setAttribute("colspan", String(totalColspan));
                  first.style.outline = "";
                  first.style.backgroundColor = "";
                  setMergeCells([]);
                  toast.success("Células mescladas!");
                  if (editorRef.current) setRoteiroTexto(editorRef.current.innerHTML);
                }}
                className="h-8 px-2 flex items-center justify-center gap-1 rounded-lg hover:opacity-70 transition text-[11px] font-medium"
                style={{ backgroundColor: mergeCells.length >= 2 ? "rgba(38,143,250,0.15)" : "rgba(13,4,70,0.04)", color: mergeCells.length >= 2 ? "#268ffa" : "#0d0446", border: mergeCells.length >= 2 ? "1px solid #268ffa" : "none" }}
                title="Ctrl+clique nas células, depois clique aqui para mesclar"
              >
                <Columns size={14} />
                <span className="hidden sm:inline">Mesclar{mergeCells.length >= 2 ? ` (${mergeCells.length})` : ""}</span>
              </button>
              {mergeCells.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    mergeCells.forEach(c => { c.style.outline = ""; c.style.backgroundColor = ""; });
                    setMergeCells([]);
                  }}
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:opacity-70 transition"
                  style={{ backgroundColor: "rgba(220,38,38,0.08)" }}
                  title="Cancelar seleção"
                >
                  <X size={14} style={{ color: "#dc2626" }} />
                </button>
              )}
            </div>

            {/* Editor */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData("text/plain");
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                  const range = sel.getRangeAt(0);
                  range.deleteContents();
                  range.insertNode(document.createTextNode(text));
                  range.collapse(false);
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
                if (editorRef.current) setRoteiroTexto(editorRef.current.innerHTML);
              }}
              onInput={() => {
                if (editorRef.current) setRoteiroTexto(editorRef.current.innerHTML);
              }}
              onClick={(e) => {
                const target = e.target as HTMLElement;

                // Ctrl/Cmd+click on a table cell → toggle merge selection
                const cell = target.closest("td, th") as HTMLTableCellElement | null;
                if (cell && (e.ctrlKey || e.metaKey) && !cell.hasAttribute("data-action") && !cell.querySelector("[data-action]")) {
                  e.preventDefault();
                  setMergeCells(prev => {
                    const already = prev.includes(cell);
                    if (already) {
                      cell.style.outline = "";
                      cell.style.backgroundColor = "";
                      return prev.filter(c => c !== cell);
                    } else {
                      cell.style.outline = "2px solid #268ffa";
                      cell.style.backgroundColor = mergeHighlightColor;
                      return [...prev, cell];
                    }
                  });
                  return;
                }

                const action = target.getAttribute("data-action");
                if (!action || !editorRef.current) return;
                e.preventDefault();
                const table = editorRef.current.querySelector("table tbody");
                if (!table) return;
                const tdS = "border:1px solid rgba(13,4,70,0.12);padding:8px 10px";
                const actionBtnS = "cursor:pointer;padding:2px 4px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center";
                const actionRow = table.querySelector("tr[data-action-row]");

                const renumberPerguntas = () => {
                  const all = Array.from(table.querySelectorAll("tr[data-pergunta]"));
                  all.forEach((row, i) => {
                    row.setAttribute("data-pergunta", String(i + 1));
                    const elCell = row.querySelectorAll("td")[1];
                    if (elCell) elCell.innerHTML = `PERGUNTA ${i + 1}`;
                  });
                  setPerguntaCount(all.length);
                  setRoteiroTexto(editorRef.current!.innerHTML);
                };

                if (action === "add-pergunta") {
                  const allPerguntas = Array.from(table.querySelectorAll("tr[data-pergunta]"));
                  const newNum = allPerguntas.length + 1;
                  const insertAfter = allPerguntas.length > 0
                    ? allPerguntas[allPerguntas.length - 1]
                    : Array.from(table.querySelectorAll("tr")).find(r => r.innerHTML.includes("ENTREVISTA")) || null;
                  if (insertAfter) {
                    const newRow = document.createElement("tr");
                    newRow.setAttribute("data-pergunta", String(newNum));
                    newRow.innerHTML = `<td style="${tdS}">--:--</td><td style="${tdS};font-weight:600">PERGUNTA ${newNum}</td><td style="${tdS}">[Insira a pergunta aqui]</td><td style="${tdS};white-space:nowrap;text-align:center;width:90px" contenteditable="false"><span data-action="move-up" style="${actionBtnS};color:#268ffa" title="Mover para cima">▲</span> <span data-action="move-down" style="${actionBtnS};color:#268ffa" title="Mover para baixo">▼</span> <span data-action="delete-pergunta" style="${actionBtnS};color:#dc2626" title="Remover pergunta">🗑</span></td>`;
                    insertAfter.insertAdjacentElement("afterend", newRow);
                    if (actionRow) newRow.insertAdjacentElement("afterend", actionRow);
                    renumberPerguntas();
                  }
                } else if (action === "delete-pergunta") {
                  const row = target.closest("tr[data-pergunta]");
                  if (!row) return;
                  const allPerguntas = Array.from(table.querySelectorAll("tr[data-pergunta]"));
                  if (allPerguntas.length <= 1) return;
                  row.remove();
                  renumberPerguntas();
                } else if (action === "move-up") {
                  const row = target.closest("tr[data-pergunta]");
                  if (!row) return;
                  const allPerguntas = Array.from(table.querySelectorAll("tr[data-pergunta]"));
                  const idx = allPerguntas.indexOf(row as HTMLTableRowElement);
                  if (idx <= 0) return;
                  allPerguntas[idx - 1].insertAdjacentElement("beforebegin", row);
                  renumberPerguntas();
                } else if (action === "move-down") {
                  const row = target.closest("tr[data-pergunta]");
                  if (!row) return;
                  const allPerguntas = Array.from(table.querySelectorAll("tr[data-pergunta]"));
                  const idx = allPerguntas.indexOf(row as HTMLTableRowElement);
                  if (idx < 0 || idx >= allPerguntas.length - 1) return;
                  allPerguntas[idx + 1].insertAdjacentElement("afterend", row);
                  renumberPerguntas();
                }
              }}
              className="w-full min-h-[280px] text-sm outline-none"
              style={{ color: "#0d0446", fontSize: fontSize + "px", lineHeight: "1.7" }}
              data-placeholder="Digite o roteiro aqui..."
            />
              </div>
            </div>

            {/* Salvar / Exportar */}
            <button
              onClick={async () => {
                // Validate required fields
                const requiredFields: { field: string; value: string; label: string }[] = [
                  { field: "estudio", value: estudio, label: "Estúdio" },
                  { field: "programa", value: programaNome, label: "Programa" },
                  { field: "horario", value: horario, label: "Horário" },
                  { field: "titulo", value: roteiroTitulo, label: "Título" },
                ];
                const emptyFields = requiredFields.filter(f => !f.value.trim());
                if (emptyFields.length > 0) {
                  // Clear previous blink animations
                  document.querySelectorAll("[data-field]").forEach(el => {
                    (el as HTMLElement).style.animation = "";
                    (el as HTMLElement).style.borderColor = "";
                  });
                  // Highlight and scroll to first empty field
                  const firstEmpty = document.querySelector(`[data-field="${emptyFields[0].field}"]`) as HTMLElement;
                  emptyFields.forEach(f => {
                    const el = document.querySelector(`[data-field="${f.field}"]`) as HTMLElement;
                    if (el) {
                      el.style.borderColor = "#dc2626";
                      el.style.animation = "blink-border 0.6s ease-in-out 4";
                      el.addEventListener("animationend", () => {
                        el.style.animation = "";
                        el.style.borderColor = "";
                      }, { once: true });
                    }
                  });
                  if (firstEmpty) {
                    firstEmpty.scrollIntoView({ behavior: "smooth", block: "center" });
                    firstEmpty.focus();
                  }
                  toast.error(`Preencha o campo: ${emptyFields[0].label}`);
                  return;
                }
                await salvarRoteiro();
                setShowExportView(true);
                if (editingRoteiroId) {
                  fetchApresentadorStatus(editingRoteiroId);
                } else {
                  setApresentadorStatus(null);
                }
              }}
              disabled={savingRoteiro}
              className="w-full py-3.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff", boxShadow: "0 4px 16px rgba(38,143,250,0.3)" }}
            >
              <Save size={14} />
              {savingRoteiro ? "salvando..." : "Salvar e Exportar Roteiro"}
            </button>
          </div>
        </div>
      )}


      {/* Export View Inline */}
      {showExportView && (
        <div ref={exportViewRef} className="mt-4">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <button onClick={() => setShowExportView(false)} className="flex items-center gap-2 text-xs font-semibold hover:opacity-80 transition" style={{ color: "#268ffa" }}>
              <ArrowLeft size={14} />
              voltar ao roteiro
            </button>
            <div className="flex items-center gap-2 print:hidden flex-wrap">
              {pdfPopup.status === "ready" && pdfPopup.blobUrl ? (
                <a
                  href={pdfPopup.blobUrl}
                  download={pdfPopup.filename}
                  onClick={() => setTimeout(() => pdfPopup.close(), 500)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-white hover:opacity-90 transition animate-scale-in"
                  style={{ backgroundColor: "#14A44D" }}
                >
                  <Download size={13} />
                  PDF pronto · baixar
                </a>
              ) : (
                <button onClick={() => {
                  const el = document.getElementById("roteiro-export-content");
                  if (el) {
                    const safeName = (programaNome || "roteiro").replace(/\s+/g, "_").toLowerCase();
                    const prog = programas.find(p => p.nome === programaNome);
                    const logoUrl = prog?.selo || prog?.capa || null;
                    pdfPopup.generate(el, `roteiro_${safeName}.pdf`, logoUrl);
                  }
                }}
                  disabled={pdfPopup.status === "generating"}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-white hover:opacity-90 transition disabled:opacity-60"
                  style={{ backgroundColor: "#268ffa" }}
                >
                  {pdfPopup.status === "generating" ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      gerando PDF...
                    </>
                  ) : (
                    <>
                      <Download size={13} />
                      gerar PDF
                    </>
                  )}
                </button>
              )}
              <button
                onClick={async () => {
                  // First save roteiro if not saved yet
                  if (!editingRoteiroId && user) {
                    const shareToken = crypto.randomUUID();
                    const firstName = participantes.length > 0 ? participantes[0].nome.split(" ")[0].toLowerCase() : "apresentador";
                    const payload = {
                      user_id: user.id,
                      programa_nome: programaNome,
                      estudio,
                      tipo_programa: tipoPrograma,
                      data_programa: format(selectedDate, "yyyy-MM-dd"),
                      horario,
                      titulo: roteiroTitulo,
                      subtitulo: JSON.stringify({ titulo: roteiroSubtitulo, obs: assuntoSubtitulo }),
                      conteudo_html: sanitizeRoteiroHtml(editorRef.current?.innerHTML || roteiroTexto),
                      participantes: JSON.stringify(participantes),
                      status: isAgendado ? "agendado" : "salvo",
                      share_token: shareToken,
                      share_login: firstName,
                    };
                    const { error } = await supabase.from("roteiros").insert(payload);
                    if (error) { toast.error("Erro ao salvar roteiro"); return; }
                    const url = `${window.location.origin}/roteiro-apresentador-edit?token=${shareToken}`;
                    await navigator.clipboard.writeText(url).catch(() => {});
                    window.open(url, '_blank');
                    toast.success(`Link copiado! Login: ${firstName} / Senha: edit123`);
                  } else if (editingRoteiroId && user) {
                    const shareToken = crypto.randomUUID();
                    const firstName = participantes.length > 0 ? participantes[0].nome.split(" ")[0].toLowerCase() : "apresentador";
                    await supabase.from("roteiros").update({ share_token: shareToken, share_login: firstName }).eq("id", editingRoteiroId);
                    const url = `${window.location.origin}/roteiro-apresentador-edit?token=${shareToken}`;
                    await navigator.clipboard.writeText(url).catch(() => {});
                    window.open(url, '_blank');
                    toast.success(`Link copiado! Login: ${firstName} / Senha: edit123`);
                    fetchHistorico();
                  }
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold hover:opacity-90 transition`}
                style={apresentadorStatus?.editado
                  ? { backgroundColor: "#16a34a", color: "#fff" }
                  : { backgroundColor: "rgba(13,4,70,0.06)", color: "#0d0446" }
                }
              >
                {apresentadorStatus?.editado ? <Check size={13} /> : <Send size={13} />}
                {apresentadorStatus?.editado
                  ? `ok - editado pelo apresentador ${apresentadorStatus.login || "apresentador"}`
                  : "enviar para o apresentador"
                }
              </button>
              <button
                onClick={() => setShowWhatsAppDialog(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-white hover:opacity-90 transition"
                style={{ backgroundColor: "#25d366" }}
              >
                <MessageSquare size={13} />
                enviar por whatsapp
              </button>
              <button
                onClick={async () => {
                  await salvarRoteiro();
                  fetchHistorico();
                  setShowExportView(false);
                  setShowRoteiro(false);
                  setEditingRoteiroId(null);
                  setRoteiroTitulo("");
                  setRoteiroSubtitulo("");
                  setRoteiroTexto("");
                  setAssuntoSubtitulo("");
                  setParticipantes([]);
                  setNumeroRoteiro(null);
                  if (editorRef.current) editorRef.current.innerHTML = "";
                  toast.success("Roteiro salvo e fechado!");
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-white hover:opacity-90 transition"
                style={{ backgroundColor: "#268ffa" }}
              >
                <Save size={13} />
                salvar e fechar
              </button>
            </div>
          </div>

          <div id="roteiro-export-content" className="rounded-xl p-6" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.08)" }}>
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-start justify-between gap-4">
                {numeroRoteiro && (
                  <p className="text-3xl font-black mb-1" style={{ color: "#268ffa" }}>#{numeroRoteiro}</p>
                )}
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-bold uppercase mb-1" style={{ color: "#0d0446" }}>
                    {roteiroTitulo || "Roteiro"}
                  </h1>
                  {roteiroSubtitulo && (
                    <p className="text-sm mb-2" style={{ color: "rgba(13,4,70,0.6)" }}>{roteiroSubtitulo}</p>
                  )}
                </div>
                {(() => {
                  const prog = programas.find(p => p.nome === programaNome);
                  const logoUrl = prog?.selo || prog?.capa;
                  if (!logoUrl) return null;
                  return (
                    <img
                      src={logoUrl}
                      alt={programaNome}
                      className="pdf-logo-black"
                      style={{ width: 60, height: 60, objectFit: "contain", filter: "brightness(0)" }}
                    />
                  );
                })()}
              </div>
              <p className="text-sm" style={{ color: "rgba(13,4,70,0.7)" }}>
                <span className="font-semibold" style={{ color: "#0d0446" }}>{programaNome}</span>
                {estudio && <span> · Estúdio {estudio}</span>}
              </p>
              <p className="text-sm" style={{ color: "rgba(13,4,70,0.6)" }}>
                {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })} {horario && `às ${horario}`}
              </p>

              {/* Assunto */}
              {(roteiroSubtitulo || assuntoSubtitulo) && (
                <div className="mt-3 px-4 py-3 rounded-lg" style={{ backgroundColor: "rgba(38,143,250,0.06)", borderLeft: "3px solid #268ffa" }}>
                  <p className="text-xs font-bold uppercase mb-0.5" style={{ color: "#268ffa" }}>Assunto da entrevista</p>
                  {roteiroSubtitulo && <p className="text-sm font-bold" style={{ color: "#0d0446" }}>{roteiroSubtitulo}</p>}
                  {assuntoSubtitulo && <p className="text-xs" style={{ color: "rgba(13,4,70,0.6)" }}>{assuntoSubtitulo}</p>}
                </div>
              )}

              {/* Participantes */}
              {participantes.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-bold uppercase mb-2" style={{ color: "rgba(13,4,70,0.5)" }}>Participantes</p>
                  <div className="flex flex-wrap gap-2">
                    {participantes.map((p, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: "rgba(13,4,70,0.05)", color: "#0d0446" }}>
                        {p.nome}
                        {p.cargo ? <span style={{ color: "rgba(13,4,70,0.4)" }}> · {p.cargo}</span> : p.categoria && <span style={{ color: "rgba(13,4,70,0.4)" }}> · {p.categoria}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="h-px mb-4" style={{ backgroundColor: "rgba(13,4,70,0.1)" }} />

            <h2 className="text-sm font-bold uppercase mb-3" style={{ color: "#0d0446" }}>Roteiro do programa</h2>
            <div
              className="text-sm leading-relaxed"
              style={{ color: "#0d0446" }}
              dangerouslySetInnerHTML={{ __html: sanitizeRoteiroHtml(editorRef.current?.innerHTML || roteiroTexto) }}
            />

            <div className="mt-8 pt-4 text-center" style={{ borderTop: "1px solid rgba(13,4,70,0.1)" }}>
              <p className="text-lg font-bold italic" style={{ color: "#268ffa" }}>Bom programa! 🎙️</p>
            </div>

            {/* Apresentador edit status */}
            {apresentadorStatus?.editado && (
              <div className="mt-4 px-4 py-3 rounded-xl flex items-center gap-2" style={{ backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
                <Check size={16} style={{ color: "#16a34a" }} />
                <p className="text-xs font-semibold" style={{ color: "#16a34a" }}>
                  Programa ok por {apresentadorStatus.login || "apresentador"}
                  {apresentadorStatus.editadoAt && `, ${format(new Date(apresentadorStatus.editadoAt), "dd/MM/yyyy 'às' HH:mm")}`}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conditional: Jornalístico shows NoticiasPanel */}
      {tipoPrograma === "Jornalístico" && (
        <Suspense fallback={<ModulePageSkeleton />}>
          <NoticiasPanel />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <WhatsAppSendDialog
          open={showWhatsAppDialog}
          onClose={() => setShowWhatsAppDialog(false)}
          roteiroData={{
            titulo: roteiroTitulo || "Roteiro",
            programaNome,
            estudio,
            data: format(selectedDate, "dd/MM/yyyy"),
            horario,
            participantes,
            conteudoTexto: editorRef.current?.innerText || roteiroTexto,
          }}
        />
      </Suspense>

    </div>
  );
}
