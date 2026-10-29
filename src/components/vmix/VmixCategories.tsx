import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Folder, Plus, Trash2, X, Camera, Mic, Music, Radio, Tv, Video, Layers, Star,
  Megaphone, Clapperboard, Monitor, Sun, Cloud, Zap, Image as ImageIcon, Type,
  type LucideIcon,
} from "lucide-react";

const normStudio = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .trim()
    .toLocaleUpperCase("pt-BR");

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  camera: Camera,
  mic: Mic,
  music: Music,
  radio: Radio,
  tv: Tv,
  video: Video,
  layers: Layers,
  star: Star,
  megaphone: Megaphone,
  clapperboard: Clapperboard,
  monitor: Monitor,
  sun: Sun,
  cloud: Cloud,
  zap: Zap,
  image: ImageIcon,
  type: Type,
};

export interface VmixCategoria {
  id: string;
  nome: string;
  icone: string | null;
  ordem: number;
  inputs: string[];
  estudio: string | null;
}

/** Categorias do switcher, isoladas por usuário + estúdio selecionado. */
export function useVmixCategories(userId?: string | null, estudio?: string | null) {
  const [categorias, setCategorias] = useState<VmixCategoria[]>([]);

  const reload = useCallback(async () => {
    if (!userId) { setCategorias([]); return; }
    let q = (supabase.from("vmix_switcher_categorias" as any) as any)
      .select("*")
      .eq("user_id", userId)
      .order("ordem");
    const { data } = await q;
    const list = ((data as any[]) || [])
      .filter(c => !estudio || !c.estudio || normStudio(c.estudio) === normStudio(estudio))
      .map(c => ({ ...c, inputs: Array.isArray(c.inputs) ? c.inputs.map(String) : [] })) as VmixCategoria[];
    setCategorias(list);
  }, [userId, estudio]);

  useEffect(() => { reload(); }, [reload]);

  const criar = useCallback(async (nome: string, icone: string) => {
    if (!userId) return;
    await (supabase.from("vmix_switcher_categorias" as any) as any).insert({
      user_id: userId,
      estudio: estudio || null,
      nome: nome.trim() || "Categoria",
      icone,
      ordem: categorias.length,
      inputs: [],
    });
    reload();
  }, [userId, estudio, categorias.length, reload]);

  const excluir = useCallback(async (id: string) => {
    await (supabase.from("vmix_switcher_categorias" as any) as any).delete().eq("id", id);
    reload();
  }, [reload]);

  const setInputs = useCallback(async (id: string, inputs: string[]) => {
    setCategorias(prev => prev.map(c => (c.id === id ? { ...c, inputs } : c)));
    await (supabase.from("vmix_switcher_categorias" as any) as any).update({ inputs }).eq("id", id);
  }, []);

  const moverInput = useCallback(async (inputNumber: string, destinoId: string) => {
    const atuais = categorias;
    for (const c of atuais) {
      if (c.id !== destinoId && c.inputs.includes(inputNumber)) {
        await setInputs(c.id, c.inputs.filter(i => i !== inputNumber));
      }
    }
    const destino = atuais.find(c => c.id === destinoId);
    if (destino && !destino.inputs.includes(inputNumber)) {
      await setInputs(destinoId, [...destino.inputs, inputNumber]);
    }
  }, [categorias, setInputs]);

  const removerInput = useCallback(async (inputNumber: string, catId: string) => {
    const cat = categorias.find(c => c.id === catId);
    if (!cat) return;
    await setInputs(catId, cat.inputs.filter(i => i !== inputNumber));
  }, [categorias, setInputs]);

  const categorizados = useMemo(
    () => new Set(categorias.flatMap(c => c.inputs)),
    [categorias],
  );

  return { categorias, reload, criar, excluir, setInputs, moverInput, removerInput, categorizados };
}

interface CreateProps { onCreate: (nome: string, icone: string) => void }

export function VmixCategoryCreator({ onCreate }: CreateProps) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [icone, setIcone] = useState("folder");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full h-8 rounded border border-dashed flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all hover:brightness-125"
        style={{ borderColor: "#ffffff20", color: "#ffffff55" }}
      >
        <Plus size={11} /> Nova categoria
      </button>
    );
  }

  return (
    <div className="rounded border p-2.5 space-y-2" style={{ borderColor: "#ffffff18", backgroundColor: "#00000030" }}>
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={nome}
          onChange={e => setNome(e.target.value)}
          placeholder="Nome da categoria"
          className="flex-1 px-2.5 py-1.5 rounded text-[11px] outline-none"
          style={{ backgroundColor: "#ffffff0d", border: "1px solid #ffffff14", color: "#fff" }}
        />
        <button onClick={() => { setOpen(false); setNome(""); }} className="text-white/40 hover:text-white"><X size={13} /></button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
          <button
            key={key}
            onClick={() => setIcone(key)}
            className="w-7 h-7 rounded flex items-center justify-center transition-all"
            style={{
              backgroundColor: icone === key ? "#C6F03C" : "#ffffff0d",
              color: icone === key ? "#000" : "#ffffff70",
              border: "1px solid #ffffff14",
            }}
          >
            <Icon size={13} />
          </button>
        ))}
      </div>
      <button
        onClick={() => { onCreate(nome, icone); setOpen(false); setNome(""); setIcone("folder"); }}
        className="w-full h-8 rounded text-[9px] font-black uppercase tracking-widest"
        style={{ backgroundColor: "#C6F03C", color: "#000" }}
      >
        Criar categoria
      </button>
    </div>
  );
}

interface PanelProps {
  side: "preview" | "program";
  categorias: VmixCategoria[];
  inputs: { key: string; number: string; title: string }[];
  previewInput?: string | null;
  activeInput?: string | null;
  onSelect: (inputNumber: string) => void;
  onDropInput?: (inputNumber: string, categoriaId: string) => void;
  onReorderInput?: (categoriaId: string, inputNumber: string, targetInputNumber: string) => void;
  onRemoveInput?: (inputNumber: string, categoriaId: string) => void;
  onDelete?: (id: string) => void;
  shortcuts?: Record<string, string>;
  capturingShortcut?: string | null;
  onSetShortcut?: (inputKey: string) => void;
}

/**
 * Renderiza as categorias. No lado "preview" permite drag and drop e edição;
 * no lado "program" as mesmas categorias são espelhadas (somente execução).
 */
export function VmixCategoryPanel({
  side, categorias, inputs, previewInput, activeInput, onSelect, onDropInput, onReorderInput, onRemoveInput, onDelete,
  shortcuts, capturingShortcut, onSetShortcut,
}: PanelProps) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const editable = side === "preview";
  const accent = side === "preview" ? "#C6F03C" : "#dc2626";
  const accentText = side === "preview" ? "#000" : "#fff";

  if (categorias.length === 0) return null;

  return (
    <div className="space-y-2">
      {categorias.map(cat => {
        const Icon = CATEGORY_ICONS[cat.icone || "folder"] || Folder;
        const items = cat.inputs
          .map(n => inputs.find(i => i.number === n))
          .filter(Boolean) as PanelProps["inputs"];
        return (
          <div
            key={cat.id}
            onDragOver={editable ? (e) => { e.preventDefault(); setDragOver(cat.id); } : undefined}
            onDragLeave={editable ? () => setDragOver(null) : undefined}
            onDrop={editable ? (e) => {
              e.preventDefault();
              setDragOver(null);
              const num = e.dataTransfer.getData("text/vmix-input");
              if (num) onDropInput?.(num, cat.id);
            } : undefined}
            className="rounded border p-2"
            style={{
              borderColor: dragOver === cat.id ? "#C6F03C" : "#ffffff10",
              backgroundColor: dragOver === cat.id ? "#C6F03C12" : "#0a0a0a",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Icon size={12} style={{ color: "#C6F03C" }} />
                <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: "#ffffff80" }}>{cat.nome}</span>
                <span className="text-[8px] font-mono" style={{ color: "#ffffff35" }}>{items.length}</span>
              </div>
              {editable && onDelete && (
                <button onClick={() => onDelete(cat.id)} className="text-white/15 hover:text-white/50 transition-colors" title="Excluir categoria">
                  <X size={10} />
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <p className="text-[9px] py-2 text-center" style={{ color: "#ffffff25" }}>
                {editable ? "Arraste botões para cá" : "Vazio"}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {items.map(input => {
                  const on = side === "preview" ? previewInput === input.number : activeInput === input.number;
                  const shortcutKey = input.key || input.number;
                  const shortcut = shortcuts?.[input.key] || shortcuts?.[input.number];
                  const isCapturing = capturingShortcut === shortcutKey;
                  return (
                    <div
                      key={`${side}-${cat.id}-${input.number}`}
                      className="relative group"
                      onDragOver={editable ? (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; } : undefined}
                      onDrop={editable ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const dragged = e.dataTransfer.getData("text/vmix-input");
                        if (dragged && dragged !== input.number) onReorderInput?.(cat.id, dragged, input.number);
                      } : undefined}
                    >
                      <button
                        draggable={editable}
                        onDragStart={editable ? (e) => {
                          e.dataTransfer.setData("text/vmix-input", input.number);
                          e.dataTransfer.effectAllowed = "move";
                        } : undefined}
                        onClick={() => onSelect(input.number)}
                        onContextMenu={onSetShortcut ? (e) => { e.preventDefault(); onSetShortcut(shortcutKey); } : undefined}
                        title={input.title}
                        className="vmix-hover-ring w-full h-12 rounded border text-[10px] font-bold flex flex-col items-center justify-center transition-all cursor-grab active:cursor-grabbing"
                        style={{
                          backgroundColor: on ? accent : "#1a1a1a",
                          color: on ? accentText : "#e5e5e5",
                          borderColor: on ? accent : "#2a2a2a",
                          boxShadow: on ? `0 0 14px ${accent}70` : "inset 0 1px 0 rgba(255,255,255,0.04)",
                        }}
                      >
                        <span className="text-[9px] font-black opacity-70 leading-none">{input.number}</span>
                        <span className="truncate max-w-full px-1 uppercase leading-tight mt-0.5">{input.title}</span>
                      </button>

                      {onSetShortcut && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onSetShortcut(shortcutKey); }}
                          className={`absolute -top-1 left-1 px-1 py-0.5 rounded text-[8px] font-mono border transition-all ${
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
                          title="Definir atalho de teclado"
                        >
                          {isCapturing ? "PRESS..." : shortcut ? shortcut.toUpperCase() : "SET"}
                        </button>
                      )}

                      {editable && onRemoveInput && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onRemoveInput(input.number, cat.id); }}
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full items-center justify-center hidden group-hover:flex"
                          style={{ backgroundColor: "#1a1a1a", color: "#ffffff70", border: "1px solid #2a2a2a" }}
                          title="Remover da categoria"
                        >
                          <X size={8} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

