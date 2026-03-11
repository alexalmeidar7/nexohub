import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Users, Puzzle, Radio, ClipboardList } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminLayout from "./AdminLayout";
import AdminSkeleton from "@/components/skeletons/AdminSkeleton";
import { usePageTitle } from "@/hooks/usePageTitle";

interface ClientInfo {
  user_id: string;
  nome: string;
  logo: string;
  plano: string;
}

function AdminDashboardContent() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [stats, setStats] = useState({ totalClients: 0, totalModules: 0, totalChannels: 0, totalPlans: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [{ data: empresas }, { data: modules }, { data: channels }, { data: planos }] = await Promise.all([
      supabase.from("empresa_config").select("user_id, nome, logo, plano"),
      supabase.from("client_modules").select("id"),
      supabase.from("streaming_channels").select("id"),
      supabase.from("planos").select("id"),
    ]);

    setClients((empresas || []).map((e: any) => ({ user_id: e.user_id, nome: e.nome || "Sem nome", logo: e.logo || "", plano: e.plano || "" })));
    setStats({
      totalClients: (empresas || []).length,
      totalModules: (modules || []).length,
      totalChannels: (channels || []).length,
      totalPlans: (planos || []).length,
    });
    setLoading(false);
  };

  if (loading) {
    return <AdminSkeleton variant="dashboard" />;
  }

  const statCards = [
    { icon: Users, value: stats.totalClients, label: "Clientes Cadastrados", color: "#2ec0f6" },
    { icon: ClipboardList, value: stats.totalPlans, label: "Planos Cadastrados", color: "#f59e0b" },
    { icon: Puzzle, value: stats.totalModules, label: "Módulos Ativos", color: "#22c55e" },
    { icon: Radio, value: stats.totalChannels, label: "Canais de Streaming", color: "#a855f7" },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl p-6 flex items-center gap-4 transition-all duration-200"
              style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2ec0f6")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${card.color}15` }}
              >
                <Icon size={22} style={{ color: card.color }} />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: "#0d0446" }}>{card.value}</p>
                <p style={{ fontSize: "11px", color: "#6b7280" }}>{card.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        {[
          { label: "Gerenciar Clientes", icon: Users, path: "/admin/users" },
          { label: "Catálogo de Módulos", icon: Puzzle, path: "/admin/modules" },
        ].map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className="flex items-center gap-2 px-5 py-2 font-medium transition-all duration-200"
              style={{
                fontSize: "12px",
                color: "#0d0446",
                border: "2px solid #0d0446",
                borderRadius: "20px",
                backgroundColor: "transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#0d0446";
                e.currentTarget.style.color = "#ffffff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "#0d0446";
              }}
            >
              <Icon size={14} /> {action.label}
            </button>
          );
        })}
      </div>

      {/* Client List */}
      <div>
        <h3 className="text-lg font-semibold mb-4" style={{ color: "#0d0446" }}>Clientes Ativos</h3>
        {clients.length === 0 ? (
          <p style={{ fontSize: "12px", color: "#6b7280" }}>Nenhum cliente cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {clients.map((client) => (
              <div
                key={client.user_id}
                className="flex items-center justify-between rounded-xl px-5 py-3 transition-all duration-200"
                style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2ec0f6")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
              >
                <div className="flex items-center gap-3">
                  {client.logo ? (
                    <img src={client.logo} alt="" className="w-8 h-8 rounded-lg object-contain" />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: "#f0f4f8", color: "#0d0446" }}
                    >
                      {client.nome[0]}
                    </div>
                  )}
                  <span className="font-medium" style={{ fontSize: "12px", color: "#0d0446" }}>{client.nome}</span>
                  {client.plano && (
                    <span className="px-2 py-0.5 rounded-full" style={{ fontSize: "9px", backgroundColor: "#e0f2fe", color: "#0284c7", fontWeight: 600 }}>
                      {client.plano}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => navigate(`/admin/users?client=${client.user_id}`)}
                  className="transition-colors duration-200"
                  style={{ fontSize: "12px", color: "#0d0446" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#2ec0f6")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#0d0446")}
                >
                  Ver Dashboard →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  usePageTitle("Admin Dashboard");
  return (
    <ProtectedRoute requiredRole="admin">
      <AdminLayout title="Dashboard Administrativo">
        <AdminDashboardContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}
