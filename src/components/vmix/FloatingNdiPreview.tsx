import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Maximize2, Minimize2, MonitorPlay, RefreshCw, Settings, X } from "lucide-react";

type NdiNetworkSource = { name: string; address?: string };
type DiscoveryPayload = { available?: boolean; provider?: string; message?: string | null; sources?: NdiNetworkSource[] };

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

/** Preview MJPEG do vMix + descoberta real de fontes da rede via NexoHub Bridge local. */
export default function FloatingNdiPreview({
  baseUrl,
  targetSelector = "#custom-buttons-panel",
  onRefreshSources,
}: {
  inputs: { key: string; number: string; title: string; type: string }[];
  baseUrl: string;
  targetSelector?: string;
  onRefreshSources?: () => Promise<unknown> | void;
}) {
  const base = normalizeBase(baseUrl);
  const storageKey = `vmix_ndi_preview_selected_${base || "default"}`;
  const [selected, setSelected] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey) || "";
      return saved && !saved.startsWith("input:") && !saved.startsWith("network:") ? `input:${saved}` : saved;
    } catch { return ""; }
  });
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [rightOffset, setRightOffset] = useState(16);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshingSources, setRefreshingSources] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [networkSources, setNetworkSources] = useState<NdiNetworkSource[]>([]);
  const [discoveryMessage, setDiscoveryMessage] = useState("Consultando o NexoHub Bridge neste computador…");
  const [discoveryReady, setDiscoveryReady] = useState(false);

  useEffect(() => {
    const updateAnchor = () => {
      const target = document.querySelector(targetSelector);
      if (!target) { setRightOffset(16); return; }
      const rect = target.getBoundingClientRect();
      setRightOffset(Math.max(8, window.innerWidth - rect.right));
    };
    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateAnchor) : null;
    const target = document.querySelector(targetSelector);
    if (target && observer) observer.observe(target);
    return () => {
      window.removeEventListener("resize", updateAnchor);
      observer?.disconnect();
    };
  }, [targetSelector]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, selected); } catch { /* storage may be unavailable */ }
  }, [storageKey, selected]);

  const discoverNetworkSources = useCallback(async () => {
    setDiscoveryMessage("Buscando fontes NDI reais na rede…");
    try {
      const response = await fetch("http://127.0.0.1:8765/ndi/sources", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json() as DiscoveryPayload;
      if (!response.ok || !payload.available) {
        setNetworkSources([]);
        setDiscoveryReady(false);
        setDiscoveryMessage(payload.message || "O NexoHub Bridge não conseguiu consultar o NDI Runtime.");
        return;
      }
      const sources = Array.isArray(payload.sources) ? payload.sources.filter((source) => typeof source?.name === "string" && source.name.trim()) : [];
      setNetworkSources(sources);
      setDiscoveryReady(true);
      setDiscoveryMessage(sources.length ? `${sources.length} fonte(s) NDI encontrada(s) na rede.` : "O NDI Runtime respondeu, mas não encontrou fontes anunciadas na rede.");
    } catch {
      setNetworkSources([]);
      setDiscoveryReady(false);
      setDiscoveryMessage("NexoHub Bridge não encontrado neste computador. Inicie o Bridge com o NDI Runtime instalado para pesquisar as fontes reais da rede.");
    }
  }, []);

  const refreshSources = useCallback(async () => {
    if (refreshingSources) return;
    setRefreshingSources(true);
    try {
      await Promise.all([
        Promise.resolve(onRefreshSources?.()),
        discoverNetworkSources(),
      ]);
      setImageFailed(false);
      setRefreshKey((key) => key + 1);
    } finally {
      setRefreshingSources(false);
    }
  }, [discoverNetworkSources, onRefreshSources, refreshingSources]);

  useEffect(() => {
    void refreshSources();
    // Atualiza uma vez ao abrir; o botão de recarregar permite nova varredura sob demanda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedNetworkName = selected.startsWith("network:") ? decodeURIComponent(selected.slice("network:".length)) : "";
  const previewUrl = selectedNetworkName
    ? `http://127.0.0.1:8765/ndi/preview?name=${encodeURIComponent(selectedNetworkName)}&preview=${refreshKey}`
    : "";
  const selectedSourceLabel = selectedNetworkName;

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="fixed bottom-16 z-[60] flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold text-white shadow-xl"
        style={{ right: `${rightOffset}px`, background: "#17243d", borderColor: "#315078" }}
      >
        <MonitorPlay size={15} /> Preview NDI
      </button>
    );
  }

  return (
    <aside
      className="fixed bottom-16 z-[60] overflow-hidden rounded-xl shadow-2xl"
      style={{
        right: `${rightOffset}px`,
        width: expanded ? "min(640px, calc(100vw - 32px))" : "min(340px, calc(100vw - 32px))",
        background: "#111b2d",
        border: "1px solid #314766",
        boxShadow: "0 18px 50px #0008",
      }}
      aria-label="Preview de vídeo NDI"
    >
      <header className="flex items-center gap-2 px-3 py-2" style={{ background: "#17243d", borderBottom: "1px solid #314766" }}>
        <span className="h-2 w-2 rounded-full" style={{ background: previewUrl ? "#8bcf38" : discoveryReady ? "#fbbf24" : "#64748b" }} />
        <span className="flex-1 text-[10px] font-black uppercase tracking-wider text-white">Preview NDI</span>
        <button type="button" onClick={() => { setImageFailed(false); setRefreshKey((key) => key + 1); void refreshSources(); }} title="Pesquisar fontes NDI novamente" aria-label="Pesquisar fontes NDI novamente" className="rounded p-1 text-slate-300 hover:bg-white/10" disabled={refreshingSources}><RefreshCw size={13} className={refreshingSources ? "animate-spin" : ""} /></button>
        <button type="button" onClick={() => { const next = !setupOpen; setSetupOpen(next); if (next) void refreshSources(); }} title="Configurar fonte NDI" aria-label="Configurar fonte NDI" className={`rounded p-1 hover:bg-white/10 ${setupOpen ? "text-white" : "text-slate-300"}`}><Settings size={13} /></button>
        <button type="button" onClick={() => setExpanded((value) => !value)} title={expanded ? "Reduzir preview" : "Expandir preview"} className="rounded p-1 text-slate-300 hover:bg-white/10">{expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
        <button type="button" onClick={() => setVisible(false)} title="Ocultar preview" className="rounded p-1 text-slate-300 hover:bg-white/10"><X size={13} /></button>
      </header>
      <div className="p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="block min-w-0 truncate text-[9px] font-bold uppercase tracking-wider text-slate-300">
            {selectedSourceLabel || "Selecione uma fonte NDI"}
          </label>
          {selected && <span className="shrink-0 text-[8px] text-slate-500">Fonte salva</span>}
        </div>
        {setupOpen && (
          <select
            autoFocus
            value={selected}
            onChange={(event) => {
              const value = event.target.value;
              setSelected(value);
              try { localStorage.setItem(storageKey, value); } catch { /* storage may be unavailable */ }
              setImageFailed(false);
              setSetupOpen(false);
              setRefreshKey((key) => key + 1);
            }}
            onBlur={() => setSetupOpen(false)}
            className="mb-2 h-8 w-full rounded-md border px-2 text-xs text-white outline-none"
            style={{ background: "#0c1525", borderColor: "#314766" }}
          >
            <option value="">Selecione uma fonte NDI…</option>
            <optgroup label="Fontes anunciadas na rede (NDI Runtime)">
              {networkSources.map((source) => (
                <option key={source.name} value={`network:${encodeURIComponent(source.name)}`}>{source.name}</option>
              ))}
            </optgroup>

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
                  : selectedNetworkName
                    ? "Fonte NDI real selecionada. Aguardando vídeo do receptor NDI local…"
                    : refreshingSources
                      ? "Pesquisando fontes NDI reais na rede…"
                      : discoveryMessage}
              </span>
              {!discoveryReady && !refreshingSources && <button type="button" onClick={() => void refreshSources()} className="rounded-md border border-white/20 px-2 py-1 text-[9px] font-bold text-white hover:bg-white/10">Pesquisar novamente</button>}
            </div>
          )}
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-slate-400">
          O seletor lista somente fontes NDI reais anunciadas na rede. O vídeo é recebido localmente pelo NexoHub Bridge, sem depender de a fonte estar adicionada como entrada no vMix.
        </p>
      </div>
    </aside>
  );
}
