import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Pencil, Check, X, Eye, EyeOff, MessageSquare } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";

interface AvailableModule {
  key: string;
  name: string;
  icon: string;
}

interface ClientRow {
  user_id: string;
  nome: string;
  logo: string;
  ativo: boolean;
  plano: string;
  modules: Record<string, boolean>;
}

interface ClientCardProps {
  client: ClientRow;
  clientEmail: string;
  modules: AvailableModule[];
  saving: string | null;
  onToggleModule: (userId: string, moduleKey: string, enabled: boolean) => void;
  onClientUpdated: () => void;
  onSendMessage: (userId: string, nome: string) => void;
}

const inputStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#0d0446",
  border: "1px solid #d1d5db",
  borderRadius: "12px",
  backgroundColor: "#fff",
  padding: "6px 12px",
};

const plans = [
  { value: "basic", label: "Basic" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
];

export default function ClientCard({ client, clientEmail, modules, saving, onToggleModule, onClientUpdated, onSendMessage }: ClientCardProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [nome, setNome] = useState(client.nome);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ativo, setAtivo] = useState(client.ativo);
  const [plano, setPlano] = useState(client.plano);

  // Load email when editing opens
  useEffect(() => {
    if (editing && !email) {
      setLoadingEmail(true);
      supabase.functions
        .invoke("create-user", { body: { action: "get_email", user_id: client.user_id } })
        .then(({ data }) => {
          if (data?.email) setEmail(data.email);
          setLoadingEmail(false);
        });
    }
  }, [editing]);

  const handleSave = async () => {
    setSavingEdit(true);
    const res = await supabase.functions.invoke("create-user", {
      body: {
        action: "update",
        user_id: client.user_id,
        nome,
        email: email || undefined,
        password: password || undefined,
        ativo,
        plano,
      },
    });

    if (res.error || res.data?.error) {
      toast({ title: "Erro ao salvar", description: res.data?.error || res.error?.message, variant: "destructive" });
    } else {
      toast({ title: "Dados atualizados!" });
      setPassword("");
      setEditing(false);
      onClientUpdated();
    }
    setSavingEdit(false);
  };

  const planLabel = plans.find((p) => p.value === client.plano)?.label || client.plano;

  return (
    <div
      className="rounded-xl p-5 space-y-4 transition-all duration-200"
      style={{
        backgroundColor: client.ativo ? "#ffffff" : "#f9fafb",
        border: "1px solid #e2e8f0",
        opacity: client.ativo ? 1 : 0.7,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2ec0f6")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {client.logo ? (
            <img src={client.logo} alt="" className="w-10 h-10 rounded-lg object-contain" />
          ) : (
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold" style={{ backgroundColor: "#f0f4f8", color: "#0d0446" }}>
              {client.nome[0]}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold" style={{ fontSize: "13px", color: "#0d0446" }}>{client.nome}</p>
              {!client.ativo && (
                <span className="px-2 py-0.5 rounded-full" style={{ fontSize: "9px", backgroundColor: "#fee2e2", color: "#dc2626", fontWeight: 600 }}>
                  Inativo
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full" style={{ fontSize: "9px", backgroundColor: "#e0f2fe", color: "#0284c7", fontWeight: 600 }}>
                {planLabel}
              </span>
              {clientEmail && (
                <span style={{ fontSize: "10px", color: "#6b7280" }}>{clientEmail}</span>
              )}
            </div>
            <p style={{ fontSize: "10px", color: "#9ca3af" }}>{client.user_id.slice(0, 8)}...</p>
          </div>
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-200"
          style={{
            fontSize: "11px",
            fontWeight: 500,
            backgroundColor: editing ? "#0d0446" : "transparent",
            color: editing ? "#fff" : "#0d0446",
            border: "1px solid #0d0446",
          }}
        >
          <Pencil size={12} /> {editing ? "Editando" : "Editar"}
        </button>
      </div>

      {/* Edit form */}
      <Collapsible open={editing}>
        <CollapsibleContent>
          <div className="space-y-3 pt-2 pb-4 border-b" style={{ borderColor: "#e2e8f0" }}>
            {/* Nome */}
            <div className="space-y-1">
              <label style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600 }}>Nome da empresa</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full outline-none" style={inputStyle} />
            </div>

            {/* Email (login) */}
            <div className="space-y-1">
              <label style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600 }}>Login (email)</label>
              {loadingEmail ? (
                <div className="flex items-center gap-2 py-1">
                  <Loader2 className="animate-spin" size={12} style={{ color: "#2ec0f6" }} />
                  <span style={{ fontSize: "11px", color: "#9ca3af" }}>Carregando...</span>
                </div>
              ) : (
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full outline-none" style={inputStyle} />
              )}
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600 }}>Nova senha (deixe vazio para manter)</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full outline-none pr-10"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "#9ca3af" }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Ativo + Plano row */}
            <div className="flex items-center gap-6 pt-1">
              <div className="flex items-center gap-2">
                <label style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600 }}>Ativo</label>
                <Switch checked={ativo} onCheckedChange={setAtivo} />
              </div>
              <div className="flex items-center gap-2">
                <label style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600 }}>Plano</label>
                <select
                  value={plano}
                  onChange={(e) => setPlano(e.target.value)}
                  className="outline-none"
                  style={{ ...inputStyle, padding: "4px 10px", cursor: "pointer" }}
                >
                  {plans.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => { setEditing(false); setPassword(""); }}
                className="flex items-center gap-1 px-4 py-1.5 rounded-full transition-all"
                style={{ fontSize: "11px", border: "1px solid #d1d5db", color: "#6b7280" }}
              >
                <X size={12} /> Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={savingEdit}
                className="flex items-center gap-1 px-4 py-1.5 rounded-full transition-all disabled:opacity-50"
                style={{ fontSize: "11px", backgroundColor: "#0d0446", color: "#fff", border: "1px solid #0d0446" }}
              >
                {savingEdit ? <Loader2 className="animate-spin" size={12} /> : <Check size={12} />}
                Salvar
              </button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Modules */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {modules.map((mod) => {
          const isEnabled = client.modules[mod.key] || false;
          const isSaving = saving === `${client.user_id}-${mod.key}`;
          return (
            <div
              key={mod.key}
              className="flex items-center justify-between p-3 rounded-lg transition-colors"
              style={{
                border: isEnabled ? "1px solid rgba(46,192,246,0.3)" : "1px solid #e2e8f0",
                backgroundColor: isEnabled ? "rgba(46,192,246,0.05)" : "#ffffff",
              }}
            >
              <span className="truncate mr-2" style={{ fontSize: "11px", fontWeight: 500, color: "#0d0446" }}>
                {mod.name.replace("Módulo ", "")}
              </span>
              {isSaving ? (
                <Loader2 className="animate-spin" size={14} style={{ color: "#2ec0f6" }} />
              ) : (
                <Switch checked={isEnabled} onCheckedChange={(checked) => onToggleModule(client.user_id, mod.key, checked)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
