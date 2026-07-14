import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Plus, Image as ImageIcon, Link as LinkIcon, MapPin, Calendar as CalendarLucide, CalendarIcon } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { compressImage } from "@/lib/imageCompressor";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

interface Banner {
  id: string;
  nome: string;
  image_url: string;
  link_url: string | null;
  posicao: string;
  data_inicial: string | null;
  data_final: string | null;
  ativo: boolean;
  created_at: string;
}

const POSICOES = [
  { value: "topo", label: "Topo" },
  { value: "lateral", label: "Lateral" },
  { value: "rodape", label: "Rodapé" },
];

export default function AdsSitePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [posicao, setPosicao] = useState("topo");
  const [linkUrl, setLinkUrl] = useState("");
  const [dataInicial, setDataInicial] = useState<Date | undefined>(new Date());
  const [dataFinal, setDataFinal] = useState<Date | undefined>(undefined);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const imgRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("site_banners")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data as any) || []);
    setLoading(false);
  }

  function resetForm() {
    setEditId(null);
    setNome("");
    setAtivo(true);
    setPosicao("topo");
    setLinkUrl("");
    setDataInicial(new Date());
    setDataFinal(undefined);
    setImageFile(null);
    setImagePreview("");
    if (imgRef.current) imgRef.current.value = "";
  }

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  }

  async function uploadImage(): Promise<string | null> {
    if (!imageFile || !user) return null;
    const compressed = await compressImage(imageFile, 1600, 1600, 0.85);
    const path = `${user.id}/banners/${Date.now()}-${(imageFile.name || "banner").replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await supabase.storage.from("comercial").upload(path, compressed, { upsert: true, contentType: compressed.type });
    if (error) {
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
      return null;
    }
    const { data } = supabase.storage.from("comercial").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!nome.trim()) return toast({ title: "Informe o nome do banner", variant: "destructive" });
    if (!editId && !imageFile) return toast({ title: "Selecione uma imagem", variant: "destructive" });
    setSaving(true);
    try {
      let image_url: string | null = null;
      if (imageFile) image_url = await uploadImage();

      const payload: any = {
        user_id: user.id,
        nome: nome.trim(),
        link_url: linkUrl.trim() || null,
        posicao,
        data_inicial: dataInicial ? format(dataInicial, "yyyy-MM-dd") : null,
        data_final: dataFinal ? format(dataFinal, "yyyy-MM-dd") : null,
        ativo,
      };
      if (image_url) payload.image_url = image_url;

      if (editId) {
        const { error } = await supabase.from("site_banners").update(payload).eq("id", editId);
        if (error) throw error;
        toast({ title: "Banner atualizado" });
      } else {
        const { error } = await supabase.from("site_banners").insert(payload);
        if (error) throw error;
        toast({ title: "Banner cadastrado" });
      }
      resetForm();
      load();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function edit(b: Banner) {
    setEditId(b.id);
    setNome(b.nome);
    setAtivo(b.ativo);
    setPosicao(b.posicao);
    setLinkUrl(b.link_url || "");
    setDataInicial(b.data_inicial ? new Date(b.data_inicial + "T00:00:00") : undefined);
    setDataFinal(b.data_final ? new Date(b.data_final + "T00:00:00") : undefined);
    setImagePreview(b.image_url);
    setImageFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id: string) {
    if (!confirm("Remover este banner?")) return;
    await supabase.from("site_banners").delete().eq("id", id);
    toast({ title: "Banner removido" });
    load();
  }

  async function toggle(b: Banner) {
    await supabase.from("site_banners").update({ ativo: !b.ativo }).eq("id", b.id);
    load();
  }

  if (loading) return <ModulePageSkeleton variant="form" />;

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--layout-page-bg, #ffffff)",
    border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)",
    color: "var(--layout-page-text, #1a1a1a)",
    borderRadius: "12px",
  };

  return (
    <div className="nexo-scope animate-fade-in">
      <div className="rounded-2xl" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 12%, var(--layout-page-bg, #ffffff) 88%)", padding: 20 }}>
        <form onSubmit={handleSubmit} className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", color: "var(--layout-header-text, #ffffff)" }}>
            <h3 className="text-sm font-bold">{editId ? "✏️ Editar Banner" : "➕ Novo Banner"}</h3>
            {editId && (
              <button type="button" onClick={resetForm} className="px-3 py-1 text-[10px] font-bold rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)" }}>Cancelar</button>
            )}
          </div>

          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nome do banner</label>
              <input value={nome} onChange={e => setNome(e.target.value)} className="w-full px-3 py-2 text-sm outline-none" style={inputStyle} placeholder="Ex: Promoção Verão" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}><MapPin size={12}/> Posição no site</label>
              <select value={posicao} onChange={e => setPosicao(e.target.value)} className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}>
                {POSICOES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}><LinkIcon size={12}/> Link de destino (opcional)</label>
              <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} className="w-full px-3 py-2 text-sm outline-none" style={inputStyle} placeholder="https://..." />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}><CalendarLucide size={12}/> Data inicial</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dataInicial && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataInicial ? format(dataInicial, "dd/MM/yyyy") : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dataInicial} onSelect={setDataInicial} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}><CalendarLucide size={12}/> Data final</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dataFinal && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataFinal ? format(dataFinal, "dd/MM/yyyy") : "Sem data final"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dataFinal} onSelect={setDataFinal} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}><ImageIcon size={12}/> Imagem do banner</label>
              <input ref={imgRef} type="file" accept="image/*" onChange={onImage} className="w-full px-3 py-2 text-sm outline-none" style={inputStyle} />
              {imagePreview && (
                <div className="mt-3 rounded-xl overflow-hidden border" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 30%, transparent)" }}>
                  <img src={imagePreview} alt="preview" style={{ width: "100%", maxHeight: 260, objectFit: "contain", background: "#000" }} />
                </div>
              )}
            </div>

            <div className="md:col-span-2 flex items-center gap-2">
              <input id="ativo-banner" type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
              <label htmlFor="ativo-banner" className="text-xs font-medium" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Banner ativo</label>
            </div>

            <div className="md:col-span-2 flex justify-end">
              <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-2 disabled:opacity-50" style={{ background: "var(--layout-accent-color, #2563eb)", color: "#fff" }}>
                {saving ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>}
                {editId ? "Salvar alterações" : "Adicionar banner"}
              </button>
            </div>
          </div>
        </form>

        {/* Lista */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="px-5 py-3 text-sm font-bold" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", color: "var(--layout-header-text, #ffffff)" }}>
            Banners cadastrados ({items.length})
          </div>
          {items.length === 0 ? (
            <div className="p-6 text-center text-xs opacity-60" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nenhum banner cadastrado ainda.</div>
          ) : (
            <div className="divide-y" style={{ borderColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)" }}>
              {items.map(b => (
                <div key={b.id} className="p-4 flex items-center gap-4">
                  <img src={b.image_url} alt={b.nome} className="w-24 h-14 rounded-lg object-cover" style={{ background: "#000" }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{b.nome}</div>
                    <div className="text-[11px] opacity-60 truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                      {POSICOES.find(p => p.value === b.posicao)?.label || b.posicao}
                      {b.link_url ? ` • ${b.link_url}` : ""}
                      {b.data_final ? ` • até ${b.data_final.split("-").reverse().join("/")}` : ""}
                    </div>
                  </div>
                  <button onClick={() => toggle(b)} className="text-[10px] font-bold px-3 py-1 rounded-full" style={{ background: b.ativo ? "rgba(34,197,94,0.12)" : "rgba(220,38,38,0.12)", color: b.ativo ? "#22c55e" : "#dc2626" }}>
                    {b.ativo ? "Ativo" : "Inativo"}
                  </button>
                  <button onClick={() => edit(b)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)", color: "var(--layout-accent-color, #2563eb)" }}><Pencil size={14}/></button>
                  <button onClick={() => remove(b.id)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}><Trash2 size={14}/></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
