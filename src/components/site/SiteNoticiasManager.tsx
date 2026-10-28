import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { postSiteSync } from "@/lib/siteSync";

interface Props { effectiveUserId: string | null; }
interface Noticia {
  id: string;
  titulo: string;
  resumo: string;
  imagem_url: string;
  categoria_id: string | null;
  publicado: boolean;
}
interface Categoria { id: string; nome: string; }

export default function SiteNoticiasManager({ effectiveUserId }: Props) {
  const [items, setItems] = useState<Noticia[]>([]);
  const [cats, setCats] = useState<Categoria[]>([]);
  const [draft, setDraft] = useState<Partial<Noticia>>({ titulo: "", resumo: "", imagem_url: "", categoria_id: null, publicado: true });

  const reload = async () => {
    if (!effectiveUserId) return;
    const { data } = await supabase
      .from("site_noticias")
      .select("id, titulo, resumo, imagem_url, categoria_id, publicado")
      .eq("user_id", effectiveUserId)
      .order("created_at", { ascending: false });
    setItems((data as any) || []);
    const { data: cs } = await supabase
      .from("site_categorias")
      .select("id, nome")
      .eq("user_id", effectiveUserId)
      .order("ordem");
    setCats((cs as any) || []);
  };

  useEffect(() => { reload(); }, [effectiveUserId]);

  const add = async () => {
    if (!effectiveUserId || !draft.titulo) return;
    const { error } = await supabase.from("site_noticias").insert({
      user_id: effectiveUserId,
      titulo: draft.titulo,
      resumo: draft.resumo || "",
      imagem_url: draft.imagem_url || "",
      categoria_id: draft.categoria_id || null,
      publicado: draft.publicado ?? true,
    });
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    setDraft({ titulo: "", resumo: "", imagem_url: "", categoria_id: null, publicado: true });
    reload();
    postSiteSync({ type: "noticias" });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("site_noticias").delete().eq("id", id).eq("user_id", effectiveUserId);
    if (error) return toast({ title: "Erro ao excluir notícia", description: error.message, variant: "destructive" });
    await reload();
    postSiteSync({ type: "noticias" });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2 p-3 rounded-lg" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)" }}>
        <Input
          placeholder="Título"
          value={draft.titulo || ""}
          onChange={(e) => setDraft({ ...draft, titulo: e.target.value })}
        />
        <Textarea
          placeholder="Resumo"
          value={draft.resumo || ""}
          onChange={(e) => setDraft({ ...draft, resumo: e.target.value })}
          rows={2}
        />
        <Input
          placeholder="URL da imagem (opcional)"
          value={draft.imagem_url || ""}
          onChange={(e) => setDraft({ ...draft, imagem_url: e.target.value })}
        />
        <select
          className="w-full h-10 rounded-xl bg-white/6 px-3 text-sm"
          value={draft.categoria_id || ""}
          onChange={(e) => setDraft({ ...draft, categoria_id: e.target.value || null })}
        >
          <option value="">Sem categoria</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <Button size="sm" onClick={add} className="w-full gap-2"><Plus size={14}/> Adicionar notícia</Button>
      </div>

      <ul className="space-y-2">
        {items.map((n) => (
          <li key={n.id} className="flex items-start justify-between gap-2 p-2 rounded text-xs"
            style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)" }}>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{n.titulo}</p>
              {n.resumo && <p className="opacity-60 line-clamp-2">{n.resumo}</p>}
            </div>
            <button onClick={() => remove(n.id)} className="opacity-60 hover:opacity-100"><Trash2 size={14}/></button>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs opacity-50 italic">Nenhuma notícia.</li>}
      </ul>
    </div>
  );
}
