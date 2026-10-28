import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirmDialog";

interface Banner {
  id: string;
  nome: string;
  image_url: string;
  link_url: string | null;
  posicao: string;
  ativo: boolean;
  data_inicial: string | null;
  data_final: string | null;
}

export default function SiteBannersManager({ effectiveUserId }: { effectiveUserId: string }) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("site_banners")
      .select("*")
      .eq("user_id", effectiveUserId)
      .order("created_at", { ascending: false });
    setBanners((data as Banner[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [effectiveUserId]);

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const path = `${effectiveUserId}/banners/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("empresa-assets").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("empresa-assets").getPublicUrl(path);
      const { error } = await supabase.from("site_banners").insert({
        user_id: effectiveUserId,
        nome: file.name,
        image_url: pub.publicUrl,
        posicao: "topo",
        ativo: true,
      });
      if (error) throw error;
      toast.success("Banner adicionado");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar");
    } finally {
      setUploading(false);
    }
  };

  const update = async (id: string, patch: Partial<Banner>) => {
    const previous = banners.find((item) => item.id === id);
    if (!previous) return;
    const { error } = await supabase.from("site_banners").update(patch).eq("id", id).eq("user_id", effectiveUserId);
    if (error) {
      toast.error("Não foi possível atualizar o banner: " + error.message);
      return;
    }
    setBanners((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const remove = async (id: string) => {
    if (!(await confirmDialog("Excluir este banner?"))) return;
    const { error } = await supabase.from("site_banners").delete().eq("id", id).eq("user_id", effectiveUserId);
    if (error) {
      toast.error("Não foi possível excluir o banner: " + error.message);
      return;
    }
    setBanners((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-dashed cursor-pointer hover:bg-black/5 transition text-sm"
        style={{ borderColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)" }}>
        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        <span>{uploading ? "Enviando..." : "Adicionar banner (imagem)"}</span>
        <input type="file" accept="image/*" className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="animate-spin" size={18} /></div>
      ) : banners.length === 0 ? (
        <div className="text-center text-xs opacity-60 py-6">Nenhum banner cadastrado.</div>
      ) : (
        <ul className="space-y-2">
          {banners.map((b) => (
            <li key={b.id} className="flex gap-2 p-2 rounded-lg items-center"
              style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)" }}>
              <div className="w-16 h-10 rounded overflow-hidden bg-black/10 shrink-0 flex items-center justify-center">
                {b.image_url ? <img src={b.image_url} alt={b.nome} className="w-full h-full object-cover" /> : <ImageIcon size={14} className="opacity-40" />}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <Input value={b.nome} onChange={(e) => update(b.id, { nome: e.target.value })} className="h-7 text-xs" />
                <Input placeholder="Link (opcional)" value={b.link_url || ""} onChange={(e) => update(b.id, { link_url: e.target.value })} className="h-7 text-xs" />
              </div>
              <select value={b.posicao} onChange={(e) => update(b.id, { posicao: e.target.value })}
                className="text-xs rounded border px-1.5 py-1 bg-transparent">
                <option value="topo">Topo</option>
                <option value="meio">Meio</option>
                <option value="rodape">Rodapé</option>
              </select>
              <button onClick={() => update(b.id, { ativo: !b.ativo })}
                className="text-[10px] px-2 py-1 rounded"
                style={{
                  background: b.ativo ? "color-mix(in srgb, var(--layout-accent-color, #268ffa) 15%, transparent)" : "transparent",
                  border: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 12%, transparent)",
                }}>
                {b.ativo ? "Ativo" : "Inativo"}
              </button>
              <Button size="icon" variant="ghost" onClick={() => remove(b.id)} className="h-7 w-7">
                <Trash2 size={12} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
