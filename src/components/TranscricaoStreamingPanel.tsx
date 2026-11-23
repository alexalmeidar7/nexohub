import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Radio, Download, ChevronDown, ChevronUp, Loader2, Play, Square, Search, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const NEXO_CYAN = "#0055ff";
const NEXO_LIME = "#0055ff";

type Row = {
  id: string;
  texto_transcrito: string;
  timestamp_inicio: string;
  timestamp_fim: string | null;
};

type AudioChannel = { id: string; name: string; url: string };

const pad = (n: number) => String(n).padStart(2, "0");

function parts(iso: string) {
  const d = new Date(iso);
  return {
    dia: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    diaKey: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hora: `${pad(d.getHours())}:00`,
    horaKey: `${pad(d.getHours())}`,
    hhmm: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

type Bloco = { key: string; dia: string; diaKey: string; hora: string; linhas: { id: string; hhmm: string; texto: string }[] };
type DiaGrupo = { diaKey: string; dia: string; blocos: Bloco[]; filename: string; content: string };

function agrupar(rows: Row[]): Bloco[] {
  const map = new Map<string, Bloco>();
  for (const r of rows) {
    const p = parts(r.timestamp_inicio);
    const key = `${p.diaKey}T${p.horaKey}`;
    if (!map.has(key)) map.set(key, { key, dia: p.dia, diaKey: p.diaKey, hora: p.hora, linhas: [] });
    map.get(key)!.linhas.push({ id: r.id, hhmm: p.hhmm, texto: r.texto_transcrito });
  }
  return Array.from(map.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
}

function nomeArquivoDia(diaKey: string) {
  const [ano, mes, dia] = diaKey.split("-");
  return `${dia}-${mes}-${ano}.txt`;
}

function textoDoDia(blocos: Bloco[]) {
  return `${blocos
    .map((b) => `[ ${b.dia} - ${b.hora} ]\n` + b.linhas.map((l) => `${l.hhmm} ${l.texto}`).join("\n"))
    .join("\n\n")}\n`;
}

export default function TranscricaoStreamingPanel({ effectiveUserId }: { effectiveUserId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);
  const [diaExport, setDiaExport] = useState<string>("");
  const [channels, setChannels] = useState<AudioChannel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [arquivoAtual, setArquivoAtual] = useState<{ diaKey: string; url: string; filename: string } | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const captureRef = useRef(false);

  const userId = effectiveUserId || null;
  const localDesktop = typeof window !== "undefined" &&
    Boolean(window.houseMixDesktop?.transcribeLocalAudio && window.houseMixDesktop?.appendLocalTranscription &&
      window.houseMixDesktop?.listLocalTranscriptions);

  useEffect(() => {
    if (!userId || !open) return;
    const key = "housemix:transcription-audio-channels:" + userId;
    let cached: AudioChannel[] = [];
    let cachedAt = 0;
    if (localDesktop) {
      try {
        const record = JSON.parse(localStorage.getItem(key) || "null");
        if (Array.isArray(record?.channels) && record.channels.length <= 64) {
          cached = record.channels.filter((c: AudioChannel) =>
            c && typeof c.id === "string" && typeof c.name === "string" &&
            typeof c.url === "string" && /^https?:\/\//i.test(c.url));
          cachedAt = Number(record.at) || 0;
          setChannels(cached);
          setChannelId((current) => current && cached.some(item => item.id === current) ? current : (cached[0]?.id || ""));
        }
      } catch {}
      // A local station doesn't need to re-read unchanged channel URLs on every view.
      if (cached.length && Date.now() - cachedAt < 24 * 60 * 60 * 1000) return;
      if (!navigator.onLine && cached.length) return;
    }
    let cancelled = false;
    void supabase
      .from("streaming_channels")
      .select("id, name, url")
      .eq("user_id", userId)
      .eq("active", true)
      .eq("type", "audio_live")
      .order("numero_canal")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          if (!cached.length) setCaptureError("Não foi possível carregar os canais de áudio.");
          return;
        }
        const next = (data || []) as AudioChannel[];
        setChannels(next);
        setChannelId((current) => current && next.some(item => item.id === current) ? current : (next[0]?.id || ""));
        if (localDesktop) {
          try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), channels: next })); } catch {}
        }
      });
    return () => { cancelled = true; };
  }, [userId, open, localDesktop]);

  // Carga inicial
  useEffect(() => {
    if (!userId || !open) return;
    let cancel = false;
    setLoading(true);
    (async () => {
      if (localDesktop && window.houseMixDesktop?.listLocalTranscriptions) {
        try {
          const saved = await window.houseMixDesktop.listLocalTranscriptions(userId);
          if (!cancel) setRows(saved);
        } catch {
          if (!cancel) toast.error("Falha ao carregar o histórico local de transcrição");
        } finally {
          if (!cancel) setLoading(false);
        }
        return;
      }
      const { data, error } = await supabase
        .from("transcricoes_streaming")
        .select("id, texto_transcrito, timestamp_inicio, timestamp_fim")
        .eq("user_id", userId)
        .order("timestamp_inicio", { ascending: false })
        .limit(500);
      if (cancel) return;
      if (error) {
        toast.error("Erro ao carregar transcrições");
      } else {
        setRows(((data as Row[]) || []).slice().reverse());
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [userId, open, localDesktop]);

  // Realtime
  useEffect(() => {
    if (!userId || !open || localDesktop) return;
    const channel = supabase
      .channel(`transcricoes-streaming-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transcricoes_streaming", filter: `user_id=eq.${userId}` },
        (payload) => {
          const r = payload.new as Row;
          setRows((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r]));
        }
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      setLive(false);
      supabase.removeChannel(channel);
    };
  }, [userId, open, localDesktop]);

  const filteredRows = useMemo(() => {
    const term = busca.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => row.texto_transcrito.toLowerCase().includes(term));
  }, [busca, rows]);

  const blocos = useMemo(() => agrupar(filteredRows), [filteredRows]);

  const agruparPorDia = useCallback((lista: Bloco[]): DiaGrupo[] => {
    const map = new Map<string, DiaGrupo>();
    for (const bloco of lista) {
      const current = map.get(bloco.diaKey) || {
        diaKey: bloco.diaKey,
        dia: bloco.dia,
        blocos: [],
        filename: nomeArquivoDia(bloco.diaKey),
        content: "",
      };
      current.blocos.push(bloco);
      map.set(bloco.diaKey, current);
    }
    return Array.from(map.values())
      .map((dia) => ({ ...dia, content: textoDoDia(dia.blocos) }))
      .sort((a, b) => (a.diaKey < b.diaKey ? 1 : -1));
  }, []);

  // Exibição respeita a busca…
  const diasAgrupados = useMemo<DiaGrupo[]>(() => agruparPorDia(blocos), [agruparPorDia, blocos]);
  // …mas a exportação (.txt) sempre usa o dia completo, sem filtro de busca.
  const diasCompletos = useMemo<DiaGrupo[]>(() => agruparPorDia(agrupar(rows)), [agruparPorDia, rows]);

  const dias = useMemo(() => {
    const set = new Map<string, string>();
    diasCompletos.forEach((b) => set.set(b.diaKey, b.dia));
    return Array.from(set.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [diasCompletos]);

  useEffect(() => {
    if (!diaExport && dias.length) setDiaExport(dias[0][0]);
  }, [dias, diaExport]);

  // Auto-scroll
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filteredRows, open]);

  useEffect(() => {
    const updateDailyLink = () => {
      const now = new Date();
      const reachedDayEnd = now.getHours() === 23 && now.getMinutes() >= 59;
      if (!reachedDayEnd) return;
      const diaKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const dia = diasCompletos.find((item) => item.diaKey === diaKey);
      if (!dia || arquivoAtual?.diaKey === diaKey) return;
      const url = URL.createObjectURL(new Blob([dia.content], { type: "text/plain;charset=utf-8" }));
      setArquivoAtual((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { diaKey, url, filename: dia.filename };
      });
    };
    updateDailyLink();
    const timer = window.setInterval(updateDailyLink, 30_000);
    return () => window.clearInterval(timer);
  }, [arquivoAtual?.diaKey, diasCompletos]);

  useEffect(() => () => {
    if (arquivoAtual?.url) URL.revokeObjectURL(arquivoAtual.url);
  }, [arquivoAtual?.url]);

  const exportar = useCallback(() => {
    const alvo = diasCompletos.find((b) => b.diaKey === diaExport);
    if (!alvo) {
      toast.error("Nenhuma transcrição nesse dia.");
      return;
    }
    const blob = new Blob([alvo.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = alvo.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [diasCompletos, diaExport]);

  const linkDiaSelecionado = useMemo(() => diasCompletos.find((dia) => dia.diaKey === diaExport), [diaExport, diasCompletos]);
  const linkDiaHref = useMemo(() => {
    if (!linkDiaSelecionado) return "";
    return `data:text/plain;charset=utf-8,${encodeURIComponent(linkDiaSelecionado.content)}`;
  }, [linkDiaSelecionado]);

  const total = rows.length;

  const pararCaptura = useCallback(() => {
    captureRef.current = false;
    setCapturing(false);
    toast.info("Transcrição do streaming parada");
  }, []);

  const iniciarCaptura = useCallback(async () => {
    if (!userId || !channelId || captureRef.current) return;
    captureRef.current = true;
    setCapturing(true);
    setCaptureError(null);
    toast.success("Transcrição do streaming iniciada");

    while (captureRef.current) {
      try {
        if (localDesktop) {
          const desktop = window.houseMixDesktop;
          const streamUrl = channels.find(c => c.id === channelId)?.url;
          if (!desktop?.transcribeLocalAudio || !desktop?.appendLocalTranscription || !streamUrl) {
            throw new Error("Canal local não configurado.");
          }
          const startedAt = new Date().toISOString();
          const text = await desktop.transcribeLocalAudio(streamUrl);
          if (!captureRef.current) break;
          if (text.trim()) {
            const row = await desktop.appendLocalTranscription(userId, text, startedAt, new Date().toISOString());
            if (captureRef.current) setRows(previous => previous.some(r => r.id === row.id) ? previous : [...previous, row]);
          }
        } else {
          const { data, error } = await supabase.functions.invoke("transcribe-stream", {
            body: { userId, channelId },
          });
          if (!captureRef.current) break;
          if (error || data?.ok === false) throw new Error(data?.error || error?.message || "Falha ao transcrever o streaming");
        }
      } catch (error) {
        if (!captureRef.current) break;
        const message = error instanceof Error ? error.message : "Falha na transcrição local";
        setCaptureError(message);
        captureRef.current = false;
        setCapturing(false);
        toast.error(message);
        break;
      }
    }
  }, [channelId, userId, channels, localDesktop]);

  useEffect(() => () => {
    captureRef.current = false;
  }, []);

  return (
    <section className="mt-6">
      <div
        className="rounded-3xl p-6 space-y-5 transition-all"
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid rgba(226, 232, 240, 0.9)",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.03)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between mb-2 cursor-pointer group"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: "#0055ff" }} />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-blue-50">
                <Radio size={18} style={{ color: "#0055ff" }} />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter m-0" style={{ color: "#002132" }}>
                  MONITOR DE TRANSCRIÇÃO DO STREAMING
                </h3>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
                  {localDesktop ? "Transcrição local por Whisper.cpp — sem ElevenLabs e sem enviar áudio à nuvem" : "Transcreve o canal de áudio e atualiza o texto em tempo real"}
                </span>
              </div>
            </div>
            <div className="ml-2 transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", color: "#002132" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span
              className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5"
              style={{ backgroundColor: live ? "#ECFDF5" : "#F1F5F9", color: live ? "#059669" : "#94A3B8" }}
            >
              <span className="relative flex h-2 w-2">
                {live && <span className="absolute inline-flex h-full w-full rounded-full animate-ping opacity-75" style={{ backgroundColor: NEXO_LIME }} />}
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: live ? NEXO_LIME : "#94A3B8" }} />
              </span>
              {localDesktop ? (capturing ? "Local ativo" : "Local") : live ? "Ao vivo" : "Offline"}
            </span>
            {open && (
              <button
                type="button"
                className="h-8 w-8 rounded-full flex items-center justify-center text-black/40 hover:text-black/70 hover:bg-black/5"
                onClick={() => setOpen(false)}
                title="Fechar seção"
              >
                <ChevronUp size={16} />
              </button>
            )}
          </div>
        </div>

        {open && (
          <div className="space-y-4">
            {/* Controles */}
            <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto_auto] xl:grid-cols-[minmax(240px,1fr)_auto_auto_auto]">
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                disabled={capturing}
                className="h-11 rounded-full border border-border bg-background/70 px-4 text-[12px] font-bold text-foreground outline-none disabled:opacity-50"
                aria-label="Canal de áudio para transcrição"
              >
                {channels.length === 0 && <option value="">Nenhum canal de áudio ativo</option>}
                {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
              </select>
              {!capturing ? (
                <Button
                  type="button"
                  onClick={iniciarCaptura}
                  disabled={!channelId}
                  className="h-11"
                >
                  <Play size={15} /> Iniciar streaming
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={pararCaptura}
                  variant="destructive"
                  className="h-11"
                >
                  <Square size={14} /> Parar streaming
                </Button>
              )}
              <div className="relative min-w-[220px]">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar palavra"
                  className="h-11 w-full rounded-full border border-border bg-background/70 pl-10 pr-4 text-[12px] font-semibold text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
              <span className="flex h-11 items-center justify-end text-[11px] text-muted-foreground">
                {capturing ? "Capturando áudio…" : `${filteredRows.length}/${total} trecho(s) · ${blocos.length} bloco(s)`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/35 p-3">
              <select
                value={diaExport}
                onChange={(e) => setDiaExport(e.target.value)}
                className="h-10 rounded-full border border-border bg-background/70 px-4 text-[12px] font-bold text-foreground outline-none"
              >
                {dias.length === 0 && <option value="">Sem registros</option>}
                {dias.map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
              <Button
                type="button"
                onClick={exportar}
                disabled={!diaExport}
                variant="save"
                size="sm"
              >
                <Download size={15} /> Exportar dia (.txt)
              </Button>
              {linkDiaSelecionado && (
                <a
                  href={linkDiaHref}
                  download={linkDiaSelecionado.filename}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 text-[11px] font-black uppercase tracking-wider text-primary transition hover:bg-primary/15"
                >
                  <FileText size={14} /> {linkDiaSelecionado.filename}
                </a>
              )}
              {arquivoAtual && (
                <a
                  href={arquivoAtual.url}
                  download={arquivoAtual.filename}
                  className="ml-auto inline-flex h-10 items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 text-[11px] font-black uppercase tracking-wider text-primary"
                >
                  <FileText size={14} /> Fechamento 23:59: {arquivoAtual.filename}
                </a>
              )}
            </div>

            {captureError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-[12px] font-semibold text-red-300">
                {captureError}
              </div>
            )}

            {/* Log */}
            <div
              ref={logRef}
              className="rounded-2xl border border-border bg-background/60 p-5 h-[420px] overflow-y-auto font-mono text-[12.5px] leading-relaxed space-y-5 text-foreground/85"
            >
              {loading && (
                <p className="flex items-center gap-2 text-white/50">
                  <Loader2 size={14} className="animate-spin" /> Carregando…
                </p>
              )}
              {!loading && diasAgrupados.length === 0 && (
                <p className="text-muted-foreground">{busca ? "Nenhuma transcrição encontrada para essa busca." : "Nenhuma transcrição recebida ainda."}</p>
              )}
              {diasAgrupados.map((dia) => (
                <div key={dia.diaKey} className="space-y-3">
                  <div className="sticky top-0 z-10 -mx-2 flex items-center justify-between border-b border-border bg-background/95 px-2 py-2 backdrop-blur">
                    <span className="text-[12px] font-black uppercase tracking-[0.2em] text-primary">{dia.dia}</span>
                    <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(diasCompletos.find((d) => d.diaKey === dia.diaKey)?.content || dia.content)}`} download={dia.filename} className="text-[10px] font-black uppercase tracking-wider text-primary/80 hover:text-primary">
                      {dia.filename}
                    </a>
                  </div>
                  {dia.blocos.map((b) => (
                    <div key={b.key} className="space-y-1">
                      <div className="font-bold tracking-wider" style={{ color: NEXO_CYAN }}>
                        [ {b.dia} - {b.hora} ]
                      </div>
                      {b.linhas.map((l) => (
                        <div key={l.id} className="flex gap-2 border-l border-border pl-3">
                          <span className="text-muted-foreground shrink-0">{l.hhmm}</span>
                          <span>{l.texto}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>

          </div>
        )}
      </div>
    </section>
  );
}
