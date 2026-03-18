import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, GripVertical, Play, Loader2, X, ChevronDown, ChevronUp, Clock } from "lucide-react";

interface PresetCommand {
  id: string;
  fn: string;
  input?: string;
  value?: string;
  extraKey?: string;
  extraValue?: string;
}

interface VmixInput {
  key: string;
  number: string;
  title: string;
  type: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  programaId: string;
  programaNome: string;
  programaHorario: string;
  userId: string;
  inputs: VmixInput[];
  onRunCommands: (commands: PresetCommand[]) => Promise<void>;
}

const PRESET_COMMANDS = [
  { value: "CutDirect", label: "CutDirect", desc: "Corta diretamente para o input", category: "Transição", params: ["input"] },
  { value: "Cut", label: "Cut", desc: "Corta para o input no Preview", category: "Transição", params: ["input"] },
  { value: "Fade", label: "Fade", desc: "Transição suave para o input", category: "Transição", params: ["input", "value"] },
  { value: "FadeToBlack", label: "FadeToBlack", desc: "Transição para tela preta", category: "Transição", params: [] },
  { value: "PreviewInput", label: "PreviewInput", desc: "Envia input para o Preview", category: "Input", params: ["input"] },
  { value: "SelectIndex", label: "SelectIndex", desc: "Seleciona um índice no input", category: "Input", params: ["input", "value"] },
  { value: "SetMultiViewOverlay", label: "SetMultiViewOverlay", desc: "Define overlay no MultiView", category: "Overlay", params: ["input", "value", "extra"] },
  { value: "SetText", label: "SetText", desc: "Define texto em um título", category: "Título", params: ["input", "value", "extra"] },
  { value: "SetImage", label: "SetImage", desc: "Define imagem em um input", category: "Título", params: ["input", "value", "extra"] },
  { value: "OverlayInput1", label: "Overlay 1 ON", desc: "Ativa Overlay 1", category: "Overlay", params: ["input"] },
  { value: "OverlayInput1Off", label: "Overlay 1 OFF", desc: "Desativa Overlay 1", category: "Overlay", params: [] },
  { value: "OverlayInput2", label: "Overlay 2 ON", desc: "Ativa Overlay 2", category: "Overlay", params: ["input"] },
  { value: "OverlayInput2Off", label: "Overlay 2 OFF", desc: "Desativa Overlay 2", category: "Overlay", params: [] },
  { value: "OverlayInput3", label: "Overlay 3 ON", desc: "Ativa Overlay 3", category: "Overlay", params: ["input"] },
  { value: "OverlayInput3Off", label: "Overlay 3 OFF", desc: "Desativa Overlay 3", category: "Overlay", params: [] },
  { value: "OverlayInput4", label: "Overlay 4 ON", desc: "Ativa Overlay 4", category: "Overlay", params: ["input"] },
  { value: "OverlayInput4Off", label: "Overlay 4 OFF", desc: "Desativa Overlay 4", category: "Overlay", params: [] },
  { value: "AudioOn", label: "AudioOn", desc: "Liga áudio do input", category: "Áudio", params: ["input"] },
  { value: "AudioOff", label: "AudioOff", desc: "Desliga áudio do input", category: "Áudio", params: ["input"] },
  { value: "SetVolume", label: "SetVolume", desc: "Define volume (0-100)", category: "Áudio", params: ["input", "value"] },
  { value: "StartStreaming", label: "StartStreaming", desc: "Inicia streaming", category: "Streaming", params: [] },
  { value: "StopStreaming", label: "StopStreaming", desc: "Para streaming", category: "Streaming", params: [] },
  { value: "StartRecording", label: "StartRecording", desc: "Inicia gravação", category: "Gravação", params: [] },
  { value: "StopRecording", label: "StopRecording", desc: "Para gravação", category: "Gravação", params: [] },
  { value: "ScriptStart", label: "ScriptStart", desc: "Inicia um script vMix", category: "Script", params: ["value"] },
  { value: "ScriptStop", label: "ScriptStop", desc: "Para um script vMix", category: "Script", params: ["value"] },
];

const CATEGORIES = [...new Set(PRESET_COMMANDS.map(c => c.category))];

function getCommandDef(fn: string) {
  return PRESET_COMMANDS.find(c => c.value === fn);
}

function getExtraLabel(fn: string): { keyLabel: string; valueLabel: string } {
  if (fn === "SetMultiViewOverlay") return { keyLabel: "Index", valueLabel: "InputOverlay" };
  if (fn === "SetText") return { keyLabel: "Index", valueLabel: "Texto" };
  if (fn === "SetImage") return { keyLabel: "Index", valueLabel: "Caminho da imagem" };
  return { keyLabel: "Extra Key", valueLabel: "Extra Value" };
}

function formatCommandPreview(cmd: PresetCommand, inputs: VmixInput[]): string {
  const inputLabel = cmd.input ? (inputs.find(i => i.key === cmd.input)?.title || cmd.input) : "";
  let line = cmd.fn;
  if (cmd.input) line += `(${inputLabel}`;
  if (cmd.value) line += `, ${cmd.value}`;
  if (cmd.extraValue) line += `, ${cmd.extraValue}`;
  if (cmd.input) line += ")";
  return line;
}

export default function PresetCommandEditor({ open, onClose, programaId, programaNome, programaHorario, userId, inputs, onRunCommands }: Props) {
  const { toast } = useToast();
  const [commands, setCommands] = useState<PresetCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("preset_commands" as any)
      .select("commands")
      .eq("user_id", userId)
      .eq("programa_id", programaId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.commands && Array.isArray(data.commands)) {
          setCommands(data.commands);
        } else {
          setCommands([]);
        }
        setLoading(false);
      });
  }, [open, programaId, userId]);

  const addCommand = () => {
    setCommands(prev => [...prev, { id: crypto.randomUUID(), fn: "CutDirect" }]);
  };

  const updateCommand = (id: string, updates: Partial<PresetCommand>) => {
    setCommands(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const removeCommand = (id: string) => {
    setCommands(prev => prev.filter(c => c.id !== id));
  };

  const moveCommand = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= commands.length) return;
    const arr = [...commands];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setCommands(arr);
  };

  const saveCommands = async () => {
    setSaving(true);
    const { data: existing } = await (supabase.from("preset_commands" as any) as any)
      .select("id")
      .eq("user_id", userId)
      .eq("programa_id", programaId)
      .maybeSingle();

    if (existing) {
      await (supabase.from("preset_commands" as any) as any).update({ commands }).eq("id", existing.id);
    } else {
      await (supabase.from("preset_commands" as any) as any).insert({ user_id: userId, programa_id: programaId, commands });
    }
    setSaving(false);
    toast({ title: "Ações salvas", description: `${commands.length} comando(s) salvos para ${programaNome}.` });
  };

  const runAll = async () => {
    setRunning(true);
    await onRunCommands(commands);
    setRunning(false);
  };

  const generateScript = () => {
    return commands.map((cmd, i) => {
      const inputLabel = cmd.input || "";
      let line = i === 0 ? `${cmd.fn}(${inputLabel}` : `*${cmd.fn}(${inputLabel}`;
      if (cmd.value) line += `, ${cmd.value}`;
      if (cmd.extraValue) line += `, ${cmd.extraValue}`;
      line += ")";
      return line;
    }).join("\n");
  };

  const parseScript = (script: string) => {
    const lines = script.split("\n").map(l => l.trim()).filter(Boolean);
    const parsed: PresetCommand[] = [];
    for (const line of lines) {
      const clean = line.replace(/^\*/, "");
      const match = clean.match(/^(\w+)\(([^)]*)\)$/);
      if (!match) continue;
      const fn = match[1];
      const def = getCommandDef(fn);
      if (!def) continue;
      const args = match[2].split(",").map(a => a.trim());
      const cmd: PresetCommand = { id: crypto.randomUUID(), fn };
      if (def.params.includes("input") && args[0]) cmd.input = args[0];
      if (def.params.includes("value") && args[1]) cmd.value = args[1];
      if (def.params.includes("extra") && args[2]) cmd.extraValue = args[2];
      parsed.push(cmd);
    }
    if (parsed.length > 0) {
      setCommands(parsed);
      toast({ title: "Script importado", description: `${parsed.length} comando(s) importados.` });
    } else {
      toast({ title: "Erro ao importar", description: "Nenhum comando válido encontrado no script.", variant: "destructive" });
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden" style={{ backgroundColor: "#1a1a22", border: "1px solid #333", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #ffffff0a", background: "linear-gradient(135deg, #1e1e28, #22222c)" }}>
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: "#eee" }}>{programaNome}</h2>
            <div className="flex items-center gap-1.5">
              <Clock size={10} style={{ color: "#888" }} />
              <span className="text-[10px] font-mono" style={{ color: "#888" }}>{programaHorario}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#ffffff08", color: "#666" }}>{commands.length} ação(ões)</span>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors" style={{ color: "#888" }}>
            <X size={16} />
          </button>
        </div>

        {/* Commands list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin" size={20} style={{ color: "#666" }} />
            </div>
          ) : commands.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-xs mb-2" style={{ color: "#666" }}>Nenhuma ação configurada.</p>
              <p className="text-[10px]" style={{ color: "#555" }}>Clique em "Adicionar Ação" para começar a programar este preset.</p>
            </div>
          ) : (
            commands.map((cmd, idx) => {
              const def = getCommandDef(cmd.fn);
              const hasInput = def?.params.includes("input");
              const hasValue = def?.params.includes("value");
              const hasExtra = def?.params.includes("extra");
              const extraLabels = getExtraLabel(cmd.fn);

              return (
                <div key={cmd.id} className="rounded-lg overflow-hidden" style={{ backgroundColor: "#222230", border: "1px solid #2a2a38" }}>
                  {/* Command header */}
                  <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: "#ffffff04", borderBottom: "1px solid #ffffff06" }}>
                    <span className="text-[9px] font-black w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: idx === 0 ? "#dc262630" : "#ffffff08", color: idx === 0 ? "#dc2626" : "#888" }}>
                      #{idx}
                    </span>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <GripVertical size={10} style={{ color: "#444" }} />
                      <span className="text-[10px] font-bold truncate" style={{ color: "#ccc" }}>{formatCommandPreview(cmd, inputs)}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => moveCommand(idx, -1)} disabled={idx === 0} className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-20" style={{ color: "#888" }}>
                        <ChevronUp size={10} />
                      </button>
                      <button onClick={() => moveCommand(idx, 1)} disabled={idx === commands.length - 1} className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-20" style={{ color: "#888" }}>
                        <ChevronDown size={10} />
                      </button>
                      <button onClick={() => removeCommand(cmd.id)} className="w-5 h-5 rounded flex items-center justify-center hover:bg-red-500/20 transition-colors" style={{ color: "#f87171" }}>
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>

                  {/* Command fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3">
                    {/* Command select */}
                    <div className="flex flex-col gap-1 sm:col-span-2">
                      <label className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "#666" }}>Command</label>
                      <select
                        value={cmd.fn}
                        onChange={e => updateCommand(cmd.id, { fn: e.target.value, input: undefined, value: undefined, extraKey: undefined, extraValue: undefined })}
                        className="w-full text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
                        style={{ backgroundColor: "#181820", color: "#ccc", border: "1px solid #333" }}
                      >
                        {CATEGORIES.map(cat => (
                          <optgroup key={cat} label={cat}>
                            {PRESET_COMMANDS.filter(c => c.category === cat).map(c => (
                              <option key={c.value} value={c.value}>{c.value} — {c.desc}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {/* Input select */}
                    {hasInput && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "#666" }}>Input</label>
                        <select
                          value={cmd.input || ""}
                          onChange={e => updateCommand(cmd.id, { input: e.target.value })}
                          className="w-full text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
                          style={{ backgroundColor: "#181820", color: "#ccc", border: "1px solid #333" }}
                        >
                          <option value="">— Selecionar —</option>
                          {inputs.map(inp => (
                            <option key={inp.key} value={inp.key}>{inp.number} – {inp.title}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Value/Index */}
                    {hasValue && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "#666" }}>
                          {cmd.fn === "SelectIndex" ? "Index" : cmd.fn === "Fade" ? "Duração (ms)" : cmd.fn === "SetVolume" ? "Volume (0-100)" : hasExtra ? extraLabels.keyLabel : "Value"}
                        </label>
                        <input
                          type="text"
                          value={cmd.value || ""}
                          onChange={e => updateCommand(cmd.id, { value: e.target.value })}
                          className="w-full text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
                          style={{ backgroundColor: "#181820", color: "#ccc", border: "1px solid #333" }}
                          placeholder="Valor..."
                        />
                      </div>
                    )}

                    {/* Extra (e.g. InputOverlay, Text, Image path) */}
                    {hasExtra && (
                      <div className="flex flex-col gap-1 sm:col-span-2">
                        <label className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "#666" }}>{extraLabels.valueLabel}</label>
                        <input
                          type="text"
                          value={cmd.extraValue || ""}
                          onChange={e => updateCommand(cmd.id, { extraValue: e.target.value })}
                          className="w-full text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
                          style={{ backgroundColor: "#181820", color: "#ccc", border: "1px solid #333" }}
                          placeholder={extraLabels.valueLabel + "..."}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Code preview toggle */}
        {commands.length > 0 && (
          <div className="px-4">
            <button
              onClick={() => setShowCode(!showCode)}
              className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors"
              style={{ color: "#888", backgroundColor: showCode ? "#ffffff10" : "transparent" }}
            >
              {showCode ? "Ocultar código" : "Ver código do script"}
            </button>
            {showCode && (
              <pre className="mt-2 p-3 rounded-lg text-[10px] font-mono overflow-x-auto" style={{ backgroundColor: "#111118", color: "#22c55e", border: "1px solid #222", whiteSpace: "pre-wrap" }}>
                {generateScript()}
              </pre>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3" style={{ borderTop: "1px solid #ffffff0a", backgroundColor: "#ffffff03" }}>
          <button
            onClick={addCommand}
            className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all hover:scale-[1.03]"
            style={{ backgroundColor: "#268ffa15", color: "#268ffa", border: "1px solid #268ffa30" }}
          >
            <Plus size={12} />
            Adicionar Ação
          </button>
          <div className="flex items-center gap-2">
            {commands.length > 0 && (
              <button
                onClick={runAll}
                disabled={running}
                className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all hover:scale-[1.03]"
                style={{ backgroundColor: "#22c55e15", color: "#22c55e", border: "1px solid #22c55e30" }}
              >
                {running ? <Loader2 className="animate-spin" size={12} /> : <Play size={12} />}
                Testar
              </button>
            )}
            <button
              onClick={saveCommands}
              disabled={saving}
              className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all hover:scale-[1.03]"
              style={{ backgroundColor: "#f59e0b15", color: "#f59e0b", border: "1px solid #f59e0b30" }}
            >
              {saving ? <Loader2 className="animate-spin" size={12} /> : null}
              Salvar
            </button>
            <button
              onClick={onClose}
              className="text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors hover:bg-white/5"
              style={{ color: "#888" }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
