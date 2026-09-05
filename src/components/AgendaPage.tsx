import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { CalendarIcon, Plus, Trash2, MapPin, Users, Instagram, Pencil, X, AlertTriangle, History, Star, Video, Bell, AlignLeft, Briefcase, Link as LinkIcon, List, Clock, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, isSameDay, addMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getZonedNow } from "@/lib/onAirResolver";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { ExpressEditData } from "@/components/ProgramaExpressInline";
const ProgramaExpressInline = lazy(() => import("@/components/ProgramaExpressInline"));
import DatasComemorativasCidades from "@/components/agenda/DatasComemorativasCidades";
import GoogleWeekGrid, { type GridEvent } from "@/components/agenda/GoogleWeekGrid";
import AgendaPageSkeleton from "@/components/skeletons/AgendaPageSkeleton";

import { uploadImageToStorage } from "@/lib/uploadImageToStorage";
import { Youtube, Image as ImageIcon, Upload, Download, Search, MessageCircle, Send, Loader2, Sparkles } from "lucide-react";
import { confirmDialog } from "@/lib/confirmDialog";

function ParticipanteSearchPicker({
  apresentadores,
  existingNames,
  onSelect,
  onAddBlank,
  onRegisterGuest,
}: {
  apresentadores: Apresentador[];
  existingNames: string[];
  onSelect: (a: Apresentador) => void;
  onAddBlank: () => void;
  onRegisterGuest: (nome: string, instagram: string, whatsapp: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [guestNome, setGuestNome] = useState("");
  const [guestInsta, setGuestInsta] = useState("");
  const [guestWhats, setGuestWhats] = useState("+55");
  const [savingGuest, setSavingGuest] = useState(false);

  const formatWhatsapp = (value: string) => {
    let digits = value.replace(/\D/g, "");
    if (!digits.startsWith("55")) digits = "55" + digits.replace(/^55*/, "");
    digits = digits.slice(0, 13);
    let formatted = "+55";
    const local = digits.slice(2);
    if (local.length > 0) formatted += " (" + local.slice(0, 2);
    if (local.length >= 2) formatted += ")";
    if (local.length > 2) formatted += " " + local.slice(2, 7);
    if (local.length > 7) formatted += "-" + local.slice(7, 11);
    return formatted;
  };
  const filtered = apresentadores
    .filter(a => !existingNames.includes(a.nome.trim().toLowerCase()))
    .filter(a => !q.trim() || a.nome.toLowerCase().includes(q.toLowerCase()) || (a.instagram || "").toLowerCase().includes(q.toLowerCase()))
    .slice(0, 50);

  const noResults = q.trim().length > 0 && filtered.length === 0;

  return (
    <div className="space-y-2 rounded-xl p-2" style={{ backgroundColor: "var(--layout-widget-bg, hsl(var(--card)))", color: "var(--layout-widget-text, hsl(var(--card-foreground)))" }}>
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-60" style={{ color: "var(--layout-icon-color, var(--layout-widget-text, hsl(var(--muted-foreground))))" }} />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar participante..."
          className="h-8 text-xs pl-7"
          style={{
            backgroundColor: "var(--layout-page-bg, hsl(var(--background)))",
            color: "var(--layout-page-text, hsl(var(--foreground)))",
            borderColor: "var(--layout-border-color, hsl(var(--border)))",
          }}
        />
      </div>
      <div className="max-h-60 overflow-y-auto space-y-0.5">
        {filtered.length === 0 ? (
          <div className="py-3 space-y-2">
            <p className="text-[10px] text-center opacity-70" style={{ color: "var(--layout-widget-text, hsl(var(--muted-foreground)))" }}>Nenhum participante encontrado</p>
            {noResults && !showRegister && (
              <Button
                type="button"
                size="sm"
                onClick={() => { setGuestNome(q); setGuestInsta(""); setShowRegister(true); }}
                className="w-full h-8 text-[10px] gap-1 rounded-full"
                style={{
                  backgroundColor: "var(--layout-accent-color, hsl(var(--primary)))",
                  color: "var(--layout-accent-text, hsl(var(--primary-foreground)))",
                }}
              >
                <Plus size={11} /> Cadastrar "{q}" como Convidado
              </Button>
            )}
            {showRegister && (
              <div
                className="space-y-2 p-2 rounded-lg"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--layout-page-bg, hsl(var(--background))) 85%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--layout-accent-color, hsl(var(--accent))) 40%, var(--layout-border-color, hsl(var(--border))) 60%)",
                }}
              >
                <p className="text-[10px] font-medium opacity-80" style={{ color: "var(--layout-widget-text, hsl(var(--foreground)))" }}>Novo Convidado</p>
                <Input
                  autoFocus
                  value={guestNome}
                  onChange={(e) => setGuestNome(e.target.value)}
                  placeholder="Nome do convidado"
                  className="h-8 text-xs"
                  style={{
                    backgroundColor: "var(--layout-page-bg, hsl(var(--background)))",
                    color: "var(--layout-page-text, hsl(var(--foreground)))",
                    borderColor: "var(--layout-border-color, hsl(var(--border)))",
                  }}
                />
                <Input
                  value={guestInsta}
                  onChange={(e) => setGuestInsta(e.target.value)}
                  placeholder="@instagram (opcional)"
                  className="h-8 text-xs"
                  style={{
                    backgroundColor: "var(--layout-page-bg, hsl(var(--background)))",
                    color: "var(--layout-page-text, hsl(var(--foreground)))",
                    borderColor: "var(--layout-border-color, hsl(var(--border)))",
                  }}
                />
                <Input
                  value={guestWhats}
                  onChange={(e) => setGuestWhats(formatWhatsapp(e.target.value))}
                  placeholder="+55 (DDD) 00000-0000"
                  className="h-8 text-xs"
                  style={{
                    backgroundColor: "var(--layout-page-bg, hsl(var(--background)))",
                    color: "var(--layout-page-text, hsl(var(--foreground)))",
                    borderColor: "var(--layout-border-color, hsl(var(--border)))",
                  }}
                />
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => { setShowRegister(false); setGuestWhats("+55"); }}
                    className="flex-1 h-9 text-xs font-semibold rounded-full border-2"
                    style={{
                      backgroundColor: "var(--layout-page-bg, hsl(var(--background)))",
                      color: "var(--layout-page-text, hsl(var(--foreground)))",
                      borderColor: "var(--layout-border-color, hsl(var(--border)))",
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button variant="save"
                    type="button"
                    size="sm"
                    disabled={!guestNome.trim() || savingGuest}
                    onClick={async () => {
                      setSavingGuest(true);
                      try {
                        await onRegisterGuest(guestNome.trim(), guestInsta.trim(), guestWhats.trim());
                        setShowRegister(false);
                        setGuestWhats("+55");
                        setQ("");
                      } finally {
                        setSavingGuest(false);
                      }
                    }}
                    className="flex-1 h-9 text-xs font-bold rounded-full shadow-md"
                    style={{
                      backgroundColor: "var(--layout-accent-color, hsl(var(--primary)))",
                      color: "var(--layout-accent-text, hsl(var(--primary-foreground)))",
                    }}
                  >
                    {savingGuest ? "Salvando..." : "Salvar Convidado"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(a)}
              className="w-full text-left px-2 py-1.5 rounded-lg text-xs flex flex-col transition-colors"
              style={{
                backgroundColor: "color-mix(in srgb, var(--layout-page-bg, hsl(var(--background))) 82%, transparent)",
                color: "var(--layout-widget-text, hsl(var(--foreground)))",
                border: "1px solid color-mix(in srgb, var(--layout-border-color, hsl(var(--border))) 45%, transparent)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--layout-accent-color, hsl(var(--accent))) 14%, var(--layout-page-bg, hsl(var(--background))) 86%)";
                e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-accent-color, hsl(var(--accent))) 55%, transparent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--layout-page-bg, hsl(var(--background))) 82%, transparent)";
                e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-border-color, hsl(var(--border))) 45%, transparent)";
              }}
            >
              <span className="font-medium">{a.nome}</span>
              {a.instagram && <span className="text-[10px] opacity-60">@{a.instagram.replace(/^@/, "")}</span>}
            </button>
          ))
        )}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onAddBlank}
        className="w-full h-8 text-[10px] gap-1 rounded-full border"
        style={{
          backgroundColor: "color-mix(in srgb, var(--layout-widget-bg, hsl(var(--card))) 75%, var(--layout-page-bg, hsl(var(--background))) 25%)",
          color: "var(--layout-widget-text, hsl(var(--foreground)))",
          borderColor: "color-mix(in srgb, var(--layout-accent-color, hsl(var(--accent))) 40%, var(--layout-border-color, hsl(var(--border))) 60%)",
        }}
      >
        <Plus size={11} /> Adicionar manualmente
      </Button>
    </div>
  );
}

interface Programa {
  id: string;
  nome: string;
  horario_inicio: string;
  horario_fim: string;
  estudio: string;
  dias_semana: string[];
  apresentador_id?: string | null;
  apresentadores_ids?: string[] | null;
}

interface Apresentador {
  id: string;
  nome: string;
  instagram?: string | null;
  cargo?: string | null;
  whatsapp?: string | null;
}

interface Participante {
  id?: string;
  nome: string;
  instagram: string;
  obrigatorio?: boolean;
}

export type ExcecaoAcao = "skip" | "substituir" | "automatico" | "manter";
export interface EventoExcecao {
  data: string; // YYYY-MM-DD
  acao: ExcecaoAcao;
  programa_id?: string | null;
}

interface Evento {
  id: string;
  programa_id: string;
  data: string;
  local: string;
  descricao: string;
  recorrencia: string;
  prioridade: string;
  status?: string;
  tipo_evento?: string;
  youtube_url?: string;
  artes_urls?: string[];
  youtube_titulo?: string;
  youtube_descricao?: string;
  edicao_notas?: string;
  edicao_concluida?: boolean;
  horario_gravacao?: string;
  horario_gravacao_fim?: string;
  periodo_inicio?: string | null;
  periodo_fim?: string | null;
  excecoes?: EventoExcecao[];
  programa?: Programa;
  participantes?: Participante[];
}

const recorrenciaLabels: Record<string, string> = {
  unico: "Somente este dia",
  semanal: "Toda semana neste dia",
  mensal: "Todo mês neste dia",
  programa_semanal: "Programa semanal",
};


const statusOptions = [
  { value: "ativo", label: "Ativo", color: "#10b981" },
  { value: "concluido", label: "Concluído", color: "#6366f1" },
  { value: "cancelado", label: "Cancelado", color: "#ef4444" },
  { value: "remarcado", label: "Mudou de data", color: "#f59e0b" },
];

// Deterministic HSL color for each studio name
const studioHue = (name?: string) => {
  if (!name) return 220;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
};
const studioColors = (name?: string) => {
  const h = studioHue(name);
  return {
    bg: `hsl(${h} 75% 96%)`,
    border: `hsl(${h} 65% 55%)`,
    text: `hsl(${h} 70% 28%)`,
  };
};
const feriadosNacionais = [
  { dia: 1, mes: 1, nome: "Confraternização Universal" },
  { dia: 21, mes: 4, nome: "Tiradentes" },
  { dia: 1, mes: 5, nome: "Dia do Trabalhador" },
  { dia: 7, mes: 9, nome: "Independência do Brasil" },
  { dia: 12, mes: 10, nome: "Nossa Senhora Aparecida" },
  { dia: 2, mes: 11, nome: "Finados" },
  { dia: 15, mes: 11, nome: "Proclamação da República" },
  { dia: 20, mes: 11, nome: "Consciência Negra" },
  { dia: 25, mes: 12, nome: "Natal" },
];

const getFeriadoNome = (date?: Date) => {
  if (!date) return null;
  const f = feriadosNacionais.find(h => h.dia === date.getDate() && h.mes === (date.getMonth() + 1));
  return f ? f.nome : null;
};

// Palette (nexo-form-design-system) — mesmo padrão do Cadastro de Ouvinte
const NEXO_CYAN = "#00BFF0";
const NEXO_LIME = "#C6F03C";
const NEXO_CARD_BG = "#D6F4FB";
const NEXO_DARK = "#0A2540";


export default function AgendaPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const { toast } = useToast();
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [filterLocal, setFilterLocal] = useState<string>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewEventDialogOpen, setViewEventDialogOpen] = useState(false);
  const [viewingEvent, setViewingEvent] = useState<Evento | null>(null);
  const [viewingOccurrenceDate, setViewingOccurrenceDate] = useState<string | null>(null);
  const [deleteChoice, setDeleteChoice] = useState<{ evt: Evento; dateStr: string } | null>(null);
  const [holidayResolve, setHolidayResolve] = useState<{ evt: Evento; dateStr: string; feriadoNome: string } | null>(null);
  const [holidayReplaceProg, setHolidayReplaceProg] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyDateFilter, setHistoryDateFilter] = useState<Date | undefined>(undefined);
  const [pastEventDetail, setPastEventDetail] = useState<Evento | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [pastMonthFilter, setPastMonthFilter] = useState<string>("todos");


  // Form
  const [formProgramaId, setFormProgramaId] = useState("");
  const [formEstudioFilter, setFormEstudioFilter] = useState<string>("todos");
  const [formData, setFormData] = useState<Date | undefined>(undefined);
  const [formLocal, setFormLocal] = useState("");
  const [formDescricao, setFormDescricao] = useState("");
  const [formRecorrencia, setFormRecorrencia] = useState<string>("unico");
  const [formTipoEvento, setFormTipoEvento] = useState<string>("live");
  const [formPrioridade, setFormPrioridade] = useState("normal");
  const [formStatus, setFormStatus] = useState<string>("ativo");
  const [formParticipantes, setFormParticipantes] = useState<Participante[]>([
    { nome: "", instagram: "" },
  ]);
  const [formYoutubeUrl, setFormYoutubeUrl] = useState("");
  const [formArtesUrls, setFormArtesUrls] = useState<string[]>([]);
  const [formYoutubeTitulo, setFormYoutubeTitulo] = useState("");
  const [formYoutubeDescricao, setFormYoutubeDescricao] = useState("");
  const [formEdicaoNotas, setFormEdicaoNotas] = useState("");
  const [formEdicaoConcluida, setFormEdicaoConcluida] = useState(false);
  const [formHorarioGravacao, setFormHorarioGravacao] = useState("");
  const [formHorarioGravacaoFim, setFormHorarioGravacaoFim] = useState("");
  const [formPeriodoInicio, setFormPeriodoInicio] = useState<string>("");
  const [formPeriodoFim, setFormPeriodoFim] = useState<string>("");
  const [periodoDialogOpen, setPeriodoDialogOpen] = useState(false);
  const [pendingRecorrencia, setPendingRecorrencia] = useState<string>("");
  const [uploadingArte, setUploadingArte] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [formTitulo, setFormTitulo] = useState("");
  const [formDiaInteiro, setFormDiaInteiro] = useState(false);
  const [formNotificacaoTempo, setFormNotificacaoTempo] = useState("30");
  const [guestPermModificar, setGuestPermModificar] = useState(false);
  const [guestPermConvidar, setGuestPermConvidar] = useState(true);
  const [guestPermVerLista, setGuestPermVerLista] = useState(true);
  const [eventModalTab, setEventModalTab] = useState<"detalhes" | "horario" | "materiais">("detalhes");
  const [showVideoInput, setShowVideoInput] = useState(false);
  const [guestSearchInput, setGuestSearchInput] = useState("");
  const [selectedEventColor, setSelectedEventColor] = useState("#0055ff");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const [eventTypesConfig, setEventTypesConfig] = useState<any>(null);

  const [loadingData, setLoadingData] = useState(true);
  const [expressOpen, setExpressOpen] = useState(false);
  const [expressEditData, setExpressEditData] = useState<ExpressEditData | null>(null);
  const [creatingRoteiro, setCreatingRoteiro] = useState(false);
  const [roteiroJaExiste, setRoteiroJaExiste] = useState(false);
  const [sendingWhatsAppFor, setSendingWhatsAppFor] = useState<string | null>(null);
  const estudios = Array.from(new Set(programas.map(p => p.estudio).filter(Boolean)));

  const fetchProgramas = useCallback(async () => {
    if (!targetUserId) return [];
    const { data } = await supabase
      .from("programas")
      .select("*")
      .eq("user_id", targetUserId)
      .order("horario_inicio");
    const progs = (data as Programa[]) || [];
    setProgramas(progs);
    return progs;
  }, [targetUserId]);

  const fetchApresentadores = useCallback(async () => {
    if (!targetUserId) return;
    const { data } = await supabase
      .from("apresentadores")
      .select("id, nome, instagram, cargo, whatsapp")
      .eq("user_id", targetUserId);
    setApresentadores((data as Apresentador[]) || []);
  }, [targetUserId]);

  const fetchEventos = useCallback(async (progsList?: Programa[]) => {
    if (!targetUserId) return;

    const dayStr = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const winStart = dayStr(-120);
    const winEnd = dayStr(365);

    const { data: evts } = await supabase
      .from("agenda_eventos")
      .select("*")
      .eq("user_id", targetUserId)
      .gte("data", winStart)
      .lte("data", winEnd)
      .order("data");

    if (!evts) {
      setEventos([]);
      return;
    }

    const currentProgs = progsList || programas;
    const progsById = new Map(currentProgs.map((p) => [p.id, p]));

    const baseEvents: Evento[] = evts.map((e: any) => ({
      ...e,
      prioridade: e.prioridade || "normal",
      programa: progsById.get(e.programa_id),
      participantes: [],
    }));
    setEventos(baseEvents);

    const eventIds = evts.map((e: any) => e.id);
    if (eventIds.length) {
      const { data: parts } = await supabase
        .from("agenda_participantes")
        .select("*")
        .in("evento_id", eventIds);

      if (parts && parts.length) {
        const partsByEvent = new Map<string, any[]>();
        for (const p of parts) {
          const arr = partsByEvent.get(p.evento_id) || [];
          arr.push(p);
          partsByEvent.set(p.evento_id, arr);
        }
        setEventos(prev => prev.map(e => ({
          ...e,
          participantes: partsByEvent.get(e.id) || e.participantes || [],
        })));
      }
    }
  }, [user, programas]);

  useEffect(() => {
    let active = true;
    const loadAll = async () => {
      if (!targetUserId) return;
      setLoadingData(true);

      const dayStr = (offset: number) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      const winStart = dayStr(-120);
      const winEnd = dayStr(365);

      try {
        // Parallel fetch: everything needed for instant first render
        const [empRes, progsRes, evtsRes, profileRes] = await Promise.all([
          supabase.from("empresa_config").select("timezone").eq("user_id", targetUserId).maybeSingle(),
          supabase.from("programas").select("*").eq("user_id", targetUserId).order("horario_inicio"),
          supabase.from("agenda_eventos").select("*").eq("user_id", targetUserId).gte("data", winStart).lte("data", winEnd).order("data"),
          supabase.from("profiles").select("event_types_config").eq("user_id", targetUserId).maybeSingle(),
        ]);

        if (!active) return;

        if (empRes?.data?.timezone && user) {
          (user as any).timezone = empRes.data.timezone;
        }
        const progs = (progsRes.data as Programa[]) || [];
        setProgramas(progs);

        if (profileRes?.data?.event_types_config) {
          setEventTypesConfig(profileRes.data.event_types_config);
        }

        const progsById = new Map(progs.map((p) => [p.id, p]));
        const evts = evtsRes.data || [];
        const baseEvents: Evento[] = evts.map((e: any) => ({
          ...e,
          prioridade: e.prioridade || "normal",
          programa: progsById.get(e.programa_id),
          participantes: [],
        }));

        // Render calendar and week grid instantly!
        setEventos(baseEvents);
        setLoadingData(false);

        // Fetch presenters in background for form pickers
        fetchApresentadores();

        // Background enrichment: participants
        const eventIds = evts.map((e: any) => e.id);
        if (eventIds.length > 0) {
          const { data: parts } = await supabase
            .from("agenda_participantes")
            .select("*")
            .in("evento_id", eventIds);

          if (!active || !parts || !parts.length) return;

          const partsByEvent = new Map<string, any[]>();
          for (const p of parts) {
            const arr = partsByEvent.get(p.evento_id) || [];
            arr.push(p);
            partsByEvent.set(p.evento_id, arr);
          }
          setEventos((prev) =>
            prev.map((e) => ({
              ...e,
              participantes: partsByEvent.get(e.id) || e.participantes || [],
            }))
          );
        }
      } catch (err) {
        console.error("Erro ao carregar dados da agenda:", err);
        setLoadingData(false);
      }
    };

    loadAll();
    return () => {
      active = false;
    };
  }, [user, fetchApresentadores]);

  // Focus event coming from dashboard agenda widget click
  useEffect(() => {
    if (loadingData || eventos.length === 0) return;
    try {
      const raw = sessionStorage.getItem("agenda_focus_event");
      if (!raw) return;
      sessionStorage.removeItem("agenda_focus_event");
      const { id, data } = JSON.parse(raw) as { id: string; data: string };
      if (data) setSelectedDate(new Date(data + "T12:00:00"));
      const evt = eventos.find(e => e.id === id);
      if (evt) startEdit(evt);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingData, eventos]);

  // Auto-open "Novo Evento" dialog when triggered from dashboard widget
  useEffect(() => {
    if (loadingData) return;
    try {
      if (sessionStorage.getItem("agenda_open_new") === "1") {
        sessionStorage.removeItem("agenda_open_new");
        openNewDialog();
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingData]);

  // Auto-include program presenters as mandatory participants for live events
  useEffect(() => {
    if (formTipoEvento !== "live" || !formProgramaId) return;
    const prog = programas.find(p => p.id === formProgramaId);
    if (!prog) return;
    const presenterIds: string[] = [
      ...(prog.apresentadores_ids || []),
      ...(prog.apresentador_id ? [prog.apresentador_id] : []),
    ];
    const uniquePresenters = apresentadores.filter(a => presenterIds.includes(a.id));
    if (!uniquePresenters.length) return;
    setFormParticipantes(prev => {
      const manual = prev.filter(p => !p.obrigatorio && p.nome.trim());
      const required = uniquePresenters.map(a => ({
        nome: a.nome,
        instagram: a.instagram || "",
        obrigatorio: true,
      }));
      // Avoid duplicates by name
      const filteredManual = manual.filter(m => !required.some(r => r.nome.toLowerCase() === m.nome.toLowerCase()));
      const merged = [...required, ...filteredManual];
      return merged.length ? merged : [{ nome: "", instagram: "" }];
    });
  }, [formProgramaId, formTipoEvento, programas, apresentadores]);

  // Sincroniza o local com o estúdio do programa selecionado
  useEffect(() => {
    if (formProgramaId) {
      const prog = programas.find(p => p.id === formProgramaId);
      if (prog?.estudio) {
        setFormLocal(prog.estudio);
      }
    }
  }, [formProgramaId, programas]);

  // Detecta se já existe roteiro para o programa+data selecionado
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!user || !formProgramaId || !formData) {
        setRoteiroJaExiste(false);
        return;
      }
      const prog = programas.find(p => p.id === formProgramaId);
      if (!prog) { setRoteiroJaExiste(false); return; }
      const dataPrograma = format(formData, "yyyy-MM-dd");
      const { data } = await supabase
        .from("roteiros")
        .select("id")
        .eq("user_id", user.id)
        .eq("programa_nome", prog.nome)
        .eq("data_programa", dataPrograma)
        .maybeSingle();
      if (!cancelled) setRoteiroJaExiste(!!data?.id);
    };
    check();
    return () => { cancelled = true; };
  }, [user, formProgramaId, formData, programas, dialogOpen]);

  const addParticipante = () => {
    setFormParticipantes([...formParticipantes, { nome: "", instagram: "" }]);
  };

  const removeParticipante = (idx: number) => {
    const p = formParticipantes[idx];
    if (p?.obrigatorio) {
      toast({ title: "Apresentador obrigatório", description: "Não é possível remover apresentadores do programa.", variant: "destructive" });
      return;
    }
    setFormParticipantes(formParticipantes.filter((_, i) => i !== idx));
  };

  const updateParticipante = (idx: number, field: keyof Participante, value: string) => {
    const updated = [...formParticipantes];
    updated[idx] = { ...updated[idx], [field]: value };
    setFormParticipantes(updated);
  };

  const handleUploadArte = async (file: File, slotIdx?: number) => {
    if (!user) return;
    setUploadingArte(true);
    try {
      const reader = new FileReader();
      const dataUrl: string = await new Promise((res, rej) => {
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const path = `agenda/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.webp`;
      const url = await uploadImageToStorage(dataUrl, "empresa-assets", path);
      setFormArtesUrls(prev => {
        if (typeof slotIdx === "number") {
          const next = [...prev];
          while (next.length <= slotIdx) next.push("");
          next[slotIdx] = url;
          return next;
        }
        return [...prev, url];
      });
    } catch (e: any) {
      toast({ title: "Erro no upload", description: e?.message, variant: "destructive" });
    } finally {
      setUploadingArte(false);
    }
  };

  const removeArte = (idx: number) => {
    setFormArtesUrls(prev => {
      const next = [...prev];
      if (idx < next.length) next[idx] = "";
      return next;
    });
  };

  const resetForm = () => {
    setFormTitulo("");
    setFormDiaInteiro(false);
    setFormProgramaId("");
    setFormEstudioFilter("todos");
    setFormData(undefined);
    setFormLocal("");
    setFormDescricao("");
    setFormRecorrencia("unico");
    setFormTipoEvento("live");
    setFormPrioridade("normal");
    setFormStatus("ativo");
    setFormParticipantes([]);
    setFormYoutubeUrl("");
    setFormArtesUrls([]);
    setFormYoutubeTitulo("");
    setFormYoutubeDescricao("");
    setFormEdicaoNotas("");
    setFormEdicaoConcluida(false);
    setFormHorarioGravacao("10:00");
    setFormHorarioGravacaoFim("11:00");
    setFormPeriodoInicio("");
    setFormPeriodoFim("");
    setEditingId(null);
    setEventModalTab("detalhes");
    setShowVideoInput(false);
    setGuestSearchInput("");
  };

  const handleRecorrenciaChange = (value: string) => {
    setFormRecorrencia(value);
    if (value !== "unico") {
      const base = formData ?? selectedDate ?? new Date();
      const start = format(base, "yyyy-MM-dd");
      // padrão: 3 meses à frente
      const end = new Date(base);
      end.setMonth(end.getMonth() + 3);
      setFormPeriodoInicio(formPeriodoInicio || start);
      setFormPeriodoFim(formPeriodoFim || format(end, "yyyy-MM-dd"));
      setPendingRecorrencia(value);
      setPeriodoDialogOpen(true);
    } else {
      setFormPeriodoInicio("");
      setFormPeriodoFim("");
    }
  };

  const openNewDialog = () => {
    resetForm();
    const baseDate = selectedDate ?? new Date();
    setFormData(baseDate);
    setFormHorarioGravacao("10:00");
    setFormHorarioGravacaoFim("11:00");
    if (programas.length > 0) {
      setFormProgramaId(programas[0].id);
    }
    setDialogOpen(true);
  };

  const startEdit = (evt: Evento) => {
    setEditingId(evt.id);
    setFormTitulo(evt.youtube_titulo || evt.programa?.nome || evt.descricao || "");
    setFormProgramaId(evt.programa_id || "");
    setFormEstudioFilter(evt.programa?.estudio || "todos");
    setFormData(new Date(evt.data + "T12:00:00"));
    setFormLocal(evt.local || "");
    setFormDescricao(evt.descricao || "");
    setFormRecorrencia(evt.recorrencia || "unico");
    setFormTipoEvento(evt.tipo_evento || "live");
    setFormPrioridade(evt.prioridade || "normal");
    setFormStatus(evt.status || "ativo");
    setFormYoutubeUrl(evt.youtube_url || "");
    setFormArtesUrls(evt.artes_urls || []);
    setFormYoutubeTitulo(evt.youtube_titulo || "");
    setFormYoutubeDescricao(evt.youtube_descricao || "");
    setFormEdicaoNotas(evt.edicao_notas || "");
    setFormEdicaoConcluida(!!evt.edicao_concluida);
    setFormHorarioGravacao(evt.horario_gravacao || "10:00");
    setFormHorarioGravacaoFim(evt.horario_gravacao_fim || "11:00");
    setFormDiaInteiro(!evt.horario_gravacao && !evt.horario_gravacao_fim);
    setFormPeriodoInicio(((evt as any).periodo_inicio as string) || "");
    setFormPeriodoFim(((evt as any).periodo_fim as string) || "");
    setFormParticipantes(
      evt.participantes && evt.participantes.length > 0
        ? evt.participantes.map(p => ({ id: p.id, nome: p.nome, instagram: p.instagram }))
        : []
    );
    setShowVideoInput(!!evt.youtube_url);
    setEventModalTab("detalhes");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const eventDate = formData ?? selectedDate ?? new Date();
    if (!user || savingEvent) return;

    const finalProgId = formProgramaId || (programas.length > 0 ? programas[0].id : null);
    const selectedProg = programas.find(p => p.id === finalProgId);
    const finalTitulo = formTitulo.trim() || (selectedProg?.nome ?? "Novo Evento");
    const finalDescricao = formDescricao.trim() || finalTitulo;

    setSavingEvent(true);
    try {
      const payload = {
        user_id: user.id,
        programa_id: finalProgId,
        data: format(eventDate, "yyyy-MM-dd"),
        local: formLocal,
        descricao: finalDescricao,
        recorrencia: formRecorrencia,
        prioridade: formPrioridade,
        status: formStatus,
        tipo_evento: formTipoEvento,
        youtube_url: formYoutubeUrl || null,
        artes_urls: formArtesUrls || [],
        youtube_titulo: finalTitulo.slice(0, 100),
        youtube_descricao: formYoutubeDescricao || finalDescricao,
        edicao_notas: formEdicaoNotas || "",
        edicao_concluida: formEdicaoConcluida,
        horario_gravacao: formDiaInteiro ? null : (formHorarioGravacao || null),
        horario_gravacao_fim: formDiaInteiro ? null : (formHorarioGravacaoFim || null),
        periodo_inicio: formRecorrencia !== "unico" ? (formPeriodoInicio || null) : null,
        periodo_fim: formRecorrencia !== "unico" ? (formPeriodoFim || null) : null,
      } as any;

      if (editingId) {
        await supabase.from("agenda_eventos").update(payload).eq("id", editingId);
        await supabase.from("agenda_participantes").delete().eq("evento_id", editingId);
        const validParts = formParticipantes.filter((p) => p.nome.trim());
        if (validParts.length) {
          await supabase.from("agenda_participantes").insert(
            validParts.map((p) => ({
              evento_id: editingId,
              user_id: user.id,
              nome: p.nome,
              instagram: p.instagram,
            }))
          );
        }
      } else {
        const { data: evt, error } = await supabase
          .from("agenda_eventos")
          .insert(payload)
          .select()
          .single();

        if (error || !evt) return;

        const validParts = formParticipantes.filter((p) => p.nome.trim());
        if (validParts.length) {
          await supabase.from("agenda_participantes").insert(
            validParts.map((p) => ({
              evento_id: evt.id,
              user_id: user.id,
              nome: p.nome,
              instagram: p.instagram,
            }))
          );
        }
      }

      resetForm();
      setDialogOpen(false);
      await fetchEventos();
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("agenda_participantes").delete().eq("evento_id", id);
    await supabase.from("agenda_eventos").delete().eq("id", id);
    fetchEventos();
  };

  // Adiciona uma exceção (skip/substituir/automatico/manter) numa ocorrência específica
  const upsertExcecao = async (evt: Evento, exc: EventoExcecao) => {
    const current: EventoExcecao[] = Array.isArray(evt.excecoes) ? [...evt.excecoes] : [];
    const idx = current.findIndex(x => x && x.data === exc.data);
    if (idx >= 0) current[idx] = exc; else current.push(exc);
    const { error } = await supabase
      .from("agenda_eventos")
      .update({ excecoes: current as any })
      .eq("id", evt.id);
    if (error) {
      toast({ title: "Erro ao salvar exceção", description: error.message, variant: "destructive" });
      return false;
    }
    await fetchEventos();
    return true;
  };

  // Solicita a exclusão — se recorrente, abre diálogo de escolha
  const requestDelete = async (evt: Evento, occurrenceDateStr?: string) => {
    const isRecorrente = evt.recorrencia && evt.recorrencia !== "unico";
    if (!isRecorrente) {
      if (await confirmDialog("Tem certeza que deseja excluir este evento?")) handleDelete(evt.id);
      return;
    }
    const dateStr = occurrenceDateStr || evt.data;
    setDeleteChoice({ evt, dateStr });
  };


  const handleCreateRoteiroFromEvento = async () => {
    if (!user || !formProgramaId || !formData) {
      toast({ title: "Selecione programa e data", variant: "destructive" });
      return;
    }
    const prog = programas.find(p => p.id === formProgramaId);
    if (!prog) return;
    setCreatingRoteiro(true);
    try {
      const tituloRoteiro = (formDescricao || prog.nome).trim().slice(0, 200);
      const dataPrograma = format(formData, "yyyy-MM-dd");

      // Try to find existing roteiro for same program+date
      const { data: existing } = await supabase
        .from("roteiros")
        .select("id")
        .eq("user_id", user.id)
        .eq("programa_nome", prog.nome)
        .eq("data_programa", dataPrograma)
        .maybeSingle();

      let roteiroId = existing?.id;

      if (!roteiroId) {
        const { data: novo, error } = await supabase
          .from("roteiros")
          .insert({
            user_id: user.id,
            titulo: tituloRoteiro,
            subtitulo: "",
            programa_nome: prog.nome,
            estudio: prog.estudio || "",
            data_programa: dataPrograma,
            horario: prog.horario_inicio || "00:00",
            tipo_programa: "podcast",
            conteudo_html: "",
            participantes: formParticipantes
              .filter(p => p.nome.trim())
              .map(p => ({ nome: p.nome, cargo: "", instagram: p.instagram || "" })) as any,
          })
          .select("id")
          .single();
        if (error || !novo) {
          toast({ title: "Erro ao criar roteiro", description: error?.message, variant: "destructive" });
          setCreatingRoteiro(false);
          return;
        }
        roteiroId = novo.id;
      }

      const isPodcastEstudio = (prog.estudio || "").toLowerCase() === "podcast";
      setExpressEditData({
        roteiroId: roteiroId!,
        estudio: prog.estudio || "",
        programaId: prog.id,
        blocos: [{ noticias: [] }],
        participantes: formParticipantes
          .filter(p => p.nome.trim())
          .map(p => ({ nome: p.nome, cargo: "", instagram: p.instagram || "" })),
        agendaEventoId: editingId || undefined,
        podcastData: isPodcastEstudio ? {
          tituloTarja: "",
          introducao: "",
          agendamentoData: dataPrograma,
          agendamentoHorario: formHorarioGravacao || "",
          perguntas: [""],
          concluindo: "",
          apoioImagens: [""],
          apoioVideos: [""],
        } : undefined,
      });
      setExpressOpen(true);
    } finally {
      setCreatingRoteiro(false);
    }
  };

  const handleExportFeriados = () => {
    if (!feriadosNacionais || feriadosNacionais.length === 0) {
      toast({ title: "Nenhum feriado para exportar", variant: "destructive" });
      return;
    }

    // Gerar conteúdo ICS
    let icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//NexoHub//Agenda//BR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ].join("\r\n");

    feriadosNacionais.forEach(f => {
      const date = f.date;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      // Data formato AAAAMMDD para evento de dia inteiro
      const dateStr = `${year}${month}${day}`;
      
      icsContent += "\r\n" + [
        "BEGIN:VEVENT",
        `UID:feriado-${dateStr}@nexohub.com`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
        `DTSTART;VALUE=DATE:${dateStr}`,
        `DTEND;VALUE=DATE:${year}${month}${String(date.getDate() + 1).padStart(2, '0')}`,
        `SUMMARY:Feriado: ${f.nome}`,
        "DESCRIPTION:Feriado Nacional Brasileiro",
        "STATUS:CONFIRMED",
        "TRANSP:TRANSPARENT",
        "END:VEVENT"
      ].join("\r\n");
    });

    icsContent += "\r\nEND:VCALENDAR";

    // Criar blob e link para download
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `feriados_nacionais_${now.getFullYear()}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({ 
      title: "Feriados exportados!", 
      description: "O arquivo .ics foi baixado. Importe-o no seu Google Calendar." 
    });
  };


  const handleClearAllPast = async () => {
    if (!user) return;
    const pastIds = pastEventos.map(e => e.id);
    if (!pastIds.length) return;
    for (const id of pastIds) {
      await supabase.from("agenda_participantes").delete().eq("evento_id", id);
    }
    await supabase.from("agenda_eventos").delete().in("id", pastIds);
    toast({ title: "Histórico limpo", description: `${pastIds.length} evento(s) removido(s).` });
    fetchEventos();
  };

  const locais = Array.from(new Set(eventos.map((e) => e.local).filter(Boolean)));

  const getExcecao = (evt: Evento, dateStr: string): EventoExcecao | undefined => {
    const list = Array.isArray(evt.excecoes) ? evt.excecoes : [];
    return list.find(x => x && x.data === dateStr);
  };

  const eventMatchesDate = (evt: Evento, dateStr: string) => {
    let matches = false;
    if (evt.data === dateStr) {
      matches = true;
    } else {
      const evtDate = new Date(evt.data + "T12:00:00");
      const checkDate = new Date(dateStr + "T12:00:00");
      if (checkDate < evtDate) return false;
      if (evt.recorrencia === "semanal" || evt.recorrencia === "programa_semanal") {
        matches = evtDate.getDay() === checkDate.getDay();
        // programa_semanal = segunda a sexta
        if (evt.recorrencia === "programa_semanal") {
          const dow = checkDate.getDay();
          matches = dow >= 1 && dow <= 5;
        }
      } else if (evt.recorrencia === "mensal") {
        matches = evtDate.getDate() === checkDate.getDate();
      }
    }
    if (!matches) return false;
    // Limita ocorrências ao período definido para eventos recorrentes
    if (evt.recorrencia !== "unico") {
      if (evt.periodo_inicio && dateStr < evt.periodo_inicio) return false;
      if (evt.periodo_fim && dateStr > evt.periodo_fim) return false;
    }
    const exc = getExcecao(evt, dateStr);
    if (exc && exc.acao === "skip") return false;
    return true;
  };

  const todayStr = useMemo(() => {
    return format(now, "yyyy-MM-dd");
  }, [now]);

  const filteredEventos = useMemo(() => {
    const selStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
    const isToday = selStr === todayStr;
    const currentTime = format(now, "HH:mm");

    return eventos.filter((e) => {
      const matchDate = selectedDate ? eventMatchesDate(e, selStr) : true;
      const matchLocal = filterLocal === "todos" || e.local === filterLocal;
      
      // Hide CANCELADO or CONCLUIDO events from agenda
      if (e.status === "cancelado" || e.status === "concluido") return false;

      // Hide events where recording has ended (only for today)
      if (isToday && e.horario_gravacao_fim && e.horario_gravacao_fim < currentTime) {
        return false;
      }

      // Base date check for unique events (historical go to history)
      const isHistorical = e.recorrencia === "unico" && e.data < todayStr;
      if (isHistorical) return false;

      const programaAtivo = !e.programa_id || programas.find(p => p.id === e.programa_id) !== undefined;

      return matchDate && matchLocal && programaAtivo;
    });
  }, [eventos, selectedDate, filterLocal, todayStr, now, programas]);

  // Past events
  const pastEventos = useMemo(() => {
    const currentTime = format(now, "HH:mm");

    const past = eventos.filter((e) => {
      // Status-based historical events
      if (e.status === "concluido" || e.status === "cancelado") return true;

      // Recording ended
      if (e.horario_gravacao_fim) {
        if (e.data < todayStr) return true;
        if (e.data === todayStr && e.horario_gravacao_fim < currentTime) return true;
      } else if (e.data < todayStr) {
        return true;
      }

      return false;
    });

    // Apply history date filter if selected
    if (historyDateFilter) {
      const filterStr = format(historyDateFilter, "yyyy-MM-dd");
      return past.filter(e => e.data === filterStr);
    }
    
    return past.sort((a, b) => b.data.localeCompare(a.data)).slice(0, 50);
  }, [eventos, historyDateFilter, now, todayStr]);

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const eventDates = useMemo(() => {
    const dates: Date[] = [];
    const startMonth = new Date(currentYear, currentMonth - 1, 1);
    const endMonth = new Date(currentYear, currentMonth + 2, 0);
    for (const evt of eventos) {
      if (evt.status === "cancelado") continue;
      if (evt.recorrencia === "unico") {
        dates.push(new Date(evt.data + "T12:00:00"));
      } else {
        const d = new Date(startMonth);
        while (d <= endMonth) {
          const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (eventMatchesDate(evt, ds)) {
            dates.push(new Date(d));
          }
          d.setDate(d.getDate() + 1);
        }
      }
    }
    return dates;
  }, [eventos, currentYear, currentMonth]);

  // Feriados nacionais obrigatórios do Brasil
  const feriadosNacionais = useMemo(() => {
    const year = currentYear;
    // Cálculo da Páscoa (algoritmo de Meeus)
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    const pascoa = new Date(year, month - 1, day);
    const carnaval = new Date(pascoa.getTime() - 47 * 86400000);
    const sextaSanta = new Date(pascoa.getTime() - 2 * 86400000);
    const corpusChristi = new Date(pascoa.getTime() + 60 * 86400000);

    const fixos = [
      { date: new Date(year, 0, 1), nome: "Confraternização Universal" },
      { date: carnaval, nome: "Carnaval" },
      { date: sextaSanta, nome: "Sexta-feira Santa" },
      { date: new Date(year, 3, 21), nome: "Tiradentes" },
      { date: new Date(year, 4, 1), nome: "Dia do Trabalho" },
      { date: corpusChristi, nome: "Corpus Christi" },
      { date: new Date(year, 8, 7), nome: "Independência do Brasil" },
      { date: new Date(year, 9, 12), nome: "N. Sra. Aparecida" },
      { date: new Date(year, 10, 2), nome: "Finados" },
      { date: new Date(year, 10, 15), nome: "Proclamação da República" },
      { date: new Date(year, 10, 20), nome: "Dia da Consciência Negra" },
      { date: new Date(year, 11, 25), nome: "Natal" },
    ];
    return fixos;
  }, [currentYear]);

  const feriadoDates = useMemo(() => feriadosNacionais.map(f => f.date), [feriadosNacionais]);

  const getFeriadoNome = useCallback((date: Date | undefined) => {
    if (!date) return null;
    const f = feriadosNacionais.find(
      h => h.date.getDate() === date.getDate() && h.date.getMonth() === date.getMonth()
    );
    return f ? f.nome : null;
  }, [feriadosNacionais]);

  const handleSelectDate = useCallback((d: Date) => {
    setSelectedDate(d);
  }, []);

  const handleEventClick = useCallback((evt: Evento, dateStr: string) => {
    setViewingEvent(evt);
    setViewingOccurrenceDate(dateStr);
    setViewEventDialogOpen(true);
  }, []);

  const selectedPrograma = programas.find((p) => p.id === formProgramaId);

  const pastMonths = useMemo(() => {
    const months = new Set<string>();
    const today = new Date(todayStr + "T00:00:00");
    for (let i = 0; i < 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.add(format(d, "MMMM", { locale: ptBR }));
    }
    return Array.from(months);
  }, [todayStr]);


  // Upcoming events for the next 7 days
  const upcomingEvents = useMemo(() => {
    const today = now;
    const days: { dateStr: string; date: Date; events: Evento[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dayEvents = eventos.filter((e) => {
        const matchLocal = filterLocal === "todos" || e.local === filterLocal;
        const isMatch = matchLocal && eventMatchesDate(e, ds);
        if (!isMatch) return false;

        // Hide CANCELADO or CONCLUIDO events
        if (e.status === "cancelado" || e.status === "concluido") return false;

        // Hide events where recording has ended (only for today)
        const isToday = ds === todayStr;
        const currentTime = format(now, "HH:mm");
        if (isToday && e.horario_gravacao_fim && e.horario_gravacao_fim < currentTime) {
          return false;
        }

        return true;
      });
      if (dayEvents.length > 0) {
        days.push({ dateStr: ds, date: new Date(d), events: dayEvents });
      }
    }
    return days;
  }, [eventos, filterLocal, now, todayStr]);

  // Conflitos com feriados nos próximos 14 dias (só programa_semanal / semanal, sem exceção definida)
  const holidayConflicts = useMemo(() => {
    const results: { evt: Evento; dateStr: string; date: Date; feriadoNome: string }[] = [];
    const today = new Date(todayStr + "T00:00:00");
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const feriadoNome = getFeriadoNome(d);
      if (!feriadoNome) continue;
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      for (const evt of eventos) {
        if (evt.recorrencia !== "programa_semanal" && evt.recorrencia !== "semanal") continue;
        if (evt.status === "cancelado" || evt.status === "concluido") continue;
        if (!eventMatchesDate(evt, ds)) continue;
        if (getExcecao(evt, ds)) continue; // já resolvido
        results.push({ evt, dateStr: ds, date: new Date(d), feriadoNome });
      }
    }
    return results;
  }, [eventos, todayStr, feriadosNacionais]);


  // Past events from the last 6 months
  const pastEvents = useMemo(() => {
    const today = new Date(todayStr + "T00:00:00");
    
    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const days: { dateStr: string; date: Date; events: Evento[] }[] = [];
    
    // We'll iterate backwards from yesterday to 6 months ago
    const tempDate = new Date(today);
    tempDate.setDate(tempDate.getDate() - 1);
    
    while (tempDate >= sixMonthsAgo) {
      const ds = format(tempDate, "yyyy-MM-dd");
      const monthStr = format(tempDate, "MMMM", { locale: ptBR });
      
      const dayEvents = eventos.filter((e) => {
        const matchLocal = filterLocal === "todos" || e.local === filterLocal;
        const matchMonth = pastMonthFilter === "todos" || monthStr.toLowerCase() === pastMonthFilter.toLowerCase();
        
        // Use eventMatchesDate to handle recurring events as well in history
        const isMatch = matchLocal && matchMonth && eventMatchesDate(e, ds);
        return isMatch;
      });
      
      if (dayEvents.length > 0) {
        days.push({ dateStr: ds, date: new Date(tempDate), events: dayEvents });
      }
      
      tempDate.setDate(tempDate.getDate() - 1);
    }
    return days;
  }, [eventos, filterLocal, pastMonthFilter, todayStr]);


  // Week view: Monday to Sunday of the currently selected week
  const weekEvents = useMemo(() => {
    const ref = selectedDate ? new Date(selectedDate) : now;
    const dow = ref.getDay(); // 0=Sun..6=Sat
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(ref);
    monday.setDate(ref.getDate() + diffToMonday + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);
    const days: { dateStr: string; date: Date; events: Evento[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dayEvents = eventos.filter((e) => {
        const matchLocal = filterLocal === "todos" || e.local === filterLocal;
        const isMatch = matchLocal && eventMatchesDate(e, ds);
        if (!isMatch) return false;

        // Hide CANCELADO or CONCLUIDO events
        if (e.status === "cancelado" || e.status === "concluido") return false;

        // Hide events where recording has ended (only for today)
        const isToday = ds === todayStr;
        const currentTime = format(now, "HH:mm");
        if (isToday && e.horario_gravacao_fim && e.horario_gravacao_fim < currentTime) {
          return false;
        }

        return true;
      });
      days.push({ dateStr: ds, date: new Date(d), events: dayEvents });
    }
    return days;
  }, [eventos, filterLocal, selectedDate, weekOffset, now]);

  // Map an Evento to a positioned block in the Google-style week grid
  const toGridEvent = useCallback((evt: Evento, dateStr: string): GridEvent | null => {
    const toMin = (hhmm?: string | null) => {
      if (!hhmm) return null;
      const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
      if (!m) return null;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };
    const isGravacao = evt.tipo_evento === "gravacao";
    let start = toMin(evt.horario_gravacao) ?? toMin(evt.programa?.horario_inicio);
    let end = toMin(evt.horario_gravacao_fim) ?? toMin(evt.programa?.horario_fim);
    if (start == null) start = 12 * 60;
    if (end == null || end <= start) end = start + 60;

    const color =
      evt.prioridade === "alta"
        ? "#EF4444"
        : isGravacao
          ? "#7C6CF0"
          : evt.tipo_evento === "externo"
            ? "#F59E0B"
            : NEXO_CYAN;

    const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
    const statusOption = statusOptions.find((s) => s.value === evt.status);

    const clean = (t?: string | null) =>
      (t || "").replace(/\s+/g, " ").trim();
    const note =
      clean(evt.youtube_titulo) ||
      clean(evt.youtube_descricao) ||
      clean(evt.descricao) ||
      "";

    return {
      key: `${evt.id}-${dateStr}`,
      title: evt.youtube_titulo || evt.programa?.nome || evt.descricao || "Evento",
      subtitle: `${fmt(start)} – ${fmt(end)}`,
      note: note ? note.slice(0, 140) : undefined,
      startMin: start,
      endMin: end,
      color,
      local: evt.local,
      recorrencia: evt.recorrencia,
      recorrenciaLabel: recorrenciaLabels[evt.recorrencia],
      status: evt.status,
      statusLabel: statusOption?.label,
      statusColor: statusOption?.color,
      participantes: evt.participantes?.map((p) => p.nome).filter(Boolean),
      tipoEvento: evt.tipo_evento,
      raw: evt,
    };
  }, []);



  const renderEventCard = (evt: Evento, inactive = false) => (
    <div
      key={evt.id}
      className={`rounded-xl p-4 space-y-2 ${inactive ? "opacity-50 grayscale" : ""}`}
      style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h5 className="font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            {evt.programa?.nome || "Programa removido"}
          </h5>
          <p className="text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
            <CalendarIcon size={12} className="inline mr-1" />
            {format(new Date(evt.data + "T12:00:00"), "dd/MM/yyyy")}
            {evt.horario_gravacao || evt.horario_gravacao_fim ? (
              ` • ${evt.tipo_evento === "gravacao" ? "🎬 Gravação" : "⏰ Agenda"}: ${evt.horario_gravacao || ""} ${evt.horario_gravacao_fim ? `- ${evt.horario_gravacao_fim}` : ""}`
            ) : (
              evt.programa && ` • ${evt.programa.horario_inicio} - ${evt.programa.horario_fim}`
            )}
          </p>
          {evt.recorrencia !== "unico" && (
            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded mt-0.5" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent)", color: "var(--layout-icon-color, #888888)" }}>
              🔁 {recorrenciaLabels[evt.recorrencia]}
            </span>
          )}
          {evt.status && evt.status !== "ativo" && (
            <span
              className="inline-block text-[10px] font-bold px-2 py-0.5 rounded mt-0.5 ml-1 uppercase"
              style={{
                backgroundColor: statusOptions.find(s => s.value === evt.status)?.color || "#888",
                color: "#fff",
              }}
            >
              {statusOptions.find(s => s.value === evt.status)?.label || evt.status}
            </span>
          )}
          {evt.local && (
            <p className="text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
              <MapPin size={12} className="inline mr-1" />
              {evt.local}
            </p>
          )}
          {evt.descricao && (
            <p className="text-sm mt-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{evt.descricao}</p>
          )}
        </div>
        {!inactive && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => startEdit(evt)}>
              <Pencil size={14} style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => requestDelete(evt, evt.data)}>
              <Trash2 size={14} className="text-destructive" />
            </Button>
          </div>
        )}
      </div>

      {evt.participantes && evt.participantes.length > 0 && (
        <div className="border-t pt-2" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
          <p className="text-xs font-medium mb-1 flex items-center gap-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
            <Users size={12} /> Participantes
          </p>
          <div className="flex flex-wrap gap-2">
            {evt.participantes.map((p, i) => (
              <span
                key={i}
                className="rounded-lg px-2 py-1 text-xs"
                style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}
              >
                {p.nome}
                {p.instagram && (
                  <span className="ml-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                    <Instagram size={10} className="inline mr-0.5" />
                    {p.instagram}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (loadingData) {
    return <AgendaPageSkeleton />;
  }

  return (
    <div className="nexo-scope space-y-4">
      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        Agenda
      </div>
      <div className="animate-fade-in">

      {/* Diálogo: Período da recorrência */}
      <Dialog open={periodoDialogOpen} onOpenChange={setPeriodoDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden" style={{ backgroundColor: "#ffffff", borderRadius: 20, border: "none" }}>
          <div className="flex flex-col">
            <div className="px-6 py-4" style={{ background: `linear-gradient(135deg, ${NEXO_CYAN} 0%, #0AA9D8 100%)`, color: "#fff" }}>
              <DialogTitle className="text-base font-bold m-0">Período da recorrência</DialogTitle>
              <p className="text-[11px] mt-1 opacity-90">
                {pendingRecorrencia === "semanal" && "Repete no mesmo dia da semana"}
                {pendingRecorrencia === "mensal" && "Repete no mesmo dia de cada mês"}
                {pendingRecorrencia === "programa_semanal" && "Repete de segunda a sexta-feira"}
              </p>
            </div>
            <div className="px-6 py-5 space-y-4" style={{ backgroundColor: NEXO_CARD_BG }}>
              <div>
                <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: NEXO_DARK }}>Data inicial</Label>
                <input
                  type="date"
                  value={formPeriodoInicio}
                  onChange={(e) => setFormPeriodoInicio(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border text-sm font-medium outline-none"
                  style={{ borderColor: `color-mix(in srgb, ${NEXO_CYAN} 40%, transparent)`, backgroundColor: "#ffffff", color: NEXO_DARK }}
                />
              </div>
              {(() => {
                const hasInvalidRange = !!formPeriodoInicio && !!formPeriodoFim && formPeriodoFim < formPeriodoInicio;
                return (
                  <div>
                    <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: NEXO_DARK }}>Data final</Label>
                    <input
                      type="date"
                      value={formPeriodoFim}
                      min={formPeriodoInicio || undefined}
                      onChange={(e) => setFormPeriodoFim(e.target.value)}
                      aria-invalid={hasInvalidRange}
                      aria-describedby={hasInvalidRange ? "periodo-fim-error" : undefined}
                      className="w-full h-10 px-3 rounded-xl border text-sm font-medium outline-none transition-colors"
                      style={{
                        borderColor: hasInvalidRange ? "#ef4444" : `color-mix(in srgb, ${NEXO_CYAN} 40%, transparent)`,
                        backgroundColor: hasInvalidRange ? "rgba(239,68,68,0.05)" : "#ffffff",
                        color: NEXO_DARK,
                        boxShadow: hasInvalidRange ? "0 0 0 3px rgba(239,68,68,0.15)" : "none",
                      }}
                    />
                    {hasInvalidRange && (
                      <p id="periodo-fim-error" role="alert" className="mt-1.5 text-[11px] font-semibold flex items-center gap-1" style={{ color: "#ef4444" }}>
                        <span aria-hidden="true">⚠</span>
                        A data final deve ser igual ou posterior à data inicial.
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setPeriodoDialogOpen(false); setFormRecorrencia("unico"); setFormPeriodoInicio(""); setFormPeriodoFim(""); }}
                  className="flex-1 h-10 rounded-xl text-xs font-bold uppercase tracking-wider"
                  style={{ backgroundColor: "#ffffff", color: NEXO_DARK, border: `1px solid color-mix(in srgb, ${NEXO_DARK} 20%, transparent)` }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!formPeriodoInicio || !formPeriodoFim || formPeriodoFim < formPeriodoInicio}
                  onClick={() => setPeriodoDialogOpen(false)}
                  className="flex-1 h-10 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${NEXO_LIME} 0%, #A8D82C 100%)`, color: NEXO_DARK }}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo: escolha ao excluir evento recorrente */}
      <Dialog open={!!deleteChoice} onOpenChange={(o) => { if (!o) setDeleteChoice(null); }}>
        <DialogContent className="max-w-md p-0 overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", borderRadius: 20, border: "none", color: "var(--layout-page-text, #1a1a1a)" }}>
          {deleteChoice && (
            <div className="flex flex-col">
              <div className="px-6 py-4" style={{ background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)", color: "#fff" }}>
                <DialogTitle className="text-base font-bold m-0">Excluir evento recorrente</DialogTitle>
                <p className="text-[11px] mt-1 opacity-90">
                  {deleteChoice.evt.programa?.nome || "Evento"} • {format(new Date(deleteChoice.dateStr + "T12:00:00"), "dd/MM/yyyy")}
                </p>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-sm" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  Este é um evento <strong>{recorrenciaLabels[deleteChoice.evt.recorrencia] || deleteChoice.evt.recorrencia}</strong>. O que deseja fazer?
                </p>
                <Button
                  className="w-full justify-start h-11 rounded-xl"
                  style={{ backgroundColor: NEXO_CYAN, color: "#fff" }}
                  onClick={async () => {
                    const ok = await upsertExcecao(deleteChoice.evt, { data: deleteChoice.dateStr, acao: "skip" });
                    if (ok) toast({ title: "Ocorrência removida", description: format(new Date(deleteChoice.dateStr + "T12:00:00"), "dd/MM/yyyy") });
                    setDeleteChoice(null);
                  }}
                >
                  Excluir somente este dia
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start h-11 rounded-xl border-destructive text-destructive hover:bg-destructive/10"
                  onClick={async () => {
                    await handleDelete(deleteChoice.evt.id);
                    toast({ title: "Recorrência excluída", description: "Todos os dias futuros foram removidos." });
                    setDeleteChoice(null);
                  }}
                >
                  Excluir todos os próximos dias
                </Button>
                <Button variant="ghost" className="w-full h-9" onClick={() => setDeleteChoice(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo: resolver feriado nacional em evento recorrente */}
      <Dialog open={!!holidayResolve} onOpenChange={(o) => { if (!o) { setHolidayResolve(null); setHolidayReplaceProg(""); } }}>
        <DialogContent className="max-w-md p-0 overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", borderRadius: 20, border: "none", color: "var(--layout-page-text, #1a1a1a)" }}>
          {holidayResolve && (
            <div className="flex flex-col">
              <div className="px-6 py-4" style={{ background: "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)", color: "#fff" }}>
                <DialogTitle className="text-base font-bold m-0 flex items-center gap-2">
                  <AlertTriangle size={18} /> Feriado nacional
                </DialogTitle>
                <p className="text-[11px] mt-1 opacity-90">
                  {holidayResolve.feriadoNome} • {format(new Date(holidayResolve.dateStr + "T12:00:00"), "EEEE, dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-sm" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  O programa <strong>{holidayResolve.evt.programa?.nome || "recorrente"}</strong> cai neste feriado. O que fazer?
                </p>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Substituir por outro programa</Label>
                  <div className="flex gap-2">
                    <Select value={holidayReplaceProg} onValueChange={setHolidayReplaceProg}>
                      <SelectTrigger className="flex-1 h-10 rounded-xl">
                        <SelectValue placeholder="Escolha um programa" />
                      </SelectTrigger>
                      <SelectContent>
                        {programas
                          .filter(p => p.id !== holidayResolve.evt.programa_id)
                          .map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.nome}{p.estudio ? ` • ${p.estudio}` : ""}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      disabled={!holidayReplaceProg}
                      style={{ backgroundColor: NEXO_CYAN, color: "#fff" }}
                      onClick={async () => {
                        const ok = await upsertExcecao(holidayResolve.evt, { data: holidayResolve.dateStr, acao: "substituir", programa_id: holidayReplaceProg });
                        if (ok) toast({ title: "Substituição salva" });
                        setHolidayResolve(null);
                        setHolidayReplaceProg("");
                      }}
                    >
                      Substituir
                    </Button>
                  </div>
                </div>

                <div className="border-t pt-3" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)" }}>
                  <Button
                    variant="outline"
                    className="w-full h-10 rounded-xl"
                    onClick={async () => {
                      const ok = await upsertExcecao(holidayResolve.evt, { data: holidayResolve.dateStr, acao: "automatico" });
                      if (ok) toast({ title: "Definido como Programa Automático" });
                      setHolidayResolve(null);
                      setHolidayReplaceProg("");
                    }}
                  >
                    Colocar como programa automático
                  </Button>
                </div>

                <Button variant="ghost" className="w-full h-9" onClick={() => { setHolidayResolve(null); setHolidayReplaceProg(""); }}>
                  Decidir depois
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


      
      <Dialog open={viewEventDialogOpen} onOpenChange={setViewEventDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", borderRadius: "20px", border: "none", color: "var(--layout-page-text, #1a1a1a)" }}>
          {viewingEvent && (
            <div className="flex flex-col">
              <div className="px-6 py-5" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a) 0%, color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%) 100%)", color: "var(--layout-header-text, #ffffff)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                    <CalendarIcon size={20} />
                  </div>
                  <div>
                    <DialogTitle className="text-base font-bold m-0" style={{ color: "var(--layout-header-text, #ffffff)" }}>{viewingEvent.programa?.nome || "Evento"}</DialogTitle>
                    <p className="text-[10px] mt-0.5 opacity-70">Informações detalhadas do evento</p>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto agenda-dialog-scroll">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Data</p>
                    <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                      <CalendarIcon size={12} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
                      {format(new Date(viewingEvent.data + "T12:00:00"), "dd/MM/yyyy")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Horário</p>
                    <div className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                      {viewingEvent.tipo_evento === "gravacao" ? (
                        <>
                          <Star size={12} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
                          🎬 {viewingEvent.horario_gravacao || ""} {viewingEvent.horario_gravacao_fim ? `- ${viewingEvent.horario_gravacao_fim}` : ""} (Gravação)
                        </>
                      ) : (
                        <>
                          <CalendarIcon size={12} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
                          {viewingEvent.programa ? `${viewingEvent.programa.horario_inicio} - ${viewingEvent.programa.horario_fim}` : "N/A"}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {viewingEvent.local && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Local</p>
                    <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                      <MapPin size={12} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
                      {viewingEvent.local}
                    </p>
                  </div>
                )}

                {viewingEvent.descricao && (
                  <div className="space-y-1 p-3 rounded-xl" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Descrição</p>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{viewingEvent.descricao}</p>
                  </div>
                )}

                {viewingEvent.participantes && viewingEvent.participantes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                      <Users size={12} /> Participantes ({viewingEvent.participantes.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {viewingEvent.participantes.map((p, i) => (
                        <div
                          key={i}
                          className="rounded-lg px-2.5 py-1.5 text-xs flex items-center gap-2"
                          style={{ 
                            backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)", 
                            border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)",
                            color: "var(--layout-page-text, #1a1a1a)"
                          }}
                        >
                          <span className="font-semibold">{p.nome}</span>
                          {p.instagram && (
                            <span className="flex items-center gap-0.5 opacity-60 text-[10px]">
                              <Instagram size={10} />
                              @{p.instagram.replace('@', '')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {viewingEvent.artes_urls && viewingEvent.artes_urls.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                      <ImageIcon size={12} /> Artes do Evento ({viewingEvent.artes_urls.length})
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {viewingEvent.artes_urls.map((url, i) => (
                        <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-black/10">
                          <img src={url} alt={`Arte ${i + 1}`} className="w-full h-full object-cover" />
                          <a 
                            href={url} 
                            download 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                          >
                            <Download size={16} />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button 
                    className="flex-1 h-9 text-xs font-bold rounded-xl shadow-lg transition-transform active:scale-95"
                    style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "#ffffff" }}
                    onClick={() => { setViewEventDialogOpen(false); startEdit(viewingEvent); }}
                  >
                    <Pencil size={14} className="mr-1.5" /> Editar Evento
                  </Button>
                  <Button 
                    variant="outline"
                    className="h-9 w-9 p-0 rounded-xl border-destructive text-destructive hover:bg-destructive/10"
                    onClick={() => { 
                      setViewEventDialogOpen(false); 
                      requestDelete(viewingEvent, viewingOccurrenceDate || viewingEvent.data);
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="max-w-[1400px] mx-auto w-full space-y-6 pt-2 pb-12 font-sans animate-fade-in">
        {/* Header Section (Card Branco Moderno) */}
        <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-black to-slate-800 text-white flex items-center justify-center shadow-md shrink-0">
              <CalendarIcon className="w-6 h-6 text-[#00BFF0]" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-black tracking-wider text-[#002132] uppercase leading-tight">
                Agenda de Eventos
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Gerencie programas e participantes da emissora
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {locais.length > 0 && (
              <Select value={filterLocal} onValueChange={setFilterLocal}>
                <SelectTrigger className="w-[180px] h-10 text-xs bg-[#f8fafc] border border-slate-200 text-slate-700 rounded-full font-semibold">
                  <MapPin size={12} className="mr-1 text-slate-400" />
                  <SelectValue placeholder="Filtrar por local" />
                </SelectTrigger>
                <SelectContent className="bg-white rounded-2xl border border-slate-100 shadow-xl">
                  <SelectItem value="todos">Todos os locais</SelectItem>
                  {locais.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <button
              type="button"
              onClick={openNewDialog}
              className="h-10 px-6 rounded-full bg-[#0055ff] hover:bg-[#0047e1] text-white text-xs font-bold transition-all shadow-sm flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <Plus size={14} /> Novo Evento
            </button>
          </div>
        </section>

        {/* Banner de conflitos com feriados nacionais */}
        {holidayConflicts.length > 0 && (
          <div className="mb-4 space-y-2">
            {holidayConflicts.map(({ evt, dateStr, date, feriadoNome }) => (
              <div
                key={`${evt.id}-${dateStr}`}
                className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                style={{ background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)", border: "1px solid #f59e0b" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <AlertTriangle size={18} style={{ color: "#b45309", flexShrink: 0 }} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold" style={{ color: "#78350f" }}>
                      Feriado nacional: {feriadoNome} • {format(date, "EEE, dd/MM", { locale: ptBR })}
                    </p>
                    <p className="text-[11px]" style={{ color: "#92400e" }}>
                      O programa <strong>{evt.programa?.nome || "recorrente"}</strong> cai neste dia. Escolha o que fazer.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="h-8 rounded-full text-xs font-bold shrink-0"
                  style={{ backgroundColor: "#b45309", color: "#fff" }}
                  onClick={() => { setHolidayResolve({ evt, dateStr, feriadoNome }); setHolidayReplaceProg(""); }}
                >
                  Resolver
                </Button>
              </div>
            ))}
          </div>
        )}



        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
          <DialogContent
            className="max-w-5xl w-full p-0 flex flex-col bg-white border border-slate-200/90 rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.22)] overflow-hidden font-sans max-h-[92vh]"
          >
            {/* Top Bar: Close (X), Title input, Salvar Button */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4 bg-white shrink-0">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
                  title="Fechar formulário"
                >
                  <X size={20} />
                </button>
                <div className="flex-1 min-w-0 pr-4">
                  <input
                    type="text"
                    value={formTitulo}
                    onChange={(e) => setFormTitulo(e.target.value)}
                    placeholder="Adicionar título"
                    autoFocus
                    className="w-full text-2xl lg:text-3xl font-semibold text-[#002132] placeholder:text-slate-300 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-[#0055ff] outline-none transition-all py-1"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={savingEvent}
                className="h-10 px-8 rounded-full text-sm font-bold bg-[#0055ff] hover:bg-[#0047e1] text-white transition-all shadow-sm flex items-center gap-2 active:scale-95 shrink-0 disabled:opacity-60 cursor-pointer"
              >
                {savingEvent ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <span>Salvar</span>
                )}
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {/* Date & Time Row (Chips / Pills) */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Start Date Popover Chip */}
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="h-9 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <CalendarIcon size={14} className="text-slate-500" />
                        <span>
                          {format(formData ?? selectedDate ?? new Date(), "dd 'de' MMM. 'de' yyyy", { locale: ptBR })}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-2xl border border-slate-100 shadow-2xl bg-white z-[120]" align="start">
                      <Calendar
                        mode="single"
                        selected={formData ?? selectedDate ?? new Date()}
                        onSelect={(d) => { if (d) { setFormData(d); setDatePickerOpen(false); } }}
                        locale={ptBR}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>

                  {/* Start Time Chip */}
                  {!formDiaInteiro && (
                    <>
                      <input
                        type="time"
                        value={formHorarioGravacao}
                        onChange={(e) => setFormHorarioGravacao(e.target.value)}
                        className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#0055ff]/20 transition-colors"
                      />

                      <span className="text-xs font-medium text-slate-400">até</span>

                      {/* End Time Chip */}
                      <input
                        type="time"
                        value={formHorarioGravacaoFim}
                        onChange={(e) => setFormHorarioGravacaoFim(e.target.value)}
                        className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#0055ff]/20 transition-colors"
                      />
                    </>
                  )}

                  <span className="text-xs font-medium text-[#0055ff] ml-1">
                    Fuso horário (GMT-03:00)
                  </span>
                </div>

                {/* Second subrow: Dia inteiro + Recorrência */}
                <div className="flex items-center gap-5 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={formDiaInteiro}
                      onChange={(e) => setFormDiaInteiro(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#0055ff] focus:ring-[#0055ff] cursor-pointer"
                    />
                    <span>Dia inteiro</span>
                  </label>

                  <Select value={formRecorrencia} onValueChange={handleRecorrenciaChange}>
                    <SelectTrigger className="h-8 w-auto min-w-[150px] text-xs font-semibold bg-slate-100 hover:bg-slate-200 border-none rounded-full px-3.5 text-slate-700 shadow-none gap-2">
                      <SelectValue placeholder="Recorrência" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border border-slate-100 shadow-xl bg-white">
                      <SelectItem value="unico">Não se repete</SelectItem>
                      <SelectItem value="semanal">Semanalmente</SelectItem>
                      <SelectItem value="mensal">Mensalmente</SelectItem>
                      <SelectItem value="programa_semanal">Segunda a sexta</SelectItem>
                    </SelectContent>
                  </Select>

                  {formRecorrencia !== "unico" && (formPeriodoInicio || formPeriodoFim) && (
                    <button
                      type="button"
                      onClick={() => { setPendingRecorrencia(formRecorrencia); setPeriodoDialogOpen(true); }}
                      className="text-[11px] font-semibold text-[#0055ff] hover:underline cursor-pointer"
                    >
                      Período: {formPeriodoInicio ? format(new Date(formPeriodoInicio + "T12:00:00"), "dd/MM/yy") : "?"} → {formPeriodoFim ? format(new Date(formPeriodoFim + "T12:00:00"), "dd/MM/yy") : "?"}
                    </button>
                  )}
                </div>
              </div>

              {/* Tabs Bar (Detalhes do evento | Encontrar um horário | Materiais & Artes) */}
              <div className="flex items-center gap-6 border-b border-slate-200 text-xs font-bold pt-2">
                <button
                  type="button"
                  onClick={() => setEventModalTab("detalhes")}
                  className={`pb-2.5 transition-colors relative cursor-pointer ${
                    eventModalTab === "detalhes" ? "text-[#0055ff]" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Detalhes do evento
                  {eventModalTab === "detalhes" && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0055ff] rounded-full" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setEventModalTab("horario")}
                  className={`pb-2.5 transition-colors relative cursor-pointer ${
                    eventModalTab === "horario" ? "text-[#0055ff]" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Encontrar um horário
                  {eventModalTab === "horario" && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0055ff] rounded-full" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setEventModalTab("materiais")}
                  className={`pb-2.5 transition-colors relative flex items-center gap-1.5 cursor-pointer ${
                    eventModalTab === "materiais" ? "text-[#0055ff]" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span>Materiais & Artes</span>
                  {formArtesUrls.filter(Boolean).length > 0 && (
                    <span className="w-4 h-4 rounded-full bg-blue-100 text-[#0055ff] text-[9px] font-bold flex items-center justify-center">
                      {formArtesUrls.filter(Boolean).length}
                    </span>
                  )}
                  {eventModalTab === "materiais" && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0055ff] rounded-full" />
                  )}
                </button>
              </div>

              {/* Tab 1: Detalhes do Evento (Google 2-column layout) */}
              {eventModalTab === "detalhes" && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_330px] gap-8 items-start">
                  {/* Left Column: Event details */}
                  <div className="space-y-4">
                    {/* Row 1: Meet / Video Conferência */}
                    <div className="flex items-start gap-3.5">
                      <div className="pt-2 text-slate-400 shrink-0">
                        <Video size={18} />
                      </div>
                      <div className="flex-1">
                        {!showVideoInput && !formYoutubeUrl ? (
                          <button
                            type="button"
                            onClick={() => setShowVideoInput(true)}
                            className="h-9 px-4 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#0055ff] text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <Plus size={13} /> Adicionar videoconferência ou transmissão ao vivo
                          </button>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="relative">
                              <Input
                                value={formYoutubeUrl}
                                onChange={(e) => setFormYoutubeUrl(e.target.value)}
                                placeholder="Link da transmissão (YouTube Live, Google Meet, URL)..."
                                className="h-9 text-xs bg-slate-50 border-slate-200 rounded-xl pr-8"
                              />
                              {formYoutubeUrl && (
                                <button
                                  type="button"
                                  onClick={() => setFormYoutubeUrl("")}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Local */}
                    <div className="flex items-center gap-3.5">
                      <div className="text-slate-400 shrink-0">
                        <MapPin size={18} />
                      </div>
                      <div className="flex-1">
                        <Input
                          value={formLocal}
                          onChange={(e) => setFormLocal(e.target.value)}
                          placeholder="Adicionar local (ex: Estúdio A, Externa, Auditório...)"
                          className="h-9 text-xs bg-slate-50 border-slate-200 rounded-xl"
                        />
                      </div>
                    </div>

                    {/* Row 3: Notificação */}
                    <div className="flex items-center gap-3.5">
                      <div className="text-slate-400 shrink-0">
                        <Bell size={18} />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-slate-700 font-medium">Notificação</span>
                        <input
                          type="number"
                          value={formNotificacaoTempo}
                          onChange={(e) => setFormNotificacaoTempo(e.target.value)}
                          className="w-14 h-8 text-center text-xs font-semibold bg-slate-100 border border-slate-200 rounded-lg outline-none focus:border-[#0055ff]"
                        />
                        <span className="text-xs text-slate-600">minutos antes</span>
                      </div>
                    </div>

                    {/* Row 4: Agenda / Programa + Dot Color */}
                    <div className="flex items-center gap-3.5">
                      <div className="text-slate-400 shrink-0">
                        <CalendarIcon size={18} />
                      </div>
                      <div className="flex items-center gap-3 flex-1 flex-wrap">
                        <Select
                          value={formProgramaId}
                          onValueChange={(val) => {
                            setFormProgramaId(val);
                            const prog = programas.find(p => p.id === val);
                            if (prog && !formTitulo.trim()) {
                              setFormTitulo(prog.nome);
                            }
                          }}
                        >
                          <SelectTrigger className="h-9 text-xs font-semibold bg-slate-50 border-slate-200 rounded-xl min-w-[200px]">
                            <SelectValue placeholder="Selecione a Agenda / Programa" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border border-slate-100 shadow-xl bg-white">
                            {programas.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.nome} {p.estudio ? `(${p.estudio})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Color Picker Dot */}
                        <div className="flex items-center gap-1.5">
                          {[
                            { color: "#0055ff", label: "Azul" },
                            { color: "#ef4444", label: "Vermelho" },
                            { color: "#10b981", label: "Verde" },
                            { color: "#8b5cf6", label: "Roxo" },
                            { color: "#f59e0b", label: "Amarelo" },
                            { color: "#00BFF0", label: "Ciano" },
                          ].map((c) => (
                            <button
                              key={c.color}
                              type="button"
                              onClick={() => setSelectedEventColor(c.color)}
                              className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                                selectedEventColor === c.color ? "scale-125 ring-2 ring-offset-2 ring-slate-400" : "opacity-80 hover:opacity-100"
                              }`}
                              style={{ backgroundColor: c.color }}
                              title={c.label}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Row 5: Visibilidade / Tipo do Evento (Ao Vivo / Gravação) + Status */}
                    <div className="flex items-center gap-3.5">
                      <div className="text-slate-400 shrink-0">
                        <Briefcase size={18} />
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center rounded-xl bg-slate-100 p-0.5 border border-slate-200">
                          <button
                            type="button"
                            onClick={() => setFormTipoEvento("live")}
                            className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                              formTipoEvento === "live" ? "bg-white text-rose-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full bg-rose-500" />
                            AO VIVO
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormTipoEvento("gravacao")}
                            className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                              formTipoEvento === "gravacao" ? "bg-white text-purple-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full bg-purple-500" />
                            GRAVAÇÃO
                          </button>
                        </div>

                        <Select value={formStatus} onValueChange={setFormStatus}>
                          <SelectTrigger className="h-8 text-xs font-semibold bg-slate-50 border-slate-200 rounded-xl w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border border-slate-100 shadow-xl bg-white">
                            <SelectItem value="ativo">Ativo</SelectItem>
                            <SelectItem value="concluido">Concluído</SelectItem>
                            <SelectItem value="cancelado">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Row 6: Descrição com Toolbar */}
                    <div className="flex items-start gap-3.5 pt-1">
                      <div className="pt-2 text-slate-400 shrink-0">
                        <AlignLeft size={18} />
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 focus-within:bg-white focus-within:border-[#0055ff] transition-all">
                          {/* Mini Formatting Toolbar */}
                          <div className="px-3 py-1.5 border-b border-slate-200/80 bg-slate-100/70 flex items-center gap-1 text-slate-600">
                            <button
                              type="button"
                              onClick={() => setFormDescricao(prev => prev + "**negrito** ")}
                              className="w-7 h-7 rounded hover:bg-slate-200 flex items-center justify-center font-black text-xs cursor-pointer"
                              title="Negrito"
                            >
                              B
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormDescricao(prev => prev + "*itálico* ")}
                              className="w-7 h-7 rounded hover:bg-slate-200 flex items-center justify-center italic font-serif text-xs cursor-pointer"
                              title="Itálico"
                            >
                              I
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormDescricao(prev => prev + "__sublinhado__ ")}
                              className="w-7 h-7 rounded hover:bg-slate-200 flex items-center justify-center underline text-xs font-semibold cursor-pointer"
                              title="Sublinhado"
                            >
                              U
                            </button>
                            <span className="w-px h-4 bg-slate-300 mx-1" />
                            <button
                              type="button"
                              onClick={() => setFormDescricao(prev => prev + "\n• ")}
                              className="w-7 h-7 rounded hover:bg-slate-200 flex items-center justify-center text-xs cursor-pointer"
                              title="Lista com marcadores"
                            >
                              <List size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormDescricao(prev => prev + " [link](https://...) ")}
                              className="w-7 h-7 rounded hover:bg-slate-200 flex items-center justify-center text-xs cursor-pointer"
                              title="Inserir link"
                            >
                              <LinkIcon size={14} />
                            </button>
                          </div>

                          <Textarea
                            value={formDescricao}
                            onChange={(e) => setFormDescricao(e.target.value)}
                            placeholder="Adicionar uma descrição, pauta ou observações do evento..."
                            rows={4}
                            className="w-full text-xs p-3 bg-transparent border-0 shadow-none focus-visible:ring-0 resize-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Convidados (Google Calendar Style) */}
                  <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-5 space-y-4">
                    <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-[#002132]">Convidados</span>
                      <span className="text-[11px] font-semibold text-slate-400">
                        {formParticipantes.filter(p => p.nome.trim()).length} adicionados
                      </span>
                    </div>

                    {/* Guest search/add input */}
                    <div className="relative">
                      <Input
                        value={guestSearchInput}
                        onChange={(e) => setGuestSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && guestSearchInput.trim()) {
                            e.preventDefault();
                            setFormParticipantes(prev => [...prev.filter(p => p.nome.trim()), { nome: guestSearchInput.trim(), instagram: "" }]);
                            setGuestSearchInput("");
                          }
                        }}
                        placeholder="Adicionar convidados..."
                        className="h-9 text-xs bg-white border-slate-200 rounded-xl"
                      />

                      {/* Dropdown suggestions from apresentadores */}
                      {guestSearchInput.trim() && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto p-1 space-y-0.5">
                          {apresentadores
                            .filter(a => a.nome.toLowerCase().includes(guestSearchInput.toLowerCase()))
                            .map(a => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => {
                                  setFormParticipantes(prev => [...prev.filter(p => p.nome.trim()), { nome: a.nome, instagram: a.instagram || "" }]);
                                  setGuestSearchInput("");
                                }}
                                className="w-full text-left px-3 py-1.5 rounded-lg text-xs hover:bg-slate-100 flex items-center justify-between cursor-pointer"
                              >
                                <span className="font-semibold text-slate-800">{a.nome}</span>
                                {a.instagram && <span className="text-[10px] text-slate-400">@{a.instagram}</span>}
                              </button>
                            ))}
                          <button
                            type="button"
                            onClick={() => {
                              setFormParticipantes(prev => [...prev.filter(p => p.nome.trim()), { nome: guestSearchInput.trim(), instagram: "" }]);
                              setGuestSearchInput("");
                            }}
                            className="w-full text-left px-3 py-1.5 rounded-lg text-xs hover:bg-blue-50 text-[#0055ff] font-bold cursor-pointer"
                          >
                            + Convidar "{guestSearchInput.trim()}"
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Guest Chips List */}
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                      {formParticipantes.filter(p => p.nome.trim()).length === 0 ? (
                        <p className="text-[11px] text-slate-400 py-2 text-center">Nenhum convidado adicionado ainda.</p>
                      ) : (
                        formParticipantes.filter(p => p.nome.trim()).map((part, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-full bg-slate-800 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                                {part.nome.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate">{part.nome}</p>
                                {part.instagram && <p className="text-[9px] text-slate-400 truncate">@{part.instagram}</p>}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setFormParticipantes(prev => prev.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Guest Permissions */}
                    <div className="pt-2 border-t border-slate-200 space-y-2">
                      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Permissões de convidados</p>
                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={guestPermModificar}
                          onChange={(e) => setGuestPermModificar(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-[#0055ff] focus:ring-[#0055ff]"
                        />
                        <span>Modificar evento</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={guestPermConvidar}
                          onChange={(e) => setGuestPermConvidar(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-[#0055ff] focus:ring-[#0055ff]"
                        />
                        <span>Convidar outras pessoas</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={guestPermVerLista}
                          onChange={(e) => setGuestPermVerLista(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-[#0055ff] focus:ring-[#0055ff]"
                        />
                        <span>Ver lista de convidados</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Encontrar um horário */}
              {eventModalTab === "horario" && (
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-[#002132]">Programação para {format(formData ?? selectedDate ?? new Date(), "dd 'de' MMMM", { locale: ptBR })}</h4>
                      <p className="text-xs text-slate-500">Confira a disponibilidade dos horários e estúdios para este dia</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto">
                    {programas.map((prog) => (
                      <div key={prog.id} className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-800">{prog.nome}</p>
                          <p className="text-[10px] text-slate-400">{prog.estudio || "Estúdio Geral"}</p>
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                          {prog.horario_inicio} - {prog.horario_fim}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 3: Materiais & Artes */}
              {eventModalTab === "materiais" && (
                <div className="space-y-6">
                  {/* Upload Artes Slots */}
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[#002132]">Artes do Evento (Thumbnails & Redes)</h4>
                        <p className="text-[11px] text-slate-500">Envie imagens nos formatos recomendados para divulgação</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "16:9 YouTube / TV", slotIdx: 0 },
                        { label: "1:1 Feed Instagram", slotIdx: 1 },
                        { label: "9:16 Stories / Reels", slotIdx: 2 },
                        { label: "Banner Geral", slotIdx: 3 },
                      ].map(({ label, slotIdx }) => {
                        const url = formArtesUrls[slotIdx];
                        return (
                          <div key={slotIdx} className="space-y-1.5 text-center">
                            {url ? (
                              <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-200 group bg-slate-100">
                                <img src={url} alt={label} className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => removeArte(slotIdx)}
                                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ) : (
                              <label className="aspect-video rounded-xl border-2 border-dashed border-slate-300 hover:border-[#0055ff] bg-white flex flex-col items-center justify-center cursor-pointer p-2 hover:bg-blue-50/50 transition-all">
                                <Upload size={16} className="text-slate-400 mb-1" />
                                <span className="text-[10px] font-bold text-slate-600">Upload</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleUploadArte(file, slotIdx);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            )}
                            <span className="text-[10px] font-semibold text-slate-500 block">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Anotações da Edição */}
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#002132]">Anotações para a Produção / Edição</h4>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-600">
                        <input
                          type="checkbox"
                          checked={formEdicaoConcluida}
                          onChange={(e) => setFormEdicaoConcluida(e.target.checked)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>Edição Concluída</span>
                      </label>
                    </div>
                    <Textarea
                      value={formEdicaoNotas}
                      onChange={(e) => setFormEdicaoNotas(e.target.value)}
                      placeholder="Instruções para o editor, cortes, pauta ou observações internas..."
                      rows={3}
                      className="bg-white border-slate-200 rounded-xl text-xs"
                    />
                  </div>

                  {/* Criar Roteiro Express (apenas se tiver programa selecionado) */}
                  {formProgramaId && (
                    <button
                      type="button"
                      onClick={handleCreateRoteiroFromEvento}
                      disabled={creatingRoteiro}
                      className="w-full h-10 text-xs font-semibold rounded-2xl transition-all border border-blue-200 text-[#0055ff] bg-blue-50/50 hover:bg-blue-50 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {creatingRoteiro ? "Criando…" : (roteiroJaExiste ? "📝 Abrir/editar roteiro já existente" : "📝 Deseja criar/agendar o roteiro desse programa?")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={expressOpen} onOpenChange={(o) => { setExpressOpen(o); if (!o) setExpressEditData(null); }}>
          <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0">
            <DialogHeader className="px-6 pt-5 pb-3 border-b" style={{ borderColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
              <DialogTitle className="text-base font-bold">📝 Roteiro do Programa</DialogTitle>
            </DialogHeader>
            <div className="p-4">
              <Suspense fallback={
                <div className="p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#00BFF0" }} />
                  <span className="text-xs font-semibold">Carregando editor de roteiro...</span>
                </div>
              }>
                <ProgramaExpressInline
                  programas={programas.map(p => ({ id: p.id, nome: p.nome, estudio: p.estudio, tipo_programa: (p as any).tipo_programa }))}
                  estudios={estudios}
                  onFinish={() => { setExpressOpen(false); setExpressEditData(null); }}
                  editData={expressEditData}
                />
              </Suspense>
            </div>
          </DialogContent>
        </Dialog>

        {/* Calendar + Events Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-5 items-stretch">
          <div className="w-full">
            <div className="w-full space-y-5">
              {/* Calendar */}
              <div className="overflow-hidden w-full bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-white flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-[#002132]">Calendário</span>
                </div>

                <div className="p-4">
                  <style>{`
                    .agenda-calendar .rdp-day:hover { background-color: #f1f5f9 !important; color: #0055ff !important; }
                    .agenda-calendar .rdp-day_selected { background-color: #0055ff !important; color: #fff !important; font-weight: 700 !important; }
                    .agenda-calendar .rdp-day_selected:hover { background-color: #0047e1 !important; color: #fff !important; }
                    .agenda-calendar .rdp-day_today,
                    .agenda-calendar .rdp-day_today.rdp-day_selected,
                    .agenda-calendar [class*="day_today"] {
                      border: 1.5px solid #0055ff !important;
                      color: #0055ff !important;
                      font-weight: 800 !important;
                      background-color: transparent !important;
                      box-shadow: none !important;
                    }
                    .agenda-calendar .rdp-day_today.rdp-day_selected {
                      background-color: #0055ff !important;
                      color: #fff !important;
                    }
                    .agenda-calendar .has-event-day { position: relative; font-weight: 700; }
                    .agenda-calendar .has-event-day::after {
                      content: '';
                      position: absolute;
                      bottom: 3px;
                      left: 50%;
                      transform: translateX(-50%);
                      width: 4px;
                      height: 4px;
                      border-radius: 50%;
                      background-color: #0055ff;
                    }
                    .agenda-calendar .is-feriado-day { position: relative; }
                    .agenda-calendar .is-feriado-day::after {
                      content: '';
                      position: absolute;
                      top: 3px;
                      right: 3px;
                      width: 4px;
                      height: 4px;
                      border-radius: 50%;
                      background-color: #ef4444;
                    }
                  `}</style>
                  <TooltipProvider>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      className={cn("p-0 pointer-events-auto agenda-calendar")}
                      locale={ptBR}
                      modifiers={{ hasEvent: eventDates, isFeriado: feriadoDates, isToday: (d: Date) => isSameDay(d, new Date()) }}
                      modifiersClassNames={{ hasEvent: "has-event-day", isFeriado: "is-feriado-day", isToday: "agenda-today-highlight" }}
                      classNames={{
                        caption_label: "text-[15px] font-bold text-slate-800",
                        nav_button: "h-8 w-8 rounded-full bg-transparent p-0 opacity-60 hover:opacity-100 hover:bg-slate-100 border-0 flex items-center justify-center transition-colors",
                        head_cell: "text-slate-400 rounded-md w-10 font-bold text-[0.75rem] uppercase",
                        row: "flex w-full mt-2.5",
                        cell: "h-10 w-10 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                        day: "h-10 w-10 rounded-full p-0 font-medium text-sm hover:bg-slate-100 hover:text-slate-900 transition-colors",
                      }}
                      components={{
                        DayContent: ({ date, ...props }) => {
                          const feriado = getFeriadoNome(date);
                          const content = <span>{date.getDate()}</span>;
                          
                          if (feriado) {
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help w-full h-full flex items-center justify-center">{content}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-white border-none z-[100] bg-rose-600 rounded-xl">
                                  <p className="text-[10px] font-bold">{feriado}</p>
                                  <p className="text-[9px] opacity-90">{format(date, "dd/MM")}</p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          }
                          return content;
                        }
                      }}
                    />
                  </TooltipProvider>
                  {getFeriadoNome(selectedDate) && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="px-3 pt-2 text-[10px] font-semibold flex items-center gap-1.5 cursor-help text-rose-600">
                            <span className="w-2 h-2 rounded-full inline-block bg-rose-600" />
                            {getFeriadoNome(selectedDate)}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-white border-none bg-rose-600 rounded-xl">
                          <p className="text-[10px] font-bold">{getFeriadoNome(selectedDate)}</p>
                          <p className="text-[9px] opacity-90">{selectedDate ? format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ""}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>

              {/* Upcoming 7 days */}
              <div className="overflow-hidden bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-white flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-[#002132]">Próximos 7 dias</span>
                </div>

                <div className="p-4 space-y-3 max-h-[320px] overflow-y-auto">
                  {upcomingEvents.length === 0 ? (
                    <p className="text-xs py-4 text-center text-slate-400">
                      Nenhum evento nos próximos dias.
                    </p>
                  ) : (
                    upcomingEvents.map(({ dateStr, date, events: dayEvents }) => (
                      <div key={dateStr}>
                        <button
                          type="button"
                          onClick={() => setSelectedDate(date)}
                          className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 w-full hover:opacity-80 transition-opacity cursor-pointer text-slate-500"
                        >
                          <CalendarIcon size={10} />
                          {format(date, "EEEE, dd/MM", { locale: ptBR })}
                          <span className="ml-auto text-[9px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-[#0055ff]">
                            {dayEvents.length}
                          </span>
                        </button>
                        <div className="space-y-1.5">
                          {dayEvents.map((evt) => (
                            <div
                              key={evt.id}
                              className="rounded-2xl px-3.5 py-2.5 cursor-pointer hover:shadow-sm transition-all bg-[#f8fafc] hover:bg-[#f1f5f9] border border-slate-100"
                              onClick={() => {
                                setViewingEvent(evt);
                                setViewingOccurrenceDate(dateStr);
                                setViewEventDialogOpen(true);
                              }}
                            >
                              <p className="text-xs font-bold truncate text-slate-800">
                                {evt.programa?.nome || "Programa removido"}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {evt.programa ? (
                                  evt.tipo_evento === "gravacao" && evt.horario_gravacao
                                    ? `🎬 ${evt.horario_gravacao} (gravação)`
                                    : `${evt.programa.horario_inicio} - ${evt.programa.horario_fim}`
                                ) : ""}
                                {evt.local ? ` • ${evt.local}` : ""}
                              </p>
                              {evt.recorrencia !== "unico" && (
                                <span className="inline-block text-[9px] font-semibold px-2 py-0.5 rounded-full mt-1 bg-blue-50 text-[#0055ff]">
                                  🔁 {recorrenciaLabels[evt.recorrencia]}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            {/* Datas Comemorativas + Aniversários de Cidades */}
            <DatasComemorativasCidades feriados={feriadosNacionais} />

            {/* Past Events */}
            <div className="overflow-hidden bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
              <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-100 bg-white">
                <div className="flex items-center gap-2 min-w-0">
                  <History size={13} className="text-slate-500" />
                  <span className="text-xs font-black uppercase tracking-wider text-[#002132] truncate">Eventos Passados</span>
                </div>
                <Select value={pastMonthFilter} onValueChange={setPastMonthFilter}>
                  <SelectTrigger className="h-7 w-[120px] text-[10px] bg-slate-50 border-slate-200 text-slate-700 rounded-full font-medium">
                    <SelectValue placeholder="Filtrar por mês" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border border-slate-100 shadow-lg">
                    <SelectItem value="todos">Todos os meses</SelectItem>
                    {pastMonths.map(month => (
                      <SelectItem key={month} value={month.toLowerCase()}>
                        {month.charAt(0).toUpperCase() + month.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-4 space-y-3 max-h-[320px] overflow-y-auto">
                {pastEvents.length === 0 ? (
                  <p className="text-xs py-4 text-center text-slate-400">
                    Nenhum evento passado encontrado para o filtro selecionado.
                  </p>
                ) : (
                  pastEvents.map(({ dateStr, date, events: dayEvents }) => (
                    <div key={dateStr}>
                      <button
                        type="button"
                        onClick={() => setSelectedDate(date)}
                        className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 w-full hover:opacity-80 transition-opacity cursor-pointer text-slate-400"
                      >
                        <CalendarIcon size={10} />
                        {format(date, "EEEE, dd/MM", { locale: ptBR })}
                        <span className="ml-auto text-[9px] font-normal px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {dayEvents.length}
                        </span>
                      </button>
                      <div className="space-y-1.5">
                        {dayEvents.map((evt) => (
                          <div
                            key={evt.id}
                            className="rounded-2xl px-3.5 py-2.5 cursor-pointer hover:shadow-sm transition-all opacity-75 bg-[#f8fafc] hover:bg-[#f1f5f9] border border-slate-100"
                            onClick={() => {
                              setViewingEvent(evt);
                              setViewingOccurrenceDate(dateStr);
                              setViewEventDialogOpen(true);
                            }}
                          >
                            <p className="text-xs font-bold truncate text-slate-700">
                              {evt.programa?.nome || "Programa removido"}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {evt.programa ? (
                                evt.tipo_evento === "gravacao" && evt.horario_gravacao
                                  ? `🎬 ${evt.horario_gravacao} (gravação)`
                                  : `${evt.programa.horario_inicio} - ${evt.programa.horario_fim}`
                              ) : ""}
                              {evt.local ? ` • ${evt.local}` : ""}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {evt.status === "concluido" && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                  CONCLUÍDO
                                </span>
                              )}
                              {evt.status === "cancelado" && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">
                                  CANCELADO
                                </span>
                              )}
                              {evt.recorrencia !== "unico" && (
                                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                  🔁 {recorrenciaLabels[evt.recorrencia]}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          </div>

          {/* Events + Upcoming */}
          <div className="h-full flex flex-col space-y-4">
            {/* Week schedule (Mon-Sun) - Injected here */}
            <div className="overflow-hidden h-full flex flex-col bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
              {/* Google Agenda style toolbar */}
              <div className="flex items-center gap-2 flex-wrap px-5 py-3.5 border-b border-slate-100 bg-white font-sans">
                <button
                  type="button"
                  onClick={() => { setWeekOffset(0); setSelectedDate(new Date()); }}
                  className="px-4 h-8 rounded-full text-xs font-bold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => setWeekOffset((w) => w - 1)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-700 transition-colors text-base"
                  aria-label="Semana anterior"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setWeekOffset((w) => w + 1)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-700 transition-colors text-base"
                  aria-label="Próxima semana"
                >
                  ›
                </button>
                <span className="text-sm font-bold text-[#002132] capitalize ml-1">
                  {weekEvents.length > 0
                    ? format(weekEvents[0].date, "MMMM 'de' yyyy", { locale: ptBR })
                    : ""}
                </span>
                <span className="text-[11px] font-medium text-slate-400 ml-1">
                  {weekEvents.length > 0 && `${format(weekEvents[0].date, "dd/MM")} – ${format(weekEvents[6].date, "dd/MM")}`}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <span
                    className="px-3.5 h-7 inline-flex items-center rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-700"
                  >
                    Semana
                  </span>
                  <button
                    type="button"
                    onClick={handleExportFeriados}
                    className="px-3.5 h-7 rounded-full text-[10px] font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
                    title="Exportar feriados para o Google Calendar"
                  >
                    <Download size={11} /> Exportar
                  </button>
                </div>
              </div>

              <GoogleWeekGrid<Evento>
                weekDays={weekEvents}
                now={now}
                selectedDate={selectedDate}
                getFeriadoNome={getFeriadoNome}
                onSelectDate={handleSelectDate}
                onEventClick={handleEventClick}
                toGridEvent={toGridEvent}
              />
            </div>



          </div>

        </div>

        <div className="mt-5 text-[10px] text-center opacity-50">
          * Use o calendário e a programação acima para navegar entre as datas.
        </div>
      </div>
      </div>
    </div>
  );
}
