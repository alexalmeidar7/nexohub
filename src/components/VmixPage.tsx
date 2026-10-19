import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Hls from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { readMusicData, MUSIC_DATA_EVENT } from "@/lib/musicStorageKeys";
import { getZonedNow } from "@/lib/onAirResolver";
import { findClientAccountByEmail, findClientAccountById } from "@/lib/clientAuthAccounts";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { confirmDialog } from "@/lib/confirmDialog";
import { Button } from "@/components/ui/button";
import { useVmixCategories, VmixCategoryCreator, VmixCategoryPanel } from "@/components/vmix/VmixCategories";
import NdiWebrtcMonitor from "@/components/vmix/NdiWebrtcMonitor";
import FloatingNdiPreview from "@/components/vmix/FloatingNdiPreview";

import {
  Monitor, Radio, Disc, RefreshCw, Loader2, CheckCircle, XCircle,
  ExternalLink, Volume2, VolumeX, Play, Square, Camera, Tv,
  Layers, Wand2, Plus, Trash2, GripVertical, Send, Eye, Wifi, WifiOff, HelpCircle, Activity, AlertTriangle, Shield, Clock, Keyboard,
  ScrollText, ChevronDown, ChevronUp, ChevronLeft, ArrowLeft, ArrowRight, Lock, Download, Upload, Network, Zap, Layout, Cpu, Copy, Mic, Music2, Pencil, Settings, Smartphone, Tablet, Trophy
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
  apresentador_nome?: string | null;
}

/** Normaliza dados legados do banco antes de renderizar a grade do Switcher. */
const normalizeProgramaRecord = (value: any): Programa => ({
  id: String(value?.id || ""),
  nome: typeof value?.nome === "string" ? value.nome : "Sem nome",
  ativo: value?.ativo !== false,
  horario_inicio: typeof value?.horario_inicio === "string" ? value.horario_inicio : "00:00",
  horario_fim: typeof value?.horario_fim === "string" ? value.horario_fim : "00:00",
  dias_semana: Array.isArray(value?.dias_semana)
    ? value.dias_semana.filter((day: unknown) => day !== null && day !== undefined).map(String)
    : null,
  estudio: typeof value?.estudio === "string" ? value.estudio : null,
  apresentador_foto: typeof value?.apresentadores?.foto === "string" ? value.apresentadores.foto : null,
  apresentador_nome: typeof value?.apresentadores?.nome === "string" ? value.apresentadores.nome : null,
});

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

export default function VmixPage({ forcedConnected = false, cleanLayout = false, automationMode = false }: { forcedConnected?: boolean; cleanLayout?: boolean; automationMode?: boolean }) {
  const isAutomationRoute = window.location.pathname === "/vmix-control/automation" || automationMode;
  const navigate = useNavigate();
  const buttonPreviewMode = new URLSearchParams(window.location.search).get("buttonPreview");
  const isButtonDevicePreview = ["mobile", "tablet", "desktop"].includes(buttonPreviewMode || "");
  const openButtonDevicePreview = (mode: "mobile" | "tablet" | "desktop") => {
    const url = new URL(window.location.href);
    url.searchParams.set("buttonPreview", mode);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  };
  const buttonPreviewWidth = buttonPreviewMode === "mobile" ? 390 : buttonPreviewMode === "tablet" ? 768 : buttonPreviewMode === "desktop" ? 1280 : undefined;
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
  const [activeTab, setActiveTab] = useState<"controls" | "ndi" | "scenes">(isAutomationRoute ? "scenes" : "scenes");

  useEffect(() => {
    if (automationMode) setActiveTab("scenes");
  }, [automationMode]);

  useEffect(() => {
    const handleHeaderAction = (event: Event) => {
      const action = (event as CustomEvent<string>).detail;
      if (action === "switcher") setActiveTab("controls");
      if (action === "automation") setActiveTab("scenes");
      if (action === "back") {
        setConnected(false);
        setSelectedConnectionId(null);
        setVmixUrl("");
        setStudioName("");
        setSavedUrl("");
        navigate("/vmix-control");
      }
    };
    window.addEventListener("vmix-control-header-action", handleHeaderAction);
    return () => window.removeEventListener("vmix-control-header-action", handleHeaderAction);
  }, [navigate]);
  const [studioName, setStudioName] = useState("");

  // Mantém o nome do estúdio selecionado sincronizado com o cabeçalho global.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("vmix-studio-name", { detail: { studioName } }));
  }, [studioName]);
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
  const [dragCustomButtonId, setDragCustomButtonId] = useState<string | null>(null);
  const [dragCustomCategory, setDragCustomCategory] = useState<string | null>(null);
  const [customButtonCategoryOrder, setCustomButtonCategoryOrder] = useState<string[]>([]);
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


  useEffect(() => {
    window.dispatchEvent(new CustomEvent("vmix-connection-status", { detail: { connected } }));
  }, [connected, forcedConnected]);

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
      const mapped = data.map(normalizeProgramaRecord);
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

  // Mantém a grade sincronizada sem recarregar a página.
  // Realtime atende as alterações normais; a consulta periódica cobre eventos perdidos.
  useEffect(() => {
    if (!user?.id) return;
    let disposed = false;
    let debounceTimer: number | undefined;
    const refresh = () => {
      if (disposed || document.visibilityState === "hidden") return;
      void loadProgramas();
    };
    // Carregamento inicial único: evita duplicar a consulta feita pelo efeito inicial separado.
    void loadProgramas();
    const channel = supabase
      .channel(`vmix-program-grid-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "programas", filter: `user_id=eq.${user.id}` },
        () => {
          if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
          debounceTimer = window.setTimeout(refresh, 250);
        },
      )
      .subscribe();
    const pollId = window.setInterval(refresh, 15000);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [user?.id, loadProgramas]);

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
      let filtered = (data as any[]).filter(b => matchesStudio(b.estudio, studioName));
      try {
        const categoryKey = `vmix_custom_button_categories:${user?.id}:${normStudio(studioName) || "all"}`;
        const overrides = JSON.parse(localStorage.getItem(categoryKey) || "{}") as Record<string, string>;
        filtered = filtered.map(button => overrides[button.id] ? { ...button, category: overrides[button.id] } : button);
        const categoryOrderKey = `vmix_custom_category_order:${user?.id}:${normStudio(studioName) || "all"}`;
        const savedCategoryOrder = JSON.parse(localStorage.getItem(categoryOrderKey) || "[]") as string[];
        setCustomButtonCategoryOrder(savedCategoryOrder);
      } catch { /* mantém categorias originais */ }
      try {
        const orderKey = `vmix_custom_button_order:${user.id}:${normStudio(studioName) || "all"}`;
        const savedOrder = JSON.parse(localStorage.getItem(orderKey) || "[]") as string[];
        filtered.sort((a, b) => {
          const ai = savedOrder.indexOf(a.id);
          const bi = savedOrder.indexOf(b.id);
          if (ai === -1 && bi === -1) return 0;
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
      } catch { /* mantém ordem de criação */ }
      setCustomButtons(filtered);
    }
  }, [user, studioName]);

  const assignCustomButtonCategory = useCallback((buttonId: string, category: string) => {
    if (!user || !buttonId || !category) return;
    const storageKey = `vmix_custom_button_categories:${user.id}:${normStudio(studioName) || "all"}`;
    try {
      const overrides = JSON.parse(localStorage.getItem(storageKey) || "{}") as Record<string, string>;
      overrides[buttonId] = category;
      localStorage.setItem(storageKey, JSON.stringify(overrides));
    } catch { /* no-op */ }
    const targetColor = customButtons.find(button =>
      String(button.category || button.commands?.[0]?._buttonCategory || "OUTROS").trim() === category &&
      button.id !== buttonId && typeof button.color === "string" && /^#[0-9a-f]{6}$/i.test(button.color)
    )?.color;
    const currentButton = customButtons.find(button => button.id === buttonId);
    const commands = Array.isArray(currentButton?.commands) ? [...currentButton.commands] : [];
    if (commands.length) commands[0] = { ...commands[0], _buttonCategory: category };
    // Não gravar `category` como coluna: persistir no JSON evita erro em bancos
    // que ainda não receberam a migração dessa coluna.
    void (supabase.from("custom_vmix_buttons" as any) as any)
      .update({ commands, ...(targetColor ? { color: targetColor } : {}) })
      .eq("id", buttonId);
    setCustomButtons(prev => prev.map(button => {
      if (button.id !== buttonId) return button;
      return { ...button, category, color: targetColor || button.color, commands };
    }));
  }, [user, studioName, customButtons]);

  const reorderCustomCategory = useCallback((draggedCategory: string, targetCategory: string) => {
    if (!user || !draggedCategory || !targetCategory || draggedCategory === targetCategory) return;
    const allCategories = Array.from(new Set(customButtons.map(button => getAudioMonitorInput(button) ? "AUDIO" : String(button.category || button.commands?.[0]?._buttonCategory || "OUTROS").trim() || "OUTROS")));
    const baseOrder = [...customButtonCategoryOrder, ...allCategories.filter(category => !customButtonCategoryOrder.includes(category))];
    const from = baseOrder.indexOf(draggedCategory);
    const to = baseOrder.indexOf(targetCategory);
    if (from < 0 || to < 0) return;
    baseOrder.splice(to, 0, baseOrder.splice(from, 1)[0]);
    const key = `vmix_custom_category_order:${user.id}:${normStudio(studioName) || "all"}`;
    localStorage.setItem(key, JSON.stringify(baseOrder));
    setCustomButtonCategoryOrder(baseOrder);
  }, [user, studioName, customButtons, customButtonCategoryOrder]);

  const reorderCustomButton = useCallback((draggedId: string, targetId: string) => {
    if (!user || draggedId === targetId) return;
    setCustomButtons(prev => {
      const next = [...prev];
      const from = next.findIndex(button => button.id === draggedId);
      const to = next.findIndex(button => button.id === targetId);
      if (from < 0 || to < 0) return prev;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      const orderKey = `vmix_custom_button_order:${user.id}:${normStudio(studioName) || "all"}`;
      localStorage.setItem(orderKey, JSON.stringify(next.map(button => button.id)));
      return next;
    });
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
          if (!response.ok) {
            throw new Error(`vMix respondeu com HTTP ${response.status} ao executar a solicitação.`);
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
      
      // Keep the automation route on presets/scenes; normal control route opens the switcher.
      if (!automationMode) setActiveTab("controls");
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

      if (!isAutoConnect) toast({ title: "Erro de conexão", description: `${message}${hint}`, variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  }, [savedUrl, toast, vmixFetch, connectionMode, applyVmixState, persistVmixSnapshot, selectedConnectionId, persistActiveConnection, user?.id, setConnected, setConnecting, setActiveTab]);

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
      // Uma resposta válida restaura o estado online sem recarregar a página.
      setConnected(true);
      silentFailCountRef.current = 0;
    } catch {
      // Pequenas oscilações não derrubam a conexão imediatamente.
      silentFailCountRef.current += 1;
      if (silentFailCountRef.current >= 3) {
        setConnected(false);
        silentFailCountRef.current = 0;
      }
    }
  }, [savedUrl, vmixFetch, applyVmixState, persistVmixSnapshot, setConnected]);

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
    // Health check contínuo: mantém a verificação rápida mesmo quando o vMix
    // está offline, para detectar quando o operador o abre novamente.
    const pollInterval = 5000;
    const id = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible") void silentRefresh();
    }, pollInterval);
    const refreshWhenAvailable = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void silentRefresh();
    };
    window.addEventListener("online", refreshWhenAvailable);
    document.addEventListener("visibilitychange", refreshWhenAvailable);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", refreshWhenAvailable);
      document.removeEventListener("visibilitychange", refreshWhenAvailable);
    };
  }, [connected, savedUrl, silentRefresh]);

  // Reconecta em segundo plano se esta conexão já havia sido estabelecida.
  // Não navega, não recarrega a página e não exibe alertas repetidos durante a tentativa.
  useEffect(() => {
    if (!user?.id || !savedUrl || !selectedConnectionId || connected || connecting) return;
    let shouldReconnect = false;
    try {
      shouldReconnect = localStorage.getItem(`vmix_last_connected_${user.id}`) === selectedConnectionId;
    } catch { /* armazenamento pode estar indisponível em navegadores incorporados */ }
    if (!shouldReconnect) return;
    const retryId = window.setTimeout(() => {
      void connectToVmixRef.current?.(true);
    }, 4000);
    return () => window.clearTimeout(retryId);
  }, [user?.id, savedUrl, selectedConnectionId, connected, connecting]);

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

  const sendCommand = async (fn: string, input?: string, value?: string, silent = false): Promise<boolean> => {
    if (!savedUrl) return false;

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
      return true;
    } catch (err: any) {
      addLog(cmdLabel, "error", err?.message || "Falha ao enviar", "local");
      if (!silent) toast({ title: "Erro", description: "Falha ao enviar comando.", variant: "destructive" });
      return false;
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

  const runCommandsUnified = useCallback(async (cmds: any[], label: string, silent = false): Promise<boolean> => {
    const normalized = normalizeCommands(cmds).map(cmd => ({
      ...cmd,
      input: resolveInputKey(cmd.input)
    }));
    
    if (!normalized.length) return false;

    const batchLabel = `[${label}] ${normalized.length} cmd(s)`;

    // For private/local IPs, skip server attempt — the cloud cannot reach LAN.
    // Send directly from the browser to vMix.
    if (savedUrl && isPrivateIp(savedUrl)) {
      addLog(batchLabel, "pending", "Enviando direto (LAN)...", "local");
      let allSucceeded = true;
      for (const cmd of normalized) {
        const succeeded = await sendCommand(cmd.fn, cmd.input, cmd.value, silent);
        if (!succeeded) allSucceeded = false;
        await new Promise((r) => setTimeout(r, 400));
      }
      if (allSucceeded) {
        if (!silent) toast({ title: label, description: `${normalized.length} ação(ões) enviada(s) ao vMix.` });
      } else {
        addLog(batchLabel, "error", "Uma ou mais ações falharam; a automação tentará novamente.", "local");
      }
      return allSucceeded;
    }

    addLog(batchLabel, "pending", "Enviando via servidor...", "server");

    try {
      const res = await supabase.functions.invoke("execute-vmix-commands", { body: { commands: normalized, connectionId: selectedConnectionId } });
      if (res.error) throw res.error;

      const results = Array.isArray((res.data as { results?: Array<{ ok?: boolean }> } | null)?.results)
        ? (res.data as { results: Array<{ ok: boolean }> }).results
        : null;

      if (results && results.length > 0 && !results.some((r) => r?.ok)) {
        throw new Error("SERVER_COULD_NOT_REACH_VMIX");
      }

      addLog(batchLabel, "ok", "Executado no servidor", "server");
      // Atualiza o estado sem chamar connectToVmix, que pode navegar para outra rota.
      setTimeout(() => silentRefresh(), 300);
      if (!silent) toast({ title: label, description: `${normalized.length} ação(ões) executada(s) no servidor.` });
      return true;
    } catch (err: any) {
      addLog(batchLabel, "error", `Servidor falhou: ${err?.message || "desconhecido"} → fallback local`, "server");
      let allSucceeded = true;
      for (const cmd of normalized) {
        const succeeded = await sendCommand(cmd.fn, cmd.input, cmd.value, silent);
        if (!succeeded) allSucceeded = false;
        await new Promise((r) => setTimeout(r, 400));
      }
      if (allSucceeded) {
        if (!silent) toast({ title: label, description: `${normalized.length} ação(ões) executada(s) localmente.` });
      } else {
        addLog(batchLabel, "error", "Uma ou mais ações falharam; a automação tentará novamente.", "local");
      }
      return allSucceeded;
    }
  }, [normalizeCommands, sendCommand, toast, addLog, savedUrl, selectedConnectionId, silentRefresh]);

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
            // Execute through the same command pipeline used by a manual preset click,
            // so input mapping, command normalization and LAN/cloud routing are preserved.
            await runCommandsUnified(cmds, `Preset agendado: ${prog.nome}`);
          }
        }
      } catch (err) {
        console.error("[local-scheduler] preset error:", err);
      }

      // 2. Custom buttons with schedule
      try {
        const { data: buttons } = await supabase
          .from("custom_vmix_buttons")
          .select("id, nome, commands, horario, dias_semana, estudio")
          .eq("user_id", user.id);

        if (buttons) {
          for (const btn of buttons) {
            // StartStreaming do PODCAST nunca usa o agendador genérico: ele depende
            // exclusivamente do evento AO VIVO vinculado ao programa na Agenda.
            if (normStudio(btn.estudio).includes("podcast") && hasStartStreamingCommand(btn)) continue;
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
  const studioNameRef = useRef(studioName);
  studioNameRef.current = studioName;
  const runCommandsRef = useRef(runCommandsUnified);
  runCommandsRef.current = runCommandsUnified;
  const auditContextRef = useRef({ userId: user?.id, email: user?.email, program: null as any, points: {} as Record<string, number> });
  const logKeyboardClick = (btn: any) => {
    const { userId, email, program, points } = auditContextRef.current;
    if (!userId) {
      console.warn("Clique vMix via atalho sem usuário autenticado; registro não enviado");
      return;
    }
    const category = String(btn.category || btn.commands?.[0]?._buttonCategory || "OUTROS").trim().toLocaleUpperCase("pt-BR");
    void (supabase.from("vmix_button_interactions" as any) as any).insert({
      user_id: userId,
      locutor_nome: program?.apresentador_nome || null,
      user_email: email || null,
      studio_name: studioNameRef.current || null,
      button_id: String(btn.id),
      button_name: String(btn.nome || "Botão personalizado"),
      button_category: category,
      points: (points as Record<string, number>)[category] ?? 0,
      program_name: program?.nome || null,
    }).then(({ error }: any) => {
      if (error) {
        console.warn("Clique vMix via atalho não registrado:", error.message);
        toast({ title: "Clique não registrado no relatório", description: error.message, variant: "destructive" });
      }
    }).catch((error: any) => {
      console.warn("Erro ao registrar atalho vMix:", error);
      toast({ title: "Falha ao registrar clique do atalho", description: error?.message || "Verifique a conexão.", variant: "destructive" });
    });
  };
  const logKeyboardClickRef = useRef(logKeyboardClick);
  logKeyboardClickRef.current = logKeyboardClick;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const pressed = `${e.ctrlKey ? "Ctrl+" : ""}${e.altKey ? "Alt+" : ""}${e.shiftKey ? "Shift+" : ""}${e.key.toUpperCase()}`.toLowerCase();
      const btn = customButtonsRef.current.find((b: any) => (b?.shortcut || "").toLowerCase() === pressed);
      if (!btn || e.repeat) return;
      e.preventDefault();
      if (normStudio(studioNameRef.current).includes("podcast") && hasStartStreamingCommand(btn)) {
        toast({
          title: "Execução protegida pela Agenda",
          description: "No estúdio PODCAST, este botão StartStreaming é acionado somente pelo evento AO VIVO vinculado na Agenda.",
          variant: "destructive",
        });
        return;
      }
      setActiveCustomButton(btn.id);
      logKeyboardClickRef.current(btn);
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
    <div className="rounded-xl overflow-hidden border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" style={{ backgroundColor: "rgba(13, 31, 62, 0.38)", backdropFilter: "blur(8px) saturate(115%)", WebkitBackdropFilter: "blur(8px) saturate(115%)" }}>
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
      <div className={`w-full max-w-none mx-0 py-12 px-6 min-h-[90vh] flex flex-col items-center justify-center ${cleanLayout ? "vmix-clean-layout" : ""}`}>
        <div className="flex flex-col items-center gap-16 w-full">
          

          <div className="flex flex-wrap items-start justify-center gap-6 sm:gap-8 w-full">
            {/* NEW CONNECTION BUTTON */}
            <div className={`flex flex-col gap-4 w-full max-w-[280px] ${cleanLayout ? "vmix-connection-group" : ""}`}>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/65 ml-1">Nova Conexão</p>
              <button
                onClick={() => {
                  setSelectedConnectionId(null);
                  setVmixUrl("");
                  setStudioName("");
                  setVmixUser("");
                  setVmixPass("");
                  setShowStudioSelector(true);
                }}
                className={cleanLayout ? "vmix-connection-card group relative aspect-square w-full rounded-[28px] flex flex-col items-center justify-center gap-4 px-5 py-6" : "group relative aspect-square w-full rounded-[48px] bg-[#1a1a1a] border border-white/5 flex flex-col items-center justify-center gap-5 transition-all duration-500 hover:bg-[#222] hover:border-[#C6F03C]/30 hover:shadow-[0_40px_80px_rgba(0,0,0,0.6)] hover:-translate-y-2"}
              >
                <div className={cleanLayout ? "vmix-connection-icon flex h-[72px] w-[72px] items-center justify-center rounded-[22px]" : "w-28 h-28 rounded-full bg-[#C6F03C]/5 flex items-center justify-center transition-all duration-500 group-hover:bg-[#C6F03C]/10 group-hover:scale-110"} style={cleanLayout ? { backgroundColor: "#0065F9" } : undefined}>
                  <Plus size={cleanLayout ? 32 : 44} className={cleanLayout ? "text-white" : "text-[#C6F03C]"} />
                </div>
                <div className={`flex flex-col items-center gap-1 ${cleanLayout ? "vmix-connection-copy" : ""}`}>
                  <span className={cleanLayout ? "text-[12px] font-bold uppercase tracking-[0.1em] text-white" : "text-[10px] font-black uppercase tracking-[0.2em] text-[#C6F03C]/60 group-hover:text-[#C6F03C] transition-colors"}>Adicionar</span>
                  <span className={cleanLayout ? "text-[9px] font-medium uppercase tracking-[0.04em] text-white/75 text-center" : "text-[8px] font-bold uppercase tracking-[0.1em] text-white/20"}>Configurar novo estúdio</span>
                </div>
                {!cleanLayout && <div className="absolute inset-0 rounded-[48px] border-2 border-transparent group-hover:border-[#C6F03C]/10 transition-all" />}
              </button>
            </div>

            {/* SAVED CONNECTIONS LIST */}
            {vmixConnections.map((conn) => (
              <div key={conn.id} className={`flex flex-col gap-4 w-full max-w-[280px] ${cleanLayout ? "vmix-connection-group" : ""}`}>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/65 ml-1">Estúdio Salvo</p>
                <div
                  className={cleanLayout ? "vmix-connection-card group relative aspect-square rounded-[28px] flex flex-col items-center justify-center gap-4 px-5 py-6" : "group relative aspect-square rounded-[48px] bg-[#1a1a1a] border border-white/5 flex flex-col items-center justify-center gap-5 transition-all duration-500 hover:bg-[#222] hover:border-[#C6F03C]/30 hover:shadow-[0_40px_80px_rgba(0,0,0,0.6)] hover:-translate-y-2"}
                >
                  <button
                    onClick={() => handleSelectConnection(conn)}
                    className={cleanLayout ? "vmix-connection-card-button flex flex-col items-center justify-center gap-5 w-full h-full" : "flex flex-col items-center justify-center gap-5 w-full h-full"}
                    style={cleanLayout ? { backgroundColor: "transparent", borderRadius: "inherit" } : undefined}
                  >
                    <div className={cleanLayout ? "vmix-connection-icon flex h-[72px] w-[72px] items-center justify-center rounded-[22px]" : "w-20 h-20 rounded-[32px] bg-white/5 flex items-center justify-center group-hover:bg-[#C6F03C]/10 transition-all duration-500 group-hover:scale-105"} style={cleanLayout ? { backgroundColor: "#0065F9" } : undefined}>
                      <Monitor size={cleanLayout ? 28 : 32} className={cleanLayout ? "text-white" : "text-white/20 group-hover:text-[#C6F03C] transition-colors"} />
                    </div>
                    <div className={`flex flex-col items-center gap-1 px-3 ${cleanLayout ? "vmix-connection-copy" : ""}`}>
                      <span className={cleanLayout ? "text-sm font-semibold text-white uppercase tracking-wide text-center truncate w-full" : "text-sm font-black text-white/80 group-hover:text-white uppercase tracking-widest text-center truncate w-full"}>{conn.name}</span>
                      <span className={cleanLayout ? "text-[10px] font-medium text-white/75 uppercase tracking-wide text-center" : "text-[8px] font-bold text-white/20 uppercase tracking-widest"}>{conn.url.replace(/^https?:\/\//, "")}</span>
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

          <DialogContent className={`vmix-connection-dialog sm:max-w-md rounded-[28px] p-0 overflow-hidden ${cleanLayout ? "vmix-connection-dialog-clean" : ""}`}>
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
                  className={`vmix-connection-primary w-full py-5 rounded-2xl text-xs font-black uppercase tracking-[0.2em] ${cleanLayout ? "" : "bg-[#C6F03C] text-black transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_10px_30px_rgba(198,240,60,0.2)]"}`}
                >
                  Conectar ao Estúdio
                </button>
                <button
                  onClick={() => setShowStudioSelector(false)}
                  className={`vmix-connection-cancel w-full py-5 text-xs font-black uppercase tracking-[0.2em] ${cleanLayout ? "" : "text-white/20 hover:text-white transition-colors"}`}
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
      vmixFetch={vmixFetch}
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
      dragCustomButtonId={dragCustomButtonId}
      setDragCustomButtonId={setDragCustomButtonId}
      reorderCustomButton={reorderCustomButton}
      dragCustomCategory={dragCustomCategory}
      setDragCustomCategory={setDragCustomCategory}
      customButtonCategoryOrder={customButtonCategoryOrder}
      reorderCustomCategory={reorderCustomCategory}
      assignCustomButtonCategory={assignCustomButtonCategory}
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


interface AgendaEventoLite {
  id: string;
  programa_id: string | null;
  data: string;
  horario_gravacao: string | null;
  horario_gravacao_fim: string | null;
  tipo_evento: string | null;
  descricao: string | null;
  status?: string | null;
}

/** Impede que registros antigos ou parcialmente preenchidos da Agenda derrubem o Switcher. */
const normalizeAgendaEvento = (value: any): AgendaEventoLite | null => {
  if (!value?.id || typeof value?.data !== "string") return null;
  return {
    id: String(value.id),
    programa_id: value.programa_id === null || value.programa_id === undefined ? null : String(value.programa_id),
    data: value.data,
    horario_gravacao: typeof value.horario_gravacao === "string" ? value.horario_gravacao : null,
    horario_gravacao_fim: typeof value.horario_gravacao_fim === "string" ? value.horario_gravacao_fim : null,
    tipo_evento: typeof value.tipo_evento === "string" ? value.tipo_evento : null,
    descricao: typeof value.descricao === "string" ? value.descricao : null,
    status: typeof value.status === "string" ? value.status : null,
  };
};

const isLiveEvento = (tipo?: string | null) => {
  const t = (tipo || "").toLowerCase();
  return t.includes("live") || t.includes("ao vivo") || t.includes("vivo");
};

const isRecordingEvento = (tipo?: string | null) =>
  (tipo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes("gravacao");

const eventoEndMs = (evento: AgendaEventoLite, programa?: any) => {
  const startMs = eventoStartMs(evento);
  if (startMs === null) return null;
  const endTime = (evento.horario_gravacao_fim || "").slice(0, 5);
  if (endTime) {
    const end = Date.parse(`${evento.data}T${endTime}:00-03:00`);
    if (!Number.isNaN(end)) return end <= startMs ? end + 86400_000 : end;
  }
  const start = timeToSeconds(programa?.horario_inicio);
  const finish = timeToSeconds(programa?.horario_fim);
  const duration = start !== null && finish !== null
    ? (finish > start ? finish - start : 86400 - start + finish)
    : 3600;
  return startMs + duration * 1000;
};

const isLiveAutomationButton = (button: { nome?: string | null }) =>
  /\blive\b|ao\s*vivo/i.test(button.nome || "");

/** Aceita formatos atuais e legados do widget de monitor de áudio. */
const getAudioMonitorInput = (button: any): string | null => {
  const monitorTypes = ["audio_monitor", "audio-monitor", "audio", "audio_spectrum", "audio-spectrum", "audio_meter", "audio-meter"];
  const normalizedName = (button?.nome || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  const isAudioMonitor = [button?.type, button?.button_type, button?.widget_type, button?.kind, button?.monitor_type]
    .some((value) => typeof value === "string" && monitorTypes.includes(value.toLowerCase()));
  const monitorCommand = Array.isArray(button?.commands)
    ? button.commands.find((command: any) =>
      monitorTypes.includes(String(command?.type || command?.kind || "").toLowerCase()) ||
      command?.fn === "AudioMonitor" ||
      command?.audioMonitorInput ||
      command?.audio_input,
    )
    : null;
  const isNamedAudioMonitor = normalizedName === "audio" || normalizedName === "audiomonitor" || normalizedName === "audiometro";

  if (!isAudioMonitor && !monitorCommand && !isNamedAudioMonitor) return null;
  const firstCommandWithInput = Array.isArray(button?.commands)
    ? button.commands.find((command: any) => command?.input || command?.audioMonitorInput || command?.audio_input)
    : null;
  const input = button?.audio_input || button?.audioInput || button?.audio_source || button?.input || monitorCommand?.audioMonitorInput || monitorCommand?.audio_input || monitorCommand?.input || firstCommandWithInput?.audioMonitorInput || firstCommandWithInput?.audio_input || firstCommandWithInput?.input;
  return input === undefined || input === null || input === "" ? "—" : String(input);
};

function AudioMonitorButton({
  button,
  input,
  inputName,
  textScale,
  onEdit,
  onDelete,
  levels,
}: {
  button: any;
  input: string;
  inputName?: string;
  textScale: number;
  onEdit: () => void;
  onDelete: () => void;
  levels?: { left: number; right: number; available: boolean; updatedAt: number };
}) {
  // Usa exclusivamente os valores reais da API do vMix; nunca simula níveis.
  const leftLevel = levels?.available ? levels.left : 0;
  const rightLevel = levels?.available ? levels.right : 0;
  const dbValue = (level: number) => level <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(level);
  const dbFor = (level: number) => Number.isFinite(dbValue(level)) ? dbValue(level).toFixed(0) : "-∞";
  const averageDb = levels?.available
    ? (Number.isFinite(dbValue(leftLevel)) && Number.isFinite(dbValue(rightLevel))
      ? ((dbValue(leftLevel) + dbValue(rightLevel)) / 2).toFixed(1)
      : "-∞")
    : "—";
  const meterColor = (segment: number, total: number) => {
    const ratio = segment / total;
    return ratio >= 0.88 ? "#ef2028" : ratio >= 0.68 ? "#ffe600" : "#00e83b";
  };
  const activeSegmentsFor = (amplitude: number) => {
    if (amplitude <= 0) return 0;
    const db = 20 * Math.log10(amplitude);
    return Math.max(0, Math.min(12, Math.ceil(((db + 60) / 60) * 12)));
  };
  const monitorName = button?.nome || `Áudio · Input ${input}`;
  const channelMeters = [
    { label: "L", level: leftLevel },
    { label: "R", level: rightLevel },
  ];

  return (
    <div
      className="group/custom relative h-[54px] w-full min-w-0 overflow-hidden rounded-lg transition-all duration-200 hover:brightness-110 sm:h-auto sm:aspect-[3/2]"
      style={{ width: "100%", minWidth: 0, background: "#08090b", border: "1px solid #292a2e", boxSizing: "border-box" }}
      title={`Monitor estéreo L/R do Input ${input}`}
    >
      <div className="absolute inset-0 flex items-center justify-center gap-2 px-2 sm:hidden">
        <div className="flex h-9 w-5 shrink-0 items-stretch gap-[2px]" aria-label="Espectro estéreo L/R">
          {channelMeters.map(channel => {
            const totalSegments = 12;
            const activeSegments = levels?.available ? activeSegmentsFor(channel.level) : 0;
            return <div key={channel.label} className="flex min-w-0 flex-1 flex-col-reverse gap-[1px] rounded-sm bg-[#17181b] p-[1px]">{Array.from({ length: totalSegments }, (_, index) => { const active = index < activeSegments; const color = meterColor(index, totalSegments); return <div key={index} className="min-h-0 flex-1" style={{ backgroundColor: active ? color : "#242529", boxShadow: active ? `0 0 4px ${color}55` : "none" }} />; })}</div>;
          })}
        </div>
        <span className="whitespace-nowrap text-[11px] font-black tabular-nums text-white">{averageDb} dB</span>
      </div>
      <div className="hidden h-full min-h-0 flex-col px-2 py-2 sm:flex">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${levels?.available ? "bg-[#00e83b]" : "bg-[#f59e0b]"}`} />
          <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase leading-tight tracking-wide text-white" title={inputName || monitorName}>
            {inputName || monitorName}
          </span>
        </div>
        <div className="mt-2 flex min-h-0 flex-1 gap-2 pb-2">
          <div className="flex w-[22px] shrink-0 items-stretch gap-[4px]" aria-label="Medidores de áudio esquerdo e direito">
            {channelMeters.map(channel => {
              const totalSegments = 12;
              const activeSegments = levels?.available ? activeSegmentsFor(channel.level) : 0;
              return (
                <div key={channel.label} className="flex w-[9px] min-w-0 flex-col-reverse gap-[2px] rounded-sm bg-[#17181b] p-[1px]">
                  {Array.from({ length: totalSegments }, (_, index) => {
                    const active = index < activeSegments;
                    return <div key={index} className="min-h-0 w-full flex-1 rounded-[1px]" style={{ backgroundColor: active ? meterColor(index, totalSegments) : "#242529" }} />;
                  })}
                </div>
              );
            })}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="grid grid-cols-2 gap-1">
              {[
                { label: "L1", value: leftLevel },
                { label: "R1", value: rightLevel },
              ].map(channel => (
                <div key={channel.label} className="min-w-0 rounded bg-[#17181b] px-1 py-1 text-center">
                  <div className="text-[8px] font-semibold leading-none text-white/60">{channel.label}</div>
                  <div className="mt-1 whitespace-nowrap text-[9px] font-bold leading-none tabular-nums text-white">{levels?.available ? `${dbFor(channel.value)} dB` : "— dB"}</div>
                </div>
              ))}
            </div>
            <div className="min-w-0 rounded bg-[#10241b] px-1 py-1 text-center">
              <div className="text-[8px] font-semibold leading-none text-white/70">MÉDIA L/R</div>
              <div className="mt-1 whitespace-nowrap text-[10px] font-bold leading-none tabular-nums text-white">{averageDb} dB</div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-1 right-1 z-20 flex items-center gap-1 opacity-0 transition-all group-hover/custom:opacity-100">
        <button onClick={(event) => { event.stopPropagation(); onEdit(); }} className="flex h-5 w-5 items-center justify-center rounded bg-black/60 text-white hover:bg-white/15" title="Alterar input monitorado"><Wand2 size={10} /></button>
        <button onClick={(event) => { event.stopPropagation(); onDelete(); }} className="flex h-5 w-5 items-center justify-center rounded bg-black/60 text-red-300 hover:bg-red-500/25" title="Excluir monitor de áudio"><Trash2 size={10} /></button>
      </div>
    </div>
  );
}

/** Identifica botões cuja execução precisa ser protegida pela Agenda no estúdio PODCAST. */
const hasStartStreamingCommand = (button: { commands?: unknown }) =>
  Array.isArray(button.commands) && button.commands.some((command: any) =>
    command?.enabled !== false && command?.fn === "StartStreaming",
  );

/** Compatibilidade: a vinculação é lida da coluna legada ou do JSON de comandos. */
const getButtonProgramaId = (button: { programa_id?: unknown; commands?: unknown }): string | null => {
  if (typeof button.programa_id === "string" && button.programa_id) return button.programa_id;
  if (!Array.isArray(button.commands)) return null;

  const commandWithProgram = button.commands.find((command: any) =>
    (typeof command?.agendaProgramId === "string" && command.agendaProgramId) ||
    (typeof command?.programa_id === "string" && command.programa_id),
  );

  return commandWithProgram?.agendaProgramId || commandWithProgram?.programa_id || null;
};

const normalizeScheduleName = (value?: string | null) =>
  (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\blive\b|\bao\s*vivo\b/g, "")
    .replace(/[^a-z0-9]/g, "");

/**
 * Resolve o programa do botão pela vinculação explícita e, para botões legados,
 * pelo nome. Ex.: “LIVE - FAMÍLIA POSITIVA” encontra “Família Positiva”.
 */
const resolveButtonProgramaId = (button: { programa_id?: unknown; commands?: unknown; nome?: string | null }, programas: Programa[]) => {
  const linkedId = getButtonProgramaId(button);
  if (linkedId) return linkedId;

  const buttonName = normalizeScheduleName(button.nome);
  if (!buttonName) return null;

  const matchedProgram = programas.find((programa) => {
    const programName = normalizeScheduleName(programa.nome);
    return programName !== "" && (programName === buttonName || buttonName.includes(programName) || programName.includes(buttonName));
  });

  return matchedProgram?.id || null;
};

/**
 * Resolve o programa de eventos atuais e legados da Agenda. Eventos antigos podem
 * não ter programa_id preenchido, mas trazem o nome do programa na descrição.
 */
const resolveAgendaEventoProgramaId = (evento: AgendaEventoLite, programas: Programa[]) => {
  if (evento.programa_id && programas.some((programa) => programa.id === evento.programa_id)) {
    return evento.programa_id;
  }

  const eventName = normalizeScheduleName(evento.descricao);
  if (!eventName) return null;

  const matchedProgram = programas.find((programa) => {
    const programName = normalizeScheduleName(programa.nome);
    return programName !== "" && (eventName === programName || eventName.includes(programName) || programName.includes(eventName));
  });

  return matchedProgram?.id || null;
};

const eventoStartMs = (ev: AgendaEventoLite) => {
  const hora = (ev.horario_gravacao || "00:00").slice(0, 5);
  const ms = Date.parse(`${ev.data}T${hora}:00-03:00`);
  return Number.isNaN(ms) ? null : ms;
};

const loadIdSet = (key: string): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(key) || "[]") as string[]); } catch { return new Set(); }
};
const saveIdSet = (key: string, set: Set<string>) => {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* storage indisponível */ }
};

/**
 * Sincroniza os botões de automação com a agenda — SOMENTE para o estúdio "podcast".
 * Gatilho: 1h antes do horário da agenda (gravações) ou exatamente no horário (AO VIVO).
 * Trava de segurança: botões personalizados só são acionados automaticamente em eventos AO VIVO.
 */
function useAgendaPodcastTriggers({
  user, studioName, programas, customButtons, runCommandsUnified, toast,
}: {
  user: any;
  studioName: string;
  programas: any[];
  customButtons: any[];
  runCommandsUnified: (cmds: any[], label: string) => Promise<void>;
  toast: (a: any) => void;
}) {
  const isPodcastStudio = normStudio(studioName).includes("podcast");
  const [eventos, setEventos] = useState<AgendaEventoLite[]>([]);
  const [rejected, setRejected] = useState<Set<string>>(() => new Set());
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set());
  const firedRef = useRef<Set<string>>(new Set());
  const streamingFiredRef = useRef<Set<string>>(new Set());
  const [tick, setTick] = useState(() => Date.now());

  const rejectedKey = `vmix_agenda_rejeitados:${user?.id || "anon"}`;
  const confirmedKey = `vmix_agenda_confirmados:${user?.id || "anon"}`;
  const firedKey = `vmix_agenda_disparados:${user?.id || "anon"}`;
  const streamingFiredKey = `vmix_agenda_start_streaming_disparados:${user?.id || "anon"}`;

  useEffect(() => {
    setRejected(loadIdSet(rejectedKey));
    setConfirmed(loadIdSet(confirmedKey));
    firedRef.current = loadIdSet(firedKey);
    streamingFiredRef.current = loadIdSet(streamingFiredKey);
  }, [rejectedKey, confirmedKey, firedKey, streamingFiredKey]);

  useEffect(() => {
    if (!isPodcastStudio) return;
    const id = window.setInterval(() => setTick(Date.now()), 20000);
    return () => window.clearInterval(id);
  }, [isPodcastStudio]);

  const podcastProgramas = useMemo(
    () => programas.filter((p: any) => matchesStudio(p.estudio, studioName)),
    [programas, studioName],
  );

  const loadEventos = useCallback(async () => {
    if (!user || !isPodcastStudio) return;
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const { data } = await supabase
      .from("agenda_eventos")
      .select("id, programa_id, data, horario_gravacao, horario_gravacao_fim, tipo_evento, descricao, status")
      .eq("user_id", user.id)
      .gte("data", hoje)
      .order("data", { ascending: true });
    if (data) {
      setEventos(
        data
          .map(normalizeAgendaEvento)
          .filter((evento): evento is AgendaEventoLite => evento !== null)
          .filter((evento) => !["cancelado", "concluido", "concluído"].includes((evento.status || "").toLowerCase())),
      );
    }
  }, [user, isPodcastStudio]);

  useEffect(() => { loadEventos(); }, [loadEventos]);

  // Mantém a Automação sincronizada quando a Agenda é alterada em outra tela,
  // sem exigir que o operador recarregue o Switcher.
  useEffect(() => {
    if (!user || !isPodcastStudio) return;

    const channel = supabase
      .channel(`vmix-agenda-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agenda_eventos", filter: `user_id=eq.${user.id}` },
        () => { void loadEventos(); },
      )
      .subscribe();

    const id = window.setInterval(() => {
      void loadEventos();
    }, 5000);

    return () => {
      window.clearInterval(id);
      supabase.removeChannel(channel);
    };
  }, [user, isPodcastStudio, loadEventos]);

  /** próximo evento válido (não rejeitado) por programa */
  const eventoPorPrograma = useMemo(() => {
    const map: Record<string, AgendaEventoLite> = {};
    if (!isPodcastStudio) return map;
    const validIds = new Set(podcastProgramas.map((p: any) => p.id));
    const candidates = eventos
      .map(ev => {
        const programaId = resolveAgendaEventoProgramaId(ev, podcastProgramas);
        const programa = podcastProgramas.find((p: any) => p.id === programaId);
        return { ev, programaId, ms: eventoStartMs(ev), endMs: eventoEndMs(ev, programa) };
      })
      .filter(item => item.programaId && validIds.has(item.programaId) && isRecordingEvento(item.ev.tipo_evento) && !rejected.has(item.ev.id))
      .filter(item => item.ms !== null && item.endMs !== null && (item.endMs as number) > tick)
      .sort((a, b) => (a.ms as number) - (b.ms as number));
    for (const { ev, programaId } of candidates) {
      if (!map[programaId as string]) map[programaId as string] = ev;
    }
    return map;
  }, [eventos, rejected, podcastProgramas, isPodcastStudio, tick]);

  /** Próximo evento especificamente AO VIVO por programa, usado pelos botões StartStreaming. */
  const liveEventoPorPrograma = useMemo(() => {
    const map: Record<string, AgendaEventoLite> = {};
    if (!isPodcastStudio) return map;

    const validIds = new Set(podcastProgramas.map((p: any) => p.id));
    const candidates = eventos
      .map(ev => {
        const programaId = resolveAgendaEventoProgramaId(ev, podcastProgramas);
        const programa = podcastProgramas.find((p: any) => p.id === programaId);
        const ms = eventoStartMs(ev);
        return { ev, programaId, ms, endMs: eventoEndMs(ev, programa) };
      })
      .filter(item => item.programaId && validIds.has(item.programaId) && isLiveEvento(item.ev.tipo_evento) && !rejected.has(item.ev.id))
      .filter(item => item.ms !== null && item.endMs !== null && (item.ms as number) <= tick && tick < (item.endMs as number))
      .sort((a, b) => (a.ms as number) - (b.ms as number));

    for (const { ev, programaId } of candidates) {
      if (!map[programaId as string]) map[programaId as string] = ev;
    }
    return map;
  }, [eventos, rejected, podcastProgramas, isPodcastStudio, tick]);

  const confirmarEvento = useCallback((ev: AgendaEventoLite) => {
    setConfirmed(prev => {
      const next = new Set(prev); next.add(ev.id); saveIdSet(confirmedKey, next); return next;
    });
    const live = isLiveEvento(ev.tipo_evento);
    toast({
      title: "Evento confirmado",
      description: live
        ? `Disparo AO VIVO exatamente às ${(ev.horario_gravacao || "").slice(0, 5)}.`
        : `Disparo automático 1 hora antes de ${(ev.horario_gravacao || "").slice(0, 5)}.`,
    });
  }, [confirmedKey, toast]);

  const rejeitarEvento = useCallback((ev: AgendaEventoLite) => {
    setRejected(prev => { const next = new Set(prev); next.add(ev.id); saveIdSet(rejectedKey, next); return next; });
    setConfirmed(prev => { const next = new Set(prev); next.delete(ev.id); saveIdSet(confirmedKey, next); return next; });
    setTick(Date.now());
    toast({ title: "Evento desconsiderado", description: "Buscando o próximo evento agendado." });
  }, [rejectedKey, confirmedKey, toast]);

  // Os presets do PODCAST são disparados pelo efeito central do Switcher apenas durante o intervalo ativo da Agenda.

  // Botões personalizados LIVE/StartStreaming só disparam no início de um evento AO VIVO da Agenda.
  useEffect(() => {
    if (!isPodcastStudio || !user) return;
    const now = Date.now();

    for (const evento of eventos) {
      if (!isLiveEvento(evento.tipo_evento) || rejected.has(evento.id)) continue;
      const startMs = eventoStartMs(evento);
      if (startMs === null || now < startMs || now >= startMs + 120_000) continue;
      const programaId = resolveAgendaEventoProgramaId(evento, podcastProgramas);
      if (!programaId) continue;

      const buttons = customButtons.filter((button: any) =>
        resolveButtonProgramaId(button, podcastProgramas) === programaId &&
        (hasStartStreamingCommand(button) || isLiveAutomationButton(button)) &&
        Array.isArray(button.commands) && button.commands.length > 0
      );

      for (const button of buttons) {
        const executionId = `agenda-live:${evento.id}:${button.id}`;
        if (streamingFiredRef.current.has(executionId)) continue;
        streamingFiredRef.current.add(executionId);
        saveIdSet(streamingFiredKey, streamingFiredRef.current);
        void runCommandsUnified(button.commands as any[], `Agenda AO VIVO: ${button.nome}`);
        toast({
          title: "Ação LIVE disparada pela Agenda",
          description: `${button.nome} — ${evento.data} às ${(evento.horario_gravacao || "--:--").slice(0, 5)}`,
        });
      }
    }
  }, [tick, eventos, rejected, isPodcastStudio, user, customButtons, podcastProgramas, runCommandsUnified, toast, streamingFiredKey]);

  return { isPodcastStudio, eventos, eventoPorPrograma, liveEventoPorPrograma, confirmed, confirmarEvento, rejeitarEvento, agendaTick: tick };
}

// Actual Switcher UI (used when effectiveConnected)

function SwitcherUI({ 
  inputs, activeInput, previewInput, connectionMode, savedUrl, vmixFetch, vmixUser, vmixPass,
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
  customButtons, setCustomButtons, dragCustomButtonId, setDragCustomButtonId, reorderCustomButton,
  dragCustomCategory, setDragCustomCategory, customButtonCategoryOrder, reorderCustomCategory, assignCustomButtonCategory,
  editingCustomButtonId, setEditingCustomButtonId,
  activeCustomButton, setActiveCustomButton, user, runCommandsUnified,
  loadProgramas, loadCustomButtons, setVmixLogs, ndiScanning, scanNdiSources,
  ndiInputs, inputMapping,
  navigate,
  currentTime
}: any) {
  const isAutomationRoute = window.location.pathname === "/vmix-control/automation";
  const defaultButtonPoints = { CAMERAS: 1, DIVS: 0.5, COMERCIAL: 1.5, EFEITOS: 2.5, QUADROS: 1.5 };
  const buttonPointsStorageKey = `vmix_button_points:${user?.id || "anonymous"}:${normStudio(studioName) || "all"}`;
  const [buttonPoints, setButtonPoints] = useState<Record<keyof typeof defaultButtonPoints, number>>(defaultButtonPoints);
  const [buttonPointsDraft, setButtonPointsDraft] = useState<Record<keyof typeof defaultButtonPoints, string>>({
    CAMERAS: "1", DIVS: "0.5", COMERCIAL: "1.5", EFEITOS: "2.5", QUADROS: "1.5",
  });
  const [buttonPointsDialogOpen, setButtonPointsDialogOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(buttonPointsStorageKey) || "null");
      const normalized = { ...defaultButtonPoints, ...(saved && typeof saved === "object" ? saved : {}) };
      setButtonPoints(normalized);
      setButtonPointsDraft(Object.fromEntries(Object.entries(normalized).map(([key, value]) => [key, String(value)])) as Record<keyof typeof defaultButtonPoints, string>);
    } catch {
      setButtonPoints(defaultButtonPoints);
      setButtonPointsDraft({ CAMERAS: "1", DIVS: "0.5", COMERCIAL: "1.5", EFEITOS: "2.5", QUADROS: "1.5" });
    }
  }, [buttonPointsStorageKey]);

  const saveButtonPoints = () => {
    const categories = Object.keys(defaultButtonPoints) as Array<keyof typeof defaultButtonPoints>;
    const next = { ...defaultButtonPoints };
    for (const category of categories) {
      const raw = buttonPointsDraft[category].trim().replace(",", ".");
      const value = Number(raw);
      if (!raw || !Number.isFinite(value) || value < 0 || value > 9999) {
        toast({ title: "Pontuação inválida", description: `Informe um valor entre 0 e 9999 para ${category}.`, variant: "destructive" });
        return;
      }
      next[category] = value;
    }
    setButtonPoints(next);
    localStorage.setItem(buttonPointsStorageKey, JSON.stringify(next));
    setButtonPointsDialogOpen(false);
    toast({ title: "Pontuação salva", description: "Os próximos cliques usarão os novos valores." });
  };

  // O painel de logs é ocultado nas abas de visualização isolada dos botões.
  const buttonPreviewMode = new URLSearchParams(window.location.search).get("buttonPreview");
  const isButtonDevicePreview = ["mobile", "tablet", "desktop"].includes(buttonPreviewMode || "");

  const [onAirBlinkOn, setOnAirBlinkOn] = useState(true);
  useEffect(() => {
    const blinkTimer = window.setInterval(() => setOnAirBlinkOn(value => !value), 500);
    return () => window.clearInterval(blinkTimer);
  }, []);

  const [presetSortMode, setPresetSortMode] = useState<"horario" | "dias" | "alfabetica">("horario");
  const [isAllPresetsDialogOpen, setIsAllPresetsDialogOpen] = useState(false);

  // Tamanho do texto dos botões personalizados (persistido)
  // Estado da música pertence ao SwitcherUI, que renderiza o quadro NO AR.
  const [liveTrackData, setLiveTrackData] = useState<{ titulo?: string; artista?: string; capa?: string; duracao?: number } | null>(null);

  // A leitura e a atualização ficam no mesmo componente que desenha o quadro NO AR.
  const musicDataUserIds = useMemo(() => {
    const clientAccount = user
      ? (findClientAccountByEmail(user.email || "") || findClientAccountById(user.id))
      : null;
    const ids = [
      clientAccount && !clientAccount.isAdmin ? clientAccount.id : null,
      clientAccount?.parentUserId,
      user?.id && !clientAccount?.isAdmin ? user.id : null,
      clientAccount?.isAdmin || !user?.id ? "d17e65af-e407-466f-9b60-b55c43399513" : null,
    ].filter(Boolean) as string[];
    return Array.from(new Set(ids));
  }, [user?.id, user?.email]);

  useEffect(() => {
    let disposed = false;
    const applyTrack = (track: any, displayArt?: string) => {
      if (disposed || !track || !(track.titulo || track.artista || track.capa || displayArt)) return;
      setLiveTrackData({
        titulo: track.titulo || "",
        artista: track.artista || "",
        capa: track.capa || displayArt || "",
        duracao: track.duracao,
      });
    };
    const hasTrackData = (track: any) => !!(track && (track.titulo || track.artista || track.capa));
    const sameTrack = (a: any, b: any) =>
      (a?.titulo || "") === (b?.titulo || "") &&
      (a?.artista || "") === (b?.artista || "") &&
      (a?.capa || "") === (b?.capa || "") &&
      Number(a?.duracao || 0) === Number(b?.duracao || 0);
    const readLatestMusic = () => {
      // Fonte principal: armazenamento compartilhado escrito pela tela Música no Ar.
      // Ler novamente a cada evento evita manter __lastPlayerMusicState obsoleto em primeiro plano.
      const storedTrack = musicDataUserIds
        .map((id) => readMusicData(id))
        .find((track) => hasTrackData(track));
      if (storedTrack) {
        setLiveTrackData((previous) => sameTrack(previous, storedTrack) ? previous : {
          titulo: storedTrack.titulo || "",
          artista: storedTrack.artista || "",
          capa: storedTrack.capa || "",
          duracao: storedTrack.duracao,
        });
        return;
      }
      // Fallback somente quando ainda não há faixa salva; nunca sobrescreve dados persistidos atuais.
      const playerState = (window as any).__lastPlayerMusicState;
      const playerTrack = playerState?.currentMusic;
      if (hasTrackData(playerTrack)) {
        const fallback = { ...playerTrack, capa: playerTrack.capa || playerState.displayArt || "" };
        setLiveTrackData((previous) => sameTrack(previous, fallback) ? previous : fallback);
      }
    };
    const onPlayerMusic = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      // O evento pode chegar antes da gravação no storage; reler em seguida no polling/evento de storage.
      if (detail?.userId && !musicDataUserIds.includes(detail.userId)) return;
      readLatestMusic();
    };
    const onStoredMusic = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.userId && !musicDataUserIds.includes(detail.userId)) return;
      readLatestMusic();
    };
    readLatestMusic();
    window.addEventListener("player:music", onPlayerMusic as EventListener);
    window.addEventListener(MUSIC_DATA_EVENT, onStoredMusic as EventListener);
    window.addEventListener("storage", readLatestMusic);
    const intervalId = window.setInterval(readLatestMusic, 1000);
    return () => {
      disposed = true;
      window.removeEventListener("player:music", onPlayerMusic as EventListener);
      window.removeEventListener(MUSIC_DATA_EVENT, onStoredMusic as EventListener);
      window.removeEventListener("storage", readLatestMusic);
      window.clearInterval(intervalId);
    };
  }, [musicDataUserIds]);

  const [customButtonToolsOpen, setCustomButtonToolsOpen] = useState(false);
  const customButtonToolsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!customButtonToolsOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (customButtonToolsRef.current && !customButtonToolsRef.current.contains(event.target as Node)) {
        setCustomButtonToolsOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [customButtonToolsOpen]);

  const [customBtnTextScale, setCustomBtnTextScale] = useState<number>(() => {
    try {
      return Number(localStorage.getItem("vmix_custom_btn_text_scale")) || 1;
    } catch {
      return 1;
    }
  });
  const cycleCustomBtnTextScale = () => {
    setCustomBtnTextScale((prev) => {
      const next = prev >= 1.6 ? 1 : Math.round((prev + 0.2) * 10) / 10;
      try {
        localStorage.setItem("vmix_custom_btn_text_scale", String(next));
      } catch {
        /* storage indisponível */
      }
      return next;
    });
  };
  const [creationChoiceOpen, setCreationChoiceOpen] = useState(false);
  const [customButtonCategoryFilter, setCustomButtonCategoryFilter] = useState("TODOS");
  const creationChoiceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!creationChoiceOpen) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (creationChoiceRef.current && !creationChoiceRef.current.contains(event.target as Node)) {
        setCreationChoiceOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [creationChoiceOpen]);
  const [creatingAudioMonitor, setCreatingAudioMonitor] = useState(false);
  const [audioMonitorInput, setAudioMonitorInput] = useState("");
  const [audioMonitorName, setAudioMonitorName] = useState("");
  const [audioCreateOpen, setAudioCreateOpen] = useState(false);
  const [editingAudioMonitor, setEditingAudioMonitor] = useState<any | null>(null);
  const [editingAudioMonitorInput, setEditingAudioMonitorInput] = useState("");
  const [audioThresholdEnabled, setAudioThresholdEnabled] = useState(false);
  const [audioThresholdDb, setAudioThresholdDb] = useState(-10);
  const [audioThresholdActionInput, setAudioThresholdActionInput] = useState("");
  const [savingAudioMonitor, setSavingAudioMonitor] = useState(false);
  const audioThresholdLatchRef = useRef<Record<string, boolean>>({});
  const audioThresholdInitializedRef = useRef<Record<string, boolean>>({});
  const [audioMeterLevels, setAudioMeterLevels] = useState<Record<string, { left: number; right: number; available: boolean; updatedAt: number }>>({});

  // Lê os medidores reais meterF1 (Left) e meterF2 (Right) da API XML do vMix.
  // A consulta só roda quando há monitores de áudio e a conexão com o vMix está ativa.
  useEffect(() => {
    const monitoredInputs = Array.from(new Set(
      (customButtons || [])
        .map((button: any) => getAudioMonitorInput(button))
        .filter((value): value is string => Boolean(value)),
    ));
    if (!connected || !savedUrl || monitoredInputs.length === 0) return;

    let stopped = false;
    let timer: number | undefined;
    let requestInFlight = false;

    const readMeters = async () => {
      if (stopped || requestInFlight) return;
      requestInFlight = true;
      try {
        const xmlText = await vmixFetch("/api/");
        if (stopped) return;
        const xml = new DOMParser().parseFromString(normalizeVmixXmlText(xmlText), "text/xml");
        if (xml.getElementsByTagName("parsererror").length) return;

        const next: Record<string, { left: number; right: number; available: boolean; updatedAt: number }> = {};
        for (const inputNumber of monitoredInputs) {
          const inputNode = Array.from(xml.getElementsByTagName("input")).find((node) =>
            node.getAttribute("number") === inputNumber ||
            node.getAttribute("key") === inputNumber ||
            node.getAttribute("guid") === inputNumber
          );
          const leftRaw = inputNode?.getAttribute("meterF1");
          const rightRaw = inputNode?.getAttribute("meterF2");
          const left = leftRaw !== null && leftRaw.trim() !== "" ? Number(leftRaw) : NaN;
          const right = rightRaw !== null && rightRaw.trim() !== "" ? Number(rightRaw) : NaN;
          const available = Number.isFinite(left) && Number.isFinite(right);
          next[String(inputNumber)] = {
            left: available ? Math.max(0, Math.min(1, left)) : 0,
            right: available ? Math.max(0, Math.min(1, right)) : 0,
            available,
            updatedAt: Date.now(),
          };
        }
        setAudioMeterLevels(previous => ({ ...previous, ...next }));

        // Gatilho por nível: dispara apenas na subida do limite e rearma quando o áudio cai 3 dB.
        for (const button of customButtons || []) {
          const monitoredInput = getAudioMonitorInput(button);
          if (!monitoredInput || !next[monitoredInput]?.available) continue;
          const monitorCommand = Array.isArray(button.commands)
            ? button.commands.find((command: any) => command?.fn === "AudioMonitor")
            : null;
          if (!monitorCommand?.thresholdEnabled || !monitorCommand?.thresholdActionInput) continue;

          const meter = next[monitoredInput];
          const leftDb = meter.left > 0 ? 20 * Math.log10(meter.left) : -60;
          const rightDb = meter.right > 0 ? 20 * Math.log10(meter.right) : -60;
          const averageDb = (leftDb + rightDb) / 2;
          const threshold = Number(monitorCommand.thresholdDb ?? -10);
          const key = String(button.id);
          if (!audioThresholdInitializedRef.current[key]) {
            audioThresholdLatchRef.current[key] = averageDb >= threshold;
            audioThresholdInitializedRef.current[key] = true;
            continue;
          }
          if (averageDb < threshold - 3) {
            audioThresholdLatchRef.current[key] = false;
            continue;
          }
          if (averageDb >= threshold && !audioThresholdLatchRef.current[key]) {
            audioThresholdLatchRef.current[key] = true;
            void runCommandsUnified([{ fn: "Cut", input: String(monitorCommand.thresholdActionInput) }], `Gatilho de áudio: ${button.nome || monitoredInput}`, true);
          }
        }
      } catch {
        // Falhas transitórias não derrubam o switcher; a próxima consulta tenta novamente.
      } finally {
        requestInFlight = false;
        if (!stopped) timer = window.setTimeout(readMeters, 150);
      }
    };

    void readMeters();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [connected, savedUrl, customButtons, vmixFetch, runCommandsUnified]);

  const createAudioMonitor = async () => {
    if (!user || !audioMonitorInput || !audioMonitorName.trim()) return;
    const selectedInput = inputs.find((input: VmixInput) => input.number === audioMonitorInput);
    setCreatingAudioMonitor(true);
    try {
      const { error } = await (supabase.from("custom_vmix_buttons" as any) as any).insert({
        user_id: user.id,
        estudio: studioName || null,
        nome: audioMonitorName.trim(),
        category: "AUDIO",
        audio_input: audioMonitorInput,
        commands: [{ fn: "AudioMonitor", input: audioMonitorInput, _buttonCategory: "AUDIO" }],
      });
      if (error) throw error;
      await loadCustomButtons();
      setAudioMonitorInput("");
      setAudioMonitorName("");
      setAudioCreateOpen(false);
      setCreationChoiceOpen(false);
      toast({ title: "Monitor de áudio criado", description: `Input ${audioMonitorInput} adicionado aos botões personalizados.` });
    } catch (error: any) {
      toast({ title: "Erro ao criar monitor", description: error?.message || "Não foi possível criar o monitor de áudio.", variant: "destructive" });
    } finally {
      setCreatingAudioMonitor(false);
    }
  };

  const openAudioMonitorEditor = (button: any) => {
    setEditingAudioMonitor(button);
    setEditingAudioMonitorInput(getAudioMonitorInput(button) === "—" ? "" : getAudioMonitorInput(button) || "");
    const monitorCommand = Array.isArray(button?.commands) ? button.commands.find((command: any) => command?.fn === "AudioMonitor") : null;
    setAudioThresholdEnabled(monitorCommand?.thresholdEnabled === true);
    setAudioThresholdDb(Number.isFinite(Number(monitorCommand?.thresholdDb)) ? Number(monitorCommand.thresholdDb) : -10);
    setAudioThresholdActionInput(monitorCommand?.thresholdActionInput ? String(monitorCommand.thresholdActionInput) : "");
  };

  const saveAudioMonitorInput = async () => {
    if (!editingAudioMonitor || !editingAudioMonitorInput) return;
    const selectedInput = inputs.find((input: VmixInput) => input.number === editingAudioMonitorInput);
    setSavingAudioMonitor(true);
    try {
      const commands = Array.isArray(editingAudioMonitor.commands) ? editingAudioMonitor.commands : [];
      const hasAudioMonitorCommand = commands.some((command: any) => command?.fn === "AudioMonitor");
      const thresholdSettings = {
        thresholdEnabled: audioThresholdEnabled,
        thresholdDb: audioThresholdDb,
        thresholdActionFn: "Cut",
        thresholdActionInput: audioThresholdActionInput,
      };
      const updatedCommands = hasAudioMonitorCommand
        ? commands.map((command: any) => command?.fn === "AudioMonitor" ? { ...command, input: editingAudioMonitorInput, ...thresholdSettings } : command)
        : [{ fn: "AudioMonitor", input: editingAudioMonitorInput, ...thresholdSettings }];
      const { error } = await (supabase.from("custom_vmix_buttons" as any) as any)
        .update({
          nome: `Áudio · ${selectedInput?.title || `Input ${editingAudioMonitorInput}`}`,
          category: "AUDIO",
          commands: updatedCommands.map((command: any, index: number) => index === 0 ? { ...command, _buttonCategory: "AUDIO" } : command),
          audio_input: editingAudioMonitorInput,
        })
        .eq("id", editingAudioMonitor.id);
      if (error) throw error;
      await loadCustomButtons();
      setEditingAudioMonitor(null);
      toast({ title: "Monitor atualizado", description: `Monitorando o Input ${editingAudioMonitorInput}.` });
    } catch (error: any) {
      toast({ title: "Erro ao atualizar monitor", description: error?.message || "Não foi possível atualizar o input monitorado.", variant: "destructive" });
    } finally {
      setSavingAudioMonitor(false);
    }
  };

  const deleteAudioMonitor = async (button: any) => {
    const confirmed = await confirmDialog({
      title: "Excluir Monitor de Áudio",
      message: `Excluir o monitor de áudio "${button.nome}"?`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!confirmed) return;
    const { error } = await (supabase.from("custom_vmix_buttons" as any) as any).delete().eq("id", button.id);
    if (error) {
      toast({ title: "Erro ao excluir monitor", description: error.message, variant: "destructive" });
      return;
    }
    await loadCustomButtons();
    toast({ title: "Monitor de áudio excluído" });
  };

  // Relógio de 1s — alimenta o contador regressivo dos programas no ar
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Sincronização dos botões de automação com a agenda (apenas estúdio podcast)
  const {
    isPodcastStudio,
    eventos,
    eventoPorPrograma,
    liveEventoPorPrograma,
    confirmed: agendaConfirmados,
    confirmarEvento,
    rejeitarEvento,
  } = useAgendaPodcastTriggers({ user, studioName, programas, customButtons, runCommandsUnified, toast });

  // No PODCAST, a automação DEFAUL/DEFAULT funciona como estado neutro.
  // Enquanto ela estiver ativa, nenhum outro botão da Automação recebe destaque visual.
  const isDefaultAutomationActive = useMemo(() => {
    if (!isPodcastStudio) return false;
    const normalizeAutomationName = (value?: string | null) =>
      (value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
    const isDefaultName = (value?: string | null) => {
      const name = normalizeAutomationName(value);
      return name === "defaul" || name === "default";
    };

    return isDefaultName(programas.find((programa: Programa) => programa.id === activePreset)?.nome)
      || isDefaultName(customButtons.find((button: any) => button.id === activeCustomButton)?.nome);
  }, [isPodcastStudio, programas, customButtons, activePreset, activeCustomButton]);

  // Deriva o programa previsto no ar a partir da grade atual do estúdio selecionado.
  const scheduledProgramForAutomation = useMemo(() => {
    const now = new Date(nowTick);
    const dayNames = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    const today = dayNames[now.getDay()];
    const minute = now.getHours() * 60 + now.getMinutes();
    const todaysPrograms = (programas || []).filter((programa: Programa) => {
      if (!matchesStudio(programa.estudio, studioName)) return false;
      if (!programa.dias_semana || programa.dias_semana.length === 0) return true;
      return programa.dias_semana.some((day: string) => {
        const normalized = String(day || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-.,]/g, "").trim().slice(0, 3);
        return normalized === today || normalized === String(now.getDay());
      });
    });
    return todaysPrograms.find((programa: Programa) => {
      if (!programa.horario_inicio || !programa.horario_fim) return false;
      const [sh, sm] = String(programa.horario_inicio).slice(0, 5).split(":").map(Number);
      const [eh, em] = String(programa.horario_fim).slice(0, 5).split(":").map(Number);
      if (![sh, sm, eh, em].every(Number.isFinite)) return false;
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      return end > start ? minute >= start && minute < end : minute >= start || minute < end;
    }) || null;
  }, [programas, studioName, nowTick]);

  // A seleção manual vale até a grade avançar para outro programa previsto.
  const previousScheduledProgramIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const nextScheduledId = scheduledProgramForAutomation?.id || null;
    const previousScheduledId = previousScheduledProgramIdRef.current;
    previousScheduledProgramIdRef.current = nextScheduledId;
    if (previousScheduledId !== undefined && nextScheduledId && previousScheduledId !== nextScheduledId) {
      setActivePreset((current: string | null) => current && current !== nextScheduledId ? null : current);
    }
  }, [scheduledProgramForAutomation?.id, setActivePreset]);

  // O preset destacado em verde também dispara suas ações automaticamente, uma única vez por programa/dia.
  const lastAutoPresetKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!connected || !savedUrl || !user?.id || isDefaultAutomationActive) return;
    const now = new Date(nowTick);
    const dayNames = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    const todayPrograms = (programas || []).filter((programa: Programa) => {
      if (!matchesStudio(programa.estudio, studioName)) return false;
      if (!programa.dias_semana || programa.dias_semana.length === 0) return true;
      return programa.dias_semana.some((day: string) => {
        const normalized = String(day || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-.,]/g, "").trim().slice(0, 3);
        return normalized === dayNames[now.getDay()] || normalized === String(now.getDay());
      });
    });
    const selected = activePreset ? todayPrograms.find((programa: Programa) => programa.id === activePreset) : null;
    const nowMs = now.getTime();
    const podcastProgramas = (programas || []).filter((programa: Programa) => matchesStudio(programa.estudio, studioName));
    const activePodcastEvent = isPodcastStudio
      ? Object.values(eventoPorPrograma).find((evento) => {
          const programaId = resolveAgendaEventoProgramaId(evento, podcastProgramas);
          const programa = podcastProgramas.find((item: any) => item.id === programaId);
          const startMs = eventoStartMs(evento);
          const endMs = eventoEndMs(evento, programa);
          return !!programa && startMs !== null && endMs !== null && startMs <= nowMs && nowMs < endMs
            && (isLiveEvento(evento.tipo_evento) || isRecordingEvento(evento.tipo_evento));
        })
      : undefined;
    const activeProgram = isPodcastStudio
      ? activePodcastEvent
        ? podcastProgramas.find((programa: any) => programa.id === resolveAgendaEventoProgramaId(activePodcastEvent, podcastProgramas))
        : null
      : selected || scheduledProgramForAutomation;
    if (!activeProgram) return;
    const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const executionKey = `${user.id}:${studioName || "default"}:${dayKey}:${isPodcastStudio ? activePodcastEvent?.id : activeProgram.id}`;
    if (lastAutoPresetKeyRef.current === executionKey) return;
    lastAutoPresetKeyRef.current = executionKey;
    void (async () => {
      try {
        const { data: presetData, error } = await (supabase.from("preset_commands" as any) as any)
          .select("commands")
          .eq("user_id", user.id)
          .eq("programa_id", activeProgram.id)
          .maybeSingle();
        if (error) throw error;
        const commands = Array.isArray(presetData?.commands) && presetData.commands.length > 0
          ? [...presetData.commands]
          : [{ fn: "ScriptStart", input: activeProgram.nome }];
        const presenterName = (activeProgram as any).apresentadores?.nome;
        if (presenterName) commands.push({ fn: "SetText", input: "TITULO APRESENTADOR", value: presenterName, label: "Apresentador Automático" });
        const sent = await runCommandsUnified(commands, `Preset NO AR: ${activeProgram.nome}`, true);
        if (!sent) {
          window.setTimeout(() => {
            if (lastAutoPresetKeyRef.current === executionKey) lastAutoPresetKeyRef.current = null;
          }, 5000);
        }
      } catch (error) {
        window.setTimeout(() => {
          if (lastAutoPresetKeyRef.current === executionKey) lastAutoPresetKeyRef.current = null;
        }, 5000);
        console.error("[vmix-switcher] Falha ao preparar ações do preset no ar:", error);
      }
    })();
  }, [connected, savedUrl, user?.id, studioName, programas, activePreset, nowTick, isDefaultAutomationActive, scheduledProgramForAutomation, runCommandsUnified, isPodcastStudio, eventoPorPrograma]);

  // ── Connected layout ──
  const activeInputObj = inputs.find((i: any) => i.number === activeInput);


  // Categorias do switcher (por usuário + estúdio), com drag and drop
  const {
    categorias: switcherCategorias,
    criar: criarCategoria,
    excluir: excluirCategoria,
    setInputs: setInputsCategoria,
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
  }, [programas, nowTick]);

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
  }, [programas, currentProgram, nowTick, studioName]);

  // No estúdio PODCAST, o cabeçalho é controlado exclusivamente pelos eventos da Agenda.
  // A duração do evento segue o intervalo cadastrado para o programa correspondente.
  const podcastAgendaSchedule = useMemo(() => {
    if (!isPodcastStudio) return [];

    const programaPorId = new Map<string, Programa>(
      programas
        .filter((programa: Programa) => matchesStudio(programa.estudio, studioName))
        .map((programa: Programa) => [programa.id, programa] as [string, Programa]),
    );

    return eventos
      .map((evento) => {
        const resolvedProgramId = resolveAgendaEventoProgramaId(evento, [...programaPorId.values()]);
        const programa = resolvedProgramId ? programaPorId.get(resolvedProgramId) : undefined;
        const startMs = eventoStartMs(evento);
        if (!programa || startMs === null) return null;

        const endMs = eventoEndMs(evento, programa);
        if (endMs === null || (!isLiveEvento(evento.tipo_evento) && !isRecordingEvento(evento.tipo_evento))) return null;

        return {
          evento,
          programa,
          startMs,
          endMs,
        };
      })
      .filter((item): item is { evento: AgendaEventoLite; programa: Programa; startMs: number; endMs: number } => item !== null)
      .sort((a, b) => a.startMs - b.startMs);
  }, [isPodcastStudio, eventos, programas, studioName]);

  const podcastCurrentAgenda = useMemo(() => {
    const now = nowTick;
    return podcastAgendaSchedule.find((item) => item.startMs <= now && now < item.endMs) || null;
  }, [podcastAgendaSchedule, nowTick]);

  const podcastCurrentRecordingAgenda = useMemo(() => {
    const now = nowTick;
    return podcastAgendaSchedule.find((item) =>
      isRecordingEvento(item.evento.tipo_evento) && item.startMs <= now && now < item.endMs
    ) || null;
  }, [podcastAgendaSchedule, nowTick]);

  const podcastNextAgenda = useMemo(() => {
    const now = nowTick;
    return podcastAgendaSchedule.find((item) => item.startMs > now) || null;
  }, [podcastAgendaSchedule, nowTick]);

  const previousProgram = useMemo(() => {
    const { weekday, hhmm } = getZonedNow();
    const nowMinutes = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
    const dayNames = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    const normalizeDay = (value: string) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const matchesDay = (p: Programa, dayIndex: number) => {
      if (!p.dias_semana || p.dias_semana.length === 0) return true;
      const short = dayNames[dayIndex];
      return p.dias_semana.some((d) => {
        const normalized = normalizeDay(d);
        return normalized.startsWith(short) || normalized === String(dayIndex);
      });
    };
    const candidates = programas
      .filter((p: Programa) => matchesStudio(p.estudio, studioName) && p.horario_inicio && p.horario_fim && p.id !== currentProgram?.id)
      .flatMap((p: Programa) => {
        const [sh, sm] = String(p.horario_inicio).slice(0, 5).split(":").map(Number);
        const [eh, em] = String(p.horario_fim).slice(0, 5).split(":").map(Number);
        const start = sh * 60 + sm;
        let end = eh * 60 + em;
        if (![sh, sm, eh, em].every(Number.isFinite)) return [];
        if (end <= start) end += 1440;
        return [-1, 0].map((dayOffset) => ({
          p,
          absoluteStart: start + dayOffset * 1440,
          absoluteEnd: end + dayOffset * 1440,
          dayOffset,
        })).filter((item) => matchesDay(p, (weekday + item.dayOffset + 7) % 7) && item.absoluteEnd <= nowMinutes);
      })
      .sort((a, b) => b.absoluteEnd - a.absoluteEnd);
    return candidates[0]?.p || null;
  }, [programas, studioName, currentProgram, nowTick]);

  // No PODCAST, o quadro central representa exclusivamente um evento da Agenda
  // cujo dia/horário esteja ativo agora; a grade normal do programa não ativa o quadro.
  const headerCurrentProgram = isPodcastStudio ? podcastCurrentAgenda?.programa || null : currentProgram;
  const headerNextProgram = isPodcastStudio ? podcastNextAgenda?.programa || null : nextProgram;
  const headerCurrentSchedule = isPodcastStudio
    ? podcastCurrentAgenda
      ? `${isLiveEvento(podcastCurrentAgenda.evento.tipo_evento) ? "AO VIVO" : "GRAVAÇÃO"} · ${(podcastCurrentAgenda.evento.horario_gravacao || "--:--").slice(0, 5)}`
      : ""
    : headerCurrentProgram
      ? `${headerCurrentProgram.horario_inicio} - ${headerCurrentProgram.horario_fim}`
      : "";
  const headerNextSchedule = isPodcastStudio
    ? podcastNextAgenda
      ? `${isLiveEvento(podcastNextAgenda.evento.tipo_evento) ? "AO VIVO" : "GRAVAÇÃO"} · ${(podcastNextAgenda.evento.horario_gravacao || "--:--").slice(0, 5)}`
      : ""
    : headerNextProgram
      ? `${headerNextProgram.horario_inicio?.slice(0, 5)} - ${headerNextProgram.horario_fim?.slice(0, 5)}`
      : "";

  const currentProgramProgress = useMemo(() => {
    const start = timeToSeconds(headerCurrentProgram?.horario_inicio);
    const end = timeToSeconds(headerCurrentProgram?.horario_fim);
    if (start === null || end === null || !headerCurrentProgram) return 0;
    const now = new Date(nowTick);
    const current = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const duration = end > start ? end - start : 86400 - start + end;
    const elapsed = end > start
      ? Math.max(0, Math.min(duration, current - start))
      : Math.max(0, Math.min(duration, current >= start ? current - start : 86400 - start + current));
    return duration > 0 ? Math.round((elapsed / duration) * 10000) / 100 : 0;
  }, [headerCurrentProgram, nowTick]);




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
    <div className="w-full max-w-none mx-0 space-y-4 pb-20" style={{ color: "#e7e7e7" }}>
      <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl" style={{ backgroundColor: "#151517", display: isButtonDevicePreview ? "none" : undefined }}>
        <div className="grid min-h-[120px] grid-cols-1 gap-2 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] sm:gap-0 sm:p-0">
          <div className="group/previous relative flex min-w-0 flex-col justify-center overflow-hidden px-4 py-2 sm:px-6">
            {previousProgram?.apresentador_foto && <img src={previousProgram.apresentador_foto} alt="" aria-hidden="true" className="pointer-events-none absolute right-[78px] bottom-0 z-0 h-full max-h-[120px] w-[120px] object-contain object-bottom opacity-85 transition-opacity duration-200 group-hover/previous:opacity-100" />}
            <div className="relative z-10 min-w-0 pr-8">
              <span className="mb-1 block text-[8px] font-black uppercase tracking-[0.2em] text-white/55">PASSOU</span>
              <span className="block truncate text-[11px] font-black uppercase tracking-wide text-white/90">{previousProgram?.nome || "—"}</span>
              <span className="mt-0.5 block text-[9px] font-medium text-white/55 font-mono">{previousProgram ? `${previousProgram.horario_inicio?.slice(0,5) || "--:--"} - ${previousProgram.horario_fim?.slice(0,5) || "--:--"}` : "—"}</span>
            </div>
            <ArrowLeft size={20} strokeWidth={1.2} className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-white/75 transition-transform duration-200 group-hover/previous:-translate-x-1" />
          </div>
          <div className="relative isolate flex min-h-[120px] min-w-0 items-center justify-between gap-3 overflow-hidden px-3 text-white sm:gap-4" style={{ backgroundColor: "#17263b" }}>
            <style>{'@keyframes vmixOnAirEnter { 0% { opacity: 0; transform: translateY(10px) scale(.985); filter: blur(3px); } 100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } } @keyframes vmixOnAirBlink { 0%, 100% { opacity: 1; } 50% { opacity: .08; } } .vmix-onair-enter { animation: vmixOnAirEnter .55s cubic-bezier(.2,.7,.2,1) both; } .vmix-onair-blink { animation: vmixOnAirBlink .85s steps(2, end) infinite !important; will-change: opacity; }'}</style>
            <div aria-hidden="true" className="absolute inset-0 z-0 pointer-events-none overflow-hidden" style={{ width: currentProgramProgress + "%", backgroundColor: "#345578", opacity: 0.43, transition: "width 1s linear" }} />
            {!isPodcastStudio && <div key={`track-${liveTrackData?.titulo || ""}-${liveTrackData?.artista || ""}-${liveTrackData?.capa || ""}`} className="vmix-onair-enter relative z-10 flex min-w-0 items-center gap-2">
              {liveTrackData?.capa ? (
                <img src={liveTrackData?.capa} alt="" className="h-[58px] w-[58px] shrink-0 rounded-md object-cover" />
              ) : (
                <div className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-md"><Music2 size={20} /></div>
              )}
              <div className="min-w-0 w-[clamp(110px,24%,220px)] max-w-[220px] flex-[0_1_220px]">
                <div className="text-[10px] font-black uppercase tracking-wide leading-tight break-words" style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden", overflowWrap: "anywhere", maxHeight: "2.5em" }} title={liveTrackData?.titulo || "MÚSICA NÃO IDENTIFICADA"}>
                  {liveTrackData?.titulo || "MÚSICA NÃO IDENTIFICADA"}
                </div>
                <div className="mt-0.5 truncate text-[8px] font-medium text-white/75" title={liveTrackData?.artista || "Artista não informado"}>{liveTrackData?.artista || "Artista não informado"}</div>
              </div>
            </div>}
            <div key={`program-${headerCurrentProgram?.id || activeTitle}-${headerCurrentSchedule}`} className="vmix-onair-enter absolute inset-0 z-10 flex flex-col items-center justify-center text-center pointer-events-none">
              <span style={{ opacity: onAirBlinkOn ? 1 : 0.08, transition: "opacity 80ms linear" }} className="text-[8px] font-black uppercase tracking-[0.22em] text-white">NO AR</span>
              <span className="mt-1 max-w-[180px] truncate text-[12px] font-black uppercase tracking-[0.08em]">{headerCurrentProgram?.nome || (isPodcastStudio ? "SEM EVENTO NO MOMENTO" : activeTitle)}</span>
              <span className="mt-0.5 text-[9px] font-semibold text-white/85 font-mono">{headerCurrentSchedule || "—"}</span>
            </div>
            <div key={`presenter-${headerCurrentProgram?.apresentador_nome || ""}-${headerCurrentProgram?.apresentador_foto || ""}`} className="vmix-onair-enter relative z-10 ml-auto flex h-full shrink-0 items-center gap-2 pb-0">
              <div className="flex h-full min-w-0 flex-col items-end justify-center text-right">
                <Mic size={15} className="ml-auto" />
                <span className="mt-1 max-w-[132px] whitespace-nowrap text-right text-[8px] font-bold uppercase leading-tight">{headerCurrentProgram?.apresentador_nome || "LOCUTOR"}</span>
              </div>
              {headerCurrentProgram?.apresentador_foto ? (
                <img src={headerCurrentProgram.apresentador_foto} alt={headerCurrentProgram.apresentador_nome || "Locutor no ar"} className="h-[120px] w-[120px] self-end object-contain object-bottom opacity-90" />
              ) : (
                <div className="flex h-[118px] w-[100px] self-end items-center justify-center"><Mic size={20} /></div>
              )}
            </div>
          </div>
          <div className="group/next relative flex min-w-0 flex-col justify-center overflow-hidden px-4 py-2 sm:items-end sm:text-right sm:px-6">
            {headerNextProgram?.apresentador_foto && <img src={headerNextProgram.apresentador_foto} alt="" aria-hidden="true" className="pointer-events-none absolute left-[78px] bottom-0 z-0 h-full max-h-[120px] w-[120px] object-contain object-bottom opacity-85 transition-opacity duration-200 group-hover/next:opacity-100" />}
            <div className="relative z-10 min-w-0 pl-8">
              <span className="mb-1 block text-[8px] font-black uppercase tracking-[0.2em] text-white/55">A SEGUIR</span>
              <span className="block truncate text-[11px] font-black uppercase tracking-wide text-white/90">{headerNextProgram?.nome || "—"}</span>
              <span className="mt-0.5 block text-[9px] font-medium text-white/55 font-mono">{headerNextSchedule || "—"}</span>
            </div>
            <ArrowRight size={20} strokeWidth={1.2} className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-white/75 transition-transform duration-200 group-hover/next:translate-x-1" />
          </div>
        </div>
      </div>

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

      {/* Tab Content (Main Switcher Area) */}
      <div className={`rounded-2xl p-5 space-y-4 ${isAutomationRoute ? "border-0 bg-transparent" : "border border-white/10"}`} style={{ backgroundColor: isAutomationRoute ? "transparent" : "#1a1a1f", minHeight: 300 }}>


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
                      onReorderInput={(categoriaId, inputNumber, targetInputNumber) => {
                        const category = switcherCategorias.find(item => item.id === categoriaId);
                        if (!category) return;
                        const from = category.inputs.indexOf(inputNumber);
                        const to = category.inputs.indexOf(targetInputNumber);
                        if (from < 0 || to < 0) {
                          moverInputCategoria(inputNumber, categoriaId);
                          return;
                        }
                        const reordered = [...category.inputs];
                        const [moved] = reordered.splice(from, 1);
                        reordered.splice(to, 0, moved);
                        setInputsCategoria(categoriaId, reordered);
                      }}
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
                            className="group vmix-hover-ring relative h-20 rounded border font-bold text-[11px] flex flex-col items-center justify-center transition-all"
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
                            className="vmix-hover-ring h-16 rounded border text-[10px] font-black tracking-wider transition-all"
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
                        className="vmix-hover-ring h-14 rounded border text-[12px] font-black tracking-widest transition-all hover:brightness-110"
                        style={{ backgroundColor: "#C6F03C", color: "#000", borderColor: "#C6F03C", boxShadow: "0 0 12px rgba(198,240,60,0.35)" }}
                      >
                        CUT
                      </button>
                      <button
                        onClick={() => sendCommand("Fade", undefined, String(transitionDuration))}
                        className="vmix-hover-ring h-14 rounded border text-[12px] font-black tracking-widest transition-all hover:brightness-110"
                        style={{ backgroundColor: "#1a1a1a", color: "#C6F03C", borderColor: "#C6F03C50" }}
                      >
                        FADE
                      </button>
                      <button
                        onClick={() => sendCommand("Merge", undefined, String(transitionDuration))}
                        className="vmix-hover-ring h-14 rounded border text-[12px] font-black tracking-widest transition-all hover:brightness-110"
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
                            className="group vmix-hover-ring relative h-20 rounded border font-bold text-[11px] flex flex-col items-center justify-center transition-all"
                            style={{
                              backgroundColor: isActive ? "#dc2626" : "#1a1a1a",
                              color: isActive ? "#fff" : "#e5e5e5",
                              borderColor: isActive ? "#dc2626" : "#2a2a2a",
                              boxShadow: isActive ? "0 0 18px rgba(220,38,38,0.55), inset 0 1px 0 rgba(255,255,255,0.1)" : "inset 0 1px 0 rgba(255,255,255,0.04)",
                            }}
                          >
                            <span className="text-[10px] font-black opacity-70 leading-none">{input.number}</span>
                            <span className="truncate max-w-full px-1 leading-tight mt-1 uppercase tracking-tight">{input.title}</span>

                            {/* Keyboard Shortcut Indicator (estilo tecla de teclado, alto contraste) */}
                            <div
                              className={`absolute -top-1.5 -right-1.5 z-10 inline-flex items-center rounded px-2 py-0.5 text-[9px] font-black font-mono uppercase tracking-widest shadow-md transition-all ${
                                isCapturing ? "animate-pulse" : shortcut ? "" : "opacity-0 group-hover:opacity-100"
                              }`}
                              style={
                                isCapturing
                                  ? { backgroundColor: "#C6F03C", color: "#000", border: "1px solid #C6F03C" }
                                  : shortcut
                                    ? { backgroundColor: "#1f2937", color: "#ffffff", border: "1px solid rgba(255,255,255,0.45)" }
                                    : { backgroundColor: "#111827", color: "#9ca3af", border: "1px solid rgba(255,255,255,0.2)" }
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
          const buttonPreviewMode = new URLSearchParams(window.location.search).get("buttonPreview");
          const isButtonDevicePreview = ["mobile", "tablet", "desktop"].includes(buttonPreviewMode || "");
          const openButtonDevicePreview = (mode: "mobile" | "tablet" | "desktop") => {
            const url = new URL(window.location.href);
            url.searchParams.set("buttonPreview", mode);
            window.open(url.toString(), "_blank", "noopener,noreferrer");
          };
          const buttonPreviewWidth = buttonPreviewMode === "mobile" ? 390 : buttonPreviewMode === "tablet" ? 768 : buttonPreviewMode === "desktop" ? 1280 : undefined;
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
              <div className={`flex flex-col gap-4 ${isButtonDevicePreview ? "items-center" : ""}`}>
                {/* Left: Programas Preset */}
                {!isButtonDevicePreview && <div className="rounded-xl overflow-hidden" style={{ backgroundColor: isAutomationRoute ? "transparent" : "#1a1a1f", border: isAutomationRoute ? "1px solid transparent" : "1px solid #ffffff08" }}>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10" style={{ backgroundColor: "rgba(255,255,255,0.025)" }}>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Radio size={14} style={{ color: "#C6F03C" }} />
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#C6F03C" }}>PRESETS PROGRAMAS</span>
                      </div>
                      <button onClick={() => setEditingPresetId("new")} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-white transition-colors hover:brightness-110" style={{ backgroundColor: "#0756C9", color: "#FFFFFF", border: "1px solid #3985f6" }} title="Criar novo programa">
                        <Plus size={12} /><span className="text-[10px] font-black uppercase tracking-wider">nova automação</span>
                      </button>
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-white/65">
                        Presets para o dia de hoje: {new Date().toLocaleDateString("pt-BR", { weekday: "long" }).replace(/-feira$/, "")} / {new Date().toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAllPresetsDialogOpen(true)}
                      className="flex items-center gap-2 rounded-md border border-white/15 bg-[#26262D] px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:border-[#0756C9] hover:bg-[#0756C9]"
                      title="Editar todos os presets, de todos os dias e estúdios"
                    >
                      <Pencil size={12} /> Editar todos os presets
                    </button>
                  </div>
                  <div className="p-4 space-y-4">
                    {(() => {
                      const now = new Date();
                      const day = now.getDay();
                      const daysMap = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
                      const todayStr = daysMap[day];
                      const currentTimeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });

                      const normalizeDay = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-.,]/g, "").trim().slice(0, 3);
                      const isProgramForToday = (p: Programa) => {
                        if (!p.dias_semana || p.dias_semana.length === 0) return true;
                        return p.dias_semana.some(ds => normalizeDay(ds) === todayStr);
                      };

                      const isNowInProgram = (p: Programa) => {
                        if (!p.horario_inicio || !p.horario_fim) return false;
                        const start = p.horario_inicio.slice(0, 5);
                        const end = p.horario_fim.slice(0, 5);
                        return start < end ? currentTimeStr >= start && currentTimeStr < end : currentTimeStr >= start || currentTimeStr < end;
                      };

                      const hasSavedOrder = (() => { try { return JSON.parse(localStorage.getItem("vmix_preset_order") || "[]").length > 0; } catch { return false; } })();
                      const studioFilterActive = isStudioScoped(studioName);
                      // No PODCAST, listar todos os programas vinculados ao estúdio, mesmo
                      // quando não pertencem ao dia de hoje. A Agenda controla somente
                      // quando cada preset fica ativo, não se o botão deve existir.
                      const programasEstudio = programas.filter(p =>
                        matchesStudio(p.estudio, studioName) && (isPodcastStudio || isProgramForToday(p))
                      );
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
                      // Todos os presets desta faixa pertencem ao Estúdio FM.
                      // Mantemos uma única faixa horizontal para que nenhum programa
                      // (inclusive programas especiais como ELEITORAL) caia em outra linha.
                      const groups: Record<string, typeof ordered> = { "Estúdio FM": [...ordered] };
                      return Object.entries(groups).map(([studio, progs]) => {
                        const studioKey = studio.toLowerCase().replace(/[^a-z0-9]+/g, "-");
                        // Só pode existir um preset visualmente ativo: prioriza a seleção feita pelo operador;
                      // sem seleção manual, usa o primeiro programa válido da grade que cobre o horário atual.
                      const scheduledActiveProgram = progs.find((p) => isProgramForToday(p) && isNowInProgram(p));
                      const selectedProgramExists = activePreset && progs.some((p) => p.id === activePreset);
                      const activeProgramId = isPodcastStudio
                        ? (podcastCurrentRecordingAgenda && progs.some((p) => p.id === podcastCurrentRecordingAgenda.programa.id) ? podcastCurrentRecordingAgenda.programa.id : null)
                        : selectedProgramExists ? activePreset : scheduledActiveProgram?.id ?? null;

                      const sortedProgs = [...progs].sort((a, b) => {
                          const aOnAir = a.id === activeProgramId;
                          const bOnAir = b.id === activeProgramId;
                          // O único programa ativo fica sempre no primeiro botão do scroll.
                          if (aOnAir !== bOnAir) return Number(bOnAir) - Number(aOnAir);
                          // Ordena apenas a grade válida para o dia atual; programas de outros dias
                          // não entram na sequência horária de hoje. Os anteriores ficam após os próximos.
                          const now = new Date();
                          const currentMinutes = now.getHours() * 60 + now.getMinutes();
                          const startMinutes = (p: Programa) => {
                            const [hours, minutes] = String(p.horario_inicio || "00:00").slice(0, 5).split(":").map(Number);
                            return hours * 60 + minutes;
                          };
                          const aToday = isProgramForToday(a);
                          const bToday = isProgramForToday(b);
                          if (aToday !== bToday) return aToday ? -1 : 1;
                          if (!aToday && !bToday) {
                            const weekdayOrder = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
                            const dayIndex = (p: Programa) => {
                              const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().slice(0, 3);
                              const aliases: Record<string, string> = { domingo: "dom", segunda: "seg", terca: "ter", quarta: "qua", quinta: "qui", sexta: "sex", sabado: "sab" };
                              const days = ((p as any).dias_semana || []).map((d: string) => aliases[normalize(d)] || normalize(d));
                              const indexes = days.map((d: string) => weekdayOrder.indexOf(d)).filter((n: number) => n >= 0);
                              return indexes.length ? Math.min(...indexes) : 99;
                            };
                            return dayIndex(a) - dayIndex(b) || startMinutes(a) - startMinutes(b);
                          }
                          const aStart = startMinutes(a);
                          const bStart = startMinutes(b);
                          const aFuture = aStart > currentMinutes;
                          const bFuture = bStart > currentMinutes;
                          if (aFuture !== bFuture) return aFuture ? -1 : 1;
                          return aStart - bStart;
                        });
                        return (
                        <div key={studio}>
                          <div className="relative flex min-w-0 items-center gap-2">
                            <button type="button" aria-label="Rolar presets para a esquerda" onClick={() => document.getElementById(`preset-scroll-${studioKey}`)?.scrollBy({ left: -360, behavior: "smooth" })} className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0756c9] text-white hover:bg-[#0967ed]" title="Anterior"><ChevronLeft size={17} /></button>
                            <div id={`preset-scroll-${studioKey}`} className="flex min-w-0 flex-1 gap-2.5 overflow-x-auto overflow-y-hidden scroll-smooth px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {sortedProgs.map((prog) => {
                        const isActive = !isDefaultAutomationActive && activePreset === prog.id;
                        const progOnAir = !isDefaultAutomationActive && prog.id === activeProgramId;
                        const startTime = prog.horario_inicio?.slice(0, 5) || "";
                        const endTime = prog.horario_fim?.slice(0, 5) || "";
                        const agendaEvento = isPodcastStudio ? eventoPorPrograma[prog.id] : undefined;
                        const agendaConfirmado = agendaEvento ? agendaConfirmados.has(agendaEvento.id) : false;
                        const agendaLive = agendaEvento ? isLiveEvento(agendaEvento.tipo_evento) : false;
                        const agendaDataLabel = agendaEvento
                          ? `${agendaEvento.data.split("-").reverse().slice(0, 2).join("/")} · ${(agendaEvento.horario_gravacao || "--:--").slice(0, 5)}`
                          : "";
                        const podcastAgendaItem = isPodcastStudio && agendaEvento
                          ? podcastAgendaSchedule.find(item => item.evento.id === agendaEvento.id)
                          : undefined;

                        // No PODCAST, o contador segue exclusivamente a duração do evento da agenda.
                        // Nos demais estúdios, mantém o contador da grade de programação.
                        const nowSecs = (() => {
                          const d = new Date(nowTick);
                          return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
                        })();
                        const endSecs = timeToSeconds(prog.horario_fim);
                        const remaining = isPodcastStudio
                          ? podcastAgendaItem && podcastAgendaItem.startMs <= nowTick && nowTick < podcastAgendaItem.endMs
                            ? Math.max(0, Math.floor((podcastAgendaItem.endMs - nowTick) / 1000))
                            : null
                          : progOnAir && endSecs !== null
                            ? (endSecs >= nowSecs ? endSecs - nowSecs : endSecs + 86400 - nowSecs)
                            : null;

                        return (
                          <div key={prog.id} className="flex flex-col gap-1.5">
                          {/* Confirmação de agenda renderizada dentro do próprio botão */}

                          <div

                            className={`group/preset relative w-[180px] min-w-[180px] shrink-0 rounded-lg overflow-hidden cursor-pointer border-2 transition-opacity duration-200 ${progOnAir ? "border-transparent" : "border-[#333338] opacity-60 hover:opacity-100"}`}
                            style={{
                              aspectRatio: "3/2",
                              backgroundColor: progOnAir ? "#008000" : "#2a2a30",
                              outline: progOnAir ? "2px solid #FFFFFF" : "none",
                              outlineColor: progOnAir ? (onAirBlinkOn ? "#FFFFFF" : "rgba(255,255,255,0.08)") : undefined,
                              outlineOffset: progOnAir ? "5px" : undefined,
                              opacity: dragPresetIdx !== null && programas[dragPresetIdx]?.id === prog.id ? 0.4 : undefined,
                            }}
                            onClick={() => {
                              if (isPodcastStudio && (!podcastCurrentRecordingAgenda || podcastCurrentRecordingAgenda.programa.id !== prog.id)) {
                                toast({ title: "Preset bloqueado pela Agenda", description: "No estúdio PODCAST, o preset só fica ativo durante um evento do tipo GRAVAÇÃO deste programa na Agenda.", variant: "destructive" });
                                return;
                              }
                              setActivePreset(prog.id);
                              // As ações são enviadas pelo efeito quando o preset assume o status NO AR.
                              const presetScroller = document.getElementById("preset-scroll-" + studioKey);
                              if (presetScroller) presetScroller.scrollTo({ left: 0, behavior: "smooth" });
                            }}
                            >
                            {!progOnAir && (agendaEvento || startTime) && (
                              <div
                                className="absolute top-1.5 left-1.5 z-[2] flex flex-col items-start gap-1"
                                title={agendaEvento ? "Horário definido na agenda" : "Horário de início"}
                              >
                                <div className="flex items-center gap-1">
                                  <Clock size={11} style={{ color: agendaEvento ? "#C6F03C" : progOnAir ? "#fff" : "#888" }} />
                                  <span className="text-[11px] font-normal tabular-nums leading-none" style={{ color: agendaEvento ? "#C6F03C" : progOnAir ? "#fff" : "#ddd" }}>
                                    {agendaEvento ? (agendaEvento.horario_gravacao || startTime).slice(0, 5) : startTime}
                                  </span>
                                </div>
                                {isPodcastStudio && remaining !== null && (
                                  <div className="ml-4 flex items-center gap-1 border-t border-white/15 pt-1">
                                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#C6F03C" }} />
                                    <span className="text-[9px] font-black tabular-nums" style={{ color: "#fff" }}>{formatCountdown(remaining)}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {!isPodcastStudio && remaining !== null && (
                              <div
                                className="absolute top-1.5 left-1.5 z-[3] flex items-center gap-1"
                                title="Tempo restante do programa no ar"
                              >
                                {Math.floor(nowTick / 4000) % 2 === 0 ? (
                                  <span className="text-[10px] font-normal tabular-nums tracking-wide" style={{ color: "#fff" }}>
                                    <Clock size={10} className="mr-1 inline-block" style={{ color: "#C6F03C" }} />{startTime}
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-normal tabular-nums tracking-wide" style={{ color: "#fff" }}>
                                    termina em: {formatCountdown(remaining)}
                                  </span>
                                )}
                              </div>
                            )}

                            {prog.dias_semana && prog.dias_semana.length > 0 && (() => {
                              const normalizeDay = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().slice(0, 3);
                              const aliases: Record<string, string> = {
                                dom: "dom", domingo: "dom", seg: "seg", segunda: "seg", "segunda-feira": "seg",
                                ter: "ter", terca: "ter", qua: "qua", quarta: "qua", qui: "qui", quinta: "qui",
                                sex: "sex", sexta: "sex", sab: "sab", sabado: "sab",
                              };
                              const selected = new Set(prog.dias_semana!.map(day => aliases[normalizeDay(day)] || normalizeDay(day)));
                              const week = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
                              const days = week.filter(day => selected.has(day));
                              const label = days.length === 7
                                ? "todos os dias"
                                : days.length === 5 && ["seg", "ter", "qua", "qui", "sex"].every(day => selected.has(day))
                                  ? "seg/sex"
                                  : days.length === 6 && ["seg", "ter", "qua", "qui", "sex", "sab"].every(day => selected.has(day))
                                    ? "seg/sáb"
                                    : days.length === 2 && selected.has("sab") && selected.has("dom")
                                      ? "sáb/dom"
                                      : days.join("/");
                              return label ? (
                                <div className="absolute bottom-1.5 left-1.5 z-[3] max-w-[calc(100%-12px)] truncate text-[8px] font-normal uppercase tracking-wide text-white/80">
                                  {label}
                                </div>
                              ) : null;
                            })()}
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 pt-6 pb-4">

                              <span className="text-[10px] font-black uppercase tracking-wider text-center leading-tight"
                                style={{ color: isActive ? "#fff" : "#ccc" }}
                              >{prog.nome}</span>
                              {isPodcastStudio && (
                                agendaEvento ? (
                                  agendaConfirmado ? (
                                    <span className="text-[7px] font-black uppercase tracking-wider px-1.5 py-[2px] rounded"
                                      style={{ backgroundColor: "rgba(198,240,60,0.15)", color: "#C6F03C", border: "1px solid rgba(198,240,60,0.4)" }}
                                    >Armado {agendaLive ? "no horário" : "1h antes"}</span>
                                  ) : (
                                    <div className="flex flex-col items-center gap-1">
                                      <span className="text-[7px] font-bold uppercase tracking-wider text-white/60">Confirmar evento?</span>
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); confirmarEvento(agendaEvento); }}
                                          className="px-2 py-[2px] rounded text-[8px] font-black uppercase"
                                          style={{ backgroundColor: "#C6F03C", color: "#000" }}
                                        >Sim</button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); rejeitarEvento(agendaEvento); }}
                                          className="px-2 py-[2px] rounded text-[8px] font-black uppercase"
                                          style={{ backgroundColor: "#ffffff10", color: "#f87171", border: "1px solid #ffffff20" }}
                                        >Não</button>
                                      </div>
                                    </div>
                                  )
                                ) : (
                                  <span className="text-[7px] font-bold uppercase tracking-wider text-white/30">Sem evento na agenda</span>
                                )
                              )}
                            </div>
                            <button
                              type="button"
                              aria-label={`Editar ações do botão ${prog.nome}`}
                              title="Editar ações do botão"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingPresetId(prog.id);
                              }}
                              className="absolute bottom-1.5 left-1.5 z-10 flex h-7 w-7 translate-y-1 items-center justify-center rounded-md border border-white/25 bg-black/80 text-white opacity-0 transition-opacity duration-150 group-hover/preset:translate-y-0 group-hover/preset:opacity-100 hover:bg-black"
                            >
                              <Wand2 size={13} />
                            </button>
                          </div>
                          </div>
                        );

                      })}
                            </div>
                            <button type="button" aria-label="Rolar presets para a direita" onClick={() => document.getElementById(`preset-scroll-${studioKey}`)?.scrollBy({ left: 360, behavior: "smooth" })} className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0756c9] text-white hover:bg-[#0967ed]" title="Próximo"><ChevronDown size={17} className="-rotate-90" /></button>
                          </div>
                        </div>
                      ); });
                      })()}
                      {programas.length === 0 && (
                        <p className="text-[11px] text-white/30 py-4">Nenhum programa cadastrado.</p>
                      )}
                  </div>
                </div>}

                {/* Right: Botões de Efeitos */}
                <div id="custom-buttons-panel" className="rounded-xl overflow-hidden w-full" style={{ backgroundColor: isAutomationRoute ? "transparent" : "#1a1a1f", border: isAutomationRoute ? "1px solid transparent" : "1px solid #ffffff08", maxWidth: buttonPreviewWidth ? `${buttonPreviewWidth}px` : undefined }}>
                  <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: "#ffffff06", borderBottom: "1px solid #ffffff08" }}>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <div className="flex shrink-0 items-center gap-2">
                        <Wand2 size={14} style={{ color: "#C6F03C" }} />
                        <span className="text-xs font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#C6F03C" }}>Botões Personalizados</span>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {["TODOS", ...Array.from(new Set<string>((customButtons || []).map((btn: any): string => String(btn.category || btn.commands?.[0]?._buttonCategory || "OUTROS").trim() || "OUTROS"))).sort((a, b) => a.localeCompare(b))].map(category => (
                          <button key={category} type="button" onClick={() => setCustomButtonCategoryFilter(category)}
                            className="rounded-md px-2 py-1 text-[8px] font-black uppercase tracking-wide transition-colors"
                            style={{
                              backgroundColor: customButtonCategoryFilter === category ? "#0756C9" : "#ffffff08",
                              color: customButtonCategoryFilter === category ? "#FFFFFF" : "#9CA3AF",
                              border: customButtonCategoryFilter === category ? "1px solid #3985f6" : "1px solid #ffffff12",
                            }}>
                            {category}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1" style={{ display: isButtonDevicePreview ? "none" : undefined }}>
                      <div className="flex items-center gap-1 mr-1" aria-label="Visualizar botões por dispositivo">
                        <button type="button" onClick={() => openButtonDevicePreview("mobile")} title="Abrir visualização de celular em nova aba" aria-label="Visualização celular" className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 transition-colors hover:bg-white/10" style={{ color: "#D1D5DB", backgroundColor: buttonPreviewMode === "mobile" ? "#0756C9" : "#ffffff08" }}><Smartphone size={14} /></button>
                        <button type="button" onClick={() => openButtonDevicePreview("tablet")} title="Abrir visualização de tablet em nova aba" aria-label="Visualização tablet" className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 transition-colors hover:bg-white/10" style={{ color: "#D1D5DB", backgroundColor: buttonPreviewMode === "tablet" ? "#0756C9" : "#ffffff08" }}><Tablet size={14} /></button>
                        <button type="button" onClick={() => openButtonDevicePreview("desktop")} title="Abrir visualização de desktop em nova aba" aria-label="Visualização desktop" className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 transition-colors hover:bg-white/10" style={{ color: "#D1D5DB", backgroundColor: buttonPreviewMode === "desktop" ? "#0756C9" : "#ffffff08" }}><Monitor size={14} /></button>
                      </div>
                      <button
                        onClick={() => setEditingCustomButtonId("new")}
                        className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-white transition-all hover:brightness-110"
                        style={{ backgroundColor: "#0756C9", color: "#FFFFFF", border: "1px solid #3985f6" }}
                        title="Criar novo botão"
                      >
                        <Plus size={12} />
                        <span className="text-[10px] font-black uppercase tracking-wider">novo botão</span>
                      </button>
                      <div ref={customButtonToolsRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setCustomButtonToolsOpen(open => !open)}
                          aria-label="Configurações dos botões personalizados"
                          aria-expanded={customButtonToolsOpen}
                          className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10"
                          style={{ backgroundColor: customButtonToolsOpen ? "#0756C9" : "#ffffff08", color: "#D1D5DB", border: "1px solid #ffffff12" }}
                          title="Configurações dos botões"
                        >
                          <Settings size={14} />
                        </button>
                        {customButtonToolsOpen && (
                          <div className="absolute right-0 top-full z-[90] mt-2 w-52 rounded-xl border border-white/10 bg-[#17171f] p-2 shadow-2xl">
                            <div className="px-2 pb-2 text-[9px] font-black uppercase tracking-widest text-white/45">Ferramentas dos botões</div>
                            <button type="button" onClick={() => { setButtonPointsDraft(Object.fromEntries(Object.entries(buttonPoints).map(([key, value]) => [key, String(value)])) as Record<keyof typeof defaultButtonPoints, string>); setButtonPointsDialogOpen(true); setCustomButtonToolsOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[10px] font-bold text-white/80 hover:bg-white/8">
                              <Trophy size={13} /> Definir pontuação
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const data = JSON.stringify(customButtons, null, 2);
                                const blob = new Blob([data], { type: "application/json" });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `botoes-efeitos-${new Date().toISOString().split("T")[0]}.json`;
                                a.click();
                                URL.revokeObjectURL(url);
                                setCustomButtonToolsOpen(false);
                                toast({ title: "Exportado", description: "Lista de efeitos exportada com sucesso." });
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[10px] font-bold text-white/80 hover:bg-white/8"
                            >
                              <Download size={13} /> Exportar botões
                            </button>
                            <button
                              type="button"
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
                                  } catch {
                                    toast({ title: "Erro na importação", variant: "destructive" });
                                  }
                                };
                                setCustomButtonToolsOpen(false);
                                input.click();
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[10px] font-bold text-white/80 hover:bg-white/8"
                            >
                              <Upload size={13} /> Importar botões
                            </button>
                            <div className="my-1 border-t border-white/10" />
                            <button
                              type="button"
                              onClick={() => { cycleCustomBtnTextScale(); setCustomButtonToolsOpen(false); }}
                              className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[10px] font-bold text-white/80 hover:bg-white/8"
                              title="Aumentar o texto dos botões personalizados"
                            >
                              <span className="flex items-center gap-2"><span className="font-black">A+</span> Tamanho do texto</span>
                              <span className="text-[9px] tabular-nums text-white/50">{Math.round(customBtnTextScale * 100)}%</span>
                            </button>
                          </div>
                        )}
                        {buttonPointsDialogOpen && (
                          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setButtonPointsDialogOpen(false); }}>
                            <div role="dialog" aria-modal="true" aria-labelledby="button-points-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#17171f] p-5 text-white shadow-2xl">
                              <div className="mb-1 flex items-center gap-2">
                                <Trophy size={18} className="text-[#C6F03C]" />
                                <h2 id="button-points-title" className="text-sm font-black uppercase tracking-wide">Pontuação dos botões</h2>
                              </div>
                              <p className="mb-4 text-xs text-white/55">Defina quantos pontos cada categoria vale. Os novos valores serão usados nos próximos cliques registrados.</p>
                              <div className="space-y-3">
                                {(["CAMERAS", "DIVS", "COMERCIAL", "EFEITOS", "QUADROS"] as const).map(category => (
                                  <label key={category} className="flex items-center justify-between gap-4 rounded-xl bg-white/5 px-3 py-2.5">
                                    <span className="text-xs font-bold">{category}</span>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        min="0"
                                        max="9999"
                                        step="0.5"
                                        inputMode="decimal"
                                        value={buttonPointsDraft[category] ?? ""}
                                        onChange={event => setButtonPointsDraft(prev => ({ ...prev, [category]: event.target.value }))}
                                        className="w-24 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-right text-sm font-bold text-white outline-none focus:border-[#C6F03C]"
                                        aria-label={`Pontos para ${category}`}
                                      />
                                      <span className="text-[10px] text-white/45">pontos</span>
                                    </div>
                                  </label>
                                ))}
                              </div>
                              <div className="mt-5 flex justify-end gap-2">
                                <button type="button" onClick={() => setButtonPointsDialogOpen(false)} className="rounded-lg px-4 py-2 text-xs font-bold text-white/65 hover:bg-white/8">Cancelar</button>
                                <button type="button" onClick={saveButtonPoints} className="rounded-lg bg-[#C6F03C] px-4 py-2 text-xs font-black text-black hover:brightness-110">Salvar pontuação</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="flex w-full flex-wrap items-start gap-3 pb-2">
                      {(() => {
                        const getCategory = (button: any) => getAudioMonitorInput(button) ? "AUDIO" : String(button.category || button.commands?.[0]?._buttonCategory || "OUTROS").trim() || "OUTROS";
                        const categoryNames = Array.from(new Set(customButtons.map((button: any) => getCategory(button))));
                        const orderedCategories = [...customButtonCategoryOrder, ...categoryNames.filter(category => !customButtonCategoryOrder.includes(category))];
                        const savedOrderKey = user ? `vmix_custom_button_order:${user.id}:${normStudio(studioName) || "all"}` : "";
                        let savedButtonOrder: string[] = [];
                        try { savedButtonOrder = JSON.parse(localStorage.getItem(savedOrderKey) || "[]") as string[]; } catch { /* mantém ordem atual */ }
                        return orderedCategories
                          .filter(category => categoryNames.includes(category))
                          .filter(category => customButtonCategoryFilter === "TODOS" || category === customButtonCategoryFilter)
                          .map((categoryName) => {
                            const categoryButtons = customButtons
                              .filter((button: any) => getCategory(button) === categoryName)
                              .sort((a: any, b: any) => {
                                const ai = savedButtonOrder.indexOf(a.id), bi = savedButtonOrder.indexOf(b.id);
                                if (ai >= 0 || bi >= 0) return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
                                return 0;
                              });
                            return (
                              <div key={"category-group-" + categoryName} className="flex min-w-0 flex-col gap-2 rounded-lg"
                                style={{ width: "max-content", maxWidth: "100%" }}>
                                <div draggable onDragStart={(event) => { event.dataTransfer.setData("text/vmix-custom-category", categoryName); event.dataTransfer.effectAllowed = "move"; setDragCustomCategory(categoryName); }} onDragEnd={() => setDragCustomCategory(null)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const draggedCategory = event.dataTransfer.getData("text/vmix-custom-category") || dragCustomCategory; const draggedButton = event.dataTransfer.getData("text/vmix-custom-button") || dragCustomButtonId; if (draggedCategory) reorderCustomCategory(draggedCategory, categoryName); else if (draggedButton) assignCustomButtonCategory(draggedButton, categoryName); setDragCustomCategory(null); setDragCustomButtonId(null); }}
                                  className={`flex items-center gap-2 cursor-grab rounded pt-2 pb-0.5 ${dragCustomCategory === categoryName ? "opacity-50" : ""}`}
                                  title="Arraste para reorganizar categorias ou solte um botão aqui para mover para esta categoria">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-white/60 whitespace-nowrap">{categoryName}</span>
                                  <div className="h-px min-w-[18px] flex-1 bg-white/10" /><span className="text-[8px] text-white/25">⠿</span>
                                </div>
                                <div className="grid min-w-0 gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(categoryButtons.length, buttonPreviewMode === "mobile" ? 3 : buttonPreviewMode === "tablet" ? 5 : 8)}, ${buttonPreviewMode === "mobile" ? 92 : buttonPreviewMode === "tablet" ? 112 : 150}px)`, width: "max-content", maxWidth: "100%" }}>
                                  {categoryButtons.map((btn: any, buttonIndex, sortedButtons) => {
                        const audioMonitorInput = getAudioMonitorInput(btn);
                        if (audioMonitorInput) {
                          return (
                            <AudioMonitorButton
                              key={btn.id}
                              button={btn}
                              input={audioMonitorInput}
                              inputName={inputs.find((vmixInput: VmixInput) => vmixInput.number === audioMonitorInput)?.title}
                              textScale={customBtnTextScale}
                              levels={audioMeterLevels[audioMonitorInput]}
                              onEdit={() => openAudioMonitorEditor(btn)}
                              onDelete={() => deleteAudioMonitor(btn)}
                            />
                          );
                        }

                        const isBtnActive = !isDefaultAutomationActive && activeCustomButton === btn.id;
                        const linkedProgramaId = resolveButtonProgramaId(btn, programas.filter((programa: Programa) => matchesStudio(programa.estudio, studioName)));
                        const isAgendaLiveButton = isPodcastStudio && Boolean(linkedProgramaId) && (
                          hasStartStreamingCommand(btn) || isLiveAutomationButton(btn)
                        );
                        const linkedProgram = isAgendaLiveButton
                          ? programas.find((programa: Programa) => programa.id === linkedProgramaId)
                          : undefined;
                        const liveEvento = isAgendaLiveButton && linkedProgramaId
                          ? liveEventoPorPrograma[linkedProgramaId]
                          : undefined;
                        const isLiveButtonEnabled = !isAgendaLiveButton || Boolean(liveEvento);
                        const hasSchedule = isAgendaLiveButton
                          ? Boolean(liveEvento)
                          : btn.horario && btn.dias_semana?.length > 0;
                        const liveScheduleLabel = liveEvento
                          ? `${liveEvento.data.split("-").reverse().slice(0, 2).join("/")} · ${(liveEvento.horario_gravacao || "--:--").slice(0, 5)}–${(liveEvento.horario_gravacao_fim || "--:--").slice(0, 5)}`
                          : "";
                        // A primeira tecla/botão da categoria define a cor visual de todos os botões dessa categoria.
                        const categoryLeadColor = sortedButtons[0]?.color;
                        const savedColor = typeof categoryLeadColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(categoryLeadColor) ? categoryLeadColor : "#0756C9";
                        const btnColor = isLiveButtonEnabled ? savedColor : "#36363d";
                        const BtnIcon = resolveButtonIcon(btn.icon, btn.nome || "");
                        const isBrightButtonColor = ["#BFFF00", "#FF6900", "#C6F03C"].includes(btnColor.toUpperCase());
                        const textColor = isLiveButtonEnabled ? (isBrightButtonColor ? "#000000" : "#FFFFFF") : "#85858d";
                        return (
                          <div
                            key={btn.id}
                            className={`group/custom relative w-full min-w-0 rounded-lg overflow-hidden transition-colors duration-200 ${isLiveButtonEnabled ? "vmix-hover-ring cursor-pointer" : "cursor-not-allowed grayscale"}${isBtnActive ? " vmix-active-blink" : ""}`}
                            style={{
                              aspectRatio: "3/2",
                              backgroundColor: btnColor,
                              border: `2px solid ${isLiveButtonEnabled ? btnColor : "#50505a"}`,
                              opacity: dragCustomButtonId === btn.id ? 0.45 : isLiveButtonEnabled ? 1 : 0.62,
                            }}
                            title={isAgendaLiveButton
                              ? isLiveButtonEnabled
                                ? `Evento AO VIVO ativo na Agenda: ${liveScheduleLabel}. Os comandos seguem a janela deste evento.`
                                : `Desabilitado: não existe evento AO VIVO ativo deste programa na Agenda.`
                              : undefined} 
                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const draggedCategory = e.dataTransfer.getData("text/vmix-custom-category") || dragCustomCategory;
                              if (draggedCategory) {
                                const targetCategory = String(btn.category || btn.commands?.[0]?._buttonCategory || "OUTROS").trim() || "OUTROS";
                                reorderCustomCategory(draggedCategory, targetCategory);
                              } else {
                                const draggedId = e.dataTransfer.getData("text/vmix-custom-button") || dragCustomButtonId;
                                if (draggedId) {
                                  const draggedButton = customButtons.find((button: any) => button.id === draggedId);
                                  const draggedCategoryName = String(draggedButton?.category || draggedButton?.commands?.[0]?._buttonCategory || "OUTROS").trim() || "OUTROS";
                                  const targetCategoryName = String(btn.category || btn.commands?.[0]?._buttonCategory || "OUTROS").trim() || "OUTROS";
                                  if (draggedCategoryName !== targetCategoryName) assignCustomButtonCategory(draggedId, targetCategoryName);
                                  else reorderCustomButton(draggedId, btn.id);
                                }
                              }
                              setDragCustomButtonId(null);
                              setDragCustomCategory(null);
                            }}
                            onClick={async () => {
                              if (isAgendaLiveButton) {
                                toast({
                                  title: isLiveButtonEnabled ? "Botão LIVE ativo pela Agenda" : "Botão LIVE desabilitado",
                                  description: isLiveButtonEnabled
                                    ? `O evento AO VIVO está ativo: ${liveScheduleLabel}.`
                                    : "Cadastre ou aguarde um evento AO VIVO ativo para o programa vinculado.",
                                  variant: isLiveButtonEnabled ? "default" : "destructive",
                                });
                                return;
                              }
                              setActiveCustomButton(btn.id);
                              // Registra o locutor e o programa que estão efetivamente no ar.
                              // Não usar o programa vinculado ao botão nem o e-mail como nome do locutor.
                              if (user?.id) {
                                void (supabase.from("vmix_button_interactions" as any) as any)
                                  .insert({
                                    user_id: user.id,
                                    locutor_nome: currentProgram?.apresentador_nome || null,
                                    user_email: user.email || null,
                                    studio_name: studioName || null,
                                    button_id: String(btn.id),
                                    button_name: String(btn.nome || "Botão personalizado"),
                                    button_category: String(btn.category || btn.commands?.[0]?._buttonCategory || "OUTROS").trim().toLocaleUpperCase("pt-BR"),
                                    points: (() => {
                                      const category = String(btn.category || btn.commands?.[0]?._buttonCategory || "OUTROS").trim().toLocaleUpperCase("pt-BR");
                                      return (buttonPoints as Record<string, number>)[category] ?? 0;
                                    })(),
                                    program_name: currentProgram?.nome || null,
                                  })
                                  .then(({ error }: any) => {
                                    if (error) {
                                      console.warn("Não foi possível registrar o clique do botão vMix:", error.message);
                                      toast({ title: "Clique não registrado no relatório", description: error.message, variant: "destructive" });
                                    }
                                  })
                                  .catch((error: any) => {
                                    console.warn("Falha ao registrar o clique do botão vMix:", error);
                                    toast({ title: "Falha ao registrar o clique", description: error?.message || "Verifique a conexão e tente novamente.", variant: "destructive" });
                                  });
                              }
                              if (btn.commands && Array.isArray(btn.commands) && btn.commands.length > 0) {
                                await runCommandsUnified(btn.commands as any[], `Efeito: ${btn.nome}`);
                              }
                            }}
                          >
                            {hasSchedule && (
                              <div className="absolute top-1 left-1 flex items-center gap-1 px-2 py-[3px] rounded" style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 2 }}>
                                <Clock size={11} style={{ color: isAgendaLiveButton ? "#C6F03C" : "#fff" }} />
                                <span className="text-[10px] font-black tabular-nums leading-none" style={{ color: isAgendaLiveButton ? "#C6F03C" : "#fff" }}>{isAgendaLiveButton ? liveScheduleLabel : btn.horario?.slice(0, 5)}</span>
                              </div>
                            )}
                            {isAgendaLiveButton && !isLiveButtonEnabled && (
                              <div className="absolute top-1 left-1 right-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded" style={{ backgroundColor: "rgba(0,0,0,0.42)", zIndex: 2 }}>
                                <Lock size={10} style={{ color: "#a1a1aa" }} />
                                <span className="text-[7px] font-black uppercase tracking-wider" style={{ color: "#c4c4cc" }}>Sem AO VIVO na agenda</span>
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
                            {btn.shortcut && (
                              <div className="absolute top-1.5 right-1.5 z-[3]">
                                <span className="text-[6px] font-black uppercase tracking-wider px-1.5 py-[2px] rounded"
                                  style={{
                                    backgroundColor: `${textColor}22`,
                                    color: textColor,
                                    border: `1px solid ${textColor}59`,
                                  }}
                                  title={`Atalho: ${btn.shortcut}`}
                                >{btn.shortcut}</span>
                              </div>
                            )}

                            <div className="absolute inset-0 flex flex-col items-center justify-center p-1.5 pt-5 pb-3 gap-1">
                              <BtnIcon size={Math.round(16 * customBtnTextScale)} style={{ color: textColor, opacity: 0.85 }} />
                              <span
                                className="font-black uppercase tracking-wider text-center leading-tight"
                                style={{ color: textColor, fontSize: `${9 * customBtnTextScale}px` }}
                              >{btn.nome}</span>
                            </div>

                            <div
                              draggable
                              role="button"
                              tabIndex={0}
                              aria-label={`Arrastar ${btn.nome} para outra categoria ou reorganizar`}
                              title="Arraste daqui para mover ou reorganizar este botão"
                              onClick={(e) => e.stopPropagation()}
                              onDragStart={(e) => {
                                e.stopPropagation();
                                setDragCustomButtonId(btn.id);
                                e.dataTransfer.setData("text/vmix-custom-button", btn.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={(e) => {
                                e.stopPropagation();
                                setDragCustomButtonId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") e.preventDefault();
                              }}
                              className="absolute left-1.5 top-1.5 z-10 flex h-5 w-5 cursor-grab items-center justify-center rounded bg-black/25 opacity-70 transition-opacity hover:opacity-100 active:cursor-grabbing"
                              style={{ color: textColor, touchAction: "none" }}
                            >
                              <GripVertical size={12} />
                            </div>

                            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1 py-1 opacity-0 group-hover/custom:opacity-100 transition-all duration-200 translate-y-full group-hover/custom:translate-y-0" style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}>
                              <button onClick={(e) => { e.stopPropagation(); setEditingCustomButtonId(btn.id); }} className="w-4 h-4 rounded flex items-center justify-center hover:bg-white/20 transition-colors" style={{ color: "#ccc" }} title="Editar"><Wand2 size={9} /></button>
                              <button onClick={async (e) => { e.stopPropagation(); await (supabase.from("custom_vmix_buttons" as any) as any).delete().eq("id", btn.id); loadCustomButtons(); toast({ title: "Botão excluído" }); }} className="w-4 h-4 rounded flex items-center justify-center hover:bg-red-500/40 transition-colors" style={{ color: "#f87171" }} title="Excluir"><Trash2 size={9} /></button>
                            </div>
                          </div>
                        );
                                  })}
                                </div>
                              </div>
                            );
                          });
                      })()}
                      {/* + Criar */}
                      <div ref={creationChoiceRef} className="relative w-full min-w-0">
                        {creationChoiceOpen && (
                          <div className="absolute bottom-full left-0 z-[80] mb-2 w-[150px] min-w-[118px]">
                            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-[#17171f] p-2 shadow-2xl">
                              <button
                                type="button"
                                onClick={() => { setCreationChoiceOpen(false); setAudioMonitorInput(""); setEditingCustomButtonId("new"); }}
                                className="flex min-h-[42px] items-center gap-1.5 rounded-lg border border-white/10 bg-gradient-to-br from-[#0756C9] to-[#063780] p-1.5 text-left text-white transition-all hover:-translate-y-0.5 hover:border-[#4B91FF] hover:brightness-110"
                              >
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#0065F9]"><Wand2 size={13} /></span>
                                <span className="min-w-0 text-[8px] font-black uppercase leading-tight">Comando</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => { setAudioMonitorInput(""); setAudioMonitorName(""); setAudioCreateOpen(true); setCreationChoiceOpen(false); }}
                                className="flex min-h-[42px] items-center gap-1.5 rounded-lg border border-white/10 bg-gradient-to-br from-[#0756C9] to-[#063780] p-1.5 text-left text-white transition-all hover:-translate-y-0.5 hover:border-[#4B91FF] hover:brightness-110"
                              >
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#0065F9] text-white"><Activity size={13} /></span>
                                <span className="min-w-0 text-[9px] font-black uppercase leading-tight">Áudio</span>
                              </button>
                            </div>

                          </div>
                        )}
                        <button
                          type="button"
                          className="vmix-hover-ring !bg-transparent hover:!bg-transparent active:!bg-transparent focus:!bg-transparent flex h-[54px] w-full min-w-0 flex-col items-center justify-center rounded-lg transition-colors duration-200 sm:h-auto sm:aspect-[3/2] sm:w-[150px]"
                          style={{ background: "transparent", backgroundColor: "transparent", border: creationChoiceOpen ? "1px solid #ffffff" : "1px solid #ffffff66", boxShadow: "none", backgroundImage: "none" }}
                          onClick={() => { setCreationChoiceOpen(open => !open); setAudioMonitorInput(""); }}
                          aria-expanded={creationChoiceOpen}
                          aria-label="Criar botão personalizado"
                        >
                          <Plus size={14} style={{ color: "#ffffff" }} />
                          <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: "#ffffff" }}>{creationChoiceOpen ? "Fechar" : "+ Criar"}</span>
                        </button>
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
      <Dialog open={isAllPresetsDialogOpen} onOpenChange={setIsAllPresetsDialogOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-[#34343C] bg-[#1B1B20] p-0 text-white sm:max-w-4xl">
          <DialogHeader className="shrink-0 bg-[#222228] px-5 py-4 text-left">
            <DialogTitle className="text-base font-black uppercase tracking-wide text-white">Editar todos os presets</DialogTitle>
            <DialogDescription className="text-xs text-[#C4C4CF]">
              Programas do estúdio atual. Selecione o ícone de edição no cartão para alterar as ações.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-x-hidden overflow-y-auto bg-[#17171B] p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid-cols-3 lg:grid-cols-4">
            {(() => {
              const sameStudio = (a: unknown, b: unknown) => String(a || "").trim().localeCompare(String(b || "").trim(), "pt-BR", { sensitivity: "base" }) === 0;
              const studioPrograms = programas.filter((programa) => sameStudio(programa.estudio, studioName));
              return [...studioPrograms].sort((a, b) => {
                const timeCompare = String(a.horario_inicio || "").localeCompare(String(b.horario_inicio || ""));
                return timeCompare || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
              }).map((prog) => (
                <div key={prog.id} className="group/allpreset relative flex min-h-[108px] flex-col items-center justify-center rounded-lg border border-[#35353E] bg-[#25252C] px-3 py-4 text-center transition-colors hover:border-[#0756C9]">
                  <span className="mb-2 rounded bg-black/50 px-2 py-1 text-[10px] font-bold tabular-nums text-[#E5E7EB]">
                    <Clock size={10} className="mr-1 inline" />{String(prog.horario_inicio || "--:--").slice(0,5)}
                  </span>
                  <span className="line-clamp-2 text-[11px] font-black uppercase leading-snug text-white">{prog.nome}</span>
                  <button
                    type="button"
                    aria-label={`Editar ações de ${prog.nome}`}
                    title={`Editar ações de ${prog.nome}`}
                    onClick={() => { setIsAllPresetsDialogOpen(false); setEditingPresetId(prog.id); }}
                    className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-md border border-white/20 bg-[#0756C9] text-white opacity-100 transition-colors hover:bg-[#0967ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              ));
            })()}
            {programas.filter((programa) => String(programa.estudio || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR") === String(studioName || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")).length === 0 && <p className="col-span-full py-10 text-center text-sm text-[#C4C4CF]">Nenhum preset cadastrado para este estúdio.</p>}
          </div>
          <div className="flex shrink-0 justify-end bg-[#222228] px-5 py-3">
            <button type="button" onClick={() => setIsAllPresetsDialogOpen(false)} className="rounded-md bg-[#0756C9] px-4 py-2 text-[10px] font-black uppercase tracking-wide text-white hover:bg-[#0967ED]">Fechar</button>
          </div>
        </DialogContent>
      </Dialog>
      {audioCreateOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onMouseDown={(event) => { if (event.target === event.currentTarget && !creatingAudioMonitor) setAudioCreateOpen(false); }}>
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl" style={{ backgroundColor: "#1a1a22", border: "1px solid #333", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #ffffff0a", background: "linear-gradient(135deg, #1e1e28, #22222c)" }}>
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: "#eee" }}>Novo monitor de áudio</h2>
                <span className="rounded px-1.5 py-0.5 text-[9px]" style={{ backgroundColor: "#ffffff08", color: "#888" }}>Analisador de espectro</span>
              </div>
              <button type="button" onClick={() => setAudioCreateOpen(false)} disabled={creatingAudioMonitor} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/10 disabled:opacity-40" style={{ color: "#aaa" }} aria-label="Fechar">
                <XCircle size={16} />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-6" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: "#aaa" }}>Nome do botão</label>
                  <input
                    autoFocus
                    value={audioMonitorName}
                    onChange={(event) => setAudioMonitorName(event.target.value)}
                    placeholder="Ex.: Áudio do estúdio"
                    className="w-full rounded-lg px-3.5 py-2.5 text-xs outline-none"
                    style={{ backgroundColor: "#181820", color: "#eee", border: "1px solid #41414b" }}
                  />
                </div>
                <div className="flex flex-col gap-2 sm:w-64">
                  <label className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: "#aaa" }}>Input de áudio do vMix</label>
                  <select
                    value={audioMonitorInput}
                    onChange={(event) => setAudioMonitorInput(event.target.value)}
                    className="w-full rounded-lg px-3.5 py-2.5 text-xs outline-none [color-scheme:dark]"
                    style={{ backgroundColor: "#181820", color: "#eee", border: "1px solid #41414b" }}
                  >
                    <option value="">Selecione um input</option>
                    {inputs.map((input: VmixInput) => <option key={input.key || input.number} value={input.number}>{input.number} — {input.title}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "#777" }}>O botão criado exibirá o monitor visual associado ao input selecionado.</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: "1px solid #ffffff0a", backgroundColor: "#ffffff03" }}>
              <button type="button" onClick={() => setAudioCreateOpen(false)} disabled={creatingAudioMonitor} className="rounded-lg px-3 py-1.5 text-[10px] font-bold transition-colors hover:bg-white/5 disabled:opacity-40" style={{ color: "#aaa" }}>Fechar</button>
              <button type="button" onClick={createAudioMonitor} disabled={creatingAudioMonitor || !audioMonitorName.trim() || !audioMonitorInput} className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white transition-all hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-40" style={{ backgroundColor: "var(--layout-accent-color, #0756C9)" }}>
                {creatingAudioMonitor ? <Loader2 className="animate-spin" size={12} /> : <CheckCircle size={12} />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}
      <Dialog open={!!editingAudioMonitor} onOpenChange={(open) => !open && setEditingAudioMonitor(null)}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-2xl border border-white/10 bg-[#19191f] p-0 text-white shadow-2xl sm:max-w-3xl" style={{ backgroundColor: "#19191f", borderColor: "#303039" }}>
          <DialogHeader className="px-6 py-5 text-left" style={{ backgroundColor: "#19191f", borderColor: "transparent" }}>
            <DialogTitle className="text-base font-black uppercase tracking-wide text-white">Editar Monitor de Áudio</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-white/55">
              Selecione o input do vMix que este monitor deve acompanhar.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-5 overflow-y-auto p-6" style={{ backgroundColor: "#19191f", scrollbarWidth: "thin", scrollbarColor: "#383842 transparent" }}>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-white/80">
                <Activity size={12} /> Input monitorado
              </label>
              <select
                value={editingAudioMonitorInput}
                onChange={(event) => setEditingAudioMonitorInput(event.target.value)}
                className="h-11 w-full rounded-xl border px-4 text-sm font-semibold outline-none transition focus:border-[#0756C9] focus:ring-2 focus:ring-[#0756C9]/30 [color-scheme:dark]" style={{ backgroundColor: "#19191f", borderColor: "#41414b", color: "#f5f5f7" }}
              >
                <option value="">Selecione um input de áudio</option>
                {inputs.map((input: VmixInput) => (
                  <option key={input.key || input.number} value={input.number}>
                    {input.number} — {input.title}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-white/40">O monitor continuará exibindo os níveis reais dos canais Left e Right.</p>
            </div>

            <div className="pt-1">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-white">Acionamento por nível de áudio</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-white/45">Execute uma ação quando a média L/R atingir o limite configurado.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={audioThresholdEnabled}
                  onClick={() => setAudioThresholdEnabled(value => !value)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${audioThresholdEnabled ? "bg-[#0756C9]" : "bg-white/20"}`}
                  title={audioThresholdEnabled ? "Desativar acionamento automático" : "Ativar acionamento automático"}
                >
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${audioThresholdEnabled ? "left-6" : "left-1"}`} />
                </button>
              </div>

              <div className={`mt-4 space-y-4 transition-opacity ${audioThresholdEnabled ? "opacity-100" : "pointer-events-none opacity-40"}`}>
                <div className="rounded-xl border border-white/10 bg-[#101014] p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-[9px] font-black uppercase tracking-wider text-white/65">Nível médio L/R em tempo real</span>
                    <span className="text-sm font-black tabular-nums text-white">
                      {(() => {
                        const meter = audioMeterLevels[editingAudioMonitorInput];
                        if (!meter?.available) return "— dB";
                        const leftDb = meter.left > 0 ? 20 * Math.log10(meter.left) : -60;
                        const rightDb = meter.right > 0 ? 20 * Math.log10(meter.right) : -60;
                        return `${((leftDb + rightDb) / 2).toFixed(1)} dB`;
                      })()}
                    </span>
                  </div>
                  <div className="flex h-3 gap-[2px] overflow-hidden rounded-sm bg-white/5 p-[1px]">
                    {Array.from({ length: 36 }, (_, index) => {
                      const meter = audioMeterLevels[editingAudioMonitorInput];
                      const average = meter?.available
                        ? (((meter.left > 0 ? 20 * Math.log10(meter.left) : -60) + (meter.right > 0 ? 20 * Math.log10(meter.right) : -60)) / 2)
                        : -60;
                      const activeCount = Math.max(0, Math.min(36, Math.ceil(((average + 60) / 60) * 36)));
                      const ratio = index / 36;
                      const color = ratio >= 0.88 ? "#ef2028" : ratio >= 0.68 ? "#ffe600" : "#00e83b";
                      return <span key={index} className="min-w-0 flex-1 rounded-[1px]" style={{ backgroundColor: index < activeCount ? color : "#292a30" }} />;
                    })}
                  </div>
                  <div className="mt-1 flex justify-between text-[8px] font-bold text-white/30"><span>-60 dB</span><span>0 dB</span></div>
                  {!audioMeterLevels[editingAudioMonitorInput]?.available && <p className="mt-2 text-[9px] text-amber-300">Aguardando leitura real do vMix para este input.</p>}
                </div>

                <div className="rounded-xl border border-white/10 bg-[#101014] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="audio-threshold-slider" className="text-[9px] font-black uppercase tracking-wider text-white/65">Disparar quando atingir</label>
                    <span className="text-sm font-black tabular-nums text-[#65a8ff]">{audioThresholdDb} dB</span>
                  </div>
                  <input
                    id="audio-threshold-slider"
                    type="range"
                    min={-60}
                    max={0}
                    step={1}
                    value={audioThresholdDb}
                    onChange={(event) => setAudioThresholdDb(Number(event.target.value))}
                    className="mt-3 h-2 w-full cursor-pointer accent-[#0756C9]"
                  />
                  <div className="flex justify-between text-[8px] font-bold text-white/30"><span>-60 dB</span><span>-30 dB</span><span>0 dB</span></div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[9px] font-black uppercase tracking-wider text-white/65">Ação ao atingir o limite</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-white/10 bg-[#101014] px-3 py-2">
                      <p className="text-[8px] font-bold uppercase text-white/35">Comando</p>
                      <p className="mt-1 text-xs font-bold text-white">Cortar (Cut)</p>
                    </div>
                    <select
                      value={audioThresholdActionInput}
                      onChange={(event) => setAudioThresholdActionInput(event.target.value)}
                      className="h-10 w-full rounded-lg border border-white/20 bg-[#19191f] px-3 text-xs font-semibold text-white outline-none focus:border-[#0756C9] [color-scheme:dark]"
                    >
                      <option value="">Selecione a câmera/input de destino</option>
                      {inputs.map((input: VmixInput) => (
                        <option key={input.key || input.number} value={input.number}>{input.number} — {input.title}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[9px] leading-relaxed text-white/40">O comando dispara uma vez ao cruzar o limite e rearma quando o nível cair pelo menos 3 dB abaixo dele.</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-row items-center justify-between gap-3 px-6 py-4 sm:justify-between" style={{ backgroundColor: "#19191f", borderColor: "transparent" }}>
            <button
              onClick={() => deleteAudioMonitor(editingAudioMonitor)}
              disabled={savingAudioMonitor}
              className="flex h-9 items-center gap-2 rounded-lg bg-[#0756C9] px-4 text-[10px] font-black uppercase tracking-wide text-white transition hover:bg-[#0967ED] disabled:opacity-50"
            >
              <Trash2 size={13} /> Excluir
            </button>
            <div className="flex gap-2">
              <button onClick={() => setEditingAudioMonitor(null)} disabled={savingAudioMonitor} className="h-9 rounded-lg border border-white/20 px-4 text-[10px] font-black uppercase tracking-wide text-white/80 transition hover:bg-white/5 disabled:opacity-50">Cancelar</button>
              <button onClick={saveAudioMonitorInput} disabled={savingAudioMonitor || !editingAudioMonitorInput || (audioThresholdEnabled && !audioThresholdActionInput)} className="flex h-9 items-center gap-2 rounded-lg bg-[#0756C9] px-4 text-[10px] font-black uppercase tracking-wide text-white transition hover:bg-[#0967ED] disabled:cursor-not-allowed disabled:opacity-50">
                {savingAudioMonitor ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />} Salvar input
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {isAutomationRoute && !isButtonDevicePreview && (
        <FloatingNdiPreview inputs={inputs} baseUrl={savedUrl || vmixUrl} targetSelector="#custom-buttons-panel" />
      )}

      {/* ── Command Log Panel (hidden in device previews) ── */}
      {!isButtonDevicePreview && (
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
      )}

    </div>
  );
}
