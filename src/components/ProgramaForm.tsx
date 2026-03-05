import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Trash2, Clock, Calendar, Building2, Pencil, X, Power, Loader2, Info, CalendarDays, CheckCircle, ChevronsUpDown, Check } from "lucide-react";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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

// Grade body with merged cells for same program across consecutive time slots
function GradeBody({ gradeSlots, diasSemana, diaAtual, currentTimeStr, getProgramaForSlot, apresentadores }: {
  gradeSlots: string[];
  diasSemana: string[];
  diaAtual: string;
  currentTimeStr: string;
  getProgramaForSlot: (dia: string, slot: string) => Programa | undefined;
  apresentadores: Apresentador[];
}) {
  const [detailProg, setDetailProg] = useState<Programa | null>(null);

  // Pre-compute skip/span maps per column
  const { skipMap, spanMap } = useMemo(() => {
    const skip: Record<string, boolean> = {};
    const span: Record<string, { prog: Programa; rowSpan: number }> = {};

    diasSemana.forEach(dia => {
      let i = 0;
      while (i < gradeSlots.length) {
        const slot = gradeSlots[i];
        const prog = getProgramaForSlot(dia, slot);
        if (prog) {
          let s = 1;
          while (i + s < gradeSlots.length) {
            const nextProg = getProgramaForSlot(dia, gradeSlots[i + s]);
            if (nextProg && nextProg.id === prog.id) {
              skip[`${dia}-${gradeSlots[i + s]}`] = true;
              s++;
            } else break;
          }
          span[`${dia}-${slot}`] = { prog, rowSpan: s };
          i += s;
        } else {
          i++;
        }
      }
    });
    return { skipMap: skip, spanMap: span };
  }, [gradeSlots, diasSemana, getProgramaForSlot]);

  const getPresenterName = (apresentadorId: string) => {
    if (!apresentadorId) return null;
    const ap = apresentadores.find(a => a.id === apresentadorId);
    return ap ? ap.nome : null;
  };

  const getPresenter = (apresentadorId: string) => {
    if (!apresentadorId) return null;
    return apresentadores.find(a => a.id === apresentadorId) || null;
  };

  return (
    <>
      <tbody>
        {gradeSlots.map((slot) => {
          const slotParts = slot.split(":");
          const slotMinutes = parseInt(slotParts[0]) * 60 + parseInt(slotParts[1]);
          const nextSlotMinutes = slotMinutes + 30;
          const currentParts = currentTimeStr.split(":");
          const currentMinutes = parseInt(currentParts[0]) * 60 + parseInt(currentParts[1]);
          const isNeedleRow = currentMinutes >= slotMinutes && currentMinutes < nextSlotMinutes;

          return (
            <tr key={slot} data-needle-row={isNeedleRow ? "true" : undefined} data-needle-percent={isNeedleRow ? ((currentMinutes - slotMinutes) / 30) * 100 : undefined}>
              <td className="px-2 py-2 font-mono rounded-lg" style={{ color: "rgba(13,4,70,0.5)" }}>{slot.slice(0, 5)}</td>
              {diasSemana.map(dia => {
                const key = `${dia}-${slot}`;
                if (skipMap[key]) return null;
                const cellData = spanMap[key];
                if (!cellData) return <td key={dia} className="px-1 py-1 rounded-lg" />;
                const { prog, rowSpan } = cellData;
                const isOnAir = prog && dia === diaAtual && currentTimeStr >= prog.horarioInicio && currentTimeStr < prog.horarioFim;
                const presenterName = getPresenterName(prog.apresentadorId);
                return (
                  <td key={dia} rowSpan={rowSpan}
                    className="rounded-lg transition-all relative hover:!border-[#2dbef3] hover:border-2"
                    style={{
                      backgroundColor: isOnAir ? "#2dbef3" : "#ffffff",
                      color: isOnAir ? "#ffffff" : "#0d0446",
                      fontWeight: isOnAir ? "bold" : undefined,
                      border: isOnAir ? "2px solid #2dbef3" : "1px solid #ccc",
                      verticalAlign: "top",
                      padding: "8px 10px",
                    }}>
                    <div className="text-[10px] font-bold leading-tight" style={{ wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{prog.nome}</div>
                    <div className="text-[9px] mt-0.5" style={{ color: isOnAir ? "rgba(255,255,255,0.8)" : "rgba(13,4,70,0.5)" }}>
                      {prog.horarioInicio.slice(0, 5)} - {prog.horarioFim.slice(0, 5)}
                    </div>
                    {presenterName && (
                      <div className="text-[9px] font-semibold mt-0.5" style={{ color: isOnAir ? "rgba(255,255,255,0.9)" : "#0d0446" }}>
                        {presenterName}
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setDetailProg(prog); }}
                      className="mt-1 px-2 py-0.5 rounded text-[8px] font-bold flex items-center gap-1 transition-colors"
                      style={{ backgroundColor: "#0d0446", color: "#ffffff" }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#2dbef3"; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#0d0446"; }}
                    >
                      + informações
                    </button>
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>

      {/* Detail popup */}
      {detailProg && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setDetailProg(null)}>
          <div className="rounded-xl max-w-2xl w-full mx-4 relative" style={{ backgroundColor: "#ffffff", padding: "20px" }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setDetailProg(null)} className="absolute top-4 right-4 z-10 font-bold text-sm" style={{ color: "#0d0446" }}>
              <X size={18} />
            </button>
            <div className="flex gap-5">
              {detailProg.capa && (
                <img src={detailProg.capa} alt={detailProg.nome} className="w-48 h-48 object-cover rounded-lg shrink-0" />
              )}
              <div className="space-y-2 flex-1 min-w-0">
                <h2 className="text-lg font-bold pr-6" style={{ color: "#0d0446" }}>{detailProg.nome}</h2>
                <p className="text-xs flex items-center gap-1" style={{ color: "rgba(13,4,70,0.5)" }}>
                  <Clock size={12} /> {detailProg.horarioInicio.slice(0, 5)} — {detailProg.horarioFim.slice(0, 5)}
                </p>
                <p className="text-xs flex items-center gap-1" style={{ color: "rgba(13,4,70,0.5)" }}>
                  <Calendar size={12} /> {detailProg.diasSemana.join(", ")}
                </p>
                {getPresenterName(detailProg.apresentadorId) && (
                  <p className="text-xs font-semibold" style={{ color: "#0d0446" }}>
                    Locutor: {getPresenterName(detailProg.apresentadorId)}
                  </p>
                )}
                {detailProg.descricao && (
                  <p className="text-sm mt-2 leading-relaxed" style={{ color: "rgba(13,4,70,0.7)" }}>{detailProg.descricao}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </>
  );
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
  const [apresentadorComboOpen, setApresentadorComboOpen] = useState(false);

  // Grade filter
  const [gradeEstudioFilter, setGradeEstudioFilter] = useState("todos");
  const gradeRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<HTMLDivElement>(null);

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

  // Position the time needle
  useEffect(() => {
    if (loadingData || !gradeRef.current || !needleRef.current) return;
    const positionNeedle = () => {
      const container = gradeRef.current;
      const needle = needleRef.current;
      if (!container || !needle) return;
      const row = container.querySelector('tr[data-needle-row="true"]') as HTMLElement;
      if (!row) { needle.style.display = "none"; return; }
      const percent = parseFloat(row.dataset.needlePercent || "0");
      const containerRect = container.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const top = rowRect.top - containerRect.top + container.scrollTop + (rowRect.height * percent / 100);
      needle.style.display = "block";
      needle.style.top = `${top}px`;
    };
    positionNeedle();
    const interval = setInterval(positionNeedle, 5000);
    const scrollHandler = () => positionNeedle();
    gradeRef.current.addEventListener("scroll", scrollHandler);
    return () => {
      clearInterval(interval);
      gradeRef.current?.removeEventListener("scroll", scrollHandler);
    };
  }, [loadingData, programas, currentTimeStr]);

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
          <Popover open={apresentadorComboOpen} onOpenChange={setApresentadorComboOpen}>
            <PopoverTrigger asChild>
              <button
                className="w-full h-8 flex items-center justify-between px-4 text-sm"
                style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "none" }}
              >
                <span className={apresentadorId ? "" : "opacity-60"}>
                  {apresentadorId ? (apresentadores.find(a => a.id === apresentadorId)?.nome || "Selecionar") : "Selecionar Apresentador"}
                </span>
                <ChevronsUpDown size={14} className="opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" style={{ backgroundColor: "#0d0446", border: "1px solid #0d0446" }}>
              <Command style={{ backgroundColor: "#0d0446" }}>
                <CommandInput placeholder="Buscar apresentador..." className="text-white" style={{ color: "#ffffff" }} />
                <CommandList>
                  <CommandEmpty className="text-white/60 py-4 text-center text-sm">Nenhum encontrado.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem value="__none__" onSelect={() => { setApresentadorId(""); setApresentadorComboOpen(false); }} className="text-white data-[selected=true]:bg-white/20 data-[selected=true]:text-white">
                      <Check size={14} className={cn("mr-2", !apresentadorId ? "opacity-100" : "opacity-0")} />
                      Nenhum
                    </CommandItem>
                    {apresentadores.filter(a => a.ativo && a.cargo?.toLowerCase() !== "convidado").map(a => (
                      <CommandItem key={a.id} value={a.nome} onSelect={() => { setApresentadorId(a.id); setApresentadorComboOpen(false); }} className="text-white data-[selected=true]:bg-white/20 data-[selected=true]:text-white">
                        <Check size={14} className={cn("mr-2", apresentadorId === a.id ? "opacity-100" : "opacity-0")} />
                        {a.nome}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
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
              <SelectContent style={{ backgroundColor: "#0d0446", border: "1px solid #0d0446" }}>
                {estudios.map(e => (
                  <SelectItem key={e} value={e} className="text-white focus:bg-white/20 focus:text-white">{e}</SelectItem>
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
          <style>{`
            .grade-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
            .grade-scroll::-webkit-scrollbar-track { background: transparent; }
            .grade-scroll::-webkit-scrollbar-thumb { background: #0d0446; border-radius: 3px; }
            .grade-scroll::-webkit-scrollbar-thumb:hover { background: #2dbef3; }
            .grade-scroll::-webkit-scrollbar-button { display: none; }
          `}</style>
          <div
            ref={gradeRef}
            className="rounded-xl overflow-auto max-h-[300px] grade-scroll"
            style={{ border: "1px solid rgba(13,4,70,0.1)", backgroundColor: "#ffffff", scrollbarWidth: "thin", scrollbarColor: "#0d0446 transparent" }}
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
              <GradeBody
                gradeSlots={gradeSlots}
                diasSemana={DIAS_SEMANA}
                diaAtual={diaAtual}
                currentTimeStr={currentTimeStr}
                getProgramaForSlot={getProgramaForSlot}
                apresentadores={apresentadores}
              />
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
          <h4 className="text-lg font-medium mb-4" style={{ color: "#0d0446" }}>Programas Cadastrados</h4>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.1)" }}>
            <table className="w-full" style={{ fontSize: "12px" }}>
              <thead>
                <tr style={{ backgroundColor: "#0d0446", color: "#ffffff" }}>
                  <th className="px-4 py-3 text-left font-semibold">Nome do Programa</th>
                  <th className="px-4 py-3 text-left font-semibold">Dia de Exibição</th>
                  <th className="px-4 py-3 text-left font-semibold">Horário</th>
                  <th className="px-4 py-3 text-left font-semibold">Apresentador</th>
                  <th className="px-4 py-3 text-center font-semibold">Editar</th>
                  <th className="px-4 py-3 text-center font-semibold">Status</th>
                  <th className="px-4 py-3 text-center font-semibold">Excluir</th>
                </tr>
              </thead>
              <tbody>
                {sortedProgramas.map((p) => (
                  <tr key={p.id} className="border-b" style={{ backgroundColor: "#ffffff", borderColor: "rgba(13,4,70,0.08)", opacity: p.ativo ? 1 : 0.6 }}>
                    <td className="px-4 py-3 font-medium" style={{ color: "#0d0446" }}>
                      <div className="flex items-center gap-2">
                        {p.nome}
                        {p.variavel && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(13,4,70,0.1)", color: "#0d0446" }}>Variável</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: "rgba(13,4,70,0.6)" }}>
                      {p.variavel && p.dataVariavel
                        ? format(new Date(p.dataVariavel + "T12:00:00"), "dd/MM/yyyy (EEEE)", { locale: ptBR })
                        : p.diasSemana.join(", ")}
                    </td>
                    <td className="px-4 py-3" style={{ color: "rgba(13,4,70,0.6)" }}>
                      {p.horarioInicio.slice(0, 5)} — {p.horarioFim.slice(0, 5)}
                    </td>
                    <td className="px-4 py-3" style={{ color: "rgba(13,4,70,0.6)" }}>
                      {getApresentadorNome(p.apresentadorId)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => startEdit(p)} title="Editar" className="hover:opacity-70 transition-opacity" style={{ color: "#0d0446" }}>
                        <Pencil size={16} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleAtivo(p.id, p.ativo)} title={p.ativo ? "Desativar" : "Ativar"}>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold cursor-pointer ${
                          p.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                        }`}>
                          {p.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => removePrograma(p.id)} title="Remover" className="hover:opacity-70 transition-opacity" style={{ color: "#dc2626" }}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
