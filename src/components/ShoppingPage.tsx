import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Plus, Package, Clock } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { toast } from "@/components/ui/use-toast";
import { compressImage } from "@/lib/imageCompressor";

import { getProgramas } from "./ProgramaForm";

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

export default function ShoppingPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const ownerId = effectiveUserId || user?.id;
  const [products, setProducts] = useState<ShoppingProduct[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shopActive, setShopActive] = useState(false);
  const formDisabled = true; // módulo em desenvolvimento

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [programId, setProgramId] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  const getLocalStorageKey = (uId: string) => `nexohub_shopping_${uId}`;

  useEffect(() => {
    if (!ownerId) return;
    loadData();
    // Load shopping_active setting
    supabase.from("user_settings").select("shopping_active").eq("user_id", ownerId).maybeSingle().then(({ data }) => {
      if (data && typeof (data as any).shopping_active === "boolean") setShopActive((data as any).shopping_active);
    });
  }, [ownerId]);

  const toggleShopActive = async () => {
    if (!ownerId) return;
    const newVal = !shopActive;
    setShopActive(newVal);
    await supabase.from("user_settings").upsert({ user_id: ownerId, shopping_active: newVal } as any, { onConflict: "user_id" });
    toast({ title: newVal ? "Vitrine ativada no Player" : "Vitrine desativada no Player" });
  };

  const loadData = async () => {
    if (!ownerId) return;
    setLoading(true);
    let prodList: ShoppingProduct[] = [];
    let progList: Programa[] = [];
    try {
      const [prodRes, progRes] = await Promise.all([
        supabase.from("shopping_products").select("*").eq("user_id", ownerId).order("created_at", { ascending: false }),
        supabase.from("programas").select("id, nome").eq("user_id", ownerId).eq("ativo", true).order("nome"),
      ]);
      if (prodRes.data && prodRes.data.length > 0) {
        prodList = prodRes.data as ShoppingProduct[];
        try { localStorage.setItem(getLocalStorageKey(ownerId), JSON.stringify(prodList)); } catch {}
      }
      if (progRes.data) progList = progRes.data as Programa[];
    } catch {}

    if (prodList.length === 0) {
      try {
        const raw = localStorage.getItem(getLocalStorageKey(ownerId));
        if (raw) prodList = JSON.parse(raw);
      } catch {}
    }
    setProducts(prodList);

    if (progList.length === 0) {
      try {
        const fallbackProgs = await getProgramas(ownerId, user?.email);
        if (fallbackProgs && fallbackProgs.length > 0) {
          progList = fallbackProgs.map((p: any) => ({ id: p.id, nome: p.nome }));
        }
      } catch {}
    }
    setProgramas(progList);
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

  if (loading) return <ModulePageSkeleton variant="form" />;

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid var(--layout-border-color, #333333)", color: "var(--layout-page-text, #1a1a1a)", borderRadius: "20px",
  };

  return (
    <div className="nexo-scope animate-fade-in w-full max-w-none mx-0">
      <div className="rounded-2xl" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 12%, var(--layout-page-bg, #ffffff) 88%)", boxShadow: "0 8px 32px rgba(0,0,0,0.10)", padding: "20px" }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
            <Package size={20} style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Shopping</h3>
            <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Gerencie produtos exibidos na vitrine do player</p>
          </div>
          <button
            onClick={toggleShopActive}
            disabled={formDisabled}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all disabled:opacity-60"
            style={{
              backgroundColor: shopActive ? "color-mix(in srgb, var(--layout-accent, #e1f532) 20%, transparent)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)",
              color: shopActive ? "var(--layout-accent, #e1f532)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)",
              border: `1px solid ${shopActive ? "color-mix(in srgb, var(--layout-accent, #e1f532) 40%, transparent)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)"}`,
            }}
          >
            <span className={`w-2 h-2 rounded-full ${shopActive ? "bg-green-500" : "bg-red-500"}`} />
            {shopActive ? "Ativo" : "Inativo"}
          </button>
        </div>

        {/* Form */}
        <div className="relative mb-5">
          <form onSubmit={handleSubmit} className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
              <h3 className="text-sm font-bold" style={{ color: "var(--layout-header-text, #ffffff)" }}>
                {editId ? "✏️ Editar Produto" : "➕ Novo Produto"}
              </h3>
            {editId && (
              <button type="button" onClick={resetForm}
                className="flex items-center gap-1 px-3 py-1 text-[10px] font-bold rounded-full transition-all"
                style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "var(--layout-header-text, #ffffff)", border: "1px solid rgba(255,255,255,0.3)" }}
              >
                Cancelar
              </button>
            )}
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nome do Produto</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  disabled={formDisabled}
                  className="w-full px-4 py-1.5 text-sm outline-none transition-colors disabled:opacity-50"
                  style={inputStyle} placeholder="Ex: Caneca Positiva FM" required
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Programa vinculado</label>
                <select value={programId} onChange={(e) => setProgramId(e.target.value)}
                  disabled={formDisabled}
                  className="w-full px-4 py-1.5 text-sm outline-none transition-colors appearance-none disabled:opacity-50"
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                >
                  <option value="">Nenhum (todos)</option>
                  {programas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Descrição do Produto</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  disabled={formDisabled}
                  className="w-full px-4 py-2 text-sm outline-none transition-colors min-h-[60px] disabled:opacity-50"
                  style={{ ...inputStyle, borderRadius: "12px" }} placeholder="Descrição do produto..."
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Preço (R$)</label>
                <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)}
                  disabled={formDisabled}
                  className="w-full px-4 py-1.5 text-sm outline-none transition-colors disabled:opacity-50" style={inputStyle} placeholder="29.90"
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Estoque</label>
                <input type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)}
                  disabled={formDisabled}
                  className="w-full px-4 py-1.5 text-sm outline-none transition-colors disabled:opacity-50" style={inputStyle} placeholder="100"
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Link de Pagamento (Mercado Pago)</label>
                <input value={paymentUrl} onChange={(e) => setPaymentUrl(e.target.value)}
                  disabled={formDisabled}
                  className="w-full px-4 py-1.5 text-sm outline-none transition-colors disabled:opacity-50" style={inputStyle} placeholder="https://mpago.la/..."
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Imagem do Produto</label>
              <input type="file" accept="image/*" onChange={handleImageChange} disabled={formDisabled} className="text-xs disabled:opacity-50" style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
              {imagePreview && (
                <img src={imagePreview} alt="Preview" className="mt-2 w-24 h-24 object-cover rounded-lg" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)" }} />
              )}
            </div>

            <Button variant="save" type="submit" disabled={formDisabled || saving}
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              {editId ? "Salvar Alterações" : "Cadastrar Produto"}
            </Button>
          </div>
          </form>

          {formDisabled && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 78%, transparent)", backdropFilter: "blur(2px)" }}>
              <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-2xl" style={{ backgroundColor: "var(--layout-header-bg, #1a1a1a)" }}>
                <Clock size={28} style={{ color: "var(--layout-accent, #e1f532)" }} />
                <span className="text-sm font-bold" style={{ color: "var(--layout-header-text, #ffffff)" }}>Em breve</span>
                <span className="text-[10px] text-center max-w-[200px]" style={{ color: "color-mix(in srgb, var(--layout-header-text, #ffffff) 70%, transparent)" }}>O módulo de shopping está em desenvolvimento.</span>
              </div>
            </div>
          )}
        </div>

        {/* List */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
            <h3 className="text-sm font-bold" style={{ color: "var(--layout-header-text, #ffffff)" }}>📋 Produtos Cadastrados</h3>
            <span className="text-[9px] font-normal px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "var(--layout-header-text, #ffffff)" }}>
              {products.length} item{products.length !== 1 ? "s" : ""}
            </span>
          </div>

          {products.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Nenhum produto cadastrado.</p>
          ) : (
            <div className="p-3 space-y-2">
              {products.map((p) => {
                const prog = programas.find((pr) => pr.id === p.program_id);
                return (
                  <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-xl p-3" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)" }}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-14 h-14 object-cover rounded-lg shrink-0" />
                      ) : (
                        <div className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(13,4,70,0.04)" }}>
                          <Package size={24} style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 20%, transparent)" }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate text-xs" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{p.name}</div>
                        <div className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                          R$ {Number(p.price).toFixed(2)} • Estoque: {p.stock}
                          {prog && <span className="hidden sm:inline"> • {prog.nome}</span>}
                        </div>
                        {p.description && <div className="text-[10px] truncate mt-0.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>{p.description}</div>}
                        {p.payment_url && <div className="text-[10px] mt-0.5" style={{ color: "var(--layout-accent-color, #2563eb)" }}>💳 Link configurado</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button onClick={() => toggleActive(p.id, p.active)}
                        disabled={formDisabled}
                        className="text-[10px] px-3 py-1 rounded-full font-bold disabled:opacity-50"
                        style={p.active
                          ? { backgroundColor: "rgba(34,197,94,0.1)", color: "#22c55e" }
                          : { backgroundColor: "rgba(220,38,38,0.1)", color: "#dc2626" }
                        }
                      >
                        {p.active ? "Ativo" : "Inativo"}
                      </button>
                      <button onClick={() => startEdit(p)} disabled={formDisabled} className="p-1.5 rounded-lg transition-colors disabled:opacity-50" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(p.id)} disabled={formDisabled} className="p-1.5 rounded-lg transition-colors disabled:opacity-50" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
