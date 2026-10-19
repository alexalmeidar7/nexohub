import { useEffect, useMemo, useState } from "react";
import { Maximize2, Minimize2, MonitorPlay, RefreshCw, X } from "lucide-react";

type NdiInput = { key: string; number: string; title: string; type: string };

function normalizeBase(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `http://${value}`);
    if (!url.port) url.port = "8088";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

/** Compact preview for NDI inputs already received by vMix. vMix exposes each input as MJPEG. */
export default function FloatingNdiPreview({
  inputs,
  baseUrl,
}: {
  inputs: NdiInput[];
  baseUrl: string;
}) {
  const ndiInputs = useMemo(
    () => inputs.filter((input) => /ndi/i.test(`${input.type} ${input.title}`)),
    [inputs],
  );
  const [selected, setSelected] = useState("");
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const base = normalizeBase(baseUrl);

  useEffect(() => {
    if (!ndiInputs.length) {
      setSelected("");
      return;
    }
    if (!ndiInputs.some((input) => input.number === selected)) {
      setSelected(ndiInputs[0].number);
    }
  }, [ndiInputs, selected]);

  const activeInput = ndiInputs.find((input) => input.number === selected);
  const previewUrl = base && activeInput
    ? `${base}/mjpeg?Input=${encodeURIComponent(activeInput.number)}&preview=${refreshKey}`
    : "";

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="fixed bottom-16 right-4 z-[60] flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold text-white shadow-xl"
        style={{ background: "#17243d", borderColor: "#315078" }}
      >
        <MonitorPlay size={15} /> Preview NDI
      </button>
    );
  }

  return (
    <aside
      className="fixed bottom-16 right-4 z-[60] overflow-hidden rounded-xl shadow-2xl"
      style={{
        width: expanded ? "min(640px, calc(100vw - 32px))" : "min(340px, calc(100vw - 32px))",
        background: "#111b2d",
        border: "1px solid #314766",
        boxShadow: "0 18px 50px #0008",
      }}
      aria-label="Preview de vídeo NDI"
    >
      <header className="flex items-center gap-2 px-3 py-2" style={{ background: "#17243d", borderBottom: "1px solid #314766" }}>
        <span className="h-2 w-2 rounded-full" style={{ background: previewUrl ? "#8bcf38" : "#64748b" }} />
        <span className="flex-1 text-[10px] font-black uppercase tracking-wider text-white">Preview NDI</span>
        <button type="button" onClick={() => setRefreshKey((key) => key + 1)} title="Atualizar preview" className="rounded p-1 text-slate-300 hover:bg-white/10"><RefreshCw size={13} /></button>
        <button type="button" onClick={() => setExpanded((value) => !value)} title={expanded ? "Reduzir preview" : "Expandir preview"} className="rounded p-1 text-slate-300 hover:bg-white/10">{expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
        <button type="button" onClick={() => setVisible(false)} title="Ocultar preview" className="rounded p-1 text-slate-300 hover:bg-white/10"><X size={13} /></button>
      </header>
      <div className="p-2">
        <label className="mb-2 block text-[9px] font-bold uppercase tracking-wider text-slate-300">
          Fonte NDI recebida pelo vMix
        </label>
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="mb-2 h-8 w-full rounded-md border px-2 text-xs text-white outline-none"
          style={{ background: "#0c1525", borderColor: "#314766" }}
          disabled={!ndiInputs.length}
        >
          {ndiInputs.length ? ndiInputs.map((input) => (
            <option key={input.key || input.number} value={input.number}>{input.title || `Input ${input.number}`}</option>
          )) : <option value="">Nenhuma entrada NDI encontrada</option>}
        </select>
        <div className="relative aspect-video overflow-hidden rounded-md" style={{ background: "#05080e", border: "1px solid #25344b" }}>
          {previewUrl ? (
            <img key={previewUrl} src={previewUrl} alt={activeInput?.title || "Preview NDI"} className="absolute inset-0 h-full w-full object-contain" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-5 text-center text-slate-400">
              <MonitorPlay size={25} />
              <span className="text-[10px] font-semibold">{base ? "Nenhuma fonte NDI disponível no vMix" : "Conecte o vMix na rede local para visualizar o vídeo"}</span>
            </div>
          )}
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-slate-400">
          O preview usa a entrada NDI selecionada no vMix. A conexão precisa permitir acesso ao endpoint MJPEG do vMix.
        </p>
      </div>
    </aside>
  );
}
