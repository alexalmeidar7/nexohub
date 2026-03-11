import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Plus, X, Users, FileText, Building2, Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

const NoticiasPanel = lazy(() => import("./NoticiasPanel"));

interface Apresentador {
  id: string;
  nome: string;
  cargo: string;
  ativo: boolean;
}

interface Programa {
  id: string;
  nome: string;
  estudio: string;
  tipo_programa: string | null;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: string[];
}

export default function RoteiroPrograma() {
  const { user } = useAuth();
  const [estudio, setEstudio] = useState("");
  const [programaNome, setProgramaNome] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [participantes, setParticipantes] = useState<{ nome: string; cargo: string }[]>([]);
  const [tipoPrograma, setTipoPrograma] = useState("");
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const [loading, setLoading] = useState(true);
  const [estudios, setEstudios] = useState<string[]>([]);
  const [tiposPrograma, setTiposPrograma] = useState<string[]>([]);
  const [showAddParticipante, setShowAddParticipante] = useState(false);
  const [newParticipanteNome, setNewParticipanteNome] = useState("");
  const [newParticipanteCargo, setNewParticipanteCargo] = useState("Apresentador");

  const isAgendado = selectedDate > new Date(new Date().toDateString());

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const [progRes, apresRes] = await Promise.all([
        supabase.from("programas").select("id, nome, estudio, tipo_programa, horario_inicio, horario_fim, dias_semana").eq("ativo", true),
        supabase.from("apresentadores").select("id, nome, cargo, ativo").eq("ativo", true),
      ]);
      const progs = progRes.data || [];
      const apres = apresRes.data || [];
      setProgramas(progs);
      setApresentadores(apres);

      // Extract unique studios and program types
      const uniqueEstudios = [...new Set(progs.map(p => p.estudio).filter(Boolean))] as string[];
      setEstudios(uniqueEstudios);
      const uniqueTipos = [...new Set(progs.map(p => p.tipo_programa).filter(Boolean))] as string[];
      setTiposPrograma(uniqueTipos);

      // Default participants from apresentadores
      setParticipantes(apres.map(a => ({ nome: a.nome, cargo: a.cargo || "Apresentador" })));
      setLoading(false);
    };
    load();
  }, [user]);

  const handleProgramaChange = (nome: string) => {
    setProgramaNome(nome);
    const prog = programas.find(p => p.nome === nome);
    if (prog) {
      if (prog.estudio) setEstudio(prog.estudio);
      if (prog.tipo_programa) setTipoPrograma(prog.tipo_programa);
    }
  };

  const removeParticipante = (idx: number) => {
    setParticipantes(prev => prev.filter((_, i) => i !== idx));
  };

  const addParticipante = () => {
    if (!newParticipanteNome.trim()) return;
    setParticipantes(prev => [...prev, { nome: newParticipanteNome.trim(), cargo: newParticipanteCargo }]);
    setNewParticipanteNome("");
    setNewParticipanteCargo("Apresentador");
    setShowAddParticipante(false);
  };

  if (loading) return <ModulePageSkeleton />;

  return (
    <div className="animate-fade-in space-y-4">
      {/* Header Card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#d9e9fa", boxShadow: "0 8px 32px rgba(13,4,70,0.12)", padding: "20px" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(13,4,70,0.08)" }}>
              <FileText size={20} style={{ color: "#0d0446" }} />
            </div>
            <div>
              <h3 className="text-lg font-bold" style={{ color: "#0d0446" }}>Roteiro de Programa</h3>
              <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.5)" }}>
                Estruture o roteiro do seu programa
                {isAgendado && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ backgroundColor: "rgba(38,143,250,0.15)", color: "#268ffa" }}>
                    Roteiro Agendado
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Form Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {/* Campo 1: Estúdio */}
          <div>
            <label className="text-[11px] font-bold mb-1 block" style={{ color: "#0d0446" }}>
              <Building2 size={11} className="inline mr-1" />Estúdio
            </label>
            <select
              value={estudio}
              onChange={e => setEstudio(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none transition-colors"
              style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446" }}
            >
              <option value="">Selecione o estúdio</option>
              {estudios.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          {/* Campo 2: Nome do Programa */}
          <div>
            <label className="text-[11px] font-bold mb-1 block" style={{ color: "#0d0446" }}>
              <FileText size={11} className="inline mr-1" />Programa
            </label>
            <select
              value={programaNome}
              onChange={e => handleProgramaChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none transition-colors"
              style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446" }}
            >
              <option value="">Selecione o programa</option>
              {programas.map(p => <option key={p.id} value={p.nome}>{p.nome}</option>)}
            </select>
          </div>

          {/* Campo 3: Data */}
          <div>
            <label className="text-[11px] font-bold mb-1 block" style={{ color: "#0d0446" }}>
              <CalendarIcon size={11} className="inline mr-1" />Data
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "w-full px-3 py-2 rounded-lg text-xs text-left flex items-center gap-2 outline-none transition-colors",
                  )}
                  style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446" }}
                >
                  <CalendarIcon size={12} style={{ color: "#268ffa" }} />
                  {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && setSelectedDate(d)}
                  locale={ptBR}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Campo 5: Tipo de Programa */}
          <div>
            <label className="text-[11px] font-bold mb-1 block" style={{ color: "#0d0446" }}>Tipo de Programa</label>
            <select
              value={tipoPrograma}
              onChange={e => setTipoPrograma(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none transition-colors"
              style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446" }}
            >
              <option value="">Selecione o tipo</option>
              {tiposPrograma.map(t => <option key={t} value={t}>{t}</option>)}
              {!tiposPrograma.includes("Jornalístico") && <option value="Jornalístico">Jornalístico</option>}
            </select>
          </div>
        </div>

      </div>

      {/* Conditional: Jornalístico shows NoticiasPanel */}
      {tipoPrograma === "Jornalístico" && (
        <Suspense fallback={<ModulePageSkeleton />}>
          <NoticiasPanel />
        </Suspense>
      )}

      {/* Add Participante Dialog */}
      <Dialog open={showAddParticipante} onOpenChange={setShowAddParticipante}>
        <DialogContent className="sm:max-w-md" style={{ backgroundColor: "#ffffff" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#0d0446" }}>Adicionar Participante</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-[11px] font-bold mb-1 block" style={{ color: "#0d0446" }}>Nome</label>
              <input
                value={newParticipanteNome}
                onChange={e => setNewParticipanteNome(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addParticipante(); }}
                placeholder="Nome do participante"
                className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                style={{ border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446" }}
                autoFocus
              />
            </div>
            <div>
              <label className="text-[11px] font-bold mb-1 block" style={{ color: "#0d0446" }}>Categoria</label>
              <select
                value={newParticipanteCargo}
                onChange={e => setNewParticipanteCargo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                style={{ border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446" }}
              >
                <option>Apresentador</option>
                <option>Jornalista</option>
                <option>Convidado</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowAddParticipante(false)} className="px-4 py-2 rounded-lg text-xs" style={{ color: "#0d0446" }}>
              Cancelar
            </button>
            <button
              onClick={addParticipante}
              disabled={!newParticipanteNome.trim()}
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff" }}
            >
              Adicionar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
