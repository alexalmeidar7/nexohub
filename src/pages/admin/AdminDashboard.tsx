import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Users, Puzzle, Radio, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminLayout from "./AdminLayout";

interface ClientInfo {
  user_id: string;
  nome: string;
  logo: string;
}

function AdminDashboardContent() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [stats, setStats] = useState({ totalClients: 0, totalModules: 0, totalChannels: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [{ data: empresas }, { data: modules }, { data: channels }] = await Promise.all([
      supabase.from("empresa_config").select("user_id, nome, logo"),
      supabase.from("client_modules").select("id"),
      supabase.from("streaming_channels").select("id"),
    ]);

    setClients((empresas || []).map((e: any) => ({ user_id: e.user_id, nome: e.nome || "Sem nome", logo: e.logo || "" })));
    setStats({
      totalClients: (empresas || []).length,
      totalModules: (modules || []).length,
      totalChannels: (channels || []).length,
    });
    setLoading(false);
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
    <div className="space-y-8 animate-fade-in">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
            <Users size={22} className="text-blue-500" />
          </div>
          <div>
            <p className="text-2xl font-bold">{stats.totalClients}</p>
            <p className="text-xs text-muted-foreground">Clientes Cadastrados</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
            <Puzzle size={22} className="text-green-500" />
          </div>
          <div>
            <p className="text-2xl font-bold">{stats.totalModules}</p>
            <p className="text-xs text-muted-foreground">Módulos Ativos</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
            <Radio size={22} className="text-purple-500" />
          </div>
          <div>
            <p className="text-2xl font-bold">{stats.totalChannels}</p>
            <p className="text-xs text-muted-foreground">Canais de Streaming</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Button onClick={() => navigate("/admin/users")} variant="outline" className="gap-2">
          <Users size={16} /> Gerenciar Clientes
        </Button>
        <Button onClick={() => navigate("/admin/modules")} variant="outline" className="gap-2">
          <Puzzle size={16} /> Catálogo de Módulos
        </Button>
      </div>

      {/* Client List */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Clientes Ativos</h3>
        {clients.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum cliente cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {clients.map((client) => (
              <div
                key={client.user_id}
                className="flex items-center justify-between bg-card border border-border rounded-xl px-5 py-3 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {client.logo ? (
                    <img src={client.logo} alt="" className="w-8 h-8 rounded-lg object-contain" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                      {client.nome[0]}
                    </div>
                  )}
                  <span className="font-medium text-sm">{client.nome}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => navigate(`/admin/users?client=${client.user_id}`)}
                >
                  Ver Dashboard →
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <ProtectedRoute requiredRole="admin">
      <AdminLayout title="Dashboard Administrativo">
        <AdminDashboardContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}
