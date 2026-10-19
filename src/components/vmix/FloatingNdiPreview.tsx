import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Maximize2, Minimize2, MonitorPlay, RefreshCw, Settings, X } from "lucide-react";

type NdiInput = { key: string; number: string; title: string; type: string };

function normalizeBase(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : "http://" + value);
    if (!url.port) url.port = "8088";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

/**
 * Temporário, sem Bridge: mostra vídeo de entradas NDI reais já adicionadas ao vMix.
 * Para visualizar uma nova fonte de rede, o operador precisa adicioná-la primeiro em Input > NDI/OMT no vMix.
 * Quando o NexoHub Bridge estiver pronto, rever este preview para descobrir e receber fontes diretamente da rede.
 */
export default function FloatingNdiPreview({
  inputs,
  baseUrl,
  targetSelector = "#custom-buttons-panel",
  onRefreshSources,
}: {
  inputs: NdiInput[];
  baseUrl: string;
  targetSelector?: string;
  onRefreshSources?: () => Promise<unknown> | void;
}) {
  const ndiInputs = useMemo(
    () => inputs.filter((input) => input.type.trim().toLowerCase() === "ndi"),
    [inputs],
  );
  const base = normalizeBase(baseUrl);
  const storageKey = "vmix_ndi_preview_selected_" + (base || "default");
  const [selected, setSelected] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey) || "";
      return saved.startsWith("input:") ? saved : "";
    } catch {
      return "";
    }
  });
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [rightOffset, setRightOffset] = useState(16);
  const [refreshKey, setRefreshKey] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, selected);
    } catch {
      // Storage may be unavailable.
    }
  }, [storageKey, selected]);

  useEffect(() => {
    const updateAnchor = () => {
      const target = document.querySelector(targetSelector);
      if (!target) {
        setRightOffset(16);
        return;
      }
      const rect = target.getBoundingClientRect();
      setRightOffset(Math.max(8, window.innerWidth - rect.right));
    };
    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    const target = document.querySelector(targetSelector);
    const observer = target && typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateAnchor) : null;
    if (target && observer) observer.observe(target);
    return () => {
      window.removeEventListener("resize", updateAnchor);
      observer?.disconnect();
    };
  }, [targetSelector]);

  useEffect(() => {
    void onRefreshSources?.();
    // Refresh once when opened; manual refresh remains available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshSources = () => {
    setImageFailed(false);
    setRefreshKey((key) => key + 1);
    void onRefreshSources?.();
  };

  const activeInput = selected.startsWith("input:")
    ? ndiInputs.find((input) => input.number === selected.slice("input:".length))
    : undefined;
  const previewUrl = base && activeInput
    ? base + "/mjpeg?Input=" + encodeURIComponent(activeInput.number) + "&preview=" + refreshKey
    : "";
  const selectedSourceLabel = activeInput?.title || "";

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="fixed bottom-16 z-[60] flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold text-white shadow-xl"
        style={{ right: rightOffset + "px", background: "#17243d", borderColor: "#315078" }}
      >
        <MonitorPlay size={15} /> Preview NDI
      </button>
    );
  }

  return (
    <aside
      className="fixed bottom-16 z-[60] overflow-hidden rounded-xl shadow-2xl"
      style={{
        right: rightOffset + "px",
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
        <button type="button" onClick={refreshSources} title="Atualizar entradas NDI do vMix" aria-label="Atualizar entradas NDI do vMix" className="rounded p-1 text-slate-300 hover:bg-white/10"><RefreshCw size={13} /></button>
        <button type="button" onClick={() => setSetupOpen((value) => !value)} title="Selecionar entrada NDI" aria-label="Selecionar entrada NDI" className={"rounded p-1 hover:bg-white/10 " + (setupOpen ? "text-white" : "text-slate-300")}><Settings size={13} /></button>
        <button type="button" onClick={() => setExpanded((value) => !value)} title={expanded ? "Reduzir preview" : "Expandir preview"} className="rounded p-1 text-slate-300 hover:bg-white/10">{expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
        <button type="button" onClick={() => setVisible(false)} title="Ocultar preview" className="rounded p-1 text-slate-300 hover:bg-white/10"><X size={13} /></button>
      </header>
      <div className="p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="block min-w-0 truncate text-[9px] font-bold uppercase tracking-wider text-slate-300">
            {selectedSourceLabel || "Selecione uma entrada NDI"}
          </label>
          {selected && <span className="shrink-0 text-[8px] text-slate-500">Seleção salva</span>}
        </div>
        {setupOpen && (
          <select
            autoFocus
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              setImageFailed(false);
              setRefreshKey((key) => key + 1);
              setSetupOpen(false);
            }}
            className="mb-2 h-8 w-full rounded-md border px-2 text-xs text-white outline-none"
            style={{ background: "#0c1525", borderColor: "#314766" }}
          >
            <option value="">Selecione uma entrada NDI carregada no vMix…</option>
            {ndiInputs.map((input) => (
              <option key={input.key || input.number} value={"input:" + input.number}>{input.title || "Input " + input.number}</option>
            ))}
          </select>
        )}
        <div className="relative aspect-video overflow-hidden rounded-md" style={{ background: "#05080e", border: "1px solid #25344b" }}>
          {previewUrl && !imageFailed ? (
            <img key={previewUrl} src={previewUrl} alt={activeInput?.title || "Preview NDI"} onError={() => setImageFailed(true)} onLoad={() => setImageFailed(false)} className="absolute inset-0 h-full w-full object-contain" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-5 text-center text-slate-400">
              {imageFailed ? <AlertTriangle size={25} className="text-amber-400" /> : <MonitorPlay size={25} />}
              <span className="text-[10px] font-semibold">
                {imageFailed
                  ? "Não foi possível receber o vídeo desta entrada. Verifique se ela está ativa no vMix."
                  : "Sem Bridge, o navegador não descobre fontes NDI diretamente na rede. Adicione a fonte pelo seletor nativo Input > NDI/OMT do vMix e depois atualize esta lista."}
              </span>
              <button type="button" onClick={refreshSources} className="rounded-md border border-white/20 px-2 py-1 text-[9px] font-bold text-white hover:bg-white/10">Atualizar entradas</button>
            </div>
          )}
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-slate-400">
          Modo temporário sem Bridge: selecione uma entrada NDI real já carregada no vMix. Para trazer uma nova fonte da rede, use Input → NDI/OMT no próprio vMix e clique em atualizar. Quando o NexoHub Bridge estiver pronto, reveremos este preview para descobrir e reproduzir fontes diretamente da rede.
        </p>
      </div>
    </aside>
  );
}
