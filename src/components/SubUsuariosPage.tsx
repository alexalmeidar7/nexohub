import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, GripVertical, Plus, RotateCcw, Save, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import type { ModuloGroup } from "./ModulosPage";

const PERFIS = [
  { key: "full", label: "FULL", desc: "Acesso total" },
  { key: "recepcao", label: "RECEPÇÃO", desc: "Atendimento e cadastros" },
  { key: "locutor", label: "LOCUTOR", desc: "Estúdio e no ar" },
  { key: "producao", label: "PRODUÇÃO", desc: "Conteúdo e pauta" },
  { key: "comercial", label: "COMERCIAL", desc: "Vendas e patrocínios" },
] as const;

type PerfilKey = (typeof PERFIS)[number]["key"];
type Perms = Record<PerfilKey, string[]>;

const STORAGE_KEY = "nexo_subuser_role_templates";

const emptyPerms = (): Perms => ({ full: [], recepcao: [], locutor: [], producao: [], comercial: [] });

interface Props {
  groups: ModuloGroup[];
  accentColor?: string;
}

interface FlatItem {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
}

export default function SubUsuariosPage({ groups, accentColor = "#00BFF0" }: Props) {
  const [perms, setPerms] = useState<Perms>(emptyPerms);
  const [dragging, setDragging] = useState<FlatItem | null>(null);
  const [hover, setHover] = useState<PerfilKey | null>(null);
  const [dirty, setDirty] = useState(false);

  const flat = useMemo(() => {
    const map: Record<string, FlatItem> = {};
    groups.forEach((g) => {
      map[`g:${g.label}`] = { id: `g:${g.label}`, label: g.label, group: g.label, icon: g.icon };
      (g.children ?? []).forEach((c) => {
        map[`c:${g.label}:${c.label}`] = { id: `c:${g.label}:${c.label}`, label: c.label, group: g.label, icon: c.icon };
      });
    });
    return map;
  }, [groups]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPerms({ ...emptyPerms(), ...JSON.parse(raw) });
    } catch { /* noop */ }
  }, []);

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(perms));
      setDirty(false);
      toast.success("Perfis de subusuários salvos");
    } catch {
      toast.error("Não foi possível salvar");
    }
  };

  const addTo = (perfil: PerfilKey, id: string) => {
    setPerms((prev) => {
      if (prev[perfil].includes(id)) return prev;
      setDirty(true);
      return { ...prev, [perfil]: [...prev[perfil], id] };
    });
  };

  const removeFrom = (perfil: PerfilKey, id: string) => {
    setPerms((prev) => ({ ...prev, [perfil]: prev[perfil].filter((x) => x !== id) }));
    setDirty(true);
  };

  const addGroupTo = (perfil: PerfilKey, g: ModuloGroup) => {
    const ids = [`g:${g.label}`, ...(g.children ?? []).map((c) => `c:${g.label}:${c.label}`)];
    setPerms((prev) => ({ ...prev, [perfil]: Array.from(new Set([...prev[perfil], ...ids])) }));
    setDirty(true);
  };

  const clear = (perfil: PerfilKey) => {
    setPerms((prev) => ({ ...prev, [perfil]: [] }));
    setDirty(true);
  };

  return (
    <div className="animate-fade-in pb-12">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Subusuários</h2>
          <p className="text-sm text-slate-500">
            Arraste um módulo ou subitem para dentro do perfil desejado para liberar o acesso.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!dirty}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: accentColor }}
        >
          <Save size={16} /> Salvar perfis
        </button>
      </div>

      {/* Boxes dos perfis padrão */}
      <div className="grid gap-4 grid-cols-5 mb-8">
        {PERFIS.map((p) => {
          const items = perms[p.key];
          const isHover = hover === p.key;
          return (
            <div
              key={p.key}
              onDragOver={(e) => { e.preventDefault(); setHover(p.key); }}
              onDragLeave={() => setHover((h) => (h === p.key ? null : h))}
              onDrop={(e) => {
                e.preventDefault();
                setHover(null);
                const id = e.dataTransfer.getData("text/plain") || dragging?.id;
                if (id) addTo(p.key, id);
              }}
              className="rounded-2xl border-2 shadow-sm flex flex-col min-h-[220px] transition-all"
              style={{
                backgroundColor: accentColor,
                borderColor: isHover ? "#ffffff" : accentColor,
                boxShadow: isHover ? `0 0 0 4px ${accentColor}44` : undefined,
              }}
            >
              <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "rgba(255,255,255,0.25)" }}>
                <span
                  className="flex items-center justify-center rounded-lg shrink-0"
                  style={{ width: 32, height: 32, backgroundColor: "rgba(255,255,255,0.2)", color: "#fff" }}
                >
                  <Users size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold tracking-wide text-white">{p.label}</div>
                  <div className="text-[11px] text-white/70 truncate">{p.desc}</div>
                </div>
                <span className="text-[11px] font-semibold text-white/70">{items.length}</span>
              </div>

              <div className="flex-1 p-2.5 flex flex-wrap gap-1.5 content-start">
                {items.length === 0 && (
                  <div className="w-full h-full min-h-[120px] flex items-center justify-center text-center text-[11px] text-white/70 border-2 border-dashed rounded-xl px-3" style={{ borderColor: "rgba(255,255,255,0.35)" }}>
                    Solte aqui os módulos deste perfil
                  </div>
                )}
                {items.map((id) => {
                  const it = flat[id];
                  if (!it) return null;
                  const IIcon = it.icon;
                  const isGroup = id.startsWith("g:");
                  return (
                    <span
                      key={id}
                      className="group inline-flex items-center gap-1.5 rounded-full pl-2 pr-1.5 py-1 text-[11px] border"
                      style={{
                        backgroundColor: isGroup ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.18)",
                        borderColor: "rgba(255,255,255,0.5)",
                        color: isGroup ? "#0f172a" : "#ffffff",
                      }}
                    >
                      <IIcon size={12} style={{ color: isGroup ? accentColor : "#ffffff" }} />
                      <span className="capitalize max-w-[130px] truncate">{it.label}</span>
                      <button
                        type="button"
                        onClick={() => removeFrom(p.key, id)}
                        className="opacity-60 hover:opacity-100 transition-opacity"
                        aria-label="Remover"
                      >
                        <Trash2 size={11} />
                      </button>
                    </span>
                  );
                })}
              </div>

              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => clear(p.key)}
                  className="text-[11px] text-white/70 hover:text-white px-4 py-2 border-t inline-flex items-center gap-1.5 justify-center transition-colors"
                  style={{ borderColor: "rgba(255,255,255,0.25)" }}
                >
                  <RotateCcw size={11} /> Limpar
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Módulos disponíveis (mesmo layout da página Módulos) */}
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-800">Módulos disponíveis</h3>
        <p className="text-xs text-slate-500">Arraste o box do módulo (libera tudo) ou um subitem específico.</p>
      </div>

      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {groups.map((group) => {
          const Icon = group.icon;
          const children = group.children ?? [];
          const gid = `g:${group.label}`;
          return (
            <div
              key={group.label}
              className="rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden"
            >
              <div
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", gid); setDragging(flat[gid]); }}
                onDragEnd={() => { setDragging(null); setHover(null); }}
                className="w-full flex items-center gap-3 px-4 py-4 cursor-grab active:cursor-grabbing hover:bg-slate-50 transition-colors"
              >
                <span
                  className="flex items-center justify-center rounded-xl shrink-0"
                  style={{ width: 42, height: 42, backgroundColor: `${accentColor}1f`, color: accentColor }}
                >
                  <Icon size={20} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold capitalize text-slate-800 truncate">{group.label}</span>
                  <span className="block text-[11px] text-slate-400">
                    {children.length > 0 ? `${children.length} itens` : "Módulo"}
                  </span>
                </span>
                <GripVertical size={16} className="text-slate-300" />
              </div>

              {children.length > 0 && (
                <div className="border-t border-slate-100 bg-slate-50/60 px-2 py-2 flex flex-col gap-1">
                  {children.map((child) => {
                    const CIcon = child.icon;
                    const cid = `c:${group.label}:${child.label}`;
                    const usedIn = PERFIS.filter((p) => perms[p.key].includes(cid)).length;
                    return (
                      <div
                        key={child.label}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", cid); setDragging(flat[cid]); }}
                        onDragEnd={() => { setDragging(null); setHover(null); }}
                        className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-slate-600 bg-transparent hover:bg-white cursor-grab active:cursor-grabbing transition-colors"
                      >
                        <CIcon size={15} style={{ color: accentColor }} className="shrink-0" />
                        <span className="capitalize truncate flex-1">{child.label}</span>
                        {usedIn > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
                            <Check size={11} /> {usedIn}
                          </span>
                        )}
                        <GripVertical size={13} className="text-slate-300" />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Atalho: adicionar módulo inteiro a um perfil */}
              <div className="border-t border-slate-100 px-2 py-2 flex flex-wrap gap-1">
                {PERFIS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => addGroupTo(p.key, group)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[10px] text-slate-500 hover:text-slate-900 hover:border-slate-300 transition-colors"
                    title={`Adicionar tudo em ${p.label}`}
                  >
                    <Plus size={10} /> {p.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
