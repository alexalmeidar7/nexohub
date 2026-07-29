import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Trash2, Clock, Calendar, Building2, Pencil, X, Power, Loader2, Info, CalendarDays, CheckCircle, ChevronsUpDown, Check, PlaySquare, Download, ChevronDown, Plus } from "lucide-react";
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

const FIELD_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "#0A2540",
  marginBottom: 8,
  display: "block",
};

function Field({ label, children, span = "" }: { label: React.ReactNode; children: React.ReactNode; span?: string }) {
  return (
    <div className={span}>
      <label style={FIELD_LABEL_STYLE}>{label}</label>
      {children}
    </div>
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

  const CYAN = "#00BFF0";
  const LIME = "#C6F03C";
  const DARK = "#0A2540";
  const CARD_BG = "#D6F4FB";

  return (
    <>
      <style>{`
        .grade-cell { transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
        .grade-cell:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(10,37,64,0.10); border-color: ${CYAN} !important; }
        .grade-cell:hover .grade-info-btn { background: ${LIME} !important; color: ${DARK} !important; }
        .grade-onair-dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:${LIME}; box-shadow:0 0 0 3px rgba(198,240,60,0.25); animation: gradePulse 1.4s ease-in-out infinite; margin-right:6px; vertical-align:middle; }
        @keyframes gradePulse { 0%,100% { opacity:1; transform:scale(1);} 50% { opacity:.55; transform:scale(1.35);} }
        .grade-empty-cell { background: repeating-linear-gradient(135deg, ${CARD_BG} 0 8px, #EEFAFE 8px 16px) !important; }
      `}</style>
      <tbody>
        {gradeSlots.map((slot, rowIdx) => {
          const slotParts = slot.split(":");
          const slotMinutes = parseInt(slotParts[0]) * 60 + parseInt(slotParts[1]);
          const nextSlotMinutes = slotMinutes + 30;
          const currentParts = currentTimeStr.split(":");
          const currentMinutes = parseInt(currentParts[0]) * 60 + parseInt(currentParts[1]);
          const isNeedleRow = currentMinutes >= slotMinutes && currentMinutes < nextSlotMinutes;
          const isHour = slot.endsWith(":00");
          const zebra = rowIdx % 2 === 0;

          return (
            <tr key={slot} data-needle-row={isNeedleRow ? "true" : undefined} data-needle-percent={isNeedleRow ? ((currentMinutes - slotMinutes) / 30) * 100 : undefined}>
              <td style={{
                padding: "6px 8px",
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 10,
                fontWeight: isHour ? 800 : 600,
                color: isHour ? DARK : "rgba(10,37,64,0.55)",
                background: isHour ? CARD_BG : "#F4FBFD",
                borderRight: `2px solid ${isHour ? CYAN : "transparent"}`,
                textAlign: "right",
                letterSpacing: 0.5,
              }}>{slot.slice(0, 5)}</td>
              {diasSemana.map(dia => {
                const key = `${dia}-${slot}`;
                if (skipMap[key]) return null;
                const cellData = spanMap[key];
                if (!cellData) return <td key={dia} className="grade-empty-cell" style={{ padding: 0, height: 34 }} />;
                const { prog, rowSpan } = cellData;
                const isOnAir = prog && dia === diaAtual && currentTimeStr >= prog.horarioInicio && currentTimeStr < prog.horarioFim;
                const presenter = getPresenter(prog.apresentadorId);
                return (
                  <td key={dia} rowSpan={rowSpan}
                    className="grade-cell"
                    style={{
                      background: isOnAir
                        ? `linear-gradient(135deg, ${DARK} 0%, #123454 100%)`
                        : zebra ? "#FFFFFF" : "#FAFDFE",
                      verticalAlign: "top",
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: isOnAir
                        ? `2px solid ${CYAN}`
                        : `1px solid ${CARD_BG}`,
                      borderLeft: isOnAir
                        ? `4px solid ${LIME}`
                        : `4px solid ${CYAN}`,
                      boxShadow: isOnAir
                        ? `0 6px 20px rgba(0,191,240,0.35), inset 0 0 0 1px rgba(198,240,60,0.15)`
                        : `0 1px 2px rgba(10,37,64,0.04)`,
                      cursor: "pointer",
                      position: "relative",
                    }}
                    onClick={() => setDetailProg(prog)}
                  >
                    {isOnAir && (
                      <div style={{
                        position: "absolute", top: 6, right: 6,
                        background: LIME, color: DARK,
                        fontSize: 8, fontWeight: 900, letterSpacing: 1,
                        padding: "2px 6px", borderRadius: 4,
                        textTransform: "uppercase",
                      }}>
                        <span className="grade-onair-dot" />AO VIVO
                      </div>
                    )}
                    <div style={{
                      fontSize: 12, fontWeight: 800, lineHeight: 1.25,
                      wordBreak: "break-word",
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                      color: isOnAir ? "#FFFFFF" : DARK,
                      paddingRight: isOnAir ? 60 : 0,
                    }}>{prog.nome}</div>
                    <div style={{
                      fontSize: 10, marginTop: 4, fontWeight: 700,
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      color: isOnAir ? CYAN : "rgba(10,37,64,0.55)",
                      letterSpacing: 0.3,
                    }}>
                      {prog.horarioInicio.slice(0, 5)} — {prog.horarioFim.slice(0, 5)}
                    </div>
                    {(() => {
                      const names = getPresenterNames(prog);
                      return names ? (
                        <div style={{
                          display: "flex", alignItems: "center", gap: 6, marginTop: 6,
                        }}>
                          {presenter?.foto ? (
                            <img src={presenter.foto} alt="" style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover", border: `1.5px solid ${isOnAir ? CYAN : CARD_BG}` }} />
                          ) : (
                            <div style={{ width: 18, height: 18, borderRadius: "50%", background: isOnAir ? "rgba(255,255,255,0.15)" : CARD_BG, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: isOnAir ? "#FFFFFF" : DARK }}>
                              {names[0]?.toUpperCase()}
                            </div>
                          )}
                          <div style={{
                            fontSize: 9, fontWeight: 700,
                            color: isOnAir ? "rgba(255,255,255,0.85)" : "rgba(10,37,64,0.65)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            flex: 1, minWidth: 0,
                          }}>
                            {names}
                          </div>
                        </div>
                      ) : null;
                    })()}
                    {prog.classificacaoEtaria && (
                      <div style={{ marginTop: 6 }}>
                        <ClassificacaoBadge value={prog.classificacaoEtaria} size={14} />
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>

      {/* Detail popup */}
      {detailProg && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(10,37,64,0.55)", backdropFilter: "blur(4px)" }} onClick={() => setDetailProg(null)}>
          <div className="rounded-3xl max-w-2xl w-full mx-4 relative" style={{ backgroundColor: "#FFFFFF", padding: "24px", border: `1px solid ${CARD_BG}`, boxShadow: "0 20px 60px rgba(10,37,64,0.25)" }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setDetailProg(null)} className="absolute top-4 right-4 z-10 font-bold text-sm rounded-full p-1.5" style={{ color: DARK, background: CARD_BG }}>
              <X size={16} />
            </button>
            <div className="flex gap-5">
              {detailProg.capa && (
                <img src={detailProg.capa} alt={detailProg.nome} className="w-48 h-48 object-cover rounded-2xl shrink-0" style={{ border: `2px solid ${CARD_BG}` }} />
              )}
              <div className="space-y-2 flex-1 min-w-0">
                <h2 className="text-xl font-extrabold pr-6" style={{ color: DARK }}>{detailProg.nome}</h2>
                <p className="text-xs flex items-center gap-1.5 font-semibold" style={{ color: "rgba(10,37,64,0.6)" }}>
                  <Clock size={12} style={{ color: CYAN }} /> {detailProg.horarioInicio.slice(0, 5)} — {detailProg.horarioFim.slice(0, 5)}
                </p>
                <p className="text-xs flex items-center gap-1.5 font-semibold" style={{ color: "rgba(10,37,64,0.6)" }}>
                  <Calendar size={12} style={{ color: CYAN }} /> {detailProg.diasSemana.join(", ")}
                </p>
                {getPresenterName(detailProg.apresentadorId) && (
                  <p className="text-xs font-bold" style={{ color: DARK }}>
                    Locutor: <span style={{ color: CYAN }}>{getPresenterName(detailProg.apresentadorId)}</span>
                  </p>
                )}
                {detailProg.descricao && (
                  <p className="text-sm mt-2 leading-relaxed" style={{ color: "rgba(10,37,64,0.75)" }}>{detailProg.descricao}</p>
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
  const nomeInputRef = useRef<HTMLInputElement>(null);
  const nomeDraftRef = useRef("");
  const nomeIsFocusedRef = useRef(false);
  const nomeLastTypingAtRef = useRef(0);
  const nomePointerDownOutsideRef = useRef(false);
  const nomeAllowKeyboardBlurRef = useRef(false);
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
  const [formOpen, setFormOpen] = useState(false);

  // Auto-open form when editing
  useEffect(() => {
    if (editingId) setFormOpen(true);
  }, [editingId]);

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

  useEffect(() => {
    nomeDraftRef.current = nome;
    const input = nomeInputRef.current;
    if (input && document.activeElement !== input && input.value !== nome) {
      input.value = nome;
    }
  }, [nome]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const input = nomeInputRef.current;
      nomePointerDownOutsideRef.current = !!input && !input.contains(event.target as Node);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab" || event.key === "Escape") {
        nomeAllowKeyboardBlurRef.current = true;
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  const keepNomeFocusIfTyping = (value: string) => {
    setNome(value);

    const shouldRestoreFocus =
      nomeIsFocusedRef.current &&
      !nomePointerDownOutsideRef.current &&
      !nomeAllowKeyboardBlurRef.current &&
      Date.now() - nomeLastTypingAtRef.current < 1500;

    if (!shouldRestoreFocus) {
      nomeIsFocusedRef.current = false;
      nomeAllowKeyboardBlurRef.current = false;
      return;
    }

    requestAnimationFrame(() => {
      const input = nomeInputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      const cursorPosition = input.value.length;
      input.setSelectionRange(cursorPosition, cursorPosition);
    });
  };

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

  const handleDownload = async (url: string, filename: string) => {
    if (!url) return;
    try {
      if (url.startsWith('data:')) {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      console.error("Erro ao baixar imagem:", error);
      window.open(url, '_blank');
    }
  };

  const toggleDia = (dia: string) => {
    setDiasSemana(prev => prev.includes(dia) ? prev.filter(d => d !== dia) : [...prev, dia]);
  };

  const resetForm = () => {
    nomeDraftRef.current = "";
    if (nomeInputRef.current) nomeInputRef.current.value = "";
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
    const nomeAtual = (nomeInputRef.current?.value ?? nomeDraftRef.current ?? nome).trim();
    if (!nomeAtual || !user) return;
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
          nome: nomeAtual, apresentador_id: apresentadoresIds[0] || apresentadorId || null, selo, dias_semana: [dayOfWeek],
          horario_inicio: horarioInicio, horario_fim: horarioFim, estudio: estudio.trim(), ativo, descricao: descricao.trim(),
          variavel: true, data_variavel: dataStr, classificacao_etaria: classificacaoEtaria || null, tipo_programa: tipoPrograma || null,
          apresentadores_ids: apresentadoresIds,
        } as any).eq("id", editingId);
      } else {
        const { data: inserted } = await supabase.from("programas").insert({
          user_id: user.id, nome: nomeAtual, apresentador_id: apresentadoresIds[0] || apresentadorId || null, selo, dias_semana: [dayOfWeek],
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
        nome: nomeAtual, apresentador_id: apresentadoresIds[0] || apresentadorId || null, selo, dias_semana: diasSemana,
        horario_inicio: horarioInicio, horario_fim: horarioFim, estudio: estudio.trim(), ativo, descricao: descricao.trim(),
        variavel: false, data_variavel: null, classificacao_etaria: classificacaoEtaria || null, tipo_programa: tipoPrograma || null,
        apresentadores_ids: apresentadoresIds,
      } as any).eq("id", editingId);
    } else {
      const { data: inserted } = await supabase.from("programas").insert({
        user_id: user.id, nome: nomeAtual, apresentador_id: apresentadoresIds[0] || apresentadorId || null, selo, dias_semana: diasSemana,
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
    nomeDraftRef.current = p.nome;
    if (nomeInputRef.current) nomeInputRef.current.value = p.nome;
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
    
    // Calculate next slot time
    const [h, m, s] = slotTime.split(":").map(Number);
    let nextM = m + 30;
    let nextH = h;
    if (nextM >= 60) {
      nextM = 0;
      nextH++;
    }
    const nextSlotTime = `${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}:00`;

    const matching = gradeProgramas.filter(p => {
      if (!p.ativo) return false;
      // Overlap logic: program starts before slot ends AND program ends after slot starts
      const overlaps = p.horarioInicio < nextSlotTime && p.horarioFim > slotTime;
      return p.diasSemana.includes(dia) && overlaps;
    });

    if (matching.length === 0) return undefined;

    // Variable programs take priority but ONLY on their specific date
    const variable = matching.find(p => p.variavel && p.dataVariavel === dateForDay);
    if (variable) return variable;

    // Priority: show program that starts in this slot if any
    const startsInSlot = matching.find(p => p.horarioInicio >= slotTime && p.horarioInicio < nextSlotTime);
    if (startsInSlot) return startsInSlot;

    // Otherwise show fixed (non-variable) program
    return matching.find(p => !p.variavel) || matching[0];
  };

  // Sorted + filtered programs for list
  const sortedProgramas = useMemo(() => {
    const WD = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
    const WE = ["Sábado", "Domingo"];
    let sorted = [...programas];
    if (periodoFilter !== "todos") {
      sorted = sorted.filter(p => {
        const days = p.diasSemana || [];
        if (periodoFilter === "semana") return days.some(d => WD.includes(d));
        return days.some(d => WE.includes(d));
      });
    }
    switch (sortBy) {
      case "nome": sorted.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")); break;
      case "estudio": sorted.sort((a, b) => a.estudio.localeCompare(b.estudio, "pt-BR")); break;
      case "status": sorted.sort((a, b) => (a.ativo === b.ativo ? 0 : a.ativo ? -1 : 1)); break;
      default: sorted.sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio)); break;
    }
    return sorted;
  }, [programas, sortBy, periodoFilter]);


  if (loadingData) return <ModulePageSkeleton variant="form" />;

  // === Nexo Form Design System (mesmo do Cadastro de Ouvinte) ===
  const CYAN = "#00BFF0";
  const LIME = "#C6F03C";
  const CARD_BG = "#D6F4FB";
  const DARK = "#0A2540";

  const pillInput: React.CSSProperties = {
    width: "100%",
    height: 44,
    borderRadius: 999,
    background: "#FFFFFF",
    border: `2px solid ${CYAN}`,
    padding: "0 20px",
    fontFamily: "'Montserrat', sans-serif",
    fontSize: 13,
    color: DARK,
    outline: "none",
  };

  const pillSelectTrigger: React.CSSProperties = {
    ...pillInput,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    textAlign: "left" as const,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "'Montserrat', sans-serif",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: DARK,
    marginBottom: 8,
    display: "block",
  };

  const primaryBtn: React.CSSProperties = {
    height: 44,
    padding: "0 28px",
    borderRadius: 999,
    background: LIME,
    border: "none",
    color: DARK,
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(198, 240, 60, 0.35)",
  };

  const secondaryBtn: React.CSSProperties = {
    height: 44,
    padding: "0 22px",
    borderRadius: 999,
    background: "#FFFFFF",
    border: `2px solid ${CYAN}`,
    color: DARK,
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
  };

  const smallCyanBtn: React.CSSProperties = {
    height: 36,
    padding: "0 14px",
    borderRadius: 999,
    background: CYAN,
    border: "none",
    color: "#FFFFFF",
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };






  const uploadBox = (img: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, w: number, h: number) => (
    <label
      style={{
        width: w,
        height: h,
        borderRadius: 18,
        background: "#FFFFFF",
        border: `2px dashed ${CYAN}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        overflow: "hidden",
      }}
    >
      {img ? (
        <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ fontSize: 9, fontWeight: 700, color: DARK, letterSpacing: 0.5, textTransform: "uppercase" }}>
          Upload
        </span>
      )}
      <input type="file" accept="image/*" onChange={onChange} style={{ display: "none" }} />
    </label>
  );

  return (
    <div className="animate-fade-in space-y-8" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* FORM CARD */}
      <section
        ref={formRef}
        style={{
          background: CARD_BG,
          borderRadius: 28,
          padding: "28px 32px 32px",
          boxShadow: "0 2px 12px rgba(10, 37, 64, 0.05)",
        }}
      >
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            style={{ display: "inline-flex", alignItems: "center", gap: 12, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 999, background: CYAN, color: "#FFFFFF" }}>
              {formOpen ? <ChevronDown size={18} /> : <Plus size={18} />}
            </span>
            <h3 style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, color: DARK, textTransform: "uppercase", margin: 0 }}>
              {editingId ? "Editar Programa" : "Cadastro de Programa"}
            </h3>
            {!formOpen && !editingId && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", letterSpacing: 1, textTransform: "uppercase" }}>
                Clique para expandir
              </span>
            )}
          </button>
          {formOpen && (
            <div className="flex items-center gap-3 flex-wrap">
              {/* Ativo Toggle */}
              <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none", background: "#FFFFFF", border: `2px solid ${CYAN}`, borderRadius: 999, padding: "6px 14px" }}>
                <div style={{ position: "relative", width: 34, height: 18 }}>
                  <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: "absolute", inset: 0, borderRadius: 999, background: ativo ? LIME : "#E2E8F0", transition: "background 0.2s" }} />
                  <span style={{ position: "absolute", top: 2, left: ativo ? 18 : 2, width: 14, height: 14, borderRadius: "50%", background: "#FFFFFF", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: DARK, letterSpacing: 1.5, textTransform: "uppercase" }}>{ativo ? "Ativo" : "Inativo"}</span>
              </label>
              {/* Variável Toggle */}
              <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none", background: "#FFFFFF", border: `2px solid ${variavel ? "#F59E0B" : CYAN}`, borderRadius: 999, padding: "6px 14px" }}>
                <div style={{ position: "relative", width: 34, height: 18 }}>
                  <input type="checkbox" checked={variavel} onChange={(e) => { setVariavel(e.target.checked); if (!e.target.checked) setDataVariavel(undefined); }} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: "absolute", inset: 0, borderRadius: 999, background: variavel ? "#F59E0B" : "#E2E8F0", transition: "background 0.2s" }} />
                  <span style={{ position: "absolute", top: 2, left: variavel ? 18 : 2, width: 14, height: 14, borderRadius: "50%", background: "#FFFFFF", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: DARK, letterSpacing: 1.5, textTransform: "uppercase" }}>Variável</span>
              </label>
            </div>
          )}
        </div>

        {formOpen && (<>


        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
          <Field label="Nome do Programa" span="lg:col-span-2">
            <input
              ref={nomeInputRef}
              style={pillInput}
              defaultValue={nome}
              onFocus={() => {
                nomeIsFocusedRef.current = true;
                nomePointerDownOutsideRef.current = false;
                nomeAllowKeyboardBlurRef.current = false;
              }}
              onChange={(e) => {
                nomeDraftRef.current = e.target.value;
                nomeLastTypingAtRef.current = Date.now();
              }}
              onBlur={(e) => keepNomeFocusIfTyping(e.target.value)}
              placeholder="Digite o nome do programa"
            />
          </Field>

          <Field label="Tipo do Programa">
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Select value={tipoPrograma} onValueChange={setTipoPrograma}>
                  <SelectTrigger style={pillSelectTrigger}>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposPrograma.map(t => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <Dialog open={tipoDialogOpen} onOpenChange={setTipoDialogOpen}>
                <DialogTrigger asChild>
                  <button style={smallCyanBtn}>+ Novo</button>
                </DialogTrigger>
                <DialogContent style={{ background: CARD_BG, borderRadius: 24, border: "none" }}>
                  <DialogHeader><DialogTitle style={{ color: DARK, fontFamily: "'Montserrat', sans-serif", fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", fontSize: 14 }}>Novo Tipo de Programa</DialogTitle></DialogHeader>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                    <input style={pillInput} value={newTipo} onChange={(e) => setNewTipo(e.target.value)} placeholder="Nome do tipo" />
                    <button onClick={addTipo} style={{ ...primaryBtn, width: "100%", justifyContent: "center" }}>Adicionar</button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </Field>

          <Field label="Classificação Etária">
            <Select value={classificacaoEtaria} onValueChange={setClassificacaoEtaria}>
              <SelectTrigger style={pillSelectTrigger}>
                <SelectValue placeholder="Selecione" />
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
          </Field>

          <Field label="Apresentadores" span="lg:col-span-2">
            <Popover open={apresentadorComboOpen} onOpenChange={setApresentadorComboOpen}>
              <PopoverTrigger asChild>
                <button style={pillSelectTrigger}>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: apresentadoresIds.length ? DARK : "#94A3B8" }}>
                    {apresentadoresIds.length > 0
                      ? apresentadoresIds.map(id => apresentadores.find(a => a.id === id)?.nome).filter(Boolean).join(", ")
                      : "Selecionar apresentadores"}
                  </span>
                  <ChevronsUpDown size={14} style={{ color: CYAN }} />
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
              <div className="flex flex-wrap gap-1.5 mt-2">
                {apresentadoresIds.map(id => {
                  const ap = apresentadores.find(a => a.id === id);
                  if (!ap) return null;
                  return (
                    <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "#FFFFFF", border: `1px solid ${CYAN}`, fontSize: 11, fontWeight: 700, color: DARK }}>
                      {ap.nome}
                      <button onClick={() => toggleApresentador(id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: DARK, display: "inline-flex" }}>
                        <X size={11} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </Field>

          <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Building2 size={12} /> Estúdio</span>}>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Select value={estudio} onValueChange={setEstudio}>
                  <SelectTrigger style={pillSelectTrigger}>
                    <SelectValue placeholder="Selecione o estúdio" />
                  </SelectTrigger>
                  <SelectContent>
                    {estudios.map(e => (<SelectItem key={e} value={e}>{e}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <Dialog open={estudioDialogOpen} onOpenChange={setEstudioDialogOpen}>
                <DialogTrigger asChild>
                  <button style={smallCyanBtn}>+ Novo</button>
                </DialogTrigger>
                <DialogContent style={{ background: CARD_BG, borderRadius: 24, border: "none" }}>
                  <DialogHeader><DialogTitle style={{ color: DARK, fontFamily: "'Montserrat', sans-serif", fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", fontSize: 14 }}>Cadastrar Estúdio</DialogTitle></DialogHeader>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                    <input style={pillInput} value={newEstudio} onChange={(e) => setNewEstudio(e.target.value)} placeholder="Nome do estúdio" />
                    <button onClick={addEstudio} style={{ ...primaryBtn, width: "100%", justifyContent: "center" }}>Adicionar</button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </Field>

          <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Clock size={12} /> Horário Início</span>}>
            <input style={pillInput} type="time" step="1" value={horarioInicio} onChange={(e) => setHorarioInicio(e.target.value)} />
          </Field>
          <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Clock size={12} /> Horário Fim</span>}>
            <input style={pillInput} type="time" step="1" value={horarioFim} onChange={(e) => setHorarioFim(e.target.value)} />
          </Field>

          <Field label="Descrição" span="md:col-span-2 lg:col-span-3">
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição do programa (opcional)"
              style={{
                width: "100%",
                minHeight: 80,
                borderRadius: 22,
                background: "#FFFFFF",
                border: `2px solid ${CYAN}`,
                padding: "12px 18px",
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 13,
                color: DARK,
                outline: "none",
                resize: "vertical",
              }}
            />
          </Field>

          <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Calendar size={12} /> Dias da Semana</span>} span="md:col-span-2 lg:col-span-3">
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA.map(dia => {
                const active = diasSemana.includes(dia);
                return (
                  <button
                    key={dia}
                    onClick={() => toggleDia(dia)}
                    style={{
                      height: 38,
                      padding: "0 18px",
                      borderRadius: 999,
                      background: active ? CYAN : "#FFFFFF",
                      border: `2px solid ${CYAN}`,
                      color: active ? "#FFFFFF" : DARK,
                      fontWeight: 800,
                      fontSize: 11,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    {dia.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Selo (1080×1080 PNG alpha)">
            <div className="flex items-center gap-3">
              {uploadBox(selo, handleSelo, 72, 72)}
              {selo && (
                <div className="flex flex-col gap-1">
                  <button onClick={() => setSelo("")} style={{ background: "transparent", border: "none", color: "#DC2626", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    <Trash2 size={11} className="inline mr-1" /> Remover
                  </button>
                  <button onClick={() => handleDownload(selo, `selo_${nome || "programa"}.png`)} style={{ background: "transparent", border: "none", color: CYAN, fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    <Download size={11} className="inline mr-1" /> Baixar
                  </button>
                </div>
              )}
            </div>
          </Field>
          <Field label="Capa (226×302 PNG alpha)">
            <div className="flex items-center gap-3">
              {uploadBox(capa, handleCapa, 60, 82)}
              {capa && (
                <div className="flex flex-col gap-1">
                  <button onClick={() => setCapa("")} style={{ background: "transparent", border: "none", color: "#DC2626", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    <Trash2 size={11} className="inline mr-1" /> Remover
                  </button>
                  <button onClick={() => handleDownload(capa, `capa_${nome || "programa"}.png`)} style={{ background: "transparent", border: "none", color: CYAN, fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    <Download size={11} className="inline mr-1" /> Baixar
                  </button>
                </div>
              )}
            </div>
          </Field>
          <Field label="Thumb (1920×1080 PNG)">
            <div className="flex items-center gap-3">
              {uploadBox(thumb, handleThumb, 108, 60)}
              {thumb && (
                <div className="flex flex-col gap-1">
                  <button onClick={() => setThumb("")} style={{ background: "transparent", border: "none", color: "#DC2626", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    <Trash2 size={11} className="inline mr-1" /> Remover
                  </button>
                  <button onClick={() => handleDownload(thumb, `thumb_${nome || "programa"}.png`)} style={{ background: "transparent", border: "none", color: CYAN, fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    <Download size={11} className="inline mr-1" /> Baixar
                  </button>
                </div>
              )}
            </div>
          </Field>

          {variavel && (
            <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#B45309" }}><CalendarDays size={12} /> Data do Programa Variável</span>} span="md:col-span-2 lg:col-span-3">
              <Popover>
                <PopoverTrigger asChild>
                  <button style={{ ...pillSelectTrigger, borderColor: "#F59E0B" }}>
                    <span style={{ color: dataVariavel ? DARK : "#94A3B8" }}>
                      {dataVariavel ? format(dataVariavel, "dd/MM/yyyy (EEEE)", { locale: ptBR }) : "Selecione a data"}
                    </span>
                    <CalendarDays size={14} style={{ color: "#F59E0B" }} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarUI mode="single" selected={dataVariavel} onSelect={setDataVariavel} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              <p style={{ fontSize: 10, color: "#92400E", marginTop: 6 }}>
                ⚠️ Este programa substituirá o programa fixo neste horário apenas na data selecionada.
              </p>
            </Field>
          )}
        </div>

        {conflictMsg && (
          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 999, background: "#FEE2E2", border: "1px solid #FCA5A5" }}>
            <AlertCircle size={14} style={{ color: "#DC2626" }} />
            <p style={{ fontSize: 12, color: "#991B1B", margin: 0, fontWeight: 600 }}>{conflictMsg}</p>
          </div>
        )}

        <div className="mt-8 flex items-center justify-end gap-3 flex-wrap">
          {editingId && (
            <button onClick={resetForm} style={secondaryBtn}>
              <X size={16} /> Cancelar
            </button>
          )}
          <button
            onClick={handleAdd}
            disabled={saving}
            style={{ ...primaryBtn, opacity: saving ? 0.6 : 1, cursor: saving ? "wait" : "pointer" }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {saving ? "Salvando..." : editingId ? "Atualizar" : "Salvar Programa"}
          </button>
        </div>
        </>)}
      </section>


      {/* LIST CARD — exibido acima da grade a pedido do usuário */}

      {programas.length > 0 && (
        <section
          style={{
            background: "#FFFFFF",
            borderRadius: 28,
            padding: "20px 24px 28px",
            border: "1px solid #E5F5FB",
            boxShadow: "0 2px 12px rgba(10, 37, 64, 0.04)",
          }}
        >
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <div className="flex items-center gap-3" style={{ color: DARK }}>
              <PlaySquare size={18} style={{ color: CYAN }} />
              <h3 style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>
                Programas Cadastrados
              </h3>
              <span style={{ fontSize: 11, fontWeight: 700, background: CARD_BG, color: DARK, padding: "3px 12px", borderRadius: 999 }}>
                {sortedProgramas.length}
              </span>
            </div>
            <div style={{ minWidth: 180 }}>
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger style={{ ...pillSelectTrigger, height: 38, fontSize: 12 }}>
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="horario">Ordenar por Horário</SelectItem>
                  <SelectItem value="nome">Ordenar por Nome</SelectItem>
                  <SelectItem value="estudio">Ordenar por Estúdio</SelectItem>
                  <SelectItem value="status">Ordenar por Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div style={{ overflowX: "auto", borderRadius: 16, border: `1px solid ${CARD_BG}` }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
              <thead>
                <tr style={{ background: CYAN, color: "#FFFFFF" }}>
                  {["Programa", "Exibição", "Horário", "Apresentador", "Estúdio", "Status", "Ações"].map((h) => (
                    <th key={h} style={{ padding: "12px 14px", textAlign: h === "Status" || h === "Ações" ? "center" : "left", fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", fontSize: 10, whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedProgramas.map((p, i) => (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? "#FFFFFF" : "#F7FCFE", color: DARK }}>
                    <td style={{ padding: "10px 14px", fontWeight: 700 }}>
                      <div className="flex items-center gap-2">
                        {p.capa && <img src={p.capa} alt="" style={{ width: 34, height: 34, borderRadius: 10, objectFit: "cover", border: `1px solid ${CARD_BG}` }} />}
                        <div>
                          <div className="flex items-center gap-1.5">
                            {p.nome}
                            {p.variavel && <span style={{ fontSize: 9, padding: "1px 8px", borderRadius: 999, fontWeight: 800, background: "#FEF3C7", color: "#92400E", letterSpacing: 0.5 }}>VAR</span>}
                          </div>
                          {p.classificacaoEtaria && <div style={{ marginTop: 3 }}><ClassificacaoBadge value={p.classificacaoEtaria} size={13} /></div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 11 }}>
                      {p.variavel && p.dataVariavel
                        ? format(new Date(p.dataVariavel + "T12:00:00"), "dd/MM/yyyy (EEEE)", { locale: ptBR })
                        : (
                          <div className="flex flex-wrap gap-1">
                            {(() => {
                              const WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
                              const days = p.diasSemana || [];
                              const isMonFri = WEEKDAYS.every(d => days.includes(d)) && !days.includes("Sábado") && !days.includes("Domingo");
                              if (isMonFri) {
                                return (
                                  <span style={{ padding: "2px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: CARD_BG, color: DARK }}>Seg → Sex</span>
                                );
                              }
                              return days.map(d => (
                                <span key={d} style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: CARD_BG, color: DARK }}>{d.slice(0, 3)}</span>
                              ));
                            })()}
                          </div>
                        )}
                    </td>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      <span className="inline-flex items-center gap-1.5" style={{ fontWeight: 600 }}>
                        <Clock size={11} style={{ color: CYAN }} />
                        {p.horarioInicio.slice(0, 5)} — {p.horarioFim.slice(0, 5)}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>{getApresentadoresNomes(p)}</td>
                    <td style={{ padding: "10px 14px" }}>{p.estudio || "—"}</td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 800, background: p.ativo ? "#DCFCE7" : "#FEE2E2", color: p.ativo ? "#166534" : "#991B1B" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.ativo ? "#22C55E" : "#DC2626" }} />
                        {p.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button onClick={() => startEdit(p)} title="Editar" style={{ width: 30, height: 30, borderRadius: "50%", background: CARD_BG, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: DARK }}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => toggleAtivo(p.id, p.ativo)} title={p.ativo ? "Desativar" : "Ativar"} style={{ width: 30, height: 30, borderRadius: "50%", background: p.ativo ? "#DCFCE7" : "#FEE2E2", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: p.ativo ? "#166534" : "#991B1B" }}>
                          <Power size={14} />
                        </button>
                        <button onClick={() => removePrograma(p.id)} title="Remover" style={{ width: 30, height: 30, borderRadius: "50%", background: "#FEE2E2", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#DC2626" }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* GRADE DE PROGRAMAÇÃO — exibida abaixo da lista de cadastros */}
      {programas.length > 0 && (
        <section
          style={{
            background: "#FFFFFF",
            borderRadius: 28,
            padding: "20px 24px 24px",
            border: "1px solid #E5F5FB",
            boxShadow: "0 2px 12px rgba(10, 37, 64, 0.04)",
          }}
        >
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <div className="flex items-center gap-3" style={{ color: DARK }}>
              <Calendar size={18} style={{ color: CYAN }} />
              <h3 style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>
                Grade de Programação
              </h3>
            </div>
            <div style={{ minWidth: 200 }}>
              <Select value={gradeEstudioFilter} onValueChange={setGradeEstudioFilter}>
                <SelectTrigger style={{ ...pillSelectTrigger, height: 38, fontSize: 12 }}>
                  <SelectValue placeholder="Filtrar por estúdio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os estúdios</SelectItem>
                  {estudios.map(e => (<SelectItem key={e} value={e}>{e}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <style>{`
            .grade-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
            .grade-scroll::-webkit-scrollbar-track { background: transparent; }
            .grade-scroll::-webkit-scrollbar-thumb { background: ${CYAN}; border-radius: 3px; }
          `}</style>
          <div
            ref={gradeRef}
            className="rounded-2xl overflow-auto max-h-[440px] grade-scroll"
            style={{ border: `1px solid ${CARD_BG}`, background: "#FFFFFF", position: "relative" }}
          >
            <table data-no-row-hover className="w-full text-xs border-separate border-spacing-[2px]">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: `linear-gradient(180deg, ${CYAN} 0%, #00A9D6 100%)` }}>
                  <th style={{ padding: "12px 12px", textAlign: "right", width: 78, fontSize: 9, fontWeight: 900, letterSpacing: 1.4, textTransform: "uppercase", color: "#FFFFFF" }}>Horário</th>
                  {DIAS_SEMANA.map(dia => {
                    const isToday = dia === diaAtual;
                    return (
                      <th key={dia} style={{
                        padding: "10px 8px", textAlign: "center", fontSize: 10, fontWeight: 900, letterSpacing: 1.4, textTransform: "uppercase",
                        color: isToday ? DARK : "#FFFFFF",
                        background: isToday ? LIME : "transparent",
                        borderBottom: isToday ? `3px solid ${DARK}` : "3px solid transparent",
                        position: "relative",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                          {isToday && <span style={{ width: 6, height: 6, borderRadius: "50%", background: DARK, display: "inline-block" }} />}
                          {dia.slice(0, 3)}
                        </div>
                        <div style={{ fontSize: 10, marginTop: 2, opacity: isToday ? 0.75 : 0.85, fontWeight: 700 }}>{weekDates[dia]}</div>
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
            <div ref={needleRef} style={{
              position: "absolute", left: 0, right: 0, height: 2,
              background: "linear-gradient(90deg, #DC2626, #EF4444)",
              zIndex: 15, pointerEvents: "none", display: "none",
              boxShadow: "0 0 6px rgba(220,38,38,0.4)",
            }}>
              <div style={{ position: "absolute", left: -4, top: -4, width: 10, height: 10, borderRadius: "50%", background: "#DC2626", boxShadow: "0 0 6px rgba(220,38,38,0.5)" }} />
              <div style={{ position: "absolute", left: 12, top: -9, fontSize: 9, fontWeight: 700, color: "#FFFFFF", background: "#DC2626", padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>
                {currentTimeStr.slice(0, 5)}
              </div>
            </div>
          </div>
        </section>
      )}



      {showSuccess && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10, 37, 64, 0.4)" }}>
          <div style={{ width: 420, padding: "28px 32px", background: CARD_BG, borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, boxShadow: "0 20px 60px rgba(10, 37, 64, 0.3)" }}>
            <CheckCircle size={24} style={{ color: CYAN }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: DARK, letterSpacing: 1, textTransform: "uppercase" }}>
              Salvo com sucesso!
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

