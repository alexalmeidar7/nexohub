import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Plus, Pencil, Check, X, CheckCircle, Upload } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { useToast } from "@/hooks/use-toast";
import { compressImage } from "@/lib/imageCompressor";
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

const inputStyle: React.CSSProperties = {
  backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px",
};
const btnPrimary: React.CSSProperties = { backgroundColor: "#0d0446", color: "#ffffff", border: "2px solid #0d0446", borderRadius: "20px" };
const btnSecondary: React.CSSProperties = { backgroundColor: "#ffffff", color: "#0d0446", border: "2px solid #0d0446", borderRadius: "20px" };

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
    const compressed = await compressImage(file);
    const ext = compressed.name.split(".").pop();
    const path = `logos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("comercial").upload(path, compressed, { upsert: true });
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
    <div className="space-y-8 animate-fade-in">
      <form onSubmit={handleSubmit} className="rounded-xl p-6 space-y-4" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.1)" }}>
        <h3 className="text-lg font-bold" style={{ color: "#0d0446" }}>Nova Logo de Patrocinador</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: "#0d0446", fontWeight: 600 }}>Programa *</label>
              <select value={programaId} onChange={(e) => setProgramaId(e.target.value)}
                className="w-full px-4 py-1.5 text-sm outline-none appearance-none"
                style={{ ...inputStyle, backgroundColor: programaId ? "#ffffff" : "#ffffff" }}
                onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
              >
                <option value="">Selecione um programa</option>
                {programas.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: "#0d0446", fontWeight: 600 }}>Data de Expiração *</label>
              <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} required
                className="w-full px-4 py-1.5 text-sm outline-none"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
              />
            </div>

            <button type="submit" disabled={saving}
              className="w-full px-6 py-2 font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              style={btnPrimary}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "#0d0446"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
            >
              {saving ? <><Loader2 className="animate-spin" size={14} /> Salvando...</> : `Salvar ${pendingFiles.length} logo(s)`}
            </button>
          </div>

          <div className="space-y-3">
            <label className="block text-xs mb-1" style={{ color: "#0d0446", fontWeight: 600 }}>
              Logos * <span className="font-normal" style={{ color: "rgba(13,4,70,0.5)" }}>(1080×1080, fundo transparente)</span>
            </label>

            <div className="flex flex-wrap gap-3">
              {pendingFiles.map((pf, idx) => (
                <div key={idx} className="relative group">
                  <img src={pf.preview} alt="" className="w-20 h-20 rounded-lg object-contain" style={{ border: "1px solid rgba(13,4,70,0.1)", backgroundColor: "repeating-conic-gradient(#ddd 0% 25%,transparent 0% 50%) 0 0/20px 20px" }} />
                  <button
                    type="button"
                    onClick={() => removePendingFile(idx)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}

              <label className="w-20 h-20 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors"
                style={{ border: "2px dashed rgba(13,4,70,0.2)" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(13,4,70,0.2)"; }}
              >
                <Plus size={18} style={{ color: "rgba(13,4,70,0.4)" }} />
                <span className="text-[10px] mt-1" style={{ color: "rgba(13,4,70,0.4)" }}>Adicionar</span>
                <input type="file" accept="image/png" className="hidden" onChange={handleAddFile} />
              </label>
            </div>
          </div>
        </div>
      </form>

      <div>
        <h3 className="text-lg font-bold mb-4" style={{ color: "#0d0446" }}>Logos por Programa</h3>
        {grouped.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(13,4,70,0.5)" }}>Nenhuma logo ativa cadastrada.</p>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ programa, logos: gLogos }) => (
              <div key={programa.id} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.1)" }}>
                <div className="px-4 py-2 font-semibold text-sm" style={{ backgroundColor: "#0d0446", color: "#ffffff" }}>
                  {programa.nome}
                </div>
                <div className="p-4 px-10" style={{ backgroundColor: "#ffffff" }}>
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
                                  className="w-full aspect-square rounded-lg object-contain"
                                  style={{ border: "1px solid rgba(13,4,70,0.08)", backgroundColor: "#0d0446" }}
                                />
                                <button
                                  onClick={() => handleDelete(logo.id)}
                                  className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${diasRestantes <= 7 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}>
                                {diasRestantes > 0 ? `${diasRestantes}d restantes` : "Expirando"}
                              </span>
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-7 text-[10px] px-1 rounded" style={{ border: "1px solid #0d0446", color: "#0d0446" }} />
                                  <button onClick={saveEditDate} style={{ color: "#22c55e" }}><Check size={14} /></button>
                                  <button onClick={() => setEditingLogoId(null)} style={{ color: "#dc2626" }}><X size={14} /></button>
                                </div>
                              ) : (
                                <button onClick={() => startEditDate(logo)} className="text-[10px] flex items-center gap-1 mx-auto transition-colors"
                                  style={{ color: "rgba(13,4,70,0.4)" }}
                                  onMouseEnter={e => { e.currentTarget.style.color = "#2dbef3"; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = "rgba(13,4,70,0.4)"; }}
                                >
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
