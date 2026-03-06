import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, Pencil, Trash2, Check, X, ImageIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminLayout from "./AdminLayout";
import AdminSkeleton from "@/components/skeletons/AdminSkeleton";
import { compressImage } from "@/lib/imageCompressor";

interface Plan {
  id: string;
  name: string;
  image_url: string;
  enabled_modules: string[];
  price: number;
  created_at: string;
}

interface AvailableModule {
  key: string;
  name: string;
}

function AdminPlansContent() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [modules, setModules] = useState<AvailableModule[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [{ data: plansData }, { data: modsData }] = await Promise.all([
      supabase.from("planos").select("*").order("created_at", { ascending: false }),
      supabase.from("available_modules").select("key, name"),
    ]);
    setPlans((plansData as Plan[]) || []);
    setModules(modsData || []);
    setLoading(false);
  };

  const openNew = () => {
    setEditingPlan(null);
    setName("");
    setPrice("");
    setEnabledModules([]);
    setImageFile(null);
    setImagePreview("");
    setDialogOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setName(plan.name);
    setPrice(String(plan.price || 0));
    setEnabledModules(plan.enabled_modules || []);
    setImageFile(null);
    setImagePreview(plan.image_url || "");
    setDialogOpen(true);
  };

  const toggleModule = (key: string) => {
    setEnabledModules((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 800, 800, 0.8);
      setImageFile(compressed);
      setImagePreview(URL.createObjectURL(compressed));
    } catch {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Digite o nome do plano", variant: "destructive" });
      return;
    }
    setSaving(true);

    let imageUrl = editingPlan?.image_url || "";

    if (imageFile) {
      const ext = imageFile.name.split(".").pop();
      const path = `planos/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("empresa-assets")
        .upload(path, imageFile, { upsert: true });
      if (uploadErr) {
        toast({ title: "Erro ao enviar imagem", description: uploadErr.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
      imageUrl = urlData.publicUrl;
    }

    const payload = { name: name.trim(), enabled_modules: enabledModules, image_url: imageUrl };

    if (editingPlan) {
      const { error } = await supabase.from("planos").update(payload).eq("id", editingPlan.id);
      if (error) {
        toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Plano atualizado!" });
      }
    } else {
      const { error } = await supabase.from("planos").insert(payload);
      if (error) {
        toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Plano criado!" });
      }
    }

    setSaving(false);
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("planos").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Plano excluído!" });
      loadData();
    }
  };

  if (loading) return <AdminSkeleton variant="list" />;

  const inputStyle: React.CSSProperties = {
    fontSize: "12px", color: "#0d0446", border: "2px solid #0d379a",
    borderRadius: "20px", backgroundColor: "#fff", padding: "8px 16px",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p style={{ fontSize: "12px", color: "#6b7280" }}>Gerencie os planos disponíveis para os clientes.</p>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-5 py-2 font-medium transition-all duration-200"
          style={{ fontSize: "12px", backgroundColor: "#2ec0f6", color: "#ffffff", border: "2px solid #2ec0f6", borderRadius: "20px" }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#2ec0f6"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#2ec0f6"; e.currentTarget.style.color = "#ffffff"; }}
        >
          <Plus size={14} /> Novo Plano
        </button>
      </div>

      {plans.length === 0 ? (
        <p style={{ fontSize: "12px", color: "#6b7280" }}>Nenhum plano cadastrado.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="rounded-xl overflow-hidden transition-all duration-200"
              style={{ border: "1px solid #e2e8f0", backgroundColor: "#ffffff" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2ec0f6")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
            >
              {plan.image_url ? (
                <img src={plan.image_url} alt={plan.name} className="w-full h-36 object-cover" />
              ) : (
                <div className="w-full h-36 flex items-center justify-center" style={{ backgroundColor: "#f0f4f8" }}>
                  <ImageIcon size={32} style={{ color: "#c4cdd5" }} />
                </div>
              )}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold" style={{ fontSize: "14px", color: "#0d0446" }}>{plan.name}</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(plan)} className="p-1.5 rounded-full transition-colors hover:bg-gray-100">
                      <Pencil size={13} style={{ color: "#0d0446" }} />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="p-1.5 rounded-full transition-colors hover:bg-red-50">
                          <Trash2 size={13} style={{ color: "#ef4444" }} />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent style={{ backgroundColor: "#fff", borderRadius: "20px" }}>
                        <AlertDialogHeader>
                          <AlertDialogTitle style={{ color: "#0d0446", fontSize: "14px" }}>Excluir plano?</AlertDialogTitle>
                          <AlertDialogDescription style={{ fontSize: "12px" }}>
                            Essa ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel style={{ borderRadius: "20px", fontSize: "12px" }}>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(plan.id)}
                            style={{ borderRadius: "20px", fontSize: "12px", backgroundColor: "#ef4444" }}
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(plan.enabled_modules || []).length > 0 ? (
                    (plan.enabled_modules || []).map((mk) => {
                      const mod = modules.find((m) => m.key === mk);
                      return (
                        <span
                          key={mk}
                          className="px-2 py-0.5 rounded-full"
                          style={{ fontSize: "9px", fontWeight: 600, backgroundColor: "rgba(46,192,246,0.1)", color: "#0284c7" }}
                        >
                          {mod?.name?.replace("Módulo ", "") || mk}
                        </span>
                      );
                    })
                  ) : (
                    <span style={{ fontSize: "10px", color: "#9ca3af" }}>Nenhum módulo</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog for create/edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent style={{ backgroundColor: "#ffffff", borderRadius: "20px", border: "1px solid #e2e8f0", maxWidth: "480px" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#0d0446", fontSize: "14px" }}>
              {editingPlan ? "Editar Plano" : "Novo Plano"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <input
              placeholder="Nome do plano"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full outline-none"
              style={inputStyle}
            />

            {/* Image */}
            <div className="space-y-2">
              <label style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600 }}>Imagem de capa</label>
              {imagePreview && (
                <img src={imagePreview} alt="Preview" className="w-full h-32 object-cover rounded-xl" />
              )}
              <input type="file" accept="image/*" onChange={handleImageChange} className="text-xs" />
            </div>

            {/* Modules */}
            <div className="space-y-2">
              <label style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600 }}>Módulos incluídos</label>
              <div className="grid grid-cols-2 gap-2">
                {modules.map((mod) => (
                  <div
                    key={mod.key}
                    className="flex items-center justify-between p-2.5 rounded-lg"
                    style={{
                      border: enabledModules.includes(mod.key) ? "1px solid rgba(46,192,246,0.3)" : "1px solid #e2e8f0",
                      backgroundColor: enabledModules.includes(mod.key) ? "rgba(46,192,246,0.05)" : "#fff",
                    }}
                  >
                    <span className="truncate mr-2" style={{ fontSize: "11px", fontWeight: 500, color: "#0d0446" }}>
                      {mod.name.replace("Módulo ", "")}
                    </span>
                    <Switch
                      checked={enabledModules.includes(mod.key)}
                      onCheckedChange={() => toggleModule(mod.key)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-2.5 font-medium transition-all duration-200 disabled:opacity-50"
              style={{ fontSize: "12px", backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "2px solid #0d0446" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#0d0446"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
            >
              {saving ? <Loader2 className="animate-spin" size={14} style={{ color: "#2ec0f6" }} /> : null}
              {editingPlan ? "Salvar Alterações" : "Criar Plano"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminPlans() {
  return (
    <ProtectedRoute requiredRole="admin">
      <AdminLayout title="Cadastro de Planos">
        <AdminPlansContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}
