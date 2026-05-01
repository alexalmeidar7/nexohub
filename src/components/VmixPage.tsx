import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Hls from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Monitor, Radio, Disc, RefreshCw, Loader2, CheckCircle, XCircle,
  ExternalLink, Volume2, VolumeX, Play, Square, Camera, Tv,
  Layers, Wand2, Plus, Trash2, GripVertical, Send, Eye, Wifi, WifiOff, HelpCircle, Activity, AlertTriangle, Shield, Clock, Keyboard,
  ScrollText, ChevronDown, ChevronUp, Lock
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { getIconForName } from "./CustomVmixButtonEditor";
import logoMixControl from "@/assets/logo-mixcontrol.png";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import PresetCommandEditor from "./PresetCommandEditor";
import CustomVmixButtonEditor from "./CustomVmixButtonEditor";

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


// Robust detection: vMix strictly uses "NDI" as the type for NDI inputs.
// We also accept titles starting with "NDI (" as a fallback for some vMix versions/configurations.
const isNdiInput = (inp: VmixInput) => {
  return inp.type === "NDI" || inp.title.startsWith("NDI (");
};

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
  estudio: string | null;
  apresentador_foto?: string | null;
}

// Helper to detect private/local IPs
function isPrivateIp(url: string): boolean {
  try {
    const u = url.startsWith("http") ? url : "http://" + url;
    const hostname = new URL(u).hostname;
    return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|localhost|::1)/i.test(hostname);
  } catch { return false; }
}

function isInsecureHttpUrl(url: string): boolean {
  try {
    const u = url.startsWith("http") ? url : "http://" + url;
    return new URL(u).protocol === "http:";
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
  const [vmixConnections, setVmixConnections] = useState<any[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
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
  const [activeTab, setActiveTab] = useState<"controls" | "scenes">("controls");
  const [studioName, setStudioName] = useState("");
  // Keyboard shortcuts per input (persisted in localStorage)
  const [inputShortcuts, setInputShortcuts] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("vmix_input_shortcuts");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [capturingShortcut, setCapturingShortcut] = useState<string | null>(null);
   const [activePreset, setActivePreset] = useState<string | null>(null);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [dragPresetIdx, setDragPresetIdx] = useState<number | null>(null);
  const [customButtons, setCustomButtons] = useState<any[]>([]);
  const [editingCustomButtonId, setEditingCustomButtonId] = useState<string | null | "new">(null);
  const [activeCustomButton, setActiveCustomButton] = useState<string | null>(null);
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
  const [monitorsCollapsed, setMonitorsCollapsed] = useState(true);

  // Command log panel
  interface VmixLogEntry { id: number; time: string; command: string; status: "ok" | "error" | "pending"; detail: string; source: "local" | "server" | "scheduler"; }
  const logIdRef = useRef(0);
  const [vmixLogs, setVmixLogs] = useState<VmixLogEntry[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const addLog = useCallback((command: string, status: "ok" | "error" | "pending", detail: string, source: "local" | "server" | "scheduler" = "local") => {
    const entry: VmixLogEntry = { id: ++logIdRef.current, time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }), command, status, detail, source };
    setVmixLogs(prev => [entry, ...prev].slice(0, 200));
  }, []);

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
    // Also persist to DB
    if (user) {
      supabase.from("user_settings").update({ vmix_shortcuts: inputShortcuts as any }).eq("user_id", user.id);
    }
  }, [inputShortcuts, user]);
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
      .select("id, nome, ativo, horario_inicio, horario_fim, dias_semana, estudio, apresentadores(id, nome, foto)")
      .eq("user_id", user.id)
      .eq("ativo", true)
      .ilike("estudio", "%fm%")
      .order("horario_inicio")
      .then(({ data }) => {
        if (data) {
          const mapped = data.map((p: any) => ({ ...p, apresentador_foto: p.apresentadores?.foto || null }));
          try {
            const savedOrder = JSON.parse(localStorage.getItem("vmix_preset_order") || "[]") as string[];
            if (savedOrder.length > 0) {
              mapped.sort((a: any, b: any) => {
                const ai = savedOrder.indexOf(a.id);
                const bi = savedOrder.indexOf(b.id);
                if (ai === -1 && bi === -1) return 0;
                if (ai === -1) return 1;
                if (bi === -1) return 1;
                return ai - bi;
              });
            }
          } catch {}
          setProgramas(mapped);
        }
      });
  }, [user]);

  // Load programas from DB
  const loadProgramas = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("programas")
      .select("id, nome, ativo, horario_inicio, horario_fim, dias_semana, estudio, apresentadores(id, nome, foto)")
      .eq("user_id", user.id)
      .eq("ativo", true)
      .ilike("estudio", "%fm%")
      .order("horario_inicio");
    
    if (data) {
      const mapped = data.map((p: any) => ({ ...p, apresentador_foto: p.apresentadores?.foto || null }));
      try {
        const savedOrder = JSON.parse(localStorage.getItem("vmix_preset_order") || "[]") as string[];
        if (savedOrder.length > 0) {
          mapped.sort((a: any, b: any) => {
            const ai = savedOrder.indexOf(a.id);
            const bi = savedOrder.indexOf(b.id);
            if (ai === -1 && bi === -1) return 0;
            if (ai === -1) return 1;
            if (bi === -1) return 1;
            return ai - bi;
          });
        }
      } catch {}
      setProgramas(mapped);
    }
  }, [user]);

  useEffect(() => { loadProgramas(); }, [loadProgramas]);

  // Load custom buttons
  const loadCustomButtons = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase.from("custom_vmix_buttons" as any) as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at");
    if (data) setCustomButtons(data);
  }, [user]);

  useEffect(() => { loadCustomButtons(); }, [loadCustomButtons]);

  useEffect(() => {
    if (!user) return;
    const loadSettings = async () => {
      // Load global shortcuts
      const { data: settings } = await supabase
        .from("user_settings")
        .select("vmix_shortcuts")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (settings?.vmix_shortcuts && typeof settings.vmix_shortcuts === "object") {
        setInputShortcuts(settings.vmix_shortcuts as Record<string, string>);
      }

      // Load all connections
      const { data: connections } = await (supabase.from("vmix_connections" as any) as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (connections && connections.length > 0) {
        setVmixConnections(connections);
        
        // Try to find default or most recent
        const def = (connections as any[]).find((c: any) => c.is_default) || connections[0];
        setSelectedConnectionId(def.id);
        setVmixUrl(def.url);
        setSavedUrl(def.url);
        setVmixUser(def.username || "");
        setVmixPass(def.password || "");
        setStudioName(def.name);
        
        setLoading(false);
        
        // Auto-connect
        setTimeout(() => {
          connectToVmixRef.current?.();
        }, 800);
      } else {
        // Fallback to old user_settings if no connections in new table yet
        const { data: oldData } = await supabase
          .from("user_settings")
          .select("vmix_url, vmix_user, vmix_pass")
          .eq("user_id", user.id)
          .maybeSingle();
          
        if (oldData?.vmix_url) {
          setVmixUrl(oldData.vmix_url);
          setSavedUrl(oldData.vmix_url);
          setVmixUser(oldData.vmix_user || "");
          setVmixPass(oldData.vmix_pass || "");
          setStudioName("Estúdio Padrão");
        }
        setLoading(false);
      }
    };
    loadSettings();
  }, [user]);

  const loadConnections = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("vmix_connections" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setVmixConnections(data);
  };

  const handleSelectConnection = (conn: any) => {
    setSelectedConnectionId(conn.id);
    setVmixUrl(conn.url);
    setSavedUrl(conn.url);
    setVmixUser(conn.username || "");
    setVmixPass(conn.password || "");
    setStudioName(conn.name);
    setConnected(false);
    // Auto connect when switching
    setTimeout(() => connectToVmix(), 300);
  };

  // Persist connection mode
  useEffect(() => {
    localStorage.setItem("vmix_conn_mode", connectionMode);
  }, [connectionMode]);

  const saveUrl = async () => {
    if (!user || !vmixUrl.trim()) return;
    let trimmed = vmixUrl.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      trimmed = "http://" + trimmed;
    }
    try {
      const urlObj = new URL(trimmed);
      if (!urlObj.port && (/^[0-9.]+$/.test(urlObj.hostname) || urlObj.hostname === "localhost")) {
        urlObj.port = "8088";
        trimmed = urlObj.toString().replace(/\/$/, "");
      }
    } catch {}

    const payload = { 
      user_id: user.id,
      name: studioName || "vMix Studio",
      url: trimmed, 
      username: vmixUser.trim(), 
      password: vmixPass,
      is_default: true 
    };

    if (selectedConnectionId) {
      await (supabase.from("vmix_connections" as any) as any)
        .update(payload)
        .eq("id", selectedConnectionId);
    } else {
      const { data } = await (supabase.from("vmix_connections" as any) as any)
        .insert(payload)
        .select()
        .single();
      if (data) setSelectedConnectionId(data.id);
    }
    
    // Also update global settings for backward compatibility if needed
    await supabase.from("user_settings").upsert({ 
      user_id: user.id, 
      vmix_url: trimmed, 
      vmix_user: vmixUser.trim(), 
      vmix_pass: vmixPass 
    });

    setSavedUrl(trimmed);
    loadConnections();

    if (isPrivateIp(trimmed) && connectionMode === "proxy") {
      setConnectionMode("direct");
      toast({ title: "Modo alterado para Direto", description: "IP local detectado." });
    } else if (!isPrivateIp(trimmed) && connectionMode === "direct") {
      setConnectionMode("proxy");
      toast({ title: "Modo alterado para Proxy", description: "IP público detectado." });
    }
    toast({ title: "Configuração salva", description: `Conexão "${studioName}" salva com sucesso.` });
  };

  // Direct fetch to vMix (browser → vMix, no edge function)
  const vmixDirectFetch = useCallback(async (path: string): Promise<string> => {
    if (!savedUrl) throw new Error("URL não configurada");
    let baseUrl = savedUrl.replace(/\/+$/, "");
    if (!baseUrl.startsWith("http")) baseUrl = "http://" + baseUrl;
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
    try {
      if (effectiveMode === "direct") {
        return await vmixDirectFetch(path);
      }
      return await vmixProxyFetch(path);
    } catch (err) {
      // Auto-fallback: If proxy fails and it's a local IP, try direct (might work if user is in same LAN)
      if (effectiveMode === "proxy" && savedUrl && isPrivateIp(savedUrl)) {
        console.log("Proxy failed for local IP, trying direct fallback...");
        return await vmixDirectFetch(path);
      }
      // If direct fails and it's a public IP, try proxy automatically
      if (effectiveMode === "direct" && savedUrl && !isPrivateIp(savedUrl)) {
        console.log("Direct failed for public IP, trying proxy fallback...");
        return await vmixProxyFetch(path);
      }
      throw err;
    }
  }, [connectionMode, vmixDirectFetch, vmixProxyFetch, savedUrl]);

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
    try { 
      const u = savedUrl.startsWith("http") ? savedUrl : "http://" + savedUrl;
      protocol = new URL(u).protocol === "https:" ? "https" : "http"; 
    } catch {}
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
          result.directError = "Conexão recusada ou Bloqueio de Mixed Content";
        } else {
          result.directError = "Rede inacessível, IP incorreto ou Firewall";
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
        : "⚠️ Conexão falhou. Se você JÁ permitiu 'Conteúdo Inseguro' no cadeado do navegador, verifique: 1) O IP/Porta estão corretos? 2) O vMix está aberto? 3) O Firewall do Windows permite a porta 8088?";
      if (!isEmbeddedPreview && result.directResult === "fail") {
      }
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
      const ndiCount = parsedInputs.filter(i => i.type === "NDI" || i.title.toLowerCase().includes("ndi")).length;
      toast({ title: "Conectado!", description: `${ndiCount} fontes NDI detectadas (modo ${effectiveMode === "direct" ? "direto" : "proxy"}).` });
    } catch (err) {
      setConnected(false);
      const message = err instanceof Error ? err.message : "Verifique se o vMix Web Controller está ativo.";
      const isMixedOrCorsLikely =
        effectiveMode === "direct" &&
        isLocal &&
        /failed to fetch|networkerror|mixed content|cors/i.test(message);

      if (isMixedOrCorsLikely) {
        
      }

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
      // Reset fail counter and ensure status is connected on success
      if (!connected) setConnected(true);
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
    if (!savedUrl) return;
    
    const pollInterval = connected ? 5000 : 20000;
    const id = setInterval(() => {
      silentRefresh();
    }, pollInterval);
    
    return () => clearInterval(id);
  }, [connected, savedUrl, silentRefresh]);

  const sendCommand = async (fn: string, input?: string, value?: string) => {
    if (!savedUrl) return;
    const cmdLabel = `${fn}${input ? ` Input=${input}` : ""}${value ? ` Value=${value}` : ""}`;
    try {
      let path = `/api/?Function=${encodeURIComponent(fn)}`;
      if (input) path += `&Input=${encodeURIComponent(input)}`;
      if (value) path += `&Value=${encodeURIComponent(value)}`;
      // Force direct mode for private IPs — proxy can't reach LAN
      const forceMode: "direct" | "proxy" | undefined = isPrivateIp(savedUrl) ? "direct" : undefined;
      await vmixFetch(path, forceMode);
      addLog(cmdLabel, "ok", "Enviado com sucesso", "local");
      setTimeout(() => connectToVmix(), 300);
    } catch (err: any) {
      addLog(cmdLabel, "error", err?.message || "Falha ao enviar", "local");
      toast({ title: "Erro", description: "Falha ao enviar comando.", variant: "destructive" });
    }
  };

  const normalizeCommands = useCallback((cmds: any[] = []) => {
    return cmds.map((cmd) => {
      const value = cmd?.extraValue
        ? (cmd?.value ? `${cmd.value},${cmd.extraValue}` : cmd.extraValue)
        : (cmd?.value || "");
      return {
        fn: cmd?.fn || "",
        input: cmd?.input || "",
        value,
      };
    }).filter((cmd) => cmd.fn);
  }, []);

  const runCommandsUnified = useCallback(async (cmds: any[], label: string) => {
    const normalized = normalizeCommands(cmds);
    if (!normalized.length) return;

    const batchLabel = `[${label}] ${normalized.length} cmd(s)`;

    // For private/local IPs, skip server attempt — the cloud cannot reach LAN.
    // Send directly from the browser to vMix.
    if (savedUrl && isPrivateIp(savedUrl)) {
      addLog(batchLabel, "pending", "Enviando direto (LAN)...", "local");
      for (const cmd of normalized) {
        await sendCommand(cmd.fn, cmd.input, cmd.value);
        await new Promise((r) => setTimeout(r, 400));
      }
      toast({ title: label, description: `${normalized.length} ação(ões) enviada(s) ao vMix.` });
      return;
    }

    addLog(batchLabel, "pending", "Enviando via servidor...", "server");

    try {
      const res = await supabase.functions.invoke("execute-vmix-commands", { body: { commands: normalized } });
      if (res.error) throw res.error;

      const results = Array.isArray((res.data as { results?: Array<{ ok?: boolean }> } | null)?.results)
        ? (res.data as { results: Array<{ ok?: boolean }> }).results
        : null;

      if (results && results.length > 0 && !results.some((r) => r?.ok)) {
        throw new Error("SERVER_COULD_NOT_REACH_VMIX");
      }

      addLog(batchLabel, "ok", "Executado no servidor", "server");
      setTimeout(() => connectToVmix(), 300);
      toast({ title: label, description: `${normalized.length} ação(ões) executada(s) no servidor.` });
      return;
    } catch (err: any) {
      addLog(batchLabel, "error", `Servidor falhou: ${err?.message || "desconhecido"} → fallback local`, "server");
      for (const cmd of normalized) {
        await sendCommand(cmd.fn, cmd.input, cmd.value);
        await new Promise((r) => setTimeout(r, 400));
      }
      toast({ title: label, description: `${normalized.length} ação(ões) executada(s) localmente.` });
    }
  }, [connectToVmix, normalizeCommands, sendCommand, toast, addLog, savedUrl]);

  const runScene = async (scene: VmixScene) => {
    setRunningScene(scene.id);
    for (const cmd of scene.commands) {
      await sendCommand(cmd.fn, cmd.input, cmd.value);
      await new Promise(r => setTimeout(r, 400));
    }
    setRunningScene(null);
    toast({ title: "Cena executada", description: `"${scene.name}" concluída.` });
  };
  // ── Client-side scheduler (runs commands locally since edge functions can't reach private IPs) ──
  const schedulerExecutedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!connected || !savedUrl || !user) return;

    const DAY_MAP: Record<string, number> = {
      domingo: 0, segunda: 1, "terça": 2, terca: 2,
      quarta: 3, quinta: 4, sexta: 5, "sábado": 6, sabado: 6,
    };

    const matchesDay = (dias: string[] | null, jsDay: number) => {
      if (!dias || dias.length === 0) return true;
      return dias.some((d) => {
        const n = d.toLowerCase().replace(/[-.,]/g, "").trim();
        for (const [key, val] of Object.entries(DAY_MAP)) {
          if (n.startsWith(key)) return val === jsDay;
        }
        return false;
      });
    };

    const checkSchedule = async () => {
      const now = new Date();
      const brasiliaOffset = -3 * 60;
      const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
      const brasiliaDate = new Date(utcMs + brasiliaOffset * 60000);
      const hh = String(brasiliaDate.getHours()).padStart(2, "0");
      const mm = String(brasiliaDate.getMinutes()).padStart(2, "0");
      const jsDay = brasiliaDate.getDay();
      const timeKey = `${hh}:${mm}`;

      // Reset executed set each new minute
      const currentMinuteKey = `${hh}${mm}`;
      for (const k of schedulerExecutedRef.current) {
        if (!k.startsWith(currentMinuteKey + "_")) schedulerExecutedRef.current.delete(k);
      }

      // 1. Preset commands (program presets)
      try {
        const { data: presets } = await supabase
          .from("preset_commands")
          .select("id, programa_id, commands, custom_horario")
          .eq("user_id", user.id);

        if (presets && presets.length > 0) {
          const progIds = [...new Set(presets.map((p: any) => p.programa_id))];
          const { data: progs } = await supabase
            .from("programas")
            .select("id, nome, horario_inicio, dias_semana")
            .in("id", progIds);

          const progMap = new Map((progs || []).map((p: any) => [p.id, p]));

          for (const preset of presets) {
            const prog = progMap.get(preset.programa_id);
            if (!prog) continue;

            const horario = preset.custom_horario || prog.horario_inicio;
            if (!horario) continue;
            const parts = horario.split(":");
            const matchH = parts[0]?.padStart(2, "0");
            const matchM = parts[1]?.padStart(2, "0");
            if (matchH !== hh || matchM !== mm) continue;
            if (!matchesDay(prog.dias_semana, jsDay)) continue;

            const execKey = `${currentMinuteKey}_preset_${preset.id}`;
            if (schedulerExecutedRef.current.has(execKey)) continue;
            schedulerExecutedRef.current.add(execKey);

            const cmds = preset.commands as any[];
            if (!cmds || !Array.isArray(cmds) || cmds.length === 0) continue;

            console.log(`[local-scheduler] Executing preset for "${prog.nome}" at ${timeKey}`);
            addLog(`[Agendador] Preset "${prog.nome}"`, "pending", `Disparado às ${timeKey}`, "scheduler");
            for (const cmd of cmds) {
              const fn = cmd.fn || "";
              const input = cmd.input || "";
              const extraValue = cmd.extraValue;
              const value = extraValue ? (cmd.value ? `${cmd.value},${extraValue}` : extraValue) : (cmd.value || "");
              if (fn) await sendCommand(fn, input || undefined, value || undefined);
              await new Promise((r) => setTimeout(r, 400));
            }
          }
        }
      } catch (err) {
        console.error("[local-scheduler] preset error:", err);
      }

      // 2. Custom buttons with schedule
      try {
        const { data: buttons } = await supabase
          .from("custom_vmix_buttons")
          .select("id, nome, commands, horario, dias_semana")
          .eq("user_id", user.id);

        if (buttons) {
          for (const btn of buttons) {
            if (!btn.horario || !btn.dias_semana || (btn.dias_semana as string[]).length === 0) continue;
            const parts = btn.horario.split(":");
            const matchH = parts[0]?.padStart(2, "0");
            const matchM = parts[1]?.padStart(2, "0");
            if (matchH !== hh || matchM !== mm) continue;
            if (!matchesDay(btn.dias_semana as string[], jsDay)) continue;

            const execKey = `${currentMinuteKey}_btn_${btn.id}`;
            if (schedulerExecutedRef.current.has(execKey)) continue;
            schedulerExecutedRef.current.add(execKey);

            const cmds = btn.commands as any[];
            if (!cmds || !Array.isArray(cmds) || cmds.length === 0) continue;

            console.log(`[local-scheduler] Executing button "${btn.nome}" at ${timeKey}`);
            addLog(`[Agendador] Botão "${btn.nome}"`, "pending", `Disparado às ${timeKey}`, "scheduler");
            for (const cmd of cmds) {
              const fn = (cmd as any).fn || "";
              const input = (cmd as any).input || "";
              const extraValue = (cmd as any).extraValue;
              const value = extraValue ? ((cmd as any).value ? `${(cmd as any).value},${extraValue}` : extraValue) : ((cmd as any).value || "");
              if (fn) await sendCommand(fn, input || undefined, value || undefined);
              await new Promise((r) => setTimeout(r, 400));
            }
          }
        }
      } catch (err) {
        console.error("[local-scheduler] button error:", err);
      }
    };

    // Check every 30 seconds
    checkSchedule();
    const id = setInterval(checkSchedule, 30000);
    return () => clearInterval(id);
  }, [connected, savedUrl, user, sendCommand]);

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

  // NDI auto-scan removed (NDI tab removed)

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
  // Refs for stable keyboard handler
  const sendCommandRef = useRef(sendCommand);
  sendCommandRef.current = sendCommand;
  const inputShortcutsRef = useRef(inputShortcuts);
  inputShortcutsRef.current = inputShortcuts;

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
      // Otherwise, check if the pressed key matches a shortcut → send to PREVIEW only
      const keyName = formatKeyName(e);
      const matchedInput = Object.entries(inputShortcutsRef.current).find(([_, shortcut]) => shortcut === keyName);
      if (matchedInput) {
        e.preventDefault();
        const inputNum = matchedInput[0];
        sendCommandRef.current("PreviewInput", inputNum);
        setPreviewInput(inputNum);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [effectiveConnected, capturingShortcut]);

  if (loading) return <ModulePageSkeleton />;

  const hasLocalHttpUrl = savedUrl && isPrivateIp(savedUrl) && isInsecureHttpUrl(savedUrl);
  const showNewTabBanner = isEmbeddedPreview && hasLocalHttpUrl && window.isSecureContext && !demoMode;

  const previewDomain = window.location.origin;

  // Helper: detect if an input is a genuine NDI source
  const isNdiInput = (inp: VmixInput) => {
    // Robust detection: vMix strictly uses "NDI" as the type for NDI inputs.
    // We also accept titles starting with "NDI (" as a fallback for some vMix versions/configurations.
    return inp.type === "NDI" || inp.title.startsWith("NDI (");
  };

  // Helper: get input label with type indicator
  const inputLabel = (inp: VmixInput) => {
    const isNdi = isNdiInput(inp);
    return `${inp.number} – ${isNdi ? "🟢 " : ""}${inp.title}${isNdi ? " (NDI)" : ""}`;
  };

  // Group inputs for combo: regular inputs and NDI inputs
  const ndiInputs = useMemo(() => inputs.filter(isNdiInput), [inputs]);
  const regularInputs = useMemo(() => inputs.filter(i => !isNdiInput(i)), [inputs]);

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

  // Render the select combo with ONLY NDI inputs
  const renderInputSelect = (value: string | null, onChange: (val: string) => void) => (
    <select
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      className="flex-1 text-[10px] rounded px-2 py-1 border-none outline-none"
      style={{ backgroundColor: "#222228", color: "#ccc" }}
    >
      <option value="">— Selecione NDI —</option>
      {ndiInputs.length > 0 ? (
        <optgroup label="NDI Sources">
          {ndiInputs.map(inp => (
            <option key={inp.key || inp.number} value={inp.number}>🟢 {inp.number} – {inp.title}</option>
          ))}
        </optgroup>
      ) : (
        <option disabled>Nenhum input NDI encontrado</option>
      )}
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
    const [hasError, setHasError] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    
    useEffect(() => {
      setHasError(false);
      if (!src) return;
      
      const isMjpeg = /stream|mjpeg|motion/i.test(src);
      if (isMjpeg) {
        setImgSrc(src);
        return;
      }
      
      const update = () => setImgSrc(`${src}${src.includes("?") ? "&" : "?"}_t=${Date.now()}`);
      update();
      intervalRef.current = setInterval(update, 500);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [src]);

    if (hasError) {
      return (
        <div className={`flex flex-col items-center justify-center p-4 text-center gap-2 ${className}`} style={{ backgroundColor: "#111" }}>
          <AlertTriangle size={24} className="text-amber-500" />
          <p className="text-[10px] text-white/70">Erro ao carregar vídeo.</p>
          <p className="text-[8px] text-white/40 max-w-[150px]">Certifique-se que o vMix está ativo e você permitiu 'Conteúdo Inseguro' no cadeado do navegador.</p>
          <button 
            onClick={() => { setHasError(false); setImgSrc(src + (src.includes("?") ? "&" : "?") + "retry=" + Date.now()); }}
            className="mt-1 px-2 py-1 bg-white/10 rounded text-[9px]"
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    return (
      <img
        src={imgSrc}
        className={className}
        style={{ objectFit: "contain", backgroundColor: "#000" }}
        alt="Monitor"
        onError={() => setHasError(true)}
      />
    );
  };

  // Monitor content helper — returns JSX or null
  const getMonitorContent = (type: "preview" | "output") => {
    const streamUrl = monitorStreamUrls[type];
    const isIframe = monitorIframeMode[type];

    if (streamUrl) {
      if (streamUrl.includes(".m3u8")) {
        return <HlsPlayer src={streamUrl} className="w-full h-full" />;
      }
      return <MjpegPlayer src={streamUrl} className="w-full h-full" />;
    }

    // Iframe mode — embed vMix Web Controller
    if (isIframe && savedUrl) {
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

    // When connected, show input info placeholder with "Live" button
    const inputNum = type === "preview" ? previewInput : activeInput;
    if (connected && inputNum) {
      const inp = inputs.find(i => i.number === inputNum);
      const bgColor = inp ? getInputColor(inp.type) : "#1e1e24";
      return (
        <div className="w-full h-full flex flex-col items-center justify-center relative" style={{ backgroundColor: bgColor }}>
          <div className="text-center space-y-1 z-10">
            <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider">{inp?.type || "Input"}</span>
            <p className="text-[13px] font-semibold text-white/90 max-w-[80%] mx-auto truncate">{inp?.title || `Input ${inputNum}`}</p>
            <p className="text-[9px] text-white/40">Input {inputNum} • {inp?.state || "—"}</p>
            
            <button 
              onClick={() => {
                const baseUrl = savedUrl.replace(/\/+$/, "");
                const url = type === "preview" ? `${baseUrl}/mjpeg?Input=Preview` : `${baseUrl}/mjpeg`;
                setMonitorStreamUrls(prev => ({ ...prev, [type]: url }));
                setMonitorIframeMode(prev => ({ ...prev, [type]: false }));
              }}
              className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold text-white transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: "#dc2626", boxShadow: "0 0 15px rgba(220, 38, 38, 0.4)" }}
            >
              <Monitor size={12} /> ATIVAR VÍDEO NDI (MJPEG)
            </button>
          </div>
          
          <div className="absolute bottom-2 left-0 right-0 flex justify-center">
            <span className="text-[8px] px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(0,0,0,0.5)", color: "#888" }}>
              📡 URL de stream ou ⬛ Iframe para preview ao vivo
            </span>
          </div>
          
          {/* Background decoration */}
          <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
             <div className="absolute -inset-10 bg-gradient-to-br from-white/20 to-transparent blur-3xl transform rotate-12" />
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
      <div className="max-w-2xl mx-auto space-y-5 py-4">
        {/* ── CONNECTION CARD ── */}
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#1e1e24", border: "1px solid #ffffff0a", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
          {/* Card Header */}
          <div className="px-6 py-4 flex items-center gap-3" style={{ background: "linear-gradient(135deg, #242430, #2a2a36)", borderBottom: "1px solid #ffffff08" }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#ffffff08" }}>
              <Wifi size={18} style={{ color: "#888" }} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white/90">Conexão vMix</h3>
              <p className="text-[10px] text-white/35">Configure o endereço IP do computador com vMix</p>
            </div>
          </div>

          {/* Card Body */}
          <div className="p-6 space-y-5">
            {/* Studio Name Input */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 block mb-2">Nome do Estúdio</label>
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all" style={{ backgroundColor: "#2a2a30", border: "1px solid #ffffff10" }}>
                <Monitor size={14} className="shrink-0" style={{ color: "#ffffff25" }} />
                <input
                  type="text"
                  value={studioName}
                  onChange={e => setStudioName(e.target.value)}
                  placeholder="Ex: Estúdio A, Control Room..."
                  className="flex-1 text-sm outline-none bg-transparent text-white placeholder:text-white/20"
                />
              </div>
            </div>

            {/* URL Input Group */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 block mb-2">Endereço do vMix</label>
              <div className="flex gap-2 items-center flex-wrap">
                <div className="flex-1 min-w-[200px] flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all" style={{ backgroundColor: "#2a2a30", border: "1px solid #ffffff10" }}>
                  <Wifi size={14} className="shrink-0" style={{ color: "#ffffff25" }} />
                  <input
                    type="text"
                    value={vmixUrl}
                    onChange={e => setVmixUrl(e.target.value)}
                    placeholder="http://192.168.x.x:8088"
                    className="flex-1 text-sm outline-none bg-transparent text-white placeholder:text-white/20"
                  />
                </div>
                <button onClick={saveUrl} className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:brightness-110" style={{ backgroundColor: "#3a3a44" }}>
                  {selectedConnectionId ? "Atualizar" : "Salvar Novo"}
                </button>
                {savedUrl && (
                  <button
                    onClick={connectToVmix}
                    disabled={connecting}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
                    style={{ backgroundColor: "#22c55e" }}
                  >
                    {connecting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {connecting ? "Conectando..." : "Conectar"}
                  </button>
                )}
              </div>
            </div>

            {/* Saved Connections List */}
            {vmixConnections.length > 0 && (
              <div className="pt-4 border-t border-white/5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/30 block mb-3">Conexões Salvas</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {vmixConnections.map((conn) => (
                    <div 
                      key={conn.id}
                      onClick={() => handleSelectConnection(conn)}
                      className={`group relative p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        selectedConnectionId === conn.id 
                          ? "bg-blue-500/10 border-blue-500/50" 
                          : "bg-white/5 border-white/5 hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-2 h-2 rounded-full ${selectedConnectionId === conn.id ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-white/20"}`} />
                        <div className="overflow-hidden">
                          <p className="text-[11px] font-bold text-white/90 truncate">{conn.name}</p>
                          <p className="text-[9px] text-white/40 truncate">{conn.url}</p>
                        </div>
                      </div>
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm(`Excluir conexão "${conn.name}"?`)) {
                            await (supabase.from("vmix_connections" as any) as any).delete().eq("id", conn.id);
                            if (selectedConnectionId === conn.id) setSelectedConnectionId(null);
                            loadConnections();
                            toast({ title: "Conexão excluída" });
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/20 text-white/20 hover:text-red-400 transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  <button 
                    onClick={() => {
                      setSelectedConnectionId(null);
                      setStudioName("");
                      setVmixUrl("");
                      setVmixUser("");
                      setVmixPass("");
                      setConnected(false);
                    }}
                    className="p-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] hover:bg-white/5 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus size={12} className="text-white/40" />
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Nova Conexão</span>
                  </button>
                </div>
              </div>
            )}

            {/* Diagnostic Button */}
            {savedUrl && (
              <div className="space-y-4">
                <div className="h-px" style={{ backgroundColor: "#ffffff08" }} />
                <button
                  onClick={runDiagnostic}
                  disabled={diagRunning}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all hover:brightness-110 disabled:opacity-50"
                  style={{ backgroundColor: "#f59e0b20", color: "#f59e0b", border: "1px solid #f59e0b30" }}
                >
                  {diagRunning ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
                  {diagRunning ? "Diagnosticando..." : "🔧 Corrigir Conexão"}
                </button>

                {diagResult && (
                  <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: "#16161c", border: "1px solid #ffffff08" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Activity size={14} style={{ color: "#f59e0b" }} />
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#f59e0b" }}>Resultado do Diagnóstico</span>
                    </div>

                    {/* URL Analysis */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="rounded-lg p-2.5" style={{ backgroundColor: "#ffffff06" }}>
                        <p className="text-[9px] font-bold uppercase text-white/30 mb-1">Tipo de IP</p>
                        <p className="text-xs font-bold" style={{ color: diagResult.urlType === "local" ? "#22c55e" : "#60a5fa" }}>
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
                        {diagResult.directError && <p className="text-[10px] text-white/40 mt-1">{diagResult.directError}</p>}
                        {diagResult.directResult === "ok" && <p className="text-[10px] text-white/40 mt-1">Conexão direta funcionando!</p>}
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
                        {diagResult.proxyError && <p className="text-[10px] text-white/40 mt-1">{diagResult.proxyError}</p>}
                        {diagResult.proxyResult === "ok" && <p className="text-[10px] text-white/40 mt-1">Conexão via proxy funcionando!</p>}
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

                    {/* Retry button */}
                    {diagResult.directResult !== "ok" && diagResult.proxyResult !== "ok" && (
                      <button
                        onClick={runDiagnostic}
                        className="w-full py-2.5 rounded-xl text-xs font-bold transition-all hover:brightness-110"
                        style={{ backgroundColor: "#f59e0b20", color: "#f59e0b", border: "1px solid #f59e0b30" }}
                      >
                        🔄 Tentar novamente
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {!diagResult && !savedUrl && (
              <p className="text-xs text-white/15 py-4 text-center">Digite o endereço IP do computador com vMix e clique em Salvar</p>
            )}
            {!diagResult && savedUrl && (
              <p className="text-xs text-white/15 py-4 text-center">Use 'Direto' para rede local (192.168.x.x) ou 'Proxy' com IP público + port forwarding.</p>
            )}
          </div>
        </div>

        {/* ── WARNING BANNER ── */}
        {showNewTabBanner && (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#1e1e24", border: "1px solid #f59e0b25", boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
            <div className="px-6 py-3 flex items-center gap-2" style={{ background: "linear-gradient(135deg, #f59e0b15, #f59e0b08)", borderBottom: "1px solid #f59e0b15" }}>
              <AlertTriangle size={14} style={{ color: "#f59e0b" }} />
              <span className="text-xs font-bold" style={{ color: "#fbbf24" }}>Habilite "Conteúdo não seguro"</span>
            </div>
            <div className="p-6">
              <p className="text-[11px] leading-relaxed mb-4" style={{ color: "#ffffff60" }}>
                O preview roda em HTTPS e bloqueia requisições HTTP para IPs locais ({savedUrl}). 
                Siga os passos abaixo <strong style={{ color: "#fff" }}>uma única vez</strong> para permitir a conexão:
              </p>
              <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "#ffffff04", border: "1px solid #ffffff08" }}>
                {[
                  <>Abra esta URL em uma aba separada: <button onClick={() => window.open(previewDomain + "/vmix-control", "_blank", "noopener,noreferrer")} className="ml-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all hover:brightness-110" style={{ backgroundColor: "#f59e0b20", color: "#fbbf24", border: "1px solid #f59e0b30" }}><ExternalLink size={10} />{previewDomain.replace("https://", "").slice(0, 30)}...</button></>,
                  <>Na barra de endereço, clique no ícone <strong style={{ color: "#fff" }}>🔒 cadeado</strong> → <strong style={{ color: "#fff" }}>Configurações do site</strong></>,
                  <>Encontre <strong style={{ color: "#fff" }}>Conteúdo não seguro</strong> → mude para <strong style={{ color: "#22c55e" }}>Permitir</strong></>,
                  <><strong style={{ color: "#fff" }}>Feche a aba</strong> e volte aqui. Clique <strong style={{ color: "#22c55e" }}>Conectar</strong> — agora vai funcionar! ✅</>,
                ].map((content, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f59e0b", color: "#000" }}>{i + 1}</span>
                    <p className="text-[11px]" style={{ color: "#ffffff80" }}>{content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
  ];

  return (
    <div className="space-y-4 max-w-full pb-20" style={{ color: "#e0e0e0" }}>
      {/* ── CONNECTION ALERT REMOVED ── */}

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
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#111114", boxShadow: "0 4px 20px #00000060" }}>
        <button
          onClick={() => setMonitorsCollapsed(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-2 transition-colors hover:brightness-110"
          style={{ backgroundColor: "#18181c", borderBottom: monitorsCollapsed ? "none" : "1px solid #ffffff08" }}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#999" }}>
            🖥 Monitores Preview / Output
          </span>
          <span className="text-[10px]" style={{ color: "#666" }}>{monitorsCollapsed ? "▼" : "▲"}</span>
        </button>
        {!monitorsCollapsed && (
        <div className="flex items-stretch gap-[1px]">
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
                  const baseUrl = savedUrl.replace(/\/+$/, "");
                  setMonitorStreamUrls(prev => ({ ...prev, preview: `${baseUrl}/mjpeg?Input=Preview` }));
                  setMonitorIframeMode(prev => ({ ...prev, preview: false }));
                  toast({ title: "Vídeo NDI Ativado", description: "Carregando stream MJPEG do vMix Preview." });
                }}
                className="text-[8px] px-2 py-0.5 rounded transition-all flex items-center gap-1"
                style={{
                  backgroundColor: monitorStreamUrls.preview?.includes("mjpeg") ? "#dc262620" : "#ffffff08",
                  color: monitorStreamUrls.preview?.includes("mjpeg") ? "#dc2626" : "#666",
                  border: `1px solid ${monitorStreamUrls.preview?.includes("mjpeg") ? "#dc262640" : "#ffffff10"}`,
                }}
                title="Ativar Live Preview (vMix NDI/MJPEG)"
              >
                <Monitor size={10} /> LIVE
              </button>
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
                  backgroundColor: monitorStreamUrls.preview && !monitorStreamUrls.preview.includes("mjpeg") ? "#3b82f620" : "#ffffff08",
                  color: monitorStreamUrls.preview && !monitorStreamUrls.preview.includes("mjpeg") ? "#3b82f6" : "#666",
                  border: `1px solid ${monitorStreamUrls.preview && !monitorStreamUrls.preview.includes("mjpeg") ? "#3b82f640" : "#ffffff10"}`,
                }}
                title="Configurar URL de stream manual (HLS/NDI Bridge)"
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
                  const baseUrl = savedUrl.replace(/\/+$/, "");
                  setMonitorStreamUrls(prev => ({ ...prev, output: `${baseUrl}/mjpeg` }));
                  setMonitorIframeMode(prev => ({ ...prev, output: false }));
                  toast({ title: "Vídeo NDI Ativado", description: "Carregando stream MJPEG do vMix Output." });
                }}
                className="text-[8px] px-2 py-0.5 rounded transition-all flex items-center gap-1"
                style={{
                  backgroundColor: monitorStreamUrls.output?.includes("mjpeg") ? "#dc262620" : "#ffffff08",
                  color: monitorStreamUrls.output?.includes("mjpeg") ? "#dc2626" : "#666",
                  border: `1px solid ${monitorStreamUrls.output?.includes("mjpeg") ? "#dc262640" : "#ffffff10"}`,
                }}
                title="Ativar Live Output (vMix NDI/MJPEG)"
              >
                <Monitor size={10} /> LIVE
              </button>
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
                  backgroundColor: monitorStreamUrls.output && !monitorStreamUrls.output.includes("mjpeg") ? "#3b82f620" : "#ffffff08",
                  color: monitorStreamUrls.output && !monitorStreamUrls.output.includes("mjpeg") ? "#3b82f6" : "#666",
                  border: `1px solid ${monitorStreamUrls.output && !monitorStreamUrls.output.includes("mjpeg") ? "#3b82f640" : "#ffffff10"}`,
                }}
                title="Configurar URL de stream manual (HLS/NDI Bridge)"
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
        )}
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
            {inputs.filter(i => i.type === "NDI" || i.title.toLowerCase().includes("ndi")).map(input => {
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
                    sendCommand("CutDirect", input.number);
                    setActiveInput(input.number);
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
                    <div className="relative group/shortcut flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCapturingShortcut(capturingShortcut === input.number ? null : input.number);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setInputShortcuts(prev => {
                            const copy = { ...prev };
                            delete copy[input.number];
                            return copy;
                          });
                        }}
                        className="text-[7px] font-mono font-bold px-1.5 py-0.5 rounded transition-all"
                        style={{
                          backgroundColor: capturingShortcut === input.number ? "#f59e0b30" : inputShortcuts[input.number] ? "#ffffff10" : "#ffffff06",
                          color: capturingShortcut === input.number ? "#f59e0b" : inputShortcuts[input.number] ? "#aaa" : "#555",
                          border: `1px solid ${capturingShortcut === input.number ? "#f59e0b40" : "#ffffff08"}`,
                          minWidth: 20,
                          textAlign: "center",
                        }}
                      >
                        {capturingShortcut === input.number ? "⌨ ..." : inputShortcuts[input.number] || "⌨"}
                      </button>
                      {/* Tooltip on hover */}
                      {inputShortcuts[input.number] && capturingShortcut !== input.number && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg opacity-0 group-hover/shortcut:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50"
                          style={{ backgroundColor: "#111118", border: "1px solid #333", boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}
                        >
                          <div className="flex items-center gap-2">
                            <Keyboard size={14} style={{ color: "#f59e0b" }} />
                            <span className="text-sm font-mono font-black tracking-wider" style={{ color: "#f59e0b" }}>{inputShortcuts[input.number]}</span>
                          </div>
                          <div className="text-[8px] mt-0.5 text-center" style={{ color: "#666" }}>clique direito para limpar</div>
                          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0" style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid #333" }} />
                        </div>
                      )}
                    </div>
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
                        placeholder="URL do stream (HLS .m3u8, MJPEG, ou JPEG)"
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
            {inputs.filter(i => i.type === "NDI" || i.title.toLowerCase().includes("ndi")).length === 0 && (
              <p className="text-[11px] text-white/30 py-4">Nenhum input NDI encontrado</p>
            )}
          </div>
        )}

        {/* ══ SCENES TAB ══ */}
        {activeTab === "scenes" && (() => {
          const normalizeWeekday = (value: string) =>
            value
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/\./g, "")
              .trim()
              .toLowerCase();

          const weekdayMap: Record<string, number> = {
            domingo: 0, dom: 0,
            segunda: 1, seg: 1,
            terca: 2, ter: 2,
            quarta: 3, qua: 3,
            quinta: 4, qui: 4,
            sexta: 5, sex: 5,
            sabado: 6, sab: 6,
          };

          const toMin = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            return (h || 0) * 60 + (m || 0);
          };

          const now = new Date();
          const nowParts = new Intl.DateTimeFormat("pt-BR", {
            timeZone: "America/Sao_Paulo",
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          }).formatToParts(now);

          const weekdayLabel = nowParts.find(p => p.type === "weekday")?.value ?? "";
          const hour = Number(nowParts.find(p => p.type === "hour")?.value ?? "0");
          const minute = Number(nowParts.find(p => p.type === "minute")?.value ?? "0");
          const second = Number(nowParts.find(p => p.type === "second")?.value ?? "0");
          const nowMinutes = hour * 60 + minute;
          const nowSeconds = hour * 3600 + minute * 60 + second;
          const todayDow = weekdayMap[normalizeWeekday(weekdayLabel)] ?? now.getDay();

          const isProgramForToday = (p: Programa) => {
            if (!p.dias_semana || p.dias_semana.length === 0) return true;
            return p.dias_semana.some(d => weekdayMap[normalizeWeekday(d)] === todayDow);
          };

          const isNowInProgram = (p: Programa) => {
            const start = toMin(p.horario_inicio);
            const end = toMin(p.horario_fim);
            if (start <= end) return nowMinutes >= start && nowMinutes < end;
            return nowMinutes >= start || nowMinutes < end;
          };

          const minutesUntilStart = (p: Programa) => {
            const start = toMin(p.horario_inicio);
            return start >= nowMinutes ? start - nowMinutes : start + 1440 - nowMinutes;
          };

          const minutesUntilEnd = (p: Programa) => {
            const start = toMin(p.horario_inicio);
            const end = toMin(p.horario_fim);
            const crossesMidnight = end <= start;
            const normalizedNow = crossesMidnight && nowMinutes < start ? nowMinutes + 1440 : nowMinutes;
            const normalizedEnd = crossesMidnight ? end + 1440 : end;
            return Math.max(0, normalizedEnd - normalizedNow);
          };

          const toSec = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            return (h || 0) * 3600 + (m || 0) * 60;
          };

          const secondsUntilEnd = (p: Programa) => {
            const startS = toSec(p.horario_inicio);
            const endS = toSec(p.horario_fim);
            const crossesMidnight = endS <= startS;
            const nNow = crossesMidnight && nowSeconds < startS ? nowSeconds + 86400 : nowSeconds;
            const nEnd = crossesMidnight ? endS + 86400 : endS;
            return Math.max(0, nEnd - nNow);
          };

          const programDurationSec = (p: Programa) => {
            const startS = toSec(p.horario_inicio);
            const endS = toSec(p.horario_fim);
            if (endS > startS) return endS - startS;
            return 86400 - startS + endS;
          };

          const todayPrograms = programas
            .filter(isProgramForToday)
            .sort((a, b) => toMin(a.horario_inicio) - toMin(b.horario_inicio));

          const onAir = todayPrograms.find(isNowInProgram);

          const upcoming = todayPrograms
            .filter(p => !isNowInProgram(p))
            .sort((a, b) => minutesUntilStart(a) - minutesUntilStart(b))
            .slice(0, 4);

          return (
            <>
              {/* ── Programa no Ar + A Seguir (compact) ── */}
              <div className="flex gap-2 items-center">
                {/* NO AR */}
                <div className="flex-1 flex items-center gap-3 rounded-lg px-3 py-2" style={{ backgroundColor: "#1a1a1f", border: "1px solid #dc262640" }}>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#dc2626" }}>No Ar</span>
                  </div>
                  {onAir ? (
                    <>
                      <span className="text-[11px] font-bold text-white truncate shrink-0 max-w-[140px]">{onAir.nome}</span>
                      <span className="text-[9px] text-white/40 shrink-0">{onAir.horario_inicio?.slice(0,5)} – {onAir.horario_fim?.slice(0,5)}</span>
                      {(() => {
                        const remSec = secondsUntilEnd(onAir);
                        const totalSec = programDurationSec(onAir);
                        const elapsedSec = totalSec - remSec;
                        const progress = totalSec > 0 ? Math.min(100, (elapsedSec / totalSec) * 100) : 0;
                        const rh = Math.floor(remSec / 3600);
                        const rm = Math.floor((remSec % 3600) / 60);
                        const rs = remSec % 60;
                        const timeStr = rh > 0
                          ? `${String(rh).padStart(2, "0")}:${String(rm).padStart(2, "0")}:${String(rs).padStart(2, "0")}`
                          : `${String(rm).padStart(2, "0")}:${String(rs).padStart(2, "0")}`;
                        return (
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#333" }}>
                              <div className="h-full rounded-full transition-all duration-1000 ease-linear" style={{ width: `${progress}%`, backgroundColor: "#dc2626" }} />
                            </div>
                            <span className="text-[11px] font-mono font-black tracking-wider shrink-0" style={{ color: remSec <= 300 ? "#dc2626" : "#fff" }}>
                              {remSec <= 0 ? "00:00" : timeStr}
                            </span>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <span className="text-[10px] text-white/30">Nenhum programa no ar</span>
                  )}
                </div>

                {/* A SEGUIR - only 1 program */}
                <div className="shrink-0 flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: "#1a1a1f", border: "1px solid #ffffff08" }}>
                  <Eye size={10} style={{ color: "#666" }} />
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#666" }}>A seguir</span>
                  {upcoming.length > 0 ? (
                    <>
                      <span className="text-[10px] font-medium text-white/70 truncate max-w-[120px]">{upcoming[0].nome}</span>
                      <span className="text-[9px] text-white/30">{upcoming[0].horario_inicio?.slice(0,5)}</span>
                    </>
                  ) : (
                    <span className="text-[9px] text-white/30">—</span>
                  )}
                </div>
              </div>

              {/* ── Programas Preset + Botões de Efeitos side by side ── */}
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-4">
                {/* Left: Programas Preset */}
                <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#1a1a1f", border: "1px solid #ffffff08" }}>
                  <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: "#ffffff06", borderBottom: "1px solid #ffffff08" }}>
                    <div className="flex items-center gap-2">
                      <Radio size={14} style={{ color: "#999" }} />
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#999" }}>programas preset</span>
                    </div>
                    <button
                      onClick={() => setEditingPresetId("new")}
                      className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors"
                      style={{ color: "#22c55e" }}
                      title="Criar novo programa"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="p-4 space-y-4">
                    {(() => {
                      const hasSavedOrder = (() => { try { return JSON.parse(localStorage.getItem("vmix_preset_order") || "[]").length > 0; } catch { return false; } })();
                      const ordered = hasSavedOrder ? programas : [...programas].sort((a, b) => {
                        const studioOrder = (s: string | null) => {
                          if (!s) return 2;
                          const l = s.toLowerCase();
                          if (l.includes("fm")) return 0;
                          if (l.includes("podcast")) return 1;
                          return 2;
                        };
                        const diff = studioOrder(a.estudio) - studioOrder(b.estudio);
                        if (diff !== 0) return diff;
                        return (a.horario_inicio || "").localeCompare(b.horario_inicio || "");
                      });
                      const groups: Record<string, typeof ordered> = {};
                      for (const p of ordered) {
                        const key = p.estudio || "Sem Estúdio";
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(p);
                      }
                      return Object.entries(groups).map(([studio, progs]) => (
                        <div key={studio}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded" style={{ backgroundColor: studio.toLowerCase().includes("fm") ? "#3b82f620" : studio.toLowerCase().includes("podcast") ? "#8b5cf620" : "#ffffff08", color: studio.toLowerCase().includes("fm") ? "#3b82f6" : studio.toLowerCase().includes("podcast") ? "#8b5cf6" : "#888" }}>
                              {studio}
                            </span>
                            <div className="flex-1 h-px" style={{ backgroundColor: "#ffffff08" }} />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                      {progs.map((prog) => {
                        const isActive = activePreset === prog.id;
                        const progOnAir = isProgramForToday(prog) && isNowInProgram(prog);
                        const startTime = prog.horario_inicio?.slice(0, 5) || "";
                        const endTime = prog.horario_fim?.slice(0, 5) || "";
                        return (
                          <div
                            key={prog.id}
                            className={`group/preset relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.03]${progOnAir ? " vmix-preset-onair" : ""}`}
                            style={{
                              aspectRatio: "3/2",
                              backgroundColor: isActive ? "#dc2626" : progOnAir ? "#dc2626" : "#2a2a30",
                              border: isActive ? "2px solid #ef4444" : progOnAir ? "2px solid #dc2626" : "2px solid #333338",
                              opacity: dragPresetIdx !== null && programas[dragPresetIdx]?.id === prog.id ? 0.4 : 1,
                            }}
                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (dragPresetIdx === null) return;
                              const dragId = programas[dragPresetIdx]?.id;
                              if (!dragId || dragId === prog.id) { setDragPresetIdx(null); return; }
                              const arr = [...programas];
                              const fromIdx = arr.findIndex(p => p.id === dragId);
                              const toIdx = arr.findIndex(p => p.id === prog.id);
                              if (fromIdx === -1 || toIdx === -1) { setDragPresetIdx(null); return; }
                              const [moved] = arr.splice(fromIdx, 1);
                              arr.splice(toIdx, 0, moved);
                              setProgramas(arr);
                              localStorage.setItem("vmix_preset_order", JSON.stringify(arr.map(p => p.id)));
                              setDragPresetIdx(null);
                            }}
                            onDragEnd={() => setDragPresetIdx(null)}
                            onClick={async () => {
                              setActivePreset(prog.id);
                              const { data: presetData } = await (supabase.from("preset_commands" as any) as any)
                                .select("commands")
                                .eq("user_id", user?.id)
                                .eq("programa_id", prog.id)
                                .maybeSingle();
                              
                              let cmds = presetData?.commands && Array.isArray(presetData.commands) && presetData.commands.length > 0
                                ? [...presetData.commands]
                                : [{ fn: "ScriptStart", input: prog.nome }];

                              // Always carry the current presenter's name to vMix Titler if available
                              const apresentadorNome = (prog as any).apresentadores?.nome;
                              if (apresentadorNome) {
                                cmds.push({
                                  fn: "SetText",
                                  input: "TITULO APRESENTADOR", // Assumed titler input name in vMix
                                  value: apresentadorNome,
                                  label: "Apresentador Automático"
                                });
                              }

                              await runCommandsUnified(cmds as any[], `Preset: ${prog.nome}`);
                            }}
                          >
                            {prog.apresentador_foto && (
                              <img
                                src={prog.apresentador_foto}
                                alt=""
                                className="absolute inset-0 w-full h-full object-contain object-right-bottom pointer-events-none"
                                style={{ opacity: 0.4, filter: "grayscale(100%)", maskImage: "linear-gradient(to left, black 40%, transparent 100%)", WebkitMaskImage: "linear-gradient(to left, black 40%, transparent 100%)" }}
                              />
                            )}
                            {startTime && (
                              <div
                                draggable
                                onDragStart={(e) => { e.stopPropagation(); const gi = programas.findIndex(p => p.id === prog.id); setDragPresetIdx(gi); e.dataTransfer.effectAllowed = "move"; }}
                                className="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded cursor-grab active:cursor-grabbing"
                                style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 2 }}
                                title="Arraste para reposicionar"
                              >
                                <GripVertical size={7} style={{ color: "#666" }} />
                                <Clock size={8} style={{ color: progOnAir ? "#fff" : "#888" }} />
                                <span className="text-[7px] font-bold tabular-nums" style={{ color: progOnAir ? "#fff" : "#999" }}>{startTime} - {endTime}</span>
                              </div>
                            )}
                            {prog.estudio && (
                              <div className="absolute top-1.5 right-1.5 z-[2]">
                                <span className="text-[6px] font-bold uppercase tracking-wider px-1 py-[1px] rounded"
                                  style={{ backgroundColor: progOnAir ? "#ffffff" : prog.estudio.toLowerCase().includes("fm") ? "#3b82f630" : "#8b5cf630", color: progOnAir ? "#000" : prog.estudio.toLowerCase().includes("fm") ? "#3b82f6" : "#8b5cf6" }}
                                >{prog.estudio.toLowerCase().includes("fm") ? "FM" : prog.estudio.toLowerCase().includes("podcast") ? "PODCAST" : prog.estudio}</span>
                              </div>
                            )}
                            {prog.dias_semana && prog.dias_semana.length > 0 && (
                              <div className="absolute bottom-1.5 left-1.5 flex items-center gap-[2px] z-[1]">
                                {["dom","seg","ter","qua","qui","sex","sáb"].map((d, i) => {
                                  const active = prog.dias_semana!.some(ds => {
                                    const n = ds.toLowerCase().replace(/[-.,]/g, "").trim().slice(0, 3);
                                    return n === d;
                                  });
                                  return (
                                    <span key={i} className="text-[5px] font-bold uppercase leading-none px-[2px] py-[1px] rounded-sm"
                                      style={{ backgroundColor: active ? "rgba(255,255,255,0.15)" : "transparent", color: active ? "#fff" : "#555" }}
                                    >{d[0].toUpperCase()}</span>
                                  );
                                })}
                              </div>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center p-2 pt-5 pb-4">
                              <span className="text-[10px] font-black uppercase tracking-wider text-center leading-tight"
                                style={{ color: isActive ? "#fff" : "#ccc" }}
                              >{prog.nome}</span>
                            </div>
                            <div
                              className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1 py-1.5 opacity-0 group-hover/preset:opacity-100 transition-all duration-200 translate-y-full group-hover/preset:translate-y-0"
                              style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
                            >
                              {(() => { const gi = programas.findIndex(p => p.id === prog.id); return gi > 0 ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); const arr = [...programas]; [arr[gi - 1], arr[gi]] = [arr[gi], arr[gi - 1]]; setProgramas(arr); localStorage.setItem("vmix_preset_order", JSON.stringify(arr.map(p => p.id))); }}
                                  className="w-5 h-5 rounded flex items-center justify-center text-[9px] hover:bg-white/20 transition-colors"
                                  style={{ color: "#ccc" }}
                                  title="Mover para esquerda"
                                >◀</button>
                              ) : null; })()}
                              {(() => { const gi = programas.findIndex(p => p.id === prog.id); return gi < programas.length - 1 ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); const arr = [...programas]; [arr[gi], arr[gi + 1]] = [arr[gi + 1], arr[gi]]; setProgramas(arr); localStorage.setItem("vmix_preset_order", JSON.stringify(arr.map(p => p.id))); }}
                                  className="w-5 h-5 rounded flex items-center justify-center text-[9px] hover:bg-white/20 transition-colors"
                                  style={{ color: "#ccc" }}
                                  title="Mover para direita"
                                >▶</button>
                              ) : null; })()}
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingPresetId(prog.id); }}
                                className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/20 transition-colors"
                                style={{ color: "#ccc" }}
                                title="Editar ações"
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
                          </div>
                        </div>
                      ));
                      })()}
                      {programas.length === 0 && (
                        <p className="text-[11px] text-white/30 py-4">Nenhum programa cadastrado.</p>
                      )}
                  </div>
                </div>

                {/* Right: Botões de Efeitos */}
                <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#1a1a1f", border: "1px solid #ffffff08" }}>
                  <div className="flex items-center gap-2 px-4 py-2.5" style={{ backgroundColor: "#ffffff06", borderBottom: "1px solid #ffffff08" }}>
                    <Wand2 size={14} style={{ color: "#f59e0b" }} />
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#f59e0b" }}>botões de efeitos</span>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                      {customButtons.map((btn: any) => {
                        const isBtnActive = activeCustomButton === btn.id;
                        const hasSchedule = btn.horario && btn.dias_semana?.length > 0;
                        const btnColor = btn.color || "#f59e0b";
                        const BtnIcon = getIconForName(btn.nome || "");
                        // Compute text color based on background luminance
                        const hex = btnColor.replace("#", "");
                        const r = parseInt(hex.substring(0, 2), 16) / 255;
                        const g = parseInt(hex.substring(2, 4), 16) / 255;
                        const b = parseInt(hex.substring(4, 6), 16) / 255;
                        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                        const textColor = luminance > 0.5 ? "#000000" : "#ffffff";
                        return (
                          <div
                            key={btn.id}
                            className="group/custom relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.03]"
                            style={{
                              aspectRatio: "3/2",
                              backgroundColor: btnColor,
                              border: isBtnActive ? `2px solid ${textColor}` : `2px solid ${btnColor}`,
                            }}
                            onClick={async () => {
                              setActiveCustomButton(btn.id);
                              if (btn.commands && Array.isArray(btn.commands) && btn.commands.length > 0) {
                                await runCommandsUnified(btn.commands as any[], `Efeito: ${btn.nome}`);
                              }
                            }}
                          >
                            {hasSchedule && (
                              <div className="absolute top-1 left-1 flex items-center gap-0.5 px-1 py-0.5 rounded" style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", zIndex: 2 }}>
                                <Clock size={7} style={{ color: "#fff" }} />
                                <span className="text-[6px] font-bold tabular-nums" style={{ color: "#fff" }}>{btn.horario?.slice(0, 5)}</span>
                              </div>
                            )}
                            {btn.dias_semana && btn.dias_semana.length > 0 && (
                              <div className="absolute bottom-1 left-1 flex items-center gap-[1px] z-[1]">
                                {["D","S","T","Q","Q","S","S"].map((d: string, i: number) => {
                                  const dayLabels = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
                                  const dayOn = (btn.dias_semana as string[]).includes(dayLabels[i]);
                                  return (
                                    <span key={i} className="text-[4px] font-bold uppercase leading-none px-[2px] py-[1px] rounded-sm"
                                      style={{ backgroundColor: dayOn ? `${textColor}25` : "transparent", color: dayOn ? textColor : `${textColor}50` }}
                                    >{d}</span>
                                  );
                                })}
                              </div>
                            )}
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-1.5 pt-4 pb-3 gap-1">
                              <BtnIcon size={16} style={{ color: textColor, opacity: 0.85 }} />
                              <span className="text-[9px] font-black uppercase tracking-wider text-center leading-tight" style={{ color: textColor }}>{btn.nome}</span>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1 py-1 opacity-0 group-hover/custom:opacity-100 transition-all duration-200 translate-y-full group-hover/custom:translate-y-0" style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}>
                              <button onClick={(e) => { e.stopPropagation(); setEditingCustomButtonId(btn.id); }} className="w-4 h-4 rounded flex items-center justify-center hover:bg-white/20 transition-colors" style={{ color: "#ccc" }} title="Editar"><Wand2 size={9} /></button>
                              <button onClick={async (e) => { e.stopPropagation(); await (supabase.from("custom_vmix_buttons" as any) as any).delete().eq("id", btn.id); loadCustomButtons(); toast({ title: "Botão excluído" }); }} className="w-4 h-4 rounded flex items-center justify-center hover:bg-red-500/40 transition-colors" style={{ color: "#f87171" }} title="Excluir"><Trash2 size={9} /></button>
                            </div>
                          </div>
                        );
                      })}
                      {/* + Criar */}
                      <div
                        className="relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.03] flex items-center justify-center"
                        style={{ aspectRatio: "3/2", backgroundColor: "#1e1e26", border: "2px dashed #333338" }}
                        onClick={() => setEditingCustomButtonId("new")}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <Plus size={14} style={{ color: "#f59e0b" }} />
                          <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: "#f59e0b" }}>+ Criar</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          );
        })()}


        {/* NDI tab removed */}
      </div>
      {/* Preset Command Editor */}
      {editingPresetId && user && (() => {
        const prog = editingPresetId === "new" ? { id: "new", nome: "Novo Programa", horario_inicio: "00:00", horario_fim: "00:00" } : programas.find(p => p.id === editingPresetId);
        if (!prog) return null;
        return (
          <PresetCommandEditor
            open={true}
            onClose={() => { setEditingPresetId(null); loadProgramas(); }}
            programaId={prog.id}
            programaNome={prog.nome}
            programaHorario={`${prog.horario_inicio?.slice(0,5) || ""} – ${prog.horario_fim?.slice(0,5) || ""}`}
            userId={user.id}
            inputs={ndiInputs}
            onRunCommands={async (cmds) => {
              await runCommandsUnified(cmds as any[], "Teste concluído");
            }}
          />
        );
      })()}
      {/* Custom Button Editor */}
      {editingCustomButtonId !== null && user && (
        <CustomVmixButtonEditor
          open={true}
          onClose={() => setEditingCustomButtonId(null)}
          buttonId={editingCustomButtonId === "new" ? null : editingCustomButtonId}
          userId={user.id}
          inputs={ndiInputs}
          onRunCommands={async (cmds) => {
            await runCommandsUnified(cmds as any[], "Teste concluído");
          }}
          onSaved={loadCustomButtons}
        />
      )}

      {/* ── Command Log Panel ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50" style={{ pointerEvents: "none" }}>
        <div className="max-w-5xl mx-auto" style={{ pointerEvents: "auto" }}>
          {/* Toggle bar */}
          <button
            onClick={() => setLogsOpen(p => !p)}
            className="flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-[11px] font-semibold transition-colors"
            style={{ backgroundColor: "#1e1e24", color: "#aaa", border: "1px solid #333", borderBottom: "none" }}
          >
            <ScrollText size={13} />
            Logs vMix ({vmixLogs.length})
            {logsOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            {vmixLogs.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setVmixLogs([]); }}
                className="ml-2 text-[10px] px-1.5 py-0.5 rounded hover:opacity-80"
                style={{ backgroundColor: "#333", color: "#888" }}
              >
                Limpar
              </button>
            )}
          </button>
          {logsOpen && (
            <div
              className="overflow-auto font-mono text-[11px] leading-relaxed"
              style={{ backgroundColor: "#111115", border: "1px solid #333", borderTop: "none", maxHeight: 220 }}
            >
              {vmixLogs.length === 0 ? (
                <div className="px-4 py-3 text-center" style={{ color: "#555" }}>Nenhum log ainda.</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: "#1a1a20", color: "#666" }}>
                      <th className="text-left px-3 py-1.5 font-medium">Hora</th>
                      <th className="text-left px-3 py-1.5 font-medium">Comando</th>
                      <th className="text-left px-3 py-1.5 font-medium">Status</th>
                      <th className="text-left px-3 py-1.5 font-medium">Via</th>
                      <th className="text-left px-3 py-1.5 font-medium">Detalhe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vmixLogs.map(log => (
                      <tr key={log.id} className="border-t" style={{ borderColor: "#222" }}>
                        <td className="px-3 py-1" style={{ color: "#666", whiteSpace: "nowrap" }}>{log.time}</td>
                        <td className="px-3 py-1" style={{ color: "#ccc", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.command}</td>
                        <td className="px-3 py-1">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                            style={{
                              backgroundColor: log.status === "ok" ? "#052e16" : log.status === "error" ? "#450a0a" : "#1c1917",
                              color: log.status === "ok" ? "#4ade80" : log.status === "error" ? "#f87171" : "#d4d4d4"
                            }}
                          >
                            {log.status === "ok" ? <CheckCircle size={10} /> : log.status === "error" ? <XCircle size={10} /> : <Loader2 size={10} className="animate-spin" />}
                            {log.status}
                          </span>
                        </td>
                        <td className="px-3 py-1" style={{ color: "#888", whiteSpace: "nowrap" }}>{log.source}</td>
                        <td className="px-3 py-1" style={{ color: "#777", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Instruction Dialog REMOVED */}
    </div>
  );
}
