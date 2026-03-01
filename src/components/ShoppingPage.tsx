import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Plus, Package } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface ShoppingProduct {
  id: string;
  name: string;
  image_url: string | null;
  price: number;
  stock: number;
  program_id: string | null;
  active: boolean;
  created_at: string;
}

interface Programa {
  id: string;
  nome: string;
}

export default function ShoppingPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<ShoppingProduct[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [programId, setProgramId] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const [prodRes, progRes] = await Promise.all([
      supabase.from("shopping_products").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("programas").select("id, nome").eq("user_id", user.id).eq("ativo", true).order("nome"),
    ]);
    if (prodRes.data) setProducts(prodRes.data as ShoppingProduct[]);
    if (progRes.data) setProgramas(progRes.data as Programa[]);
    setLoading(false);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const uploadImage = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop();
    const path = `${user!.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("shopping").upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("shopping").getPublicUrl(path);
    return data.publicUrl;
  };

  const resetForm = () => {
    setName("");
    setPrice("");
    setStock("");
    setProgramId("");
    setImageFile(null);
    setImagePreview("");
    setEditId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setSaving(true);
    try {
      let imageUrl = "";
      if (imageFile) imageUrl = await uploadImage(imageFile);

      if (editId) {
        const update: any = {
          name: name.trim(),
          price: parseFloat(price) || 0,
          stock: parseInt(stock) || 0,
          program_id: programId || null,
        };
        if (imageUrl) update.image_url = imageUrl;
        await supabase.from("shopping_products").update(update).eq("id", editId);
        toast({ title: "Produto atualizado!" });
      } else {
        await supabase.from("shopping_products").insert({
          user_id: user.id,
          name: name.trim(),
          image_url: imageUrl,
          price: parseFloat(price) || 0,
          stock: parseInt(stock) || 0,
          program_id: programId || null,
        });
        toast({ title: "Produto cadastrado!" });
      }
      resetForm();
      loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const startEdit = (p: ShoppingProduct) => {
    setEditId(p.id);
    setName(p.name);
    setPrice(String(p.price));
    setStock(String(p.stock));
    setProgramId(p.program_id || "");
    setImagePreview(p.image_url || "");
    setImageFile(null);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("shopping_products").delete().eq("id", id);
    toast({ title: "Produto removido" });
    loadData();
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("shopping_products").update({ active: !active }).eq("id", id);
    loadData();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={32} /></div>;

  return (
    <div className="space-y-8 max-w-4xl">
      <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Package size={20} />
          {editId ? "Editar Produto" : "Novo Produto"}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1">Nome do Produto</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm"
              placeholder="Ex: Caneca Positiva FM"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Programa vinculado</label>
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm"
            >
              <option value="">Nenhum (todos)</option>
              {programas.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Preço (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm"
              placeholder="29.90"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Estoque</label>
            <input
              type="number"
              min="0"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm"
              placeholder="100"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Imagem do Produto</label>
          <input type="file" accept="image/*" onChange={handleImageChange} className="text-sm" />
          {imagePreview && (
            <img src={imagePreview} alt="Preview" className="mt-2 w-24 h-24 object-cover rounded-lg border border-white/20" />
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#d30707] text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-[#b00606] transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
            {editId ? "Salvar Alterações" : "Cadastrar Produto"}
          </button>
          {editId && (
            <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg text-sm border border-white/20 hover:bg-white/5">
              Cancelar
            </button>
          )}
        </div>
      </form>

      {/* Product list */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold">Produtos Cadastrados ({products.length})</h3>
        {products.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto cadastrado.</p>}
        {products.map((p) => {
          const prog = programas.find((pr) => pr.id === p.program_id);
          return (
            <div key={p.id} className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-4">
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="w-16 h-16 object-cover rounded-lg" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-white/10 flex items-center justify-center">
                  <Package size={24} className="text-white/30" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{p.name}</div>
                <div className="text-sm text-muted-foreground">
                  R$ {Number(p.price).toFixed(2)} • Estoque: {p.stock}
                  {prog && <span> • {prog.nome}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleActive(p.id, p.active)}
                  className={`text-xs px-3 py-1 rounded-full font-bold ${p.active ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}
                >
                  {p.active ? "Ativo" : "Inativo"}
                </button>
                <button onClick={() => startEdit(p)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(p.id)} className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
