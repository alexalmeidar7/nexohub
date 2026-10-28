import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3, Gift, History, Truck, Siren, Tag, MonitorPlay, Search,
  CalendarDays, Clock3, RefreshCw, Loader2, AlertCircle, Package, Download,
  CheckCircle2, CircleX, UserRound, Image as ImageIcon, Trophy, Headphones, Video, Radio
} from "lucide-react";

type ReportKey = "estoque" | "sorteios" | "entregas" | "blitz" | "comercial" | "vmix" | "audiencia";
type AnyRow = Record<string, any>;

const REPORTS: { key: ReportKey; label: string; description: string; icon: typeof Gift }[] = [
  { key: "estoque", label: "Prêmios em estoque", description: "Prêmios não retirados que retornaram ao estoque", icon: Package },
  { key: "sorteios", label: "Sorteios realizados", description: "Histórico de ganhadores e situação da entrega", icon: Gift },
  { key: "entregas", label: "Entregas de prêmios", description: "Comprovantes e fotos dos ganhadores", icon: Truck },
  { key: "blitz", label: "Blitz", description: "Ações realizadas e seus horários", icon: Siren },
  { key: "comercial", label: "Comercial", description: "Promoções ativas no período", icon: Tag },
  { key: "vmix", label: "vMix", description: "Uso dos botões personalizados por locutor", icon: MonitorPlay },
  { key: "audiencia", label: "Audiência", description: "Audiência de áudio e vídeo por programa", icon: BarChart3 },
];

const localKey = (name: string, userId: string) => `nexohub_${name}_${userId}`;
function readLocal(name: string, userId: string): AnyRow[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(localKey(name, userId)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function dateOnly(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? value + "T12:00:00" : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}
function dateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function timeOnly(value?: string | null) {
  if (!value) return "—";
  return value.length > 5 ? value.slice(0, 5) : value;
}
function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function TableEmpty({ text }: { text: string }) {
  return <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center"><AlertCircle size={24} className="text-slate-300" /><p className="text-sm font-semibold text-slate-500">{text}</p></div>;
}
function Th({ children }: { children: React.ReactNode }) { return <th className="whitespace-nowrap px-4 py-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{children}</th>; }
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <td className={`px-4 py-3 text-xs text-slate-700 ${className}`}>{children}</td>; }
function Status({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{ok ? <CheckCircle2 size={12} /> : <CircleX size={12} />}{ok ? yes : no}</span>;
}

export default function RelatoriosPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const userId = effectiveUserId || user?.id || "";
  // O relatório da conta principal também inclui cliques do usuário autenticado quando ele opera como subusuário.
  const reportUserIds = Array.from(new Set([effectiveUserId, user?.id].filter((id): id is string => Boolean(id))));
  const reportUserIdsKey = reportUserIds.join(",");
  const [active, setActive] = useState<ReportKey>("estoque");
  const [prizesMenuOpen, setPrizesMenuOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [prizes, setPrizes] = useState<AnyRow[]>([]);
  const [draws, setDraws] = useState<AnyRow[]>([]);
  const [blitzes, setBlitzes] = useState<AnyRow[]>([]);
  const [promos, setPromos] = useState<AnyRow[]>([]);
  const [sponsorLogos, setSponsorLogos] = useState<AnyRow[]>([]);
  const [programCatalog, setProgramCatalog] = useState<AnyRow[]>([]);
  const [commercialAudience, setCommercialAudience] = useState<AnyRow[]>([]);
  const [vmixEvents, setVmixEvents] = useState<AnyRow[]>([]);
  const [vmixUnavailable, setVmixUnavailable] = useState(false);
  const [vmixStartDate, setVmixStartDate] = useState(() => {
    const date = new Date(); date.setDate(date.getDate() - 29);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  });
  const [vmixEndDate, setVmixEndDate] = useState(todayISO);
  const [audienceDate, setAudienceDate] = useState(todayISO);
  const [blitzDate, setBlitzDate] = useState("");
  const [audienceRows, setAudienceRows] = useState<AnyRow[]>([]);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceUnavailable, setAudienceUnavailable] = useState(false);
  const [liveAudience, setLiveAudience] = useState<{ program: string; audio: number | null; video: number | null; updatedAt: string; configured: boolean } | null>(null);

  const load = async (manual = false) => {
    if (!userId) { setLoading(false); return; }
    if (manual) setRefreshing(true); else setLoading(true);
    const [p, d, b, c, v, logos, programRows, audienceHistory] = await Promise.all([
      supabase.from("sorteio_premios").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("sorteio_sorteios").select("*").eq("user_id", userId).order("data_sorteio", { ascending: false }),
      supabase.from("blitz_promocionais").select("*").eq("user_id", userId).order("dia", { ascending: false }),
      supabase.from("promocoes").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      (supabase.from("vmix_button_interactions" as any).select("*").in("user_id", reportUserIds).order("created_at", { ascending: false }).limit(1000) as any),
      supabase.from("logos_patrocinadores").select("*").eq("user_id", userId).eq("excluido", false).order("created_at", { ascending: false }),
      supabase.from("programas").select("id, nome, horario_inicio, horario_fim, dias_semana").eq("user_id", userId),
      supabase.from("audiencia_historico").select("created_at, programa, audio, video").eq("user_id", userId).order("created_at", { ascending: false }).limit(5000),
    ]);
    const localPrizes = readLocal("premios", userId);
    const localDraws = readLocal("sorteios", userId);
    const localBlitz = readLocal("blitz", userId);
    const localPromos = readLocal("promocoes", userId);
    // A consulta online bem-sucedida é autoritativa, inclusive quando retorna
    // uma lista vazia. Usar cache antigo nesse caso fazia itens excluídos
    // reaparecerem nos relatórios.
    setPrizes(p.error ? localPrizes : (p.data || []) as AnyRow[]);
    setDraws(d.error ? localDraws : (d.data || []) as AnyRow[]);
    setBlitzes(b.error ? localBlitz : (b.data || []) as AnyRow[]);
    setPromos(c.error ? localPromos : (c.data || []) as AnyRow[]);
    setSponsorLogos((logos.data || []) as AnyRow[]);
    setProgramCatalog((programRows.data || []) as AnyRow[]);
    setCommercialAudience((audienceHistory.data || []) as AnyRow[]);
    setVmixEvents(v.data || []);
    setVmixUnavailable(Boolean(v.error));
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { void load(); }, [userId, reportUserIdsKey]);

  useEffect(() => {
    if (!reportUserIds.length) return;
    let disposed = false;
    let refreshInFlight = false;

    // Realtime atualiza imediatamente; a consulta periódica recupera falhas do websocket.
    // O vMix grava com user.id, enquanto o relatório pode receber o ID do titular da conta.
    const refreshVmixEvents = async () => {
      if (disposed || refreshInFlight) return;
      refreshInFlight = true;
      try {
        const { data, error } = await (supabase.from("vmix_button_interactions" as any) as any)
          .select("*")
          .in("user_id", reportUserIds)
          .order("created_at", { ascending: false })
          .limit(1000);
        if (disposed) return;
        if (error) {
          setVmixUnavailable(true);
          console.warn("Falha ao atualizar relatório vMix:", error.message);
          return;
        }
        setVmixEvents((data || []) as AnyRow[]);
        setVmixUnavailable(false);
      } catch (error) {
        if (!disposed) console.warn("Falha ao atualizar relatório vMix:", error);
      } finally {
        refreshInFlight = false;
      }
    };

    const channels = reportUserIds.map((id) =>
      supabase.channel(`vmix-report-${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "vmix_button_interactions", filter: `user_id=eq.${id}` }, (payload: any) => {
          if (payload.eventType === "INSERT" && payload.new) {
            const inserted = payload.new as AnyRow;
            setVmixEvents(current => [inserted, ...current.filter(row => row.id !== inserted.id)].slice(0, 1000));
            setVmixUnavailable(false);
          } else {
            void refreshVmixEvents();
          }
        })
        .subscribe((status: string) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            console.warn(`Canal Realtime do relatório vMix indisponível para ${id}:`, status);
          }
        })
    );

    // Fallback em até 3 segundos quando o Realtime não estiver disponível.
    const pollTimer = window.setInterval(() => {
      if (active === "vmix") void refreshVmixEvents();
    }, 3000);

    return () => {
      disposed = true;
      window.clearInterval(pollTimer);
      channels.forEach(channel => { void supabase.removeChannel(channel); });
    };
  }, [reportUserIdsKey, active]);

  useEffect(() => {
    if (active !== "audiencia" || !userId) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    let config: AnyRow | null = null;
    let programs: AnyRow[] = [];
    let latestAudio: number | null = null;
    let latestVideo: number | null = null;
    let lastPersistedAt = 0;
    let persistInFlight = false;
    let currentProgram = "Programa não identificado";
    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const getCurrentProgram = () => {
      const now = new Date();
      const day = dayNames[now.getDay()];
      const hhmm = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
      const matching = programs.filter(p => {
        if (p.ativo === false) return false;
        const days = Array.isArray(p.dias_semana) ? p.dias_semana : [];
        const start = String(p.horario_inicio || "").slice(0, 5);
        const end = String(p.horario_fim || "").slice(0, 5);
        if (!days.includes(day) || !start || !end) return false;
        return start <= end ? hhmm >= start && hhmm < end : hhmm >= start || hhmm < end;
      });
      return matching[0]?.nome || "Programa não identificado";
    };
    const poll = async () => {
      if (!config) return;
      currentProgram = getCurrentProgram();
      const normalizeSources = (key: "audio" | "video") => {
        const arr = Array.isArray(config?.[key === "audio" ? "audio_sources" : "video_sources"])
          ? config[key === "audio" ? "audio_sources" : "video_sources"] as AnyRow[] : [];
        const primaryUrl = String(config?.[key === "audio" ? "audio_stream_api_url" : "video_stream_api_url"] || "").trim();
        const primaryXpath = String(config?.[key === "audio" ? "audio_stream_xpath" : "video_stream_xpath"] || "").trim();
        const sources = [{ url: primaryUrl, xpath: primaryXpath }, ...arr.map(s => ({ url: String(s?.url || "").trim(), xpath: String(s?.xpath || "").trim() }))].filter(s => s.url);
        return sources.filter((s, i, all) => all.findIndex(x => x.url === s.url) === i);
      };
      const audioSources = normalizeSources("audio");
      const videoSources = normalizeSources("video");
      const countAudio = async () => {
        if (!audioSources.length) return null;
        const results = await Promise.all(audioSources.map(async source => {
          try {
            const body: AnyRow = { userId, urls: [source.url] };
            if (source.xpath) body.xpath = source.xpath;
            const { data } = await supabase.functions.invoke("count-stream-listeners", { body });
            return (data as any)?.ok && typeof (data as any).listeners === "number" ? (data as any).listeners as number : null;
          } catch { return null; }
        }));
        return results.some(n => n !== null) ? results.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null;
      };
      const countVideo = async () => {
        if (!videoSources.length) return null;
        const results = await Promise.all(videoSources.map(async source => {
          try {
            const body: AnyRow = { userId, urls: [source.url] };
            if (source.xpath) body.xpath = source.xpath;
            const { data } = await supabase.functions.invoke("count-video-viewers", { body });
            return (data as any)?.ok && typeof (data as any).viewers === "number" ? (data as any).viewers as number : null;
          } catch { return null; }
        }));
        return results.some(n => n !== null) ? results.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null;
      };
      const [audio, video] = await Promise.all([countAudio(), countVideo()]);
      if (cancelled) return;
      if (audio !== null) latestAudio = audio;
      if (video !== null) latestVideo = video;
      const now = new Date().toISOString();
      setLiveAudience({
        program: currentProgram,
        audio: latestAudio,
        video: latestVideo,
        updatedAt: now,
        configured: audioSources.length > 0 || videoSources.length > 0,
      });

      // Persiste os picos observados pelo próprio relatório no banco, sem depender
      // de o widget da página inicial estar aberto. O coletor em background continua
      // responsável pela coleta quando nenhum navegador está aberto.
      const nowMs = Date.now();
      if (
        !persistInFlight &&
        (latestAudio !== null || latestVideo !== null) &&
        nowMs - lastPersistedAt >= 5 * 60 * 1000
      ) {
        persistInFlight = true;
        lastPersistedAt = nowMs;
        try {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const snapshotTime = new Date().toISOString();
          const { data: existingRows, error: lookupError } = await supabase
            .from("audiencia_historico")
            .select("id, audio, video, created_at")
            .eq("user_id", userId as any)
            .eq("programa", currentProgram)
            .gte("created_at", todayStart.toISOString())
            .order("created_at", { ascending: true })
            .limit(1);

          if (lookupError) {
            console.error("Relatório de audiência: falha ao consultar histórico para gravação:", lookupError.message);
          } else {
            const existing = existingRows?.[0] as AnyRow | undefined;
            const audioPeak = Math.max(Number(existing?.audio) || 0, latestAudio ?? 0);
            const videoPeak = Math.max(Number(existing?.video) || 0, latestVideo ?? 0);
            if (existing?.id) {
              if (audioPeak !== (Number(existing.audio) || 0) || videoPeak !== (Number(existing.video) || 0)) {
                const { error: updateError } = await supabase
                  .from("audiencia_historico")
                  .update({ audio: audioPeak, video: videoPeak })
                  .eq("id", existing.id);
                if (updateError) {
                  console.error("Relatório de audiência: falha ao atualizar pico:", updateError.message);
                } else if (audienceDate === todayISO()) {
                  setAudienceRows(rows => rows.map(row =>
                    row.created_at === existing.created_at && row.programa === currentProgram
                      ? { ...row, audio: audioPeak, video: videoPeak }
                      : row
                  ));
                }
              }
            } else {
              const { data: inserted, error: insertError } = await supabase
                .from("audiencia_historico")
                .insert({
                  user_id: userId,
                  programa: currentProgram,
                  audio: audioPeak,
                  video: videoPeak,
                  youtube: 0,
                  created_at: snapshotTime,
                } as any)
                .select("created_at, programa, audio, video")
                .maybeSingle();
              if (insertError) {
                console.error("Relatório de audiência: falha ao gravar histórico:", insertError.message);
              } else if (inserted && audienceDate === todayISO()) {
                setAudienceRows(rows => [...rows, inserted as AnyRow]);
              }
            }
          }
        } catch (error) {
          console.error("Relatório de audiência: erro inesperado ao persistir os dados:", error);
        } finally {
          persistInFlight = false;
        }
      }
    };
    const initialize = async () => {
      const [{ data: configData, error: configError }, { data: programData }] = await Promise.all([
        supabase.from("empresa_config").select("audio_stream_api_url, audio_stream_xpath, video_stream_api_url, video_stream_xpath, audio_sources, video_sources").eq("user_id", userId as any).maybeSingle(),
        supabase.from("programas").select("nome, dias_semana, horario_inicio, horario_fim, ativo").eq("user_id", userId as any),
      ]);
      if (cancelled) return;
      config = (configData || {}) as AnyRow;
      programs = (programData || []) as AnyRow[];
      if (configError) {
        setAudienceUnavailable(true);
        setLiveAudience(null);
        return;
      }
      await poll();
      if (cancelled) return;
      interval = setInterval(() => { void poll(); }, 30_000);
    };
    void initialize();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [active, userId, audienceDate]);

  useEffect(() => {
    let lastDay = todayISO();
    const timer = setInterval(() => {
      const today = todayISO();
      if (today !== lastDay) {
        const previousDay = lastDay;
        setAudienceDate(current => current === previousDay ? today : current);
        lastDay = today;
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (active !== "audiencia" || !userId) return;
    let cancelled = false;
    const loadAudience = async () => {
      setAudienceLoading(true);
      setAudienceUnavailable(false);
      const start = new Date(`${audienceDate}T00:00:00`);
      const end = new Date(`${audienceDate}T23:59:59.999`);
      const { data, error } = await supabase
        .from("audiencia_historico")
        .select("created_at, programa, audio, video")
        .eq("user_id", userId as any)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setAudienceRows((data || []) as AnyRow[]);
      setAudienceUnavailable(Boolean(error));
      setAudienceLoading(false);
    };
    void loadAudience();
    return () => { cancelled = true; };
  }, [active, audienceDate, userId]);

  const prizeById = useMemo(() => new Map(prizes.map(p => [p.id, p])), [prizes]);
  const filtered = <T extends AnyRow,>(rows: T[], fields: string[]) => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    if (!q) return rows;
    return rows.filter(row => fields.some(field => String(row[field] ?? "").toLocaleLowerCase("pt-BR").includes(q)));
  };
  const expiredDraws = useMemo(() => {
    const now = Date.now();
    return draws.filter(d => !d.entregue && (d.expirado === true || (d.data_expiracao && new Date(d.data_expiracao).getTime() < now)));
  }, [draws]);
  const deliveredDraws = useMemo(() => draws.filter(d => d.entregue === true), [draws]);
  const activePromos = useMemo(() => {
    const today = todayISO();
    return promos.filter(p => p.ativo !== false && (!p.data_inicio || p.data_inicio <= today) && (!p.data_fim || p.data_fim >= today));
  }, [promos]);
  const vmixPeriodEvents = useMemo(() => {
    const start = new Date(`${vmixStartDate}T00:00:00`);
    const end = new Date(`${vmixEndDate}T23:59:59.999`);
    return vmixEvents.filter(event => {
      if (!event.created_at) return false;
      const created = new Date(event.created_at);
      return !Number.isNaN(created.getTime()) && created >= start && created <= end;
    });
  }, [vmixEvents, vmixStartDate, vmixEndDate]);

  const vmixRanking = useMemo(() => {
    const totals = new Map<string, { name: string; clicks: number; points: number; lastClick: string; buttons: Set<string> }>();
    vmixPeriodEvents.forEach(event => {
      const name = String(event.locutor_nome || event.apresentador_nome || event.user_email || "Locutor não identificado");
      const current = totals.get(name) || { name, clicks: 0, points: 0, lastClick: event.created_at || "", buttons: new Set<string>() };
      current.clicks += 1;
      current.points += Number(event.points) || 0;
      if (event.created_at && (!current.lastClick || event.created_at > current.lastClick)) current.lastClick = event.created_at;
      if (event.button_name) current.buttons.add(String(event.button_name));
      totals.set(name, current);
    });
    return Array.from(totals.values()).sort((a, b) => b.points - a.points || b.clicks - a.clicks);
  }, [vmixPeriodEvents]);
  const vmixTotalPoints = useMemo(() => vmixPeriodEvents.reduce((sum, event) => sum + (Number(event.points) || 0), 0), [vmixPeriodEvents]);

  const audienceByProgram = useMemo(() => {
    const groups = new Map<string, { program: string; audio: number; video: number; lastSeen: string }>();
    for (const row of audienceRows) {
      const program = String(row.programa || "").trim() || "Programa não identificado";
      const audio = Math.max(0, Number(row.audio) || 0);
      const video = Math.max(0, Number(row.video) || 0);
      const current = groups.get(program) || { program, audio: 0, video: 0, lastSeen: "" };
      current.audio = Math.max(current.audio, audio);
      current.video = Math.max(current.video, video);
      if (row.created_at && row.created_at > current.lastSeen) current.lastSeen = row.created_at;
      groups.set(program, current);
    }
    return Array.from(groups.values()).map(row => ({ ...row, total: row.audio + row.video }))
      .sort((a, b) => b.total - a.total || a.program.localeCompare(b.program, "pt-BR"));
  }, [audienceRows]);
  const topAudiencePrograms = audienceByProgram.slice(0, 3);

  const exportVmixPdf = () => {
    if (!vmixPeriodEvents.length) return;
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.text("HOUSE MIX - RELATORIO VMIX", 14, 16);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
    pdf.text(`Periodo: ${dateOnly(vmixStartDate)} a ${dateOnly(vmixEndDate)}`, 14, 23);
    pdf.text(`Cliques: ${vmixPeriodEvents.length} | Pontos: ${vmixTotalPoints.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`, 14, 29);
    pdf.setFont("helvetica", "bold"); pdf.text("RANKING DE LOCUTORES", 14, 38);
    let y = 44; pdf.setFontSize(8);
    ["POS.", "LOCUTOR", "CLIQUES", "PONTOS"].forEach((v, i) => pdf.text(v, [14, 28, 125, 155][i], y));
    y += 5; pdf.setFont("helvetica", "normal");
    vmixRanking.forEach((item, index) => {
      if (y > 185) { pdf.addPage(); y = 16; }
      pdf.text(`${index + 1}º`, 14, y); pdf.text(item.name.slice(0, 50), 28, y);
      pdf.text(String(item.clicks), 125, y); pdf.text(item.points.toLocaleString("pt-BR", { maximumFractionDigits: 1 }), 155, y); y += 5;
    });
    y += 5; if (y > 180) { pdf.addPage(); y = 16; }
    pdf.setFont("helvetica", "bold"); pdf.text("REGISTROS DE CLIQUES", 14, y); y += 6; pdf.setFontSize(7);
    const columns = [14, 37, 60, 100, 160, 225, 255];
    const headers = ["DATA", "HORA", "PROGRAMA", "LOCUTOR", "BOTAO", "CATEGORIA", "PONTOS"];
    headers.forEach((header, i) => pdf.text(header, columns[i], y)); y += 5; pdf.setFont("helvetica", "normal");
    vmixPeriodEvents.forEach(event => {
      if (y > 195) { pdf.addPage(); y = 16; headers.forEach((header, i) => pdf.text(header, columns[i], y)); y += 5; }
      const created = event.created_at ? new Date(event.created_at) : null;
      const values = [created ? created.toLocaleDateString("pt-BR") : "—", created ? created.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—", String(event.program_name || "—").slice(0, 22), String(event.locutor_nome || event.apresentador_nome || event.user_email || "Não identificado").slice(0, 30), String(event.button_name || "Botão personalizado").slice(0, 28), String(event.button_category || "OUTROS").slice(0, 18), (Number(event.points) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })];
      values.forEach((value, i) => pdf.text(value, columns[i], y)); y += 4.5;
    });
    pdf.save(`house-mix-relatorio-vmix-${vmixStartDate}-a-${vmixEndDate}.pdf`);
  };

  const changeVmixStartDate = (value: string) => {
    if (value && vmixEndDate && (new Date(vmixEndDate).getTime() - new Date(value).getTime()) / 86400000 > 29) {
      const limit = new Date(value); limit.setDate(limit.getDate() + 29);
      setVmixEndDate(new Date(limit.getTime() - limit.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
    }
    setVmixStartDate(value);
  };
  const changeVmixEndDate = (value: string) => {
    if (value && vmixStartDate && (new Date(value).getTime() - new Date(vmixStartDate).getTime()) / 86400000 > 29) {
      const limit = new Date(value); limit.setDate(limit.getDate() - 29);
      setVmixStartDate(new Date(limit.getTime() - limit.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
    }
    setVmixEndDate(value);
  };

  const activeReport = REPORTS.find(r => r.key === active)!;
  const Icon = activeReport.icon;

  return (
    <div className="min-h-full bg-slate-50 p-4 md:p-6" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.2em] text-blue-600"><BarChart3 size={14} /> Central de relatórios</div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Relatórios</h1>
            <p className="mt-1 text-xs text-slate-500">Acompanhe sorteios, entregas, ações comerciais e uso do vMix em um só lugar.</p>
          </div>
          <button onClick={() => void load(true)} disabled={refreshing} className="inline-flex h-10 items-center gap-2 rounded-full bg-blue-600 px-4 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-60">
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar dados
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[245px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <p className="px-3 pb-2 pt-3 text-[9px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Escolha um relatório</p>
            <nav className="space-y-1">
              <button
                onClick={() => setPrizesMenuOpen(value => !value)}
                aria-expanded={prizesMenuOpen}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${["sorteios", "entregas", "estoque"].includes(active) ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${["sorteios", "entregas", "estoque"].includes(active) ? "bg-white/15" : "bg-slate-100 text-blue-600"}`}><Gift size={17} /></span>
                <span className="min-w-0 flex-1"><span className="block text-[11px] font-extrabold uppercase">Sorteios de Prêmios</span><span className={`mt-1 block text-[9px] leading-snug ${["sorteios", "entregas", "estoque"].includes(active) ? "text-blue-100" : "text-slate-400"}`}>Sorteios, entregas e controle de estoque</span></span>
                <span className="text-xs font-bold">{prizesMenuOpen ? "−" : "+"}</span>
              </button>
              {prizesMenuOpen && <div className="ml-4 space-y-1 border-l-2 border-slate-100 pl-3 py-1">
                {REPORTS.filter(report => ["sorteios", "entregas", "estoque"].includes(report.key)).map(report => {
                  const ItemIcon = report.icon;
                  const selected = active === report.key;
                  const label = report.key === "sorteios" ? "Sorteios realizados" : report.key === "entregas" ? "Entregas" : "Estoque de prêmios";
                  return <button key={report.key} onClick={() => { setActive(report.key); setSearch(""); }} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition ${selected ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
                    <ItemIcon size={15} />
                    <span className="text-[10px] font-extrabold uppercase">{label}</span>
                  </button>;
                })}
              </div>}
              {REPORTS.filter(report => ["blitz", "comercial", "vmix", "audiencia"].includes(report.key)).map(report => {
                const ItemIcon = report.icon;
                const selected = active === report.key;
                return <button key={report.key} onClick={() => { setActive(report.key); setSearch(""); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${selected ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-white/15" : "bg-slate-100 text-blue-600"}`}><ItemIcon size={17} /></span>
                  <span className="min-w-0"><span className="block text-[11px] font-extrabold uppercase">{report.label}</span><span className={`mt-1 block text-[9px] leading-snug ${selected ? "text-blue-100" : "text-slate-400"}`}>{report.description}</span></span>
                </button>;
              })}
            </nav>
          </aside>

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Icon size={21} /></div><div><h2 className="text-base font-black uppercase tracking-tight text-slate-900">{activeReport.label}</h2><p className="mt-1 text-[11px] text-slate-500">{activeReport.description}</p></div></div>
              <div className="relative w-full sm:w-64"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar neste relatório..." className="h-10 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-4 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div>
            </div>

            {loading ? <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500"><Loader2 size={16} className="animate-spin" /> Carregando relatórios...</div> : (
              <>
                {active === "estoque" && <div className="space-y-5">
                  {filtered(prizes, ["nome", "descricao"]).length ? <div>
                    <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-700">Prêmios cadastrados em estoque</h3><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">{filtered(prizes, ["nome", "descricao"]).length} prêmio(s)</span></div>
                    <div className="overflow-x-auto rounded-xl border border-slate-100"><table className="w-full"><thead className="bg-slate-50"><tr><Th>Prêmio</Th><Th>Descrição</Th><Th>Quantidade em estoque</Th><Th>Validade para retirada</Th><Th>Cadastro</Th></tr></thead><tbody>{filtered(prizes, ["nome", "descricao"]).map(prize => <tr key={prize.id} className="border-t border-slate-100"><Td><div className="flex items-center gap-3">{prize.imagem_url ? <img src={prize.imagem_url} alt="" className="h-10 w-10 rounded-lg border border-slate-100 object-cover" onError={e => { e.currentTarget.style.display = "none"; }} /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Gift size={17} /></div>}<span className="font-bold text-slate-900">{prize.nome || "Prêmio sem nome"}</span></div></Td><Td>{prize.descricao || "—"}</Td><Td><span className="inline-flex min-w-10 items-center justify-center rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{Math.max(0, Number(prize.quantidade_estoque ?? prize.estoque ?? 0) || 0)}</span></Td><Td>{Number(prize.dias_validade) > 0 ? `${prize.dias_validade} dia(s)` : "—"}</Td><Td>{dateTime(prize.created_at)}</Td></tr>)}</tbody></table></div>
                  </div> : <TableEmpty text="Nenhum prêmio cadastrado encontrado para esta emissora." />}
                  {expiredDraws.length > 0 && <div><h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-700">Sorteios vencidos e não retirados — retornaram ao estoque</h3><div className="overflow-x-auto rounded-xl border border-slate-100"><table className="w-full"><thead className="bg-slate-50"><tr><Th>Prêmio</Th><Th>Ganhador</Th><Th>Data do sorteio</Th><Th>Prazo encerrado</Th><Th>Status</Th></tr></thead><tbody>{filtered(expiredDraws, ["nome_ganhador", "programa_nome", "observacoes", "premio_nome"]).map(d => <tr key={d.id} className="border-t border-slate-100"><Td><div className="font-bold text-slate-900">{prizeById.get(d.premio_id)?.nome || d.premio_nome || "Prêmio não identificado"}</div></Td><Td>{d.nome_ganhador || "—"}</Td><Td>{dateTime(d.data_sorteio)}</Td><Td>{dateTime(d.data_expiracao)}</Td><Td><Status ok={false} yes="Retirado" no="Retornou ao estoque" /></Td></tr>)}</tbody></table></div></div>}
                </div>}

                {active === "sorteios" && (draws.length ? <div className="overflow-x-auto rounded-xl border border-slate-100"><table className="w-full"><thead className="bg-slate-50"><tr><Th>Dia e horário</Th><Th>Locutor / programa</Th><Th>Ganhador</Th><Th>Prêmio</Th><Th>Retirada</Th></tr></thead><tbody>{filtered(draws, ["nome_ganhador", "programa_nome", "apresentador_nome", "observacoes"]).map(d => <tr key={d.id} className="border-t border-slate-100"><Td>{dateTime(d.data_sorteio)}</Td><Td><div className="font-semibold">{d.apresentador_nome || d.locutor_nome || "—"}</div><div className="mt-1 text-[10px] text-slate-400">{d.programa_nome || "Programa não informado"}</div></Td><Td><div className="font-bold text-slate-900">{d.nome_ganhador || "—"}</div></Td><Td>{prizeById.get(d.premio_id)?.nome || d.premio_nome || "—"}</Td><Td><Status ok={Boolean(d.entregue)} yes="Retirado" no="Pendente" /></Td></tr>)}</tbody></table></div> : <TableEmpty text="Ainda não há sorteios registrados." />)}

                {active === "entregas" && (deliveredDraws.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtered(deliveredDraws, ["nome_ganhador", "apresentador_nome", "programa_nome"]).map(d => <article key={d.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex h-36 items-center justify-center bg-slate-100">{d.foto_entrega_url ? <img src={d.foto_entrega_url} alt={d.nome_ganhador || "Foto do ganhador"} className="h-full w-full object-cover" loading="lazy" onError={e => { const img = e.currentTarget; img.onerror = null; img.style.display = "none"; const fallback = img.nextElementSibling as HTMLElement | null; if (fallback) fallback.style.display = "flex"; }} /> : null}<div className={`h-full w-full flex-col items-center justify-center gap-2 text-slate-400 ${d.foto_entrega_url ? "hidden" : "flex"}`}><ImageIcon size={30} /><span className="text-[10px]">Sem imagem disponível</span></div></div><div className="p-4"><div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Data da entrega</div><div className="mt-1 text-xs font-bold text-slate-800">{dateTime(d.data_entrega || d.data_sorteio)}</div><div className="mt-3 flex items-center gap-2 text-sm font-black text-slate-900"><UserRound size={15} className="text-blue-600" />{d.nome_ganhador || "Ganhador não informado"}</div><div className="mt-1 text-[10px] text-slate-500">{prizeById.get(d.premio_id)?.nome || "Prêmio"}</div></div></article>)}</div> : <TableEmpty text="Nenhuma entrega de prêmio registrada." />)}

                {active === "blitz" && (() => {
                  const completed = blitzes.filter(b => b.realizada === true && (!blitzDate || String(b.dia || "").slice(0, 10) === blitzDate));
                  const rows = filtered(completed, ["cliente", "equipe", "observacoes"]);
                  return <div className="space-y-3">
                    <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div>
                        <label htmlFor="blitz-report-date" className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><CalendarDays size={14} className="text-blue-600" /> Filtrar blitz por dia</label>
                        <input id="blitz-report-date" type="date" value={blitzDate} max={todayISO()} onChange={e => setBlitzDate(e.target.value)} className="h-10 w-full min-w-[210px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                      </div>
                      <button type="button" onClick={() => setBlitzDate("")} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700">Todas as datas</button>
                      <span className="text-[10px] font-semibold text-slate-400">{rows.length} registro(s)</span>
                    </div>
                    {rows.length ? <div className="max-h-[340px] overflow-auto rounded-xl border border-slate-100">
                      <table className="w-full">
                        <thead className="sticky top-0 z-10 bg-slate-50"><tr><Th>Dia</Th><Th>Cliente / ação</Th><Th>Hora inicial</Th><Th>Hora final</Th><Th>Equipe</Th></tr></thead>
                        <tbody>{rows.map(b => <tr key={b.id} className="border-t border-slate-100"><Td>{dateOnly(b.dia)}</Td><Td className="font-bold text-slate-900">{b.cliente || "Blitz"}</Td><Td><span className="inline-flex items-center gap-1"><Clock3 size={12} className="text-blue-500" />{timeOnly(b.horario)}</span></Td><Td>{timeOnly(b.horario_fim)}</Td><Td>{b.equipe || "—"}</Td></tr>)}</tbody>
                      </table>
                    </div> : <TableEmpty text={blitzDate ? "Nenhuma blitz realizada encontrada para esse dia." : "Nenhuma blitz realizada encontrada."} />}
                  </div>;
                })()}

                {active === "comercial" && (() => {
                  const today = todayISO();
                  const allPromos = filtered(promos, ["nome", "texto", "oferecimento"]).slice().sort((a, b) => String(b.data_inicio || "").localeCompare(String(a.data_inicio || "")));
                  const getPromoStatus = (p: AnyRow) => p.ativo === false ? "Inativa" : p.data_inicio && p.data_inicio > today ? "Agendada" : p.data_fim && p.data_fim < today ? "Encerrada" : "Ativa";
                  const daysLeft = (value: string) => {
                    if (!value) return null;
                    const end = new Date(`${value.slice(0, 10)}T00:00:00`);
                    const now = new Date(`${today}T00:00:00`);
                    return Math.ceil((end.getTime() - now.getTime()) / 86400000);
                  };
                  const logoRows = filtered(sponsorLogos, ["nome", "programa_nome", "logo_url"]).map(logo => {
                    const linkedProgram = programCatalog.find(p => p.id === logo.programa_id);
                    const programName = String(logo.programa_nome || linkedProgram?.nome || "");
                    const samples = commercialAudience.filter(a => String(a.programa || "").trim().toLocaleLowerCase("pt-BR") === programName.trim().toLocaleLowerCase("pt-BR"));
                    const peakAudio = samples.reduce((max, row) => Math.max(max, Number(row.audio) || 0), 0);
                    const peakVideo = samples.reduce((max, row) => Math.max(max, Number(row.video) || 0), 0);
                    const peakTotal = samples.reduce((max, row) => Math.max(max, (Number(row.audio) || 0) + (Number(row.video) || 0)), 0);
                    return { ...logo, programName, peakAudio, peakVideo, peakTotal, samples: samples.length, remaining: daysLeft(String(logo.data_final || "")) };
                  });
                  return <div className="space-y-6">
                    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3"><div><h3 className="text-xs font-black uppercase tracking-wide text-slate-800">Promoções</h3><p className="mt-1 text-[10px] text-slate-400">Nome, período de veiculação e status</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold text-blue-700">{allPromos.length} registro(s)</span></div>
                      {allPromos.length ? <div className="max-h-[300px] overflow-auto"><table className="w-full"><thead className="sticky top-0 z-10 bg-slate-50"><tr><Th>Nome da promoção</Th><Th>Dia inicial</Th><Th>Dia final</Th><Th>Status</Th></tr></thead><tbody>{allPromos.map(p => { const status = getPromoStatus(p); const good = status === "Ativa"; return <tr key={p.id} className="border-t border-slate-100"><Td className="font-bold text-slate-900">{p.nome || "Promoção sem nome"}</Td><Td>{dateOnly(p.data_inicio)}</Td><Td>{dateOnly(p.data_fim)}</Td><Td><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${good ? "bg-emerald-50 text-emerald-700" : status === "Agendada" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{status}</span></Td></tr>; })}</tbody></table></div> : <TableEmpty text="Nenhuma promoção cadastrada." />}
                    </section>
                    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3"><div><h3 className="text-xs font-black uppercase tracking-wide text-slate-800">Logos</h3><p className="mt-1 text-[10px] text-slate-400">Validade e audiência do programa vinculado</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold text-blue-700">{logoRows.length} registro(s)</span></div>
                      {logoRows.length ? <div className="max-h-[420px] overflow-auto"><table className="w-full"><thead className="sticky top-0 z-10 bg-slate-50"><tr><Th>Nome do arquivo</Th><Th>Data de inclusão</Th><Th>Data de vencimento</Th><Th>Dias a vencer</Th><Th>Programa vinculado</Th><Th>Audiência no horário do programa</Th></tr></thead><tbody>{logoRows.map((logo: any) => { const r = logo.remaining; return <tr key={logo.id} className="border-t border-slate-100"><Td><div className="flex items-center gap-2"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><ImageIcon size={15} /></div><div className="min-w-0"><div className="max-w-[180px] truncate font-bold text-slate-900">{logo.nome || "Logo sem nome"}</div><div className="max-w-[180px] truncate text-[9px] text-slate-400">{logo.programName || "Sem programa vinculado"}</div></div></div></Td><Td>{dateOnly(logo.created_at)}</Td><Td>{dateOnly(logo.data_final)}</Td><Td><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${r !== null && r < 0 ? "bg-rose-50 text-rose-700" : r !== null && r <= 7 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{r === null ? "—" : r < 0 ? `Vencida há ${Math.abs(r)} dia(s)` : r === 0 ? "Vence hoje" : `${r} dia(s)`}</span></Td><Td>{logo.programName || "—"}</Td><Td>{logo.samples ? <div><div className="font-black text-slate-900">{logo.peakTotal.toLocaleString("pt-BR")} total</div><div className="mt-1 text-[9px] text-slate-500">Áudio {logo.peakAudio.toLocaleString("pt-BR")} · Vídeo {logo.peakVideo.toLocaleString("pt-BR")}</div><div className="mt-1 text-[9px] text-slate-400">Pico registrado em {logo.samples} leitura(s)</div></div> : <span className="text-[10px] text-slate-400">Sem histórico de audiência</span>}</Td></tr>; })}</tbody></table></div> : <TableEmpty text="Nenhuma logo de patrocinador cadastrada." />}
                    </section>
                  </div>;
                })()}

                {active === "audiencia" && (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white p-4">
                      <div className="mb-3 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700"><Radio size={15} /> Audiência ao vivo · programa no ar</div>
                      {liveAudience ? <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="min-w-0 flex-1"><div className="text-lg font-black text-slate-900">{liveAudience.program}</div><div className="mt-1 text-[10px] text-slate-500">{liveAudience.configured ? `Atualizado às ${new Date(liveAudience.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · atualização automática a cada 30 segundos` : "Cadastre as URLs dos streamings de áudio e/ou vídeo em Configurações para iniciar a leitura."}</div></div>
                        <div className="grid grid-cols-3 gap-2 lg:min-w-[390px]">
                          <div className="rounded-xl border border-white bg-white px-3 py-2"><div className="text-[9px] font-bold uppercase text-slate-400">Áudio</div><div className="mt-1 text-xl font-black text-blue-700">{liveAudience.audio === null ? "—" : liveAudience.audio.toLocaleString("pt-BR")}</div></div>
                          <div className="rounded-xl border border-white bg-white px-3 py-2"><div className="text-[9px] font-bold uppercase text-slate-400">Vídeo</div><div className="mt-1 text-xl font-black text-violet-700">{liveAudience.video === null ? "—" : liveAudience.video.toLocaleString("pt-BR")}</div></div>
                          <div className="rounded-xl border border-white bg-white px-3 py-2"><div className="text-[9px] font-bold uppercase text-slate-400">Total</div><div className="mt-1 text-xl font-black text-emerald-700">{liveAudience.audio === null && liveAudience.video === null ? "—" : ((liveAudience.audio || 0) + (liveAudience.video || 0)).toLocaleString("pt-BR")}</div></div>
                        </div>
                      </div> : <div className="text-xs text-slate-500"><Loader2 size={14} className="mr-2 inline animate-spin" />Conectando aos streamings cadastrados...</div>}
                    </div>
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
                      <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <label htmlFor="audience-report-date" className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><CalendarDays size={14} className="text-blue-600" /> Selecionar dia</label>
                        <input id="audience-report-date" type="date" value={audienceDate} max={todayISO()} onChange={e => setAudienceDate(e.target.value)} className="h-11 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                        <p className="mt-2 text-[10px] text-slate-400">Mostra o pico de audiência de cada programa no dia selecionado, sem repetir cada alteração do streaming.</p>
                      </div>
                      <div className="w-full rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4 xl:max-w-[390px]">
                        <div className="mb-3 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-amber-700"><Trophy size={15} /> Top 3 programas por audiência</div>
                        {audienceLoading ? <div className="py-5 text-xs text-slate-400">Carregando audiência...</div> : topAudiencePrograms.length ? <div className="space-y-2">
                          {topAudiencePrograms.map((program, index) => <div key={program.program} className="flex items-center gap-3 rounded-xl border border-amber-100/80 bg-white px-3 py-2.5">
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${index === 0 ? "bg-amber-400 text-amber-950" : index === 1 ? "bg-slate-200 text-slate-700" : "bg-orange-100 text-orange-700"}`}>{index + 1}º</div>
                            <div className="min-w-0 flex-1"><div className="truncate text-xs font-extrabold text-slate-800">{program.program}</div><div className="mt-1 text-[9px] text-slate-400">Áudio {program.audio.toLocaleString("pt-BR")} · Vídeo {program.video.toLocaleString("pt-BR")}</div></div>
                            <div className="text-right"><div className="text-lg font-black text-amber-700">{program.total.toLocaleString("pt-BR")}</div><div className="text-[8px] font-bold uppercase text-amber-600">total</div></div>
                          </div>)}
                        </div> : <p className="py-5 text-xs text-slate-400">Sem dados para montar o Top 3 neste dia.</p>}
                      </div>
                    </div>

                    {audienceLoading ? <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500"><Loader2 size={16} className="animate-spin" /> Carregando audiência do dia...</div>
                      : audienceUnavailable ? <TableEmpty text="Não foi possível carregar a audiência. Verifique a conexão com o banco de dados." />
                      : audienceRows.length ? <div className="max-h-[440px] overflow-auto rounded-xl border border-slate-100">
                        <table className="w-full">
                          <thead className="sticky top-0 z-10 bg-slate-50"><tr><Th>Última leitura</Th><Th>Dia</Th><Th>Programa</Th><Th><span className="inline-flex items-center gap-1"><Headphones size={12} /> Pico de audiência áudio</span></Th><Th><span className="inline-flex items-center gap-1"><Video size={12} /> Pico de audiência vídeo</span></Th><Th>Pico total (áudio + vídeo)</Th></tr></thead>
                          <tbody>{audienceByProgram.map((row, index) => {
                            const audio = Math.max(0, Number(row.audio) || 0);
                            const video = Math.max(0, Number(row.video) || 0);
                            const total = audio + video;
                            return <tr key={`${row.lastSeen}-${index}`} className="border-t border-slate-100">
                              <Td><span className="font-bold text-slate-700">{row.lastSeen ? new Date(row.lastSeen).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}</span></Td>
                              <Td>{dateOnly(audienceDate)}</Td>
                              <Td className="font-bold text-slate-900">{row.program}</Td>
                              <Td>{audio.toLocaleString("pt-BR")}</Td>
                              <Td>{video.toLocaleString("pt-BR")}</Td>
                              <Td><span className="inline-flex min-w-16 items-center justify-center rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{total.toLocaleString("pt-BR")}</span></Td>
                            </tr>;
                          })}</tbody>
                        </table>
                      </div> : <TableEmpty text="Nenhum registro de audiência encontrado para o dia selecionado." />}
                  </div>
                )}

                {active === "vmix" && <><div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">De<input type="date" value={vmixStartDate} max={vmixEndDate || todayISO()} onChange={e => changeVmixStartDate(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700" /></label><label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Até<input type="date" value={vmixEndDate} min={vmixStartDate} max={todayISO()} onChange={e => changeVmixEndDate(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700" /></label><span className="pb-2 text-[10px] text-slate-500">Período máximo: 30 dias</span></div><button onClick={exportVmixPdf} disabled={!vmixPeriodEvents.length} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"><Download size={14} /> Exportar PDF</button></div>{vmixPeriodEvents.length ? <><div className="mb-4 grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-blue-50 p-4"><div className="text-[10px] font-bold uppercase text-blue-500">Cliques registrados</div><div className="mt-1 text-2xl font-black text-blue-700">{vmixPeriodEvents.length}</div></div><div className="rounded-xl bg-emerald-50 p-4"><div className="text-[10px] font-bold uppercase text-emerald-600">Pontos acumulados</div><div className="mt-1 text-2xl font-black text-emerald-700">{vmixTotalPoints.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</div></div><div className="rounded-xl bg-slate-50 p-4"><div className="text-[10px] font-bold uppercase text-slate-400">Locutores identificados</div><div className="mt-1 text-2xl font-black text-slate-800">{new Set(vmixEvents.map(e => e.locutor_nome || e.apresentador_nome).filter(Boolean)).size}</div></div><div className="rounded-xl bg-slate-50 p-4"><div className="text-[10px] font-bold uppercase text-slate-400">Botões diferentes</div><div className="mt-1 text-2xl font-black text-slate-800">{new Set(vmixEvents.map(e => e.button_id).filter(Boolean)).size}</div></div></div>{vmixRanking.length > 0 && <div className="mb-4 overflow-hidden rounded-xl border border-slate-100"><div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-600">Ranking de pontuação por locutor</div><div className="divide-y divide-slate-100">{vmixRanking.map((item, index) => <div key={item.name} className="flex items-center gap-3 px-4 py-3"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${index === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{index + 1}º</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-slate-800">{item.name}</div><div className="mt-1 text-[10px] text-slate-400">{item.buttons.size} botão(ões) diferentes · {item.clicks} cliques · último clique {dateTime(item.lastClick)}</div></div><div className="text-right"><div className="text-lg font-black text-emerald-700">{item.points.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</div><div className="text-[9px] font-bold uppercase text-slate-400">pontos</div></div></div>)}</div></div>}<div className="mb-3 flex flex-wrap gap-2 text-[10px] font-bold text-slate-600"><span className="rounded-lg bg-slate-100 px-3 py-2">CAMERAS: 1 ponto</span><span className="rounded-lg bg-slate-100 px-3 py-2">DIVS: 0,5 ponto</span><span className="rounded-lg bg-slate-100 px-3 py-2">COMERCIAL: 1,5 ponto</span><span className="rounded-lg bg-slate-100 px-3 py-2">EFEITOS: 2,5 pontos</span><span className="rounded-lg bg-slate-100 px-3 py-2">QUADROS: 1,5 ponto</span></div><div className="overflow-x-auto rounded-xl border border-slate-100"><table className="w-full"><thead className="bg-slate-50"><tr><Th>Data</Th><Th>Horário</Th><Th>Programa</Th><Th>Locutor</Th><Th>Tecla apertada</Th><Th>Categoria</Th><Th>Pontuação</Th></tr></thead><tbody>{filtered(vmixPeriodEvents, ["locutor_nome", "apresentador_nome", "studio_name", "button_name", "button_category", "program_name"]).map(e => <tr key={e.id} className="border-t border-slate-100"><Td>{dateOnly(e.created_at)}</Td><Td><span className="font-bold">{e.created_at ? new Date(e.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</span></Td><Td className="font-semibold">{e.program_name || "—"}</Td><Td className="font-bold">{e.locutor_nome || e.apresentador_nome || e.user_email || "—"}</Td><Td>{e.button_name || "Botão personalizado"}</Td><Td>{e.button_category || "OUTROS"}</Td><Td><span className="inline-flex min-w-16 items-center justify-center rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">{(Number(e.points) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span></Td></tr>)}</tbody></table></div></> : <TableEmpty text={vmixUnavailable ? "O registro de cliques do vMix ainda não está disponível no banco de dados. Após habilitar a tabela de interações, os próximos cliques aparecerão aqui." : "Nenhum clique registrado neste período."} />}</>}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
