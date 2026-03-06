import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Upload, ImageIcon, Pencil, X } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { useToast } from "@/hooks/use-toast";
import { compressImage } from "@/lib/imageCompressor";

interface Promocao {
  id: string;
  imagem_url: string;
  botao_url: string;
  texto: string;
  oferecimento: string;
  data_inicio: string;
  data_fim: string;
  created_at: string;
}

export default function PromocoesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Promocao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [texto, setTexto] = useState("");
  const [oferecimento, setOferecimento] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [botaoFile, setBotaoFile] = useState<File | null>(null);
  const [botaoPreview, setBotaoPreview] = useState("");

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    const [, { data }] = await Promise.all([
      supabase.rpc("cleanup_comercial"),
      supabase.from("promocoes").select("*").eq("user_id", user.id).order("data_inicio"),
    ]);
    setItems(data || []);
    setLoading(false);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleBotaoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBotaoFile(file);
    setBotaoPreview(URL.createObjectURL(file));
  };

  const uploadImage = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop();
    const path = `promocoes/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("comercial").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("comercial").getPublicUrl(path);
    return data.publicUrl;
  };

  const startEdit = (item: Promocao) => {
    setEditingId(item.id);
    setTexto(item.texto);
    setOferecimento(item.oferecimento || "");
    setDataInicio(item.data_inicio);
    setDataFim(item.data_fim);
    setImagePreview(item.imagem_url || "");
    setImageFile(null);
    setBotaoPreview(item.botao_url || "");
    setBotaoFile(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !texto || !dataInicio || !dataFim) return;
    setSaving(true);

    try {
      let imagem_url = editingId ? imagePreview : "";
      if (imageFile) imagem_url = await uploadImage(imageFile);
      let botao_url = editingId ? botaoPreview : "";
      if (botaoFile) botao_url = await uploadImage(botaoFile);

      if (editingId) {
        const { error } = await supabase.from("promocoes").update({
          imagem_url,
          botao_url,
          texto,
          oferecimento,
          data_inicio: dataInicio,
          data_fim: dataFim,
        }).eq("id", editingId);
        if (error) throw error;
        toast({ title: "Promoção atualizada!" });
      } else {
        const { error } = await supabase.from("promocoes").insert({
          user_id: user.id,
          imagem_url,
          botao_url,
          texto,
          oferecimento,
          data_inicio: dataInicio,
          data_fim: dataFim,
        });
        if (error) throw error;
        toast({ title: "Promoção salva com sucesso!" });
      }

      setEditingId(null);
      resetForm();
      await loadData();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setTexto("");
    setOferecimento("");
    setDataInicio("");
    setDataFim("");
    setImageFile(null);
    setImagePreview("");
    setBotaoFile(null);
    setBotaoPreview("");
  };

  const handleDelete = async (id: string) => {
    await supabase.from("promocoes").delete().eq("id", id);
    await loadData();
  };

  const getStatus = (item: Promocao): "ativa" | "agendada" => {
    const today = new Date().toISOString().split("T")[0];
    return item.data_inicio <= today ? "ativa" : "agendada";
  };

  if (loading) {
    return <ModulePageSkeleton />;
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Banner da Promoção <span className="text-xs text-muted-foreground font-normal">(1920×850px)</span></label>
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} className="text-xs">
                <X size={12} className="mr-1" /> Cancelar edição
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {imagePreview ? (
              <img src={imagePreview} alt="banner" className="w-24 h-10 rounded-lg object-cover border" />
            ) : (
              <div className="w-24 h-10 rounded-lg bg-muted flex items-center justify-center border">
                <ImageIcon size={18} className="text-muted-foreground" />
              </div>
            )}
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-sm transition-colors">
              <Upload size={14} />
              Enviar banner
              <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </label>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Imagem do Botão</label>
            <div className="flex items-center gap-3">
              {botaoPreview ? (
                <img src={botaoPreview} alt="botão" className="w-16 h-10 rounded-lg object-contain border" />
              ) : (
                <div className="w-16 h-10 rounded-lg bg-muted flex items-center justify-center border">
                  <ImageIcon size={16} className="text-muted-foreground" />
                </div>
              )}
              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-sm transition-colors">
                <Upload size={14} />
                Enviar botão
                <input type="file" accept="image/*" className="hidden" onChange={handleBotaoChange} />
              </label>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Texto da Promoção</label>
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Descrição da campanha..." rows={3} required />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Oferecimento</label>
            <Input value={oferecimento} onChange={(e) => setOferecimento(e.target.value)} placeholder="Quem assina a promoção" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Início</label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Fim</label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} required />
            </div>
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? <><Loader2 className="animate-spin mr-2" size={14} /> Salvando...</> : editingId ? "Atualizar Promoção" : "Cadastrar Promoção"}
          </Button>
        </div>
      </form>

      <div>
        <h3 className="text-lg font-semibold mb-3">Promoções</h3>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma promoção cadastrada.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => {
              const status = getStatus(item);
              return (
                <div key={item.id} className={`bg-card border rounded-xl overflow-hidden ${editingId === item.id ? "border-primary ring-1 ring-primary" : "border-border"}`}>
                  {item.imagem_url ? (
                    <img src={item.imagem_url} alt="" className="w-full h-36 object-cover" />
                  ) : (
                    <div className="w-full h-36 bg-muted flex items-center justify-center">
                      <ImageIcon size={32} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant={status === "ativa" ? "default" : "secondary"}>
                        {status === "ativa" ? "Ativa" : "Agendada"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.data_inicio + "T12:00:00").toLocaleDateString("pt-BR")} - {new Date(item.data_fim + "T12:00:00").toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <p className="text-sm text-foreground line-clamp-3">{item.texto}</p>
                    {item.oferecimento && (
                      <p className="text-xs text-muted-foreground italic">Oferecimento: {item.oferecimento}</p>
                    )}
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="flex-1 text-primary hover:text-primary/80" onClick={() => startEdit(item)}>
                        <Pencil size={14} className="mr-1" /> Editar
                      </Button>
                      <Button variant="ghost" size="sm" className="flex-1 text-red-500 hover:text-red-700" onClick={() => handleDelete(item.id)}>
                        <Trash2 size={14} className="mr-1" /> Remover
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
