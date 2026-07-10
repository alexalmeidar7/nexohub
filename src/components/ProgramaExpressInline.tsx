import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Zap, Plus, Trash2, Link2, Loader2, Image, Type, Check, X as XIcon, ChevronDown, ChevronUp, Pencil, Users, Search, UserPlus, ClipboardPaste, ArrowUp, ArrowDown, CheckCircle2, MessageSquare, FileText, HelpCircle, Video, ImagePlus, Upload, Bot, Save, List, RefreshCw, Megaphone } from "lucide-react";
import { decodeHtmlEntities } from "@/lib/textEncoding";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* ── Podcast-specific types ── */
interface PodcastData {
  tituloTarja: string;
  introducao: string;
  agendamentoData: string;
  agendamentoHorario: string;
  perguntas: string[];
  concluindo: string;
  apoioImagens: string[];
  apoioVideos: string[];
}

interface Participante {
  nome: string;
  cargo: string;
  instagram: string;
}

const BLOCK_COLORS = [
  "#2ec1f7", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

// === Nexo Form Design System (mesmo do Cadastro de Participante) ===
const NEXO_CYAN = "#00BFF0";
const NEXO_LIME = "#C6F03C";
const NEXO_CARD_BG = "#D6F4FB";
const NEXO_DARK = "#0A2540";
const nexoPillGhost: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 1,
  textTransform: "uppercase",
  padding: "8px 16px",
  borderRadius: 999,
  background: "#FFFFFF",
  border: `2px solid ${NEXO_CYAN}`,
  color: NEXO_DARK,
  cursor: "pointer",
  transition: "opacity .2s",
};
const nexoPillPrimary: React.CSSProperties = {
  ...nexoPillGhost,
  background: NEXO_CYAN,
  color: "#FFFFFF",
  border: `2px solid ${NEXO_CYAN}`,
};

interface NewsItem {
  titulo: string;
  imagemUrl: string;
  resumo?: string;
  texto_materia?: string; // Journalistic style text for TP
  escalada: boolean;
  link?: string;
}

interface Bloco {
  noticias: NewsItem[];
}

interface Programa {
  id: string;
  nome: string;
  estudio: string;
  tipo_programa?: string | null;
}

export interface ExpressEditData {
  roteiroId: string;
  estudio: string;
  programaId: string;
  blocos: Bloco[];
  participantes?: Participante[];
  escaladaList?: {titulo: string; imagemUrl: string}[];
  existingXmlPath?: string;
  podcastData?: PodcastData;
  agendaEventoId?: string;
}

interface Props {
  programas: Programa[];
  estudios: string[];
  onFinish: () => void;
  editData?: ExpressEditData | null;
  afterHeader?: React.ReactNode;
  externalPasteText?: string | null;
  onExternalPasteConsumed?: () => void;
  novoOpen?: boolean;
  onNovoOpenChange?: (v: boolean) => void;
  hideNovoToggle?: boolean;
  renderAsModal?: boolean;
}

/* Inline participant row with editable cargo */
function ParticipanteRow({ participante, inputStyle, onRemove, onUpdateCargo, userId }: {
  participante: Participante;
  inputStyle: React.CSSProperties;
  onRemove: () => void;
  onUpdateCargo: (cargo: string) => void;
  userId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [cargoVal, setCargoVal] = useState(participante.cargo);

  const saveCargo = async () => {
    setEditing(false);
    const trimmed = cargoVal.trim();
    if (trimmed !== participante.cargo) {
      onUpdateCargo(trimmed);
      await supabase.from("apresentadores").update({ cargo: trimmed }).eq("nome", participante.nome).eq("user_id", userId);
    }
  };

  return (
    <div
      className="grid w-full grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] overflow-hidden"
      style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 90%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 12%, transparent)" }}
    >
      <span className="font-semibold truncate min-w-0" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{participante.nome}</span>
      {editing ? (
        <input autoFocus value={cargoVal} onChange={e => setCargoVal(e.target.value)} onBlur={saveCargo} onKeyDown={e => { if (e.key === "Enter") saveCargo(); }} className="w-full px-1.5 py-0.5 rounded text-[10px] outline-none min-w-0" style={inputStyle} placeholder="Cargo..." />
      ) : (
        <button type="button" onClick={() => { setCargoVal(participante.cargo); setEditing(true); }} className="text-[10px] min-w-0 cursor-pointer hover:opacity-70 flex items-center gap-0.5 text-left" style={{ color: participante.cargo ? "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 35%, transparent)" }} title="Clique para editar cargo">
          <span className="truncate">{participante.cargo || "..."}</span>
          <Pencil size={9} className="shrink-0" />
        </button>
      )}
      <span className="text-[10px] truncate min-w-0" style={{ color: "var(--layout-accent-color, #2ec1f7)" }}>
        {participante.instagram ? `@${participante.instagram.replace("@", "")}` : "..."}
      </span>
      <button onClick={onRemove} className="p-0.5 rounded hover:opacity-70 shrink-0" style={{ color: "#ef4444" }}>
        <Trash2 size={11} />
      </button>
    </div>
  );
}

/* Small green check indicator for edited fields */
function EditedCheck() {
  return <CheckCircle2 size={11} className="shrink-0" style={{ color: "#22c55e" }} />;
}

/* Section to refresh all news using new links per block */
function UpdateNewsLinksSection({ blocos, inputStyle, onUpdateBloco, fetchFromLink }: {
  blocos: Bloco[];
  inputStyle: React.CSSProperties;
  onUpdateBloco: (bi: number, items: NewsItem[]) => void;
  fetchFromLink: (bi: number, ni: number, url: string) => Promise<void> | void;
}) {
  const [linksText, setLinksText] = useState<string[]>(() => blocos.map(() => ""));
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setLinksText(prev => {
      const next = blocos.map((_, i) => prev[i] ?? "");
      return next;
    });
  }, [blocos.length]);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      let totalLinks = 0;
      for (let bi = 0; bi < blocos.length; bi++) {
        const links = linksText[bi]?.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith("http")) || [];
        if (links.length === 0) continue;
        const newItems: NewsItem[] = links.map(l => ({ titulo: "", imagemUrl: "", escalada: false, link: l }));
        onUpdateBloco(bi, newItems);
        totalLinks += links.length;

        // Use current state reference logic via setTimeout to allow state update to propagate
        // but here we can just pass the newItems info indirectly if needed.
        // Actually, fetchFromLink uses setBlocos internally which is fine.
        for (let ni = 0; ni < links.length; ni++) {
          await fetchFromLink(bi, ni, links[ni]);
        }
      }
      if (totalLinks === 0) toast.warning("Nenhum link válido informado");
      else toast.success(`${totalLinks} notícia(s) atualizadas!`);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao atualizar notícias");
    }
    setUpdating(false);
  };

  return (
    <div className="rounded-2xl p-5" style={{ border: `1px solid ${NEXO_CYAN}33`, backgroundColor: "#FFFFFF", fontFamily: "'Montserrat', sans-serif" }}>
      <p className="text-xs font-bold flex items-center gap-1.5 mb-1" style={{ color: NEXO_DARK, letterSpacing: 1, textTransform: "uppercase" }}>
        <Link2 size={14} style={{ color: NEXO_CYAN }} />
        Atualizar Notícias por Links
      </p>
      <p className="text-[10px] mb-3" style={{ color: `${NEXO_DARK}99` }}>
        Cole um link por linha em cada bloco. Ao clicar em "Atualizar notícias", as notícias serão substituídas e o XML será atualizado.
      </p>
      <div className="space-y-2">
        {blocos.map((_, bi) => (
          <div key={bi}>
            <label className="text-[10px] font-bold mb-1 block" style={{ color: NEXO_DARK, letterSpacing: 1, textTransform: "uppercase" }}>
              BLOCO {bi + 1} — links
            </label>
            <textarea
              value={linksText[bi] || ""}
              onChange={e => setLinksText(prev => { const c = [...prev]; c[bi] = e.target.value; return c; })}
              placeholder="https://...&#10;https://..."
              rows={3}
              className="w-full px-3 py-2 text-[11px] outline-none resize-y"
              style={{ ...inputStyle, backgroundColor: "#FFFFFF", border: `2px solid ${NEXO_CYAN}`, color: NEXO_DARK, borderRadius: 14 }}
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleUpdate}
        disabled={updating}
        className="w-full mt-4 flex items-center justify-center gap-1.5 disabled:opacity-40 hover:opacity-90"
        style={{ ...nexoPillPrimary, padding: "12px 20px", fontSize: 12, width: "100%" }}
      >
        {updating ? <Loader2 size={12} className="animate-spin" /> : <Check size={14} />}
        Atualizar Notícias
      </button>
    </div>
  );
}


export default function ProgramaExpressInline({ programas, estudios, onFinish, editData, afterHeader, externalPasteText, onExternalPasteConsumed, novoOpen, onNovoOpenChange, hideNovoToggle, renderAsModal }: Props) {
  const { user } = useAuth();
  const [estudio, setEstudio] = useState("");
  const [programaId, setProgramaId] = useState("");
  const [blocos, setBlocos] = useState<Bloco[]>([{ noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }]);
  const [fetchingLink, setFetchingLink] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [collapsedBlocos, setCollapsedBlocos] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingXmlPath, setEditingXmlPath] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [showPastePopup, setShowPastePopup] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastAutoSaved, setLastAutoSaved] = useState<number | null>(null);
  const [configuracoes, setConfiguracoes] = useState<{ producao_ai_habilitada: boolean; prompt_ai: string }>(() => {
    const savedHab = localStorage.getItem("producao_ai_habilitada");
    const savedPrompt = localStorage.getItem("programa_express_prompt_ai_draft");
    return { 
      producao_ai_habilitada: savedHab !== null ? savedHab !== "false" : true, 
      prompt_ai: savedPrompt || "" 
    };
  });
  const [promptTemplates, setPromptTemplates] = useState<{ id: string; name: string; content: string }[]>([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [addingWeather, setAddingWeather] = useState(false);
  const [addingFinance, setAddingFinance] = useState(false);
  const [novoRoteiroOpenInternal, setNovoRoteiroOpenInternal] = useState(false);
  const novoRoteiroOpen = novoOpen !== undefined ? novoOpen : novoRoteiroOpenInternal;
  const setNovoRoteiroOpen = (v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === "function" ? (v as any)(novoRoteiroOpen) : v;
    if (onNovoOpenChange) onNovoOpenChange(next);
    if (novoOpen === undefined) setNovoRoteiroOpenInternal(next);
  };
  useEffect(() => { if (editData) setNovoRoteiroOpen(true); }, [editData]);
  useEffect(() => { if (externalPasteText) setNovoRoteiroOpen(true); }, [externalPasteText]);

  // Podcast-specific state
  const [podcastData, setPodcastData] = useState<PodcastData>({
    tituloTarja: "", introducao: "", agendamentoData: "", agendamentoHorario: "", perguntas: [""], concluindo: "", apoioImagens: [""], apoioVideos: [""],
  });

  const isPodcast = estudio.toLowerCase() === "podcast";

  // Track edited fields for green check indicators
  const [editedFields, setEditedFields] = useState<Set<string>>(new Set());
  const initialDataRef = useRef<{ estudio: string; programaId: string; blocos: string; participantes: string } | null>(null);
  const isAutoGenRef = useRef<boolean>(false);
  const autoTitlePrefix = () => (isAutoGenRef.current ? "[AUTO] " : "");

  const markEdited = useCallback((field: string) => {
    setEditedFields(prev => { const n = new Set(prev); n.add(field); return n; });
  }, []);

  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [escaladaList, setEscaladaList] = useState<{titulo: string; imagemUrl: string}[]>([]);
  const [openNoticia, setOpenNoticia] = useState<Record<number, number | null>>({});
  const addToEscalada = useCallback((titulo: string, imagemUrl: string) => {
    if (!titulo.trim()) { toast.warning("Notícia sem título"); return; }
    setEscaladaList(prev => {
      if (prev.some(e => e.titulo === titulo)) { toast.info("Já está na escalada"); return prev; }
      toast.success("Adicionada à escalada");
      return [...prev, { titulo, imagemUrl: imagemUrl || "" }];
    });
  }, []);
  const [searchNome, setSearchNome] = useState("");
  const [searchResults, setSearchResults] = useState<Participante[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContact, setNewContact] = useState<{ nome: string; cargo: string; instagram: string; whatsapp: string }>({ nome: "", cargo: "", instagram: "", whatsapp: "" });
  const [savingContact, setSavingContact] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const filteredProgramas = estudio ? programas.filter(p => p.estudio === estudio) : programas;
  const programaNome = programas.find(p => p.id === programaId)?.nome || "";

  // Search apresentadores
  useEffect(() => {
    if (!searchNome.trim() || !user) { setSearchResults([]); setNoResults(false); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("apresentadores")
        .select("nome, cargo, instagram")
        .eq("user_id", user.id)
        .ilike("nome", `%${searchNome}%`)
        .limit(5);
      if (data && data.length > 0) {
        setSearchResults(data.map(d => ({ nome: d.nome, cargo: d.cargo || "", instagram: d.instagram || "" })));
        setNoResults(false);
      } else {
        setSearchResults([]);
        setNoResults(true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchNome, user]);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (editData) {
      console.log("Loading editData:", editData);
      setEstudio(editData.estudio || "");
      setProgramaId(editData.programaId || "");
      setBlocos(Array.isArray(editData.blocos) && editData.blocos.length > 0 ? editData.blocos.map(b => ({ ...b, noticias: Array.isArray(b?.noticias) ? b.noticias : [{ titulo: "", imagemUrl: "", escalada: false }] })) : [{ noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }]);
      setParticipantes(editData.participantes || []);
      setEscaladaList(editData.escaladaList || []);
      setEditingId(editData.roteiroId);
      setEditingXmlPath(editData.existingXmlPath || null);
      if (editData.podcastData) {
        setPodcastData({
          tituloTarja: editData.podcastData.tituloTarja || "",
          introducao: editData.podcastData.introducao || "",
          agendamentoData: (editData.podcastData as any).agendamentoData || "",
          agendamentoHorario: (editData.podcastData as any).agendamentoHorario || "",
          perguntas: editData.podcastData.perguntas?.length ? editData.podcastData.perguntas : [""],
          concluindo: editData.podcastData.concluindo || "",
          apoioImagens: editData.podcastData.apoioImagens?.length ? editData.podcastData.apoioImagens : [""],
          apoioVideos: editData.podcastData.apoioVideos?.length ? editData.podcastData.apoioVideos : [""],
        });
      }
      
      const loadConfigAndTemplates = async () => {
        if (editData.roteiroId) {
          const { data } = await supabase.from("roteiros").select("configuracoes").eq("id", editData.roteiroId).single();
          if (data?.configuracoes) {
            const config = data.configuracoes as any;
            setConfiguracoes(config);
            if (config.prompt_ai) {
              localStorage.setItem("programa_express_prompt_ai_draft", config.prompt_ai);
            }
          }
        }
        if (user) {
          const { data } = await supabase.from("prompt_templates").select("id, name, content").order("name");
          if (data) setPromptTemplates(data);
        }
      };

      loadConfigAndTemplates();
      setInitialized(true);
    } else if (!initialized) {
      const draft = localStorage.getItem("programa_express_prompt_ai_draft");
      if (draft) {
        setConfiguracoes(prev => ({ ...prev, prompt_ai: draft }));
      }
      if (user) {
        supabase.from("prompt_templates").select("id, name, content").order("name").then(({ data }) => {
          if (data) setPromptTemplates(data);
        });
      }
      setInitialized(true);
    }
  }, [editData, user]);

  const savePromptAsTemplate = async () => {
    if (!templateName.trim() || !configuracoes.prompt_ai.trim() || !user) return;
    setSavingTemplate(true);
    try {
      const { data, error } = await supabase.from("prompt_templates").insert({
        user_id: user.id,
        name: templateName.trim(),
        content: configuracoes.prompt_ai
      }).select().single();

      if (error) throw error;
      setPromptTemplates(prev => [...prev, data]);
      setTemplateName("");
      setShowSaveTemplate(false);
      toast.success("Prompt salvo com sucesso!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar prompt");
    }
    setSavingTemplate(false);
  };

  const deleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from("prompt_templates").delete().eq("id", id);
      if (error) throw error;
      setPromptTemplates(prev => prev.filter(t => t.id !== id));
      toast.success("Prompt removido");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao remover prompt");
    }
  };

  // Store initial data snapshot for edit tracking
  useEffect(() => {
    if (editData && initialized && !initialDataRef.current) {
      initialDataRef.current = {
        estudio: editData.estudio,
        programaId: editData.programaId,
        blocos: JSON.stringify(editData.blocos),
        participantes: JSON.stringify(editData.participantes || []),
      };
    }
  }, [editData, initialized]);

  // Auto-save debounced (only when editing existing roteiro)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!editingId || !initialized || !user || !programaId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      const totalNews = blocos.reduce((s, b) => s + b.noticias.filter(n => n.titulo).length, 0);
      if (totalNews === 0) return;
      setAutoSaving(true);
      try {
        const xmlContent = generateXml();
        const pNome = programas.find(p => p.id === programaId)?.nome || "";
        let html = `<h2 style="text-align:center;font-weight:bold;">PROGRAMA EXPRESS — ${pNome}</h2>`;
        if (participantes.length > 0) { html += `<h3 style="font-weight:bold;margin-top:16px;">👥 PARTICIPANTES</h3><ul>`; participantes.forEach(p => { html += `<li><strong>${p.nome}</strong>${p.cargo ? ` — ${p.cargo}` : ""}${p.instagram ? ` (@${p.instagram.replace("@", "")})` : ""}</li>`; }); html += `</ul>`; }
        if (escaladaList.length > 0) { html += `<h3 style="font-weight:bold;margin-top:16px;">📢 ESCALADA</h3><ul>`; escaladaList.forEach(e => { html += `<li><strong>${e.titulo}</strong></li>`; }); html += `</ul>`; }
        blocos.forEach((b, bi) => { html += `<h3 style="font-weight:bold;margin-top:16px;">📺 BLOCO ${bi + 1}</h3>`; b.noticias.forEach((n, ni) => { if (!n.titulo) return; html += `<p><strong>Notícia ${ni + 1}:</strong> ${n.titulo}</p>`; if (n.imagemUrl) html += `<p><em>Imagem:</em> <a href="${n.imagemUrl}">${n.imagemUrl}</a></p>`; }); });
        const blob = new Blob([xmlContent], { type: "application/xml" });
        const filePath = editingXmlPath || `express/${user.id}/express_${editingId}.xml`;
        if (!editingXmlPath) setEditingXmlPath(filePath);
        await supabase.storage.from("empresa-assets").upload(filePath, blob, { upsert: true, contentType: "application/xml" });
        const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(filePath);
        const blocosJson = JSON.stringify({ blocos, participantes, escaladaList });
        const autoTickerTitulos = blocos.flatMap(b => b.noticias.filter(n => n.titulo.trim()).map(n => n.titulo.trim())).join("  •  ");
        await supabase.from("roteiros").update({ 
          programa_nome: pNome, 
          estudio, 
          titulo: `${autoTitlePrefix()}PROGRAMA EXPRESS — ${pNome}`, 
          subtitulo: `express_xml::${urlData.publicUrl}`, 
          conteudo_html: html, 
          participantes: blocosJson, 
          tickertitulos: autoTickerTitulos,
          configuracoes: configuracoes as any
        } as any).eq("id", editingId);
        setLastAutoSaved(Date.now());
      } catch (e) { console.error("Auto-save error:", e); }
      setAutoSaving(false);
    }, 2000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, estudio, programaId, blocos, participantes, escaladaList, initialized]);

  const addParticipante = (p: Participante) => {
    if (participantes.some(x => x.nome === p.nome)) { toast.info("Participante já adicionado"); return; }
    setParticipantes(prev => [...prev, p]);
    markEdited("participantes");
    setSearchNome("");
    setSearchResults([]);
    setShowResults(false);
  };

  const removeParticipante = (idx: number) => {
    setParticipantes(prev => prev.filter((_, i) => i !== idx));
    markEdited("participantes");
  };

  const openNewContactPopup = () => {
    setNewContact({ nome: searchNome.trim(), cargo: "", instagram: "", whatsapp: "" });
    setShowNewContact(true);
    setShowResults(false);
    setNoResults(false);
  };

  const saveNewContact = async () => {
    if (!user || !newContact.nome.trim()) return;
    setSavingContact(true);
    try {
      const { error } = await supabase.from("apresentadores").insert({
        user_id: user.id,
        nome: newContact.nome.trim(),
        cargo: newContact.cargo.trim(),
        instagram: newContact.instagram.trim(),
        whatsapp: newContact.whatsapp.trim(),
      });
      if (error) throw error;
      addParticipante({ nome: newContact.nome.trim(), cargo: newContact.cargo.trim(), instagram: newContact.instagram.trim() });
      setShowNewContact(false);
      toast.success("Contato salvo e adicionado!");
    } catch {
      toast.error("Erro ao salvar contato");
    }
    setSavingContact(false);
  };

  const reset = () => {
    setEstudio("");
    setProgramaId("");
    setBlocos([{ noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }]);
    setFetchingLink(null);
    setSaving(false);
    setCollapsedBlocos(new Set());
    setEditingId(null);
    setEditingXmlPath(null);
    setInitialized(false);
    setParticipantes([]);
    setEscaladaList([]);
    setSearchNome("");
    setSearchResults([]);
    setShowResults(false);
    setNoResults(false);
    setShowNewContact(false);
    setEditedFields(new Set());
    setLastAutoSaved(null);
    initialDataRef.current = null;
    setPodcastData({ tituloTarja: "", introducao: "", agendamentoData: "", agendamentoHorario: "", perguntas: [""], concluindo: "", apoioImagens: [""], apoioVideos: [""] });
  };

  /* Generate plain-text representation of current script for editing */
  const generatePlainText = (): string => {
    let text = "";
    text += `Estúdio: ${estudio}\n`;
    text += `Programa: ${programaNome}\n\n`;
    if (participantes.length > 0) {
      text += `EQUIPE:\n`;
      participantes.forEach(p => {
        text += `- ${p.nome}${p.cargo ? ` – ${p.cargo}` : ""}${p.instagram ? ` : ${p.instagram.startsWith("@") ? p.instagram : `@${p.instagram}`}` : ""}\n`;
      });
      text += "\n";
    }
    if (escaladaList.length > 0) {
      text += `ESCALADA:\n`;
      escaladaList.forEach((e, i) => { text += `${i + 1}. ${e.titulo}\n`; });
      text += "\n";
    }
    blocos.forEach((b, bi) => {
      text += `BLOCO ${bi + 1}:\n`;
      b.noticias.forEach(n => {
        if (!n.titulo) return;
        text += `- ${n.titulo}\n`;
      });
      text += "\n";
    });
    return text.trim();
  };

  const parsePastedScript = () => {
    if (!pasteText.trim()) { toast.error("Cole o texto do roteiro"); return; }
    const linhas = pasteText.split('\n').map(l => l.trim()).filter(l => l !== '');
    if (linhas.length < 2) { toast.error("O roteiro precisa de pelo menos 2 linhas"); return; }
    const cleanLabel = (s: string) => s.replace(/\*+/g, "").replace(/^[-•–]\s+/, "").replace(/^\d+[\.\)]\s*/, "").trim();
    const extractUrl = (s: string): string | null => {
      const mdLink = s.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
      if (mdLink) return mdLink[1];
      const plainUrl = s.match(/(https?:\/\/[^\s]+)/);
      if (plainUrl) return plainUrl[1];
      return null;
    };
    
    const extractMeta = (s: string, tag: string): string | null => {
      const regex = new RegExp(`\\[${tag}:(.*?)\\]`, "i");
      const match = s.match(regex);
      return match ? match[1].trim().replace(/\\n/g, "\n") : null;
    };

    let parsedEstudio = "";
    let parsedPrograma = "";
    const parsedParticipantes: Participante[] = [];
    const parsedEscalada: string[] = [];
    const parsedBlocos: Bloco[] = [];
    let secaoAtual = "cabecalho";
    let blocoAtual: NewsItem[] | null = null;

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const cleaned = cleanLabel(linha);
      if (i === 0) { const estMatch = cleaned.match(/^est[uú]dio\s*:\s*(.+)/i); parsedEstudio = estMatch ? estMatch[1].trim() : cleaned; continue; }
      if (i === 1) { const progMatch = cleaned.match(/^programa\s*:\s*(.+)/i); parsedPrograma = progMatch ? progMatch[1].trim() : cleaned; continue; }
      if (linha.replace(/\*/g, "").trim().toUpperCase().startsWith("EQUIPE")) { secaoAtual = "equipe"; continue; }
      if (linha.replace(/\*/g, "").trim().toUpperCase().startsWith("ESCALADA")) { secaoAtual = "escalada"; continue; }
      if (linha.replace(/\*/g, "").trim().toUpperCase().startsWith("BLOCO")) { secaoAtual = "blocos"; if (blocoAtual && blocoAtual.length > 0) parsedBlocos.push({ noticias: blocoAtual }); blocoAtual = []; continue; }
      if (secaoAtual === "equipe") {
        const partes = cleaned.match(/(.*?)[\s]*[-–—][\s]*(.*?):(.*)/);
        if (partes) { const nome = partes[1].trim(); const cargo = partes[2].trim(); let instagram = partes[3].trim(); if (instagram && !instagram.startsWith("@")) instagram = `@${instagram}`; if (nome) parsedParticipantes.push({ nome, cargo, instagram }); }
        else if (cleaned) parsedParticipantes.push({ nome: cleaned, cargo: "", instagram: "" });
      } else if (secaoAtual === "escalada") { const item = cleaned.replace(/\*$/, "").trim(); if (item) parsedEscalada.push(item); }
      else if (secaoAtual === "blocos" && blocoAtual) { 
        if (!cleaned) continue; 
        const url = extractUrl(linha);
        const resumo = extractMeta(linha, "RESUMO");
        const texto = extractMeta(linha, "TEXTO");
        let finalTitle = cleaned.replace(/\[RESUMO:.*?\]/gi, "").replace(/\[TEXTO:.*?\]/gi, "").trim();
        if (url) finalTitle = ""; 

        blocoAtual.push({ 
          titulo: finalTitle, 
          imagemUrl: "", 
          escalada: false, 
          link: url || undefined,
          resumo: resumo || undefined,
          texto_materia: texto || undefined
        }); 
      }
    }
    if (blocoAtual && blocoAtual.length > 0) parsedBlocos.push({ noticias: blocoAtual });
    if (parsedEstudio) { const matched = estudios.find(e => e.toLowerCase() === parsedEstudio.toLowerCase()); if (matched) setEstudio(matched); else { setEstudio(parsedEstudio); toast.info(`Estúdio "${parsedEstudio}" não encontrado na lista`); } }
    if (parsedPrograma) { const matched = programas.find(p => p.nome.toLowerCase() === parsedPrograma.toLowerCase()); if (matched) setProgramaId(matched.id); else { const partial = programas.find(p => p.nome.toLowerCase().includes(parsedPrograma.toLowerCase()) || parsedPrograma.toLowerCase().includes(p.nome.toLowerCase())); if (partial) setProgramaId(partial.id); else toast.warning(`Programa "${parsedPrograma}" não encontrado`); } }
    if (parsedParticipantes.length > 0) setParticipantes(parsedParticipantes);
    if (parsedEscalada.length > 0) setEscaladaList(parsedEscalada.map(t => ({ titulo: t, imagemUrl: "" })));
    if (parsedBlocos.length > 0) setBlocos(parsedBlocos);
    setShowPastePopup(false);
    setPasteText("");
    toast.success(editingId ? "Roteiro atualizado!" : "Roteiro importado com sucesso!");
    if (parsedBlocos.length > 0) {
      const linksToFetch: { bi: number; ni: number; url: string }[] = [];
      parsedBlocos.forEach((b, bi) => { 
        b.noticias.forEach((n, ni) => { 
          // Only fetch if we don't already have substantial content
          const hasContent = (n.texto_materia && n.texto_materia.length > 200) || (n.resumo && n.resumo.length > 200);
          if (n.link && n.link.startsWith("http") && !hasContent) {
            linksToFetch.push({ bi, ni, url: n.link }); 
          }
        }); 
      });
      if (linksToFetch.length > 0) { 
        toast.info(`Buscando dados de ${linksToFetch.length} links...`); 
        linksToFetch.forEach(({ bi, ni, url }) => fetchFromLink(bi, ni, url)); 
      }
    }
  };

  // Handle external paste text (from automation)
  useEffect(() => {
    if (externalPasteText && externalPasteText.trim()) {
      isAutoGenRef.current = true;
      setPasteText(externalPasteText);
      setShowPastePopup(true);
      onExternalPasteConsumed?.();
    }
  }, [externalPasteText]);

  const updateNoticia = (bi: number, ni: number, field: keyof NewsItem, value: any) => {
    if (editingId) markEdited(`noticia-${bi}-${ni}-${field}`);
    
    // Improved auto-fetch link detection (domains, parameters, multiple formats)
    if (field === "titulo" && typeof value === "string") {
      const trimmed = value.trim();
      // Match full URL or domain-like string (e.g. google.com, subdomain.site.com.br/path)
      const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?(\?.*)?$/i;
      
      if (urlPattern.test(trimmed) && !trimmed.includes(" ")) {
        let finalUrl = trimmed;
        if (!finalUrl.startsWith("http")) {
          finalUrl = "https://" + finalUrl;
        }
        
        // Immediate visual feedback that we are processing
        setBlocos(prev => prev.map((b, i) => i === bi ? { 
          ...b, 
          noticias: b.noticias.map((n, j) => j === ni ? { ...n, titulo: "", texto_materia: "" } : n) 
        } : b));
        
        fetchFromLink(bi, ni, finalUrl);
        return;
      }
    }

    setBlocos(prev => {
      const noticiaAnterior = prev[bi]?.noticias[ni];
      const updated = prev.map((b, i) => i === bi ? { ...b, noticias: b.noticias.map((n, j) => j === ni ? { ...n, [field]: value } : n) } : b);

      if (!noticiaAnterior) return updated;

      // Sync escaladaList when escalada is toggled or when title/image changes on escalada items
      if (field === "escalada") {
        if (value && noticiaAnterior.titulo) {
          setEscaladaList(prevList => {
            if (prevList.some(e => e.titulo === noticiaAnterior.titulo)) return prevList;
            return [...prevList, { titulo: noticiaAnterior.titulo, imagemUrl: noticiaAnterior.imagemUrl || "" }];
          });
        } else if (!value && noticiaAnterior.titulo) {
          setEscaladaList(prevList => prevList.filter(e => e.titulo !== noticiaAnterior.titulo));
        }
      }

      if ((field === "titulo" || field === "imagemUrl") && noticiaAnterior.escalada) {
        const novoTitulo = field === "titulo" ? String(value || "") : noticiaAnterior.titulo;
        const novaImagem = field === "imagemUrl" ? String(value || "") : noticiaAnterior.imagemUrl;
        setEscaladaList(prevList => {
          const idx = prevList.findIndex(e => e.titulo === noticiaAnterior.titulo || e.titulo === novoTitulo);
          if (!novoTitulo) {
            return idx >= 0 ? prevList.filter((_, i) => i !== idx) : prevList;
          }
          if (idx >= 0) {
            return prevList.map((e, i) => i === idx ? { ...e, titulo: novoTitulo, imagemUrl: novaImagem || "" } : e);
          }
          return [...prevList, { titulo: novoTitulo, imagemUrl: novaImagem || "" }];
        });
      }

      return updated;
    });
  };
  const addNoticia = (bi: number) => { setBlocos(prev => prev.map((b, i) => i === bi ? { ...b, noticias: [...b.noticias, { titulo: "", imagemUrl: "", escalada: false }] } : b)); };
  const removeNoticia = (bi: number, ni: number) => {
    setBlocos(prev => {
      const alvo = prev[bi]?.noticias[ni];
      if (alvo?.escalada && alvo.titulo) {
        setEscaladaList(prevList => prevList.filter(e => e.titulo !== alvo.titulo));
      }
      return prev.map((b, i) => i === bi ? { ...b, noticias: b.noticias.filter((_, j) => j !== ni) } : b);
    });
  };
  const addBloco = () => { setBlocos(prev => [...prev, { noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }]); };
  const removeBloco = (bi: number) => { setBlocos(prev => prev.filter((_, i) => i !== bi)); setCollapsedBlocos(prev => { const n = new Set(prev); n.delete(bi); return n; }); };
  const toggleCollapse = (bi: number) => { setCollapsedBlocos(prev => { const n = new Set(prev); if (n.has(bi)) n.delete(bi); else n.add(bi); return n; }); };

  const fetchFromLink = async (bi: number, ni: number, url: string, forceReprocess = false) => {
    if (!url || !url.startsWith("http")) return;
    setFetchingLink(`${bi}-${ni}`);
    
    // Clear field to show progress if we're going to generate journalistic text
    if (forceReprocess || configuracoes.producao_ai_habilitada) {
      updateNoticia(bi, ni, "texto_materia", "");
    }
    
    try {
      const { data, error } = await supabase.functions.invoke("fetch-rss", { 
        body: { 
          url,
          generate_journalistic_text: forceReprocess ? true : configuracoes.producao_ai_habilitada,
          custom_prompt: configuracoes.prompt_ai
        } 
      });
      if (!error && data?.ok && data.content) {
        const html = data.content as string;
        const getMetaContent = (property: string): string => {
          const patterns = [
            new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
            new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
            new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
            new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, "i"),
          ];
          for (const p of patterns) { const m = html.match(p); if (m?.[1]) return m[1]; }
          return "";
        };
        const rawTitle = getMetaContent("og:title") || getMetaContent("twitter:title") || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").trim();
        let title = rawTitle.includes("|") ? rawTitle.split("|")[0].trim() : rawTitle;
        if (title.includes(" - ")) title = title.split(" - ")[0].trim();
        const image = getMetaContent("og:image") || getMetaContent("twitter:image");
        
        // Extract summary/description
        let summary = getMetaContent("og:description") || getMetaContent("twitter:description") || getMetaContent("description");
        if (!summary) {
          const pMatches = html.match(/<p[^>]*>([^<]{40,})<\/p>/gi);
          if (pMatches) {
            summary = pMatches[0].replace(/<[^>]+>/g, "").trim().slice(0, 300);
          }
        }

        const decodeFull = (v: string) => { let s = v; for (let i = 0; i < 3; i++) { const d = decodeHtmlEntities(s); if (d === s) break; s = d; } return s; };
        
        // We need to use a functional update for setBlocos to ensure we don't rely on stale state
        setBlocos(prev => prev.map((b, i) => i === bi ? {
          ...b,
          noticias: b.noticias.map((n, j) => {
            if (j !== ni) return n;
            const updated = { ...n };
            const hasSubstantialText = (n.texto_materia && n.texto_materia.length > 200) || 
                                      (n.resumo && n.resumo.length > 200);

            if (title && (forceReprocess || !n.titulo || n.titulo.length < 5)) {
              updated.titulo = decodeFull(title);
            }
            if (image && (forceReprocess || !n.imagemUrl)) {
              updated.imagemUrl = decodeFull(image);
            }
            if (summary && (forceReprocess || !hasSubstantialText)) {
              updated.resumo = decodeFull(summary);
            }
            if (data.journalisticText) {
              updated.texto_materia = data.journalisticText;
            }
            updated.link = url;
            return updated;
          })
        } : b));

        if (data.journalisticText && data.journalisticText.includes("ERRO:")) {
          toast.error("Erro na geração da IA", { description: data.journalisticText });
        } else if (configuracoes.producao_ai_habilitada && !data.journalisticText) {
          console.warn("AI failed to return journalistic text despite being enabled.");
          toast.warning("A IA não retornou o texto jornalístico. Tente reprocessar.");
        }
        
        if (title) toast.success(forceReprocess ? "Matéria reprocessada com sucesso!" : "Dados extraídos do link!"); 
        else toast.warning("Link carregado, mas não foi possível extrair o título");
      } else { toast.error("Não foi possível acessar o link"); }
    } catch { toast.error("Não foi possível extrair dados do link"); }
    setFetchingLink(null);
  };

  const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const generateXml = (): string => {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<programaExpress>\n`;
    xml += `  <programa>${programaNome}</programa>\n  <estudio>${estudio}</estudio>\n  <data>${new Date().toISOString().split("T")[0]}</data>\n`;
    if (participantes.length > 0) { xml += `  <participantes>\n`; participantes.forEach((p) => { xml += `    <item>\n      <nome>${escXml(p.nome)}</nome>\n      <cargo>${escXml(p.cargo)}</cargo>\n      <instagram>${escXml(p.instagram)}</instagram>\n    </item>\n`; }); xml += `  </participantes>\n`; }
    if (isPodcast) {
      xml += `  <roteiro>\n`;
      xml += `    <tituloTarja>${escXml(podcastData.tituloTarja)}</tituloTarja>\n`;
      xml += `    <introducao>${escXml(podcastData.introducao)}</introducao>\n`;
      xml += `    <perguntas>\n`;
      podcastData.perguntas.filter(p => p.trim()).forEach((p, i) => { xml += `      <pergunta ordem="${i + 1}">${escXml(p)}</pergunta>\n`; });
      xml += `    </perguntas>\n`;
      xml += `    <concluindo>${escXml(podcastData.concluindo)}</concluindo>\n`;
      if (podcastData.apoioImagens.some(u => u.trim())) { xml += `    <apoioImagens>\n`; podcastData.apoioImagens.filter(u => u.trim()).forEach(u => { xml += `      <imagem>${escXml(u)}</imagem>\n`; }); xml += `    </apoioImagens>\n`; }
      if (podcastData.apoioVideos.some(u => u.trim())) { xml += `    <apoioVideos>\n`; podcastData.apoioVideos.filter(u => u.trim()).forEach(u => { xml += `      <video>${escXml(u)}</video>\n`; }); xml += `    </apoioVideos>\n`; }
      xml += `  </roteiro>\n`;
    } else {
      if (escaladaList.length > 0) { xml += `  <escalada>\n`; escaladaList.forEach((e, i) => { xml += `    <item ordem="${i + 1}">\n      <titulo>${escXml(e.titulo)}</titulo>\n      <imagem>${escXml(e.imagemUrl)}</imagem>\n    </item>\n`; }); xml += `  </escalada>\n`; }
      blocos.forEach((b, bi) => { xml += `  <bloco numero="${bi + 1}">\n`; (b?.noticias || []).forEach((n, ni) => { if (!n?.titulo) return; xml += `    <noticia ordem="${ni + 1}">\n      <titulo>${escXml(n.titulo)}</titulo>\n      <imagem>${escXml(n.imagemUrl)}</imagem>\n      <resumo>${escXml(n.resumo || "")}</resumo>\n      <texto_materia>${escXml(n.texto_materia || "")}</texto_materia>\n      <escalada>${n.escalada}</escalada>\n    </noticia>\n`; }); xml += `  </bloco>\n`; });
    }
    xml += `</programaExpress>`;
    return xml;
  };

  const addWeatherInfo = async (bi: number, ni?: number) => {
    const isRegenerating = ni !== undefined;
    if (isRegenerating) setFetchingLink(`${bi}-${ni}`);
    else setAddingWeather(true);
    
    try {
      let city = "";
      try {
        const primary = JSON.parse(localStorage.getItem("masterview_primary_city") || "null");
        if (primary?.name) city = primary.name;
        if (!city) city = localStorage.getItem("masterview_last_city") || "";
      } catch {}

      if (!city && user) {
        const { data } = await supabase.from("user_settings").select("weather_city").eq("user_id", user.id).maybeSingle();
        if (data?.weather_city) city = data.weather_city;
      }

      if (!city) {
        toast.error("Cidade não configurada. Defina em CADASTRO > CIDADE TEMPO.");
        if (isRegenerating) setFetchingLink(null);
        else setAddingWeather(false);
        return;
      }

      const { data: geoData } = await supabase.functions.invoke("fetch-weather", {
        body: { action: "geocode", query: city, count: 1 },
      });

      if (!geoData?.results?.length) {
        toast.error("Não foi possível localizar a cidade.");
        if (isRegenerating) setFetchingLink(null);
        else setAddingWeather(false);
        return;
      }

      const { latitude, longitude, name } = geoData.results[0];
      const { data: wxResp } = await supabase.functions.invoke("fetch-weather", {
        body: { action: "forecast", lat: latitude, lon: longitude, forecast_days: 2 },
      });

      const wxData = wxResp?.data;
      const todayMax = Math.round(wxData.daily.temperature_2m_max[0]);
      const todayMin = Math.round(wxData.daily.temperature_2m_min[0]);
      const tomorrowMax = Math.round(wxData.daily.temperature_2m_max[1]);
      const tomorrowMin = Math.round(wxData.daily.temperature_2m_min[1]);
      const rainChance = wxData.daily.precipitation_probability_max[0] ?? 0;
      const humidity = wxData.current.relative_humidity_2m;
      
      const weatherText = `Previsão para ${name}: Hoje a temperatura varia entre ${todayMin}°C e ${todayMax}°C com ${rainChance}% de chance de chuva. Umidade relativa do ar em ${humidity}%. Amanhã a mínima será de ${tomorrowMin}°C e a máxima de ${tomorrowMax}°C.`;

      const { data: aiData, error: aiError } = await supabase.functions.invoke("fetch-rss", {
        body: {
          input_text: weatherText,
          skip_fetch: true,
          generate_journalistic_text: true,
          custom_prompt: `Você é um apresentador de telejornalismo sênior. Crie uma previsão do tempo completa para ${name}, em PORTUGUÊS (Brasil).
          
          DADOS REAIS: ${weatherText}
          
          REQUISITOS OBRIGATÓRIOS:
          1. Divida em parágrafos curtos e claros para Teleprompter.
          2. Informe temperaturas de hoje e amanhã, chance de chuva (${rainChance}%) e umidade (${humidity}%).
          3. Se a umidade for baixa (< 30%), inclua um alerta de saúde.
          4. NÃO mencione nomes de sites ou erros de página.`
        }
      });

      let finalContent = weatherText;
      if (!aiError && aiData?.journalisticText) {
        finalContent = aiData.journalisticText;
      }

      if (isRegenerating) {
        updateNoticia(bi, ni!, "texto_materia", finalContent);
        toast.success(aiError ? "Previsão atualizada!" : "Previsão atualizada com IA!");
      } else {
        const newItem: NewsItem = {
          titulo: "Tempo",
          resumo: "Vamos ver como fica a previsão do tempo",
          texto_materia: finalContent,
          imagemUrl: "",
          escalada: false
        };

        setBlocos(prev => prev.map((b, i) => i === bi ? { ...b, noticias: [...b.noticias, newItem] } : b));
        toast.success("Previsão do tempo adicionada!");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao processar previsão do tempo");
    }
    if (isRegenerating) setFetchingLink(null);
    else setAddingWeather(false);
  };

  const addFinanceInfo = async (bi: number, ni?: number) => {
    const isRegenerating = ni !== undefined;
    if (isRegenerating) setFetchingLink(`${bi}-${ni}`);
    else setAddingFinance(true);
    
    try {
      // Fetch real-time exchange rates and market data
      let financeContext = "";
      try {
        const [usdResp, eurResp, btcResp] = await Promise.all([
          fetch("https://economia.awesomeapi.com.br/last/USD-BRL"),
          fetch("https://economia.awesomeapi.com.br/last/EUR-BRL"),
          fetch("https://economia.awesomeapi.com.br/last/BTC-BRL")
        ]);
        const usdData = await usdResp.json();
        const eurData = await eurResp.json();
        const btcData = await btcResp.json();
        
        const usdTime = new Date(usdData.USDBRL.create_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        financeContext = `Cotações e Variações: 
        - Dólar Comercial: R$ ${parseFloat(usdData.USDBRL.bid).toFixed(2)} (${usdData.USDBRL.pctChange}%)
        - Euro: R$ ${parseFloat(eurData.EURBRL.bid).toFixed(2)} (${eurData.EURBRL.pctChange}%)
        - Bitcoin: R$ ${parseFloat(btcData.BTCBRL.bid).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${btcData.BTCBRL.pctChange}%)
        Dados atualizados às ${usdTime} via AwesomeAPI.`;
      } catch (e) {
        console.warn("AwesomeAPI error:", e);
      }

      const { data: aiData, error: aiError } = await supabase.functions.invoke("fetch-rss", {
        body: {
          input_text: financeContext,
          skip_fetch: true,
          generate_journalistic_text: true,
          custom_prompt: `Você é um analista financeiro sênior brasileiro. Crie um resumo profissional do mercado financeiro em PORTUGUÊS (Brasil).
          
          DADOS REAIS: ${financeContext}
          
          REQUISITOS OBRIGATÓRIOS:
          1. O texto DEVE ter no mínimo 4 parágrafos curtos e claros para Teleprompter.
          2. Comece com a cotação exata e a VARIAÇÃO PERCENTUAL do Dólar e do Euro (ex: "+0.5%").
          3. Inclua obrigatoriamente dados atualizados das 5 principais bolsas: B3 (Ibovespa), NYSE, NASDAQ, FTSE 100 e Nikkei 225.
          4. Se os dados das bolsas não estiverem no contexto, use informações de mercado recentes e destaque a tendência (alta/baixa).
          5. Finalize mencionando o horário e a fonte AwesomeAPI.`
        }
      });

      let finalContent = "O mercado financeiro opera em estabilidade hoje. O dólar apresenta leve oscilação frente ao real, enquanto a bolsa de valores mantém patamares consistentes acompanhando o cenário internacional.";
      if (!aiError && aiData?.journalisticText) {
        finalContent = aiData.journalisticText;
      }

      if (isRegenerating) {
        updateNoticia(bi, ni!, "texto_materia", finalContent);
        toast.success(aiError ? "Mercado financeiro atualizado!" : "Mercado financeiro atualizado com IA!");
      } else {
        const newItem: NewsItem = {
          titulo: "Mercado Financeiro",
          resumo: "Confira agora os destaques da economia e do mercado financeiro",
          texto_materia: finalContent,
          imagemUrl: "",
          escalada: false
        };

        setBlocos(prev => prev.map((b, i) => i === bi ? { ...b, noticias: [...b.noticias, newItem] } : b));
        toast.success("Mercado financeiro adicionado!");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao processar mercado financeiro");
    }
    if (isRegenerating) setFetchingLink(null);
    else setAddingFinance(false);
  };

  const handleSave = async () => {
    if (!user || !programaId) return;
    if (isPodcast) {
      if (!podcastData.tituloTarja.trim() && podcastData.perguntas.every(p => !p.trim())) {
        toast.error("Preencha ao menos o título da tarja ou uma pergunta"); return;
      }
    } else {
      const totalNews = (blocos || []).reduce((s, b) => s + ((b?.noticias || []).filter(n => n?.titulo?.trim() || n?.texto_materia?.trim()).length), 0);
      if (totalNews === 0) { toast.error("Adicione pelo menos uma notícia ou conteúdo informativo"); return; }
    }
    setSaving(true);
    try {
      const xmlContent = generateXml();
      let html = `<h2 style="text-align:center;font-weight:bold;">PROGRAMA EXPRESS — ${programaNome}</h2>`;
      if (participantes.length > 0) { html += `<h3 style="font-weight:bold;margin-top:16px;">👥 PARTICIPANTES</h3><ul>`; participantes.forEach(p => { html += `<li><strong>${p.nome}</strong>${p.cargo ? ` — ${p.cargo}` : ""}${p.instagram ? ` (@${p.instagram.replace("@", "")})` : ""}</li>`; }); html += `</ul>`; }
      if (isPodcast) {
        html += `<h3 style="font-weight:bold;margin-top:16px;">🎙️ ROTEIRO</h3>`;
        if (podcastData.tituloTarja) html += `<p><strong>Tarja:</strong> ${podcastData.tituloTarja}</p>`;
        if (podcastData.introducao) html += `<p><strong>Introdução:</strong> ${podcastData.introducao}</p>`;
        const validPerguntas = podcastData.perguntas.filter(p => p.trim());
        if (validPerguntas.length > 0) { html += `<h4 style="font-weight:bold;margin-top:12px;">❓ Perguntas</h4><ol>`; validPerguntas.forEach(p => { html += `<li>${p}</li>`; }); html += `</ol>`; }
        if (podcastData.concluindo) html += `<p><strong>Concluindo:</strong> ${podcastData.concluindo}</p>`;
      } else {
        if (escaladaList.length > 0) { html += `<h3 style="font-weight:bold;margin-top:16px;">📢 ESCALADA</h3><ul>`; escaladaList.forEach(e => { html += `<li><strong>${e.titulo}</strong></li>`; }); html += `</ul>`; }
        blocos.forEach((b, bi) => { html += `<h3 style="font-weight:bold;margin-top:16px;">📺 BLOCO ${bi + 1}</h3>`; b.noticias.forEach((n, ni) => { if (!n.titulo) return; html += `<div data-news-item="true" style="margin-bottom:12px;"><p><strong>Notícia ${ni + 1}:</strong> ${n.titulo}</p>`; if (n.resumo) html += `<p style="margin-top:4px;font-size:0.9em;opacity:0.9;">${n.resumo}</p>`; if (n.texto_materia) html += `<div style="margin-top:8px;padding:8px;background:#f8fafc;border-left:4px solid #3b82f6;font-size:0.95em;line-height:1.6;">${n.texto_materia.replace(/\n/g, "<br/>")}</div>`; if (n.imagemUrl) html += `<p><em>Imagem:</em> <a href="${n.imagemUrl}">${n.imagemUrl}</a></p></div>`; }); });
      }

      const blocosJson = isPodcast
        ? JSON.stringify({ blocos, participantes, escaladaList, podcastData })
        : JSON.stringify({ blocos, participantes, escaladaList });

      // Generate ticker titles from all news titles
      const allTitles = (blocos || []).flatMap(b => (b?.noticias || []).filter(n => n?.titulo?.trim()).map(n => n.titulo.trim()));
      const tickertitulos = allTitles.join("  •  ");

      const selectedProg = programas.find(p => p.id === programaId);
      const tipoProg = selectedProg?.tipo_programa || "Jornalístico";

      let roteiroId = editingId;
      if (!roteiroId) {
        // Insert first to get a stable ID for the XML path
        const { data: inserted, error } = await supabase.from("roteiros").insert({ user_id: user.id, programa_nome: programaNome, estudio, titulo: `${autoTitlePrefix()}PROGRAMA EXPRESS — ${programaNome}`, subtitulo: "", tipo_programa: tipoProg, data_programa: new Date().toISOString().split("T")[0], horario: new Date().toTimeString().slice(0, 5), conteudo_html: html, participantes: blocosJson, status: "feito", tickertitulos } as any).select("id").single();
        if (error || !inserted) throw error || new Error("Falha ao criar roteiro");
        roteiroId = inserted.id;
        setEditingId(roteiroId);
      }

      const blob = new Blob([xmlContent], { type: "application/xml" });
      const filePath = editingXmlPath || `express/${user.id}/express_${roteiroId}.xml`;
      if (!editingXmlPath) setEditingXmlPath(filePath);
      await supabase.storage.from("empresa-assets").upload(filePath, blob, { upsert: true, contentType: "application/xml" });
      const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(filePath);
      const xmlUrl = urlData.publicUrl;

      const { error: updErr } = await supabase.from("roteiros").update({ programa_nome: programaNome, estudio, titulo: `${autoTitlePrefix()}PROGRAMA EXPRESS — ${programaNome}`, subtitulo: `express_xml::${xmlUrl}`, conteudo_html: html, participantes: blocosJson, tickertitulos } as any).eq("id", roteiroId);
      if (updErr) throw updErr;

      // Create or update agenda event when podcast is scheduled
      if (isPodcast && podcastData.agendamentoData) {
        try {
          const horario = podcastData.agendamentoHorario || "00:00";
          const descricao = `Roteiro: ${programaNome}${horario ? ` às ${horario}` : ""}${podcastData.tituloTarja ? ` — ${podcastData.tituloTarja}` : ""}`;
          let targetEventoId = editData?.agendaEventoId;

          if (!targetEventoId) {
            const { data: eventosExistentes } = await supabase
              .from("agenda_eventos")
              .select("id, horario_gravacao")
              .eq("user_id", user.id)
              .eq("programa_id", programaId)
              .eq("data", podcastData.agendamentoData)
              .eq("tipo_evento", "gravacao")
              .limit(10);

            const horarioCurto = horario.slice(0, 5);
            targetEventoId = eventosExistentes?.find((evt: any) => (evt.horario_gravacao || "").slice(0, 5) === horarioCurto)?.id
              || eventosExistentes?.[0]?.id;
          }

          if (targetEventoId) {
            // Update existing event (e.g. when editing a "gravacao" event from Agenda)
            await supabase.from("agenda_eventos").update({
              data: podcastData.agendamentoData,
              local: estudio || "Podcast",
              descricao,
              programa_id: programaId,
              tipo_evento: "gravacao",
              horario_gravacao: horario,
            } as any).eq("id", targetEventoId);
            toast.success("Evento da agenda atualizado 📅", { duration: 2500 });
          } else {
            await supabase.from("agenda_eventos").insert({
              user_id: user.id,
              data: podcastData.agendamentoData,
              local: estudio || "Podcast",
              descricao,
              prioridade: "alta",
              programa_id: programaId,
              recorrencia: "unico",
              tipo_evento: "gravacao",
              horario_gravacao: horario,
            } as any);
            toast.success("Evento adicionado à agenda 📅", { duration: 2500 });
          }
        } catch (e) { console.warn("Falha ao salvar evento na agenda:", e); }
      }

      try { sessionStorage.removeItem("roteiro_auto_generated"); } catch {}
      isAutoGenRef.current = false;
      toast.success("Roteiro salvo ✨", { duration: 3000, style: { background: "#22c55e", color: "#fff", fontWeight: 600, borderRadius: "12px", boxShadow: "0 8px 32px rgba(34,197,94,0.35)" } });
      reset();
      onFinish();
      setTimeout(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, 200);
    } catch (e: any) {
      console.error("[ProgramaExpress] Erro ao salvar:", e);
      const detalhe = e?.message || e?.error_description || e?.error || (typeof e === "string" ? e : JSON.stringify(e));
      toast.error(`Erro ao salvar: ${detalhe}`, { duration: 8000 });
    }
    setSaving(false);
  };

  // === Nexo Form Design System (mesmo do Cadastro de Participante) ===
  const NEXO_CYAN = "#00BFF0";
  const NEXO_CARD_BG = "#D6F4FB";
  const NEXO_DARK = "#0A2540";
  const inputStyle = {
    backgroundColor: "#FFFFFF",
    border: `2px solid ${NEXO_CYAN}`,
    color: NEXO_DARK,
    borderRadius: 10,
    fontFamily: "'Montserrat', sans-serif",
  } as React.CSSProperties;
  if (renderAsModal && !novoRoteiroOpen) return null;

  const card = (
    <div className="rounded-2xl overflow-hidden" style={{ background: renderAsModal ? NEXO_CARD_BG : "#ffffff", boxShadow: renderAsModal ? "0 20px 60px rgba(0,0,0,0.35)" : "0 4px 24px rgba(0,0,0,0.08)", width: "100%", fontFamily: "'Montserrat', sans-serif" }}>
      {renderAsModal && (
        <button
          onClick={() => setNovoRoteiroOpen(false)}
          aria-label="Fechar"
          style={{ position: "absolute", top: 12, right: 12, width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.9)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}
        >
          <XIcon size={16} style={{ color: "#0A2540" }} />
        </button>
      )}
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ background: renderAsModal ? NEXO_CARD_BG : "linear-gradient(135deg, var(--layout-button-bg, #2563eb), color-mix(in srgb, var(--layout-button-bg, #2563eb) 70%, black 30%))", color: renderAsModal ? NEXO_DARK : "#ffffff", borderBottom: renderAsModal ? `1px solid rgba(10,37,64,0.08)` : "none" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: renderAsModal ? NEXO_CYAN : "rgba(255,255,255,0.15)", color: renderAsModal ? "#FFFFFF" : "inherit" }}>
            <Zap size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ letterSpacing: renderAsModal ? 2 : 0, textTransform: renderAsModal ? "uppercase" : "none", color: renderAsModal ? NEXO_DARK : "inherit" }}>{editingId ? "Editar Roteiro" : "Novo Roteiro"}</h3>
            <p className="text-xs flex items-center gap-1.5" style={{ opacity: 1, color: renderAsModal ? "rgba(10,37,64,0.65)" : "rgba(255,255,255,0.92)", textShadow: renderAsModal ? "none" : "0 1px 3px rgba(0,0,0,0.4)" }}>
              {autoSaving ? <><Loader2 size={10} className="animate-spin" /> Salvando...</> : lastAutoSaved ? <><CheckCircle2 size={10} style={{ color: "#22c55e" }} /> Salvo automaticamente</> : "Monte seu roteiro de forma rápida"}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            if (editingId && !showPastePopup) {
              setPasteText(generatePlainText());
            }
            setShowPastePopup(true);
          }}
          className="flex items-center gap-1.5 text-[11px] font-semibold py-1.5 px-3 hover:opacity-80 transition-all"
          style={{ backgroundColor: renderAsModal ? "#FFFFFF" : "rgba(255,255,255,0.15)", color: renderAsModal ? NEXO_DARK : "var(--layout-header-text, #ffffff)", border: renderAsModal ? `2px solid ${NEXO_CYAN}` : "none", borderRadius: renderAsModal ? 999 : 8, marginRight: renderAsModal ? 44 : 0 }}
        >
          <ClipboardPaste size={13} /> Colar Roteiro
        </button>
      </div>


      {afterHeader}
      {!hideNovoToggle && (
      <div className="px-6 pt-4 pb-2">
        <div className="rounded-xl p-3" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 14%, transparent)" }}>
          <button
            onClick={() => setNovoRoteiroOpen(o => !o)}
            className="w-full flex items-center gap-2 hover:opacity-80 transition"
            title={novoRoteiroOpen ? "Recolher" : "Expandir"}
          >
            <Zap size={12} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
            <span className="text-[11px] font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              {editingId ? "Editar Roteiro" : "Novo Roteiro"}
            </span>
            <span className="text-[10px] hidden sm:inline" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
              · identificação, escalada, blocos
            </span>
            <span className="ml-auto">
              {novoRoteiroOpen
                ? <ChevronUp size={12} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
                : <ChevronDown size={12} style={{ color: "var(--layout-icon-color, #888)" }} />}
            </span>
          </button>
        </div>
      </div>
      )}

      {novoRoteiroOpen && (
      <div className="space-y-5" style={{ padding: renderAsModal ? "28px 32px 32px" : "24px" }}>

        {/* Seção movida para RoteiroPrograma.tsx ou gerenciada via afterHeader se preferir, 
            mas o usuário pediu para colocar ABAIXO da seção de automatização no Roteiro de Programa.
            Removendo daqui para evitar duplicidade visual e confusão. */}


        {/* Paste Script */}
        {showPastePopup && (
          <div className="rounded-xl p-3 space-y-2" style={{ border: "2px solid var(--layout-accent-color, #2ec1f7)", backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 6%, transparent)" }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: "var(--layout-accent-color, #2ec1f7)" }}>
                <ClipboardPaste size={14} /> Colar Roteiro
              </p>
              <button onClick={() => { setShowPastePopup(false); setPasteText(""); }} className="p-0.5 rounded hover:opacity-70" style={{ color: "var(--layout-page-text)" }}>
                <XIcon size={14} />
              </button>
            </div>
            <p className="text-[10px] leading-relaxed" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
              Cole o texto seguindo o formato:<br/>
              <strong>Estúdio:</strong> Nome do Estúdio<br/>
              <strong>Programa:</strong> Nome do Programa<br/>
              <strong>EQUIPE:</strong> Nome – cargo : @instagram<br/>
              <strong>ESCALADA:</strong> títulos numerados<br/>
              <strong>BLOCO 1:</strong> links ou textos das tarjas
            </p>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder={"Estúdio: Estudio FM\nPrograma: Papo Cabeça\n\nEQUIPE:\n- Henrique – âncora: @henrique\n\nESCALADA:\n1. TÍTULO 1\n\nBLOCO 1:\n- https://link.com"}
              className="w-full px-3 py-2 rounded-lg text-[11px] outline-none resize-none"
              rows={10}
              style={inputStyle}
            />
            <button onClick={parsePastedScript} disabled={!pasteText.trim()} className="w-full py-2 rounded-lg text-[11px] font-bold transition-all hover:opacity-90 flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ backgroundColor: "var(--layout-accent-color, #2ec1f7)", color: "var(--layout-header-text, #fff)" }}>
              <Check size={12} /> {editingId ? "Atualizar Roteiro" : "Importar Roteiro"}
            </button>
          </div>
        )}

        {/* Estudio + Programa */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Identificação do programa</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold mb-1.5 flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Estúdio {editedFields.has("estudio") && <EditedCheck />}</label>
              <Select value={estudio} onValueChange={v => { setEstudio(v); setProgramaId(""); if (editingId) markEdited("estudio"); }}>
                <SelectTrigger className="w-full text-xs h-10">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {estudios.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] font-semibold mb-1.5 flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Programa {editedFields.has("programa") && <EditedCheck />}</label>
              <Select value={programaId} onValueChange={v => { setProgramaId(v); if (editingId) markEdited("programa"); }}>
                <SelectTrigger className="w-full text-xs h-10">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {filteredProgramas.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {programaId && (() => {
                const tp = programas.find(p => p.id === programaId)?.tipo_programa;
                return tp ? <p className="text-[10px] mt-1 font-semibold" style={{ color: "var(--layout-accent-color, #2ec1f7)" }}>{tp}</p> : null;
              })()}
            </div>
          </div>
        </div>

        <div className="h-px" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)" }} />

        {/* Participantes */}
        <div className="rounded-xl p-4" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 25%, transparent)", backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 4%, transparent)" }}>
          <p className="text-xs font-bold flex items-center gap-1.5 mb-3" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            <Users size={14} style={{ color: "var(--layout-accent-color, #2ec1f7)" }} />
            Participantes {editedFields.has("participantes") && <EditedCheck />}
          </p>
          {participantes.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {participantes.map((p, idx) => (
                <ParticipanteRow key={idx} participante={p} inputStyle={inputStyle} onRemove={() => removeParticipante(idx)} onUpdateCargo={(cargo) => { setParticipantes(prev => prev.map((x, i) => i === idx ? { ...x, cargo } : x)); }} userId={user?.id || ""} />
              ))}
            </div>
          )}
          <div ref={searchRef} className="relative">
            <div className="flex gap-1.5 items-center">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--layout-icon-color, #888)" }} />
                <input value={searchNome} onChange={e => { setSearchNome(e.target.value); setShowResults(true); }} onFocus={() => { if (searchResults.length > 0 || noResults) setShowResults(true); }} placeholder="Buscar participante pelo nome..." className="w-full pl-7 pr-3 py-2 rounded-lg text-[11px] outline-none" style={inputStyle} />
              </div>
            </div>
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 25%, transparent)" }}>
                {searchResults.map((r, i) => (
                  <button key={i} onClick={() => addParticipante(r)} className="w-full text-left px-3 py-2 text-[11px] hover:opacity-80 transition-all flex items-center gap-2" style={{ color: "var(--layout-page-text, #1a1a1a)", borderBottom: i < searchResults.length - 1 ? "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 10%, transparent)" : "none" }}>
                    <span className="font-semibold flex-1 truncate">{r.nome}</span>
                    {r.cargo && <span className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>{r.cargo}</span>}
                    {r.instagram && <span className="text-[10px]" style={{ color: "var(--layout-accent-color, #2ec1f7)" }}>@{r.instagram.replace("@", "")}</span>}
                  </button>
                ))}
              </div>
            )}
            {showResults && noResults && searchNome.trim().length > 1 && (
              <div className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden p-3" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 25%, transparent)" }}>
                <p className="text-[11px] mb-2" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nenhum resultado para "<strong>{searchNome}</strong>".</p>
                <button onClick={openNewContactPopup} className="flex items-center gap-1.5 text-[11px] font-semibold py-1.5 px-3 rounded-lg hover:opacity-80 transition-all" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 12%, transparent)", color: "var(--layout-accent-color, #2ec1f7)" }}>
                  <UserPlus size={12} /> Vamos salvar esse contato?
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Atualizar Notícias por Links (apenas em edição) */}
        {editingId && !isPodcast && (
          <UpdateNewsLinksSection
            blocos={blocos}
            inputStyle={inputStyle}
            onUpdateBloco={(bi, items) => {
              setBlocos(prev => prev.map((b, i) => i === bi ? { noticias: items } : b));
            }}
            fetchFromLink={fetchFromLink}
          />
        )}

        {/* New Contact */}
        {showNewContact && (
          <div className="rounded-xl p-3 space-y-2" style={{ border: "2px solid var(--layout-accent-color, #2ec1f7)", backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 6%, transparent)" }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: "var(--layout-accent-color, #2ec1f7)" }}><UserPlus size={14} /> Novo Participante</p>
              <button onClick={() => setShowNewContact(false)} className="p-0.5 rounded hover:opacity-70" style={{ color: "var(--layout-page-text)" }}><XIcon size={14} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[10px] font-semibold mb-0.5 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nome</label><input value={newContact.nome} onChange={e => setNewContact(p => ({ ...p, nome: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none" style={inputStyle} /></div>
              <div><label className="text-[10px] font-semibold mb-0.5 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Cargo</label><input value={newContact.cargo} onChange={e => setNewContact(p => ({ ...p, cargo: e.target.value }))} placeholder="Ex: Repórter" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none" style={inputStyle} /></div>
              <div><label className="text-[10px] font-semibold mb-0.5 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Instagram</label><input value={newContact.instagram} onChange={e => setNewContact(p => ({ ...p, instagram: e.target.value }))} placeholder="@usuario" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none" style={inputStyle} /></div>
              <div><label className="text-[10px] font-semibold mb-0.5 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>WhatsApp</label><input value={newContact.whatsapp} onChange={e => setNewContact(p => ({ ...p, whatsapp: e.target.value }))} placeholder="(00) 00000-0000" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none" style={inputStyle} /></div>
            </div>
            <Button variant="save" onClick={saveNewContact} disabled={savingContact || !newContact.nome.trim()}>
              {savingContact ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salvar e Incluir
            </Button>
          </div>
        )}

        {/* Podcast-specific form */}
        {isPodcast ? (
          <div className="space-y-5">
            {/* ── Roteiro ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "2px solid #8b5cf644", backgroundColor: "#8b5cf60a" }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: "#8b5cf615" }}>
                <FileText size={16} style={{ color: "#8b5cf6" }} />
                <span className="text-sm font-bold" style={{ color: "#8b5cf6" }}>🎙️ Roteiro</span>
              </div>
              <div className="p-4 space-y-4">
                {/* Titulo da Tarja */}
                <div>
                  <label className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                    <Type size={12} style={{ color: "#8b5cf6" }} /> Título da Tarja
                  </label>
                  <input
                    value={podcastData.tituloTarja}
                    onChange={e => setPodcastData(prev => ({ ...prev, tituloTarja: e.target.value }))}
                    placeholder="Ex: Entrevista com especialista em tecnologia"
                    className="w-full px-3 py-2.5 rounded-lg text-[12px] outline-none"
                    style={inputStyle}
                  />
                </div>

                {/* Agendamento de Publicação */}
                <div className="rounded-lg p-3" style={{ border: "1px dashed #8b5cf666", backgroundColor: "#8b5cf608" }}>
                  <label className="text-[11px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: "#8b5cf6" }}>
                    📅 Agendar publicação no XML (opcional)
                  </label>
                  <p className="text-[10px] mb-2" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>
                    Antes da data/hora informada, o XML mostrará apenas o programa. Depois, será atualizado com o conteúdo completo.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={podcastData.agendamentoData}
                      onChange={e => setPodcastData(prev => ({ ...prev, agendamentoData: e.target.value }))}
                      className="px-3 py-2 rounded-lg text-[12px] outline-none"
                      style={inputStyle}
                    />
                    <input
                      type="time"
                      value={podcastData.agendamentoHorario}
                      onChange={e => setPodcastData(prev => ({ ...prev, agendamentoHorario: e.target.value }))}
                      className="px-3 py-2 rounded-lg text-[12px] outline-none"
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Introdução do Tema */}
                <div>
                  <label className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                    <MessageSquare size={12} style={{ color: "#8b5cf6" }} /> Introdução do Tema
                  </label>
                  <textarea
                    value={podcastData.introducao}
                    onChange={e => setPodcastData(prev => ({ ...prev, introducao: e.target.value }))}
                    placeholder="Descreva o tema principal do podcast e o contexto da conversa..."
                    className="w-full px-3 py-2.5 rounded-lg text-[12px] outline-none resize-none"
                    rows={3}
                    style={inputStyle}
                  />
                </div>

                <div className="h-px" style={{ backgroundColor: "color-mix(in srgb, #8b5cf6 15%, transparent)" }} />

                {/* Perguntas */}
                <div>
                  <label className="text-[11px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                    <HelpCircle size={12} style={{ color: "#8b5cf6" }} /> Perguntas
                  </label>
                  <div className="space-y-2">
                    {podcastData.perguntas.map((pergunta, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-[11px] font-bold mt-2.5 shrink-0 w-5 text-center" style={{ color: "#8b5cf6" }}>{idx + 1}.</span>
                        <textarea
                          value={pergunta}
                          onChange={e => {
                            const updated = [...podcastData.perguntas];
                            updated[idx] = e.target.value;
                            setPodcastData(prev => ({ ...prev, perguntas: updated }));
                          }}
                          placeholder={`Pergunta ${idx + 1}...`}
                          className="flex-1 px-3 py-2 rounded-lg text-[12px] outline-none resize-none min-w-0"
                          rows={2}
                          style={inputStyle}
                        />
                        {podcastData.perguntas.length > 1 && (
                          <button
                            onClick={() => setPodcastData(prev => ({ ...prev, perguntas: prev.perguntas.filter((_, i) => i !== idx) }))}
                            className="p-1 mt-1.5 rounded-full hover:opacity-70 shrink-0"
                            style={{ color: "#ef4444" }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setPodcastData(prev => ({ ...prev, perguntas: [...prev.perguntas, ""] }))}
                    className="flex items-center gap-1.5 text-[11px] font-semibold py-2 px-4 rounded-full hover:opacity-80 transition-all mt-3"
                    style={{ color: "#8b5cf6", border: "1px dashed color-mix(in srgb, #8b5cf6 40%, transparent)", backgroundColor: "#8b5cf608" }}
                  >
                    <Plus size={12} /> Adicionar + uma pergunta
                  </button>
                </div>

                <div className="h-px" style={{ backgroundColor: "color-mix(in srgb, #8b5cf6 15%, transparent)" }} />

                {/* Concluindo */}
                <div>
                  <label className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                    <Check size={12} style={{ color: "#8b5cf6" }} /> Concluindo
                  </label>
                  <textarea
                    value={podcastData.concluindo}
                    onChange={e => setPodcastData(prev => ({ ...prev, concluindo: e.target.value }))}
                    placeholder="Texto de encerramento ou considerações finais..."
                    className="w-full px-3 py-2.5 rounded-lg text-[12px] outline-none resize-none"
                    rows={3}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* ── Apoio ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "2px solid #06b6d444", backgroundColor: "#06b6d40a" }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: "#06b6d415" }}>
                <Upload size={16} style={{ color: "#06b6d4" }} />
                <span className="text-sm font-bold" style={{ color: "#06b6d4" }}>📎 Apoio</span>
              </div>
              <div className="p-4 space-y-5">
                {/* Imagens */}
                <div>
                  <label className="text-[11px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                    <ImagePlus size={12} style={{ color: "#06b6d4" }} /> Imagens
                  </label>
                  <p className="text-[10px] mb-2" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 45%, transparent)" }}>
                    Cole links ou faça upload de imagens de apoio
                  </p>
                  <div className="space-y-2">
                    {podcastData.apoioImagens.map((url, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        {url && url.startsWith("http") && (
                          <img src={url} alt="" className="w-10 h-10 object-cover rounded shrink-0" onError={e => (e.currentTarget.style.display = "none")} />
                        )}
                        <input
                          value={url}
                          onChange={e => {
                            const updated = [...podcastData.apoioImagens];
                            updated[idx] = e.target.value;
                            setPodcastData(prev => ({ ...prev, apoioImagens: updated }));
                          }}
                          placeholder="https://link-da-imagem.jpg"
                          className="flex-1 px-3 py-2 rounded-lg text-[11px] outline-none min-w-0"
                          style={inputStyle}
                        />
                        <label className="p-1.5 rounded-full hover:opacity-70 shrink-0 cursor-pointer" style={{ color: "#06b6d4" }} title="Upload imagem">
                          <Upload size={12} />
                          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !user) return;
                            try {
                              toast.loading("Enviando imagem...", { id: "upload-img" });
                              const ext = file.name.split(".").pop() || "jpg";
                              const path = `apoio/${user.id}/${Date.now()}_${idx}.${ext}`;
                              const { error } = await supabase.storage.from("empresa-assets").upload(path, file, { upsert: true, contentType: file.type });
                              if (error) throw error;
                              const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
                              const updated = [...podcastData.apoioImagens];
                              updated[idx] = urlData.publicUrl;
                              setPodcastData(prev => ({ ...prev, apoioImagens: updated }));
                              toast.success("Imagem enviada!", { id: "upload-img" });
                            } catch (err) {
                              console.error(err);
                              toast.error("Erro ao enviar imagem", { id: "upload-img" });
                            }
                            e.target.value = "";
                          }} />
                        </label>
                        {podcastData.apoioImagens.length > 1 && (
                          <button onClick={() => setPodcastData(prev => ({ ...prev, apoioImagens: prev.apoioImagens.filter((_, i) => i !== idx) }))} className="p-1 rounded-full hover:opacity-70 shrink-0" style={{ color: "#ef4444" }}><Trash2 size={12} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setPodcastData(prev => ({ ...prev, apoioImagens: [...prev.apoioImagens, ""] }))}
                    className="flex items-center gap-1.5 text-[11px] font-semibold py-1.5 px-3 rounded-full hover:opacity-80 transition-all mt-2"
                    style={{ color: "#06b6d4", border: "1px dashed color-mix(in srgb, #06b6d4 40%, transparent)" }}
                  >
                    <Plus size={12} /> Adicionar imagem
                  </button>
                </div>

                <div className="h-px" style={{ backgroundColor: "color-mix(in srgb, #06b6d4 15%, transparent)" }} />

                {/* Vídeos */}
                <div>
                  <label className="text-[11px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                    <Video size={12} style={{ color: "#06b6d4" }} /> Vídeos
                  </label>
                  <p className="text-[10px] mb-2" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 45%, transparent)" }}>
                    Cole links ou faça upload de vídeos de apoio
                  </p>
                  <div className="space-y-2">
                    {podcastData.apoioVideos.map((url, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Video size={14} className="shrink-0" style={{ color: "color-mix(in srgb, var(--layout-page-text) 30%, transparent)" }} />
                        <input
                          value={url}
                          onChange={e => {
                            const updated = [...podcastData.apoioVideos];
                            updated[idx] = e.target.value;
                            setPodcastData(prev => ({ ...prev, apoioVideos: updated }));
                          }}
                          placeholder="https://youtube.com/watch?v=..."
                          className="flex-1 px-3 py-2 rounded-lg text-[11px] outline-none min-w-0"
                          style={inputStyle}
                        />
                        <label className="p-1.5 rounded-full hover:opacity-70 shrink-0 cursor-pointer" style={{ color: "#06b6d4" }} title="Upload vídeo">
                          <Upload size={12} />
                          <input type="file" accept="video/*" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !user) return;
                            try {
                              toast.loading("Enviando vídeo...", { id: "upload-vid" });
                              const ext = file.name.split(".").pop() || "mp4";
                              const path = `apoio/${user.id}/${Date.now()}_${idx}.${ext}`;
                              const { error } = await supabase.storage.from("empresa-assets").upload(path, file, { upsert: true, contentType: file.type });
                              if (error) throw error;
                              const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
                              const updated = [...podcastData.apoioVideos];
                              updated[idx] = urlData.publicUrl;
                              setPodcastData(prev => ({ ...prev, apoioVideos: updated }));
                              toast.success("Vídeo enviado!", { id: "upload-vid" });
                            } catch (err) {
                              console.error(err);
                              toast.error("Erro ao enviar vídeo", { id: "upload-vid" });
                            }
                            e.target.value = "";
                          }} />
                        </label>
                        {podcastData.apoioVideos.length > 1 && (
                          <button onClick={() => setPodcastData(prev => ({ ...prev, apoioVideos: prev.apoioVideos.filter((_, i) => i !== idx) }))} className="p-1 rounded-full hover:opacity-70 shrink-0" style={{ color: "#ef4444" }}><Trash2 size={12} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setPodcastData(prev => ({ ...prev, apoioVideos: [...prev.apoioVideos, ""] }))}
                    className="flex items-center gap-1.5 text-[11px] font-semibold py-1.5 px-3 rounded-full hover:opacity-80 transition-all mt-2"
                    style={{ color: "#06b6d4", border: "1px dashed color-mix(in srgb, #06b6d4 40%, transparent)" }}
                  >
                    <Plus size={12} /> Adicionar vídeo
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Escalada */}
            <div className="rounded-2xl p-5" style={{ border: `1px solid ${NEXO_CYAN}33`, backgroundColor: NEXO_CARD_BG, fontFamily: "'Montserrat', sans-serif" }}>
              <p className="text-xs font-bold flex items-center gap-1.5 mb-3" style={{ color: NEXO_DARK, letterSpacing: 1, textTransform: "uppercase" }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: NEXO_CYAN, color: "#fff", fontSize: 11 }}>📢</span>
                Escalada
                {escaladaList.length > 0 && <span className="text-[10px] font-normal" style={{ color: `${NEXO_DARK}80`, letterSpacing: 0, textTransform: "none" }}>({escaladaList.length} {escaladaList.length === 1 ? "item" : "itens"})</span>}
              </p>
              <div className="space-y-2">
                {escaladaList.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-[11px] font-bold shrink-0 w-5 text-center" style={{ color: NEXO_CYAN }}>{idx + 1}.</span>
                    <div className="flex flex-col shrink-0">
                      <button onClick={() => { if (idx === 0) return; setEscaladaList(prev => { const c = [...prev]; [c[idx - 1], c[idx]] = [c[idx], c[idx - 1]]; return c; }); }} disabled={idx === 0} className="p-0.5 rounded hover:opacity-70 disabled:opacity-20" style={{ color: NEXO_CYAN }}><ArrowUp size={10} /></button>
                      <button onClick={() => { if (idx === escaladaList.length - 1) return; setEscaladaList(prev => { const c = [...prev]; [c[idx], c[idx + 1]] = [c[idx + 1], c[idx]]; return c; }); }} disabled={idx === escaladaList.length - 1} className="p-0.5 rounded hover:opacity-70 disabled:opacity-20" style={{ color: NEXO_CYAN }}><ArrowDown size={10} /></button>
                    </div>
                    {item.imagemUrl && item.imagemUrl.startsWith("http") && (
                      <img src={item.imagemUrl} alt="" className="w-10 h-7 object-cover rounded shrink-0" onError={e => (e.currentTarget.style.display = "none")} />
                    )}
                    <input value={item.titulo} onChange={e => setEscaladaList(prev => prev.map((v, i) => i === idx ? { ...v, titulo: e.target.value } : v))} className="flex-1 h-10 px-4 text-[12px] outline-none min-w-0" style={{ ...inputStyle, backgroundColor: "#FFFFFF", border: `2px solid ${NEXO_CYAN}`, color: NEXO_DARK, borderRadius: 999 }} placeholder="Título da manchete..." />
                    <button onClick={() => setEscaladaList(prev => prev.filter((_, i) => i !== idx))} className="p-1 rounded-full hover:opacity-70 shrink-0" style={{ color: "#ef4444" }}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => setEscaladaList(prev => [...prev, { titulo: "", imagemUrl: "" }])} className="mt-3 hover:opacity-80" style={nexoPillGhost}>
                <Plus size={12} /> Adicionar Manchete
              </button>
            </div>

            {/* Blocos */}
            <div className="space-y-4 min-w-0 w-full">
              {blocos.map((bloco, bi) => (
                <div key={bi} className="rounded-2xl p-4 min-w-0 w-full overflow-hidden" style={{ border: `1px solid ${NEXO_CYAN}33`, backgroundColor: NEXO_CARD_BG, fontFamily: "'Montserrat', sans-serif" }}>
                  <div className="flex items-center justify-between mb-2 cursor-pointer min-w-0" onClick={() => toggleCollapse(bi)}>
                    <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: NEXO_DARK, letterSpacing: 1, textTransform: "uppercase" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: BLOCK_COLORS[bi % BLOCK_COLORS.length], color: "#fff", fontSize: 11 }}>📺</span>
                      BLOCO {bi + 1}
                      <span className="text-[10px] font-normal" style={{ color: `${NEXO_DARK}80`, letterSpacing: 0, textTransform: "none" }}>({bloco.noticias.length} {bloco.noticias.length === 1 ? "notícia" : "notícias"})</span>
                    </p>
                    <div className="flex items-center gap-1">
                      {blocos.length > 1 && <button onClick={(e) => { e.stopPropagation(); removeBloco(bi); }} className="p-1 rounded-full hover:opacity-70" style={{ color: "#ef4444" }}><Trash2 size={13} /></button>}
                      {collapsedBlocos.has(bi) ? <ChevronDown size={14} style={{ color: NEXO_DARK }} /> : <ChevronUp size={14} style={{ color: NEXO_DARK }} />}
                    </div>
                  </div>
                  {!collapsedBlocos.has(bi) && (
                    <div className="space-y-3">
                      {bloco.noticias.map((noticia, ni) => (
                        <NoticiaItem key={ni} noticia={noticia} bi={bi} ni={ni} inputStyle={inputStyle} fetchingLink={fetchingLink} onUpdate={updateNoticia} onRemove={removeNoticia} onFetchLink={fetchFromLink} canRemove={bloco.noticias.length > 1} editedFields={editingId ? editedFields : undefined} onRegenerateWeather={addWeatherInfo} onRegenerateFinance={addFinanceInfo} addingWeather={addingWeather} addingFinance={addingFinance} isOpen={openNoticia[bi] === ni} onToggleOpen={(open) => setOpenNoticia(prev => ({ ...prev, [bi]: open ? ni : null }))} onAddToEscalada={() => addToEscalada(noticia.titulo, noticia.imagemUrl)} alreadyInEscalada={escaladaList.some(e => e.titulo === noticia.titulo && !!noticia.titulo)} />
                      ))}
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => addNoticia(bi)} className="hover:opacity-80" style={nexoPillGhost}>
                          <Plus size={12} /> Adicionar Notícia
                        </button>
                        <button
                          onClick={() => addWeatherInfo(bi)}
                          disabled={addingWeather}
                          className="hover:opacity-80 disabled:opacity-50"
                          style={nexoPillGhost}
                        >
                          {addingWeather ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                          Adicionar Previsão do Tempo
                        </button>
                        <button
                          onClick={() => addFinanceInfo(bi)}
                          disabled={addingFinance}
                          className="hover:opacity-80 disabled:opacity-50"
                          style={nexoPillGhost}
                        >
                          {addingFinance ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                          Adicionar Mercado Financeiro
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button onClick={addBloco} className="w-full hover:opacity-80 flex items-center justify-center gap-2" style={{ ...nexoPillGhost, padding: "12px 20px", fontSize: 12, borderStyle: "dashed", width: "100%" }}>
              <Plus size={14} /> Adicionar Bloco {blocos.length + 1}
            </button>
          </>
        )}

        {/* Save / Finish editing */}
        {editingId ? (
          <button onClick={handleSave} disabled={saving || !programaId} className="w-full flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90" style={{ ...nexoPillPrimary, padding: "14px 24px", fontSize: 13, width: "100%" }}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {saving ? "Finalizando..." : "Finalizar Edição"}
          </button>
        ) : (
          <button onClick={handleSave} disabled={saving || !programaId} className="w-full flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90" style={{ ...nexoPillPrimary, padding: "14px 24px", fontSize: 13, width: "100%" }}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            {saving ? "Salvando..." : "Finalizar Programa Express"}
          </button>
        )}
      </div>
      )}
    </div>
  );

  if (renderAsModal) {
    return createPortal(
      <div
        onMouseDown={(e) => { if (e.target === e.currentTarget) setNovoRoteiroOpen(false); }}
        style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(10, 37, 64, 0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}
      >
        <div style={{ position: "relative", width: "100%", maxWidth: 980 }}>{card}</div>
      </div>,
      document.body
    );
  }

  return card;
}


/* Sub-component for each noticia row */
function NoticiaItem({ noticia, bi, ni, inputStyle, fetchingLink, onUpdate, onRemove, onFetchLink, canRemove, editedFields, onRegenerateWeather, onRegenerateFinance, addingWeather, addingFinance, isOpen, onToggleOpen, onAddToEscalada, alreadyInEscalada }: {
  noticia: NewsItem; bi: number; ni: number;
  inputStyle: React.CSSProperties; fetchingLink: string | null;
  onUpdate: (bi: number, ni: number, field: keyof NewsItem, value: any) => void;
  onRemove: (bi: number, ni: number) => void;
  onFetchLink: (bi: number, ni: number, url: string, force?: boolean) => void;
  canRemove: boolean;
  editedFields?: Set<string>;
  onRegenerateWeather?: (bi: number, ni: number) => void;
  onRegenerateFinance?: (bi: number, ni: number) => void;
  addingWeather?: boolean;
  addingFinance?: boolean;
  isOpen: boolean;
  onToggleOpen: (open: boolean) => void;
  onAddToEscalada: () => void;
  alreadyInEscalada: boolean;
}) {
  const [linkInput, setLinkInput] = useState(noticia.link || "");
  const collapsed = !isOpen;
  const setCollapsed = (v: boolean) => onToggleOpen(!v);
  const isFetching = fetchingLink === `${bi}-${ni}`;

  const handlePasteLink = (url: string) => { setLinkInput(url); if (url.startsWith("http")) onFetchLink(bi, ni, url); };
  const prevTituloRef = useRef(noticia.titulo);

  useEffect(() => {
    if (noticia.titulo && !prevTituloRef.current && !collapsed && !isFetching) {
      const timer = setTimeout(() => onToggleOpen(false), 3000);
      return () => clearTimeout(timer);
    }
    prevTituloRef.current = noticia.titulo;
  }, [noticia.titulo, collapsed, isFetching, onToggleOpen]);

  if (collapsed && noticia.titulo) {
    return (
      <div className="rounded-lg px-3 py-2 flex items-center justify-between cursor-pointer hover:opacity-90 transition-all overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 80%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 15%, transparent)" }} onClick={() => setCollapsed(false)}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase shrink-0" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Notícia {ni + 1}</p>
          <p className="text-[12px] truncate font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{noticia.titulo}</p>
          {noticia.escalada && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 15%, transparent)", color: "var(--layout-accent-color, #2ec1f7)" }}>ESCALADA</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <Pencil size={12} style={{ color: "var(--layout-icon-color, #888)" }} />
          <button
            onClick={(e) => { e.stopPropagation(); onAddToEscalada(); }}
            disabled={alreadyInEscalada}
            className="p-0.5 rounded hover:opacity-70 disabled:opacity-40"
            style={{ color: alreadyInEscalada ? "#10b981" : NEXO_CYAN }}
            title={alreadyInEscalada ? "Já está na escalada" : "Adicionar à escalada"}
          >
            <Megaphone size={12} />
          </button>
          {canRemove && <button onClick={(e) => { e.stopPropagation(); onRemove(bi, ni); }} className="p-0.5 rounded hover:opacity-70" style={{ color: "#ef4444" }}><Trash2 size={12} /></button>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg p-2.5 space-y-2 w-full min-w-0 overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 80%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 15%, transparent)", maxWidth: "100%", boxSizing: "border-box" }}>
      <div className="flex items-center justify-between min-w-0">
        <p className="text-[10px] font-bold uppercase" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Notícia {ni + 1}</p>
        <div className="flex items-center gap-1 shrink-0">
          {noticia.titulo && <button onClick={() => setCollapsed(true)} className="p-0.5 rounded hover:opacity-70" style={{ color: "var(--layout-icon-color, #888)" }}><ChevronUp size={12} /></button>}
          {canRemove && <button onClick={() => onRemove(bi, ni)} className="p-0.5 rounded hover:opacity-70" style={{ color: "#ef4444" }}><Trash2 size={12} /></button>}
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 items-center w-full min-w-0 max-w-full overflow-hidden">
        <div className="relative min-w-0 max-w-full overflow-hidden">
          <Link2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--layout-icon-color, #888)" }} />
          <input 
            value={linkInput} 
            onChange={e => {
              const val = e.target.value;
              setLinkInput(val);
              // Auto-trigger fetch if it's a URL
              if (val.trim().startsWith("http")) {
                // Check if it's a new URL
                if (val.trim() !== noticia.link) {
                  setTimeout(() => handlePasteLink(val.trim()), 300);
                }
              }
            }} 
            onPaste={e => { 
              const t = e.clipboardData.getData("text"); 
              if (t && t.startsWith("http")) {
                setTimeout(() => handlePasteLink(t.trim()), 50); 
              }
            }}
            placeholder="Cole o link da matéria" 
            className="block w-full min-w-0 max-w-full pl-7 pr-3 py-1.5 rounded-lg text-[11px] outline-none" 
            style={{ ...inputStyle, width: "100%", maxWidth: "100%", boxSizing: "border-box" }} 
          />
        </div>
        <button onClick={() => handlePasteLink(linkInput)} disabled={isFetching || !linkInput} className="btn-skyglass-accent px-3.5 py-1.5 text-[11px] disabled:opacity-30 shrink-0">
          {isFetching ? <Loader2 size={12} className="animate-spin" /> : <><Search size={11} /> Buscar</>}
        </button>
      </div>
      <div className="w-full min-w-0 max-w-full overflow-hidden">
        <div className="flex items-center gap-1 mb-1"><Type size={10} style={{ color: "var(--layout-icon-color)" }} /><span className="text-[10px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Título / Tarja</span>{editedFields?.has(`noticia-${bi}-${ni}-titulo`) && <EditedCheck />}</div>
        <input value={noticia.titulo} onChange={e => onUpdate(bi, ni, "titulo", e.target.value)} placeholder="Título da matéria" className="block w-full min-w-0 max-w-full px-3 py-1.5 rounded-lg text-[11px] outline-none" style={{ ...inputStyle, width: "100%", maxWidth: "100%", boxSizing: "border-box" }} />
      </div>
      <div className="w-full min-w-0 max-w-full overflow-hidden">
        <div className="flex items-center gap-2 mb-1">
          <FileText size={10} style={{ color: "var(--layout-icon-color)" }} />
          <span className="text-[10px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Matéria Completa (TP)</span>
          
          {noticia.link && !isFetching && (
            <button 
              onClick={() => onFetchLink(bi, ni, noticia.link!, true)}
              className="ml-auto text-[9px] flex items-center gap-1 px-1.5 py-0.5 rounded border border-blue-200 text-blue-500 hover:bg-blue-50 transition-colors"
              title="Gerar texto novamente usando IA"
            >
              <RefreshCw size={9} /> Reprocessar
            </button>
          )}

          {!isFetching && (noticia.titulo === "Tempo" || noticia.titulo === "Mercado Financeiro") && (
            <button 
              onClick={() => {
                if (noticia.titulo === "Tempo") onRegenerateWeather?.(bi, ni);
                else onRegenerateFinance?.(bi, ni);
              }}
              className="ml-auto text-[9px] flex items-center gap-1 px-1.5 py-0.5 rounded border border-blue-200 text-blue-500 hover:bg-blue-50 transition-colors"
              title={noticia.titulo === "Tempo" ? "Regerar com IA" : "Atualizar mercado"}
            >
              <RefreshCw size={9} /> {noticia.titulo === "Tempo" ? "Regerar com IA" : "Atualizar mercado"}
            </button>
          )}

          {isFetching && (
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden relative">
                <div className="absolute inset-0 bg-blue-500 animate-pulse" style={{ width: "100%" }}></div>
              </div>
              <span className="text-[9px] text-blue-500 animate-pulse font-bold whitespace-nowrap uppercase">Gerando TP...</span>
            </div>
          )}
          {editedFields?.has(`noticia-${bi}-${ni}-texto_materia`) && <EditedCheck />}
        </div>
        <textarea 
          value={noticia.texto_materia || ""} 
          onChange={e => onUpdate(bi, ni, "texto_materia", e.target.value)} 
          placeholder={isFetching ? "Aguarde, a IA está analisando o link e gerando o texto jornalístico..." : "O texto da matéria completa aparecerá aqui automaticamente após colar o link."}
          className={`block w-full min-w-0 max-w-full px-3 py-1.5 rounded-lg text-[11px] outline-none resize-y transition-all ${isFetching ? 'ring-2 ring-blue-500 bg-blue-50/80 shadow-inner' : ''}`} 
          rows={10} 
          style={{ ...inputStyle, width: "100%", maxWidth: "100%", boxSizing: "border-box" }} 
        />
      </div>

      <div className="w-full min-w-0 max-w-full overflow-hidden">
        <div className="flex items-center gap-1 mb-1">
          <List size={10} style={{ color: "var(--layout-icon-color)" }} />
          <span className="text-[10px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Resumo</span>
          {editedFields?.has(`noticia-${bi}-${ni}-resumo`) && <EditedCheck />}
        </div>
        <textarea 
          value={noticia.resumo || ""} 
          onChange={e => onUpdate(bi, ni, "resumo", e.target.value)} 
          placeholder="Resumo curto da notícia..." 
          className="block w-full min-w-0 max-w-full px-3 py-1.5 rounded-lg text-[10px] outline-none resize-y" 
          style={{ ...inputStyle, width: "100%", maxWidth: "100%", boxSizing: "border-box" }} 
          rows={3} 
        />
      </div>
      <div className="w-full min-w-0 max-w-full overflow-hidden">
        <div className="flex items-center gap-1 mb-1"><Image size={10} style={{ color: "var(--layout-icon-color)" }} /><span className="text-[10px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>URL Imagem</span>{editedFields?.has(`noticia-${bi}-${ni}-imagemUrl`) && <EditedCheck />}</div>
        <input value={noticia.imagemUrl} onChange={e => onUpdate(bi, ni, "imagemUrl", e.target.value)} placeholder="https://..." className="block w-full min-w-0 max-w-full px-3 py-1.5 rounded-lg text-[11px] outline-none" style={{ ...inputStyle, width: "100%", maxWidth: "100%", boxSizing: "border-box" }} />
      </div>
      {noticia.imagemUrl && noticia.imagemUrl.startsWith("http") && <img src={noticia.imagemUrl} alt="" className="w-16 h-10 object-cover rounded" onError={e => (e.currentTarget.style.display = "none")} />}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <div onClick={() => onUpdate(bi, ni, "escalada", !noticia.escalada)} className="w-4 h-4 rounded border flex items-center justify-center transition-all cursor-pointer" style={{ borderColor: noticia.escalada ? "var(--layout-accent-color, #2ec1f7)" : "color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)", backgroundColor: noticia.escalada ? "var(--layout-accent-color, #2ec1f7)" : "transparent" }}>
          {noticia.escalada && <Check size={10} style={{ color: "var(--layout-header-text, #fff)" }} />}
        </div>
        <span className="text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Escalada</span>
      </label>
    </div>
  );
}
