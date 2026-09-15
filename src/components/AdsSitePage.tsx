import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2, Trash2, Pencil, Plus, Image as ImageIcon, Link as LinkIcon,
  MapPin, CalendarIcon, UploadCloud, LayoutPanelTop, ListChecks, X,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn, scrollToForm } from "@/lib/utils";
import { compressImage } from "@/lib/imageCompressor";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { confirmDialog } from "@/lib/confirmDialog";

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

/* Nexo form palette (ClientesPage style) */
const CYAN = "#0055ff";
const LIME = "#0055ff";
const BG = "#ffffff";
const INK = "#002132";

const inputCls =
  "w-full h-11 px-5 rounded-full text-xs font-semibold uppercase bg-[#f8fafc] outline-none transition-all " +
  "border border-slate-200/90 focus:bg-white focus:border-[#0055ff] " +
  "placeholder:text-slate-400 text-[#0f172a]";

const labelCls =
  "text-[11px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 text-[#002132]";

export default function AdsSitePage() {
  const { user } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
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

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("site_banners").select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data as any) || []);
    setLoading(false);
  }

  function resetForm() {
    setEditId(null); setNome(""); setAtivo(true); setPosicao("topo");
    setLinkUrl(""); setDataInicial(new Date()); setDataFinal(undefined);
    setImageFile(null); setImagePreview("");
    if (imgRef.current) imgRef.current.value = "";
  }

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setImageFile(f); setImagePreview(URL.createObjectURL(f));
  }

  async function uploadImage(): Promise<string | null> {
    if (!imageFile || !user) return null;
    const compressed = await compressImage(imageFile, 1600, 1600, 0.85);
    const path = `${user.id}/banners/${Date.now()}-${(imageFile.name || "banner").replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await supabase.storage.from("comercial").upload(path, compressed, { upsert: true, contentType: compressed.type });
    if (error) { toast({ title: "Erro no upload", description: error.message, variant: "destructive" }); return null; }
    const { data } = supabase.storage.from("comercial").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); if (!user) return;
    if (!nome.trim()) return toast({ title: "Informe o nome do banner", variant: "destructive" });
    if (!editId && !imageFile) return toast({ title: "Selecione uma imagem", variant: "destructive" });
    setSaving(true);
    try {
      let image_url: string | null = null;
      if (imageFile) image_url = await uploadImage();
      const payload: any = {
        user_id: user.id, nome: nome.trim(), link_url: linkUrl.trim() || null, posicao,
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
      resetForm(); load();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  function edit(b: Banner) {
    setEditId(b.id); setNome(b.nome); setAtivo(b.ativo); setPosicao(b.posicao);
    setLinkUrl(b.link_url || "");
    setDataInicial(b.data_inicial ? new Date(b.data_inicial + "T00:00:00") : undefined);
    setDataFinal(b.data_final ? new Date(b.data_final + "T00:00:00") : undefined);
    setImagePreview(b.image_url); setImageFile(null);
    scrollToForm(formRef.current);
  }

  async function remove(id: string) {
    if (!(await confirmDialog("Remover este banner?"))) return;
    await supabase.from("site_banners").delete().eq("id", id);
    toast({ title: "Banner removido" }); load();
  }

  async function toggle(b: Banner) {
    await supabase.from("site_banners").update({ ativo: !b.ativo }).eq("id", b.id);
    load();
  }

  if (loading) return <ModulePageSkeleton variant="form" />;

  return (
    <div className="nexo-scope animate-fade-in" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
      <div className="rounded-3xl p-6" style={{ background: BG }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: CYAN }}>Comercial · Site</div>
            <h2 className="text-2xl font-black mt-0.5" style={{ color: INK }}>
              {editId ? "Editar banner" : "Novo banner do site"}
            </h2>
          </div>
          {editId && (
            <button type="button" onClick={resetForm}
              className="h-9 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 bg-white/70 hover:bg-white transition"
              style={{ color: INK, border: `2px solid ${INK}20` }}>
              <X size={14}/> Cancelar edição
            </button>
          )}
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* LEFT: Image dropzone */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl bg-white p-4 h-full flex flex-col" style={{ boxShadow: "0 4px 20px rgba(0,33,50,0.06)" }}>
              <div className={labelCls}><ImageIcon size={14}/> Imagem do banner</div>
              <label
                htmlFor="banner-img"
                className="flex-1 min-h-[220px] rounded-xl border-2 border-dashed cursor-pointer flex flex-col items-center justify-center overflow-hidden transition hover:bg-[#00BFF0]/5"
                style={{ borderColor: `${CYAN}55` }}
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="preview" className="w-full h-full object-contain" style={{ background: "#0b1620" }}/>
                ) : (
                  <div className="text-center px-4 py-8">
                    <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-3" style={{ background: `${CYAN}15`, color: CYAN }}>
                      <UploadCloud size={26}/>
                    </div>
                    <div className="text-sm font-bold" style={{ color: INK }}>Arraste ou clique para enviar</div>
                    <div className="text-[11px] mt-1" style={{ color: `${INK}88` }}>PNG, JPG · até 1600px</div>
                  </div>
                )}
              </label>
              <input id="banner-img" ref={imgRef} type="file" accept="image/*" onChange={onImage} className="hidden"/>
              {imagePreview && (
                <button type="button" onClick={() => { setImageFile(null); setImagePreview(""); if (imgRef.current) imgRef.current.value = ""; }}
                  className="mt-3 h-9 rounded-full text-xs font-bold bg-white hover:bg-[#00BFF0]/10 transition"
                  style={{ color: INK, border: `2px solid ${CYAN}55` }}>
                  Trocar imagem
                </button>
              )}
            </div>
          </div>

          {/* RIGHT: Fields */}
          <div className="lg:col-span-2 rounded-2xl bg-white p-5 space-y-4" style={{ boxShadow: "0 4px 20px rgba(0,33,50,0.06)" }}>
            <div>
              <div className={labelCls}><LayoutPanelTop size={14}/> Nome do banner</div>
              <input value={nome} onChange={e => setNome(e.target.value)} className={inputCls} placeholder="Ex: Promoção Verão"/>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className={labelCls}><MapPin size={14}/> Posição no site</div>
                <select value={posicao} onChange={e => setPosicao(e.target.value)} className={inputCls}>
                  {POSICOES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <div className={labelCls}><LinkIcon size={14}/> Link de destino</div>
                <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} className={inputCls} placeholder="https://..."/>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className={labelCls}><CalendarIcon size={14}/> Data inicial</div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className={cn(inputCls, "text-left flex items-center")}>
                      <CalendarIcon className="mr-2 h-4 w-4 opacity-60"/>
                      {dataInicial ? format(dataInicial, "dd/MM/yyyy") : "Selecione"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dataInicial} onSelect={setDataInicial} initialFocus className="p-3 pointer-events-auto"/>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <div className={labelCls}><CalendarIcon size={14}/> Data final</div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className={cn(inputCls, "text-left flex items-center")}>
                      <CalendarIcon className="mr-2 h-4 w-4 opacity-60"/>
                      {dataFinal ? format(dataFinal, "dd/MM/yyyy") : "Sem data final"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dataFinal} onSelect={setDataFinal} initialFocus className="p-3 pointer-events-auto"/>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="relative inline-flex items-center">
                  <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="peer sr-only"/>
                  <span className="w-11 h-6 rounded-full bg-[#002132]/15 peer-checked:bg-[#C6F03C] transition"/>
                  <span className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition peer-checked:translate-x-5"/>
                </span>
                <span className="text-sm font-bold" style={{ color: INK }}>Banner ativo</span>
              </label>

              <button type="submit" disabled={saving}
                className="h-11 px-6 rounded-full text-sm font-black flex items-center gap-2 disabled:opacity-50 transition hover:brightness-95"
                style={{ background: LIME, color: INK, boxShadow: `0 6px 20px ${LIME}55` }}>
                {saving ? <Loader2 size={16} className="animate-spin"/> : <Plus size={16}/>}
                {editId ? "Salvar alterações" : "Adicionar banner"}
              </button>
            </div>
          </div>
        </form>

        {/* List */}
        <div className="mt-6 rounded-2xl bg-white overflow-hidden" style={{ boxShadow: "0 4px 20px rgba(0,33,50,0.06)" }}>
          <div className="px-5 py-3.5 flex items-center gap-2 border-b" style={{ borderColor: `${INK}12` }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `${CYAN}15`, color: CYAN }}>
              <ListChecks size={15}/>
            </div>
            <div className="text-sm font-black" style={{ color: INK }}>Banners cadastrados</div>
            <div className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${CYAN}15`, color: CYAN }}>{items.length}</div>
          </div>
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: `${INK}66` }}>Nenhum banner cadastrado ainda.</div>
          ) : (
            <div className="divide-y" style={{ borderColor: `${INK}08` }}>
              {items.map(b => (
                <div key={b.id} className="p-4 flex items-center gap-4">
                  <img src={b.image_url} alt={b.nome} className="w-24 h-14 rounded-lg object-cover" style={{ background: "#000" }}/>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate" style={{ color: INK }}>{b.nome}</div>
                    <div className="text-[11px] truncate" style={{ color: `${INK}80` }}>
                      {POSICOES.find(p => p.value === b.posicao)?.label || b.posicao}
                      {b.link_url ? ` • ${b.link_url}` : ""}
                      {b.data_final ? ` • até ${b.data_final.split("-").reverse().join("/")}` : ""}
                    </div>
                  </div>
                  <button onClick={() => toggle(b)} className="text-[10px] font-bold px-3 py-1 rounded-full"
                    style={{ background: b.ativo ? `${LIME}30` : "rgba(220,38,38,0.12)", color: b.ativo ? INK : "#dc2626" }}>
                    {b.ativo ? "Ativo" : "Inativo"}
                  </button>
                  <button onClick={() => edit(b)} className="w-9 h-9 rounded-full flex items-center justify-center hover:brightness-95 transition"
                    style={{ background: `${CYAN}15`, color: CYAN }}><Pencil size={15}/></button>
                  <button onClick={() => remove(b.id)} className="w-9 h-9 rounded-full flex items-center justify-center hover:brightness-95 transition"
                    style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}><Trash2 size={15}/></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
