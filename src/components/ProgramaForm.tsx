import { useState, useEffect, useMemo } from "react";
import { AlertCircle, Trash2, Clock, Calendar, Building2, Pencil, X, ChevronUp, ChevronDown, Power } from "lucide-react";
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
import { Button } from "@/components/ui/button";

interface Programa {
  id: string;
  nome: string;
  apresentadorId: string;
  selo: string;
  diasSemana: string[];
  horarioInicio: string;
  horarioFim: string;
  estudio: string;
  ativo: boolean;
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
    diasSemana: p.dias_semana || [],
    horarioInicio: p.horario_inicio,
    horarioFim: p.horario_fim,
    estudio: p.estudio || "",
    ativo: (p as any).ativo ?? true,
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
  const [diasSemana, setDiasSemana] = useState<string[]>([]);
  const [horarioInicio, setHorarioInicio] = useState("");
  const [horarioFim, setHorarioFim] = useState("");
  const [estudio, setEstudio] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [conflictMsg, setConflictMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Estúdio management
  const [estudios, setEstudios] = useState<string[]>([]);
  const [newEstudio, setNewEstudio] = useState("");
  const [estudioDialogOpen, setEstudioDialogOpen] = useState(false);

  // Grade scroll
  const [gradeStartIdx, setGradeStartIdx] = useState(0);
  const GRADE_VISIBLE_ROWS = 5;

  const load = async () => {
    const [ap, pg] = await Promise.all([getApresentadores(), getProgramas()]);
    setApresentadores(ap);
    pg.sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));
    setProgramas(pg);
    // Extract unique estúdios
    const allEstudios = Array.from(new Set(pg.map(p => p.estudio).filter(Boolean)));
    setEstudios(prev => {
      const merged = Array.from(new Set([...prev, ...allEstudios]));
      return merged.sort();
    });
  };

  useEffect(() => { load(); }, []);

  const handleSelo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSelo(reader.result as string);
    reader.readAsDataURL(file);
  };

  const toggleDia = (dia: string) => {
    setDiasSemana(prev => prev.includes(dia) ? prev.filter(d => d !== dia) : [...prev, dia]);
  };

  const resetForm = () => {
    setNome(""); setApresentadorId(""); setSelo(""); setDiasSemana([]); setHorarioInicio(""); setHorarioFim(""); setEstudio(""); setAtivo(true); setConflictMsg(""); setEditingId(null);
  };

  const handleAdd = async () => {
    if (!nome.trim() || !user) return;
    if (!horarioInicio || !horarioFim) { setConflictMsg("Preencha o horário de início e fim."); return; }
    if (horarioInicio >= horarioFim) { setConflictMsg("O horário de início deve ser antes do fim."); return; }
    if (diasSemana.length === 0) { setConflictMsg("Selecione ao menos um dia da semana."); return; }
    if (!estudio.trim()) { setConflictMsg("Informe o estúdio."); return; }

    const conflict = checkConflict(programas, diasSemana, horarioInicio, horarioFim, estudio.trim(), editingId || undefined);
    if (conflict) { setConflictMsg(`Conflito com "${conflict.nome}" no mesmo estúdio e horário.`); return; }

    if (editingId) {
      await supabase.from("programas").update({
        nome: nome.trim(),
        apresentador_id: apresentadorId || null,
        selo,
        dias_semana: diasSemana,
        horario_inicio: horarioInicio,
        horario_fim: horarioFim,
        estudio: estudio.trim(),
        ativo,
      } as any).eq("id", editingId);
    } else {
      await supabase.from("programas").insert({
        user_id: user.id,
        nome: nome.trim(),
        apresentador_id: apresentadorId || null,
        selo,
        dias_semana: diasSemana,
        horario_inicio: horarioInicio,
        horario_fim: horarioFim,
        estudio: estudio.trim(),
        ativo,
      } as any);
    }
    await load();
    resetForm();
  };

  const startEdit = (p: Programa) => {
    setEditingId(p.id);
    setNome(p.nome);
    setApresentadorId(p.apresentadorId);
    setSelo(p.selo);
    setDiasSemana(p.diasSemana);
    setHorarioInicio(p.horarioInicio);
    setHorarioFim(p.horarioFim);
    setEstudio(p.estudio);
    setAtivo(p.ativo);
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

  const getProgramaForSlot = (dia: string, slotTime: string) => {
    return programas.find(p =>
      p.diasSemana.includes(dia) &&
      slotTime >= p.horarioInicio &&
      slotTime < p.horarioFim
    );
  };

  const visibleSlots = gradeSlots.slice(gradeStartIdx, gradeStartIdx + GRADE_VISIBLE_ROWS);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="max-w-lg space-y-4">
        <h3 className="text-xl mb-4 text-primary">
          {editingId ? "Editar Programa" : "Cadastro de Programa"}
        </h3>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do Programa"
          className="w-full bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
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

        {/* Estúdio combo */}
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

        <label className="flex items-center gap-2 cursor-pointer text-foreground">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="w-4 h-4 accent-primary" />
          Programa Ativo
        </label>

        {conflictMsg && <p className="text-destructive text-sm flex items-center gap-1"><AlertCircle size={14} /> {conflictMsg}</p>}
        <div className="flex gap-2">
          <button onClick={handleAdd} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-bold hover:brightness-95 transition-all">
            {editingId ? "Atualizar Programa" : "Adicionar Programa"}
          </button>
          {editingId && (
            <button onClick={resetForm} className="bg-muted border border-border text-foreground px-4 py-2 rounded-lg font-bold hover:brightness-95 transition-all flex items-center gap-1">
              <X size={14} /> Cancelar
            </button>
          )}
        </div>
      </div>

      {/* Grade de Programação */}
      {programas.length > 0 && (
        <div>
          <h4 className="text-lg font-medium text-foreground mb-4">Grade de Programação</h4>
          <div className="bg-muted rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <button onClick={() => setGradeStartIdx(Math.max(0, gradeStartIdx - GRADE_VISIBLE_ROWS))}
                disabled={gradeStartIdx === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                <ChevronUp size={18} />
              </button>
              <span className="text-xs text-muted-foreground">
                {visibleSlots[0]?.slice(0, 5)} — {visibleSlots[visibleSlots.length - 1]?.slice(0, 5)}
              </span>
              <button onClick={() => setGradeStartIdx(Math.min(gradeSlots.length - GRADE_VISIBLE_ROWS, gradeStartIdx + GRADE_VISIBLE_ROWS))}
                disabled={gradeStartIdx >= gradeSlots.length - GRADE_VISIBLE_ROWS}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                <ChevronDown size={18} />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left text-muted-foreground w-20">Horário</th>
                    {DIAS_SEMANA.map(dia => (
                      <th key={dia} className={`px-2 py-2 text-center ${dia === diaAtual ? "text-primary font-bold" : "text-muted-foreground"}`}>
                        {dia.slice(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleSlots.map(slot => (
                    <tr key={slot} className="border-b border-border/50">
                      <td className="px-2 py-2 text-muted-foreground font-mono">{slot.slice(0, 5)}</td>
                      {DIAS_SEMANA.map(dia => {
                        const prog = getProgramaForSlot(dia, slot);
                        const isOnAir = prog && dia === diaAtual && currentTimeStr >= prog.horarioInicio && currentTimeStr < prog.horarioFim;
                        return (
                          <td key={dia} className={`px-1 py-1 text-center ${
                            isOnAir ? "bg-green-200 text-green-900 font-bold" :
                            prog ? "bg-primary/10 text-foreground" : ""
                          }`}>
                            {prog ? (
                              <span className="text-[10px] truncate block">{prog.nome}</span>
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
        </div>
      )}

      {programas.length > 0 && (
        <div>
          <h4 className="text-lg font-medium text-foreground mb-4">Programas Cadastrados</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {programas.map((p) => (
              <div key={p.id} className={`bg-muted rounded-xl border overflow-hidden ${p.ativo ? "border-border" : "border-destructive/30 opacity-60"}`}>
                <div className="px-4 py-3 font-bold text-sm bg-primary text-primary-foreground flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {p.selo && <img src={p.selo} alt="Selo" className="h-6 rounded grayscale brightness-50" />}
                    <span>{p.nome}</span>
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
                  <p className="text-muted-foreground flex items-center gap-1"><Calendar size={12} /> {p.diasSemana.join(", ")}</p>
                  <p className="text-muted-foreground flex items-center gap-1"><Clock size={12} /> {p.horarioInicio} — {p.horarioFim}</p>
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
