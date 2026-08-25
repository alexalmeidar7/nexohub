import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Download, FileText, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

const NEXO_CYAN = "#00BFF0";
const NEXO_LIME = "#C6F03C";

type Bloco = {
  key: string;      // 2026-08-25T19
  data: string;     // 25/08/2026
  hora: string;     // 19:00
  linhas: { hhmm: string; texto: string }[];
};

const pad = (n: number) => String(n).padStart(2, "0");

function stamp(d = new Date()) {
  const data = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const hora = `${pad(d.getHours())}:00`;
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`;
  return { data, hora, hhmm, key };
}

export default function TranscricaoAudioSection() {
  const [open, setOpen] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState("");
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const recRef = useRef<any>(null);
  const desejaOuvirRef = useRef(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  const suportado = useMemo(
    () => typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
    []
  );

  const addLinha = useCallback((texto: string) => {
    const t = texto.trim();
    if (!t) return;
    const s = stamp();
    setBlocos((prev) => {
      const idx = prev.findIndex((b) => b.key === s.key);
      if (idx === -1) {
        return [...prev, { key: s.key, data: s.data, hora: s.hora, linhas: [{ hhmm: s.hhmm, texto: t }] }];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], linhas: [...next[idx].linhas, { hhmm: s.hhmm, texto: t }] };
      return next;
    });
  }, []);

  const criarRec = useCallback(() => {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const txt = r[0]?.transcript ?? "";
        if (r.isFinal) addLinha(txt);
        else interim += txt;
      }
      setParcial(interim);
    };

    rec.onerror = (e: any) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        desejaOuvirRef.current = false;
        setOuvindo(false);
        setErro("Permissão de microfone negada.");
      } else if (e?.error === "no-speech" || e?.error === "aborted" || e?.error === "network") {
        // reconexão tratada no onend
      } else {
        setErro(`Erro: ${e?.error ?? "desconhecido"}`);
      }
    };

    // Reconexão automática instantânea
    rec.onend = () => {
      setParcial("");
      if (desejaOuvirRef.current) {
        setTimeout(() => {
          if (!desejaOuvirRef.current) return;
          try {
            rec.start();
          } catch {
            /* já iniciado */
          }
        }, 120);
      } else {
        setOuvindo(false);
      }
    };

    return rec;
  }, [addLinha]);

  const iniciar = useCallback(() => {
    if (!suportado) {
      setErro("Seu navegador não suporta a Web Speech API. Use Chrome ou Edge.");
      return;
    }
    setErro(null);
    desejaOuvirRef.current = true;
    if (!recRef.current) recRef.current = criarRec();
    try {
      recRef.current?.start();
      setOuvindo(true);
      toast.success("Transcrição iniciada");
    } catch {
      setOuvindo(true);
    }
  }, [criarRec, suportado]);

  const parar = useCallback(() => {
    desejaOuvirRef.current = false;
    try {
      recRef.current?.stop();
    } catch { /* noop */ }
    setOuvindo(false);
    setParcial("");
    toast.info("Transcrição parada");
  }, []);

  useEffect(() => {
    return () => {
      desejaOuvirRef.current = false;
      try { recRef.current?.stop(); } catch { /* noop */ }
    };
  }, []);

  // auto-scroll
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [blocos, parcial]);

  const textoFinal = useMemo(
    () =>
      blocos
        .map(
          (b) =>
            `[ ${b.data} - ${b.hora} ]\n` + b.linhas.map((l) => `${l.hhmm} ${l.texto}`).join("\n")
        )
        .join("\n\n"),
    [blocos]
  );

  const baixar = useCallback(() => {
    if (!textoFinal.trim()) {
      toast.error("Nada para exportar ainda.");
      return;
    }
    const blob = new Blob([`${textoFinal}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcricao_log.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [textoFinal]);

  const totalLinhas = blocos.reduce((acc, b) => acc + b.linhas.length, 0);

  return (
    <section className="mt-8">
      <div
        className="rounded-2xl p-5 space-y-5"
        style={{
          backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 88%, transparent)",
          border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 14%, transparent)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-cyan-50">
            <FileText size={18} style={{ color: NEXO_CYAN }} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-[13px] font-black uppercase tracking-[0.2em]" style={{ color: NEXO_CYAN }}>
              Transcrição do Áudio
            </h4>
            <p className="text-[11px] opacity-60 truncate">
              Converte o áudio ao vivo em texto, agrupado por data e hora
            </p>
          </div>
          {ouvindo && (
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-70 animate-ping" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
              </span>
              Ouvindo
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="p-2 rounded-xl transition-opacity hover:opacity-70"
            aria-label={open ? "Fechar seção" : "Abrir seção"}
          >
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {open && (
          <div className="space-y-4">
            {/* Controles */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={iniciar}
                disabled={ouvindo || !suportado}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider transition-transform disabled:opacity-40 hover:scale-[1.02]"
                style={{ backgroundColor: NEXO_CYAN, color: "#04202b" }}
              >
                <Mic size={15} /> Iniciar gravação
              </button>
              <button
                type="button"
                onClick={parar}
                disabled={!ouvindo}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider transition-transform disabled:opacity-40 hover:scale-[1.02]"
                style={{ backgroundColor: "#111", color: "#fff" }}
              >
                <MicOff size={15} /> Parar gravação
              </button>
              <button
                type="button"
                onClick={baixar}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider transition-transform hover:scale-[1.02]"
                style={{ backgroundColor: NEXO_LIME, color: "#1d2600" }}
              >
                <Download size={15} /> Baixar .txt
              </button>
              <button
                type="button"
                onClick={() => { setBlocos([]); setParcial(""); }}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider opacity-70 hover:opacity-100"
                style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 25%, transparent)" }}
              >
                <Trash2 size={15} /> Limpar
              </button>
              <span className="text-[11px] opacity-60 ml-auto">
                {totalLinhas} frase(s) · {blocos.length} bloco(s)
              </span>
            </div>

            {(erro || !suportado) && (
              <div className="rounded-xl px-4 py-3 text-[12px] font-semibold" style={{ backgroundColor: "rgba(220,38,38,0.10)", color: "#dc2626" }}>
                {erro || "Seu navegador não suporta a Web Speech API. Use Chrome ou Edge."}
              </div>
            )}

            {/* Log */}
            <div
              ref={logRef}
              className="rounded-2xl p-5 h-[340px] overflow-y-auto font-mono text-[12.5px] leading-relaxed space-y-4"
              style={{
                backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 96%, transparent)",
                border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 12%, transparent)",
              }}
            >
              {blocos.length === 0 && !parcial && (
                <p className="opacity-40">Nenhuma transcrição ainda. Clique em “Iniciar gravação”.</p>
              )}
              {blocos.map((b) => (
                <div key={b.key} className="space-y-1">
                  <div className="font-bold tracking-wider" style={{ color: NEXO_CYAN }}>
                    [ {b.data} - {b.hora} ]
                  </div>
                  {b.linhas.map((l, i) => (
                    <div key={`${b.key}-${i}`} className="flex gap-2">
                      <span className="opacity-40 shrink-0">{l.hhmm}</span>
                      <span>{l.texto}</span>
                    </div>
                  ))}
                </div>
              ))}
              {parcial && <div className="italic opacity-50">{parcial}…</div>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
