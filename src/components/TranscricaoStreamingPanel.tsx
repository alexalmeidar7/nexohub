import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Radio, Download, ChevronDown, ChevronUp, Loader2, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

  const blocos = useMemo(() => agrupar(rows), [rows]);
  const dias = useMemo(() => {
    const set = new Map<string, string>();
    blocos.forEach((b) => set.set(b.diaKey, b.dia));
    return Array.from(set.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [blocos]);

  useEffect(() => {
    if (!diaExport && dias.length) setDiaExport(dias[0][0]);
  }, [dias, diaExport]);

  // Auto-scroll
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows, open]);

  const exportar = useCallback(() => {
    const alvo = blocos.filter((b) => b.diaKey === diaExport);
    if (!alvo.length) {
      toast.error("Nenhuma transcrição nesse dia.");
      return;
    }
    const texto = alvo
      .map((b) => `[ ${b.dia} - ${b.hora} ]\n` + b.linhas.map((l) => `${l.hhmm} ${l.texto}`).join("\n"))
      .join("\n\n");
    const blob = new Blob([`${texto}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcricao_${diaExport}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [blocos, diaExport]);

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
      <div className="rounded-2xl p-5 space-y-5" style={{ backgroundColor: "#0A2540", border: "1px solid rgba(255,255,255,0.08)" }}>
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(0,191,240,0.14)" }}>
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
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="p-2 rounded-xl text-white/70 transition-opacity hover:opacity-70"
            aria-label={open ? "Fechar seção" : "Abrir seção"}
          >
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {open && (
          <div className="space-y-4">
            {/* Controles */}
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                disabled={capturing}
                className="rounded-full px-4 py-2 text-[12px] font-bold text-white outline-none disabled:opacity-50"
                style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                aria-label="Canal de áudio para transcrição"
              >
                {channels.length === 0 && <option value="">Nenhum canal de áudio ativo</option>}
                {channels.map((channel) => <option key={channel.id} value={channel.id} style={{ color: "#0A2540" }}>{channel.name}</option>)}
              </select>
              {!capturing ? (
                <button
                  type="button"
                  onClick={iniciarCaptura}
                  disabled={!channelId}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider disabled:opacity-40"
                  style={{ backgroundColor: NEXO_CYAN, color: "#04202b" }}
                >
                  <Play size={15} /> Iniciar streaming
                </button>
              ) : (
                <button
                  type="button"
                  onClick={pararCaptura}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider bg-red-600 text-white"
                >
                  <Square size={14} /> Parar streaming
                </button>
              )}
              <select
                value={diaExport}
                onChange={(e) => setDiaExport(e.target.value)}
                className="rounded-full px-4 py-2 text-[12px] font-bold text-white outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                {dias.length === 0 && <option value="">Sem registros</option>}
                {dias.map(([k, label]) => (
                  <option key={k} value={k} style={{ color: "#0A2540" }}>{label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={exportar}
                disabled={!diaExport}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider transition-transform hover:scale-[1.02] disabled:opacity-40"
                style={{ backgroundColor: NEXO_LIME, color: "#1d2600" }}
              >
                <Download size={15} /> Exportar dia (.txt)
              </button>
              <span className="text-[11px] text-white/50 ml-auto">
                {capturing ? "Capturando áudio…" : `${total} trecho(s) · ${blocos.length} bloco(s)`}
              </span>
            </div>

            {captureError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-[12px] font-semibold text-red-300">
                {captureError}
              </div>
            )}

            {/* Log */}
            <div
              ref={logRef}
              className="rounded-2xl p-5 h-[340px] overflow-y-auto font-mono text-[12.5px] leading-relaxed space-y-4 text-white/85"
              style={{ backgroundColor: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {loading && (
                <p className="flex items-center gap-2 text-white/50">
                  <Loader2 size={14} className="animate-spin" /> Carregando…
                </p>
              )}
              {!loading && blocos.length === 0 && (
                <p className="text-white/40">Nenhuma transcrição recebida ainda.</p>
              )}
              {blocos.map((b) => (
                <div key={b.key} className="space-y-1">
                  <div className="font-bold tracking-wider" style={{ color: NEXO_CYAN }}>
                    [ {b.dia} - {b.hora} ]
                  </div>
                  {b.linhas.map((l) => (
                    <div key={l.id} className="flex gap-2">
                      <span className="text-white/35 shrink-0">{l.hhmm}</span>
                      <span>{l.texto}</span>
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
