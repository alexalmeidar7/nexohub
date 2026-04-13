import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Plus, Pencil, Check, X, Upload, ChevronDown, RotateCcw, Search } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { useToast } from "@/hooks/use-toast";

import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import XmlLinkRow from "./XmlLinkRow";

interface Logo {
  id: string;
  programa_id: string;
  logo_url: string;
  data_final: string;
  ativo: boolean;
  created_at: string;
  nome: string;
  excluido: boolean;
  excluido_at: string | null;
}

interface Programa {
  id: string;
  nome: string;
}

const inputStyle: React.CSSProperties = {
  backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid var(--layout-border-color, #333333)", color: "var(--layout-page-text, #1a1a1a)", borderRadius: "20px",
};

export default function LogosPatrocinadoresPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [logos, setLogos] = useState<Logo[]>([]);
  const [excludedLogos, setExcludedLogos] = useState<Logo[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [programaId, setProgramaId] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [nomeLogo, setNomeLogo] = useState("");
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string }[]>([]);
  const [existingLogoUrl, setExistingLogoUrl] = useState<string | null>(null);

  const [editingLogoId, setEditingLogoId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editingFullId, setEditingFullId] = useState<string | null>(null);

  const [cadastroOpen, setCadastroOpen] = useState(true);
  const [excluidasOpen, setExcluidasOpen] = useState(false);
  const [excluidasSearch, setExcluidasSearch] = useState("");

  const dragItem = useRef<Logo | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

    const all = (lData || []) as Logo[];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 180);

    setLogos(all.filter((l) => !l.excluido));
    setExcludedLogos(all.filter((l) => l.excluido && l.excluido_at && new Date(l.excluido_at) > cutoff));
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
    // Keep original PNG format — do NOT compress to webp for sponsor logos
    const ext = file.name.split(".").pop() || "png";
    const path = `logos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("comercial").upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from("comercial").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !programaId || !dataFinal) {
      toast({ title: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }

    // Edit mode: update existing logo
    if (editingFullId) {
      setSaving(true);
      try {
        const updateData: any = { programa_id: programaId, data_final: dataFinal, nome: nomeLogo };
        // If new file uploaded, replace image
        if (pendingFiles.length > 0) {
          updateData.logo_url = await uploadLogo(pendingFiles[0].file);
        }
        const { error } = await supabase.from("logos_patrocinadores").update(updateData).eq("id", editingFullId);
        if (error) throw error;
        toast({ title: "Logo atualizada com sucesso!" });
        resetForm();
        await loadData();
      } catch (err: any) {
        toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
      } finally {
        setSaving(false);
      }
      return;
    }

    // Create mode
    if (pendingFiles.length === 0) {
      toast({ title: "Adicione pelo menos uma logo.", variant: "destructive" });
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
          nome: nomeLogo,
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
    setNomeLogo("");
    setPendingFiles([]);
    setExistingLogoUrl(null);
    setEditingFullId(null);
  };

  const startFullEdit = (logo: Logo) => {
    setEditingFullId(logo.id);
    setNomeLogo(logo.nome || "");
    setProgramaId(logo.programa_id);
    setDataFinal(logo.data_final);
    setExistingLogoUrl(logo.logo_url);
    setPendingFiles([]);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSoftDelete = async (id: string) => {
    const { error } = await supabase.from("logos_patrocinadores").update({ excluido: true, excluido_at: new Date().toISOString(), ativo: false }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Logo movida para Excluídas" });
    }
    await loadData();
  };

  const handleRestore = async (logo: Logo) => {
    const { error } = await supabase.from("logos_patrocinadores").update({ excluido: false, excluido_at: null, ativo: true }).eq("id", logo.id);
    if (error) {
      toast({ title: "Erro ao restaurar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Logo restaurada com sucesso!" });
    }
    await loadData();
  };

  const handlePermanentDelete = async (id: string) => {
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

  // Drag handlers for restoring excluded logos
  const handleDragStart = (logo: Logo) => {
    dragItem.current = logo;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("ring-2", "ring-blue-400");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("ring-2", "ring-blue-400");
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("ring-2", "ring-blue-400");
    if (dragItem.current && dragItem.current.excluido) {
      await handleRestore(dragItem.current);
      dragItem.current = null;
    }
  };

  const grouped = programas
    .map((p) => ({
      programa: p,
      logos: logos.filter((l) => l.programa_id === p.id && l.ativo),
    }))
    .filter((g) => g.logos.length > 0);

  const groupedExcluded = programas
    .map((p) => ({
      programa: p,
      logos: excludedLogos.filter((l) => l.programa_id === p.id),
    }))
    .filter((g) => g.logos.length > 0);

  const logosXmlUrl = useMemo(() => {
    if (!user?.id) return "";
    const base = import.meta.env.VITE_SUPABASE_URL || "";
    return `${base}/functions/v1/serve-xml-logos?user_id=${user.id}`;
  }, [user?.id]);

  // LOGOS ALL: flat list of all active logos (no program grouping)
  const logosAllXmlContent = useMemo(() => {
    if (!logos.length) return "";
    const entries = logos.filter(l => l.ativo).map(l => {
      const progName = programas.find(p => p.id === l.programa_id)?.nome || "Sem programa";
      return `  <logo>\n    <cliente>${(l.nome || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</cliente>\n    <url>${l.logo_url}</url>\n  </logo>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<logos_all>\n${entries.join("\n")}\n</logos_all>`;
  }, [logos, programas]);

  if (loading) {
    return <ModulePageSkeleton variant="form" />;
  }

  return (
    <div className="animate-fade-in">
      <div className="rounded-2xl" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 12%, var(--layout-page-bg, #ffffff) 88%)", boxShadow: "0 8px 32px rgba(0,0,0,0.10)", padding: "20px" }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
            <Upload size={20} style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
          </div>
          <div className="shrink-0">
            <h3 className="text-base font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Logos de Patrocinadores</h3>
            <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Gerencie as logos vinculadas aos programas</p>
          </div>
          <div className="ml-4 space-y-1 max-w-sm">
            {logosXmlUrl && <XmlLinkRow label="XML LOGOS" permanentUrl={logosXmlUrl} dark />}
            {logosAllXmlContent && <XmlLinkRow label="LOGOS ALL" xmlContent={logosAllXmlContent} dark />}
          </div>
        </div>

        {/* Form */}
        <form ref={formRef} onSubmit={handleSubmit} className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
            <h3 className="text-sm font-bold" style={{ color: "var(--layout-header-text, #ffffff)" }}>
              {editingFullId ? "✏️ Editar Logo de Patrocinador" : "➕ Nova Logo de Patrocinador"}
            </h3>
            {editingFullId && (
              <button type="button" onClick={resetForm} className="text-[10px] transition-colors" style={{ color: "var(--layout-header-text, #ffffff)", opacity: 0.7 }}>
                Cancelar edição
              </button>
            )}
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Nome *</label>
                  <input type="text" value={nomeLogo} onChange={(e) => setNomeLogo(e.target.value)} placeholder="Ex: Patrocinador X"
                    className="w-full px-4 py-1.5 text-sm outline-none uppercase font-bold"
                    style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Programa *</label>
                  <select value={programaId} onChange={(e) => setProgramaId(e.target.value)}
                    className="w-full px-4 py-1.5 text-sm outline-none appearance-none"
                    style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                  >
                    <option value="">Selecione um programa</option>
                    {programas.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Data de Expiração *</label>
                  <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} required
                    className="w-full px-4 py-1.5 text-sm outline-none"
                    style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                  />
                </div>

                <button type="submit" disabled={saving}
                  className="btn-skyglass-accent w-full py-2.5 text-sm disabled:opacity-50"
                >
                  {saving ? <><Loader2 className="animate-spin" size={14} /> Salvando...</> : editingFullId ? "Atualizar Logo" : `Salvar ${pendingFiles.length} logo(s)`}
                </button>
              </div>

              <div className="space-y-3">
                <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>
                  Logo {editingFullId ? "" : "*"} <span className="font-normal" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>(1080×1080, fundo transparente)</span>
                </label>
                <div className="flex flex-wrap gap-3">
                  {existingLogoUrl && pendingFiles.length === 0 && (
                    <div className="relative group">
                      <img src={existingLogoUrl} alt="" className="w-20 h-20 rounded-lg object-contain" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)", backgroundColor: "var(--layout-header-bg, #1a1a1a)" }} />
                      <span className="text-[8px] text-center block mt-0.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Atual</span>
                    </div>
                  )}
                  {pendingFiles.map((pf, idx) => (
                    <div key={idx} className="relative group">
                      <img src={pf.preview} alt="" className="w-20 h-20 rounded-lg object-contain" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)", backgroundColor: "repeating-conic-gradient(#ddd 0% 25%,transparent 0% 50%) 0 0/20px 20px" }} />
                      <button type="button" onClick={() => removePendingFile(idx)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                    </div>
                  ))}
                  <label className="w-20 h-20 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors"
                    style={{ border: "2px dashed color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 20%, transparent)"; }}
                  >
                    <Plus size={18} style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }} />
                    <span className="text-[10px] mt-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Adicionar</span>
                    <input type="file" accept="image/png" className="hidden" onChange={handleAddFile} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Excluded Logos - right after form */}
        <Collapsible open={excluidasOpen} onOpenChange={setExcluidasOpen}>
          <div className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <CollapsibleTrigger asChild>
              <button className="w-full px-4 py-2.5 flex items-center justify-between cursor-pointer" style={{ background: "linear-gradient(135deg, #6b7280, #4b5563)" }}>
                <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--layout-header-text, #ffffff)" }}>
                  🗑️ Logos Excluídas
                  {excludedLogos.length > 0 && (
                    <span className="text-[10px] font-normal bg-white/20 px-2 py-0.5 rounded-full">{excludedLogos.length}</span>
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  {excluidasOpen && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--layout-header-text, #ffffff)", opacity: 0.5 }} />
                        <input
                          type="text"
                          value={excluidasSearch}
                          onChange={(e) => setExcluidasSearch(e.target.value)}
                          placeholder="Buscar logo..."
                          className="pl-7 pr-3 py-1 text-[11px] rounded-full outline-none w-40"
                          style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "var(--layout-header-text, #ffffff)", border: "1px solid rgba(255,255,255,0.25)" }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)"; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
                        />
                      </div>
                    </div>
                  )}
                  <ChevronDown size={16} className={`transition-transform duration-200 ${excluidasOpen ? "rotate-180" : ""}`} style={{ color: "var(--layout-header-text, #ffffff)" }} />
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {(() => {
                const filtered = excludedLogos.filter((l) => {
                  if (!excluidasSearch) return true;
                  const q = excluidasSearch.toLowerCase();
                  return (l.nome || "").toLowerCase().includes(q);
                });
                return filtered.length === 0 ? (
                  <p className="text-sm py-8 text-center" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                    {excludedLogos.length === 0 ? "Nenhuma logo excluída." : "Nenhuma logo encontrada."}
                  </p>
                ) : (
                <div className="p-4">
                  <p className="text-[10px] mb-3" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                    Arraste uma logo para um programa para restaurá-la, ou clique no botão de restaurar.
                    <br />Logos excluídas são mantidas por até 180 dias.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {filtered.map((logo) => {
                      const diasRestantes = logo.excluido_at ? Math.max(0, 180 - Math.ceil((Date.now() - new Date(logo.excluido_at).getTime()) / 86400000)) : 0;
                      return (
                        <div key={logo.id} className="w-24 space-y-1 text-center opacity-70 hover:opacity-100 transition-opacity cursor-grab"
                          draggable
                          onDragStart={() => handleDragStart(logo)}
                        >
                          <div className="relative group">
                            <img src={logo.logo_url} alt={logo.nome} className="w-full aspect-square rounded-lg object-contain p-1" style={{ border: "1px solid rgba(107,114,128,0.2)", backgroundColor: "var(--layout-header-bg, #1a1a1a)", filter: "grayscale(50%)" }} />
                            <div className="absolute inset-0 rounded-lg flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
                              <button onClick={() => handleRestore(logo)} className="bg-green-500 text-white rounded-full w-7 h-7 flex items-center justify-center" title="Restaurar">
                                <RotateCcw size={13} />
                              </button>
                              <button onClick={() => handlePermanentDelete(logo.id)} className="bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center" title="Excluir permanentemente">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                          {logo.nome && (
                            <p className="text-[10px] font-semibold truncate" style={{ color: "#6b7280" }}>{logo.nome}</p>
                          )}
                          <span className="text-[9px] block" style={{ color: "#9ca3af" }}>{diasRestantes}d para expirar</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })()}
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Each program as its own collapsible section */}
        {grouped.map(({ programa, logos: gLogos }) => (
          <Collapsible key={programa.id} defaultOpen>
            <div className="rounded-xl overflow-hidden mb-4" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            >
              <CollapsibleTrigger asChild>
                <button className="w-full px-4 py-2.5 flex items-center justify-between cursor-pointer" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))" }}>
                  <h3 className="text-sm font-bold" style={{ color: "var(--layout-header-text, #ffffff)" }}>{programa.nome}</h3>
                  <ChevronDown size={16} className="transition-transform duration-200" style={{ color: "var(--layout-header-text, #ffffff)" }} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-3 sm:p-4 px-4 sm:px-10">
                  <Carousel opts={{ align: "start" }} className="w-full">
                    <CarouselContent>
                      {gLogos.map((logo) => {
                        const diasRestantes = Math.ceil((new Date(logo.data_final + "T23:59:59").getTime() - Date.now()) / 86400000);
                        const isEditing = editingLogoId === logo.id;
                        return (
                          <CarouselItem key={logo.id} className="basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5">
                            <div className="space-y-2 text-center">
                              <div className="relative group">
                                <img src={logo.logo_url} alt={logo.nome} className="w-full aspect-square rounded-lg object-contain p-2" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)", backgroundColor: "#2d2d2d" }} />
                                <button onClick={() => handleSoftDelete(logo.id)}
                                  className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                              {logo.nome && (
                                <p className="text-[11px] font-semibold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{logo.nome}</p>
                              )}
                              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${diasRestantes <= 7 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}>
                                {diasRestantes > 0 ? `${diasRestantes}d restantes` : "Expirando"}
                              </span>
                              <button onClick={() => startFullEdit(logo)} className="text-[10px] flex items-center gap-1 mx-auto transition-colors"
                                style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}
                                onMouseEnter={e => { e.currentTarget.style.color = "var(--layout-accent-color, #2563eb)"; }}
                                onMouseLeave={e => { e.currentTarget.style.color = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)"; }}
                              >
                                <Pencil size={10} /> Editar
                              </button>
                            </div>
                          </CarouselItem>
                        );
                      })}
                    </CarouselContent>
                    <CarouselPrevious className="hidden sm:flex" />
                    <CarouselNext className="hidden sm:flex" />
                  </Carousel>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}
