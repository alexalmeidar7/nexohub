import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirmDialog";
import { adminModulosGroups } from "@/components/Dashboard";
import { Check, ChevronDown, ChevronRight, Loader2, Package, Pencil, Plus, Save, Trash2, Users, X } from "lucide-react";

const CYAN = "#00BFF0";

interface Plano {
  id: string;
  name: string;
  price: number | null;
  image_url: string | null;
  enabled_modules: string[] | null;
}

interface ModuleDef {
  key: string;
  name: string;
}

interface TreeNode {
  key: string;
  label: string;
  children: TreeNode[];
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

type RawItem = { label: string; page?: unknown; children?: RawItem[] };

const buildTree = (items: RawItem[]): TreeNode[] =>
  items.map((i) => ({
    key: (typeof i.page === "string" && i.page) ? i.page : slug(i.label),
    label: i.label,
    children: buildTree(i.children ?? []),
  }));

const MODULE_TREE: TreeNode[] = buildTree(adminModulosGroups as unknown as RawItem[]);

const collectKeys = (node: TreeNode): string[] =>
  [node.key, ...node.children.flatMap(collectKeys)];

const TREE_KEYS = new Set(MODULE_TREE.flatMap(collectKeys));

const EXTRA_MODULES: ModuleDef[] = [
  { key: "vmix", name: "Módulo vMix" },
  { key: "sorteios", name: "Módulo Sorteios" },
  { key: "blitz", name: "Módulo Blitz" },
  { key: "site", name: "Módulo Site" },
  { key: "cortevideo", name: "Módulo Ferramentas — Editor de Vídeo" },
  { key: "ouvintes", name: "Módulo Cadastro de Ouvintes" },
];

interface Props {
  accentColor?: string;
}


export default function PacotesPage({ accentColor = CYAN }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [clientesPorPlano, setClientesPorPlano] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [nomesOriginais, setNomesOriginais] = useState<Record<string, string>>({});
  const [novo, setNovo] = useState({ name: "", price: "" });
  const [criando, setCriando] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: pl }, { data: mods }, { data: emp }] = await Promise.all([
      supabase.from("planos").select("id, name, price, image_url, enabled_modules").order("price"),
      supabase.from("available_modules").select("key, name").order("name"),
      supabase.from("empresa_config").select("plano"),
    ]);

    const planosData = (pl || []) as Plano[];
    setPlanos(planosData);
    setNomesOriginais(Object.fromEntries(planosData.map((p) => [p.id, p.name])));

    const base = (mods || []) as ModuleDef[];
    const known = new Set(base.map((m) => m.key));
    const extras = EXTRA_MODULES.filter((m) => !known.has(m.key));
    extras.forEach((m) => known.add(m.key));
    // Qualquer módulo já usado num plano mas ainda não catalogado
    const orphans: ModuleDef[] = [];
    planosData.forEach((p) => (p.enabled_modules || []).forEach((k) => {
      if (!known.has(k)) { known.add(k); orphans.push({ key: k, name: k }); }
    }));
    setModules([...base, ...extras, ...orphans].sort((a, b) => a.name.localeCompare(b.name)));

    const counts: Record<string, number> = {};
    (emp || []).forEach((e: { plano: string | null }) => {
      if (!e.plano) return;
      counts[e.plano] = (counts[e.plano] || 0) + 1;
    });
    setClientesPorPlano(counts);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const planoSel = useMemo(() => planos.find((p) => p.id === selected) || null, [planos, selected]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const setKeys = (planoId: string, keys: string[], on: boolean) => {
    setPlanos((prev) => prev.map((p) => {
      if (p.id !== planoId) return p;
      const list = new Set(p.enabled_modules || []);
      keys.forEach((k) => (on ? list.add(k) : list.delete(k)));
      return { ...p, enabled_modules: Array.from(list) };
    }));
  };

  const toggleModule = (planoId: string, key: string) => {
    const p = planos.find((x) => x.id === planoId);
    const on = (p?.enabled_modules || []).includes(key);
    setKeys(planoId, [key], !on);
  };

  const toggleNode = (planoId: string, node: TreeNode) => {
    const p = planos.find((x) => x.id === planoId);
    const list = new Set(p?.enabled_modules || []);
    const on = list.has(node.key);
    setKeys(planoId, collectKeys(node), !on);
  };


  const salvar = async (plano: Plano) => {
    const nome = (plano.name || "").trim();
    if (!nome) { toast.error("Informe o nome do pacote"); return; }
    setSaving(plano.id);

    const nomeAnterior = nomesOriginais[plano.id];

    const { error } = await supabase
      .from("planos")
      .update({
        name: nome,
        price: Number(plano.price) || 0,
        enabled_modules: plano.enabled_modules || [],
      })
      .eq("id", plano.id);

    if (error) { setSaving(null); toast.error("Não foi possível salvar o pacote"); return; }

    // Se o nome mudou, mantém os clientes vinculados ao pacote renomeado
    if (nomeAnterior && nomeAnterior !== nome) {
      await supabase.from("empresa_config").update({ plano: nome }).eq("plano", nomeAnterior);
      setClientesPorPlano((prev) => {
        const next = { ...prev };
        next[nome] = next[nomeAnterior] || 0;
        delete next[nomeAnterior];
        return next;
      });
    }

    setNomesOriginais((prev) => ({ ...prev, [plano.id]: nome }));
    setPlanos((prev) => prev.map((x) => x.id === plano.id ? { ...x, name: nome } : x));
    setSaving(null);
    toast.success("Pacote salvo");
  };


  const criar = async () => {
    const name = novo.name.trim();
    if (!name) { toast.error("Informe o nome do pacote"); return; }
    setCriando(true);
    const { data, error } = await supabase
      .from("planos")
      .insert({ name, price: Number(novo.price) || 0, enabled_modules: [] })
      .select("id, name, price, image_url, enabled_modules")
      .single();
    setCriando(false);
    if (error || !data) { toast.error("Não foi possível criar o pacote"); return; }
    setPlanos((prev) => [...prev, data as Plano]);
    setNomesOriginais((prev) => ({ ...prev, [(data as Plano).id]: (data as Plano).name }));
    setSelected((data as Plano).id);
    setNovo({ name: "", price: "" });
    toast.success("Pacote criado");
  };

  const excluir = async (plano: Plano) => {
    const emUso = clientesPorPlano[plano.name] || 0;
    const ok = await confirmDialog({
      title: `Excluir "${plano.name}"?`,
      message: emUso > 0
        ? `${emUso} cliente(s) estão vinculados a este pacote e ficarão sem plano.`
        : "Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("planos").delete().eq("id", plano.id);
    if (error) { toast.error("Não foi possível excluir"); return; }
    setPlanos((prev) => prev.filter((p) => p.id !== plano.id));
    if (selected === plano.id) setSelected(null);
    toast.success("Pacote excluído");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  return (
    <div className="max-w-none mx-0 w-full space-y-6 pt-2 pb-12 font-sans animate-fade-in">
      {/* 1. Criar novo pacote (Card Branco Moderno) */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-base md:text-lg font-black tracking-wider text-[#002132] uppercase leading-tight">
              Gestão de Pacotes
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Crie planos e defina quais módulos ficam liberados para os usuários
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Nome do pacote
            </label>
            <input
              value={novo.name}
              onChange={(e) => setNovo((n) => ({ ...n, name: e.target.value }))}
              placeholder="Ex.: Nexo Start, Nexo Max..."
              className="w-full h-11 rounded-full border border-slate-200/80 bg-[#f8fafc] px-4 text-xs font-semibold outline-none focus:bg-white focus:border-[#0055ff] transition-all"
            />
          </div>
          <div className="w-[180px]">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Valor Mensal (R$)
            </label>
            <input
              value={novo.price}
              onChange={(e) => setNovo((n) => ({ ...n, price: e.target.value.replace(/[^\d.,]/g, "") }))}
              placeholder="0,00"
              className="w-full h-11 rounded-full border border-slate-200/80 bg-[#f8fafc] px-4 text-xs font-semibold outline-none focus:bg-white focus:border-[#0055ff] transition-all"
            />
          </div>
          <button
            type="button"
            onClick={criar}
            disabled={criando}
            className="h-11 px-8 rounded-full bg-[#0055ff] hover:bg-[#0047d4] active:scale-95 text-white font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all cursor-pointer shadow-md hover:shadow-lg hover:shadow-blue-500/20 disabled:opacity-50"
          >
            {criando ? (
              <Loader2 size={16} className="animate-spin text-black" />
            ) : (
              <Plus size={16} className="text-black" />
            )}
            Criar Pacote
          </button>
        </div>
      </section>

      {/* Lista de pacotes */}
      <div className="grid gap-5 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
        {planos.map((p) => {
          const isOpen = selected === p.id;
          const ativos = p.enabled_modules?.length || 0;
          const clientes = clientesPorPlano[p.name] || 0;
          return (
            <div key={p.id} className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <button
                type="button"
                onClick={() => setSelected(isOpen ? null : p.id)}
                className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-slate-50 transition-colors"
              >
                <span
                  className="flex items-center justify-center rounded-xl shrink-0"
                  style={{ width: 42, height: 42, backgroundColor: `${accentColor}1f`, color: accentColor }}
                >
                  <Package size={20} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-slate-800 truncate">{p.name}</span>
                  <span className="block text-[11px] text-slate-400">
                    {ativos} módulos · R$ {Number(p.price || 0).toFixed(2)}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-1"
                  style={{ backgroundColor: `${accentColor}14`, color: accentColor }}>
                  <Users size={12} /> {clientes}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold border transition-colors"
                  style={{
                    backgroundColor: isOpen ? accentColor : "#ffffff",
                    borderColor: isOpen ? accentColor : "#e2e8f0",
                    color: isOpen ? "#ffffff" : "#475569",
                  }}
                >
                  {isOpen ? <X size={12} /> : <Pencil size={12} />} {isOpen ? "Fechar" : "Editar"}
                </span>
              </button>


              {isOpen && (
                <div className="border-t border-slate-100 p-4 space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <div className="flex-1 min-w-[160px]">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Nome</label>
                      <input
                        value={p.name}
                        onChange={(e) => setPlanos((prev) => prev.map((x) => x.id === p.id ? { ...x, name: e.target.value } : x))}
                        className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:bg-white"
                      />
                    </div>
                    <div className="w-[130px]">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Valor (R$)</label>
                      <input
                        value={String(p.price ?? "")}
                        onChange={(e) => setPlanos((prev) => prev.map((x) => x.id === p.id ? { ...x, price: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 } : x))}
                        className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Módulos do pacote</div>
                    <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                      {MODULE_TREE.map((node) => {
                        const enabled = new Set(p.enabled_modules || []);
                        const childKeys = node.children.flatMap(collectKeys);
                        const on = enabled.has(node.key);
                        const someChild = childKeys.some((k) => enabled.has(k));
                        const open = expanded[`${p.id}:${node.key}`] ?? false;
                        return (
                          <div key={node.key} className="bg-white">
                            <div className="flex items-center gap-2 px-3 py-2">
                              {node.children.length > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setExpanded((e) => ({ ...e, [`${p.id}:${node.key}`]: !open }))}
                                  className="text-slate-400 hover:text-slate-600"
                                >
                                  {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                </button>
                              ) : <span className="w-[15px]" />}
                              <button
                                type="button"
                                onClick={() => toggleNode(p.id, node)}
                                className="flex items-center gap-2 flex-1 text-left"
                              >
                                <span
                                  className="inline-flex items-center justify-center rounded-md border shrink-0"
                                  style={{
                                    width: 18, height: 18,
                                    backgroundColor: on ? accentColor : (someChild ? `${accentColor}26` : "#ffffff"),
                                    borderColor: on || someChild ? accentColor : "#cbd5e1",
                                    color: "#ffffff",
                                  }}
                                >
                                  {on && <Check size={12} />}
                                </span>
                                <span className="text-[13px] font-semibold text-slate-700 capitalize">{node.label}</span>
                                {node.children.length > 0 && (
                                  <span className="text-[11px] text-slate-400">
                                    {childKeys.filter((k) => enabled.has(k)).length}/{childKeys.length}
                                  </span>
                                )}
                              </button>
                            </div>

                            {open && node.children.length > 0 && (
                              <div className="pl-9 pr-3 pb-2 space-y-1">
                                {node.children.map((c) => {
                                  const cKeys = collectKeys(c);
                                  const cOn = enabled.has(c.key);
                                  return (
                                    <div key={c.key}>
                                      <button
                                        type="button"
                                        onClick={() => toggleNode(p.id, c)}
                                        className="flex items-center gap-2 text-left w-full py-0.5"
                                      >
                                        <span
                                          className="inline-flex items-center justify-center rounded-md border shrink-0"
                                          style={{
                                            width: 16, height: 16,
                                            backgroundColor: cOn ? accentColor : "#ffffff",
                                            borderColor: cOn ? accentColor : "#cbd5e1",
                                            color: "#ffffff",
                                          }}
                                        >
                                          {cOn && <Check size={11} />}
                                        </span>
                                        <span className="text-[12px] text-slate-600 capitalize">{c.label}</span>
                                      </button>
                                      {c.children.length > 0 && (
                                        <div className="pl-6 space-y-1">
                                          {c.children.map((g) => {
                                            const gOn = enabled.has(g.key);
                                            return (
                                              <button
                                                key={g.key}
                                                type="button"
                                                onClick={() => toggleModule(p.id, g.key)}
                                                className="flex items-center gap-2 text-left w-full py-0.5"
                                              >
                                                <span
                                                  className="inline-flex items-center justify-center rounded-md border shrink-0"
                                                  style={{
                                                    width: 14, height: 14,
                                                    backgroundColor: gOn ? accentColor : "#ffffff",
                                                    borderColor: gOn ? accentColor : "#cbd5e1",
                                                    color: "#ffffff",
                                                  }}
                                                >
                                                  {gOn && <Check size={10} />}
                                                </span>
                                                <span className="text-[11px] text-slate-500 capitalize">{g.label}</span>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                      {cKeys.length === 0 && null}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {modules.filter((m) => !TREE_KEYS.has(m.key)).length > 0 && (
                      <>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mt-4 mb-2">Outros módulos</div>
                        <div className="flex flex-wrap gap-2">
                          {modules.filter((m) => !TREE_KEYS.has(m.key)).map((m) => {
                            const on = (p.enabled_modules || []).includes(m.key);
                            return (
                              <button
                                key={m.key}
                                type="button"
                                onClick={() => toggleModule(p.id, m.key)}
                                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors"
                                style={{
                                  backgroundColor: on ? accentColor : "#f8fafc",
                                  borderColor: on ? accentColor : "#e2e8f0",
                                  color: on ? "#ffffff" : "#475569",
                                }}
                              >
                                {on ? <X size={11} /> : <Plus size={11} />}
                                <span className="capitalize">{m.name.replace(/^Módulo\s+/i, "")}</span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>


                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => excluir(p)}
                      className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} /> Excluir pacote
                    </button>
                    <button
                      type="button"
                      onClick={() => salvar(p)}
                      disabled={saving === p.id}
                      className="h-10 px-6 rounded-full bg-[#0055ff] hover:bg-[#0047d4] active:scale-95 text-white font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all cursor-pointer shadow-sm hover:shadow-md disabled:opacity-50"
                    >
                      {saving === p.id ? (
                        <Loader2 size={15} className="animate-spin text-black" />
                      ) : (
                        <Save size={15} className="text-black" />
                      )}
                      Salvar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {planos.length === 0 && (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
          Nenhum pacote criado ainda.
        </div>
      )}
    </div>
  );
}
