import { useState, useEffect, useMemo, useRef } from "react";
import { AlertCircle, Trash2, Clock, Calendar, Building2, Pencil, X, Power, Loader2, Info, CalendarDays, CheckCircle } from "lucide-react";
import { format, addDays, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { getApresentadores, type Apresentador } from "./ApresentadorForm";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface Programa {
  id: string;
  nome: string;
  apresentadorId: string;
  selo: string;
  capa: string;
  diasSemana: string[];
  horarioInicio: string;
  horarioFim: string;
  estudio: string;
  ativo: boolean;
  variavel: boolean;
  descricao: string;
  dataVariavel: string | null;
}

const DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

async function getProgramas(): Promise<Programa[]> {
  const { data } = await supabase.from("programas").select("*");
  if (!data) return [];
  return data.map(p => ({
    id: p.id,
    nome: p.nome,
    apresentadorId: p.apresentador_id || "",
    selo: p.selo || "",
    capa: (p as any).capa || "",
    diasSemana: p.dias_semana || [],
    horarioInicio: p.horario_inicio,
    horarioFim: p.horario_fim,
    estudio: p.estudio || "",
    ativo: (p as any).ativo ?? true,
    variavel: (p as any).variavel ?? false,
    descricao: (p as any).descricao || "",
    dataVariavel: (p as any).data_variavel || null,
  }));
}

function checkConflict(programas: Programa[], diasSemana: string[], horarioInicio: string, horarioFim: string, estudio: string, excludeId?: string): Programa | null {
  if (!horarioInicio || !horarioFim || diasSemana.length === 0) return null;
  for (const p of programas) {
    if (excludeId && p.id === excludeId) continue;
    if (p.estudio !== estudio) continue;
    const sharedDays = p.diasSemana.filter(d => diasSemana.includes(d));
    if (sharedDays.length === 0) continue;
    if (horarioInicio < p.horarioFim && horarioFim > p.horarioInicio) return p;
  }
  return null;
}

export default function ProgramaForm() {
  const { user } = useAuth();
  const [nome, setNome] = useState("");
  const [apresentadorId, setApresentadorId] = useState("");
  const [selo, setSelo] = useState("");
  const [capa, setCapa] = useState("");
  const [diasSemana, setDiasSemana] = useState<string[]>([]);
  const [horarioInicio, setHorarioInicio] = useState("");
  const [horarioFim, setHorarioFim] = useState("");
  const [estudio, setEstudio] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [variavel, setVariavel] = useState(false);
  const [dataVariavel, setDataVariavel] = useState<Date | undefined>(undefined);
  const [descricao, setDescricao] = useState("");
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [conflictMsg, setConflictMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Estúdio management
  const [estudios, setEstudios] = useState<string[]>([]);
  const [newEstudio, setNewEstudio] = useState("");
  const [estudioDialogOpen, setEstudioDialogOpen] = useState(false);

  // Grade filter
  const [gradeEstudioFilter, setGradeEstudioFilter] = useState("todos");
  const gradeRef = useRef<HTMLDivElement>(null);

  // Sorting
  const [sortBy, setSortBy] = useState<"horario" | "nome" | "estudio" | "status">("horario");

  const load = async () => {
    setLoadingData(true);
    const [ap, pg] = await Promise.all([getApresentadores(), getProgramas()]);
    setApresentadores(ap);
    pg.sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));
    setProgramas(pg);
    const allEstudios = Array.from(new Set(pg.map(p => p.estudio).filter(Boolean)));
    setEstudios(prev => {
      const merged = Array.from(new Set([...prev, ...allEstudios]));
      return merged.sort();
    });
    setLoadingData(false);
  };

  useEffect(() => { load(); }, []);

  // Auto-scroll to current on-air program
  useEffect(() => {
    if (loadingData || !gradeRef.current) return;
    const now = new Date();
    const currentSlotIndex = now.getHours() * 2 + (now.getMinutes() >= 30 ? 1 : 0);
    const rows = gradeRef.current.querySelectorAll("tbody tr");
    if (rows[currentSlotIndex]) {
      rows[currentSlotIndex].scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [loadingData, programas]);

  const handleSelo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSelo(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCapa = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCapa(reader.result as string);
    reader.readAsDataURL(file);
  };

  const toggleDia = (dia: string) => {
    setDiasSemana(prev => prev.includes(dia) ? prev.filter(d => d !== dia) : [...prev, dia]);
  };

  const resetForm = () => {
    setNome(""); setApresentadorId(""); setSelo(""); setCapa(""); setDiasSemana([]); setHorarioInicio(""); setHorarioFim(""); setEstudio(""); setAtivo(true); setVariavel(false); setDataVariavel(undefined); setDescricao(""); setConflictMsg(""); setEditingId(null);
  };

  const handleAdd = async () => {
    if (!nome.trim() || !user) return;
    if (!horarioInicio || !horarioFim) { setConflictMsg("Preencha o horário de início e fim."); return; }
    if (horarioInicio >= horarioFim) { setConflictMsg("O horário de início deve ser antes do fim."); return; }
    if (!estudio.trim()) { setConflictMsg("Informe o estúdio."); return; }

    if (variavel) {
      if (!dataVariavel) { setConflictMsg("Selecione a data para o programa variável."); return; }
      // Auto-set diasSemana from date
      const DIAS_MAP_REV: Record<number, string> = { 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo" };
      const dayOfWeek = DIAS_MAP_REV[dataVariavel.getDay()];
      const dataStr = format(dataVariavel, "yyyy-MM-dd");

      setSaving(true);
      if (editingId) {
        await supabase.from("programas").update({
          nome: nome.trim(), apresentador_id: apresentadorId || null, selo, capa, dias_semana: [dayOfWeek],
          horario_inicio: horarioInicio, horario_fim: horarioFim, estudio: estudio.trim(), ativo, descricao: descricao.trim(),
          variavel: true, data_variavel: dataStr,
        } as any).eq("id", editingId);
      } else {
        await supabase.from("programas").insert({
          user_id: user.id, nome: nome.trim(), apresentador_id: apresentadorId || null, selo, capa, dias_semana: [dayOfWeek],
          horario_inicio: horarioInicio, horario_fim: horarioFim, estudio: estudio.trim(), ativo, descricao: descricao.trim(),
          variavel: true, data_variavel: dataStr,
        } as any);
      }
      await load();
      resetForm();
      setSaving(false);
      return;
    }

    if (diasSemana.length === 0) { setConflictMsg("Selecione ao menos um dia da semana."); return; }

    // Fixed programs: conflict check excluding variable programs
    const fixedProgramas = programas.filter(p => !p.variavel);
    const conflict = checkConflict(fixedProgramas, diasSemana, horarioInicio, horarioFim, estudio.trim(), editingId || undefined);
    if (conflict) { setConflictMsg(`Conflito com "${conflict.nome}" no mesmo estúdio e horário.`); return; }

    setSaving(true);

    if (editingId) {
      await supabase.from("programas").update({
        nome: nome.trim(), apresentador_id: apresentadorId || null, selo, capa, dias_semana: diasSemana,
        horario_inicio: horarioInicio, horario_fim: horarioFim, estudio: estudio.trim(), ativo, descricao: descricao.trim(),
        variavel: false, data_variavel: null,
      } as any).eq("id", editingId);
    } else {
      await supabase.from("programas").insert({
        user_id: user.id, nome: nome.trim(), apresentador_id: apresentadorId || null, selo, capa, dias_semana: diasSemana,
        horario_inicio: horarioInicio, horario_fim: horarioFim, estudio: estudio.trim(), ativo, descricao: descricao.trim(),
        variavel: false, data_variavel: null,
      } as any);
    }
    await load();
    resetForm();
    setSaving(false);
  };

  const startEdit = (p: Programa) => {
    setEditingId(p.id); setNome(p.nome); setApresentadorId(p.apresentadorId); setSelo(p.selo); setCapa(p.capa);
    setDiasSemana(p.diasSemana); setHorarioInicio(p.horarioInicio); setHorarioFim(p.horarioFim);
    setEstudio(p.estudio); setAtivo(p.ativo); setVariavel(p.variavel); setDescricao(p.descricao);
    setDataVariavel(p.dataVariavel ? new Date(p.dataVariavel + "T12:00:00") : undefined);
    setConflictMsg("");
  };

  const removePrograma = async (id: string) => {
    await supabase.from("programas").delete().eq("id", id);
    await load();
  };

  const toggleAtivo = async (id: string, current: boolean) => {
    await supabase.from("programas").update({ ativo: !current } as any).eq("id", id);
    await load();
  };

  const addEstudio = () => {
    if (!newEstudio.trim()) return;
    setEstudios(prev => Array.from(new Set([...prev, newEstudio.trim()])).sort());
    setEstudio(newEstudio.trim());
    setNewEstudio("");
    setEstudioDialogOpen(false);
  };

  const getApresentadorNome = (id: string) => apresentadores.find(a => a.id === id)?.nome || "—";

  // Build grade de programação
  const gradeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 0; h < 24; h++) {
      slots.push(`${String(h).padStart(2, "0")}:00:00`);
      slots.push(`${String(h).padStart(2, "0")}:30:00`);
    }
    return slots;
  }, []);

  const now = new Date();
  const currentTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  const DIAS_MAP: Record<number, string> = { 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo" };
  const diaAtual = DIAS_MAP[now.getDay()];
  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Calculate dates for each day of the current week
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const weekDates = useMemo(() => {
    const dates: Record<string, string> = {};
    DIAS_SEMANA.forEach((dia, i) => {
      const date = addDays(weekStart, i);
      dates[dia] = format(date, "dd/MM");
    });
    return dates;
  }, [weekStart.toDateString()]);

  // Filter: variable programs only show on their specific day
  const gradeProgramas = useMemo(() => {
    let filtered = gradeEstudioFilter === "todos" ? programas : programas.filter(p => p.estudio === gradeEstudioFilter);
    // Variable programs only show on their registered days (treated as specific date programs)
    return filtered;
  }, [programas, gradeEstudioFilter]);

  // Get the full date string for a given day of the week in current week
  const getDateForDay = (dia: string): string => {
    const idx = DIAS_SEMANA.indexOf(dia);
    const date = addDays(weekStart, idx);
    return format(date, "yyyy-MM-dd");
  };

  const getProgramaForSlot = (dia: string, slotTime: string) => {
    const dateForDay = getDateForDay(dia);

    const matching = gradeProgramas.filter(p =>
      p.diasSemana.includes(dia) && slotTime >= p.horarioInicio && slotTime < p.horarioFim && p.ativo
    );

    // Variable programs take priority but ONLY on their specific date
    const variable = matching.find(p => p.variavel && p.dataVariavel === dateForDay);
    if (variable) return variable;

    // Otherwise show fixed (non-variable) program
    return matching.find(p => !p.variavel) || matching[0] || undefined;
  };

  // Sorted programs for list
  const sortedProgramas = useMemo(() => {
    const sorted = [...programas];
    switch (sortBy) {
      case "nome": sorted.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")); break;
      case "estudio": sorted.sort((a, b) => a.estudio.localeCompare(b.estudio, "pt-BR")); break;
      case "status": sorted.sort((a, b) => (a.ativo === b.ativo ? 0 : a.ativo ? -1 : 1)); break;
      default: sorted.sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio)); break;
    }
    return sorted;
  }, [programas, sortBy]);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="max-w-lg space-y-4">
        <h3 className="text-xl mb-4 text-primary">
          {editingId ? "Editar Programa" : "Cadastro de Programa"}
        </h3>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do Programa"
          className="w-full bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
        <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição do Programa (opcional)"
          className="bg-muted border-border text-foreground placeholder:text-muted-foreground min-h-[60px]" />
        <select value={apresentadorId} onChange={(e) => setApresentadorId(e.target.value)}
          className="w-full bg-muted border border-border p-3 rounded-lg text-foreground outline-none focus:ring-1 focus:ring-primary">
          <option value="">Selecionar Apresentador Responsável</option>
          {apresentadores.filter(a => a.ativo).map(a => (
            <option key={a.id} value={a.id}>{a.nome}</option>
          ))}
        </select>
        <div>
          <label className="block text-muted-foreground text-xs mb-2">Selo do Programa (1080 x 1080 px - PNG com fundo alpha)</label>
          <input type="file" accept="image/*" onChange={handleSelo}
            className="w-full bg-muted border border-border p-2 rounded-lg text-foreground text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:text-primary-foreground file:px-3 file:py-1 file:font-bold file:text-xs" />
          {selo && <img src={selo} alt="Selo" className="mt-2 h-16 rounded border border-border" />}
        </div>
        <div>
          <label className="block text-muted-foreground text-xs mb-2">Capa do Programa (1080 x 1080 px - PNG com fundo alpha)</label>
          <input type="file" accept="image/*" onChange={handleCapa}
            className="w-full bg-muted border border-border p-2 rounded-lg text-foreground text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:text-primary-foreground file:px-3 file:py-1 file:font-bold file:text-xs" />
          {capa && <img src={capa} alt="Capa" className="mt-2 h-16 rounded border border-border" />}
        </div>

        <div>
          <label className="block text-muted-foreground text-xs mb-1 flex items-center gap-1">
            <Building2 size={14} /> Estúdio
          </label>
          <div className="flex gap-2">
            <Select value={estudio} onValueChange={setEstudio}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecione o estúdio" />
              </SelectTrigger>
              <SelectContent>
                {estudios.map(e => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={estudioDialogOpen} onOpenChange={setEstudioDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0">+ Novo</Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle>Cadastrar Estúdio</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Input value={newEstudio} onChange={(e) => setNewEstudio(e.target.value)} placeholder="Nome do estúdio" />
                  <Button onClick={addEstudio} className="w-full">Adicionar</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div>
          <label className="block text-muted-foreground text-xs mb-2 flex items-center gap-1">
            <Calendar size={14} /> Dias da Semana
          </label>
          <div className="flex flex-wrap gap-2">
            {DIAS_SEMANA.map(dia => (
              <button key={dia} onClick={() => toggleDia(dia)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  diasSemana.includes(dia) ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:border-primary"
                }`}>
                {dia}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-muted-foreground text-xs mb-1 flex items-center gap-1"><Clock size={12} /> Início</label>
            <input type="time" step="1" value={horarioInicio} onChange={(e) => setHorarioInicio(e.target.value)}
              className="w-full bg-muted border border-border p-3 rounded-lg text-foreground outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-muted-foreground text-xs mb-1 flex items-center gap-1"><Clock size={12} /> Fim</label>
            <input type="time" step="1" value={horarioFim} onChange={(e) => setHorarioFim(e.target.value)}
              className="w-full bg-muted border border-border p-3 rounded-lg text-foreground outline-none focus:ring-1 focus:ring-primary" />
          </div>
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-foreground">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="w-4 h-4 accent-primary" />
            Programa Ativo
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-foreground">
            <input type="checkbox" checked={variavel} onChange={(e) => { setVariavel(e.target.checked); if (!e.target.checked) setDataVariavel(undefined); }} className="w-4 h-4 accent-primary" />
            Programa Variável
          </label>
        </div>

        {variavel && (
          <div className="space-y-2">
            <label className="block text-muted-foreground text-xs flex items-center gap-1">
              <CalendarDays size={14} /> Data do Programa Variável
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dataVariavel && "text-muted-foreground")}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {dataVariavel ? format(dataVariavel, "dd/MM/yyyy (EEEE)", { locale: ptBR }) : "Selecione a data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarUI
                  mode="single"
                  selected={dataVariavel}
                  onSelect={setDataVariavel}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-lg px-3 py-2">
              ⚠️ Este programa substituirá o programa fixo neste horário apenas na data selecionada. O programa anterior voltará automaticamente após essa data.
            </p>
          </div>
        )}

        {conflictMsg && <p className="text-destructive text-sm flex items-center gap-1"><AlertCircle size={14} /> {conflictMsg}</p>}
        <div className="flex gap-2 items-center">
          <button onClick={handleAdd} disabled={saving} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-bold hover:brightness-95 transition-all flex items-center gap-2 disabled:opacity-70">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Salvando..." : editingId ? "Atualizar Programa" : "Adicionar Programa"}
          </button>
          {editingId && (
            <button onClick={resetForm} className="bg-muted border border-border text-foreground px-4 py-2 rounded-lg font-bold hover:brightness-95 transition-all flex items-center gap-1">
              <X size={14} /> Cancelar
            </button>
          )}
        </div>
      </div>

      {/* Grade de Programação */}
      {loadingData ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 size={20} className="animate-spin text-primary" />
          <span className="text-muted-foreground text-sm">Carregando grade de programação...</span>
        </div>
      ) : programas.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium text-foreground">Grade de Programação</h4>
            <Select value={gradeEstudioFilter} onValueChange={setGradeEstudioFilter}>
              <SelectTrigger className="w-[200px] h-8 text-sm">
                <SelectValue placeholder="Filtrar por estúdio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os estúdios</SelectItem>
                {estudios.map(e => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div
            ref={gradeRef}
            className="bg-muted rounded-xl border border-border overflow-auto max-h-[300px]"
          >
            <table className="w-full text-xs border-separate border-spacing-1">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr>
                  <th className="px-2 py-2 text-left text-muted-foreground w-20 rounded-lg">Horário</th>
                  {DIAS_SEMANA.map(dia => (
                    <th key={dia} className={`px-2 py-2 text-center rounded-lg ${dia === diaAtual ? "text-primary font-bold" : "text-muted-foreground"}`}>
                      <div>{dia.slice(0, 3)}</div>
                      <div className="text-[9px] font-normal opacity-70">{weekDates[dia]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gradeSlots.map(slot => (
                  <tr key={slot}>
                    <td className="px-2 py-2 text-muted-foreground font-mono rounded-lg">{slot.slice(0, 5)}</td>
                    {DIAS_SEMANA.map(dia => {
                      const prog = getProgramaForSlot(dia, slot);
                      const isOnAir = prog && dia === diaAtual && currentTimeStr >= prog.horarioInicio && currentTimeStr < prog.horarioFim;
                      return (
                        <td key={dia} className={`px-1 py-1 text-center rounded-lg transition-all border-2 hover:border-[#d4f959] ${
                          isOnAir ? "font-bold" :
                          prog ? "bg-primary/10 text-foreground border-transparent" : "border-transparent"
                        }`}
                        style={{
                          backgroundColor: isOnAir ? "#d4f959" : undefined,
                          color: isOnAir ? "#333" : undefined,
                          borderColor: isOnAir ? "#d4f959" : undefined,
                        }}>
                          {prog ? (
                            <div className="flex items-center justify-between gap-0.5 group/cell">
                              <span className="text-[10px] truncate">{prog.nome}</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    onClick={(e) => e.stopPropagation()}
                                    className="opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0"
                                  >
                                    <Info size={10} className="text-white" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-96 p-0 overflow-hidden" side="right" align="start">
                                  <div className="flex">
                                    {prog.capa && (
                                      <img src={prog.capa} alt={prog.nome} className="w-36 h-auto object-cover shrink-0" />
                                    )}
                                    <div className="p-3 space-y-1.5 flex-1 min-w-0">
                                      <p className="font-bold text-sm text-foreground">{prog.nome}</p>
                                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Clock size={10} /> {prog.horarioInicio.slice(0, 5)} — {prog.horarioFim.slice(0, 5)}
                                      </p>
                                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Calendar size={10} /> {prog.diasSemana.join(", ")}
                                      </p>
                                      {prog.descricao && (
                                        <p className="text-xs text-muted-foreground italic border-t border-border pt-1.5 mt-1.5">{prog.descricao}</p>
                                      )}
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loadingData ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 size={20} className="animate-spin text-primary" />
          <span className="text-muted-foreground text-sm">Carregando programas cadastrados...</span>
        </div>
      ) : programas.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium text-foreground">Programas Cadastrados</h4>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-[180px] h-8 text-sm">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="horario">Horário</SelectItem>
                <SelectItem value="nome">Ordem Alfabética</SelectItem>
                <SelectItem value="estudio">Estúdio</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedProgramas.map((p) => (
              <div key={p.id} className={`bg-muted rounded-xl border overflow-hidden ${p.ativo ? "border-border" : "border-destructive/30 opacity-60"}`}>
                <div className="px-4 py-3 font-bold text-sm bg-primary text-primary-foreground flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {p.selo && <img src={p.selo} alt="Selo" className="h-6 rounded grayscale brightness-50" />}
                    <span>{p.nome}</span>
                    {p.variavel && <span className="text-[9px] bg-white/20 px-1.5 py-0.5 rounded">Variável</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(p)} title="Editar"><Pencil size={14} /></button>
                    <button onClick={() => toggleAtivo(p.id, p.ativo)} title={p.ativo ? "Desativar" : "Ativar"}>
                      <Power size={14} className={p.ativo ? "" : "text-red-300"} />
                    </button>
                    <button onClick={() => removePrograma(p.id)} title="Remover"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <p className="text-foreground">Apresentador: {getApresentadorNome(p.apresentadorId)}</p>
                  <p className="text-muted-foreground flex items-center gap-1"><Building2 size={12} /> {p.estudio}</p>
                  <p className="text-muted-foreground flex items-center gap-1"><Calendar size={12} /> {p.variavel && p.dataVariavel ? `${format(new Date(p.dataVariavel + "T12:00:00"), "dd/MM/yyyy (EEEE)", { locale: ptBR })}` : p.diasSemana.join(", ")}</p>
                  <p className="text-muted-foreground flex items-center gap-1"><Clock size={12} /> {p.horarioInicio} — {p.horarioFim}</p>
                  {p.descricao && <p className="text-muted-foreground text-xs italic">{p.descricao}</p>}
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                    p.ativo ? "bg-primary/20 text-primary" : "bg-destructive/20 text-destructive"
                  }`}>
                    {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
