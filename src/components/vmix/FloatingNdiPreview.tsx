import { useEffect, useState } from "react";
import { AlertTriangle, Maximize2, Minimize2, MonitorPlay, RefreshCw, Settings, X } from "lucide-react";

type VideoDevice = { deviceId: string; label: string };
type NdiNetworkSource = { name: string; address: string };

export default function FloatingNdiPreview({
  baseUrl: _baseUrl,
  targetSelector = "#custom-buttons-panel",
  onRefreshSources,
}: {
  inputs: { key: string; number: string; title: string; type: string }[];
  baseUrl: string;
  targetSelector?: string;
  onRefreshSources?: () => Promise<unknown> | void;
}) {
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [setupOpen, setSetupOpen] = useState(() => {
    try { return !window.localStorage.getItem("housemix:ndi-preview-device:v1") && !window.localStorage.getItem("housemix:ndi-preview-network-source:v1"); } catch { return true; }
  });
  const [rightOffset, setRightOffset] = useState(16);
  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [networkSources, setNetworkSources] = useState<NdiNetworkSource[]>([]);
  const [networkDiscoveryMessage, setNetworkDiscoveryMessage] = useState("");
  const [loadingNetworkSources, setLoadingNetworkSources] = useState(false);
  const [selectedNetworkSource, setSelectedNetworkSource] = useState(() => { try { return window.localStorage.getItem("housemix:ndi-preview-network-source:v1") || ""; } catch { return ""; } });
  const storageKey = "housemix:ndi-preview-device:v1";
  const [selectedDevice, setSelectedDevice] = useState(() => {
    try { return window.localStorage.getItem(storageKey) || ""; } catch { return ""; }
  });
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refreshNetworkSources = async () => {
    setLoadingNetworkSources(true);
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 5000);
      const response = await fetch("http://127.0.0.1:8765/ndi/sources", { cache: "no-store", signal: controller.signal }).finally(() => window.clearTimeout(timeout));
      const payload = await response.json();
      if (!response.ok || !payload.available) {
        setNetworkSources([]);
        setNetworkDiscoveryMessage(payload.message || "Não foi possível descobrir fontes NDI da rede. Verifique se o Nexo Bridge está aberto neste computador.");
        return;
      }
      const sources = Array.isArray(payload.sources) ? payload.sources as NdiNetworkSource[] : [];
      setNetworkSources(sources);
      setNetworkDiscoveryMessage(sources.length ? "" : "Nenhuma fonte NDI encontrada na rede.");
      setSelectedNetworkSource((current) => {
        const saved = (() => { try { return window.localStorage.getItem("housemix:ndi-preview-network-source:v1") || ""; } catch { return ""; } })();
        const next = [saved, current].find((name) => name && sources.some((source) => source.name === name)) || "";
        return next;
      });
    } catch {
      setNetworkSources([]);
      setNetworkDiscoveryMessage("Abra o Nexo Bridge neste computador para descobrir todas as fontes NDI visíveis na rede.");
    } finally {
      setLoadingNetworkSources(false);
    }
  };

  const handleNetworkSourceChange = (name: string) => {
    setSelectedNetworkSource(name);
    try {
      if (name) window.localStorage.setItem("housemix:ndi-preview-network-source:v1", name);
      else window.localStorage.removeItem("housemix:ndi-preview-network-source:v1");
    } catch { /* storage may be disabled */ }
  };

  const refreshDevices = async () => {
    void refreshNetworkSources();
    if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
      setError("Este navegador não permite acesso à câmera. Abra o House Mix no Chrome ou Edge atualizado, usando HTTPS.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // A permissão revela os nomes dos dispositivos virtuais, inclusive NDI Webcam Input.
      const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      permissionStream.getTracks().forEach((track) => track.stop());
      const list = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = list
        .filter((device) => device.kind === "videoinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || "Câmera local " + (index + 1),
        }));
      setDevices(videoDevices);
      await refreshNetworkSources();
      const ndiDevice = videoDevices.find((device) => /ndi webcam input/i.test(device.label));
      const savedDevice = (() => {
        try { return window.localStorage.getItem(storageKey) || ""; } catch { return ""; }
      })();
      const nextSelected = savedDevice && videoDevices.some((device) => device.deviceId === savedDevice)
        ? savedDevice
        : selectedDevice && videoDevices.some((device) => device.deviceId === selectedDevice)
          ? selectedDevice
          : ndiDevice?.deviceId || videoDevices[0]?.deviceId || "";
      setSelectedDevice(nextSelected);
      if (nextSelected) {
        try { window.localStorage.setItem(storageKey, nextSelected); } catch { /* storage may be disabled */ }
      }
      if (!videoDevices.length) setError("Nenhuma câmera local foi encontrada. Instale e abra o NDI Webcam Input e selecione uma fonte NDI nele.");
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : "";
      setError(name === "NotAllowedError"
        ? "Permita o acesso à câmera para o House Mix nas configurações do navegador."
        : "Não foi possível listar as câmeras locais. Verifique a permissão do navegador e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void onRefreshSources?.();
    void refreshNetworkSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!selectedDevice || !navigator.mediaDevices?.getUserMedia) {
      setStream(null);
      return;
    }
    let cancelled = false;
    let nextStream: MediaStream | null = null;
    setError("");
    navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: selectedDevice } },
      audio: false,
    }).then((result) => {
      if (cancelled) {
        result.getTracks().forEach((track) => track.stop());
        return;
      }
      nextStream = result;
      setStream(result);
    }).catch((cause: unknown) => {
      const name = cause instanceof DOMException ? cause.name : "";
      setStream(null);
      setError(name === "NotAllowedError"
        ? "Permita o acesso à câmera nas configurações do navegador."
        : "Não foi possível abrir este dispositivo. Verifique se ele está disponível e tente atualizar a lista.");
    });
    return () => {
      cancelled = true;
      nextStream?.getTracks().forEach((track) => track.stop());
    };
  }, [selectedDevice]);

  const handleDeviceChange = (deviceId: string) => {
    setSelectedDevice(deviceId);
    try {
      if (deviceId) window.localStorage.setItem(storageKey, deviceId);
      else window.localStorage.removeItem(storageKey);
    } catch { /* storage may be disabled */ }
  };

  const selectedLabel = devices.find((device) => device.deviceId === selectedDevice)?.label || "";

  if (!visible) {
    return (
      <button type="button" onClick={() => setVisible(true)} className="fixed bottom-16 z-[60] flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold text-white shadow-xl" style={{ right: rightOffset + "px", background: "#17243d", borderColor: "#315078" }}>
        <MonitorPlay size={15} /> Preview
      </button>
    );
  }

  return (
    <aside className="fixed bottom-16 z-[60] overflow-hidden rounded-xl shadow-2xl" style={{ right: rightOffset + "px", width: expanded ? "min(640px, calc(100vw - 32px))" : "min(340px, calc(100vw - 32px))", background: "#111b2d", border: "1px solid #314766", boxShadow: "0 18px 50px #0008" }} aria-label="Preview">
      <header className="flex items-center gap-2 px-3 py-2" style={{ background: "#17243d", borderBottom: "1px solid #314766" }}>
        <span className="h-2 w-2 rounded-full" style={{ background: stream ? "#8bcf38" : "#64748b" }} />
        <span className="flex-1 text-[10px] font-black uppercase tracking-wider text-white">Preview</span>
        <button type="button" onClick={() => void refreshDevices()} title="Atualizar dispositivos de vídeo" aria-label="Atualizar dispositivos de vídeo" className="rounded p-1 text-slate-300 hover:bg-white/10"><RefreshCw size={13} /></button>
        <button type="button" onClick={() => setSetupOpen((value) => !value)} title="Selecionar dispositivo" aria-label="Selecionar dispositivo" className={"rounded p-1 hover:bg-white/10 " + (setupOpen ? "text-white" : "text-slate-300")}><Settings size={13} /></button>
        <button type="button" onClick={() => setExpanded((value) => !value)} title={expanded ? "Reduzir preview" : "Expandir preview"} className="rounded p-1 text-slate-300 hover:bg-white/10">{expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
        <button type="button" onClick={() => setVisible(false)} title="Ocultar preview" className="rounded p-1 text-slate-300 hover:bg-white/10"><X size={13} /></button>
      </header>
      <div className="p-2">
        {setupOpen && <>
          <div className="mb-2 flex flex-col gap-1.5">
            <div className="flex gap-1.5">
              <select value={selectedNetworkSource} onChange={(event) => handleNetworkSourceChange(event.target.value)} className="h-8 min-w-0 flex-1 rounded-md border px-2 text-[10px] text-white outline-none" style={{ background: "#0c1525", borderColor: "#314766" }} aria-label="Fonte NDI disponivel na rede">
                <option value="">{loadingNetworkSources ? "Buscando fontes NDI na rede..." : "Selecione uma fonte NDI da rede..."}</option>
                {networkSources.map((source) => <option key={`${source.name}-${source.address}`} value={source.name}>{source.name}{source.address ? ` - ${source.address}` : ""}</option>)}
              </select>
              <button type="button" onClick={() => void refreshNetworkSources()} disabled={loadingNetworkSources} title="Atualizar fontes NDI da rede" className="shrink-0 rounded-md border border-white/20 px-2 text-[9px] font-bold text-white hover:bg-white/10 disabled:opacity-50">{loadingNetworkSources ? "..." : "NDI"}</button>
            </div>
            {networkDiscoveryMessage && <p className="px-1 text-[9px] leading-snug text-slate-400">{networkDiscoveryMessage}</p>}
          </div>
          <div className="mb-2 flex gap-1.5">
            <select value={selectedDevice} onChange={(event) => handleDeviceChange(event.target.value)} className="h-8 min-w-0 flex-1 rounded-md border px-2 text-[10px] text-white outline-none" style={{ background: "#0c1525", borderColor: "#314766" }}>
              <option value="">Selecione a câmera NDI…</option>
              {devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
            </select>
            <button type="button" onClick={() => void refreshDevices()} disabled={loading} className="shrink-0 rounded-md border border-white/20 px-2 text-[9px] font-bold text-white hover:bg-white/10 disabled:opacity-50">{loading ? "…" : "Listar"}</button>
          </div>
        </>}
        <div className="relative aspect-video overflow-hidden rounded-md" style={{ background: "#05080e", border: "1px solid #25344b" }}>
          {stream ? (
            <VideoStream stream={stream} label={selectedLabel} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-5 text-center text-slate-400">
              {error ? <AlertTriangle size={25} className="text-amber-400" /> : <MonitorPlay size={25} />}
              <span className="text-[10px] font-semibold">{error || "Para ver uma fonte NDI sem Bridge, abra o NDI Webcam Input no computador, selecione nele a fonte da rede e depois escolha esse dispositivo aqui."}</span>
              <button type="button" onClick={() => void refreshDevices()} disabled={loading} className="rounded-md border border-white/20 px-2 py-1 text-[9px] font-bold text-white hover:bg-white/10 disabled:opacity-50">{loading ? "Carregando…" : "Ativar e listar câmeras"}</button>
            </div>
          )}
        </div>
        {(selectedNetworkSource || selectedLabel) && <p className="mt-1.5 truncate text-[9px] font-bold text-slate-400">{selectedNetworkSource ? `NDI da rede: ${selectedNetworkSource}` : selectedLabel}</p>}
      </div>
    </aside>
  );
}

function VideoStream({ stream, label }: { stream: MediaStream; label: string }) {
  const ref = (element: HTMLVideoElement | null) => {
    if (element && element.srcObject !== stream) {
      element.srcObject = stream;
      void element.play().catch(() => {});
    }
  };
  return <video ref={ref} autoPlay playsInline muted aria-label={label || "Preview de vídeo"} className="absolute inset-0 h-full w-full object-contain" />;
}
