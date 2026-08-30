import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Hls from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useVmixCategories, VmixCategoryCreator, VmixCategoryPanel } from "@/components/vmix/VmixCategories";
import NdiWebrtcMonitor from "@/components/vmix/NdiWebrtcMonitor";

import {
  Monitor, Radio, Disc, RefreshCw, Loader2, CheckCircle, XCircle,
  ExternalLink, Volume2, VolumeX, Play, Square, Camera, Tv,
  Layers, Wand2, Plus, Trash2, GripVertical, Send, Eye, Wifi, WifiOff, HelpCircle, Activity, AlertTriangle, Shield, Clock, Keyboard,
  ScrollText, ChevronDown, ChevronUp, Lock, Download, Upload, Network, Zap, Layout, Cpu, Copy
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { getIconForName, resolveButtonIcon } from "./CustomVmixButtonEditor";
import logoMixControl from "@/assets/logo-mixcontrol.png"; // Keeping reference to the main logo asset.
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import PresetCommandEditor from "./PresetCommandEditor";
import CustomVmixButtonEditor from "./CustomVmixButtonEditor";

/* ── Escopo de estúdio (validação central) ─────────────────────────────── */
const normStudio = (s?: string | null) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

/** true quando um estúdio específico foi selecionado na conexão */
export const isStudioScoped = (studioName?: string | null) => {
  const n = normStudio(studioName);
  return n !== "" && n !== "vmix studio";
};

/** remove palavras genéricas ("estúdio", "studio", "sala") para comparar apenas o identificador */
const studioTokens = (s?: string | null) =>
  normStudio(s)
    .split(/[\s\-_/|.]+/)
    .filter(t => t && !["estudio", "studio", "sala", "de", "do", "da"].includes(t));

/** valida se um registro (programa/botão) pertence ao estúdio selecionado */
export const matchesStudio = (recordStudio?: string | null, studioName?: string | null) => {
  if (!isStudioScoped(studioName)) return true;
  const a = normStudio(recordStudio);
  const b = normStudio(studioName);
  if (!a) return false; // sem estúdio definido não herda o estúdio selecionado
  if (a === b || a.includes(b) || b.includes(a)) return true;
  // Comparação por identificador: "Estúdio FM" ↔ conexão "ESTUDIO JFM"
  const ta = studioTokens(recordStudio);
  const tb = studioTokens(studioName);
  if (ta.length === 0 || tb.length === 0) return false;
  return ta.some(x => tb.some(y => x === y || x.includes(y) || y.includes(x)));
};

/** "HH:MM" -> segundos do dia */
const timeToSeconds = (hhmm?: string | null) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 3600 + m * 60;
};

/** Segundos -> MM:SS ou HH:MM:SS */
const formatCountdown = (total: number) => {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};


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
  if (!inp) return false;
  const title = (inp.title || "").toUpperCase();
  const type = (inp.type || "").toUpperCase();
  return type === "NDI" || 
         title.includes("NDI") || 
         type.includes("NDI") ||
         title.startsWith("NDI (");
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

function normalizeVmixBaseUrl(rawUrl: string): string {
  let baseUrl = rawUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(baseUrl)) baseUrl = "http://" + baseUrl;
  return baseUrl;
}

function isLoopbackUrl(rawUrl: string): boolean {
  try {
    const hostname = new URL(normalizeVmixBaseUrl(rawUrl)).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  } catch {
    return false;
  }
}

function isMixedContentBlockedByPage(targetUrl: string): boolean {
  try {
    const url = new URL(targetUrl);
    return typeof window !== "undefined"
      && window.location.protocol === "https:"
      && url.protocol === "http:"
      && !isLoopbackUrl(targetUrl);
  } catch {
    return false;
  }
}

function buildLoopbackFallbackUrls(rawBaseUrl: string): string[] {
  try {
    const url = new URL(normalizeVmixBaseUrl(rawBaseUrl));
    const port = url.port || "8088";
    return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  } catch {
    return ["http://127.0.0.1:8088", "http://localhost:8088"];
  }
}

function parseVmixUrlParts(raw: string): { protocol: "http" | "https"; host: string; port: string } {
  const fallback = { protocol: "http" as const, host: "", port: "8088" };
  if (!raw) return fallback;
  let str = raw.trim();
  if (!/^https?:\/\//i.test(str)) str = "http://" + str;
  try {
    const u = new URL(str);
    return {
      protocol: (u.protocol.replace(":", "") as "http" | "https") || "http",
      host: u.hostname,
      port: u.port || (u.protocol === "https:" ? "443" : "8088"),
    };
  } catch {
    return fallback;
  }
}

function composeVmixUrl(protocol: "http" | "https", host: string, port: string): string {
  const h = (host || "").trim();
  const p = (port || "").trim();
  if (!h) return "";
  return `${protocol}://${h}${p ? ":" + p : ""}`;
}

function validateVmixParts(protocol: string, host: string, port: string): string | null {
  if (!host || !host.trim()) return "Host/IP obrigatório";
  if (/\s/.test(host)) return "Host não pode conter espaços";
  if (!/^([a-zA-Z0-9.\-]+|\[[0-9a-fA-F:]+\])$/.test(host)) return "Host inválido";
  if (!port || !/^\d+$/.test(port)) return "Porta obrigatória (numérica)";
  const n = Number(port);
  if (n < 1 || n > 65535) return "Porta deve estar entre 1 e 65535";
  if (protocol !== "http" && protocol !== "https") return "Protocolo inválido";
  return null;
}

function buildNdiSuggestions(machines: string[]): string[] {
  const suggestions: string[] = [];
  for (const machine of machines.map(m => m.trim()).filter(Boolean)) {
    suggestions.push(
      `${machine} (vMix - Output 1)`,
      `${machine} (vMix - Output 2)`,
      `${machine} (vMix - Output 3)`,
      `${machine} (vMix - Output 4)`,
      `${machine} (vMix Video)`,
      `${machine} (vMix Audio - Master)`,
      `${machine} (vMix Audio - Headphones)`,
      `${machine} (Screen 1)`,
      `${machine} (Screen 2)`,
    );
  }
  return Array.from(new Set(suggestions));
}

function extractNdiMachinesFromInputs(vmixInputs: VmixInput[]): string[] {
  const machines = new Set<string>();
  vmixInputs.forEach(inp => {
    if (isNdiInput(inp)) {
      const title = inp.title || "";
      const match = title.match(/(?:NDI\s*[\(-]?\s*)?([A-Z0-9_-]+)/i);
      if (match?.[1] && match[1].length > 2) machines.add(match[1]);
    }
  });
  return Array.from(machines);
}

function vmixTagText(xml: Document, tagName: string): string | null {
  return xml.getElementsByTagName(tagName)[0]?.textContent?.trim() || null;
}

function normalizeVmixXmlText(xmlText: string): string {
  let text = (xmlText || "")
    .replace(/^\uFEFF/, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim();

  const start = text.toLowerCase().indexOf("<vmix");
  const end = text.toLowerCase().lastIndexOf("</vmix>");
  if (start >= 0 && end >= start) {
    text = text.slice(start, end + "</vmix>".length).trim();
  }

  return text;
}

function escapeLooseXmlAmpersands(text: string): string {
  return text.replace(/&(?!#\d+;|#x[0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]+;)/g, "&amp;");
}

function decodeXmlEntities(value: string): string {
  if (!value) return "";
  const parser = new DOMParser();
  const xml = parser.parseFromString(`<x>${escapeLooseXmlAmpersands(value)}</x>`, "text/xml");
  return xml.documentElement?.textContent || value;
}

function readXmlAttr(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`${name}=["']([^"']*)["']`, "i"));
  return match ? decodeXmlEntities(match[1]) : "";
}

function parseVmixXmlFallback(text: string) {
  if (!/<vmix[\s>]/i.test(text)) {
    throw new Error("Conectou, mas a resposta não é da API XML do vMix. Verifique protocolo, host e porta do Web Controller.");
  }

  const parsedInputs: VmixInput[] = Array.from(text.matchAll(/<input\b([^>]*)>([\s\S]*?)<\/input>/gi)).map((match) => {
    const attrs = match[1] || "";
    const body = (match[2] || "").replace(/<[^>]+>/g, "").trim();
    return {
      key: readXmlAttr(attrs, "key") || readXmlAttr(attrs, "guid") || readXmlAttr(attrs, "number"),
      number: readXmlAttr(attrs, "number"),
      title: readXmlAttr(attrs, "title") || decodeXmlEntities(body) || "Sem título",
      type: readXmlAttr(attrs, "type"),
      state: readXmlAttr(attrs, "state") || "Paused",
      duration: readXmlAttr(attrs, "duration") || undefined,
      position: readXmlAttr(attrs, "position") || undefined,
      loop: readXmlAttr(attrs, "loop") || undefined,
      muted: /true/i.test(readXmlAttr(attrs, "muted")),
    };
  }).filter((input) => input.number || input.key || input.title);

  const readTag = (tag: string) => {
    const match = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return match ? decodeXmlEntities(match[1].replace(/<[^>]+>/g, "").trim()) : null;
  };

  const overlayStates: Record<number, boolean> = {};
  for (const match of text.matchAll(/<overlay\b([^>]*)>([\s\S]*?)<\/overlay>/gi)) {
    const n = Number(readXmlAttr(match[1] || "", "number"));
    if (n >= 1 && n <= 4) {
      const ovInput = decodeXmlEntities((match[2] || "").replace(/<[^>]+>/g, "").trim()) || readXmlAttr(match[1] || "", "input");
      overlayStates[n] = ovInput !== "" && ovInput !== "0";
    }
  }

  return {
    inputs: parsedInputs,
    active: readTag("active"),
    preview: readTag("preview"),
    streaming: readTag("streaming"),
    recording: readTag("recording"),
    overlays: overlayStates,
  };
}

function parseVmixXml(xmlText: string) {
  const text = normalizeVmixXmlText(xmlText);
  if (!text) throw new Error("Resposta vazia do vMix. Verifique URL/porta e Web Controller.");
  if (text === "{}" || text === "[object Blob]" || text === "[object Object]") {
    throw new Error("Resposta do proxy não veio como XML. Atualize a conexão e tente novamente.");
  }

  const parser = new DOMParser();
  let xml = parser.parseFromString(text, "text/xml");
  const parserError = xml.getElementsByTagName("parsererror")[0];
  if (parserError) {
    const repairedText = escapeLooseXmlAmpersands(text);
    xml = parser.parseFromString(repairedText, "text/xml");
    const repairedParserError = xml.getElementsByTagName("parsererror")[0];
    if (repairedParserError) {
      return parseVmixXmlFallback(text);
    }
  }

  const rootName = xml.documentElement?.nodeName?.toLowerCase() || "";
  const hasVmixRoot = rootName === "vmix" || xml.getElementsByTagName("vmix").length > 0;
  if (!hasVmixRoot) {
    throw new Error("Conectou, mas a resposta não é da API XML do vMix. Verifique protocolo, host e porta do Web Controller.");
  }

  const parsedInputs: VmixInput[] = Array.from(xml.getElementsByTagName("input")).map((el) => ({
    key: el.getAttribute("key") || el.getAttribute("guid") || el.getAttribute("number") || "",
    number: el.getAttribute("number") || "",
    title: el.getAttribute("title") || el.textContent?.trim() || "Sem título",
    type: el.getAttribute("type") || "",
    state: el.getAttribute("state") || "Paused",
    duration: el.getAttribute("duration") || undefined,
    position: el.getAttribute("position") || undefined,
    loop: el.getAttribute("loop") || undefined,
    muted: /true/i.test(el.getAttribute("muted") || ""),
  })).filter((input) => input.number || input.key || input.title);

  const overlayStates: Record<number, boolean> = {};
  for (let n = 1; n <= 4; n++) {
    const ovEl = Array.from(xml.getElementsByTagName("overlay")).find((el) => el.getAttribute("number") === String(n));
    if (ovEl) {
      const ovInput = ovEl.textContent?.trim() || ovEl.getAttribute("input") || "";
      overlayStates[n] = ovInput !== "" && ovInput !== "0";
    }
  }

  return {
    inputs: parsedInputs,
    active: vmixTagText(xml, "active"),
    preview: vmixTagText(xml, "preview"),
    streaming: vmixTagText(xml, "streaming"),
    recording: vmixTagText(xml, "recording"),
    overlays: overlayStates,
  };
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

interface NetworkInterfaceInfo {
  type: string;
  effectiveType: string;
  recommendation?: string;
}

export default function VmixPage({ forcedConnected = false }: { forcedConnected?: boolean }) {
  const navigate = useNavigate();
  const [networkInfo, setNetworkInfo] = useState<NetworkInterfaceInfo | null>(null);
  const [lanStatus, setLanStatus] = useState<"checking" | "same_lan" | "different_network" | "unknown">("checking");
  const { user } = useAuth();
  const { toast } = useToast();
  const [vmixUrl, setVmixUrl] = useState("");
  const [vmixUser, setVmixUser] = useState("");
  const [vmixPass, setVmixPass] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const directBaseUrlRef = useRef<string | null>(null);
  const loopbackFallbackNotifiedRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [vmixConnections, setVmixConnections] = useState<any[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [directTesting, setDirectTesting] = useState(false);
  const [directTestResult, setDirectTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  
  // Logic to check LAN connectivity
  useEffect(() => {
    if (!savedUrl || !isPrivateIp(savedUrl)) {
      setLanStatus("unknown");
      return;
    }

    const checkLan = async () => {
      setLanStatus("checking");
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        // Try a very quick fetch to the vMix API with a short timeout
        // This only works if the user is on the same network
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const candidates = Array.from(new Set([
          normalizeVmixBaseUrl(savedUrl),
          ...(isPrivateIp(savedUrl) && !isLoopbackUrl(savedUrl) ? buildLoopbackFallbackUrls(savedUrl) : []),
        ]));

        let reached = false;
        for (const baseUrl of candidates) {
          if (isMixedContentBlockedByPage(baseUrl + "/api/")) continue;
          try {
            await fetch(baseUrl + "/api/", {
              mode: 'no-cors',
              cache: "no-store",
              signal: controller.signal
            });
            reached = true;
            break;
          } catch {
            // try next candidate
          }
        }

        if (!reached) throw new Error("LAN not reachable");

        setLanStatus("same_lan");
      } catch (err) {
        setLanStatus("different_network");
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    checkLan();
  }, [savedUrl]);

  // Network Interface Detection (Wi-Fi/Ethernet)
  useEffect(() => {
    const updateNetworkInfo = () => {
      const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      if (!conn) {
        setNetworkInfo(null);
        return;
      }

      const type = conn.type || "unknown";
      const effectiveType = conn.effectiveType || "unknown";
      
      let recommendation = "";
      if (type === "wifi") {
        recommendation = "Você está via Wi-Fi. Recomendamos usar cabo Ethernet para controle vMix profissional com menor latência.";
      } else if (type === "cellular") {
        recommendation = "Rede móvel (3G/4G/5G) detectada. Recomendamos Wi-Fi ou Ethernet para estabilidade no controle.";
      } else if (type === "ethernet") {
        recommendation = "Conexão via cabo detectada. Excelente escolha para estabilidade e performance no vMix.";
      } else if (type === "other" || type === "unknown") {
        recommendation = "Tipo de conexão não identificado. Para melhor experiência, priorize o uso de cabos.";
      }

      setNetworkInfo({ type, effectiveType, recommendation });
    };

    updateNetworkInfo();
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (conn && conn.addEventListener) {
      conn.addEventListener('change', updateNetworkInfo);
      return () => conn.removeEventListener('change', updateNetworkInfo);
    }
  }, []);

  const [connectionMode, setConnectionMode] = useState<"direct" | "proxy">(() => {
    try { return (localStorage.getItem("vmix_conn_mode") as "direct" | "proxy") || "direct"; }
    catch { return "direct"; }
  });

  // Automatic mode switching based on network detection
  useEffect(() => {
    if (!savedUrl) return;
    
    const isLocal = isPrivateIp(savedUrl);
    
    // We check the condition but we only want to auto-switch when the network context changes
    if (isLocal && lanStatus === "same_lan") {
      setConnectionMode(prev => {
        if (prev === "proxy") {
          toast({ 
            title: "Modo Automático", 
            description: "Rede local detectada. Alternado para modo Direto." 
          });
          return "direct";
        }
        return prev;
      });
    } else if (!isLocal && savedUrl) {
      setConnectionMode(prev => {
        if (prev === "direct") {
          toast({ 
            title: "Modo Automático", 
            description: "IP Público detectado. Alternado para modo Proxy." 
          });
          return "proxy";
        }
        return prev;
      });
    }
  }, [lanStatus, savedUrl, toast]); 


  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [inputs, setInputs] = useState<VmixInput[]>([]);
  const [reloadingInputs, setReloadingInputs] = useState(false);
  const [reloadFallback, setReloadFallback] = useState<string | null>(null);
  const [activeInput, setActiveInput] = useState<string | null>(null);
  const [previewInput, setPreviewInput] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [overlays, setOverlays] = useState<Record<number, boolean>>({ 1: false, 2: false, 3: false, 4: false });
  const [transitionStyle, setTransitionStyle] = useState<string>(() => localStorage.getItem("vmix_transition_style") || "Fade");
  const [transitionDuration, setTransitionDuration] = useState<number>(() => Number(localStorage.getItem("vmix_transition_duration") || 1000));
  const [minimizedInputs, setMinimizedInputs] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"controls" | "ndi" | "scenes">("controls");
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
  const [monitorsCollapsed, setMonitorsCollapsed] = useState(false);
  const [showStudioSelector, setShowStudioSelector] = useState(false);

  // Command log panel
  interface VmixLogEntry { id: number; time: string; command: string; status: "ok" | "error" | "pending"; detail: string; source: "local" | "server" | "scheduler"; }
  const logIdRef = useRef(0);
  const [vmixLogs, setVmixLogs] = useState<VmixLogEntry[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const addLog = useCallback((command: string, status: "ok" | "error" | "pending", detail: string, source: "local" | "server" | "scheduler" = "local") => {
    const entry: VmixLogEntry = { id: ++logIdRef.current, time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }), command, status, detail, source };
    setVmixLogs(prev => [entry, ...prev].slice(0, 200));
  }, []);

  const applyVmixState = useCallback((vmixState: ReturnType<typeof parseVmixXml>) => {
    setInputs(vmixState.inputs);
    if (vmixState.active) setActiveInput(vmixState.active);
    if (vmixState.preview) setPreviewInput(vmixState.preview);
    if (vmixState.streaming) setStreaming(/true/i.test(vmixState.streaming));
    if (vmixState.recording) setRecording(/true/i.test(vmixState.recording));
    if (Object.keys(vmixState.overlays).length > 0) setOverlays(prev => ({ ...prev, ...vmixState.overlays }));
  }, []);

  const persistVmixSnapshot = useCallback(async (vmixState: ReturnType<typeof parseVmixXml>) => {
    if (!selectedConnectionId) return;
    const ndiSnapshot = vmixState.inputs.filter(isNdiInput).map(inp => ({
      key: inp.key,
      number: inp.number,
      title: inp.title,
      type: inp.type,
      state: inp.state,
    }));

    await (supabase.from("vmix_connections" as any) as any)
      .update({
        last_inputs: vmixState.inputs as any,
        last_state: {
          active: vmixState.active,
          preview: vmixState.preview,
          streaming: vmixState.streaming,
          recording: vmixState.recording,
          overlays: vmixState.overlays,
        },
        ndi_sources: ndiSnapshot as any,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", selectedConnectionId);
  }, [selectedConnectionId]);

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
  const [manualNdiHost, setManualNdiHost] = useState("");

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

  // Input mapping for name-based fallback (key -> title and title -> key)
  const [inputMapping, setInputMapping] = useState<Record<string, { title: string; key: string }>>(() => {
    try {
      const saved = localStorage.getItem("vmix_input_mapping");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  
  const connectToVmixRef = useRef<((isAutoConnect?: boolean) => Promise<void>) | null>(null);
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

  const effectiveConnected = connected || forcedConnected;

  useEffect(() => {
    if (connected && !forcedConnected) {
      navigate("/vmix-control/switcher");
    }
  }, [connected, forcedConnected, navigate]);
  
  const loadProgramas = useCallback(async () => {
    if (!user) return;
    
    // Fetch all programs for the user
    // We removed the strict .eq("ativo", true) here to ensure we get data,
    // we will filter by activity status in the UI if needed.
    let query = supabase
      .from("programas")
      .select("id, nome, ativo, horario_inicio, horario_fim, dias_semana, estudio, apresentadores(id, nome, foto)")
      .eq("user_id", user.id);
    
    const { data, error } = await query.order("horario_inicio");
    
    if (error) {
      console.error("Error loading programs:", error);
      return;
    }

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
            if (bi === -1) return -1;
            return ai - bi;
          });
        }
      } catch {}
      setProgramas(mapped);
    }
  }, [user]);

  // Initial load effect
  useEffect(() => {
    if (user) {
      loadProgramas();
    }
  }, [user, loadProgramas]);

  // Estúdios únicos cadastrados na Grade de Programação
  const estudiosDisponiveis = useMemo(
    () => Array.from(new Set(programas.map(p => (p.estudio || "").trim()).filter(Boolean))).sort(),
    [programas],
  );

  // Load custom buttons (escopo estrito: apenas botões do estúdio selecionado)
  const loadCustomButtons = useCallback(async () => {
    if (!user) return;
    let query = (supabase.from("custom_vmix_buttons" as any) as any)
      .select("*")
      .eq("user_id", user.id);

    const { data } = await query.order("created_at");
    if (data) {
      setCustomButtons((data as any[]).filter(b => matchesStudio(b.estudio, studioName)));
    }
  }, [user, studioName]);

  useEffect(() => { loadCustomButtons(); }, [loadCustomButtons]);

  useEffect(() => {
    if (!user) return;
    const loadSettings = async () => {
      // Load global shortcuts and input mapping
      const { data: settings } = await supabase
        .from("user_settings")
        .select("vmix_shortcuts, vmix_input_mapping")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (settings?.vmix_shortcuts && typeof settings.vmix_shortcuts === "object") {
        setInputShortcuts(settings.vmix_shortcuts as Record<string, string>);
      }

      if (settings?.vmix_input_mapping && typeof settings.vmix_input_mapping === "object") {
        const mapping = settings.vmix_input_mapping as Record<string, { title: string; key: string }>;
        setInputMapping(prev => ({ ...prev, ...mapping }));
      }

      // Load all connections
      const { data: connections } = await (supabase.from("vmix_connections" as any) as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (connections && connections.length > 0) {
        setVmixConnections(connections);
        
        // Prefer last-active connection from localStorage, then is_default, then most recent
        let lastActiveId: string | null = null;
        try { lastActiveId = localStorage.getItem(`vmix_active_conn_${user.id}`); } catch {}
        const def =
          (lastActiveId && (connections as any[]).find((c: any) => c.id === lastActiveId)) ||
          (connections as any[]).find((c: any) => c.is_default) ||
          connections[0];
        setSelectedConnectionId(def.id);
        setVmixUrl(def.url);
        setSavedUrl(def.url);
        setVmixUser(def.username || "");
        setVmixPass(def.password || "");
        setStudioName(def.name);
        if (Array.isArray(def.last_inputs) && def.last_inputs.length > 0) {
          setInputs(def.last_inputs as VmixInput[]);
          if (def.last_state?.active) setActiveInput(def.last_state.active);
          if (def.last_state?.preview) setPreviewInput(def.last_state.preview);
          if (Array.isArray(def.ndi_sources)) setNdiSources(def.ndi_sources.map((src: any) => src.title || src.name || String(src)).filter(Boolean));
        }
        
        setLoading(false);
        
        // Auto-connect if it was connected before reload
        const lastConnectedId = localStorage.getItem(`vmix_last_connected_${user.id}`);
        if (lastConnectedId === def.id) {
          setTimeout(() => {
            connectToVmixRef.current?.(true);
          }, 800);
        }
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

  // Persist the active connection so it auto-applies on every future visit
  const persistActiveConnection = useCallback(async (connId: string) => {
    if (!user || !connId) return;
    try { 
      localStorage.setItem(`vmix_active_conn_${user.id}`, connId);
      // Mark this as truly "connected" so we can auto-connect on reload
      localStorage.setItem(`vmix_last_connected_${user.id}`, connId);
    } catch {}
    try {
      await (supabase.from("vmix_connections" as any) as any)
        .update({ is_default: false })
        .eq("user_id", user.id)
        .neq("id", connId);
      await (supabase.from("vmix_connections" as any) as any)
        .update({ is_default: true })
        .eq("id", connId);
    } catch {}
  }, [user]);

  const handleSelectConnection = (conn: any) => {
    setSelectedConnectionId(conn.id);
    setVmixUrl(conn.url);
    setSavedUrl(conn.url);
    setVmixUser(conn.username || "");
    setVmixPass(conn.password || "");
    setStudioName(conn.name);
    if (Array.isArray(conn.last_inputs) && conn.last_inputs.length > 0) {
      setInputs(conn.last_inputs as VmixInput[]);
      if (conn.last_state?.active) setActiveInput(conn.last_state.active);
      if (conn.last_state?.preview) setPreviewInput(conn.last_state.preview);
      if (Array.isArray(conn.ndi_sources)) setNdiSources(conn.ndi_sources.map((src: any) => src.title || src.name || String(src)).filter(Boolean));
    }
    setConnected(false);
    persistActiveConnection(conn.id);
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

    let savedConn;
    if (selectedConnectionId) {
      const { data } = await (supabase.from("vmix_connections" as any) as any)
        .update(payload)
        .eq("id", selectedConnectionId)
        .select()
        .single();
      savedConn = data;
    } else {
      const { data } = await (supabase.from("vmix_connections" as any) as any)
        .insert(payload)
        .select()
        .single();
      savedConn = data;
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
    return savedConn;
  };

  const deleteConnection = async (id: string) => {
    if (!user || !id) return;
    const { error } = await (supabase.from("vmix_connections" as any) as any)
      .delete()
      .eq("id", id);
    
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Conexão excluída" });
      loadConnections();
      if (selectedConnectionId === id) {
        setSelectedConnectionId(null);
        setVmixUrl("");
        setSavedUrl("");
        setStudioName("");
      }
    }
  };


  useEffect(() => {
    directBaseUrlRef.current = null;
    loopbackFallbackNotifiedRef.current = false;
  }, [savedUrl]);

  // Direct fetch to vMix (browser → vMix, no edge function)
  const vmixDirectFetch = useCallback(async (path: string): Promise<string> => {
    if (!savedUrl) throw new Error("URL não configurada");
    const configuredBaseUrl = normalizeVmixBaseUrl(savedUrl);
    const candidateBaseUrls = Array.from(new Set([
      directBaseUrlRef.current,
      configuredBaseUrl,
      ...(isPrivateIp(savedUrl) && !isLoopbackUrl(savedUrl) ? buildLoopbackFallbackUrls(savedUrl) : []),
    ].filter(Boolean) as string[]));

    const headers: Record<string, string> = {
      "Accept": "application/xml, text/xml, text/html, */*",
    };
    if (vmixUser) {
      headers["Authorization"] = `Basic ${btoa(`${vmixUser}:${vmixPass || ""}`)}`;
    }

    // Client-side retry loop instead of a single long AbortSignal — network hiccups
    // and vMix not-yet-ready both surface as short failures, not a 10s hang.
    const MAX_ATTEMPTS = 3;
    const PER_ATTEMPT_MS = 6000;
    let lastErr: unknown = null;
    let skippedMixedContent = false;

    for (const baseUrl of candidateBaseUrls) {
      const targetUrl = baseUrl + path;

      // HTTPS pages cannot fetch HTTP LAN IPs. Loopback is tried as an automatic
      // local fallback because Chrome treats localhost/127.0.0.1 as trustworthy.
      if (isMixedContentBlockedByPage(targetUrl)) {
        skippedMixedContent = true;
        lastErr = new Error("Mixed Content bloqueado para IP LAN HTTP");
        continue;
      }

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PER_ATTEMPT_MS);
        try {
          const response = await fetch(targetUrl, {
            method: "GET",
            headers,
            mode: "cors",
            cache: "no-store",
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (!response.ok && response.status === 401) {
            throw new Error("Autenticação vMix falhou (401). Verifique usuário/senha do Web Controller.");
          }
          directBaseUrlRef.current = baseUrl;
          if (baseUrl !== configuredBaseUrl && !loopbackFallbackNotifiedRef.current) {
            loopbackFallbackNotifiedRef.current = true;
            toast({
              title: "vMix local conectado",
              description: "O modo Direto usou localhost para evitar o bloqueio HTTPS → HTTP.",
            });
          }
          return await response.text();
        } catch (err) {
          clearTimeout(timer);
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          const isAbort = err instanceof DOMException && err.name === "AbortError";
          const isNet = /Failed to fetch|NetworkError|network/i.test(msg);
          // Don't retry on auth or fatal errors for this target.
          if (/401|Autenticação/.test(msg)) throw err;
          // Retry only on transient network/timeout errors.
          if (!isAbort && !isNet) break;
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 400 * attempt));
          }
        }
      }
    }

    if (skippedMixedContent) {
      throw new Error(
        "Mixed Content bloqueado: o painel está em HTTPS e o vMix em HTTP em outro IP da rede. " +
        "Se o vMix estiver neste mesmo computador, deixe o app usar localhost/127.0.0.1. " +
        "Se estiver em outro PC, use um túnel HTTPS/IP público com Proxy — navegadores não permitem HTTPS → HTTP LAN."
      );
    }

    // Produce a specific, actionable error instead of "signal timed out"
    const finalMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    if (lastErr instanceof DOMException && lastErr.name === "AbortError") {
      throw new Error(
        "Sem resposta do vMix em modo Direto. Verifique: (1) vMix aberto com Web Controller habilitado na porta 8088; " +
        "(2) IP e porta corretos; (3) firewall do Windows permitindo entrada na porta 8088; (4) navegador na mesma rede do vMix."
      );
    }
    if (/Failed to fetch|NetworkError/i.test(finalMsg)) {
      throw new Error(
        "Não foi possível alcançar o vMix (rede inacessível ou Mixed Content). Confirme IP/porta, mesma rede LAN, e se o painel está em HTTP quando o vMix é HTTP."
      );
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }, [savedUrl, vmixUser, vmixPass, toast]);

  // Proxy fetch via Edge Function (browser → cloud → vMix)
  const vmixProxyFetch = useCallback(async (path: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke("vmix-proxy", {
      body: { path, connectionId: selectedConnectionId },
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
    if (data instanceof Blob) return await data.text();
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
    return typeof data === "object" ? JSON.stringify(data) : String(data);
  }, [selectedConnectionId]);

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
      parseVmixXml(text);
      result.directResult = "ok";
    } catch (e) {
      result.directResult = "fail";
      const msg = e instanceof Error ? e.message : String(e);
      result.directError = msg;
      if (/failed to fetch|networkerror|load failed|mixed content/i.test(msg)) {
        if (secureCtx && protocol === "http") {
          result.mixedContentBlocked = true;
          result.directError = "HTTPS bloqueou HTTP do vMix; localhost foi testado automaticamente.";
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
        parseVmixXml(text);
        result.proxyResult = "ok";
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
        ? "⚠️ O preview interno bloqueia HTTP local. Abra o app publicado em nova aba; se o vMix estiver neste PC, use localhost:8088."
        : "⚠️ O navegador bloqueia HTTPS → HTTP em IP LAN. Se o vMix está neste PC, use localhost:8088/127.0.0.1:8088. Se está em outro PC, use túnel HTTPS/IP público + Proxy ou permita 'Conteúdo inseguro' no site.";
      if (!isEmbeddedPreview && result.directResult === "fail") {
      }
    } else if (isLocal) {
      result.recommendation = "⚠️ IP local detectado. O modo Proxy (nuvem) não funciona com IPs locais. 1) Verifique se o vMix está aberto e o Web Controller ativo na porta 8088; 2) Se você estiver no preview do Lovable, abra /vmix-control em uma nova aba para permitir a conexão direta local.";
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

  const connectToVmix = useCallback(async (isAutoConnect = false) => {
    if (!savedUrl) return;

    const isLocal = isPrivateIp(savedUrl);
    const isEmbeddedPreview = window.self !== window.top;
    const effectiveMode = connectionMode;

    // In the embedded preview iframe, mixed content blocks HTTP to local IPs.
    // Open a real tab so the user can connect there — it will land straight on the Nexo Control panel.
    if (isEmbeddedPreview && isLocal) {
      window.open("/vmix-control", "_blank", "noopener,noreferrer");
      toast({
        title: "Abrindo em nova aba",
        description: "O preview interno bloqueia HTTP local. A conexão será feita na nova aba e você já cai direto no painel do Nexo Control.",
      });
      return;
    }

    if (effectiveMode === "proxy" && isLocal) {
      setConnected(false);
      setConnectionMode("direct");
      toast({
        title: "IP Local detectado",
        description: "IP local não é acessível pelo proxy em nuvem. Mudamos para o modo Direto automaticamente.",
        variant: "destructive",
      });
      return;
    }

    setConnecting(true);
    try {
      const xmlText = await vmixFetch("/api/", effectiveMode);
      const vmixState = parseVmixXml(xmlText);
      const parsedInputs = vmixState.inputs;
      applyVmixState(vmixState);
      persistVmixSnapshot(vmixState);

      setConnected(true);
      if (selectedConnectionId) {
        persistActiveConnection(selectedConnectionId);
        localStorage.setItem(`vmix_last_connected_${user.id}`, selectedConnectionId);
      }
      
      // Auto-navigate to main Nexo Control panel (switcher) once connected
      setActiveTab("controls");
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
      const inputCount = parsedInputs.length;
      if (!isAutoConnect) {
        toast({ title: "Conectado!", description: `${inputCount} inputs detectados no vMix.` });
      }

      // Auto-reload inputs + NDI sources with retry/fallback
      setTimeout(() => reloadInputsAndSources(), 400);
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
          ? " O preview interno bloqueia HTTP local. Abra o app em nova aba; se o vMix estiver neste PC, use localhost:8088."
          : " Se o vMix está neste PC, salve como localhost:8088. Se está em outro PC da LAN, o navegador só libera com túnel HTTPS ou permissão manual de conteúdo inseguro.")
        : effectiveMode === "direct" && !isLocal
        ? " IP público detectado — tente o modo 'Proxy'."
        : "";

      toast({ title: "Erro de conexão", description: `${message}${hint}`, variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  }, [savedUrl, toast, vmixFetch, connectionMode, applyVmixState, persistVmixSnapshot, selectedConnectionId, persistActiveConnection]);

  // Keep ref in sync for diagnostic auto-connect
  useEffect(() => { connectToVmixRef.current = connectToVmix; }, [connectToVmix]);

  // ── Keepalive polling — silently refresh vMix state every 5s ──
  const silentRefresh = useCallback(async () => {
    if (!savedUrl) return;
    try {
      const xmlText = await vmixFetch("/api/");
      const vmixState = parseVmixXml(xmlText);
      applyVmixState(vmixState);
      persistVmixSnapshot(vmixState);
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
  }, [savedUrl, vmixFetch, applyVmixState, persistVmixSnapshot]);

  // Update input mapping whenever inputs change
  useEffect(() => {
    if (inputs.length === 0) return;
    
    setInputMapping(prev => {
      const next = { ...prev };
      let changed = false;
      
      inputs.forEach(inp => {
        // Map key to its title
        if (next[inp.key]?.title !== inp.title) {
          next[inp.key] = { title: inp.title, key: inp.key };
          changed = true;
        }
        // Also ensure title maps to key for reverse lookup
        // We use a special prefix for title lookups or just keep it separate
        // For simplicity, we just ensure every key we currently have is up to date
      });
      
      if (changed) {
        localStorage.setItem("vmix_input_mapping", JSON.stringify(next));
        // Also persist to DB
        if (user) {
          supabase.from("user_settings")
            .update({ vmix_input_mapping: next as any })
            .eq("user_id", user.id)
            .then(({ error }) => {
              if (error) console.error("Error saving input mapping to DB:", error);
            });
        }
        return next;
      }
      return prev;
    });
  }, [inputs, user]);

  useEffect(() => {
    if (!savedUrl) return;
    
    const pollInterval = connected ? 5000 : 20000;
    const id = setInterval(() => {
      silentRefresh();
    }, pollInterval);
    
    return () => clearInterval(id);
  }, [connected, savedUrl, silentRefresh]);

  const resolveInputKey = useCallback((inputKey: string | undefined): string | undefined => {
    if (!inputKey || !inputKey.includes("-")) return inputKey;
    const exists = inputs.some(i => i.key === inputKey);
    if (exists) return inputKey;
    
    const mapped = inputMapping[inputKey];
    if (mapped) {
      const fallback = inputs.find(i => i.title === mapped.title);
      if (fallback) {
        console.log(`Input ${inputKey} not found, falling back to ${fallback.title} (Key: ${fallback.key})`);
        return fallback.key;
      }
    }
    return inputKey;
  }, [inputs, inputMapping]);

  const sendCommand = async (fn: string, input?: string, value?: string) => {
    if (!savedUrl) return;

    const effectiveInput = resolveInputKey(input);

    const cmdLabel = `${fn}${effectiveInput ? ` Input=${effectiveInput}` : ""}${value ? ` Value=${value}` : ""}`;
    try {
      let path = `/api/?Function=${encodeURIComponent(fn)}`;
      if (effectiveInput) path += `&Input=${encodeURIComponent(effectiveInput)}`;
      if (value) path += `&Value=${encodeURIComponent(value)}`;
      
      const forceMode: "direct" | "proxy" | undefined = isPrivateIp(savedUrl) ? "direct" : undefined;
      await vmixFetch(path, forceMode);
      addLog(cmdLabel, "ok", "Enviado com sucesso", "local");
      
      // Refresh state after command
      setTimeout(() => silentRefresh(), 300);
    } catch (err: any) {
      addLog(cmdLabel, "error", err?.message || "Falha ao enviar", "local");
      toast({ title: "Erro", description: "Falha ao enviar comando.", variant: "destructive" });
    }
  };

  const normalizeCommands = useCallback((cmds: any[] = []) => {
    return cmds.filter((cmd) => cmd?.enabled !== false).map((cmd) => {
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
    const normalized = normalizeCommands(cmds).map(cmd => ({
      ...cmd,
      input: resolveInputKey(cmd.input)
    }));
    
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
      const res = await supabase.functions.invoke("execute-vmix-commands", { body: { commands: normalized, connectionId: selectedConnectionId } });
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
  }, [connectToVmix, normalizeCommands, sendCommand, toast, addLog, savedUrl, selectedConnectionId]);

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
  const detectedMachines = useMemo(() => extractNdiMachinesFromInputs(inputs), [inputs]);

  const scanNdiSources = useCallback(async (customHost?: string) => {
    if (!savedUrl || !connected) {
      setNdiSources([]);
      return;
    }

    setNdiScanning(true);
    try {
      // Build suggestions from current inputs AND manual host
      const machineList = new Set([...detectedMachines]);
      if (customHost) machineList.add(customHost);
      if (manualNdiHost) machineList.add(manualNdiHost);

      const uniqueSuggestions = buildNdiSuggestions(Array.from(machineList));
      setNdiSources(uniqueSuggestions);

      if (uniqueSuggestions.length === 0 && (customHost || manualNdiHost)) {
        toast({
          title: "Busca NDI",
          description: "Nenhuma fonte sugerida para este host. Verifique se o nome/IP está correto.",
        });
      }
    } catch {
      setNdiSources([]);
      toast({ title: "Erro", description: "Falha ao buscar fontes NDI.", variant: "destructive" });
    } finally {
      setNdiScanning(false);
    }
  }, [savedUrl, connected, detectedMachines, manualNdiHost, toast]);

  // NDI auto-scan removed (NDI tab removed)

  // Auto-reload inputs + NDI sources on connection with retry/fallback
  const reloadInputsAndSources = useCallback(async () => {
    if (!savedUrl) return;
    setReloadingInputs(true);
    setReloadFallback(null);
    const attempt = async () => {
      const xmlText = await vmixFetch("/api/", connectionMode);
      const vmixState = parseVmixXml(xmlText);
      applyVmixState(vmixState);
      persistVmixSnapshot(vmixState);
      return vmixState.inputs.length;
    };
    try {
      let count = 0;
      try {
        count = await attempt();
      } catch {
        await new Promise(r => setTimeout(r, 1200));
        count = await attempt();
      }
      // Scan NDI sources after inputs are up to date
      try { await scanNdiSources(); } catch {}
      if (count === 0) {
        setReloadFallback("Nenhum input encontrado — usando último snapshot salvo.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao recarregar inputs.";
      setReloadFallback(`${msg} Exibindo último snapshot salvo.`);
      toast({ title: "Recarga parcial", description: msg, variant: "destructive" });
    } finally {
      setReloadingInputs(false);
    }
  }, [savedUrl, vmixFetch, connectionMode, applyVmixState, persistVmixSnapshot, scanNdiSources, toast]);

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
  const isActuallyConnected = connected || forcedConnected || demoMode;


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




  // Atalhos dos botões personalizados
  const customButtonsRef = useRef<any[]>(customButtons);
  customButtonsRef.current = customButtons;
  const runCommandsRef = useRef(runCommandsUnified);
  runCommandsRef.current = runCommandsUnified;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const pressed = `${e.ctrlKey ? "Ctrl+" : ""}${e.altKey ? "Alt+" : ""}${e.shiftKey ? "Shift+" : ""}${e.key.toUpperCase()}`.toLowerCase();
      const btn = customButtonsRef.current.find((b: any) => (b?.shortcut || "").toLowerCase() === pressed);
      if (!btn) return;
      e.preventDefault();
      setActiveCustomButton(btn.id);
      if (Array.isArray(btn.commands) && btn.commands.length > 0) {
        void runCommandsRef.current(btn.commands as any[], `Efeito: ${btn.nome}`);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);




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
        // Note: we don't clear capturingShortcut here anymore because we'll use a dialog
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
  }, [isActuallyConnected, capturingShortcut]);

  // Group inputs for combo: regular inputs and NDI inputs
  const ndiInputs = useMemo(() => inputs.filter(isNdiInput), [inputs]);
  const regularInputs = useMemo(() => inputs.filter(i => !isNdiInput(i)), [inputs]);

  if (loading) return <ModulePageSkeleton />;

  const hasLocalHttpUrl = savedUrl && isPrivateIp(savedUrl) && isInsecureHttpUrl(savedUrl);
  const showNewTabBanner = isEmbeddedPreview && hasLocalHttpUrl && window.isSecureContext && !demoMode;

  const previewDomain = window.location.origin;

  // Helper: get input label with type indicator
  const inputLabel = (inp: VmixInput) => {
    const isNdi = isNdiInput(inp);
    return `${inp.number} – ${isNdi ? "🟢 " : ""}${inp.title}${isNdi ? " (NDI)" : ""}`;
  };

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

  // Render the select combo with all vMix inputs
  const renderInputSelect = (value: string | null, onChange: (val: string) => void) => (
    <select
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      className="flex-1 text-[10px] rounded px-2 py-1 border-none outline-none font-bold"
      style={{ backgroundColor: "#222228", color: "#ccc", border: "1px solid #333" }}
    >
      <option value="">— Selecione um Input —</option>
      {inputs.map(inp => {
        const isNdi = isNdiInput(inp);
        return (
          <option key={inp.key || inp.number} value={inp.number}>
            {isNdi ? "🟢 " : ""}{inp.number} – {inp.title}
          </option>
        );
      })}
      {inputs.length === 0 && (
        <option disabled>Nenhum input encontrado</option>
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
    const isNdi = inp && isNdiInput(inp);
    // If this input has an HLS/MJPEG URL configured, show the video player
    if (hlsUrl) {
      if (hlsUrl.includes(".m3u8")) {
        return <HlsPlayer src={hlsUrl} className={className} />;
      }
      return <MjpegPlayer src={hlsUrl} className={className} />;
    }

    // vMix already renders NDI inputs in its own MJPEG endpoint, so the control
    // panel can show NDI sources in motion without a separate HLS bridge.
    if (isNdi && savedUrl) {
      const ndiStreamUrl = `${normalizeVmixBaseUrl(savedUrl)}/mjpeg?Input=${encodeURIComponent(inputNumber)}`;
      if (!isMixedContentBlockedByPage(ndiStreamUrl)) {
        return <MjpegPlayer src={ndiStreamUrl} className={className} />;
      }
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
      <div className="w-full max-w-7xl mx-auto py-12 px-6 min-h-[90vh] flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-16 w-full">
          

          <div className="flex flex-wrap items-start justify-center gap-8 w-full">
            {/* NEW CONNECTION BUTTON */}
            <div className="flex flex-col gap-6 w-full max-w-[260px]">
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/20 ml-1">Nova Conexão</p>
              <button
                onClick={() => {
                  setSelectedConnectionId(null);
                  setVmixUrl("");
                  setStudioName("");
                  setVmixUser("");
                  setVmixPass("");
                  setShowStudioSelector(true);
                }}
                className="group relative aspect-square w-full rounded-[48px] bg-[#1a1a1a] border border-white/5 flex flex-col items-center justify-center gap-5 transition-all duration-500 hover:bg-[#222] hover:border-[#C6F03C]/30 hover:shadow-[0_40px_80px_rgba(0,0,0,0.6)] hover:-translate-y-2"
              >
                <div className="w-28 h-28 rounded-full bg-[#C6F03C]/5 flex items-center justify-center transition-all duration-500 group-hover:bg-[#C6F03C]/10 group-hover:scale-110">
                  <Plus size={44} className="text-[#C6F03C]" />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C6F03C]/60 group-hover:text-[#C6F03C] transition-colors">Adicionar</span>
                  <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/20">Configurar novo estúdio</span>
                </div>
                <div className="absolute inset-0 rounded-[48px] border-2 border-transparent group-hover:border-[#C6F03C]/10 transition-all" />
              </button>
            </div>

            {/* SAVED CONNECTIONS LIST */}
            {vmixConnections.map((conn) => (
              <div key={conn.id} className="flex flex-col gap-6 w-full max-w-[260px]">
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/20 ml-1">Estúdio Salvo</p>
                <div
                  className="group relative aspect-square rounded-[48px] bg-[#1a1a1a] border border-white/5 flex flex-col items-center justify-center gap-5 transition-all duration-500 hover:bg-[#222] hover:border-[#C6F03C]/30 hover:shadow-[0_40px_80px_rgba(0,0,0,0.6)] hover:-translate-y-2"
                >
                  <button
                    onClick={() => handleSelectConnection(conn)}
                    className="flex flex-col items-center justify-center gap-5 w-full h-full"
                  >
                    <div className="w-20 h-20 rounded-[32px] bg-white/5 flex items-center justify-center group-hover:bg-[#C6F03C]/10 transition-all duration-500 group-hover:scale-105">
                      <Monitor size={32} className="text-white/20 group-hover:text-[#C6F03C] transition-colors" />
                    </div>
                    <div className="flex flex-col items-center gap-1 px-6">
                      <span className="text-sm font-black text-white/80 group-hover:text-white uppercase tracking-widest text-center truncate w-full">{conn.name}</span>
                      <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">{conn.url.replace(/^https?:\/\//, "")}</span>
                    </div>
                  </button>

                  <div className="absolute top-8 right-8 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-2 group-hover:translate-y-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedConnectionId(conn.id);
                        setVmixUrl(conn.url);
                        setStudioName(conn.name);
                        setVmixUser(conn.username || "");
                        setVmixPass(conn.password || "");
                        setShowStudioSelector(true);
                      }}
                      className="w-10 h-10 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center hover:bg-white/10 transition-all text-white/40 hover:text-white hover:scale-110 active:scale-95"
                      title="Editar"
                    >
                      <Wand2 size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConnection(conn.id);
                      }}
                      className="w-10 h-10 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center hover:bg-red-500/20 transition-all text-white/40 hover:text-red-500 hover:scale-110 active:scale-95"
                      title="Excluir"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {vmixConnections.length === 0 && (
              <div className="flex flex-col gap-6 opacity-40 w-full max-w-[260px]">
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/20 ml-1">Vazio</p>
                <div className="aspect-square w-full rounded-[48px] bg-[#1a1a1a]/50 border border-dashed border-white/10 flex flex-col items-center justify-center gap-4">
                  <Monitor size={40} className="text-white/5" />
                  <p className="text-[10px] text-white/20 uppercase font-black tracking-widest">Nenhuma conexão salva</p>
                </div>
              </div>
            )}
          </div>

        </div>

        <div className="mt-20 pt-10 border-t border-white/5 flex flex-col items-center justify-center gap-6">
          <p className="text-[10px] text-white/10 uppercase font-black tracking-[0.4em]">Desenvolvido por Nexo Brasil - Soluções Visuais</p>
        </div>

        {/* CONNECTION MODAL */}
        <Dialog open={showStudioSelector} onOpenChange={setShowStudioSelector}>

          <DialogContent className="bg-[#1a1a1f] border-white/10 text-white sm:max-w-md rounded-3xl p-0 overflow-hidden">
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-black uppercase tracking-tight text-[#C6F03C]">Configurar Conexão</h2>
                <p className="text-xs text-white/40 leading-relaxed">Os estúdios listados são os cadastrados na Grade de Programação.</p>
              </div>

              <div className="space-y-5">
                {/* Studio Name Select — dinâmico a partir da Grade de Programação */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Estúdio</label>
                  {estudiosDisponiveis.length === 0 ? (
                    <p className="px-5 py-4 rounded-2xl bg-white/5 border border-dashed border-white/10 text-[11px] text-white/40">
                      Nenhum estúdio cadastrado na Grade de Programação.
                    </p>
                  ) : (
                    <select
                      value={studioName}
                      onChange={e => setStudioName(e.target.value)}
                      className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-sm font-medium outline-none focus:border-[#C6F03C]/50 transition-all appearance-none"
                    >
                      <option value="" className="bg-[#1a1a1f]">Selecione um estúdio</option>
                      {estudiosDisponiveis.map(estudio => (
                        <option key={estudio} value={estudio} className="bg-[#1a1a1f]">{estudio}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* URL Parts */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Endereço do vMix</label>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-4">
                      <select
                        value={parseVmixUrlParts(vmixUrl).protocol}
                        onChange={e => {
                          const parts = parseVmixUrlParts(vmixUrl);
                          setVmixUrl(composeVmixUrl(e.target.value as "http" | "https", parts.host, parts.port));
                        }}
                        className="w-full px-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-sm font-mono outline-none focus:border-[#C6F03C]/50 transition-all appearance-none"
                      >
                        <option value="http" className="bg-[#1a1a1f]">http</option>
                        <option value="https" className="bg-[#1a1a1f]">https</option>
                      </select>
                    </div>
                    <div className="col-span-8">
                      <input
                        type="text"
                        value={parseVmixUrlParts(vmixUrl).host}
                        onChange={e => {
                          const parts = parseVmixUrlParts(vmixUrl);
                          setVmixUrl(composeVmixUrl(parts.protocol, e.target.value.trim(), parts.port));
                        }}
                        placeholder="IP ou Host"
                        className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-sm font-mono outline-none focus:border-[#C6F03C]/50 transition-all placeholder:text-white/10"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Porta</label>
                    <input
                      type="text"
                      value={parseVmixUrlParts(vmixUrl).port}
                      onChange={e => {
                        const parts = parseVmixUrlParts(vmixUrl);
                        setVmixUrl(composeVmixUrl(parts.protocol, parts.host, e.target.value.replace(/\D/g, "").slice(0, 5)));
                      }}
                      placeholder="8088"
                      className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-sm font-mono outline-none focus:border-[#C6F03C]/50 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Modo</label>
                    <div className="flex h-[54px] p-1.5 rounded-2xl bg-white/5 border border-white/10">
                      <button
                        onClick={() => setConnectionMode("direct")}
                        className={`flex-1 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${connectionMode === "direct" ? "bg-[#C6F03C] text-black" : "text-white/40 hover:text-white"}`}
                      >
                        Direto
                      </button>
                      <button
                        onClick={() => setConnectionMode("proxy")}
                        className={`flex-1 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${connectionMode === "proxy" ? "bg-[#C6F03C] text-black" : "text-white/40 hover:text-white"}`}
                      >
                        Proxy
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-3">
                <button
                  onClick={async () => {
                    await saveUrl();
                    setShowStudioSelector(false);
                    connectToVmix();
                  }}
                  className="w-full py-5 rounded-2xl bg-[#C6F03C] text-black text-xs font-black uppercase tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_10px_30px_rgba(198,240,60,0.2)]"
                >
                  Conectar ao Estúdio
                </button>
                <button
                  onClick={() => setShowStudioSelector(false)}
                  className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <SwitcherUI
      inputs={inputs}
      activeInput={activeInput}
      previewInput={previewInput}
      connectionMode={connectionMode}
      savedUrl={savedUrl}
      vmixUser={vmixUser}
      vmixPass={vmixPass}
      connecting={connecting}
      connected={connected}
      logoMixControl={logoMixControl}
      studioName={studioName}
      selectedConnectionId={selectedConnectionId}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      streaming={streaming}
      recording={recording}
      overlays={overlays}

      setStreaming={setStreaming}
      setRecording={setRecording}
      setOverlays={setOverlays}
      transitionStyle={transitionStyle}
      setTransitionStyle={setTransitionStyle}
      transitionDuration={transitionDuration}
      setTransitionDuration={setTransitionDuration}
      sendCommand={sendCommand}
      setLogsOpen={setLogsOpen}
      vmixLogs={vmixLogs}
      logsOpen={logsOpen}
      connectToVmix={connectToVmix}
      vmixUrl={vmixUrl}
      setVmixUrl={setVmixUrl}
      setConnected={setConnected}
      setSelectedConnectionId={setSelectedConnectionId}
      setStudioName={setStudioName}
      setSavedUrl={setSavedUrl}
      setShowStudioSelector={setShowStudioSelector}
      effectiveConnected={effectiveConnected}
      runDiagnostic={runDiagnostic}
      diagRunning={diagRunning}
      monitorsCollapsed={monitorsCollapsed}
      setMonitorsCollapsed={setMonitorsCollapsed}
      renderInputSelect={renderInputSelect}
      setPreviewInput={setPreviewInput}
      setActiveInput={setActiveInput}
      setMonitorStreamUrls={setMonitorStreamUrls}
      setMonitorIframeMode={setMonitorIframeMode}
      toast={toast}
      monitorStreamUrls={monitorStreamUrls}
      monitorIframeMode={monitorIframeMode}
      setEditingMonitorStream={setEditingMonitorStream}
      editingMonitorStream={editingMonitorStream}
      setMonitorStreamTemp={setMonitorStreamTemp}
      monitorStreamTemp={monitorStreamTemp}
      getMonitorContent={getMonitorContent}
      ndiSources={ndiSources}
      addNdiInput={addNdiInput}
      reloadingInputs={reloadingInputs}
      reloadFallback={reloadFallback}
      reloadInputsAndSources={reloadInputsAndSources}
      inputShortcuts={inputShortcuts}
      setInputShortcuts={setInputShortcuts}
      capturingShortcut={capturingShortcut}
      setCapturingShortcut={setCapturingShortcut}
      manualNdiHost={manualNdiHost}
      setManualNdiHost={setManualNdiHost}
      ThumbnailImg={ThumbnailImg}
      ndiUrl={ndiUrl}
      setNdiUrl={setNdiUrl}
      programas={programas}
      setProgramas={setProgramas}
      currentTime={currentTime}
      activePreset={activePreset}
      setActivePreset={setActivePreset}
      editingPresetId={editingPresetId}
      setEditingPresetId={setEditingPresetId}
      dragPresetIdx={dragPresetIdx}
      setDragPresetIdx={setDragPresetIdx}
      customButtons={customButtons}
      setCustomButtons={setCustomButtons}
      editingCustomButtonId={editingCustomButtonId}
      setEditingCustomButtonId={setEditingCustomButtonId}
      activeCustomButton={activeCustomButton}
      setActiveCustomButton={setActiveCustomButton}
      user={user}
      runCommandsUnified={runCommandsUnified}
      loadProgramas={loadProgramas}
      loadCustomButtons={loadCustomButtons}
      setVmixLogs={setVmixLogs}
      ndiScanning={ndiScanning}
      scanNdiSources={scanNdiSources}
      ndiInputs={ndiInputs}
      inputMapping={inputMapping}
      navigate={navigate}
    />
  );
}



// Actual Switcher UI (used when effectiveConnected)
function SwitcherUI({ 
  inputs, activeInput, previewInput, connectionMode, savedUrl, vmixUser, vmixPass,
  connecting, connected, logoMixControl, studioName, selectedConnectionId,
  activeTab, setActiveTab, streaming, recording, overlays,
  setStreaming, setRecording, setOverlays, transitionStyle, setTransitionStyle,
  transitionDuration, setTransitionDuration, sendCommand, setLogsOpen, 
  vmixLogs, logsOpen, connectToVmix, vmixUrl, setVmixUrl, setConnected, 
  setSelectedConnectionId, setStudioName, setSavedUrl, setShowStudioSelector, effectiveConnected,
  runDiagnostic, diagRunning, monitorsCollapsed, setMonitorsCollapsed, renderInputSelect,
  setPreviewInput, setActiveInput, setMonitorStreamUrls, setMonitorIframeMode, toast,
  monitorStreamUrls, monitorIframeMode, setEditingMonitorStream, editingMonitorStream,
  setMonitorStreamTemp, monitorStreamTemp, getMonitorContent, ndiSources, addNdiInput,
  reloadingInputs, reloadFallback, reloadInputsAndSources, inputShortcuts, setInputShortcuts,
  capturingShortcut, setCapturingShortcut, manualNdiHost, setManualNdiHost, ThumbnailImg,
  ndiUrl, setNdiUrl, programas, setProgramas, activePreset, setActivePreset,
  editingPresetId, setEditingPresetId, dragPresetIdx, setDragPresetIdx,
  customButtons, setCustomButtons, editingCustomButtonId, setEditingCustomButtonId,
  activeCustomButton, setActiveCustomButton, user, runCommandsUnified,
  loadProgramas, loadCustomButtons, setVmixLogs, ndiScanning, scanNdiSources,
  ndiInputs, inputMapping,
  navigate,
  currentTime
}: any) {

  // Relógio de 1s — alimenta o contador regressivo dos programas no ar
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // ── Connected layout ──
  const activeInputObj = inputs.find((i: any) => i.number === activeInput);


  // Categorias do switcher (por usuário + estúdio), com drag and drop
  const {
    categorias: switcherCategorias,
    criar: criarCategoria,
    excluir: excluirCategoria,
    moverInput: moverInputCategoria,
    removerInput: removerInputCategoria,
    categorizados: inputsCategorizados,
  } = useVmixCategories(user?.id, studioName);
  const inputsSemCategoria = (inputs as any[]).filter((i: any) => !inputsCategorizados.has(i.number));

  const previewInputObj = inputs.find(i => i.number === previewInput);

  // Filter program based on current time and weekday
  const currentProgram = useMemo(() => {
    if (!programas || programas.length === 0) return null;
    
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const currentDay = now.getDay(); // 0-6 (Sun-Sat)
    
    // Convert day number to string if necessary based on your DB storage (e.g. 1, 2, 3...)
    const dayMap: Record<number, string> = {
      0: "domingo", 1: "segunda", 2: "terça", 3: "quarta", 
      4: "quinta", 5: "sexta", 6: "sábado"
    };
    const dayName = dayMap[currentDay];

    return programas.find(p => {
      if (!p.horario_inicio || !p.horario_fim) return false;
      
      const [hStart, mStart] = p.horario_inicio.split(':').map(Number);
      const [hEnd, mEnd] = p.horario_fim.split(':').map(Number);
      
      const startTotal = hStart * 60 + mStart;
      let endTotal = hEnd * 60 + mEnd;
      
      // Handle programs that end after midnight
      if (endTotal <= startTotal) endTotal += 1440;
      
      let timeMatch = currentTime >= startTotal && currentTime < endTotal;
      
      // Check if current time is in the early morning part of a program that started yesterday
      if (!timeMatch && currentTime < endTotal - 1440) {
        timeMatch = true;
      }

      if (!timeMatch) return false;

      // Filter by weekday if present
      if (p.dias_semana && p.dias_semana.length > 0) {
        return p.dias_semana.some(d => 
          d?.toLowerCase() === dayName || 
          d === String(currentDay) ||
          (currentDay === 0 && d?.toLowerCase().includes("dom")) ||
          (currentDay === 6 && d?.toLowerCase().includes("sab"))
        );
      }
      
      return true;
    });
  }, [programas]);

  // Próximo programa da grade (tolerante a acentos/formatos e com wrap para o próximo ciclo)
  const nextProgram = useMemo(() => {
    if (!programas || programas.length === 0) return null;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const norm = (s?: string | null) =>
      (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const daysShort = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    const todayShort = daysShort[now.getDay()];
    const matchesToday = (p: any) => {
      if (!p.dias_semana || p.dias_semana.length === 0) return true;
      return p.dias_semana.some((d: string) => {
        const n = norm(d);
        return n.startsWith(todayShort) || n === String(now.getDay());
      });
    };
    const withStart = programas
      .filter((p: any) => p.horario_inicio && p.id !== currentProgram?.id && matchesToday(p))
      .map((p: any) => {
        const [h, m] = String(p.horario_inicio).split(":").map(Number);
        return { p, start: (h || 0) * 60 + (m || 0) };
      })
      .sort((a: any, b: any) => a.start - b.start);
    if (withStart.length === 0) return null;
    const upcoming = withStart.find((x: any) => x.start > nowMin);
    return (upcoming || withStart[0]).p;
  }, [programas, currentProgram]);




  const tabs = [
    { key: "controls" as const, label: "Switcher", icon: <Layers size={13} /> },
    { key: "scenes" as const, label: "Automação", icon: <Wand2 size={13} /> },
  ];

  const connectionRouteLabel = connectionMode === "direct" ? "Direto LAN" : "Proxy Web";
  const activeTitle = activeInputObj?.title || "Sem programa";
  const previewTitle = previewInputObj?.title || "Sem preview";

  const connStatus: "online" | "connecting" | "offline" = connecting
    ? "connecting"
    : connected
    ? "online"
    : "offline";
  const statusColor = connStatus === "online" ? "#22c55e" : connStatus === "connecting" ? "#f59e0b" : "#ef4444";
  const statusLabel = connStatus === "online" ? "ONLINE" : connStatus === "connecting" ? "CONNECTING" : "OFFLINE";
  const endpointLabel = savedUrl ? savedUrl.replace(/^https?:\/\//, "") : "sem endpoint";

  const SwitcherStatusPill = ({ compact = false }: { compact?: boolean }) => (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg"
      style={{ backgroundColor: "#0c0c0e", border: `1px solid ${statusColor}30` }}
    >
      <span
        className={`w-2 h-2 rounded-full ${connStatus === "connecting" ? "animate-pulse" : ""}`}
        style={{ backgroundColor: statusColor, boxShadow: `0 0 10px ${statusColor}b0` }}
      />
      <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: statusColor }}>
        {statusLabel}
      </span>
      {!compact && (
        <>
          <span className="w-px h-3 bg-white/10" />
          <span
            className="text-[9px] font-mono text-white/50 truncate max-w-[220px]"
            title={savedUrl || undefined}
          >
            {endpointLabel}
          </span>
          {connectionRouteLabel && (
            <span className="text-[8px] font-black uppercase tracking-widest text-white/30">
              · {connectionRouteLabel}
            </span>
          )}
        </>
      )}
      {connStatus !== "online" && (savedUrl || vmixUrl) && (
        <button
          onClick={() => connectToVmix()}
          disabled={connecting}
          className="ml-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider disabled:opacity-50 hover:brightness-110"
          style={{ backgroundColor: statusColor, color: "#0a0a0a" }}
          title="Tentar reconectar ao vMix"
        >
          {connStatus === "connecting" ? "…" : "Reconectar"}
        </button>
      )}
    </div>
  );


  return (
    <div className="space-y-4 max-w-full pb-20" style={{ color: "#e7e7e7" }}>
      {/* ── Operator Header ── */}
      <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl" style={{ backgroundColor: "#151517" }}>
        {/* Top Header with Logo, Navigation, and Status */}
        <div className="relative flex items-center justify-between gap-4 p-4 pl-8" style={{ background: "linear-gradient(180deg, #202024, #151517)", borderBottom: "1px solid #ffffff0a" }}>
          <div className="flex items-center gap-8">
            {/* Logo and On Air indicator */}
            <div className="flex items-center gap-6">
              {/* Logo removed as requested */}
              
              <div className="flex flex-col">
                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 leading-none mb-1">PROGRAMA NO AR</span>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${effectiveConnected ? 'bg-[#C6F03C] animate-pulse shadow-[0_0_10px_rgba(198,240,60,0.7)]' : 'bg-white/20'}`} />
                  <div className="flex flex-col">
                    <span className="text-[11px] font-black uppercase tracking-[0.1em] text-white truncate max-w-[200px]">
                      {currentProgram?.nome || activeTitle}
                    </span>
                    {currentProgram && (
                      <span className="text-[9px] font-medium text-white/40 leading-none mt-0.5">
                        {currentProgram.horario_inicio} - {currentProgram.horario_fim}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Main Navigation (Aligned right of the logo) */}
            <div className="flex items-center gap-1">
              {[
                { label: "SWITCHER", key: "controls", icon: <Layout size={13} /> },
                { label: "AUTOMAÇÃO", key: "scenes", icon: <Cpu size={13} /> },
              ].map(item => (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300"
                  style={{
                    color: activeTab === item.key ? "#000" : "#8a8a8a",
                    backgroundColor: activeTab === item.key ? "#C6F03C" : "#141414",
                    border: activeTab === item.key ? "1px solid #C6F03C" : "1px solid #ffffff0d",
                    boxShadow: activeTab === item.key ? "0 0 16px rgba(198,240,60,0.25)" : "none",
                  }}
                >
                  {item.icon} {item.label}
                </button>
              ))}

              <div className="w-px h-4 bg-white/10 mx-2" />

              <button
                onClick={() => {
                  setConnected(false);
                  setSelectedConnectionId(null);
                  setVmixUrl("");
                  setStudioName("");
                  setSavedUrl("");
                  navigate("/vmix-control");
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:brightness-125"
                style={{ backgroundColor: "#141414", color: "#C6F03C", border: "1px solid #C6F03C35" }}
              >
                <RefreshCw size={13} /> VOLTAR
              </button>

              <div className="w-px h-4 bg-white/10 mx-2" />

              {/* Status Indicator (Now part of the main button group) */}
              <div className="flex items-center gap-4 px-4 h-11 rounded-xl bg-[#0c0c0e]/50 border border-white/5">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${connected ? "bg-[#C6F03C] shadow-[0_0_10px_rgba(198,240,60,0.7)]" : "bg-[#555]"}`} />
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: connected ? "#C6F03C" : "#777" }}>
                    {connected ? "STATUS: CONECTADO" : "STATUS: DESCONECTADO"}
                  </span>
                </div>

                {connected && (
                  <>
                    <div className="w-px h-3 bg-white/10" />
                    <div className="flex items-center gap-2">
                      <Activity size={12} className="text-white/20" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/40">
                        Latência: <span className="text-white/80">18ms</span>
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Digital Clock */}
              <div className="flex items-center ml-auto pr-2">
                <div 
                  className="px-4 py-1.5 rounded-xl bg-black/40 border border-white/5 shadow-inner"
                  style={{ minWidth: '120px', textAlign: 'center' }}
                >
                  <span 
                    className="text-2xl tracking-widest drop-shadow-[0_0_10px_rgba(198,240,60,0.45)]"
                    style={{ 
                      fontFamily: "'Digital-7', monospace",
                      fontVariantNumeric: "tabular-nums",
                      color: "#C6F03C"
                    }}
                  >
                    {currentTime.toLocaleTimeString('pt-BR', { 
                      hour: '2-digit', 
                      minute: '2-digit', 
                      second: '2-digit',
                      hour12: false 
                    })}
                  </span>
                </div>

                {/* Próximo programa da grade */}
                <div className="ml-3 flex flex-col justify-center px-4 py-1.5 rounded-xl bg-[#0c0c0e]/50 border border-white/5 min-w-[180px]">
                  <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 leading-none mb-1">A SEGUIR</span>
                  <span className="text-[11px] font-black uppercase tracking-[0.05em] text-white/90 truncate max-w-[200px] leading-none">
                    {nextProgram?.nome || "—"}
                  </span>
                  {nextProgram && (
                    <span className="text-[9px] font-medium text-white/40 leading-none mt-1 font-mono">
                      {nextProgram.horario_inicio?.slice(0, 5)} - {nextProgram.horario_fim?.slice(0, 5)}
                    </span>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Shortcut Capture Dialog */}
        <Dialog open={!!capturingShortcut} onOpenChange={(open) => !open && setCapturingShortcut(null)}>
          <DialogContent className="bg-[#1a1a1f] border-white/10 text-white sm:max-w-md rounded-3xl p-8">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                <Keyboard size={32} className="text-amber-500" />
              </div>
              <div className="space-y-2">
                <DialogTitle className="text-xl font-black uppercase tracking-tight text-white">Configurar Atalho</DialogTitle>
                <DialogDescription className="text-xs text-white/40 leading-relaxed">
                  Pressione a tecla ou combinação de teclas que deseja vincular ao botão.
                </DialogDescription>
              </div>

              <div className="w-full p-8 rounded-2xl bg-black/40 border border-white/5 flex flex-col items-center justify-center gap-4 min-h-[120px]">
                {capturingShortcut && (
                  <>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/20">
                      Input: {inputs.find(i => (i.key || i.number) === capturingShortcut)?.title || capturingShortcut}
                    </span>
                    <div className="px-6 py-3 rounded-xl bg-amber-500 text-black font-mono font-bold text-lg shadow-[0_0_20px_rgba(245,158,11,0.3)] animate-pulse">
                      {inputShortcuts[capturingShortcut] ? inputShortcuts[capturingShortcut].toUpperCase() : "PRESS..."}
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 w-full">
                <button
                  onClick={() => {
                    if (capturingShortcut) {
                      setInputShortcuts(prev => {
                        const next = { ...prev };
                        delete next[capturingShortcut];
                        return next;
                      });
                    }
                    setCapturingShortcut(null);
                  }}
                  className="py-3 rounded-xl bg-white/5 text-white/60 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all border border-white/5"
                >
                  Limpar
                </button>
                <button
                  onClick={() => setCapturingShortcut(null)}
                  className="py-3 rounded-xl bg-[#C6F03C] text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all shadow-[0_10px_20px_rgba(198,240,60,0.2)]"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>


      {/* Tab Content (Main Switcher Area) */}
      {/* Tab Content (Main Switcher Area) */}
      <div className="rounded-2xl p-5 space-y-4 border border-white/10" style={{ backgroundColor: "#1a1a1f", minHeight: 300 }}>


        {/* ══ CONTROLS TAB ══ */}
        {activeTab === "controls" && (
          <div className="space-y-4">
            {(reloadingInputs || reloadFallback) && (
              <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${
                reloadingInputs
                  ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-300"
              }`}>
                <div className="flex items-center gap-2">
                  {reloadingInputs ? (
                    <>
                      <span className="inline-block w-3 h-3 rounded-full border-2 border-cyan-300 border-t-transparent animate-spin" />
                      Recarregando inputs e fontes NDI…
                    </>
                  ) : (
                    <>⚠ {reloadFallback}</>
                  )}
                </div>
                {!reloadingInputs && (
                  <button
                    onClick={() => reloadInputsAndSources()}
                    className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-100 text-[9px]"
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            )}

            {/* ATEM-style console reorganized */}
            <div className="rounded-lg overflow-hidden" style={{ backgroundColor: "#000000", border: "1px solid #C6F03C25" }}>
              <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr_1.2fr]">
                
                {/* 1. LEFT: PRE-VISUALIZAÇÃO (Inputs) */}
                <div className="p-5 flex flex-col gap-6" style={{ borderRight: "1px solid #C6F03C20" }}>
                  {/* Categorias (drag and drop) — no topo do box */}
                  <section className="space-y-2">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: "#C6F03C" }}>Categorias</h3>
                    <VmixCategoryPanel
                      side="preview"
                      categorias={switcherCategorias}
                      inputs={inputs}
                      previewInput={previewInput}
                      activeInput={activeInput}
                      onSelect={(num) => { sendCommand("PreviewInput", num); setPreviewInput(num); }}
                      onDropInput={moverInputCategoria}
                      onRemoveInput={removerInputCategoria}
                      onDelete={excluirCategoria}
                      shortcuts={inputShortcuts}
                      capturingShortcut={capturingShortcut}
                      onSetShortcut={(k) => setCapturingShortcut(k)}
                    />
                    <VmixCategoryCreator onCreate={criarCategoria} />
                  </section>

                  <section>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.25em] mb-2.5" style={{ color: "#C6F03C" }}>◐ Pré-Visualização</h3>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(2, Math.min(4, inputsSemCategoria.length || 2))}, minmax(0,1fr))` }}>
                      {inputs.length === 0 && (
                        <span className="col-span-full text-[10px] text-white/30">Nenhum input.</span>
                      )}
                      {inputsSemCategoria.map((input: any) => {
                        const isPreview = previewInput === input.number;
                        const isActive = activeInput === input.number;
                        const shortcut = inputShortcuts[input.key] || inputShortcuts[input.number];
                        const isCapturing = capturingShortcut === (input.key || input.number);

                        return (
                          <button
                            key={`pvw-${input.key || input.number}`}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("text/vmix-input", input.number)}
                            onClick={(e) => {
                              sendCommand("PreviewInput", input.number);
                              setPreviewInput(input.number);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setCapturingShortcut(input.key || input.number);
                            }}
                            title={input.title}
                            className="group relative h-20 rounded border font-bold text-[11px] flex flex-col items-center justify-center transition-all"
                            style={{
                              backgroundColor: isPreview ? "#C6F03C" : "#1a1a1a",
                              color: isPreview ? "#000" : "#e5e5e5",
                              borderColor: isPreview ? "#C6F03C" : "#2a2a2a",
                              boxShadow: isPreview ? "0 0 18px rgba(198,240,60,0.5), inset 0 1px 0 rgba(255,255,255,0.1)" : "inset 0 1px 0 rgba(255,255,255,0.04)",
                              opacity: isActive && !isPreview ? 0.55 : 1,
                            }}
                          >
                            <span className="text-[10px] font-black opacity-70 leading-none">{input.number}</span>
                            <span className="truncate max-w-full px-1 leading-tight mt-1 uppercase tracking-tight">{input.title}</span>

                            {/* Keyboard Shortcut Indicator */}
                            <div
                              className={`absolute -top-1 -right-1 px-1.5 py-0.5 rounded text-[8px] font-mono border transition-all ${
                                isCapturing
                                  ? "animate-pulse z-10"
                                  : shortcut ? "" : "opacity-0 group-hover:opacity-100"
                              }`}
                              style={
                                isCapturing
                                  ? { backgroundColor: "#C6F03C", color: "#000", borderColor: "#C6F03C" }
                                  : shortcut
                                    ? { backgroundColor: "#000000aa", color: "#C6F03C", borderColor: "#C6F03C40" }
                                    : { backgroundColor: "#00000080", color: "#ffffff50", borderColor: "transparent" }
                              }
                            >
                              {isCapturing ? "PRESS..." : shortcut ? shortcut.toUpperCase() : "SET"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>


                {/* 2. MIDDLE: TRANSIÇÕES (Keys 1-4 + BKGD) */}
                <div className="p-5 flex flex-col gap-6" style={{ borderRight: "1px solid #C6F03C20", backgroundColor: "#050505" }}>
                  <NdiWebrtcMonitor
                    vmixBaseUrl={savedUrl || vmixUrl}
                    vmixUser={vmixUser}
                    vmixPass={vmixPass}
                    inputs={inputs}
                    onRefresh={reloadInputsAndSources}
                  />

                  <section>

                    <h3 className="text-[10px] font-black uppercase tracking-[0.25em] mb-2.5" style={{ color: "#C6F03C" }}>Overlays</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {[1, 2, 3, 4].map(n => {
                        const isOn = overlays[n];
                        return (
                          <button
                            key={`key-${n}`}
                            onClick={() => {
                              const cmd = isOn ? `OverlayInput${n}Off` : `OverlayInput${n}`;
                              sendCommand(cmd);
                              setOverlays((prev: any) => ({ ...prev, [n]: !prev[n] }));
                            }}
                            className="h-16 rounded border text-[10px] font-black tracking-wider transition-all"
                            style={{
                              backgroundColor: isOn ? "#C6F03C" : "#1a1a1a",
                              color: isOn ? "#000" : "#e5e5e5",
                              borderColor: isOn ? "#C6F03C" : "#2a2a2a",
                              boxShadow: isOn ? "0 0 12px rgba(198,240,60,0.45)" : "inset 0 1px 0 rgba(255,255,255,0.04)",
                            }}
                          >
                            OVERLAY {n}
                            {isOn && <span className="block text-[8px] mt-0.5 opacity-90">ON AIR</span>}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.25em] mb-2.5" style={{ color: "#C6F03C" }}>Transições</h3>
                    <div className="grid gap-2">
                      <button
                        onClick={() => sendCommand("Cut")}
                        className="h-14 rounded border text-[12px] font-black tracking-widest transition-all hover:brightness-110"
                        style={{ backgroundColor: "#C6F03C", color: "#000", borderColor: "#C6F03C", boxShadow: "0 0 12px rgba(198,240,60,0.35)" }}
                      >
                        CUT
                      </button>
                      <button
                        onClick={() => sendCommand("Fade", undefined, String(transitionDuration))}
                        className="h-14 rounded border text-[12px] font-black tracking-widest transition-all hover:brightness-110"
                        style={{ backgroundColor: "#1a1a1a", color: "#C6F03C", borderColor: "#C6F03C50" }}
                      >
                        FADE
                      </button>
                      <button
                        onClick={() => sendCommand("Merge", undefined, String(transitionDuration))}
                        className="h-14 rounded border text-[12px] font-black tracking-widest transition-all hover:brightness-110"
                        style={{ backgroundColor: "#1a1a1a", color: "#e5e5e5", borderColor: "#2a2a2a" }}
                      >
                        MERGE
                      </button>
                    </div>
                  </section>
                </div>

                {/* 3. RIGHT: PROGRAMA (No Ar) */}
                <div className="p-5 flex flex-col gap-6" style={{ backgroundColor: "#000000" }}>
                  {/* Espelhamento das categorias criadas na Pré-visualização — no topo do box */}
                  {switcherCategorias.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Categorias</h3>
                      <VmixCategoryPanel
                        side="program"
                        categorias={switcherCategorias}
                        inputs={inputs}
                        previewInput={previewInput}
                        activeInput={activeInput}
                        onSelect={(num) => { sendCommand("CutDirect", num); setActiveInput(num); }}
                        shortcuts={inputShortcuts}
                        capturingShortcut={capturingShortcut}
                        onSetShortcut={(k) => setCapturingShortcut(k)}
                      />
                    </section>
                  )}

                  <section>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.25em] mb-2.5 text-red-500/80">● Programa (No Ar)</h3>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(2, Math.min(4, inputsSemCategoria.length || 2))}, minmax(0,1fr))` }}>
                      {inputsSemCategoria.map((input: any) => {
                        const isActive = activeInput === input.number;
                        const shortcut = inputShortcuts[input.key] || inputShortcuts[input.number];
                        const isCapturing = capturingShortcut === (input.key || input.number);

                        return (
                          <button
                            key={`pgm-${input.key || input.number}`}
                            onClick={(e) => {
                              sendCommand("CutDirect", input.number);
                              setActiveInput(input.number);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setCapturingShortcut(input.key || input.number);
                            }}
                            title={input.title}
                            className="group relative h-20 rounded border font-bold text-[11px] flex flex-col items-center justify-center transition-all"
                            style={{
                              backgroundColor: isActive ? "#dc2626" : "#1a1a1a",
                              color: isActive ? "#fff" : "#e5e5e5",
                              borderColor: isActive ? "#dc2626" : "#2a2a2a",
                              boxShadow: isActive ? "0 0 18px rgba(220,38,38,0.55), inset 0 1px 0 rgba(255,255,255,0.1)" : "inset 0 1px 0 rgba(255,255,255,0.04)",
                            }}
                          >
                            <span className="text-[10px] font-black opacity-70 leading-none">{input.number}</span>
                            <span className="truncate max-w-full px-1 leading-tight mt-1 uppercase tracking-tight">{input.title}</span>

                            {/* Keyboard Shortcut Indicator */}
                            <div
                              className={`absolute -top-1 -right-1 px-1.5 py-0.5 rounded text-[8px] font-mono border transition-all ${
                                isCapturing
                                  ? "animate-pulse z-10"
                                  : shortcut ? "" : "opacity-0 group-hover:opacity-100"
                              }`}
                              style={
                                isCapturing
                                  ? { backgroundColor: "#C6F03C", color: "#000", borderColor: "#C6F03C" }
                                  : shortcut
                                    ? { backgroundColor: "#000000aa", color: "#C6F03C", borderColor: "#C6F03C40" }
                                    : { backgroundColor: "#00000080", color: "#ffffff50", borderColor: "transparent" }
                              }
                            >
                              {isCapturing ? "PRESS..." : shortcut ? shortcut.toUpperCase() : "SET"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>

              </div>
            </div>

            {/* NDI discovery section removed as requested */}
          </div>
        )}

        {/* ══ NDI TAB ══ */}
        {activeTab === "ndi" && (
          <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#111114", border: "1px solid #ffffff0d" }}>
              <div className="px-5 py-4" style={{ backgroundColor: "#18181c", borderBottom: "1px solid #ffffff0a" }}>
                <div className="flex items-center gap-2">
                  <Network size={16} style={{ color: "#22c55e" }} />
                  <span className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: "#22c55e" }}>Fontes NDI</span>
                </div>
                <p className="text-[10px] text-white/35 mt-1 leading-relaxed">
                  O painel lê os inputs NDI que o próprio vMix já reconheceu e permite cadastrar novas fontes pelo nome NDI da rede.
                </p>
              </div>

              <div className="p-5 space-y-4">
                <div className="rounded-xl p-3" style={{ backgroundColor: "#0c0c0e", border: "1px solid #ffffff0a" }}>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-2">Busca manual</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="DESKTOP-123 ou NDI Source"
                      className="flex-1 bg-[#111115] border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none focus:ring-1 ring-white/30 transition-all"
                      value={manualNdiHost}
                      onChange={e => setManualNdiHost(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && scanNdiSources()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 px-4 text-[10px] font-black gap-2 border-white/10 hover:bg-white/5"
                      onClick={() => scanNdiSources()}
                      disabled={ndiScanning}
                    >
                      {ndiScanning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      Buscar
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl p-3" style={{ backgroundColor: "#0c0c0e", border: "1px solid #ffffff0a" }}>
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">NDI no vMix</p>
                    <p className="text-2xl font-black text-white">{ndiInputs.length}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ backgroundColor: "#0c0c0e", border: "1px solid #ffffff0a" }}>
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">Sugestões</p>
                    <p className="text-2xl font-black text-white">{ndiSources.length}</p>
                  </div>
                </div>

                <div className="rounded-xl p-3" style={{ backgroundColor: "#f59e0b10", border: "1px solid #f59e0b25" }}>
                  <p className="text-[10px] leading-relaxed" style={{ color: "#fbbf24" }}>
                    Navegadores não conseguem descobrir NDI puro via mDNS/Bonjour diretamente. O fluxo confiável é: vMix detecta/adiciona NDI → o painel sincroniza os inputs pela API → o vídeo aparece pelo MJPEG do vMix.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#111114", border: "1px solid #ffffff0d" }}>
                <div className="flex items-center justify-between px-5 py-4" style={{ backgroundColor: "#18181c", borderBottom: "1px solid #ffffff0a" }}>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-white/60">NDI reconhecidos no vMix</p>
                    <p className="text-[10px] text-white/30 mt-1">Inputs NDI já carregados e exibidos com vídeo via MJPEG quando o navegador permitir acesso local.</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-9 px-3 text-[10px] font-black gap-2 border-white/10" onClick={() => connectToVmix()}>
                    <RefreshCw size={12} className={connecting ? "animate-spin" : ""} /> Sincronizar
                  </Button>
                </div>

                <div className="p-5">
                  {ndiInputs.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {ndiInputs.map(input => {
                        const isActive = activeInput === input.number;
                        const isPreview = previewInput === input.number;
                        return (
                          <div key={input.key || input.number} className="group rounded-xl overflow-hidden" style={{ backgroundColor: "#0c0c0e", border: isActive ? "1px solid #dc2626" : isPreview ? "1px solid #3b82f6" : "1px solid #ffffff0d" }}>
                            <div className="relative aspect-video bg-black">
                              <ThumbnailImg inputNumber={input.number} className="w-full h-full object-cover" alt={input.title} />
                              <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                                <span className="text-[8px] font-black uppercase tracking-widest text-green-400">NDI</span>
                              </div>
                              {(isActive || isPreview) && (
                                <div className="absolute top-2 right-2 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest" style={{ backgroundColor: isActive ? "#dc2626" : "#3b82f6", color: "#fff" }}>
                                  {isActive ? "PGM" : "PVW"}
                                </div>
                              )}
                            </div>
                            <div className="p-3 space-y-3">
                              <div>
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25">Input {input.number}</p>
                                <p className="text-sm font-black text-white truncate">{input.title}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => { sendCommand("PreviewInput", input.number); setPreviewInput(input.number); }} className="py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all hover:brightness-110" style={{ backgroundColor: "#3b82f61a", color: "#93c5fd", border: "1px solid #3b82f640" }}>Preview</button>
                                <button onClick={() => { sendCommand("CutDirect", input.number); setActiveInput(input.number); }} className="py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all hover:brightness-110" style={{ backgroundColor: "#dc26261a", color: "#fca5a5", border: "1px solid #dc262640" }}>Take</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 rounded-2xl" style={{ backgroundColor: "#0c0c0e", border: "1px dashed #ffffff14" }}>
                      <Radio size={30} className="text-white/15 mb-3" />
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Nenhum input NDI sincronizado</p>
                      <p className="text-[10px] text-white/25 mt-1">Adicione uma fonte no vMix ou use a busca manual abaixo.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#111114", border: "1px solid #ffffff0d" }}>
                <div className="px-5 py-4" style={{ backgroundColor: "#18181c", borderBottom: "1px solid #ffffff0a" }}>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-white/60">Adicionar novas fontes</p>
                  <p className="text-[10px] text-white/30 mt-1">Use o nome exato NDI ou escolha uma sugestão gerada a partir dos hosts conhecidos.</p>
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ndiUrl}
                      onChange={e => setNdiUrl(e.target.value)}
                      placeholder="Ex: STUDIO-PC (Camera 1)"
                      className="flex-1 bg-[#0c0c0e] border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none focus:ring-1 ring-white/30 transition-all"
                      onKeyDown={e => e.key === "Enter" && addNdiInput()}
                    />
                    <Button size="sm" className="h-10 px-4 text-[10px] font-black gap-2" onClick={() => addNdiInput()} disabled={!ndiUrl.trim()}>
                      <Plus size={12} /> Adicionar
                    </Button>
                  </div>

                  {ndiSources.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {ndiSources.map(source => (
                        <button
                          key={source}
                          onClick={() => addNdiInput(source)}
                          className="group flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:brightness-110"
                          style={{ backgroundColor: "#0c0c0e", border: "1px solid #ffffff0d" }}
                          title={`Adicionar ${source} ao vMix`}
                        >
                          <Radio size={15} className="text-green-500" />
                          <span className="text-[10px] font-black text-white/55 group-hover:text-white uppercase tracking-tight line-clamp-2">{source}</span>
                          <Plus size={12} className="ml-auto text-white/20 group-hover:text-green-500" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-white/25 py-3 text-center">Nenhuma sugestão gerada ainda.</p>
                  )}
                </div>
              </div>
            </div>
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
            .filter(p => p.ativo && matchesStudio(p.estudio, studioName) && isProgramForToday(p))
            .sort((a, b) => toMin(a.horario_inicio) - toMin(b.horario_inicio));

          const onAir = todayPrograms.find(isNowInProgram);

          const upcoming = todayPrograms
            .filter(p => !isNowInProgram(p))
            .sort((a, b) => minutesUntilStart(a) - minutesUntilStart(b))
            .slice(0, 4);

          return (
            <>
              {/* ── Programas Preset + Botões de Efeitos side by side ── */}
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-4">
                {/* Left: Programas Preset */}
                <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#1a1a1f", border: "1px solid #ffffff08" }}>
                  <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: "#ffffff06", borderBottom: "1px solid #ffffff08" }}>
                    <div className="flex items-center gap-2">
                      <Radio size={14} style={{ color: "#C6F03C" }} />
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#C6F03C" }}>
                        Automações
                      </span>
                    </div>
                    <div className="flex items-center gap-1">

                      <button
                        onClick={() => setEditingPresetId("new")}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all hover:brightness-110"
                        style={{ backgroundColor: "#C6F03C", color: "#000", border: "1px solid #C6F03C" }}
                        title="Criar novo programa"
                      >
                        <Plus size={12} />
                        <span className="text-[10px] font-black uppercase tracking-wider">nova automação</span>
                      </button>

                    </div>
                  </div>
                  <div className="p-4 space-y-4">
                    {(() => {
                      const now = new Date();
                      const day = now.getDay();
                      const daysMap = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
                      const todayStr = daysMap[day];
                      const currentTimeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });

                      const isProgramForToday = (p: Programa) => {
                        if (!p.dias_semana || p.dias_semana.length === 0) return true;
                        return p.dias_semana.some(ds => {
                          const n = ds.toLowerCase().replace(/[-.,]/g, "").trim().slice(0, 3);
                          return n === todayStr;
                        });
                      };

                      const isNowInProgram = (p: Programa) => {
                        if (!p.horario_inicio || !p.horario_fim) return false;
                        return currentTimeStr >= p.horario_inicio.slice(0, 5) && currentTimeStr <= p.horario_fim.slice(0, 5);
                      };

                      const hasSavedOrder = (() => { try { return JSON.parse(localStorage.getItem("vmix_preset_order") || "[]").length > 0; } catch { return false; } })();
                      const studioFilterActive = isStudioScoped(studioName);
                      const programasEstudio = programas.filter(p => matchesStudio(p.estudio, studioName));
                      const ordered = hasSavedOrder ? programasEstudio : [...programasEstudio].sort((a, b) => {
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
                      if (studioFilterActive && ordered.length === 0) {
                        return (
                          <div className="rounded-lg px-4 py-6 text-center" style={{ backgroundColor: "#ffffff05", border: "1px dashed #ffffff14" }}>
                            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#C6F03C" }}>
                              Nenhum programa vinculado ao estúdio “{studioName}”
                            </p>
                            <p className="text-[10px] text-white/40 mt-1">
                              Vincule o estúdio aos programas na Grade de Programação para exibi-los aqui.
                            </p>
                          </div>
                        );
                      }
                      const groups: Record<string, typeof ordered> = {};
                      for (const p of ordered) {
                        const key = p.estudio || "Sem Estúdio";
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(p);
                      }
                      return Object.entries(groups).map(([studio, progs]) => (
                        <div key={studio}>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded" style={{ backgroundColor: "rgba(198,240,60,0.12)", color: "#C6F03C", border: "1px solid rgba(198,240,60,0.3)" }}>
                              {studio}
                            </span>
                            <div className="flex-1 h-px" style={{ backgroundColor: "#ffffff08" }} />
                          </div>

                          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                      {progs.map((prog) => {
                        const isActive = activePreset === prog.id;
                        const progOnAir = isProgramForToday(prog) && isNowInProgram(prog);
                        const startTime = prog.horario_inicio?.slice(0, 5) || "";
                        const endTime = prog.horario_fim?.slice(0, 5) || "";
                        // Contador regressivo até o fim do programa no ar (usa nowTick de 1s)
                        const nowSecs = (() => {
                          const d = new Date(nowTick);
                          return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
                        })();
                        const endSecs = timeToSeconds(prog.horario_fim);
                        const remaining = progOnAir && endSecs !== null
                          ? (endSecs >= nowSecs ? endSecs - nowSecs : endSecs + 86400 - nowSecs)
                          : null;

                        return (
                          <div
                            key={prog.id}
                            className={`group/preset relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.03]${progOnAir ? " vmix-preset-onair ring-2 ring-red-500 animate-pulse" : ""}`}
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
                                <span className="text-[6px] font-black uppercase tracking-wider px-1.5 py-[2px] rounded"
                                  style={{
                                    backgroundColor: progOnAir ? "rgba(255,255,255,0.22)" : "rgba(198,240,60,0.14)",
                                    color: progOnAir ? "#fff" : "#C6F03C",
                                    border: `1px solid ${progOnAir ? "rgba(255,255,255,0.35)" : "rgba(198,240,60,0.35)"}`,
                                  }}
                                >{prog.estudio.toLowerCase().includes("fm") ? "FM" : prog.estudio.toLowerCase().includes("podcast") ? "PODCAST" : prog.estudio}</span>
                              </div>
                            )}
                            {remaining !== null && (
                              <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-[3] flex items-center gap-1 px-1.5 py-[2px] rounded"
                                style={{ backgroundColor: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.25)" }}
                                title="Tempo restante do programa no ar"
                              >
                                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#fff" }} />
                                <span className="text-[9px] font-black tabular-nums" style={{ color: "#fff" }}>{formatCountdown(remaining)}</span>
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
                              <div className="flex items-center gap-1">
                                {(() => { 
                                  const gi = programas.findIndex(p => p.id === prog.id); 
                                  return gi > 0 ? (
                                    <button
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        const arr = [...programas]; 
                                        [arr[gi - 1], arr[gi]] = [arr[gi], arr[gi - 1]]; 
                                        setProgramas(arr); 
                                        localStorage.setItem("vmix_preset_order", JSON.stringify(arr.map(p => p.id))); 
                                      }}
                                      className="w-6 h-6 rounded flex items-center justify-center text-[10px] hover:bg-white/20 transition-colors"
                                      style={{ color: "#fff" }}
                                      title="Mover para esquerda"
                                    ><ChevronDown size={12} className="-rotate-90" /></button>
                                  ) : <div className="w-6" />; 
                                })()}
                                
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingPresetId(prog.id); }}
                                  className="w-6 h-6 rounded flex items-center justify-center hover:bg-[#00BFF0]/40 transition-colors"
                                  style={{ color: "#fff" }}
                                  title="Editar ações"
                                ><Wand2 size={12} /></button>

                                <button
                                  onClick={async (e) => { 
                                    e.stopPropagation(); 
                                    if (confirm(`Deseja duplicar a automação "${prog.nome}"?`)) {
                                      try {
                                        const { data: newProg, error: pError } = await supabase
                                          .from("programas")
                                          .insert([{
                                            nome: `${prog.nome} (Cópia)`,
                                            horario_inicio: prog.horario_inicio,
                                            horario_fim: prog.horario_fim,
                                            dias_semana: prog.dias_semana,
                                            estudio: prog.estudio,
                                            ativo: prog.ativo,
                                            user_id: user?.id
                                          }])
                                          .select()
                                          .single();

                                        if (pError) throw pError;

                                        const { data: commands, error: cError } = await supabase
                                          .from("preset_commands" as any)
                                          .select("*")
                                          .eq("programa_id", prog.id);

                                        if (cError) throw cError;

                                        if (commands && Array.isArray(commands) && commands.length > 0) {
                                          const newCommands = commands.map((c: any) => ({
                                            programa_id: newProg.id,
                                            commands: c.commands,
                                            custom_horario: c.custom_horario,
                                            user_id: user?.id
                                          }));
                                          const { error: insError } = await supabase.from("preset_commands" as any).insert(newCommands);
                                          if (insError) throw insError;
                                        }

                                        setProgramas(prev => [...prev, newProg]);
                                        toast({ title: "Duplicado", description: "Automação duplicada com sucesso." });
                                      } catch (err: any) {
                                        toast({ title: "Erro ao duplicar", description: err.message, variant: "destructive" });
                                      }
                                    }
                                  }}
                                  className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/20 transition-colors"
                                  style={{ color: "#fff" }}
                                  title="Duplicar"
                                ><Copy size={12} /></button>

                                <button
                                  onClick={async (e) => { 
                                    e.stopPropagation(); 
                                    if (confirm(`Excluir a automação "${prog.nome}" permanentemente?`)) {
                                      const { error } = await supabase.from("programas").delete().eq("id", prog.id);
                                      if (!error) {
                                        setProgramas(prev => prev.filter(p => p.id !== prog.id));
                                        toast({ title: "Excluído", description: "Automação removida com sucesso." });
                                      } else {
                                        toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
                                      }
                                    }
                                  }}
                                  className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-500/40 transition-colors"
                                  style={{ color: "#ff4d4d" }}
                                  title="Excluir"
                                ><Trash2 size={12} /></button>

                                {(() => { 
                                  const gi = programas.findIndex(p => p.id === prog.id); 
                                  return gi < programas.length - 1 ? (
                                    <button
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        const arr = [...programas]; 
                                        [arr[gi], arr[gi + 1]] = [arr[gi + 1], arr[gi]]; 
                                        setProgramas(arr); 
                                        localStorage.setItem("vmix_preset_order", JSON.stringify(arr.map(p => p.id))); 
                                      }}
                                      className="w-6 h-6 rounded flex items-center justify-center text-[10px] hover:bg-white/20 transition-colors"
                                      style={{ color: "#fff" }}
                                      title="Mover para direita"
                                    ><ChevronDown size={12} className="rotate-90" /></button>
                                  ) : <div className="w-6" />; 
                                })()}
                              </div>

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
                  <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: "#ffffff06", borderBottom: "1px solid #ffffff08" }}>
                    <div className="flex items-center gap-2">
                      <Wand2 size={14} style={{ color: "#C6F03C" }} />
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#C6F03C" }}>Botões Personalizados</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          const data = JSON.stringify(customButtons, null, 2);
                          const blob = new Blob([data], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `botoes-efeitos-${new Date().toISOString().split("T")[0]}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                          toast({ title: "Exportado", description: "Lista de efeitos exportada com sucesso." });
                        }}
                        className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors"
                        style={{ color: "#888" }}
                        title="Exportar efeitos"
                      >
                        <Download size={12} />
                      </button>
                      <button
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = ".json";
                          input.onchange = async (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (!file) return;
                            try {
                              const text = await file.text();
                              const imported = JSON.parse(text);
                              if (Array.isArray(imported)) {
                                setCustomButtons(prev => [...imported, ...prev.filter(p => !imported.find((i: any) => i.id === p.id))]);
                                toast({ title: "Importado", description: `${imported.length} efeitos carregados na lista.` });
                              }
                            } catch (err) {
                              toast({ title: "Erro na importação", variant: "destructive" });
                            }
                          };
                          input.click();
                        }}
                        className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors"
                        style={{ color: "#888" }}
                        title="Importar efeitos"
                      >
                        <Upload size={12} />
                      </button>
                      <button
                        onClick={() => setEditingCustomButtonId("new")}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all hover:brightness-110"
                        style={{ backgroundColor: "#C6F03C", color: "#000", border: "1px solid #C6F03C" }}
                        title="Criar novo botão"
                      >
                        <Plus size={12} />
                        <span className="text-[10px] font-black uppercase tracking-wider">novo botão</span>
                      </button>
                    </div>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                      {customButtons.map((btn: any) => {
                        const isBtnActive = activeCustomButton === btn.id;
                        const hasSchedule = btn.horario && btn.dias_semana?.length > 0;
                        const btnColor = btn.color || "#C6F03C";
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
                          <Plus size={14} style={{ color: "#C6F03C" }} />
                          <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: "#C6F03C" }}>+ Criar</span>
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
            estudioFixo={studioName || null}
            userId={user.id}
            inputs={inputs}
            onRunCommands={async (cmds) => {
              await runCommandsUnified(cmds as any[], "Teste concluído");
            }}
            inputMapping={inputMapping}
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
          inputs={inputs}
          onRunCommands={async (cmds) => {
            await runCommandsUnified(cmds as any[], "Teste concluído");
          }}
          estudio={studioName || null}
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

    </div>
  );
}
