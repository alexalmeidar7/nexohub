import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Loader2, Building2, Search, ShieldCheck, Users } from "lucide-react";

interface Cliente {
  user_id: string;
  nome: string | null;
  plano: string | null;
  ativo: boolean | null;
  logo: string | null;
}

interface ModuleDef {
  key: string;
  name: string;
}

const CYAN = "#00BFF0";

export default function ClientesPage() {
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [clientModules, setClientModules] = useState<Record<string, Set<string>>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (role !== "admin") {
      setLoading(false);
      return;
    }
    (async () => {
      const [empresasRes, modsRes, cmRes] = await Promise.all([
        supabase.from("empresa_config").select("user_id, nome, plano, ativo, logo").order("nome"),
        supabase.from("available_modules").select("key, name").order("name"),
        supabase.from("client_modules").select("user_id, module_key, enabled"),
      ]);

      if (empresasRes.error) toast.error("Não foi possível carregar os clientes.");
      setClientes((empresasRes.data as Cliente[]) || []);
      setModules((modsRes.data as ModuleDef[]) || []);

      const map: Record<string, Set<string>> = {};
      for (const row of (cmRes.data as any[]) || []) {
        if (!row.enabled) continue;
        (map[row.user_id] ||= new Set()).add(row.module_key);
      }
      setClientModules(map);
      setLoading(false);
    })();
  }, [role]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(c => (c.nome || "").toLowerCase().includes(q));
  }, [clientes, busca]);

  const toggleModule = async (userId: string, key: string, enabled: boolean) => {
    setSaving(`${userId}:${key}`);
    const { error } = await supabase
      .from("client_modules")
      .upsert({ user_id: userId, module_key: key, enabled }, { onConflict: "user_id,module_key" });
    setSaving(null);
    if (error) {
      toast.error("Não foi possível salvar. Verifique se você tem permissão de administrador.");
      return;
    }
    setClientModules(prev => {
      const next = { ...prev };
      const set = new Set(next[userId] || []);
      if (enabled) set.add(key);
      else set.delete(key);
      next[userId] = set;
      return next;
    });
    toast.success(enabled ? "Módulo liberado." : "Módulo bloqueado.");
  };

  if (role !== "admin") {
    return (
      <div className="p-8">
        <div className="rounded-2xl p-6 bg-white/80 border border-black/5 flex items-center gap-3">
          <ShieldCheck size={18} style={{ color: CYAN }} />
          <p className="text-sm text-[#002132]">Esta área é exclusiva do administrador.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-[#002132]">
        <Loader2 className="animate-spin" size={16} /> Carregando clientes...
      </div>
    );
  }

  const ativos = clientes.filter(c => c.ativo !== false).length;

  return (
    <div className="p-6 lg:p-8 space-y-5">
      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Clientes", value: clientes.length, icon: Building2 },
          { label: "Ativos", value: ativos, icon: Users },
          { label: "Inativos", value: clientes.length - ativos, icon: Users },
          { label: "Módulos", value: modules.length, icon: ShieldCheck },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl px-4 py-3 bg-white/85 border border-black/5">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[#002132]/50">
              <Icon size={13} /> {label}
            </div>
            <p className="text-2xl font-light text-[#002132] mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        {/* Lista */}
        <div className="rounded-2xl bg-white/85 border border-black/5 overflow-hidden">
          <div className="p-3 border-b border-black/5 flex items-center gap-2">
            <Search size={14} className="text-[#002132]/40" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar cliente"
              className="w-full bg-transparent text-sm outline-none text-[#002132]"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {filtrados.map(c => {
              const isSel = selected === c.user_id;
              return (
                <button
                  key={c.user_id}
                  onClick={() => setSelected(c.user_id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-b border-black/5"
                  style={{ backgroundColor: isSel ? "#D6F4FB" : "transparent" }}
                >
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#D6F4FB] flex items-center justify-center shrink-0">
                    {c.logo ? (
                      <img src={c.logo} alt={c.nome || ""} className="w-full h-full object-contain" />
                    ) : (
                      <Building2 size={14} style={{ color: CYAN }} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate text-[#002132]">{c.nome || "Sem nome"}</p>
                    <p className="text-[11px] text-[#002132]/50 truncate">
                      {c.plano || "sem plano"} · {(clientModules[c.user_id]?.size || 0)} módulos
                    </p>
                  </div>
                </button>
              );
            })}
            {filtrados.length === 0 && (
              <p className="p-4 text-xs text-[#002132]/50">Nenhum cliente encontrado.</p>
            )}
          </div>
        </div>

        {/* Módulos do cliente */}
        <div className="rounded-2xl bg-white/85 border border-black/5 p-4">
          {!selected ? (
            <p className="text-sm text-[#002132]/50">Selecione um cliente para liberar ou bloquear módulos.</p>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: CYAN }}>
                Módulos liberados
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {modules.map(m => {
                  const enabled = clientModules[selected]?.has(m.key) || false;
                  const key = `${selected}:${m.key}`;
                  return (
                    <div
                      key={m.key}
                      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 border border-black/5"
                      style={{ backgroundColor: enabled ? "#D6F4FB" : "#F6F8F9" }}
                    >
                      <span className="text-sm text-[#002132]">{m.name}</span>
                      {saving === key ? (
                        <Loader2 size={14} className="animate-spin text-[#002132]/40" />
                      ) : (
                        <Switch
                          checked={enabled}
                          onCheckedChange={v => toggleModule(selected, m.key, v)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-[#002132]/45 mt-4">
                A liberação é validada no servidor pelas políticas de acesso — esconder itens no menu não substitui essa checagem.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
