import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminLayout from "./AdminLayout";

interface ClientRow {
  user_id: string;
  nome: string;
  logo: string;
  modules: Record<string, boolean>;
}

interface AvailableModule {
  key: string;
  name: string;
  icon: string;
}

function AdminUsersContent() {
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [modules, setModules] = useState<AvailableModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const [showNewUser, setShowNewUser] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newNome, setNewNome] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [{ data: empresas }, { data: mods }, { data: clientMods }] = await Promise.all([
      supabase.from("empresa_config").select("user_id, nome, logo"),
      supabase.from("available_modules").select("key, name, icon"),
      supabase.from("client_modules").select("user_id, module_key, enabled"),
    ]);

    const moduleList = mods || [];
    setModules(moduleList);

    const clientList = (empresas || []).map((e: any) => {
      const moduleMap: Record<string, boolean> = {};
      moduleList.forEach((m: any) => {
        const assignment = (clientMods || []).find((cm: any) => cm.user_id === e.user_id && cm.module_key === m.key);
        moduleMap[m.key] = assignment ? assignment.enabled : false;
      });
      return { user_id: e.user_id, nome: e.nome || "Sem nome", logo: e.logo || "", modules: moduleMap };
    });

    setClients(clientList);
    setLoading(false);
  };

  const toggleModule = async (userId: string, moduleKey: string, enabled: boolean) => {
    setSaving(`${userId}-${moduleKey}`);
    const { error } = await supabase.from("client_modules").upsert(
      { user_id: userId, module_key: moduleKey, enabled },
      { onConflict: "user_id,module_key" }
    );
    if (error) {
      toast({ title: "Erro ao atualizar módulo", description: error.message, variant: "destructive" });
    } else {
      setClients((prev) =>
        prev.map((c) =>
          c.user_id === userId ? { ...c, modules: { ...c.modules, [moduleKey]: enabled } } : c
        )
      );
    }
    setSaving(null);
  };

  const handleCreateUser = async () => {
    if (!newEmail || !newPassword || !newNome) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setCreating(true);
    toast({
      title: "Funcionalidade em desenvolvimento",
      description: "A criação de novos usuários requer configuração adicional do backend.",
    });
    setCreating(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2" style={{ color: "#0d0446" }}>
        <Loader2 className="animate-spin" size={18} style={{ color: "#2ec0f6" }} />
        <span style={{ fontSize: "12px" }}>Carregando...</span>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "#0d0446",
    border: "2px solid #0d379a",
    borderRadius: "20px",
    backgroundColor: "#fff",
    padding: "8px 16px",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p style={{ fontSize: "12px", color: "#6b7280" }}>Gerencie os módulos habilitados para cada cliente.</p>
        <Dialog open={showNewUser} onOpenChange={setShowNewUser}>
          <DialogTrigger asChild>
            <button
              className="flex items-center gap-2 px-5 py-2 font-medium transition-all duration-200"
              style={{
                fontSize: "12px",
                backgroundColor: "#2ec0f6",
                color: "#ffffff",
                border: "2px solid #2ec0f6",
                borderRadius: "20px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "#2ec0f6";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#2ec0f6";
                e.currentTarget.style.color = "#ffffff";
              }}
            >
              <UserPlus size={14} /> Novo Usuário
            </button>
          </DialogTrigger>
          <DialogContent style={{ backgroundColor: "#ffffff", borderRadius: "20px", border: "1px solid #e2e8f0" }}>
            <DialogHeader>
              <DialogTitle style={{ color: "#0d0446", fontSize: "14px" }}>Criar Novo Usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <input placeholder="Nome da empresa" value={newNome} onChange={(e) => setNewNome(e.target.value)} className="w-full outline-none" style={inputStyle} />
              <input type="email" placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full outline-none" style={inputStyle} />
              <input type="password" placeholder="Senha" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full outline-none" style={inputStyle} />
              <button
                onClick={handleCreateUser}
                disabled={creating}
                className="w-full flex items-center justify-center gap-2 py-2.5 font-medium transition-all duration-200 disabled:opacity-50"
                style={{ fontSize: "12px", backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "2px solid #0d0446" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#0d0446"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
              >
                {creating ? <Loader2 className="animate-spin" size={14} style={{ color: "#2ec0f6" }} /> : null}
                Criar Usuário
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {clients.length === 0 ? (
        <p style={{ fontSize: "12px", color: "#6b7280" }}>Nenhum cliente cadastrado.</p>
      ) : (
        <div className="space-y-4">
          {clients.map((client) => (
            <div
              key={client.user_id}
              className="rounded-xl p-5 space-y-4 transition-all duration-200"
              style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2ec0f6")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
            >
              <div className="flex items-center gap-3">
                {client.logo ? (
                  <img src={client.logo} alt="" className="w-10 h-10 rounded-lg object-contain" />
                ) : (
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold" style={{ backgroundColor: "#f0f4f8", color: "#0d0446" }}>
                    {client.nome[0]}
                  </div>
                )}
                <div>
                  <p className="font-semibold" style={{ fontSize: "13px", color: "#0d0446" }}>{client.nome}</p>
                  <p style={{ fontSize: "10px", color: "#9ca3af" }}>{client.user_id.slice(0, 8)}...</p>
                </div>
              </div>

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
                      <span className="truncate mr-2" style={{ fontSize: "11px", fontWeight: 500, color: "#0d0446" }}>{mod.name.replace("Módulo ", "")}</span>
                      {isSaving ? (
                        <Loader2 className="animate-spin" size={14} style={{ color: "#2ec0f6" }} />
                      ) : (
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => toggleModule(client.user_id, mod.key, checked)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminUsers() {
  return (
    <ProtectedRoute requiredRole="admin">
      <AdminLayout title="Gestão de Clientes">
        <AdminUsersContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}
