import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Zap, Plus, Trash2, Link2, Loader2, Image, Type, Check, X as XIcon, ChevronDown, ChevronUp, Pencil, Users, Search, UserPlus, ClipboardPaste, ArrowUp, ArrowDown, CheckCircle2, MessageSquare, FileText, HelpCircle, Video, ImagePlus, Upload, Bot, Save, List, RefreshCw, Megaphone, Newspaper, Calendar } from "lucide-react";
import NoticiasFontesPopup from "./NoticiasFontesPopup";
import { decodeHtmlEntities } from "@/lib/textEncoding";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getApresentadores, type Apresentador } from "./ApresentadorForm";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";
import { noticiasComCampoFixo } from "../../supabase/functions/_shared/roteiroNoticias.ts";

const AgendarRoteiroPopup = lazyRetry(() => import("./AgendarRoteiroPopup"));


/* ── Podcast-specific types ── */
interface PodcastData {
  tituloTarja: string;
  subtituloTarja: string;
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

// === Nexo Form Design System (mesmo padrão Blitz / ClientesPage) ===
const NEXO_CYAN = "#268ffa";
const NEXO_LIME = "#268ffa";
const NEXO_CARD_BG = "#ffffff";
const NEXO_DARK = "#002132";
const nexoPillGhost: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
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

export const hasInformationalContent = (blocks: Array<{ noticias?: Array<{ titulo?: string; texto_materia?: string }> }> = []) =>
  blocks.some((block) =>
    (block?.noticias || []).some((news) =>
      Boolean(news?.titulo?.trim() || news?.texto_materia?.trim())
    )
  );

interface Programa {
  id: string;
  nome: string;
  estudio: string;
  tipo_programa?: string | null;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  dias_semana?: string[] | string | null;
  apresentador_id?: string | null;
  apresentadores_ids?: string[] | null;
  capa?: string | null;
  selo?: string | null;
}

export interface ExpressEditData {
  roteiroId: string;
  estudio: string;
  programaId: string;
  programaNome?: string;
  blocos: Bloco[];
  participantes?: Participante[];
  escaladaList?: {titulo: string; imagemUrl: string}[];
  dadosAdicionais?: Record<string, unknown>;
  existingXmlPath?: string;
  podcastData?: PodcastData;
  agendaEventoId?: string;
  horario?: string;
  dataPrograma?: string;
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
  effectiveUserId?: string | null;
}

const emptyNewsItem = (): NewsItem => ({ titulo: "", imagemUrl: "", escalada: false });

function normalizePodcastData(data?: Partial<PodcastData> | null): PodcastData {
  return {
    tituloTarja: typeof data?.tituloTarja === "string" ? data.tituloTarja : "",
    subtituloTarja: typeof data?.subtituloTarja === "string" ? data.subtituloTarja : "",
    introducao: typeof data?.introducao === "string" ? data.introducao : "",
    agendamentoData: typeof data?.agendamentoData === "string" ? data.agendamentoData : "",
    agendamentoHorario: typeof data?.agendamentoHorario === "string" ? data.agendamentoHorario : "",
    perguntas: Array.isArray(data?.perguntas) && data.perguntas.length > 0
      ? data.perguntas.map((item) => String(item || ""))
      : [""],
    concluindo: typeof data?.concluindo === "string" ? data.concluindo : "",
    apoioImagens: Array.isArray(data?.apoioImagens) && data.apoioImagens.length > 0
      ? data.apoioImagens.map((item) => String(item || ""))
      : [""],
    apoioVideos: Array.isArray(data?.apoioVideos) && data.apoioVideos.length > 0
      ? data.apoioVideos.map((item) => String(item || ""))
      : [""],
  };
}

function normalizeBlocos(data: unknown): Bloco[] {
  if (!Array.isArray(data) || data.length === 0) return [{ noticias: [emptyNewsItem()] }];

  return data.map((bloco) => {
    const noticias = Array.isArray((bloco as Bloco | null)?.noticias)
      ? (bloco as Bloco).noticias
          .filter(Boolean)
          .map((noticia) => ({
            ...noticia,
            titulo: typeof noticia?.titulo === "string" ? noticia.titulo : "",
            imagemUrl: typeof noticia?.imagemUrl === "string" ? noticia.imagemUrl : "",
            resumo: typeof noticia?.resumo === "string" ? noticia.resumo : undefined,
            texto_materia: typeof noticia?.texto_materia === "string" ? noticia.texto_materia : undefined,
            escalada: Boolean(noticia?.escalada),
            link: typeof noticia?.link === "string" ? noticia.link : undefined,
          }))
      : [];

    return { ...bloco, noticias: noticias.length > 0 ? noticias : [emptyNewsItem()] };
  });
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
      <span className="text-[10px] truncate min-w-0" style={{ color: "#268ffa" }}>
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
function UpdateNewsLinksSection({ blocos, inputStyle, onUpdateBloco, fetchFromLink, onUpdateComplete }: {
  blocos: Bloco[];
  inputStyle: React.CSSProperties;
  onUpdateBloco: (bi: number, items: NewsItem[]) => void;
  fetchFromLink: (bi: number, ni: number, url: string, forceReprocess?: boolean) => Promise<NewsItem | null> | NewsItem | null | void;
  onUpdateComplete: (schedule?: { data: string; horario: string }, overrideBlocos?: Bloco[]) => Promise<boolean>;
}) {
  const [linksText, setLinksText] = useState<string[]>(() => blocos.map(() => ""));
  const [updating, setUpdating] = useState(false);
  const [totalLinksToUpdate, setTotalLinksToUpdate] = useState(0);
  const [currentLink, setCurrentLink] = useState(0);
  const [updateStage, setUpdateStage] = useState<"updating" | "completed" | "saving" | null>(null);
  const onUpdateCompleteRef = useRef(onUpdateComplete);

  useEffect(() => {
    onUpdateCompleteRef.current = onUpdateComplete;
  }, [onUpdateComplete]);

  useEffect(() => {
    setLinksText(prev => {
      const next = blocos.map((_, i) => prev[i] ?? "");
      return next;
    });
  }, [blocos.length]);

  const handleUpdate = async () => {
    const linksByBlock = blocos.map((_, bi) => ({
      bi,
      links: linksText[bi]?.split(/\r?\n/).map(link => link.trim()).filter(link => link.startsWith("http")) || [],
    })).filter(({ links }) => links.length > 0);
    const totalLinks = linksByBlock.reduce((total, { links }) => total + links.length, 0);

    if (totalLinks === 0) {
      toast.warning("Nenhum link válido informado");
      return;
    }

    setUpdating(true);
    setTotalLinksToUpdate(totalLinks);
    setCurrentLink(0);
    setUpdateStage("updating");

    try {
      let processedLinks = 0;
      const updatedBlocos: Bloco[] = blocos.map(b => ({
        ...b,
        noticias: [...(b.noticias || [])]
      }));

      for (const { bi, links } of linksByBlock) {
        const blockItems: NewsItem[] = [];
        for (let ni = 0; ni < links.length; ni++) {
          setCurrentLink(processedLinks + 1);
          const link = links[ni];
          const fetched = await fetchFromLink(bi, ni, link);
          if (fetched && fetched.titulo) {
            blockItems.push(fetched);
          } else {
            let fallbackTitle = "Notícia";
            try {
              const pathname = new URL(link).pathname;
              const slug = pathname.split("/").filter(Boolean).pop() || "";
              const formatted = slug.replace(/[-_]+/g, " ").replace(/\.(html|php|asp)$/i, "").trim();
              if (formatted) fallbackTitle = formatted.charAt(0).toUpperCase() + formatted.slice(1);
            } catch {}
            blockItems.push({
              titulo: fallbackTitle,
              imagemUrl: "",
              resumo: "",
              texto_materia: "",
              link,
              escalada: false,
            });
          }
          processedLinks += 1;
        }

        updatedBlocos[bi] = {
          ...updatedBlocos[bi],
          noticias: blockItems,
        };
        onUpdateBloco(bi, blockItems);
      }

      setUpdateStage("completed");
      await new Promise(resolve => window.setTimeout(resolve, 600));
      setUpdateStage("saving");
      await new Promise(resolve => window.setTimeout(resolve, 100));

      const saved = await onUpdateCompleteRef.current(undefined, updatedBlocos);
      if (!saved) {
        setUpdateStage(null);
        setUpdating(false);
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao atualizar notícias");
      setUpdateStage(null);
      setUpdating(false);
    }
  };

  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="rounded-2xl p-5" style={{ border: `1px solid ${NEXO_CYAN}33`, backgroundColor: "#FFFFFF", fontFamily: "'Montserrat', sans-serif" }}>
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-1.5 hover:opacity-80 transition"
      >
        <Link2 size={14} style={{ color: NEXO_CYAN }} />
        <span className="text-xs font-bold" style={{ color: NEXO_DARK, letterSpacing: 1, textTransform: "uppercase" }}>
          Atualizar Notícias por Links
        </span>
        <span className="ml-auto">
          {collapsed ? <ChevronDown size={14} style={{ color: NEXO_CYAN }} /> : <ChevronUp size={14} style={{ color: NEXO_CYAN }} />}
        </span>
      </button>
      {!collapsed && (
        <>
          <p className="text-[10px] mt-2 mb-3" style={{ color: `${NEXO_DARK}99` }}>
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
          {updating && updateStage && (
            <div className="mt-4 rounded-xl px-4 py-3" style={{ background: `${NEXO_CYAN}12`, border: `1px solid ${NEXO_CYAN}40` }}>
              <div className="flex items-center gap-2 text-[11px] font-bold" style={{ color: NEXO_DARK }}>
                {updateStage === "completed" ? <CheckCircle2 size={14} style={{ color: "#22c55e" }} /> : <Loader2 size={14} className="animate-spin" style={{ color: NEXO_CYAN }} />}
                <span>
                  {updateStage === "updating" && `${totalLinksToUpdate} links a ser atualizado`}
                  {updateStage === "completed" && "Todas as noticias atualizadas"}
                  {updateStage === "saving" && "Salvando noticias atualizadas, enviando para o XML e fechando edição do roteiro"}
                </span>
              </div>
              {updateStage === "updating" && (
                <>
                  <p className="mt-1.5 text-[10px] font-semibold" style={{ color: `${NEXO_DARK}99` }}>
                    Atualizando {currentLink}/{totalLinksToUpdate} inseridos
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: `${NEXO_CYAN}20` }}>
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${totalLinksToUpdate ? (currentLink / totalLinksToUpdate) * 100 : 0}%`, background: NEXO_CYAN }} />
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={handleUpdate}
            disabled={updating}
            className="w-full mt-4 flex items-center justify-center gap-1.5 disabled:opacity-40 hover:opacity-90"
            style={{ ...nexoPillPrimary, padding: "12px 20px", fontSize: 12, width: "100%" }}
          >
            {updating ? <Loader2 size={12} className="animate-spin" /> : <Check size={14} />}
            {updating ? "Atualizando Notícias..." : "Atualizar Notícias"}
          </button>
        </>
      )}
    </div>
  );
}


export default function ProgramaExpressInline({ programas, estudios, onFinish, editData, afterHeader, externalPasteText, onExternalPasteConsumed, novoOpen, onNovoOpenChange, hideNovoToggle, renderAsModal, effectiveUserId }: Props) {
  const { user } = useAuth();
  const [estudio, setEstudio] = useState("");
  const [programaId, setProgramaId] = useState("");
  const [selectedProgTipo, setSelectedProgTipo] = useState<string | null>(null);
  const [cachedApresentadores, setCachedApresentadores] = useState<Apresentador[]>([]);

  useEffect(() => {
    let active = true;
    const targetId = effectiveUserId || user?.id;
    const targetEmail = user?.email;
    if (!targetId && !targetEmail) return;
    const reloadAps = () => {
      getApresentadores(targetId, targetEmail).then(list => {
        if (active && Array.isArray(list)) {
          setCachedApresentadores(list);
        }
      }).catch(() => {});
    };
    reloadAps();

    window.addEventListener("nexohub:programas-updated", reloadAps);
    window.addEventListener("housemix:programas-updated", reloadAps);
    return () => {
      active = false;
      window.removeEventListener("nexohub:programas-updated", reloadAps);
      window.removeEventListener("housemix:programas-updated", reloadAps);
    };
  }, [effectiveUserId, user]);

  const [blocos, setBlocos] = useState<Bloco[]>([{ noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }]);
  const [fetchingLink, setFetchingLink] = useState<string | null>(null);
  const [showSchedulePopup, setShowSchedulePopup] = useState(false);
  const [scheduledRoteiros, setScheduledRoteiros] = useState<any[]>([]);


  const [saving, setSaving] = useState(false);
  const [collapsedBlocos, setCollapsedBlocos] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingXmlPath, setEditingXmlPath] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [showPastePopup, setShowPastePopup] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [autoSaving, setAutoSaving] = useState(false);
  const [showNoticiasFontes, setShowNoticiasFontes] = useState(false);
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

  const fetchScheduledRoteiros = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("roteiros")
      .select("id, programa_nome, estudio, agendado_para_envio, enviado_agendamento")
      .eq("user_id", user.id)
      .not("agendado_para_envio", "is", null)
      .order("agendado_para_envio", { ascending: true });
    
    if (data) setScheduledRoteiros(data);
  }, [user]);

  useEffect(() => {
    fetchScheduledRoteiros();
  }, [fetchScheduledRoteiros]);


  // Podcast-specific state
  const [podcastData, setPodcastData] = useState<PodcastData>({
    tituloTarja: "", subtituloTarja: "", introducao: "", agendamentoData: "", agendamentoHorario: "", perguntas: [""], concluindo: "", apoioImagens: [""], apoioVideos: [""],
  });

  const isPodcast = (estudio || "").trim().toLowerCase() === "podcast";

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
  const [campoFixo, setCampoFixo] = useState("");
  const [noticiaParaRemover, setNoticiaParaRemover] = useState<{ bi: number; ni: number } | null>(null);
  const noticiaRemovidaRef = useRef(false);
  const [showLimparConfirm, setShowLimparConfirm] = useState(false);

  useEffect(() => {
    if (!showLimparConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setShowLimparConfirm(false); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [showLimparConfirm]);
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

  // Scroll indicator for modal
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const [modalScrollProgress, setModalScrollProgress] = useState(0);
  const [showModalScrollIndicator, setShowModalScrollIndicator] = useState(false);
  const [isModalScrollDragging, setIsModalScrollDragging] = useState(false);

  const updateModalScrollIndicator = useCallback(() => {
    const el = modalScrollRef.current;
    if (!el || !renderAsModal) {
      setShowModalScrollIndicator(false);
      return;
    }
    const maxScroll = Math.max(el.scrollHeight - el.clientHeight, 0);
    if (maxScroll <= 4) {
      setShowModalScrollIndicator(false);
      setModalScrollProgress(0);
      return;
    }
    setShowModalScrollIndicator(true);
    setModalScrollProgress(Math.min(Math.max(el.scrollTop / maxScroll, 0), 1));
  }, [renderAsModal]);

  useEffect(() => {
    if (!renderAsModal || !novoRoteiroOpen) return;
    const el = modalScrollRef.current;
    if (!el) return;

    let frame = 0;
    const syncIndicator = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateModalScrollIndicator);
    };

    syncIndicator();
    el.addEventListener("scroll", syncIndicator, { passive: true });
    window.addEventListener("resize", syncIndicator);

    const ro = new ResizeObserver(syncIndicator);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", syncIndicator);
      window.removeEventListener("resize", syncIndicator);
      ro.disconnect();
    };
  }, [renderAsModal, novoRoteiroOpen, updateModalScrollIndicator, blocos, escaladaList, participantes]);


  const filteredProgramas = useMemo(() => {
    if (!estudio) return programas;
    const estNorm = (estudio || "").trim().toLowerCase();
    const list = programas.filter(p => (p.estudio || "").trim().toLowerCase() === estNorm);
    if (programaId && !list.some(p => p.id === programaId)) {
      const selected = programas.find(p => p.id === programaId);
      if (selected) list.unshift(selected);
    }
    return list;
  }, [estudio, programas, programaId]);

  const programaNome = programas.find(p => p.id === programaId)?.nome || editData?.programaNome || "";

  const loadPresentersForProg = useCallback(async (selectedProgId: string, applyEstudio: boolean = true) => {
    if (!selectedProgId) return;

    let prog = programas.find(p => p.id === selectedProgId);

    // Consulta em tempo real no Supabase para garantir os dados mais atualizados do programa
    let freshProg: any = null;
    try {
      const { data } = await supabase
        .from("programas")
        .select("*")
        .eq("id", selectedProgId)
        .maybeSingle();
      if (data) {
        freshProg = data;
        prog = { ...(prog || {}), ...data };
      }
    } catch {}

    if (!prog && !freshProg) return;

    const resolvedTipo = freshProg?.tipo_programa || prog?.tipo_programa || "Musical";
    setSelectedProgTipo(resolvedTipo);

    if (applyEstudio && prog?.estudio && !estudio) {
      setEstudio(prog.estudio);
    }

    const rawIds: string[] = [];
    const sourceApsIds = freshProg?.apresentadores_ids || prog?.apresentadores_ids;
    if (Array.isArray(sourceApsIds)) {
      rawIds.push(...sourceApsIds);
    } else if (typeof sourceApsIds === "string") {
      try {
        const parsed = JSON.parse(sourceApsIds);
        if (Array.isArray(parsed)) rawIds.push(...parsed);
        else rawIds.push(sourceApsIds);
      } catch {
        rawIds.push(sourceApsIds);
      }
    }
    const singleApId = freshProg?.apresentador_id || prog?.apresentador_id;
    if (singleApId) {
      rawIds.push(singleApId);
    }
    const uniqueIds = Array.from(new Set(rawIds.filter(Boolean)));

    if (uniqueIds.length === 0) {
      if (!editingId) {
        setParticipantes([]);
      }
      return;
    }

    const targetId = effectiveUserId || user?.id;
    let apsList = await getApresentadores(targetId, user?.email).catch(() => cachedApresentadores);
    if (Array.isArray(apsList) && apsList.length > 0) {
      setCachedApresentadores(apsList);
    } else {
      apsList = cachedApresentadores;
    }

    const matchedPresenters = uniqueIds
      .map(id => apsList?.find(a => a.id === id || (a.nome && a.nome.toLowerCase().trim() === id.toLowerCase().trim())))
      .filter(Boolean) as Apresentador[];

    if (matchedPresenters.length < uniqueIds.length) {
      const missingIds = uniqueIds.filter(id => !matchedPresenters.some(m => m.id === id || (m.nome && m.nome.toLowerCase().trim() === id.toLowerCase().trim())));
      if (missingIds.length > 0) {
        try {
          const { data } = await supabase
            .from("apresentadores")
            .select("id, nome, cargo, instagram, categoria, whatsapp, foto, ativo")
            .in("id", missingIds);
          if (data && data.length > 0) {
            data.forEach((d: any) => {
              matchedPresenters.push({
                id: d.id,
                nome: d.nome,
                cargo: d.cargo || "",
                categoria: d.categoria || "",
                instagram: d.instagram || "",
                whatsapp: d.whatsapp || "",
                foto: d.foto || "",
                ativo: true,
              });
            });
          }
        } catch {}
      }
    }

    if (matchedPresenters.length > 0) {
      const mapped: Participante[] = matchedPresenters.map(a => {
        let cargo = a.cargo || "";
        if (!cargo) {
          cargo = a.categoria === "Apresentador" ? "Locutor / Apresentador" : (a.categoria || "Locutor");
        }
        return {
          nome: a.nome,
          cargo,
          instagram: a.instagram ? (a.instagram.startsWith("@") ? a.instagram : `@${a.instagram.replace(/^@/, "")}`) : "",
        };
      });
      setParticipantes(mapped);
      markEdited("participantes");
    } else if (!editingId) {
      setParticipantes([]);
    }
  }, [programas, effectiveUserId, user, cachedApresentadores, estudio, editingId, markEdited]);

  // Search apresentadores: usa a mesma fonte centralizada do cadastro de participantes,
  // incluindo a resolução da conta/estação e os registros já carregados do Supabase.
  useEffect(() => {
    const term = searchNome.trim().toLocaleLowerCase("pt-BR");
    if (!term) {
      setSearchResults([]);
      setNoResults(false);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        const latestList = await getApresentadores(effectiveUserId || user?.id, user?.email)
          .catch(() => cachedApresentadores);
        if (!active) return;

        const source = Array.isArray(latestList) && latestList.length > 0
          ? latestList
          : cachedApresentadores;
        if (Array.isArray(latestList) && latestList.length > 0) {
          setCachedApresentadores(latestList);
        }

        const matches = (source || [])
          .filter(a => a.nome && a.nome.toLocaleLowerCase("pt-BR").includes(term))
          .slice(0, 8)
          .map(a => ({
            nome: a.nome,
            cargo: a.cargo || (a.categoria === "Apresentador" ? "Locutor / Apresentador" : a.categoria || ""),
            instagram: a.instagram || "",
          }));

        setSearchResults(matches);
        setNoResults(matches.length === 0);
      } catch (error) {
        console.error("[ProgramaExpressInline] erro ao buscar participantes:", error);
        if (active) {
          setSearchResults([]);
          setNoResults(true);
        }
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchNome, user?.id, user?.email, cachedApresentadores, effectiveUserId]);

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
      
      // Localiza o programa por ID ou por nome normalizado
      let matchedProg = editData.programaId ? programas.find(p => p.id === editData.programaId) : null;
      if (!matchedProg && editData.programaNome) {
        const normSearch = editData.programaNome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^programa\s*express\s*[-—:]*\s*/i, "").trim();
        matchedProg = programas.find(p => {
          const pNorm = (p.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^programa\s*express\s*[-—:]*\s*/i, "").trim();
          return pNorm === normSearch || (normSearch && pNorm.includes(normSearch)) || (pNorm && normSearch.includes(pNorm));
        });
      }
      const finalProgId = matchedProg?.id || editData.programaId || "";
      const rawEstudio = editData.estudio || matchedProg?.estudio || "";
      const estNorm = rawEstudio.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
      const finalEstudio = estudios.find(e => e.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === estNorm)
        || (matchedProg?.estudio && estudios.find(e => e.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === matchedProg.estudio.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()))
        || matchedProg?.estudio
        || rawEstudio;
      const finalTipo = matchedProg?.tipo_programa || (editData.podcastData ? "Podcast" : "Jornalístico");

      setEstudio(finalEstudio);
      setProgramaId(finalProgId);
      setSelectedProgTipo(finalTipo);
      setBlocos(normalizeBlocos(editData.blocos));
      setCampoFixo(typeof editData.dadosAdicionais?.campoFixo === "string" ? editData.dadosAdicionais.campoFixo : "");
      noticiaRemovidaRef.current = false;

      const hasParticipantes = Array.isArray(editData.participantes) && editData.participantes.some(p => p && typeof p.nome === "string" && p.nome.trim());
      if (hasParticipantes) {
        setParticipantes(
          (editData.participantes || []).filter(Boolean).map((participante) => ({
            nome: typeof participante?.nome === "string" ? participante.nome : "",
            cargo: typeof participante?.cargo === "string" ? participante.cargo : "",
            instagram: typeof participante?.instagram === "string" ? participante.instagram : "",
          }))
        );
      } else if (finalProgId) {
        loadPresentersForProg(finalProgId, false);
      } else {
        setParticipantes([]);
      }

      setEscaladaList(
        Array.isArray(editData.escaladaList)
          ? editData.escaladaList.filter(Boolean).map((item) => ({
              titulo: typeof item?.titulo === "string" ? item.titulo : "",
              imagemUrl: typeof item?.imagemUrl === "string" ? item.imagemUrl : "",
            }))
          : [],
      );
      setEditingId(editData.roteiroId);
      setEditingXmlPath(editData.existingXmlPath || null);
      setPodcastData(normalizePodcastData(editData.podcastData));
      
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
  }, [editData, user, programas, loadPresentersForProg]);

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

  // O envio explícito confirma a persistência antes de atualizar o XML.
  // Não há salvamento paralelo com dados antigos durante a edição.
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInProgressRef = useRef(false);
  const autoSaveInFlightRef = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (!editingId || !initialized || !user || !programaId || !novoRoteiroOpen || isPodcast) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (saveInProgressRef.current) return;
      const autoSave = async () => {
      if (!hasInformationalContent(blocos) && !campoFixo.trim() && !noticiaRemovidaRef.current) return;
      setAutoSaving(true);
      try {
        const pNome = programas.find(p => p.id === programaId)?.nome || "";
        let html = `<h2 style="text-align:center;font-weight:bold;">PROGRAMA EXPRESS — ${pNome}</h2>`;
        if (participantes.length > 0) { html += `<h3 style="font-weight:bold;margin-top:16px;">👥 PARTICIPANTES</h3><ul>`; participantes.forEach(p => { html += `<li><strong>${p.nome}</strong>${p.cargo ? ` — ${p.cargo}` : ""}${p.instagram ? ` (@${p.instagram.replace("@", "")})` : ""}</li>`; }); html += `</ul>`; }
        if (escaladaList.length > 0) { html += `<h3 style="font-weight:bold;margin-top:16px;">📢 ESCALADA</h3><ul>`; escaladaList.forEach(e => { html += `<li><strong>${e.titulo}</strong></li>`; }); html += `</ul>`; }
        blocos.forEach((b, bi) => { html += `<h3 style="font-weight:bold;margin-top:16px;">📺 BLOCO ${bi + 1}</h3>`; b.noticias.forEach((n, ni) => { if (!n.titulo) return; html += `<div data-news-item="true" style="margin-bottom:12px;"><p><strong>Notícia ${ni + 1}:</strong> ${n.titulo}</p>`; if (n.resumo) html += `<p style="margin-top:4px;font-size:0.9em;opacity:0.9;">${n.resumo}</p>`; if (n.texto_materia) html += `<div style="margin-top:8px;padding:8px;background:#f8fafc;border-left:4px solid #3b82f6;font-size:0.95em;line-height:1.6;">${n.texto_materia.replace(/\n/g, "<br/>")}</div>`; if (n.imagemUrl) html += `<p><em>Imagem:</em> <a href="${n.imagemUrl}">${n.imagemUrl}</a></p>`; html += `</div>`; }); });
        const blocosJson = JSON.stringify({ ...editData?.dadosAdicionais, blocos, participantes, escaladaList, campoFixo });
        const autoTickerTitulos = blocos.flatMap(b => b.noticias.filter(n => n.titulo.trim()).map(n => n.titulo.trim())).join("  •  ");
        const nowIso = new Date().toISOString();
        const { data: savedRows, error: saveError } = await supabase.from("roteiros").update({
          programa_nome: pNome, 
          estudio, 
          titulo: `${autoTitlePrefix()}PROGRAMA EXPRESS — ${pNome}`, 
          conteudo_html: html, 
          participantes: blocosJson, 
          tickertitulos: autoTickerTitulos,
          configuracoes: configuracoes as any,
          updated_at: nowIso,
        } as any).eq("id", editingId).eq("user_id", effectiveUserId || user.id).select("id");
        if (saveError || !savedRows?.length) throw saveError || new Error("O roteiro não foi encontrado na conta atual");

        setLastAutoSaved(Date.now());
      } catch (e) { console.error("Auto-save error:", e); toast.error("Salvamento automático não concluído. Use Salvar para conferir a gravação."); }
      finally { setAutoSaving(false); }
      };
      const previous = autoSaveInFlightRef.current;
      const pending = (async () => {
        if (previous) await previous;
        await autoSave();
      })();
      autoSaveInFlightRef.current = pending;
      void pending.finally(() => { if (autoSaveInFlightRef.current === pending) autoSaveInFlightRef.current = null; });
    }, 2000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, estudio, programaId, blocos, participantes, escaladaList, campoFixo, initialized]);

  const handleSelectPrograma = async (selectedProgId: string) => {
    setProgramaId(selectedProgId);
    if (editingId) markEdited("programa");
    if (!selectedProgId) {
      if (!editingId) setParticipantes([]);
      setSelectedProgTipo(null);
      return;
    }
    await loadPresentersForProg(selectedProgId, true);
  };

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
    const targetOwner = effectiveUserId || user.id;
    try {
      const { error } = await supabase.from("apresentadores").insert({
        user_id: targetOwner,
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
    setSelectedProgTipo(null);
    setBlocos([{ noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }]);
    setFetchingLink(null);
    setSaving(false);
    setCollapsedBlocos(new Set());
    setEditingId(null);
    setEditingXmlPath(null);
    setInitialized(false);
    setParticipantes([]);
    setEscaladaList([]);
    setCampoFixo("");
    noticiaRemovidaRef.current = false;
    setNoticiaParaRemover(null);
    setSearchNome("");
    setSearchResults([]);
    setShowResults(false);
    setNoResults(false);
    setShowNewContact(false);
    setEditedFields(new Set());
    setLastAutoSaved(null);
    initialDataRef.current = null;
    setPodcastData({ tituloTarja: "", subtituloTarja: "", introducao: "", agendamentoData: "", agendamentoHorario: "", perguntas: [""], concluindo: "", apoioImagens: [""], apoioVideos: [""] });
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
  const removeNoticia = (bi: number, ni: number) => setNoticiaParaRemover({ bi, ni });
  const confirmarRemocaoNoticia = () => {
    if (!noticiaParaRemover) return;
    const { bi, ni } = noticiaParaRemover;
    const noticia = blocos[bi]?.noticias[ni];
    if (!noticia) return;
    noticiaRemovidaRef.current = true;
    setBlocos(prev => prev.map((bloco, i) => i === bi ? { ...bloco, noticias: bloco.noticias.filter((_, j) => j !== ni) } : bloco));
    setNoticiaParaRemover(null);
    toast.info(editingId ? "Notícia retirada do roteiro. Aguarde o salvamento automático." : "Notícia retirada do roteiro. Salve para guardar a alteração.");
  };
  const addBloco = () => { setBlocos(prev => [...prev, { noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }]); };
  const removeBloco = (bi: number) => { setBlocos(prev => prev.filter((_, i) => i !== bi)); setCollapsedBlocos(prev => { const n = new Set(prev); n.delete(bi); return n; }); };
  const toggleCollapse = (bi: number) => { setCollapsedBlocos(prev => { const n = new Set(prev); if (n.has(bi)) n.delete(bi); else n.add(bi); return n; }); };
  const moveNoticia = (bi: number, ni: number, dir: -1 | 1) => {
    setBlocos(prev => prev.map((b, i) => {
      if (i !== bi) return b;
      const target = ni + dir;
      if (target < 0 || target >= b.noticias.length) return b;
      const noticias = [...b.noticias];
      [noticias[ni], noticias[target]] = [noticias[target], noticias[ni]];
      return { ...b, noticias };
    }));
  };

  const fetchFromLink = async (bi: number, ni: number, url: string, forceReprocess = false): Promise<NewsItem | null> => {
    if (!url || !url.startsWith("http")) return null;
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
      if (!error && data?.ok && (data.content || data.title)) {
        const html = (data.content as string) || "";
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
        const rawTitle = data.title || getMetaContent("og:title") || getMetaContent("twitter:title") || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").trim();
        let title = rawTitle.includes("|") ? rawTitle.split("|")[0].trim() : rawTitle;
        if (title.includes(" - ")) title = title.split(" - ")[0].trim();
        if (!title && url) {
          try {
            const pathname = new URL(url).pathname;
            const slug = pathname.split("/").filter(Boolean).pop() || "";
            const formatted = slug.replace(/[-_]+/g, " ").replace(/\.(html|php|asp)$/i, "").trim();
            if (formatted) title = formatted.charAt(0).toUpperCase() + formatted.slice(1);
          } catch {}
        }
        const image = data.image || getMetaContent("og:image") || getMetaContent("twitter:image") || "";
        
        // Extract summary/description
        let summary = data.summary || data.description || getMetaContent("og:description") || getMetaContent("twitter:description") || getMetaContent("description") || "";
        if (!summary && html) {
          const pMatches = html.match(/<p[^>]*>([^<]{40,})<\/p>/gi);
          if (pMatches) {
            summary = pMatches[0].replace(/<[^>]+>/g, "").trim().slice(0, 300);
          }
        }

        const decodeFull = (v: string) => { let s = v; for (let i = 0; i < 3; i++) { const d = decodeHtmlEntities(s); if (d === s) break; s = d; } return s; };
        
        const extractedTitle = decodeFull(title || "Notícia");
        const extractedImage = decodeFull(image);
        const extractedSummary = decodeFull(summary);
        const extractedJournalisticText = data.journalisticText || "";

        const resultItem: NewsItem = {
          titulo: extractedTitle,
          imagemUrl: extractedImage,
          resumo: extractedSummary,
          texto_materia: extractedJournalisticText,
          link: url,
          escalada: false,
        };

        // We need to use a functional update for setBlocos to ensure we don't rely on stale state
        setBlocos(prev => prev.map((b, i) => i === bi ? {
          ...b,
          noticias: (b.noticias || []).map((n, j) => {
            if (j !== ni) return n;
            const updated = { ...n };
            const hasSubstantialText = (n.texto_materia && n.texto_materia.length > 200) || 
                                      (n.resumo && n.resumo.length > 200);

            if (title && (forceReprocess || !n.titulo || n.titulo.length < 5)) {
              updated.titulo = extractedTitle;
            }
            if (image && (forceReprocess || !n.imagemUrl)) {
              updated.imagemUrl = extractedImage;
            }
            if (summary && (forceReprocess || !hasSubstantialText)) {
              updated.resumo = extractedSummary;
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
        return resultItem;
      } else { 
        toast.error("Não foi possível acessar o link"); 
        return null;
      }
    } catch { 
      toast.error("Não foi possível extrair dados do link"); 
      return null;
    } finally {
      setFetchingLink(null);
    }
  };

  const escXml = (value: string | null | undefined) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const generateXml = (overrideBlocos?: Bloco[]): string => {
    const activeBlocos = overrideBlocos || blocos;
    const now = new Date();
    const localDateStr = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const localTimeStr = now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
    const progObj = programas.find(p => p.id === programaId);
    const targetDate = localDateStr;
    const targetHorario = progObj?.horario_inicio?.slice(0, 5) || editData?.horario?.slice(0, 5) || localTimeStr;
    const targetHorarioFim = progObj?.horario_fim?.slice(0, 5) || "";
    const nowIso = now.toISOString();

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<programaExpress>\n`;
    xml += `  <programa>${escXml(programaNome)}</programa>\n`;
    xml += `  <estudio>${escXml(estudio)}</estudio>\n`;
    xml += `  <data>${targetDate}</data>\n`;
    xml += `  <horario>${targetHorario}</horario>\n`;
    xml += `  <hora>${targetHorario}</hora>\n`;
    xml += `  <hora_inicio>${targetHorario}</hora_inicio>\n`;
    if (targetHorarioFim) {
      xml += `  <hora_fim>${targetHorarioFim}</hora_fim>\n`;
    }
    xml += `  <horario_geracao>${localTimeStr}</horario_geracao>\n`;
    xml += `  <atualizado_em>${nowIso}</atualizado_em>\n`;
    if (participantes.length > 0) { xml += `  <participantes>\n`; participantes.forEach((p) => { xml += `    <item>\n      <nome>${escXml(p.nome)}</nome>\n      <cargo>${escXml(p.cargo)}</cargo>\n      <instagram>${escXml(p.instagram)}</instagram>\n    </item>\n`; }); xml += `  </participantes>\n`; }
    if (isPodcast) {
      xml += `  <roteiro>\n`;
      xml += `    <tituloTarja>${escXml(podcastData.tituloTarja)}</tituloTarja>\n`;
      xml += `    <subtituloTarja>${escXml(podcastData.subtituloTarja)}</subtituloTarja>\n`;
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
      activeBlocos.forEach((b, bi) => { xml += `  <bloco numero="${bi + 1}">\n`; noticiasComCampoFixo(b?.noticias || [], campoFixo, bi === 0).forEach((n, ni) => { if (!n?.titulo) return; xml += `    <noticia ordem="${ni + 1}">\n      <titulo>${escXml(n.titulo)}</titulo>\n      <imagem>${escXml(n.imagemUrl)}</imagem>\n      <resumo>${escXml(n.resumo || "")}</resumo>\n      <texto_materia>${escXml(n.texto_materia || "")}</texto_materia>\n      <escalada>${n.escalada}</escalada>\n    </noticia>\n`; }); xml += `  </bloco>\n`; });
    }
    xml += `</programaExpress>`;
    return xml;
  };

  const addWeatherInfo = async (bi: number, ni?: number) => {
    const isRegenerating = ni !== undefined;
    if (isRegenerating) setFetchingLink(`${bi}-${ni}`);
    else setAddingWeather(true);
    
    try {
      // ALWAYS use the primary city registered in "Previsão do Tempo" (user-scoped)
      let primary: { name: string; lat?: number; lon?: number } | null = null;
      try {
        if (user?.id) {
          primary = JSON.parse(localStorage.getItem(`masterview_primary_city_${user.id}`) || "null");
        }
      } catch {}

      if (!primary?.name) {
        toast.error("Cidade principal não definida. Defina em PREVISÃO DO TEMPO > Tornar Principal.");
        if (isRegenerating) setFetchingLink(null);
        else setAddingWeather(false);
        return;
      }

      let latitude = primary.lat;
      let longitude = primary.lon;
      let name = primary.name;

      if (latitude == null || longitude == null) {
        const { data: geoData } = await supabase.functions.invoke("fetch-weather", {
          body: { action: "geocode", query: primary.name, count: 1 },
        });
        if (!geoData?.results?.length) {
          toast.error("Não foi possível localizar a cidade principal.");
          if (isRegenerating) setFetchingLink(null);
          else setAddingWeather(false);
          return;
        }
        latitude = geoData.results[0].latitude;
        longitude = geoData.results[0].longitude;
        name = geoData.results[0].name || primary.name;
      }

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

  const handleSave = async (schedule?: { data: string; horario: string }, overrideBlocos?: Bloco[]): Promise<boolean> => {
    if (!user || !programaId) return false;
    const activeBlocos = overrideBlocos || blocos;
    if (overrideBlocos) {
      setBlocos(overrideBlocos);
    }
    if (isPodcast) {
      if (!podcastData.tituloTarja.trim() && podcastData.perguntas.every(p => !p.trim())) {
        toast.error("Preencha ao menos o título da tarja ou uma pergunta"); return false;
      }
    } else {
      if (!hasInformationalContent(activeBlocos) && !campoFixo.trim() && !(editingId && noticiaRemovidaRef.current)) { toast.error("Adicione pelo menos uma notícia ou conteúdo informativo"); return false; }
    }
    setSaving(true);
    saveInProgressRef.current = true;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    try {
      if (autoSaveInFlightRef.current) await autoSaveInFlightRef.current;
      const xmlContent = generateXml(activeBlocos);
      let html = `<h2 style="text-align:center;font-weight:bold;">PROGRAMA EXPRESS — ${programaNome}</h2>`;
      if (participantes.length > 0) { html += `<h3 style="font-weight:bold;margin-top:16px;">👥 PARTICIPANTES</h3><ul>`; participantes.forEach(p => { html += `<li><strong>${p.nome}</strong>${p.cargo ? ` — ${p.cargo}` : ""}${p.instagram ? ` (@${p.instagram.replace("@", "")})` : ""}</li>`; }); html += `</ul>`; }
      if (isPodcast) {
        html += `<h3 style="font-weight:bold;margin-top:16px;">🎙️ ROTEIRO</h3>`;
        if (podcastData.tituloTarja) html += `<p><strong>Tarja:</strong> ${podcastData.tituloTarja}</p>`;
        if (podcastData.subtituloTarja) html += `<p><strong>Subtítulo:</strong> ${podcastData.subtituloTarja}</p>`;
        if (podcastData.introducao) html += `<p><strong>Introdução:</strong> ${podcastData.introducao}</p>`;
        const validPerguntas = podcastData.perguntas.filter(p => p.trim());
        if (validPerguntas.length > 0) { html += `<h4 style="font-weight:bold;margin-top:12px;">❓ Perguntas</h4><ol>`; validPerguntas.forEach(p => { html += `<li>${p}</li>`; }); html += `</ol>`; }
        if (podcastData.concluindo) html += `<p><strong>Concluindo:</strong> ${podcastData.concluindo}</p>`;
      } else {
        if (escaladaList.length > 0) { html += `<h3 style="font-weight:bold;margin-top:16px;">📢 ESCALADA</h3><ul>`; escaladaList.forEach(e => { html += `<li><strong>${e.titulo}</strong></li>`; }); html += `</ul>`; }
        activeBlocos.forEach((b, bi) => { html += `<h3 style="font-weight:bold;margin-top:16px;">📺 BLOCO ${bi + 1}</h3>`; b.noticias.forEach((n, ni) => { if (!n.titulo) return; html += `<div data-news-item="true" style="margin-bottom:12px;"><p><strong>Notícia ${ni + 1}:</strong> ${n.titulo}</p>`; if (n.resumo) html += `<p style="margin-top:4px;font-size:0.9em;opacity:0.9;">${n.resumo}</p>`; if (n.texto_materia) html += `<div style="margin-top:8px;padding:8px;background:#f8fafc;border-left:4px solid #3b82f6;font-size:0.95em;line-height:1.6;">${n.texto_materia.replace(/\n/g, "<br/>")}</div>`; if (n.imagemUrl) html += `<p><em>Imagem:</em> <a href="${n.imagemUrl}">${n.imagemUrl}</a></p></div>`; }); });
      }

      const blocosJson = isPodcast
        ? JSON.stringify({ ...editData?.dadosAdicionais, blocos: activeBlocos, participantes, escaladaList, podcastData, campoFixo })
        : JSON.stringify({ ...editData?.dadosAdicionais, blocos: activeBlocos, participantes, escaladaList, campoFixo });

      // Generate ticker titles from all news titles
      const allTitles = (activeBlocos || []).flatMap(b => (b?.noticias || []).filter(n => n?.titulo?.trim()).map(n => n.titulo.trim()));
      const tickertitulos = allTitles.join("  •  ");

      const now = new Date();
      const localDateStr = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const localTimeStr = now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
      const nowIso = now.toISOString();

      const ownerId = effectiveUserId || user.id;
      const selectedProg = programas.find(p => p.id === programaId);
      const tipoProg = selectedProgTipo || selectedProg?.tipo_programa || "Jornalístico";
      // Ao salvar uma nova edição, não reutilizar a data da versão carregada.
      const targetDataPrograma = localDateStr;
      const targetHorario = selectedProg?.horario_inicio?.slice(0, 5) || editData?.horario?.slice(0, 5) || localTimeStr;

      let roteiroId = editingId ? editingId.replace(/^express_/, "").replace(/^rot_/, "") : null;
      const isCleanUuid = (id: string | null): id is string => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (!isCleanUuid(roteiroId)) {
        roteiroId = null;
      }

      if (!roteiroId) {
        // Try finding existing record in DB for this program & studio (strictly this account)
        try {
          const { data: existingProg } = await supabase
            .from("roteiros")
            .select("id")
            .eq("user_id", ownerId)
            .eq("programa_nome", programaNome)
            .eq("estudio", estudio)
            .is("agendado_para_envio", null)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (existingProg?.id && isCleanUuid(existingProg.id)) {
            roteiroId = existingProg.id;
            setEditingId(roteiroId);
          }
        } catch {}
      }


      if (!roteiroId) {
        // Try insert with ownerId first (client station's ID) so public XML endpoints find it
        let insertRes = await supabase.from("roteiros").insert({
          user_id: ownerId,
          programa_nome: programaNome,
          estudio,
          titulo: `${autoTitlePrefix()}PROGRAMA EXPRESS — ${programaNome}`,
          subtitulo: "",
          tipo_programa: tipoProg,
          data_programa: targetDataPrograma,
          horario: targetHorario,
          conteudo_html: html,
          participantes: blocosJson,
          status: "feito",
          tickertitulos,
          xml_pushed_at: nowIso,
          updated_at: nowIso,
        } as any).select("id").single();

        if (insertRes.data?.id) {
          roteiroId = insertRes.data.id;
          setEditingId(roteiroId);
        } else {
          throw insertRes.error || new Error("Não foi possível gravar o roteiro na conta atual");
        }
      }

      const blob = new Blob([xmlContent], { type: "application/xml" });
      const storageUid = ownerId;
      const filePath = editingXmlPath || `express/${storageUid}/express_${roteiroId}.xml`;
      if (!editingXmlPath) setEditingXmlPath(filePath);
      let xmlUrl = "";
      try {
        const { error: uploadError } = await supabase.storage.from("empresa-assets").upload(filePath, blob, { upsert: true, contentType: "application/xml" });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(filePath);
        xmlUrl = urlData?.publicUrl || "";
      } catch (eStorage) {
        console.warn("Storage upload XML notice:", eStorage);
      }

      const scheduledDateTime = schedule
        ? new Date(`${schedule.data}T${schedule.horario}:00`).toISOString()
        : undefined;

      // Base roteiro payload (always registered in "roteiros cadastrados" with status: "feito" and agendado_para_envio: null)
      const effectiveSubtitulo = xmlUrl
        ? `express_xml::${xmlUrl}`
        : (editingXmlPath ? `express_xml::${editingXmlPath}` : `express_xml::local_${roteiroId}`);

      const baseUpdatePayload: any = {
        programa_nome: programaNome,
        estudio,
        titulo: `${autoTitlePrefix()}PROGRAMA EXPRESS — ${programaNome}`,
        subtitulo: effectiveSubtitulo,
        tipo_programa: tipoProg,
        conteudo_html: html,
        participantes: blocosJson,
        tickertitulos,
        data_programa: targetDataPrograma,
        horario: targetHorario,
        status: "feito",
        agendado_para_envio: null,
        xml_pushed_at: schedule ? ((editData as any)?.xml_pushed_at || nowIso) : nowIso,
        updated_at: nowIso,
      };

      // Persist to DB and CONFIRM the write landed (0 rows updated = silent data loss)
      try {
        let saved = false;
        if (isCleanUuid(roteiroId)) {
          const upd = await supabase
            .from("roteiros")
            .update(baseUpdatePayload)
            .eq("id", roteiroId)
            .eq("user_id", ownerId)
            .select("id");
          saved = !upd.error && !!upd.data && upd.data.length > 0;
        }
        if (!saved) {
          // Fallback: match the same program/studio of this account
          const upd2 = await supabase
            .from("roteiros")
            .update(baseUpdatePayload)
            .eq("user_id", ownerId)
            .eq("programa_nome", programaNome)
            .eq("estudio", estudio)
            .is("agendado_para_envio", null)
            .select("id");
          if (!upd2.error && upd2.data && upd2.data.length > 0) {
            saved = true;
            roteiroId = upd2.data[0].id;
            setEditingId(roteiroId);
          }
        }
        if (!saved) {
          // Last resort: create the record so the content is never lost
          const ins = await supabase
            .from("roteiros")
            .insert({ ...baseUpdatePayload, user_id: ownerId, created_at: nowIso } as any)
            .select("id")
            .single();
          if (ins.data?.id) {
            saved = true;
            roteiroId = ins.data.id;
            setEditingId(roteiroId);
          } else throw ins.error || new Error("Não foi possível confirmar a gravação do roteiro");
        }
        if (!saved) throw new Error("Não foi possível confirmar a gravação do roteiro");
        const confirmed = await supabase.from("roteiros")
          .select("id, updated_at, participantes")
          .eq("id", roteiroId).eq("user_id", ownerId).maybeSingle();
        const persistedParts = typeof confirmed.data?.participantes === "string"
          ? JSON.parse(confirmed.data.participantes)
          : confirmed.data?.participantes;
        if (confirmed.error || !confirmed.data || JSON.stringify(persistedParts) !== JSON.stringify(JSON.parse(blocosJson))) {
          throw confirmed.error || new Error("O conteúdo salvo não corresponde ao roteiro enviado");
        }
      } catch (updErr: any) {
        throw new Error(`Não foi possível gravar o roteiro no servidor: ${updErr?.message || updErr}`);
      }


      // RESILIENT LOCAL STORAGE: Always save base roteiro so the program box is never lost
      const fullBaseRecord = {
        id: roteiroId,
        user_id: ownerId,
        ...baseUpdatePayload,
        created_at: nowIso,
      };

      const storageKey = `nexohub_roteiros_${ownerId}`;
      const existing = JSON.parse(localStorage.getItem(storageKey) || "[]");
      const list = Array.isArray(existing) ? existing : [];
      const idx = list.findIndex((r: any) => r.id === roteiroId || (r.programa_nome === programaNome && r.estudio === estudio && !r.agendado_para_envio));
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...fullBaseRecord };
      } else {
        list.unshift(fullBaseRecord);
      }

      // If scheduled: also create a separate scheduled roteiro record so it appears in "roteiros agendados"
      if (schedule && scheduledDateTime) {
        let scheduledRoteiroId: string | null = null;
        const schedPayload: any = {
          user_id: ownerId,
          programa_nome: programaNome,
          estudio,
          titulo: `${autoTitlePrefix()}PROGRAMA EXPRESS — ${programaNome}`,
          subtitulo: effectiveSubtitulo,
          tipo_programa: tipoProg,
          conteudo_html: html,
          participantes: blocosJson,
          tickertitulos,
          data_programa: schedule.data,
          horario: schedule.horario,
          status: "feito",
          agendado_para_envio: scheduledDateTime,
          enviado_agendamento: false,
          xml_pushed_at: null,
          created_at: nowIso,
          updated_at: nowIso,
        };

        try {
          const insSched = await supabase.from("roteiros").insert(schedPayload).select("id").single();
          if (insSched.error || !insSched.data?.id) throw insSched.error || new Error("Não foi possível agendar o roteiro");
          scheduledRoteiroId = insSched.data.id;
        } catch (eSched) {
          throw new Error(`Não foi possível agendar o roteiro: ${eSched instanceof Error ? eSched.message : eSched}`);
        }

        const fullSchedRecord = {
          id: scheduledRoteiroId,
          ...schedPayload,
        };
        list.unshift(fullSchedRecord);
      }

      localStorage.setItem(storageKey, JSON.stringify(list));
      if (user?.id && user.id !== ownerId) {
        localStorage.setItem(`nexohub_roteiros_${user.id}`, JSON.stringify(list));
      }
      window.dispatchEvent(new CustomEvent("nexohub:roteiros-updated", { detail: { roteiro: fullBaseRecord } }));

      // Immediately sync to /api/sync-xml-roteiro so roteiro.xml updates in real-time
      try {
        const clientAcc = (ownerId && findClientAccountById(ownerId)) ||
          (user?.id && findClientAccountById(user.id)) ||
          (user?.email && findClientAccountByEmail(user.email));
         const targetSlug = clientAcc?.slug || ownerId;
        await fetch("/api/sync-xml-roteiro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: targetSlug,
            userId: ownerId,
            estudio,
            programaNome,
            xml: xmlContent,
            roteiro: fullBaseRecord,
          }),
        });
      } catch (eSync) {
        console.warn("[ProgramaExpress] sync-xml-roteiro notice:", eSync);
      }

      // Push to XML on "Salvar" and always on Podcast "Agendar e salvar"
      if (!schedule || isPodcast) {
        try {
          const urlMatch = import.meta.env.VITE_SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/);
          const projectId = urlMatch ? urlMatch[1] : "";
          if (projectId && roteiroId) {
            const fnUrl = `https://${projectId}.supabase.co/functions/v1/roteiro-xml?id=${roteiroId}&force=1&persist=1&t=${Date.now()}`;
            await fetch(fnUrl, { method: "GET" });
          }
        } catch (eXmlFn) {
          console.warn("[ProgramaExpress] roteiro-xml invoke error:", eXmlFn);
        }
      }

      // Create or update agenda event when podcast is scheduled
      const agendaData = schedule?.data || podcastData.agendamentoData;
      const agendaHorario = schedule?.horario || podcastData.agendamentoHorario;
      if (isPodcast && agendaData) {
        try {
          const horario = agendaHorario || "00:00";
          const descricao = `Roteiro: ${programaNome}${horario ? ` às ${horario}` : ""}${podcastData.tituloTarja ? ` — ${podcastData.tituloTarja}` : ""}`;
          let targetEventoId = editData?.agendaEventoId;

          if (!targetEventoId) {
            const { data: eventosExistentes } = await supabase
              .from("agenda_eventos")
              .select("id, horario_gravacao")
              .eq("user_id", ownerId)
              .eq("programa_id", programaId)
              .eq("data", agendaData)
              .eq("tipo_evento", "gravacao")
              .limit(10);

            const horarioCurto = horario.slice(0, 5);
            targetEventoId = eventosExistentes?.find((evt: any) => (evt.horario_gravacao || "").slice(0, 5) === horarioCurto)?.id
              || eventosExistentes?.[0]?.id;
          }

          if (targetEventoId) {
            await supabase.from("agenda_eventos").update({
              data: agendaData,
              local: estudio || "Podcast",
              descricao,
              programa_id: programaId,
              tipo_evento: "gravacao",
              horario_gravacao: horario,
            } as any).eq("id", targetEventoId);
            toast.success("Evento da agenda atualizado 📅", { duration: 2500 });
          } else {
            let agendaInsert = await supabase.from("agenda_eventos").insert({
              user_id: ownerId,
              data: agendaData,
              local: estudio || "Podcast",
              descricao,
              prioridade: "alta",
              programa_id: programaId,
              recorrencia: "unico",
              tipo_evento: "gravacao",
              horario_gravacao: horario,
            } as any);
            if (agendaInsert.error && ownerId !== user.id) {
              await supabase.from("agenda_eventos").insert({
                user_id: user.id,
                data: agendaData,
                local: estudio || "Podcast",
                descricao,
                prioridade: "alta",
                programa_id: programaId,
                recorrencia: "unico",
                tipo_evento: "gravacao",
                horario_gravacao: horario,
              } as any);
            }
            toast.success("Evento adicionado à agenda 📅", { duration: 2500 });
          }
        } catch (e) { console.warn("Falha ao salvar evento na agenda:", e); }
      }

      try { sessionStorage.removeItem("roteiro_auto_generated"); } catch {}
      toast.success(
        schedule
          ? "Roteiro agendado e salvo em cadastrados ✨"
          : "Roteiro salvo e enviado para o XML ✨",
        { duration: 3500, style: { background: "#22c55e", color: "#fff", fontWeight: 600, borderRadius: "12px", boxShadow: "0 8px 32px rgba(34,197,94,0.35)" } }
      );
      if (schedule) await fetchScheduledRoteiros();
      reset();
      onFinish();
      setTimeout(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, 200);
      return true;
    } catch (e: any) {
      console.error("[ProgramaExpress] Erro ao salvar:", e);
      const detalhe = e?.message || e?.error_description || e?.error || (typeof e === "string" ? e : JSON.stringify(e));
      toast.error(`Erro ao salvar: ${detalhe}`, { duration: 8000 });
      return false;
    } finally {
      setSaving(false);
      saveInProgressRef.current = false;
    }
  };

  // === Nexo Form Design System (mesmo padrão Blitz / ClientesPage) ===
  const NEXO_CYAN = "#268ffa";
  const NEXO_CARD_BG = "#ffffff";
  const NEXO_DARK = "#002132";
  const inputStyle = {
    backgroundColor: "#f8fafc",
    border: "1px solid rgba(226, 232, 240, 0.9)",
    color: "#0f172a",
    borderRadius: 999,
    fontFamily: "'Montserrat', sans-serif",
  } as React.CSSProperties;
  if (renderAsModal && !novoRoteiroOpen) return null;

  const card = (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: renderAsModal ? NEXO_CARD_BG : "#ffffff",
        boxShadow: renderAsModal ? "0 20px 60px rgba(0,0,0,0.35)" : "0 4px 24px rgba(0,0,0,0.08)",
        width: "100%",
        fontFamily: "'Montserrat', sans-serif",
        ...(renderAsModal
          ? {
              maxHeight: "calc(100vh - 48px)",
              display: "flex",
              flexDirection: "column",
              position: "relative",
            }
          : {}),
      }}
    >
      {renderAsModal && (
        <button
          onClick={() => setNovoRoteiroOpen(false)}
          aria-label="Fechar"
          style={{ position: "absolute", top: 12, right: 12, width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.9)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}
        >
          <XIcon size={16} style={{ color: "#0A2540" }} />
        </button>
      )}
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between flex-shrink-0"
        style={{
          background: renderAsModal ? NEXO_CARD_BG : "linear-gradient(135deg, var(--layout-button-bg, #2563eb), color-mix(in srgb, var(--layout-button-bg, #2563eb) 70%, black 30%))",
          color: renderAsModal ? NEXO_DARK : "#ffffff",
          borderBottom: renderAsModal ? `1px solid rgba(10,37,64,0.08)` : "none",
        }}
      >
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
        <div className="flex items-center gap-2" style={{ marginRight: renderAsModal ? 44 : 0 }}>
          <button
            onClick={() => {
              const total = blocos.reduce((acc, b) => acc + b.noticias.filter(n => n.titulo || n.imagemUrl || n.texto_materia || (n as any).resumo).length, 0);
              if (total === 0 && escaladaList.length === 0) { toast.info("Nenhuma notícia para limpar"); return; }
              setShowLimparConfirm(true);
            }}
            className="flex items-center gap-1.5 text-[11px] font-semibold py-1.5 px-3 hover:opacity-80 transition-all"
            style={{ backgroundColor: renderAsModal ? "#FFFFFF" : "rgba(255,255,255,0.15)", color: renderAsModal ? "#dc2626" : "var(--layout-header-text, #ffffff)", border: renderAsModal ? `2px solid #dc2626` : "none", borderRadius: renderAsModal ? 999 : 8 }}
            title="Remove todas as notícias de todos os blocos"
          >
            <Trash2 size={13} /> Limpar Notícias
          </button>
          <button
            onClick={() => setShowNoticiasFontes(true)}
            className="flex items-center gap-1.5 text-[11px] font-semibold py-1.5 px-3 hover:opacity-80 transition-all"
            style={{ backgroundColor: renderAsModal ? "#FFFFFF" : "rgba(255,255,255,0.15)", color: renderAsModal ? NEXO_DARK : "var(--layout-header-text, #ffffff)", border: renderAsModal ? `2px solid ${NEXO_CYAN}` : "none", borderRadius: renderAsModal ? 999 : 8 }}
          >
            <Newspaper size={13} /> Notícias de Fontes
          </button>
        </div>
      </div>

      <NoticiasFontesPopup
        open={showNoticiasFontes}
        onOpenChange={setShowNoticiasFontes}
        blocosCount={blocos.length}
        initialBlocoItems={Object.fromEntries(
          blocos.map((b, i) => [
            i,
            (b.noticias || [])
              .filter(n => (n.titulo || "").trim())
              .map(n => ({ title: n.titulo, link: "", thumbnail: n.imagemUrl || "", pubDate: "", summary: (n as any).resumo || "" })),
          ])
        )}
        onBlocoItemsChange={(bi, items) => {
          setBlocos(prev => prev.map((b, i) => {
            if (i !== bi) return b;
            if (!items.length) return { ...b, noticias: [{ titulo: "", imagemUrl: "", escalada: false }] };
            const next = items.map(it => {
              const existing = (b.noticias || []).find(n => (n.titulo || "").trim() === (it.title || "").trim());
              return existing || {
                titulo: (it.title || "").replace(/\uFFFD/g, "").trim(),
                imagemUrl: it.thumbnail || "",
                escalada: false,
                resumo: it.summary || "",
                texto_materia: "",
              } as any;
            });
            return { ...b, noticias: next };
          }));
        }}
      />

      {showLimparConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 100000, background: "rgba(0,0,0,0.6)" }}
          onClick={() => setShowLimparConfirm(false)}
        >
          <div
            className="bg-background rounded-lg shadow-2xl border p-6 max-w-md w-[90%]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-2">Confirmar limpeza do roteiro</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Isso removerá todas as notícias dos blocos e também as manchetes cadastradas na escalada. Esta ação não pode ser desfeita. Deseja continuar?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowLimparConfirm(false)}
                className="px-4 py-2 rounded-md text-sm border hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const clearedBlocos = blocos.map(b => ({ ...b, noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }));
                  setBlocos(clearedBlocos);
                  setEscaladaList([]);
                  setShowLimparConfirm(false);
                  // Persist cleared state directly since autosave short-circuits when there are no news
                  if (editingId) {
                    try {
                      const blocosJson = JSON.stringify({ blocos: clearedBlocos, participantes, escaladaList: [] });
                      await supabase.from("roteiros").update({
                        participantes: blocosJson,
                        tickertitulos: "",
                        updated_at: new Date().toISOString(),
                      } as any).eq("id", editingId);

                    } catch (e) { console.error("Erro ao limpar notícias:", e); }
                  }
                  toast.success("Notícias e manchetes removidas");
                }}
                className="px-4 py-2 rounded-md text-sm font-semibold text-white"
                style={{ background: "#dc2626" }}
              >
                OK, limpar
              </button>
            </div>
          </div>
        </div>
      )}





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
      <div className="relative flex-1 min-h-0 w-full flex flex-col overflow-hidden">
        <div
          ref={modalScrollRef}
          className={`space-y-5 ${renderAsModal ? "flex-1 min-h-0 overflow-y-auto roteiro-modal-scroll pr-8" : ""}`}
          style={{ padding: renderAsModal ? "28px 32px 32px" : "24px" }}
        >

        {/* Seção movida para RoteiroPrograma.tsx ou gerenciada via afterHeader se preferir, 
            mas o usuário pediu para colocar ABAIXO da seção de automatização no Roteiro de Programa.
            Removendo daqui para evitar duplicidade visual e confusão. */}


        {/* Paste Script */}
        {showPastePopup && (
          <div className="rounded-xl p-3 space-y-2" style={{ border: "2px solid #268ffa", backgroundColor: "color-mix(in srgb, #268ffa 6%, transparent)" }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: "#268ffa" }}>
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
            <button onClick={parsePastedScript} disabled={!pasteText.trim()} className="w-full py-2 rounded-lg text-[11px] font-bold transition-all hover:opacity-90 flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ backgroundColor: "#268ffa", color: "var(--layout-header-text, #fff)" }}>
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
              <Select value={estudio} onValueChange={v => { setEstudio(v); setProgramaId(""); if (!editingId) setParticipantes([]); if (editingId) markEdited("estudio"); }}>
                <SelectTrigger className="w-full text-xs h-10">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const list = [...estudios];
                    if (estudio && !list.some(e => e.toLowerCase() === estudio.toLowerCase())) {
                      list.unshift(estudio);
                    }
                    return list.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>);
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] font-semibold mb-1.5 flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Programa {editedFields.has("programa") && <EditedCheck />}</label>
              <Select value={programaId} onValueChange={handleSelectPrograma}>
                <SelectTrigger className="w-full text-xs h-10">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {filteredProgramas.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {programaId && (() => {
                const prog = programas.find(p => p.id === programaId);
                const tp = selectedProgTipo || prog?.tipo_programa;
                const hInicio = prog?.horario_inicio?.slice(0, 5) || editData?.horario?.slice(0, 5);
                const hFim = prog?.horario_fim?.slice(0, 5);
                const dias = Array.isArray(prog?.dias_semana) ? prog.dias_semana.join(", ") : (prog?.dias_semana || "");
                return (
                  <div className="mt-2 p-2.5 rounded-lg text-[11px] space-y-1" style={{ backgroundColor: "color-mix(in srgb, #268ffa 8%, transparent)", border: "1px solid color-mix(in srgb, #268ffa 20%, transparent)" }}>
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      {tp && (
                        <span className="font-bold text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, #268ffa 18%, transparent)", color: "#268ffa" }}>
                          🎙️ {tp}
                        </span>
                      )}
                      {(hInicio || hFim) && (
                        <span className="font-semibold text-[10px]" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                          ⏰ Horário: <strong style={{ color: "#268ffa" }}>{hInicio}{hFim ? ` às ${hFim}` : ""}</strong>
                        </span>
                      )}
                    </div>
                    {dias && (
                      <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 70%, transparent)" }}>
                        📅 <strong>Dias:</strong> {dias}
                      </p>
                    )}
                    {prog?.estudio && (
                      <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 70%, transparent)" }}>
                        🏢 <strong>Estúdio:</strong> {prog.estudio}
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="h-px" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)" }} />

        {/* Participantes */}
        <div className="rounded-xl p-4" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 25%, transparent)", backgroundColor: "color-mix(in srgb, #268ffa 4%, transparent)" }}>
          <p className="text-xs font-bold flex items-center gap-1.5 mb-3" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            <Users size={14} style={{ color: "#268ffa" }} />
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
                    {r.instagram && <span className="text-[10px]" style={{ color: "#268ffa" }}>@{r.instagram.replace("@", "")}</span>}
                  </button>
                ))}
              </div>
            )}
            {showResults && noResults && searchNome.trim().length > 1 && (
              <div className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden p-3" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 25%, transparent)" }}>
                <p className="text-[11px] mb-2" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nenhum resultado para "<strong>{searchNome}</strong>".</p>
                <button onClick={openNewContactPopup} className="flex items-center gap-1.5 text-[11px] font-semibold py-1.5 px-3 rounded-lg hover:opacity-80 transition-all" style={{ backgroundColor: "color-mix(in srgb, #268ffa 12%, transparent)", color: "#268ffa" }}>
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
            onUpdateComplete={handleSave}
          />
        )}

        {/* New Contact */}
        {showNewContact && (
          <div className="rounded-xl p-3 space-y-2" style={{ border: "2px solid #268ffa", backgroundColor: "color-mix(in srgb, #268ffa 6%, transparent)" }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: "#268ffa" }}><UserPlus size={14} /> Novo Participante</p>
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
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${NEXO_CYAN}22`, backgroundColor: `${NEXO_CYAN}08` }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: `${NEXO_CYAN}12` }}>
                <FileText size={16} style={{ color: NEXO_CYAN }} />
                <span className="text-sm font-bold" style={{ color: NEXO_CYAN }}>Roteiro</span>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-[13px] font-bold mb-1.5 flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                      <Type size={14} style={{ color: NEXO_CYAN }} /> Título
                    </label>
                    <input
                      value={podcastData.tituloTarja}
                      onChange={e => setPodcastData(prev => ({ ...prev, tituloTarja: e.target.value }))}
                      placeholder="Título principal"
                      className="w-full px-4 py-2.5 rounded-lg text-[12px] font-bold outline-none"
                      style={{ ...inputStyle, borderRadius: 8, fontWeight: 700 }}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                      <Type size={12} style={{ color: NEXO_CYAN }} /> Subtítulo
                    </label>
                    <input
                      value={podcastData.subtituloTarja}
                      onChange={e => setPodcastData(prev => ({ ...prev, subtituloTarja: e.target.value }))}
                      placeholder="Complemento da tarja"
                      className="w-full px-4 py-2.5 rounded-lg text-[12px] outline-none"
                      style={{ ...inputStyle, borderRadius: 8 }}
                    />
                  </div>
                </div>
                <p className="text-[11px] font-medium" style={{ color: (podcastData.tituloTarja.length + podcastData.subtituloTarja.length) > 100 ? "#dc2626" : "var(--layout-page-text, #64748b)" }}>
                  Total máximo de caracteres no título do YouTube (100): {podcastData.tituloTarja.length + podcastData.subtituloTarja.length}
                </p>

                {/* Introdução do Tema */}
                <div>
                  <label className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                    <MessageSquare size={12} style={{ color: NEXO_CYAN }} /> Introdução do Tema
                  </label>
                  <textarea
                    value={podcastData.introducao}
                    onChange={e => setPodcastData(prev => ({ ...prev, introducao: e.target.value }))}
                    placeholder="Descreva o tema principal do podcast e o contexto da conversa..."
                    className="w-full px-3 py-2.5 rounded-lg text-[12px] outline-none resize-none"
                    rows={3}
                    style={{ ...inputStyle, borderRadius: 10 }}
                  />
                </div>

                <div className="h-px" style={{ backgroundColor: `${NEXO_CYAN}18` }} />

                {/* Perguntas */}
                <div>
                  <label className="text-[11px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                    <HelpCircle size={12} style={{ color: NEXO_CYAN }} /> Perguntas
                  </label>
                  <div className="space-y-2">
                    {podcastData.perguntas.map((pergunta, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-[11px] font-bold mt-2.5 shrink-0 w-5 text-center" style={{ color: NEXO_CYAN }}>{idx + 1}.</span>
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
                          style={{ ...inputStyle, borderRadius: 8 }}
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
                    style={{ color: NEXO_CYAN, border: `1px dashed ${NEXO_CYAN}66`, backgroundColor: `${NEXO_CYAN}08` }}
                  >
                    <Plus size={12} /> Adicionar + uma pergunta
                  </button>
                </div>

                <div className="h-px" style={{ backgroundColor: `${NEXO_CYAN}18` }} />

                {/* Concluindo */}
                <div>
                  <label className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                    <Check size={12} style={{ color: NEXO_CYAN }} /> Concluindo
                  </label>
                  <textarea
                    value={podcastData.concluindo}
                    onChange={e => setPodcastData(prev => ({ ...prev, concluindo: e.target.value }))}
                    placeholder="Texto de encerramento ou considerações finais..."
                    className="w-full px-3 py-2.5 rounded-lg text-[12px] outline-none resize-none"
                    rows={3}
                    style={{ ...inputStyle, borderRadius: 10 }}
                  />
                </div>
              </div>
            </div>

            {/* ── Apoio ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${NEXO_CYAN}22`, backgroundColor: `${NEXO_CYAN}08` }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: `${NEXO_CYAN}12` }}>
                <Upload size={16} style={{ color: NEXO_CYAN }} />
                <span className="text-sm font-bold" style={{ color: NEXO_CYAN }}>Apoio</span>
              </div>
              <div className="p-4 space-y-5">
                {/* Imagens */}
                <div>
                  <label className="text-[11px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                    <ImagePlus size={12} style={{ color: NEXO_CYAN }} /> Imagens
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
                        <label className="p-1.5 rounded-full hover:opacity-70 shrink-0 cursor-pointer" style={{ color: NEXO_CYAN }} title="Upload imagem">
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
                    style={{ color: NEXO_CYAN, border: `1px dashed ${NEXO_CYAN}66` }}
                  >
                    <Plus size={12} /> Adicionar imagem
                  </button>
                </div>

                <div className="h-px" style={{ backgroundColor: `${NEXO_CYAN}18` }} />

                {/* Vídeos */}
                <div>
                  <label className="text-[11px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                    <Video size={12} style={{ color: NEXO_CYAN }} /> Vídeos
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
                        <label className="p-1.5 rounded-full hover:opacity-70 shrink-0 cursor-pointer" style={{ color: NEXO_CYAN }} title="Upload vídeo">
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
                    style={{ color: NEXO_CYAN, border: `1px dashed ${NEXO_CYAN}66` }}
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

            <div className="rounded-2xl p-5" style={{ border: `1px solid ${NEXO_CYAN}33`, backgroundColor: NEXO_CARD_BG }}>
              <label htmlFor="roteiro-campo-fixo" className="block text-xs font-bold uppercase mb-3" style={{ color: NEXO_DARK, letterSpacing: 1 }}>Campo fixo</label>
              <input id="roteiro-campo-fixo" value={campoFixo} onChange={e => setCampoFixo(e.target.value)} className="w-full h-10 px-4 text-[12px] outline-none" style={{ ...inputStyle, backgroundColor: "#FFFFFF", border: `2px solid ${NEXO_CYAN}`, color: NEXO_DARK, borderRadius: 999 }} placeholder="Primeiro texto do assunto no XML" />
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
                        <NoticiaItem key={ni} noticia={noticia} bi={bi} ni={ni} inputStyle={inputStyle} fetchingLink={fetchingLink} onUpdate={updateNoticia} onRemove={removeNoticia} onFetchLink={fetchFromLink} canRemove editedFields={editingId ? editedFields : undefined} onRegenerateWeather={addWeatherInfo} onRegenerateFinance={addFinanceInfo} addingWeather={addingWeather} addingFinance={addingFinance} isOpen={openNoticia[bi] === ni} onToggleOpen={(open) => setOpenNoticia(prev => ({ ...prev, [bi]: open ? ni : null }))} onAddToEscalada={() => addToEscalada(noticia.titulo, noticia.imagemUrl)} alreadyInEscalada={escaladaList.some(e => e.titulo === noticia.titulo && !!noticia.titulo)} onMove={moveNoticia} canMoveUp={ni > 0} canMoveDown={ni < bloco.noticias.length - 1} />
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

        <AlertDialog open={noticiaParaRemover !== null} onOpenChange={open => { if (!open) setNoticiaParaRemover(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir notícia?</AlertDialogTitle>
              <AlertDialogDescription>A notícia será removida do roteiro e do XML. Esta ação não poderá ser desfeita.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmarRemocaoNoticia}>Excluir notícia</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* Save / Schedule */}
        <div className="flex gap-3 w-full">
          <button 
            onClick={() => setShowSchedulePopup(true)} 
            disabled={saving || !programaId} 
            className="flex-1 flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 transition-transform active:scale-95" 
            style={{ ...nexoPillPrimary, padding: "14px 24px", fontSize: 13, backgroundColor: NEXO_CYAN, color: "#FFFFFF" }}
          >
            <Calendar size={16} />
            {isPodcast ? "Agendar e salvar" : "Agendar"}
          </button>

          {!isPodcast && <button 
            onClick={() => { void handleSave(); }} 
            disabled={saving || !programaId} 
            className="flex-[2] flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 transition-transform active:scale-95" 
            style={{ ...nexoPillPrimary, padding: "14px 24px", fontSize: 13 }}
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
            {saving ? "Salvando..." : "Salvar"}
          </button>}
        </div>

        <Suspense fallback={null}>
          <AgendarRoteiroPopup 
            open={showSchedulePopup} 
            onOpenChange={setShowSchedulePopup} 
            roteiroId={editingId} 
            onScheduled={fetchScheduledRoteiros}
            onSaveAndSchedule={async (data, horario) => handleSave({ data, horario })}
            title={isPodcast ? "Agendar e salvar" : "Agendar"}
            submitLabel={isPodcast ? "Salvar e agendar" : "Agendar"}
          />
        </Suspense>

      </div>

      {/* Lateral Interactive Scrollbar */}
      {renderAsModal && showModalScrollIndicator && (
        <div
          className="absolute inset-y-4 right-1.5 z-30 flex flex-col items-center justify-between pointer-events-auto select-none group/scroll"
          style={{ width: "24px" }}
        >
          {/* Botão Top Quick Scroll */}
          <button
            type="button"
            onClick={() => modalScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            className="w-5 h-5 rounded-full bg-white hover:bg-[#d0deff] text-[#0055ff] border border-[#d0deff] shadow-xs flex items-center justify-center opacity-0 group-hover/scroll:opacity-100 transition-all duration-200 cursor-pointer active:scale-90 shrink-0"
            title="Rolar para o topo"
          >
            <ChevronUp className="w-3 h-3 stroke-[2.5]" />
          </button>

          {/* Trilho Interativo com Drag Suave e Tons de Azul */}
          <div
            className="relative flex-1 w-full flex items-stretch justify-center my-1 cursor-pointer"
            onMouseDown={(e) => {
              e.preventDefault();
              setIsModalScrollDragging(true);
              const track = e.currentTarget;
              const rect = track.getBoundingClientRect();
              const scrollEl = modalScrollRef.current;
              if (!scrollEl) return;
              const thumbHeight = 44;
              const availableHeight = Math.max(rect.height - thumbHeight, 1);
              const setScrollFromY = (clientY: number) => {
                const offsetY = clientY - rect.top - (thumbHeight / 2);
                const ratio = Math.min(Math.max(offsetY / availableHeight, 0), 1);
                scrollEl.scrollTop = ratio * (scrollEl.scrollHeight - scrollEl.clientHeight);
              };
              setScrollFromY(e.clientY);
              const onMove = (ev: MouseEvent) => { ev.preventDefault(); setScrollFromY(ev.clientY); };
              const onUp = () => {
                setIsModalScrollDragging(false);
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
          >
            {/* Linha do Trilho em Azul Suave (#d0deff) que expande no hover */}
            <div className="absolute top-0 bottom-0 w-[4px] group-hover/scroll:w-[8px] rounded-full bg-[#d0deff]/50 group-hover/scroll:bg-[#d0deff]/80 transition-all duration-200" />

            {/* Cursor de Rolagem em Azul Sólido (#0055ff) sem gradiente, expande no hover */}
            <div
              className={`absolute transition-all duration-200 rounded-full bg-[#0055ff] ${
                isModalScrollDragging
                  ? "w-[14px] bg-[#0042cc] shadow-[0_0_12px_rgba(0,85,255,0.5)] ring-2 ring-[#d0deff] cursor-grabbing"
                  : "w-[6px] group-hover/scroll:w-[12px] hover:bg-[#0042cc] group-hover/scroll:shadow-[0_2px_10px_rgba(0,85,255,0.35)] cursor-grab"
              }`}
              style={{
                height: "44px",
                top: `calc(${modalScrollProgress} * (100% - 44px))`,
                left: "50%",
                transform: "translateX(-50%)",
              }}
            />
          </div>

          {/* Botão Bottom Quick Scroll */}
          <button
            type="button"
            onClick={() => {
              const el = modalScrollRef.current;
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }}
            className="w-5 h-5 rounded-full bg-white hover:bg-[#d0deff] text-[#0055ff] border border-[#d0deff] shadow-xs flex items-center justify-center opacity-0 group-hover/scroll:opacity-100 transition-all duration-200 cursor-pointer active:scale-90 shrink-0"
            title="Rolar para o final"
          >
            <ChevronDown className="w-3 h-3 stroke-[2.5]" />
          </button>
        </div>
      )}
    </div>
    )}
    </div>
  );

  if (renderAsModal) {
    return createPortal(
      <div
        onMouseDown={(e) => { if (e.target === e.currentTarget) setNovoRoteiroOpen(false); }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 60,
          background: "rgba(10, 37, 64, 0.55)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 16px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 980,
            maxHeight: "calc(100vh - 48px)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {card}
        </div>
      </div>,
      document.body
    );
  }

  return card;
}


/* Sub-component for each noticia row */
function NoticiaItem({ noticia, bi, ni, inputStyle, fetchingLink, onUpdate, onRemove, onFetchLink, canRemove, editedFields, onRegenerateWeather, onRegenerateFinance, addingWeather, addingFinance, isOpen, onToggleOpen, onAddToEscalada, alreadyInEscalada, onMove, canMoveUp, canMoveDown }: {
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
  onMove: (bi: number, ni: number, dir: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [linkInput, setLinkInput] = useState(noticia.link || "");
  const collapsed = !isOpen;
  const setCollapsed = (v: boolean) => onToggleOpen(!v);
  const isFetching = fetchingLink === `${bi}-${ni}`;

  const handlePasteLink = (url: string) => { setLinkInput(url); if (url.startsWith("http")) onFetchLink(bi, ni, url); };
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return;
    const mod = e.altKey || e.ctrlKey || e.metaKey;
    if (mod && e.key === "ArrowUp") { e.preventDefault(); if (canMoveUp) onMove(bi, ni, -1); }
    else if (mod && e.key === "ArrowDown") { e.preventDefault(); if (canMoveDown) onMove(bi, ni, 1); }
    else if ((e.key === "Delete" || (mod && e.key === "Backspace")) && canRemove) { e.preventDefault(); onRemove(bi, ni); }
    else if (e.key === "Enter" && collapsed) { e.preventDefault(); setCollapsed(false); }
    else if (e.key === "Escape" && !collapsed && noticia.titulo) { e.preventDefault(); setCollapsed(true); }
  };
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
      <div
        tabIndex={0}
        onKeyDown={handleKey}
        title="Alt+↑/↓ mover · Delete remover · Enter abrir"
        className="rounded-lg px-3 py-2 flex items-center justify-between cursor-pointer hover:opacity-90 transition-all overflow-hidden focus:outline-none focus:ring-2"
        style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 80%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 15%, transparent)" }}
        onClick={() => setCollapsed(false)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase shrink-0" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Notícia {ni + 1}</p>
          <p className="text-[12px] truncate font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{noticia.titulo}</p>
          {noticia.escalada && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "color-mix(in srgb, #268ffa 15%, transparent)", color: "#268ffa" }}>ESCALADA</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button onClick={(e) => { e.stopPropagation(); onMove(bi, ni, -1); }} disabled={!canMoveUp} className="p-0.5 rounded hover:opacity-70 disabled:opacity-20" style={{ color: NEXO_CYAN }} title="Mover para cima (Alt+↑)"><ArrowUp size={12} /></button>
          <button onClick={(e) => { e.stopPropagation(); onMove(bi, ni, 1); }} disabled={!canMoveDown} className="p-0.5 rounded hover:opacity-70 disabled:opacity-20" style={{ color: NEXO_CYAN }} title="Mover para baixo (Alt+↓)"><ArrowDown size={12} /></button>
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
          {canRemove && <button onClick={(e) => { e.stopPropagation(); onRemove(bi, ni); }} className="p-0.5 rounded hover:opacity-70" style={{ color: "#ef4444" }} title="Remover (Delete)"><Trash2 size={12} /></button>}
        </div>
      </div>
    );
  }

  return (
    <div tabIndex={0} onKeyDown={handleKey} className="rounded-lg p-2.5 space-y-2 w-full min-w-0 overflow-hidden focus:outline-none focus:ring-2" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 80%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 15%, transparent)", maxWidth: "100%", boxSizing: "border-box" }}>
      <div className="flex items-center justify-between min-w-0">
        <p className="text-[10px] font-bold uppercase" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Notícia {ni + 1}</p>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onMove(bi, ni, -1)} disabled={!canMoveUp} className="p-0.5 rounded hover:opacity-70 disabled:opacity-20" style={{ color: NEXO_CYAN }} title="Mover para cima (Alt+↑)"><ArrowUp size={12} /></button>
          <button onClick={() => onMove(bi, ni, 1)} disabled={!canMoveDown} className="p-0.5 rounded hover:opacity-70 disabled:opacity-20" style={{ color: NEXO_CYAN }} title="Mover para baixo (Alt+↓)"><ArrowDown size={12} /></button>
          {noticia.titulo && <button onClick={() => setCollapsed(true)} className="p-0.5 rounded hover:opacity-70" style={{ color: "var(--layout-icon-color, #888)" }} title="Recolher (Esc)"><ChevronUp size={12} /></button>}
          {canRemove && <button onClick={() => onRemove(bi, ni)} className="p-0.5 rounded hover:opacity-70" style={{ color: "#ef4444" }} title="Remover (Delete)"><Trash2 size={12} /></button>}
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
            style={{ ...inputStyle, width: "100%", maxWidth: "100%", boxSizing: "border-box", borderRadius: 10 }} 
          />
        </div>
        <button onClick={() => handlePasteLink(linkInput)} disabled={isFetching || !linkInput} className="btn-skyglass-accent px-3.5 py-1.5 text-[11px] disabled:opacity-30 shrink-0">
          {isFetching ? <Loader2 size={12} className="animate-spin" /> : <><Search size={11} /> Buscar</>}
        </button>
      </div>
      <div className="w-full min-w-0 max-w-full overflow-hidden">
        <div className="flex items-center gap-1 mb-1"><Type size={10} style={{ color: "var(--layout-icon-color)" }} /><span className="text-[10px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Título / Tarja</span>{editedFields?.has(`noticia-${bi}-${ni}-titulo`) && <EditedCheck />}</div>
        <input value={noticia.titulo} onChange={e => onUpdate(bi, ni, "titulo", e.target.value)} placeholder="Título da matéria" className="block w-full min-w-0 max-w-full px-3 py-1.5 rounded-lg text-[11px] outline-none font-bold" style={{ ...inputStyle, width: "100%", maxWidth: "100%", boxSizing: "border-box", fontWeight: 700 }} />
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
          style={{ ...inputStyle, borderRadius: 10, width: "100%", maxWidth: "100%", boxSizing: "border-box" }} 
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
          style={{ ...inputStyle, borderRadius: 10, width: "100%", maxWidth: "100%", boxSizing: "border-box" }} 
          rows={3} 
        />
      </div>
      <div className="w-full min-w-0 max-w-full overflow-hidden">
        <div className="flex items-center gap-1 mb-1"><Image size={10} style={{ color: "var(--layout-icon-color)" }} /><span className="text-[10px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>URL Imagem</span>{editedFields?.has(`noticia-${bi}-${ni}-imagemUrl`) && <EditedCheck />}</div>
        <input value={noticia.imagemUrl} onChange={e => onUpdate(bi, ni, "imagemUrl", e.target.value)} placeholder="https://..." className="block w-full min-w-0 max-w-full px-3 py-1.5 rounded-lg text-[11px] outline-none" style={{ ...inputStyle, width: "100%", maxWidth: "100%", boxSizing: "border-box" }} />
      </div>
      {noticia.imagemUrl && noticia.imagemUrl.startsWith("http") && <img src={noticia.imagemUrl} alt="" className="w-16 h-10 object-cover rounded" onError={e => (e.currentTarget.style.display = "none")} />}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <div onClick={() => onUpdate(bi, ni, "escalada", !noticia.escalada)} className="w-4 h-4 rounded border flex items-center justify-center transition-all cursor-pointer" style={{ borderColor: noticia.escalada ? "#268ffa" : "color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)", backgroundColor: noticia.escalada ? "#268ffa" : "transparent" }}>
          {noticia.escalada && <Check size={10} style={{ color: "var(--layout-header-text, #fff)" }} />}
        </div>
        <span className="text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Escalada</span>
      </label>
    </div>
  );
}
