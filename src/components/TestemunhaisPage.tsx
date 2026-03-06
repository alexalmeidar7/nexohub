import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2, Upload, ImageIcon, Pencil, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { compressImage } from "@/lib/imageCompressor";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

interface Testemunhal {
  id: string;
  programa_id: string | null;
  imagem_url: string;
  texto: string;
  data_inicio: string;
  data_fim: string;
  created_at: string;
  programa?: { nome: string };
}

interface Programa {
  id: string;
  nome: string;
}

export default function TestemunhaisPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Testemunhal[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [texto, setTexto] = useState("");
  const [programaId, setProgramaId] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    const [, { data: tData }, { data: pData }] = await Promise.all([
      supabase.rpc("cleanup_comercial"),
      supabase.from("testemunhais").select("*").eq("user_id", user.id).order("data_fim"),
      supabase.from("programas").select("id, nome").eq("user_id", user.id).eq("ativo", true),
    ]);

    const testemunhais = tData || [];
    const progs = pData || [];
    setProgramas(progs);

    setItems(
      testemunhais.map((t: any) => ({
        ...t,
        programa: progs.find((p: any) => p.id === t.programa_id),
      }))
    );
    setLoading(false);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const uploadImage = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop();
    const path = `testemunhais/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("comercial").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("comercial").getPublicUrl(path);
    return data.publicUrl;
  };

  const startEdit = (item: Testemunhal) => {
    setEditingId(item.id);
    setTexto(item.texto);
    setProgramaId(item.programa_id || "");
    setDataInicio(item.data_inicio);
    setDataFim(item.data_fim);
    setImagePreview(item.imagem_url || "");
    setImageFile(null);
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

      if (editingId) {
        const { error } = await supabase.from("testemunhais").update({
          programa_id: programaId || null,
          imagem_url,
          texto,
          data_inicio: dataInicio,
          data_fim: dataFim,
        }).eq("id", editingId);
        if (error) throw error;
        toast({ title: "Testemunhal atualizado!" });
      } else {
        const { error } = await supabase.from("testemunhais").insert({
          user_id: user.id,
          programa_id: programaId || null,
          imagem_url,
          texto,
          data_inicio: dataInicio,
          data_fim: dataFim,
        });
        if (error) throw error;
        toast({ title: "Testemunhal salvo com sucesso!" });
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
    setProgramaId("");
    setDataInicio("");
    setDataFim("");
    setImageFile(null);
    setImagePreview("");
  };

  const handleDelete = async (id: string) => {
    await supabase.from("testemunhais").delete().eq("id", id);
    await loadData();
  };

  const diasRestantes = (dataFim: string) => {
    return Math.ceil((new Date(dataFim + "T23:59:59").getTime() - Date.now()) / 86400000);
  };

  if (loading) {
    return <ModulePageSkeleton />;
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Foto do Cliente</label>
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} className="text-xs">
                <X size={12} className="mr-1" /> Cancelar edição
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {imagePreview ? (
              <img src={imagePreview} alt="preview" className="w-16 h-16 rounded-lg object-cover border" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center border">
                <ImageIcon size={20} className="text-muted-foreground" />
              </div>
            )}
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-sm transition-colors">
              <Upload size={14} />
              Enviar imagem
              <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </label>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Texto do Testemunhal</label>
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Relato do cliente..." rows={4} required />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Vínculo com Programa</label>
            <Select value={programaId} onValueChange={setProgramaId}>
              <SelectTrigger><SelectValue placeholder="Selecione um programa" /></SelectTrigger>
              <SelectContent>
                {programas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
            {saving ? <><Loader2 className="animate-spin mr-2" size={14} /> Salvando...</> : editingId ? "Atualizar Testemunhal" : "Cadastrar Testemunhal"}
          </Button>
        </div>
      </form>

      <div>
        <h3 className="text-lg font-semibold mb-3">Testemunhais Ativos</h3>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum testemunhal cadastrado.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => {
              const dias = diasRestantes(item.data_fim);
              return (
                <div key={item.id} className={`bg-card border rounded-xl p-4 space-y-3 ${editingId === item.id ? "border-primary ring-1 ring-primary" : "border-border"}`}>
                  <div className="flex items-start gap-3">
                    {item.imagem_url ? (
                      <img src={item.imagem_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <ImageIcon size={18} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground line-clamp-3">{item.texto}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium">{item.programa?.nome || "Sem programa"}</span>
                    <span className={`font-bold ${dias <= 3 ? "text-red-500" : "text-green-600"}`}>
                      {dias} dia{dias !== 1 ? "s" : ""} restante{dias !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="flex-1 text-primary hover:text-primary/80" onClick={() => startEdit(item)}>
                      <Pencil size={14} className="mr-1" /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" className="flex-1 text-red-500 hover:text-red-700" onClick={() => handleDelete(item.id)}>
                      <Trash2 size={14} className="mr-1" /> Remover
                    </Button>
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
