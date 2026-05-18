import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Trash2, Clock, Calendar, Building2, Pencil, X, Power, Loader2, Info, CalendarDays, CheckCircle, ChevronsUpDown, Check, PlaySquare, Download } from "lucide-react";
import { format, addDays, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { getApresentadores, type Apresentador } from "./ApresentadorForm";
import { supabase } from "@/integrations/supabase/client";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { uploadProgramImage } from "@/lib/uploadProgramImage";
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
  apresentadoresIds: string[];
  selo: string;
  capa: string;
  thumb: string;
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
    apresentadoresIds: (p as any).apresentadores_ids || [],
    selo: p.selo || "",
    capa: (p as any).capa || "",
    thumb: (p as any).thumb || "",
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

  const getPresenterNames = (prog: Programa) => {
    const ids = prog.apresentadoresIds?.length > 0 ? prog.apresentadoresIds : (prog.apresentadorId ? [prog.apresentadorId] : []);
    return ids.map(id => apresentadores.find(a => a.id === id)?.nome).filter(Boolean).join(", ");
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
              <td className="px-2 py-2 font-mono text-[10px] font-semibold" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>{slot.slice(0, 5)}</td>
              {diasSemana.map(dia => {
                const key = `${dia}-${slot}`;
                if (skipMap[key]) return null;
                const cellData = spanMap[key];
                if (!cellData) return <td key={dia} className="px-1 py-1" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 2%, transparent)" }} />;
                const { prog, rowSpan } = cellData;
                const isOnAir = prog && dia === diaAtual && currentTimeStr >= prog.horarioInicio && currentTimeStr < prog.horarioFim;
                return (
                  <td key={dia} rowSpan={rowSpan}
                    className="transition-all relative group"
                    style={{
                      background: isOnAir
                        ? "var(--layout-header-bg, #1a1a1a)"
                        : "color-mix(in srgb, var(--layout-accent-color, #2563eb) 8%, var(--layout-page-bg, #ffffff))",
                      verticalAlign: "top",
                      padding: "8px 10px",
                      borderLeft: isOnAir
                        ? "3px solid var(--layout-accent-color, #2563eb)"
                        : "3px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 25%, transparent)",
                      boxShadow: isOnAir ? "0 4px 16px rgba(0,0,0,0.15)" : undefined,
                    }}>
                    <div className="text-[12px] font-extrabold leading-snug" style={{ wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", color: isOnAir ? "var(--layout-header-text, #ffffff)" : "var(--layout-page-text, #1a1a1a)" }}>{prog.nome}</div>
                    {prog.classificacaoEtaria && <div className="mt-1"><ClassificacaoBadge value={prog.classificacaoEtaria} size={14} /></div>}
                    <div className="text-[10px] mt-1 font-medium" style={{ color: isOnAir ? "color-mix(in srgb, var(--layout-header-text, #ffffff) 75%, transparent)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>
                      {prog.horarioInicio.slice(0, 5)} - {prog.horarioFim.slice(0, 5)}
                    </div>
                    {(() => {
                      const names = getPresenterNames(prog);
                      return names ? (
                        <div className="text-[9px] font-semibold mt-0.5" style={{ color: isOnAir ? "color-mix(in srgb, var(--layout-header-text, #ffffff) 80%, transparent)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
                          {names}
                        </div>
                      ) : null;
                    })()}
                    <button
                      onClick={(e) => { e.stopPropagation(); setDetailProg(prog); }}
                      className="mt-1.5 px-2.5 py-1 rounded-md text-[8px] font-bold flex items-center gap-1 transition-all hover:opacity-80"
                      style={{
                        backgroundColor: isOnAir ? "color-mix(in srgb, var(--layout-header-text, #ffffff) 20%, transparent)" : "var(--layout-header-bg, #1a1a1a)",
                        color: isOnAir ? "var(--layout-header-text, #ffffff)" : "var(--layout-header-text, #ffffff)",
                      }}
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
          <div className="rounded-xl max-w-2xl w-full mx-4 relative" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", padding: "20px" }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setDetailProg(null)} className="absolute top-4 right-4 z-10 font-bold text-sm" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              <X size={18} />
            </button>
            <div className="flex gap-5">
              {detailProg.capa && (
                <img src={detailProg.capa} alt={detailProg.nome} className="w-48 h-48 object-cover rounded-lg shrink-0" />
              )}
              <div className="space-y-2 flex-1 min-w-0">
                <h2 className="text-lg font-bold pr-6" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{detailProg.nome}</h2>
                <p className="text-xs flex items-center gap-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                  <Clock size={12} /> {detailProg.horarioInicio.slice(0, 5)} — {detailProg.horarioFim.slice(0, 5)}
                </p>
                <p className="text-xs flex items-center gap-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                  <Calendar size={12} /> {detailProg.diasSemana.join(", ")}
                </p>
                {getPresenterName(detailProg.apresentadorId) && (
                  <p className="text-xs font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                    Locutor: {getPresenterName(detailProg.apresentadorId)}
                  </p>
                )}
                {detailProg.descricao && (
                  <p className="text-sm mt-2 leading-relaxed" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 70%, transparent)" }}>{detailProg.descricao}</p>
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
  const [apresentadoresIds, setApresentadoresIds] = useState<string[]>([]);
  const [selo, setSelo] = useState("");
  const formRef = useRef<HTMLDivElement>(null);
  const [capa, setCapa] = useState("");
  const [thumb, setThumb] = useState("");
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
  const toggleApresentador = (id: string) => {
    setApresentadoresIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

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
    try {
      const [ap, pg] = await Promise.all([getApresentadores(), getProgramas()]);
      setApresentadores(ap);
      pg.sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));
      setProgramas(pg);
      const allEstudios = Array.from(new Set(pg.map(p => p.estudio).filter(Boolean)));
      setEstudios(prev => {
        const merged = Array.from(new Set([...prev, ...allEstudios]));
        return merged.sort();
      });
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Auto-scroll disabled per user request

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

  const handleThumb = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setThumb(reader.result as string);
    reader.readAsDataURL(file);
  };

  const toggleDia = (dia: string) => {
    setDiasSemana(prev => prev.includes(dia) ? prev.filter(d => d !== dia) : [...prev, dia]);
  };

  const resetForm = () => {
    setNome(""); setApresentadorId(""); setApresentadoresIds([]); setSelo(""); setCapa(""); setThumb(""); setDiasSemana([]); setHorarioInicio(""); setHorarioFim(""); setEstudio(""); setAtivo(true); setVariavel(false); setDataVariavel(undefined); setDescricao(""); setConflictMsg(""); setEditingId(null); setTipoPrograma(""); setClassificacaoEtaria("");
  };

  // Helper: upload images to storage and return URLs
  const uploadImages = async (programId: string): Promise<{ thumb: string; capa: string }> => {
    const [thumbUrl, capaUrl] = await Promise.all([
      thumb ? uploadProgramImage(thumb, user!.id, programId, "thumb") : Promise.resolve(""),
      capa ? uploadProgramImage(capa, user!.id, programId, "capa") : Promise.resolve(""),
    ]);
    // If any were converted from base64, update the DB record with the URL
    if ((thumbUrl && thumbUrl !== thumb) || (capaUrl && capaUrl !== capa)) {
      await supabase.from("programas").update({ thumb: thumbUrl, capa: capaUrl } as any).eq("id", programId);
    }
    return { thumb: thumbUrl, capa: capaUrl };
  };

  const handleAdd = async () => {
    if (!nome.trim() || !user) return;
    if (!horarioInicio || !horarioFim) { setConflictMsg("Preencha o horário de início e fim."); return; }
    if (horarioInicio >= horarioFim) { setConflictMsg("O horário de início deve ser antes do fim."); return; }
    if (!estudio.trim()) { setConflictMsg("Informe o estúdio."); return; }

    if (variavel) {
      if (!dataVariavel) { setConflictMsg("Selecione a data para o programa variável."); return; }
      const DIAS_MAP_REV: Record<number, string> = { 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo" };
      const dayOfWeek = DIAS_MAP_REV[dataVariavel.getDay()];
      const dataStr = format(dataVariavel, "yyyy-MM-dd");

      setSaving(true);
      let targetId = editingId;
      if (editingId) {
        await supabase.from("programas").update({
          nome: nome.trim(), apresentador_id: apresentadoresIds[0] || apresentadorId || null, selo, dias_semana: [dayOfWeek],
          horario_inicio: horarioInicio, horario_fim: horarioFim, estudio: estudio.trim(), ativo, descricao: descricao.trim(),
          variavel: true, data_variavel: dataStr, classificacao_etaria: classificacaoEtaria || null, tipo_programa: tipoPrograma || null,
          apresentadores_ids: apresentadoresIds,
        } as any).eq("id", editingId);
      } else {
        const { data: inserted } = await supabase.from("programas").insert({
          user_id: user.id, nome: nome.trim(), apresentador_id: apresentadoresIds[0] || apresentadorId || null, selo, dias_semana: [dayOfWeek],
          horario_inicio: horarioInicio, horario_fim: horarioFim, estudio: estudio.trim(), ativo, descricao: descricao.trim(),
          variavel: true, data_variavel: dataStr, classificacao_etaria: classificacaoEtaria || null, tipo_programa: tipoPrograma || null,
          apresentadores_ids: apresentadoresIds,
        } as any).select("id").single();
        targetId = inserted?.id || null;
      }
      if (targetId) await uploadImages(targetId);
      await load();
      resetForm();
      setSaving(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
      return;
    }

    if (diasSemana.length === 0) { setConflictMsg("Selecione ao menos um dia da semana."); return; }

    const fixedProgramas = programas.filter(p => !p.variavel);
    const conflict = checkConflict(fixedProgramas, diasSemana, horarioInicio, horarioFim, estudio.trim(), editingId || undefined);
    if (conflict) { setConflictMsg(`Conflito com "${conflict.nome}" no mesmo estúdio e horário.`); return; }

    setSaving(true);
    let targetId = editingId;

    if (editingId) {
      await supabase.from("programas").update({
        nome: nome.trim(), apresentador_id: apresentadoresIds[0] || apresentadorId || null, selo, dias_semana: diasSemana,
        horario_inicio: horarioInicio, horario_fim: horarioFim, estudio: estudio.trim(), ativo, descricao: descricao.trim(),
        variavel: false, data_variavel: null, classificacao_etaria: classificacaoEtaria || null, tipo_programa: tipoPrograma || null,
        apresentadores_ids: apresentadoresIds,
      } as any).eq("id", editingId);
    } else {
      const { data: inserted } = await supabase.from("programas").insert({
        user_id: user.id, nome: nome.trim(), apresentador_id: apresentadoresIds[0] || apresentadorId || null, selo, dias_semana: diasSemana,
        horario_inicio: horarioInicio, horario_fim: horarioFim, estudio: estudio.trim(), ativo, descricao: descricao.trim(),
        variavel: false, data_variavel: null, classificacao_etaria: classificacaoEtaria || null, tipo_programa: tipoPrograma || null,
        apresentadores_ids: apresentadoresIds,
      } as any).select("id").single();
      targetId = inserted?.id || null;
    }
    if (targetId) await uploadImages(targetId);
    await load();
    resetForm();
    setSaving(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  const startEdit = (p: Programa) => {
    setEditingId(p.id); setNome(p.nome); setApresentadorId(p.apresentadorId);
    setApresentadoresIds(p.apresentadoresIds?.length > 0 ? p.apresentadoresIds : (p.apresentadorId ? [p.apresentadorId] : []));
    setSelo(p.selo); setCapa(p.capa); setThumb(p.thumb);
    setDiasSemana(p.diasSemana); setHorarioInicio(p.horarioInicio); setHorarioFim(p.horarioFim);
    setEstudio(p.estudio); setAtivo(p.ativo); setVariavel(p.variavel); setDescricao(p.descricao);
    setDataVariavel(p.dataVariavel ? new Date(p.dataVariavel + "T12:00:00") : undefined);
    setClassificacaoEtaria(p.classificacaoEtaria || "");
    setTipoPrograma(p.tipoPrograma || "");
    setConflictMsg("");
    // Scroll to form
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
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
  const getApresentadoresNomes = (p: Programa) => {
    const ids = p.apresentadoresIds?.length > 0 ? p.apresentadoresIds : (p.apresentadorId ? [p.apresentadorId] : []);
    const names = ids.map(id => apresentadores.find(a => a.id === id)?.nome).filter(Boolean);
    return names.length > 0 ? names.join(", ") : "—";
  };

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

  if (loadingData) return <ModulePageSkeleton variant="form" />;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Form Card */}
      <div ref={formRef} className="rounded-2xl overflow-hidden" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 12%, var(--layout-page-bg, #ffffff) 88%)", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
        {/* Form Header */}
        <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)" }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(45,191,244,0.15)" }}>
            <PlaySquare size={20} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              {editingId ? "Editar Programa" : "Cadastro de Programa"}
            </h3>
            <p className="text-[11px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 70%, transparent)" }}>Preencha os dados para cadastrar o programa</p>
          </div>
        </div>

        {/* Form Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Nome + Tipo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nome do Programa</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Digite o nome do programa"
                className="w-full px-4 py-2 outline-none transition-all text-sm placeholder:text-[color-mix(in_srgb,var(--layout-page-text)_40%,transparent)]"
                style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 60%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)", borderRadius: "12px", color: "var(--layout-page-text, #1a1a1a)" }}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.8)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.6)"; }}
              />
            </div>
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Tipo do Programa</label>
              <div className="flex gap-2">
                <Select value={tipoPrograma} onValueChange={setTipoPrograma}>
                  <SelectTrigger className="flex-1 h-9" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 60%, transparent)", color: "var(--layout-page-text, #1a1a1a)", borderRadius: "12px", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)", fontSize: "13px" }}>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposPrograma.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Dialog open={tipoDialogOpen} onOpenChange={setTipoDialogOpen}>
                  <DialogTrigger asChild>
                    <button className="btn-skyglass-accent px-3 py-1 text-xs shrink-0"
                    >+ Novo</button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Novo Tipo de Programa</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <input value={newTipo} onChange={(e) => setNewTipo(e.target.value)} placeholder="Nome do tipo"
                        className="w-full px-4 py-1.5 outline-none transition-colors text-sm"
                        style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid var(--layout-border-color, #333333)", color: "var(--layout-page-text, #1a1a1a)", borderRadius: "12px" }}
                        onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                        onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                      />
                      <button onClick={addTipo} className="btn-skyglass-accent w-full py-2"
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
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Classificação Etária</label>
              <Select value={classificacaoEtaria} onValueChange={setClassificacaoEtaria}>
                <SelectTrigger className="w-full h-9" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 60%, transparent)", color: "var(--layout-page-text, #1a1a1a)", borderRadius: "12px", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)", fontSize: "13px" }}>
                  <SelectValue placeholder="Selecione a classificação" />
                </SelectTrigger>
                <SelectContent>
                  {CLASSIFICACOES_ETARIAS.map(c => (
                    <SelectItem key={c.value} value={c.value}>
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
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Apresentadores</label>
              <Popover open={apresentadorComboOpen} onOpenChange={setApresentadorComboOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="w-full min-h-[36px] flex items-center justify-between px-4 text-sm rounded-xl gap-2"
                    style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 60%, transparent)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)" }}
                  >
                    <span className="flex-1 text-left truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                      {apresentadoresIds.length > 0
                        ? apresentadoresIds.map(id => apresentadores.find(a => a.id === id)?.nome).filter(Boolean).join(", ")
                        : "Selecionar Apresentadores"}
                    </span>
                    <ChevronsUpDown size={14} className="opacity-60 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar apresentador..." />
                    <CommandList>
                      <CommandEmpty className="py-4 text-center text-sm">Nenhum encontrado.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="__clear__" onSelect={() => { setApresentadoresIds([]); setApresentadorId(""); }}>
                          <Check size={14} className={cn("mr-2", apresentadoresIds.length === 0 ? "opacity-100" : "opacity-0")} />
                          Nenhum
                        </CommandItem>
                        {apresentadores.filter(a => a.ativo && a.cargo?.toLowerCase() !== "convidado").map(a => (
                          <CommandItem key={a.id} value={a.nome} onSelect={() => toggleApresentador(a.id)}>
                            <Check size={14} className={cn("mr-2", apresentadoresIds.includes(a.id) ? "opacity-100" : "opacity-0")} />
                            {a.nome}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {apresentadoresIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {apresentadoresIds.map(id => {
                    const ap = apresentadores.find(a => a.id === id);
                    if (!ap) return null;
                    return (
                      <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)", color: "var(--layout-icon-color, #888888)" }}>
                        {ap.nome}
                        <button onClick={() => toggleApresentador(id)} className="hover:opacity-60">
                          <X size={10} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Descrição</label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição do programa (opcional)"
              className="min-h-[60px] px-4 py-2 outline-none transition-all text-sm placeholder:text-[color-mix(in_srgb,var(--layout-page-text)_40%,transparent)]"
              style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 60%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)", borderRadius: "12px", color: "var(--layout-page-text, #1a1a1a)" }}
              onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)"; }}
            />
          </div>

          {/* Selo + Capa + Thumb */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Selo (1080×1080 PNG alpha)</label>
              <label className="cursor-pointer group">
                <div className="w-16 h-16 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all group-hover:border-[var(--layout-accent-color)]"
                  style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 50%, transparent)", border: "2px dashed color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
                  {selo ? (
                    <img src={selo} alt="Selo" className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <span className="text-[9px]" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Upload</span>
                  )}
                </div>
                <input type="file" accept="image/*" onChange={handleSelo} className="hidden" />
              </label>
              {selo && <button onClick={() => setSelo("")} className="text-[10px] text-red-400 hover:text-red-300 mt-1">Remover</button>}
            </div>
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Capa (226×302 PNG alpha)</label>
              <label className="cursor-pointer group">
                <div className="rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all group-hover:border-[var(--layout-accent-color)]"
                  style={{ width: "56px", height: "75px", backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 50%, transparent)", border: "2px dashed color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
                  {capa ? (
                    <img src={capa} alt="Capa" className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <span className="text-[9px]" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Upload</span>
                  )}
                </div>
                <input type="file" accept="image/*" onChange={handleCapa} className="hidden" />
              </label>
              {capa && <button onClick={() => setCapa("")} className="text-[10px] text-red-400 hover:text-red-300 mt-1">Remover</button>}
            </div>
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Thumb (1920×1080 PNG)</label>
              <label className="cursor-pointer group">
                <div className="rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all group-hover:border-[var(--layout-accent-color)]"
                  style={{ width: "96px", height: "54px", backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 50%, transparent)", border: "2px dashed color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
                  {thumb ? (
                    <img src={thumb} alt="Thumb" className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <span className="text-[9px]" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Upload</span>
                  )}
                </div>
                <input type="file" accept="image/*" onChange={handleThumb} className="hidden" />
              </label>
              {thumb && <button onClick={() => setThumb("")} className="text-[10px] text-red-400 hover:text-red-300 mt-1">Remover</button>}
            </div>
          </div>

          {/* Estúdio */}
          <div>
            <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              <Building2 size={13} /> Estúdio
            </label>
            <div className="flex gap-2">
              <Select value={estudio} onValueChange={setEstudio}>
                <SelectTrigger className="flex-1 h-9" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 60%, transparent)", color: "var(--layout-page-text, #1a1a1a)", borderRadius: "12px", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)", fontSize: "13px" }}>
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
                  <button className="btn-skyglass-accent px-3 py-1 text-xs shrink-0"
                  >+ Novo</button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Cadastrar Estúdio</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <input value={newEstudio} onChange={(e) => setNewEstudio(e.target.value)} placeholder="Nome do estúdio"
                      className="w-full px-4 py-1.5 outline-none transition-colors text-sm"
                      style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid var(--layout-border-color, #333333)", color: "var(--layout-page-text, #1a1a1a)", borderRadius: "12px" }}
                      onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                    />
                    <button onClick={addEstudio} className="btn-skyglass-accent w-full py-2"
                    >Adicionar</button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Dias da Semana */}
          <div>
            <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              <Calendar size={13} /> Dias da Semana
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DIAS_SEMANA.map(dia => (
                <button key={dia} onClick={() => toggleDia(dia)}
                  className="px-3 py-1.5 text-[11px] font-semibold transition-all rounded-lg"
                  style={{
                    backgroundColor: diasSemana.includes(dia) ? "var(--layout-header-bg, #1a1a1a)" : "var(--layout-page-bg, #ffffff)",
                    color: diasSemana.includes(dia) ? "var(--layout-header-text, #ffffff)" : "var(--layout-page-text, #1a1a1a)",
                    border: diasSemana.includes(dia) ? "2px solid var(--layout-header-bg, #1a1a1a)" : "2px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 20%, transparent)",
                    boxShadow: diasSemana.includes(dia) ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
                  }}>
                  {dia.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Horários */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}><Clock size={12} /> Início</label>
              <input type="time" step="1" value={horarioInicio} onChange={(e) => setHorarioInicio(e.target.value)}
                className="w-full px-4 py-2 outline-none transition-all text-sm"
                style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 60%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)", borderRadius: "12px", color: "var(--layout-page-text, #1a1a1a)" }}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)"; }}
              />
            </div>
            <div>
              <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}><Clock size={12} /> Fim</label>
              <input type="time" step="1" value={horarioFim} onChange={(e) => setHorarioFim(e.target.value)}
                className="w-full px-4 py-2 outline-none transition-all text-sm"
                style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 60%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)", borderRadius: "12px", color: "var(--layout-page-text, #1a1a1a)" }}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)"; }}
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6" style={{ borderTop: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)", paddingTop: "12px" }}>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div className="relative">
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 rounded-full transition-colors peer-checked:bg-[var(--layout-accent-color)]" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)" }} />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-sm" />
              </div>
              <span className="text-xs font-medium" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Ativo</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div className="relative">
                <input type="checkbox" checked={variavel} onChange={(e) => { setVariavel(e.target.checked); if (!e.target.checked) setDataVariavel(undefined); }} className="sr-only peer" />
                <div className="w-9 h-5 rounded-full transition-colors peer-checked:bg-[#f59e0b]" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)" }} />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-sm" />
              </div>
              <span className="text-xs font-medium" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Variável</span>
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
                    style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "var(--layout-header-text, #ffffff)" }}>
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
              <p className="text-[10px] text-amber-200/80 leading-relaxed">
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
                style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 50%, transparent)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)" }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.7)"; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.5)"; }}
              >
                <X size={13} /> Cancelar
              </button>
            )}
            <button onClick={handleAdd} disabled={saving}
              className="btn-skyglass-accent px-6 py-2.5 text-xs disabled:opacity-50"
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
            <div className="h-5 w-48 rounded bg-[var(--layout-header-bg)]/10" />
            <div className="h-7 w-48 rounded-full bg-[var(--layout-header-bg)]/10" />
          </div>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)" }}>
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)" }}>
                  <th className="px-2 py-2 w-20"><div className="h-3 w-12 rounded bg-[var(--layout-header-bg)]/10" /></th>
                  {Array.from({ length: 7 }).map((_, i) => (
                    <th key={i} className="px-2 py-2 text-center"><div className="h-3 w-8 mx-auto rounded bg-[var(--layout-header-bg)]/10" /></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 10 }).map((_, row) => (
                  <tr key={row}>
                    <td className="px-2 py-1.5"><div className="h-2.5 w-10 rounded bg-[var(--layout-header-bg)]/5" /></td>
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
        <div className="rounded-2xl overflow-hidden" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 12%, var(--layout-page-bg, #ffffff) 88%)", boxShadow: "0 8px 32px rgba(0,0,0,0.10)", padding: "20px" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
                <Calendar size={18} style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
              </div>
              <div>
                <h4 className="text-base font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Grade de Programação</h4>
                <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Visualização semanal dos programas</p>
              </div>
            </div>
            <Select value={gradeEstudioFilter} onValueChange={setGradeEstudioFilter}>
              <SelectTrigger className="w-[180px]" style={{ backgroundColor: "var(--layout-header-bg, #1a1a1a)", color: "var(--layout-header-text, #ffffff)", borderRadius: "20px", border: "none", fontSize: "11px", height: "30px", padding: "0 12px" }}>
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
            .grade-scroll::-webkit-scrollbar-thumb { background: var(--layout-header-bg, #1a1a1a); border-radius: 3px; }
            .grade-scroll::-webkit-scrollbar-thumb:hover { background: var(--layout-accent-color, #2563eb); }
            .grade-scroll::-webkit-scrollbar-button { display: none; }
          `}</style>
          <div
            ref={gradeRef}
            className="rounded-xl overflow-auto max-h-[400px] grade-scroll"
            style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)", backgroundColor: "var(--layout-page-bg, #ffffff)", scrollbarWidth: "thin", scrollbarColor: "#0d0446 transparent", position: "relative", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
          >
            <table data-no-row-hover className="w-full text-xs border-separate border-spacing-[2px]">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: "var(--layout-header-bg, #1a1a1a)" }}>
                  <th className="px-3 py-2.5 text-left w-20 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--layout-header-text, #ffffff)" }}>Horário</th>
                  {DIAS_SEMANA.map(dia => {
                    const isToday = dia === diaAtual;
                    return (
                      <th key={dia} className="px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-widest"
                        style={{
                          color: isToday ? "#ffffff" : "var(--layout-header-text, #ffffff)",
                          backgroundColor: isToday ? "var(--layout-accent-color, #dc2626)" : undefined,
                        }}>
                        <div style={isToday ? { color: "#ffffff", fontWeight: 900 } : undefined}>{dia.slice(0, 3).toUpperCase()}</div>
                        <div style={isToday ? { color: "#ffffff", fontWeight: 700, fontSize: "10px", marginTop: "2px" } : { fontSize: "10px", marginTop: "2px", opacity: 0.7 }}>{weekDates[dia]}</div>
                      </th>
                    );
                  })}
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
              height: "2px",
              background: "linear-gradient(90deg, #dc2626, #ef4444)",
              zIndex: 15,
              pointerEvents: "none",
              display: "none",
              boxShadow: "0 0 6px rgba(220,38,38,0.4)",
            }}>
              <div style={{
                position: "absolute",
                left: -4,
                top: -4,
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: "#dc2626",
                boxShadow: "0 0 6px rgba(220,38,38,0.5)",
              }} />
              <div style={{
                position: "absolute",
                left: 12,
                top: -9,
                fontSize: "9px",
                fontWeight: 700,
                color: "var(--layout-header-text, #ffffff)",
                backgroundColor: "#dc2626",
                padding: "2px 6px",
                borderRadius: "4px",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 6px rgba(220,38,38,0.3)",
              }}>
                {currentTimeStr.slice(0, 5)}
              </div>
            </div>
          </div>
        </div>
      )}

      {loadingData ? (
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-52 rounded bg-[var(--layout-header-bg)]/10 mb-4" />
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)" }}>
            <div className="h-10 w-full" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }} />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3" style={{ borderBottom: "1px solid rgba(13,4,70,0.05)" }}>
                <div className="h-3 w-32 rounded bg-[var(--layout-header-bg)]/8" />
                <div className="h-3 w-24 rounded bg-[var(--layout-header-bg)]/5" />
                <div className="h-3 w-20 rounded bg-[var(--layout-header-bg)]/5" />
                <div className="h-3 w-28 rounded bg-[var(--layout-header-bg)]/5" />
                <div className="ml-auto flex gap-2">
                  <div className="h-6 w-6 rounded bg-[var(--layout-header-bg)]/5" />
                  <div className="h-6 w-6 rounded bg-[var(--layout-header-bg)]/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : programas.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 12%, var(--layout-page-bg, #ffffff) 88%)", boxShadow: "0 8px 32px rgba(0,0,0,0.10)", padding: "20px" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
              <PlaySquare size={18} style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
            </div>
            <div>
              <h4 className="text-base font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Programas Cadastrados</h4>
              <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>{sortedProgramas.length} programa{sortedProgramas.length !== 1 ? "s" : ""} registrado{sortedProgramas.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="rounded-xl overflow-hidden" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <table className="w-full text-xs" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              <thead>
                <tr style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", color: "var(--layout-header-text, #ffffff)" }}>
                  <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider">Programa</th>
                  <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider">Exibição</th>
                  <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider">Horário</th>
                  <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider">Apresentador</th>
                  <th className="px-4 py-3 text-center font-semibold text-[11px] uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-center font-semibold text-[11px] uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedProgramas.map((p, i) => (
                  <tr key={p.id} className="group transition-all duration-200" style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f4f8ff", borderBottom: "1px solid rgba(13,4,70,0.04)" }} data-no-row-hover
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#e8f0ff"; e.currentTarget.style.transform = "scale(1.002)"; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = i % 2 === 0 ? "#ffffff" : "#f4f8ff"; e.currentTarget.style.transform = "scale(1)"; }}
                  >
                    <td className="px-4 py-3 font-semibold">
                      <div className="flex items-center gap-2">
                        {p.capa && <img src={p.capa} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }} />}
                        <div>
                          <div className="flex items-center gap-1.5">
                            {p.nome}
                            {p.variavel && <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: "rgba(245,158,11,0.12)", color: "#d97706" }}>VAR</span>}
                          </div>
                          {p.classificacaoEtaria && <div className="mt-0.5"><ClassificacaoBadge value={p.classificacaoEtaria} size={14} /></div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
                      {p.variavel && p.dataVariavel
                        ? format(new Date(p.dataVariavel + "T12:00:00"), "dd/MM/yyyy (EEEE)", { locale: ptBR })
                        : <div className="flex flex-wrap gap-0.5">{p.diasSemana.map(d => <span key={d} className="px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}>{d.slice(0, 3)}</span>)}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 70%, transparent)" }}>
                        <Clock size={11} style={{ color: "rgba(13,4,70,0.35)" }} />
                        {p.horarioInicio.slice(0, 5)} — {p.horarioFim.slice(0, 5)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] font-medium" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 70%, transparent)" }}>
                      {getApresentadoresNomes(p) !== "—" ? getApresentadoresNomes(p) : <span style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 30%, transparent)" }}>—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold" style={{
                        backgroundColor: p.ativo ? "rgba(34,197,94,0.1)" : "rgba(220,38,38,0.08)",
                        color: p.ativo ? "#16a34a" : "#dc2626",
                      }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.ativo ? "#22c55e" : "#dc2626" }} />
                        {p.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => startEdit(p)} title="Editar"
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                          style={{ backgroundColor: "transparent" }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)"; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          <Pencil size={14} style={{ color: "var(--layout-icon-color, #888888)" }} />
                        </button>
                        <button onClick={() => toggleAtivo(p.id, p.ativo)} title={p.ativo ? "Desativar" : "Ativar"}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                          style={{ backgroundColor: "transparent" }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = p.ativo ? "rgba(34,197,94,0.1)" : "rgba(220,38,38,0.08)"; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          <Power size={14} style={{ color: p.ativo ? "#22c55e" : "#dc2626" }} />
                        </button>
                        <button onClick={() => removePrograma(p.id)} title="Remover"
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                          style={{ backgroundColor: "transparent" }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(220,38,38,0.08)"; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          <Trash2 size={14} style={{ color: "#dc2626" }} />
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
            style={{ width: "450px", height: "165px", background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", borderRadius: "20px", boxShadow: "0 20px 60px color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
            <div className="flex items-center gap-3 flex-1 justify-center" style={{ fontSize: "14px", color: "var(--layout-header-text, #ffffff)", fontWeight: 600 }}>
              <CheckCircle size={22} style={{ color: "var(--layout-accent-color, #2563eb)" }} /> Salvo com sucesso!
            </div>
            <div className="w-full" style={{ height: "4px", backgroundColor: "rgba(255,255,255,0.1)" }}>
              <div style={{ height: "100%", background: "linear-gradient(90deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", animation: "shrinkBar 2s linear forwards" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
