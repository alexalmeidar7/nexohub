import { useState, useEffect } from "react";
import { AlertCircle, Trash2, Clock, Calendar, Building2 } from "lucide-react";
import { getApresentadores, type Apresentador } from "./ApresentadorForm";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Programa {
  id: string;
  nome: string;
  apresentadorId: string;
  selo: string;
  diasSemana: string[];
  horarioInicio: string;
  horarioFim: string;
  estudio: string;
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
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [conflictMsg, setConflictMsg] = useState("");

  const load = async () => {
    const [ap, pg] = await Promise.all([getApresentadores(), getProgramas()]);
    setApresentadores(ap);
    setProgramas(pg);
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

  const handleAdd = async () => {
    if (!nome.trim() || !user) return;
    if (!horarioInicio || !horarioFim) { setConflictMsg("Preencha o horário de início e fim."); return; }
    if (horarioInicio >= horarioFim) { setConflictMsg("O horário de início deve ser antes do fim."); return; }
    if (diasSemana.length === 0) { setConflictMsg("Selecione ao menos um dia da semana."); return; }
    if (!estudio.trim()) { setConflictMsg("Informe o estúdio."); return; }

    const conflict = checkConflict(programas, diasSemana, horarioInicio, horarioFim, estudio.trim());
    if (conflict) { setConflictMsg(`Conflito com "${conflict.nome}" no mesmo estúdio e horário.`); return; }

    await supabase.from("programas").insert({
      user_id: user.id,
      nome: nome.trim(),
      apresentador_id: apresentadorId || null,
      selo,
      dias_semana: diasSemana,
      horario_inicio: horarioInicio,
      horario_fim: horarioFim,
      estudio: estudio.trim(),
    });
    await load();
    setNome(""); setApresentadorId(""); setSelo(""); setDiasSemana([]); setHorarioInicio(""); setHorarioFim(""); setEstudio(""); setConflictMsg("");
  };

  const removePrograma = async (id: string) => {
    await supabase.from("programas").delete().eq("id", id);
    await load();
  };

  const getApresentadorNome = (id: string) => apresentadores.find(a => a.id === id)?.nome || "—";

  return (
    <div className="animate-fade-in space-y-6">
      <div className="max-w-lg space-y-4">
        <h3 className="text-xl mb-4 text-primary">Cadastro de Programa</h3>
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
          <label className="block text-muted-foreground text-xs mb-2">Selo do Programa</label>
          <input type="file" accept="image/*" onChange={handleSelo}
            className="w-full bg-muted border border-border p-2 rounded-lg text-foreground text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:text-primary-foreground file:px-3 file:py-1 file:font-bold file:text-xs" />
          {selo && <img src={selo} alt="Selo" className="mt-2 h-16 rounded border border-border" />}
        </div>
        <div className="flex items-center gap-2">
          <Building2 size={18} className="text-muted-foreground" />
          <input value={estudio} onChange={(e) => setEstudio(e.target.value)} placeholder="Estúdio (ex: Estúdio A)"
            className="flex-1 bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
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
            <input type="time" value={horarioInicio} onChange={(e) => setHorarioInicio(e.target.value)}
              className="w-full bg-muted border border-border p-3 rounded-lg text-foreground outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-muted-foreground text-xs mb-1 flex items-center gap-1"><Clock size={12} /> Fim</label>
            <input type="time" value={horarioFim} onChange={(e) => setHorarioFim(e.target.value)}
              className="w-full bg-muted border border-border p-3 rounded-lg text-foreground outline-none focus:ring-1 focus:ring-primary" />
          </div>
        </div>
        {conflictMsg && <p className="text-destructive text-sm flex items-center gap-1"><AlertCircle size={14} /> {conflictMsg}</p>}
        <button onClick={handleAdd} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-bold hover:brightness-95 transition-all">
          Adicionar Programa
        </button>
      </div>

      {programas.length > 0 && (
        <div>
          <h4 className="text-lg font-medium text-foreground mb-4">Programas Cadastrados</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {programas.map((p) => (
              <div key={p.id} className="bg-muted rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 font-bold text-sm bg-primary text-primary-foreground flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {p.selo && <img src={p.selo} alt="Selo" className="h-6 rounded grayscale brightness-50" />}
                    <span>{p.nome}</span>
                  </div>
                  <button onClick={() => removePrograma(p.id)} title="Remover"><Trash2 size={14} /></button>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <p className="text-foreground">Apresentador: {getApresentadorNome(p.apresentadorId)}</p>
                  <p className="text-muted-foreground flex items-center gap-1"><Building2 size={12} /> {p.estudio}</p>
                  <p className="text-muted-foreground flex items-center gap-1"><Calendar size={12} /> {p.diasSemana.join(", ")}</p>
                  <p className="text-muted-foreground flex items-center gap-1"><Clock size={12} /> {p.horarioInicio} — {p.horarioFim}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
