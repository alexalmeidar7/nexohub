import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirmDialog";
import { Loader2, Package, Pencil, Plus, Save, Trash2, Users, X } from "lucide-react";

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

const EXTRA_MODULES: ModuleDef[] = [
  { key: "vmix", name: "Módulo vMix" },
  { key: "sorteios", name: "Módulo Sorteios" },
  { key: "blitz", name: "Módulo Blitz" },
  { key: "site", name: "Módulo Site" },
  { key: "cortevideo", name: "Módulo Ferramentas — Corte de Vídeo" },
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

  const toggleModule = (planoId: string, key: string) => {
    setPlanos((prev) => prev.map((p) => {
      if (p.id !== planoId) return p;
      const list = new Set(p.enabled_modules || []);
      if (list.has(key)) list.delete(key); else list.add(key);
      return { ...p, enabled_modules: Array.from(list) };
    }));
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
    <div className="animate-fade-in pb-12">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Pacotes</h2>
          <p className="text-sm text-slate-500">
            Crie planos e defina quais módulos ficam liberados. O pacote é vinculado ao usuário master de cada cliente.
          </p>
        </div>
      </div>

      {/* Criar novo pacote */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 mb-6 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Nome do pacote</label>
          <input
            value={novo.name}
            onChange={(e) => setNovo((n) => ({ ...n, name: e.target.value }))}
            placeholder="Ex.: Nexo Start"
            className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:bg-white focus:border-slate-300"
          />
        </div>
        <div className="w-[160px]">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Valor (R$)</label>
          <input
            value={novo.price}
            onChange={(e) => setNovo((n) => ({ ...n, price: e.target.value.replace(/[^\d.,]/g, "") }))}
            placeholder="0,00"
            className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:bg-white focus:border-slate-300"
          />
        </div>
        <button
          type="button"
          onClick={criar}
          disabled={criando}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: accentColor }}
        >
          {criando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={16} />} Criar pacote
        </button>
      </div>

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
                    <div className="flex flex-wrap gap-2">
                      {modules.map((m) => {
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
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => excluir(p)}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={13} /> Excluir pacote
                    </button>
                    <button
                      type="button"
                      onClick={() => salvar(p)}
                      disabled={saving === p.id}
                      className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: accentColor }}
                    >
                      {saving === p.id ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {planos.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">
          Nenhum pacote criado ainda.
        </div>
      )}
    </div>
  );
}
