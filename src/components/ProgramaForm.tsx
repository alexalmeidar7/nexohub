import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Trash2, Clock, Calendar, Building2, Pencil, X, Power, Loader2, Info, CalendarDays, CheckCircle, ChevronsUpDown, Check, PlaySquare, Download, ChevronDown, Plus, Upload, Image as ImageIcon, Minus } from "lucide-react";
import { format, addDays, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { getApresentadores, type Apresentador } from "./ApresentadorForm";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { uploadProgramImage } from "@/lib/uploadProgramImage";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";
import { getClientHouseMixProgramsSync } from "@/lib/houseMixProgramasService";
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
import { getStoredMetadata } from "./ClientesPage";
import {
  saveCustomProgram,
  removeCustomProgram,
  saveCustomStudio,
  removeCustomStudio,
  getStoredCustomPrograms,
  getStoredCustomEstudios,
  normalizeClientKey,
  DEFAULT_STATION_DATA,
  type HouseMixProgram
} from "@/lib/houseMixProgramasService";
import {
  resolveProgramBadge,
  resolveProgramSelo,
  resolveProgramCover,
  resolveProgramThumb,
  isSafeImageUrl,
  sanitizeProgramImages,
} from "@/lib/programImageResolver";

const DEFAULT_ESTUDIOS = ["ESTÚDIO FM", "PODCAST"];
const ESTUDIOS_STORAGE_KEY = "nexohub_estudios_cadastrados";

const getStoredEstudios = (): string[] => {
  try {
    const raw = localStorage.getItem(ESTUDIOS_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(e => (typeof e === "string" ? e.toUpperCase().trim() : "")).filter(Boolean);
      }
    }
  } catch {}
  return DEFAULT_ESTUDIOS;
};

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

export function ProgramBadge({
  program,
  size = 36,
  className
}: {
  program?: {
    nome?: string | null;
    selo?: string | null;
    capa?: string | null;
    thumb?: string | null;
  } | null;
  size?: number;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const resolved = useMemo(
    () => resolveProgramBadge(program),
    [program?.selo, program?.capa, program?.thumb, program?.nome]
  );

  useEffect(() => {
    setHasError(false);
  }, [resolved]);

  if (resolved && !hasError) {
    return (
      <img
        src={resolved}
        alt={program?.nome || "Programa"}
        onError={() => setHasError(true)}
        className={cn("object-cover shrink-0 select-none", className)}
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          backgroundColor: "#0A2540",
          border: "1.5px solid rgba(0, 194, 203, 0.35)",
          boxShadow: "0 2px 6px rgba(10,37,64,0.12)",
        }}
      />
    );
  }

  const initial = (program?.nome || "P").trim().charAt(0).toUpperCase();
  return (
    <div
      className={cn("shrink-0 flex items-center justify-center font-black select-none text-white", className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: "linear-gradient(135deg, #00C2CB 0%, #0055FF 100%)",
        fontSize: Math.max(11, Math.round(size * 0.4)),
        border: "1px solid #E8F4F8",
        boxShadow: "0 2px 6px rgba(10,37,64,0.06)",
      }}
      title={program?.nome || "Programa"}
    >
      {initial}
    </div>
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


export interface Programa {
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
  cliente?: string;
}

const DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

import { fetchStationDatabaseData, getStationDatabaseSync } from "@/lib/stationDatabaseService";

/**
 * Grava o programa no banco confirmando que a linha foi realmente persistida.
 * Retorna uma mensagem de erro quando nada foi gravado (ex.: RLS bloqueando).
 */
async function getWritableProgramSession(fallbackSession?: Session | null): Promise<Session | null> {
  const isSynthetic = (token?: string | null) =>
    !!token && (token.startsWith("client-token-") || token.startsWith("admin-token-") || token.startsWith("sim-"));

  try {
    const { data: currentData } = await supabase.auth.getSession();
    let activeSession = currentData.session;

    // O AuthProvider pode manter a sessão de backup na interface enquanto o
    // cliente Supabase ainda está hidratando o storage do Desktop.
    if (!activeSession && fallbackSession?.access_token && fallbackSession.refresh_token && !isSynthetic(fallbackSession.access_token)) {
      const restored = await supabase.auth.setSession({
        access_token: fallbackSession.access_token,
        refresh_token: fallbackSession.refresh_token,
      });
      if (!restored.error) activeSession = restored.data.session;
    }

    if (!activeSession) {
      const refreshed = await supabase.auth.refreshSession();
      if (!refreshed.error) activeSession = refreshed.data.session;
    }
    if (!activeSession) return null;

    // Tokens prestes a expirar não devem ser usados para iniciar uma gravação.
    // Sessões simuladas/de cliente não são JWTs Supabase e não devem ser renovadas.
    if (!isSynthetic(activeSession.access_token)) {
      const expiresAtMs = Number(activeSession.expires_at || 0) * 1000;
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() + 60_000) {
        const refreshed = await supabase.auth.refreshSession();
        if (refreshed.error || !refreshed.data.session) return null;
        activeSession = refreshed.data.session;
      }
    }

    return activeSession;
  } catch (error) {
    console.warn("Não foi possível restaurar/renovar a sessão antes de salvar o programa:", error);
    return null;
  }
}

async function persistPrograma(opts: {
  targetId: string;
  ownerId: string | null | undefined;
  payload: Record<string, unknown>;
  isUpdate: boolean;
  fallbackSession?: Session | null;
}): Promise<string | null> {
  const { targetId, ownerId, payload, isUpdate } = opts;
  const friendly = (msg?: string | null) => {
    const m = (msg || "").toLowerCase();
    if (m.includes("row-level security") || m.includes("permission denied") || m.includes("jwt")) {
      return "Sua sessão não tem permissão para gravar no banco. Saia e entre novamente com seu e-mail e senha para salvar o programa.";
    }
    return msg || null;
  };

  try {
    // Garante uma sessão real e válida antes de gravar (evita gravar como anônimo
    // quando o token de renovação expirou e a tela manteve o usuário "logado").
    const validSession = await getWritableProgramSession(opts.fallbackSession);
    if (!validSession) {
      return "Sua sessão expirou ou não pôde ser renovada. Entre novamente com seu e-mail e senha para salvar o programa.";
    }
    if (isUpdate) {
      const { data, error } = await supabase
        .from("programas")
        .update(payload as any)
        .eq("id", targetId)
        .select("id");
      if (!error && data && data.length > 0) return null;
      if (error) console.warn("Supabase update programa notice:", error);
      const { data: upData, error: upErr } = await supabase
        .from("programas")
        .upsert({ id: targetId, user_id: ownerId, ...payload } as any, { onConflict: "id" })
        .select("id");
      if (!upErr && upData && upData.length > 0) return null;
      return friendly(upErr?.message) || "Não foi possível salvar as alterações do programa.";
    }
    const isDbId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
    const { data, error } = await supabase
      .from("programas")
      .insert({ ...(isDbId ? { id: targetId } : {}), user_id: ownerId, ...payload } as any)
      .select("id");
    if (!error && data && data.length > 0) return null;
    return friendly(error?.message) || "Não foi possível cadastrar o programa.";

  } catch (err: any) {
    return err?.message || "Falha de conexão ao salvar o programa.";
  }
}


/** true quando a última leitura veio do banco online (fonte de verdade). */
export let lastProgramasFromDb = false;

export async function getProgramas(targetUserId?: string | null, userEmail?: string | null): Promise<Programa[]> {
  lastProgramasFromDb = false;
  const acc = findClientAccountById(targetUserId) || findClientAccountByEmail(userEmail || targetUserId);
  const effectiveId = acc?.parentUserId || acc?.id || targetUserId;
  const targetSlug = acc?.slug || targetUserId;
  const stationName = acc?.nome || acc?.razaoSocial || "";

  try {
    let query = supabase.from("programas").select("*").is("deleted_at" as any, null);
    if (effectiveId) {
      query = query.eq("user_id", effectiveId);
    }
    const { data, error } = await query;
    lastProgramasFromDb = !error && Array.isArray(data) && !!effectiveId;
    if (lastProgramasFromDb) {
      return (data || []).map(p => sanitizeProgramImages({
        id: p.id || `prog_${Math.random()}`,
        nome: p.nome || "Programa Sem Nome",
        apresentadorId: p.apresentador_id || "",
        apresentadoresIds: (p as any).apresentadores_ids || (p.apresentador_id ? [p.apresentador_id] : []),
        selo: p.selo || (p as any).thumb || (p as any).capa || "",
        capa: (p as any).capa || "",
        thumb: (p as any).thumb || "",
        diasSemana: Array.isArray(p.dias_semana) ? p.dias_semana : (typeof p.dias_semana === 'string' ? (p.dias_semana as string).split(',').map(s => s.trim()).filter(Boolean) : []),
        horarioInicio: p.horario_inicio || (p as any).horarioInicio || "00:00:00",
        horarioFim: p.horario_fim || (p as any).horarioFim || "00:00:00",
        estudio: p.estudio || "Estúdio FM",
        ativo: (p as any).ativo ?? true,
        variavel: (p as any).variavel ?? false,
        descricao: (p as any).descricao || "",
        dataVariavel: (p as any).data_variavel || null,
        classificacaoEtaria: (p as any).classificacao_etaria || "",
        tipoPrograma: (p as any).tipo_programa || "Musical",
        cliente: stationName || (p as any).cliente || (p as any).cliente_nome || (acc ? normalizeClientKey(acc.nome) : undefined),
      }));
    }
  } catch (err) {
    console.warn("getProgramas from supabase warning:", err);
  }

  try {
    const stationData = await fetchStationDatabaseData(effectiveId || targetSlug || userEmail);
    if (stationData?.programas && stationData.programas.length > 0) {
      return stationData.programas.map(p => sanitizeProgramImages({
        id: p.id || `prog_${Math.random()}`,
        nome: p.nome || "Programa Sem Nome",
        apresentadorId: p.apresentador_id || p.apresentadorId || "",
        apresentadoresIds: (p as any).apresentadores_ids || (p as any).apresentadoresIds || (p.apresentador_id ? [p.apresentador_id] : []),
        selo: p.selo || (p as any).thumb || (p as any).capa || "",
        capa: (p as any).capa || "",
        thumb: (p as any).thumb || "",
        diasSemana: Array.isArray(p.dias_semana) ? p.dias_semana : (Array.isArray(p.diasSemana) ? p.diasSemana : (typeof p.dias_semana === 'string' ? (p.dias_semana as string).split(',').map(s => s.trim()).filter(Boolean) : [])),
        horarioInicio: p.horario_inicio || p.horarioInicio || "00:00:00",
        horarioFim: p.horario_fim || p.horarioFim || "00:00:00",
        estudio: p.estudio || "Estúdio FM",
        ativo: (p as any).ativo ?? true,
        variavel: (p as any).variavel ?? false,
        descricao: (p as any).descricao || "",
        dataVariavel: (p as any).data_variavel || (p as any).dataVariavel || null,
        classificacaoEtaria: (p as any).classificacao_etaria || (p as any).classificacaoEtaria || "",
        tipoPrograma: (p as any).tipo_programa || (p as any).tipoPrograma || "Musical",
        cliente: stationName || (p as any).cliente || (p as any).cliente_nome || (acc ? normalizeClientKey(acc.nome) : undefined),
      }));
    }
  } catch (err) {
    console.warn("getProgramas from stationData warning:", err);
  }

  const fallback = getClientHouseMixProgramsSync(acc?.id || targetUserId, acc?.email || userEmail);
  const fallbackList: any[] = Array.isArray(fallback) ? fallback : (fallback?.programas || []);
  return fallbackList.map(p => sanitizeProgramImages({
    id: p.id || `prog_${Math.random()}`,
    nome: p.nome || "Programa Sem Nome",
    apresentadorId: p.apresentador_id || p.apresentadorId || "",
    apresentadoresIds: p.apresentadores_ids || p.apresentadoresIds || [],
    selo: p.selo || p.thumb || p.capa || "",
    capa: p.capa || "",
    thumb: p.thumb || "",
    diasSemana: Array.isArray(p.dias_semana) ? p.dias_semana : (Array.isArray(p.diasSemana) ? p.diasSemana : (typeof p.dias_semana === 'string' ? (p.dias_semana as string).split(',').map(s => s.trim()).filter(Boolean) : [])),
    horarioInicio: p.horario_inicio || p.horarioInicio || "00:00:00",
    horarioFim: p.horario_fim || p.horarioFim || "00:00:00",
    estudio: p.estudio || "Estúdio FM",
    ativo: p.ativo ?? true,
    variavel: false,
    descricao: p.descricao || "",
    dataVariavel: null,
    classificacaoEtaria: p.classificacao_etaria || p.classificacaoEtaria || "Livre",
    tipoPrograma: p.tipo_programa || p.tipoPrograma || "Musical",
    cliente: stationName || (p as any).cliente || (p as any).cliente_nome || (acc ? normalizeClientKey(acc.nome) : undefined),
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

  const CYAN = "#0055ff";
  const LIME = "#0055ff";
  const DARK = "#002132";
  const CARD_BG = "#ffffff";

  return (
    <>
      <style>{`
        .grade-cell { transition: outline-color .15s ease; outline: 1px solid transparent; outline-offset: -1px; }
        .grade-cell:hover { outline: 1px solid #0055ff !important; }
        .grade-onair-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#1685ff; box-shadow: 0 0 0 2px rgba(22,133,255,.18); animation: grade-onair-pulse 1.25s ease-in-out infinite; vertical-align:middle; }
        @keyframes grade-onair-pulse { 0%,100% { opacity:1; } 50% { opacity:.35; } }
        .grade-empty-cell { background: #F7F9FC !important; }
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
                const progInicio = prog?.horarioInicio || "00:00:00";
                const progFim = prog?.horarioFim || "23:59:59";
                const isOnAir = prog && dia === diaAtual && currentTimeStr >= progInicio && currentTimeStr < progFim;
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
                      borderRadius: 4,
                      border: "none",
                      borderLeft: `3px solid ${CYAN}`,
                      boxShadow: "none",
                      cursor: "pointer",
                      position: "relative",
                    }}
                    onClick={() => setDetailProg(prog)}
                  >
                    {isOnAir && (
                      <span
                        className="grade-onair-dot"
                        title="Programa no ar"
                        aria-label="Programa no ar"
                        style={{ position: "absolute", top: 8, right: 8 }}
                      />
                    )}
                    <div style={{
                      fontSize: 12, fontWeight: 800, lineHeight: 1.25,
                      wordBreak: "break-word",
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                      color: isOnAir ? "#FFFFFF" : DARK,
                      paddingRight: 0,
                    }}>{prog.nome || "Sem Nome"}</div>
                    <div style={{
                      fontSize: 10, marginTop: 4, fontWeight: 700,
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      color: isOnAir ? "rgba(255,255,255,0.78)" : "#64748B",
                      letterSpacing: 0.3,
                    }}>
                      {(prog.horarioInicio || "").slice(0, 5)} — {(prog.horarioFim || "").slice(0, 5)}
                    </div>
                    {(() => {
                      const names = getPresenterNames(prog);
                      return names ? (
                        <div style={{
                          display: "flex", alignItems: "center", gap: 6, marginTop: 6,
                        }}>
                          {presenter?.foto ? (
                            <img src={presenter.foto} alt="" style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover", border: "none" }} />
                          ) : (
                            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: isOnAir ? "#FFFFFF" : DARK }}>
                              {names[0]?.toUpperCase()}
                            </div>
                          )}
                          <div style={{
                            fontSize: 9, fontWeight: 700,
                            color: isOnAir ? "#FFFFFF" : "#475569",
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
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(15,23,42,0.72)" }} onClick={() => setDetailProg(null)}>
          <div className="rounded-2xl max-w-2xl w-full mx-4 relative" style={{ backgroundColor: "#FFFFFF", padding: "24px", border: "none", boxShadow: "none" }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setDetailProg(null)} className="absolute top-4 right-4 z-10 font-bold text-sm rounded-full p-1.5" style={{ color: DARK, background: CARD_BG }}>
              <X size={16} />
            </button>
            <div className="flex gap-5">
              <ProgramBadge program={detailProg} size={160} className="w-40 h-40 rounded-2xl shrink-0" />
              <div className="space-y-2 flex-1 min-w-0">
                <h2 className="text-xl font-extrabold pr-6" style={{ color: DARK }}>{detailProg.nome}</h2>
                <p className="text-xs flex items-center gap-1.5 font-semibold" style={{ color: "rgba(10,37,64,0.6)" }}>
                  <Clock size={12} style={{ color: CYAN }} /> {(detailProg.horarioInicio || "").slice(0, 5)} — {(detailProg.horarioFim || "").slice(0, 5)}
                </p>
                <p className="text-xs flex items-center gap-1.5 font-semibold" style={{ color: "rgba(10,37,64,0.6)" }}>
                  <Calendar size={12} style={{ color: CYAN }} /> {Array.isArray(detailProg.diasSemana) ? detailProg.diasSemana.join(", ") : (detailProg.diasSemana || "")}
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

export default function ProgramaForm({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const targetUserId = effectiveUserId || user?.id;
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
  const [agendamentoVariavel, setAgendamentoVariavel] = useState<"data" | "dias">("data");
  const [dataVariavel, setDataVariavel] = useState<Date | undefined>(undefined);
  const [descricao, setDescricao] = useState("");
  const [apresentadores, setApresentadores] = useState<Apresentador[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [conflictMsg, setConflictMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [formOpen, setFormOpen] = useState(true);

  // Auto-open form when editing
  useEffect(() => {
    if (editingId) setFormOpen(true);
  }, [editingId]);

  // Estúdio management
  const [estudios, setEstudios] = useState<string[]>(() => getStoredEstudios());
  const [newEstudio, setNewEstudio] = useState("");
  const [estudioDialogOpen, setEstudioDialogOpen] = useState(false);
  const [estudioDropdownOpen, setEstudioDropdownOpen] = useState(false);

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

  // Resolve current account & station
  const currentClientAccount = useMemo(() => {
    return (targetUserId ? findClientAccountById(targetUserId) : null) ||
      (user?.email ? findClientAccountByEmail(user.email) : null) ||
      (targetUserId ? findClientAccountByEmail(targetUserId) : null);
  }, [targetUserId, user?.email]);

  const currentStationKey = useMemo(() => {
    return normalizeClientKey(currentClientAccount?.nome || currentClientAccount?.slug || "");
  }, [currentClientAccount]);

  const isClientStation = useMemo(() => {
    return !!currentStationKey && currentStationKey !== "NEXO BRASIL" && (!currentClientAccount?.isAdmin);
  }, [currentStationKey, currentClientAccount]);

  // Cliente / Emissora selection & filter
  const [clientesList, setClientesList] = useState<string[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<string>(() => {
    const acc = (targetUserId ? findClientAccountById(targetUserId) : null) ||
      (user?.email ? findClientAccountByEmail(user.email) : null);
    return acc?.nome || "POSITIVA FM";
  });
  const [filterCliente, setFilterCliente] = useState<string>(() => {
    const acc = (targetUserId ? findClientAccountById(targetUserId) : null) ||
      (user?.email ? findClientAccountByEmail(user.email) : null);
    if (acc && !acc.isAdmin) {
      return acc.nome;
    }
    return "todos";
  });

  // Grade filter
  const [gradeEstudioFilter, setGradeEstudioFilter] = useState("todos");
  const gradeRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<HTMLDivElement>(null);

  // Sorting
  const [sortBy, setSortBy] = useState<"horario" | "nome" | "estudio" | "status">("horario");
  const [periodoFilter, setPeriodoFilter] = useState<"todos" | "semana" | "fds">("todos");


  const [currentTimeStr, setCurrentTimeStr] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}:${String(n.getSeconds()).padStart(2, "0")}`;
  });
  const now = new Date();
  const DIAS_MAP: Record<number, string> = { 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo" };
  const diaAtual = DIAS_MAP[now.getDay()];
  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Atualiza o relógio a cada segundo para manter a agulha sincronizada
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setCurrentTimeStr(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}:${String(n.getSeconds()).padStart(2, "0")}`);
    };
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const load = async () => {
    setLoadingData(true);
    try {
      const acc = (targetUserId ? findClientAccountById(targetUserId) : null) ||
        (user?.email ? findClientAccountByEmail(user.email) : null) ||
        (targetUserId ? findClientAccountByEmail(targetUserId) : null);
      const stationKey = normalizeClientKey(acc?.nome || acc?.slug || "");
      const isClient = !!stationKey && stationKey !== "NEXO BRASIL" && (!acc?.isAdmin);

      const [ap, pg] = await Promise.all([
        getApresentadores(targetUserId, user?.email).catch(e => {
          console.warn("Error getting apresentadores:", e);
          return [];
        }),
        getProgramas(targetUserId, user?.email).catch(e => {
          console.warn("Error getting programas:", e);
          return [];
        })
      ]);
      setApresentadores(Array.isArray(ap) ? ap : []);

      if (acc?.nome) {
        setSelectedCliente(acc.nome);
        if (isClient) {
          setFilterCliente(acc.nome);
          setClientesList([acc.nome]);
        }
      }

      if (!isClient) {
        // Carrega clientes conhecidos para Super Admin
        let metaNames: string[] = [];
        try {
          const meta = getStoredMetadata() || {};
          metaNames = Object.keys(meta).map(k => {
            const item = meta[k];
            return (item?.nome_empresarial || item?.razao_social || k || "").trim().toUpperCase();
          }).filter(Boolean);
        } catch (err) {
          console.warn("Error getting stored metadata:", err);
        }
        const defaultStations = DEFAULT_STATION_DATA ? Object.keys(DEFAULT_STATION_DATA) : [];
        const allStations = Array.from(new Set([...metaNames, ...defaultStations])).filter(Boolean).sort();
        setClientesList(allStations.length > 0 ? allStations : [acc?.nome || "POSITIVA FM"]);
      }

      // Carrega programas customizados salvos no localStorage SEM cruzar clientes
      const matchingCustomProgs: Programa[] = [];
      try {
        const customProgsObj = getStoredCustomPrograms() || {};

        if (isClient && stationKey) {
          // Higieniza qualquer item contaminado salvo com chave da emissora
          let storageNeedsUpdate = false;
          if (customProgsObj[stationKey]) {
            const origLen = customProgsObj[stationKey].length;
            customProgsObj[stationKey] = customProgsObj[stationKey].filter(p => {
              const pCli = normalizeClientKey(p.cliente || p.cliente_nome || "");
              return !pCli || pCli === stationKey;
            });
            if (customProgsObj[stationKey].length !== origLen) {
              storageNeedsUpdate = true;
            }
          }
          if (storageNeedsUpdate) {
            try {
              localStorage.setItem("nexohub_housemix_programs_v2", JSON.stringify(customProgsObj));
            } catch {}
          }

          const keysToMatch = new Set([
            stationKey,
            normalizeClientKey(acc?.nome),
            normalizeClientKey(acc?.razaoSocial),
            acc?.id,
            targetUserId,
            acc?.slug,
          ].filter(Boolean));

          Object.entries(customProgsObj).forEach(([cliKey, progs]) => {
            const normK = normalizeClientKey(cliKey);
            if (keysToMatch.has(cliKey) || (normK && keysToMatch.has(normK))) {
              (progs || []).forEach(p => {
                const progCli = normalizeClientKey(p.cliente || p.cliente_nome || "");
                if (!progCli || progCli === stationKey) {
                  matchingCustomProgs.push({
                    id: p.id || `custom_${Date.now()}_${Math.random()}`,
                    nome: p.nome || "Programa Sem Nome",
                    apresentadorId: p.apresentador_id || (p as any).apresentadorId || "",
                    apresentadoresIds: p.apresentadores_ids || (p as any).apresentadoresIds || [],
                    selo: p.selo || "",
                    capa: p.capa || "",
                    thumb: p.thumb || "",
                    diasSemana: Array.isArray(p.dias_semana) ? p.dias_semana : (Array.isArray((p as any).diasSemana) ? (p as any).diasSemana : (typeof p.dias_semana === 'string' ? (p.dias_semana as string).split(',').map((s: string) => s.trim()).filter(Boolean) : [])),
                    horarioInicio: p.horario_inicio || (p as any).horarioInicio || "00:00:00",
                    horarioFim: p.horario_fim || (p as any).horarioFim || "00:00:00",
                    estudio: p.estudio || "Estúdio FM",
                    ativo: p.ativo ?? true,
                    variavel: false,
                    descricao: p.descricao || "",
                    dataVariavel: null,
                    classificacaoEtaria: "",
                    tipoPrograma: p.tipo_programa || (p as any).tipoPrograma || "",
                    cliente: acc?.nome || stationKey,
                  });
                }
              });
            }
          });
        } else if (!isClient) {
          Object.entries(customProgsObj).forEach(([cliKey, progs]) => {
            (progs || []).forEach(p => {
              matchingCustomProgs.push({
                id: p.id || `custom_${Date.now()}_${Math.random()}`,
                nome: p.nome || "Programa Sem Nome",
                apresentadorId: p.apresentador_id || (p as any).apresentadorId || "",
                apresentadoresIds: p.apresentadores_ids || (p as any).apresentadoresIds || [],
                selo: p.selo || "",
                capa: p.capa || "",
                thumb: p.thumb || "",
                diasSemana: Array.isArray(p.dias_semana) ? p.dias_semana : (Array.isArray((p as any).diasSemana) ? (p as any).diasSemana : (typeof p.dias_semana === 'string' ? (p.dias_semana as string).split(',').map((s: string) => s.trim()).filter(Boolean) : [])),
                horarioInicio: p.horario_inicio || (p as any).horarioInicio || "00:00:00",
                horarioFim: p.horario_fim || (p as any).horarioFim || "00:00:00",
                estudio: p.estudio || "Estúdio FM",
                ativo: p.ativo ?? true,
                variavel: false,
                descricao: p.descricao || "",
                dataVariavel: null,
                classificacaoEtaria: "",
                tipoPrograma: p.tipo_programa || (p as any).tipoPrograma || "",
                cliente: cliKey,
              });
            });
          });
        }
      } catch (err) {
        console.warn("Error reading custom progs:", err);
      }

      // Base da grade padrão da emissora (se for cliente)
      const baseMap = new Map<string, Programa>();
      if (isClient && stationKey && DEFAULT_STATION_DATA?.[stationKey]) {
        const def = DEFAULT_STATION_DATA[stationKey];
        (def.programas || []).forEach((p, idx) => {
          const daysKey = Array.isArray(p.dias_semana) ? p.dias_semana.join("_") : "";
          const key = (p as any).id || `${(p.nome || "").trim().toUpperCase()}_${p.horario_inicio}_${daysKey}`;
          baseMap.set(key, {
            id: (p as any).id || `def_${stationKey.replace(/\s+/g, '_').toLowerCase()}_${idx + 1}`,
            nome: p.nome || "Programa",
            apresentadorId: p.apresentador_id || "",
            apresentadoresIds: p.apresentadores_ids || (p.apresentador_id ? [p.apresentador_id] : []),
            selo: p.selo || "",
            capa: p.capa || "",
            thumb: p.thumb || "",
            diasSemana: Array.isArray(p.dias_semana) ? p.dias_semana : (Array.isArray((p as any).diasSemana) ? (p as any).diasSemana : (typeof p.dias_semana === 'string' ? (p.dias_semana as string).split(',').map((s: string) => s.trim()).filter(Boolean) : [])),
            horarioInicio: p.horario_inicio || (p as any).horarioInicio || "00:00:00",
            horarioFim: p.horario_fim || (p as any).horarioFim || "00:00:00",
            estudio: p.estudio || "Estúdio FM",
            ativo: true,
            variavel: false,
            descricao: p.descricao || "",
            dataVariavel: null,
            classificacaoEtaria: "",
            tipoPrograma: p.tipo_programa || (p as any).tipoPrograma || "",
            cliente: acc?.nome || stationKey,
          });
        });
      } else if (!isClient && DEFAULT_STATION_DATA) {
        Object.entries(DEFAULT_STATION_DATA).forEach(([stKey, def]) => {
          (def.programas || []).forEach((p, idx) => {
            const daysKey = Array.isArray(p.dias_semana) ? p.dias_semana.join("_") : "";
            const key = (p as any).id || `${stKey}_${(p.nome || "").trim().toUpperCase()}_${p.horario_inicio}_${daysKey}`;
            baseMap.set(key, {
              id: (p as any).id || `def_${stKey.replace(/\s+/g, '_').toLowerCase()}_${idx + 1}`,
              nome: p.nome || "Programa",
              apresentadorId: p.apresentador_id || "",
              apresentadoresIds: p.apresentadores_ids || (p.apresentador_id ? [p.apresentador_id] : []),
              selo: p.selo || "",
              capa: p.capa || "",
              thumb: p.thumb || "",
              diasSemana: Array.isArray(p.dias_semana) ? p.dias_semana : (Array.isArray((p as any).diasSemana) ? (p as any).diasSemana : (typeof p.dias_semana === 'string' ? (p.dias_semana as string).split(',').map((s: string) => s.trim()).filter(Boolean) : [])),
              horarioInicio: p.horario_inicio || (p as any).horarioInicio || "00:00:00",
              horarioFim: p.horario_fim || (p as any).horarioFim || "00:00:00",
              estudio: p.estudio || "Estúdio FM",
              ativo: true,
              variavel: false,
              descricao: p.descricao || "",
              dataVariavel: null,
              classificacaoEtaria: "",
              tipoPrograma: p.tipo_programa || (p as any).tipoPrograma || "",
              cliente: stKey,
            });
          });
        });
      }

      // Sobrepõe com programas customizados do localStorage
      matchingCustomProgs.forEach(p => {
        const daysKey = Array.isArray(p.diasSemana) ? p.diasSemana.join("_") : "";
        const key = p.id || `${(p.nome || "").trim().toUpperCase()}_${p.horarioInicio}_${daysKey}`;
        if (baseMap.has(key)) {
          const existing = baseMap.get(key)!;
          baseMap.set(key, {
            ...existing,
            ...p,
            capa: p.capa !== undefined && p.capa !== "" ? p.capa : existing.capa,
            thumb: p.thumb !== undefined && p.thumb !== "" ? p.thumb : existing.thumb,
            selo: p.selo || existing.selo,
          });
        } else {
          baseMap.set(p.id, p);
        }
      });

      // Sobrepõe com registros reais do banco Supabase
      (Array.isArray(pg) ? pg : []).forEach(p => {
        const daysKey = Array.isArray(p.diasSemana) ? p.diasSemana.join("_") : "";
        const key = p.id || `${(p.nome || "").trim().toUpperCase()}_${p.horarioInicio}_${daysKey}`;
        if (baseMap.has(key)) {
          const existing = baseMap.get(key)!;
          baseMap.set(key, {
            ...existing,
            ...p,
            capa: p.capa !== undefined && p.capa !== "" ? p.capa : existing.capa,
            thumb: p.thumb !== undefined && p.thumb !== "" ? p.thumb : existing.thumb,
            selo: p.selo || existing.selo,
          });
        } else {
          baseMap.set(p.id, p);
        }
      });

      // Banco online é a fonte de verdade: quando respondeu, ignora grade padrão/cache local
      // (senão programas excluídos ou inativados "voltam" da cópia local).
      let combinedProgs = lastProgramasFromDb ? (Array.isArray(pg) ? [...pg] : []) : Array.from(baseMap.values());

      // FILTRAGEM ESTRITA: garante que programas de outras emissoras NUNCA apareçam
      if (isClient && stationKey) {
        combinedProgs = combinedProgs.filter(p => {
          if (p.cliente) {
            const pNorm = normalizeClientKey(p.cliente);
            if (pNorm && pNorm !== stationKey) {
              return false;
            }
          }
          return true;
        }).map(p => ({
          ...p,
          cliente: p.cliente || acc?.nome || stationKey
        }));
      }

      combinedProgs = combinedProgs.map(p => sanitizeProgramImages(p));
      combinedProgs.sort((a, b) => (a.horarioInicio || "").localeCompare(b.horarioInicio || ""));
      setProgramas(combinedProgs);

      // Mantém a lista configurada de estúdios cadastrados
      setEstudios(getStoredEstudios());
    } catch (err) {
      console.error("Erro fatal ao carregar ProgramaForm:", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (currentClientAccount?.nome) {
      setSelectedCliente(currentClientAccount.nome);
      if (isClientStation) {
        setFilterCliente(currentClientAccount.nome);
      }
    }
    load();
  }, [targetUserId, user?.email]);

  // Recarrega a lista quando um apresentador é cadastrado/editado em outra tela
  useEffect(() => {
    const refresh = async () => {
      try {
        const ap = await getApresentadores(targetUserId, user?.email);
        setApresentadores(Array.isArray(ap) ? ap : []);
      } catch {}
    };
    window.addEventListener("apresentadores-updated", refresh);
    return () => window.removeEventListener("apresentadores-updated", refresh);
  }, [targetUserId, user?.email]);

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
        const activeRow = tbody.querySelector<HTMLTableRowElement>('tr[data-needle-row="true"]');
        if (!activeRow) { needle.style.display = "none"; return; }

        // Alinha a agulha à linha real do horário, em vez de distribuir o tempo
        // proporcionalmente pela altura total (que muda com células mescladas).
        const containerRect = container.getBoundingClientRect();
        const rowRect = activeRow.getBoundingClientRect();
        const fraction = Math.max(0, Math.min(1, currentMinutes % 30 / 30));
        const top = rowRect.top - containerRect.top + container.scrollTop + rowRect.height * fraction;

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
    setNome(""); setApresentadorId(""); setApresentadoresIds([]); setSelo(""); setCapa(""); setThumb(""); setDiasSemana([]); setHorarioInicio(""); setHorarioFim(""); setEstudio(""); setAtivo(true); setVariavel(false); setAgendamentoVariavel("data"); setDataVariavel(undefined); setDescricao(""); setConflictMsg(""); setEditingId(null); setTipoPrograma(""); setClassificacaoEtaria("");
  };

  const isUuid = (val?: string | null) => Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

  const handleAdd = async () => {
    const nomeAtual = (nomeInputRef.current?.value ?? nomeDraftRef.current ?? nome).trim();
    if (!nomeAtual || !user) return;
    if (!horarioInicio || !horarioFim) { setConflictMsg("Preencha o horário de início e fim."); return; }
    if (horarioInicio >= horarioFim) { setConflictMsg("O horário de início deve ser antes do fim."); return; }
    if (!estudio.trim()) { setConflictMsg("Informe o estúdio."); return; }

    const effectiveOwnerId = currentClientAccount?.id || targetUserId || user.id;

    if (variavel) {
      if (agendamentoVariavel === "data" && !dataVariavel) { setConflictMsg("Selecione a data para o programa variável."); return; }
      if (agendamentoVariavel === "dias" && diasSemana.length === 0) { setConflictMsg("Selecione ao menos um dia da semana."); return; }

      const DIAS_MAP_REV: Record<number, string> = { 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo" };
      const diasVariavel = agendamentoVariavel === "data"
        ? [DIAS_MAP_REV[dataVariavel!.getDay()]]
        : diasSemana;
      const dataStr = agendamentoVariavel === "data" ? format(dataVariavel!, "yyyy-MM-dd") : null;

      setSaving(true);
      const isExistingDbUuid = isUuid(editingId);
      const targetId = isExistingDbUuid ? editingId! : (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `prog_${Date.now()}`);

      // 1. Upload e resolução prévia e segura das imagens da Capa e Thumb
      let resolvedThumb = thumb || "";
      let resolvedCapa = capa || "";
      try {
        const [uThumb, uCapa] = await Promise.all([
          thumb ? uploadProgramImage(thumb, effectiveOwnerId, targetId, "thumb") : Promise.resolve(""),
          capa ? uploadProgramImage(capa, effectiveOwnerId, targetId, "capa") : Promise.resolve(""),
        ]);
        if (uThumb) resolvedThumb = uThumb;
        if (uCapa) resolvedCapa = uCapa;
      } catch (uploadErr) {
        console.warn("Erro ao fazer upload das imagens do programa:", uploadErr);
      }

      const programPayload: any = {
        nome: nomeAtual,
        apresentador_id: apresentadoresIds[0] || apresentadorId || null,
        apresentadores_ids: apresentadoresIds,
        selo: selo || resolvedThumb || resolvedCapa || "",
        capa: resolvedCapa,
        thumb: resolvedThumb,
        dias_semana: diasVariavel,
        horario_inicio: horarioInicio,
        horario_fim: horarioFim,
        estudio: estudio.trim(),
        ativo,
        descricao: descricao.trim(),
        variavel: true,
        data_variavel: dataStr,
        classificacao_etaria: classificacaoEtaria || null,
        tipo_programa: tipoPrograma || null,
      };

      const persistErrVar = await persistPrograma({
        targetId,
        ownerId: effectiveOwnerId,
        payload: programPayload,
        isUpdate: isExistingDbUuid,
        fallbackSession: session,
      });
      if (persistErrVar) {
        setSaving(false);
        setConflictMsg(`Não foi possível salvar o programa: ${persistErrVar}`);
        return;
      }

      // Salva vinculação com o cliente selecionado
      const normCli = normalizeClientKey(selectedCliente) || selectedCliente;
      saveCustomProgram({
        id: targetId,
        nome: nomeAtual,
        estudio: estudio.trim().toUpperCase(),
        horario_inicio: horarioInicio,
        horario_fim: horarioFim,
        dias_semana: diasVariavel,
        ativo,
        tipo_programa: tipoPrograma || null,
        apresentador_id: apresentadoresIds[0] || apresentadorId || null,
        apresentadores_ids: apresentadoresIds,
        descricao: descricao.trim() || null,
        selo: selo || resolvedThumb || resolvedCapa || "",
        capa: resolvedCapa,
        thumb: resolvedThumb,
        cliente_nome: selectedCliente,
      }, normCli);
      if (editingId && editingId !== targetId) {
        removeCustomProgram(editingId, normCli);
      }
      saveCustomStudio(estudio.trim().toUpperCase(), normCli);

      try {
        window.dispatchEvent(new CustomEvent("nexohub:programas-updated", { detail: { programId: targetId } }));
        window.dispatchEvent(new CustomEvent("housemix:programas-updated", { detail: { clientKey: normCli, programId: targetId } }));
      } catch {}

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
    const isExistingDbUuid = isUuid(editingId);
    const targetId = isExistingDbUuid ? editingId! : (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `prog_${Date.now()}`);

    // 1. Upload e resolução prévia e segura das imagens da Capa e Thumb
    let resolvedThumb = thumb || "";
    let resolvedCapa = capa || "";
    try {
      const [uThumb, uCapa] = await Promise.all([
        thumb ? uploadProgramImage(thumb, effectiveOwnerId, targetId, "thumb") : Promise.resolve(""),
        capa ? uploadProgramImage(capa, effectiveOwnerId, targetId, "capa") : Promise.resolve(""),
      ]);
      if (uThumb) resolvedThumb = uThumb;
      if (uCapa) resolvedCapa = uCapa;
    } catch (uploadErr) {
      console.warn("Erro ao fazer upload das imagens do programa:", uploadErr);
    }

    const programPayload: any = {
      nome: nomeAtual,
      apresentador_id: apresentadoresIds[0] || apresentadorId || null,
      apresentadores_ids: apresentadoresIds,
      selo: selo || resolvedThumb || resolvedCapa || "",
      capa: resolvedCapa,
      thumb: resolvedThumb,
      dias_semana: diasSemana,
      horario_inicio: horarioInicio,
      horario_fim: horarioFim,
      estudio: estudio.trim(),
      ativo,
      descricao: descricao.trim(),
      variavel: false,
      data_variavel: null,
      classificacao_etaria: classificacaoEtaria || null,
      tipo_programa: tipoPrograma || null,
    };

    const persistErr = await persistPrograma({
      targetId,
      ownerId: effectiveOwnerId,
      payload: programPayload,
      isUpdate: isExistingDbUuid,
      fallbackSession: session,
    });
    if (persistErr) {
      setSaving(false);
      setConflictMsg(`Não foi possível salvar o programa: ${persistErr}`);
      return;
    }

    // Salva vinculação com o cliente selecionado
    const normCli = normalizeClientKey(selectedCliente) || selectedCliente;
    saveCustomProgram({
      id: targetId,
      nome: nomeAtual,
      estudio: estudio.trim().toUpperCase(),
      horario_inicio: horarioInicio,
      horario_fim: horarioFim,
      dias_semana: diasSemana,
      ativo,
      tipo_programa: tipoPrograma || null,
      apresentador_id: apresentadoresIds[0] || apresentadorId || null,
      apresentadores_ids: apresentadoresIds,
      descricao: descricao.trim() || null,
      selo: selo || resolvedThumb || resolvedCapa || "",
      capa: resolvedCapa,
      thumb: resolvedThumb,
      cliente_nome: selectedCliente,
    }, normCli);
    if (editingId && editingId !== targetId) {
      removeCustomProgram(editingId, normCli);
    }
    saveCustomStudio(estudio.trim().toUpperCase(), normCli);

    try {
      window.dispatchEvent(new CustomEvent("nexohub:programas-updated", { detail: { programId: targetId } }));
      window.dispatchEvent(new CustomEvent("housemix:programas-updated", { detail: { clientKey: normCli, programId: targetId } }));
    } catch {}

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
    const safeSelo = resolveProgramSelo(p);
    const safeCapa = resolveProgramCover(p) || safeSelo;
    const safeThumb = resolveProgramThumb(p) || safeCapa || safeSelo;
    setSelo(safeSelo); setCapa(safeCapa); setThumb(safeThumb);
    setDiasSemana(p.diasSemana); setHorarioInicio(p.horarioInicio); setHorarioFim(p.horarioFim);
    setEstudio(p.estudio); setAtivo(p.ativo); setVariavel(p.variavel); setAgendamentoVariavel(p.dataVariavel ? "data" : "dias"); setDescricao(p.descricao);
    setDataVariavel(p.dataVariavel ? new Date(p.dataVariavel + "T12:00:00") : undefined);
    setClassificacaoEtaria(p.classificacaoEtaria || "");
    setTipoPrograma(p.tipoPrograma || "");
    if (p.cliente) {
      setSelectedCliente(p.cliente);
    }
    setConflictMsg("");
    // Scroll to form
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };


  const updateProgramaRow = async (id: string, patch: Record<string, any>): Promise<string | null> => {
    if (!isUuid(id)) return null; // programa só local
    const validSession = await getWritableProgramSession(session);
    if (!validSession) return "Sua sessão expirou ou não pôde ser renovada. Entre novamente para continuar.";
    const { data, error } = await supabase.from("programas").update(patch as any).eq("id", id).select("id");
    if (error) return error.message;
    if (!data || data.length === 0) return "Nenhum registro foi alterado. Sua sessão pode ter expirado — saia e entre novamente.";
    return null;
  };

  const removePrograma = async (id: string) => {
    // Exclusão lógica: preserva logos, agenda e citações ligadas ao programa.
    const err = await updateProgramaRow(id, { ativo: false, deleted_at: new Date().toISOString() });
    if (err) {
      toast({ title: "Erro ao excluir programa", description: err, variant: "destructive" });
      return;
    }
    removeCustomProgram(id, selectedCliente);
    toast({ title: "Programa excluído" });
    await load();
  };

  const toggleAtivo = async (id: string, current: boolean) => {
    const err = await updateProgramaRow(id, { ativo: !current });
    if (err) {
      toast({ title: "Erro ao alterar status", description: err, variant: "destructive" });
      return;
    }
    try {
      const all = getStoredCustomPrograms();
      let updatedAny = false;
      Object.keys(all).forEach(k => {
        all[k] = (all[k] || []).map(p => {
          if (p.id === id) {
            updatedAny = true;
            return { ...p, ativo: !current };
          }
          return p;
        });
      });
      if (updatedAny) {
        localStorage.setItem("nexohub_housemix_programs_v2", JSON.stringify(all));
      }
    } catch {}
    window.dispatchEvent(new CustomEvent("nexohub:programas-updated", { detail: { programId: id } }));
    await load();
  };

  const addEstudio = () => {
    if (!newEstudio.trim()) return;
    const est = newEstudio.trim().toUpperCase();
    const current = getStoredEstudios();
    if (!current.includes(est)) {
      const updated = [...current, est];
      setEstudios(updated);
      localStorage.setItem(ESTUDIOS_STORAGE_KEY, JSON.stringify(updated));
      saveCustomStudio(est, selectedCliente || currentClientAccount?.nome || "POSITIVA FM");
    }
    setEstudio(est);
    setNewEstudio("");
    setEstudioDialogOpen(false);
    toast({ title: `Estúdio "${est}" cadastrado com sucesso` });
  };

  const removeEstudio = (estudioToRemove: string) => {
    const current = getStoredEstudios();
    const updated = current.filter(e => e.toUpperCase() !== estudioToRemove.toUpperCase());
    setEstudios(updated);
    localStorage.setItem(ESTUDIOS_STORAGE_KEY, JSON.stringify(updated));
    removeCustomStudio(estudioToRemove, selectedCliente);
    if (estudio.toUpperCase() === estudioToRemove.toUpperCase()) {
      setEstudio("");
    }
    toast({ title: `Estúdio "${estudioToRemove}" excluído` });
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
      try {
        const date = addDays(weekStart, i);
        dates[dia] = format(date, "dd/MM");
      } catch {
        dates[dia] = "";
      }
    });
    return dates;
  }, [weekStart.toDateString()]);

  // Filter: variable programs only show on their specific day, and filtered by client/estudio
  const gradeProgramas = useMemo(() => {
    let filtered = gradeEstudioFilter === "todos" ? programas : programas.filter(p => p.estudio === gradeEstudioFilter);
    if (filterCliente !== "todos") {
      const normF = normalizeClientKey(filterCliente);
      filtered = filtered.filter(p => {
        const pCli = normalizeClientKey(p.cliente || "");
        return pCli === normF;
      });
    }
    return filtered;
  }, [programas, gradeEstudioFilter, filterCliente]);

  // Get the full date string for a given day of the week in current week
  const getDateForDay = (dia: string): string => {
    try {
      const idx = DIAS_SEMANA.indexOf(dia);
      const date = addDays(weekStart, idx);
      return format(date, "yyyy-MM-dd");
    } catch {
      return "";
    }
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
      const pInicio = p.horarioInicio || "00:00:00";
      const pFim = p.horarioFim || "00:00:00";
      const overlaps = pInicio < nextSlotTime && pFim > slotTime;
      const days = Array.isArray(p.diasSemana) ? p.diasSemana : [];
      return days.includes(dia) && overlaps;
    });

    if (matching.length === 0) return undefined;

    // Programas variáveis têm prioridade na data específica ou nos dias semanais configurados.
    const variable = matching.find(p => p.variavel && (!p.dataVariavel || p.dataVariavel === dateForDay));
    if (variable) return variable;

    // Prioritize program whose start time matches this slot
    const startsInSlot = matching.find(p => (p.horarioInicio || "").startsWith(slotTime.slice(0, 5)));
    if (startsInSlot) return startsInSlot;

    // Otherwise show fixed (non-variable) program
    return matching.find(p => !p.variavel) || matching[0];
  };

  // Sorted + filtered programs for list
  const sortedProgramas = useMemo(() => {
    const WD = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
    const WE = ["Sábado", "Domingo"];
    let sorted = [...programas];
    if (filterCliente !== "todos") {
      const normF = normalizeClientKey(filterCliente);
      sorted = sorted.filter(p => {
        const pCli = normalizeClientKey(p.cliente || "");
        return pCli === normF;
      });
    }
    if (periodoFilter !== "todos") {
      sorted = sorted.filter(p => {
        const days = Array.isArray(p.diasSemana) ? p.diasSemana : [];
        if (periodoFilter === "semana") return days.some(d => WD.includes(d));
        return days.some(d => WE.includes(d));
      });
    }
    switch (sortBy) {
      case "nome": sorted.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR")); break;
      case "estudio": sorted.sort((a, b) => (a.estudio || "").localeCompare(b.estudio || "", "pt-BR")); break;
      case "status": sorted.sort((a, b) => (a.ativo === b.ativo ? 0 : a.ativo ? -1 : 1)); break;
      default: sorted.sort((a, b) => (a.horarioInicio || "").localeCompare(b.horarioInicio || "")); break;
    }
    return sorted;
  }, [programas, filterCliente, sortBy, periodoFilter]);


  if (loadingData) return <ModulePageSkeleton variant="form" />;

  // === Nexo Form Design System (mesmo padrão Blitz / ClientesPage) ===
  const CYAN = "#0055ff";
  const LIME = "#0055ff";
  const CARD_BG = "#ffffff";
  const DARK = "#002132";

  const pillInput: React.CSSProperties = {
    width: "100%",
    height: 44,
    borderRadius: 999,
    background: "#f8fafc",
    border: "1px solid rgba(226, 232, 240, 0.9)",
    padding: "0 20px",
    fontFamily: "'Montserrat', sans-serif",
    fontSize: 12,
    color: "#0f172a",
    outline: "none",
    textTransform: "uppercase",
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
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#64748b",
    marginBottom: 6,
    display: "block",
  };

  const primaryBtn: React.CSSProperties = {
    height: 44,
    padding: "0 28px",
    borderRadius: 999,
    background: "#0055ff",
    border: "none",
    color: "#ffffff",
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0, 85, 255, 0.25)",
  };

  const secondaryBtn: React.CSSProperties = {
    height: 44,
    padding: "0 22px",
    borderRadius: 999,
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    color: "#334155",
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
    height: 44,
    padding: "0 16px",
    borderRadius: 999,
    background: "#0055ff",
    border: "none",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 2px 8px rgba(0, 85, 255, 0.25)",
  };

  const uploadBox = (img: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, w: number, h: number, labelName = "Upload") => {
    const isSafe = isSafeImageUrl(img);
    return (
      <label
        className="group relative flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-all duration-200 rounded-2xl border-2 border-dashed border-[#475569] bg-[#272b32] shadow-xs hover:border-[#64748b] hover:bg-[#303640]"
        style={{
          width: w,
          height: h,
        }}
      >
        {isSafe ? (
          <div className="relative w-full h-full group">
            <img
              src={img}
              alt=""
              className="w-full h-full object-cover rounded-2xl"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white rounded-2xl">
              <Upload size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5">Trocar</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 p-1 text-white group-hover:text-white transition-colors">
            <Upload size={15} className="text-white transition-colors" />
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-white group-hover:text-white transition-colors">
              {labelName}
            </span>
          </div>
        )}
        <input type="file" accept="image/*" onChange={onChange} style={{ display: "none" }} />
      </label>
    );
  };

  return (
    <div className="animate-fade-in space-y-8 w-full max-w-none mx-0" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        Cadastro de Programas
      </div>

      {/* FORM CARD */}
      <section
        ref={formRef}
        style={{
          background: "#ffffff",
          borderRadius: 24,
          padding: "28px 32px 32px",
          border: "1px solid rgba(226, 232, 240, 0.9)",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.03)",
        }}
        className="mb-8"
      >
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h3
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 2,
              color: DARK,
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            {editingId ? "Editar Programa" : "Cadastro de Programa"}
          </h3>
          
          <div className="flex items-center gap-3 flex-wrap">
            {/* ID Badge */}
            <div className="text-[11px] font-bold text-slate-600 bg-slate-100/90 px-4 py-2 rounded-full uppercase tracking-wider border border-slate-200/80 shadow-xs flex items-center gap-1.5">
              <span className="text-slate-400 font-semibold">ID:</span>
              <span className="text-[#0055ff] font-black">{editingId ? editingId.slice(0, 8) : "—"}</span>
            </div>
            
            {/* Ativo Toggle */}
            <div
              className={`flex items-center gap-2.5 px-4 py-2 rounded-full border transition-all duration-200 cursor-pointer select-none shadow-xs ${
                ativo 
                  ? "bg-emerald-50/90 border-emerald-200/90 text-emerald-800" 
                  : "bg-slate-50 border-slate-200 text-slate-600"
              }`}
              onClick={() => setAtivo(!ativo)}
            >
              <span className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${ativo ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse" : "bg-slate-400"}`} />
                {ativo ? "Ativo" : "Inativo"}
              </span>
              <Switch
                checked={ativo}
                onCheckedChange={setAtivo}
                className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-300 scale-90"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            
            {/* Variável Toggle */}
            <div
              className={`flex items-center gap-2.5 px-4 py-2 rounded-full border transition-all duration-200 cursor-pointer select-none shadow-xs ${
                variavel 
                  ? "bg-amber-50/90 border-amber-300/90 text-amber-900" 
                  : "bg-slate-50 border-slate-200 text-slate-600"
              }`}
              onClick={() => {
                const next = !variavel;
                setVariavel(next);
                if (!next) {
                  setDataVariavel(undefined);
                  setAgendamentoVariavel("data");
                }
              }}
            >
              <span className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${variavel ? "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)] animate-pulse" : "bg-slate-400"}`} />
                {variavel ? "Variável" : "Fixo"}
              </span>
              <Switch
                checked={variavel}
                onCheckedChange={(checked) => {
                  setVariavel(checked);
                  if (!checked) {
                    setDataVariavel(undefined);
                    setAgendamentoVariavel("data");
                  }
                }}
                className="data-[state=checked]:bg-amber-500 data-[state=unchecked]:bg-slate-300 scale-90"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        </div>

        {formOpen && (<>


        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          <Field label="Nome do Programa" span="col-span-full">
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
                <Select value={tipoPrograma || undefined} onValueChange={setTipoPrograma}>
                  <SelectTrigger style={pillSelectTrigger}>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposPrograma.filter(t => typeof t === "string" && t.trim() !== "").map(t => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
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
            <Select value={classificacaoEtaria || undefined} onValueChange={setClassificacaoEtaria}>
              <SelectTrigger style={pillSelectTrigger}>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {CLASSIFICACOES_ETARIAS.filter(c => typeof c.value === "string" && c.value.trim() !== "").map(c => (
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

          <Field label="Apresentadores">
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
                <Popover open={estudioDropdownOpen} onOpenChange={setEstudioDropdownOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      style={pillSelectTrigger}
                      onClick={() => setEstudioDropdownOpen(prev => !prev)}
                      className="w-full text-left"
                    >
                      <span style={{ color: estudio ? DARK : "#94A3B8", fontWeight: estudio ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {estudio || "Selecione o estúdio"}
                      </span>
                      <ChevronDown size={14} className={cn("text-[#0055ff] transition-transform duration-200 shrink-0 ml-2", estudioDropdownOpen && "rotate-180")} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] min-w-[220px] p-2 rounded-2xl bg-white border border-slate-200 shadow-2xl z-[100] max-h-64 overflow-y-auto space-y-1 animate-in fade-in zoom-in-95 duration-100"
                    align="start"
                  >
                    {estudios.filter(e => typeof e === "string" && e.trim() !== "").map(e => {
                      const isSelected = estudio?.toUpperCase() === e.toUpperCase();
                      return (
                        <div
                          key={e}
                          onClick={() => {
                            setEstudio(e);
                            setEstudioDropdownOpen(false);
                          }}
                          className={cn(
                            "group flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-all duration-150 text-xs font-bold uppercase tracking-wide",
                            isSelected
                              ? "bg-[#0055ff] text-white shadow-sm"
                              : "text-slate-700 hover:bg-[#0055ff] hover:text-white"
                          )}
                        >
                          <span className="truncate pr-2">{e}</span>
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.preventDefault();
                              ev.stopPropagation();
                              removeEstudio(e);
                            }}
                            title={`Excluir ${e}`}
                            aria-label={`Excluir estúdio ${e}`}
                            className={cn(
                              "w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all border",
                              isSelected
                                ? "border-white/40 text-white hover:bg-rose-500 hover:border-rose-500"
                                : "border-slate-300 text-slate-400 group-hover:border-white/40 group-hover:text-white hover:!bg-rose-500 hover:!text-white hover:!border-rose-500"
                            )}
                          >
                            <Minus size={11} strokeWidth={3} />
                          </button>
                        </div>
                      );
                    })}
                    {estudios.length === 0 && (
                      <div className="py-5 text-center text-xs text-slate-400 font-medium">
                        Nenhum estúdio cadastrado.<br />
                        Clique em <span className="text-[#0055ff] font-bold">+ NOVO</span> para adicionar.
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
              <Dialog open={estudioDialogOpen} onOpenChange={setEstudioDialogOpen}>
                <DialogTrigger asChild>
                  <button style={smallCyanBtn}>+ Novo</button>
                </DialogTrigger>
                <DialogContent style={{ background: CARD_BG, borderRadius: 24, border: "none" }}>
                  <DialogHeader><DialogTitle style={{ color: DARK, fontFamily: "'Montserrat', sans-serif", fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", fontSize: 14 }}>Cadastrar Estúdio</DialogTitle></DialogHeader>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                    <input
                      style={pillInput}
                      value={newEstudio}
                      onChange={(e) => setNewEstudio(e.target.value)}
                      placeholder="Nome do estúdio"
                      onKeyDown={(e) => { if (e.key === "Enter") addEstudio(); }}
                    />
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

          <Field label="Descrição" span="col-span-full">
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

          <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Calendar size={12} /> {variavel ? "Agendamento do Programa Variável" : "Dias da Semana"}</span>} span="col-span-full">
            {variavel && (
              <div style={{ display: "flex", gap: 6, marginBottom: 12, padding: 4, width: "fit-content", borderRadius: 999, background: "#FFFFFF", border: `1px solid ${CYAN}` }}>
                {([
                  { value: "data", label: "Data específica" },
                  { value: "dias", label: "Dias da semana" },
                ] as const).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setAgendamentoVariavel(value); setConflictMsg(""); }}
                    style={{
                      height: 30,
                      padding: "0 14px",
                      borderRadius: 999,
                      border: "none",
                      background: agendamentoVariavel === value ? "#F59E0B" : "transparent",
                      color: agendamentoVariavel === value ? "#FFFFFF" : DARK,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {(!variavel || agendamentoVariavel === "dias") && <div className="flex flex-wrap gap-2">
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
            </div>}
            {variavel && agendamentoVariavel === "dias" && (
              <p style={{ fontSize: 10, color: "#92400E", marginTop: 8 }}>
                Este programa terá prioridade sobre a programação fixa nos dias e horários selecionados.
              </p>
            )}
          </Field>

          <div className="col-span-full grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Field label="Selo (1080×1080 PNG alpha)">
              <div className="flex items-center gap-3">
                {uploadBox(selo, handleSelo, 74, 74, "Selo")}
                {selo && (
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleDownload(selo, `selo_${nome || "programa"}.png`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 hover:bg-blue-100 text-[#0055ff] border border-blue-200/70 transition-colors shadow-xs"
                    >
                      <Download size={11} /> Baixar
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelo("")}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/70 transition-colors shadow-xs"
                    >
                      <Trash2 size={11} /> Remover
                    </button>
                  </div>
                )}
              </div>
            </Field>
            <Field label="Capa (226×302 PNG alpha)">
              <div className="flex items-center gap-3">
                {uploadBox(capa, handleCapa, 64, 86, "Capa")}
                {capa && (
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleDownload(capa, `capa_${nome || "programa"}.png`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 hover:bg-blue-100 text-[#0055ff] border border-blue-200/70 transition-colors shadow-xs"
                    >
                      <Download size={11} /> Baixar
                    </button>
                    <button
                      type="button"
                      onClick={() => setCapa("")}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/70 transition-colors shadow-xs"
                    >
                      <Trash2 size={11} /> Remover
                    </button>
                  </div>
                )}
              </div>
            </Field>
            <Field label="Thumb (1920×1080 PNG)">
              <div className="flex items-center gap-3">
                {uploadBox(thumb, handleThumb, 110, 62, "Thumb")}
                {thumb && (
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleDownload(thumb, `thumb_${nome || "programa"}.png`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 hover:bg-blue-100 text-[#0055ff] border border-blue-200/70 transition-colors shadow-xs"
                    >
                      <Download size={11} /> Baixar
                    </button>
                    <button
                      type="button"
                      onClick={() => setThumb("")}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/70 transition-colors shadow-xs"
                    >
                      <Trash2 size={11} /> Remover
                    </button>
                  </div>
                )}
              </div>
            </Field>
          </div>

          {variavel && agendamentoVariavel === "data" && (
            <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#B45309" }}><CalendarDays size={12} /> Data Específica do Programa Variável</span>} span="col-span-full">
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
            <div className="flex items-center gap-2 flex-wrap">
              {isClientStation ? (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 999, background: "#E0F2FE", color: "#0369A1", fontSize: 11, fontWeight: 800, letterSpacing: 0.5 }}>
                  <Building2 size={13} />
                  <span>{currentClientAccount?.nome || currentStationKey}</span>
                </div>
              ) : (
                <div style={{ minWidth: 180 }}>
                  <Select value={filterCliente || "todos"} onValueChange={setFilterCliente}>
                    <SelectTrigger style={{ ...pillSelectTrigger, height: 38, fontSize: 12 }}>
                      <SelectValue placeholder="Filtrar por Cliente" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      <SelectItem value="todos">Todos os Clientes</SelectItem>
                      {clientesList.filter(cli => typeof cli === "string" && cli.trim() !== "").map(cli => (
                        <SelectItem key={cli} value={cli}>
                          {cli}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div style={{ display: "inline-flex", gap: 4, background: CARD_BG, borderRadius: 999, padding: 4 }}>
                {([
                  { v: "todos", label: "Todos" },
                  { v: "semana", label: "Seg → Sex" },
                  { v: "fds", label: "Fim de semana" },
                ] as const).map(opt => (
                  <button
                    key={opt.v}
                    onClick={() => setPeriodoFilter(opt.v)}
                    style={{
                      padding: "6px 14px", borderRadius: 999, border: "none", cursor: "pointer",
                      fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
                      background: periodoFilter === opt.v ? CYAN : "transparent",
                      color: periodoFilter === opt.v ? "#FFFFFF" : DARK,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div style={{ minWidth: 180 }}>
                <Select value={sortBy || "horario"} onValueChange={(v: any) => setSortBy(v)}>
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

          </div>

          <div style={{ maxHeight: 460, overflowY: "auto", overflowX: "auto", borderRadius: 16, border: `1px solid ${CARD_BG}` }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
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
                      <div className="flex items-center gap-3">
                        <ProgramBadge program={p} size={36} />
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{p.nome}</span>
                            {p.variavel && <span style={{ fontSize: 9, padding: "1px 8px", borderRadius: 999, fontWeight: 800, background: "#FEF3C7", color: "#92400E", letterSpacing: 0.5 }}>VAR</span>}
                            {p.cliente && !isClientStation && (
                              <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 999, fontWeight: 800, background: "#E0F2FE", color: "#0369A1", letterSpacing: 0.4 }}>
                                {p.cliente}
                              </span>
                            )}
                          </div>
                          {p.classificacaoEtaria && <div style={{ marginTop: 3 }}><ClassificacaoBadge value={p.classificacaoEtaria} size={13} /></div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 11 }}>
                      {p.variavel && p.dataVariavel
                        ? (() => {
                            try {
                              const d = new Date(p.dataVariavel + "T12:00:00");
                              return isNaN(d.getTime()) ? p.dataVariavel : format(d, "dd/MM/yyyy (EEEE)", { locale: ptBR });
                            } catch {
                              return p.dataVariavel || "";
                            }
                          })()
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
                        {(p.horarioInicio || "00:00").slice(0, 5)} — {(p.horarioFim || "00:00").slice(0, 5)}
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
          {sortedProgramas.length > 6 && (
            <p style={{ margin: "10px 2px 0", color: "#64748B", fontSize: 11, textAlign: "right" }}>
              Mostrando 6 de {sortedProgramas.length} programas · role a lista para ver os demais
            </p>
          )}
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
              <Select value={gradeEstudioFilter || "todos"} onValueChange={setGradeEstudioFilter}>
                <SelectTrigger style={{ ...pillSelectTrigger, height: 38, fontSize: 12 }}>
                  <SelectValue placeholder="Filtrar por estúdio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os estúdios</SelectItem>
                  {estudios.filter(e => typeof e === "string" && e.trim() !== "").map(e => (<SelectItem key={e} value={e}>{e}</SelectItem>))}
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
            className="rounded-2xl overflow-y-auto max-h-[440px] w-full grade-scroll"
            style={{ border: `1px solid ${CARD_BG}`, background: "#FFFFFF", position: "relative" }}
          >
            <table data-no-row-hover className="w-full table-fixed text-xs border-separate border-spacing-y-0.5" style={{ width: "100%", minWidth: 0, tableLayout: "fixed" }}>
              <thead className="sticky top-0 z-10">
                <tr style={{ background: `linear-gradient(180deg, ${CYAN} 0%, #00A9D6 100%)` }}>
                  <th style={{ padding: "10px 6px", textAlign: "right", width: 58, fontSize: 9, fontWeight: 900, letterSpacing: 1.4, textTransform: "uppercase", color: "#FFFFFF" }}>Horário</th>
                  {DIAS_SEMANA.map(dia => {
                    const isToday = dia === diaAtual;
                    return (
                      <th key={dia} style={{
                        padding: "10px 3px", textAlign: "center", fontSize: 10, fontWeight: 900, letterSpacing: 1.4, textTransform: "uppercase",
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
                {(currentTimeStr || "00:00").slice(0, 5)}
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
