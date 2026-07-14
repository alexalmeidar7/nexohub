import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2, Trash2, Pencil, Plus, MessageSquare, Image as ImageIcon,
  Clock, CalendarIcon, UploadCloud, ListChecks, X, Info, Megaphone,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { compressImage } from "@/lib/imageCompressor";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

interface Campaign {
  id: string;
  name: string;
  message: string;
  image_url: string | null;
  scheduled_at: string | null;
  status: string;
  sent_count: number;
  fail_count: number;
  total_count: number;
  created_at: string;
}

const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const BG = "#D6F4FB";
const INK = "#002132";

const inputCls =
  "w-full h-11 px-4 rounded-full text-sm bg-white outline-none transition-all " +
  "border-2 border-[#00BFF0]/30 focus:border-[#00BFF0] focus:ring-4 focus:ring-[#00BFF0]/15 " +
  "placeholder:text-[#002132]/40 text-[#002132]";

const textareaCls =
  "w-full px-4 py-3 rounded-2xl text-sm bg-white outline-none transition-all resize-none " +
  "border-2 border-[#00BFF0]/30 focus:border-[#00BFF0] focus:ring-4 focus:ring-[#00BFF0]/15 " +
  "placeholder:text-[#002132]/40 text-[#002132]";

const labelCls =
  "text-[11px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 text-[#002132]";

export default function AdsChatbotPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [scheduledTime, setScheduledTime] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const imgRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("wa_broadcasts").select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data as any) || []);
    setLoading(false);
  }

  function resetForm() {
    setEditId(null); setName(""); setMessage("");
    setScheduledDate(undefined); setScheduledTime("");
    setImageFile(null); setImagePreview("");
    if (imgRef.current) imgRef.current.value = "";
  }

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setImageFile(f); setImagePreview(URL.createObjectURL(f));
  }

  async function uploadImage(): Promise<string | null> {
    if (!imageFile || !user) return null;
    const compressed = await compressImage(imageFile, 1200, 1200, 0.85);
    const path = `${user.id}/chatbot-campaigns/${Date.now()}-${(imageFile.name || "img").replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await supabase.storage.from("comercial").upload(path, compressed, { upsert: true, contentType: compressed.type });
    if (error) { toast({ title: "Erro no upload", description: error.message, variant: "destructive" }); return null; }
    const { data } = supabase.storage.from("comercial").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); if (!user) return;
    if (!name.trim() || !message.trim()) return toast({ title: "Preencha nome e mensagem", variant: "destructive" });
    setSaving(true);
    try {
      let image_url: string | null = null;
      if (imageFile) image_url = await uploadImage();
      let scheduled_at: string | null = null;
      if (scheduledDate) {
        const d = new Date(scheduledDate);
        if (scheduledTime) { const [h, m] = scheduledTime.split(":").map(Number); d.setHours(h || 0, m || 0, 0, 0); }
        scheduled_at = d.toISOString();
      }
      const payload: any = {
        user_id: user.id, name: name.trim(), message: message.trim(),
        scheduled_at, status: scheduled_at ? "scheduled" : "draft",
      };
      if (image_url) payload.image_url = image_url;

      if (editId) {
        const { error } = await supabase.from("wa_broadcasts").update(payload).eq("id", editId);
        if (error) throw error;
        toast({ title: "Campanha atualizada" });
      } else {
        const { error } = await supabase.from("wa_broadcasts").insert(payload);
        if (error) throw error;
        toast({ title: "Campanha cadastrada", description: "Disponível em Chatbot > Disparo em Massa" });
      }
      resetForm(); load();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  function edit(c: Campaign) {
    setEditId(c.id); setName(c.name); setMessage(c.message);
    if (c.scheduled_at) {
      const d = new Date(c.scheduled_at);
      setScheduledDate(d);
      setScheduledTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    } else { setScheduledDate(undefined); setScheduledTime(""); }
    setImagePreview(c.image_url || ""); setImageFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id: string) {
    if (!confirm("Remover esta campanha?")) return;
    await supabase.from("wa_broadcasts").delete().eq("id", id);
    toast({ title: "Campanha removida" }); load();
  }

  if (loading) return <ModulePageSkeleton variant="form" />;

  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      draft: { bg: "rgba(0,33,50,0.10)", color: INK, label: "Rascunho" },
      scheduled: { bg: `${CYAN}20`, color: CYAN, label: "Agendada" },
      sending: { bg: "rgba(234,179,8,0.20)", color: "#a16207", label: "Enviando" },
      done: { bg: `${LIME}40`, color: INK, label: "Enviada" },
      failed: { bg: "rgba(220,38,38,0.15)", color: "#dc2626", label: "Falhou" },
    };
    const it = map[s] || map.draft;
    return <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: it.bg, color: it.color }}>{it.label}</span>;
  };

  return (
    <div className="nexo-scope animate-fade-in" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
      <div className="rounded-3xl p-6" style={{ background: BG }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: CYAN }}>Comercial · Chatbot</div>
            <h2 className="text-2xl font-black mt-0.5" style={{ color: INK }}>
              {editId ? "Editar campanha" : "Nova campanha Chatbot"}
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

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* LEFT: image */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl bg-white p-4 h-full flex flex-col" style={{ boxShadow: "0 4px 20px rgba(0,33,50,0.06)" }}>
              <div className={labelCls}><ImageIcon size={14}/> Imagem (opcional)</div>
              <label htmlFor="camp-img"
                className="flex-1 min-h-[220px] rounded-xl border-2 border-dashed cursor-pointer flex flex-col items-center justify-center overflow-hidden transition hover:bg-[#00BFF0]/5"
                style={{ borderColor: `${CYAN}55` }}>
                {imagePreview ? (
                  <img src={imagePreview} alt="preview" className="w-full h-full object-contain" style={{ background: "#0b1620" }}/>
                ) : (
                  <div className="text-center px-4 py-8">
                    <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-3" style={{ background: `${CYAN}15`, color: CYAN }}>
                      <UploadCloud size={26}/>
                    </div>
                    <div className="text-sm font-bold" style={{ color: INK }}>Adicionar imagem</div>
                    <div className="text-[11px] mt-1" style={{ color: `${INK}88` }}>PNG, JPG · até 1200px</div>
                  </div>
                )}
              </label>
              <input id="camp-img" ref={imgRef} type="file" accept="image/*" onChange={onImage} className="hidden"/>
              {imagePreview && (
                <button type="button" onClick={() => { setImageFile(null); setImagePreview(""); if (imgRef.current) imgRef.current.value = ""; }}
                  className="mt-3 h-9 rounded-full text-xs font-bold bg-white hover:bg-[#00BFF0]/10 transition"
                  style={{ color: INK, border: `2px solid ${CYAN}55` }}>Remover imagem</button>
              )}
            </div>
          </div>

          {/* RIGHT: fields */}
          <div className="lg:col-span-2 rounded-2xl bg-white p-5 space-y-4" style={{ boxShadow: "0 4px 20px rgba(0,33,50,0.06)" }}>
            <div>
              <div className={labelCls}><Megaphone size={14}/> Nome da campanha</div>
              <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Ex: Promoção Dia dos Pais"/>
            </div>

            <div>
              <div className={labelCls}><MessageSquare size={14}/> Mensagem</div>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} maxLength={4096}
                className={textareaCls} placeholder="Digite a mensagem que será enviada..."/>
              <div className="text-[10px] text-right mt-1" style={{ color: `${INK}66` }}>{message.length}/4096</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className={labelCls}><CalendarIcon size={14}/> Data do disparo</div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className={cn(inputCls, "text-left flex items-center")}>
                      <CalendarIcon className="mr-2 h-4 w-4 opacity-60"/>
                      {scheduledDate ? format(scheduledDate, "dd/MM/yyyy") : "Sem agendamento"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={scheduledDate} onSelect={setScheduledDate} initialFocus className="p-3 pointer-events-auto"/>
                  </PopoverContent>
                </Popover>
                {scheduledDate && (
                  <button type="button" onClick={() => { setScheduledDate(undefined); setScheduledTime(""); }}
                    className="text-[10px] mt-1 underline" style={{ color: `${INK}80` }}>Remover agendamento</button>
                )}
              </div>
              <div>
                <div className={labelCls}><Clock size={14}/> Horário</div>
                <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)}
                  disabled={!scheduledDate} className={cn(inputCls, "disabled:opacity-40")}/>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-2xl" style={{ background: `${CYAN}12`, color: INK }}>
              <Info size={16} style={{ color: CYAN, flexShrink: 0, marginTop: 1 }}/>
              <div className="text-[11px] leading-relaxed">
                As campanhas cadastradas aqui ficam disponíveis para disparo na aba <b>Disparo em Massa</b> dentro do Chatbot.
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button type="submit" disabled={saving}
                className="h-11 px-6 rounded-full text-sm font-black flex items-center gap-2 disabled:opacity-50 transition hover:brightness-95"
                style={{ background: LIME, color: INK, boxShadow: `0 6px 20px ${LIME}55` }}>
                {saving ? <Loader2 size={16} className="animate-spin"/> : <Plus size={16}/>}
                {editId ? "Salvar alterações" : "Cadastrar campanha"}
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
            <div className="text-sm font-black" style={{ color: INK }}>Campanhas cadastradas</div>
            <div className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${CYAN}15`, color: CYAN }}>{items.length}</div>
          </div>
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: `${INK}66` }}>Nenhuma campanha cadastrada ainda.</div>
          ) : (
            <div className="divide-y" style={{ borderColor: `${INK}08` }}>
              {items.map(c => (
                <div key={c.id} className="p-4 flex items-center gap-4">
                  {c.image_url ? (
                    <img src={c.image_url} alt="" className="w-14 h-14 rounded-xl object-cover" style={{ background: "#000" }}/>
                  ) : (
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: `${CYAN}15`, color: CYAN }}>
                      <MessageSquare size={20}/>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold truncate" style={{ color: INK }}>{c.name}</div>
                      {statusBadge(c.status)}
                    </div>
                    <div className="text-[11px] truncate mt-0.5" style={{ color: `${INK}90` }}>{c.message}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: `${INK}60` }}>
                      {c.scheduled_at ? `📅 ${format(new Date(c.scheduled_at), "dd/MM/yyyy HH:mm")}` : "Sem agendamento"}
                      {c.total_count > 0 ? ` • ${c.sent_count}/${c.total_count} enviadas` : ""}
                    </div>
                  </div>
                  <button onClick={() => edit(c)} className="w-9 h-9 rounded-full flex items-center justify-center hover:brightness-95 transition"
                    style={{ background: `${CYAN}15`, color: CYAN }}><Pencil size={15}/></button>
                  <button onClick={() => remove(c.id)} className="w-9 h-9 rounded-full flex items-center justify-center hover:brightness-95 transition"
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
