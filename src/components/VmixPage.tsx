import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Monitor, Radio, Disc, RefreshCw, Loader2, CheckCircle, XCircle,
  Settings, ExternalLink, Volume2, VolumeX
} from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

interface VmixInput {
  key: string;
  number: string;
  title: string;
  type: string;
  state: string;
  duration?: string;
  position?: string;
  loop?: string;
  muted?: boolean;
}

export default function VmixPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [vmixUrl, setVmixUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [inputs, setInputs] = useState<VmixInput[]>([]);
  const [activeInput, setActiveInput] = useState<string | null>(null);
  const [previewInput, setPreviewInput] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [activeTab, setActiveTab] = useState<"inputs" | "audio" | "config">("inputs");

  useEffect(() => {
    if (!user) return;
    const loadUrl = async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("vmix_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.vmix_url) {
        setVmixUrl(data.vmix_url);
        setSavedUrl(data.vmix_url);
      }
      setLoading(false);
    };
    loadUrl();
  }, [user]);

  const saveUrl = async () => {
    if (!user || !vmixUrl.trim()) return;
    const trimmed = vmixUrl.trim();
    const { data: existing } = await supabase
      .from("user_settings")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) {
      await supabase.from("user_settings").update({ vmix_url: trimmed }).eq("user_id", user.id);
    } else {
      await supabase.from("user_settings").insert({ user_id: user.id, vmix_url: trimmed });
    }
    setSavedUrl(trimmed);
    localStorage.setItem(`vmix_url_${user.id}`, trimmed);
    toast({ title: "URL salva", description: "Endereço do vMix Web Controller salvo." });
  };

  const connectToVmix = useCallback(async () => {
    if (!savedUrl) return;
    setConnecting(true);
    try {
      const apiUrl = savedUrl.replace(/\/+$/, "") + "/api/";
      const response = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Conexão falhou");
      const xmlText = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlText, "text/xml");

      const inputElements = xml.querySelectorAll("input");
      const parsedInputs: VmixInput[] = [];
      inputElements.forEach((el) => {
        parsedInputs.push({
          key: el.getAttribute("key") || "",
          number: el.getAttribute("number") || "",
          title: el.getAttribute("title") || el.textContent || "",
          type: el.getAttribute("type") || "",
          state: el.getAttribute("state") || "Paused",
          duration: el.getAttribute("duration") || undefined,
          position: el.getAttribute("position") || undefined,
          loop: el.getAttribute("loop") || undefined,
          muted: el.getAttribute("muted") === "True",
        });
      });
      setInputs(parsedInputs);

      const active = xml.querySelector("active");
      const preview = xml.querySelector("preview");
      if (active) setActiveInput(active.textContent);
      if (preview) setPreviewInput(preview.textContent);

      const streamingEl = xml.querySelector("streaming");
      const recordingEl = xml.querySelector("recording");
      if (streamingEl) setStreaming(streamingEl.textContent === "True");
      if (recordingEl) setRecording(recordingEl.textContent === "True");

      setConnected(true);
      toast({ title: "Conectado!", description: `vMix conectado com ${parsedInputs.length} inputs.` });
    } catch {
      setConnected(false);
      toast({
        title: "Erro de conexão",
        description: "Não foi possível conectar ao vMix.",
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  }, [savedUrl, toast]);

  const sendCommand = async (fn: string, input?: string, value?: string) => {
    if (!savedUrl) return;
    try {
      let url = `${savedUrl.replace(/\/+$/, "")}/api/?Function=${fn}`;
      if (input) url += `&Input=${input}`;
      if (value) url += `&Value=${value}`;
      await fetch(url);
      setTimeout(() => connectToVmix(), 300);
    } catch {
      toast({ title: "Erro", description: "Falha ao enviar comando.", variant: "destructive" });
    }
  };

  if (loading) return <ModulePageSkeleton />;

  // ── Not connected: config screen ──
  if (!connected) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl" style={{ background: "linear-gradient(135deg,#111,#1e1e2e)" }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#dc2626,#f43f5e)" }}>
            <Monitor size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">vMix Control</h3>
            <p className="text-[11px] text-white/50">Configure a conexão com o Web Controller</p>
          </div>
        </div>

        {/* URL Input */}
        <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: "#1a1a2e", border: "1px solid #ffffff10" }}>
          <label className="text-xs font-semibold text-white/70">URL do Web Controller</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={vmixUrl}
              onChange={e => setVmixUrl(e.target.value)}
              placeholder="http://192.168.1.100:8088"
              className="flex-1 px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ backgroundColor: "#111", color: "#fff", border: "1px solid #ffffff15" }}
            />
            <button onClick={saveUrl} className="px-4 py-2.5 rounded-lg text-sm font-bold text-white" style={{ background: "linear-gradient(135deg,#268ffa,#2dbef3)" }}>
              Salvar
            </button>
          </div>

          {savedUrl && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={connectToVmix}
                disabled={connecting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white transition-all"
                style={{ backgroundColor: "#22c55e", opacity: connecting ? 0.6 : 1 }}
              >
                {connecting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {connecting ? "Conectando..." : "Conectar"}
              </button>
              <button
                onClick={() => window.open(savedUrl, "_blank")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white/70 hover:text-white transition-colors"
                style={{ backgroundColor: "#ffffff10" }}
              >
                <ExternalLink size={14} /> Abrir Externo
              </button>
            </div>
          )}
        </div>

        {/* Help */}
        <div className="rounded-xl p-5" style={{ backgroundColor: "#1a1a2e", border: "1px solid #ffffff10" }}>
          <h4 className="font-bold text-xs text-white/80 mb-3">Como configurar</h4>
          <ol className="text-[11px] space-y-1.5 list-decimal list-inside text-white/50">
            <li>Abra o vMix no computador de transmissão</li>
            <li>Vá em <strong className="text-white/70">Settings → Web Controller</strong> e ative</li>
            <li>Anote o IP e porta (ex: <code className="text-white/60 bg-white/5 px-1 rounded">http://192.168.1.100:8088</code>)</li>
            <li>Cole acima, salve e clique em "Conectar"</li>
            <li>Os dispositivos precisam estar na mesma rede</li>
          </ol>
        </div>
      </div>
    );
  }

  // ── Connected: broadcast control layout ──
  const activeInputObj = inputs.find(i => i.number === activeInput);
  const previewInputObj = inputs.find(i => i.number === previewInput);

  const tabs = [
    { key: "inputs" as const, label: "INPUTS" },
    { key: "audio" as const, label: "AUDIO" },
    { key: "config" as const, label: "CONFIG" },
  ];

  return (
    <div className="space-y-0 max-w-full" style={{ color: "#e0e0e0" }}>
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-4 py-2 rounded-t-xl" style={{ backgroundColor: "#111118" }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: connected ? "#22c55e" : "#dc2626" }} />
            <span className="text-xs font-bold text-white/80">vMix Control</span>
          </div>
          <div className="flex items-center gap-2">
            {/* GO LIVE */}
            <button
              onClick={() => sendCommand(streaming ? "StopStreaming" : "StartStreaming")}
              className="px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all"
              style={{
                backgroundColor: streaming ? "#dc2626" : "#333",
                color: streaming ? "#fff" : "#aaa",
                boxShadow: streaming ? "0 0 12px #dc262680" : "none",
              }}
            >
              {streaming ? "● LIVE" : "GO LIVE"}
            </button>
            {/* RECORD */}
            <button
              onClick={() => sendCommand(recording ? "StopRecording" : "StartRecording")}
              className="px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all"
              style={{
                backgroundColor: recording ? "#dc2626" : "#333",
                color: recording ? "#fff" : "#aaa",
              }}
            >
              {recording ? "● REC" : "RECORD"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => connectToVmix()} className="text-white/40 hover:text-white transition-colors" title="Atualizar">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => window.open(savedUrl, "_blank")} className="text-white/40 hover:text-white transition-colors" title="Abrir Externo">
            <ExternalLink size={14} />
          </button>
        </div>
      </div>

      {/* ── Preview / Program Monitors ── */}
      <div className="grid grid-cols-2 gap-[2px]" style={{ backgroundColor: "#0a0a12" }}>
        {/* PREVIEW */}
        <div className="relative" style={{ backgroundColor: "#111118", minHeight: 180 }}>
          <div className="absolute top-2 left-3 z-10">
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded" style={{ backgroundColor: "#22c55e", color: "#000" }}>
              Preview
            </span>
          </div>
          <div className="flex items-center justify-center h-full px-6 py-10">
            <div className="text-center">
              <p className="text-white/90 font-bold text-lg">{previewInputObj?.title || "—"}</p>
              <p className="text-[10px] text-white/40 mt-1">Input {previewInput || "—"} • {previewInputObj?.type || ""}</p>
            </div>
          </div>
        </div>

        {/* PROGRAM / OUTPUT */}
        <div className="relative" style={{ backgroundColor: "#111118", minHeight: 180 }}>
          <div className="absolute top-2 left-3 z-10">
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded" style={{ backgroundColor: "#dc2626", color: "#fff" }}>
              Output
            </span>
          </div>
          <div className="flex items-center justify-center h-full px-6 py-10">
            <div className="text-center">
              <p className="text-white/90 font-bold text-lg">{activeInputObj?.title || "—"}</p>
              <p className="text-[10px] text-white/40 mt-1">Input {activeInput || "—"} • {activeInputObj?.type || ""}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Transition Controls ── */}
      <div className="flex items-center gap-2 px-4 py-3" style={{ backgroundColor: "#15151f" }}>
        <button
          onClick={() => sendCommand("Cut")}
          className="px-5 py-2 rounded text-xs font-black uppercase tracking-wider"
          style={{ backgroundColor: "#dc2626", color: "#fff" }}
        >
          CUT
        </button>
        <button
          onClick={() => sendCommand("Fade", undefined, "1000")}
          className="px-5 py-2 rounded text-xs font-bold uppercase tracking-wider"
          style={{ backgroundColor: "#333", color: "#ddd" }}
        >
          AUTO
        </button>
        <button
          onClick={() => sendCommand("FadeToBlack")}
          className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider"
          style={{ backgroundColor: "#000", color: "#888", border: "1px solid #333" }}
        >
          FTB
        </button>

        <div className="flex-1" />

        {/* GFX Overlay toggles */}
        {inputs.filter(i => i.type === "GT" || i.type === "Xaml" || i.title.toLowerCase().includes("gfx")).slice(0, 4).map((gfx, idx) => (
          <div key={gfx.key} className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-bold text-white/40 uppercase">GFX {idx + 1}</span>
            <div className="flex gap-1">
              <button
                onClick={() => sendCommand("OverlayInput" + (idx + 1), gfx.number)}
                className="px-2 py-1 rounded text-[10px] font-bold"
                style={{ backgroundColor: "#dc2626", color: "#fff" }}
              >
                ON
              </button>
              <button
                onClick={() => sendCommand("OverlayInput" + (idx + 1) + "Off")}
                className="px-2 py-1 rounded text-[10px] font-bold"
                style={{ backgroundColor: "#333", color: "#aaa" }}
              >
                OFF
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Input Thumbnails Strip ── */}
      <div className="flex gap-[2px] overflow-x-auto py-1 px-1" style={{ backgroundColor: "#0a0a12" }}>
        {inputs.map((input) => {
          const isActive = activeInput === input.number;
          const isPreview = previewInput === input.number;
          return (
            <button
              key={input.key || input.number}
              onClick={() => sendCommand("PreviewInput", input.number)}
              className="flex-shrink-0 rounded-lg p-2 transition-all text-left"
              style={{
                width: 130,
                backgroundColor: "#1a1a28",
                border: isActive ? "2px solid #dc2626" : isPreview ? "2px solid #22c55e" : "2px solid transparent",
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[9px] font-bold px-1 rounded" style={{
                  backgroundColor: isActive ? "#dc2626" : isPreview ? "#22c55e" : "#333",
                  color: isActive || isPreview ? "#fff" : "#888",
                }}>
                  {input.number}
                </span>
                {isActive && <span className="text-[8px] text-red-400 font-bold">●</span>}
              </div>
              <p className="text-[10px] font-medium text-white/70 truncate">{input.title}</p>
              <p className="text-[8px] text-white/30">{input.type}</p>
            </button>
          );
        })}
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex" style={{ backgroundColor: "#111118" }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-6 py-2.5 text-xs font-bold uppercase tracking-wider transition-all"
            style={{
              backgroundColor: activeTab === tab.key ? "#dc2626" : "transparent",
              color: activeTab === tab.key ? "#fff" : "#666",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="rounded-b-xl p-4" style={{ backgroundColor: "#15151f", minHeight: 200 }}>
        {activeTab === "inputs" && (
          <div className="space-y-1.5">
            {inputs.map((input) => {
              const isActive = activeInput === input.number;
              const isPreview = previewInput === input.number;
              return (
                <div
                  key={input.key || input.number}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all"
                  style={{
                    backgroundColor: isActive ? "#dc262618" : isPreview ? "#22c55e12" : "#1a1a28",
                    borderLeft: isActive ? "3px solid #dc2626" : isPreview ? "3px solid #22c55e" : "3px solid transparent",
                  }}
                >
                  <div
                    className="w-7 h-7 rounded flex items-center justify-center text-[11px] font-black text-white"
                    style={{ backgroundColor: isActive ? "#dc2626" : isPreview ? "#22c55e" : "#333" }}
                  >
                    {input.number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xs text-white/90 truncate">{input.title}</p>
                    <p className="text-[9px] text-white/35">
                      {input.type}
                      {isActive && " • PROGRAM"}
                      {isPreview && " • PREVIEW"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => sendCommand("PreviewInput", input.number)}
                      className="px-2.5 py-1 rounded text-[10px] font-bold transition-all"
                      style={{
                        backgroundColor: isPreview ? "#22c55e" : "#ffffff08",
                        color: isPreview ? "#fff" : "#22c55e",
                      }}
                    >
                      PRV
                    </button>
                    <button
                      onClick={() => sendCommand("Cut", input.number)}
                      className="px-2.5 py-1 rounded text-[10px] font-bold transition-all"
                      style={{
                        backgroundColor: isActive ? "#dc2626" : "#ffffff08",
                        color: isActive ? "#fff" : "#dc2626",
                      }}
                    >
                      PGM
                    </button>
                  </div>
                </div>
              );
            })}
            {inputs.length === 0 && (
              <p className="text-center text-xs py-8 text-white/30">Nenhum input encontrado</p>
            )}
          </div>
        )}

        {activeTab === "audio" && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {inputs.map((input) => (
              <div key={input.key || input.number} className="flex flex-col items-center gap-2 flex-shrink-0" style={{ width: 70 }}>
                {/* Fader visual */}
                <div className="relative w-1.5 rounded-full" style={{ height: 120, backgroundColor: "#333" }}>
                  <div
                    className="absolute bottom-0 w-full rounded-full"
                    style={{
                      height: input.muted ? 0 : "70%",
                      backgroundColor: input.muted ? "#666" : "#22c55e",
                      transition: "height 0.3s",
                    }}
                  />
                </div>
                <button
                  onClick={() => sendCommand(input.muted ? "AudioOn" : "AudioOff", input.number)}
                  className="p-1.5 rounded"
                  style={{ backgroundColor: input.muted ? "#dc262630" : "#ffffff08" }}
                >
                  {input.muted
                    ? <VolumeX size={12} className="text-red-400" />
                    : <Volume2 size={12} className="text-green-400" />
                  }
                </button>
                <span className="text-[9px] text-white/50 text-center truncate w-full">{input.title}</span>
              </div>
            ))}
            {inputs.length === 0 && (
              <p className="text-xs text-white/30 py-8 w-full text-center">Sem dados de áudio</p>
            )}
          </div>
        )}

        {activeTab === "config" && (
          <div className="space-y-4 max-w-md">
            <div>
              <label className="text-[11px] font-semibold text-white/50 mb-1 block">URL do Web Controller</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={vmixUrl}
                  onChange={e => setVmixUrl(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: "#111", color: "#fff", border: "1px solid #ffffff15" }}
                />
                <button onClick={saveUrl} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#268ffa,#2dbef3)" }}>
                  Salvar
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setConnected(false); }}
                className="px-4 py-2 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: "#dc262620", color: "#f87171" }}
              >
                Desconectar
              </button>
              <button
                onClick={() => window.open(savedUrl, "_blank")}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white/60 hover:text-white"
                style={{ backgroundColor: "#ffffff08" }}
              >
                <ExternalLink size={12} /> Abrir vMix Externo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
