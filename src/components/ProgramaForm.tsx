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
  const [showSuccess, setShowSuccess] = useState(false);

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
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
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
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
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
        <h3 className="text-xl mb-4" style={{ color: "#0d0446" }}>
          {editingId ? "Editar Programa" : "Cadastro de Programa"}
        </h3>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do Programa"
          className="w-full px-4 py-1.5 outline-none transition-colors text-sm"
          style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}
          onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
        />
        <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição do Programa (opcional)"
          className="min-h-[60px] px-4 py-2 outline-none transition-colors text-sm"
          style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "16px" }}
          onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
        />

        <div>
          <label className="block text-xs mb-1" style={{ color: "#0d0446", fontWeight: 600 }}>Apresentador Responsável</label>
          <Select value={apresentadorId || "none"} onValueChange={(v) => setApresentadorId(v === "none" ? "" : v)}>
            <SelectTrigger className="w-full h-8" style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "none" }}>
              <SelectValue placeholder="Selecionar Apresentador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {apresentadores.filter(a => a.ativo).map(a => (
                <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-xs mb-2" style={{ color: "#0d0446", fontWeight: 600 }}>Selo do Programa (1080 x 1080 px - PNG com fundo alpha)</label>
          <input type="file" accept="image/*" onChange={handleSelo}
            className="w-full p-2 text-sm file:mr-3 file:rounded-full file:border-0 file:px-3 file:py-1 file:font-bold file:text-xs"
            style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}
          />
          {selo && <img src={selo} alt="Selo" className="mt-2 h-16 rounded" style={{ border: "1px solid #0d0446" }} />}
        </div>
        <div>
          <label className="block text-xs mb-2" style={{ color: "#0d0446", fontWeight: 600 }}>Capa do Programa (1080 x 1080 px - PNG com fundo alpha)</label>
          <input type="file" accept="image/*" onChange={handleCapa}
            className="w-full p-2 text-sm file:mr-3 file:rounded-full file:border-0 file:px-3 file:py-1 file:font-bold file:text-xs"
            style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}
          />
          {capa && <img src={capa} alt="Capa" className="mt-2 h-16 rounded" style={{ border: "1px solid #0d0446" }} />}
        </div>

        <div>
          <label className="block text-xs mb-1 flex items-center gap-1" style={{ color: "#0d0446", fontWeight: 600 }}>
            <Building2 size={14} /> Estúdio
          </label>
          <div className="flex gap-2">
            <Select value={estudio} onValueChange={setEstudio}>
              <SelectTrigger className="flex-1 h-8" style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "none" }}>
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
                <button className="px-4 py-1 text-sm font-bold transition-all shrink-0"
                  style={{ backgroundColor: "#0d0446", color: "#ffffff", border: "2px solid #0d0446", borderRadius: "20px" }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "#0d0446"; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
                >+ Novo</button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle style={{ color: "#0d0446" }}>Cadastrar Estúdio</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <input value={newEstudio} onChange={(e) => setNewEstudio(e.target.value)} placeholder="Nome do estúdio"
                    className="w-full px-4 py-1.5 outline-none transition-colors text-sm"
                    style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}
                    onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
                  />
                  <button onClick={addEstudio} className="w-full py-2 font-bold transition-all"
                    style={{ backgroundColor: "#0d0446", color: "#ffffff", border: "2px solid #0d0446", borderRadius: "20px" }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "#0d0446"; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
                  >Adicionar</button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div>
          <label className="block text-xs mb-2 flex items-center gap-1" style={{ color: "#0d0446", fontWeight: 600 }}>
            <Calendar size={14} /> Dias da Semana
          </label>
          <div className="flex flex-wrap gap-2">
            {DIAS_SEMANA.map(dia => (
              <button key={dia} onClick={() => toggleDia(dia)}
                className="px-3 py-1 text-xs font-semibold transition-all"
                style={{
                  backgroundColor: diasSemana.includes(dia) ? "#0d0446" : "#ffffff",
                  color: diasSemana.includes(dia) ? "#ffffff" : "#0d0446",
                  border: `1px solid #0d0446`,
                  borderRadius: "20px",
                }}>
                {dia}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1 flex items-center gap-1" style={{ color: "#0d0446", fontWeight: 600 }}><Clock size={12} /> Início</label>
            <input type="time" step="1" value={horarioInicio} onChange={(e) => setHorarioInicio(e.target.value)}
              className="w-full px-4 py-1.5 outline-none transition-colors text-sm"
              style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}
              onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1 flex items-center gap-1" style={{ color: "#0d0446", fontWeight: 600 }}><Clock size={12} /> Fim</label>
            <input type="time" step="1" value={horarioFim} onChange={(e) => setHorarioFim(e.target.value)}
              className="w-full px-4 py-1.5 outline-none transition-colors text-sm"
              style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}
              onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
            />
          </div>
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer" style={{ color: "#0d0446" }}>
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="w-4 h-4" style={{ accentColor: "#0d0446" }} />
            Programa Ativo
          </label>
          <label className="flex items-center gap-2 cursor-pointer" style={{ color: "#0d0446" }}>
            <input type="checkbox" checked={variavel} onChange={(e) => { setVariavel(e.target.checked); if (!e.target.checked) setDataVariavel(undefined); }} className="w-4 h-4" style={{ accentColor: "#0d0446" }} />
            Programa Variável
          </label>
        </div>

        {variavel && (
          <div className="space-y-2">
            <label className="block text-xs flex items-center gap-1" style={{ color: "#0d0446", fontWeight: 600 }}>
              <CalendarDays size={14} /> Data do Programa Variável
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <button className={cn("w-full justify-start text-left font-normal flex items-center gap-2 px-4 py-1.5 text-sm")}
                  style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}>
                  <CalendarDays className="h-4 w-4" />
                  {dataVariavel ? format(dataVariavel, "dd/MM/yyyy (EEEE)", { locale: ptBR }) : "Selecione a data"}
                </button>
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
            <p className="text-xs px-3 py-2 rounded-lg" style={{ color: "#0d0446", backgroundColor: "rgba(13,4,70,0.05)", border: "1px solid rgba(13,4,70,0.1)" }}>
              ⚠️ Este programa substituirá o programa fixo neste horário apenas na data selecionada. O programa anterior voltará automaticamente após essa data.
            </p>
          </div>
        )}

        {conflictMsg && <p className="text-sm flex items-center gap-1" style={{ color: "#dc2626" }}><AlertCircle size={14} /> {conflictMsg}</p>}
        <div className="flex gap-2 items-center">
          <button onClick={handleAdd} disabled={saving}
            className="px-6 py-2 font-bold transition-all flex items-center gap-2 disabled:opacity-70"
            style={{ backgroundColor: "#0d0446", color: "#ffffff", border: "2px solid #0d0446", borderRadius: "20px" }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "#0d0446"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Salvando..." : editingId ? "Atualizar Programa" : "Adicionar Programa"}
          </button>
          {editingId && (
            <button onClick={resetForm}
              className="px-4 py-2 font-bold transition-all flex items-center gap-1"
              style={{ backgroundColor: "#ffffff", color: "#0d0446", border: "2px solid #0d0446", borderRadius: "20px" }}
            >
              <X size={14} /> Cancelar
            </button>
          )}
        </div>
      </div>

      {/* Grade de Programação */}
      {loadingData ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 size={20} className="animate-spin" style={{ color: "#0d0446" }} />
          <span className="text-sm" style={{ color: "rgba(13,4,70,0.5)" }}>Carregando grade de programação...</span>
        </div>
      ) : programas.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium" style={{ color: "#0d0446" }}>Grade de Programação</h4>
            <Select value={gradeEstudioFilter} onValueChange={setGradeEstudioFilter}>
              <SelectTrigger className="w-[200px]" style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "none", fontSize: "14px", height: "28px", padding: "0 12px" }}>
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
            className="rounded-xl overflow-auto max-h-[300px]"
            style={{ border: "1px solid rgba(13,4,70,0.1)", backgroundColor: "#ffffff" }}
          >
            <table className="w-full text-xs border-separate border-spacing-1">
              <thead className="sticky top-0 z-10" style={{ backgroundColor: "#ffffff" }}>
                <tr>
                  <th className="px-2 py-2 text-left w-20 rounded-lg" style={{ color: "#0d0446" }}>Horário</th>
                  {DIAS_SEMANA.map(dia => (
                    <th key={dia} className={`px-2 py-2 text-center rounded-lg ${dia === diaAtual ? "font-bold" : ""}`} style={{ color: dia === diaAtual ? "#2dbef3" : "#0d0446" }}>
                      <div>{dia.slice(0, 3)}</div>
                      <div className="text-[9px] font-normal opacity-70">{weekDates[dia]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gradeSlots.map(slot => (
                  <tr key={slot}>
                    <td className="px-2 py-2 font-mono rounded-lg" style={{ color: "rgba(13,4,70,0.5)" }}>{slot.slice(0, 5)}</td>
                    {DIAS_SEMANA.map(dia => {
                      const prog = getProgramaForSlot(dia, slot);
                      const isOnAir = prog && dia === diaAtual && currentTimeStr >= prog.horarioInicio && currentTimeStr < prog.horarioFim;
                      return (
                        <td key={dia} className={`px-1 py-1 text-center rounded-lg transition-all border-2 hover:border-[#2dbef3] ${
                          prog && !isOnAir ? "border-transparent" : "border-transparent"
                        }`}
                        style={{
                          backgroundColor: isOnAir ? "#2dbef3" : prog ? "rgba(13,4,70,0.05)" : undefined,
                          color: isOnAir ? "#ffffff" : "#0d0446",
                          fontWeight: isOnAir ? "bold" : undefined,
                          borderColor: isOnAir ? "#2dbef3" : undefined,
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
                                    <Info size={10} style={{ color: isOnAir ? "#ffffff" : "#0d0446" }} />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-96 p-0 overflow-hidden" side="right" align="start">
                                  <div className="flex">
                                    {prog.capa && (
                                      <img src={prog.capa} alt={prog.nome} className="w-36 h-auto object-cover shrink-0" />
                                    )}
                                    <div className="p-3 space-y-1.5 flex-1 min-w-0">
                                      <p className="font-bold text-sm" style={{ color: "#0d0446" }}>{prog.nome}</p>
                                      <p className="text-xs flex items-center gap-1" style={{ color: "rgba(13,4,70,0.5)" }}>
                                        <Clock size={10} /> {prog.horarioInicio.slice(0, 5)} — {prog.horarioFim.slice(0, 5)}
                                      </p>
                                      <p className="text-xs flex items-center gap-1" style={{ color: "rgba(13,4,70,0.5)" }}>
                                        <Calendar size={10} /> {prog.diasSemana.join(", ")}
                                      </p>
                                      {prog.descricao && (
                                        <p className="text-xs italic border-t pt-1.5 mt-1.5" style={{ color: "rgba(13,4,70,0.5)", borderColor: "rgba(13,4,70,0.1)" }}>{prog.descricao}</p>
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
          <Loader2 size={20} className="animate-spin" style={{ color: "#0d0446" }} />
          <span className="text-sm" style={{ color: "rgba(13,4,70,0.5)" }}>Carregando programas cadastrados...</span>
        </div>
      ) : programas.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium" style={{ color: "#0d0446" }}>Programas Cadastrados</h4>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-[180px]" style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "none", fontSize: "14px", height: "28px", padding: "0 12px" }}>
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
              <div key={p.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", border: `1px solid ${p.ativo ? "rgba(13,4,70,0.1)" : "rgba(220,38,38,0.3)"}`, opacity: p.ativo ? 1 : 0.6 }}>
                <div className="px-4 py-3 font-bold text-sm flex items-center justify-between" style={{ backgroundColor: "#0d0446", color: "#ffffff" }}>
                  <div className="flex items-center gap-2">
                    {p.selo && <img src={p.selo} alt="Selo" className="h-6 rounded grayscale brightness-50" />}
                    <span>{p.nome}</span>
                    {p.variavel && <span className="text-[9px] bg-white/20 px-1.5 py-0.5 rounded">Variável</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(p)} title="Editar" className="hover:opacity-70 transition-opacity"><Pencil size={14} /></button>
                    <button onClick={() => toggleAtivo(p.id, p.ativo)} title={p.ativo ? "Desativar" : "Ativar"} className="hover:opacity-70 transition-opacity">
                      <Power size={14} className={p.ativo ? "" : "text-red-300"} />
                    </button>
                    <button onClick={() => removePrograma(p.id)} title="Remover" className="hover:opacity-70 transition-opacity"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <p style={{ color: "#0d0446" }}>Apresentador: {getApresentadorNome(p.apresentadorId)}</p>
                  <p className="flex items-center gap-1" style={{ color: "rgba(13,4,70,0.5)" }}><Building2 size={12} /> {p.estudio}</p>
                  <p className="flex items-center gap-1" style={{ color: "rgba(13,4,70,0.5)" }}><Calendar size={12} /> {p.variavel && p.dataVariavel ? `${format(new Date(p.dataVariavel + "T12:00:00"), "dd/MM/yyyy (EEEE)", { locale: ptBR })}` : p.diasSemana.join(", ")}</p>
                  <p className="flex items-center gap-1" style={{ color: "rgba(13,4,70,0.5)" }}><Clock size={12} /> {p.horarioInicio} — {p.horarioFim}</p>
                  {p.descricao && <p className="text-xs italic" style={{ color: "rgba(13,4,70,0.5)" }}>{p.descricao}</p>}
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                    p.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                  }`}>
                    {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
          <div className="flex flex-col items-center justify-center animate-fade-in overflow-hidden"
            style={{ width: "450px", height: "165px", backgroundColor: "rgba(13, 4, 70, 0.92)", borderRadius: "16px" }}>
            <div className="flex items-center gap-3 flex-1 justify-center" style={{ fontSize: "14px", color: "#ffffff", fontWeight: 600 }}>
              <CheckCircle size={22} /> Salvo com sucesso!
            </div>
            <div className="w-full" style={{ height: "4px", backgroundColor: "rgba(255,255,255,0.15)" }}>
              <div style={{ height: "100%", backgroundColor: "#2dbff4", animation: "shrinkBar 2s linear forwards" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
