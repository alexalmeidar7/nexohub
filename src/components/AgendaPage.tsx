import { DateInput } from "@/components/ui/date-input";
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { CalendarIcon, CalendarDays, Plus, Trash2, MapPin, Users, User, Instagram, Pencil, X, AlertTriangle, History, Star, Video, Bell, AlignLeft, Briefcase, Link as LinkIcon, List, Clock, Eye, Radio, Repeat, ScrollText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, isSameDay, addMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getZonedNow } from "@/lib/onAirResolver";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { ExpressEditData } from "@/components/ProgramaExpressInline";
import { getClientHouseMixPrograms, getClientHouseMixProgramsSync, normalizeClientKey, saveCustomStudio } from "@/lib/houseMixProgramasService";
import { getProgramas } from "@/components/ProgramaForm";
import { getStationDatabaseSync } from "@/lib/stationDatabaseService";
import { getSnapshotApresentadores, getSnapshotProgramas } from "@/lib/supabaseDatabaseSnapshot";
const ProgramaExpressInline = lazy(() => import("@/components/ProgramaExpressInline"));
import DatasComemorativasCidades from "@/components/agenda/DatasComemorativasCidades";
import GoogleWeekGrid, { type GridEvent } from "@/components/agenda/GoogleWeekGrid";
import GoogleCalendarSync from "@/components/GoogleCalendarSync";
import AgendaPageSkeleton from "@/components/skeletons/AgendaPageSkeleton";

import { uploadImageToStorage } from "@/lib/uploadImageToStorage";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";
import { Youtube, Image as ImageIcon, Upload, Download, Search, MessageCircle, Send, Sparkles } from "lucide-react";
import { confirmDialog } from "@/lib/confirmDialog";
import { getStoredMetadata, DEFAULT_AGENCY_CLIENTS } from "@/components/ClientesPage";

export interface AgendaCliente {
  id: string;
  user_id?: string;
  nome: string;
  nome_empresarial: string;
  logo_url?: string | null;
  categoria?: string;
  email?: string;
  cnpj?: string;
  aliases?: string[];
}

const isUuid = (val?: string | null): boolean => {
  if (!val || typeof val !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
};

function ParticipanteSearchPicker({
  apresentadores,
  existingNames,
  onSelect,
  onAddBlank,
  onRegisterGuest,
}: {
  apresentadores: Apresentador[];
  existingNames: string[];
  onSelect: (a: Apresentador) => void;
  onAddBlank: () => void;
  onRegisterGuest: (nome: string, instagram: string, whatsapp: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [guestNome, setGuestNome] = useState("");
  const [guestInsta, setGuestInsta] = useState("");
  const [guestWhats, setGuestWhats] = useState("+55");
  const [savingGuest, setSavingGuest] = useState(false);

  const formatWhatsapp = (value: string) => {
    let digits = value.replace(/\D/g, "");
    if (!digits.startsWith("55")) digits = "55" + digits.replace(/^55*/, "");
    digits = digits.slice(0, 13);
    let formatted = "+55";
    const local = digits.slice(2);
    if (local.length > 0) formatted += " (" + local.slice(0, 2);
    if (local.length >= 2) formatted += ")";
    if (local.length > 2) formatted += " " + local.slice(2, 7);
    if (local.length > 7) formatted += "-" + local.slice(7, 11);
    return formatted;
  };

  const filtered = apresentadores
    .filter(a => !existingNames.includes(a.nome.trim().toLowerCase()))
    .filter(a => !q.trim() || a.nome.toLowerCase().includes(q.toLowerCase()) || (a.instagram || "").toLowerCase().includes(q.toLowerCase()))
    .slice(0, 50);

  const noResults = q.trim().length > 0 && filtered.length === 0;

  return (
    <div className="space-y-2 rounded-xl p-2" style={{ backgroundColor: "var(--layout-widget-bg, hsl(var(--card)))", color: "var(--layout-widget-text, hsl(var(--card-foreground)))" }}>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Buscar apresentador ou convidado..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="max-h-60 overflow-y-auto space-y-0.5">
        {filtered.length === 0 ? (
          <div className="py-3 space-y-2">
            <p className="text-[10px] text-center opacity-70" style={{ color: "var(--layout-widget-text, hsl(var(--muted-foreground)))" }}>Nenhum participante encontrado</p>
            {noResults && !showRegister && (
              <Button
                type="button"
                size="sm"
                onClick={() => { setGuestNome(q); setGuestInsta(""); setShowRegister(true); }}
                className="w-full h-8 text-[10px] gap-1 rounded-full"
                style={{
                  backgroundColor: "var(--layout-accent-color, hsl(var(--primary)))",
                  color: "var(--layout-accent-text, hsl(var(--primary-foreground)))",
                }}
              >
                <Plus size={11} /> Cadastrar "{q}" como Convidado
              </Button>
            )}
            {showRegister && (
              <div
                className="space-y-2 p-2 rounded-lg"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--layout-page-bg, hsl(var(--background))) 85%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--layout-accent-color, hsl(var(--accent))) 40%, var(--layout-border-color, hsl(var(--border))) 60%)",
                }}
              >
                <p className="text-[10px] font-medium opacity-80" style={{ color: "var(--layout-widget-text, hsl(var(--foreground)))" }}>Novo Convidado</p>
                <Input
                  autoFocus
                  value={guestNome}
                  onChange={(e) => setGuestNome(e.target.value)}
                  placeholder="Nome do convidado"
                  className="h-8 text-xs"
                  style={{
                    backgroundColor: "var(--layout-page-bg, hsl(var(--background)))",
                    color: "var(--layout-page-text, hsl(var(--foreground)))",
                    borderColor: "var(--layout-border-color, hsl(var(--border)))",
                  }}
                />
                <Input
                  value={guestInsta}
                  onChange={(e) => setGuestInsta(e.target.value)}
                  placeholder="@instagram (opcional)"
                  className="h-8 text-xs"
                  style={{
                    backgroundColor: "var(--layout-page-bg, hsl(var(--background)))",
                    color: "var(--layout-page-text, hsl(var(--foreground)))",
                    borderColor: "var(--layout-border-color, hsl(var(--border)))",
                  }}
                />
                <Input
                  value={guestWhats}
                  onChange={(e) => setGuestWhats(formatWhatsapp(e.target.value))}
                  placeholder="+55 (DDD) 00000-0000"
                  className="h-8 text-xs"
                  style={{
                    backgroundColor: "var(--layout-page-bg, hsl(var(--background)))",
                    color: "var(--layout-page-text, hsl(var(--foreground)))",
                    borderColor: "var(--layout-border-color, hsl(var(--border)))",
                  }}
                />
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => { setShowRegister(false); setGuestWhats("+55"); }}
                    className="flex-1 h-9 text-xs font-semibold rounded-full border-2"
                    style={{
                      backgroundColor: "var(--layout-page-bg, hsl(var(--background)))",
                      color: "var(--layout-page-text, hsl(var(--foreground)))",
                      borderColor: "var(--layout-border-color, hsl(var(--border)))",
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button variant="save"
                    type="button"
                    size="sm"
                    disabled={!guestNome.trim() || savingGuest}
                    onClick={async () => {
                      setSavingGuest(true);
                      try {
                        await onRegisterGuest(guestNome.trim(), guestInsta.trim(), guestWhats.trim());
                        setShowRegister(false);
                        setGuestWhats("+55");
                        setQ("");
                      } finally {
                        setSavingGuest(false);
                      }
                    }}
                    className="flex-1 h-9 text-xs font-bold rounded-full shadow-md"
                    style={{
                      backgroundColor: "var(--layout-accent-color, hsl(var(--primary)))",
                      color: "var(--layout-accent-text, hsl(var(--primary-foreground)))",
                    }}
                  >
                    {savingGuest ? "Salvando..." : "Salvar Convidado"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(a)}
              className="w-full text-left px-2 py-1.5 rounded-lg text-xs flex flex-col transition-colors"
              style={{
                backgroundColor: "color-mix(in srgb, var(--layout-page-bg, hsl(var(--background))) 82%, transparent)",
                color: "var(--layout-widget-text, hsl(var(--foreground)))",
                border: "1px solid color-mix(in srgb, var(--layout-border-color, hsl(var(--border))) 45%, transparent)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--layout-accent-color, hsl(var(--accent))) 14%, var(--layout-page-bg, hsl(var(--background))) 86%)";
                e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-accent-color, hsl(var(--accent))) 55%, transparent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--layout-page-bg, hsl(var(--background))) 82%, transparent)";
                e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-border-color, hsl(var(--border))) 45%, transparent)";
              }}
            >
              <span className="font-medium">{a.nome}</span>
              {a.instagram && <span className="text-[10px] opacity-60">@{a.instagram.replace(/^@/, "")}</span>}
            </button>
          ))
        )}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onAddBlank}
        className="w-full h-8 text-[10px] gap-1 rounded-full border"
        style={{
          backgroundColor: "color-mix(in srgb, var(--layout-widget-bg, hsl(var(--card))) 75%, var(--layout-page-bg, hsl(var(--background))) 25%)",
          color: "var(--layout-widget-text, hsl(var(--foreground)))",
          borderColor: "color-mix(in srgb, var(--layout-accent-color, hsl(var(--accent))) 40%, var(--layout-border-color, hsl(var(--border))) 60%)",
        }}
      >
        <Plus size={11} /> Adicionar manualmente
      </Button>
    </div>
  );
}

interface Programa {
  id: string;
  nome: string;
  horario_inicio: string;
  horario_fim: string;
  horarioInicio?: string;
  horarioFim?: string;
  estudio: string;
  dias_semana: string[];
  diasSemana?: string[];
  apresentador_id?: string | null;
  apresentadorId?: string | null;
  apresentadores_ids?: string[] | null;
  apresentadoresIds?: string[] | null;
  capa?: string | null;
  selo?: string | null;
  thumb?: string | null;
  tipo_programa?: string | null;
  tipoPrograma?: string | null;
  user_id?: string | null;
}

interface Apresentador {
  id: string;
  nome: string;
  instagram?: string | null;
  cargo?: string | null;
  whatsapp?: string | null;
  foto?: string | null;
  foto_url?: string | null;
}

interface Participante {
  id?: string;
  nome: string;
  instagram: string;
  obrigatorio?: boolean;
}

export type ExcecaoAcao = "skip" | "substituir" | "automatico" | "manter";
export interface EventoExcecao {
  data: string; // YYYY-MM-DD
  acao: ExcecaoAcao;
  programa_id?: string | null;
  cor?: string | null;
}

interface Evento {
  id: string;
  programa_id: string;
  data: string;
  local: string;
  descricao: string;
  recorrencia: string;
  prioridade: string;
  status?: string;
  tipo_evento?: string;
  cor?: string;
  youtube_url?: string;
  artes_urls?: string[];
  youtube_titulo?: string;
  youtube_descricao?: string;
  edicao_notas?: string;
  edicao_concluida?: boolean;
  horario_gravacao?: string;
  horario_gravacao_fim?: string;
  periodo_inicio?: string | null;
  periodo_fim?: string | null;
  excecoes?: EventoExcecao[];
  dias_semana?: number[];
  programa?: Programa;
  participantes?: Participante[];
  user_id?: string | null;
}

export const DIAS_DA_SEMANA = [
  { id: 1, label: "SEG" },
  { id: 2, label: "TER" },
  { id: 3, label: "QUA" },
  { id: 4, label: "QUI" },
  { id: 5, label: "SEX" },
  { id: 6, label: "SÁB" },
  { id: 0, label: "DOM" },
];

export const getRecorrenciaLabel = (rec?: string, dias?: number[]): string => {
  if (!rec || rec === "unico") return "Não se repete";
  if (rec === "semanal") return "Semanalmente";
  if (rec === "mensal") return "Mensalmente";
  if (rec === "programa_semanal" || rec.startsWith("programa_semanal:") || rec.startsWith("dias:")) {
    let days = dias;
    if ((!days || !days.length) && rec.startsWith("programa_semanal:")) {
      days = rec.slice(17).split(",").map(Number).filter((n) => !isNaN(n));
    } else if ((!days || !days.length) && rec.startsWith("dias:")) {
      days = rec.slice(5).split(",").map(Number).filter((n) => !isNaN(n));
    }
    if (days && days.length > 0) {
      const weekOrder = [1, 2, 3, 4, 5, 6, 0];
      const ordered = weekOrder.filter((id) => days!.includes(id));
      const labels = ordered.map((id) => DIAS_DA_SEMANA.find((d) => d.id === id)!.label);
      if (labels.length === 1) return labels[0];
      const positions = ordered.map((id) => weekOrder.indexOf(id));
      const isContiguous = positions.every((pos, i) => i === 0 || pos === positions[i - 1] + 1);
      if (isContiguous) return `${labels[0]} > ${labels[labels.length - 1]}`;
      return labels.join(", ");
    }
    return "Selecione";
  }
  return rec;
};

const recorrenciaLabels: Record<string, string> = new Proxy(
  {
    unico: "Não se repete",
    semanal: "Semanalmente",
    mensal: "Mensalmente",
    programa_semanal: "Selecione",
  },
  {
    get(target, prop: string) {
      if (prop in target) return (target as any)[prop];
      if (typeof prop === "string" && (prop.startsWith("programa_semanal:") || prop.startsWith("dias:"))) {
        return getRecorrenciaLabel(prop);
      }
      return prop;
    },
  }
);


const statusOptions = [
  { value: "ativo", label: "Ativo", color: "#10b981" },
  { value: "concluido", label: "Concluído", color: "#6366f1" },
  { value: "cancelado", label: "Cancelado", color: "#ef4444" },
  { value: "remarcado", label: "Mudou de data", color: "#f59e0b" },
];

// Deterministic HSL color for each studio name
const studioHue = (name?: string) => {
  if (!name) return 220;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
};
const studioColors = (name?: string) => {
  const h = studioHue(name);
  return {
    bg: `hsl(${h} 75% 96%)`,
    border: `hsl(${h} 65% 55%)`,
    text: `hsl(${h} 70% 28%)`,
  };
};
export function getFeriadosNacionaisDoAno(year: number) {
  // Cálculo da Páscoa (algoritmo de Meeus)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = new Date(year, month - 1, day);
  const carnaval = new Date(pascoa.getTime() - 47 * 86400000);
  const sextaSanta = new Date(pascoa.getTime() - 2 * 86400000);
  const corpusChristi = new Date(pascoa.getTime() + 60 * 86400000);

  return [
    { date: new Date(year, 0, 1), nome: "Confraternização Universal" },
    { date: carnaval, nome: "Carnaval" },
    { date: sextaSanta, nome: "Sexta-feira Santa" },
    { date: new Date(year, 3, 21), nome: "Tiradentes" },
    { date: new Date(year, 4, 1), nome: "Dia do Trabalho" },
    { date: corpusChristi, nome: "Corpus Christi" },
    { date: new Date(year, 8, 7), nome: "Independência do Brasil" },
    { date: new Date(year, 9, 12), nome: "N. Sra. Aparecida" },
    { date: new Date(year, 10, 2), nome: "Finados" },
    { date: new Date(year, 10, 15), nome: "Proclamação da República" },
    { date: new Date(year, 10, 20), nome: "Dia da Consciência Negra" },
    { date: new Date(year, 11, 25), nome: "Natal" },
  ];
}

// Palette (nexo-form-design-system) — mesmo padrão do Cadastro de Ouvinte
const NEXO_CYAN = "#00BFF0";
const NEXO_LIME = "#C6F03C";
const NEXO_CARD_BG = "#D6F4FB";
const NEXO_DARK = "#0A2540";

export const LOCAL_AGENDA_EVENTS_KEY = "nexohub_agenda_local_events_v2";

function getAgendaStorageKey(targetUserId?: string | null): string {
  const norm = (targetUserId || "default").trim().toLowerCase();
  return `${LOCAL_AGENDA_EVENTS_KEY}_${norm}`;
}

export function getStoredAgendaEvents(targetUserId?: string | null): Evento[] {
  try {
    const key = getAgendaStorageKey(targetUserId);
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const own = targetUserId
          ? parsed.filter((e: any) => e && (!e.user_id || e.user_id === targetUserId))
          : parsed;
        if (own.length > 0) return own;
      }
    }
    // Fallback global key — SOMENTE eventos que pertencem ao usuário atual
    const fallbackRaw = localStorage.getItem(LOCAL_AGENDA_EVENTS_KEY);
    if (fallbackRaw) {
      const parsed = JSON.parse(fallbackRaw);
      if (Array.isArray(parsed)) {
        if (!targetUserId) return [];
        return parsed.filter((e: any) => e && e.user_id === targetUserId);
      }
    }
  } catch (err) {
    console.warn("Erro ao ler eventos do storage:", err);
  }
  return [];
}

const isUuidId = (id?: string | null) =>
  !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/**
 * Hide duplicate agenda rows that have the same event identity but different IDs.
 * Prefer the persisted UUID row over a local/offline copy. This is a display/cache
 * safeguard only; it never deletes records from the database.
 */
function dedupeAgendaEvents(events: Evento[]): Evento[] {
  const identity = (event: Evento) => [
    event.data || "",
    event.programa_id || "",
    (event.youtube_titulo || event.descricao || "").trim().toLocaleLowerCase("pt-BR"),
    (event.local || "").trim().toLocaleLowerCase("pt-BR"),
    (event.horario_gravacao || event.programa?.horario_inicio || "").slice(0, 5),
    (event.horario_gravacao_fim || event.programa?.horario_fim || "").slice(0, 5),
    event.tipo_evento || "",
    event.status || "ativo",
    event.recorrencia || "unico",
    event.periodo_inicio || "",
    event.periodo_fim || "",
  ].join("|");

  const ordered = [...events].sort((a, b) => Number(isUuidId(b.id)) - Number(isUuidId(a.id)));
  const seen = new Set<string>();
  return ordered.filter((event) => {
    const key = identity(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Remove do cache local qualquer evento do banco (id uuid) que NÃO pertença
 * mais a este usuário — evita vazamento de eventos entre contas.
 */
export function pruneStoredAgendaEvents(targetUserId?: string | null, dbIds?: string[]) {
  if (!targetUserId) return;
  try {
    const ids = new Set(dbIds || []);
    const key = getAgendaStorageKey(targetUserId);
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter(
          (e: any) => e && (!isUuidId(e.id) || ids.has(e.id)) && (!e.user_id || e.user_id === targetUserId),
        );
        if (cleaned.length !== parsed.length) localStorage.setItem(key, JSON.stringify(cleaned));
      }
    }
    const fbRaw = localStorage.getItem(LOCAL_AGENDA_EVENTS_KEY);
    if (fbRaw) {
      const parsed = JSON.parse(fbRaw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter(
          (e: any) => e && (e.user_id !== targetUserId || !isUuidId(e.id) || ids.has(e.id)),
        );
        if (cleaned.length !== parsed.length) localStorage.setItem(LOCAL_AGENDA_EVENTS_KEY, JSON.stringify(cleaned));
      }
    }
  } catch {}
}

export function saveStoredAgendaEvent(evt: Evento, targetUserId?: string | null) {
  if (!evt || !evt.id) return;
  try {
    const effectiveUid = targetUserId || evt.user_id || "default";
    if (targetUserId && !evt.user_id) evt = { ...evt, user_id: targetUserId };
    const key = getAgendaStorageKey(effectiveUid);
    const existing = getStoredAgendaEvents(effectiveUid);
    const filtered = existing.filter((e) => e.id !== evt.id);
    const updated = [evt, ...filtered];
    localStorage.setItem(key, JSON.stringify(updated));

    // Also update global fallback storage for resiliency
    try {
      const fallbackRaw = localStorage.getItem(LOCAL_AGENDA_EVENTS_KEY);
      const fallbackList: Evento[] = fallbackRaw ? JSON.parse(fallbackRaw) : [];
      const filteredFallback = (Array.isArray(fallbackList) ? fallbackList : []).filter((e) => e.id !== evt.id);
      localStorage.setItem(LOCAL_AGENDA_EVENTS_KEY, JSON.stringify([evt, ...filteredFallback]));
    } catch {}
  } catch (err) {
    console.warn("Erro ao salvar evento no storage:", err);
  }
}

export function deleteStoredAgendaEvent(id: string, targetUserId?: string | null) {
  if (!id) return;
  try {
    const key = getAgendaStorageKey(targetUserId);
    const existing = getStoredAgendaEvents(targetUserId);
    const updated = existing.filter((e) => e.id !== id);
    localStorage.setItem(key, JSON.stringify(updated));

    // Also remove from fallback
    try {
      const fallbackRaw = localStorage.getItem(LOCAL_AGENDA_EVENTS_KEY);
      if (fallbackRaw) {
        const fallbackList: Evento[] = JSON.parse(fallbackRaw);
        if (Array.isArray(fallbackList)) {
          const filteredFallback = fallbackList.filter((e) => e.id !== id);
          localStorage.setItem(LOCAL_AGENDA_EVENTS_KEY, JSON.stringify(filteredFallback));
        }
      }
    } catch {}
  } catch (err) {
    console.warn("Erro ao remover evento do storage:", err);
  }
}

export const EVENT_COLORS_KEY = "nexohub_agenda_event_colors_v1";

export function getStoredEventColor(id?: string | null): string | null {
  if (!id) return null;
  try {
    const raw = localStorage.getItem(EVENT_COLORS_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map[id] || null;
  } catch {
    return null;
  }
}

export function saveStoredEventColor(id: string, color: string) {
  if (!id || !color) return;
  try {
    const raw = localStorage.getItem(EVENT_COLORS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[id] = color;
    localStorage.setItem(EVENT_COLORS_KEY, JSON.stringify(map));
  } catch {}
}

export function unifyAgendaClients(rawList: AgendaCliente[]): AgendaCliente[] {
  const unified: AgendaCliente[] = [];

  for (const item of rawList) {
    const rawNome = (item.nome || "").trim();
    const rawEmp = (item.nome_empresarial || "").trim();
    const displayName = rawEmp || rawNome || item.id || "";
    if (!displayName) continue;

    const email = (item.email || "").trim().toLowerCase();
    const cnpj = (item.cnpj || "").replace(/\D/g, "");
    const canonicalKey = normalizeClientKey(displayName);
    const slug = canonicalKey
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

    // Procura se o cliente já existe na lista unificada
    const existingIndex = unified.findIndex((u) => {
      // 1. Cruzamento por Email (se ambos tiverem email preenchido)
      if (email && u.email && email === u.email.toLowerCase()) {
        return true;
      }
      // 2. Cruzamento por CNPJ (se ambos tiverem CNPJ válido)
      if (cnpj && u.cnpj && cnpj.length >= 8 && cnpj === u.cnpj.replace(/\D/g, "")) {
        return true;
      }
      // 3. Cruzamento por slug / chave canônica (ex: CULTURA FM / culturafm)
      const uRawNome = (u.nome || "").trim();
      const uRawEmp = (u.nome_empresarial || "").trim();
      const uDisplayName = uRawEmp || uRawNome || u.id || "";
      const uCanonicalKey = normalizeClientKey(uDisplayName);
      const uSlug = uCanonicalKey
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");

      if (slug && uSlug && slug === uSlug) {
        return true;
      }

      // 4. Comparação exata de nome normalizado
      if (displayName.toUpperCase() === uDisplayName.toUpperCase()) {
        return true;
      }

      // 5. Cruzamento por ID / User ID / Alias existente
      if (
        (item.user_id && (item.user_id === u.user_id || item.user_id === u.id)) ||
        (item.id && (item.id === u.id || item.id === u.user_id)) ||
        (u.aliases && (u.aliases.includes(item.id) || (item.user_id && u.aliases.includes(item.user_id))))
      ) {
        return true;
      }

      return false;
    });

    if (existingIndex >= 0) {
      const existing = unified[existingIndex];
      const aliases = new Set(existing.aliases || [existing.id]);
      if (existing.user_id) aliases.add(existing.user_id);
      if (item.id) aliases.add(item.id);
      if (item.user_id) aliases.add(item.user_id);
      existing.aliases = Array.from(aliases);

      if (!existing.logo_url && item.logo_url) {
        existing.logo_url = item.logo_url;
      }
      if (!existing.email && item.email) {
        existing.email = item.email;
      }
      if (!existing.cnpj && item.cnpj) {
        existing.cnpj = item.cnpj;
      }
      if ((!existing.categoria || existing.categoria === "OUTROS") && item.categoria) {
        existing.categoria = item.categoria;
      }
      // Prefere o nome empresarial mais completo e legível
      if (
        item.nome_empresarial &&
        item.nome_empresarial.length > (existing.nome_empresarial?.length || 0) &&
        !item.id.startsWith("local_")
      ) {
        existing.nome_empresarial = item.nome_empresarial.toUpperCase();
      }
      if (
        item.nome &&
        item.nome.length > (existing.nome?.length || 0) &&
        !item.id.startsWith("local_")
      ) {
        existing.nome = item.nome.toUpperCase();
      }
    } else {
      unified.push({
        id: item.id,
        user_id: item.user_id,
        nome: rawNome ? rawNome.toUpperCase() : displayName.toUpperCase(),
        nome_empresarial: rawEmp ? rawEmp.toUpperCase() : displayName.toUpperCase(),
        logo_url: item.logo_url || null,
        categoria: (item.categoria || "EMISSORA DE RÁDIO").toUpperCase(),
        email: email || undefined,
        cnpj: cnpj || undefined,
        aliases: [item.id, ...(item.user_id ? [item.user_id] : [])],
      });
    }
  }

  unified.sort((a, b) => (a.nome_empresarial || a.nome).localeCompare(b.nome_empresarial || b.nome));
  return unified;
}

export function getInitialClientesList(): AgendaCliente[] {
  try {
    const storedMeta = getStoredMetadata();
    const rawList: AgendaCliente[] = [];

    // 1. DEFAULT_AGENCY_CLIENTS
    Object.entries(DEFAULT_AGENCY_CLIENTS).forEach(([key, def]) => {
      const display = (def.nome_empresarial || def.razao_social || key).trim().toUpperCase();
      if (!display) return;
      rawList.push({
        id: key,
        nome: display,
        nome_empresarial: display,
        logo_url: (def as any).logo_url || null,
        categoria: (def.categoria || "EMISSORA DE RÁDIO").toUpperCase(),
        email: def.email_cobranca || (def as any).email || "",
        cnpj: def.cnpj || "",
      });
    });

    // 2. storedMeta
    Object.entries(storedMeta).forEach(([key, meta]) => {
      const candidate = (meta.nome_empresarial || meta.razao_social || (key.startsWith("local_") ? "" : key) || "").trim();
      if (!candidate) return;
      const display = candidate.toUpperCase();
      rawList.push({
        id: key,
        nome: display,
        nome_empresarial: display,
        logo_url: meta.logo_url || meta.logo || null,
        categoria: (meta.categoria || "").toUpperCase(),
        email: meta.email_cobranca || (meta as any).email || "",
        cnpj: meta.cnpj || "",
      });
    });

    return unifyAgendaClients(rawList);
  } catch {
    return [];
  }
}

export const normalizeProgs = (list: any[]): Programa[] => {
  return (list || []).map((p: any) => {
    const hInicio = (p.horario_inicio || p.horarioInicio || "").slice(0, 5) || "08:00";
    const hFim = (p.horario_fim || p.horarioFim || "").slice(0, 5) || "10:00";
    const rawDias = p.dias_semana || p.diasSemana || ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
    const dias = Array.isArray(rawDias)
      ? rawDias
      : typeof rawDias === "string"
        ? rawDias.split(",")
        : ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

    return {
      id: p.id,
      nome: p.nome,
      horario_inicio: hInicio,
      horario_fim: hFim,
      horarioInicio: hInicio,
      horarioFim: hFim,
      estudio: p.estudio || "Estúdio Principal",
      dias_semana: dias,
      diasSemana: dias,
      apresentador_id: p.apresentador_id || p.apresentadorId || null,
      apresentadorId: p.apresentador_id || p.apresentadorId || null,
      apresentadores_ids: p.apresentadores_ids || p.apresentadoresIds || (p.apresentador_id ? [p.apresentador_id] : []),
      apresentadoresIds: p.apresentadores_ids || p.apresentadoresIds || (p.apresentador_id ? [p.apresentador_id] : []),
      capa: p.capa || null,
      selo: p.selo || null,
      thumb: p.thumb || null,
      tipo_programa: p.tipo_programa || p.tipoPrograma || "Musical",
      tipoPrograma: p.tipo_programa || p.tipoPrograma || "Musical",
    };
  });
};

export default function AgendaPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const { toast } = useToast();
  const [programas, setProgramas] = useState<Programa[]>(() => {
    const syncDb = getStationDatabaseSync(effectiveUserId || "positivafm@positivafm.com.br");
    if (syncDb?.programas && syncDb.programas.length > 0) {
      return normalizeProgs(syncDb.programas);
    }
    return [];
  });
  const [eventos, setEventos] = useState<Evento[]>(() => getStoredAgendaEvents(effectiveUserId || user?.id || "452ebd1e-61a0-42dd-bf80-231a3f426c83"));
  const [now, setNow] = useState(new Date());

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const feriadosNacionais = useMemo(() => getFeriadosNacionaisDoAno(currentYear), [currentYear]);
  const feriadoDates = useMemo(() => feriadosNacionais.map(f => f.date), [feriadosNacionais]);
  const getFeriadoNome = useCallback((date: Date | undefined) => {
    if (!date) return null;
    const f = feriadosNacionais.find(
      h => h.date.getDate() === date.getDate() && h.date.getMonth() === date.getMonth()
    );
    return f ? f.nome : null;
  }, [feriadosNacionais]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [filterLocal, setFilterLocal] = useState<string>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewEventDialogOpen, setViewEventDialogOpen] = useState(false);
  const [viewingEvent, setViewingEvent] = useState<Evento | null>(null);
  const [viewingOccurrenceDate, setViewingOccurrenceDate] = useState<string | null>(null);
  const [deleteChoice, setDeleteChoice] = useState<{ evt: Evento; dateStr: string } | null>(null);
  const [holidayResolve, setHolidayResolve] = useState<{ evt: Evento; dateStr: string; feriadoNome: string } | null>(null);
  const [holidayReplaceProg, setHolidayReplaceProg] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyDateFilter, setHistoryDateFilter] = useState<Date | undefined>(undefined);
  const [pastEventDetail, setPastEventDetail] = useState<Evento | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [pastMonthFilter, setPastMonthFilter] = useState<string>("todos");
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [datasModalOpen, setDatasModalOpen] = useState(false);
  const [pastEventsModalOpen, setPastEventsModalOpen] = useState(false);


  // Form
  const [clientesList, setClientesList] = useState<AgendaCliente[]>(() => getInitialClientesList());
  const [formClienteId, setFormClienteId] = useState<string>("");
  const [formEstudio, setFormEstudio] = useState<string>("");
  const [formProgramaId, setFormProgramaId] = useState("");
  const [formEstudioFilter, setFormEstudioFilter] = useState<string>("todos");
  const [formData, setFormData] = useState<Date | undefined>(undefined);
  const [formLocal, setFormLocal] = useState("");
  const [formDescricao, setFormDescricao] = useState("");
  const [formRecorrencia, setFormRecorrencia] = useState<string>("unico");
  const [formTipoEvento, setFormTipoEvento] = useState<string>("live");
  const [formPrioridade, setFormPrioridade] = useState("normal");
  const [formStatus, setFormStatus] = useState<string>("ativo");
  const [formParticipantes, setFormParticipantes] = useState<Participante[]>([
    { nome: "", instagram: "" },
  ]);
  const [formYoutubeUrl, setFormYoutubeUrl] = useState("");
  const [formArtesUrls, setFormArtesUrls] = useState<string[]>([]);
  const [formYoutubeTitulo, setFormYoutubeTitulo] = useState("");
  const [formYoutubeDescricao, setFormYoutubeDescricao] = useState("");
  const [formEdicaoNotas, setFormEdicaoNotas] = useState("");
  const [formEdicaoConcluida, setFormEdicaoConcluida] = useState(false);
  const [formHorarioGravacao, setFormHorarioGravacao] = useState("");
  const [formHorarioGravacaoFim, setFormHorarioGravacaoFim] = useState("");
  const [formPeriodoInicio, setFormPeriodoInicio] = useState<string>("");
  const [formPeriodoFim, setFormPeriodoFim] = useState<string>("");
  const [periodoDialogOpen, setPeriodoDialogOpen] = useState(false);
  const [pendingRecorrencia, setPendingRecorrencia] = useState<string>("");
  const [formDiasSemana, setFormDiasSemana] = useState<number[]>([1, 2, 3, 4, 5]);

  const toggleDiaSemana = (diaId: number) => {
    setFormDiasSemana((prev) =>
      prev.includes(diaId)
        ? prev.filter((d) => d !== diaId)
        : [...prev, diaId].sort((a, b) => {
            const order = [1, 2, 3, 4, 5, 6, 0];
            return order.indexOf(a) - order.indexOf(b);
          })
    );
  };
  const [uploadingArte, setUploadingArte] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [formTitulo, setFormTitulo] = useState("");
  const [formDiaInteiro, setFormDiaInteiro] = useState(false);
  const [formNotificacaoTempo, setFormNotificacaoTempo] = useState("30");
  const [guestPermModificar, setGuestPermModificar] = useState(false);
  const [guestPermConvidar, setGuestPermConvidar] = useState(true);
  const [guestPermVerLista, setGuestPermVerLista] = useState(true);
  const [eventModalTab, setEventModalTab] = useState<"detalhes" | "materiais" | "edicao">("detalhes");
  const [showVideoInput, setShowVideoInput] = useState(false);
  const [guestSearchInput, setGuestSearchInput] = useState("");
  const [selectedEventColor, setSelectedEventColor] = useState("#0055ff");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [apresentadores, setApresentadores] = useState<Apresentador[]>(() => {
    const syncDb = getStationDatabaseSync(effectiveUserId || user?.id || user?.email || "positivafm@positivafm.com.br");
    const snapshotAps = getSnapshotApresentadores(effectiveUserId || "positivafm@positivafm.com.br") || [];
    const baseList = (syncDb?.apresentadores as Apresentador[]) || [];
    const map = new Map<string, Apresentador>();
    snapshotAps.forEach((a: any) => map.set(a.id, a));
    baseList.forEach((a: any) => {
      const existing = map.get(a.id);
      map.set(a.id, {
        ...a,
        foto: a.foto || a.foto_url || existing?.foto || existing?.foto_url,
        foto_url: a.foto_url || a.foto || existing?.foto_url || existing?.foto
      });
    });
    return Array.from(map.values());
  });
  const [eventTypesConfig, setEventTypesConfig] = useState<any>(null);

  const [loadingData, setLoadingData] = useState(false);
  const [expressOpen, setExpressOpen] = useState(false);
  const [expressEditData, setExpressEditData] = useState<ExpressEditData | null>(null);
  const [creatingRoteiro, setCreatingRoteiro] = useState(false);
  const [roteiroJaExiste, setRoteiroJaExiste] = useState(false);
  const [sendingWhatsAppFor, setSendingWhatsAppFor] = useState<string | null>(null);
  const estudios = Array.from(new Set(programas.map(p => p.estudio).filter(Boolean)));

  const fetchClientes = useCallback(async () => {
    try {
      const storedMeta = getStoredMetadata();
      const [logosRes, empRes] = await Promise.all([
        supabase
          .from("logos_patrocinadores")
          .select("id, user_id, nome, logo_url, ativo")
          .eq("excluido", false)
          .order("nome"),
        supabase
          .from("empresa_config")
          .select("user_id, nome, logo, ativo")
          .order("nome"),
      ]);

      const rawList: AgendaCliente[] = [];

      // 1. DEFAULT_AGENCY_CLIENTS first
      Object.entries(DEFAULT_AGENCY_CLIENTS).forEach(([key, def]) => {
        const display = (def.nome_empresarial || def.razao_social || key).trim().toUpperCase();
        if (!display) return;
        rawList.push({
          id: key,
          nome: display,
          nome_empresarial: display,
          logo_url: (def as any).logo_url || null,
          categoria: (def.categoria || "EMISSORA DE RÁDIO").toUpperCase(),
          email: def.email_cobranca || (def as any).email || "",
          cnpj: def.cnpj || "",
        });
      });

      // 2. logos_patrocinadores
      (logosRes?.data || []).forEach((item: any) => {
        const rawName = (item.nome || "").trim();
        if (!rawName) return;
        const meta = storedMeta[item.id] || storedMeta[rawName] || storedMeta[rawName.toUpperCase()] || {};
        const nomeEmpresarial = (meta.nome_empresarial || "").trim().toUpperCase();
        const nomeFinal = (rawName || "").trim().toUpperCase();
        const display = nomeEmpresarial || nomeFinal;
        const logo = item.logo_url || meta.logo_url || meta.logo || null;
        if (!display) return;
        rawList.push({
          id: item.id,
          user_id: item.user_id,
          nome: nomeFinal,
          nome_empresarial: nomeEmpresarial || nomeFinal,
          logo_url: logo,
          categoria: (meta.categoria || "").toUpperCase(),
          email: meta.email_cobranca || meta.email || (item as any).email || "",
          cnpj: meta.cnpj || "",
        });
      });

      // 3. empresa_config
      (empRes?.data || []).forEach((emp: any) => {
        const rawName = (emp.nome || "").trim();
        if (!rawName) return;
        const meta = storedMeta[emp.user_id] || storedMeta[rawName] || storedMeta[rawName.toUpperCase()] || {};
        const nomeEmpresarial = (meta.nome_empresarial || "").trim().toUpperCase();
        const nomeFinal = rawName.toUpperCase();
        const display = nomeEmpresarial || nomeFinal;
        const logo = emp.logo || meta.logo_url || meta.logo || null;
        if (!display) return;
        rawList.push({
          id: emp.user_id,
          user_id: emp.user_id,
          nome: nomeFinal,
          nome_empresarial: nomeEmpresarial || nomeFinal,
          logo_url: logo,
          categoria: (meta.categoria || "EMISSORA DE RÁDIO").toUpperCase(),
          email: meta.email_cobranca || meta.email || (emp as any).email || "",
          cnpj: meta.cnpj || "",
        });
      });

      // 4. Stored metadata in localStorage
      Object.keys(storedMeta).forEach((key) => {
        const meta = storedMeta[key];
        const candidate = (meta.nome_empresarial || meta.razao_social || (key.startsWith("local_") ? "" : key) || "").trim();
        if (!candidate) return;
        const nomeEmpresarial = (meta.nome_empresarial || candidate).trim().toUpperCase();
        const logo = meta.logo_url || meta.logo || null;
        rawList.push({
          id: key,
          user_id: user?.id,
          nome: candidate.toUpperCase(),
          nome_empresarial: nomeEmpresarial,
          logo_url: logo,
          categoria: (meta.categoria || "").toUpperCase(),
          email: meta.email_cobranca || meta.email || "",
          cnpj: meta.cnpj || "",
        });
      });

      const unified = unifyAgendaClients(rawList);
      setClientesList(unified);
    } catch (err) {
      console.error("Erro ao carregar clientes na agenda:", err);
    }
  }, [user]);

  const selectedClienteObj = useMemo(() => {
    if (!formClienteId) return null;
    return clientesList.find(c => c.id === formClienteId || (c.aliases && c.aliases.includes(formClienteId))) || null;
  }, [clientesList, formClienteId]);

  const isEmissoraRadio = useMemo(() => {
    if (!selectedClienteObj) return false;
    const cat = (selectedClienteObj.categoria || "").trim().toUpperCase();
    if (cat === "EMISSORA DE RÁDIO" || cat === "EMISSORA DE RADIO" || cat.includes("RÁDIO") || cat.includes("RADIO")) return true;
    const name = (selectedClienteObj.nome_empresarial || selectedClienteObj.nome || "").trim().toUpperCase();
    return name.includes("FM") || name.includes("RÁDIO") || name.includes("RADIO");
  }, [selectedClienteObj]);

  const clientHouseMixData = useMemo(() => {
    if (!selectedClienteObj) return { programas: [], estudios: [] };
    return getClientHouseMixProgramsSync(selectedClienteObj, programas);
  }, [selectedClienteObj, programas]);

  const clientProgramas = useMemo(() => {
    return (clientHouseMixData.programas || []) as unknown as Programa[];
  }, [clientHouseMixData]);

  const clientEstudios = useMemo(() => {
    return clientHouseMixData.estudios || [];
  }, [clientHouseMixData]);

  const handleClienteChange = (clienteId: string) => {
    setFormClienteId(clienteId);
    setFormEstudio("");
    setFormProgramaId("");
    const cli = clientesList.find(c => c.id === clienteId);
    if (cli) {
      const baseName = cli.nome_empresarial || cli.nome || "";
      setFormLocal(baseName);
    }
  };

  const availableEstudios = useMemo(() => {
    if (clientEstudios.length > 0) return clientEstudios;
    if (selectedClienteObj && isEmissoraRadio) {
      return [
        "ESTÚDIO FM",
        "ESTÚDIO GRAVAÇÃO & PODCAST",
      ];
    }
    return [];
  }, [clientEstudios, selectedClienteObj, isEmissoraRadio]);

  const availableProgramas = useMemo(() => {
    if (!selectedClienteObj) return [];
    const baseList = clientProgramas.length > 0 ? clientProgramas : [];
    if (!formEstudio || formEstudio === "todos" || formEstudio === "__all__") return baseList;
    const target = formEstudio.trim().toUpperCase();
    const filtered = baseList.filter(p => {
      if (!p.estudio) return false;
      const est = p.estudio.trim().toUpperCase();
      return est === target || est.includes(target) || target.includes(est);
    });
    return filtered;
  }, [selectedClienteObj, clientProgramas, formEstudio]);

  const displayProgramas = useMemo(() => {
    if (availableProgramas && availableProgramas.length > 0) return availableProgramas;
    if (programas && programas.length > 0) return programas;
    const syncDb = getStationDatabaseSync(targetUserId || user?.email || "positivafm@positivafm.com.br");
    if (syncDb?.programas && syncDb.programas.length > 0) {
      return normalizeProgs(syncDb.programas);
    }
    return [];
  }, [availableProgramas, programas, targetUserId, user]);

  const studioOptions = useMemo(() => Array.from(new Set(displayProgramas.map(p => (p.estudio || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [displayProgramas]);
  const filteredDisplayProgramas = useMemo(() => {
    if (!formEstudioFilter || formEstudioFilter === "todos") return displayProgramas;
    return displayProgramas.filter(p => (p.estudio || "").trim().toLocaleLowerCase("pt-BR") === formEstudioFilter.trim().toLocaleLowerCase("pt-BR"));
  }, [displayProgramas, formEstudioFilter]);

  const selectedProgPresenters = useMemo(() => {
    if (!formProgramaId) return [];
    const prog = displayProgramas.find(p => p.id === formProgramaId);
    if (!prog) return [];

    const syncAps = ((getStationDatabaseSync(targetUserId || user?.email || "positivafm@positivafm.com.br")?.apresentadores as Apresentador[]) || []);
    const snapshotAps = ((getSnapshotApresentadores(targetUserId || user?.email || "positivafm@positivafm.com.br") as Apresentador[]) || []);

    const allPresentersMap = new Map<string, Apresentador>();
    snapshotAps.forEach(a => allPresentersMap.set(a.id, a));
    syncAps.forEach(a => {
      const ex = allPresentersMap.get(a.id);
      allPresentersMap.set(a.id, { ...a, foto: a.foto || a.foto_url || ex?.foto || ex?.foto_url, foto_url: a.foto_url || a.foto || ex?.foto_url || ex?.foto });
    });
    apresentadores.forEach(a => {
      const ex = allPresentersMap.get(a.id);
      allPresentersMap.set(a.id, { ...a, foto: a.foto || a.foto_url || ex?.foto || ex?.foto_url, foto_url: a.foto_url || a.foto || ex?.foto_url || ex?.foto });
    });

    const allPresenters = Array.from(allPresentersMap.values());
    const matched: Apresentador[] = [];
    const matchedIds = new Set<string>();

    const progIds = [
      ...(prog.apresentadores_ids || []),
      ...(prog.apresentadoresIds || []),
      ...(prog.apresentador_id ? [prog.apresentador_id] : []),
      ...(prog.apresentadorId ? [prog.apresentadorId] : []),
    ].filter(Boolean);

    progIds.forEach(id => {
      const found = allPresenters.find(a => a.id === id);
      if (found && !matchedIds.has(found.id)) {
        matchedIds.add(found.id);
        matched.push(found);
      }
    });

    if (matched.length === 0) {
      allPresenters.forEach(a => {
        if (!a.nome) return;
        const pNome = prog.nome.toLowerCase();
        const aNome = a.nome.toLowerCase();
        if (pNome.includes(aNome) || aNome.includes(pNome)) {
          if (!matchedIds.has(a.id)) {
            matchedIds.add(a.id);
            matched.push(a);
          }
        }
      });
    }

    return matched;
  }, [formProgramaId, displayProgramas, apresentadores, targetUserId, user]);

  const fetchProgramas = useCallback(async () => {
    try {
      let query = supabase.from("programas").select("*").order("horario_inicio");
      if (targetUserId) {
        query = query.eq("user_id", targetUserId);
      }
      const { data } = await query;
      let progs = (data as Programa[]) || [];
      if (progs.length === 0) {
        const syncDb = getStationDatabaseSync(targetUserId || user?.email || "positivafm@positivafm.com.br");
        if (syncDb?.programas && syncDb.programas.length > 0) {
          progs = normalizeProgs(syncDb.programas);
        }
      }
      setProgramas(progs);
      return progs;
    } catch (err) {
      console.error("Erro ao buscar programas:", err);
      const syncDb = getStationDatabaseSync(targetUserId || user?.email || "positivafm@positivafm.com.br");
      if (syncDb?.programas && syncDb.programas.length > 0) {
        const progs = normalizeProgs(syncDb.programas);
        setProgramas(progs);
        return progs;
      }
      return [];
    }
  }, [targetUserId, user]);

  const fetchApresentadores = useCallback(async () => {
    const syncDb = getStationDatabaseSync(targetUserId || user?.email || "positivafm@positivafm.com.br");
    let baseList = (syncDb?.apresentadores as Apresentador[]) || [];
    if (baseList.length > 0) {
      setApresentadores(baseList);
    }
    if (!targetUserId) return;
    try {
      const { data } = await supabase
        .from("apresentadores")
        .select("id, nome, foto, instagram, cargo, whatsapp")
        .eq("user_id", targetUserId);
      if (data && data.length > 0) {
        const merged = data.map((item: any) => {
          const match = baseList.find(b => b.id === item.id || b.nome?.trim().toLowerCase() === item.nome?.trim().toLowerCase());
          return {
            ...item,
            foto: item.foto || item.foto_url || match?.foto || match?.foto_url || null,
            foto_url: item.foto_url || item.foto || match?.foto_url || match?.foto || null,
          };
        });
        setApresentadores(merged);
      }
    } catch (err) {
      console.warn("Erro ao buscar apresentadores:", err);
    }
  }, [targetUserId, user]);

  const fetchEventos = useCallback(async (progsList?: Programa[]) => {
    const rawProgs = progsList || programas;
    const currentProgs = normalizeProgs(rawProgs);
    const progsById = new Map(currentProgs.map((p) => [p.id, p]));

    if (!targetUserId) {
      setEventos([]);
      return;
    }

    const dayStr = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const winStart = dayStr(-120);
    const winEnd = dayStr(365);

    try {
      const map = new Map<string, Evento>();

      // 1. Preload locally stored events first
      const localStored = getStoredAgendaEvents(targetUserId);
      localStored.forEach((le) => {
        if (le && le.id) {
          const prog = progsById.get(le.programa_id);
          map.set(le.id, {
            ...le,
            horario_gravacao: le.horario_gravacao || prog?.horario_inicio,
            horario_gravacao_fim: le.horario_gravacao_fim || prog?.horario_fim,
            programa: le.programa || prog,
          });
        }
      });

      const { data: evts, error: evtsErr } = await supabase
        .from("agenda_eventos")
        .select("*")
        .eq("user_id", targetUserId)
        // Eventos recorrentes começam no passado e continuam valendo: nunca filtrá-los pela data inicial
        .or(`data.gte.${winStart},and(recorrencia.not.is.null,recorrencia.neq.unico)`)
        .lte("data", winEnd)
        .order("data");

      (evts || []).forEach((e: any) => {
        const prog = progsById.get(e.programa_id);
        const parsedDias = e.dias_semana || (e.recorrencia?.startsWith("dias:")
          ? e.recorrencia.slice(5).split(",").map(Number).filter((n: any) => !isNaN(n))
          : e.recorrencia?.startsWith("programa_semanal:")
          ? e.recorrencia.slice(17).split(",").map(Number).filter((n: any) => !isNaN(n))
          : e.recorrencia === "programa_semanal"
          ? [1, 2, 3, 4, 5]
          : undefined);

        // Extract color
        const rawExc = e.excecoes;
        let dbColor: string | null = null;
        if (Array.isArray(rawExc)) {
          const meta = rawExc.find((x: any) => x && (x.data === "__meta__" || x._type === "meta"));
          if (meta?.cor) dbColor = meta.cor;
        } else if (rawExc && typeof rawExc === "object") {
          if ((rawExc as any).cor) dbColor = (rawExc as any).cor;
        }
        const localColor = getStoredEventColor(e.id) || (e.programa_id ? getStoredEventColor(`prog_${e.programa_id}`) : null);
        const finalEvtColor = localColor || dbColor || (e as any).cor || undefined;

        const existingLocal = map.get(e.id);
        const mergedEvt: Evento = {
          ...existingLocal,
          ...e,
          cor: finalEvtColor,
          dias_semana: parsedDias,
          horario_gravacao: e.horario_gravacao || prog?.horario_inicio || existingLocal?.horario_gravacao,
          horario_gravacao_fim: e.horario_gravacao_fim || prog?.horario_fim || existingLocal?.horario_gravacao_fim,
          prioridade: e.prioridade || existingLocal?.prioridade || "normal",
          programa: prog || existingLocal?.programa,
          participantes: existingLocal?.participantes || [],
        };
        map.set(e.id, mergedEvt);
        saveStoredAgendaEvent(mergedEvt, targetUserId);
      });

      const dbEventIds = (evts || []).map((e: any) => e.id);
      if (!evtsErr) pruneStoredAgendaEvents(targetUserId, dbEventIds);
      const baseEvents = Array.from(map.values()).filter(
        (e) => !!evtsErr || !isUuidId(e.id) || dbEventIds.includes(e.id),
      );
      setEventos(dedupeAgendaEvents(baseEvents));

      if (dbEventIds.length) {
        const { data: parts } = await supabase
          .from("agenda_participantes")
          .select("*")
          .in("evento_id", dbEventIds);

        if (parts && parts.length) {
          const partsByEvent = new Map<string, any[]>();
          for (const p of parts) {
            const arr = partsByEvent.get(p.evento_id) || [];
            arr.push(p);
            partsByEvent.set(p.evento_id, arr);
          }
          setEventos(prev => prev.map(e => ({
            ...e,
            participantes: partsByEvent.get(e.id) || e.participantes || [],
          })));
        }
      }
    } catch (err) {
      console.warn("Erro ao buscar eventos do Supabase, mantendo eventos locais:", err);
      const localStored = getStoredAgendaEvents(targetUserId);
      if (localStored.length > 0) setEventos(localStored);
    }
  }, [user, programas, targetUserId]);

  useEffect(() => {
    let active = true;
    const loadAll = async () => {
      setLoadingData(true);

      const dayStr = (offset: number) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      const winStart = dayStr(-120);
      const winEnd = dayStr(365);

      try {
        if (!targetUserId) {
          if (!active) return;
          setEventos([]);
          setLoadingData(false);
          fetchClientes();
          return;
        }

        // Não transformar uma consulta lenta em lista vazia: isso fazia eventos
        // existentes parecerem ausentes e podia limpar registros locais válidos.
        const [empRes, progsRes, evtsRes, profileRes] = await Promise.all([
          supabase.from("empresa_config").select("timezone").eq("user_id", targetUserId).maybeSingle(),
          supabase.from("programas").select("*").eq("user_id", targetUserId).order("horario_inicio"),
          // Eventos recorrentes podem ter começado há mais de 120 dias e continuam ativos.
          supabase.from("agenda_eventos").select("*").eq("user_id", targetUserId)
            .or("data.gte." + winStart + ",and(recorrencia.not.is.null,recorrencia.neq.unico)")
            .lte("data", winEnd).order("data"),
          supabase.from("profiles").select("event_types_config").eq("user_id", targetUserId).maybeSingle(),
        ]);

        // Falha no backend não significa que não existem eventos: preserve o cache.
        if (evtsRes?.error) {
          console.error("Falha ao carregar eventos da agenda:", evtsRes.error.message);
          throw evtsRes.error;
        }

        if (!active) return;

        if (empRes?.data?.timezone && user) {
          (user as any).timezone = empRes.data.timezone;
        }
        let rawProgs = (progsRes?.data as any[]) || [];
        if (rawProgs.length === 0) {
          try {
            const fallbackP = await getProgramas(targetUserId, user?.email);
            if (fallbackP && fallbackP.length > 0) {
              rawProgs = fallbackP as any[];
            }
          } catch {}
        }
        if (rawProgs.length === 0) {
          const syncDb = getStationDatabaseSync(targetUserId || user?.email);
          if (syncDb?.programas && syncDb.programas.length > 0) {
            rawProgs = syncDb.programas as any[];
          }
        }
        const progs = normalizeProgs(rawProgs);
        setProgramas(progs);

        if (profileRes?.data?.event_types_config) {
          setEventTypesConfig(profileRes.data.event_types_config);
        }

        const progsById = new Map(progs.map((p) => [p.id, p]));
        const evts = evtsRes?.data || [];

        const map = new Map<string, Evento>();

        // 1. Preload locally stored events first
        const localStored = getStoredAgendaEvents(targetUserId);
        localStored.forEach((le) => {
          if (le && le.id) {
            const prog = progsById.get(le.programa_id);
            map.set(le.id, {
              ...le,
              horario_gravacao: le.horario_gravacao || prog?.horario_inicio,
              horario_gravacao_fim: le.horario_gravacao_fim || prog?.horario_fim,
              programa: le.programa || prog,
            });
          }
        });

        // 2. Overlay online Supabase events
        evts.forEach((e: any) => {
          const prog = progsById.get(e.programa_id);
          const parsedDias = e.dias_semana || (e.recorrencia?.startsWith("dias:")
            ? e.recorrencia.slice(5).split(",").map(Number).filter((n: any) => !isNaN(n))
            : e.recorrencia?.startsWith("programa_semanal:")
            ? e.recorrencia.slice(17).split(",").map(Number).filter((n: any) => !isNaN(n))
            : e.recorrencia === "programa_semanal"
            ? [1, 2, 3, 4, 5]
            : undefined);

          // Extract color
          const rawExc = e.excecoes;
          let dbColor: string | null = null;
          if (Array.isArray(rawExc)) {
            const meta = rawExc.find((x: any) => x && (x.data === "__meta__" || x._type === "meta"));
            if (meta?.cor) dbColor = meta.cor;
          } else if (rawExc && typeof rawExc === "object") {
            if ((rawExc as any).cor) dbColor = (rawExc as any).cor;
          }
          const localColor = getStoredEventColor(e.id) || (e.programa_id ? getStoredEventColor(`prog_${e.programa_id}`) : null);
          const finalEvtColor = localColor || dbColor || (e as any).cor || null;

          const existingLocal = map.get(e.id);
          const mergedEvt: Evento = {
            ...existingLocal,
            ...e,
            cor: finalEvtColor || undefined,
            dias_semana: parsedDias,
            horario_gravacao: e.horario_gravacao || prog?.horario_inicio || existingLocal?.horario_gravacao,
            horario_gravacao_fim: e.horario_gravacao_fim || prog?.horario_fim || existingLocal?.horario_gravacao_fim,
            prioridade: e.prioridade || existingLocal?.prioridade || "normal",
            programa: prog || existingLocal?.programa,
            participantes: existingLocal?.participantes || [],
          };
          map.set(e.id, mergedEvt);
          saveStoredAgendaEvent(mergedEvt, targetUserId);
        });

        const dbIdsNow = evts.map((e: any) => e.id);
        // A consulta de eventos foi validada acima; só então o banco é fonte segura
        // para remover do cache IDs que não existem mais.
        pruneStoredAgendaEvents(targetUserId, dbIdsNow);
        const baseEvents: Evento[] = Array.from(map.values()).filter(
          (e) => !isUuidId(e.id) || dbIdsNow.includes(e.id),
        );
        setEventos(dedupeAgendaEvents(baseEvents));
        setLoadingData(false);

        // Fetch presenters and clients in background for form pickers
        fetchApresentadores();
        fetchClientes();

        // Background enrichment: participants
        const eventIds = evts.map((e: any) => e.id);
        if (eventIds.length > 0) {
          const { data: parts } = await supabase
            .from("agenda_participantes")
            .select("*")
            .in("evento_id", eventIds);

          if (!active || !parts || !parts.length) return;

          const partsByEvent = new Map<string, any[]>();
          for (const p of parts) {
            const arr = partsByEvent.get(p.evento_id) || [];
            arr.push(p);
            partsByEvent.set(p.evento_id, arr);
          }
          setEventos((prev) =>
            prev.map((e) => ({
              ...e,
              participantes: partsByEvent.get(e.id) || e.participantes || [],
            }))
          );
        }
      } catch (err) {
        console.error("Erro ao carregar dados da agenda, mantendo eventos locais:", err);
        const localStored = getStoredAgendaEvents(targetUserId);
        if (localStored.length > 0) setEventos(localStored);
        setLoadingData(false);
      } finally {
        if (active) setLoadingData(false);
      }
    };

    loadAll();
    return () => {
      active = false;
    };
  }, [user, targetUserId, fetchApresentadores, fetchClientes]);

  // Focus event coming from dashboard agenda widget click
  useEffect(() => {
    if (loadingData || eventos.length === 0) return;
    try {
      const raw = sessionStorage.getItem("agenda_focus_event");
      if (!raw) return;
      sessionStorage.removeItem("agenda_focus_event");
      const { id, data } = JSON.parse(raw) as { id: string; data: string };
      if (data) setSelectedDate(new Date(data + "T12:00:00"));
      const evt = eventos.find(e => e.id === id);
      if (evt) startEdit(evt);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingData, eventos]);

  // Auto-open "Novo Evento" dialog when triggered from dashboard widget
  useEffect(() => {
    if (loadingData) return;
    try {
      if (sessionStorage.getItem("agenda_open_new") === "1") {
        sessionStorage.removeItem("agenda_open_new");
        openNewDialog();
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingData]);

  // Auto-include program presenters as mandatory participants for live events
  useEffect(() => {
    if (formTipoEvento !== "live" || !formProgramaId) return;
    const prog = programas.find(p => p.id === formProgramaId);
    if (!prog) return;
    const presenterIds: string[] = [
      ...(prog.apresentadores_ids || []),
      ...(prog.apresentador_id ? [prog.apresentador_id] : []),
    ];
    const uniquePresenters = apresentadores.filter(a => presenterIds.includes(a.id));
    if (!uniquePresenters.length) return;
    setFormParticipantes(prev => {
      const manual = prev.filter(p => !p.obrigatorio && p.nome.trim());
      const required = uniquePresenters.map(a => ({
        nome: a.nome,
        instagram: a.instagram || "",
        obrigatorio: true,
      }));
      // Avoid duplicates by name
      const filteredManual = manual.filter(m => !required.some(r => r.nome.toLowerCase() === m.nome.toLowerCase()));
      const merged = [...required, ...filteredManual];
      return merged.length ? merged : [{ nome: "", instagram: "" }];
    });
  }, [formProgramaId, formTipoEvento, programas, apresentadores]);

  // Sincroniza o local com o estúdio do programa selecionado
  useEffect(() => {
    if (formProgramaId) {
      const prog = programas.find(p => p.id === formProgramaId);
      if (prog?.estudio) {
        setFormLocal(prog.estudio);
      }
    }
  }, [formProgramaId, programas]);

  // Detecta se já existe roteiro para o programa+data selecionado
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!user || !formProgramaId || !formData) {
        setRoteiroJaExiste(false);
        return;
      }
      const prog = programas.find(p => p.id === formProgramaId);
      if (!prog) { setRoteiroJaExiste(false); return; }
      const dataPrograma = format(formData, "yyyy-MM-dd");
      const { data } = await supabase
        .from("roteiros")
        .select("id")
        .eq("user_id", user.id)
        .eq("programa_nome", prog.nome)
        .eq("data_programa", dataPrograma)
        .maybeSingle();
      if (!cancelled) setRoteiroJaExiste(!!data?.id);
    };
    check();
    return () => { cancelled = true; };
  }, [user, formProgramaId, formData, programas, dialogOpen]);

  const addParticipante = () => {
    setFormParticipantes([...formParticipantes, { nome: "", instagram: "" }]);
  };

  const removeParticipante = (idx: number) => {
    const p = formParticipantes[idx];
    if (p?.obrigatorio) {
      toast({ title: "Apresentador obrigatório", description: "Não é possível remover apresentadores do programa.", variant: "destructive" });
      return;
    }
    setFormParticipantes(formParticipantes.filter((_, i) => i !== idx));
  };

  const updateParticipante = (idx: number, field: keyof Participante, value: string) => {
    const updated = [...formParticipantes];
    updated[idx] = { ...updated[idx], [field]: value };
    setFormParticipantes(updated);
  };

  const handleUploadArte = async (file: File, slotIdx?: number) => {
    if (!user) return;
    setUploadingArte(true);
    try {
      const reader = new FileReader();
      const dataUrl: string = await new Promise((res, rej) => {
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const path = `agenda/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.webp`;
      const account = findClientAccountById(user.id) || findClientAccountByEmail(user.email);
      const url = await uploadImageToStorage(dataUrl, "empresa-assets", path, 1920, 0.82, { slug: account?.slug || "", hint: "banners agenda" });
      setFormArtesUrls(prev => {
        if (typeof slotIdx === "number") {
          const next = [...prev];
          while (next.length <= slotIdx) next.push("");
          next[slotIdx] = url;
          return next;
        }
        return [...prev, url];
      });
    } catch (e: any) {
      toast({ title: "Erro no upload", description: e?.message, variant: "destructive" });
    } finally {
      setUploadingArte(false);
    }
  };

  const removeArte = (idx: number) => {
    setFormArtesUrls(prev => {
      const next = [...prev];
      if (idx < next.length) next[idx] = "";
      return next;
    });
  };

  const resetForm = () => {
    setFormTitulo("");
    setFormDiaInteiro(false);
    setFormDiasSemana([1, 2, 3, 4, 5]);
    setFormClienteId("");
    setFormEstudio("");
    setFormProgramaId("");
    setFormEstudioFilter("todos");
    setFormData(undefined);
    setFormLocal("");
    setFormDescricao("");
    setFormRecorrencia("unico");
    setFormTipoEvento("live");
    setFormPrioridade("normal");
    setFormStatus("ativo");
    setFormParticipantes([]);
    setFormYoutubeUrl("");
    setFormArtesUrls([]);
    setFormYoutubeTitulo("");
    setFormYoutubeDescricao("");
    setFormEdicaoNotas("");
    setFormEdicaoConcluida(false);
    setFormHorarioGravacao("10:00");
    setFormHorarioGravacaoFim("11:00");
    setFormPeriodoInicio("");
    setFormPeriodoFim("");
    setEditingId(null);
    setEventModalTab("detalhes");
    setShowVideoInput(false);
    setGuestSearchInput("");
    setSelectedEventColor("#0055ff");
  };

  const handleRecorrenciaChange = (value: string) => {
    setFormRecorrencia(value);
    if (value !== "unico") {
      const base = formData ?? selectedDate ?? new Date();
      const start = format(base, "yyyy-MM-dd");
      // padrão: 3 meses à frente
      const end = new Date(base);
      end.setMonth(end.getMonth() + 3);
      setFormPeriodoInicio(formPeriodoInicio || start);
      setFormPeriodoFim(formPeriodoFim || format(end, "yyyy-MM-dd"));
      setPendingRecorrencia(value);
      setPeriodoDialogOpen(true);
    } else {
      setFormPeriodoInicio("");
      setFormPeriodoFim("");
    }
  };

  const openNewDialog = () => {
    resetForm();
    const baseDate = selectedDate ?? new Date();
    setFormData(baseDate);
    setFormHorarioGravacao("10:00");
    setFormHorarioGravacaoFim("11:00");
    setFormDiasSemana([1, 2, 3, 4, 5]);
    setFormClienteId("");
    setFormEstudio("");
    setFormProgramaId("");
    setDialogOpen(true);
  };

  const startEdit = useCallback((evt: Evento, occurrenceDateStr?: string) => {
    setEditingId(evt.id);
    const targetDateStr = occurrenceDateStr || evt.data;
    setFormData(targetDateStr ? new Date(targetDateStr + "T12:00:00") : new Date());
    setFormTitulo(evt.youtube_titulo || evt.programa?.nome || evt.descricao || "");
    const linkedProgram = displayProgramas.find(p => String(p.id) === String(evt.programa_id));
    const linkedStudio = evt.programa?.estudio || linkedProgram?.estudio || "";
    setFormProgramaId(evt.programa_id ? String(evt.programa_id) : "");
    setFormEstudioFilter(linkedStudio || "todos");
    setFormEstudio(linkedStudio);
    if (linkedProgram) {
      setFormHorarioGravacao(linkedProgram.horario_inicio?.slice(0, 5) || evt.horario_gravacao || "10:00");
      setFormHorarioGravacaoFim(linkedProgram.horario_fim?.slice(0, 5) || evt.horario_gravacao_fim || "11:00");
    }
    setFormLocal(evt.local || "");
    setFormDescricao(evt.descricao || "");

    const rec = evt.recorrencia || "unico";
    if (rec.startsWith("programa_semanal") || rec.startsWith("dias:")) {
      setFormRecorrencia("programa_semanal");
      if (evt.dias_semana && Array.isArray(evt.dias_semana) && evt.dias_semana.length > 0) {
        setFormDiasSemana(evt.dias_semana);
      } else if (rec.startsWith("programa_semanal:")) {
        setFormDiasSemana(rec.slice(17).split(",").map(Number).filter(n => !isNaN(n)));
      } else if (rec.startsWith("dias:")) {
        setFormDiasSemana(rec.slice(5).split(",").map(Number).filter(n => !isNaN(n)));
      } else {
        setFormDiasSemana([1, 2, 3, 4, 5]);
      }
    } else {
      setFormRecorrencia(rec);
      setFormDiasSemana([1, 2, 3, 4, 5]);
    }

    setFormTipoEvento(evt.tipo_evento || "live");
    setFormPrioridade(evt.prioridade || "normal");
    setFormStatus(evt.status || "ativo");
    setFormYoutubeUrl(evt.youtube_url || "");
    setFormArtesUrls(evt.artes_urls || []);
    setFormYoutubeTitulo(evt.youtube_titulo || "");
    setFormYoutubeDescricao(evt.youtube_descricao || "");
    setFormEdicaoNotas(evt.edicao_notas || "");
    setFormEdicaoConcluida(!!evt.edicao_concluida);
    setFormHorarioGravacao(evt.horario_gravacao || "10:00");
    setFormHorarioGravacaoFim(evt.horario_gravacao_fim || "11:00");
    setFormDiaInteiro(false);
    setFormPeriodoInicio(((evt as any).periodo_inicio as string) || "");
    setFormPeriodoFim(((evt as any).periodo_fim as string) || "");
    setFormParticipantes(
      evt.participantes && evt.participantes.length > 0
        ? evt.participantes.map(p => ({ id: p.id, nome: p.nome, instagram: p.instagram }))
        : []
    );
    setShowVideoInput(!!evt.youtube_url);
    setEventModalTab("detalhes");

    // Vincula o cliente do evento
    let matchedClient = clientesList.find(c => c.user_id === evt.programa?.user_id || c.id === evt.programa?.user_id);
    if (!matchedClient && evt.local) {
      matchedClient = clientesList.find(c =>
        evt.local!.toUpperCase().includes(c.nome_empresarial.toUpperCase()) ||
        evt.local!.toUpperCase().includes(c.nome.toUpperCase())
      );
    }
    if (!matchedClient && (evt as any).user_id) {
      matchedClient = clientesList.find(c => c.id === (evt as any).user_id || c.user_id === (evt as any).user_id);
    }
    if (matchedClient) {
      setFormClienteId(matchedClient.id);
    }
    setFormEstudio(evt.programa?.estudio || "");
    const currentEventColor = evt.cor || getStoredEventColor(evt.id) || (evt.programa_id ? getStoredEventColor(`prog_${evt.programa_id}`) : null) || "#0055ff";
    setSelectedEventColor(currentEventColor);
    setDialogOpen(true);
  }, [clientesList]);

  const handleSave = async () => {
    const eventDate = formData ?? selectedDate ?? new Date();
    if ((!user && !targetUserId) || savingEvent) return;

    setSavingEvent(true);
    try {
      const finalProgId = formProgramaId || null;
      const validProgId = finalProgId && isUuid(finalProgId) ? finalProgId : null;
      const selectedProg = clientProgramas.find(p => p.id === finalProgId) || programas.find(p => p.id === finalProgId);
      const finalTitulo = formTitulo.trim() || (selectedProg?.nome ?? (formLocal ? `Evento - ${formLocal}` : "Novo Evento"));
      const finalDescricao = formDescricao.trim() || finalTitulo;

      const selectedCli = clientesList.find(c => c.id === formClienteId);
      const cliDisplayName = selectedCli?.nome_empresarial || selectedCli?.nome || "";
      const finalLocal = formEstudio && formEstudio !== "todos" && formEstudio !== "__all__"
        ? (cliDisplayName ? `${cliDisplayName} - ${formEstudio}` : formEstudio)
        : (cliDisplayName || formLocal);

      const validParts = formParticipantes.filter((p) => p.nome.trim());
      const finalEventId = editingId || `evt_local_${Date.now()}`;

      const isCustomDays = formRecorrencia === "programa_semanal" && (
        formDiasSemana.length !== 5 || ![1, 2, 3, 4, 5].every((d) => formDiasSemana.includes(d))
      );
      const finalRecorrencia = formRecorrencia === "programa_semanal"
        ? (isCustomDays ? `dias:${formDiasSemana.join(",")}` : "programa_semanal")
        : formRecorrencia;

      const baseEventData: Evento = {
        id: finalEventId,
        user_id: targetUserId || user?.id || "local",
        programa_id: validProgId || undefined,
        data: format(eventDate, "yyyy-MM-dd"),
        local: finalLocal,
        descricao: finalDescricao,
        recorrencia: finalRecorrencia,
        dias_semana: formRecorrencia === "programa_semanal" ? formDiasSemana : undefined,
        prioridade: formPrioridade,
        status: formStatus,
        tipo_evento: formTipoEvento,
        cor: selectedEventColor,
        youtube_url: formYoutubeUrl || undefined,
        artes_urls: formArtesUrls || [],
        youtube_titulo: finalTitulo.slice(0, 100),
        youtube_descricao: formYoutubeDescricao || finalDescricao,
        edicao_notas: formEdicaoNotas || "",
        edicao_concluida: formEdicaoConcluida,
        horario_gravacao: formDiaInteiro ? undefined : (formHorarioGravacao || undefined),
        horario_gravacao_fim: formDiaInteiro ? undefined : (formHorarioGravacaoFim || undefined),
        periodo_inicio: formRecorrencia !== "unico" ? (formPeriodoInicio || null) : null,
        periodo_fim: formRecorrencia !== "unico" ? (formPeriodoFim || null) : null,
        programa: selectedProg,
        participantes: validParts.map((p, idx) => ({ id: p.id || `part_${Date.now()}_${idx}`, nome: p.nome, instagram: p.instagram })),
      };

      // O cache só é atualizado depois da confirmação do Supabase.
      try {
        const existingEvent = editingId ? eventos.find(e => e.id === editingId) : null;
        const existingExcecoes = (Array.isArray(existingEvent?.excecoes) ? existingEvent.excecoes : []).filter((x: any) => x && x.data !== "__meta__");
        const finalPayloadExcecoes = [
          ...existingExcecoes,
          { data: "__meta__", acao: "manter", cor: selectedEventColor }
        ];

        const payload = {
          user_id: targetUserId || user?.id,
          programa_id: validProgId,
          data: format(eventDate, "yyyy-MM-dd"),
          local: finalLocal,
          descricao: finalDescricao,
          recorrencia: finalRecorrencia,
          prioridade: formPrioridade,
          status: formStatus,
          tipo_evento: formTipoEvento,
          excecoes: finalPayloadExcecoes,
          youtube_url: formYoutubeUrl || null,
          artes_urls: formArtesUrls || [],
          youtube_titulo: finalTitulo.slice(0, 100),
          youtube_descricao: formYoutubeDescricao || finalDescricao,
          edicao_notas: formEdicaoNotas || "",
          edicao_concluida: formEdicaoConcluida,
          horario_gravacao: formDiaInteiro ? null : (formHorarioGravacao || null),
          horario_gravacao_fim: formDiaInteiro ? null : (formHorarioGravacaoFim || null),
          periodo_inicio: formRecorrencia !== "unico" ? (formPeriodoInicio || null) : null,
          periodo_fim: formRecorrencia !== "unico" ? (formPeriodoFim || null) : null,
        } as any;

        if (editingId) {
          saveStoredEventColor(editingId, selectedEventColor);
          const { data: updRows, error: updErr } = await supabase.from("agenda_eventos").update(payload).eq("id", editingId).select("id");
          if (updErr || !updRows?.length) throw updErr || new Error("Nenhum registro foi atualizado (sessão expirada ou sem permissão)");
          const { error: deletePartsError } = await supabase.from("agenda_participantes")
            .delete().eq("evento_id", editingId).eq("user_id", targetUserId || user?.id);
          if (deletePartsError) throw deletePartsError;
          if (validParts.length) {
            const { error: insertPartsError } = await supabase.from("agenda_participantes").insert(
              validParts.map((p) => ({
                evento_id: editingId,
                user_id: targetUserId || user?.id,
                nome: p.nome,
                instagram: p.instagram,
              }))
            );
            if (insertPartsError) throw insertPartsError;
          }
          saveStoredAgendaEvent(baseEventData, targetUserId);
          saveStoredEventColor(editingId, selectedEventColor);
          if (validProgId) saveStoredEventColor(`prog_${validProgId}`, selectedEventColor);
          setEventos(prev => [baseEventData, ...prev.filter(e => e.id !== editingId)]);
        } else {
          const { data: evt, error } = await supabase
            .from("agenda_eventos")
            .insert(payload)
            .select()
            .single();

          if (error || !evt) throw error || new Error("O banco não confirmou a gravação do evento");
          {
            deleteStoredAgendaEvent(finalEventId, targetUserId);
            saveStoredEventColor(evt.id, selectedEventColor);
            const syncedEvent: Evento = {
              ...baseEventData,
              id: evt.id,
              cor: selectedEventColor,
            };
            saveStoredAgendaEvent(syncedEvent, targetUserId);
            setEventos(prev => {
              const filtered = prev.filter(e => e.id !== finalEventId && e.id !== evt.id);
              return [syncedEvent, ...filtered];
            });

            if (validParts.length) {
              const { error: insertPartsError } = await supabase.from("agenda_participantes").insert(
                validParts.map((p) => ({
                  evento_id: evt.id,
                  user_id: targetUserId || user?.id,
                  nome: p.nome,
                  instagram: p.instagram,
                }))
              );
              if (insertPartsError) {
                // Roll back the just-created event so the UI never reports a complete
                // save while its required participant records are missing.
                const { error: rollbackError } = await supabase.from("agenda_eventos")
                  .delete().eq("id", evt.id).eq("user_id", targetUserId || user?.id);
                if (rollbackError) {
                  console.error("[Agenda] Falha ao reverter evento sem participantes:", rollbackError);
                }
                throw new Error(
                  rollbackError
                    ? `Não foi possível vincular os participantes (${insertPartsError.message}) nem reverter o evento (${rollbackError.message}).`
                    : `Não foi possível vincular os participantes. O evento foi revertido: ${insertPartsError.message}`
                );
              }
            }
          }
        }
      } catch (err: any) {
        console.error("[Agenda] Falha ao gravar evento:", err);
        toast({ title: "Evento NÃO foi salvo", description: err?.message || "Falha ao gravar no servidor. Tente novamente.", variant: "destructive" });
        return;
      }

      try {
        window.dispatchEvent(new CustomEvent("nexohub:agenda-updated", { detail: { eventId: finalEventId } }));
      } catch {}

      toast({ title: editingId ? "Evento atualizado com sucesso!" : "Evento criado com sucesso!" });
      resetForm();
      setDialogOpen(false);
    } catch (err: any) {
      console.error("Erro geral ao salvar evento:", err);
      toast({
        title: "Erro ao salvar",
        description: err?.message || "Ocorreu um erro ao salvar o evento.",
        variant: "destructive",
      });
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDelete = async (id: string): Promise<boolean> => {
    const ownerId = targetUserId || user?.id;
    const isLocalOnly = !isUuidId(id);
    if (!isLocalOnly && !ownerId) {
      toast({ title: "Não foi possível identificar a emissora", variant: "destructive" });
      return false;
    }

    try {
      if (!isLocalOnly) {
        const { error: participantError } = await supabase
          .from("agenda_participantes")
          .delete()
          .eq("evento_id", id)
          .eq("user_id", ownerId);
        if (participantError) throw participantError;

        const { data, error } = await supabase
          .from("agenda_eventos")
          .delete()
          .eq("id", id)
          .eq("user_id", ownerId)
          .select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("O banco não confirmou a exclusão. Verifique a sessão e as permissões da emissora.");
      }

      deleteStoredAgendaEvent(id, ownerId);
      setEventos(prev => prev.filter(e => e.id !== id));
      try {
        window.dispatchEvent(new CustomEvent("nexohub:agenda-updated", { detail: { eventId: id } }));
      } catch {}
      await fetchEventos();
      return true;
    } catch (err: any) {
      console.error("[Agenda] Falha ao excluir evento:", err);
      toast({ title: "Evento não foi excluído", description: err?.message || "Falha ao excluir no servidor.", variant: "destructive" });
      return false;
    }
  };

  // Adiciona uma exceção (skip/substituir/automatico/manter) numa ocorrência específica
  const upsertExcecao = async (evt: Evento, exc: EventoExcecao) => {
    const ownerId = targetUserId || user?.id;
    if (!ownerId) {
      toast({ title: "Não foi possível identificar a emissora", variant: "destructive" });
      return false;
    }
    const current: EventoExcecao[] = Array.isArray(evt.excecoes) ? [...evt.excecoes] : [];
    const idx = current.findIndex(x => x && x.data === exc.data);
    if (idx >= 0) current[idx] = exc; else current.push(exc);
    const updatedEvt: Evento = { ...evt, excecoes: current };
    try {
      const { data, error } = await supabase
        .from("agenda_eventos")
        .update({ excecoes: current as any })
        .eq("id", evt.id)
        .eq("user_id", ownerId)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("O banco não confirmou a alteração desta ocorrência.");
      saveStoredAgendaEvent(updatedEvt, ownerId);
      setEventos(prev => prev.map(e => e.id === evt.id ? updatedEvt : e));
      try {
        window.dispatchEvent(new CustomEvent("nexohub:agenda-updated", { detail: { eventId: evt.id } }));
      } catch {}
      await fetchEventos();
      return true;
    } catch (err: any) {
      console.error("[Agenda] Falha ao salvar exceção:", err);
      toast({ title: "Alteração da ocorrência não foi salva", description: err?.message || "Falha ao atualizar no servidor.", variant: "destructive" });
      return false;
    }
  };

  // Solicita a exclusão — se recorrente, abre diálogo de escolha; se único, confirmação direta
  const requestDelete = async (evt: Evento, occurrenceDateStr?: string) => {
    const isRecorrente = Boolean(evt.recorrencia && evt.recorrencia !== "unico");
    const dateStr = occurrenceDateStr || evt.data || format(selectedDate || now, "yyyy-MM-dd");
    if (!isRecorrente) {
      const formattedDate = format(new Date(dateStr + "T12:00:00"), "dd/MM/yyyy");
      const eventName = evt.youtube_titulo || evt.programa?.nome || evt.descricao || "este evento";
      const confirmed = await confirmDialog({
        title: "Excluir Evento",
        message: `Deseja realmente excluir "${eventName}" do dia ${formattedDate}?`,
        confirmLabel: "Excluir",
        cancelLabel: "Cancelar",
        destructive: true,
        icon: "trash",
      });
      if (confirmed && await handleDelete(evt.id)) {
        toast({ title: "Evento excluído com sucesso" });
      }
      return;
    }
    setDeleteChoice({ evt, dateStr });
  };


  const handleCreateRoteiroFromEvento = async () => {
    if (!user || !formProgramaId || !formData) {
      toast({ title: "Selecione programa e data", variant: "destructive" });
      return;
    }
    const prog = programas.find(p => p.id === formProgramaId);
    if (!prog) return;
    setCreatingRoteiro(true);
    try {
      const tituloRoteiro = (formDescricao || prog.nome).trim().slice(0, 200);
      const dataPrograma = format(formData, "yyyy-MM-dd");

      // Try to find existing roteiro for same program+date
      const { data: existing } = await supabase
        .from("roteiros")
        .select("id")
        .eq("user_id", user.id)
        .eq("programa_nome", prog.nome)
        .eq("data_programa", dataPrograma)
        .maybeSingle();

      let roteiroId = existing?.id;

      if (!roteiroId) {
        const { data: novo, error } = await supabase
          .from("roteiros")
          .insert({
            user_id: user.id,
            titulo: tituloRoteiro,
            subtitulo: "",
            programa_nome: prog.nome,
            estudio: prog.estudio || "",
            data_programa: dataPrograma,
            horario: prog.horario_inicio || "00:00",
            tipo_programa: "podcast",
            conteudo_html: "",
            participantes: formParticipantes
              .filter(p => p.nome.trim())
              .map(p => ({ nome: p.nome, cargo: "", instagram: p.instagram || "" })) as any,
          })
          .select("id")
          .single();
        if (error || !novo) {
          toast({ title: "Erro ao criar roteiro", description: error?.message, variant: "destructive" });
          setCreatingRoteiro(false);
          return;
        }
        roteiroId = novo.id;
      }

      const isPodcastEstudio = (prog.estudio || "").toLowerCase() === "podcast";
      setExpressEditData({
        roteiroId: roteiroId!,
        estudio: prog.estudio || "",
        programaId: prog.id,
        blocos: [{ noticias: [] }],
        participantes: formParticipantes
          .filter(p => p.nome.trim())
          .map(p => ({ nome: p.nome, cargo: "", instagram: p.instagram || "" })),
        agendaEventoId: editingId || undefined,
        podcastData: isPodcastEstudio ? {
          tituloTarja: "",
          subtituloTarja: "",
          introducao: "",
          agendamentoData: dataPrograma,
          agendamentoHorario: formHorarioGravacao || "",
          perguntas: [""],
          concluindo: "",
          apoioImagens: [""],
          apoioVideos: [""],
        } : undefined,
      });
      setExpressOpen(true);
    } finally {
      setCreatingRoteiro(false);
    }
  };

  const handleExportFeriados = () => {
    if (!feriadosNacionais || feriadosNacionais.length === 0) {
      toast({ title: "Nenhum feriado para exportar", variant: "destructive" });
      return;
    }

    // Gerar conteúdo ICS
    let icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//NexoHub//Agenda//BR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ].join("\r\n");

    feriadosNacionais.forEach(f => {
      const date = f.date;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      // Data formato AAAAMMDD para evento de dia inteiro
      const dateStr = `${year}${month}${day}`;
      
      icsContent += "\r\n" + [
        "BEGIN:VEVENT",
        `UID:feriado-${dateStr}@nexohub.com`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
        `DTSTART;VALUE=DATE:${dateStr}`,
        `DTEND;VALUE=DATE:${year}${month}${String(date.getDate() + 1).padStart(2, '0')}`,
        `SUMMARY:Feriado: ${f.nome}`,
        "DESCRIPTION:Feriado Nacional Brasileiro",
        "STATUS:CONFIRMED",
        "TRANSP:TRANSPARENT",
        "END:VEVENT"
      ].join("\r\n");
    });

    icsContent += "\r\nEND:VCALENDAR";

    // Criar blob e link para download
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `feriados_nacionais_${now.getFullYear()}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({ 
      title: "Feriados exportados!", 
      description: "O arquivo .ics foi baixado. Importe-o no seu Google Calendar." 
    });
  };


  const handleClearAllPast = async () => {
    const ownerId = targetUserId || user?.id;
    if (!ownerId) return;
    const pastIds = pastEventos.map(e => e.id);
    if (!pastIds.length) return;
    try {
      const dbIds = pastIds.filter(isUuidId);
      if (dbIds.length) {
        const { error: partsError } = await supabase.from("agenda_participantes").delete().in("evento_id", dbIds);
        if (partsError) throw partsError;
        const { data, error } = await supabase.from("agenda_eventos").delete()
          .eq("user_id", ownerId)
          .in("id", dbIds)
          .select("id");
        if (error) throw error;
        if (data?.length !== dbIds.length) throw new Error("O banco não confirmou a exclusão de todos os eventos do histórico.");
      }
      pastIds.filter(id => !isUuidId(id)).forEach(id => deleteStoredAgendaEvent(id, ownerId));
      dbIds.forEach(id => deleteStoredAgendaEvent(id, ownerId));
      setEventos(prev => prev.filter(e => !pastIds.includes(e.id)));
      try { window.dispatchEvent(new CustomEvent("nexohub:agenda-updated")); } catch {}
      toast({ title: "Histórico limpo", description: `${pastIds.length} evento(s) removido(s).` });
      await fetchEventos();
    } catch (err: any) {
      console.error("[Agenda] Falha ao limpar histórico:", err);
      toast({ title: "Histórico não foi limpo", description: err?.message || "Falha ao excluir os eventos.", variant: "destructive" });
    }
  };

  const handleClearCurrentMonth = async () => {
    if (!targetUserId) {
      toast({ title: "Não foi possível identificar a emissora", variant: "destructive" });
      return;
    }

    const confirmed = await confirmDialog({
      title: "Limpar toda a agenda",
      message: "Esta ação excluirá TODOS os eventos agendados do House Mix desta emissora, independentemente do mês ou da data, incluindo eventos futuros e recorrentes cadastrados. Os eventos do Google Agenda não serão alterados. Esta ação não pode ser desfeita. Deseja continuar?",
      confirmLabel: "Excluir todos os eventos",
      cancelLabel: "Cancelar",
      destructive: true,
      icon: "trash",
    });
    if (!confirmed) return;

    setLoadingData(true);
    try {
      // Get all event IDs first so participant rows can be removed as well.
      const { data: rows, error: selectError } = await supabase
        .from("agenda_eventos")
        .select("id")
        .eq("user_id", targetUserId);
      if (selectError) throw selectError;

      const dbIds = (rows || []).map((row: any) => String(row.id));
      if (dbIds.length > 0) {
        const { error: participantError } = await supabase
          .from("agenda_participantes")
          .delete()
          .in("evento_id", dbIds);
        if (participantError) throw participantError;
      }

      // Delete every event belonging to this station, not just the current month.
      const { error: deleteError } = await supabase
        .from("agenda_eventos")
        .delete()
        .eq("user_id", targetUserId);
      if (deleteError) throw deleteError;

      // Clear the station-specific cache and its entries in the shared fallback.
      try {
        const norm = targetUserId.trim().toLowerCase();
        localStorage.removeItem(`nexohub_agenda_local_events_v2_${norm}`);
        const fallbackKey = "nexohub_agenda_local_events_v2";
        const fallbackRaw = localStorage.getItem(fallbackKey);
        if (fallbackRaw) {
          const fallbackList = JSON.parse(fallbackRaw);
          if (Array.isArray(fallbackList)) {
            localStorage.setItem(fallbackKey, JSON.stringify(fallbackList.filter((event: any) => event?.user_id !== targetUserId)));
          }
        }
      } catch (storageError) {
        console.warn("[Agenda] Não foi possível limpar todo o cache local:", storageError);
      }

      setEventos([]);
      try { window.dispatchEvent(new CustomEvent("nexohub:agenda-updated")); } catch {}
      toast({ title: "Agenda totalmente limpa", description: `${dbIds.length} evento(s) excluído(s).` });
    } catch (error: any) {
      console.error("[Agenda] Falha ao limpar todos os eventos:", error);
      toast({ title: "Não foi possível limpar a agenda", description: error?.message || "Ocorreu um erro ao excluir os eventos.", variant: "destructive" });
    } finally {
      setLoadingData(false);
    }
  };

  const locais = Array.from(new Set(eventos.map((e) => e.local).filter(Boolean)));

  const getExcecao = (evt: Evento, dateStr: string): EventoExcecao | undefined => {
    const list = Array.isArray(evt.excecoes) ? evt.excecoes : [];
    return list.find(x => x && x.data === dateStr);
  };

  const DIAS_INDEX_MAP: Record<number, string[]> = {
    0: ["domingo", "dom"],
    1: ["segunda", "seg", "segunda-feira"],
    2: ["terca", "terça", "ter", "terca-feira", "terça-feira"],
    3: ["quarta", "qua", "quarta-feira"],
    4: ["quinta", "qui", "quinta-feira"],
    5: ["sexta", "sex", "sexta-feira"],
    6: ["sabado", "sábado", "sab", "sábado"],
  };

  const eventMatchesDate = (evt: Evento, dateStr: string) => {
    let matches = false;
    if (evt.data === dateStr && evt.recorrencia === "unico") {
      matches = true;
    } else {
      const checkDate = new Date(dateStr + "T12:00:00");
      const evtDate = new Date((evt.data || dateStr) + "T12:00:00");
      if (checkDate < evtDate && evt.recorrencia === "unico") return false;

      const dow = checkDate.getDay(); // 0 = Domingo, 1 = Segunda, ... 6 = Sábado
      const dowNames = DIAS_INDEX_MAP[dow] || [];

      const progDays = evt.programa?.dias_semana || (evt.programa as any)?.diasSemana;
      const isCustomRec = evt.recorrencia === "programa_semanal"
        || evt.recorrencia?.startsWith("programa_semanal:")
        || evt.recorrencia?.startsWith("dias:");

      if (progDays && Array.isArray(progDays) && progDays.length > 0) {
        const normalizedDays = progDays.map(d => String(d).trim().toLowerCase());
        matches = normalizedDays.some(d => dowNames.some(dn => d.includes(dn)));
      } else if (isCustomRec) {
        let activeDays: number[] = [1, 2, 3, 4, 5];
        if (evt.dias_semana && Array.isArray(evt.dias_semana) && evt.dias_semana.length > 0) {
          activeDays = evt.dias_semana;
        } else if (evt.recorrencia.startsWith("programa_semanal:")) {
          activeDays = evt.recorrencia.slice(17).split(",").map(Number).filter((n) => !isNaN(n));
        } else if (evt.recorrencia.startsWith("dias:")) {
          activeDays = evt.recorrencia.slice(5).split(",").map(Number).filter((n) => !isNaN(n));
        }
        matches = activeDays.includes(dow);
      } else if (evt.recorrencia === "semanal") {
        matches = evtDate.getDay() === dow;
      } else if (evt.recorrencia === "mensal") {
        matches = evtDate.getDate() === checkDate.getDate();
      } else if (evt.data === dateStr) {
        matches = true;
      }
    }
    if (!matches) return false;
    // Limita ocorrências ao período definido para eventos recorrentes
    if (evt.recorrencia !== "unico") {
      if (evt.periodo_inicio && dateStr < evt.periodo_inicio) return false;
      if (evt.periodo_fim && dateStr > evt.periodo_fim) return false;
    }
    const exc = getExcecao(evt, dateStr);
    if (exc && exc.acao === "skip") return false;
    return true;
  };

  const todayStr = useMemo(() => {
    return format(now, "yyyy-MM-dd");
  }, [now]);

  const filteredEventos = useMemo(() => {
    const selStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
    const isToday = selStr === todayStr;
    const currentTime = format(now, "HH:mm");

    return eventos.filter((e) => {
      const matchDate = selectedDate ? eventMatchesDate(e, selStr) : true;
      const matchLocal = filterLocal === "todos" || e.local === filterLocal;
      
      // Hide CANCELADO or CONCLUIDO events from agenda
      if (e.status === "cancelado" || e.status === "concluido") return false;

      // Base date check for unique events (historical go to history)
      const isHistorical = e.recorrencia === "unico" && e.data < todayStr;
      if (isHistorical) return false;

      const programaAtivo = !e.programa_id || programas.some(p => p.id === e.programa_id) || displayProgramas.some(p => p.id === e.programa_id) || !!e.programa;

      return matchDate && matchLocal && programaAtivo;
    });
  }, [eventos, selectedDate, filterLocal, todayStr, now, programas, displayProgramas]);

  // Past events
  const pastEventos = useMemo(() => {
    const currentTime = format(now, "HH:mm");

    const past = eventos.filter((e) => {
      // Status-based historical events
      if (e.status === "concluido" || e.status === "cancelado") return true;

      // Recording ended
      if (e.horario_gravacao_fim) {
        if (e.data < todayStr) return true;
        if (e.data === todayStr && e.horario_gravacao_fim < currentTime) return true;
      } else if (e.data < todayStr) {
        return true;
      }

      return false;
    });

    // Apply history date filter if selected
    if (historyDateFilter) {
      const filterStr = format(historyDateFilter, "yyyy-MM-dd");
      return past.filter(e => e.data === filterStr);
    }
    
    return past.sort((a, b) => b.data.localeCompare(a.data)).slice(0, 50);
  }, [eventos, historyDateFilter, now, todayStr]);

  const eventDates = useMemo(() => {
    const dates: Date[] = [];
    const startMonth = new Date(currentYear, currentMonth - 1, 1);
    const endMonth = new Date(currentYear, currentMonth + 2, 0);
    for (const evt of eventos) {
      if (evt.status === "cancelado") continue;
      if (evt.recorrencia === "unico") {
        dates.push(new Date(evt.data + "T12:00:00"));
      } else {
        const d = new Date(startMonth);
        while (d <= endMonth) {
          const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (eventMatchesDate(evt, ds)) {
            dates.push(new Date(d));
          }
          d.setDate(d.getDate() + 1);
        }
      }
    }
    return dates;
  }, [eventos, currentYear, currentMonth]);

  const handleSelectDate = useCallback((d: Date) => {
    setSelectedDate(d);
  }, []);

  const handleEventClick = useCallback((evt: Evento, dateStr?: string) => {
    startEdit(evt, dateStr);
  }, [startEdit]);

  const selectedPrograma = programas.find((p) => p.id === formProgramaId);

  const pastMonths = useMemo(() => {
    const months = new Set<string>();
    const today = new Date(todayStr + "T00:00:00");
    for (let i = 0; i < 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.add(format(d, "MMMM", { locale: ptBR }));
    }
    return Array.from(months);
  }, [todayStr]);


  // Conflitos com feriados nos próximos 14 dias (só programa_semanal / semanal, sem exceção definida)
  const holidayConflicts = useMemo(() => {
    const results: { evt: Evento; dateStr: string; date: Date; feriadoNome: string }[] = [];
    const today = new Date(todayStr + "T00:00:00");
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const feriadoNome = getFeriadoNome(d);
      if (!feriadoNome) continue;
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      for (const evt of eventos) {
        const isRecCheck = evt.recorrencia === "semanal" || evt.recorrencia === "programa_semanal" || evt.recorrencia?.startsWith("programa_semanal:") || evt.recorrencia?.startsWith("dias:");
        if (!isRecCheck) continue;
        if (evt.status === "cancelado" || evt.status === "concluido") continue;
        if (!eventMatchesDate(evt, ds)) continue;
        if (getExcecao(evt, ds)) continue; // já resolvido
        results.push({ evt, dateStr: ds, date: new Date(d), feriadoNome });
      }
    }
    return results;
  }, [eventos, todayStr, feriadosNacionais]);


  // Past events from the last 6 months
  const pastEvents = useMemo(() => {
    const today = new Date(todayStr + "T00:00:00");
    
    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const days: { dateStr: string; date: Date; events: Evento[] }[] = [];
    
    // We'll iterate backwards from yesterday to 6 months ago
    const tempDate = new Date(today);
    tempDate.setDate(tempDate.getDate() - 1);
    
    while (tempDate >= sixMonthsAgo) {
      const ds = format(tempDate, "yyyy-MM-dd");
      const monthStr = format(tempDate, "MMMM", { locale: ptBR });
      
      const dayEvents = eventos.filter((e) => {
        const matchLocal = filterLocal === "todos" || e.local === filterLocal;
        const matchMonth = pastMonthFilter === "todos" || monthStr.toLowerCase() === pastMonthFilter.toLowerCase();
        
        // Use eventMatchesDate to handle recurring events as well in history
        const isMatch = matchLocal && matchMonth && eventMatchesDate(e, ds);
        return isMatch;
      });
      
      if (dayEvents.length > 0) {
        days.push({ dateStr: ds, date: new Date(tempDate), events: dayEvents });
      }
      
      tempDate.setDate(tempDate.getDate() - 1);
    }
    return days;
  }, [eventos, filterLocal, pastMonthFilter, todayStr]);


  // Week view: 7 days starting from the current day (now) or offset
  const weekEvents = useMemo(() => {
    const baseDate = new Date(now);
    baseDate.setDate(now.getDate() + weekOffset * 7);
    baseDate.setHours(0, 0, 0, 0);

    const days: { dateStr: string; date: Date; events: Evento[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dayEvents = eventos.filter((e) => {
        const matchLocal = filterLocal === "todos" || e.local === filterLocal;
        const isMatch = matchLocal && eventMatchesDate(e, ds);
        if (!isMatch) return false;

        // Hide CANCELADO or CONCLUIDO events
        if (e.status === "cancelado" || e.status === "concluido") return false;

        return true;
      });
      days.push({ dateStr: ds, date: new Date(d), events: dayEvents });
    }
    return days;
  }, [eventos, filterLocal, weekOffset, now]);

  // Map an Evento to a positioned block in the Google-style week grid
  const toGridEvent = useCallback((evt: Evento, dateStr: string): GridEvent | null => {
    const toMin = (hhmm?: string | null) => {
      if (!hhmm) return null;
      const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
      if (!m) return null;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };
    const isGravacao = evt.tipo_evento === "gravacao";
    let start = toMin(evt.horario_gravacao) ?? toMin(evt.programa?.horario_inicio);
    let end = toMin(evt.horario_gravacao_fim) ?? toMin(evt.programa?.horario_fim);
    if (start == null) start = 12 * 60;
    if (end == null || end <= start) end = start + 60;

    const color =
      evt.cor ||
      getStoredEventColor(evt.id) ||
      (evt.programa_id ? getStoredEventColor(`prog_${evt.programa_id}`) : null) ||
      (evt.prioridade === "alta"
        ? "#EF4444"
        : isGravacao
          ? "#7C6CF0"
          : evt.tipo_evento === "externo"
            ? "#F59E0B"
            : "#0055ff");

    const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
    const statusOption = statusOptions.find((s) => s.value === evt.status);

    const clean = (t?: string | null) =>
      (t || "").replace(/\s+/g, " ").trim();
    const note =
      clean(evt.youtube_titulo) ||
      clean(evt.youtube_descricao) ||
      clean(evt.descricao) ||
      "";

    return {
      key: `${evt.id}-${dateStr}`,
      title: evt.youtube_titulo || evt.programa?.nome || evt.descricao || "Evento",
      subtitle: `${fmt(start)} – ${fmt(end)}`,
      note: note ? note.slice(0, 140) : undefined,
      startMin: start,
      endMin: end,
      color,
      local: evt.local,
      recorrencia: evt.recorrencia,
      recorrenciaLabel: recorrenciaLabels[evt.recorrencia],
      status: evt.status,
      statusLabel: statusOption?.label,
      statusColor: statusOption?.color,
      participantes: evt.participantes?.map((p) => p.nome).filter(Boolean),
      tipoEvento: evt.tipo_evento,
      raw: evt,
    };
  }, []);

  const getClientForEvent = useCallback((evt: Evento): AgendaCliente | undefined => {
    if (!clientesList || clientesList.length === 0) return undefined;

    // 1. Check if evt.local matches or contains a client name/nome_empresarial
    if (evt.local) {
      const localUpper = evt.local.toUpperCase();
      const foundByLocal = clientesList.find(c => {
        const nameUpper = c.nome?.toUpperCase();
        const empUpper = c.nome_empresarial?.toUpperCase();
        return (empUpper && localUpper.includes(empUpper)) || (nameUpper && localUpper.includes(nameUpper));
      });
      if (foundByLocal) return foundByLocal;
    }

    // 2. Check if programa's user_id matches client's user_id, id or aliases
    if (evt.programa) {
      const progUserId = (evt.programa as any).user_id;
      if (progUserId) {
        const foundByProg = clientesList.find(c => c.id === progUserId || c.user_id === progUserId || c.aliases?.includes(progUserId));
        if (foundByProg) return foundByProg;
      }
    }

    // 3. Check if evt.user_id matches client
    if (evt.user_id) {
      const foundByUser = clientesList.find(c => c.id === evt.user_id || c.user_id === evt.user_id || c.aliases?.includes(evt.user_id));
      if (foundByUser) return foundByUser;
    }

    return undefined;
  }, [clientesList]);

  const getPresenterForEvent = useCallback((evt: Evento): Apresentador | undefined => {
    // 1. Resolve program
    const prog = displayProgramas.find(p => p.id === evt.programa_id || (p.nome && evt.programa_id && p.nome.toLowerCase() === evt.programa_id.toLowerCase()))
      || programas.find(p => p.id === evt.programa_id || (p.nome && evt.programa_id && p.nome.toLowerCase() === evt.programa_id.toLowerCase()))
      || (evt.programa?.id ? displayProgramas.find(p => p.id === evt.programa?.id) : null)
      || (evt.programa?.nome ? displayProgramas.find(p => p.nome && p.nome.toLowerCase() === evt.programa.nome.toLowerCase()) : null)
      || evt.programa;

    // 2. Gather presenters from all sources
    const syncAps = ((getStationDatabaseSync(targetUserId || user?.email || "positivafm@positivafm.com.br")?.apresentadores as Apresentador[]) || []);
    const snapshotAps = ((getSnapshotApresentadores(targetUserId || user?.email || "positivafm@positivafm.com.br") as Apresentador[]) || []);
    const interativaAps = ((getSnapshotApresentadores("interativafmgynaovivo@gmail.com") as Apresentador[]) || []);

    const allPresentersMap = new Map<string, Apresentador>();
    snapshotAps.forEach(a => allPresentersMap.set(a.id, a));
    interativaAps.forEach(a => {
      const ex = allPresentersMap.get(a.id);
      allPresentersMap.set(a.id, {
        ...a,
        foto: a.foto || a.foto_url || ex?.foto || ex?.foto_url,
        foto_url: a.foto_url || a.foto || ex?.foto_url || ex?.foto,
      });
    });
    syncAps.forEach(a => {
      const ex = allPresentersMap.get(a.id);
      allPresentersMap.set(a.id, {
        ...a,
        foto: a.foto || a.foto_url || ex?.foto || ex?.foto_url,
        foto_url: a.foto_url || a.foto || ex?.foto_url || ex?.foto,
      });
    });
    apresentadores.forEach(a => {
      const ex = allPresentersMap.get(a.id);
      allPresentersMap.set(a.id, {
        ...a,
        foto: a.foto || a.foto_url || ex?.foto || ex?.foto_url,
        foto_url: a.foto_url || a.foto || ex?.foto_url || ex?.foto,
      });
    });

    const allPresenters = Array.from(allPresentersMap.values());

    if (prog) {
      const progIds = [
        ...(prog.apresentador_id ? [prog.apresentador_id] : []),
        ...(prog.apresentadorId ? [prog.apresentadorId] : []),
        ...(prog.apresentadores_ids || []),
        ...(prog.apresentadoresIds || []),
      ].filter(Boolean);

      for (const id of progIds) {
        const found = allPresenters.find(a => a.id === id);
        if (found) return found;
      }

      if (prog.nome) {
        const pNome = prog.nome.toLowerCase();
        for (const a of allPresenters) {
          if (!a.nome) continue;
          const aNome = a.nome.toLowerCase();
          if (pNome.includes(aNome) || aNome.includes(pNome)) {
            return a;
          }
        }
      }
    }

    // 3. Fallback: match participants with known presenters that have a photo
    if (evt.participantes && evt.participantes.length > 0) {
      for (const p of evt.participantes) {
        if (!p.nome) continue;
        const pNome = p.nome.toLowerCase();
        const found = allPresenters.find(a => a.nome && (a.nome.toLowerCase() === pNome || a.nome.toLowerCase().includes(pNome) || pNome.includes(a.nome.toLowerCase())));
        if (found && (found.foto || found.foto_url)) {
          return found;
        }
      }
    }

    return undefined;
  }, [displayProgramas, programas, apresentadores, targetUserId, user]);

  // Feed events for the currently selected day (or today), sorted earliest to latest
  const selectedDayFeedEvents = useMemo(() => {
    const targetDate = selectedDate || now;
    const targetDs = format(targetDate, "yyyy-MM-dd");

    return eventos
      .filter((e) => {
        const matchLocal = filterLocal === "todos" || e.local === filterLocal;
        if (!matchLocal) return false;
        if (!eventMatchesDate(e, targetDs)) return false;
        return true;
      })
      .sort((a, b) => {
        const toMinutes = (hhmm?: string | null) => {
          if (!hhmm) return 9999;
          const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
          if (!m) return 9999;
          return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
        };
        const startA = toMinutes(a.horario_gravacao || a.programa?.horario_inicio);
        const startB = toMinutes(b.horario_gravacao || b.programa?.horario_inicio);
        if (startA !== startB) return startA - startB;
        return (a.programa?.nome || "").localeCompare(b.programa?.nome || "");
      });
  }, [eventos, selectedDate, filterLocal, now]);



  const renderEventCard = (evt: Evento, inactive = false) => {
    const evtColor = evt.cor || getStoredEventColor(evt.id) || (evt.programa_id ? getStoredEventColor(`prog_${evt.programa_id}`) : null);
    return (
    <div
      key={evt.id}
      className={`rounded-xl p-4 space-y-2 ${inactive ? "opacity-50 grayscale" : ""}`}
      style={{
        backgroundColor: "var(--layout-page-bg, #ffffff)",
        border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)",
        borderLeft: evtColor ? `4px solid ${evtColor}` : undefined,
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h5 className="font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            {evt.programa?.nome || "Programa removido"}
          </h5>
          <p className="text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
            <CalendarIcon size={12} className="inline mr-1" />
            {format(new Date(evt.data + "T12:00:00"), "dd/MM/yyyy")}
            {evt.horario_gravacao || evt.horario_gravacao_fim ? (
              ` • ${evt.tipo_evento === "gravacao" ? "🎬 Gravação" : "⏰ Agenda"}: ${evt.horario_gravacao || ""} ${evt.horario_gravacao_fim ? `- ${evt.horario_gravacao_fim}` : ""}`
            ) : (
              evt.programa && ` • ${evt.programa.horario_inicio} - ${evt.programa.horario_fim}`
            )}
          </p>
          {evt.recorrencia !== "unico" && (
            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded mt-0.5" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent)", color: "var(--layout-icon-color, #888888)" }}>
              🔁 {recorrenciaLabels[evt.recorrencia]}
            </span>
          )}
          {evt.status && evt.status !== "ativo" && (
            <span
              className="inline-block text-[10px] font-bold px-2 py-0.5 rounded mt-0.5 ml-1 uppercase"
              style={{
                backgroundColor: statusOptions.find(s => s.value === evt.status)?.color || "#888",
                color: "#fff",
              }}
            >
              {statusOptions.find(s => s.value === evt.status)?.label || evt.status}
            </span>
          )}
          {evt.local && (
            <p className="text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
              <MapPin size={12} className="inline mr-1" />
              {evt.local}
            </p>
          )}
          {evt.descricao && (
            <p className="text-sm mt-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{evt.descricao}</p>
          )}
        </div>
        {!inactive && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => startEdit(evt)}>
              <Pencil size={14} style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => requestDelete(evt, evt.data)}>
              <Trash2 size={14} className="text-destructive" />
            </Button>
          </div>
        )}
      </div>

      {evt.participantes && evt.participantes.length > 0 && (
        <div className="border-t pt-2" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
          <p className="text-xs font-medium mb-1 flex items-center gap-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
            <Users size={12} /> Participantes
          </p>
          <div className="flex flex-wrap gap-2">
            {evt.participantes.map((p, i) => (
              <span
                key={i}
                className="rounded-lg px-2 py-1 text-xs"
                style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}
              >
                {p.nome}
                {p.instagram && (
                  <span className="ml-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                    <Instagram size={10} className="inline mr-0.5" />
                    {p.instagram}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
    );
  };

  return (
    <div className="nexo-scope space-y-4 w-full max-w-none mx-0">
      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        Agenda
      </div>
      <div className="animate-fade-in">

      {/* Diálogo: Período da recorrência */}
      <Dialog open={periodoDialogOpen} onOpenChange={setPeriodoDialogOpen}>
        <DialogContent
          closeButtonClassName="top-6 right-6"
          className="max-w-md w-full p-0 overflow-hidden bg-white border border-slate-200/90 rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.22)] font-sans"
          style={{ fontFamily: "'Montserrat', sans-serif" }}
        >
          <div className="flex flex-col bg-white">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white relative">
              <div className="flex items-center gap-3 pr-10">
                <div className="w-1.5 h-6 rounded-full bg-[#0055ff]" />
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-blue-50 text-[#0055ff] shadow-xs shrink-0">
                  <Repeat size={18} />
                </div>
                <div>
                  <DialogTitle className="text-base font-black uppercase tracking-tight m-0 text-[#002132]">
                    Período da Recorrência
                  </DialogTitle>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 m-0">
                    {pendingRecorrencia === "semanal" && "Repete no mesmo dia da semana"}
                    {pendingRecorrencia === "mensal" && "Repete no mesmo dia de cada mês"}
                    {pendingRecorrencia === "programa_semanal" && (
                      formDiasSemana.length === 5 && [1, 2, 3, 4, 5].every(d => formDiasSemana.includes(d))
                        ? "Repete de segunda a sexta-feira"
                        : formDiasSemana.length === 7
                        ? "Repete todos os dias"
                        : formDiasSemana.length === 0
                        ? "Selecione ao menos um dia da semana"
                        : `Repete em: ${DIAS_DA_SEMANA.filter(d => formDiasSemana.includes(d.id)).map(d => d.label).join(", ")}`
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Form Body */}
            <div className="p-6 space-y-5 bg-white">
              {pendingRecorrencia === "programa_semanal" && (
                <div className="space-y-2">
                  <Label className="text-[11px] font-black uppercase tracking-wider text-[#002132] block">
                    Dias da Semana
                  </Label>
                  <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                    {DIAS_DA_SEMANA.map((d) => {
                      const isSelected = formDiasSemana.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => toggleDiaSemana(d.id)}
                          className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer border text-center ${
                            isSelected
                              ? "bg-[#0055ff] border-[#0055ff] text-white shadow-sm hover:bg-blue-600"
                              : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-[11px] font-black uppercase tracking-wider text-[#002132] block">
                  Data Inicial
                </Label>
                <DateInput
                                  value={formPeriodoInicio}
                  onChange={(e) => setFormPeriodoInicio(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white focus:bg-white text-sm font-semibold text-[#002132] outline-none shadow-xs transition-all focus:border-[#0055ff] focus:ring-4 focus:ring-[#0055ff]/10"
                />
              </div>

              {(() => {
                const hasInvalidRange = !!formPeriodoInicio && !!formPeriodoFim && formPeriodoFim < formPeriodoInicio;
                return (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-black uppercase tracking-wider text-[#002132] block">
                      Data Final
                    </Label>
                    <DateInput
                                          value={formPeriodoFim}
                      min={formPeriodoInicio || undefined}
                      onChange={(e) => setFormPeriodoFim(e.target.value)}
                      aria-invalid={hasInvalidRange}
                      aria-describedby={hasInvalidRange ? "periodo-fim-error" : undefined}
                      className={`w-full h-11 px-4 rounded-xl border text-sm font-semibold outline-none shadow-xs transition-all ${
                        hasInvalidRange
                          ? "border-red-400 bg-red-50/50 text-red-600 focus:ring-4 focus:ring-red-500/10"
                          : "border-slate-200 bg-slate-50/60 hover:bg-white focus:bg-white text-[#002132] focus:border-[#0055ff] focus:ring-4 focus:ring-[#0055ff]/10"
                      }`}
                    />
                    {hasInvalidRange && (
                      <p id="periodo-fim-error" role="alert" className="mt-1.5 text-[11px] font-semibold flex items-center gap-1.5 text-red-600">
                        <AlertTriangle size={13} className="shrink-0" />
                        <span>A data final deve ser igual ou posterior à data inicial.</span>
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setPeriodoDialogOpen(false);
                    setFormRecorrencia("unico");
                    setFormPeriodoInicio("");
                    setFormPeriodoFim("");
                    setFormDiasSemana([1, 2, 3, 4, 5]);
                  }}
                  className="flex-1 h-11 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-wider transition-all shadow-xs active:scale-[0.98] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!formPeriodoInicio || !formPeriodoFim || formPeriodoFim < formPeriodoInicio || (pendingRecorrencia === "programa_semanal" && formDiasSemana.length === 0)}
                  onClick={() => setPeriodoDialogOpen(false)}
                  className="flex-1 h-11 rounded-full bg-[#0055ff] hover:bg-[#0047e1] text-white text-xs font-black uppercase tracking-wider transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-md hover:brightness-105 active:scale-[0.98] cursor-pointer"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo: escolha ao excluir evento recorrente */}
      <Dialog open={!!deleteChoice} onOpenChange={(o) => { if (!o) setDeleteChoice(null); }}>
        <DialogContent
          className="max-w-md p-0 overflow-hidden border border-slate-100 shadow-2xl rounded-3xl"
          style={{ backgroundColor: "#ffffff" }}
        >
          {deleteChoice && (
            <div className="flex flex-col font-sans">
              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0 shadow-sm">
                  <Trash2 size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-base font-black text-[#002132] tracking-tight m-0">
                    Excluir Evento Recorrente
                  </DialogTitle>
                  <p className="text-xs text-slate-500 font-medium mt-1 truncate">
                    {deleteChoice.evt.youtube_titulo || deleteChoice.evt.programa?.nome || deleteChoice.evt.descricao || "Evento"}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                      <Clock size={10} />
                      {format(new Date(deleteChoice.dateStr + "T12:00:00"), "dd/MM/yyyy")}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                      <Repeat size={10} />
                      {recorrenciaLabels[deleteChoice.evt.recorrencia] || deleteChoice.evt.recorrencia}
                    </span>
                  </div>
                </div>
              </div>

              {/* Opções de exclusão */}
              <div className="p-6 space-y-3">
                <p className="text-xs font-semibold text-slate-600 mb-2">
                  Este evento possui recorrência em outros dias. Como deseja prosseguir com a exclusão?
                </p>

                {/* Opção 1: Somente este evento desse dia */}
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await upsertExcecao(deleteChoice.evt, { data: deleteChoice.dateStr, acao: "skip" });
                    if (ok) {
                      toast({
                        title: "Evento deste dia excluído",
                        description: `A ocorrência de ${format(new Date(deleteChoice.dateStr + "T12:00:00"), "dd/MM/yyyy")} foi removida da grade.`,
                      });
                    }
                    setDeleteChoice(null);
                  }}
                  className="w-full text-left p-3.5 rounded-2xl border-2 border-slate-200/80 hover:border-blue-500 hover:bg-blue-50/40 transition-all group cursor-pointer flex items-start gap-3 active:scale-[0.99]"
                >
                  <div className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-[#0055ff] group-hover:text-white text-slate-700 flex items-center justify-center shrink-0 transition-colors shadow-xs">
                    <CalendarDays size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-black text-[#002132] group-hover:text-[#0055ff] transition-colors">
                      Excluir somente este evento desse dia
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 font-medium leading-relaxed">
                      Remove apenas este evento da data {format(new Date(deleteChoice.dateStr + "T12:00:00"), "dd/MM/yyyy")}. As repetições dos demais dias permanecem ativas na grade.
                    </div>
                  </div>
                </button>

                {/* Opção 2: Todos os eventos */}
                <button
                  type="button"
                  onClick={async () => {
                    await handleDelete(deleteChoice.evt.id);
                    toast({
                      title: "Todos os eventos excluídos",
                      description: "A série de eventos recorrentes foi totalmente removida.",
                    });
                    setDeleteChoice(null);
                  }}
                  className="w-full text-left p-3.5 rounded-2xl border-2 border-rose-100 hover:border-rose-500 hover:bg-rose-50/50 transition-all group cursor-pointer flex items-start gap-3 active:scale-[0.99]"
                >
                  <div className="w-9 h-9 rounded-xl bg-rose-50 group-hover:bg-rose-600 group-hover:text-white text-rose-600 flex items-center justify-center shrink-0 transition-colors shadow-xs">
                    <Trash2 size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-black text-[#002132] group-hover:text-rose-700 transition-colors">
                      Excluir todos os eventos
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 font-medium leading-relaxed">
                      Exclui permanentemente toda a série recorrente deste evento em todas as datas.
                    </div>
                  </div>
                </button>
              </div>

              {/* Rodapé com Cancelar */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 px-5 rounded-full text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
                  onClick={() => setDeleteChoice(null)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo: resolver feriado nacional em evento recorrente */}
      <Dialog open={!!holidayResolve} onOpenChange={(o) => { if (!o) { setHolidayResolve(null); setHolidayReplaceProg(""); } }}>
        <DialogContent className="max-w-md p-0 overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", borderRadius: 20, border: "none", color: "var(--layout-page-text, #1a1a1a)" }}>
          {holidayResolve && (
            <div className="flex flex-col">
              <div className="px-6 py-4" style={{ background: "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)", color: "#fff" }}>
                <DialogTitle className="text-base font-bold m-0 flex items-center gap-2">
                  <AlertTriangle size={18} /> Feriado nacional
                </DialogTitle>
                <p className="text-[11px] mt-1 opacity-90">
                  {holidayResolve.feriadoNome} • {format(new Date(holidayResolve.dateStr + "T12:00:00"), "EEEE, dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-sm" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  O programa <strong>{holidayResolve.evt.programa?.nome || "recorrente"}</strong> cai neste feriado. O que fazer?
                </p>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Substituir por outro programa</Label>
                  <div className="flex gap-2">
                    <Select value={holidayReplaceProg} onValueChange={setHolidayReplaceProg}>
                      <SelectTrigger className="flex-1 h-10 rounded-xl">
                        <SelectValue placeholder="Escolha um programa" />
                      </SelectTrigger>
                      <SelectContent>
                        {programas
                          .filter(p => p.id !== holidayResolve.evt.programa_id)
                          .map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.nome}{p.estudio ? ` • ${p.estudio}` : ""}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      disabled={!holidayReplaceProg}
                      style={{ backgroundColor: NEXO_CYAN, color: "#fff" }}
                      onClick={async () => {
                        const ok = await upsertExcecao(holidayResolve.evt, { data: holidayResolve.dateStr, acao: "substituir", programa_id: holidayReplaceProg });
                        if (ok) toast({ title: "Substituição salva" });
                        setHolidayResolve(null);
                        setHolidayReplaceProg("");
                      }}
                    >
                      Substituir
                    </Button>
                  </div>
                </div>

                <div className="border-t pt-3" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)" }}>
                  <Button
                    variant="outline"
                    className="w-full h-10 rounded-xl"
                    onClick={async () => {
                      const ok = await upsertExcecao(holidayResolve.evt, { data: holidayResolve.dateStr, acao: "automatico" });
                      if (ok) toast({ title: "Definido como Programa Automático" });
                      setHolidayResolve(null);
                      setHolidayReplaceProg("");
                    }}
                  >
                    Colocar como programa automático
                  </Button>
                </div>

                <Button variant="ghost" className="w-full h-9" onClick={() => { setHolidayResolve(null); setHolidayReplaceProg(""); }}>
                  Decidir depois
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


      
      <Dialog open={viewEventDialogOpen} onOpenChange={setViewEventDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", borderRadius: "20px", border: "none", color: "var(--layout-page-text, #1a1a1a)" }}>
          {viewingEvent && (
            <div className="flex flex-col">
              <div className="px-6 py-5" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a) 0%, color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%) 100%)", color: "var(--layout-header-text, #ffffff)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                    <CalendarIcon size={20} />
                  </div>
                  <div>
                    <DialogTitle className="text-base font-bold m-0" style={{ color: "var(--layout-header-text, #ffffff)" }}>{viewingEvent.programa?.nome || "Evento"}</DialogTitle>
                    <p className="text-[10px] mt-0.5 opacity-70">Informações detalhadas do evento</p>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto agenda-dialog-scroll">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Data</p>
                    <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                      <CalendarIcon size={12} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
                      {format(new Date(viewingEvent.data + "T12:00:00"), "dd/MM/yyyy")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Horário</p>
                    <div className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                      {viewingEvent.tipo_evento === "gravacao" ? (
                        <>
                          <Star size={12} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
                          🎬 {viewingEvent.horario_gravacao || ""} {viewingEvent.horario_gravacao_fim ? `- ${viewingEvent.horario_gravacao_fim}` : ""} (Gravação)
                        </>
                      ) : (
                        <>
                          <CalendarIcon size={12} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
                          {viewingEvent.programa ? `${viewingEvent.programa.horario_inicio} - ${viewingEvent.programa.horario_fim}` : "N/A"}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {viewingEvent.local && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Local</p>
                    <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                      <MapPin size={12} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
                      {viewingEvent.local}
                    </p>
                  </div>
                )}

                {viewingEvent.descricao && (
                  <div className="space-y-1 p-3 rounded-xl" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Descrição</p>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{viewingEvent.descricao}</p>
                  </div>
                )}

                {viewingEvent.participantes && viewingEvent.participantes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                      <Users size={12} /> Participantes ({viewingEvent.participantes.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {viewingEvent.participantes.map((p, i) => (
                        <div
                          key={i}
                          className="rounded-lg px-2.5 py-1.5 text-xs flex items-center gap-2"
                          style={{ 
                            backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)", 
                            border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)",
                            color: "var(--layout-page-text, #1a1a1a)"
                          }}
                        >
                          <span className="font-semibold">{p.nome}</span>
                          {p.instagram && (
                            <span className="flex items-center gap-0.5 opacity-60 text-[10px]">
                              <Instagram size={10} />
                              @{p.instagram.replace('@', '')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {viewingEvent.artes_urls && viewingEvent.artes_urls.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                      <ImageIcon size={12} /> Artes do Evento ({viewingEvent.artes_urls.length})
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {viewingEvent.artes_urls.map((url, i) => (
                        <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-black/10">
                          <img src={url} alt={`Arte ${i + 1}`} className="w-full h-full object-cover" />
                          <a 
                            href={url} 
                            download 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                          >
                            <Download size={16} />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button 
                    className="flex-1 h-9 text-xs font-bold rounded-xl shadow-lg transition-transform active:scale-95"
                    style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "#ffffff" }}
                    onClick={() => { setViewEventDialogOpen(false); startEdit(viewingEvent); }}
                  >
                    <Pencil size={14} className="mr-1.5" /> Editar Evento
                  </Button>
                  <Button 
                    variant="outline"
                    className="h-9 w-9 p-0 rounded-xl border-destructive text-destructive hover:bg-destructive/10"
                    onClick={() => { 
                      setViewEventDialogOpen(false); 
                      requestDelete(viewingEvent, viewingOccurrenceDate || viewingEvent.data);
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="w-full space-y-4 pb-12 font-sans animate-fade-in">
        {/* Header Section (Card Branco Moderno) */}
        <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-black to-slate-800 text-white flex items-center justify-center shadow-md shrink-0">
              <CalendarIcon className="w-6 h-6 text-[#00BFF0]" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-black tracking-wider text-[#002132] uppercase leading-tight">
                Agenda de Eventos
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Gerencie programas e participantes da emissora
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <GoogleCalendarSync compact />
            {locais.length > 0 && (
              <Select value={filterLocal} onValueChange={setFilterLocal}>
                <SelectTrigger className="w-[180px] h-10 text-xs bg-[#f8fafc] border border-slate-200 text-slate-700 rounded-full font-semibold">
                  <MapPin size={12} className="mr-1 text-slate-400" />
                  <SelectValue placeholder="Filtrar por local" />
                </SelectTrigger>
                <SelectContent className="bg-white rounded-2xl border border-slate-100 shadow-xl">
                  <SelectItem value="todos">Todos os locais</SelectItem>
                  {locais.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}


            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setDatasModalOpen(true)}
                    className="w-10 h-10 rounded-full bg-[#0055ff] hover:bg-[#0047e1] text-white transition-all shadow-sm flex items-center justify-center active:scale-95 cursor-pointer shrink-0"
                    aria-label="Datas Comemorativas"
                  >
                    <CalendarDays size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-900 text-white border-0 text-xs rounded-lg px-2.5 py-1">
                  Datas Comemorativas
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setPastEventsModalOpen(true)}
                    className="w-10 h-10 rounded-full bg-[#0055ff] hover:bg-[#0047e1] text-white transition-all shadow-sm flex items-center justify-center active:scale-95 cursor-pointer shrink-0"
                    aria-label="Eventos Passados"
                  >
                    <History size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-900 text-white border-0 text-xs rounded-lg px-2.5 py-1">
                  Eventos Passados
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <button
              type="button"
              onClick={openNewDialog}
              className="group h-10 px-6 rounded-full bg-[#0055ff] hover:bg-[#0047e1] text-white text-xs font-bold transition-all shadow-sm flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <Plus size={14} className="text-black group-hover:text-white transition-colors" /> Novo Evento
            </button>
            <button
              type="button"
              onClick={handleClearCurrentMonth}
              disabled={loadingData}
              className="agenda-clear-button h-10 px-4 rounded-full bg-rose-600 hover:bg-rose-700 disabled:opacity-100 !text-white text-xs font-bold transition-all shadow-sm flex items-center gap-2 active:scale-95 cursor-pointer"
              title="Excluir eventos do House Mix com data cadastrada no mês vigente"
            >
              <Trash2 size={14} className="!text-white" />
              Limpar agenda
            </button>
          </div>
        </section>

        {/* Banner de conflitos com feriados nacionais */}
        {holidayConflicts.length > 0 && (
          <div className="mb-4 space-y-2">
            {holidayConflicts.map(({ evt, dateStr, date, feriadoNome }) => (
              <div
                key={`${evt.id}-${dateStr}`}
                className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                style={{ background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)", border: "1px solid #f59e0b" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <AlertTriangle size={18} style={{ color: "#b45309", flexShrink: 0 }} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold" style={{ color: "#78350f" }}>
                      Feriado nacional: {feriadoNome} • {format(date, "EEE, dd/MM", { locale: ptBR })}
                    </p>
                    <p className="text-[11px]" style={{ color: "#92400e" }}>
                      O programa <strong>{evt.programa?.nome || "recorrente"}</strong> cai neste dia. Escolha o que fazer.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="h-8 rounded-full text-xs font-bold shrink-0"
                  style={{ backgroundColor: "#b45309", color: "#fff" }}
                  onClick={() => { setHolidayResolve({ evt, dateStr, feriadoNome }); setHolidayReplaceProg(""); }}
                >
                  Resolver
                </Button>
              </div>
            ))}
          </div>
        )}



        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
          <DialogContent
            closeButtonClassName="top-5 right-5"
            className="max-w-3xl w-full p-0 flex flex-col bg-white border border-slate-200/90 rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.22)] overflow-hidden font-sans max-h-[92vh]"
          >
            {/* Top Bar: Title input (with border), Salvar Button, Close (X) */}
            <div className="px-6 pr-16 py-4 border-b border-slate-100 flex items-center justify-between gap-4 bg-white shrink-0 relative">
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={formTitulo}
                  onChange={(e) => setFormTitulo(e.target.value)}
                  placeholder="Adicionar título"
                  autoFocus
                  className="w-full text-base sm:text-lg font-bold text-[#0055ff] placeholder:text-[#0055ff]/50 placeholder:font-bold bg-slate-50/70 hover:bg-slate-50 focus:bg-white border-2 border-slate-200 hover:border-[#0055ff]/40 focus:border-[#0055ff] rounded-2xl outline-none transition-all px-4 py-2.5 shadow-xs focus:ring-4 focus:ring-[#0055ff]/10"
                />
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={savingEvent}
                className="h-10 px-7 rounded-full text-sm font-bold bg-[#0055ff] hover:bg-[#0047e1] text-white transition-all shadow-sm flex items-center gap-2 active:scale-95 shrink-0 disabled:opacity-60 cursor-pointer"
              >
                {savingEvent ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <span>Salvar</span>
                )}
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {/* Seleção de estúdio e programa vinculados ao evento */}
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(180px,0.8fr)_minmax(0,2fr)] gap-3">
              <div className="space-y-1.5 min-w-0">
                <label className="text-xs font-bold text-slate-700">Estúdio</label>
                <Select value={formEstudioFilter} onValueChange={(val) => {
                  setFormEstudioFilter(val);
                  const current = displayProgramas.find(p => String(p.id) === String(formProgramaId));
                  if (val !== "todos" && current && (current.estudio || "").trim().toLocaleLowerCase("pt-BR") !== val.trim().toLocaleLowerCase("pt-BR")) setFormProgramaId("");
                }}>
                  <SelectTrigger className="h-10 text-xs font-medium bg-slate-50 border-slate-200 rounded-xl w-full"><SelectValue placeholder="Selecione o estúdio" /></SelectTrigger>
                  <SelectContent className="rounded-2xl border border-slate-100 shadow-xl bg-white max-h-64">
                    <SelectItem value="todos">Todos os estúdios</SelectItem>
                    {studioOptions.map(studio => <SelectItem key={studio} value={studio}>{studio}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 min-w-0">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Programa</span>
                  {formProgramaId && (
                    <span className="text-[10px] font-semibold text-[#0055ff] truncate max-w-[200px]">
                      {displayProgramas.find(p => String(p.id) === String(formProgramaId))?.nome}
                    </span>
                  )}
                </label>
                <Select
                  value={formProgramaId}
                  onValueChange={(val) => {
                    setFormProgramaId(val);
                    const prog = displayProgramas.find(p => String(p.id) === String(val));
                    if (prog) {
                      if (!formTitulo || formTitulo.trim() === "" || displayProgramas.some(p => p.nome === formTitulo)) {
                        setFormTitulo(prog.nome);
                      }
                      if (prog.estudio) {
                        setFormEstudio(prog.estudio);
                      }
                      if (prog.horario_inicio) {
                        setFormHorarioGravacao(prog.horario_inicio.slice(0, 5));
                      }
                      if (prog.horario_fim) {
                        setFormHorarioGravacaoFim(prog.horario_fim.slice(0, 5));
                      }
                      setFormLocal(prog.estudio ? `${prog.estudio} - ${prog.nome}` : prog.nome);
                    }
                  }}
                >
                  <SelectTrigger className="h-10 text-xs font-medium bg-slate-50 border-slate-200 rounded-xl w-full">
                    <SelectValue placeholder={filteredDisplayProgramas.length === 0 ? "Nenhum programa neste estúdio" : "Selecione o Programa..."} />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border border-slate-100 shadow-xl bg-white max-h-64">
                    {filteredDisplayProgramas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex flex-col text-left py-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-800 text-xs">{p.nome}</span>
                            {p.estudio && (
                              <span className="text-[10px] font-semibold text-[#0055ff] bg-[#0055ff]/10 px-1.5 py-0.5 rounded-md">
                                {p.estudio}
                              </span>
                            )}
                          </div>
                          {(p.horario_inicio || p.horario_fim) && (
                            <span className="text-[11px] text-slate-400 font-medium">
                              {p.horario_inicio ? p.horario_inicio.slice(0, 5) : "--:--"} às {p.horario_fim ? p.horario_fim.slice(0, 5) : "--:--"}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              </div>

                {/* Locutores / Apresentadores do programa em círculos com fundo #0055ff (mesma cor do botão Salvar) */}
                {selectedProgPresenters.length > 0 && (
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <div className="flex items-center -space-x-2 overflow-hidden py-0.5">
                      {selectedProgPresenters.map((locutor) => {
                        const photoUrl = locutor.foto || locutor.foto_url;
                        return (
                          <TooltipProvider key={locutor.id} delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow-sm shrink-0 cursor-pointer transition-transform hover:scale-110 hover:z-10"
                                  style={{ backgroundColor: "#0055ff" }}
                                >
                                  {photoUrl ? (
                                    <img
                                      src={photoUrl}
                                      alt={locutor.nome}
                                      className="w-full h-full object-cover object-top"
                                    />
                                  ) : (
                                    <span className="text-white font-bold text-xs uppercase">
                                      {locutor.nome ? locutor.nome.charAt(0) : "L"}
                                    </span>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs bg-slate-900 text-white py-1 px-2.5 rounded-lg font-semibold shadow-xl z-50">
                                <p className="font-bold">{locutor.nome}</p>
                                {locutor.cargo && <p className="text-[10px] text-slate-300 font-normal">{locutor.cargo}</p>}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-slate-700">
                        {selectedProgPresenters.map(p => p.nome).join(", ")}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {selectedProgPresenters.length === 1 ? "Locutor(a) do programa" : "Locutores do programa"}
                      </span>
                    </div>
                  </div>
                )}
              {/* Date & Time Row (Chips / Pills) */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Start Date Popover Chip */}
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="h-9 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <CalendarIcon size={14} className="text-slate-500" />
                        <span>
                          {format(formData ?? selectedDate ?? new Date(), "dd 'de' MMM. 'de' yyyy", { locale: ptBR })}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-2xl border border-slate-100 shadow-2xl bg-white z-[120]" align="start">
                      <Calendar
                        mode="single"
                        selected={formData ?? selectedDate ?? new Date()}
                        onSelect={(d) => { if (d) { setFormData(d); setDatePickerOpen(false); } }}
                        locale={ptBR}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>

                  {/* Start Time Chip */}
                  {!formDiaInteiro && (
                    <>
                      <input
                        type="time"
                        value={formHorarioGravacao}
                        onChange={(e) => setFormHorarioGravacao(e.target.value)}
                        className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#0055ff]/20 transition-colors"
                      />

                      <span className="text-xs font-medium text-slate-400">até</span>

                      {/* End Time Chip */}
                      <input
                        type="time"
                        value={formHorarioGravacaoFim}
                        onChange={(e) => setFormHorarioGravacaoFim(e.target.value)}
                        className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#0055ff]/20 transition-colors"
                      />
                    </>
                  )}

                  <span className="text-xs font-medium text-[#0055ff] ml-1">
                    Fuso horário (GMT-03:00)
                  </span>
                </div>

                {/* Second subrow: Frequência + Recorrência */}
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-xs font-semibold text-slate-700">Frequência</span>

                  <Select value={formRecorrencia} onValueChange={handleRecorrenciaChange}>
                    <SelectTrigger className="h-8 w-auto min-w-[150px] text-xs font-semibold bg-slate-100 hover:bg-slate-200 border-none rounded-full px-3.5 text-slate-700 shadow-none gap-2">
                      <SelectValue placeholder="Recorrência" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border border-slate-100 shadow-xl bg-white">
                      <SelectItem value="unico">Não se repete</SelectItem>
                      <SelectItem value="semanal">Semanalmente</SelectItem>
                      <SelectItem value="mensal">Mensalmente</SelectItem>
                      <SelectItem value="programa_semanal">Selecione</SelectItem>
                    </SelectContent>
                  </Select>

                  {formRecorrencia !== "unico" && (formPeriodoInicio || formPeriodoFim) && (
                    <button
                      type="button"
                      onClick={() => { setPendingRecorrencia(formRecorrencia); setPeriodoDialogOpen(true); }}
                      className="text-[11px] font-semibold text-[#0055ff] hover:underline cursor-pointer"
                    >
                      Período: {formPeriodoInicio ? format(new Date(formPeriodoInicio + "T12:00:00"), "dd/MM/yy") : "?"} → {formPeriodoFim ? format(new Date(formPeriodoFim + "T12:00:00"), "dd/MM/yy") : "?"}
                      {formRecorrencia === "programa_semanal" && formDiasSemana.length > 0 && formDiasSemana.length < 7 && (
                        <span className="ml-1 text-slate-500 font-normal">
                          ({DIAS_DA_SEMANA.filter(d => formDiasSemana.includes(d.id)).map(d => d.label).join(", ")})
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Tabs Bar (Detalhes do evento | Materiais & Artes) */}
              <div className="flex items-center gap-6 border-b border-slate-200 text-xs font-bold pt-2">
                <button
                  type="button"
                  onClick={() => setEventModalTab("detalhes")}
                  className={`pb-2.5 transition-colors relative cursor-pointer ${
                    eventModalTab === "detalhes" ? "text-[#0055ff]" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Detalhes do evento
                  {eventModalTab === "detalhes" && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0055ff] rounded-full" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setEventModalTab("materiais")}
                  className={`pb-2.5 transition-colors relative flex items-center gap-1.5 cursor-pointer ${
                    eventModalTab === "materiais" ? "text-[#0055ff]" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span>Artes</span>
                  {formArtesUrls.filter(Boolean).length > 0 && (
                    <span className="w-4 h-4 rounded-full bg-blue-100 text-[#0055ff] text-[9px] font-bold flex items-center justify-center">
                      {formArtesUrls.filter(Boolean).length}
                    </span>
                  )}
                  {eventModalTab === "materiais" && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0055ff] rounded-full" />
                  )}
                </button>
                <button type="button" onClick={() => setEventModalTab("edicao")} className={`pb-2.5 transition-colors relative cursor-pointer ${eventModalTab === "edicao" ? "text-[#0055ff]" : "text-slate-500 hover:text-slate-800"}`}>
                  Edição
                  {eventModalTab === "edicao" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0055ff] rounded-full" />}
                </button>
              </div>

              {/* Tab Edição */}
              {eventModalTab === "edicao" && (
                <div className="space-y-4">
                  {/* Anotações da Edição */}
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#002132]">Anotações para a Produção / Edição</h4>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-600">
                        <input
                          type="checkbox"
                          checked={formEdicaoConcluida}
                          onChange={(e) => setFormEdicaoConcluida(e.target.checked)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>Edição Concluída</span>
                      </label>
                    </div>
                    <Textarea
                      value={formEdicaoNotas}
                      onChange={(e) => setFormEdicaoNotas(e.target.value)}
                      placeholder="Instruções para o editor, cortes, pauta ou observações internas..."
                      rows={3}
                      className="bg-white border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Tab 1: Detalhes do Evento */}
              {eventModalTab === "detalhes" && (
                <div className="space-y-4">
                    {/* Notificação, Tipo do Evento, Status e Cor */}
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        {/* Status */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-600">Status:</span>
                          <Select value={formStatus} onValueChange={setFormStatus}>
                            <SelectTrigger className="h-8 text-xs font-semibold bg-white border-slate-200 rounded-xl w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border border-slate-100 shadow-xl bg-white">
                              <SelectItem value="ativo">Ativo</SelectItem>
                              <SelectItem value="concluido">Concluído</SelectItem>
                              <SelectItem value="cancelado">Cancelado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Controles de Tipo do Evento (Ao Vivo / Gravação) e Seletor de Cor */}
                        <TooltipProvider delayDuration={100}>
                          <div className="flex items-center gap-2">
                            {/* Botões redondos de Tipo do Evento (Ao Vivo & Gravação) */}
                            <div className="flex items-center gap-1.5 p-0.5 bg-slate-200/50 rounded-full border border-slate-200/80">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => setFormTipoEvento("live")}
                                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                      formTipoEvento === "live"
                                        ? "bg-rose-500 text-white shadow-sm ring-2 ring-offset-1 ring-rose-400 scale-105"
                                        : "bg-white text-slate-400 hover:text-rose-500 hover:border-rose-200 border border-slate-200"
                                    }`}
                                  >
                                    <Radio size={12} strokeWidth={2.5} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs bg-slate-900 text-white py-1 px-2.5 rounded-lg font-semibold shadow-xl z-50">
                                  Ao Vivo
                                </TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => setFormTipoEvento("gravacao")}
                                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                      formTipoEvento === "gravacao"
                                        ? "bg-purple-600 text-white shadow-sm ring-2 ring-offset-1 ring-purple-400 scale-105"
                                        : "bg-white text-slate-400 hover:text-purple-600 hover:border-purple-200 border border-slate-200"
                                    }`}
                                  >
                                    <Video size={12} strokeWidth={2.5} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs bg-slate-900 text-white py-1 px-2.5 rounded-lg font-semibold shadow-xl z-50">
                                  Gravação
                                </TooltipContent>
                              </Tooltip>
                            </div>

                            {/* Separador vertical sutil */}
                            <div className="h-4 w-px bg-slate-200 mx-0.5" />

                            {/* Bolinhas de Cor */}
                            <div className="flex items-center gap-1.5 p-0.5 bg-slate-200/50 rounded-full border border-slate-200/80">
                              {[
                                { color: "#0055ff", label: "Azul" },
                                { color: "#ef4444", label: "Vermelho" },
                                { color: "#10b981", label: "Verde" },
                                { color: "#8b5cf6", label: "Roxo" },
                                { color: "#f59e0b", label: "Amarelo" },
                                { color: "#00BFF0", label: "Ciano" },
                              ].map((c) => (
                                <Tooltip key={c.color}>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedEventColor(c.color)}
                                      className={`w-6 h-6 rounded-full transition-all cursor-pointer flex items-center justify-center ${
                                        selectedEventColor === c.color
                                          ? "scale-110 ring-2 ring-offset-1 ring-slate-500 shadow-sm"
                                          : "opacity-80 hover:opacity-100 hover:scale-105"
                                      }`}
                                      style={{ backgroundColor: c.color }}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs bg-slate-900 text-white py-1 px-2.5 rounded-lg font-semibold shadow-xl z-50">
                                    Cor {c.label}
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          </div>
                        </TooltipProvider>
                      </div>
                    </div>

                    {/* Descrição com Toolbar */}
                    <div className="space-y-1.5 pt-1">
                      <label className="text-xs font-bold text-slate-700">Descrição / Observações / Pauta</label>
                      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 focus-within:bg-white focus-within:border-[#0055ff] transition-all">
                        {/* Mini Formatting Toolbar */}
                        <div className="px-3 py-1.5 border-b border-slate-200/80 bg-slate-100/70 flex items-center gap-1 text-slate-600">
                          <button
                            type="button"
                            onClick={() => setFormDescricao(prev => prev + "**negrito** ")}
                            className="w-7 h-7 rounded hover:bg-slate-200 flex items-center justify-center font-black text-xs cursor-pointer"
                            title="Negrito"
                          >
                            B
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormDescricao(prev => prev + "*itálico* ")}
                            className="w-7 h-7 rounded hover:bg-slate-200 flex items-center justify-center italic font-serif text-xs cursor-pointer"
                            title="Itálico"
                          >
                            I
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormDescricao(prev => prev + "__sublinhado__ ")}
                            className="w-7 h-7 rounded hover:bg-slate-200 flex items-center justify-center underline text-xs font-semibold cursor-pointer"
                            title="Sublinhado"
                          >
                            U
                          </button>
                          <span className="w-px h-4 bg-slate-300 mx-1" />
                          <button
                            type="button"
                            onClick={() => setFormDescricao(prev => prev + "\n• ")}
                            className="w-7 h-7 rounded hover:bg-slate-200 flex items-center justify-center text-xs cursor-pointer"
                            title="Lista com marcadores"
                          >
                            <List size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormDescricao(prev => prev + " [link](https://...) ")}
                            className="w-7 h-7 rounded hover:bg-slate-200 flex items-center justify-center text-xs cursor-pointer"
                            title="Inserir link"
                          >
                            <LinkIcon size={14} />
                          </button>
                        </div>

                        <Textarea
                          value={formDescricao}
                          onChange={(e) => setFormDescricao(e.target.value)}
                          placeholder="Adicionar uma descrição, pauta ou observações do evento..."
                          rows={4}
                          className="w-full text-xs p-3 bg-transparent border-0 shadow-none focus-visible:ring-0 resize-none"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={handleCreateRoteiroFromEvento}
                        disabled={creatingRoteiro || !formProgramaId || !formData}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#0055ff] px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#0042A3] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {creatingRoteiro ? <Loader2 size={14} className="animate-spin" /> : <ScrollText size={14} />}
                        {creatingRoteiro ? "Abrindo roteiro..." : roteiroJaExiste ? "Abrir roteiro do programa" : "Criar roteiro do programa"}
                      </button>
                    </div>
                </div>
              )}

              {/* Tab 2: Materiais & Artes */}
              {eventModalTab === "materiais" && (
                <div className="space-y-6">
                  {/* Upload Artes Slots */}
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[#002132]">Artes do Evento (Thumbnails & Redes)</h4>
                        <p className="text-[11px] text-slate-500">Envie imagens nos formatos recomendados para divulgação</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {[
                        { label: "Thumb", slotIdx: 0 },
                        { label: "Feed", slotIdx: 1 },
                        { label: "Storie", slotIdx: 2 },
                        { label: "Insert", slotIdx: 3 },
                        { label: "Capa de Podcast", slotIdx: 4 },
                      ].map(({ label, slotIdx }) => {
                        const url = formArtesUrls[slotIdx];
                        return (
                          <div key={slotIdx} className="space-y-1.5 text-center">
                            {url ? (
                              <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-200 group bg-slate-100">
                                <img src={url} alt={label} className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => removeArte(slotIdx)}
                                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ) : (
                              <label className="aspect-video rounded-xl border-2 border-dashed border-slate-300 hover:border-[#0055ff] bg-white flex flex-col items-center justify-center cursor-pointer p-2 hover:bg-blue-50/50 transition-all">
                                <Upload size={16} className="text-slate-400 mb-1" />
                                <span className="text-[10px] font-bold text-slate-600">Upload</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleUploadArte(file, slotIdx);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            )}
                            <span className="text-[10px] font-semibold text-slate-500 block">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>




                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={expressOpen} onOpenChange={(o) => { setExpressOpen(o); if (!o) setExpressEditData(null); }}>
          <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0">
            <DialogHeader className="px-6 pt-5 pb-3 border-b" style={{ borderColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
              <DialogTitle className="text-base font-bold">📝 Roteiro do Programa</DialogTitle>
            </DialogHeader>
            <div className="p-4">
              <Suspense fallback={
                <div className="p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#00BFF0" }} />
                  <span className="text-xs font-semibold">Carregando editor de roteiro...</span>
                </div>
              }>
                <ProgramaExpressInline
                  programas={programas.map(p => ({
                    id: p.id,
                    nome: p.nome,
                    estudio: p.estudio,
                    tipo_programa: (p as any).tipo_programa,
                    apresentador_id: (p as any).apresentador_id || (p as any).apresentadorId || null,
                    apresentadores_ids: (p as any).apresentadores_ids || (p as any).apresentadoresIds || ((p as any).apresentador_id ? [(p as any).apresentador_id] : (p as any).apresentadorId ? [(p as any).apresentadorId] : null),
                  }))}
                  estudios={estudios}
                  onFinish={() => { setExpressOpen(false); setExpressEditData(null); }}
                  editData={expressEditData}
                  effectiveUserId={targetUserId}
                />
              </Suspense>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal: Calendário */}
        <Dialog open={calendarModalOpen} onOpenChange={setCalendarModalOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden bg-white rounded-3xl border border-slate-100 shadow-2xl">
            <DialogHeader className="px-6 py-4 border-b border-slate-100 bg-white flex flex-row items-center justify-between">
              <DialogTitle className="text-sm font-black uppercase tracking-wider text-[#002132] flex items-center gap-2">
                <CalendarIcon size={16} className="text-[#0055ff]" />
                Calendário
              </DialogTitle>
            </DialogHeader>

            <div className="p-4">
              <style>{`
                .agenda-calendar { width: 100% !important; }
                .agenda-calendar .rdp-months,
                .agenda-calendar .rdp-month { width: 100% !important; }
                .agenda-calendar .rdp-caption {
                  display: flex !important;
                  justify-content: center !important;
                  position: relative !important;
                  align-items: center !important;
                  width: 100% !important;
                }
                .agenda-calendar .rdp-table {
                  width: 100% !important;
                  max-width: 100% !important;
                  display: table !important;
                  table-layout: fixed !important;
                }
                .agenda-calendar .rdp-head_row,
                .agenda-calendar .rdp-row {
                  display: flex !important;
                  width: 100% !important;
                }
                .agenda-calendar .rdp-head_cell,
                .agenda-calendar th {
                  background: transparent !important;
                  background-color: transparent !important;
                  color: #94a3b8 !important;
                  font-size: 10px !important;
                  font-weight: 700 !important;
                  letter-spacing: 0.06em !important;
                  text-transform: uppercase !important;
                  border-radius: 0 !important;
                  box-shadow: none !important;
                  border: none !important;
                }
                .agenda-calendar .rdp-head_cell,
                .agenda-calendar .rdp-cell {
                  flex: 1 1 0% !important;
                  width: auto !important;
                  min-width: 0 !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                  text-align: center !important;
                }
                .agenda-calendar .rdp-day {
                  margin: 0 auto !important;
                }
                .agenda-calendar .rdp-day:hover { background-color: #f1f5f9 !important; color: #0055ff !important; }
                .agenda-calendar .rdp-day_selected { background-color: #0055ff !important; color: #fff !important; font-weight: 700 !important; }
                .agenda-calendar .rdp-day_selected:hover { background-color: #0047e1 !important; color: #fff !important; }
                .agenda-calendar .rdp-day_today,
                .agenda-calendar .rdp-day_today.rdp-day_selected,
                .agenda-calendar [class*="day_today"] {
                  border: 1.5px solid #0055ff !important;
                  color: #0055ff !important;
                  font-weight: 800 !important;
                  background-color: transparent !important;
                  box-shadow: none !important;
                }
                .agenda-calendar .rdp-day_today.rdp-day_selected {
                  background-color: #0055ff !important;
                  color: #fff !important;
                }
                .agenda-calendar .has-event-day { position: relative; font-weight: 700; }
                .agenda-calendar .has-event-day::after {
                  content: '';
                  position: absolute;
                  bottom: 3px;
                  left: 50%;
                  transform: translateX(-50%);
                  width: 4px;
                  height: 4px;
                  border-radius: 50%;
                  background-color: #0055ff;
                }
                .agenda-calendar .is-feriado-day { position: relative; }
                .agenda-calendar .is-feriado-day::after {
                  content: '';
                  position: absolute;
                  top: 3px;
                  right: 3px;
                  width: 4px;
                  height: 4px;
                  border-radius: 50%;
                  background-color: #ef4444;
                }
              `}</style>
              <TooltipProvider>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    if (date) {
                      const diffTime = date.getTime() - now.getTime();
                      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                      const offset = Math.floor(diffDays / 7);
                      setWeekOffset(offset);
                    }
                  }}
                  className={cn("p-0 pointer-events-auto agenda-calendar w-full")}
                  locale={ptBR}
                  modifiers={{ hasEvent: eventDates, isFeriado: feriadoDates, isToday: (d: Date) => isSameDay(d, new Date()) }}
                  modifiersClassNames={{ hasEvent: "has-event-day", isFeriado: "is-feriado-day", isToday: "agenda-today-highlight" }}
                  classNames={{
                    months: "w-full",
                    month: "w-full space-y-4",
                    caption: "flex justify-center pt-1 relative items-center w-full",
                    caption_label: "text-[15px] font-bold text-slate-800",
                    nav: "space-x-1 flex items-center",
                    nav_button: "h-8 w-8 rounded-full bg-transparent p-0 opacity-60 hover:opacity-100 hover:bg-slate-100 border-0 flex items-center justify-center transition-colors",
                    nav_button_previous: "absolute left-1",
                    nav_button_next: "absolute right-1",
                    table: "w-full border-collapse space-y-1",
                    head_row: "flex w-full",
                    head_cell: "text-slate-400 bg-transparent flex-1 text-center font-bold text-[10px] tracking-wider uppercase",
                    row: "flex w-full mt-2.5",
                    cell: "flex-1 h-10 text-center text-sm p-0 relative focus-within:relative focus-within:z-20 flex items-center justify-center",
                    day: "h-10 w-10 rounded-full p-0 font-medium text-sm hover:bg-slate-100 hover:text-slate-900 transition-colors flex items-center justify-center mx-auto",
                  }}
                  components={{
                    DayContent: ({ date, ...props }) => {
                      const feriado = getFeriadoNome(date);
                      const content = <span>{date.getDate()}</span>;
                      
                      if (feriado) {
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help w-full h-full flex items-center justify-center">{content}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-white border-none z-[100] bg-rose-600 rounded-xl">
                              <p className="text-[10px] font-bold">{feriado}</p>
                              <p className="text-[9px] opacity-90">{format(date, "dd/MM")}</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      }
                      return content;
                    }
                  }}
                />
              </TooltipProvider>
              {getFeriadoNome(selectedDate) && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="px-3 pt-2 text-[10px] font-semibold flex items-center gap-1.5 cursor-help text-rose-600">
                        <span className="w-2 h-2 rounded-full inline-block bg-rose-600" />
                        {getFeriadoNome(selectedDate)}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-white border-none bg-rose-600 rounded-xl">
                      <p className="text-[10px] font-bold">{getFeriadoNome(selectedDate)}</p>
                      <p className="text-[9px] opacity-90">{selectedDate ? format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ""}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal: Datas Comemorativas */}
        <Dialog open={datasModalOpen} onOpenChange={setDatasModalOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden bg-white rounded-3xl border border-slate-100 shadow-2xl">
            <DialogHeader className="sr-only">
              <DialogTitle>Datas Comemorativas</DialogTitle>
            </DialogHeader>
            <DatasComemorativasCidades feriados={feriadosNacionais} />
          </DialogContent>
        </Dialog>

        {/* Modal: Eventos Passados */}
        <Dialog open={pastEventsModalOpen} onOpenChange={setPastEventsModalOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden bg-white rounded-3xl border border-slate-100 shadow-2xl">
            <DialogHeader className="sr-only">
              <DialogTitle>Eventos Passados</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-between gap-2 pl-6 pr-12 py-4 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-2 min-w-0">
                <History size={16} className="text-[#0055ff]" />
                <span className="text-sm font-black uppercase tracking-wider text-[#002132] truncate">Eventos Passados</span>
              </div>
              <Select value={pastMonthFilter} onValueChange={setPastMonthFilter}>
                <SelectTrigger className="h-8 w-[130px] text-xs bg-slate-50 border-slate-200 text-slate-700 rounded-full font-medium">
                  <SelectValue placeholder="Filtrar por mês" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-slate-100 shadow-lg">
                  <SelectItem value="todos">Todos os meses</SelectItem>
                  {pastMonths.map(month => (
                    <SelectItem key={month} value={month.toLowerCase()}>
                      {month.charAt(0).toUpperCase() + month.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
              {pastEvents.length === 0 ? (
                <p className="text-xs py-8 text-center text-slate-400">
                  Nenhum evento passado encontrado para o filtro selecionado.
                </p>
              ) : (
                pastEvents.map(({ dateStr, date, events: dayEvents }) => (
                  <div key={dateStr}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate(date);
                        const diffTime = date.getTime() - now.getTime();
                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                        const offset = Math.floor(diffDays / 7);
                        setWeekOffset(offset);
                        setPastEventsModalOpen(false);
                      }}
                      className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 w-full hover:opacity-80 transition-opacity cursor-pointer text-slate-400"
                    >
                      <CalendarIcon size={10} />
                      {format(date, "EEEE, dd/MM", { locale: ptBR })}
                      <span className="ml-auto text-[9px] font-normal px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {dayEvents.length}
                      </span>
                    </button>
                    <div className="space-y-1.5">
                      {dayEvents.map((evt) => (
                        <div
                          key={evt.id}
                          className="rounded-2xl px-3.5 py-2.5 cursor-pointer hover:shadow-sm transition-all opacity-75 bg-[#f8fafc] hover:bg-[#f1f5f9] border border-slate-100"
                          onClick={() => {
                            handleEventClick(evt, dateStr);
                            setPastEventsModalOpen(false);
                          }}
                        >
                          <p className="text-xs font-bold truncate text-slate-700">
                            {evt.programa?.nome || "Programa removido"}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {evt.programa ? (
                              evt.tipo_evento === "gravacao" && evt.horario_gravacao
                                ? `🎬 ${evt.horario_gravacao} (gravação)`
                                : `${evt.programa.horario_inicio} - ${evt.programa.horario_fim}`
                            ) : ""}
                            {evt.local ? ` • ${evt.local}` : ""}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {evt.status === "concluido" && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                CONCLUÍDO
                              </span>
                            )}
                            {evt.status === "cancelado" && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">
                                CANCELADO
                              </span>
                            )}
                            {evt.recorrencia !== "unico" && (
                              <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                🔁 {recorrenciaLabels[evt.recorrencia]}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>


        {/* Calendar + Events Grid + Today's Feed */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] 2xl:grid-cols-[1fr_360px] gap-5 items-stretch">
          {/* Events + Upcoming */}
          <div className="h-full flex flex-col space-y-4">
            {/* Week schedule (Mon-Sun) - Injected here */}
            <div className="overflow-hidden h-full flex flex-col bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
              {/* Google Agenda style toolbar */}
              <div className="flex items-center gap-2 flex-wrap px-5 py-3.5 border-b border-slate-100 bg-white font-sans">
                <button
                  type="button"
                  onClick={() => { setWeekOffset(0); setSelectedDate(new Date()); }}
                  className="px-4 h-8 rounded-full text-xs font-bold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => setWeekOffset((w) => w - 1)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-700 transition-colors text-base"
                  aria-label="Semana anterior"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setWeekOffset((w) => w + 1)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-700 transition-colors text-base"
                  aria-label="Próxima semana"
                >
                  ›
                </button>
                <span className="text-sm font-bold text-[#002132] capitalize ml-1">
                  {weekEvents.length > 0
                    ? format(weekEvents[0].date, "MMMM 'de' yyyy", { locale: ptBR })
                    : ""}
                </span>
                <span className="text-[11px] font-medium text-slate-400 ml-1">
                  {weekEvents.length > 0 && `${format(weekEvents[0].date, "dd/MM")} – ${format(weekEvents[6].date, "dd/MM")}`}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <span
                    className="px-3.5 h-7 inline-flex items-center rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-700"
                  >
                    Semana
                  </span>
                  <button
                    type="button"
                    onClick={handleExportFeriados}
                    className="px-3.5 h-7 rounded-full text-[10px] font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
                    title="Exportar feriados para o Google Calendar"
                  >
                    <Download size={11} /> Exportar
                  </button>
                </div>
              </div>

              <GoogleWeekGrid<Evento>
                weekDays={weekEvents}
                now={now}
                selectedDate={selectedDate}
                getFeriadoNome={getFeriadoNome}
                onSelectDate={handleSelectDate}
                onEventClick={handleEventClick}
                toGridEvent={toGridEvent}
              />
            </div>



          </div>

          {/* Today's Agenda Timeline Feed (Right side) */}
          <div className="w-full flex flex-col">
            <div className="overflow-hidden h-full flex flex-col bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-100 bg-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-[#002132]">
                    Eventos do Dia
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700">
                    {selectedDayFeedEvents.length}
                  </span>
                </div>
                {isSameDay(selectedDate || now, now) && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-600 border border-blue-200/60 uppercase tracking-wider">
                    Hoje
                  </span>
                )}
              </div>

              {/* Subheader: Selected Date display + Quick Add */}
              <div className="px-5 py-2.5 bg-slate-50/60 border-b border-slate-100/80 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 capitalize">
                  {format(selectedDate || now, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                </span>
                <button
                  type="button"
                  onClick={openNewDialog}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus size={12} /> Novo
                </button>
              </div>

              {/* Feed Content */}
              <div className="p-5 flex-1 overflow-y-auto max-h-[780px] space-y-6 relative">
                {selectedDayFeedEvents.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-slate-400">
                    <CalendarIcon className="w-9 h-9 stroke-[1.5] text-slate-300 mb-2" />
                    <p className="text-xs font-semibold text-slate-600">Nenhum evento agendado</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Nenhum compromisso para esta data.</p>
                    <button
                      type="button"
                      onClick={openNewDialog}
                      className="mt-3 px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-[#002132] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus size={12} /> Agendar Evento
                    </button>
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-5">
                    {/* Vertical timeline continuous line */}
                    <div className="absolute left-2.5 top-2 bottom-2 w-[2px] bg-slate-100 -translate-x-1/2" />

                    {selectedDayFeedEvents.map((evt, idx) => {
                      const startTime = evt.horario_gravacao || evt.programa?.horario_inicio || "Dia Inteiro";
                      const endTime = evt.horario_gravacao_fim || evt.programa?.horario_fim || "";
                      const timeDisplay = endTime ? `${startTime} - ${endTime}` : startTime;
                      const studioOrLocal = evt.local || evt.programa?.estudio || "Estúdio";

                      // Rotating timeline dot colors (blue, amber, emerald, purple, cyan)
                      const dotColors = [
                        "bg-blue-600 ring-blue-100",
                        "bg-amber-500 ring-amber-100",
                        "bg-emerald-500 ring-emerald-100",
                        "bg-purple-600 ring-purple-100",
                        "bg-cyan-500 ring-cyan-100",
                      ];
                      const dotColor = dotColors[idx % dotColors.length];

                      const eventDateStr = format(selectedDate || now, "yyyy-MM-dd");
                      const evtColor = evt.cor || getStoredEventColor(evt.id) || (evt.programa_id ? getStoredEventColor(`prog_${evt.programa_id}`) : null);

                      const presenter = getPresenterForEvent(evt);
                      const presenterPhoto = presenter?.foto || presenter?.foto_url;
                      const presenterInitial = (presenter?.nome || "A").trim().slice(0, 1).toUpperCase();

                      return (
                        <div
                          key={evt.id}
                          onClick={() => handleEventClick(evt, eventDateStr)}
                          className="relative group cursor-pointer transition-all"
                        >
                          {/* Timeline dot marker on the vertical line */}
                          <div
                            className={cn(
                              "absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 border-white ring-4 transition-transform group-hover:scale-125 z-10",
                              !evtColor && dotColor
                            )}
                            style={evtColor ? { backgroundColor: evtColor, boxShadow: `0 0 0 4px ${evtColor}33` } : undefined}
                          />

                          {/* Event body card */}
                          <div
                            className="bg-white group-hover:bg-slate-50/90 rounded-2xl p-3 border border-slate-100 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.02)] group-hover:shadow-md space-y-2.5"
                            style={evtColor ? { borderLeft: `4px solid ${evtColor}` } : undefined}
                          >
                            {/* Title & Time/Location + Excluir Icon */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <h4 className="text-xs md:text-[13px] font-black text-[#002132] group-hover:text-blue-600 transition-colors leading-snug line-clamp-2">
                                  {evt.youtube_titulo || evt.programa?.nome || evt.descricao || "Evento sem título"}
                                </h4>
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mt-1">
                                  <span className="font-semibold text-slate-700">{timeDisplay}</span>
                                  <span>•</span>
                                  <span className="truncate max-w-[150px]">{studioOrLocal}</span>
                                </div>
                              </div>

                              {/* Botão de Excluir */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  requestDelete(evt, eventDateStr);
                                }}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-95 transition-all shrink-0 cursor-pointer"
                                title="Excluir evento"
                                aria-label="Excluir evento"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>

                            {/* Círculo com a foto do apresentador do programa e círculos com a inicial do participante ao lado */}
                            <div className="pt-2 border-t border-slate-100/80 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {/* Círculo com a foto do apresentador do programa */}
                                {presenterPhoto ? (
                                  <div
                                    title={presenter?.nome ? `Apresentador: ${presenter.nome}` : "Apresentador"}
                                    className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden border border-slate-200 shadow-sm shrink-0 bg-[#0055ff] ring-2 ring-white"
                                  >
                                    <img
                                      src={presenterPhoto}
                                      alt={presenter?.nome || "Apresentador"}
                                      className="w-full h-full object-cover object-top"
                                    />
                                  </div>
                                ) : (
                                  <div
                                    title={presenter?.nome ? `Apresentador: ${presenter.nome}` : "Apresentador"}
                                    className="w-7 h-7 rounded-full bg-[#0055ff] text-white text-[10px] font-black flex items-center justify-center border border-white shadow-sm shrink-0 ring-2 ring-white"
                                  >
                                    {presenter ? presenterInitial : <User size={13} className="text-white" />}
                                  </div>
                                )}

                                {/* Círculo com a letra inicial do participante ao lado */}
                                {evt.participantes && evt.participantes.length > 0 && (
                                  <div
                                    className="flex -space-x-1.5 overflow-hidden shrink-0"
                                    title={`${evt.participantes.length} participante(s)`}
                                  >
                                    {evt.participantes.slice(0, 4).map((p, pIdx) => {
                                      const pInitial = (p.nome || "?").trim().slice(0, 1).toUpperCase();
                                      return (
                                        <div
                                          key={pIdx}
                                          className="inline-flex items-center justify-center w-6 h-6 rounded-full ring-2 ring-white bg-slate-200 text-slate-700 text-[9px] font-bold"
                                          title={`Participante: ${p.nome}`}
                                        >
                                          {pInitial}
                                        </div>
                                      );
                                    })}
                                    {evt.participantes.length > 4 && (
                                      <div className="inline-flex items-center justify-center w-6 h-6 rounded-full ring-2 ring-white bg-slate-300 text-slate-800 text-[8px] font-black">
                                        +{evt.participantes.length - 4}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Tag badge (like image 1) */}
                            {(evt.tipo_evento || evt.status) && (
                              <div className="pt-0.5">
                                <span
                                  className={cn(
                                    "text-[10px] font-semibold px-2.5 py-1 rounded-lg inline-flex items-center gap-1 leading-none",
                                    evt.tipo_evento === "gravacao"
                                      ? "bg-purple-50 text-purple-700 border border-purple-200/60"
                                      : evt.tipo_evento === "externo"
                                        ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                                        : evt.status === "cancelado"
                                          ? "bg-rose-50 text-rose-700 border border-rose-200/60"
                                          : "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                                  )}
                                >
                                  {evt.tipo_evento === "gravacao"
                                    ? "🎬 Gravação"
                                    : evt.tipo_evento === "externo"
                                      ? "📍 Externo"
                                      : evt.status === "cancelado"
                                        ? "✕ Cancelado"
                                        : "🔴 Ao Vivo"}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 text-[10px] text-center opacity-50">
          * Use o calendário e a programação acima para navegar entre as datas.
        </div>
      </div>
      </div>
    </div>
  );
}
