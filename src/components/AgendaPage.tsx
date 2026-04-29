import { useState, useEffect, useCallback, useMemo } from "react";
import { CalendarIcon, Plus, Trash2, MapPin, Users, Instagram, Pencil, X, AlertTriangle, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
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
import { useToast } from "@/hooks/use-toast";
import ProgramaExpressInline, { type ExpressEditData } from "@/components/ProgramaExpressInline";
import { uploadImageToStorage } from "@/lib/uploadImageToStorage";
import { Youtube, Image as ImageIcon, Upload, Download, Search, MessageCircle, Send, Loader2 } from "lucide-react";

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
                  <Button
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
  programa?: Programa;
  participantes?: Participante[];
}

const recorrenciaLabels: Record<string, string> = {
  unico: "Somente este dia",
  semanal: "Toda semana neste dia",
  mensal: "Todo mês neste dia",
  programa_semanal: "Programa semanal",
};

const prioridadeLabels: Record<string, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

const prioridadeColors: Record<string, string> = {
  baixa: "bg-blue-100 text-blue-800",
  normal: "bg-gray-100 text-gray-800",
  alta: "bg-orange-100 text-orange-800",
  urgente: "bg-red-100 text-red-800",
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
export default function AgendaPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [filterLocal, setFilterLocal] = useState<string>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyDateFilter, setHistoryDateFilter] = useState<Date | undefined>(undefined);
  const [pastEventDetail, setPastEventDetail] = useState<Evento | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

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

  const eventMatchesDate = (evt: Evento, dateStr: string) => {
    if (evt.data === dateStr) return true;
    const evtDate = new Date(evt.data + "T12:00:00");
    const checkDate = new Date(dateStr + "T12:00:00");
    if (checkDate < evtDate) return false;
    if (evt.recorrencia === "semanal" || evt.recorrencia === "programa_semanal") {
      return evtDate.getDay() === checkDate.getDay();
    }
    if (evt.recorrencia === "mensal") {
      return evtDate.getDate() === checkDate.getDate();
    }
    return false;
  };

  const todayStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }, []);

  const filteredEventos = eventos.filter((e) => {
    const selStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
    const matchDate = selectedDate ? eventMatchesDate(e, selStr) : true;
    const matchLocal = filterLocal === "todos" || e.local === filterLocal;
    // Only future/current events (unique with past date go to history)
    const isFuture = e.recorrencia !== "unico" || e.data >= todayStr;
    // Also exclude events whose linked programa is inactive (vencido)
    const programaAtivo = !e.programa_id || programas.find(p => p.id === e.programa_id) !== undefined;
    // Remove "CANCELADO" events from current agenda
    const isNotCancelled = e.status !== "cancelado";
    return matchDate && matchLocal && isFuture && programaAtivo && isNotCancelled;
  });

  // Past events (limited to last 30 days)
  const pastEventos = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = format(cutoff, "yyyy-MM-dd");
    const past = eventos.filter((e) => {
      const isPast = e.recorrencia === "unico" && e.data < todayStr;
      const isCancelled = e.status === "cancelado";
      return (isPast || isCancelled) && e.data >= cutoffStr;
    });
    // Apply history date filter
    if (historyDateFilter) {
      const filterStr = format(historyDateFilter, "yyyy-MM-dd");
      return past.filter(e => e.data === filterStr);
    }
    return past.sort((a, b) => b.data.localeCompare(a.data));
  }, [eventos, todayStr, historyDateFilter]);

  const getEventDatesForCalendar = () => {
    const dates: Date[] = [];
    const now = new Date();
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
    const year = new Date().getFullYear();
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
  }, []);

  const feriadoDates = useMemo(() => feriadosNacionais.map(f => f.date), [feriadosNacionais]);

  const getFeriadoNome = (date: Date | undefined) => {
    if (!date) return null;
    const f = feriadosNacionais.find(
      h => h.date.getDate() === date.getDate() && h.date.getMonth() === date.getMonth()
    );
    return f ? f.nome : null;
  };

  const selectedPrograma = programas.find((p) => p.id === formProgramaId);

  // Upcoming events for the next 7 days
  const upcomingEvents = useMemo(() => {
    const today = new Date();
    const days: { dateStr: string; date: Date; events: Evento[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dayEvents = eventos.filter((e) => {
        const matchLocal = filterLocal === "todos" || e.local === filterLocal;
        return matchLocal && eventMatchesDate(e, ds);
      });
      if (dayEvents.length > 0) {
        days.push({ dateStr: ds, date: new Date(d), events: dayEvents });
      }
    }
    return days;
  }, [eventos, filterLocal]);

  // Week view: Monday to Sunday of the currently selected week
  const weekEvents = useMemo(() => {
    const ref = selectedDate ? new Date(selectedDate) : new Date();
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
        return matchLocal && eventMatchesDate(e, ds);
      });
      days.push({ dateStr: ds, date: new Date(d), events: dayEvents });
    }
    return days;
  }, [eventos, filterLocal, selectedDate, weekOffset]);

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
            {evt.programa && ` • ${evt.programa.horario_inicio} - ${evt.programa.horario_fim}`}
          </p>
          {evt.recorrencia !== "unico" && (
            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded mt-0.5" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent)", color: "var(--layout-icon-color, #888888)" }}>
              🔁 {recorrenciaLabels[evt.recorrencia]}
            </span>
          )}
          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded mt-0.5 ml-1 ${prioridadeColors[evt.prioridade] || prioridadeColors.normal}`}>
            {evt.prioridade === "urgente" && <AlertTriangle size={10} className="inline mr-0.5" />}
            {prioridadeLabels[evt.prioridade] || "Normal"}
          </span>
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
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDelete(evt.id)}>
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
      <div className="rounded-2xl" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 12%, var(--layout-page-bg, #ffffff) 88%)", boxShadow: "0 8px 32px rgba(0,0,0,0.10)", padding: "20px" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
              <CalendarIcon size={20} style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Calendário de Eventos</h3>
              <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Gerencie a agenda de programas e participantes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {locais.length > 0 && (
              <Select value={filterLocal} onValueChange={setFilterLocal}>
                <SelectTrigger className="w-[160px] h-8 text-xs [&>span]:text-white" style={{ backgroundColor: "var(--layout-header-bg, #1a1a1a)", color: "var(--layout-header-text, #ffffff)", borderRadius: "20px", border: "none" }}>
                  <MapPin size={12} className="mr-1 text-white" />
                  <SelectValue placeholder="Filtrar por local" />
                </SelectTrigger>
                <SelectContent style={{ backgroundColor: "var(--layout-header-bg, #1a1a1a)", color: "var(--layout-header-text, #ffffff)", borderRadius: "12px" }}>
                  <SelectItem value="todos" className="text-white focus:bg-[var(--layout-accent-color)] focus:text-white">Todos os locais</SelectItem>
                  {locais.map((l) => (
                    <SelectItem key={l} value={l} className="text-white focus:bg-[var(--layout-accent-color)] focus:text-white">{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <button type="button" onClick={openNewDialog}
              className="btn-skyglass-accent px-3 py-1.5 text-[10px]"
            >
              <Plus size={14} /> Novo Evento
            </button>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
          <DialogContent className="max-w-md max-h-[70vh] overflow-hidden p-0 flex flex-col" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", borderRadius: "20px", border: "none", boxShadow: "0 20px 60px color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)" }}>
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

              <button
                type="button"
                onClick={handleSave}
                disabled={!formProgramaId || !formData}
                className="w-full h-11 text-xs tracking-wide font-semibold rounded-[14px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: "var(--layout-accent-color, #2563eb)",
                  color: "var(--layout-header-text, #ffffff)",
                  boxShadow: "0 10px 24px color-mix(in srgb, var(--layout-accent-color, #2563eb) 28%, transparent)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--layout-accent-color, #2563eb) 88%, black 12%)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--layout-accent-color, #2563eb)";
                }}
              >
                {editingId ? "✓ Atualizar Evento" : "✓ Salvar Evento"}
              </button>
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
          {/* Calendar */}
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="px-4 py-2.5 font-bold text-xs tracking-wide" style={{ background: "var(--layout-header-bg, #1a1a1a)", color: "var(--layout-header-text, #ffffff)" }}>
              📅 Calendário
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
                .agenda-calendar .is-feriado-day::after { content: ''; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 5px; height: 5px; border-radius: 50%; background-color: #ef4444; }
              `}</style>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className={cn("p-2 pointer-events-auto agenda-calendar")}
                locale={ptBR}
                modifiers={{ hasEvent: eventDates, isFeriado: feriadoDates }}
                modifiersClassNames={{ hasEvent: "has-event-day", isFeriado: "is-feriado-day" }}
              />
              {getFeriadoNome(selectedDate) && (
                <div className="px-3 pb-2 text-[10px] font-semibold flex items-center gap-1.5" style={{ color: "#ef4444" }}>
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  {getFeriadoNome(selectedDate)}
                </div>
              )}
            </div>
          </div>

          {/* Events + Upcoming */}
          <div className="lg:col-span-2 space-y-4">
            {/* Events of selected day */}
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <div className="px-4 py-2.5 font-bold text-xs tracking-wide flex items-center justify-between" style={{ background: "var(--layout-header-bg, #1a1a1a)", color: "var(--layout-header-text, #ffffff)" }}>
                <span style={{ color: "var(--layout-header-text, #ffffff)" }}>
                  {selectedDate
                    ? `📋 Eventos em ${format(selectedDate, "dd/MM/yyyy")}`
                    : "📋 Todos os eventos"}
                  {filterLocal !== "todos" && ` • ${filterLocal}`}
                </span>
                <span className="text-[9px] font-normal px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
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

            {/* Upcoming 7 days */}
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <div className="px-4 py-2.5 font-bold text-xs tracking-wide" style={{ background: "var(--layout-header-bg, #1a1a1a)", color: "var(--layout-header-text, #ffffff)" }}>
                🗓️ Próximos 7 dias
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
                            className="rounded-lg px-3 py-2 cursor-pointer hover:shadow-sm transition-shadow"
                            style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)" }}
                            onClick={() => { setSelectedDate(date); }}
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
          </div>
        </div>

        {/* Week schedule (Mon-Sun) */}
        <div className="mt-5">
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="px-4 py-2.5 font-bold text-xs tracking-wide flex items-center justify-between" style={{ background: "var(--layout-header-bg, #1a1a1a)", color: "var(--layout-header-text, #ffffff)" }}>
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
                  ← Semana anterior
                </button>
                <button
                  type="button"
                  onClick={() => setWeekOffset((w) => w + 1)}
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "var(--layout-header-text, #ffffff)" }}
                >
                  Próxima semana →
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
              <span className="text-[9px] font-normal px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                {weekEvents.reduce((sum, d) => sum + d.events.length, 0)} evento{weekEvents.reduce((sum, d) => sum + d.events.length, 0) !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
              {weekEvents.map(({ dateStr, date, events: dayEvents }) => {
                const isToday = format(new Date(), "yyyy-MM-dd") === dateStr;
                return (
                  <button
                    type="button"
                    key={dateStr}
                    onClick={() => setSelectedDate(date)}
                    className="text-left rounded-lg p-2 flex flex-col gap-1.5 hover:shadow-sm transition-all"
                    style={{
                      backgroundColor: isToday
                        ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent)"
                        : "rgba(13,4,70,0.03)",
                      border: `1px solid color-mix(in srgb, var(--layout-border-color, #333333) ${isToday ? 50 : 20}%, transparent)`,
                      minHeight: 110,
                    }}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--layout-icon-color, #888888)" }}>
                        {format(date, "EEE", { locale: ptBR })}
                      </span>
                      <span className="text-[11px] font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                        {format(date, "dd/MM")}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {dayEvents.length === 0 ? (
                        <p className="text-[9px] italic" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 35%, transparent)" }}>
                          Sem eventos
                        </p>
                      ) : (
                        dayEvents.slice(0, 4).map((evt) => {
                          const sc = studioColors(evt.programa?.estudio);
                          const isLive = (evt.tipo_evento || "live") === "live";
                          return (
                            <div
                              key={evt.id}
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); startEdit(evt); }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); startEdit(evt); } }}
                              className="rounded px-1.5 py-1 cursor-pointer hover:shadow-md hover:-translate-y-[1px] transition-all"
                              title="Clique para editar"
                              style={{ backgroundColor: sc.bg, borderLeft: `3px solid ${sc.border}`, border: `1px solid ${sc.border}40`, borderLeftWidth: 3 }}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <p className="text-[10px] font-semibold leading-tight truncate" style={{ color: sc.text }}>
                                  {evt.programa?.nome || "Programa removido"}
                                </p>
                                <span
                                  className="text-[8px] font-bold px-1 py-[1px] rounded shrink-0"
                                  style={{
                                    backgroundColor: isLive ? "#dc2626" : "#475569",
                                    color: "#ffffff",
                                  }}
                                  title={isLive ? "Ao vivo" : "Gravação"}
                                >
                                  {isLive ? "● LIVE" : "🎬 REC"}
                                </span>
                              </div>
                              {evt.programa && (
                                <p className="text-[9px] leading-tight" style={{ color: `${sc.text}99` }}>
                                  {(!isLive && evt.horario_gravacao ? evt.horario_gravacao : evt.programa.horario_inicio).slice(0, 5)}
                                  {evt.programa.estudio && ` • ${evt.programa.estudio}`}
                                </p>
                              )}
                            </div>
                          );
                        })
                      )}
                      {dayEvents.length > 4 && (
                        <p className="text-[9px] font-semibold" style={{ color: "var(--layout-icon-color, #888888)" }}>
                          + {dayEvents.length - 4} mais
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Past events history */}
        <div className="mt-5">
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="px-4 py-2.5 font-bold text-xs tracking-wide flex items-center justify-between" style={{ background: "var(--layout-header-bg, #1a1a1a)", color: "var(--layout-header-text, #ffffff)" }}>
              <span className="flex items-center gap-1.5" style={{ color: "var(--layout-header-text, #ffffff)" }}>
                <History size={12} /> Histórico de Eventos Passados
              </span>
              <div className="flex items-center gap-2">
                {pastEventos.length > 0 && (
                  <button
                    onClick={handleClearAllPast}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all hover:scale-105"
                    style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "var(--layout-header-text, #ffffff)" }}
                    title="Limpar todo o histórico"
                  >
                    <Trash2 size={10} /> Limpar tudo
                  </button>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
                      style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                      title="Filtrar por data"
                    >
                      <CalendarIcon size={14} style={{ color: "var(--layout-header-text, #ffffff)" }} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="single"
                      selected={historyDateFilter}
                      onSelect={(d) => setHistoryDateFilter(d || undefined)}
                      locale={ptBR}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                {historyDateFilter && (
                  <button onClick={() => setHistoryDateFilter(undefined)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
                    <X size={12} style={{ color: "var(--layout-header-text, #ffffff)" }} />
                  </button>
                )}
              </div>
            </div>
            <div className="p-3 space-y-2">
              {pastEventos.length === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                  Nenhum evento passado encontrado.
                </p>
              ) : (
                pastEventos.map((evt) => (
                  <div key={evt.id} className="relative group cursor-pointer" onClick={() => setPastEventDetail(evt)}>
                    {renderEventCard(evt, true)}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(evt.id); }}
                      className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: "rgba(239,68,68,0.1)" }}
                      title="Remover evento"
                    >
                      <Trash2 size={13} className="text-destructive" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Past event detail dialog */}
        <Dialog open={!!pastEventDetail} onOpenChange={(o) => !o && setPastEventDetail(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History size={18} /> {pastEventDetail?.programa?.nome || "Evento passado"}
              </DialogTitle>
            </DialogHeader>
            {pastEventDetail && (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Data</Label>
                    <p className="font-semibold">{format(new Date(pastEventDetail.data + "T12:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
                  </div>
                  {pastEventDetail.programa && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Horário</Label>
                      <p className="font-semibold">{pastEventDetail.programa.horario_inicio} - {pastEventDetail.programa.horario_fim}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs text-muted-foreground">Tipo</Label>
                    <p className="font-semibold capitalize">{pastEventDetail.tipo_evento || "live"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Prioridade</Label>
                    <p className="font-semibold">{prioridadeLabels[pastEventDetail.prioridade] || "Normal"}</p>
                  </div>
                  {pastEventDetail.local && (
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">Local</Label>
                      <p className="font-semibold flex items-center gap-1"><MapPin size={12} /> {pastEventDetail.local}</p>
                    </div>
                  )}
                </div>

                {pastEventDetail.descricao && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Descrição</Label>
                    <p className="whitespace-pre-wrap">{pastEventDetail.descricao}</p>
                  </div>
                )}

                {pastEventDetail.youtube_url && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Link YouTube</Label>
                    <a href={pastEventDetail.youtube_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline break-all">
                      <Youtube size={14} /> {pastEventDetail.youtube_url}
                    </a>
                  </div>
                )}

                {pastEventDetail.participantes && pastEventDetail.participantes.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><Users size={12} /> Participantes</Label>
                    <div className="flex flex-wrap gap-2">
                      {pastEventDetail.participantes.map((p, i) => (
                        <span key={i} className="rounded-lg px-2 py-1 text-xs border" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)" }}>
                          {p.nome}
                          {p.instagram && <span className="ml-1 opacity-60"><Instagram size={10} className="inline mr-0.5" />{p.instagram}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {pastEventDetail.artes_urls && pastEventDetail.artes_urls.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-2"><ImageIcon size={12} /> Artes do Evento</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {pastEventDetail.artes_urls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border hover:opacity-80 transition-opacity">
                          <img src={url} alt={`Arte ${i + 1}`} className="w-full h-24 object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
