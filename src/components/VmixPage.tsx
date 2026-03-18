import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Monitor, Radio, Disc, RefreshCw, Loader2, CheckCircle, XCircle,
  ExternalLink, Volume2, VolumeX, Play, Square, Camera, Tv,
  Layers, Wand2, Plus, Trash2, GripVertical, Send, Eye, Wifi, HelpCircle
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
  const [activeTab, setActiveTab] = useState<"controls" | "scenes" | "ndi">("controls");
  const [activePreset, setActivePreset] = useState<string | null>(null);

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

  // NDI state
  const [ndiUrl, setNdiUrl] = useState("");

  // Persist scenes
  useEffect(() => {
    localStorage.setItem("vmix_scenes", JSON.stringify(scenes));
  }, [scenes]);

  // Load programas from DB
  useEffect(() => {
    if (!user) return;
    supabase
      .from("programas")
      .select("id, nome, ativo")
      .eq("user_id", user.id)
      .eq("ativo", true)
      .order("nome")
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
    toast({ title: "Configuração salva", description: "URL e credenciais do vMix salvas." });
  };

  const vmixProxy = useCallback(async (path: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke("vmix-proxy", {
      body: { path },
    });
    if (error) throw new Error(error.message || "Proxy error");
    // data can be a string (XML) or parsed object
    if (typeof data === "string") return data;
    // If the runtime auto-parsed as JSON, stringify it back
    return typeof data === "object" ? JSON.stringify(data) : String(data);
  }, []);

  const connectToVmix = useCallback(async () => {
    if (!savedUrl) return;
    setConnecting(true);
    try {
      const xmlText = await vmixProxy("/api/");
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
      toast({ title: "Conectado!", description: `${parsedInputs.length} inputs encontrados.` });
    } catch {
      setConnected(false);
      toast({ title: "Erro de conexão", description: "Verifique se o vMix Web Controller está ativo e acessível.", variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  }, [savedUrl, toast, vmixProxy]);

  const sendCommand = async (fn: string, input?: string, value?: string) => {
    if (!savedUrl) return;
    try {
      let path = `/api/?Function=${encodeURIComponent(fn)}`;
      if (input) path += `&Input=${encodeURIComponent(input)}`;
      if (value) path += `&Value=${encodeURIComponent(value)}`;
      await vmixProxy(path);
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

  const addNdiInput = async () => {
    if (!savedUrl || !ndiUrl.trim()) return;
    try {
      await vmixProxy(`/api/?Function=AddInput&Value=NDI|${encodeURIComponent(ndiUrl.trim())}`);
      setNdiUrl("");
      setTimeout(() => connectToVmix(), 500);
      toast({ title: "NDI adicionado", description: "Fonte NDI adicionada como input." });
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

  if (loading) return <ModulePageSkeleton />;

  // ── Styles ──
  const sectionBox = (title: string, icon: React.ReactNode, children: React.ReactNode, color = "#268ffa") => (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#1a1a2e", border: "1px solid #ffffff08" }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ backgroundColor: color + "18", borderBottom: "1px solid #ffffff08" }}>
        {icon}
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );

  const controlBtn = (label: string, onClick: () => void, bg: string, active = false) => (
    <button
      onClick={onClick}
      className="px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all hover:brightness-110"
      style={{
        backgroundColor: active ? bg : bg + "30",
        color: active ? "#fff" : bg,
        boxShadow: active ? `0 0 16px ${bg}40` : "none",
      }}
    >
      {label}
    </button>
  );

  // ── Not connected ──
  if (!connected) {
    return (
      <div className="space-y-0">
        {/* URL input + action buttons row */}
        <div className="flex items-center gap-3 px-0 py-3">
          <div className="flex gap-2 items-center flex-1">
            <input
              type="text"
              value={vmixUrl}
              onChange={e => setVmixUrl(e.target.value)}
              placeholder="http://192.168.1.100:8088"
              className="w-64 px-4 py-2 rounded-lg text-sm outline-none"
              style={{ backgroundColor: "#2a2a2a", color: "#fff", border: "1px solid #ffffff15" }}
            />
            <button onClick={saveUrl} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#268ffa,#2dbef3)" }}>
              Salvar
            </button>
            {savedUrl && (
              <>
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
                  <div className="absolute left-0 top-full mt-2 w-64 p-3 rounded-lg text-[11px] text-white/70 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50"
                    style={{ backgroundColor: "#2a2a3a", border: "1px solid #ffffff15", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}
                  >
                    <p className="font-bold text-white/90 mb-2">Como configurar:</p>
                    <ol className="space-y-1 list-decimal list-inside text-white/50">
                      <li>Abra o vMix no computador de transmissão</li>
                      <li>Vá em <strong className="text-white/70">Settings → Web Controller</strong> e ative</li>
                      <li>Anote o IP e porta exibidos</li>
                      <li>Cole acima, salve e clique em "Conectar"</li>
                      <li>Os dispositivos precisam estar na mesma rede</li>
                    </ol>
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
        <p className="text-xs text-white/20 py-8 text-center">Configure o IP acima e conecte ao vMix Web Controller</p>
      </div>
    );
  }

  // ── Connected layout ──
  const activeInputObj = inputs.find(i => i.number === activeInput);
  const previewInputObj = inputs.find(i => i.number === previewInput);

  const tabs = [
    { key: "controls" as const, label: "Controles", icon: <Layers size={13} /> },
    { key: "scenes" as const, label: "Cenas", icon: <Wand2 size={13} /> },
    { key: "ndi" as const, label: "NDI", icon: <Tv size={13} /> },
  ];

  return (
    <div className="space-y-0 max-w-full" style={{ color: "#e0e0e0" }}>
      {/* ── IP bar + action buttons ── */}
      <div className="flex items-center gap-3 py-3">
        <div className="flex gap-2 items-center flex-1">
          <input
            type="text"
            value={vmixUrl}
            onChange={e => setVmixUrl(e.target.value)}
            placeholder="http://192.168.1.100:8088"
            className="w-64 px-4 py-2 rounded-lg text-sm outline-none"
            style={{ backgroundColor: "#2a2a2a", color: "#fff", border: "1px solid #ffffff15" }}
          />
          <button onClick={saveUrl} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#268ffa,#2dbef3)" }}>
            Salvar
          </button>
          <button
            onClick={connectToVmix}
            disabled={connecting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white"
            style={{ backgroundColor: "#22c55e", opacity: connecting ? 0.6 : 1 }}
          >
            {connecting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Conectado
          </button>
          <div className="relative group">
            <button className="p-1.5 rounded-lg text-white/30 hover:text-white/60 transition-colors">
              <HelpCircle size={14} />
            </button>
            <div className="absolute left-0 top-full mt-2 w-64 p-3 rounded-lg text-[11px] text-white/70 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50"
              style={{ backgroundColor: "#2a2a3a", border: "1px solid #ffffff15", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}
            >
              <p className="font-bold text-white/90 mb-2">Como configurar:</p>
              <ol className="space-y-1 list-decimal list-inside text-white/50">
                <li>Abra o vMix no computador</li>
                <li>Settings → Web Controller</li>
                <li>Anote o IP e porta</li>
                <li>Cole, salve e conecte</li>
              </ol>
            </div>
          </div>
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

      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-4 py-2 rounded-t-xl" style={{ backgroundColor: "#111118" }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#22c55e" }} />
            <span className="text-xs font-bold text-white/80">vMix Control</span>
          </div>
          <div className="flex items-center gap-2">
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
            <button
              onClick={() => sendCommand(recording ? "StopRecording" : "StartRecording")}
              className="px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider"
              style={{ backgroundColor: recording ? "#dc2626" : "#333", color: recording ? "#fff" : "#aaa" }}
            >
              {recording ? "● REC" : "RECORD"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => connectToVmix()} className="text-white/40 hover:text-white transition-colors" title="Atualizar">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ── Preview / Program Monitors ── */}
      <div className="grid grid-cols-2 gap-[2px]" style={{ backgroundColor: "#0a0a12" }}>
        <div className="relative" style={{ backgroundColor: "#111118", minHeight: 140 }}>
          <div className="absolute top-2 left-3 z-10">
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded" style={{ backgroundColor: "#22c55e", color: "#000" }}>Preview</span>
          </div>
          <div className="flex items-center justify-center h-full px-6 py-8">
            <div className="text-center">
              <p className="text-white/90 font-bold text-base">{previewInputObj?.title || "—"}</p>
              <p className="text-[10px] text-white/40 mt-1">Input {previewInput || "—"}</p>
            </div>
          </div>
        </div>
        <div className="relative" style={{ backgroundColor: "#111118", minHeight: 140 }}>
          <div className="absolute top-2 left-3 z-10">
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded" style={{ backgroundColor: "#dc2626", color: "#fff" }}>Output</span>
          </div>
          <div className="flex items-center justify-center h-full px-6 py-8">
            <div className="text-center">
              <p className="text-white/90 font-bold text-base">{activeInputObj?.title || "—"}</p>
              <p className="text-[10px] text-white/40 mt-1">Input {activeInput || "—"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Input Thumbnails ── */}
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
                width: 120,
                backgroundColor: "#1a1a28",
                border: isActive ? "2px solid #dc2626" : isPreview ? "2px solid #22c55e" : "2px solid transparent",
              }}
            >
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[9px] font-bold px-1 rounded" style={{
                  backgroundColor: isActive ? "#dc2626" : isPreview ? "#22c55e" : "#333",
                  color: isActive || isPreview ? "#fff" : "#888",
                }}>{input.number}</span>
                {isActive && <span className="text-[8px] text-red-400 font-bold">●</span>}
              </div>
              <p className="text-[10px] font-medium text-white/70 truncate">{input.title}</p>
            </button>
          );
        })}
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex" style={{ backgroundColor: "#111118" }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-all"
            style={{
              backgroundColor: activeTab === tab.key ? "#dc2626" : "transparent",
              color: activeTab === tab.key ? "#fff" : "#666",
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="rounded-b-xl p-4 space-y-4" style={{ backgroundColor: "#15151f", minHeight: 300 }}>

        {/* ══ CONTROLS TAB ══ */}
        {activeTab === "controls" && (
          <>
            {/* ── Programas Preset ── */}
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#1a1a2e", border: "1px solid #ffffff08" }}>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ backgroundColor: "#c2410c18", borderBottom: "1px solid #ffffff08" }}>
                <Radio size={14} style={{ color: "#ea580c" }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#ea580c" }}>programas preset</span>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-2">
                  {programas.map(prog => (
                    <button
                      key={prog.id}
                      onClick={() => {
                        setActivePreset(prog.id);
                        // Send ScriptStart with program name as preset trigger
                        sendCommand("ScriptStart", prog.nome);
                        toast({ title: `Preset: ${prog.nome}`, description: "Comando enviado ao vMix." });
                      }}
                      className="px-5 py-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all hover:brightness-125"
                      style={{
                        backgroundColor: activePreset === prog.id ? "#ea580c" : "#c2410c50",
                        color: activePreset === prog.id ? "#fff" : "#fb923c",
                        border: activePreset === prog.id ? "2px solid #fb923c" : "2px solid #c2410c40",
                        minWidth: 100,
                      }}
                    >
                      {prog.nome}
                    </button>
                  ))}
                  {programas.length === 0 && (
                    <p className="text-[11px] text-white/30 py-4">Nenhum programa cadastrado. Cadastre programas no painel principal.</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Grade Programação ── */}
            {programas.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#1a1a2e", border: "1px solid #ffffff08" }}>
                <div className="flex items-center gap-2 px-4 py-2.5" style={{ backgroundColor: "#22c55e18", borderBottom: "1px solid #ffffff08" }}>
                  <Eye size={14} style={{ color: "#22c55e" }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#22c55e" }}>grade programação</span>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-white/60">
                    {programas.length} programa(s) ativo(s) disponíveis como preset
                  </p>
                </div>
              </div>
            )}

            {/* ── Streaming ── */}
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#1a1a2e", border: "1px solid #ffffff08" }}>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ backgroundColor: "#eab30818", borderBottom: "1px solid #ffffff08" }}>
                <Radio size={14} style={{ color: "#eab308" }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#eab308" }}>streaming</span>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => sendCommand(streaming ? "StopStreaming" : "StartStreaming")}
                    className="px-5 py-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all"
                    style={{
                      backgroundColor: streaming ? "#eab308" : "#eab30840",
                      color: streaming ? "#000" : "#eab308",
                      border: streaming ? "2px solid #facc15" : "2px solid #eab30830",
                    }}
                  >
                    {streaming ? "● STREAMING 1" : "STREAMING 1"}
                  </button>
                  <button
                    onClick={() => sendCommand(streaming ? "StopStreaming" : "StartStreaming")}
                    className="px-5 py-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all"
                    style={{
                      backgroundColor: "#eab30840",
                      color: "#eab308",
                      border: "2px solid #eab30830",
                    }}
                  >
                    STREAMING 2
                  </button>
                  <button
                    onClick={() => sendCommand(recording ? "StopRecording" : "StartRecording")}
                    className="px-5 py-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all"
                    style={{
                      backgroundColor: recording ? "#dc2626" : "#eab30840",
                      color: recording ? "#fff" : "#eab308",
                      border: recording ? "2px solid #dc2626" : "2px solid #eab30830",
                    }}
                  >
                    {recording ? "● REC" : "REC"}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Inputs ── */}
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#1a1a2e", border: "1px solid #ffffff08" }}>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ backgroundColor: "#3b82f618", borderBottom: "1px solid #ffffff08" }}>
                <Monitor size={14} style={{ color: "#3b82f6" }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#3b82f6" }}>inputs</span>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-2">
                  {inputs.map(input => {
                    const isActive = activeInput === input.number;
                    const isPreview = previewInput === input.number;
                    return (
                      <button
                        key={input.key || input.number}
                        onClick={() => sendCommand("Cut", input.number)}
                        className="px-5 py-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all hover:brightness-125"
                        style={{
                          backgroundColor: isActive ? "#3b82f6" : isPreview ? "#22c55e40" : "#3b82f640",
                          color: isActive ? "#fff" : isPreview ? "#22c55e" : "#60a5fa",
                          border: isActive ? "2px solid #60a5fa" : isPreview ? "2px solid #22c55e" : "2px solid #3b82f630",
                          minWidth: 60,
                        }}
                      >
                        {input.title.length > 10 ? input.title.substring(0, 10) : input.title}
                      </button>
                    );
                  })}
                  {inputs.length === 0 && (
                    <p className="text-[11px] text-white/30 py-4">Conecte ao vMix para ver os inputs</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Transições & Overlays ── */}
            {sectionBox("Transições", <Camera size={14} style={{ color: "#dc2626" }} />, (
              <div className="flex flex-wrap gap-2">
                {controlBtn("CUT", () => sendCommand("Cut"), "#dc2626", true)}
                {controlBtn("FADE", () => sendCommand("Fade", undefined, "1000"), "#f59e0b")}
                {controlBtn("FTB", () => sendCommand("FadeToBlack"), "#6b7280")}
                {controlBtn("STINGER 1", () => sendCommand("Stinger1"), "#8b5cf6")}
                {controlBtn("STINGER 2", () => sendCommand("Stinger2"), "#8b5cf6")}
              </div>
            ), "#dc2626")}

            {sectionBox("Overlays / GFX", <Layers size={14} style={{ color: "#22c55e" }} />, (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[1, 2, 3, 4].map(n => (
                  <div key={n} className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-white/40 text-center">Overlay {n}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => sendCommand(`OverlayInput${n}`, "1")}
                        className="flex-1 px-2 py-2 rounded-lg text-[10px] font-bold"
                        style={{ backgroundColor: "#22c55e30", color: "#22c55e" }}
                      >
                        ON
                      </button>
                      <button
                        onClick={() => sendCommand(`OverlayInput${n}Off`)}
                        className="flex-1 px-2 py-2 rounded-lg text-[10px] font-bold"
                        style={{ backgroundColor: "#ffffff08", color: "#888" }}
                      >
                        OFF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ), "#22c55e")}
          </>
        )}

        {/* ══ SCENES TAB ══ */}
        {activeTab === "scenes" && (
          <>
            {!editingScene ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white/80">Cenas Salvas</h3>
                  <button onClick={createNewScene} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#268ffa,#2dbef3)" }}>
                    <Plus size={13} /> Nova Cena
                  </button>
                </div>
                {scenes.length === 0 && (
                  <div className="text-center py-12">
                    <Wand2 size={32} className="mx-auto mb-3 text-white/15" />
                    <p className="text-xs text-white/30">Nenhuma cena criada ainda</p>
                    <p className="text-[10px] text-white/20 mt-1">Crie cenas para executar vários comandos em sequência</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {scenes.map(scene => (
                    <div key={scene.id} className="rounded-xl p-4" style={{ backgroundColor: "#1a1a2e", border: "1px solid #ffffff08" }}>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold text-white/80">{scene.name}</h4>
                        <div className="flex gap-1">
                          <button onClick={() => setEditingScene({ ...scene })} className="p-1.5 rounded text-white/30 hover:text-white" style={{ backgroundColor: "#ffffff08" }}>
                            <Wand2 size={11} />
                          </button>
                          <button onClick={() => deleteScene(scene.id)} className="p-1.5 rounded text-red-400/50 hover:text-red-400" style={{ backgroundColor: "#ffffff08" }}>
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-white/30 mb-3">{scene.commands.length} comando(s)</p>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {scene.commands.map((cmd, i) => (
                          <span key={cmd.id} className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: "#ffffff08", color: "#fff8" }}>
                            {i + 1}. {cmd.fn}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => runScene(scene)}
                        disabled={runningScene === scene.id}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold text-white transition-all"
                        style={{ backgroundColor: runningScene === scene.id ? "#f59e0b" : "#22c55e", opacity: runningScene === scene.id ? 0.7 : 1 }}
                      >
                        {runningScene === scene.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                        {runningScene === scene.id ? "Executando..." : "Executar"}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              /* Scene Editor */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white/80">{editingScene.name || "Nova Cena"}</h3>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingScene(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white/50" style={{ backgroundColor: "#ffffff08" }}>
                      Cancelar
                    </button>
                    <button onClick={saveScene} className="px-4 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                      Salvar Cena
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-white/40 mb-1 block">Nome da Cena</label>
                  <input
                    type="text"
                    value={editingScene.name}
                    onChange={e => setEditingScene({ ...editingScene, name: e.target.value })}
                    placeholder="Ex: Abertura do Programa"
                    maxLength={100}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ backgroundColor: "#111", color: "#fff", border: "1px solid #ffffff15" }}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-semibold text-white/40">Comandos (executados em sequência)</label>
                    <button onClick={addCommandToScene} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-white" style={{ backgroundColor: "#268ffa" }}>
                      <Plus size={10} /> Comando
                    </button>
                  </div>

                  {editingScene.commands.length === 0 && (
                    <p className="text-[11px] text-white/20 text-center py-6">Adicione comandos para esta cena</p>
                  )}

                  <div className="space-y-2">
                    {editingScene.commands.map((cmd, idx) => (
                      <div key={cmd.id} className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: "#1a1a2e", border: "1px solid #ffffff08" }}>
                        <span className="text-[10px] font-bold text-white/30 w-5">{idx + 1}</span>
                        <select
                          value={cmd.fn}
                          onChange={e => {
                            const opt = COMMAND_OPTIONS.find(o => o.value === e.target.value);
                            updateSceneCommand(cmd.id, { fn: e.target.value, label: opt?.label || e.target.value });
                          }}
                          className="flex-1 px-2 py-1.5 rounded text-xs outline-none"
                          style={{ backgroundColor: "#111", color: "#fff", border: "1px solid #ffffff15" }}
                        >
                          {(() => {
                            const groups: Record<string, typeof COMMAND_OPTIONS> = {};
                            COMMAND_OPTIONS.forEach(o => { (groups[o.category] ??= []).push(o); });
                            return Object.entries(groups).map(([cat, opts]) => (
                              <optgroup key={cat} label={cat}>
                                {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </optgroup>
                            ));
                          })()}
                        </select>
                        <input
                          type="text"
                          value={cmd.input || ""}
                          onChange={e => updateSceneCommand(cmd.id, { input: e.target.value })}
                          placeholder="Input"
                          maxLength={50}
                          className="w-16 px-2 py-1.5 rounded text-xs outline-none"
                          style={{ backgroundColor: "#111", color: "#fff", border: "1px solid #ffffff15" }}
                        />
                        <input
                          type="text"
                          value={cmd.value || ""}
                          onChange={e => updateSceneCommand(cmd.id, { value: e.target.value })}
                          placeholder="Valor"
                          maxLength={200}
                          className="w-16 px-2 py-1.5 rounded text-xs outline-none"
                          style={{ backgroundColor: "#111", color: "#fff", border: "1px solid #ffffff15" }}
                        />
                        <button onClick={() => removeSceneCommand(cmd.id)} className="p-1.5 rounded text-red-400/50 hover:text-red-400" style={{ backgroundColor: "#ffffff08" }}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══ NDI TAB ══ */}
        {activeTab === "ndi" && (
          <>
            {sectionBox("Adicionar Fonte NDI", <Tv size={14} style={{ color: "#f59e0b" }} />, (
              <div className="space-y-3">
                <p className="text-[11px] text-white/40">
                  Insira o nome ou endereço da fonte NDI disponível na rede para adicioná-la como input no vMix.
                </p>
                <p className="text-[10px] text-white/25">
                  Formato: <code className="bg-white/5 px-1 rounded text-white/50">NOME-PC (Fonte)</code> ou IP direto
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ndiUrl}
                    onChange={e => setNdiUrl(e.target.value)}
                    placeholder="Ex: STUDIO-PC (Camera 1)"
                    maxLength={200}
                    className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{ backgroundColor: "#111", color: "#fff", border: "1px solid #ffffff15" }}
                  />
                  <button
                    onClick={addNdiInput}
                    disabled={!ndiUrl.trim()}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-40"
                    style={{ backgroundColor: "#f59e0b" }}
                  >
                    <Plus size={13} /> Adicionar
                  </button>
                </div>
              </div>
            ), "#f59e0b")}

            {sectionBox("Inputs NDI Atuais", <Wifi size={14} style={{ color: "#22c55e" }} />, (
              <div className="space-y-1.5">
                {inputs.filter(i => i.type === "NDI" || i.title.toLowerCase().includes("ndi")).length === 0 ? (
                  <p className="text-[11px] text-white/30 text-center py-6">Nenhum input NDI encontrado no vMix</p>
                ) : (
                  inputs.filter(i => i.type === "NDI" || i.title.toLowerCase().includes("ndi")).map(input => (
                    <div key={input.key} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ backgroundColor: "#ffffff06" }}>
                      <Tv size={14} className="text-yellow-400/60" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white/80 truncate">{input.title}</p>
                        <p className="text-[9px] text-white/30">Input {input.number} • {input.state}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => sendCommand("PreviewInput", input.number)} className="px-2 py-1 rounded text-[9px] font-bold" style={{ backgroundColor: "#22c55e20", color: "#22c55e" }}>PRV</button>
                        <button onClick={() => sendCommand("Cut", input.number)} className="px-2 py-1 rounded text-[9px] font-bold" style={{ backgroundColor: "#dc262620", color: "#dc2626" }}>PGM</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ), "#22c55e")}

            {sectionBox("Dicas NDI", <Eye size={14} style={{ color: "#a855f7" }} />, (
              <ul className="text-[11px] space-y-1.5 text-white/40 list-disc list-inside">
                <li>Certifique-se de que o <strong className="text-white/60">NDI Tools</strong> está instalado na rede</li>
                <li>A fonte NDI precisa estar transmitindo na mesma sub-rede</li>
                <li>Use o <strong className="text-white/60">NDI Studio Monitor</strong> para verificar fontes disponíveis</li>
                <li>O formato padrão é: <code className="bg-white/5 px-1 rounded text-white/50">NOME-PC (Nome da Fonte)</code></li>
              </ul>
            ), "#a855f7")}
          </>
        )}
      </div>
    </div>
  );
}
