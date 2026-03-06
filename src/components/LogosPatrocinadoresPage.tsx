import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Plus, Pencil, Check, X } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { useToast } from "@/hooks/use-toast";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";

interface Logo {
  id: string;
  programa_id: string;
  logo_url: string;
  data_final: string;
  ativo: boolean;
  created_at: string;
}

interface Programa {
  id: string;
  nome: string;
}

export default function LogosPatrocinadoresPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [logos, setLogos] = useState<Logo[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [programaId, setProgramaId] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string }[]>([]);

  // Inline date editing
  const [editingLogoId, setEditingLogoId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    const [, { data: lData }, { data: pData }] = await Promise.all([
      supabase.rpc("cleanup_comercial"),
      supabase.from("logos_patrocinadores").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("programas").select("id, nome").eq("user_id", user.id).eq("ativo", true),
    ]);

    setLogos(lData || []);
    setProgramas(pData || []);
    setLoading(false);
  };

  const handleAddFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFiles((prev) => [...prev, { file, preview: URL.createObjectURL(file) }]);
    e.target.value = "";
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadLogo = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop();
    const path = `logos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("comercial").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("comercial").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !programaId || !dataFinal || pendingFiles.length === 0) {
      toast({ title: "Preencha todos os campos e adicione pelo menos uma logo.", variant: "destructive" });
      return;
    }
    setSaving(true);

    try {
      for (const pf of pendingFiles) {
        const logo_url = await uploadLogo(pf.file);
        const { error } = await supabase.from("logos_patrocinadores").insert({
          user_id: user.id,
          programa_id: programaId,
          logo_url,
          data_final: dataFinal,
        });
        if (error) throw error;
      }

      toast({ title: `${pendingFiles.length} logo(s) salva(s) com sucesso!` });
      resetForm();
      await loadData();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setProgramaId("");
    setDataFinal("");
    setPendingFiles([]);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("logos_patrocinadores").delete().eq("id", id);
    await loadData();
  };

  const startEditDate = (logo: Logo) => {
    setEditingLogoId(logo.id);
    setEditDate(logo.data_final);
  };

  const saveEditDate = async () => {
    if (!editingLogoId || !editDate) return;
    const { error } = await supabase.from("logos_patrocinadores").update({ data_final: editDate, ativo: true }).eq("id", editingLogoId);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Validade atualizada!" });
    }
    setEditingLogoId(null);
    setEditDate("");
    await loadData();
  };

  // Group logos by programa
  const grouped = programas
    .map((p) => ({
      programa: p,
      logos: logos.filter((l) => l.programa_id === p.id && l.ativo),
    }))
    .filter((g) => g.logos.length > 0);

  if (loading) {
    return <ModulePageSkeleton />;
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Programa *</label>
            <Select value={programaId} onValueChange={setProgramaId}>
              <SelectTrigger><SelectValue placeholder="Selecione um programa" /></SelectTrigger>
              <SelectContent>
                {programas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Data de Expiração *</label>
            <Input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} required />
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? <><Loader2 className="animate-spin mr-2" size={14} /> Salvando...</> : `Salvar ${pendingFiles.length} logo(s)`}
          </Button>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground mb-1 block">
            Logos * <span className="text-xs text-muted-foreground font-normal">(1080×1080, fundo transparente)</span>
          </label>

          <div className="flex flex-wrap gap-3">
            {pendingFiles.map((pf, idx) => (
              <div key={idx} className="relative group">
                <img src={pf.preview} alt="" className="w-20 h-20 rounded-lg object-contain border bg-[repeating-conic-gradient(#ddd_0%_25%,transparent_0%_50%)_0_0/20px_20px]" />
                <button
                  type="button"
                  onClick={() => removePendingFile(idx)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}

            <label className="w-20 h-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
              <Plus size={18} className="text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground mt-1">Adicionar</span>
              <input type="file" accept="image/png" className="hidden" onChange={handleAddFile} />
            </label>
          </div>
        </div>
      </form>

      <div>
        <h3 className="text-lg font-semibold mb-4">Logos por Programa</h3>
        {grouped.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma logo ativa cadastrada.</p>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ programa, logos: gLogos }) => (
              <div key={programa.id} className="bg-card border border-border rounded-xl p-4">
                <h4 className="font-semibold text-foreground mb-3">{programa.nome}</h4>
                <div className="px-10">
                  <Carousel opts={{ align: "start" }} className="w-full">
                    <CarouselContent>
                      {gLogos.map((logo) => {
                        const diasRestantes = Math.ceil((new Date(logo.data_final + "T23:59:59").getTime() - Date.now()) / 86400000);
                        const isEditing = editingLogoId === logo.id;
                        return (
                          <CarouselItem key={logo.id} className="basis-1/3 md:basis-1/4 lg:basis-1/5">
                            <div className="space-y-2 text-center">
                              <div className="relative group">
                                <img
                                  src={logo.logo_url}
                                  alt=""
                                  className="w-full aspect-square rounded-lg object-contain border bg-[repeating-conic-gradient(#ddd_0%_25%,transparent_0%_50%)_0_0/20px_20px]"
                                />
                                <button
                                  onClick={() => handleDelete(logo.id)}
                                  className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                              <Badge variant={diasRestantes <= 7 ? "destructive" : "secondary"} className="text-[10px]">
                                {diasRestantes > 0 ? `${diasRestantes}d restantes` : "Expirando"}
                              </Badge>
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-7 text-[10px] px-1" />
                                  <button onClick={saveEditDate} className="text-green-500 hover:text-green-400"><Check size={14} /></button>
                                  <button onClick={() => setEditingLogoId(null)} className="text-red-500 hover:text-red-400"><X size={14} /></button>
                                </div>
                              ) : (
                                <button onClick={() => startEditDate(logo)} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 mx-auto">
                                  <Pencil size={10} /> Editar validade
                                </button>
                              )}
                            </div>
                          </CarouselItem>
                        );
                      })}
                    </CarouselContent>
                    <CarouselPrevious />
                    <CarouselNext />
                  </Carousel>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
