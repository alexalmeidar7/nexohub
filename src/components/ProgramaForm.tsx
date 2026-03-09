import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Trash2, Clock, Calendar, Building2, Pencil, X, Power, Loader2, Info, CalendarDays, CheckCircle, ChevronsUpDown, Check, PlaySquare } from "lucide-react";
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

const CLASSIFICACOES_ETARIAS = [
  { value: "AL", label: "AL — Livre para todos os públicos", color: "#14A44D", textColor: "#fff" },
  { value: "10", label: "10 — Não recomendado para menores de 10 anos", color: "#2563EB", textColor: "#fff" },
  { value: "12", label: "12 — Não recomendado para menores de 12 anos", color: "#EAB308", textColor: "#fff" },
  { value: "14", label: "14 — Não recomendado para menores de 14 anos", color: "#F97316", textColor: "#fff" },
  { value: "16", label: "16 — Não recomendado para menores de 16 anos", color: "#DC2626", textColor: "#fff" },
  { value: "18", label: "18 — Não recomendado para menores de 18 anos", color: "#1C1C1C", textColor: "#fff" },
];

function ClassificacaoBadge({ value, size = 20 }: { value: string; size?: number }) {
  const item = CLASSIFICACOES_ETARIAS.find(c => c.value === value);
  if (!item) return null;
  return (
    <span
      className="inline-flex items-center justify-center font-bold shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        backgroundColor: item.color,
        color: item.textColor,
        fontSize: size * 0.48,
        lineHeight: 1,
      }}
      title={item.label}
    >
      {item.value}
    </span>
  );
}

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
  classificacaoEtaria: string;
  tipoPrograma: string;
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
    classificacaoEtaria: (p as any).classificacao_etaria || "",
    tipoPrograma: (p as any).tipo_programa || "",
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
                    {prog.classificacaoEtaria && <div className="mt-0.5"><ClassificacaoBadge value={prog.classificacaoEtaria} size={14} /></div>}
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

  // Tipo do programa management
  const DEFAULT_TIPOS = ["Musical", "Jornalístico", "Entrevista", "Show", "Evento"];
  const TIPOS_STORAGE_KEY = "masterview_tipos_programa";
  const [tiposPrograma, setTiposPrograma] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TIPOS_STORAGE_KEY) || "null");
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch {}
    return DEFAULT_TIPOS;
  });
  const [tipoPrograma, setTipoPrograma] = useState("");
  const [newTipo, setNewTipo] = useState("");
  const [tipoDialogOpen, setTipoDialogOpen] = useState(false);

  // Classificação Etária
  const [classificacaoEtaria, setClassificacaoEtaria] = useState("");

  const addTipo = () => {
    const t = newTipo.trim();
    if (!t || tiposPrograma.includes(t)) return;
    const updated = [...tiposPrograma, t].sort((a, b) => a.localeCompare(b, "pt-BR"));
    setTiposPrograma(updated);
    localStorage.setItem(TIPOS_STORAGE_KEY, JSON.stringify(updated));
    setTipoPrograma(t);
    setNewTipo("");
    setTipoDialogOpen(false);
  };

  const [apresentadorComboOpen, setApresentadorComboOpen] = useState(false);

  // Grade filter
  const [gradeEstudioFilter, setGradeEstudioFilter] = useState("todos");
  const gradeRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<HTMLDivElement>(null);

  // Sorting
  const [sortBy, setSortBy] = useState<"horario" | "nome" | "estudio" | "status">("horario");

  const [currentTimeStr, setCurrentTimeStr] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}:${String(n.getSeconds()).padStart(2, "0")}`;
  });
  const now = new Date();
  const DIAS_MAP: Record<number, string> = { 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo" };
  const diaAtual = DIAS_MAP[now.getDay()];
  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Update currentTimeStr every 30 seconds for real-time needle
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setCurrentTimeStr(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}:${String(n.getSeconds()).padStart(2, "0")}`);
    };
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, []);

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
    const n = new Date();
    const currentSlotIndex = n.getHours() * 2 + (n.getMinutes() >= 30 ? 1 : 0);
    const rows = gradeRef.current.querySelectorAll("tbody tr");
    if (rows[currentSlotIndex]) {
      rows[currentSlotIndex].scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [loadingData, programas]);

  // Position the time needle using proportional tbody height
  useEffect(() => {
    if (loadingData || !gradeRef.current || !needleRef.current) return;

    const positionNeedle = () => {
      try {
        const container = gradeRef.current;
        const needle = needleRef.current;
        if (!container || !needle) return;

        const tbody = container.querySelector("tbody");
        if (!tbody) { needle.style.display = "none"; return; }

        const n = new Date();
        const currentMinutes = n.getHours() * 60 + n.getMinutes();
        const dayFraction = currentMinutes / (24 * 60); // 0..1 across the day

        const containerRect = container.getBoundingClientRect();
        const tbodyRect = tbody.getBoundingClientRect();
        const tbodyTop = tbodyRect.top - containerRect.top + container.scrollTop;
        const top = tbodyTop + tbodyRect.height * dayFraction;

        needle.style.display = "block";
        needle.style.top = `${top}px`;
      } catch (err) {
        console.error("Error positioning needle:", err);
      }
    };

    positionNeedle();
    const interval = setInterval(positionNeedle, 10000);
    const container = gradeRef.current;
    container?.addEventListener("scroll", positionNeedle);
    window.addEventListener("resize", positionNeedle);

    return () => {
      clearInterval(interval);
      container?.removeEventListener("scroll", positionNeedle);
      window.removeEventListener("resize", positionNeedle);
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
    setNome(""); setApresentadorId(""); setSelo(""); setCapa(""); setDiasSemana([]); setHorarioInicio(""); setHorarioFim(""); setEstudio(""); setAtivo(true); setVariavel(false); setDataVariavel(undefined); setDescricao(""); setConflictMsg(""); setEditingId(null); setTipoPrograma(""); setClassificacaoEtaria("");
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
           variavel: true, data_variavel: dataStr, classificacao_etaria: classificacaoEtaria || null, tipo_programa: tipoPrograma || null,
        } as any).eq("id", editingId);
      } else {
        await supabase.from("programas").insert({
          user_id: user.id, nome: nome.trim(), apresentador_id: apresentadorId || null, selo, capa, dias_semana: [dayOfWeek],
          horario_inicio: horarioInicio, horario_fim: horarioFim, estudio: estudio.trim(), ativo, descricao: descricao.trim(),
           variavel: true, data_variavel: dataStr, classificacao_etaria: classificacaoEtaria || null, tipo_programa: tipoPrograma || null,
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
        variavel: false, data_variavel: null, classificacao_etaria: classificacaoEtaria || null, tipo_programa: tipoPrograma || null,
      } as any).eq("id", editingId);
    } else {
      await supabase.from("programas").insert({
        user_id: user.id, nome: nome.trim(), apresentador_id: apresentadorId || null, selo, capa, dias_semana: diasSemana,
        horario_inicio: horarioInicio, horario_fim: horarioFim, estudio: estudio.trim(), ativo, descricao: descricao.trim(),
        variavel: false, data_variavel: null, classificacao_etaria: classificacaoEtaria || null, tipo_programa: tipoPrograma || null,
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
    setClassificacaoEtaria(p.classificacaoEtaria || "");
    setTipoPrograma(p.tipoPrograma || "");
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
      {/* Form Card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #0d0446 0%, #1a0a6e 100%)", boxShadow: "0 8px 32px rgba(13,4,70,0.25)" }}>
        {/* Form Header */}
        <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(45,191,244,0.15)" }}>
            <PlaySquare size={20} style={{ color: "#2dbff4" }} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              {editingId ? "Editar Programa" : "Cadastro de Programa"}
            </h3>
            <p className="text-[11px] text-white/70">Preencha os dados para cadastrar o programa</p>
          </div>
        </div>

        {/* Form Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Nome + Tipo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold text-white/90 uppercase tracking-wider">Nome do Programa</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Digite o nome do programa"
                className="w-full px-4 py-2 outline-none transition-all text-sm text-white placeholder:text-white/50"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px" }}
                onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.12)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; }}
              />
            </div>
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold text-white/90 uppercase tracking-wider">Tipo do Programa</label>
              <div className="flex gap-2">
                <Select value={tipoPrograma} onValueChange={setTipoPrograma}>
                  <SelectTrigger className="flex-1 h-9" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#ffffff", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.12)", fontSize: "13px" }}>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent style={{ backgroundColor: "#0d0446", border: "1px solid rgba(255,255,255,0.15)" }}>
                    {tiposPrograma.map(t => (
                      <SelectItem key={t} value={t} className="text-white focus:bg-white/20 focus:text-white">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Dialog open={tipoDialogOpen} onOpenChange={setTipoDialogOpen}>
                  <DialogTrigger asChild>
                    <button className="px-3 py-1 text-xs font-bold transition-all shrink-0 rounded-xl"
                      style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff" }}
                    >+ Novo</button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle style={{ color: "#0d0446" }}>Novo Tipo de Programa</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <input value={newTipo} onChange={(e) => setNewTipo(e.target.value)} placeholder="Nome do tipo"
                        className="w-full px-4 py-1.5 outline-none transition-colors text-sm"
                        style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "12px" }}
                        onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                        onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
                      />
                      <button onClick={addTipo} className="w-full py-2 font-bold transition-all rounded-xl"
                        style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff" }}
                      >Adicionar</button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>

          {/* Classificação + Apresentador */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold text-white/60 uppercase tracking-wider">Classificação Etária</label>
              <Select value={classificacaoEtaria} onValueChange={setClassificacaoEtaria}>
                <SelectTrigger className="w-full h-9" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#ffffff", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.12)", fontSize: "13px" }}>
                  <SelectValue placeholder="Selecione a classificação" />
                </SelectTrigger>
                <SelectContent style={{ backgroundColor: "#0d0446", border: "1px solid rgba(255,255,255,0.15)" }}>
                  {CLASSIFICACOES_ETARIAS.map(c => (
                    <SelectItem key={c.value} value={c.value} className="text-white focus:bg-white/20 focus:text-white">
                      <span className="flex items-center gap-2">
                        <ClassificacaoBadge value={c.value} size={18} />
                        {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold text-white/60 uppercase tracking-wider">Apresentador</label>
              <Popover open={apresentadorComboOpen} onOpenChange={setApresentadorComboOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="w-full h-9 flex items-center justify-between px-4 text-sm rounded-xl"
                    style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    <span className={apresentadorId ? "" : "opacity-40"}>
                      {apresentadorId ? (apresentadores.find(a => a.id === apresentadorId)?.nome || "Selecionar") : "Selecionar Apresentador"}
                    </span>
                    <ChevronsUpDown size={14} className="opacity-40" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" style={{ backgroundColor: "#0d0446", border: "1px solid rgba(255,255,255,0.15)" }}>
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
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-[11px] mb-1.5 font-semibold text-white/60 uppercase tracking-wider">Descrição</label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição do programa (opcional)"
              className="min-h-[60px] px-4 py-2 outline-none transition-all text-sm text-white placeholder:text-white/30"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px" }}
              onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
            />
          </div>

          {/* Selo + Capa */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold text-white/60 uppercase tracking-wider">Selo (1080×1080 PNG alpha)</label>
              <label className="cursor-pointer group">
                <div className="w-16 h-16 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all group-hover:border-[#2dbef3]"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "2px dashed rgba(255,255,255,0.15)" }}>
                  {selo ? (
                    <img src={selo} alt="Selo" className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <span className="text-[9px] text-white/30 group-hover:text-white/50">Upload</span>
                  )}
                </div>
                <input type="file" accept="image/*" onChange={handleSelo} className="hidden" />
              </label>
              {selo && <button onClick={() => setSelo("")} className="text-[10px] text-red-400 hover:text-red-300 mt-1">Remover</button>}
            </div>
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold text-white/60 uppercase tracking-wider">Capa (1080×1080 PNG alpha)</label>
              <label className="cursor-pointer group">
                <div className="w-16 h-16 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all group-hover:border-[#2dbef3]"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "2px dashed rgba(255,255,255,0.15)" }}>
                  {capa ? (
                    <img src={capa} alt="Capa" className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <span className="text-[9px] text-white/30 group-hover:text-white/50">Upload</span>
                  )}
                </div>
                <input type="file" accept="image/*" onChange={handleCapa} className="hidden" />
              </label>
              {capa && <button onClick={() => setCapa("")} className="text-[10px] text-red-400 hover:text-red-300 mt-1">Remover</button>}
            </div>
          </div>

          {/* Estúdio */}
          <div>
            <label className="block text-[11px] mb-1.5 font-semibold text-white/60 uppercase tracking-wider flex items-center gap-1">
              <Building2 size={13} /> Estúdio
            </label>
            <div className="flex gap-2">
              <Select value={estudio} onValueChange={setEstudio}>
                <SelectTrigger className="flex-1 h-9" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#ffffff", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.12)", fontSize: "13px" }}>
                  <SelectValue placeholder="Selecione o estúdio" />
                </SelectTrigger>
                <SelectContent style={{ backgroundColor: "#0d0446", border: "1px solid rgba(255,255,255,0.15)" }}>
                  {estudios.map(e => (
                    <SelectItem key={e} value={e} className="text-white focus:bg-white/20 focus:text-white">{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Dialog open={estudioDialogOpen} onOpenChange={setEstudioDialogOpen}>
                <DialogTrigger asChild>
                  <button className="px-3 py-1 text-xs font-bold transition-all shrink-0 rounded-xl"
                    style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff" }}
                  >+ Novo</button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle style={{ color: "#0d0446" }}>Cadastrar Estúdio</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <input value={newEstudio} onChange={(e) => setNewEstudio(e.target.value)} placeholder="Nome do estúdio"
                      className="w-full px-4 py-1.5 outline-none transition-colors text-sm"
                      style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "12px" }}
                      onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
                    />
                    <button onClick={addEstudio} className="w-full py-2 font-bold transition-all rounded-xl"
                      style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff" }}
                    >Adicionar</button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Dias da Semana */}
          <div>
            <label className="block text-[11px] mb-1.5 font-semibold text-white/60 uppercase tracking-wider flex items-center gap-1">
              <Calendar size={13} /> Dias da Semana
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DIAS_SEMANA.map(dia => (
                <button key={dia} onClick={() => toggleDia(dia)}
                  className="px-3 py-1.5 text-[11px] font-semibold transition-all rounded-lg"
                  style={{
                    backgroundColor: diasSemana.includes(dia) ? "#268ffa" : "rgba(255,255,255,0.06)",
                    color: diasSemana.includes(dia) ? "#ffffff" : "rgba(255,255,255,0.5)",
                    border: diasSemana.includes(dia) ? "1px solid #268ffa" : "1px solid rgba(255,255,255,0.1)",
                    boxShadow: diasSemana.includes(dia) ? "0 2px 8px rgba(38,143,250,0.3)" : "none",
                  }}>
                  {dia.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Horários */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold text-white/60 uppercase tracking-wider flex items-center gap-1"><Clock size={12} /> Início</label>
              <input type="time" step="1" value={horarioInicio} onChange={(e) => setHorarioInicio(e.target.value)}
                className="w-full px-4 py-2 outline-none transition-all text-sm text-white"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px", colorScheme: "dark" }}
                onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
              />
            </div>
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold text-white/60 uppercase tracking-wider flex items-center gap-1"><Clock size={12} /> Fim</label>
              <input type="time" step="1" value={horarioFim} onChange={(e) => setHorarioFim(e.target.value)}
                className="w-full px-4 py-2 outline-none transition-all text-sm text-white"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px", colorScheme: "dark" }}
                onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div className="relative">
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 rounded-full transition-colors peer-checked:bg-[#2dbef3]" style={{ backgroundColor: "rgba(255,255,255,0.15)" }} />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-sm" />
              </div>
              <span className="text-xs font-medium text-white/70">Ativo</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div className="relative">
                <input type="checkbox" checked={variavel} onChange={(e) => { setVariavel(e.target.checked); if (!e.target.checked) setDataVariavel(undefined); }} className="sr-only peer" />
                <div className="w-9 h-5 rounded-full transition-colors peer-checked:bg-[#f59e0b]" style={{ backgroundColor: "rgba(255,255,255,0.15)" }} />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-sm" />
              </div>
              <span className="text-xs font-medium text-white/70">Variável</span>
            </label>
          </div>

          {/* Data Variável */}
          {variavel && (
            <div className="space-y-2 rounded-xl p-3" style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <label className="block text-[11px] font-semibold text-amber-300/80 uppercase tracking-wider flex items-center gap-1">
                <CalendarDays size={13} /> Data do Programa Variável
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn("w-full justify-start text-left font-normal flex items-center gap-2 px-4 py-2 text-sm rounded-xl")}
                    style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "#ffffff" }}>
                    <CalendarDays className="h-4 w-4 text-amber-400" />
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
              <p className="text-[10px] text-amber-200/60 leading-relaxed">
                ⚠️ Este programa substituirá o programa fixo neste horário apenas na data selecionada.
              </p>
            </div>
          )}

          {/* Conflict + Actions */}
          {conflictMsg && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)" }}>
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-300">{conflictMsg}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {editingId && (
              <button onClick={resetForm}
                className="px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5 rounded-xl"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.15)" }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.15)"; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; }}
              >
                <X size={13} /> Cancelar
              </button>
            )}
            <button onClick={handleAdd} disabled={saving}
              className="px-6 py-2 text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50 rounded-xl"
              style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff", boxShadow: "0 4px 15px rgba(38,143,250,0.3)" }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 20px rgba(38,143,250,0.5)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 4px 15px rgba(38,143,250,0.3)"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {saving ? "Salvando..." : editingId ? "Atualizar" : "Adicionar Programa"}
            </button>
          </div>
        </div>
      </div>

      {/* Grade de Programação */}
      {loadingData ? (
        <div className="animate-pulse space-y-3">
          <div className="flex items-center justify-between mb-4">
            <div className="h-5 w-48 rounded bg-[#0d0446]/10" />
            <div className="h-7 w-48 rounded-full bg-[#0d0446]/10" />
          </div>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.1)" }}>
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: "rgba(13,4,70,0.05)" }}>
                  <th className="px-2 py-2 w-20"><div className="h-3 w-12 rounded bg-[#0d0446]/10" /></th>
                  {Array.from({ length: 7 }).map((_, i) => (
                    <th key={i} className="px-2 py-2 text-center"><div className="h-3 w-8 mx-auto rounded bg-[#0d0446]/10" /></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 10 }).map((_, row) => (
                  <tr key={row}>
                    <td className="px-2 py-1.5"><div className="h-2.5 w-10 rounded bg-[#0d0446]/5" /></td>
                    {Array.from({ length: 7 }).map((_, col) => (
                      <td key={col} className="px-1 py-1">
                        <div className="h-6 rounded" style={{ backgroundColor: `rgba(13,4,70,${Math.random() * 0.08 + 0.02})` }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : programas.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h4 className="text-lg font-medium" style={{ color: "#0d0446" }}>Grade de Programação</h4>
            <Select value={gradeEstudioFilter} onValueChange={setGradeEstudioFilter}>
              <SelectTrigger className="w-[180px]" style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "none", fontSize: "11px", height: "26px", padding: "0 10px" }}>
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
            style={{ border: "1px solid rgba(13,4,70,0.1)", backgroundColor: "#ffffff", scrollbarWidth: "thin", scrollbarColor: "#0d0446 transparent", position: "relative" }}
          >
            <table data-no-row-hover className="w-full text-xs border-separate border-spacing-1">
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
            {/* Time needle overlay */}
            <div ref={needleRef} style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: "1px",
              backgroundColor: "#0d0446",
              zIndex: 15,
              pointerEvents: "none",
              display: "none",
            }}>
              <div style={{
                position: "absolute",
                left: -4,
                top: -3,
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "#0d0446",
              }} />
              <div style={{
                position: "absolute",
                left: 10,
                top: -8,
                fontSize: "9px",
                fontWeight: 700,
                color: "#0d0446",
                backgroundColor: "#ffffff",
                padding: "1px 4px",
                borderRadius: "3px",
                whiteSpace: "nowrap",
              }}>
                {currentTimeStr.slice(0, 5)}
              </div>
            </div>
          </div>
        </div>
      )}

      {loadingData ? (
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-52 rounded bg-[#0d0446]/10 mb-4" />
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.1)" }}>
            <div className="h-10 w-full" style={{ backgroundColor: "rgba(13,4,70,0.08)" }} />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3" style={{ borderBottom: "1px solid rgba(13,4,70,0.05)" }}>
                <div className="h-3 w-32 rounded bg-[#0d0446]/8" />
                <div className="h-3 w-24 rounded bg-[#0d0446]/5" />
                <div className="h-3 w-20 rounded bg-[#0d0446]/5" />
                <div className="h-3 w-28 rounded bg-[#0d0446]/5" />
                <div className="ml-auto flex gap-2">
                  <div className="h-6 w-6 rounded bg-[#0d0446]/5" />
                  <div className="h-6 w-6 rounded bg-[#0d0446]/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : programas.length > 0 && (
        <div>
          <h4 className="text-sm font-bold mb-3" style={{ color: "#0d0446" }}>Programas Cadastrados</h4>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.08)", boxShadow: "0 2px 12px rgba(13,4,70,0.06)" }}>
            <table className="w-full text-xs" style={{ color: "#0d0446" }}>
              <thead>
                <tr style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)", color: "#ffffff" }}>
                  <th className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider">Programa</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider">Exibição</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider">Horário</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider">Apresentador</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-[11px] uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-[11px] uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedProgramas.map((p, i) => (
                  <tr key={p.id} className="group transition-colors hover:bg-[#f0f4ff]" style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#fafaff", borderTop: "1px solid rgba(13,4,70,0.05)" }} data-no-row-hover>
                    <td className="px-4 py-2.5 font-semibold">
                      <div className="flex items-center gap-2">
                        {p.nome}
                        {p.variavel && <span className="text-[9px] px-1.5 py-0.5 rounded-lg font-semibold" style={{ backgroundColor: "rgba(245,158,11,0.1)", color: "#d97706" }}>Variável</span>}
                      </div>
                      {p.classificacaoEtaria && <div className="mt-0.5"><ClassificacaoBadge value={p.classificacaoEtaria} size={16} /></div>}
                    </td>
                    <td className="px-4 py-2.5 text-[11px]" style={{ color: "rgba(13,4,70,0.6)" }}>
                      {p.variavel && p.dataVariavel
                        ? format(new Date(p.dataVariavel + "T12:00:00"), "dd/MM/yyyy (EEEE)", { locale: ptBR })
                        : p.diasSemana.map(d => d.slice(0, 3)).join(", ")}
                    </td>
                    <td className="px-4 py-2.5 text-[11px]" style={{ color: "rgba(13,4,70,0.6)" }}>
                      {p.horarioInicio.slice(0, 5)} — {p.horarioFim.slice(0, 5)}
                    </td>
                    <td className="px-4 py-2.5 text-[11px]" style={{ color: "rgba(13,4,70,0.6)" }}>
                      {getApresentadorNome(p.apresentadorId)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
                        p.ativo ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${p.ativo ? "bg-green-500" : "bg-red-500"}`} />
                        {p.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => startEdit(p)} title="Editar"
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-[#268ffa]/10">
                          <Pencil size={13} style={{ color: "#268ffa" }} />
                        </button>
                        <button onClick={() => toggleAtivo(p.id, p.ativo)} title={p.ativo ? "Desativar" : "Ativar"}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-green-50">
                          <Power size={13} style={{ color: p.ativo ? "#22c55e" : "#dc2626" }} />
                        </button>
                        <button onClick={() => removePrograma(p.id)} title="Remover"
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-50">
                          <Trash2 size={13} style={{ color: "#dc2626" }} />
                        </button>
                      </div>
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
            style={{ width: "450px", height: "165px", background: "linear-gradient(135deg, #0d0446, #1a0a6e)", borderRadius: "20px", boxShadow: "0 20px 60px rgba(13,4,70,0.4)" }}>
            <div className="flex items-center gap-3 flex-1 justify-center" style={{ fontSize: "14px", color: "#ffffff", fontWeight: 600 }}>
              <CheckCircle size={22} style={{ color: "#2dbef3" }} /> Salvo com sucesso!
            </div>
            <div className="w-full" style={{ height: "4px", backgroundColor: "rgba(255,255,255,0.1)" }}>
              <div style={{ height: "100%", background: "linear-gradient(90deg, #268ffa, #2dbef3)", animation: "shrinkBar 2s linear forwards" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
