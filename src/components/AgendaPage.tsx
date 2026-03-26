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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Programa {
  id: string;
  nome: string;
  horario_inicio: string;
  horario_fim: string;
  estudio: string;
  dias_semana: string[];
}

interface Participante {
  id?: string;
  nome: string;
  instagram: string;
}

interface Evento {
  id: string;
  programa_id: string;
  data: string;
  local: string;
  descricao: string;
  recorrencia: string;
  prioridade: string;
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

  // Form
  const [formProgramaId, setFormProgramaId] = useState("");
  const [formData, setFormData] = useState<Date | undefined>(undefined);
  const [formLocal, setFormLocal] = useState("");
  const [formDescricao, setFormDescricao] = useState("");
  const [formRecorrencia, setFormRecorrencia] = useState<string>("unico");
  const [formPrioridade, setFormPrioridade] = useState("normal");
  const [formParticipantes, setFormParticipantes] = useState<Participante[]>([
    { nome: "", instagram: "" },
  ]);

  const [loadingData, setLoadingData] = useState(true);
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
      await Promise.all([fetchProgramas(), fetchEventos()]);
      setLoadingData(false);
    };
    loadAll();
  }, [fetchProgramas, fetchEventos]);

  const addParticipante = () => {
    setFormParticipantes([...formParticipantes, { nome: "", instagram: "" }]);
  };

  const removeParticipante = (idx: number) => {
    setFormParticipantes(formParticipantes.filter((_, i) => i !== idx));
  };

  const updateParticipante = (idx: number, field: keyof Participante, value: string) => {
    const updated = [...formParticipantes];
    updated[idx] = { ...updated[idx], [field]: value };
    setFormParticipantes(updated);
  };

  const resetForm = () => {
    setFormProgramaId("");
    setFormData(undefined);
    setFormLocal("");
    setFormDescricao("");
    setFormRecorrencia("unico");
    setFormPrioridade("normal");
    setFormParticipantes([{ nome: "", instagram: "" }]);
    setEditingId(null);
  };

  const openNewDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const startEdit = (evt: Evento) => {
    setEditingId(evt.id);
    setFormProgramaId(evt.programa_id);
    setFormData(new Date(evt.data + "T12:00:00"));
    setFormLocal(evt.local);
    setFormDescricao(evt.descricao);
    setFormRecorrencia(evt.recorrencia);
    setFormPrioridade(evt.prioridade || "normal");
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
    await supabase.from("agenda_eventos").delete().eq("id", id);
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
    return matchDate && matchLocal && isFuture && programaAtivo;
  });

  // Past events
  const pastEventos = useMemo(() => {
    const past = eventos.filter((e) => {
      if (e.recorrencia !== "unico") return false;
      return e.data < todayStr;
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
            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded mt-0.5" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #444444) 15%, transparent)", color: "var(--layout-icon-color, #888888)" }}>
              🔁 {recorrenciaLabels[evt.recorrencia]}
            </span>
          )}
          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded mt-0.5 ml-1 ${prioridadeColors[evt.prioridade] || prioridadeColors.normal}`}>
            {evt.prioridade === "urgente" && <AlertTriangle size={10} className="inline mr-0.5" />}
            {prioridadeLabels[evt.prioridade] || "Normal"}
          </span>
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold transition-all rounded-full"
              style={{ background: "linear-gradient(135deg, var(--layout-accent-color, #444444), color-mix(in srgb, var(--layout-accent-color, #444444) 70%, white 30%))", color: "var(--layout-header-text, #ffffff)", border: "none" }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 15px color-mix(in srgb, var(--layout-accent-color, #444444) 40%, transparent)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
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
                box-shadow: 0 0 0 2px color-mix(in srgb, var(--layout-accent-color, #444444) 20%, transparent) !important;
                border-color: var(--layout-accent-color, #444444) !important;
              }
              .agenda-form-calendar .rdp { color: var(--layout-page-text, #1a1a1a) !important; }
              .agenda-form-calendar .rdp-caption_label { color: var(--layout-page-text, #1a1a1a) !important; font-weight: 700; }
              .agenda-form-calendar .rdp-head_cell { color: color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent) !important; }
              .agenda-form-calendar .rdp-day { color: var(--layout-page-text, #1a1a1a) !important; }
              .agenda-form-calendar .rdp-day:hover { background-color: color-mix(in srgb, var(--layout-accent-color, #444444) 15%, transparent) !important; color: var(--layout-accent-color, #444444) !important; }
              .agenda-form-calendar .rdp-day_selected { background-color: var(--layout-accent-color, #444444) !important; color: #fff !important; }
              .agenda-form-calendar .rdp-day_selected:hover { background-color: #1a7ae0 !important; color: #fff !important; }
              .agenda-form-calendar .rdp-day_today { background-color: var(--layout-page-text, #1a1a1a) !important; color: #fff !important; font-weight: 700; }
              .agenda-form-calendar .rdp-day_outside { color: color-mix(in srgb, var(--layout-page-text, #1a1a1a) 25%, transparent) !important; }
              .agenda-form-calendar .rdp-nav_button { color: var(--layout-page-text, #1a1a1a) !important; }
              .agenda-form-calendar .rdp-nav_button:hover { background-color: color-mix(in srgb, var(--layout-accent-color, #444444) 10%, transparent) !important; }
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
                .agenda-dialog-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg, var(--layout-accent-color, #444444), color-mix(in srgb, var(--layout-accent-color, #444444) 70%, white 30%)); border-radius: 10px; }
                .agenda-dialog-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, color-mix(in srgb, var(--layout-accent-color, #444444) 80%, black 20%), var(--layout-accent-color, #444444)); }
              `}</style>

              {/* Programa */}
              <div>
                <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Programa</Label>
                <Select value={formProgramaId} onValueChange={setFormProgramaId}>
                  <SelectTrigger className="agenda-form-input h-10" style={{ borderColor: "color-mix(in srgb, var(--layout-accent-color, #444444) 20%, transparent)", borderRadius: "12px", backgroundColor: "#f8faff", color: "var(--layout-page-text, #1a1a1a)" }}>
                    <SelectValue placeholder="Selecione o programa" />
                  </SelectTrigger>
                  <SelectContent>
                    {programas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome} ({p.horario_inicio} - {p.horario_fim})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPrograma && (
                  <p className="text-[10px] mt-1.5 px-1" style={{ color: "var(--layout-icon-color, #888888)" }}>
                    ⏰ {selectedPrograma.horario_inicio} às {selectedPrograma.horario_fim}
                    {selectedPrograma.estudio && ` • ${selectedPrograma.estudio}`}
                  </p>
                )}
              </div>

              {/* Calendário */}
              <div>
                <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Data do Evento</Label>
                <div className="agenda-form-calendar rounded-xl overflow-hidden" style={{ border: "1px solid color-mix(in srgb, var(--layout-accent-color, #444444) 15%, transparent)", backgroundColor: "#f8faff" }}>
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

              {/* Recorrência + Local (side by side) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Recorrência</Label>
                  <Select value={formRecorrencia} onValueChange={setFormRecorrencia}>
                    <SelectTrigger className="agenda-form-input h-10" style={{ borderColor: "color-mix(in srgb, var(--layout-accent-color, #444444) 20%, transparent)", borderRadius: "12px", backgroundColor: "#f8faff", color: "var(--layout-page-text, #1a1a1a)" }}>
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
                  <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Local</Label>
                  <Select value={formLocal} onValueChange={setFormLocal}>
                    <SelectTrigger className="agenda-form-input h-10" style={{ borderColor: "color-mix(in srgb, var(--layout-accent-color, #444444) 20%, transparent)", borderRadius: "12px", backgroundColor: "#f8faff", color: "var(--layout-page-text, #1a1a1a)" }}>
                      <SelectValue placeholder="Local" />
                    </SelectTrigger>
                    <SelectContent>
                      {estudios.map((e) => (
                        <SelectItem key={e} value={e}>{e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Prioridade */}
              <div>
                <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Prioridade</Label>
                <div className="flex gap-2">
                  {[
                    { value: "baixa", label: "Baixa", color: "#22c55e" },
                    { value: "normal", label: "Normal", color: "var(--layout-icon-color, #888888)" },
                    { value: "alta", label: "Alta", color: "#f59e0b" },
                    { value: "urgente", label: "Urgente", color: "#ef4444" },
                  ].map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setFormPrioridade(p.value)}
                      className="flex-1 py-2 rounded-lg text-[10px] font-bold transition-all"
                      style={{
                        backgroundColor: formPrioridade === p.value ? p.color : "rgba(13,4,70,0.04)",
                        color: formPrioridade === p.value ? "#fff" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)",
                        border: `1.5px solid ${formPrioridade === p.value ? p.color : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)"}`,
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
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
                  style={{ borderColor: "color-mix(in srgb, var(--layout-accent-color, #444444) 20%, transparent)", borderRadius: "12px", backgroundColor: "#f8faff", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-accent-color, #444444) 20%, transparent)" }}
                />
              </div>

              {/* Submit */}
              <Button
                onClick={handleSave}
                disabled={!formProgramaId || !formData}
                className="w-full h-11 font-bold text-xs tracking-wide"
                style={{ background: "linear-gradient(135deg, var(--layout-accent-color, #444444), color-mix(in srgb, var(--layout-accent-color, #444444) 70%, white 30%))", color: "var(--layout-header-text, #ffffff)", borderRadius: "14px", border: "none", boxShadow: "0 4px 15px color-mix(in srgb, var(--layout-accent-color, #444444) 30%, transparent)" }}
              >
                {editingId ? "✓ Atualizar Evento" : "✓ Salvar Evento"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Calendar + Events Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Calendar */}
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="px-4 py-2.5 font-bold text-xs tracking-wide" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", color: "var(--layout-header-text, #ffffff)" }}>
              📅 Calendário
            </div>
            <div className="p-3">
              <style>{`
                .agenda-calendar .rdp-day:hover { background-color: color-mix(in srgb, var(--layout-accent-color, #444444) 15%, transparent) !important; color: var(--layout-accent-color, #444444) !important; }
                .agenda-calendar .rdp-day_selected { background-color: var(--layout-accent-color, #444444) !important; color: #fff !important; }
                .agenda-calendar .rdp-day_selected:hover { background-color: var(--layout-accent-color, #444444) !important; }
                .agenda-calendar .rdp-day_today { background-color: var(--layout-page-text, #1a1a1a) !important; color: #ffffff !important; font-weight: 700 !important; }
                .agenda-calendar .rdp-day_today:hover { background-color: var(--layout-page-text, #1a1a1a) !important; color: #ffffff !important; }
                .agenda-calendar [class*="day_today"] { background-color: var(--layout-page-text, #1a1a1a) !important; color: #ffffff !important; font-weight: 700 !important; }
                .agenda-calendar .has-event-day { background-color: color-mix(in srgb, var(--layout-accent-color, #444444) 15%, transparent) !important; color: var(--layout-accent-color, #444444) !important; font-weight: bold; }
              `}</style>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className={cn("p-2 pointer-events-auto agenda-calendar")}
                locale={ptBR}
                modifiers={{ hasEvent: eventDates }}
                modifiersClassNames={{ hasEvent: "has-event-day" }}
              />
            </div>
          </div>

          {/* Events + Upcoming */}
          <div className="lg:col-span-2 space-y-4">
            {/* Events of selected day */}
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <div className="px-4 py-2.5 font-bold text-xs tracking-wide text-white flex items-center justify-between" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
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
              <div className="px-4 py-2.5 font-bold text-xs tracking-wide text-white" style={{ background: "linear-gradient(135deg, var(--layout-accent-color, #444444), color-mix(in srgb, var(--layout-accent-color, #444444) 70%, white 30%))" }}>
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
                        <span className="ml-auto text-[9px] font-normal px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #444444) 10%, transparent)", color: "var(--layout-icon-color, #888888)" }}>
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
                              {evt.programa ? `${evt.programa.horario_inicio} - ${evt.programa.horario_fim}` : ""}
                              {evt.local ? ` • ${evt.local}` : ""}
                            </p>
                            {evt.recorrencia !== "unico" && (
                              <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded mt-0.5" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #444444) 15%, transparent)", color: "var(--layout-icon-color, #888888)" }}>
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

        {/* Past events history */}
        <div className="mt-5">
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="px-4 py-2.5 font-bold text-xs tracking-wide text-white flex items-center justify-between" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
              <span className="flex items-center gap-1.5" style={{ color: "var(--layout-header-text, #ffffff)" }}>
                <History size={12} /> Histórico de Eventos Passados
              </span>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={historyDateFilter ? format(historyDateFilter, "yyyy-MM-dd") : ""}
                  onChange={(e) => setHistoryDateFilter(e.target.value ? new Date(e.target.value + "T12:00:00") : undefined)}
                  className="w-[150px] h-6 text-[10px] rounded-md"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)", color: "var(--layout-header-text, #ffffff)", colorScheme: "dark" }}
                />
                {historyDateFilter && (
                  <button onClick={() => setHistoryDateFilter(undefined)} className="p-0.5 rounded hover:bg-white/20 transition-colors">
                    <X size={12} className="text-white" />
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
                pastEventos.map((evt) => renderEventCard(evt, true))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
