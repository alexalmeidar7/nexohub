import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Plus, MessageSquare, Image as ImageIcon, Clock, Calendar as CalendarLucide, CalendarIcon } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
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

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("wa_broadcasts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data as any) || []);
    setLoading(false);
  }

  function resetForm() {
    setEditId(null);
    setName("");
    setMessage("");
    setScheduledDate(undefined);
    setScheduledTime("");
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
    const compressed = await compressImage(imageFile, 1200, 1200, 0.85);
    const path = `${user.id}/chatbot-campaigns/${Date.now()}-${(imageFile.name || "img").replace(/[^a-zA-Z0-9.]/g, "_")}`;
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
    if (!name.trim() || !message.trim()) return toast({ title: "Preencha nome e mensagem", variant: "destructive" });
    setSaving(true);
    try {
      let image_url: string | null = null;
      if (imageFile) image_url = await uploadImage();

      let scheduled_at: string | null = null;
      if (scheduledDate) {
        const d = new Date(scheduledDate);
        if (scheduledTime) {
          const [h, m] = scheduledTime.split(":").map(Number);
          d.setHours(h || 0, m || 0, 0, 0);
        }
        scheduled_at = d.toISOString();
      }

      const payload: any = {
        user_id: user.id,
        name: name.trim(),
        message: message.trim(),
        scheduled_at,
        status: scheduled_at ? "scheduled" : "draft",
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
      resetForm();
      load();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function edit(c: Campaign) {
    setEditId(c.id);
    setName(c.name);
    setMessage(c.message);
    if (c.scheduled_at) {
      const d = new Date(c.scheduled_at);
      setScheduledDate(d);
      setScheduledTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    } else {
      setScheduledDate(undefined);
      setScheduledTime("");
    }
    setImagePreview(c.image_url || "");
    setImageFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id: string) {
    if (!confirm("Remover esta campanha?")) return;
    await supabase.from("wa_broadcasts").delete().eq("id", id);
    toast({ title: "Campanha removida" });
    load();
  }

  if (loading) return <ModulePageSkeleton variant="form" />;

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--layout-page-bg, #ffffff)",
    border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)",
    color: "var(--layout-page-text, #1a1a1a)",
    borderRadius: "12px",
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      draft: { bg: "rgba(120,120,120,0.15)", color: "#666", label: "Rascunho" },
      scheduled: { bg: "rgba(37,99,235,0.15)", color: "#2563eb", label: "Agendada" },
      sending: { bg: "rgba(234,179,8,0.15)", color: "#eab308", label: "Enviando" },
      done: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", label: "Enviada" },
      failed: { bg: "rgba(220,38,38,0.15)", color: "#dc2626", label: "Falhou" },
    };
    const it = map[s] || map.draft;
    return <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: it.bg, color: it.color }}>{it.label}</span>;
  };

  return (
    <div className="nexo-scope animate-fade-in">
      <div className="rounded-2xl" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 12%, var(--layout-page-bg, #ffffff) 88%)", padding: 20 }}>
        <form onSubmit={handleSubmit} className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", color: "var(--layout-header-text, #ffffff)" }}>
            <h3 className="text-sm font-bold">{editId ? "✏️ Editar Campanha" : "➕ Nova Campanha Chatbot"}</h3>
            {editId && (
              <button type="button" onClick={resetForm} className="px-3 py-1 text-[10px] font-bold rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)" }}>Cancelar</button>
            )}
          </div>

          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nome da campanha</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 text-sm outline-none" style={inputStyle} placeholder="Ex: Promoção Dia dos Pais" />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}><MessageSquare size={12}/> Mensagem</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} maxLength={4096} className="w-full px-3 py-2 text-sm outline-none resize-none" style={inputStyle} placeholder="Digite a mensagem que será enviada..." />
              <div className="text-[10px] text-right opacity-60 mt-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{message.length}/4096</div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}><CalendarLucide size={12}/> Data do disparo (opcional)</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !scheduledDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduledDate ? format(scheduledDate, "dd/MM/yyyy") : "Sem agendamento"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={scheduledDate} onSelect={setScheduledDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              {scheduledDate && (
                <button type="button" onClick={() => { setScheduledDate(undefined); setScheduledTime(""); }} className="text-[10px] mt-1 opacity-60 underline" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Remover agendamento</button>
              )}
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}><Clock size={12}/> Horário</label>
              <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} disabled={!scheduledDate} className="w-full px-3 py-2 text-sm outline-none disabled:opacity-40" style={inputStyle} />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block flex items-center gap-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}><ImageIcon size={12}/> Imagem (opcional)</label>
              <input ref={imgRef} type="file" accept="image/*" onChange={onImage} className="w-full px-3 py-2 text-sm outline-none" style={inputStyle} />
              {imagePreview && (
                <div className="mt-3 rounded-xl overflow-hidden border" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 30%, transparent)" }}>
                  <img src={imagePreview} alt="preview" style={{ width: "100%", maxHeight: 240, objectFit: "contain", background: "#000" }} />
                </div>
              )}
            </div>

            <div className="md:col-span-2 p-3 rounded-lg text-[11px]" style={{ background: "rgba(37,99,235,0.06)", color: "var(--layout-page-text, #1a1a1a)" }}>
              💡 As campanhas cadastradas aqui ficam disponíveis para disparo na aba <b>Disparo em Massa</b> dentro do Chatbot.
            </div>

            <div className="md:col-span-2 flex justify-end">
              <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-2 disabled:opacity-50" style={{ background: "var(--layout-accent-color, #2563eb)", color: "#fff" }}>
                {saving ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>}
                {editId ? "Salvar alterações" : "Cadastrar campanha"}
              </button>
            </div>
          </div>
        </form>

        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="px-5 py-3 text-sm font-bold" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", color: "var(--layout-header-text, #ffffff)" }}>
            Campanhas cadastradas ({items.length})
          </div>
          {items.length === 0 ? (
            <div className="p-6 text-center text-xs opacity-60" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nenhuma campanha cadastrada ainda.</div>
          ) : (
            <div className="divide-y">
              {items.map(c => (
                <div key={c.id} className="p-4 flex items-center gap-4">
                  {c.image_url ? (
                    <img src={c.image_url} alt="" className="w-14 h-14 rounded-lg object-cover" style={{ background: "#000" }} />
                  ) : (
                    <div className="w-14 h-14 rounded-lg flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)" }}>
                      <MessageSquare size={20} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{c.name}</div>
                      {statusBadge(c.status)}
                    </div>
                    <div className="text-[11px] opacity-70 truncate mt-0.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{c.message}</div>
                    <div className="text-[10px] opacity-50 mt-0.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                      {c.scheduled_at ? `📅 ${format(new Date(c.scheduled_at), "dd/MM/yyyy HH:mm")}` : "Sem agendamento"}
                      {c.total_count > 0 ? ` • ${c.sent_count}/${c.total_count} enviadas` : ""}
                    </div>
                  </div>
                  <button onClick={() => edit(c)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)", color: "var(--layout-accent-color, #2563eb)" }}><Pencil size={14}/></button>
                  <button onClick={() => remove(c.id)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}><Trash2 size={14}/></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
