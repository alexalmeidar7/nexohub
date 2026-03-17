import { useState, useEffect, useCallback, useMemo } from "react";
import { CalendarIcon, Plus, Trash2, MapPin, Users, Instagram, Pencil, X, AlertTriangle, History, Globe, ExternalLink, Unlink } from "lucide-react";
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

interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  htmlLink: string;
}

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
    fetchEventos();
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
    // Only future/current events
    const isFuture = e.recorrencia !== "unico" || e.data >= todayStr;
    return matchDate && matchLocal && isFuture;
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
      style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.1)" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h5 className="font-semibold" style={{ color: "#0d0446" }}>
            {evt.programa?.nome || "Programa removido"}
          </h5>
          <p className="text-xs" style={{ color: "rgba(13,4,70,0.5)" }}>
            <CalendarIcon size={12} className="inline mr-1" />
            {format(new Date(evt.data + "T12:00:00"), "dd/MM/yyyy")}
            {evt.programa && ` • ${evt.programa.horario_inicio} - ${evt.programa.horario_fim}`}
          </p>
          {evt.recorrencia !== "unico" && (
            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded mt-0.5" style={{ backgroundColor: "rgba(38,143,250,0.15)", color: "#268ffa" }}>
              🔁 {recorrenciaLabels[evt.recorrencia]}
            </span>
          )}
          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded mt-0.5 ml-1 ${prioridadeColors[evt.prioridade] || prioridadeColors.normal}`}>
            {evt.prioridade === "urgente" && <AlertTriangle size={10} className="inline mr-0.5" />}
            {prioridadeLabels[evt.prioridade] || "Normal"}
          </span>
          {evt.local && (
            <p className="text-xs" style={{ color: "rgba(13,4,70,0.5)" }}>
              <MapPin size={12} className="inline mr-1" />
              {evt.local}
            </p>
          )}
          {evt.descricao && (
            <p className="text-sm mt-1" style={{ color: "#0d0446" }}>{evt.descricao}</p>
          )}
        </div>
        {!inactive && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => startEdit(evt)}>
              <Pencil size={14} style={{ color: "rgba(13,4,70,0.4)" }} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDelete(evt.id)}>
              <Trash2 size={14} className="text-destructive" />
            </Button>
          </div>
        )}
      </div>

      {evt.participantes && evt.participantes.length > 0 && (
        <div className="border-t pt-2" style={{ borderColor: "rgba(13,4,70,0.08)" }}>
          <p className="text-xs font-medium mb-1 flex items-center gap-1" style={{ color: "rgba(13,4,70,0.5)" }}>
            <Users size={12} /> Participantes
          </p>
          <div className="flex flex-wrap gap-2">
            {evt.participantes.map((p, i) => (
              <span
                key={i}
                className="rounded-lg px-2 py-1 text-xs"
                style={{ backgroundColor: "rgba(13,4,70,0.05)", border: "1px solid rgba(13,4,70,0.08)", color: "#0d0446" }}
              >
                {p.nome}
                {p.instagram && (
                  <span className="ml-1" style={{ color: "rgba(13,4,70,0.4)" }}>
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
        <div className="rounded-2xl" style={{ background: "#d9e9fa", boxShadow: "0 8px 32px rgba(13,4,70,0.12)", padding: "20px" }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(13,4,70,0.08)" }}>
              <CalendarIcon size={20} style={{ color: "#0d0446" }} />
            </div>
            <div>
              <div className="h-5 w-40 rounded bg-[#0d0446]/10 mb-1" />
              <div className="h-3 w-56 rounded bg-[#0d0446]/5" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
            <div className="rounded-xl p-4" style={{ backgroundColor: "#ffffff", boxShadow: "0 2px 10px rgba(13,4,70,0.05)" }}>
              <div className="h-4 w-24 mx-auto rounded bg-[#0d0446]/10 mb-3" />
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={`h-${i}`} className="h-3 w-full rounded bg-[#0d0446]/8" />
                ))}
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded bg-[#0d0446]/5" />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl p-4" style={{ backgroundColor: "#ffffff", boxShadow: "0 2px 10px rgba(13,4,70,0.05)" }}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-4 w-32 rounded bg-[#0d0446]/10" />
                    <div className="h-3 w-20 rounded-full bg-[#0d0446]/5" />
                  </div>
                  <div className="h-3 w-48 rounded bg-[#0d0446]/5" />
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
      <div className="rounded-2xl" style={{ background: "#d9e9fa", boxShadow: "0 8px 32px rgba(13,4,70,0.12)", padding: "20px" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(13,4,70,0.08)" }}>
              <CalendarIcon size={20} style={{ color: "#0d0446" }} />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: "#0d0446" }}>Calendário de Eventos</h3>
              <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.5)" }}>Gerencie a agenda de programas e participantes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {locais.length > 0 && (
              <Select value={filterLocal} onValueChange={setFilterLocal}>
                <SelectTrigger className="w-[160px] h-8 text-xs [&>span]:text-white" style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "none" }}>
                  <MapPin size={12} className="mr-1 text-white" />
                  <SelectValue placeholder="Filtrar por local" />
                </SelectTrigger>
                <SelectContent style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "12px" }}>
                  <SelectItem value="todos" className="text-white focus:bg-[#268ffa] focus:text-white">Todos os locais</SelectItem>
                  {locais.map((l) => (
                    <SelectItem key={l} value={l} className="text-white focus:bg-[#268ffa] focus:text-white">{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <button type="button" onClick={openNewDialog}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold transition-all rounded-full"
              style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff", border: "none" }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 15px rgba(38,143,250,0.4)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
            >
              <Plus size={14} /> Novo Evento
            </button>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
          <DialogContent className="max-w-md max-h-[70vh] overflow-hidden p-0 flex flex-col" style={{ backgroundColor: "#ffffff", borderRadius: "20px", border: "none", boxShadow: "0 20px 60px rgba(13,4,70,0.15)" }}>
            <style>{`
              .agenda-form-input:focus, .agenda-form-input:focus-visible, .agenda-form-input:active {
                outline: none !important;
                box-shadow: 0 0 0 2px rgba(38,143,250,0.2) !important;
                border-color: #268ffa !important;
              }
              .agenda-form-calendar .rdp { color: #0d0446 !important; }
              .agenda-form-calendar .rdp-caption_label { color: #0d0446 !important; font-weight: 700; }
              .agenda-form-calendar .rdp-head_cell { color: rgba(13,4,70,0.5) !important; }
              .agenda-form-calendar .rdp-day { color: #0d0446 !important; }
              .agenda-form-calendar .rdp-day:hover { background-color: rgba(38,143,250,0.15) !important; color: #268ffa !important; }
              .agenda-form-calendar .rdp-day_selected { background-color: #268ffa !important; color: #fff !important; }
              .agenda-form-calendar .rdp-day_selected:hover { background-color: #1a7ae0 !important; color: #fff !important; }
              .agenda-form-calendar .rdp-day_today { background-color: #0d0446 !important; color: #fff !important; font-weight: 700; }
              .agenda-form-calendar .rdp-day_outside { color: rgba(13,4,70,0.25) !important; }
              .agenda-form-calendar .rdp-nav_button { color: #0d0446 !important; }
              .agenda-form-calendar .rdp-nav_button:hover { background-color: rgba(38,143,250,0.1) !important; }
              .agenda-form-calendar button[name="previous-month"],
              .agenda-form-calendar button[name="next-month"] { color: #0d0446 !important; }
            `}</style>

            {/* Header */}
            <div className="px-6 pt-5 pb-4" style={{ background: "linear-gradient(135deg, #0d0446 0%, #1a0a6e 100%)", borderRadius: "20px 20px 0 0" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                  <CalendarIcon size={20} className="text-white" />
                </div>
                <div>
                  <DialogTitle className="text-sm font-bold text-white m-0">{editingId ? "Editar Evento" : "Novo Evento"}</DialogTitle>
                  <p className="text-[10px] text-white/60 mt-0.5">Preencha os dados abaixo</p>
                </div>
              </div>
            </div>

            {/* Form body */}
            <div className="agenda-dialog-scroll px-6 pb-6 pt-4 space-y-5 overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: "thin", scrollbarColor: "#268ffa transparent" }}>
              <style>{`
                .agenda-dialog-scroll::-webkit-scrollbar { width: 6px; }
                .agenda-dialog-scroll::-webkit-scrollbar-track { background: transparent; margin: 8px 0; }
                .agenda-dialog-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #268ffa, #2dbef3); border-radius: 10px; }
                .agenda-dialog-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #1a7ae0, #268ffa); }
              `}</style>

              {/* Programa */}
              <div>
                <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "rgba(13,4,70,0.5)" }}>Programa</Label>
                <Select value={formProgramaId} onValueChange={setFormProgramaId}>
                  <SelectTrigger className="agenda-form-input h-10" style={{ borderColor: "rgba(38,143,250,0.2)", borderRadius: "12px", backgroundColor: "#f8faff", color: "#0d0446" }}>
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
                  <p className="text-[10px] mt-1.5 px-1" style={{ color: "#268ffa" }}>
                    ⏰ {selectedPrograma.horario_inicio} às {selectedPrograma.horario_fim}
                    {selectedPrograma.estudio && ` • ${selectedPrograma.estudio}`}
                  </p>
                )}
              </div>

              {/* Calendário */}
              <div>
                <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "rgba(13,4,70,0.5)" }}>Data do Evento</Label>
                <div className="agenda-form-calendar rounded-xl overflow-hidden" style={{ border: "1px solid rgba(38,143,250,0.15)", backgroundColor: "#f8faff" }}>
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
                  <p className="text-[10px] mt-1.5 px-1 font-medium capitalize" style={{ color: "#268ffa" }}>
                    📅 {format(formData, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </p>
                )}
              </div>

              {/* Recorrência + Local (side by side) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "rgba(13,4,70,0.5)" }}>Recorrência</Label>
                  <Select value={formRecorrencia} onValueChange={setFormRecorrencia}>
                    <SelectTrigger className="agenda-form-input h-10" style={{ borderColor: "rgba(38,143,250,0.2)", borderRadius: "12px", backgroundColor: "#f8faff", color: "#0d0446" }}>
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
                  <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "rgba(13,4,70,0.5)" }}>Local</Label>
                  <Select value={formLocal} onValueChange={setFormLocal}>
                    <SelectTrigger className="agenda-form-input h-10" style={{ borderColor: "rgba(38,143,250,0.2)", borderRadius: "12px", backgroundColor: "#f8faff", color: "#0d0446" }}>
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
                <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "rgba(13,4,70,0.5)" }}>Prioridade</Label>
                <div className="flex gap-2">
                  {[
                    { value: "baixa", label: "Baixa", color: "#22c55e" },
                    { value: "normal", label: "Normal", color: "#268ffa" },
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
                        color: formPrioridade === p.value ? "#fff" : "rgba(13,4,70,0.5)",
                        border: `1.5px solid ${formPrioridade === p.value ? p.color : "rgba(13,4,70,0.08)"}`,
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descrição */}
              <div>
                <Label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: "rgba(13,4,70,0.5)" }}>Descrição</Label>
                <textarea
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  placeholder="Breve descrição do evento..."
                  rows={3}
                  className="agenda-form-input w-full resize-none text-xs px-3 py-2.5"
                  style={{ borderColor: "rgba(38,143,250,0.2)", borderRadius: "12px", backgroundColor: "#f8faff", color: "#0d0446", border: "1px solid rgba(38,143,250,0.2)" }}
                />
              </div>

              {/* Submit */}
              <Button
                onClick={handleSave}
                disabled={!formProgramaId || !formData}
                className="w-full h-11 font-bold text-xs tracking-wide"
                style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff", borderRadius: "14px", border: "none", boxShadow: "0 4px 15px rgba(38,143,250,0.3)" }}
              >
                {editingId ? "✓ Atualizar Evento" : "✓ Salvar Evento"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Calendar + Events Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Calendar */}
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", boxShadow: "0 2px 12px rgba(13,4,70,0.06)" }}>
            <div className="px-4 py-2.5 font-bold text-xs tracking-wide text-white" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)" }}>
              📅 Calendário
            </div>
            <div className="p-3">
              <style>{`
                .agenda-calendar .rdp-day:hover { background-color: rgba(38,143,250,0.15) !important; color: #268ffa !important; }
                .agenda-calendar .rdp-day_selected { background-color: #268ffa !important; color: #fff !important; }
                .agenda-calendar .rdp-day_selected:hover { background-color: #268ffa !important; }
                .agenda-calendar .rdp-day_today { background-color: #0d0446 !important; color: #ffffff !important; font-weight: 700 !important; }
                .agenda-calendar .rdp-day_today:hover { background-color: #0d0446 !important; color: #ffffff !important; }
                .agenda-calendar [class*="day_today"] { background-color: #0d0446 !important; color: #ffffff !important; font-weight: 700 !important; }
                .agenda-calendar .has-event-day { background-color: rgba(38,143,250,0.15) !important; color: #268ffa !important; font-weight: bold; }
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
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", boxShadow: "0 2px 12px rgba(13,4,70,0.06)" }}>
              <div className="px-4 py-2.5 font-bold text-xs tracking-wide text-white flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)" }}>
                <span style={{ color: "#ffffff" }}>
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
                {filteredEventos.length === 0 ? (
                  <p className="text-sm py-8 text-center" style={{ color: "rgba(13,4,70,0.4)" }}>
                    Nenhum evento encontrado para esta data.
                  </p>
                ) : (
                  filteredEventos.map((evt) => renderEventCard(evt))
                )}
              </div>
            </div>

            {/* Upcoming 7 days */}
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", boxShadow: "0 2px 12px rgba(13,4,70,0.06)" }}>
              <div className="px-4 py-2.5 font-bold text-xs tracking-wide text-white" style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)" }}>
                🗓️ Próximos 7 dias
              </div>
              <div className="p-3 space-y-3 max-h-[400px] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#268ffa transparent" }}>
                {upcomingEvents.length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: "rgba(13,4,70,0.4)" }}>
                    Nenhum evento nos próximos dias.
                  </p>
                ) : (
                  upcomingEvents.map(({ dateStr, date, events: dayEvents }) => (
                    <div key={dateStr}>
                      <button
                        type="button"
                        onClick={() => setSelectedDate(date)}
                        className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 w-full hover:opacity-80 transition-opacity cursor-pointer"
                        style={{ color: "#268ffa" }}
                      >
                        <CalendarIcon size={10} />
                        {format(date, "EEEE, dd/MM", { locale: ptBR })}
                        <span className="ml-auto text-[9px] font-normal px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(38,143,250,0.1)", color: "#268ffa" }}>
                          {dayEvents.length}
                        </span>
                      </button>
                      <div className="space-y-1.5">
                        {dayEvents.map((evt) => (
                          <div
                            key={evt.id}
                            className="rounded-lg px-3 py-2 cursor-pointer hover:shadow-sm transition-shadow"
                            style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid rgba(13,4,70,0.06)" }}
                            onClick={() => { setSelectedDate(date); }}
                          >
                            <p className="text-xs font-semibold truncate" style={{ color: "#0d0446" }}>
                              {evt.programa?.nome || "Programa removido"}
                            </p>
                            <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.5)" }}>
                              {evt.programa ? `${evt.programa.horario_inicio} - ${evt.programa.horario_fim}` : ""}
                              {evt.local ? ` • ${evt.local}` : ""}
                            </p>
                            {evt.recorrencia !== "unico" && (
                              <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded mt-0.5" style={{ backgroundColor: "rgba(38,143,250,0.15)", color: "#268ffa" }}>
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
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", boxShadow: "0 2px 12px rgba(13,4,70,0.06)" }}>
            <div className="px-4 py-2.5 font-bold text-xs tracking-wide text-white flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)" }}>
              <span className="flex items-center gap-1.5" style={{ color: "#ffffff" }}>
                <History size={12} /> Histórico de Eventos Passados
              </span>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={historyDateFilter ? format(historyDateFilter, "yyyy-MM-dd") : ""}
                  onChange={(e) => setHistoryDateFilter(e.target.value ? new Date(e.target.value + "T12:00:00") : undefined)}
                  className="w-[150px] h-6 text-[10px] rounded-md"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)", color: "#ffffff", colorScheme: "dark" }}
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
                <p className="text-sm py-4 text-center" style={{ color: "rgba(13,4,70,0.4)" }}>
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
