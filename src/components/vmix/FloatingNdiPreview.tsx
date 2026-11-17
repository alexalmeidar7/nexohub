import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, Maximize2, Minimize2, MonitorPlay, RefreshCw, Settings, X } from "lucide-react";

type NdiNetworkSource = { name: string; address: string };
const NDI_ORIGIN = "http://127.0.0.1:8765";
const SOURCE_KEY = "housemix:ndi-preview-network-source:v1";

export default function FloatingNdiPreview({ targetSelector = "#custom-buttons-panel", onRefreshSources, controls, settings, onSources, onImage, onPreviewHidden }: {
  inputs: { key: string; number: string; title: string; type: string }[];
  baseUrl: string;
  targetSelector?: string;
  onRefreshSources?: () => Promise<unknown> | void;
  controls?: ReactNode;
  settings?: ReactNode;
  onSources?: (sources: NdiNetworkSource[]) => void;
  onImage?: (image: HTMLImageElement | null) => void;
  onPreviewHidden?: () => void;
}) {
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [setupOpen, setSetupOpen] = useState(true);
  const [rightOffset, setRightOffset] = useState(16);
  const [sources, setSources] = useState<NdiNetworkSource[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  useEffect(() => { onSources?.(sources); }, [sources, onSources]);
  const [selectedSource, setSelectedSource] = useState(() => {
    try { return localStorage.getItem(SOURCE_KEY) || ""; } catch { return ""; }
  });
  const inFlight = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const refreshSources = useCallback(async () => {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${NDI_ORIGIN}/ndi/sources`, { cache: "no-store", signal: controller.signal });
      const payload = await response.json();
      if (!response.ok || !payload.available) throw new Error(payload.message || "Serviço NDI indisponível. Reinicie o House Mix Desktop.");
      if (!mounted.current) return;
      const next = Array.isArray(payload.sources) ? payload.sources.filter((s: NdiNetworkSource) => typeof s.name === "string") : [];
      setSources(next);
      setMessage(next.length ? "" : "Nenhuma fonte NDI encontrada. Verifique a rede e se a saída NDI está habilitada no emissor.");
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error && error.name !== "AbortError" && error.message !== "Failed to fetch"
        ? error.message : "Serviço NDI indisponível. Reinicie o House Mix Desktop.");
    } finally {
      window.clearTimeout(timeout);
      inFlight.current = null;
      if (mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (!visible) return () => { mounted.current = false; };
    let timer: number;
    let cancelled = false;
    const poll = async () => { await refreshSources(); if (!cancelled) timer = window.setTimeout(poll, 5000); };
    void poll();
    void onRefreshSources?.();
    return () => { cancelled = true; mounted.current = false; window.clearTimeout(timer); inFlight.current?.abort(); };
  }, [refreshSources, visible]);
  useEffect(() => { setPreviewError(false); setPreviewReady(false); }, [selectedSource, previewRevision, visible]);
  const selectSource = (name: string) => {
    setSelectedSource(name);
    try { if (name) localStorage.setItem(SOURCE_KEY, name); else localStorage.removeItem(SOURCE_KEY); } catch {}
  };
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


  if (!visible) return <button type="button" onClick={() => setVisible(true)} className="fixed bottom-16 z-[60] flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-bold text-white shadow-xl" style={{ right: rightOffset }}><MonitorPlay size={15} /> Preview</button>;
  return (
    <aside className="fixed bottom-16 z-[60] overflow-hidden rounded-xl border border-[#314766] bg-[#111b2d] shadow-2xl" style={{ right: rightOffset, width: expanded ? "min(640px, calc(100vw - 32px))" : "min(340px, calc(100vw - 32px))" }} aria-label="Preview NDI">
      <header className="flex items-center gap-2 border-b border-[#314766] bg-[#17243d] px-3 py-2">
        <span className={`h-2 w-2 rounded-full ${previewReady && !previewError ? "bg-lime-400" : "bg-slate-500"}`} />
        <span className="flex-1 text-[10px] font-black uppercase tracking-wider text-white">Preview</span>
        <button type="button" onClick={() => { void refreshSources(); setPreviewRevision(v => v + 1); }} aria-label="Atualizar fontes NDI" title="Atualizar fontes NDI" className="rounded p-1 text-slate-300 hover:bg-white/10"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></button>
        <button type="button" onClick={() => setSetupOpen(v => !v)} aria-label="Configurar fontes do preview" aria-expanded={setupOpen} className="rounded p-1 text-slate-300 hover:bg-white/10"><Settings size={13} /></button>
        <button type="button" onClick={() => setExpanded(v => !v)} aria-label={expanded ? "Reduzir preview" : "Expandir preview"} className="rounded p-1 text-slate-300 hover:bg-white/10">{expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
        <button type="button" onClick={() => { onPreviewHidden?.(); setVisible(false); }} aria-label="Ocultar preview" className="rounded p-1 text-slate-300 hover:bg-white/10"><X size={13} /></button>
      </header>
      <div className="p-2">
        {controls}
        {setupOpen && <div className="mb-2">
          {settings}
          <select value={selectedSource} onChange={e => selectSource(e.target.value)} aria-label="Fonte NDI disponível na rede" className="h-9 w-full min-w-0 rounded-md border border-[#314766] bg-[#0c1525] px-2 text-[11px] text-white outline-none">
            <option value="">{loading && !sources.length ? "Buscando fontes NDI na rede..." : "Selecione uma fonte NDI da rede..."}</option>
            {selectedSource && !sources.some(s => s.name === selectedSource) && <option value={selectedSource}>{selectedSource} (aguardando rede)</option>}
            {sources.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
          {message && <p role="status" className="mt-1 px-1 text-[10px] leading-snug text-slate-400">{message}</p>}
        </div>}
        <div className="relative aspect-video overflow-hidden rounded-md border border-[#25344b] bg-[#05080e]">
          {selectedSource && !previewError && <img ref={onImage} key={`${selectedSource}-${previewRevision}`} crossOrigin="anonymous" src={`${NDI_ORIGIN}/ndi/preview?source=${encodeURIComponent(selectedSource)}&revision=${previewRevision}`} onLoad={() => setPreviewReady(true)} onError={() => { setPreviewError(true); setPreviewReady(false); }} alt={`Preview NDI: ${selectedSource}`} className="absolute inset-0 h-full w-full object-contain" />}
          {(!selectedSource || previewError) && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-slate-300">
            {previewError ? <AlertTriangle size={25} className="text-amber-400" /> : <MonitorPlay size={25} />}
            <span className="text-[10px] font-semibold">{previewError ? "Não foi possível receber vídeo desta fonte. Verifique o emissor e atualize o preview." : "Selecione uma fonte NDI da rede para visualizar."}</span>
          </div>}
        </div>
        {selectedSource && <p className="mt-1.5 truncate text-[9px] font-bold text-slate-400" title={selectedSource}>{selectedSource}</p>}
        <a href="https://ndi.video/" target="_blank" rel="noreferrer" className="mt-1 block text-[9px] text-slate-500">NDI®</a>
      </div>
    </aside>
  );
}
