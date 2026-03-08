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

  const renderEventCard = (evt: Evento, inactive = false) => (
    <div
      key={evt.id}
      className={`rounded-xl p-4 space-y-2 ${inactive ? "opacity-50 grayscale" : ""}`}
      style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.1)" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h5 className="font-semibold text-foreground">
            {evt.programa?.nome || "Programa removido"}
          </h5>
          <p className="text-xs text-muted-foreground">
            <CalendarIcon size={12} className="inline mr-1" />
            {format(new Date(evt.data + "T12:00:00"), "dd/MM/yyyy")}
            {evt.programa && ` • ${evt.programa.horario_inicio} - ${evt.programa.horario_fim}`}
          </p>
          {evt.recorrencia !== "unico" && (
            <span className="inline-block bg-primary/15 text-primary text-[10px] font-semibold px-2 py-0.5 rounded mt-0.5">
              🔁 {recorrenciaLabels[evt.recorrencia]}
            </span>
          )}
          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded mt-0.5 ml-1 ${prioridadeColors[evt.prioridade] || prioridadeColors.normal}`}>
            {evt.prioridade === "urgente" && <AlertTriangle size={10} className="inline mr-0.5" />}
            {prioridadeLabels[evt.prioridade] || "Normal"}
          </span>
          {evt.local && (
            <p className="text-xs text-muted-foreground">
              <MapPin size={12} className="inline mr-1" />
              {evt.local}
            </p>
          )}
          {evt.descricao && (
            <p className="text-sm text-foreground mt-1">{evt.descricao}</p>
          )}
        </div>
        {!inactive && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => startEdit(evt)}>
              <Pencil size={14} className="text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDelete(evt.id)}>
              <Trash2 size={14} className="text-destructive" />
            </Button>
          </div>
        )}
      </div>

      {evt.participantes && evt.participantes.length > 0 && (
        <div className="border-t border-border pt-2">
          <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
            <Users size={12} /> Participantes
          </p>
          <div className="flex flex-wrap gap-2">
            {evt.participantes.map((p, i) => (
              <span
                key={i}
                className="bg-background/50 border border-border rounded-lg px-2 py-1 text-xs text-foreground"
              >
                {p.nome}
                {p.instagram && (
                  <span className="text-muted-foreground ml-1">
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
      <div className="animate-pulse space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-5 w-52 rounded bg-[#0d0446]/10" />
          <div className="h-8 w-32 rounded-full bg-[#0d0446]/10" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
          {/* Calendar skeleton */}
          <div className="space-y-2">
            <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.08)" }}>
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
          </div>
          {/* Events skeleton */}
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl p-4" style={{ backgroundColor: "rgba(13,4,70,0.04)", border: "1px solid rgba(13,4,70,0.08)" }}>
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
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-foreground">Calendário de Eventos</h3>
          {locais.length > 0 && (
            <Select value={filterLocal} onValueChange={setFilterLocal}>
              <SelectTrigger className="w-[160px] h-7 text-xs [&>span]:text-white" style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "none" }}>
                <MapPin size={14} className="mr-1 text-white" />
                <SelectValue placeholder="Filtrar por local" />
              </SelectTrigger>
              <SelectContent style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "12px" }}>
                <SelectItem value="todos" className="text-white focus:bg-[#2dbef3] focus:text-white">Todos os locais</SelectItem>
                {locais.map((l) => (
                  <SelectItem key={l} value={l} className="text-white focus:bg-[#2dbef3] focus:text-white">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <button type="button" onClick={openNewDialog}
          className="flex items-center gap-1 px-3 py-1 text-xs font-bold transition-all"
          style={{ backgroundColor: "#2ec0f6", color: "#ffffff", borderRadius: "20px", border: "2px solid #2ec0f6" }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#2ec0f6"; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#2ec0f6"; e.currentTarget.style.color = "#ffffff"; }}
        >
          <Plus size={16} /> Novo Evento
        </button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Evento" : "Cadastrar Evento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Programa</Label>
              <Select value={formProgramaId} onValueChange={setFormProgramaId}>
                <SelectTrigger>
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
                <p className="text-xs text-muted-foreground mt-1">
                  Horário: {selectedPrograma.horario_inicio} às {selectedPrograma.horario_fim}
                  {selectedPrograma.estudio && ` • Estúdio: ${selectedPrograma.estudio}`}
                </p>
              )}
            </div>

            <div>
              <Label>Data do Evento</Label>
              <Calendar
                mode="single"
                selected={formData}
                onSelect={setFormData}
                className={cn("p-3 pointer-events-auto border border-border rounded-lg mt-1")}
                locale={ptBR}
              />
              {formData && (
                <p className="text-xs text-muted-foreground mt-1">
                  {format(formData, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              )}
            </div>

            <div>
              <Label>Recorrência</Label>
              <Select value={formRecorrencia} onValueChange={setFormRecorrencia}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unico">Somente este dia</SelectItem>
                  <SelectItem value="semanal">Toda semana neste dia</SelectItem>
                  <SelectItem value="mensal">Todo mês neste dia</SelectItem>
                  <SelectItem value="programa_semanal">Programa semanal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Local</Label>
              <Select value={formLocal} onValueChange={setFormLocal}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o local" />
                </SelectTrigger>
                <SelectContent>
                  {estudios.map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Prioridade</Label>
              <Select value={formPrioridade} onValueChange={setFormPrioridade}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Descrição</Label>
              <Input
                value={formDescricao}
                onChange={(e) => setFormDescricao(e.target.value)}
                placeholder="Descrição do evento"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-1">
                  <Users size={14} /> Participantes
                </Label>
                <Button type="button" variant="ghost" size="sm" onClick={addParticipante}>
                  <Plus size={14} /> Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {formParticipantes.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={p.nome}
                      onChange={(e) => updateParticipante(i, "nome", e.target.value)}
                      placeholder="Nome"
                      className="flex-1"
                    />
                    <div className="flex items-center gap-1 flex-1">
                      <Instagram size={14} className="text-muted-foreground shrink-0" />
                      <Input
                        value={p.instagram}
                        onChange={(e) => updateParticipante(i, "instagram", e.target.value)}
                        placeholder="@instagram"
                      />
                    </div>
                    {formParticipantes.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => removeParticipante(i)}
                      >
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={handleSave} disabled={!formProgramaId || !formData} className="w-full">
              {editingId ? "Atualizar Evento" : "Salvar Evento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl p-4" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.1)" }}>
          <style>{`
            .agenda-calendar .rdp-day:hover { background-color: rgba(46,192,246,0.15) !important; color: #2ec0f6 !important; }
            .agenda-calendar .rdp-day_selected { background-color: #2ec0f6 !important; color: #fff !important; }
            .agenda-calendar .rdp-day_selected:hover { background-color: #2ec0f6 !important; }
            .agenda-calendar .rdp-day_today { background-color: #0d0446 !important; color: #ffffff !important; font-weight: 700 !important; }
            .agenda-calendar .rdp-day_today:hover { background-color: #0d0446 !important; color: #ffffff !important; }
            .agenda-calendar [class*="day_today"] { background-color: #0d0446 !important; color: #ffffff !important; font-weight: 700 !important; }
            .agenda-calendar .has-event-day { background-color: rgba(46,192,246,0.15) !important; color: #2ec0f6 !important; font-weight: bold; }
          `}</style>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            className={cn("p-3 pointer-events-auto agenda-calendar")}
            locale={ptBR}
            modifiers={{ hasEvent: eventDates }}
            modifiersClassNames={{ hasEvent: "has-event-day" }}
          />
        </div>

        <div className="lg:col-span-2 space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">
            {selectedDate
              ? `Eventos em ${format(selectedDate, "dd/MM/yyyy")}`
              : "Todos os eventos"}
            {filterLocal !== "todos" && ` • ${filterLocal}`}
          </h4>

          {filteredEventos.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              Nenhum evento encontrado para esta data.
            </p>
          ) : (
            filteredEventos.map((evt) => renderEventCard(evt))
          )}
        </div>
      </div>

      {/* Past events history */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <History size={14} /> Histórico de Eventos Passados
          </h4>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={historyDateFilter ? format(historyDateFilter, "yyyy-MM-dd") : ""}
              onChange={(e) => setHistoryDateFilter(e.target.value ? new Date(e.target.value + "T12:00:00") : undefined)}
              className="w-[180px] h-8 text-sm"
              placeholder="Filtrar por data"
            />
            {historyDateFilter && (
              <Button variant="ghost" size="sm" onClick={() => setHistoryDateFilter(undefined)}>
                <X size={14} /> Limpar
              </Button>
            )}
          </div>
        </div>

        {pastEventos.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">
            Nenhum evento passado encontrado.
          </p>
        ) : (
          pastEventos.map((evt) => renderEventCard(evt, true))
        )}
      </div>
    </div>
  );
}
