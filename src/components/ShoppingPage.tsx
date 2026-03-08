import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Plus, Package } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { toast } from "@/components/ui/use-toast";
import { compressImage } from "@/lib/imageCompressor";

interface ShoppingProduct {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  stock: number;
  program_id: string | null;
  payment_url: string | null;
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

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [programId, setProgramId] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
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
    const compressed = await compressImage(file);
    const ext = compressed.name.split(".").pop();
    const path = `${user!.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("shopping").upload(path, compressed);
    if (error) throw error;
    const { data } = supabase.storage.from("shopping").getPublicUrl(path);
    return data.publicUrl;
  };

  const resetForm = () => {
    setName(""); setDescription(""); setPrice(""); setStock("");
    setProgramId(""); setPaymentUrl(""); setImageFile(null); setImagePreview(""); setEditId(null);
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
          name: name.trim(), description: description.trim(),
          price: parseFloat(price) || 0, stock: parseInt(stock) || 0,
          program_id: programId || null, payment_url: paymentUrl.trim() || null,
        };
        if (imageUrl) update.image_url = imageUrl;
        await supabase.from("shopping_products").update(update).eq("id", editId);
        toast({ title: "Produto atualizado!" });
      } else {
        await supabase.from("shopping_products").insert({
          user_id: user.id, name: name.trim(), description: description.trim(),
          image_url: imageUrl, price: parseFloat(price) || 0, stock: parseInt(stock) || 0,
          program_id: programId || null, payment_url: paymentUrl.trim() || null,
        });
        toast({ title: "Produto cadastrado!" });
      }
      resetForm(); loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const startEdit = (p: ShoppingProduct) => {
    setEditId(p.id); setName(p.name); setDescription(p.description || "");
    setPrice(String(p.price)); setStock(String(p.stock));
    setProgramId(p.program_id || ""); setPaymentUrl(p.payment_url || "");
    setImagePreview(p.image_url || ""); setImageFile(null);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("shopping_products").delete().eq("id", id);
    toast({ title: "Produto removido" }); loadData();
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("shopping_products").update({ active: !active }).eq("id", id);
    loadData();
  };

  if (loading) return <ModulePageSkeleton />;

  const inputStyle: React.CSSProperties = {
    backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px",
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <form onSubmit={handleSubmit} className="rounded-xl p-4 sm:p-6 space-y-4" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.1)" }}>
        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: "#0d0446" }}>
          <Package size={20} />
          {editId ? "Editar Produto" : "Novo Produto"}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1" style={{ color: "#0d0446" }}>Nome do Produto</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-1.5 text-sm outline-none transition-colors"
              style={inputStyle} placeholder="Ex: Caneca Positiva FM" required
              onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1" style={{ color: "#0d0446" }}>Programa vinculado</label>
            <select value={programId} onChange={(e) => setProgramId(e.target.value)}
              className="w-full px-4 py-1.5 text-sm outline-none transition-colors appearance-none"
              style={inputStyle}
              onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
            >
              <option value="">Nenhum (todos)</option>
              {programas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium block mb-1" style={{ color: "#0d0446" }}>Descrição do Produto</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 text-sm outline-none transition-colors min-h-[60px]"
              style={{ ...inputStyle, borderRadius: "12px" }} placeholder="Descrição do produto..."
              onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1" style={{ color: "#0d0446" }}>Preço (R$)</label>
            <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)}
              className="w-full px-4 py-1.5 text-sm outline-none transition-colors" style={inputStyle} placeholder="29.90"
              onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1" style={{ color: "#0d0446" }}>Estoque</label>
            <input type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)}
              className="w-full px-4 py-1.5 text-sm outline-none transition-colors" style={inputStyle} placeholder="100"
              onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium block mb-1" style={{ color: "#0d0446" }}>Link de Pagamento (Mercado Pago)</label>
            <input value={paymentUrl} onChange={(e) => setPaymentUrl(e.target.value)}
              className="w-full px-4 py-1.5 text-sm outline-none transition-colors" style={inputStyle} placeholder="https://mpago.la/..."
              onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1" style={{ color: "#0d0446" }}>Imagem do Produto</label>
          <input type="file" accept="image/*" onChange={handleImageChange} className="text-sm" style={{ color: "#0d0446" }} />
          {imagePreview && (
            <img src={imagePreview} alt="Preview" className="mt-2 w-24 h-24 object-cover rounded-lg" style={{ border: "1px solid rgba(13,4,70,0.1)" }} />
          )}
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving}
            className="px-6 py-2 font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "2px solid #0d0446" }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "#0d0446"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
            {editId ? "Salvar Alterações" : "Cadastrar Produto"}
          </button>
          {editId && (
            <button type="button" onClick={resetForm}
              className="px-4 py-2 text-sm transition-colors"
              style={{ borderRadius: "20px", border: "1px solid #0d0446", color: "#0d0446" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(13,4,70,0.05)"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="space-y-3">
        <h3 className="text-lg font-bold" style={{ color: "#0d0446" }}>Produtos Cadastrados ({products.length})</h3>
        {products.length === 0 && <p className="text-sm" style={{ color: "rgba(13,4,70,0.5)" }}>Nenhum produto cadastrado.</p>}
        {products.map((p) => {
          const prog = programas.find((pr) => pr.id === p.program_id);
          return (
            <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-xl p-3 sm:p-4" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.1)" }}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-lg shrink-0" />
                ) : (
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(13,4,70,0.04)" }}>
                    <Package size={24} style={{ color: "rgba(13,4,70,0.2)" }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate text-sm" style={{ color: "#0d0446" }}>{p.name}</div>
                  <div className="text-xs sm:text-sm" style={{ color: "rgba(13,4,70,0.5)" }}>
                    R$ {Number(p.price).toFixed(2)} • Estoque: {p.stock}
                    {prog && <span className="hidden sm:inline"> • {prog.nome}</span>}
                  </div>
                  {p.description && <div className="text-xs truncate mt-0.5" style={{ color: "rgba(13,4,70,0.4)" }}>{p.description}</div>}
                  {p.payment_url && <div className="text-xs mt-0.5" style={{ color: "#2dbef3" }}>💳 Link configurado</div>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button onClick={() => toggleActive(p.id, p.active)}
                  className="text-xs px-3 py-1 rounded-full font-bold"
                  style={p.active
                    ? { backgroundColor: "rgba(45,190,243,0.1)", color: "#2dbef3" }
                    : { backgroundColor: "rgba(220,38,38,0.1)", color: "#dc2626" }
                  }
                >
                  {p.active ? "Ativo" : "Inativo"}
                </button>
                <button onClick={() => startEdit(p)} className="p-2 rounded-lg transition-colors"
                  style={{ color: "rgba(13,4,70,0.4)" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#2dbef3"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "rgba(13,4,70,0.4)"; }}
                >
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(p.id)} className="p-2 rounded-lg transition-colors"
                  style={{ color: "rgba(13,4,70,0.4)" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#dc2626"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "rgba(13,4,70,0.4)"; }}
                >
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
