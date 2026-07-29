import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Plus, Trash2, Loader2, Users, Eye, EyeOff, Save, ChevronDown, ChevronUp,
  GripVertical, ShieldCheck, Key, Bot, Shield, AlertCircle
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Available modules grouped by category for sub-user permissions
const MODULE_GROUPS = [
  {
    category: "Cadastros",
    items: [
      { key: "apresentadores", label: "Apresentadores" },
      { key: "programas", label: "Programas" },
      { key: "previsao", label: "Cidade / Tempo" },
    ],
  },
  {
    category: "Roteiro / Música / Agenda",
    items: [
      { key: "noticias", label: "Roteiro de Programa" },
      { key: "musica", label: "Música no Ar" },
      { key: "agenda", label: "Agenda" },
    ],
  },
  {
    category: "Player",
    items: [
      { key: "playerconfig", label: "Configurações" },
      { key: "preroll", label: "Anúncios" },
      { key: "fans", label: "Fãs" },
    ],
  },
  {
    category: "Comercial",
    items: [
      { key: "testemunhais", label: "Citações" },
      { key: "promocoes", label: "Promoções" },
      { key: "configtelapromo", label: "Config Tela Promo" },
      { key: "telapromo", label: "Tela Promo" },
      { key: "shopping", label: "Shopping" },
      { key: "propostas", label: "Propostas Comerciais" },
    ],
  },
  {
    category: "vMix",
    items: [
      { key: "broadcast", label: "Broadcast" },
      { key: "logos", label: "Logos" },
      { key: "cenario", label: "Cenário Interativo" },
      { key: "batalha", label: "Batalha Musical" },
      { key: "enquete", label: "Enquete" },
    ],
  },
  {
    category: "Ferramentas",
    items: [
      { key: "cortevideo", label: "Corte de Vídeo" },
    ],
  },
];

// Flat list for counting
const ALL_MODULE_KEYS = MODULE_GROUPS.flatMap(g => g.items.map(i => i.key));

// ---- Perfis padrão de sub-usuário ----
const PERFIS = [
  {
    key: "recepcao",
    label: "RECEPÇÃO",
    desc: "Atendimento e cadastros",
    modules: ["fans", "agenda", "promocoes"],
  },
  {
    key: "locutor",
    label: "LOCUTOR",
    desc: "Estúdio e no ar",
    modules: ["musica", "noticias", "telapromo", "testemunhais"],
  },
  {
    key: "producao",
    label: "PRODUÇÃO",
    desc: "Conteúdo e pauta",
    modules: [
      "apresentadores", "programas", "previsao", "noticias", "musica", "agenda",
      "broadcast", "cenario", "batalha", "enquete", "cortevideo",
    ],
  },
  {
    key: "comercial",
    label: "COMERCIAL",
    desc: "Vendas e patrocínios",
    modules: [
      "testemunhais", "promocoes", "configtelapromo", "telapromo",
      "shopping", "propostas", "logos", "preroll",
    ],
  },
] as const;

type PerfilKey = (typeof PERFIS)[number]["key"];

const PERFIL_STORAGE_KEY = "nexo_subuser_perfis";

const readPerfilMap = (): Record<string, PerfilKey> => {
  try {
    return JSON.parse(localStorage.getItem(PERFIL_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
};

const writePerfilMap = (map: Record<string, PerfilKey>) => {
  try {
    localStorage.setItem(PERFIL_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
};

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
  const [aiEnabled, setAiEnabled] = useState(true);
  const [updatingAi, setUpdatingAi] = useState(false);
  const [newPerfil, setNewPerfil] = useState<PerfilKey>("recepcao");
  const [perfilMap, setPerfilMap] = useState<Record<string, PerfilKey>>(readPerfilMap);


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

  const fetchAiSetting = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("ai_enabled").eq("user_id", user.id).maybeSingle();
    if (data) setAiEnabled(data.ai_enabled ?? true);
  }, [user]);

  useEffect(() => { 
    fetchSubUsers(); 
    fetchAiSetting();
  }, [fetchSubUsers, fetchAiSetting]);

  const toggleAi = async (checked: boolean) => {
    if (!user) return;
    setUpdatingAi(true);
    try {
      const { error } = await supabase.from("profiles").update({ ai_enabled: checked }).eq("user_id", user.id);
      if (error) throw error;
      setAiEnabled(checked);
      toast.success(checked ? "IA habilitada ✨" : "Todas as funcionalidades IA desabilitadas ⏹️");
    } catch (err) {
      toast.error("Erro ao atualizar configuração de IA");
    } finally {
      setUpdatingAi(false);
    }
  };

  const applyPerfil = async (subUser: SubUser, perfil: PerfilKey) => {
    const preset = PERFIS.find(p => p.key === perfil);
    if (!preset) return;
    const updated = preset.modules.filter(k => ALL_MODULE_KEYS.includes(k));
    setSubUsers(prev => prev.map(s => s.id === subUser.id ? { ...s, allowed_modules: updated } : s));
    setPerfilMap(prev => {
      const next = { ...prev, [subUser.id]: perfil };
      writePerfilMap(next);
      return next;
    });
    setSavingId(subUser.id);
    const { data, error } = await supabase.functions.invoke("manage-sub-users", {
      body: { action: "update_modules", sub_user_id: subUser.id, allowed_modules: updated },
    });
    setSavingId(null);
    if (error || data?.error) {
      toast.error("Erro ao aplicar perfil");
      fetchSubUsers();
    } else {
      toast.success(`Perfil ${preset.label} aplicado`);
    }
  };

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
        const preset = PERFIS.find(p => p.key === newPerfil);
        const modules = (preset?.modules || []).filter(k => ALL_MODULE_KEYS.includes(k));
        // Localiza o registro recém-criado para aplicar o perfil padrão
        const { data: rows } = await supabase
          .from("sub_users")
          .select("id")
          .eq("email", newEmail)
          .maybeSingle();
        if (rows?.id) {
          await supabase.functions.invoke("manage-sub-users", {
            body: { action: "update_modules", sub_user_id: rows.id, allowed_modules: modules },
          });
          setPerfilMap(prev => {
            const next = { ...prev, [rows.id as string]: newPerfil };
            writePerfilMap(next);
            return next;
          });
        }
        toast.success(`Sub-usuário criado com perfil ${preset?.label ?? ""}`);
        setNewEmail("");
        setNewPassword("");
        setNewNome("");
        setNewPerfil("recepcao");
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
    <div className="space-y-6">

      <div className="space-y-4 pt-4 border-t" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 10%, transparent)" }}>
        <div className="flex items-center gap-2 mb-2">
          <Shield size={16} style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
          <h4 className="text-sm font-bold uppercase tracking-tight" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Acesso de Equipe</h4>
        </div>
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

          {/* Perfil padrão */}
          <div>
            <label className="text-[11px] font-medium mb-1.5 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              Categoria do sub-usuário *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PERFIS.map(p => {
                const active = newPerfil === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setNewPerfil(p.key)}
                    className="rounded-xl px-3 py-2 text-left transition-all"
                    style={{
                      backgroundColor: active
                        ? "var(--layout-accent-color, #444)"
                        : "color-mix(in srgb, var(--layout-widget-bg, #1a1a1a) 8%, var(--layout-page-bg, #fff) 92%)",
                      color: active ? "var(--layout-button-text, #fff)" : "var(--layout-page-text, #1a1a1a)",
                      border: `1px solid ${active ? "transparent" : "var(--layout-border-color, #333)"}`,
                    }}
                  >
                    <span className="block text-[11px] font-bold tracking-wide">{p.label}</span>
                    <span className="block text-[10px] opacity-70">{p.desc}</span>
                  </button>
                );
              })}
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
                <div className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  {sub.nome || sub.email}
                  <span
                    className="text-[9px] font-bold tracking-wider rounded-full px-2 py-0.5"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #444) 18%, transparent)",
                      color: "var(--layout-accent-color, #444)",
                    }}
                  >
                    {PERFIS.find(p => p.key === perfilMap[sub.id])?.label ?? "SEM CATEGORIA"}
                  </span>
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
              {/* Module toggles by category */}
              <div className="space-y-3">
                <label className="text-[11px] font-bold block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  Módulos com acesso:
                </label>
                {MODULE_GROUPS.map(group => {
                  const allActive = group.items.every(i => sub.allowed_modules.includes(i.key));
                  const someActive = group.items.some(i => sub.allowed_modules.includes(i.key));
                  return (
                    <div key={group.category}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <button
                          onClick={() => {
                            // Toggle all in this group
                            const keys = group.items.map(i => i.key);
                            if (allActive) {
                              // Remove all
                              const updated = sub.allowed_modules.filter(k => !keys.includes(k));
                              setSubUsers(prev => prev.map(s => s.id === sub.id ? { ...s, allowed_modules: updated } : s));
                              setSavingId(sub.id);
                              supabase.functions.invoke("manage-sub-users", {
                                body: { action: "update_modules", sub_user_id: sub.id, allowed_modules: updated },
                              }).then(() => setSavingId(null));
                            } else {
                              // Add all
                              const updated = [...new Set([...sub.allowed_modules, ...keys])];
                              setSubUsers(prev => prev.map(s => s.id === sub.id ? { ...s, allowed_modules: updated } : s));
                              setSavingId(sub.id);
                              supabase.functions.invoke("manage-sub-users", {
                                body: { action: "update_modules", sub_user_id: sub.id, allowed_modules: updated },
                              }).then(() => setSavingId(null));
                            }
                          }}
                          className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: someActive ? "var(--layout-accent-color, #444)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}
                        >
                          {group.category}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {group.items.map(mod => {
                          const active = sub.allowed_modules.includes(mod.key);
                          return (
                            <button
                              key={mod.key}
                              onClick={() => toggleModule(sub, mod.key)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
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
                              {active ? <Eye size={12} /> : <EyeOff size={12} style={{ opacity: 0.4 }} />}
                              {mod.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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
                  <Button variant="save"
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
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      </div>

      {/* Global AI Control */}
      <div 
        className="rounded-2xl p-5 space-y-4 transition-all"
        style={{ 
          backgroundColor: aiEnabled ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 5%, var(--layout-page-bg, #fff) 95%)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, var(--layout-page-bg, #fff) 97%)",
          border: `1px solid ${aiEnabled ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)" : "color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)"}`,
          boxShadow: aiEnabled ? "0 8px 30px -10px color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent)" : "none"
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div 
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-500"
              style={{ 
                background: aiEnabled ? "linear-gradient(135deg, var(--layout-accent-color, #2563eb), color-mix(in srgb, var(--layout-accent-color, #2563eb) 70%, #000))" : "var(--layout-border-color, #333)",
                transform: aiEnabled ? "rotate(0deg)" : "rotate(-10deg)"
              }}
            >
              <Bot size={24} className="text-white" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Inteligência Artificial</h3>
              <p className="text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
                Controle o processamento inteligente de notícias, melhoria de texto e enquetes.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {updatingAi && <Loader2 size={16} className="animate-spin" style={{ color: "var(--layout-accent-color, #2563eb)" }} />}
            <Switch 
              checked={aiEnabled} 
              onCheckedChange={toggleAi} 
              disabled={updatingAi}
              className="data-[state=checked]:bg-[var(--layout-accent-color)]"
            />
          </div>
        </div>

        {!aiEnabled && (
          <div 
            className="flex items-start gap-3 p-3.5 rounded-xl border animate-in fade-in slide-in-from-top-2 duration-300"
            style={{ backgroundColor: "rgba(245,158,11,0.05)", borderColor: "rgba(245,158,11,0.2)", color: "#b45309" }}
          >
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider">IA Desativada Temporariamente</p>
              <p className="text-[11px] leading-relaxed opacity-90">
                Resumos automáticos, melhoria de texto e geração inteligente de enquetes foram suspensos. O sistema funcionará apenas com dados manuais ou pré-configurados.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
