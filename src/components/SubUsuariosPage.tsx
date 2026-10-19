import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { 
  Check, GripVertical, RotateCcw, Save, Trash2, Users,
  ShieldCheck, Headphones, Mic, Clapperboard, Briefcase, Plus, Sparkles
} from "lucide-react";
import { toast } from "sonner";
import type { ModuloGroup } from "./ModulosPage";

const PERFIS = [
  { 
    key: "full", 
    label: "FULL", 
    desc: "Acesso total", 
    icon: ShieldCheck, 
    color: "#0055ff", 
    bgBadge: "bg-[#d0deff]/40",
    textColor: "text-[#0055ff]",
  },
  { 
    key: "recepcao", 
    label: "RECEPÇÃO", 
    desc: "Atendimento e cadastros", 
    icon: Headphones, 
    color: "#0284c7", 
    bgBadge: "bg-sky-50",
    textColor: "text-sky-600",
  },
  { 
    key: "locutor", 
    label: "LOCUTOR", 
    desc: "Estúdio e no ar", 
    icon: Mic, 
    color: "#7c3aed", 
    bgBadge: "bg-purple-50",
    textColor: "text-purple-600",
  },
  { 
    key: "producao", 
    label: "PRODUÇÃO", 
    desc: "Conteúdo e pauta", 
    icon: Clapperboard, 
    color: "#d97706", 
    bgBadge: "bg-amber-50",
    textColor: "text-amber-600",
  },
  { 
    key: "comercial", 
    label: "COMERCIAL", 
    desc: "Vendas e patrocínios", 
    icon: Briefcase, 
    color: "#059669", 
    bgBadge: "bg-emerald-50",
    textColor: "text-emerald-600",
  },
] as const;

type PerfilKey = (typeof PERFIS)[number]["key"];
type Perms = Record<PerfilKey, string[]>;

const STORAGE_KEY = "nexo_subuser_role_templates";

const emptyPerms = (): Perms => ({ full: [], recepcao: [], locutor: [], producao: [], comercial: [] });

// Perfis padrão definidos pelo administrador
const DEFAULT_PERMS: Perms = {
  full: [
    "g:cadastros",
    "g:sorteio",
    "g:blitz",
    "g:roteiro de programa",
    "g:música no ar",
    "g:agenda",
    "g:site",
    "g:comercial",
    "g:vmix",
    "g:ferramentas",
  ],
  recepcao: [
    "c:cadastros:ouvintes",
    "g:sorteio",
    "g:blitz",
  ],
  locutor: [
    "c:comercial:módulo locutor",
  ],
  producao: [
    "g:roteiro de programa",
    "g:agenda",
    "c:site:site",
    "c:vmix:batalha musical",
    "c:vmix:enquete",
    "c:vmix:quiz",
    "c:ferramentas:editor de vídeo",
    "c:ferramentas:abrir TP externo",
  ],
  comercial: [
    "c:cadastros:participantes",
    "g:sorteio",
    "g:blitz",
    "g:agenda",
    "c:comercial:ADS",
    "c:comercial:citações",
    "c:comercial:promoções",
    "c:comercial:logos",
    "c:comercial:config módulo locutor",
    "c:comercial:shopping",
  ],
};


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
      const walk = (list: { icon: LucideIcon; label: string; children?: unknown }[]) => {
        list.forEach((c) => {
          map[`c:${g.label}:${c.label}`] = { id: `c:${g.label}:${c.label}`, label: c.label, group: g.label, icon: c.icon };
          const sub = (c as { children?: { icon: LucideIcon; label: string }[] }).children;
          if (sub?.length) walk(sub);
        });
      };
      walk((g.children ?? []) as { icon: LucideIcon; label: string }[]);
    });
    return map;
  }, [groups]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPerms({ ...emptyPerms(), ...JSON.parse(raw) });
      else setPerms({ ...emptyPerms(), ...DEFAULT_PERMS });
    } catch { setPerms({ ...emptyPerms(), ...DEFAULT_PERMS }); }
  }, []);

  const restoreDefaults = () => {
    setPerms({ ...emptyPerms(), ...DEFAULT_PERMS });
    setDirty(true);
    toast.success("Perfis padrão aplicados — clique em Salvar perfis");
  };


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


  const clear = (perfil: PerfilKey) => {
    setPerms((prev) => ({ ...prev, [perfil]: [] }));
    setDirty(true);
  };

  return (
    <div className="max-w-none mx-0 w-full space-y-6 pt-2 pb-12 font-sans animate-fade-in">
      {/* 1. Header Section (Card Branco Moderno) */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base md:text-lg font-black tracking-wider text-[#002132] uppercase leading-tight">
            Gestão de Subusuários & Permissões
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Arraste um módulo ou subitem para dentro do perfil desejado para liberar o acesso das equipes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={restoreDefaults}
            className="h-11 px-6 rounded-full border border-slate-200/80 text-slate-700 bg-slate-50 hover:bg-slate-100 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all cursor-pointer shadow-sm"
          >
            <RotateCcw size={15} /> Restaurar padrão
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty}
            className="h-11 px-8 rounded-full bg-[#0055ff] hover:bg-[#0047d4] active:scale-95 text-white font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all cursor-pointer shadow-md hover:shadow-lg hover:shadow-blue-500/20 disabled:opacity-40"
          >
            <Save size={16} className="text-white" /> Salvar Perfis
          </button>
        </div>
      </section>

      {/* Boxes dos perfis padrão (barra fixa no topo ao rolar) */}
      <div
        className="sticky top-0 z-30 -mx-1 px-1 pt-1 pb-4 mb-6"
        style={{
          backgroundColor: "var(--layout-page-bg, #ffffff)",
          boxShadow: "0 12px 16px -12px rgba(15,23,42,0.18)",
        }}
      >
        <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {PERFIS.map((p) => {
            const items = perms[p.key];
            const isHover = hover === p.key;
            const PIcon = p.icon;
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
                className={`rounded-3xl border transition-all duration-200 flex flex-col min-h-[220px] max-h-[46vh] overflow-hidden bg-white shadow-[0_4px_24px_rgba(1,28,91,0.05)] hover:shadow-[0_12px_32px_rgba(1,28,91,0.10)] hover:-translate-y-0.5 ${
                  isHover 
                    ? "border-[#0055ff] ring-4 ring-[#0055ff]/15 bg-blue-50/20 scale-[1.01]" 
                    : "border-[#d0deff]/80 hover:border-[#0055ff]/40"
                }`}
              >
                {/* Linha de Destaque Superior Colorida */}
                <div 
                  className="h-1.5 w-full shrink-0" 
                  style={{ background: `linear-gradient(90deg, ${p.color}, #0055ff)` }} 
                />

                {/* Cabeçalho do Card */}
                <div className="px-4 py-3.5 border-b border-[#d0deff]/60 flex items-center justify-between gap-2 bg-gradient-to-b from-slate-50/70 to-white shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div 
                      className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 shadow-xs border"
                      style={{ 
                        backgroundColor: `${p.color}14`, 
                        borderColor: `${p.color}35`,
                        color: p.color 
                      }}
                    >
                      <PIcon size={18} strokeWidth={2.2} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] font-black tracking-wider text-[#011c5b] uppercase leading-tight truncate">
                        {p.label}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                        {p.desc}
                      </div>
                    </div>
                  </div>

                  <span 
                    className={`text-[10px] font-black tracking-wider px-2 py-0.5 rounded-full shrink-0 border ${
                      items.length > 0 
                        ? "bg-[#d0deff]/40 text-[#011c5b] border-[#d0deff]" 
                        : "bg-slate-100 text-slate-400 border-slate-200"
                    }`}
                  >
                    {items.length}
                  </span>
                </div>

                {/* Área de Itens / Dropzone */}
                <div className="flex-1 p-3 flex flex-wrap gap-1.5 content-start overflow-y-auto bg-slate-50/35">
                  {items.length === 0 ? (
                    <div className="w-full h-full min-h-[140px] flex flex-col items-center justify-center text-center p-4 border-2 border-dashed border-[#d0deff]/80 rounded-2xl bg-white/80 gap-1.5 transition-colors">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center mb-0.5"
                        style={{ backgroundColor: `${p.color}15`, color: p.color }}
                      >
                        <Plus size={16} />
                      </div>
                      <span className="text-[11px] font-bold text-[#011c5b]">Solte módulos aqui</span>
                      <span className="text-[10px] text-slate-400">para liberar o acesso</span>
                    </div>
                  ) : (
                    items.map((id) => {
                      const it = flat[id];
                      if (!it) return null;
                      const IIcon = it.icon;
                      const isGroup = id.startsWith("g:");
                      return (
                        <span
                          key={id}
                          className={`inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-1 text-[11px] transition-all shadow-xs ${
                            isGroup 
                              ? "bg-white border border-[#d0deff] text-[#011c5b] font-bold hover:border-[#0055ff] hover:shadow-sm" 
                              : "bg-[#d0deff]/25 border border-[#d0deff]/70 text-[#011c5b] font-medium hover:bg-[#d0deff]/40"
                          }`}
                        >
                          <IIcon 
                            size={12} 
                            className="shrink-0" 
                            style={{ color: isGroup ? "#0055ff" : p.color }} 
                          />
                          <span className="capitalize max-w-[125px] truncate">{it.label}</span>
                          <button
                            type="button"
                            onClick={() => removeFrom(p.key, id)}
                            className="w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer ml-0.5"
                            aria-label="Remover"
                            title="Remover módulo"
                          >
                            <Trash2 size={10} />
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>

                {/* Rodapé do Card */}
                {items.length > 0 && (
                  <div className="px-3.5 py-2 border-t border-[#d0deff]/50 bg-white flex items-center justify-between shrink-0">
                    <span className="text-[10px] text-slate-400 font-medium pl-0.5">
                      {items.length} {items.length === 1 ? "item" : "itens"}
                    </span>
                    <button
                      type="button"
                      onClick={() => clear(p.key)}
                      className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2.5 py-1 rounded-full inline-flex items-center gap-1 transition-all cursor-pointer"
                      title="Limpar todos os módulos deste perfil"
                    >
                      <RotateCcw size={10} /> Limpar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
              className="rounded-2xl bg-white border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_24px_rgba(15,23,42,0.10)] hover:-translate-y-0.5 transition-all flex flex-col overflow-hidden"
            >
              <div
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", gid); setDragging(flat[gid]); }}
                onDragEnd={() => { setDragging(null); setHover(null); }}
                className="w-full flex items-center gap-3 px-4 py-4 cursor-grab active:cursor-grabbing transition-colors"
                style={{ background: `linear-gradient(135deg, ${accentColor}14, transparent 70%)` }}
              >
                <span
                  className="flex items-center justify-center rounded-xl shrink-0 text-white"
                  style={{ width: 44, height: 44, backgroundColor: accentColor, boxShadow: `0 6px 16px ${accentColor}44` }}
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
                <div className="border-t border-slate-100 px-2 py-2 flex flex-col gap-1">
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
                        className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-slate-600 bg-slate-50/70 hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 cursor-grab active:cursor-grabbing transition-all"
                      >
                        <CIcon size={15} style={{ color: accentColor }} className="shrink-0" />
                        <span className="capitalize truncate flex-1">{child.label}</span>
                        {usedIn > 0 && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5"
                            style={{ backgroundColor: `${accentColor}1f`, color: accentColor }}
                          >
                            <Check size={11} /> {usedIn}
                          </span>
                        )}
                        <GripVertical size={13} className="text-slate-300" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
