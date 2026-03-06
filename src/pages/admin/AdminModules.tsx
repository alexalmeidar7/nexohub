import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminLayout from "./AdminLayout";
import AdminSkeleton from "@/components/skeletons/AdminSkeleton";

interface ModuleRow {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
}

function AdminModulesContent() {
  const { toast } = useToast();
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    const { data } = await supabase.from("available_modules").select("*").order("created_at");
    setModules((data || []) as ModuleRow[]);
    setLoading(false);
  };

  const startEdit = (mod: ModuleRow) => {
    setEditingId(mod.id);
    setEditName(mod.name);
    setEditDescription(mod.description);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase
      .from("available_modules")
      .update({ name: editName, description: editDescription })
      .eq("id", editingId);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Módulo atualizado!" });
      await loadModules();
    }
    cancelEdit();
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
    outline: "none",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <p style={{ fontSize: "12px", color: "#6b7280" }}>Catálogo de módulos disponíveis no MasterView.</p>

      <div className="space-y-3">
        {modules.map((mod) => (
          <div
            key={mod.id}
            className="rounded-xl p-5 flex items-center gap-4 transition-all duration-200"
            style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2ec0f6")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center font-bold"
              style={{ backgroundColor: "rgba(46,192,246,0.1)", color: "#2ec0f6", fontSize: "12px" }}
            >
              {mod.key.slice(0, 2).toUpperCase()}
            </div>

            {editingId === mod.id ? (
              <div className="flex-1 flex items-center gap-3">
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="max-w-xs w-full" style={inputStyle} />
                <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="flex-1" placeholder="Descrição" style={inputStyle} />
                <button
                  onClick={saveEdit}
                  className="flex items-center gap-1 px-4 py-2 font-medium transition-all duration-200"
                  style={{ fontSize: "12px", backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "2px solid #0d0446" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#0d0446"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
                >
                  <Save size={14} /> Salvar
                </button>
                <button
                  onClick={cancelEdit}
                  className="p-2 rounded-full transition-colors"
                  style={{ color: "#6b7280" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#6b7280")}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1">
                  <p className="font-semibold" style={{ fontSize: "13px", color: "#0d0446" }}>{mod.name}</p>
                  <p style={{ fontSize: "11px", color: "#6b7280" }}>{mod.description}</p>
                </div>
                <span className="font-mono px-2 py-1 rounded" style={{ fontSize: "10px", color: "#0d0446", backgroundColor: "#f0f4f8" }}>{mod.key}</span>
                <button
                  onClick={() => startEdit(mod)}
                  className="p-2 rounded-full transition-colors"
                  style={{ color: "#0d0446" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#2ec0f6")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#0d0446")}
                >
                  <Pencil size={14} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminModules() {
  return (
    <ProtectedRoute requiredRole="admin">
      <AdminLayout title="Catálogo de Módulos">
        <AdminModulesContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}
