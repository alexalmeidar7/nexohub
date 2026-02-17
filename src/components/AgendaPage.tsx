import { useState, useEffect, useCallback } from "react";
import { CalendarIcon, Plus, Trash2, MapPin, Users, Instagram } from "lucide-react";
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
  DialogTrigger,
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
  recorrencia: "unico" | "semanal" | "mensal";
  programa?: Programa;
  participantes?: Participante[];
}

const recorrenciaLabels: Record<string, string> = {
  unico: "Somente este dia",
  semanal: "Toda semana neste dia",
  mensal: "Todo mês neste dia",
};

export default function AgendaPage() {
  const { user } = useAuth();
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [filterLocal, setFilterLocal] = useState<string>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);

  // New event form
  const [formProgramaId, setFormProgramaId] = useState("");
  const [formData, setFormData] = useState<Date | undefined>(undefined);
  const [formLocal, setFormLocal] = useState("");
  const [formDescricao, setFormDescricao] = useState("");
  const [formRecorrencia, setFormRecorrencia] = useState<"unico" | "semanal" | "mensal">("unico");
  const [formParticipantes, setFormParticipantes] = useState<Participante[]>([
    { nome: "", instagram: "" },
  ]);

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

    // Fetch participantes and programas for each event
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
      programa: (progs || []).find((p: any) => p.id === e.programa_id),
      participantes: (parts || []).filter((p: any) => p.evento_id === e.id),
    }));

    setEventos(enriched);
  }, [user]);

  useEffect(() => {
    fetchProgramas();
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

  const handleSave = async () => {
    if (!user || !formProgramaId || !formData) return;

    const { data: evt, error } = await supabase
      .from("agenda_eventos")
      .insert({
        user_id: user.id,
        programa_id: formProgramaId,
        data: format(formData, "yyyy-MM-dd"),
        local: formLocal,
        descricao: formDescricao,
        recorrencia: formRecorrencia,
      } as any)
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

    // Reset form
    setFormProgramaId("");
    setFormData(undefined);
    setFormLocal("");
    setFormDescricao("");
    setFormRecorrencia("unico");
    setFormParticipantes([{ nome: "", instagram: "" }]);
    setDialogOpen(false);
    fetchEventos();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("agenda_eventos").delete().eq("id", id);
    fetchEventos();
  };

  // Get unique locals for filter
  const locais = Array.from(new Set(eventos.map((e) => e.local).filter(Boolean)));

  // Check if a recurring event matches a given date
  const eventMatchesDate = (evt: Evento, dateStr: string) => {
    if (evt.data === dateStr) return true;
    const evtDate = new Date(evt.data + "T12:00:00");
    const checkDate = new Date(dateStr + "T12:00:00");
    if (checkDate < evtDate) return false; // no past recurrence
    if (evt.recorrencia === "semanal") {
      return evtDate.getDay() === checkDate.getDay();
    }
    if (evt.recorrencia === "mensal") {
      return evtDate.getDate() === checkDate.getDate();
    }
    return false;
  };

  // Filter events by selected date and local
  const filteredEventos = eventos.filter((e) => {
    const selStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
    const matchDate = selectedDate ? eventMatchesDate(e, selStr) : true;
    const matchLocal = filterLocal === "todos" || e.local === filterLocal;
    return matchDate && matchLocal;
  });

  // Dates that have events (for calendar highlighting) — expand recurring for current month view
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

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-foreground">Calendário de Eventos</h3>
          {locais.length > 0 && (
            <Select value={filterLocal} onValueChange={setFilterLocal}>
              <SelectTrigger className="w-[180px] h-8 text-sm">
                <MapPin size={14} className="mr-1" />
                <SelectValue placeholder="Filtrar por local" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os locais</SelectItem>
                {locais.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <Plus size={16} /> Novo Evento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Cadastrar Evento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Step 1: Select program */}
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

              {/* Step 2: Select date */}
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

              {/* Recurrence */}
              <div>
                <Label>Recorrência</Label>
                <Select value={formRecorrencia} onValueChange={(v) => setFormRecorrencia(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unico">Somente este dia</SelectItem>
                    <SelectItem value="semanal">Toda semana neste dia</SelectItem>
                    <SelectItem value="mensal">Todo mês neste dia</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Local</Label>
                <Input
                  value={formLocal}
                  onChange={(e) => setFormLocal(e.target.value)}
                  placeholder="Ex: Estúdio A, Auditório..."
                />
              </div>

              {/* Description */}
              <div>
                <Label>Descrição</Label>
                <Input
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  placeholder="Descrição do evento"
                />
              </div>

              {/* Participants */}
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
                Salvar Evento
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="bg-muted rounded-xl border border-border p-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            className={cn("p-3 pointer-events-auto")}
            locale={ptBR}
            modifiers={{ hasEvent: eventDates }}
            modifiersClassNames={{ hasEvent: "bg-primary/20 font-bold text-primary" }}
          />
        </div>

        {/* Events list */}
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
            filteredEventos.map((evt) => (
              <div
                key={evt.id}
                className="bg-muted rounded-xl border border-border p-4 space-y-2"
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => handleDelete(evt.id)}
                  >
                    <Trash2 size={14} className="text-destructive" />
                  </Button>
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
