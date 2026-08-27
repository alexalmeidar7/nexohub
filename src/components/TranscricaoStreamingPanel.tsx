import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Radio, Download, ChevronDown, ChevronUp, Loader2, Play, Square, Search, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const NEXO_CYAN = "#00BFF0";
const NEXO_LIME = "#C6F03C";

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

  useEffect(() => {
    if (!userId || !open) return;
    supabase
      .from("streaming_channels")
      .select("id, name, url")
      .eq("user_id", userId)
      .eq("active", true)
      .eq("type", "audio_live")
      .order("numero_canal")
      .then(({ data, error }) => {
        if (error) {
          setCaptureError("Não foi possível carregar os canais de áudio.");
          return;
        }
        const next = (data || []) as AudioChannel[];
        setChannels(next);
        setChannelId((current) => current && next.some((item) => item.id === current) ? current : (next[0]?.id || ""));
      });
  }, [userId, open]);

  // Carga inicial
  useEffect(() => {
    if (!userId || !open) return;
    let cancel = false;
    setLoading(true);
    (async () => {
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
  }, [userId, open]);

  // Realtime
  useEffect(() => {
    if (!userId || !open) return;
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
  }, [userId, open]);

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
      const { data, error } = await supabase.functions.invoke("transcribe-stream", {
        body: { userId, channelId },
      });
      if (!captureRef.current) break;
      if (error || data?.ok === false) {
        const message = data?.error || error?.message || "Falha ao transcrever o streaming";
        setCaptureError(message);
        captureRef.current = false;
        setCapturing(false);
        toast.error(message);
        break;
      }
    }
  }, [channelId, userId]);

  useEffect(() => () => {
    captureRef.current = false;
  }, []);

  return (
    <section className="mt-6">
      <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-xl shadow-black/20 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-primary/10">
            <Radio size={18} style={{ color: NEXO_CYAN }} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-[13px] font-black uppercase tracking-[0.2em]" style={{ color: NEXO_CYAN }}>
              Monitor de Transcrição do Streaming
            </h4>
            <p className="text-[11px] text-white/50 truncate">
              Transcreve diretamente o canal de áudio selecionado e atualiza o texto em tempo real
            </p>
          </div>
          {open && (
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/70">
              <span className="relative flex h-2.5 w-2.5">
                {live && <span className="absolute inline-flex h-full w-full rounded-full animate-ping opacity-70" style={{ backgroundColor: NEXO_LIME }} />}
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: live ? NEXO_LIME : "#64748b" }} />
              </span>
              {live ? "Ao vivo" : "Offline"}
            </span>
          )}
          <Button
            type="button"
            onClick={() => setOpen((v) => !v)}
            variant="ghost"
            size="icon"
            aria-label={open ? "Fechar seção" : "Abrir seção"}
          >
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </Button>
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
