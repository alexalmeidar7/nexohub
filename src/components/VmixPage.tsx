import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Monitor, Play, Pause, SkipForward, Volume2, VolumeX, Camera, Disc, Settings, RefreshCw, Loader2, CheckCircle, XCircle, Radio } from "lucide-react";
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
}

const inputStyle: React.CSSProperties = {
  backgroundColor: "#d9e9fa",
  color: "#0d0446",
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 14,
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "#d9e9fa",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
};

const headerStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #0d0446, #1a0a6e)",
  borderRadius: 12,
  padding: "12px 18px",
  color: "#ffffff",
};

const btnStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #268ffa, #2dbef3)",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "10px 20px",
  fontWeight: 600,
  cursor: "pointer",
};

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

  // Load saved vMix URL from empresa_config or user_settings
  useEffect(() => {
    if (!user) return;
    // We'll store the vMix URL in user_settings.music_xml_url field temporarily
    // or better, we use a dedicated approach
    const stored = localStorage.getItem(`vmix_url_${user.id}`);
    if (stored) {
      setVmixUrl(stored);
      setSavedUrl(stored);
    }
    setLoading(false);
  }, [user]);

  const saveUrl = () => {
    if (!user || !vmixUrl.trim()) return;
    localStorage.setItem(`vmix_url_${user.id}`, vmixUrl.trim());
    setSavedUrl(vmixUrl.trim());
    toast({ title: "URL salva", description: "Endereço do vMix Web Controller salvo." });
  };

  const connectToVmix = useCallback(async () => {
    if (!savedUrl) return;
    setConnecting(true);
    try {
      // vMix Web Controller API endpoint
      const apiUrl = savedUrl.replace(/\/+$/, "") + "/api/";
      const response = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Conexão falhou");
      const xmlText = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlText, "text/xml");

      // Parse inputs
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
        });
      });
      setInputs(parsedInputs);

      // Parse active/preview
      const active = xml.querySelector("active");
      const preview = xml.querySelector("preview");
      if (active) setActiveInput(active.textContent);
      if (preview) setPreviewInput(preview.textContent);

      // Parse streaming/recording
      const streamingEl = xml.querySelector("streaming");
      const recordingEl = xml.querySelector("recording");
      if (streamingEl) setStreaming(streamingEl.textContent === "True");
      if (recordingEl) setRecording(recordingEl.textContent === "True");

      setConnected(true);
      toast({ title: "Conectado!", description: `vMix conectado com ${parsedInputs.length} inputs.` });
    } catch (err: any) {
      setConnected(false);
      toast({
        title: "Erro de conexão",
        description: "Não foi possível conectar ao vMix. Verifique se o Web Controller está ativo e a URL está correta.",
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
      // Refresh state
      setTimeout(() => connectToVmix(), 300);
    } catch {
      toast({ title: "Erro", description: "Falha ao enviar comando.", variant: "destructive" });
    }
  };

  if (loading) return <ModulePageSkeleton />;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div style={headerStyle} className="flex items-center gap-3">
        <Monitor size={20} />
        <div>
          <h3 className="font-bold text-base text-white">Controle vMix</h3>
          <p className="text-xs text-white/70">Integração com vMix Web Controller para controle de transmissão ao vivo</p>
        </div>
      </div>

      {/* Connection Setup */}
      <div style={cardStyle}>
        <h4 className="font-bold text-sm mb-3" style={{ color: "#0d0446" }}>Configuração de Conexão</h4>
        <p className="text-xs mb-3" style={{ color: "#0d0446" }}>
          Insira o endereço do vMix Web Controller (ex: <code className="px-1 py-0.5 rounded text-xs" style={{ backgroundColor: "#0d044610" }}>http://192.168.1.100:8088</code>)
        </p>
        <div className="flex gap-3 items-center flex-wrap">
          <input
            type="text"
            value={vmixUrl}
            onChange={e => setVmixUrl(e.target.value)}
            placeholder="http://192.168.1.100:8088"
            className="flex-1 min-w-[250px]"
            style={inputStyle}
          />
          <button onClick={saveUrl} style={btnStyle} className="text-sm">
            Salvar
          </button>
          {savedUrl && (
            <>
              <button
                onClick={connectToVmix}
                disabled={connecting}
                className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all"
                style={{
                  backgroundColor: connected ? "#22c55e" : "#0d0446",
                  color: "#fff",
                  opacity: connecting ? 0.7 : 1,
                }}
              >
                {connecting ? <Loader2 size={14} className="animate-spin" /> : connected ? <CheckCircle size={14} /> : <RefreshCw size={14} />}
                {connecting ? "Conectando..." : connected ? "Conectado" : "Conectar"}
              </button>
              <button
                onClick={() => window.open(savedUrl, "_blank")}
                className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#6366f1", color: "#fff" }}
              >
                <Monitor size={14} />
                Abrir vMix Externo
              </button>
            </>
          )}
        </div>
        {savedUrl && !connected && !connecting && (
          <p className="text-xs mt-2 flex items-center gap-1" style={{ color: "#dc2626" }}>
            <XCircle size={12} /> Desconectado — clique em "Conectar" para iniciar
          </p>
        )}
      </div>

      {/* Controls - only when connected */}
      {connected && (
        <>
          {/* Streaming & Recording Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div style={cardStyle} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Radio size={18} style={{ color: streaming ? "#dc2626" : "#0d0446" }} />
                <div>
                  <p className="font-bold text-sm" style={{ color: "#0d0446" }}>Streaming</p>
                  <p className="text-xs" style={{ color: streaming ? "#dc2626" : "#0d044680" }}>
                    {streaming ? "● AO VIVO" : "Offline"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => sendCommand(streaming ? "StopStreaming" : "StartStreaming")}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white transition-all"
                style={{ backgroundColor: streaming ? "#dc2626" : "#22c55e" }}
              >
                {streaming ? "Parar" : "Iniciar"}
              </button>
            </div>

            <div style={cardStyle} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Disc size={18} style={{ color: recording ? "#dc2626" : "#0d0446" }} />
                <div>
                  <p className="font-bold text-sm" style={{ color: "#0d0446" }}>Gravação</p>
                  <p className="text-xs" style={{ color: recording ? "#dc2626" : "#0d044680" }}>
                    {recording ? "● Gravando" : "Parado"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => sendCommand(recording ? "StopRecording" : "StartRecording")}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white transition-all"
                style={{ backgroundColor: recording ? "#dc2626" : "#22c55e" }}
              >
                {recording ? "Parar" : "Iniciar"}
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={cardStyle}>
            <h4 className="font-bold text-sm mb-3" style={{ color: "#0d0446" }}>Ações Rápidas</h4>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => sendCommand("Cut")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: "#dc2626" }}>
                <Camera size={12} /> Cut
              </button>
              <button onClick={() => sendCommand("Fade", undefined, "1000")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: "#f59e0b" }}>
                <SkipForward size={12} /> Fade
              </button>
              <button onClick={() => sendCommand("FadeToBlack")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: "#0d0446" }}>
                FTB
              </button>
              <button onClick={() => connectToVmix()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold" style={{ backgroundColor: "#d9e9fa", color: "#0d0446" }}>
                <RefreshCw size={12} /> Atualizar
              </button>
            </div>
          </div>

          {/* Inputs List */}
          <div style={cardStyle}>
            <h4 className="font-bold text-sm mb-3" style={{ color: "#0d0446" }}>Inputs ({inputs.length})</h4>
            <div className="space-y-2">
              {inputs.map((input) => {
                const isActive = activeInput === input.number;
                const isPreview = previewInput === input.number;
                return (
                  <div
                    key={input.key || input.number}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                    style={{
                      backgroundColor: isActive ? "#dc262615" : isPreview ? "#22c55e15" : "#0d044608",
                      border: isActive ? "2px solid #dc2626" : isPreview ? "2px solid #22c55e" : "2px solid transparent",
                    }}
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: isActive ? "#dc2626" : isPreview ? "#22c55e" : "#0d0446" }}>
                      {input.number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: "#0d0446" }}>{input.title}</p>
                      <p className="text-[10px]" style={{ color: "#0d044680" }}>
                        {input.type} {isActive && "• PROGRAM"} {isPreview && "• PREVIEW"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => sendCommand("PreviewInput", input.number)}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                        style={{ backgroundColor: isPreview ? "#22c55e" : "#0d044615", color: isPreview ? "#fff" : "#0d0446" }}
                      >
                        PRV
                      </button>
                      <button
                        onClick={() => sendCommand("Cut", input.number)}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                        style={{ backgroundColor: isActive ? "#dc2626" : "#dc262615", color: isActive ? "#fff" : "#dc2626" }}
                      >
                        PGM
                      </button>
                    </div>
                  </div>
                );
              })}
              {inputs.length === 0 && (
                <p className="text-center text-xs py-4" style={{ color: "#0d044660" }}>Nenhum input encontrado no vMix.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Help */}
      <div style={{ ...cardStyle, backgroundColor: "#0d044608" }}>
        <h4 className="font-bold text-sm mb-2" style={{ color: "#0d0446" }}>Como configurar</h4>
        <ol className="text-xs space-y-1 list-decimal list-inside" style={{ color: "#0d0446" }}>
          <li>Abra o vMix no computador de transmissão</li>
          <li>Vá em <strong>Settings → Web Controller</strong> e ative o servidor web</li>
          <li>Anote o IP e porta exibidos (ex: <code>http://192.168.1.100:8088</code>)</li>
          <li>Cole o endereço no campo acima e clique em "Conectar"</li>
          <li>O computador com o NexoHub precisa estar na mesma rede que o vMix</li>
        </ol>
      </div>
    </div>
  );
}
