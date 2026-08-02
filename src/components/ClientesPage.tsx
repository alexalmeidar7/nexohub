import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { confirmDialog } from "@/lib/confirmDialog";
import { Loader2, Building2, Search, ShieldCheck, Users, Mail, Link2, UserCog, Trash2, ChevronDown, UserPlus, X, RotateCcw } from "lucide-react";


interface Cliente {
  user_id: string;
  nome: string | null;
  cnpj: string | null;
  telefone_comercial: string | null;
  endereco: string | null;
  cliente_desde: string | null;
  executiva_venda: string | null;
  plano: string | null;
  ativo: boolean | null;
  logo: string | null;
}

interface ModuleDef {
  key: string;
  name: string;
}

interface PlanoDef {
  id: string;
  name: string;
  price: number | null;
  enabled_modules: string[] | null;
}

interface SubUser {
  id: string;
  parent_user_id: string;
  email: string;
  nome: string | null;
  ativo: boolean;
  allowed_modules: string[] | null;
}

interface TrashItem {
  user_id: string;
  email: string | null;
  nome: string | null;
  cnpj: string | null;
  deleted_at: string;
  purge_at: string;
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
  const [novoOpen, setNovoOpen] = useState(false);
  const [criando, setCriando] = useState(false);
  const [novo, setNovo] = useState({ nome: "", email: "", password: "", plano: "", cnpj: "", telefone: "", endereco: "", cliente_desde: "", executiva_venda: "" });
  const [novoModules, setNovoModules] = useState<Set<string>>(new Set());
  const [trashOpen, setTrashOpen] = useState(false);
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashBusy, setTrashBusy] = useState<string | null>(null);
  const [planos, setPlanos] = useState<PlanoDef[]>([]);
  const [planoBusy, setPlanoBusy] = useState(false);




  useEffect(() => {
    if (role !== "admin") {
      setLoading(false);
      return;
    }
    (async () => {
      const [empresasRes, modsRes, cmRes, profRes, subRes, planosRes] = await Promise.all([
        supabase.from("empresa_config").select("user_id, nome, plano, ativo, logo, cnpj, telefone_comercial, endereco, cliente_desde, executiva_venda").order("nome"),
        supabase.from("available_modules").select("key, name").order("name"),
        supabase.from("client_modules").select("user_id, module_key, enabled"),
        supabase.from("profiles").select("user_id, email"),
        supabase.from("sub_users").select("id, parent_user_id, email, nome, ativo, allowed_modules"),
        supabase.from("planos").select("id, name, price, enabled_modules").order("price"),
      ]);

      if (empresasRes.error) toast.error("Não foi possível carregar os clientes.");
      setClientes((empresasRes.data as Cliente[]) || []);
      setModules((modsRes.data as ModuleDef[]) || []);
      setPlanos((planosRes.data as PlanoDef[]) || []);

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
    const naLixeira = new Set(trash.map(t => t.user_id));
    const base = clientes.filter(c => !naLixeira.has(c.user_id));
    const q = busca.trim().toLowerCase();
    if (!q) return base;
    return base.filter(c =>
      (c.nome || "").toLowerCase().includes(q) ||
      (emails[c.user_id] || "").toLowerCase().includes(q) ||
      slugFromEmail(emails[c.user_id], c.nome).includes(q)
    );
  }, [clientes, busca, emails, trash]);


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

  const moduleName = (key: string) =>
    modules.find(m => m.key === key)?.name || key;

  // Vincula um pacote ao usuário master e sincroniza os módulos do pacote
  const aplicarPacote = async (userId: string, planoNome: string) => {
    setPlanoBusy(true);
    const plano = planos.find(p => p.name === planoNome) || null;
    const planoModules = plano?.enabled_modules || [];

    const { error } = await supabase
      .from("empresa_config")
      .update({ plano: plano ? plano.name : null })
      .eq("user_id", userId);

    if (error) {
      setPlanoBusy(false);
      toast.error("Não foi possível vincular o pacote.");
      return;
    }

    if (plano) {
      const catalogo = new Set(modules.map(m => m.key));
      const allKeys = Array.from(new Set([...modules.map(m => m.key), ...planoModules]))
        .filter(k => catalogo.has(k));
      const rows = allKeys.map(key => ({
        user_id: userId,
        module_key: key,
        enabled: planoModules.includes(key),
      }));
      const { error: cmErr } = await supabase
        .from("client_modules")
        .upsert(rows, { onConflict: "user_id,module_key" });
      if (cmErr) {
        setPlanoBusy(false);
        toast.error(`Pacote vinculado, mas os módulos não puderam ser sincronizados: ${cmErr.message}`);
        return;
      }

      setClientModules(prev => ({ ...prev, [userId]: new Set(planoModules) }));
    }

    setClientes(prev => prev.map(c => c.user_id === userId ? { ...c, plano: plano ? plano.name : null } : c));
    setPlanoBusy(false);
    toast.success(plano ? `Pacote "${plano.name}" vinculado.` : "Pacote removido.");
  };



  const callAdmin = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("create-user", { body: payload });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(String(data.error));
    return data;
  };

  const criarCliente = async () => {
    const nome = novo.nome.trim();
    const email = novo.email.trim().toLowerCase();
    if (!nome || !email || !novo.password) {
      toast.error("Preencha nome, e-mail e senha.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    if (novo.password.length < 8) {
      toast.error("A senha deve ter ao menos 8 caracteres.");
      return;
    }
    setCriando(true);
    try {
      const data = await callAdmin({
        action: "create",
        nome,
        email,
        password: novo.password,
        plano: novo.plano.trim() || undefined,
        cnpj: novo.cnpj,
        telefone: novo.telefone,
        endereco: novo.endereco,
        cliente_desde: novo.cliente_desde,
        executiva_venda: novo.executiva_venda,
        modules: Array.from(novoModules),
      });
      const newId = String(data?.user_id || "");
      if (newId) {
        setClientes(prev => [...prev, { 
          user_id: newId, 
          nome, 
          plano: novo.plano.trim() || null, 
          ativo: true, 
          logo: null,
          cnpj: novo.cnpj,
          telefone_comercial: novo.telefone,
          endereco: novo.endereco,
          cliente_desde: novo.cliente_desde,
          executiva_venda: novo.executiva_venda
        }]);
        setEmails(prev => ({ ...prev, [newId]: email }));
        setClientModules(prev => ({ ...prev, [newId]: new Set(novoModules) }));
        setSelected(newId);
      }
      setNovo({ nome: "", email: "", password: "", plano: "", cnpj: "", telefone: "", endereco: "", cliente_desde: "", executiva_venda: "" });
      setNovoModules(new Set());
      setNovoOpen(false);
      toast.success("Cliente cadastrado.");
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível cadastrar o cliente.");
    } finally {
      setCriando(false);
    }
  };



  const carregarLixeira = async () => {
    setTrashLoading(true);
    try {
      const res = await callAdmin({ action: "list_trash" });
      setTrash(((res as any)?.items as TrashItem[]) || []);
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível carregar a lixeira.");
    } finally {
      setTrashLoading(false);
    }
  };

  useEffect(() => {
    if (role === "admin") carregarLixeira();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const excluirCliente = async (userId: string, nome?: string | null) => {
    const ok = await confirmDialog({
      title: "Mover para a lixeira",
      message: `Enviar "${nome || "este cliente"}" para a lixeira? O acesso do cliente e dos subusuários será bloqueado e os dados ficarão disponíveis para restauração por 60 dias.`,
      confirmLabel: "Mover para a lixeira",
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
      await carregarLixeira();
      toast.success("Cliente movido para a lixeira (60 dias para restaurar).");
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível excluir o cliente.");
    } finally {
      setDeleting(false);
    }
  };

  const restaurarCliente = async (item: TrashItem) => {
    setTrashBusy(`${item.user_id}:restore`);
    try {
      await callAdmin({ action: "restore_client", user_id: item.user_id });
      setTrash(prev => prev.filter(t => t.user_id !== item.user_id));
      const { data } = await supabase
        .from("empresa_config")
        .select("user_id, nome, plano, ativo, logo, cnpj, telefone_comercial, endereco, cliente_desde, executiva_venda")
        .eq("user_id", item.user_id)
        .maybeSingle();
      if (data) setClientes(prev => [...prev, data as Cliente].sort((a, b) => (a.nome || "").localeCompare(b.nome || "")));
      toast.success("Cliente restaurado.");
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível restaurar o cliente.");
    } finally {
      setTrashBusy(null);
    }
  };

  const excluirDefinitivo = async (item: TrashItem) => {
    const ok = await confirmDialog({
      title: "Excluir definitivamente",
      message: `Excluir permanentemente "${item.nome || item.email || "este cliente"}"? Todos os dados e subusuários serão apagados. Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir para sempre",
      destructive: true,
    });
    if (!ok) return;
    setTrashBusy(`${item.user_id}:purge`);
    try {
      await callAdmin({ action: "purge_client", user_id: item.user_id });
      setTrash(prev => prev.filter(t => t.user_id !== item.user_id));
      toast.success("Cliente excluído definitivamente.");
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível excluir o cliente.");
    } finally {
      setTrashBusy(null);
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

      <div className="flex justify-end gap-2">
        <button
          onClick={() => { setTrashOpen(v => !v); if (!trashOpen) carregarLixeira(); }}
          title="Lixeira de clientes"
          className="relative flex items-center gap-2 rounded-full px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide border border-black/10 text-[#002132]"
          style={{ backgroundColor: trashOpen ? "#D6F4FB" : "rgba(255,255,255,0.85)" }}
        >
          <Trash2 size={14} /> Lixeira
          {trash.length > 0 && (
            <span
              className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
              style={{ backgroundColor: CYAN }}
            >
              {trash.length}
            </span>
          )}
        </button>
        <button
          onClick={() => { setNovoOpen(true); setSelected(null); setTrashOpen(false); }}
          className="flex items-center gap-2 rounded-full px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[#002132]"
          style={{ backgroundColor: "#C6F03C" }}
        >
          <UserPlus size={14} /> Novo cliente
        </button>
      </div>

      {trashOpen && (
        <div className="rounded-2xl bg-white/85 border border-black/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-black/5 flex items-center gap-2">
            <Trash2 size={14} className="text-[#002132]/50" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#002132]/60">
              Clientes excluídos — restauráveis por 60 dias
            </p>
          </div>
          {trashLoading ? (
            <div className="p-6 flex items-center gap-2 text-sm text-[#002132]/60">
              <Loader2 className="animate-spin" size={16} /> Carregando lixeira...
            </div>
          ) : trash.length === 0 ? (
            <p className="p-6 text-sm text-[#002132]/50">A lixeira está vazia.</p>
          ) : (
            <div className="divide-y divide-black/5">
              {trash.map(item => {
                const dias = Math.max(
                  0,
                  Math.ceil((new Date(item.purge_at).getTime() - Date.now()) / 86400000),
                );
                return (
                  <div key={item.user_id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-sm font-semibold text-[#002132]">{item.nome || "Sem nome"}</p>
                      <p className="text-[11px] text-[#002132]/50">{item.email || "—"}</p>
                    </div>
                    <span className="text-[11px] text-[#002132]/60">
                      Excluído em {new Date(item.deleted_at).toLocaleDateString("pt-BR")}
                    </span>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: "#D6F4FB", color: "#002132" }}
                    >
                      {dias} dia{dias === 1 ? "" : "s"} restantes
                    </span>
                    <button
                      onClick={() => restaurarCliente(item)}
                      disabled={trashBusy === `${item.user_id}:restore`}
                      className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-[#002132] disabled:opacity-60"
                      style={{ backgroundColor: "#C6F03C" }}
                    >
                      {trashBusy === `${item.user_id}:restore` ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <RotateCcw size={13} />
                      )}
                      Restaurar
                    </button>
                    <button
                      onClick={() => excluirDefinitivo(item)}
                      disabled={trashBusy === `${item.user_id}:purge`}
                      className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-wide border border-red-200 text-red-600 disabled:opacity-60"
                    >
                      {trashBusy === `${item.user_id}:purge` ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                      Excluir
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}


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
                  onClick={() => { setSelected(c.user_id); setNovoOpen(false); }}
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
          {novoOpen ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <UserPlus size={16} style={{ color: CYAN }} />
                  <p className="text-lg font-semibold text-[#002132]">Novo cliente</p>
                </div>
                <button
                  onClick={() => setNovoOpen(false)}
                  className="p-1.5 rounded-lg text-[#002132]/50 hover:bg-black/5"
                  title="Fechar"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                {[
                  { k: "nome", label: "Nome da empresa", type: "text", ph: "Rádio Exemplo FM" },
                  { k: "cnpj", label: "CNPJ", type: "text", ph: "00.000.000/0000-00" },
                  { k: "telefone", label: "Telefone", type: "tel", ph: "(00) 00000-0000" },
                  { k: "endereco", label: "Endereço", type: "text", ph: "Rua Exemplo, 123" },
                  { k: "cliente_desde", label: "Cliente desde", type: "date", ph: "" },
                  { k: "executiva_venda", label: "Executiva de venda", type: "text", ph: "Nome da vendedora" },
                  { k: "email", label: "E-mail de acesso", type: "email", ph: "contato@radio.com" },
                  { k: "password", label: "Senha (mín. 8 caracteres)", type: "password", ph: "••••••••" },
                  { k: "plano", label: "Plano (opcional)", type: "text", ph: "básico / premium" },
                ].map(f => (
                  <div key={f.k} className="rounded-xl px-3 py-2 border border-black/5 bg-[#F6F8F9]">
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-[#002132]/45">
                      {f.label}
                    </label>
                    <input
                      type={f.type}
                      autoComplete="off"
                      value={(novo as Record<string, string>)[f.k]}
                      placeholder={f.ph}
                      onChange={e => setNovo(prev => ({ ...prev, [f.k]: e.target.value }))}
                      className="w-full bg-transparent text-sm outline-none text-[#002132] mt-0.5"
                    />
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: CYAN }}>
                  Módulos liberados
                </p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {modules.map(m => {
                    const on = novoModules.has(m.key);
                    return (
                      <div
                        key={m.key}
                        className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 border border-black/5"
                        style={{ backgroundColor: on ? "#D6F4FB" : "#F6F8F9" }}
                      >
                        <span className="text-sm text-[#002132]">{m.name}</span>
                        <Switch
                          checked={on}
                          onCheckedChange={v =>
                            setNovoModules(prev => {
                              const next = new Set(prev);
                              if (v) next.add(m.key);
                              else next.delete(m.key);
                              return next;
                            })
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={criarCliente}
                  disabled={criando}
                  className="flex items-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-white disabled:opacity-60"
                  style={{ backgroundColor: CYAN }}
                >
                  {criando ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                  Cadastrar cliente
                </button>
                <button
                  onClick={() => setNovoOpen(false)}
                  className="rounded-full px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[#002132]/60 border border-black/10"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : !selected ? (
            <p className="text-sm text-[#002132]/50">esse formulários vamos ter os seguintes campo - NOME - CNPJ - TELEFONE - ENDEREÇO - CLIENTE DESDE (CAMPO DATA) - EXECUTIVA DE VENDA - abaixo desse formulário o histórico de ações feitas por esse cliente, blitz, inserções FM, anuncios no site, player etc</p>
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
                        Mover para lixeira
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

                    <div className="grid sm:grid-cols-2 gap-2 mt-2">
                      <div className="rounded-xl px-3 py-2.5 border border-black/5 bg-[#F6F8F9]">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#002132]/45">
                          CNPJ
                        </div>
                        <p className="text-sm text-[#002132] truncate">{cli?.cnpj || "—"}</p>
                      </div>
                      <div className="rounded-xl px-3 py-2.5 border border-black/5 bg-[#F6F8F9]">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#002132]/45">
                          Telefone
                        </div>
                        <p className="text-sm text-[#002132] truncate">{cli?.telefone_comercial || "—"}</p>
                      </div>
                      <div className="rounded-xl px-3 py-2.5 border border-black/5 bg-[#F6F8F9]">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#002132]/45">
                          Endereço
                        </div>
                        <p className="text-sm text-[#002132] truncate">{cli?.endereco || "—"}</p>
                      </div>
                      <div className="rounded-xl px-3 py-2.5 border border-black/5 bg-[#F6F8F9]">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#002132]/45">
                          Cliente desde
                        </div>
                        <p className="text-sm text-[#002132] truncate">
                          {cli?.cliente_desde ? new Date(cli.cliente_desde).toLocaleDateString("pt-BR") : "—"}
                        </p>
                      </div>
                      <div className="col-span-full rounded-xl px-3 py-2.5 border border-black/5 bg-[#F6F8F9]">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#002132]/45">
                          Executiva de venda
                        </div>
                        <p className="text-sm text-[#002132] truncate">{cli?.executiva_venda || "—"}</p>
                      </div>
                    </div>

                    <div className="mt-6 border-t border-black/5 pt-4">
                      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: CYAN }}>
                        Histórico de Ações
                      </p>
                      <div className="bg-[#F6F8F9] rounded-xl p-4 min-h-[100px] flex flex-col items-center justify-center border border-black/5">
                        <Loader2 className="animate-spin text-[#002132]/20 mb-2" size={24} />
                        <p className="text-xs text-[#002132]/40">Carregando histórico (blitz, inserções, anúncios)...</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-black/5 bg-[#F6F8F9] overflow-hidden">
                      <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[#002132]/45 border-b border-black/5">
                        <UserCog size={12} /> Subusuários ({subs.length})
                      </div>
                      {subs.length === 0 ? (
                        <p className="px-3 py-2.5 text-xs text-[#002132]/50">Nenhum subusuário cadastrado.</p>
                      ) : (
                        <div className="divide-y divide-black/5 max-h-72 overflow-y-auto">
                          {subs.map(s => {
                            const open = expandedSub === s.id;
                            const allowed = new Set(s.allowed_modules || []);
                            return (
                              <div key={s.id}>
                                <div className="px-3 py-2 flex items-center justify-between gap-3">
                                  <button
                                    onClick={() => setExpandedSub(open ? null : s.id)}
                                    className="min-w-0 flex items-center gap-2 text-left flex-1"
                                  >
                                    <ChevronDown
                                      size={13}
                                      className="shrink-0 text-[#002132]/40 transition-transform"
                                      style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
                                    />
                                    <span className="min-w-0">
                                      <span className="block text-sm text-[#002132] truncate">{s.nome || "Sem nome"}</span>
                                      <span className="block text-[11px] text-[#002132]/50 truncate">
                                        {s.email} · {allowed.size} módulos
                                      </span>
                                    </span>
                                  </button>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {subBusy === `${s.id}:ativo` ? (
                                      <Loader2 size={14} className="animate-spin text-[#002132]/40" />
                                    ) : (
                                      <Switch
                                        checked={s.ativo}
                                        onCheckedChange={v => toggleSubAtivo(selected, s, v)}
                                      />
                                    )}
                                    <button
                                      onClick={() => excluirSub(selected, s)}
                                      disabled={subBusy === `${s.id}:del`}
                                      className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                                      title="Excluir subusuário"
                                    >
                                      {subBusy === `${s.id}:del` ? (
                                        <Loader2 size={13} className="animate-spin" />
                                      ) : (
                                        <Trash2 size={13} />
                                      )}
                                    </button>
                                  </div>
                                </div>

                                {open && (
                                  <div className="px-3 pb-3 pt-1 bg-white/60">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#002132]/45 mb-2">
                                      Permissões de módulos
                                    </p>
                                    <div className="grid sm:grid-cols-2 gap-1.5">
                                      {modules.map(m => {
                                        const on = allowed.has(m.key);
                                        const busy = subBusy === `${s.id}:${m.key}`;
                                        return (
                                          <button
                                            key={m.key}
                                            onClick={() => !busy && toggleSubModule(selected, s, m.key, !on)}
                                            className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 border border-black/5 text-left transition-colors"
                                            style={{ backgroundColor: on ? "#D6F4FB" : "#F6F8F9" }}
                                          >
                                            <span className="text-[12px] text-[#002132] truncate">{m.name}</span>
                                            {busy ? (
                                              <Loader2 size={12} className="animate-spin text-[#002132]/40 shrink-0" />
                                            ) : (
                                              <span
                                                className="w-3.5 h-3.5 rounded-full shrink-0 border"
                                                style={{
                                                  backgroundColor: on ? CYAN : "transparent",
                                                  borderColor: on ? CYAN : "#C9D2D6",
                                                }}
                                              />
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    {modules.length === 0 && (
                                      <p className="text-xs text-[#002132]/50">Nenhum módulo disponível.</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                      )}
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const cli = clientes.find(c => c.user_id === selected);
                const planoAtual = planos.find(p => p.name === cli?.plano) || null;
                const planoModules = planoAtual?.enabled_modules || [];
                return (
                  <>
                    <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: CYAN }}>
                      Pacote vinculado
                    </p>

                    <div className="rounded-xl border border-black/5 bg-[#F6F8F9] p-3 mb-5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={planoAtual?.name || ""}
                          disabled={planoBusy}
                          onChange={e => aplicarPacote(selected, e.target.value)}
                          className="flex-1 min-w-[180px] rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm text-[#002132] outline-none disabled:opacity-50"
                        >
                          <option value="">— sem pacote —</option>
                          {planos.map(p => (
                            <option key={p.id} value={p.name}>
                              {p.name} · R$ {Number(p.price || 0).toFixed(2)} · {(p.enabled_modules || []).length} módulos
                            </option>
                          ))}
                        </select>
                        {planoBusy && <Loader2 size={16} className="animate-spin text-[#002132]/40" />}
                      </div>
                      <p className="text-[11px] text-[#002132]/45 mt-2">
                        Os módulos liberados para este cliente são definidos pelo pacote escolhido.
                      </p>
                    </div>

                    {planoAtual && (
                      <>
                        <p className="text-xs font-bold uppercase tracking-widest mb-3 text-[#002132]/45">
                          Módulos do pacote {planoAtual.name}
                        </p>
                        {planoModules.length === 0 ? (
                          <p className="text-sm text-[#002132]/50">Este pacote ainda não possui módulos configurados.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {planoModules.map(k => (
                              <span
                                key={k}
                                className="rounded-full px-3 py-1.5 text-xs text-[#002132] border border-black/5"
                                style={{ backgroundColor: "#D6F4FB" }}
                              >
                                {moduleName(k)}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </>
                );
              })()}

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
