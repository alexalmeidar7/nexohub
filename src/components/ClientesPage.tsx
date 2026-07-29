import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { confirmDialog } from "@/lib/confirmDialog";
import { Loader2, Building2, Search, ShieldCheck, Users, Mail, Link2, UserCog, Trash2, ChevronDown } from "lucide-react";


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

interface SubUser {
  id: string;
  parent_user_id: string;
  email: string;
  nome: string | null;
  ativo: boolean;
  allowed_modules: string[] | null;
}

const CYAN = "#00BFF0";

// Mesma regra usada pelo player para resolver o cliente pela URL:
// o slug é o "local-part" do e-mail de acesso (antes do @).
function slugFromEmail(email?: string | null, nome?: string | null) {
  const local = (email || "").split("@")[0]?.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (local) return local;
  const fromName = (nome || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 32);
  return fromName || "—";
}

export default function ClientesPage() {
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [clientModules, setClientModules] = useState<Record<string, Set<string>>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [subUsers, setSubUsers] = useState<Record<string, SubUser[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedSub, setExpandedSub] = useState<string | null>(null);
  const [subBusy, setSubBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);



  useEffect(() => {
    if (role !== "admin") {
      setLoading(false);
      return;
    }
    (async () => {
      const [empresasRes, modsRes, cmRes, profRes, subRes] = await Promise.all([
        supabase.from("empresa_config").select("user_id, nome, plano, ativo, logo").order("nome"),
        supabase.from("available_modules").select("key, name").order("name"),
        supabase.from("client_modules").select("user_id, module_key, enabled"),
        supabase.from("profiles").select("user_id, email"),
        supabase.from("sub_users").select("id, parent_user_id, email, nome, ativo, allowed_modules"),
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

      const em: Record<string, string> = {};
      for (const p of (profRes.data as any[]) || []) {
        if (p.email) em[p.user_id] = p.email;
      }
      setEmails(em);

      const su: Record<string, SubUser[]> = {};
      for (const s of (subRes.data as any[]) || []) {
        (su[s.parent_user_id] ||= []).push(s as SubUser);
      }
      setSubUsers(su);

      setLoading(false);
    })();
  }, [role]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(c =>
      (c.nome || "").toLowerCase().includes(q) ||
      (emails[c.user_id] || "").toLowerCase().includes(q) ||
      slugFromEmail(emails[c.user_id], c.nome).includes(q)
    );
  }, [clientes, busca, emails]);


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

  const callAdmin = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("create-user", { body: payload });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(String(data.error));
    return data;
  };

  const excluirCliente = async (userId: string, nome?: string | null) => {
    const ok = await confirmDialog({
      title: "Excluir cliente",
      message: `Excluir definitivamente "${nome || "este cliente"}"? Todos os subusuários e acessos serão removidos. Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await callAdmin({ action: "delete_client", user_id: userId });
      setClientes(prev => prev.filter(c => c.user_id !== userId));
      setSubUsers(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      setSelected(null);
      toast.success("Cliente excluído.");
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível excluir o cliente.");
    } finally {
      setDeleting(false);
    }
  };

  const patchSub = (parentId: string, subId: string, patch: Partial<SubUser>) => {
    setSubUsers(prev => ({
      ...prev,
      [parentId]: (prev[parentId] || []).map(s => (s.id === subId ? { ...s, ...patch } : s)),
    }));
  };

  const toggleSubAtivo = async (parentId: string, sub: SubUser, ativo: boolean) => {
    setSubBusy(`${sub.id}:ativo`);
    try {
      await callAdmin({ action: "admin_sub_update", sub_user_id: sub.id, ativo });
      patchSub(parentId, sub.id, { ativo });
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível atualizar o subusuário.");
    } finally {
      setSubBusy(null);
    }
  };

  const toggleSubModule = async (parentId: string, sub: SubUser, key: string, enabled: boolean) => {
    const current = new Set(sub.allowed_modules || []);
    if (enabled) current.add(key);
    else current.delete(key);
    const next = Array.from(current);
    setSubBusy(`${sub.id}:${key}`);
    try {
      await callAdmin({ action: "admin_sub_update", sub_user_id: sub.id, allowed_modules: next });
      patchSub(parentId, sub.id, { allowed_modules: next });
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível salvar a permissão.");
    } finally {
      setSubBusy(null);
    }
  };

  const excluirSub = async (parentId: string, sub: SubUser) => {
    const ok = await confirmDialog({
      title: "Excluir subusuário",
      message: `Excluir o acesso de "${sub.nome || sub.email}"? Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    setSubBusy(`${sub.id}:del`);
    try {
      await callAdmin({ action: "admin_sub_delete", sub_user_id: sub.id });
      setSubUsers(prev => ({
        ...prev,
        [parentId]: (prev[parentId] || []).filter(s => s.id !== sub.id),
      }));
      toast.success("Subusuário excluído.");
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível excluir o subusuário.");
    } finally {
      setSubBusy(null);
    }
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

        {/* Detalhe do cliente */}
        <div className="rounded-2xl bg-white/85 border border-black/5 p-4">
          {!selected ? (
            <p className="text-sm text-[#002132]/50">Selecione um cliente para ver os dados de acesso e liberar módulos.</p>
          ) : (
            <>
              {(() => {
                const cli = clientes.find(c => c.user_id === selected);
                const email = emails[selected] || null;
                const slug = slugFromEmail(email, cli?.nome);
                const subs = subUsers[selected] || [];
                return (
                  <div className="mb-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl overflow-hidden bg-[#D6F4FB] flex items-center justify-center shrink-0">
                        {cli?.logo ? (
                          <img src={cli.logo} alt={cli?.nome || ""} className="w-full h-full object-contain" />
                        ) : (
                          <Building2 size={18} style={{ color: CYAN }} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-semibold text-[#002132] truncate">{cli?.nome || "Sem nome"}</p>
                        <p className="text-[11px] text-[#002132]/50">
                          {cli?.plano || "sem plano"} · {cli?.ativo === false ? "inativo" : "ativo"}
                        </p>
                      </div>
                      <button
                        onClick={() => excluirCliente(selected, cli?.nome)}
                        disabled={deleting}
                        className="shrink-0 flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-wide border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        Excluir cliente
                      </button>
                    </div>


                    <div className="grid sm:grid-cols-2 gap-2">
                      <div className="rounded-xl px-3 py-2.5 border border-black/5 bg-[#F6F8F9]">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#002132]/45">
                          <Link2 size={12} /> Slug
                        </div>
                        <p className="text-sm text-[#002132] font-mono truncate">/{slug}</p>
                      </div>
                      <div className="rounded-xl px-3 py-2.5 border border-black/5 bg-[#F6F8F9]">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#002132]/45">
                          <Mail size={12} /> E-mail de acesso
                        </div>
                        <p className="text-sm text-[#002132] truncate">{email || "—"}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-black/5 bg-[#F6F8F9] overflow-hidden">
                      <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[#002132]/45 border-b border-black/5">
                        <UserCog size={12} /> Subusuários ({subs.length})
                      </div>
                      {subs.length === 0 ? (
                        <p className="px-3 py-2.5 text-xs text-[#002132]/50">Nenhum subusuário cadastrado.</p>
                      ) : (
                        <div className="divide-y divide-black/5 max-h-52 overflow-y-auto">
                          {subs.map(s => (
                            <div key={s.id} className="px-3 py-2 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm text-[#002132] truncate">{s.nome || "Sem nome"}</p>
                                <p className="text-[11px] text-[#002132]/50 truncate">{s.email}</p>
                              </div>
                              <span
                                className="text-[10px] font-bold uppercase px-2 py-1 rounded-full shrink-0"
                                style={{
                                  backgroundColor: s.ativo ? "#D6F4FB" : "#EFEFEF",
                                  color: s.ativo ? "#00789A" : "#8A9298",
                                }}
                              >
                                {s.ativo ? "ativo" : "inativo"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

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
