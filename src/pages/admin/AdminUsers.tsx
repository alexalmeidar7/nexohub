import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Check, X, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  // New user form
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

    // We can't create users from client side without admin API.
    // For now, we just show a message that user creation requires backend setup
    toast({
      title: "Funcionalidade em desenvolvimento",
      description: "A criação de novos usuários requer configuração adicional do backend.",
    });
    setCreating(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={18} />
        <span>Carregando...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Gerencie os módulos habilitados para cada cliente.</p>
        <Dialog open={showNewUser} onOpenChange={setShowNewUser}>
          <DialogTrigger asChild>
            <Button className="gap-2"><UserPlus size={16} /> Novo Usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input placeholder="Nome da empresa" value={newNome} onChange={(e) => setNewNome(e.target.value)} />
              <Input type="email" placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              <Input type="password" placeholder="Senha" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <Button onClick={handleCreateUser} disabled={creating} className="w-full">
                {creating ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
                Criar Usuário
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {clients.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum cliente cadastrado.</p>
      ) : (
        <div className="space-y-4">
          {clients.map((client) => (
            <div key={client.user_id} className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                {client.logo ? (
                  <img src={client.logo} alt="" className="w-10 h-10 rounded-lg object-contain" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                    {client.nome[0]}
                  </div>
                )}
                <div>
                  <p className="font-semibold">{client.nome}</p>
                  <p className="text-xs text-muted-foreground">{client.user_id.slice(0, 8)}...</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {modules.map((mod) => {
                  const isEnabled = client.modules[mod.key] || false;
                  const isSaving = saving === `${client.user_id}-${mod.key}`;
                  return (
                    <div
                      key={mod.key}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        isEnabled ? "border-green-500/30 bg-green-500/5" : "border-border"
                      }`}
                    >
                      <span className="text-xs font-medium truncate mr-2">{mod.name.replace("Módulo ", "")}</span>
                      {isSaving ? (
                        <Loader2 className="animate-spin" size={14} />
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
