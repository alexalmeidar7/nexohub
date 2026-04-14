import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Plus, Trash2, Loader2, Users, Eye, EyeOff, Save, ChevronDown, ChevronUp,
  GripVertical, ShieldCheck, Key
} from "lucide-react";

// Available modules that can be assigned to sub-users
const AVAILABLE_MODULES = [
  { key: "cadastros", label: "Cadastros" },
  { key: "noticias", label: "Roteiro de Programa" },
  { key: "musica", label: "Música no Ar" },
  { key: "agenda", label: "Agenda" },
  { key: "player", label: "Player" },
  { key: "comercial", label: "Comercial" },
  { key: "vmix", label: "vMix" },
  { key: "ferramentas", label: "Ferramentas" },
];

interface SubUser {
  id: string;
  auth_user_id: string;
  email: string;
  nome: string;
  allowed_modules: string[];
  ativo: boolean;
}

export default function PermissoesSection() {
  const { user } = useAuth();
  const [subUsers, setSubUsers] = useState<SubUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newNome, setNewNome] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPassFor, setShowPassFor] = useState<string | null>(null);
  const [newPassMap, setNewPassMap] = useState<Record<string, string>>({});
  const [changingPassId, setChangingPassId] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--layout-widget-bg, #1a1a1a)",
    color: "var(--layout-widget-text, #ffffff)",
    border: "1px solid var(--layout-border-color, #333)",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    width: "100%",
  };

  const fetchSubUsers = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("sub_users")
      .select("*")
      .eq("parent_user_id", user.id)
      .order("created_at", { ascending: true });
    if (!error && data) {
      setSubUsers(data.map((d: any) => ({
        id: d.id,
        auth_user_id: d.auth_user_id,
        email: d.email,
        nome: d.nome || "",
        allowed_modules: d.allowed_modules || [],
        ativo: d.ativo,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchSubUsers(); }, [fetchSubUsers]);

  const handleCreate = async () => {
    if (!newEmail || !newPassword) {
      toast.error("Email e senha são obrigatórios");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-sub-users", {
        body: { action: "create", email: newEmail, password: newPassword, nome: newNome },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Erro ao criar sub-usuário");
      } else {
        toast.success("Sub-usuário criado com sucesso");
        setNewEmail("");
        setNewPassword("");
        setNewNome("");
        setShowForm(false);
        fetchSubUsers();
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar sub-usuário");
    }
    setCreating(false);
  };

  const toggleModule = async (subUser: SubUser, moduleKey: string) => {
    const current = subUser.allowed_modules || [];
    const updated = current.includes(moduleKey)
      ? current.filter(k => k !== moduleKey)
      : [...current, moduleKey];

    // Optimistic update
    setSubUsers(prev => prev.map(s =>
      s.id === subUser.id ? { ...s, allowed_modules: updated } : s
    ));

    setSavingId(subUser.id);
    const { data, error } = await supabase.functions.invoke("manage-sub-users", {
      body: { action: "update_modules", sub_user_id: subUser.id, allowed_modules: updated },
    });
    setSavingId(null);
    if (error || data?.error) {
      toast.error("Erro ao salvar permissões");
      fetchSubUsers(); // revert
    }
  };

  const handleDelete = async (subUser: SubUser) => {
    if (!confirm(`Deseja realmente excluir o sub-usuário ${subUser.email}?`)) return;
    const { data, error } = await supabase.functions.invoke("manage-sub-users", {
      body: { action: "delete", sub_user_id: subUser.id },
    });
    if (error || data?.error) {
      toast.error("Erro ao excluir");
    } else {
      toast.success("Sub-usuário excluído");
      fetchSubUsers();
    }
  };

  const handleToggleAtivo = async (subUser: SubUser) => {
    const { data, error } = await supabase.functions.invoke("manage-sub-users", {
      body: { action: "toggle_ativo", sub_user_id: subUser.id, ativo: !subUser.ativo },
    });
    if (error || data?.error) {
      toast.error("Erro ao alterar status");
    } else {
      fetchSubUsers();
    }
  };

  const handleChangePassword = async (subUser: SubUser) => {
    const password = newPassMap[subUser.id];
    if (!password || password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }
    setChangingPassId(subUser.id);
    const { data, error } = await supabase.functions.invoke("manage-sub-users", {
      body: { action: "update_password", auth_user_id: subUser.auth_user_id, password },
    });
    setChangingPassId(null);
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao alterar senha");
    } else {
      toast.success("Senha alterada com sucesso");
      setNewPassMap(prev => ({ ...prev, [subUser.id]: "" }));
      setShowPassFor(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-xs" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
        <Loader2 size={16} className="animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
          Crie sub-usuários com acesso limitado aos módulos selecionados.
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{
            backgroundColor: "var(--layout-button-bg, #333)",
            color: "var(--layout-button-text, #fff)",
          }}
        >
          <Plus size={14} /> Novo Sub-Usuário
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{
            backgroundColor: "color-mix(in srgb, var(--layout-widget-bg, #1a1a1a) 10%, var(--layout-page-bg, #fff) 90%)",
            border: "1px solid var(--layout-border-color, #333)",
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nome</label>
              <input
                value={newNome}
                onChange={e => setNewNome(e.target.value)}
                placeholder="Nome do sub-usuário"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Email *</label>
              <input
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="email@exemplo.com"
                type="email"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Senha *</label>
              <input
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                type="password"
                style={inputStyle}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ color: "var(--layout-page-text, #1a1a1a)" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{
                backgroundColor: "var(--layout-accent-color, #444)",
                color: "var(--layout-button-text, #fff)",
                opacity: creating ? 0.6 : 1,
              }}
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Criar
            </button>
          </div>
        </div>
      )}

      {/* Sub-users list */}
      {subUsers.length === 0 && !showForm && (
        <div className="text-center py-8 text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
          <Users size={32} className="mx-auto mb-2 opacity-30" />
          Nenhum sub-usuário criado ainda.
        </div>
      )}

      {subUsers.map(sub => (
        <div
          key={sub.id}
          className="rounded-xl overflow-hidden transition-all"
          style={{
            border: "1px solid var(--layout-border-color, #333)",
            opacity: sub.ativo ? 1 : 0.5,
          }}
        >
          {/* Header */}
          <button
            onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
            className="w-full flex items-center justify-between px-4 py-3 transition-colors"
            style={{
              backgroundColor: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 15%, var(--layout-page-bg, #fff) 85%)",
            }}
          >
            <div className="flex items-center gap-3">
              <ShieldCheck size={16} style={{ color: "var(--layout-accent-color, #444)" }} />
              <div className="text-left">
                <div className="text-sm font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  {sub.nome || sub.email}
                </div>
                <div className="text-[11px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                  {sub.email} · {sub.allowed_modules.length} módulo{sub.allowed_modules.length !== 1 ? "s" : ""}
                  {!sub.ativo && " · Inativo"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {savingId === sub.id && <Loader2 size={14} className="animate-spin" style={{ color: "var(--layout-accent-color, #444)" }} />}
              {expandedId === sub.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </button>

          {/* Expanded content */}
          {expandedId === sub.id && (
            <div className="p-4 space-y-4" style={{ backgroundColor: "var(--layout-page-bg, #fff)" }}>
              {/* Module toggles */}
              <div>
                <label className="text-[11px] font-bold mb-2 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  Módulos com acesso:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {AVAILABLE_MODULES.map(mod => {
                    const active = sub.allowed_modules.includes(mod.key);
                    return (
                      <button
                        key={mod.key}
                        onClick={() => toggleModule(sub, mod.key)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                        style={{
                          backgroundColor: active
                            ? "var(--layout-accent-color, #444)"
                            : "color-mix(in srgb, var(--layout-widget-bg, #1a1a1a) 10%, var(--layout-page-bg, #fff) 90%)",
                          color: active
                            ? "var(--layout-button-text, #fff)"
                            : "var(--layout-page-text, #1a1a1a)",
                          border: `1px solid ${active ? "transparent" : "var(--layout-border-color, #333)"}`,
                        }}
                      >
                        {active ? <Eye size={14} /> : <EyeOff size={14} style={{ opacity: 0.4 }} />}
                        {mod.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-2" style={{ borderTop: "1px solid var(--layout-border-color, #333)" }}>
                <button
                  onClick={() => handleToggleAtivo(sub)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--layout-widget-bg, #1a1a1a) 10%, var(--layout-page-bg, #fff) 90%)",
                    color: "var(--layout-page-text, #1a1a1a)",
                    border: "1px solid var(--layout-border-color, #333)",
                  }}
                >
                  {sub.ativo ? "Desativar" : "Ativar"}
                </button>

                <button
                  onClick={() => setShowPassFor(showPassFor === sub.id ? null : sub.id)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--layout-widget-bg, #1a1a1a) 10%, var(--layout-page-bg, #fff) 90%)",
                    color: "var(--layout-page-text, #1a1a1a)",
                    border: "1px solid var(--layout-border-color, #333)",
                  }}
                >
                  <Key size={12} /> Alterar Senha
                </button>

                <button
                  onClick={() => handleDelete(sub)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ml-auto"
                  style={{
                    backgroundColor: "color-mix(in srgb, #ef4444 15%, var(--layout-page-bg, #fff) 85%)",
                    color: "#ef4444",
                    border: "1px solid color-mix(in srgb, #ef4444 30%, transparent)",
                  }}
                >
                  <Trash2 size={12} /> Excluir
                </button>
              </div>

              {/* Change password */}
              {showPassFor === sub.id && (
                <div className="flex items-center gap-2">
                  <input
                    value={newPassMap[sub.id] || ""}
                    onChange={e => setNewPassMap(prev => ({ ...prev, [sub.id]: e.target.value }))}
                    placeholder="Nova senha (mín. 6 caracteres)"
                    type="password"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    onClick={() => handleChangePassword(sub)}
                    disabled={changingPassId === sub.id}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold"
                    style={{
                      backgroundColor: "var(--layout-accent-color, #444)",
                      color: "var(--layout-button-text, #fff)",
                      opacity: changingPassId === sub.id ? 0.6 : 1,
                    }}
                  >
                    {changingPassId === sub.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Salvar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
