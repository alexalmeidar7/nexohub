import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirmDialog";
import {
  Plus, Trash2, Loader2, Users, Eye, EyeOff, Save, ChevronDown, ChevronUp,
  ShieldCheck, Key, Shield, Settings, X, Headphones, Mic, Clapperboard,
  Briefcase, UserPlus, RotateCcw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Available modules grouped by category for sub-user permissions
const MODULE_GROUPS = [
  {
    category: "Cadastros",
    items: [
      { key: "apresentadores", label: "Apresentadores" },
      { key: "programas", label: "Programas" },
      { key: "ouvintes", label: "Cadastro de Ouvintes" },
      { key: "previsao", label: "Cidade / Tempo" },
    ],
  },
  {
    category: "Atendimento",
    items: [
      { key: "atendimento", label: "Atendimento (Chatbot)" },
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
      { key: "logos", label: "Logos" },
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
      { key: "cenario", label: "Cenário 1 e 2" },
      { key: "batalha", label: "Batalha Musical" },
      { key: "enquete", label: "Enquete" },
    ],
  },
  {
    category: "Ferramentas",
    items: [
      { key: "cortevideo", label: "Editor de Vídeo" },
      { key: "backup", label: "Backup / Importar" },
    ],
  },
];

const ALL_MODULE_KEYS = MODULE_GROUPS.flatMap(g => g.items.map(i => i.key));
const MODULE_LABEL: Record<string, string> = Object.fromEntries(
  MODULE_GROUPS.flatMap(g => g.items.map(i => [i.key, i.label])),
);

// ---- Perfis padrão de sub-usuário ----
const PERFIS: { key: PerfilKey; label: string; slug: string; desc: string; icon: LucideIcon; color: string; modules: string[] }[] = [
  {
    key: "recepcao",
    label: "RECEPÇÃO",
    slug: "recepcao",
    desc: "Atendimento e cadastros",
    icon: Headphones,
    color: "#00BFF0",
    modules: ["fans", "agenda", "promocoes", "ouvintes", "atendimento"],
  },
  {
    key: "locutor",
    label: "LOCUTOR",
    slug: "locutor",
    desc: "Estúdio e no ar",
    icon: Mic,
    color: "#7C3AED",
    modules: ["musica", "noticias", "telapromo", "testemunhais"],
  },
  {
    key: "producao",
    label: "PRODUÇÃO",
    slug: "producao",
    desc: "Conteúdo e pauta",
    icon: Clapperboard,
    color: "#F59E0B",
    modules: [
      "apresentadores", "programas", "ouvintes", "previsao", "noticias", "musica", "agenda",
      "broadcast", "cenario", "batalha", "enquete", "cortevideo",
    ],

  },
  {
    key: "comercial",
    label: "COMERCIAL",
    slug: "comercial",
    desc: "Vendas e patrocínios",
    icon: Briefcase,
    color: "#16A34A",
    modules: [
      "testemunhais", "promocoes", "configtelapromo", "telapromo",
      "shopping", "propostas", "logos", "preroll",
    ],
  },
];


type PerfilKey = "recepcao" | "locutor" | "producao" | "comercial";

const PERFIL_STORAGE_KEY = "nexo_subuser_perfis";
const PERFIL_MODULES_KEY = "nexo_subuser_perfil_modules";

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
  } catch { /* ignore */ }
};

const defaultPerfilModules = (): Record<PerfilKey, string[]> => ({
  recepcao: [...PERFIS[0].modules],
  locutor: [...PERFIS[1].modules],
  producao: [...PERFIS[2].modules],
  comercial: [...PERFIS[3].modules],
});

const readPerfilModules = (): Record<PerfilKey, string[]> => {
  try {
    const raw = localStorage.getItem(PERFIL_MODULES_KEY);
    if (!raw) return defaultPerfilModules();
    return { ...defaultPerfilModules(), ...JSON.parse(raw) };
  } catch {
    return defaultPerfilModules();
  }
};

const writePerfilModules = (map: Record<PerfilKey, string[]>) => {
  try {
    localStorage.setItem(PERFIL_MODULES_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
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
  const [formPerfil, setFormPerfil] = useState<PerfilKey | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPassFor, setShowPassFor] = useState<string | null>(null);
  const [newPassMap, setNewPassMap] = useState<Record<string, string>>({});
  const [changingPassId, setChangingPassId] = useState<string | null>(null);
  const [perfilMap, setPerfilMap] = useState<Record<string, PerfilKey>>(readPerfilMap);
  const [perfilModules, setPerfilModules] = useState<Record<PerfilKey, string[]>>(readPerfilModules);
  const [configPerfil, setConfigPerfil] = useState<PerfilKey | null>(null);

  const emailDomain = useMemo(() => {
    const parts = (user?.email || "").split("@");
    return parts.length === 2 ? parts[1] : "";
  }, [user?.email]);

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

  // Auto-associa sub-usuários cujo e-mail começa com o slug da categoria
  useEffect(() => {
    if (!subUsers.length) return;
    setPerfilMap(prev => {
      let changed = false;
      const next = { ...prev };
      subUsers.forEach(s => {
        if (next[s.id]) return;
        const local = s.email.split("@")[0].toLowerCase();
        const match = PERFIS.find(p => local === p.slug || local.startsWith(`${p.slug}.`));
        if (match) { next[s.id] = match.key; changed = true; }
      });
      if (changed) writePerfilMap(next);
      return changed ? next : prev;
    });
  }, [subUsers]);

  const persistModules = async (subUser: SubUser, updated: string[]) => {
    setSubUsers(prev => prev.map(s => s.id === subUser.id ? { ...s, allowed_modules: updated } : s));
    setSavingId(subUser.id);
    const { data, error } = await supabase.functions.invoke("manage-sub-users", {
      body: { action: "update_modules", sub_user_id: subUser.id, allowed_modules: updated },
    });
    setSavingId(null);
    if (error || data?.error) {
      toast.error("Erro ao salvar permissões");
      fetchSubUsers();
      return false;
    }
    return true;
  };

  const applyPerfil = async (subUser: SubUser, perfil: PerfilKey) => {
    const updated = (perfilModules[perfil] || []).filter(k => ALL_MODULE_KEYS.includes(k));
    const previousPerfil = perfilMap[subUser.id];
    const ok = await persistModules(subUser, updated);
    if (!ok) return;
    setPerfilMap(prev => {
      const next = { ...prev, [subUser.id]: perfil };
      writePerfilMap(next);
      return next;
    });
    if (previousPerfil !== perfil) toast.success(`Perfil ${PERFIS.find(p => p.key === perfil)?.label} aplicado`);
  };

  const openCreateForm = (perfil: PerfilKey) => {
    const preset = PERFIS.find(p => p.key === perfil)!;
    const suggested = emailDomain ? `${preset.slug}@${emailDomain}` : "";
    const taken = subUsers.some(s => s.email.toLowerCase() === suggested.toLowerCase());
    setFormPerfil(perfil);
    setNewNome(preset.label.charAt(0) + preset.label.slice(1).toLowerCase());
    setNewEmail(!taken ? suggested : "");
    setNewPassword("");
  };

  const handleCreate = async () => {
    if (!formPerfil) return;
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
        const modules = (perfilModules[formPerfil] || []).filter(k => ALL_MODULE_KEYS.includes(k));
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
            const next = { ...prev, [rows.id as string]: formPerfil };
            writePerfilMap(next);
            return next;
          });
        }
        toast.success("Sub-usuário criado");
        setNewEmail(""); setNewPassword(""); setNewNome(""); setFormPerfil(null);
        fetchSubUsers();
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar sub-usuário");
    }
    setCreating(false);
  };

  const toggleModule = (subUser: SubUser, moduleKey: string) => {
    const current = subUser.allowed_modules || [];
    const updated = current.includes(moduleKey)
      ? current.filter(k => k !== moduleKey)
      : [...current, moduleKey];
    persistModules(subUser, updated);
  };

  const handleDelete = async (subUser: SubUser) => {
    const confirmed = await confirmDialog({
      title: "Excluir Sub-usuário",
      message: `Deseja realmente excluir o sub-usuário ${subUser.email}?`,
      destructive: true,
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar"
    });
    if (!confirmed) return;
    const { data, error } = await supabase.functions.invoke("manage-sub-users", {
      body: { action: "delete", sub_user_id: subUser.id },
    });
    if (error || data?.error) toast.error("Erro ao excluir");
    else { toast.success("Sub-usuário excluído"); fetchSubUsers(); }
  };

  const handleToggleAtivo = async (subUser: SubUser) => {
    const { data, error } = await supabase.functions.invoke("manage-sub-users", {
      body: { action: "toggle_ativo", sub_user_id: subUser.id, ativo: !subUser.ativo },
    });
    if (error || data?.error) toast.error("Erro ao alterar status");
    else fetchSubUsers();
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
    if (error || data?.error) toast.error(data?.error || "Erro ao alterar senha");
    else {
      toast.success("Senha alterada com sucesso");
      setNewPassMap(prev => ({ ...prev, [subUser.id]: "" }));
      setShowPassFor(null);
    }
  };

  // ---- Config popup (funções da categoria) ----
  const togglePerfilModule = (perfil: PerfilKey, key: string) => {
    setPerfilModules(prev => {
      const cur = prev[perfil] || [];
      const next = {
        ...prev,
        [perfil]: cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key],
      };
      writePerfilModules(next);
      return next;
    });
  };

  const resetPerfilModules = (perfil: PerfilKey) => {
    setPerfilModules(prev => {
      const next = { ...prev, [perfil]: [...(PERFIS.find(p => p.key === perfil)?.modules || [])] };
      writePerfilModules(next);
      return next;
    });
    toast.success("Funções padrão restauradas");
  };

  const applyToCategoryUsers = async (perfil: PerfilKey) => {
    const targets = subUsers.filter(s => perfilMap[s.id] === perfil);
    if (!targets.length) { toast.info("Nenhum usuário nesta categoria"); return; }
    const mods = (perfilModules[perfil] || []).filter(k => ALL_MODULE_KEYS.includes(k));
    const results = await Promise.all(targets.map(target => persistModules(target, mods)));
    const failed = results.filter(ok => !ok).length;
    if (failed) {
      toast.error(`Não foi possível aplicar as funções a ${failed} de ${targets.length} usuário(s).`);
    } else {
      toast.success(`Funções aplicadas a ${targets.length} usuário(s)`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-xs" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
        <Loader2 size={16} className="animate-spin" /> Carregando...
      </div>
    );
  }

  const textCol = "var(--layout-page-text, #1a1a1a)";
  const accent = "var(--layout-accent-color, #444)";
  const softBg = "color-mix(in srgb, var(--layout-widget-bg, #1a1a1a) 8%, var(--layout-page-bg, #fff) 92%)";
  const borderCol = "var(--layout-border-color, #333)";

  const renderUserCard = (sub: SubUser) => (
    <div
      key={sub.id}
      className="rounded-xl overflow-hidden transition-all"
      style={{ border: `1px solid ${borderCol}`, opacity: sub.ativo ? 1 : 0.5 }}
    >
      <button
        onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
        className="w-full flex items-center justify-between px-3 py-2.5 gap-2"
        style={{ backgroundColor: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 10%, var(--layout-page-bg, #fff) 90%)" }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ShieldCheck size={15} style={{ color: accent }} className="shrink-0" />
          <div className="text-left min-w-0">
            <div className="text-[13px] font-semibold truncate" style={{ color: textCol }}>
              {sub.nome || sub.email}
            </div>
            <div className="text-[10px] truncate" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
              {sub.email} · {sub.allowed_modules.length} módulo{sub.allowed_modules.length !== 1 ? "s" : ""}
              {!sub.ativo && " · Inativo"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {savingId === sub.id && <Loader2 size={13} className="animate-spin" style={{ color: accent }} />}
          {expandedId === sub.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </div>
      </button>

      {expandedId === sub.id && (
        <div className="p-3 space-y-3" style={{ backgroundColor: "var(--layout-page-bg, #fff)" }}>
          <div>
            <label className="text-[10px] font-bold block mb-1.5" style={{ color: textCol }}>Mover para categoria:</label>
            <div className="flex flex-wrap gap-1.5">
              {PERFIS.map(p => {
                const active = perfilMap[sub.id] === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => applyPerfil(sub, p.key)}
                    className="rounded-full px-3 py-1 text-[10px] font-bold tracking-wide transition-all"
                    style={{
                      backgroundColor: active ? accent : softBg,
                      color: active ? "var(--layout-button-text, #fff)" : textCol,
                      border: `1px solid ${active ? "transparent" : borderCol}`,
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="text-[10px] font-bold block" style={{ color: textCol }}>Módulos com acesso:</label>
            {MODULE_GROUPS.map(group => (
              <div key={group.category}>
                <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                  {group.category}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.items.map(mod => {
                    const active = sub.allowed_modules.includes(mod.key);
                    return (
                      <button
                        key={mod.key}
                        onClick={() => toggleModule(sub, mod.key)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all text-left"
                        style={{
                          backgroundColor: active ? accent : softBg,
                          color: active ? "var(--layout-button-text, #fff)" : textCol,
                          border: `1px solid ${active ? "transparent" : borderCol}`,
                        }}
                      >
                        {active ? <Eye size={11} /> : <EyeOff size={11} style={{ opacity: 0.4 }} />}
                        <span className="truncate">{mod.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2" style={{ borderTop: `1px solid ${borderCol}` }}>
            <button
              onClick={() => handleToggleAtivo(sub)}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium"
              style={{ backgroundColor: softBg, color: textCol, border: `1px solid ${borderCol}` }}
            >
              {sub.ativo ? "Desativar" : "Ativar"}
            </button>
            <button
              onClick={() => setShowPassFor(showPassFor === sub.id ? null : sub.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium"
              style={{ backgroundColor: softBg, color: textCol, border: `1px solid ${borderCol}` }}
            >
              <Key size={11} /> Senha
            </button>
            <button
              onClick={() => handleDelete(sub)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium ml-auto"
              style={{
                backgroundColor: "color-mix(in srgb, #ef4444 15%, var(--layout-page-bg, #fff) 85%)",
                color: "#ef4444",
                border: "1px solid color-mix(in srgb, #ef4444 30%, transparent)",
              }}
            >
              <Trash2 size={11} /> Excluir
            </button>
          </div>

          {showPassFor === sub.id && (
            <div className="flex items-center gap-2">
              <input
                value={newPassMap[sub.id] || ""}
                onChange={e => setNewPassMap(prev => ({ ...prev, [sub.id]: e.target.value }))}
                placeholder="Nova senha (mín. 6 caracteres)"
                type="password"
                style={{ ...inputStyle, flex: 1 }}
              />
              <Button
                variant="save"
                onClick={() => handleChangePassword(sub)}
                disabled={changingPassId === sub.id}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: accent, color: "var(--layout-button-text, #fff)" }}
              >
                {changingPassId === sub.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const semCategoria = subUsers.filter(s => !perfilMap[s.id]);

  return (
    <div className="space-y-6">
      <div className="space-y-5 pt-4 border-t" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 10%, transparent)" }}>
        <div className="flex items-center gap-2">
          <Shield size={16} style={{ color: textCol }} />
          <h4 className="text-sm font-bold uppercase tracking-tight" style={{ color: textCol }}>Acesso de Equipe</h4>
        </div>
        <p className="text-xs" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
          Cada categoria abaixo já vem com o usuário padrão sugerido (ex.: <b>recepcao@{emailDomain || "seudominio.com.br"}</b>).
          Use a engrenagem para editar as funções liberadas da categoria.
        </p>

        {/* Category sections */}
        <div className="space-y-4">
          {PERFIS.map(p => {
            const Icon = p.icon;
            const users = subUsers.filter(s => perfilMap[s.id] === p.key);
            const mods = perfilModules[p.key] || [];
            const suggestedEmail = emailDomain ? `${p.slug}@${emailDomain}` : `${p.slug}@seudominio.com.br`;
            const hasDefault = users.some(u => u.email.toLowerCase() === suggestedEmail.toLowerCase());
            return (
              <section
                key={p.key}
                className="rounded-2xl overflow-hidden"
                style={{
                  border: `1px solid color-mix(in srgb, ${p.color} 35%, transparent)`,
                  backgroundColor: `color-mix(in srgb, ${p.color} 5%, var(--layout-page-bg, #fff) 95%)`,
                }}
              >
                {/* Header band */}
                <div
                  className="flex items-center gap-3 px-4 py-3 flex-wrap"
                  style={{ backgroundColor: p.color, color: "#fff" }}
                >
                  <span
                    className="flex items-center justify-center rounded-xl shrink-0"
                    style={{ width: 38, height: 38, backgroundColor: "rgba(255,255,255,0.2)" }}
                  >
                    <Icon size={19} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[14px] font-extrabold tracking-wide leading-tight">{p.label}</div>
                    <div className="text-[11px] opacity-80 truncate">{p.desc}</div>
                  </div>

                  <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                    <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                      {users.length} usuário{users.length !== 1 ? "s" : ""}
                    </span>
                    <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                      {mods.length} funç{mods.length !== 1 ? "ões" : "ão"}
                    </span>
                    <button
                      onClick={() => setConfigPerfil(p.key)}
                      title="Funções da categoria"
                      className="rounded-lg p-1.5 transition-opacity opacity-85 hover:opacity-100"
                      style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                    >
                      <Settings size={15} />
                    </button>
                    <button
                      onClick={() => openCreateForm(p.key)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold"
                      style={{ backgroundColor: "#fff", color: p.color }}
                    >
                      <UserPlus size={13} /> Novo usuário
                    </button>
                  </div>
                </div>

                <div className="p-3 space-y-3">
                  {/* Default suggested user */}
                  {!hasDefault && formPerfil !== p.key && (
                    <div
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 flex-wrap"
                      style={{
                        border: `1px dashed color-mix(in srgb, ${p.color} 55%, transparent)`,
                        backgroundColor: "var(--layout-page-bg, #fff)",
                      }}
                    >
                      <UserPlus size={15} style={{ color: p.color }} />
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold" style={{ color: textCol }}>Usuário padrão da categoria</div>
                        <div className="text-[11px] font-mono truncate" style={{ color: p.color }}>{suggestedEmail}</div>
                      </div>
                      <button
                        onClick={() => openCreateForm(p.key)}
                        className="ml-auto rounded-lg px-3 py-1.5 text-[11px] font-bold"
                        style={{ backgroundColor: p.color, color: "#fff" }}
                      >
                        Criar este usuário
                      </button>
                    </div>
                  )}

                  {/* Create form for this category */}
                  {formPerfil === p.key && (
                    <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: "var(--layout-page-bg, #fff)", border: `1px solid ${borderCol}` }}>
                      <input value={newNome} onChange={e => setNewNome(e.target.value)} placeholder="Nome" style={inputStyle} />
                      <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={suggestedEmail} type="email" style={inputStyle} />
                      <input value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Senha (mín. 6)" type="password" style={inputStyle} />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setFormPerfil(null)} className="px-3 py-1.5 rounded-lg text-[11px]" style={{ color: textCol }}>Cancelar</button>
                        <button
                          onClick={handleCreate}
                          disabled={creating}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                          style={{ backgroundColor: p.color, color: "#fff", opacity: creating ? 0.6 : 1 }}
                        >
                          {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Criar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Users of this category */}
                  {users.length > 0 && (
                    <div className="grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                      {users.map(renderUserCard)}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {/* Sem categoria */}
        {semCategoria.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>
              <Users size={13} /> Sem categoria
            </div>
            <div className="grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {semCategoria.map(renderUserCard)}
            </div>
          </div>
        )}
      </div>


      {/* Config popup */}
      {configPerfil && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(15,23,42,0.55)" }}
          onClick={() => setConfigPerfil(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-5 space-y-4"
            style={{ backgroundColor: "var(--layout-page-bg, #fff)", border: `1px solid ${borderCol}` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center rounded-xl shrink-0" style={{ width: 38, height: 38, backgroundColor: accent, color: "var(--layout-button-text, #fff)" }}>
                <Settings size={18} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold" style={{ color: textCol }}>
                  Funções da categoria {PERFIS.find(p => p.key === configPerfil)?.label}
                </div>
                <div className="text-[11px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>
                  Marque para adicionar, desmarque para excluir da categoria.
                </div>
              </div>
              <button onClick={() => setConfigPerfil(null)} className="p-1.5 rounded-lg" style={{ color: textCol }}>
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(perfilModules[configPerfil] || []).map(k => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-1 text-[10px] font-medium"
                  style={{ backgroundColor: accent, color: "var(--layout-button-text, #fff)" }}
                >
                  {MODULE_LABEL[k] || k}
                  <button onClick={() => togglePerfilModule(configPerfil, k)} title="Remover"><X size={11} /></button>
                </span>
              ))}
              {(perfilModules[configPerfil] || []).length === 0 && (
                <span className="text-[11px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                  Nenhuma função nesta categoria.
                </span>
              )}
            </div>

            <div className="space-y-3">
              {MODULE_GROUPS.map(group => (
                <div key={group.category}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>
                    {group.category}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {group.items.map(mod => {
                      const active = (perfilModules[configPerfil] || []).includes(mod.key);
                      return (
                        <button
                          key={mod.key}
                          onClick={() => togglePerfilModule(configPerfil, mod.key)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-left"
                          style={{
                            backgroundColor: active ? accent : softBg,
                            color: active ? "var(--layout-button-text, #fff)" : textCol,
                            border: `1px solid ${active ? "transparent" : borderCol}`,
                          }}
                        >
                          {active ? <Eye size={11} /> : <EyeOff size={11} style={{ opacity: 0.4 }} />}
                          <span className="truncate">{mod.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 justify-end pt-2" style={{ borderTop: `1px solid ${borderCol}` }}>
              <button
                onClick={() => resetPerfilModules(configPerfil)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ backgroundColor: softBg, color: textCol, border: `1px solid ${borderCol}` }}
              >
                <RotateCcw size={12} /> Restaurar padrão
              </button>
              <button
                onClick={() => applyToCategoryUsers(configPerfil)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-semibold"
                style={{ backgroundColor: accent, color: "var(--layout-button-text, #fff)" }}
              >
                <Save size={12} /> Aplicar aos usuários
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
