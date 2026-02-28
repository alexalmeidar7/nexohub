import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminLayout from "./AdminLayout";

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
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={18} />
        <span>Carregando...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <p className="text-sm text-muted-foreground">Catálogo de módulos disponíveis no MasterView.</p>

      <div className="space-y-3">
        {modules.map((mod) => (
          <div key={mod.id} className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
              {mod.key.slice(0, 2).toUpperCase()}
            </div>

            {editingId === mod.id ? (
              <div className="flex-1 flex items-center gap-3">
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="max-w-xs" />
                <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="flex-1" placeholder="Descrição" />
                <Button size="sm" onClick={saveEdit} className="gap-1"><Save size={14} /> Salvar</Button>
                <Button size="sm" variant="ghost" onClick={cancelEdit}><X size={14} /></Button>
              </div>
            ) : (
              <>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{mod.name}</p>
                  <p className="text-xs text-muted-foreground">{mod.description}</p>
                </div>
                <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">{mod.key}</span>
                <Button size="sm" variant="ghost" onClick={() => startEdit(mod)}><Pencil size={14} /></Button>
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
