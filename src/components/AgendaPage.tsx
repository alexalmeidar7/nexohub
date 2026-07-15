import { useState, useEffect, useCallback, useMemo } from "react";
import { CalendarIcon, Plus, Trash2, MapPin, Users, Instagram, Pencil, X, AlertTriangle, History, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import ProgramaExpressInline, { type ExpressEditData } from "@/components/ProgramaExpressInline";
import DatasComemorativasCidades from "@/components/agenda/DatasComemorativasCidades";

import { uploadImageToStorage } from "@/lib/uploadImageToStorage";
import { Youtube, Image as ImageIcon, Upload, Download, Search, MessageCircle, Send, Loader2, Sparkles } from "lucide-react";

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


export default function AgendaPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30000);
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
  const [uploadingArte, setUploadingArte] = useState(false);
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
    if (!user) return;
    const { data } = await supabase
      .from("programas")
      .select("*")
      .eq("user_id", user.id)
      .order("horario_inicio");
    setProgramas((data as Programa[]) || []);
  }, [user]);

  const fetchApresentadores = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("apresentadores")
      .select("id, nome, instagram, cargo, whatsapp")
      .eq("user_id", user.id);
    setApresentadores((data as Apresentador[]) || []);
  }, [user]);

  const fetchEventos = useCallback(async () => {
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("event_types_config")
      .eq("user_id", user.id)
      .single();
    
    if (profile?.event_types_config) {
      setEventTypesConfig(profile.event_types_config);
    }

    const { data: evts } = await supabase
      .from("agenda_eventos")
      .select("*")
      .eq("user_id", user.id)
      .order("data");

    if (!evts) { setEventos([]); return; }

    const eventIds = evts.map((e: any) => e.id);
    const programaIds = evts.map((e: any) => e.programa_id).filter(Boolean);

    const [{ data: parts }, { data: progs }] = await Promise.all([
      eventIds.length
        ? supabase.from("agenda_participantes").select("*").in("evento_id", eventIds)
        : Promise.resolve({ data: [] }),
      programaIds.length
        ? supabase.from("programas").select("*").in("id", programaIds)
        : Promise.resolve({ data: [] }),
    ]);

    const enriched: Evento[] = evts.map((e: any) => ({
      ...e,
      prioridade: e.prioridade || "normal",
      programa: (progs || []).find((p: any) => p.id === e.programa_id),
      participantes: (parts || []).filter((p: any) => p.evento_id === e.id),
    }));

    setEventos(enriched);
  }, [user]);


  useEffect(() => {
    const loadAll = async () => {
      setLoadingData(true);
      await Promise.all([fetchProgramas(), fetchEventos(), fetchApresentadores()]);
      setLoadingData(false);
    };
    loadAll();
  }, [fetchProgramas, fetchEventos, fetchApresentadores]);

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
    setFormProgramaId("");
    setFormEstudioFilter("todos");
    setFormData(undefined);
    setFormLocal("");
    setFormDescricao("");
    setFormRecorrencia("unico");
    setFormTipoEvento("live");
    setFormPrioridade("normal");
    setFormStatus("ativo");
    setFormParticipantes([{ nome: "", instagram: "" }]);
    setFormYoutubeUrl("");
    setFormArtesUrls([]);
    setFormYoutubeTitulo("");
    setFormYoutubeDescricao("");
    setFormEdicaoNotas("");
    setFormEdicaoConcluida(false);
    setFormHorarioGravacao("");
    setFormHorarioGravacaoFim("");
    setEditingId(null);
  };

  const openNewDialog = () => {
    resetForm();
    // Pré-preenche a data com o dia selecionado no calendário (ou hoje),
    // para que o botão "Salvar Evento" não fique desabilitado quando o
    // usuário escolhe uma recorrência (semanal/mensal) sem clicar de novo no calendário.
    setFormData(selectedDate ?? new Date());
    setDialogOpen(true);
  };

  const startEdit = (evt: Evento) => {
    setEditingId(evt.id);
    setFormProgramaId(evt.programa_id);
    setFormEstudioFilter(evt.programa?.estudio || "todos");
    setFormData(new Date(evt.data + "T12:00:00"));
    setFormLocal(evt.local);
    setFormDescricao(evt.descricao);
    setFormRecorrencia(evt.recorrencia);
    setFormTipoEvento(evt.tipo_evento || "live");
    setFormPrioridade(evt.prioridade || "normal");
    setFormStatus(evt.status || "ativo");
    setFormYoutubeUrl(evt.youtube_url || "");
    setFormArtesUrls(evt.artes_urls || []);
    setFormYoutubeTitulo(evt.youtube_titulo || "");
    setFormYoutubeDescricao(evt.youtube_descricao || "");
    setFormEdicaoNotas(evt.edicao_notas || "");
    setFormEdicaoConcluida(!!evt.edicao_concluida);
    setFormHorarioGravacao(evt.horario_gravacao || "");
    setFormHorarioGravacaoFim(evt.horario_gravacao_fim || "");
    setFormParticipantes(
      evt.participantes && evt.participantes.length > 0
        ? evt.participantes.map(p => ({ id: p.id, nome: p.nome, instagram: p.instagram }))
        : [{ nome: "", instagram: "" }]
    );
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user || !formProgramaId || !formData) return;

    const payload = {
      user_id: user.id,
      programa_id: formProgramaId,
      data: format(formData, "yyyy-MM-dd"),
      local: formLocal,
      descricao: formDescricao,
      recorrencia: formRecorrencia,
      prioridade: formPrioridade,
      status: formStatus,
      tipo_evento: formTipoEvento,
      youtube_url: formTipoEvento === "live" ? formYoutubeUrl : "",
      artes_urls: formTipoEvento === "live" ? formArtesUrls : [],
      youtube_titulo: formTipoEvento === "live" ? formYoutubeTitulo.slice(0, 100) : "",
      youtube_descricao: formTipoEvento === "live" ? formYoutubeDescricao : "",
      edicao_notas: formTipoEvento === "live" ? formEdicaoNotas : "",
      edicao_concluida: formTipoEvento === "live" ? formEdicaoConcluida : false,
      horario_gravacao: formTipoEvento === "gravacao" ? formHorarioGravacao : null,
      horario_gravacao_fim: formTipoEvento === "gravacao" ? formHorarioGravacaoFim : null,
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
    fetchEventos();
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
  const requestDelete = (evt: Evento, occurrenceDateStr?: string) => {
    const isRecorrente = evt.recorrencia && evt.recorrencia !== "unico";
    if (!isRecorrente) {
      if (confirm("Tem certeza que deseja excluir este evento?")) handleDelete(evt.id);
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

  const getEventDatesForCalendar = () => {
    const dates: Date[] = [];
    const startMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);
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
  };
  const eventDates = getEventDatesForCalendar();

  // Feriados nacionais obrigatórios do Brasil
  const feriadosNacionais = useMemo(() => {
    const year = now.getFullYear();
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
  }, [now]);

  const feriadoDates = useMemo(() => feriadosNacionais.map(f => f.date), [feriadosNacionais]);

  const getFeriadoNome = (date: Date | undefined) => {
    if (!date) return null;
    const f = feriadosNacionais.find(
      h => h.date.getDate() === date.getDate() && h.date.getMonth() === date.getMonth()
    );
    return f ? f.nome : null;
  };

  const selectedPrograma = programas.find((p) => p.id === formProgramaId);

  const pastMonths = useMemo(() => {
    const months = new Set<string>();
    const today = new Date(now);
    for (let i = 0; i < 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.add(format(d, "MMMM", { locale: ptBR }));
    }
    return Array.from(months);
  }, [now]);


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
  }, [eventos, filterLocal, now]);

  // Conflitos com feriados nos próximos 14 dias (só programa_semanal / semanal, sem exceção definida)
  const holidayConflicts = useMemo(() => {
    const results: { evt: Evento; dateStr: string; date: Date; feriadoNome: string }[] = [];
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
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
  }, [eventos, now]);


  // Past events from the last 6 months
  const pastEvents = useMemo(() => {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
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
  }, [eventos, filterLocal, pastMonthFilter, now]);


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
            {evt.tipo_evento === "gravacao" && (evt.horario_gravacao || evt.horario_gravacao_fim) ? (
              ` • 🎬 Gravação: ${evt.horario_gravacao || ""} ${evt.horario_gravacao_fim ? `- ${evt.horario_gravacao_fim}` : ""}`
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
    return (
      <div className="animate-pulse">
        <div className="rounded-2xl" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 12%, var(--layout-page-bg, #ffffff) 88%)", boxShadow: "0 8px 32px rgba(0,0,0,0.10)", padding: "20px" }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
              <CalendarIcon size={20} style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
            </div>
            <div>
              <div className="h-5 w-40 rounded bg-[var(--layout-header-bg)]/10 mb-1" />
              <div className="h-3 w-56 rounded bg-[var(--layout-header-bg)]/5" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
            <div className="rounded-xl p-4" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
              <div className="h-4 w-24 mx-auto rounded bg-[var(--layout-header-bg)]/10 mb-3" />
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={`h-${i}`} className="h-3 w-full rounded bg-[var(--layout-header-bg)]/8" />
                ))}
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded bg-[var(--layout-header-bg)]/5" />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl p-4" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-4 w-32 rounded bg-[var(--layout-header-bg)]/10" />
                    <div className="h-3 w-20 rounded-full bg-[var(--layout-header-bg)]/5" />
                  </div>
                  <div className="h-3 w-48 rounded bg-[var(--layout-header-bg)]/5" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">

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

      <div style={{ background: NEXO_CARD_BG, borderRadius: 28, padding: "28px 32px 32px", boxShadow: "0 2px 12px rgba(10, 37, 64, 0.05)", fontFamily: "'Montserrat', sans-serif" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div style={{ width: 40, height: 40, borderRadius: 999, background: NEXO_CYAN, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CalendarIcon size={20} style={{ color: "#FFFFFF" }} />
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, color: NEXO_DARK, textTransform: "uppercase", margin: 0 }}>Agenda de Eventos</h3>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "#64748B", margin: "4px 0 0" }}>Gerencie programas e participantes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {locais.length > 0 && (
              <Select value={filterLocal} onValueChange={setFilterLocal}>
                <SelectTrigger className="w-[180px] h-10 text-xs" style={{ background: "#FFFFFF", color: NEXO_DARK, borderRadius: 999, border: `2px solid ${NEXO_CYAN}`, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", paddingLeft: 16 }}>
                  <MapPin size={12} className="mr-1" style={{ color: NEXO_CYAN }} />
                  <SelectValue placeholder="Filtrar por local" />
                </SelectTrigger>
                <SelectContent style={{ backgroundColor: "#FFFFFF", color: NEXO_DARK, borderRadius: 16, border: `2px solid ${NEXO_CYAN}` }}>
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
              style={{ height: 40, padding: "0 22px", borderRadius: 999, background: NEXO_LIME, border: "none", color: NEXO_DARK, fontWeight: 800, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", boxShadow: "0 4px 14px rgba(198, 240, 60, 0.35)", fontFamily: "'Montserrat', sans-serif" }}
            >
              <Plus size={14} /> Novo Evento
            </button>
          </div>
        </div>

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
            className="max-w-md p-0 flex flex-col"
            style={{
              // Escopo local da paleta Nexo Form (padrão do sistema)
              ["--layout-page-bg" as any]: "#D6F4FB",
              ["--layout-page-text" as any]: "#0A2540",
              ["--layout-accent-color" as any]: "#00BFF0",
              ["--layout-header-bg" as any]: "#00BFF0",
              ["--layout-header-text" as any]: "#ffffff",
              ["--layout-icon-color" as any]: "#0A2540",
              backgroundColor: "#D6F4FB",
              borderRadius: "24px",
              border: "none",
              boxShadow: "0 24px 80px rgba(10,37,64,0.25)",
              fontFamily: "Montserrat, sans-serif",
              overflow: "hidden",
            }}
          >
            <style>{`
              .agenda-form-input:focus, .agenda-form-input:focus-visible, .agenda-form-input:active {
                outline: none !important;
                box-shadow: 0 0 0 2px color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent) !important;
                border-color: var(--layout-accent-color, #2563eb) !important;
              }
              .agenda-form-calendar .rdp { color: var(--layout-page-text, #1a1a1a) !important; }
              .agenda-form-calendar .rdp-caption_label { color: var(--layout-page-text, #1a1a1a) !important; font-weight: 700; }
              .agenda-form-calendar .rdp-head_cell { color: color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent) !important; }
              .agenda-form-calendar .rdp-day { color: var(--layout-page-text, #1a1a1a) !important; }
              .agenda-form-calendar .rdp-day:hover { background-color: color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent) !important; color: var(--layout-accent-color, #2563eb) !important; }
              .agenda-form-calendar .rdp-day_selected { background-color: var(--layout-accent-color, #2563eb) !important; color: #fff !important; }
              .agenda-form-calendar .rdp-day_selected:hover { background-color: #1a7ae0 !important; color: #fff !important; }
              .agenda-form-calendar .rdp-day_today { background-color: var(--layout-page-text, #1a1a1a) !important; color: #fff !important; font-weight: 700; }
              .agenda-form-calendar .rdp-day_outside { color: color-mix(in srgb, var(--layout-page-text, #1a1a1a) 25%, transparent) !important; }
              .agenda-form-calendar .rdp-nav_button { color: var(--layout-page-text, #1a1a1a) !important; }
              .agenda-form-calendar .rdp-nav_button:hover { background-color: color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent) !important; }
              .agenda-form-calendar button[name="previous-month"],
              .agenda-form-calendar button[name="next-month"] { color: var(--layout-page-text, #1a1a1a) !important; }
            `}</style>

            {/* Header */}
            <div className="px-6 pt-5 pb-4" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a) 0%, color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%) 100%)", borderRadius: "20px 20px 0 0", color: "var(--layout-header-text, #ffffff)" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                  <CalendarIcon size={20} />
                </div>
                <div>
                  <DialogTitle className="text-sm font-bold m-0">{editingId ? "Editar Evento" : "Novo Evento"}</DialogTitle>
                  <p className="text-[10px] mt-0.5" style={{ opacity: 0.6 }}>Preencha os dados abaixo</p>
                </div>
              </div>
            </div>

            {/* Form body */}
            <div className="agenda-dialog-scroll px-6 pb-6 pt-4 space-y-5 overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--layout-scrollbar-color, #555555) transparent" }}>
              <style>{`
                .agenda-dialog-scroll::-webkit-scrollbar { width: 6px; }
                .agenda-dialog-scroll::-webkit-scrollbar-track { background: transparent; margin: 8px 0; }
                .agenda-dialog-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg, var(--layout-accent-color, #2563eb), color-mix(in srgb, var(--layout-accent-color, #2563eb) 70%, white 30%)); border-radius: 10px; }
                .agenda-dialog-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, color-mix(in srgb, var(--layout-accent-color, #2563eb) 80%, black 20%), var(--layout-accent-color, #2563eb)); }
              `}</style>

              {/* Estudio + Programa (side by side) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Estúdio</Label>
                  <Select value={formEstudioFilter} onValueChange={(v) => { setFormEstudioFilter(v); setFormProgramaId(""); }}>
                    <SelectTrigger className="agenda-form-input h-10" style={{ borderColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)", borderRadius: "12px", backgroundColor: "#f8faff", color: "var(--layout-page-text, #1a1a1a)" }}>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os estúdios</SelectItem>
                      {estudios.map((e) => (
                        <SelectItem key={e} value={e}>{e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Programa</Label>
                  <Select value={formProgramaId} onValueChange={setFormProgramaId}>
                    <SelectTrigger className="agenda-form-input h-10" style={{ borderColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)", borderRadius: "12px", backgroundColor: "#f8faff", color: "var(--layout-page-text, #1a1a1a)" }}>
                      <SelectValue placeholder="Selecione o programa" />
                    </SelectTrigger>
                    <SelectContent>
                      {programas
                        .filter((p) => formEstudioFilter === "todos" || p.estudio === formEstudioFilter)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome} ({p.horario_inicio} - {p.horario_fim})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {selectedPrograma && (
                <p className="text-[10px] -mt-3 px-1" style={{ color: "var(--layout-icon-color, #888888)" }}>
                  ⏰ {selectedPrograma.horario_inicio} às {selectedPrograma.horario_fim}
                  {selectedPrograma.estudio && ` • ${selectedPrograma.estudio}`}
                </p>
              )}

              {/* Calendário */}
              <div>
                <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Data do Evento</Label>
                <div className="agenda-form-calendar rounded-xl overflow-hidden" style={{ border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent)", backgroundColor: "#f8faff" }}>
                  <Calendar
                    mode="single"
                    selected={formData}
                    onSelect={setFormData}
                    className={cn("p-3 pointer-events-auto")}
                    style={{ backgroundColor: "transparent" }}
                    locale={ptBR}
                  />
                </div>
                {formData && (
                  <p className="text-[10px] mt-1.5 px-1 font-medium capitalize" style={{ color: "var(--layout-icon-color, #888888)" }}>
                    📅 {format(formData, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </p>
                )}
              </div>

              {/* Recorrência + Tipo + Local (side by side) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Recorrência</Label>
                  <Select value={formRecorrencia} onValueChange={setFormRecorrencia}>
                    <SelectTrigger className="agenda-form-input h-10" style={{ borderColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)", borderRadius: "12px", backgroundColor: "#f8faff", color: "var(--layout-page-text, #1a1a1a)" }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unico">Somente este dia</SelectItem>
                      <SelectItem value="semanal">Toda semana</SelectItem>
                      <SelectItem value="mensal">Todo mês</SelectItem>
                      <SelectItem value="programa_semanal">Programa semanal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Tipo</Label>
                  <Select value={formTipoEvento} onValueChange={setFormTipoEvento}>
                    <SelectTrigger className="agenda-form-input h-10" style={{ borderColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)", borderRadius: "12px", backgroundColor: "#f8faff", color: "var(--layout-page-text, #1a1a1a)" }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="live">🔴 Ao vivo</SelectItem>
                      <SelectItem value="gravacao">🎬 Gravação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Horário da Gravação (apenas quando tipo = gravação) */}
              {formTipoEvento === "gravacao" && (
                <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)" }}>
                  <Label className="text-[11px] font-bold uppercase tracking-wider block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>🎬 Horário da Gravação</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[9px] font-medium opacity-60 mb-1 block">Início</Label>
                      <input
                        type="time"
                        value={formHorarioGravacao}
                        onChange={(e) => setFormHorarioGravacao(e.target.value)}
                        className="agenda-form-input h-10 w-full px-3 text-sm"
                        style={{ borderColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)", borderRadius: "12px", backgroundColor: "#f8faff", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)" }}
                      />
                    </div>
                    <div>
                      <Label className="text-[9px] font-medium opacity-60 mb-1 block">Fim</Label>
                      <input
                        type="time"
                        value={formHorarioGravacaoFim}
                        onChange={(e) => setFormHorarioGravacaoFim(e.target.value)}
                        className="agenda-form-input h-10 w-full px-3 text-sm"
                        style={{ borderColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)", borderRadius: "12px", backgroundColor: "#f8faff", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)" }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-5">
                {/* Status do Evento */}
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Status do Evento</Label>
                  <div className="flex flex-wrap gap-2">
                    {statusOptions.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setFormStatus(s.value)}
                        className="flex-1 min-w-[80px] py-2 rounded-lg text-[10px] font-bold transition-all"
                        style={{
                          backgroundColor: formStatus === s.value ? s.color : "rgba(13,4,70,0.04)",
                          color: formStatus === s.value ? "#fff" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)",
                          border: `1.5px solid ${formStatus === s.value ? s.color : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)"}`,
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Descrição */}
              <div>
                <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Descrição</Label>
                <textarea
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  placeholder="Breve descrição do evento..."
                  rows={3}
                  className="agenda-form-input w-full resize-none text-xs px-3 py-2.5"
                  style={{ borderColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)", borderRadius: "12px", backgroundColor: "#f8faff", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)" }}
                />
              </div>

              {/* Live event extras: YouTube, Participants, Artwork uploads */}
              {formTipoEvento === "live" && (
                <div className="space-y-4 rounded-xl p-4" style={{ backgroundColor: "color-mix(in srgb, #ef4444 4%, transparent)", border: "1px solid color-mix(in srgb, #ef4444 20%, transparent)" }}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block animate-pulse" />
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#ef4444" }}>Configurações do Evento Ao Vivo</span>
                  </div>

                  {/* YouTube link */}
                  <div>
                    <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                      <Youtube size={12} /> Link do YouTube
                    </Label>
                    <Input
                      value={formYoutubeUrl}
                      onChange={(e) => setFormYoutubeUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="agenda-form-input h-10 text-xs"
                      style={{ borderColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)", borderRadius: "12px", backgroundColor: "#f8faff", color: "var(--layout-page-text, #1a1a1a)" }}
                    />
                  </div>

                  {/* Participantes */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                        <Users size={12} /> Participantes
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 text-[10px] gap-1 px-3 font-semibold"
                            style={{ backgroundColor: "#ef4444", color: "#ffffff", borderRadius: "8px" }}
                          >
                            <Plus size={12} /> Adicionar
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-72 p-2 border z-[60]"
                          align="end"
                          style={{
                            background: "var(--layout-widget-bg, hsl(var(--card)))",
                            color: "var(--layout-widget-text, hsl(var(--card-foreground)))",
                            borderColor: "var(--layout-border-color, hsl(var(--border)))",
                          }}
                        >
                          <ParticipanteSearchPicker
                            apresentadores={apresentadores}
                            existingNames={formParticipantes.map(p => p.nome.trim().toLowerCase()).filter(Boolean)}
                            onSelect={(a) => {
                              setFormParticipantes(prev => {
                                const empty = prev.findIndex(p => !p.nome.trim() && !p.obrigatorio);
                                const newItem = { nome: a.nome, instagram: a.instagram || "" };
                                if (empty >= 0) {
                                  const next = [...prev];
                                  next[empty] = newItem;
                                  return next;
                                }
                                return [...prev, newItem];
                              });
                            }}
                            onAddBlank={addParticipante}
                            onRegisterGuest={async (nome, instagram, whatsapp) => {
                              if (!user) return;
                              const cleanInsta = instagram.replace(/^@/, "").trim();
                              const cleanWhats = whatsapp && whatsapp !== "+55" ? whatsapp : "";
                              const { data, error } = await supabase
                                .from("apresentadores")
                                .insert({ user_id: user.id, nome, instagram: cleanInsta, whatsapp: cleanWhats, cargo: "Convidado", ativo: true })
                                .select("id, nome, instagram, cargo, whatsapp")
                                .single();
                              if (error || !data) {
                                toast({ title: "Erro ao cadastrar convidado", description: error?.message, variant: "destructive" });
                                return;
                              }
                              setApresentadores(prev => [...prev, data as Apresentador]);
                              setFormParticipantes(prev => {
                                const empty = prev.findIndex(p => !p.nome.trim() && !p.obrigatorio);
                                const newItem = { nome: data.nome, instagram: data.instagram || "" };
                                if (empty >= 0) {
                                  const next = [...prev];
                                  next[empty] = newItem;
                                  return next;
                                }
                                return [...prev, newItem];
                              });
                              toast({ title: "Convidado cadastrado!" });
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      {formParticipantes.map((p, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <Input
                              value={p.nome}
                              onChange={(e) => updateParticipante(idx, "nome", e.target.value)}
                              placeholder="Nome"
                              disabled={p.obrigatorio}
                              className="agenda-form-input h-9 text-xs"
                              style={{ borderColor: p.obrigatorio ? "color-mix(in srgb, #ef4444 30%, transparent)" : "color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)", borderRadius: "10px", backgroundColor: p.obrigatorio ? "color-mix(in srgb, #ef4444 6%, transparent)" : "#f8faff", color: "var(--layout-page-text, #1a1a1a)" }}
                            />
                            <Input
                              value={p.instagram}
                              onChange={(e) => updateParticipante(idx, "instagram", e.target.value)}
                              placeholder="@instagram"
                              className="agenda-form-input h-9 text-xs"
                              style={{ borderColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)", borderRadius: "10px", backgroundColor: "#f8faff", color: "var(--layout-page-text, #1a1a1a)" }}
                            />
                          </div>
                          {p.obrigatorio ? (
                            <span className="text-[9px] font-bold px-2 py-1 rounded-md" style={{ backgroundColor: "color-mix(in srgb, #ef4444 12%, transparent)", color: "#ef4444" }} title="Apresentador do programa (obrigatório)">FIXO</span>
                          ) : (
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeParticipante(idx)}>
                              <Trash2 size={14} className="text-destructive" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] mt-1.5 px-1" style={{ color: "var(--layout-icon-color, #888888)" }}>
                      Apresentadores marcados com FIXO são obrigatórios e adicionados automaticamente do cadastro do programa.
                    </p>
                  </div>

                  {/* Envio WhatsApp - Convite da Live */}
                  <div>
                    <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                      <MessageCircle size={12} /> Convite via WhatsApp
                    </Label>
                    <div
                      className="rounded-xl p-3 space-y-2"
                      style={{
                        border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)",
                        backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 4%, transparent)",
                      }}
                    >
                      <p className="text-[10px] leading-relaxed" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 70%, transparent)" }}>
                        Envia para cada participante a <b>imagem do FEED</b> + mensagem com link do YouTube.
                      </p>
                      <div className="space-y-1.5">
                        {formParticipantes.filter(p => p.nome.trim()).length === 0 ? (
                          <p className="text-[10px] italic" style={{ color: "var(--layout-icon-color, #888)" }}>Adicione participantes acima.</p>
                        ) : (
                          formParticipantes.filter(p => p.nome.trim()).map((p, idx) => {
                            const apre = apresentadores.find(a => a.nome.trim().toLowerCase() === p.nome.trim().toLowerCase());
                            const whatsRaw = (apre?.whatsapp || "").replace(/\D/g, "");
                            const normalizedPhone = whatsRaw ? (whatsRaw.startsWith("55") ? whatsRaw : `55${whatsRaw}`) : "";
                            const hasWhats = normalizedPhone.length >= 12;
                            const linkYt = formYoutubeUrl.trim();
                            const feedUrl = formArtesUrls[1] || "";
                            const participantKey = `${idx}-${normalizedPhone || p.nome}`;
                            const isSending = sendingWhatsAppFor === participantKey;
                            const sendWhats = async () => {
                              if (!linkYt) {
                                toast({ title: "Link do YouTube vazio", description: "Preencha o link do YouTube acima.", variant: "destructive" });
                                return;
                              }
                              if (!feedUrl) {
                                toast({ title: "Imagem do FEED ausente", description: "Faça upload da arte do FEED para enviar a foto no WhatsApp.", variant: "destructive" });
                                return;
                              }
                              if (!hasWhats) {
                                toast({ title: "WhatsApp não cadastrado", description: `Cadastre o WhatsApp de ${p.nome} para enviar a imagem com a mensagem.`, variant: "destructive" });
                                return;
                              }

                              const horarioLive = (selectedPrograma?.horario_inicio || "").slice(0, 5);
                              const linhaHoje = horarioLive ? `\n\nHoje ${horarioLive}` : "";
                              const text = `Olá ${p.nome}, chegou o dia da nossa live ir ao ar :)\n\nSegue o link da transmissão para você acompanhar:\n${linkYt}${linhaHoje}`;

                              setSendingWhatsAppFor(participantKey);
                              try {
                                const { data, error } = await supabase.functions.invoke("send-whatsapp", {
                                  body: {
                                    contatos: [{ nome: p.nome, whatsapp: normalizedPhone }],
                                    mensagem: text,
                                    mediaUrl: feedUrl,
                                  },
                                });

                                if (error) throw error;
                                if (!data?.ok) {
                                  throw new Error(data?.detalhes?.[0]?.error || data?.error || "Falha ao enviar a mensagem.");
                                }

                                toast({ title: "Convite enviado", description: `A arte do FEED foi enviada para ${p.nome} com a mensagem.` });
                              } catch (err) {
                                console.error("Erro ao enviar convite via WhatsApp:", err);
                                toast({
                                  title: "Erro ao enviar WhatsApp",
                                  description: err instanceof Error ? err.message : "Não foi possível enviar a imagem com a mensagem.",
                                  variant: "destructive",
                                });
                              } finally {
                                setSendingWhatsAppFor(null);
                              }
                            };
                            return (
                              <div
                                key={idx}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                                style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)" }}
                              >
                                {feedUrl ? (
                                  <img src={feedUrl} alt="feed" className="w-8 h-8 rounded object-cover shrink-0" />
                                ) : (
                                  <div className="w-8 h-8 rounded shrink-0 flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent)", color: "var(--layout-accent-color, #2563eb)" }}>FEED</div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-semibold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{p.nome}</div>
                                  <div className="text-[10px] truncate" style={{ color: hasWhats ? "var(--layout-icon-color, hsl(var(--muted-foreground)))" : "hsl(var(--destructive))" }}>
                                    {hasWhats ? `+${normalizedPhone}` : "Cadastre o WhatsApp do participante"}
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => {
                                    if (!hasWhats) {
                                      toast({ title: "WhatsApp não cadastrado", description: `Cadastre o WhatsApp de ${p.nome}.`, variant: "destructive" });
                                      return;
                                    }
                                    const text = `Olá ${p.nome}, chegou o dia da nossa live ir ao ar :)\n\nSegue o link da transmissão para você acompanhar:\n${linkYt}`;
                                    window.open(`https://wa.me/${normalizedPhone}?text=${encodeURIComponent(text)}`, "_blank");
                                  }}
                                  className="h-7 px-2.5 text-[10px] font-bold gap-1 shrink-0 hover:opacity-90"
                                  style={{ backgroundColor: "#25D366", color: "#fff" }}
                                  title="Abrir no WhatsApp"
                                >
                                  <MessageCircle size={11} />
                                  WhatsApp
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={sendWhats}
                                  disabled={isSending}
                                  className="h-7 px-2.5 text-[10px] font-bold gap-1 shrink-0 hover:opacity-90"
                                  style={{ backgroundColor: "var(--layout-accent-color, hsl(var(--primary)))", color: "var(--layout-accent-text, hsl(var(--primary-foreground)))" }}
                                  title="Enviar via API (com imagem)"
                                >
                                  {isSending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                                  {isSending ? "Enviando" : "API"}
                                </Button>
                              </div>
                            );
                          })
                        )}
                      </div>
                      {!formArtesUrls[1] && (
                        <p className="text-[9px] italic mt-1" style={{ color: "#f59e0b" }}>
                          ⚠ Faça upload da imagem do FEED abaixo para incluí-la na mensagem.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Artes do evento - slots tipados */}
                  <div>
                    <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                      <ImageIcon size={12} /> Artes do Evento
                    </Label>
                    <div className="grid grid-cols-5 gap-2 mb-2">
                      {["THUMB", "FEED", "STORIE", "CAPA AUDIO", "INSERT LIVE"].map((slotLabel, slotIdx) => {
                        const url = formArtesUrls[slotIdx] || "";
                        return (
                          <div key={slotIdx} className="flex flex-col items-center gap-1">
                            {url ? (
                              <div className="relative w-full aspect-square rounded-lg overflow-hidden group" style={{ border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)" }}>
                                <img src={url} alt={slotLabel} className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                                        const i = new Image();
                                        i.crossOrigin = "anonymous";
                                        i.onload = () => resolve(i);
                                        i.onerror = reject;
                                        i.src = url;
                                      });
                                      const canvas = document.createElement("canvas");
                                      canvas.width = img.naturalWidth;
                                      canvas.height = img.naturalHeight;
                                      canvas.getContext("2d")?.drawImage(img, 0, 0);
                                      const pngBlob: Blob = await new Promise((resolve) =>
                                        canvas.toBlob((b) => resolve(b!), "image/png")
                                      );
                                      const blobUrl = URL.createObjectURL(pngBlob);
                                      const a = document.createElement("a");
                                      a.href = blobUrl;
                                      a.download = `${slotLabel.toLowerCase().replace(/\s+/g, "-")}.png`;
                                      document.body.appendChild(a);
                                      a.click();
                                      document.body.removeChild(a);
                                      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                                    } catch {
                                      window.open(url, "_blank");
                                    }
                                  }}
                                  title="Download original"
                                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "#fff" }}
                                >
                                  <Download size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeArte(slotIdx)}
                                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  style={{ backgroundColor: "rgba(239,68,68,0.9)", color: "#fff" }}
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <label
                                className="w-full aspect-square rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer transition-all"
                                style={{
                                  border: "1.5px dashed color-mix(in srgb, var(--layout-accent-color, #2563eb) 40%, transparent)",
                                  backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 4%, transparent)",
                                  color: "var(--layout-accent-color, #2563eb)",
                                  opacity: uploadingArte ? 0.5 : 1,
                                }}
                              >
                                <Upload size={14} />
                                <span className="text-[8px] font-semibold">{uploadingArte ? "..." : "Upload"}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={uploadingArte}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleUploadArte(file, slotIdx);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            )}
                            <span className="text-[8px] font-bold uppercase tracking-wider text-center leading-tight" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 65%, transparent)" }}>
                              {slotLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dados do YouTube */}
                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                      <Youtube size={12} /> Dados do YouTube
                    </Label>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 65%, transparent)" }}>Título</span>
                        <span className="text-[10px] font-mono" style={{ color: formYoutubeTitulo.length >= 100 ? "#ef4444" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                          {formYoutubeTitulo.length}/100
                        </span>
                      </div>
                      <Input
                        value={formYoutubeTitulo}
                        onChange={(e) => setFormYoutubeTitulo(e.target.value.slice(0, 100))}
                        maxLength={100}
                        placeholder="Título do vídeo no YouTube"
                        className="h-9 text-xs"
                        style={{ color: "var(--layout-page-text, #1a1a1a)" }}
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold block mb-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 65%, transparent)" }}>Descrição</span>
                      <Textarea
                        value={formYoutubeDescricao}
                        onChange={(e) => setFormYoutubeDescricao(e.target.value)}
                        placeholder="Descrição do vídeo no YouTube"
                        className="min-h-[80px] text-xs"
                        style={{ color: "var(--layout-page-text, #1a1a1a)" }}
                      />
                    </div>
                  </div>

                  {/* Anotações de Edição */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                        ✂️ Anotações da Edição
                      </Label>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={formEdicaoConcluida}
                          onChange={(e) => setFormEdicaoConcluida(e.target.checked)}
                          className="w-4 h-4 rounded cursor-pointer"
                          style={{ accentColor: "var(--layout-accent-color, #2563eb)" }}
                        />
                        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: formEdicaoConcluida ? "#10b981" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 65%, transparent)" }}>
                          {formEdicaoConcluida ? "✓ Edição concluída" : "Edição pendente"}
                        </span>
                      </label>
                    </div>
                    <Textarea
                      value={formEdicaoNotas}
                      onChange={(e) => setFormEdicaoNotas(e.target.value)}
                      placeholder="Anotações sobre a edição do programa (cortes, destaques, observações...)"
                       className="min-h-[180px] text-xs"
                      style={{ color: "var(--layout-page-text, #1a1a1a)" }}
                    />
                  </div>
                </div>
              )}

              {/* Criar Roteiro Express (apenas para gravação de podcast) */}
              {formTipoEvento === "gravacao" && (
                <button
                  type="button"
                  onClick={handleCreateRoteiroFromEvento}
                  disabled={!formProgramaId || !formData || creatingRoteiro}
                  className="w-full h-10 text-xs font-semibold rounded-[12px] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{
                    border: "1.5px dashed color-mix(in srgb, var(--layout-accent-color, #2563eb) 50%, transparent)",
                    color: "var(--layout-accent-color, #2563eb)",
                    backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 6%, transparent)",
                  }}
                >
                  {creatingRoteiro ? "Criando…" : (roteiroJaExiste ? "📝 Abrir/editar roteiro já existente" : "📝 Deseja criar/agendar o roteiro desse programa?")}
                </button>
              )}

              <Button variant="save"
                type="button"
                onClick={handleSave}
                disabled={!formProgramaId || !formData}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--layout-accent-color, #2563eb) 88%, black 12%)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--layout-accent-color, #2563eb)";
                }}
              >
                {editingId ? "✓ Atualizar Evento" : "✓ Salvar Evento"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={expressOpen} onOpenChange={(o) => { setExpressOpen(o); if (!o) setExpressEditData(null); }}>
          <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0">
            <DialogHeader className="px-6 pt-5 pb-3 border-b" style={{ borderColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
              <DialogTitle className="text-base font-bold">📝 Roteiro do Programa</DialogTitle>
            </DialogHeader>
            <div className="p-4">
              <ProgramaExpressInline
                programas={programas.map(p => ({ id: p.id, nome: p.nome, estudio: p.estudio, tipo_programa: (p as any).tipo_programa }))}
                estudios={estudios}
                onFinish={() => { setExpressOpen(false); setExpressEditData(null); }}
                editData={expressEditData}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Calendar + Events Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1 space-y-5">
            {/* Calendar */}
            <div className="overflow-hidden" style={{ backgroundColor: "#FFFFFF", borderRadius: 20, border: "1px solid #E5F5FB", boxShadow: "0 2px 12px rgba(10, 37, 64, 0.04)" }}>
              <div style={{ padding: "12px 18px", background: NEXO_CYAN, color: "#FFFFFF", fontWeight: 800, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'Montserrat', sans-serif" }}>
                Calendário
              </div>

              <div className="p-3">
              <style>{`
                .agenda-calendar .rdp-day:hover { background-color: color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent) !important; color: var(--layout-accent-color, #2563eb) !important; }
                .agenda-calendar .rdp-day_selected { background-color: var(--layout-accent-color, #2563eb) !important; color: #fff !important; }
                .agenda-calendar .rdp-day_selected:hover { background-color: var(--layout-accent-color, #2563eb) !important; }
                .agenda-calendar .rdp-day_today { background-color: var(--layout-header-bg, #1a1a1a) !important; color: var(--layout-header-text, #ffffff) !important; font-weight: 700 !important; }
                .agenda-calendar .rdp-day_today:hover { background-color: var(--layout-header-bg, #1a1a1a) !important; color: var(--layout-header-text, #ffffff) !important; }
                .agenda-calendar [class*="day_today"] { background-color: var(--layout-header-bg, #1a1a1a) !important; color: var(--layout-header-text, #ffffff) !important; font-weight: 700 !important; }
                .agenda-calendar .rdp-day_today.rdp-day_selected { background-color: var(--layout-header-bg, #1a1a1a) !important; color: var(--layout-header-text, #ffffff) !important; }
                .agenda-calendar .has-event-day { background-color: color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent) !important; color: var(--layout-accent-color, #2563eb) !important; font-weight: bold; }
                .agenda-calendar .is-feriado-day { position: relative; }
                .agenda-calendar .is-feriado-day::after { content: ''; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 5px; height: 5px; border-radius: 50%; background-color: var(--layout-accent-color, #ef4444); }
              `}</style>
              <TooltipProvider>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  className={cn("p-2 pointer-events-auto agenda-calendar")}
                  locale={ptBR}
                  modifiers={{ hasEvent: eventDates, isFeriado: feriadoDates }}
                  modifiersClassNames={{ hasEvent: "has-event-day", isFeriado: "is-feriado-day" }}
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
                            <TooltipContent side="top" className="text-white border-none z-[100]" style={{ backgroundColor: "var(--layout-accent-color, #ef4444)" }}>
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
                      <div className="px-3 pb-2 text-[10px] font-semibold flex items-center gap-1.5 cursor-help" style={{ color: "var(--layout-accent-color, #ef4444)" }}>
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: "var(--layout-accent-color, #ef4444)" }} />
                        {getFeriadoNome(selectedDate)}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-white border-none" style={{ backgroundColor: "var(--layout-accent-color, #ef4444)" }}>
                      <p className="text-[10px] font-bold">{getFeriadoNome(selectedDate)}</p>
                      <p className="text-[9px] opacity-90">{selectedDate ? format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ""}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
            {/* Datas Comemorativas + Aniversários de Cidades */}
            <DatasComemorativasCidades feriados={feriadosNacionais} />

          </div>

          {/* Events + Upcoming */}
          <div className="lg:col-span-2 space-y-4">
            {/* Week schedule (Mon-Sun) - Injected here */}
            <div className="overflow-hidden" style={{ backgroundColor: "#FFFFFF", borderRadius: 20, border: "1px solid #E5F5FB", boxShadow: "0 2px 12px rgba(10, 37, 64, 0.04)" }}>
              <div className="flex items-center justify-between" style={{ padding: "12px 18px", background: NEXO_CYAN, color: "#FFFFFF", fontWeight: 800, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'Montserrat', sans-serif" }}>

                <span className="flex items-center gap-1.5 flex-wrap">
                  <CalendarIcon size={12} /> Programação da Semana
                  {weekEvents.length > 0 && (
                    <span className="opacity-70 font-normal ml-1">
                      ({format(weekEvents[0].date, "dd/MM")} – {format(weekEvents[6].date, "dd/MM")})
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setWeekOffset((w) => w - 1)}
                    className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "var(--layout-header-text, #ffffff)" }}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekOffset((w) => w + 1)}
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "var(--layout-header-text, #ffffff)" }}
                  >
                    →
                  </button>
                  {weekOffset !== 0 && (
                    <button
                      type="button"
                      onClick={() => setWeekOffset(0)}
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 35%, transparent)", color: "var(--layout-header-text, #ffffff)" }}
                    >
                      Hoje
                    </button>
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleExportFeriados}
                  className="px-2 py-0.5 rounded-full text-[9px] font-semibold hover:opacity-80 transition-opacity flex items-center gap-1"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "var(--layout-header-text, #ffffff)" }}
                  title="Exportar feriados para o Google Calendar"
                >
                  <Download size={10} /> Exportar
                </button>
              </div>
              <div className="p-3 flex gap-3 overflow-x-auto pb-3" style={{ scrollbarWidth: "thin" }}>
                {weekEvents.map(({ dateStr, date, events: dayEvents }) => {
                  const isToday = isSameDay(date, now);
                  const isSelected = selectedDate && isSameDay(date, selectedDate);
                  const feriadoNome = getFeriadoNome(date);
                    return (
                      <button
                        type="button"
                        key={dateStr}
                        onClick={() => setSelectedDate(date)}
                        className="flex-shrink-0 rounded-3xl p-3 flex flex-col items-center justify-between transition-all hover:scale-[1.03] group"
                        style={{
                          width: 112,
                          minHeight: 128,
                          background: isSelected
                            ? NEXO_CYAN
                            : feriadoNome
                            ? "rgba(239, 68, 68, 0.06)"
                            : "#FFFFFF",
                          color: isSelected ? "#FFFFFF" : NEXO_DARK,
                          border: isSelected
                            ? `2px solid ${NEXO_CYAN}`
                            : feriadoNome
                            ? "2px solid rgba(239, 68, 68, 0.25)"
                            : isToday
                            ? `2px solid ${NEXO_CYAN}`
                            : "2px solid #E5F5FB",
                          boxShadow: isSelected ? "0 8px 20px rgba(0, 191, 240, 0.35)" : "none",
                        }}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[10px] uppercase font-bold tracking-wider" style={{ opacity: isSelected ? 0.9 : 0.55 }}>
                            {format(date, "EEE", { locale: ptBR }).substring(0, 3)}
                          </span>
                          <span className="text-2xl font-black leading-none">
                            {format(date, "dd")}
                          </span>
                        </div>
                        <div className="flex flex-col items-center mt-1">
                          <span className="text-[11px] font-black" style={{ color: isSelected ? "#FFFFFF" : feriadoNome ? "#ef4444" : NEXO_CYAN }}>
                            {dayEvents.length}
                          </span>
                          <span className="text-[8px] uppercase font-bold tracking-wider" style={{ opacity: 0.6 }}>
                            evento{dayEvents.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {feriadoNome && (
                          <div className="text-[8px] font-bold uppercase truncate text-center mt-1 w-full" style={{ color: isSelected ? "#FFFFFF" : "#ef4444" }}>
                            Feriado
                          </div>
                        )}
                      </button>
                    );
                })}
              </div>
            </div>

            {/* Events of selected day */}
            <div className="overflow-hidden" style={{ backgroundColor: "#FFFFFF", borderRadius: 20, border: "1px solid #E5F5FB", boxShadow: "0 2px 12px rgba(10, 37, 64, 0.04)" }}>
              <div className="flex items-center justify-between" style={{ padding: "12px 18px", background: NEXO_CYAN, color: "#FFFFFF", fontWeight: 800, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'Montserrat', sans-serif" }}>
                <span>
                  {selectedDate
                    ? `Eventos em ${format(selectedDate, "dd/MM/yyyy")}`
                    : "Todos os eventos"}
                  {filterLocal !== "todos" && ` • ${filterLocal}`}
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, background: "#FFFFFF", color: NEXO_DARK, padding: "3px 12px", borderRadius: 999, letterSpacing: 1 }}>
                  {filteredEventos.length} evento{filteredEventos.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="p-3 space-y-2">
                {filteredEventos.map((evt) => renderEventCard(evt))}

                {filteredEventos.length === 0 && (
                  <p className="text-sm py-8 text-center" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                    Nenhum evento encontrado para esta data.
                  </p>
                )}
              </div>
            </div>

            {/* Upcoming + Past Events (side by side) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Upcoming 7 days */}
            <div className="overflow-hidden" style={{ backgroundColor: "#FFFFFF", borderRadius: 20, border: "1px solid #E5F5FB", boxShadow: "0 2px 12px rgba(10, 37, 64, 0.04)" }}>
              <div style={{ padding: "12px 18px", background: NEXO_CYAN, color: "#FFFFFF", fontWeight: 800, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'Montserrat', sans-serif" }}>
                Próximos 7 dias
              </div>

              <div className="p-3 space-y-3 max-h-[400px] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--layout-scrollbar-color, #555555) transparent" }}>
                {upcomingEvents.length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                    Nenhum evento nos próximos dias.
                  </p>
                ) : (
                  upcomingEvents.map(({ dateStr, date, events: dayEvents }) => (
                    <div key={dateStr}>
                      <button
                        type="button"
                        onClick={() => setSelectedDate(date)}
                        className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 w-full hover:opacity-80 transition-opacity cursor-pointer"
                        style={{ color: "var(--layout-icon-color, #888888)" }}
                      >
                        <CalendarIcon size={10} />
                        {format(date, "EEEE, dd/MM", { locale: ptBR })}
                        <span className="ml-auto text-[9px] font-normal px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)", color: "var(--layout-icon-color, #888888)" }}>
                          {dayEvents.length}
                        </span>
                      </button>
                      <div className="space-y-1.5">
                        {dayEvents.map((evt) => (
                          <div
                            key={evt.id}
                            className="rounded-lg px-3 py-2 cursor-pointer hover:shadow-sm transition-all border border-transparent hover:border-[var(--layout-accent-color)]"
                            style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)" }}
                            onClick={() => { 
                              setViewingEvent(evt);
                              setViewingOccurrenceDate(dateStr);
                              setViewEventDialogOpen(true);
                            }}
                          >
                            <p className="text-xs font-semibold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                              {evt.programa?.nome || "Programa removido"}
                            </p>
                            <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                              {evt.programa ? (
                                evt.tipo_evento === "gravacao" && evt.horario_gravacao
                                  ? `🎬 ${evt.horario_gravacao} (gravação)`
                                  : `${evt.programa.horario_inicio} - ${evt.programa.horario_fim}`
                              ) : ""}
                              {evt.local ? ` • ${evt.local}` : ""}
                            </p>
                            {evt.recorrencia !== "unico" && (
                              <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded mt-0.5" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent)", color: "var(--layout-icon-color, #888888)" }}>
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

            {/* Past Events */}
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <div className="px-4 py-2.5 font-bold text-xs tracking-wide flex items-center justify-between" style={{ background: "var(--layout-header-bg, #1a1a1a)", color: "var(--layout-header-text, #ffffff)" }}>
                <div className="flex items-center gap-2">
                  <History size={14} />
                  <span>Eventos Passados (6 meses)</span>
                </div>
                <Select value={pastMonthFilter} onValueChange={setPastMonthFilter}>
                  <SelectTrigger className="h-7 w-[130px] text-[10px] bg-white/10 border-white/20 text-white hover:bg-white/20 transition-colors">
                    <SelectValue placeholder="Filtrar por mês" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os meses</SelectItem>
                    {pastMonths.map(month => (
                      <SelectItem key={month} value={month.toLowerCase()}>
                        {month.charAt(0).toUpperCase() + month.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 space-y-3 max-h-[400px] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--layout-scrollbar-color, #555555) transparent" }}>
                {pastEvents.length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                    Nenhum evento passado encontrado para o filtro selecionado.
                  </p>
                ) : (
                  pastEvents.map(({ dateStr, date, events: dayEvents }) => (
                    <div key={dateStr}>
                      <button
                        type="button"
                        onClick={() => setSelectedDate(date)}
                        className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 w-full hover:opacity-80 transition-opacity cursor-pointer"
                        style={{ color: "var(--layout-icon-color, #888888)" }}
                      >
                        <CalendarIcon size={10} />
                        {format(date, "EEEE, dd/MM", { locale: ptBR })}
                        <span className="ml-auto text-[9px] font-normal px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)", color: "var(--layout-icon-color, #888888)" }}>
                          {dayEvents.length}
                        </span>
                      </button>
                      <div className="space-y-1.5">
                        {dayEvents.map((evt) => (
                          <div
                            key={evt.id}
                            className="rounded-lg px-3 py-2 cursor-pointer hover:shadow-sm transition-all border border-transparent hover:border-[var(--layout-accent-color)] opacity-75 grayscale-[0.3]"
                            style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)" }}
                            onClick={() => { 
                              setViewingEvent(evt);
                              setViewingOccurrenceDate(dateStr);
                              setViewEventDialogOpen(true);
                            }}
                          >
                            <p className="text-xs font-semibold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                              {evt.programa?.nome || "Programa removido"}
                            </p>
                            <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                              {evt.programa ? (
                                evt.tipo_evento === "gravacao" && evt.horario_gravacao
                                  ? `🎬 ${evt.horario_gravacao} (gravação)`
                                  : `${evt.programa.horario_inicio} - ${evt.programa.horario_fim}`
                              ) : ""}
                              {evt.local ? ` • ${evt.local}` : ""}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {evt.status === "concluido" && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                                  CONCLUÍDO
                                </span>
                              )}
                              {evt.status === "cancelado" && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                  CANCELADO
                                </span>
                              )}
                              {evt.recorrencia !== "unico" && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent)", color: "var(--layout-icon-color, #888888)" }}>
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

        </div>

        <div className="mt-5 text-[10px] text-center opacity-50">
          * Use o calendário e a programação acima para navegar entre as datas.
        </div>
      </div>
    </div>
  );
}
