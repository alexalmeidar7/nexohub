import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Hls from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Monitor, Radio, Disc, RefreshCw, Loader2, CheckCircle, XCircle,
  ExternalLink, Volume2, VolumeX, Play, Square, Camera, Tv,
  Layers, Wand2, Plus, Trash2, GripVertical, Send, Eye, Wifi, HelpCircle, Activity, AlertTriangle, Shield

} from "lucide-react";
import logoMixControl from "@/assets/logo-mixcontrol.png";
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

interface SceneCommand {
  id: string;
  fn: string;
  input?: string;
  value?: string;
  label: string;
}

interface VmixScene {
  id: string;
  name: string;
  commands: SceneCommand[];
}

const COMMAND_OPTIONS = [
  { value: "Cut", label: "Cut (Cortar)", category: "Transição" },
  { value: "Fade", label: "Fade (Transição suave)", category: "Transição" },
  { value: "FadeToBlack", label: "Fade to Black", category: "Transição" },
  { value: "StartStreaming", label: "Iniciar Streaming", category: "Streaming" },
  { value: "StopStreaming", label: "Parar Streaming", category: "Streaming" },
  { value: "StartRecording", label: "Iniciar Gravação", category: "Gravação" },
  { value: "StopRecording", label: "Parar Gravação", category: "Gravação" },
  { value: "PreviewInput", label: "Preview Input", category: "Input" },
  { value: "OverlayInput1", label: "Overlay 1 ON", category: "Overlay" },
  { value: "OverlayInput1Off", label: "Overlay 1 OFF", category: "Overlay" },
  { value: "OverlayInput2", label: "Overlay 2 ON", category: "Overlay" },
  { value: "OverlayInput2Off", label: "Overlay 2 OFF", category: "Overlay" },
  { value: "OverlayInput3", label: "Overlay 3 ON", category: "Overlay" },
  { value: "OverlayInput3Off", label: "Overlay 3 OFF", category: "Overlay" },
  { value: "OverlayInput4", label: "Overlay 4 ON", category: "Overlay" },
  { value: "OverlayInput4Off", label: "Overlay 4 OFF", category: "Overlay" },
  { value: "AudioOn", label: "Ligar Áudio", category: "Áudio" },
  { value: "AudioOff", label: "Desligar Áudio", category: "Áudio" },
  { value: "SetVolume", label: "Volume (valor 0-100)", category: "Áudio" },
  { value: "AddInput", label: "Adicionar Input", category: "Input" },
  { value: "SetText", label: "Definir Texto (Title)", category: "Título" },
];

interface Programa {
  id: string;
  nome: string;
  ativo: boolean;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: string[] | null;
}

// Helper to detect private/local IPs
function isPrivateIp(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|localhost|::1)/i.test(hostname);
  } catch { return false; }
}

function isInsecureHttpUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "http:";
  } catch {
    return false;
  }
}
// Format keyboard event to a readable key name, distinguishing numpad from top-row numbers
function formatKeyName(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  const { code, key } = e;

  // Distinguish numpad numbers from top-row numbers
  if (code.startsWith("Numpad")) {
    const numpadKey = code.replace("Numpad", "");
    const numpadLabels: Record<string, string> = {
      "0": "Num 0", "1": "Num 1", "2": "Num 2", "3": "Num 3", "4": "Num 4",
      "5": "Num 5", "6": "Num 6", "7": "Num 7", "8": "Num 8", "9": "Num 9",
      "Decimal": "Num .", "Add": "Num +", "Subtract": "Num -",
      "Multiply": "Num *", "Divide": "Num /", "Enter": "Num Enter",
    };
    parts.push(numpadLabels[numpadKey] || `Num ${numpadKey}`);
  } else if (code.startsWith("Digit")) {
    parts.push(code.replace("Digit", ""));
  } else if (code.startsWith("Key")) {
    parts.push(code.replace("Key", "").toUpperCase());
  } else if (key === " ") {
    parts.push("Space");
  } else if (["Control", "Alt", "Shift", "Meta"].includes(key)) {
    // Don't add modifier-only keys
  } else {
    parts.push(key.length === 1 ? key.toUpperCase() : key);
  }

  return parts.join(" + ");
}

export default function VmixPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [vmixUrl, setVmixUrl] = useState("");
  const [vmixUser, setVmixUser] = useState("");
  const [vmixPass, setVmixPass] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [inputs, setInputs] = useState<VmixInput[]>([]);
  const [activeInput, setActiveInput] = useState<string | null>(null);
  const [previewInput, setPreviewInput] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [overlays, setOverlays] = useState<Record<number, boolean>>({ 1: false, 2: false, 3: false, 4: false });
  const [minimizedInputs, setMinimizedInputs] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"controls" | "scenes" | "ndi">("controls");
  // Keyboard shortcuts per input (persisted in localStorage)
  const [inputShortcuts, setInputShortcuts] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("vmix_input_shortcuts");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [capturingShortcut, setCapturingShortcut] = useState<string | null>(null);
   const [activePreset, setActivePreset] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<"direct" | "proxy">(() => {
    try { return (localStorage.getItem("vmix_conn_mode") as "direct" | "proxy") || "direct"; }
    catch { return "direct"; }
  });
  // HLS stream URLs per input (for NDI live preview)
  const [inputHlsUrls, setInputHlsUrls] = useState<Record<string, string>>(() => {
    try { const s = localStorage.getItem("vmix_input_hls"); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  const [editingHlsInput, setEditingHlsInput] = useState<string | null>(null);
  const [hlsTempUrl, setHlsTempUrl] = useState("");
   // Monitor stream URLs (MJPEG/JPEG/HLS for Preview and Output)
  const [monitorStreamUrls, setMonitorStreamUrls] = useState<{ preview: string; output: string }>(() => {
    try { const s = localStorage.getItem("vmix_monitor_streams"); return s ? JSON.parse(s) : { preview: "", output: "" }; } catch { return { preview: "", output: "" }; }
  });
  const [editingMonitorStream, setEditingMonitorStream] = useState<"preview" | "output" | null>(null);
  const [monitorStreamTemp, setMonitorStreamTemp] = useState("");
  // Iframe monitor mode (uses vMix Web Controller)
  const [monitorIframeMode, setMonitorIframeMode] = useState<{ preview: boolean; output: boolean }>(() => {
    try { const s = localStorage.getItem("vmix_monitor_iframe"); return s ? JSON.parse(s) : { preview: false, output: false }; } catch { return { preview: false, output: false }; }
  });

  // Programas from DB
  const [programas, setProgramas] = useState<Programa[]>([]);

  // Scenes state
  const [scenes, setScenes] = useState<VmixScene[]>(() => {
    try {
      const saved = localStorage.getItem("vmix_scenes");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [editingScene, setEditingScene] = useState<VmixScene | null>(null);
  const [runningScene, setRunningScene] = useState<string | null>(null);

  // Live clock
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })), 1000);
    return () => clearInterval(id);
  }, []);

   // (No thumbnail polling — vMix SnapshotInput saves to disk and triggers save dialogs)

  // NDI state
  const [ndiUrl, setNdiUrl] = useState("");
  const [ndiSources, setNdiSources] = useState<string[]>([]);
  const [ndiScanning, setNdiScanning] = useState(false);

  // Diagnostic state
  interface DiagResult {
    urlType: "local" | "public" | "invalid";
    protocol: "http" | "https" | "unknown";
    isSecureContext: boolean;
    mixedContentBlocked: boolean;
    directResult: "ok" | "fail" | "pending" | "skipped";
    directError: string;
    proxyResult: "ok" | "fail" | "pending" | "skipped";
    proxyError: string;
    recommendation: string;
  }
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<DiagResult | null>(null);
  const connectToVmixRef = useRef<(() => Promise<void>) | null>(null);
  const ndiAutoScanDoneRef = useRef(false);
  const silentFailCountRef = useRef(0);

  // Persist scenes
  useEffect(() => {
    localStorage.setItem("vmix_scenes", JSON.stringify(scenes));
  }, [scenes]);

  // Persist input shortcuts
  useEffect(() => {
    localStorage.setItem("vmix_input_shortcuts", JSON.stringify(inputShortcuts));
  }, [inputShortcuts]);


  // Persist HLS URLs
  useEffect(() => {
    localStorage.setItem("vmix_input_hls", JSON.stringify(inputHlsUrls));
  }, [inputHlsUrls]);

  // Persist monitor stream URLs
  useEffect(() => {
    localStorage.setItem("vmix_monitor_streams", JSON.stringify(monitorStreamUrls));
  }, [monitorStreamUrls]);

  // Persist monitor iframe mode
  useEffect(() => {
    localStorage.setItem("vmix_monitor_iframe", JSON.stringify(monitorIframeMode));
  }, [monitorIframeMode]);

  // Load programas from DB
  useEffect(() => {
    if (!user) return;
    supabase
      .from("programas")
      .select("id, nome, ativo, horario_inicio, horario_fim, dias_semana")
      .eq("user_id", user.id)
      .eq("ativo", true)
      .order("horario_inicio")
      .then(({ data }) => {
        if (data) setProgramas(data);
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadUrl = async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("vmix_url, vmix_user, vmix_pass")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.vmix_url) {
        setVmixUrl(data.vmix_url);
        setSavedUrl(data.vmix_url);
      }
      if (data?.vmix_user) setVmixUser(data.vmix_user);
      if (data?.vmix_pass) setVmixPass(data.vmix_pass);
      setLoading(false);
    };
    loadUrl();
  }, [user]);

  // Persist connection mode
  useEffect(() => {
    localStorage.setItem("vmix_conn_mode", connectionMode);
  }, [connectionMode]);

  const saveUrl = async () => {
    if (!user || !vmixUrl.trim()) return;
    const trimmed = vmixUrl.trim();
    const { data: existing } = await supabase
      .from("user_settings")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    const payload = { vmix_url: trimmed, vmix_user: vmixUser.trim(), vmix_pass: vmixPass };
    if (existing) {
      await supabase.from("user_settings").update(payload).eq("user_id", user.id);
    } else {
      await supabase.from("user_settings").insert({ user_id: user.id, ...payload });
    }
    setSavedUrl(trimmed);
    localStorage.setItem(`vmix_url_${user.id}`, trimmed);

    // Auto-detect best mode
    if (isPrivateIp(trimmed) && connectionMode === "proxy") {
      setConnectionMode("direct");
      toast({ title: "Modo alterado para Direto", description: "IP local detectado. Proxy em nuvem não alcança rede local." });
    } else if (!isPrivateIp(trimmed) && connectionMode === "direct") {
      setConnectionMode("proxy");
      toast({ title: "Modo alterado para Proxy", description: "IP público detectado. Usando conexão via proxy." });
    }
    toast({ title: "Configuração salva", description: "URL e credenciais do vMix salvas." });
  };

  // Direct fetch to vMix (browser → vMix, no edge function)
  const vmixDirectFetch = useCallback(async (path: string): Promise<string> => {
    if (!savedUrl) throw new Error("URL não configurada");
    const baseUrl = savedUrl.replace(/\/+$/, "");
    const targetUrl = baseUrl + path;
    const headers: Record<string, string> = {
      "Accept": "application/xml, text/xml, text/html, */*",
    };
    if (vmixUser) {
      headers["Authorization"] = `Basic ${btoa(`${vmixUser}:${vmixPass || ""}`)}`;
    }
    const response = await fetch(targetUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000),
    });
    return await response.text();
  }, [savedUrl, vmixUser, vmixPass]);

  // Proxy fetch via Edge Function (browser → cloud → vMix)
  const vmixProxyFetch = useCallback(async (path: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke("vmix-proxy", {
      body: { path },
    });

    if (error) {
      let message = error.message || "Proxy error";
      if (error.context instanceof Response) {
        try {
          const payload = await error.context.clone().json();
          if (payload?.error) message = payload.error;
        } catch {
          // ignore JSON parse failures
        }
      }
      throw new Error(message);
    }

    if (typeof data === "string") return data;
    return typeof data === "object" ? JSON.stringify(data) : String(data);
  }, []);

  // Unified fetch that uses the selected mode (or an explicit override)
  const vmixFetch = useCallback(async (path: string, modeOverride?: "direct" | "proxy"): Promise<string> => {
    const effectiveMode = modeOverride ?? connectionMode;
    if (effectiveMode === "direct") {
      return vmixDirectFetch(path);
    }
    return vmixProxyFetch(path);
  }, [connectionMode, vmixDirectFetch, vmixProxyFetch]);

   // ── Input type visual placeholders (SnapshotInput removed — it saves to disk on vMix!) ──
  const inputTypeColors: Record<string, string> = {
    Capture: "#1a3a5c", Camera: "#1a3a5c", NDI: "#1c4a2e",
    Video: "#3a1a5c", Image: "#5c3a1a", GT: "#4a4a1a",
    Blank: "#1a1a1a", Colour: "#1a1a1a", Audio: "#5c1a3a", Virtual: "#1a4a4a",
  };
  const getInputColor = (type: string): string => inputTypeColors[type] || "#1e1e24";

  // ── Diagnostic function ──
  const runDiagnostic = useCallback(async () => {
    if (!savedUrl) return;
    setDiagRunning(true);
    setDiagResult(null);

    const isLocal = isPrivateIp(savedUrl);
    const isEmbeddedPreview = window.self !== window.top;
    let protocol: "http" | "https" | "unknown" = "unknown";
    try { protocol = new URL(savedUrl).protocol === "https:" ? "https" : "http"; } catch {}
    const secureCtx = window.isSecureContext;

    const result: DiagResult = {
      urlType: isLocal ? "local" : "public",
      protocol,
      isSecureContext: secureCtx,
      mixedContentBlocked: false,
      directResult: "pending",
      directError: "",
      proxyResult: "pending",
      proxyError: "",
      recommendation: "",
    };

    // Test Direct
    try {
      const text = await vmixDirectFetch("/api/");
      result.directResult = text.includes("<vmix>") || text.includes("<inputs>") ? "ok" : "fail";
      if (result.directResult === "fail") result.directError = "Resposta não é XML do vMix";
    } catch (e) {
      result.directResult = "fail";
      const msg = e instanceof Error ? e.message : String(e);
      result.directError = msg;
      if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        if (secureCtx && protocol === "http") {
          result.mixedContentBlocked = true;
          result.directError = "Bloqueado por Mixed Content (HTTPS → HTTP)";
        } else {
          result.directError = "Rede inacessível ou CORS bloqueado pelo vMix";
        }
      }
    }

    // Test Proxy (somente para URL pública)
    if (isLocal) {
      result.proxyResult = "skipped";
      result.proxyError = "IP local/privado não é acessível pelo proxy em nuvem";
    } else {
      try {
        const text = await vmixProxyFetch("/api/");
        result.proxyResult = text.includes("<vmix>") || text.includes("<inputs>") || text.includes("version") ? "ok" : "fail";
        if (result.proxyResult === "fail") result.proxyError = "Resposta não é XML do vMix";
      } catch (e) {
        result.proxyResult = "fail";
        const msg = e instanceof Error ? e.message : String(e);
        result.proxyError = msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
      }
    }

    // Recommendation + Auto-fix
    let autoFixMode: "direct" | "proxy" | null = null;
    if (result.directResult === "ok") {
      result.recommendation = "✅ Modo DIRETO funcionando! Conectando automaticamente...";
      autoFixMode = "direct";
    } else if (result.proxyResult === "ok") {
      result.recommendation = "✅ Modo PROXY funcionando! Conectando automaticamente...";
      autoFixMode = "proxy";
    } else if (isLocal && result.mixedContentBlocked) {
      result.recommendation = isEmbeddedPreview
        ? "⚠️ O preview interno bloqueia HTTP local. Abra /vmix-control em nova aba e permita 'Conteúdo inseguro' no navegador para esse domínio."
        : "⚠️ O navegador bloqueia HTTP dentro de HTTPS (Mixed Content). Permita 'Conteúdo inseguro' para este site e tente novamente.";
    } else if (isLocal) {
      result.recommendation = "⚠️ IP local detectado. Use modo Direto na mesma rede local; o modo Proxy só funciona com URL pública/túnel.";
    } else {
      result.recommendation = "❌ Nenhum modo conectou. Verifique: 1) Port forwarding configurado no roteador (porta 8088 → IP do PC)? 2) vMix Web Controller ativo? 3) Firewall permite conexões na porta 8088?";
    }

    setDiagResult(result);
    setDiagRunning(false);

    // Auto-fix: switch mode and connect
    if (autoFixMode) {
      setConnectionMode(autoFixMode);
      toast({ title: `Modo alterado para ${autoFixMode === "direct" ? "Direto" : "Proxy"}`, description: "Conectando automaticamente..." });
      // Small delay to let state update, then connect
      setTimeout(() => {
        connectToVmixRef.current?.();
      }, 300);
    }
  }, [savedUrl, vmixDirectFetch, vmixProxyFetch, toast]);

  const connectToVmix = useCallback(async () => {
    if (!savedUrl) return;

    const isLocal = isPrivateIp(savedUrl);
    const isEmbeddedPreview = window.self !== window.top;
    const effectiveMode = connectionMode;

    if (effectiveMode === "proxy" && isLocal) {
      setConnected(false);
      setConnectionMode("direct");
      toast({
        title: "Proxy indisponível para IP local",
        description: isEmbeddedPreview
          ? "No preview interno, abra /vmix-control em nova aba e use o modo Direto."
          : "IP local não é acessível pelo proxy em nuvem. Mudamos para Direto automaticamente.",
        variant: "destructive",
      });
      if (isEmbeddedPreview) {
        window.open("/vmix-control", "_blank", "noopener,noreferrer");
      }
      return;
    }

    setConnecting(true);
    try {
      const xmlText = await vmixFetch("/api/", effectiveMode);
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

      // Parse overlay states
      for (let n = 1; n <= 4; n++) {
        const ovEl = xml.querySelector(`overlay[number="${n}"]`);
        if (ovEl) {
          const ovInput = ovEl.textContent || ovEl.getAttribute("input") || "";
          setOverlays(prev => ({ ...prev, [n]: ovInput !== "" && ovInput !== "0" }));
        }
      }

      setConnected(true);
      toast({ title: "Conectado!", description: `${parsedInputs.length} inputs (modo ${effectiveMode === "direct" ? "direto" : "proxy"}).` });
    } catch (err) {
      setConnected(false);
      const message = err instanceof Error ? err.message : "Verifique se o vMix Web Controller está ativo.";
      const isMixedOrCorsLikely =
        effectiveMode === "direct" &&
        isLocal &&
        /failed to fetch|networkerror|mixed content|cors/i.test(message);

      const hint = isMixedOrCorsLikely
        ? (isEmbeddedPreview
          ? " O preview interno bloqueia HTTP local. Abra /vmix-control em nova aba e permita 'Conteúdo inseguro' nesse domínio."
          : " No modo Direto (rede local), permita 'Conteúdo inseguro' para este site no navegador.")
        : effectiveMode === "direct" && !isLocal
        ? " IP público detectado — tente o modo 'Proxy'."
        : "";

      toast({ title: "Erro de conexão", description: `${message}${hint}`, variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  }, [savedUrl, toast, vmixFetch, connectionMode]);

  // Keep ref in sync for diagnostic auto-connect
  useEffect(() => { connectToVmixRef.current = connectToVmix; }, [connectToVmix]);

  // ── Keepalive polling — silently refresh vMix state every 5s ──
  const silentRefresh = useCallback(async () => {
    if (!savedUrl) return;
    try {
      const xmlText = await vmixFetch("/api/");
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

      for (let n = 1; n <= 4; n++) {
        const ovEl = xml.querySelector(`overlay[number="${n}"]`);
        if (ovEl) {
          const ovInput = ovEl.textContent || ovEl.getAttribute("input") || "";
          setOverlays(prev => ({ ...prev, [n]: ovInput !== "" && ovInput !== "0" }));
        }
      }
      // Reset fail counter on success
      silentFailCountRef.current = 0;
    } catch {
      // Only disconnect after 3 consecutive failures
      silentFailCountRef.current += 1;
      if (silentFailCountRef.current >= 3) {
        setConnected(false);
        silentFailCountRef.current = 0;
      }
    }
  }, [savedUrl, vmixFetch]);

  useEffect(() => {
    if (!connected || !savedUrl) return;
    silentFailCountRef.current = 0;
    const id = setInterval(silentRefresh, 5000);
    return () => clearInterval(id);
  }, [connected, savedUrl, silentRefresh]);

  const sendCommand = async (fn: string, input?: string, value?: string) => {
    if (!savedUrl) return;
    try {
      let path = `/api/?Function=${encodeURIComponent(fn)}`;
      if (input) path += `&Input=${encodeURIComponent(input)}`;
      if (value) path += `&Value=${encodeURIComponent(value)}`;
      await vmixFetch(path);
      // Refresh state after command
      setTimeout(() => connectToVmix(), 300);
    } catch {
      toast({ title: "Erro", description: "Falha ao enviar comando.", variant: "destructive" });
    }
  };

  const runScene = async (scene: VmixScene) => {
    setRunningScene(scene.id);
    for (const cmd of scene.commands) {
      await sendCommand(cmd.fn, cmd.input, cmd.value);
      await new Promise(r => setTimeout(r, 400));
    }
    setRunningScene(null);
    toast({ title: "Cena executada", description: `"${scene.name}" concluída.` });
  };

  // Extract machine names from existing NDI inputs to suggest common sources
  const detectedMachines = useMemo(() => {
    const machines = new Set<string>();
    inputs.forEach(inp => {
      if (inp.type === "NDI" || inp.title.toLowerCase().includes("ndi")) {
        const match = inp.title.match(/^(?:NDI\s+)?([A-Z0-9_-]+)\s*\(/i);
        if (match) machines.add(match[1]);
      }
    });
    return Array.from(machines);
  }, [inputs]);

  const scanNdiSources = useCallback(async () => {
    if (!savedUrl || !connected) {
      setNdiSources([]);
      return;
    }

    setNdiScanning(true);
    try {
      // IMPORTANT: vMix HTTP API does not expose live NDI network discovery (mDNS-only).
      // We build suggestions from machine names already seen in current NDI inputs.
      const machineList = [...detectedMachines];
      const suggestions: string[] = [];

      for (const machine of machineList) {
        suggestions.push(
          `${machine} (vMix - Output 1)`,
          `${machine} (vMix - Output 2)`,
          `${machine} (vMix - Output 3)`,
          `${machine} (vMix - Output 4)`,
          `${machine} (vMix Video)`,
          `${machine} (vMix Audio - Master)`,
          `${machine} (vMix Audio - Headphones)`,
          `${machine} (Radeon RX 460 Series 1)`,
          `${machine} (Radeon RX 460 Series 2)`,
        );
      }

      const uniqueSuggestions = Array.from(new Set(suggestions));
      setNdiSources(uniqueSuggestions);

      if (uniqueSuggestions.length === 0) {
        toast({
          title: "Busca NDI",
          description: "Nenhum host NDI detectado nos inputs atuais. Adicione uma fonte manual para iniciar a detecção assistida.",
        });
      }
    } catch {
      setNdiSources([]);
      toast({ title: "Erro", description: "Falha ao buscar fontes NDI.", variant: "destructive" });
    } finally {
      setNdiScanning(false);
    }
  }, [savedUrl, connected, detectedMachines, toast]);

  // Auto-scan only once when entering NDI tab to avoid re-trigger loop
  useEffect(() => {
    if (activeTab === "ndi" && connected) {
      if (!ndiAutoScanDoneRef.current) {
        ndiAutoScanDoneRef.current = true;
        scanNdiSources();
      }
      return;
    }

    if (activeTab !== "ndi") {
      ndiAutoScanDoneRef.current = false;
    }
  }, [activeTab, connected, scanNdiSources]);

  const addNdiInput = async (source?: string) => {
    const ndiName = source || ndiUrl.trim();
    if (!savedUrl || !ndiName) return;
    try {
      await vmixFetch(`/api/?Function=AddInput&Value=NDI|${encodeURIComponent(ndiName)}`);
      if (!source) setNdiUrl("");
      setTimeout(() => connectToVmix(), 500);
      toast({ title: "NDI adicionado", description: `Fonte "${ndiName}" adicionada como input.` });
    } catch {
      toast({ title: "Erro", description: "Falha ao adicionar fonte NDI.", variant: "destructive" });
    }
  };

  // Scene editor helpers
  const createNewScene = () => {
    setEditingScene({
      id: crypto.randomUUID(),
      name: "",
      commands: [],
    });
  };

  const addCommandToScene = () => {
    if (!editingScene) return;
    setEditingScene({
      ...editingScene,
      commands: [
        ...editingScene.commands,
        { id: crypto.randomUUID(), fn: "Cut", label: "Cut (Cortar)" },
      ],
    });
  };

  const updateSceneCommand = (cmdId: string, updates: Partial<SceneCommand>) => {
    if (!editingScene) return;
    setEditingScene({
      ...editingScene,
      commands: editingScene.commands.map(c =>
        c.id === cmdId ? { ...c, ...updates } : c
      ),
    });
  };

  const removeSceneCommand = (cmdId: string) => {
    if (!editingScene) return;
    setEditingScene({
      ...editingScene,
      commands: editingScene.commands.filter(c => c.id !== cmdId),
    });
  };

  const saveScene = () => {
    if (!editingScene || !editingScene.name.trim()) {
      toast({ title: "Nome obrigatório", description: "Dê um nome para a cena.", variant: "destructive" });
      return;
    }
    setScenes(prev => {
      const exists = prev.find(s => s.id === editingScene.id);
      if (exists) return prev.map(s => s.id === editingScene.id ? editingScene : s);
      return [...prev, editingScene];
    });
    setEditingScene(null);
    toast({ title: "Cena salva" });
  };

  const deleteScene = (id: string) => {
    setScenes(prev => prev.filter(s => s.id !== id));
  };

  // ── Demo mode: show connected UI with mock data in preview ──
  const isEmbeddedPreview = window.self !== window.top;
   const [demoMode, setDemoMode] = useState(false);
  const effectiveConnected = connected || demoMode;

  useEffect(() => {
    if (!loading && !connected && isEmbeddedPreview) {
      setDemoMode(true);
      // Set mock data so the connected UI renders fully
      if (inputs.length === 0) {
        setInputs([
          { key: "1", number: "1", title: "Camera 1", type: "Capture", state: "Running" },
          { key: "2", number: "2", title: "Camera 2", type: "Capture", state: "Running" },
          { key: "3", number: "3", title: "NDI - Studio PC", type: "NDI", state: "Running" },
          { key: "4", number: "4", title: "Lower Third", type: "GT", state: "Paused" },
        ]);
        setActiveInput("1");
        setPreviewInput("2");
        setSavedUrl(savedUrl || "http://192.168.100.6:8088");
        setVmixUrl(vmixUrl || "http://192.168.100.6:8088");
      }
    }
  }, [loading, connected, isEmbeddedPreview]);

  // Keyboard shortcut listener (must be after effectiveConnected)
  useEffect(() => {
    if (!effectiveConnected) return;
    const handler = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // If capturing a shortcut for an input, record it
      if (capturingShortcut) {
        e.preventDefault();
        e.stopPropagation();
        const keyName = formatKeyName(e);
        setInputShortcuts(prev => ({ ...prev, [capturingShortcut]: keyName }));
        setCapturingShortcut(null);
        return;
      }
      // Otherwise, check if the pressed key matches a shortcut
      const keyName = formatKeyName(e);
      const matchedInput = Object.entries(inputShortcuts).find(([_, shortcut]) => shortcut === keyName);
      if (matchedInput) {
        e.preventDefault();
        const inputNum = matchedInput[0];
        sendCommand("PreviewInput", inputNum);
        setPreviewInput(inputNum);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [effectiveConnected, capturingShortcut, inputShortcuts]);

  if (loading) return <ModulePageSkeleton />;

  const hasLocalHttpUrl = savedUrl && isPrivateIp(savedUrl) && isInsecureHttpUrl(savedUrl);
  const showNewTabBanner = isEmbeddedPreview && hasLocalHttpUrl && window.isSecureContext && !demoMode;

  const previewDomain = window.location.origin;

  // Helper: get input label with type indicator
  const inputLabel = (inp: VmixInput) => {
    const isNdi = inp.type === "NDI" || inp.title.toLowerCase().includes("ndi");
    return `${inp.number} – ${isNdi ? "🟢 " : ""}${inp.title}${isNdi ? " (NDI)" : ""}`;
  };

  // Group inputs for combo: regular inputs and NDI inputs
  const ndiInputs = inputs.filter(i => i.type === "NDI" || i.title.toLowerCase().includes("ndi"));
  const regularInputs = inputs.filter(i => i.type !== "NDI" && !i.title.toLowerCase().includes("ndi"));

  // ── Styles ──
  const sectionBox = (title: string, icon: React.ReactNode, children: React.ReactNode, _color = "#888") => (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#1a1a1f", border: "1px solid #ffffff08" }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ backgroundColor: "#ffffff06", borderBottom: "1px solid #ffffff08" }}>
        {icon}
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#999" }}>{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );

  const controlBtn = (label: string, onClick: () => void, bg: string, active = false) => (
    <button
      onClick={onClick}
      className="px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03]"
      style={{
        backgroundColor: active ? bg : bg + "30",
        color: active ? "#fff" : bg,
        boxShadow: active ? `0 0 16px ${bg}40` : "none",
        border: `1px solid ${active ? bg : bg + "40"}`,
      }}
      onMouseEnter={e => { (e.target as HTMLElement).style.boxShadow = `0 0 20px ${bg}50`; }}
      onMouseLeave={e => { (e.target as HTMLElement).style.boxShadow = active ? `0 0 16px ${bg}40` : "none"; }}
    >
      {label}
    </button>
  );

  // Render the select combo with grouped inputs (regular + NDI)
  const renderInputSelect = (value: string | null, onChange: (val: string) => void) => (
    <select
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      className="flex-1 text-[10px] rounded px-2 py-1 border-none outline-none"
      style={{ backgroundColor: "#222228", color: "#ccc" }}
    >
      <option value="">— Selecione —</option>
      {regularInputs.length > 0 && (
        <optgroup label="Inputs">
          {regularInputs.map(inp => (
            <option key={inp.key || inp.number} value={inp.number}>{inp.number} – {inp.title}</option>
          ))}
        </optgroup>
      )}
      {ndiInputs.length > 0 && (
        <optgroup label="NDI Sources">
          {ndiInputs.map(inp => (
            <option key={inp.key || inp.number} value={inp.number}>🟢 {inp.number} – {inp.title}</option>
          ))}
        </optgroup>
      )}
      {regularInputs.length === 0 && ndiInputs.length === 0 && inputs.map(inp => (
        <option key={inp.key || inp.number} value={inp.number}>{inp.number} – {inp.title}</option>
      ))}
    </select>
  );

   // HLS Video Player component for NDI inputs with configured stream URLs
  const HlsPlayer = ({ src, className = "" }: { src: string; className?: string }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
      const video = videoRef.current;
      if (!video || !src) return;
      let hls: Hls | null = null;
      if (src.includes(".m3u8") && Hls.isSupported()) {
        hls = new Hls({ enableWorker: false, lowLatencyMode: true });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
      } else {
        video.src = src;
        video.play().catch(() => {});
      }
      return () => { hls?.destroy(); };
    }, [src]);
    return <video ref={videoRef} className={className} muted autoPlay playsInline style={{ objectFit: "contain", backgroundColor: "#000" }} />;
  };


  // MJPEG/JPEG rapid-refresh image component (for vmix-snapshot-proxy, NDI HX Camera, etc.)
  const MjpegPlayer = ({ src, className = "" }: { src: string; className?: string }) => {
    const [imgSrc, setImgSrc] = useState(src);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => {
      if (!src) return;
      // If it looks like an MJPEG stream (contains /stream or is multipart), use as-is
      // Otherwise, refresh the image every 500ms with cache-busting
      const isMjpeg = /stream|mjpeg|motion/i.test(src);
      if (isMjpeg) {
        setImgSrc(src);
        return;
      }
      // JPEG rapid refresh
      const update = () => setImgSrc(`${src}${src.includes("?") ? "&" : "?"}_t=${Date.now()}`);
      update();
      intervalRef.current = setInterval(update, 500);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [src]);
    return (
      <img
        src={imgSrc}
        className={className}
        style={{ objectFit: "contain", backgroundColor: "#000" }}
        alt="Monitor"
        onError={() => {}}
      />
    );
  };

  // Monitor content helper — returns JSX or null
  const getMonitorContent = (type: "preview" | "output") => {
    const streamUrl = monitorStreamUrls[type];
    if (streamUrl) {
      if (streamUrl.includes(".m3u8")) {
        return <HlsPlayer src={streamUrl} className="w-full h-full" />;
      }
      return <MjpegPlayer src={streamUrl} className="w-full h-full" />;
    }
    // Iframe mode — embed vMix Web Controller
    if (monitorIframeMode[type] && savedUrl) {
      const baseUrl = savedUrl.replace(/\/+$/, "");
      return (
        <div className="w-full h-full relative" style={{ backgroundColor: "#000" }}>
          <iframe
            src={baseUrl}
            className="w-full h-full border-0"
            style={{ opacity: 1, transition: "opacity 0.5s" }}
            onLoad={e => { (e.target as HTMLIFrameElement).style.opacity = "1"; }}
            allow="autoplay"
            sandbox="allow-scripts allow-same-origin"
          />
          <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase" style={{ backgroundColor: "rgba(0,0,0,0.7)", color: "#3b82f6" }}>
            IFRAME
          </div>
        </div>
      );
    }
    // When connected, show input info placeholder
    const inputNum = type === "preview" ? previewInput : activeInput;
    if (connected && inputNum) {
      const inp = inputs.find(i => i.number === inputNum);
      const bgColor = inp ? getInputColor(inp.type) : "#1e1e24";
      return (
        <div className="w-full h-full flex flex-col items-center justify-center relative" style={{ backgroundColor: bgColor }}>
          <div className="text-center space-y-1">
            <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider">{inp?.type || "Input"}</span>
            <p className="text-[13px] font-semibold text-white/90 max-w-[80%] mx-auto truncate">{inp?.title || `Input ${inputNum}`}</p>
            <p className="text-[9px] text-white/40">Input {inputNum} • {inp?.state || "—"}</p>
          </div>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center">
            <span className="text-[8px] px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(0,0,0,0.5)", color: "#888" }}>
              📡 URL de stream ou ⬛ Iframe para preview ao vivo
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Visual placeholder for input (no live thumbnails — SnapshotInput saves to disk)
  const ThumbnailImg = ({ inputNumber, className = "", alt = "" }: { inputNumber: string; width?: number; height?: number; className?: string; alt?: string }) => {
    const inp = inputs.find(i => i.number === inputNumber);
    const bgColor = inp ? getInputColor(inp.type) : "#1e1e24";
    const label = inp ? inp.type : "Input";
    const hlsUrl = inputHlsUrls[inputNumber];
    const isNdi = inp && (inp.type === "NDI" || inp.title.toLowerCase().includes("ndi"));
    // If this input has an HLS/MJPEG URL configured, show the video player
    if (hlsUrl) {
      if (hlsUrl.includes(".m3u8")) {
        return <HlsPlayer src={hlsUrl} className={className} />;
      }
      return <MjpegPlayer src={hlsUrl} className={className} />;
    }
    return (
      <div className={`flex flex-col items-center justify-center ${className}`} style={{ backgroundColor: bgColor }}>
        <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">{label}</span>
        <span className="text-[9px] text-white/30 mt-0.5">Input {inputNumber}</span>
        {isNdi && (
          <span className="text-[7px] text-white/20 mt-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
            Clique 🔗 HLS para stream
          </span>
        )}
      </div>
    );
  };

  // ── Not connected ──
  if (!effectiveConnected) {
    return (
      <div className="space-y-0">
        {/* Inline warning banner for iframe + local HTTP */}
        {showNewTabBanner && (
          <div className="rounded-xl p-4 mb-3 space-y-3" style={{ backgroundColor: "#f59e0b10", border: "1px solid #f59e0b40" }}>
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }} />
              <div className="flex-1">
                <p className="text-xs font-bold mb-2" style={{ color: "#fbbf24" }}>
                  ⚠️ Habilite "Conteúdo não seguro" para este domínio
                </p>
                <p className="text-[11px] leading-relaxed mb-3" style={{ color: "#ffffff80" }}>
                  O preview roda em HTTPS e bloqueia requisições HTTP para IPs locais ({savedUrl}). 
                  Siga os passos abaixo <strong style={{ color: "#fff" }}>uma única vez</strong> para permitir a conexão:
                </p>
                <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: "#ffffff06", border: "1px solid #ffffff10" }}>
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f59e0b", color: "#000" }}>1</span>
                    <p className="text-[11px]" style={{ color: "#ffffff90" }}>
                      Abra esta URL em uma aba separada (apenas para configurar):
                      <button
                        onClick={() => {
                          window.open(previewDomain + "/vmix-control", "_blank", "noopener,noreferrer");
                        }}
                        className="ml-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all hover:brightness-110"
                        style={{ backgroundColor: "#268ffa30", color: "#268ffa", border: "1px solid #268ffa40" }}
                      >
                        <ExternalLink size={10} />
                        {previewDomain.replace("https://", "").slice(0, 30)}...
                      </button>
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f59e0b", color: "#000" }}>2</span>
                    <p className="text-[11px]" style={{ color: "#ffffff90" }}>
                      Na barra de endereço, clique no ícone <strong style={{ color: "#fff" }}>🔒 cadeado</strong> (ou ícone de ajuste) → <strong style={{ color: "#fff" }}>Configurações do site</strong>
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f59e0b", color: "#000" }}>3</span>
                    <p className="text-[11px]" style={{ color: "#ffffff90" }}>
                      Encontre <strong style={{ color: "#fff" }}>Conteúdo não seguro</strong> → mude para <strong style={{ color: "#22c55e" }}>Permitir</strong>
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f59e0b", color: "#000" }}>4</span>
                    <p className="text-[11px]" style={{ color: "#ffffff90" }}>
                      <strong style={{ color: "#fff" }}>Feche a aba</strong> e volte aqui. Clique <strong style={{ color: "#22c55e" }}>Conectar</strong> — agora vai funcionar! ✅
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* URL input + action buttons row */}
        <div className="flex items-center gap-3 px-0 py-3 flex-wrap">
          <div className="flex gap-2 items-center flex-1 flex-wrap">
            <input
              type="text"
              value={vmixUrl}
              onChange={e => setVmixUrl(e.target.value)}
              placeholder="http://SEU_IP_PUBLICO:8088"
              className="w-64 px-4 py-2 rounded-lg text-sm outline-none"
              style={{ backgroundColor: "#2a2a2a", color: "#fff", border: "1px solid #ffffff15" }}
            />
            <button onClick={saveUrl} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#268ffa,#2dbef3)" }}>
              Salvar
            </button>
            {savedUrl && (
              <>
                {/* Connection mode toggle */}
                <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid #ffffff15" }}>
                  <button
                    onClick={() => setConnectionMode("direct")}
                    className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all"
                    style={{
                      backgroundColor: connectionMode === "direct" ? "#22c55e30" : "transparent",
                      color: connectionMode === "direct" ? "#22c55e" : "#ffffff40",
                    }}
                    title="Conexão direta do navegador ao vMix (rede local)"
                  >
                    Direto
                  </button>
                  <button
                    onClick={() => setConnectionMode("proxy")}
                    className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all"
                    style={{
                      backgroundColor: connectionMode === "proxy" ? "#268ffa30" : "transparent",
                      color: connectionMode === "proxy" ? "#268ffa" : "#ffffff40",
                    }}
                    title="Conexão via proxy na nuvem (IP público necessário)"
                  >
                    Proxy
                  </button>
                </div>
                <button
                  onClick={connectToVmix}
                  disabled={connecting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: "#22c55e", opacity: connecting ? 0.6 : 1 }}
                >
                  {connecting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  {connecting ? "Conectando..." : "Conectar"}
                </button>
                <div className="relative group">
                  <button className="p-1.5 rounded-lg text-white/30 hover:text-white/60 transition-colors">
                    <HelpCircle size={14} />
                  </button>
                  <div className="absolute left-0 top-full mt-2 w-96 p-4 rounded-lg text-[11px] text-white/70 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50"
                    style={{ backgroundColor: "#2a2a3a", border: "1px solid #ffffff15", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}
                  >
                    <p className="font-bold text-white/90 mb-2">Modos de conexão:</p>
                    <div className="mb-3 p-2 rounded" style={{ backgroundColor: "#22c55e10", border: "1px solid #22c55e30" }}>
                      <p className="font-bold text-[#22c55e] mb-1">🟢 Modo DIRETO (rede local)</p>
                      <p className="text-white/50">O navegador conecta diretamente ao vMix. Use o IP local (ex: <strong className="text-white/70">http://192.168.100.6:8088</strong>). Ideal quando você está na mesma rede que o vMix.</p>
                    </div>
                    <div className="mb-3 p-2 rounded" style={{ backgroundColor: "#268ffa10", border: "1px solid #268ffa30" }}>
                      <p className="font-bold text-[#268ffa] mb-1">🔵 Modo PROXY (acesso remoto)</p>
                      <p className="text-white/50">Conexão via nuvem. Requer IP público com redirecionamento de porta no roteador (ex: <strong className="text-white/70">http://SEU_IP_PUBLICO:8088</strong>).</p>
                    </div>
                    <p className="font-bold text-white/90 mb-1">Port Forwarding (modo Proxy):</p>
                    <ol className="space-y-1 list-decimal list-inside text-white/50 text-[10px]">
                      <li>No vMix: <strong className="text-white/70">Settings → Web Controller</strong> → porta 8088</li>
                      <li>No roteador: <strong className="text-white/70">Port Forwarding</strong> → porta 8088 TCP → IP do PC</li>
                      <li>Use o IP WAN exibido no painel do roteador/provedor</li>
                      <li>Cole: <strong className="text-white/70">http://SEU_IP_PUBLICO:8088</strong></li>
                    </ol>
                    <p className="mt-2 text-white/30 text-[10px]">💡 O modo é detectado automaticamente pelo tipo de IP.</p>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setActiveTab("scenes"); createNewScene(); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all hover:brightness-110"
              style={{ backgroundColor: "#8b5cf6" }}
            >
              <Plus size={13} /> Criar Cena
            </button>
          </div>
        </div>
        {/* Diagnostic section */}
        {savedUrl && (
          <div className="mt-4 space-y-3">
            <button
              onClick={runDiagnostic}
              disabled={diagRunning}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
              style={{ backgroundColor: "#f59e0b" }}
            >
              {diagRunning ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
              {diagRunning ? "Diagnosticando..." : "🔧 Corrigir Conexão"}
            </button>

            {diagResult && (
              <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "#1a1a2e", border: "1px solid #ffffff08" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={14} style={{ color: "#f59e0b" }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#f59e0b" }}>Resultado do Diagnóstico</span>
                </div>

                {/* URL Analysis */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-lg p-2.5" style={{ backgroundColor: "#ffffff06" }}>
                    <p className="text-[9px] font-bold uppercase text-white/30 mb-1">Tipo de IP</p>
                    <p className="text-xs font-bold" style={{ color: diagResult.urlType === "local" ? "#22c55e" : "#268ffa" }}>
                      {diagResult.urlType === "local" ? "🏠 Local" : "🌐 Público"}
                    </p>
                  </div>
                  <div className="rounded-lg p-2.5" style={{ backgroundColor: "#ffffff06" }}>
                    <p className="text-[9px] font-bold uppercase text-white/30 mb-1">Protocolo</p>
                    <p className="text-xs font-bold" style={{ color: diagResult.protocol === "https" ? "#22c55e" : "#f59e0b" }}>
                      {diagResult.protocol.toUpperCase()}
                    </p>
                  </div>
                  <div className="rounded-lg p-2.5" style={{ backgroundColor: "#ffffff06" }}>
                    <p className="text-[9px] font-bold uppercase text-white/30 mb-1">App HTTPS</p>
                    <p className="text-xs font-bold" style={{ color: diagResult.isSecureContext ? "#f59e0b" : "#22c55e" }}>
                      {diagResult.isSecureContext ? "⚡ Sim" : "✓ Não"}
                    </p>
                  </div>
                  <div className="rounded-lg p-2.5" style={{ backgroundColor: "#ffffff06" }}>
                    <p className="text-[9px] font-bold uppercase text-white/30 mb-1">Mixed Content</p>
                    <p className="text-xs font-bold" style={{ color: diagResult.mixedContentBlocked ? "#dc2626" : "#22c55e" }}>
                      {diagResult.mixedContentBlocked ? "🚫 Bloqueado" : "✓ OK"}
                    </p>
                  </div>
                </div>

                {/* Connection Tests */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="rounded-lg p-3" style={{
                    backgroundColor: diagResult.directResult === "ok" ? "#22c55e10" : diagResult.directResult === "fail" ? "#dc262610" : "#ffffff06",
                    border: `1px solid ${diagResult.directResult === "ok" ? "#22c55e30" : diagResult.directResult === "fail" ? "#dc262630" : "#ffffff08"}`,
                  }}>
                    <div className="flex items-center gap-2 mb-1">
                      {diagResult.directResult === "ok" ? <CheckCircle size={14} style={{ color: "#22c55e" }} /> :
                       diagResult.directResult === "fail" ? <XCircle size={14} style={{ color: "#dc2626" }} /> :
                       <AlertTriangle size={14} style={{ color: "#ffffff30" }} />}
                      <span className="text-xs font-bold" style={{
                        color: diagResult.directResult === "ok" ? "#22c55e" : diagResult.directResult === "fail" ? "#dc2626" : "#ffffff40",
                      }}>Modo Direto</span>
                    </div>
                    {diagResult.directError && (
                      <p className="text-[10px] text-white/40 mt-1">{diagResult.directError}</p>
                    )}
                    {diagResult.directResult === "ok" && (
                      <p className="text-[10px] text-white/40 mt-1">Conexão direta funcionando!</p>
                    )}
                  </div>

                  <div className="rounded-lg p-3" style={{
                    backgroundColor: diagResult.proxyResult === "ok" ? "#22c55e10" : diagResult.proxyResult === "fail" ? "#dc262610" : "#ffffff06",
                    border: `1px solid ${diagResult.proxyResult === "ok" ? "#22c55e30" : diagResult.proxyResult === "fail" ? "#dc262630" : "#ffffff08"}`,
                  }}>
                    <div className="flex items-center gap-2 mb-1">
                      {diagResult.proxyResult === "ok" ? <CheckCircle size={14} style={{ color: "#22c55e" }} /> :
                       diagResult.proxyResult === "fail" ? <XCircle size={14} style={{ color: "#dc2626" }} /> :
                       diagResult.proxyResult === "skipped" ? <Shield size={14} style={{ color: "#ffffff30" }} /> :
                       <AlertTriangle size={14} style={{ color: "#ffffff30" }} />}
                      <span className="text-xs font-bold" style={{
                        color: diagResult.proxyResult === "ok" ? "#22c55e" : diagResult.proxyResult === "fail" ? "#dc2626" : "#ffffff40",
                      }}>Modo Proxy</span>
                    </div>
                    {diagResult.proxyError && (
                      <p className="text-[10px] text-white/40 mt-1">{diagResult.proxyError}</p>
                    )}
                    {diagResult.proxyResult === "ok" && (
                      <p className="text-[10px] text-white/40 mt-1">Conexão via proxy funcionando!</p>
                    )}
                  </div>
                </div>

                {/* Recommendation */}
                <div className="rounded-lg p-3" style={{ backgroundColor: "#f59e0b10", border: "1px solid #f59e0b30" }}>
                  <p className="text-[11px] font-medium" style={{ color: "#fbbf24", lineHeight: 1.6 }}>
                    {diagResult.recommendation}
                  </p>
                </div>

                {/* Auto-connect status */}
                {(diagResult.directResult === "ok" || diagResult.proxyResult === "ok") && (
                  <div className="flex items-center gap-2 rounded-lg p-2.5" style={{ backgroundColor: "#22c55e10", border: "1px solid #22c55e30" }}>
                    <Loader2 size={14} className="animate-spin" style={{ color: "#22c55e" }} />
                    <span className="text-[11px] font-bold" style={{ color: "#22c55e" }}>Conectando automaticamente no modo {diagResult.directResult === "ok" ? "Direto" : "Proxy"}...</span>
                  </div>
                )}

                {/* Retry button when nothing works */}
                {diagResult.directResult !== "ok" && diagResult.proxyResult !== "ok" && (
                  <button
                    onClick={runDiagnostic}
                    className="w-full py-2 rounded-lg text-xs font-bold text-white"
                    style={{ backgroundColor: "#f59e0b" }}
                  >
                    🔄 Tentar novamente
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {!diagResult && (
          <p className="text-xs text-white/20 py-8 text-center">Use 'Direto' para rede local (192.168.x.x) ou 'Proxy' com IP público + port forwarding.</p>
        )}
      </div>
    );
  }

  // ── Connected layout ──
  const activeInputObj = inputs.find(i => i.number === activeInput);
  const previewInputObj = inputs.find(i => i.number === previewInput);

  const tabs = [
    { key: "controls" as const, label: "Inputs", icon: <Layers size={13} /> },
    { key: "scenes" as const, label: "Cenas", icon: <Wand2 size={13} /> },
    { key: "ndi" as const, label: "NDI", icon: <Tv size={13} /> },
  ];

  return (
    <div className="space-y-2 max-w-full" style={{ color: "#e0e0e0" }}>
      {/* ── URL + GO LIVE / RECORD row ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* URL section */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: "#1a1a1f", border: "1px solid #ffffff08", boxShadow: "0 2px 8px #00000040" }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: connected ? "#22c55e" : "#666", boxShadow: connected ? "0 0 6px #22c55e60" : "none" }} />
          <input
            type="text"
            value={vmixUrl}
            onChange={e => setVmixUrl(e.target.value)}
            placeholder="http://SEU_IP_PUBLICO:8088"
            className="w-52 px-3 py-1.5 rounded text-xs outline-none transition-all focus:ring-1 focus:ring-white/10"
            style={{ backgroundColor: "#111114", color: "#fff", border: "1px solid #ffffff10" }}
          />
          <button onClick={saveUrl} className="px-3 py-1.5 rounded text-[10px] font-bold text-white/70 hover:text-white transition-all duration-200 hover:scale-[1.02]"
            style={{ backgroundColor: "#ffffff08", border: "1px solid #ffffff10" }}
          >
            Salvar
          </button>
          <button
            onClick={connectToVmix}
            disabled={connecting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold text-white/70 hover:text-white transition-all duration-200"
            style={{ backgroundColor: connected ? "#22c55e18" : "#ffffff08", border: `1px solid ${connected ? "#22c55e30" : "#ffffff10"}` }}
          >
            {connecting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} style={{ color: connected ? "#22c55e" : "#666" }} />}
            {connected ? "Conectado" : "Conectar"}
          </button>
        </div>
        {/* GO LIVE / RECORD section */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: "#1a1a1f", border: "1px solid #ffffff08", boxShadow: "0 2px 8px #00000040" }}>
          {/* GO LIVE group */}
          <div className="group/live flex items-center gap-1">
            <button
              onClick={() => sendCommand(streaming ? "StopStreaming" : "StartStreaming")}
              className="px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03]"
              style={{
                backgroundColor: streaming ? "#6b1010" : "#2a2a30",
                color: streaming ? "#fff" : "#aaa",
                boxShadow: streaming ? "0 0 16px #6b101060" : "none",
                border: `1px solid ${streaming ? "#8b2020" : "#3a3a40"}`,
              }}
            >
              {streaming ? "● LIVE" : "GO LIVE"}
            </button>
            <div className="flex items-center gap-1 max-w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover/live:max-w-[300px] group-hover/live:opacity-100">
              <button
                onClick={() => sendCommand("StartStreaming")}
                className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all duration-200 hover:scale-[1.05] whitespace-nowrap"
                style={{ backgroundColor: "#333338", color: "#ccc", border: "1px solid #444448" }}
                onMouseEnter={e => { (e.target as HTMLElement).style.boxShadow = "0 0 14px #33333860"; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.boxShadow = "none"; }}
              >
                STREAMING 1
              </button>
              <button
                onClick={() => sendCommand("StartStreaming")}
                className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all duration-200 hover:scale-[1.05] whitespace-nowrap"
                style={{ backgroundColor: "#333338", color: "#ccc", border: "1px solid #444448" }}
                onMouseEnter={e => { (e.target as HTMLElement).style.boxShadow = "0 0 14px #33333860"; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.boxShadow = "none"; }}
              >
                STREAMING 2
              </button>
            </div>
          </div>
          {/* RECORD button (independent) */}
          <button
            onClick={() => sendCommand(recording ? "StopRecording" : "StartRecording")}
            className="px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03]"
            style={{
              backgroundColor: recording ? "#6b1010" : "#2a2a30",
              color: recording ? "#fff" : "#aaa",
              border: `1px solid ${recording ? "#8b2020" : "#3a3a40"}`,
            }}
            onMouseEnter={e => { (e.target as HTMLElement).style.boxShadow = "0 0 16px #3a3a3a60"; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.boxShadow = "none"; }}
          >
            {recording ? "● REC" : "RECORD"}
          </button>
          <button onClick={() => connectToVmix()} className="text-white/40 hover:text-white transition-colors" title="Atualizar">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ── Preview / Transitions / Output ── */}
      <div className="flex items-stretch gap-[1px] rounded-xl overflow-hidden" style={{ backgroundColor: "#111114", boxShadow: "0 4px 20px #00000060" }}>
        {/* Preview */}
        <div className="relative flex-1 flex flex-col" style={{ backgroundColor: "#18181c", minHeight: 200 }}>
           <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid #ffffff06", backgroundColor: "#ffffff04" }}>
            <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-sm" style={{ backgroundColor: "#555", color: "#fff", letterSpacing: "0.15em" }}>Preview</span>
            {renderInputSelect(previewInput, (val) => {
              sendCommand("PreviewInput", val);
              setPreviewInput(val);
            })}
            <div className="ml-auto flex gap-1">
              <button
                onClick={() => {
                  setMonitorIframeMode(prev => ({ ...prev, preview: !prev.preview }));
                  if (!monitorIframeMode.preview) setMonitorStreamUrls(prev => ({ ...prev, preview: "" }));
                }}
                className="text-[8px] px-1.5 py-0.5 rounded transition-all"
                style={{
                  backgroundColor: monitorIframeMode.preview ? "#3b82f620" : "#ffffff08",
                  color: monitorIframeMode.preview ? "#3b82f6" : "#666",
                  border: `1px solid ${monitorIframeMode.preview ? "#3b82f640" : "#ffffff10"}`,
                }}
                title="Modo Iframe (vMix Web Controller)"
              >
                ⬛
              </button>
              <button
                onClick={() => {
                  if (monitorIframeMode.preview) setMonitorIframeMode(prev => ({ ...prev, preview: false }));
                  setEditingMonitorStream(editingMonitorStream === "preview" ? null : "preview");
                  setMonitorStreamTemp(monitorStreamUrls.preview);
                }}
                className="text-[8px] px-1.5 py-0.5 rounded transition-all"
                style={{
                  backgroundColor: monitorStreamUrls.preview ? "#3b82f620" : "#ffffff08",
                  color: monitorStreamUrls.preview ? "#3b82f6" : "#666",
                  border: `1px solid ${monitorStreamUrls.preview ? "#3b82f640" : "#ffffff10"}`,
                }}
                title="Configurar URL de stream (MJPEG/HLS)"
              >
                📡
              </button>
            </div>
          </div>
          {/* Stream URL editor */}
          {editingMonitorStream === "preview" && (
            <div className="flex gap-1 px-2 py-1.5" style={{ backgroundColor: "#111114", borderBottom: "1px solid #ffffff08" }}>
              <input
                type="text"
                value={monitorStreamTemp}
                onChange={e => setMonitorStreamTemp(e.target.value)}
                placeholder="URL do stream (MJPEG, HLS .m3u8, ou JPEG)"
                className="flex-1 text-[9px] px-2 py-1 rounded outline-none"
                style={{ backgroundColor: "#1a1a20", color: "#ccc", border: "1px solid #333" }}
                onKeyDown={e => { if (e.key === "Enter") { setMonitorStreamUrls(prev => ({ ...prev, preview: monitorStreamTemp.trim() })); setEditingMonitorStream(null); } }}
              />
              <button onClick={() => { setMonitorStreamUrls(prev => ({ ...prev, preview: monitorStreamTemp.trim() })); setEditingMonitorStream(null); }} className="text-[8px] px-1.5 rounded" style={{ backgroundColor: "#22c55e20", color: "#22c55e", border: "1px solid #22c55e30" }}>✓</button>
              {monitorStreamUrls.preview && <button onClick={() => { setMonitorStreamUrls(prev => ({ ...prev, preview: "" })); setEditingMonitorStream(null); }} className="text-[8px] px-1.5 rounded" style={{ backgroundColor: "#dc262620", color: "#dc2626", border: "1px solid #dc262630" }}>✕</button>}
            </div>
          )}
          <div className="flex-1 flex items-center justify-center overflow-hidden" style={{ aspectRatio: "16/9" }}>
            {getMonitorContent("preview") || (
              <div className="w-full h-full relative flex flex-col">
                <div className="flex flex-1">
                  {["#c0c0c0","#c0c000","#00c0c0","#00c000","#c000c0","#c00000","#0000c0"].map((c,i) => (
                    <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="flex" style={{ height: "8%" }}>
                  {["#0000c0","#131313","#c000c0","#131313","#00c0c0","#131313","#c0c0c0"].map((c,i) => (
                    <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="flex" style={{ height: "8%" }}>
                  {["#00214c","#fff","#32006a","#131313","#131313","#131313","#131313"].map((c,i) => (
                    <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="tv-static absolute inset-0" />
                <div className="tv-scanlines absolute inset-0" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded" style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#888" }}>PVW — Sem sinal</span>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Transitions */}
        <div className="flex flex-col items-center justify-center gap-1.5 px-3 py-3" style={{ backgroundColor: "#1c1c22", minWidth: 84 }}>
          {[
            { label: "CUT", fn: "Cut" },
            { label: "FADE", fn: "Fade", value: "1000" },
            { label: "FTB", fn: "FadeToBlack" },
          ].map(t => (
            <button
              key={t.label}
              onClick={() => sendCommand(t.fn, undefined, t.value)}
              className="w-full px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all duration-200 hover:scale-[1.05]"
              style={{
                backgroundColor: t.label === "CUT" ? "#6b1010" : "#2a2a30",
                color: t.label === "CUT" ? "#fff" : "#aaa",
                border: `1px solid ${t.label === "CUT" ? "#8b2020" : "#3a3a40"}`,
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.boxShadow = `0 0 14px ${t.label === "CUT" ? "#6b101060" : "#2a2a3060"}`; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.boxShadow = "none"; }}
            >
              {t.label}
            </button>
          ))}
          <div className="w-full h-px my-1" style={{ backgroundColor: "#ffffff10" }} />
          <div className="grid grid-cols-2 gap-1 w-full">
            {[1, 2, 3, 4].map(n => {
              const isOn = overlays[n];
              return (
                <button
                  key={n}
                  onClick={() => {
                    const cmd = isOn ? `OverlayInput${n}Off` : `OverlayInput${n}`;
                    sendCommand(cmd);
                    setOverlays(prev => ({ ...prev, [n]: !prev[n] }));
                  }}
                  className="flex items-center justify-center rounded text-[9px] font-bold transition-all duration-200 hover:scale-[1.08]"
                  style={{
                    width: 30, height: 24,
                    backgroundColor: isOn ? "#eab308" : "#3a3a3a",
                    color: isOn ? "#000" : "#999",
                    border: `1px solid ${isOn ? "#facc15" : "#555"}`,
                    boxShadow: isOn ? "0 0 10px #eab30840" : "none",
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
        {/* Output */}
        <div className="relative flex-1 flex flex-col" style={{ backgroundColor: "#18181c", minHeight: 200 }}>
          <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid #ffffff06", backgroundColor: "#ffffff04" }}>
            <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-sm" style={{ backgroundColor: "#dc2626", color: "#fff", letterSpacing: "0.15em" }}>Output</span>
            {renderInputSelect(activeInput, (val) => {
              sendCommand("Cut", val);
              setActiveInput(val);
            })}
            <div className="ml-auto flex gap-1">
              <button
                onClick={() => {
                  setMonitorIframeMode(prev => ({ ...prev, output: !prev.output }));
                  if (!monitorIframeMode.output) setMonitorStreamUrls(prev => ({ ...prev, output: "" }));
                }}
                className="text-[8px] px-1.5 py-0.5 rounded transition-all"
                style={{
                  backgroundColor: monitorIframeMode.output ? "#3b82f620" : "#ffffff08",
                  color: monitorIframeMode.output ? "#3b82f6" : "#666",
                  border: `1px solid ${monitorIframeMode.output ? "#3b82f640" : "#ffffff10"}`,
                }}
                title="Modo Iframe (vMix Web Controller)"
              >
                ⬛
              </button>
              <button
                onClick={() => {
                  if (monitorIframeMode.output) setMonitorIframeMode(prev => ({ ...prev, output: false }));
                  setEditingMonitorStream(editingMonitorStream === "output" ? null : "output");
                  setMonitorStreamTemp(monitorStreamUrls.output);
                }}
                className="text-[8px] px-1.5 py-0.5 rounded transition-all"
                style={{
                  backgroundColor: monitorStreamUrls.output ? "#3b82f620" : "#ffffff08",
                  color: monitorStreamUrls.output ? "#3b82f6" : "#666",
                  border: `1px solid ${monitorStreamUrls.output ? "#3b82f640" : "#ffffff10"}`,
                }}
                title="Configurar URL de stream (MJPEG/HLS)"
              >
                📡
              </button>
            </div>
          </div>
          {editingMonitorStream === "output" && (
            <div className="flex gap-1 px-2 py-1.5" style={{ backgroundColor: "#111114", borderBottom: "1px solid #ffffff08" }}>
              <input
                type="text"
                value={monitorStreamTemp}
                onChange={e => setMonitorStreamTemp(e.target.value)}
                placeholder="URL do stream (MJPEG, HLS .m3u8, ou JPEG)"
                className="flex-1 text-[9px] px-2 py-1 rounded outline-none"
                style={{ backgroundColor: "#1a1a20", color: "#ccc", border: "1px solid #333" }}
                onKeyDown={e => { if (e.key === "Enter") { setMonitorStreamUrls(prev => ({ ...prev, output: monitorStreamTemp.trim() })); setEditingMonitorStream(null); } }}
              />
              <button onClick={() => { setMonitorStreamUrls(prev => ({ ...prev, output: monitorStreamTemp.trim() })); setEditingMonitorStream(null); }} className="text-[8px] px-1.5 rounded" style={{ backgroundColor: "#22c55e20", color: "#22c55e", border: "1px solid #22c55e30" }}>✓</button>
              {monitorStreamUrls.output && <button onClick={() => { setMonitorStreamUrls(prev => ({ ...prev, output: "" })); setEditingMonitorStream(null); }} className="text-[8px] px-1.5 rounded" style={{ backgroundColor: "#dc262620", color: "#dc2626", border: "1px solid #dc262630" }}>✕</button>}
            </div>
          )}
          <div className="flex-1 flex items-center justify-center overflow-hidden" style={{ aspectRatio: "16/9" }}>
            {getMonitorContent("output") || (
              <div className="w-full h-full relative flex flex-col">
                <div className="flex flex-1">
                  {["#c0c0c0","#c0c000","#00c0c0","#00c000","#c000c0","#c00000","#0000c0"].map((c,i) => (
                    <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="flex" style={{ height: "8%" }}>
                  {["#0000c0","#131313","#c000c0","#131313","#00c0c0","#131313","#c0c0c0"].map((c,i) => (
                    <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="flex" style={{ height: "8%" }}>
                  {["#00214c","#fff","#32006a","#131313","#131313","#131313","#131313"].map((c,i) => (
                    <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="tv-static absolute inset-0" />
                <div className="tv-scanlines absolute inset-0" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded" style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#dc2626" }}>PGM — Sem sinal</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>


      {/* ── Tab Bar ── */}
      <div className="flex rounded-t-xl overflow-hidden" style={{ backgroundColor: "#18181c", borderBottom: "1px solid #ffffff06" }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="relative flex items-center gap-1.5 px-6 py-3 text-[11px] font-bold uppercase tracking-widest transition-all duration-300"
            style={{
              color: activeTab === tab.key ? "#fff" : "#555",
              backgroundColor: activeTab === tab.key ? "#222228" : "transparent",
            }}
          >
            {activeTab === tab.key && <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ backgroundColor: "#dc2626" }} />}
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="rounded-b-xl p-5 space-y-4" style={{ backgroundColor: "#1a1a1f", minHeight: 300 }}>

        {/* ══ CONTROLS TAB ══ */}
        {activeTab === "controls" && (
          <div className="flex flex-wrap gap-2 items-start">
            {inputs.map(input => {
              const isActive = activeInput === input.number;
              const isPreview = previewInput === input.number;
              const isNdi = input.type === "NDI" || input.title.toLowerCase().includes("ndi");
              const isMin = minimizedInputs[input.number];
              const borderColor = isActive ? "#dc2626" : isPreview ? "#777" : "#333338";
              const headerBg = isActive ? "#dc262630" : isPreview ? "#ffffff10" : "#222228";

              if (isMin) {
                return (
                  <div
                    key={input.key || input.number}
                    className="flex flex-col items-center rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:brightness-110"
                    style={{ backgroundColor: "#1a1a1f", border: `2px solid ${borderColor}`, width: 32, minHeight: 120 }}
                    onClick={() => setMinimizedInputs(prev => ({ ...prev, [input.number]: false }))}
                  >
                    <div
                      className="w-full flex items-center justify-center py-1"
                      style={{ backgroundColor: headerBg }}
                      onContextMenu={e => { e.preventDefault(); setMinimizedInputs(prev => ({ ...prev, [input.number]: false })); }}
                    >
                      <span className="text-[8px] font-bold" style={{ color: isActive ? "#ff6b6b" : isPreview ? "#ccc" : "#777" }}>{input.number}</span>
                    </div>
                    <div className="flex-1 flex items-center justify-center" style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}>
                      <span className="text-[8px] font-bold text-white/50 truncate" style={{ maxHeight: 90 }}>{input.title}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={input.key || input.number}
                  className="rounded-lg overflow-hidden transition-all duration-200 hover:brightness-110 cursor-pointer"
                  style={{ backgroundColor: "#1a1a1f", border: `2px solid ${borderColor}`, width: 180 }}
                  onClick={() => {
                    // FIX: Click sends to PREVIEW, not directly to output
                    sendCommand("PreviewInput", input.number);
                    setPreviewInput(input.number);
                  }}
                >
                  <div
                    className="flex items-center gap-1 px-2 py-1"
                    style={{ backgroundColor: headerBg }}
                    onContextMenu={e => { e.preventDefault(); setMinimizedInputs(prev => ({ ...prev, [input.number]: true })); }}
                  >
                    <span className="text-[9px] font-bold px-1 rounded" style={{
                      backgroundColor: isActive ? "#dc2626" : isPreview ? "#555" : "#333338",
                      color: isActive || isPreview ? "#fff" : "#888",
                    }}>{input.number}</span>
                    <span className="text-[10px] font-bold truncate flex-1 min-w-0" style={{ color: isActive ? "#ff6b6b" : isPreview ? "#ddd" : "#999" }}>
                      {isNdi && <span style={{ color: "#22c55e" }}>● </span>}
                      {input.title}
                    </span>
                    {/* PGM / PVW badge in header */}
                    {isActive && (
                      <span className="text-[7px] font-black px-1.5 py-0.5 rounded flex-shrink-0 animate-pulse" style={{ backgroundColor: "#dc2626", color: "#fff", letterSpacing: "0.05em" }}>PGM</span>
                    )}
                    {isPreview && !isActive && (
                      <span className="text-[7px] font-black px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: "#555", color: "#fff", letterSpacing: "0.05em" }}>PVW</span>
                    )}
                    {/* Keyboard shortcut badge/capture */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCapturingShortcut(capturingShortcut === input.number ? null : input.number);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Right-click to clear shortcut
                        setInputShortcuts(prev => {
                          const copy = { ...prev };
                          delete copy[input.number];
                          return copy;
                        });
                      }}
                      className="text-[7px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0 transition-all"
                      style={{
                        backgroundColor: capturingShortcut === input.number ? "#f59e0b30" : inputShortcuts[input.number] ? "#ffffff10" : "#ffffff06",
                        color: capturingShortcut === input.number ? "#f59e0b" : inputShortcuts[input.number] ? "#aaa" : "#555",
                        border: `1px solid ${capturingShortcut === input.number ? "#f59e0b40" : "#ffffff08"}`,
                        minWidth: 20,
                        textAlign: "center",
                      }}
                      title={capturingShortcut === input.number ? "Pressione uma tecla..." : inputShortcuts[input.number] ? `Atalho: ${inputShortcuts[input.number]} (clique direito para limpar)` : "Clique para definir atalho"}
                    >
                      {capturingShortcut === input.number ? "⌨ ..." : inputShortcuts[input.number] || "⌨"}
                    </button>
                  </div>
                   <div className="relative" style={{ aspectRatio: "3/2", backgroundColor: "#111114" }}>
                    <ThumbnailImg inputNumber={input.number} className="w-full h-full object-contain" alt={input.title} />
                    {isNdi && (
                      <div className="absolute top-1 left-1 flex gap-1">
                        <span className="text-[7px] font-bold px-1 rounded" style={{ backgroundColor: "#22c55e30", color: "#22c55e", border: "1px solid #22c55e40" }}>NDI</span>
                        {inputHlsUrls[input.number] && (
                          <span className="text-[7px] font-bold px-1 rounded animate-pulse" style={{ backgroundColor: "#dc262630", color: "#dc2626", border: "1px solid #dc262640" }}>LIVE</span>
                        )}
                      </div>
                    )}
                    {/* Stream URL config button for all inputs */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingHlsInput(editingHlsInput === input.number ? null : input.number);
                        setHlsTempUrl(inputHlsUrls[input.number] || "");
                      }}
                      className="absolute bottom-1 right-1 text-[7px] px-1 py-0.5 rounded transition-all"
                      style={{
                        backgroundColor: inputHlsUrls[input.number] ? "#22c55e20" : "#ffffff10",
                        color: inputHlsUrls[input.number] ? "#22c55e" : "#888",
                        border: `1px solid ${inputHlsUrls[input.number] ? "#22c55e30" : "#ffffff15"}`,
                      }}
                      title="Configurar URL de stream (HLS/MJPEG/JPEG)"
                    >
                      {inputHlsUrls[input.number] ? "📡" : "🔗 Stream"}
                    </button>
                  </div>
                  {/* HLS URL editor inline */}
                  {editingHlsInput === input.number && (
                    <div className="flex gap-1 px-1.5 py-1.5" style={{ backgroundColor: "#111114", borderTop: "1px solid #ffffff08" }} onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        value={hlsTempUrl}
                        onChange={e => setHlsTempUrl(e.target.value)}
                        placeholder="URL HLS (.m3u8) ou vídeo"
                        className="flex-1 text-[9px] px-1.5 py-1 rounded outline-none"
                        style={{ backgroundColor: "#1a1a20", color: "#ccc", border: "1px solid #333" }}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            setInputHlsUrls(prev => hlsTempUrl.trim() ? { ...prev, [input.number]: hlsTempUrl.trim() } : (() => { const c = { ...prev }; delete c[input.number]; return c; })());
                            setEditingHlsInput(null);
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          setInputHlsUrls(prev => hlsTempUrl.trim() ? { ...prev, [input.number]: hlsTempUrl.trim() } : (() => { const c = { ...prev }; delete c[input.number]; return c; })());
                          setEditingHlsInput(null);
                        }}
                        className="text-[8px] px-1.5 rounded"
                        style={{ backgroundColor: "#22c55e20", color: "#22c55e", border: "1px solid #22c55e30" }}
                      >✓</button>
                      {inputHlsUrls[input.number] && (
                        <button
                          onClick={() => {
                            setInputHlsUrls(prev => { const c = { ...prev }; delete c[input.number]; return c; });
                            setEditingHlsInput(null);
                          }}
                          className="text-[8px] px-1.5 rounded"
                          style={{ backgroundColor: "#dc262620", color: "#dc2626", border: "1px solid #dc262630" }}
                        >✕</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {inputs.length === 0 && (
              <p className="text-[11px] text-white/30 py-4">Conecte ao vMix para ver os inputs</p>
            )}
          </div>
        )}

        {/* ══ SCENES TAB ══ */}
        {activeTab === "scenes" && (() => {
          const diasMap: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
          const now = new Date();
          const nowMinutes = now.getHours() * 60 + now.getMinutes();
          const todayDow = now.getDay();

          const todayPrograms = programas.filter(p => {
            if (!p.dias_semana || p.dias_semana.length === 0) return true;
            return p.dias_semana.some(d => diasMap[d.toLowerCase()] === todayDow);
          }).sort((a, b) => {
            const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
            return toMin(a.horario_inicio) - toMin(b.horario_inicio);
          });

          const onAir = todayPrograms.find(p => {
            const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
            return nowMinutes >= toMin(p.horario_inicio) && nowMinutes < toMin(p.horario_fim);
          });

          const upcoming = todayPrograms.filter(p => {
            const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
            return toMin(p.horario_inicio) > nowMinutes;
          }).slice(0, 4);

          return (
            <>
              {/* ── Programa no Ar + Próximos ── */}
              <div className="flex gap-3 items-stretch">
                <div className="flex-1 rounded-xl overflow-hidden" style={{ backgroundColor: "#1a1a1f", border: "1px solid #dc262640" }}>
                  <div className="flex items-center gap-2 px-4 py-2" style={{ backgroundColor: "#dc262620", borderBottom: "1px solid #ffffff08" }}>
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#dc2626" }}>No Ar</span>
                  </div>
                  <div className="p-4">
                    {onAir ? (
                      <div>
                        <p className="text-sm font-bold text-white">{onAir.nome}</p>
                        <p className="text-[10px] text-white/40 mt-1">{onAir.horario_inicio} – {onAir.horario_fim}</p>
                        {/* Countdown to end */}
                        {(() => {
                          const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
                          const remaining = toMin(onAir.horario_fim) - nowMinutes;
                          const rh = Math.floor(remaining / 60);
                          const rm = remaining % 60;
                          return (
                            <p className="text-[10px] mt-2 font-mono font-bold" style={{ color: remaining <= 5 ? "#dc2626" : "#888" }}>
                              {remaining <= 0 ? "Encerrando..." : `Termina em ${rh > 0 ? `${rh}h ` : ""}${rm}min`}
                            </p>
                          );
                        })()}
                      </div>
                    ) : upcoming.length > 0 ? (
                      <div>
                        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Próximo</p>
                        <p className="text-sm font-bold text-white">{upcoming[0].nome}</p>
                        <p className="text-[10px] text-white/40 mt-1">{upcoming[0].horario_inicio} – {upcoming[0].horario_fim}</p>
                        {(() => {
                          const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
                          const remaining = toMin(upcoming[0].horario_inicio) - nowMinutes;
                          const rh = Math.floor(remaining / 60);
                          const rm = remaining % 60;
                          return (
                            <p className="text-[10px] mt-2 font-mono font-bold" style={{ color: "#f59e0b" }}>
                              Começa em {rh > 0 ? `${rh}h ` : ""}{rm}min
                            </p>
                          );
                        })()}
                      </div>
                    ) : (
                      <p className="text-[11px] text-white/30">Nenhum programa programado</p>
                    )}
                  </div>
                </div>
                <div className="flex-1 rounded-xl overflow-hidden" style={{ backgroundColor: "#1a1a1f", border: "1px solid #ffffff08" }}>
                  <div className="flex items-center gap-2 px-4 py-2" style={{ backgroundColor: "#ffffff06", borderBottom: "1px solid #ffffff08" }}>
                    <Eye size={12} style={{ color: "#888" }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#999" }}>A Seguir</span>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {upcoming.length > 0 ? upcoming.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-2 py-1 rounded" style={{ backgroundColor: "#ffffff06" }}>
                        <span className="text-[10px] font-medium text-white/70 truncate">{p.nome}</span>
                        <span className="text-[9px] text-white/30 ml-2 whitespace-nowrap">{p.horario_inicio}</span>
                      </div>
                    )) : (
                      <p className="text-[10px] text-white/30">Nenhum programa a seguir</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Programas Preset ── */}
              <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#1a1a1f", border: "1px solid #ffffff08" }}>
                <div className="flex items-center gap-2 px-4 py-2.5" style={{ backgroundColor: "#ffffff06", borderBottom: "1px solid #ffffff08" }}>
                  <Radio size={14} style={{ color: "#999" }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#999" }}>programas preset</span>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                    {programas.map((prog, idx) => {
                      const isActive = activePreset === prog.id;
                      return (
                        <div
                          key={prog.id}
                          className="group/preset relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.03]"
                          style={{
                            aspectRatio: "3/2",
                            backgroundColor: isActive ? "#dc2626" : "#2a2a30",
                            border: isActive ? "2px solid #ef4444" : "2px solid #333338",
                          }}
                          onClick={() => {
                            setActivePreset(prog.id);
                            sendCommand("ScriptStart", prog.nome);
                            toast({ title: `Preset: ${prog.nome}`, description: "Comando enviado ao vMix." });
                          }}
                        >
                          {/* Label */}
                          <div className="absolute inset-0 flex items-center justify-center p-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-center leading-tight"
                              style={{ color: isActive ? "#fff" : "#ccc" }}
                            >{prog.nome}</span>
                          </div>

                          {/* Hover actions bar */}
                          <div
                            className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1 py-1.5 opacity-0 group-hover/preset:opacity-100 transition-all duration-200 translate-y-full group-hover/preset:translate-y-0"
                            style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
                          >
                            {idx > 0 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); const arr = [...programas]; [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]; setProgramas(arr); }}
                                className="w-5 h-5 rounded flex items-center justify-center text-[9px] hover:bg-white/20 transition-colors"
                                style={{ color: "#ccc" }}
                                title="Mover para esquerda"
                              >◀</button>
                            )}
                            {idx < programas.length - 1 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); const arr = [...programas]; [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]; setProgramas(arr); }}
                                className="w-5 h-5 rounded flex items-center justify-center text-[9px] hover:bg-white/20 transition-colors"
                                style={{ color: "#ccc" }}
                                title="Mover para direita"
                              >▶</button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); toast({ title: `Editar: ${prog.nome}`, description: "Abra o painel principal para editar este programa." }); }}
                              className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/20 transition-colors"
                              style={{ color: "#ccc" }}
                              title="Editar"
                            ><Wand2 size={10} /></button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setProgramas(prev => prev.filter(p => p.id !== prog.id)); }}
                              className="w-5 h-5 rounded flex items-center justify-center hover:bg-red-500/40 transition-colors"
                              style={{ color: "#f87171" }}
                              title="Excluir"
                            ><Trash2 size={10} /></button>
                          </div>
                        </div>
                      );
                    })}
                    {programas.length === 0 && (
                      <p className="text-[11px] text-white/30 py-4 col-span-full">Nenhum programa cadastrado.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {/* ══ NDI TAB ══ */}
        {activeTab === "ndi" && (
          <>
            {sectionBox("Adicionar Fonte NDI", <Tv size={14} style={{ color: "#999" }} />, (
              <div className="space-y-4">
                {/* Auto-discovered NDI sources */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-white/60 font-semibold">Fontes NDI na Rede</p>
                    <button
                      onClick={scanNdiSources}
                      disabled={ndiScanning || !connected}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all disabled:opacity-40"
                      style={{ backgroundColor: "#ffffff10", color: "#3b82f6" }}
                    >
                      {ndiScanning ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                      {ndiScanning ? "Buscando..." : "Buscar"}
                    </button>
                  </div>
                  {!connected && (
                    <p className="text-[10px] text-yellow-500/70">⚠ Conecte ao vMix para buscar fontes NDI.</p>
                  )}
                  {ndiScanning && (
                    <div className="flex items-center gap-2 py-4 justify-center">
                      <Loader2 size={16} className="animate-spin text-blue-400" />
                      <span className="text-[11px] text-white/40">Buscando fontes NDI na rede...</span>
                    </div>
                  )}
                  {!ndiScanning && ndiSources.length > 0 && (
                    <div className="space-y-1.5">
                      {ndiSources.map((source, idx) => {
                        const alreadyAdded = ndiInputs.some(i => i.title.includes(source));
                        return (
                          <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "#ffffff06", border: "1px solid #ffffff08" }}>
                            <Activity size={12} style={{ color: alreadyAdded ? "#22c55e" : "#3b82f6" }} />
                            <span className="flex-1 text-[11px] text-white/70 truncate">{source}</span>
                            {alreadyAdded ? (
                              <span className="text-[9px] text-green-500/60 font-bold px-2">JÁ ADICIONADO</span>
                            ) : (
                              <button
                                onClick={() => addNdiInput(source)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-bold text-white transition-all hover:brightness-110"
                                style={{ backgroundColor: "#dc2626" }}
                              >
                                <Plus size={10} /> Adicionar
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!ndiScanning && connected && ndiSources.length === 0 && (
                    <div className="text-center py-3 space-y-1">
                      <p className="text-[10px] text-white/40">
                        {detectedMachines.length === 0
                          ? "Nenhum input NDI no vMix. Adicione um manualmente para detectar a máquina."
                          : "Clique em \"Buscar\" para sugerir fontes NDI disponíveis."}
                      </p>
                      <p className="text-[9px] text-white/25">
                        ℹ A descoberta NDI usa mDNS (indisponível no browser). As sugestões são baseadas nos inputs NDI já conectados.
                      </p>
                    </div>
                  )}
                </div>

                {/* Manual input */}
                <div className="space-y-2 pt-2" style={{ borderTop: "1px solid #ffffff08" }}>
                  <p className="text-[10px] text-white/40">
                    Adicionar manualmente — Formato: <code className="bg-white/5 px-1 rounded text-white/50">NOME-PC (Fonte)</code> ou IP direto
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ndiUrl}
                      onChange={e => setNdiUrl(e.target.value)}
                      placeholder="Ex: STUDIO-PC (Camera 1)"
                      maxLength={200}
                      className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
                      style={{ backgroundColor: "#111114", color: "#fff", border: "1px solid #ffffff10" }}
                    />
                    <button
                      onClick={() => addNdiInput()}
                      disabled={!ndiUrl.trim()}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-40"
                      style={{ backgroundColor: "#dc2626" }}
                    >
                      <Plus size={13} /> Adicionar
                    </button>
                  </div>
                </div>
              </div>
            ), "#888")}

            {sectionBox("Inputs NDI Atuais", <Wifi size={14} style={{ color: "#999" }} />, (
              <div className="space-y-1.5">
                {ndiInputs.length === 0 ? (
                  <p className="text-[11px] text-white/30 text-center py-6">Nenhum input NDI encontrado no vMix</p>
                ) : (
                  ndiInputs.map(input => {
                    const isOnline = input.state === "Running";
                    return (
                      <div key={input.key} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ backgroundColor: "#ffffff06" }}>
                        {/* Online/Offline indicator */}
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`w-2.5 h-2.5 rounded-full ${isOnline ? "animate-pulse" : ""}`}
                            style={{ backgroundColor: isOnline ? "#22c55e" : "#ef4444", boxShadow: isOnline ? "0 0 6px #22c55e80" : "0 0 4px #ef444440" }}
                            title={isOnline ? "Online" : "Offline"}
                          />
                          <Tv size={14} style={{ color: isOnline ? "#22c55e" : "#ef4444" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white/80 truncate">{input.title}</p>
                          <p className="text-[9px] text-white/30">
                            Input {input.number} • {input.type} •{" "}
                            <span style={{ color: isOnline ? "#22c55e" : "#ef4444" }}>{isOnline ? "Online" : "Offline"}</span>
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => { sendCommand("PreviewInput", input.number); setPreviewInput(input.number); }} className="px-2 py-1 rounded text-[9px] font-bold" style={{ backgroundColor: "#ffffff10", color: "#bbb" }}>PRV</button>
                          <button onClick={() => { sendCommand("Cut", input.number); setActiveInput(input.number); }} className="px-2 py-1 rounded text-[9px] font-bold" style={{ backgroundColor: "#dc262620", color: "#dc2626" }}>PGM</button>
                          <button
                            onClick={async () => {
                              try {
                                await vmixFetch(`/api/?Function=RemoveInput&Input=${encodeURIComponent(input.number)}`);
                                toast({ title: "Input removido", description: `"${input.title}" removido do vMix.` });
                                setTimeout(() => connectToVmix(), 500);
                              } catch {
                                toast({ title: "Erro", description: "Falha ao remover input.", variant: "destructive" });
                              }
                            }}
                            className="px-2 py-1 rounded text-[9px] font-bold transition-all hover:brightness-125"
                            style={{ backgroundColor: "#ffffff08", color: "#f87171" }}
                            title="Remover input"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ), "#888")}

            {sectionBox("Dicas NDI", <Eye size={14} style={{ color: "#777" }} />, (
              <ul className="text-[11px] space-y-1.5 text-white/40 list-disc list-inside">
                <li>Certifique-se de que o <strong className="text-white/60">NDI Tools</strong> está instalado na rede</li>
                <li>A fonte NDI precisa estar transmitindo na mesma sub-rede</li>
                <li>Use o <strong className="text-white/60">NDI Studio Monitor</strong> para verificar fontes disponíveis</li>
                <li>O formato padrão é: <code className="bg-white/5 px-1 rounded text-white/50">NOME-PC (Nome da Fonte)</code></li>
              </ul>
            ), "#777")}

            {sectionBox("📡 Preview ao Vivo — Como Configurar", <Monitor size={14} style={{ color: "#3b82f6" }} />, (
              <div className="space-y-4 text-[11px] text-white/50">
                <p className="text-white/70 font-semibold">O vMix não fornece thumbnails via API HTTP. Use uma das opções abaixo para obter preview ao vivo:</p>

                <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: "#ffffff04", border: "1px solid #ffffff08" }}>
                  <p className="text-white/80 font-bold text-xs">🟢 Opção 1: vmix-snapshot-proxy (Recomendado)</p>
                  <p>Instale o <a href="https://github.com/jeffmikels/vmix-snapshot-proxy" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#3b82f6" }}>vmix-snapshot-proxy</a> no PC do vMix.</p>
                  <p>Ele cria thumbnails JPEG automaticamente e serve na porta 8098.</p>
                  <p className="text-white/60">URLs para usar nos monitores:</p>
                  <code className="block text-[10px] px-2 py-1 rounded" style={{ backgroundColor: "#000", color: "#22c55e" }}>
                    http://192.168.x.x:8098/1.jpg (Input 1)<br/>
                    http://192.168.x.x:8098/2.jpg (Input 2)
                  </code>
                  <p className="text-white/40">Cole a URL no botão 📡 do Preview/Output. A imagem atualiza a cada 500ms.</p>
                </div>

                <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: "#ffffff04", border: "1px solid #ffffff08" }}>
                  <p className="text-white/80 font-bold text-xs">🔵 Opção 2: NDI Tools HX Camera</p>
                  <p>Instale o <strong className="text-white/70">NDI Tools</strong> (gratuito) → use o <strong className="text-white/70">NDI HX Camera</strong> ou <strong className="text-white/70">NDI Webcam Input</strong>.</p>
                  <p>No vMix, ative o output NDI (Settings → Outputs → NDI). Use um conversor NDI→HLS como:</p>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li><strong className="text-white/70">MediaMTX</strong> — converte NDI para HLS automaticamente</li>
                    <li><strong className="text-white/70">OBS Studio</strong> — recebe NDI via plugin e re-streama como HLS</li>
                  </ul>
                  <p className="text-white/40">Cole a URL .m3u8 no botão 📡 ou no botão 🔗 HLS dos inputs NDI.</p>
                </div>

                <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: "#ffffff04", border: "1px solid #ffffff08" }}>
                  <p className="text-white/80 font-bold text-xs">⬛ Opção 3: Iframe do vMix Web Controller</p>
                  <p>Clique no botão <strong className="text-white/70">⬛ IFRAME</strong> no cabeçalho do Preview.</p>
                  <p>Embutirá o painel web do vMix ({savedUrl || "http://ip:8088"}) diretamente no monitor.</p>
                  <p className="text-white/40">Funciona apenas em modo Direto (mesma rede) e requer "Conteúdo inseguro" permitido no navegador.</p>
                </div>
              </div>
            ), "#3b82f6")}
          </>
        )}
      </div>
    </div>
  );
}
