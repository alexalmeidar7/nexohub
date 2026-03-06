import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminLayout from "./AdminLayout";
import ClientCard from "@/components/admin/ClientCard";

interface ClientRow {
  user_id: string;
  nome: string;
  logo: string;
  ativo: boolean;
  plano: string;
  modules: Record<string, boolean>;
  updated_at: string;
}

interface AvailableModule {
  key: string;
  name: string;
  icon: string;
}

function AdminUsersContent() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [emailMap, setEmailMap] = useState<Record<string, string>>({});
  const [modules, setModules] = useState<AvailableModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const [showNewUser, setShowNewUser] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newNome, setNewNome] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [{ data: empresas }, { data: mods }, { data: clientMods }, emailsRes] = await Promise.all([
      supabase.from("empresa_config").select("user_id, nome, logo, ativo, plano, updated_at"),
      supabase.from("available_modules").select("key, name, icon"),
      supabase.from("client_modules").select("user_id, module_key, enabled"),
      supabase.functions.invoke("create-user", { body: { action: "list_emails" } }),
    ]);

    if (emailsRes.data?.emails) {
      setEmailMap(emailsRes.data.emails);
    }

    const moduleList = mods || [];
    setModules(moduleList);

    const clientList = (empresas || []).map((e: any) => {
      const moduleMap: Record<string, boolean> = {};
      moduleList.forEach((m: any) => {
        const assignment = (clientMods || []).find((cm: any) => cm.user_id === e.user_id && cm.module_key === m.key);
        moduleMap[m.key] = assignment ? assignment.enabled : false;
      });
      return {
        user_id: e.user_id,
        nome: e.nome || "Sem nome",
        logo: e.logo || "",
        ativo: e.ativo ?? true,
        plano: e.plano || "basic",
        modules: moduleMap,
        updated_at: e.updated_at || "",
      };
    });

    clientList.sort((a: ClientRow, b: ClientRow) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
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
        prev.map((c) => c.user_id === userId ? { ...c, modules: { ...c.modules, [moduleKey]: enabled } } : c)
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
    try {
      const res = await supabase.functions.invoke("create-user", {
        body: { action: "create", email: newEmail, password: newPassword, nome: newNome },
      });
      if (res.error || res.data?.error) {
        toast({ title: "Erro ao criar usuário", description: res.data?.error || res.error?.message, variant: "destructive" });
      } else {
        toast({ title: "Usuário criado com sucesso!" });
        setNewEmail(""); setNewPassword(""); setNewNome("");
        setShowNewUser(false);
        loadData();
      }
    } catch (err: any) {
      toast({ title: "Erro ao criar usuário", description: err.message, variant: "destructive" });
    }
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
    fontSize: "12px", color: "#0d0446", border: "2px solid #0d379a",
    borderRadius: "20px", backgroundColor: "#fff", padding: "8px 16px",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p style={{ fontSize: "12px", color: "#6b7280" }}>Gerencie os módulos habilitados para cada cliente.</p>
        <Dialog open={showNewUser} onOpenChange={setShowNewUser}>
          <DialogTrigger asChild>
            <button
              className="flex items-center gap-2 px-5 py-2 font-medium transition-all duration-200"
              style={{ fontSize: "12px", backgroundColor: "#2ec0f6", color: "#ffffff", border: "2px solid #2ec0f6", borderRadius: "20px" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#2ec0f6"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#2ec0f6"; e.currentTarget.style.color = "#ffffff"; }}
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
            <ClientCard
              key={client.user_id}
              client={client}
              modules={modules}
              saving={saving}
              onToggleModule={toggleModule}
              onClientUpdated={loadData}
            />
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
