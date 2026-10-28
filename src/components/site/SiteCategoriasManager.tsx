import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { postSiteSync } from "@/lib/siteSync";

interface Props { effectiveUserId: string | null; }
interface Categoria { id: string; nome: string; slug: string; cor: string; ordem: number; }

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function SiteCategoriasManager({ effectiveUserId }: Props) {
  const [items, setItems] = useState<Categoria[]>([]);
  const [nome, setNome] = useState("");

  const reload = async () => {
    if (!effectiveUserId) return;
    const { data } = await supabase
      .from("site_categorias")
      .select("*")
      .eq("user_id", effectiveUserId)
      .order("ordem");
    setItems((data as any) || []);
  };
  useEffect(() => { reload(); }, [effectiveUserId]);

  const add = async () => {
    if (!effectiveUserId || !nome.trim()) return;
    const slug = slugify(nome);
    const { error } = await supabase.from("site_categorias").insert({
      user_id: effectiveUserId, nome: nome.trim(), slug, cor: "#268ffa", ordem: items.length,
    });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setNome("");
    reload();
    postSiteSync({ type: "categorias" });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("site_categorias").delete().eq("id", id).eq("user_id", effectiveUserId);
    if (error) return toast({ title: "Erro ao excluir categoria", description: error.message, variant: "destructive" });
    await reload();
    postSiteSync({ type: "categorias" });
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input placeholder="Nome da categoria" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Button size="sm" onClick={add} className="gap-1"><Plus size={14}/></Button>
      </div>
      <ul className="space-y-1">
        {items.map((c) => (
          <li key={c.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded"
            style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)" }}>
            <span>{c.nome}</span>
            <button onClick={() => remove(c.id)} className="opacity-60 hover:opacity-100"><Trash2 size={12}/></button>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs opacity-50 italic">Nenhuma categoria.</li>}
      </ul>
    </div>
  );
}
