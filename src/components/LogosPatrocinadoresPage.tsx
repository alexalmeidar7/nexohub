import { useState, useEffect, useRef, useMemo, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Plus, Pencil, Check, X, Upload, ChevronDown, RotateCcw, Search, Copy } from "lucide-react";
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
  estudio?: string | null;
  horario_inicio?: string | null;
}

const inputStyle: React.CSSProperties = {
  backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid var(--layout-border-color, #333333)", color: "var(--layout-page-text, #1a1a1a)", borderRadius: "20px",
};

interface LogosPatrocinadoresPageProps {
  effectiveUserId?: string | null;
}

export default function LogosPatrocinadoresPage({ effectiveUserId }: LogosPatrocinadoresPageProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [logos, setLogos] = useState<Logo[]>([]);
  const [excludedLogos, setExcludedLogos] = useState<Logo[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dataUserId, setDataUserId] = useState<string | null>(effectiveUserId ?? null);

  const [programaId, setProgramaId] = useState("");
  const [programaIds, setProgramaIds] = useState<string[]>([]);
  const [programaPickerOpen, setProgramaPickerOpen] = useState(false);
  const [programaSearch, setProgramaSearch] = useState("");
  const programaPickerRef = useRef<HTMLDivElement>(null);
  const programaPortalRef = useRef<HTMLDivElement>(null);
  const programaTriggerRef = useRef<HTMLButtonElement>(null);
  const [programaPickerPos, setProgramaPickerPos] = useState<{ top: number; left: number; width: number } | null>(null);
  // Default expiration: last day of December of current year
  const defaultExpiration = useMemo(() => {
    const y = new Date().getFullYear();
    return `${y}-12-31`;
  }, []);
  const [dataFinal, setDataFinal] = useState(defaultExpiration);
  const [nomeLogo, setNomeLogo] = useState("");
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string; nome: string }[]>([]);
  const [existingLogoUrl, setExistingLogoUrl] = useState<string | null>(null);

  const [editingLogoId, setEditingLogoId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editingFullId, setEditingFullId] = useState<string | null>(null);

  const [cadastroOpen, setCadastroOpen] = useState(true);
  const [excluidasOpen, setExcluidasOpen] = useState(false);
  const [excluidasSearch, setExcluidasSearch] = useState("");
  const [restoreLogo, setRestoreLogo] = useState<Logo | null>(null);
  const [restoreProgramaId, setRestoreProgramaId] = useState<string>("");

  const dragItem = useRef<Logo | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (effectiveUserId) {
      setDataUserId(effectiveUserId);
      return;
    }

    if (!user) return;
    let cancelled = false;

    supabase
      .from("sub_users")
      .select("parent_user_id, ativo")
      .eq("auth_user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setDataUserId(data?.ativo && data.parent_user_id ? data.parent_user_id : user.id);
      });

    return () => {
      cancelled = true;
    };
  }, [user, effectiveUserId]);

  const loadData = async (targetUserId = dataUserId) => {
    if (!targetUserId) return;
    setLoading(true);
    try {
      const [, { data: lData }, { data: pData }] = await Promise.all([
        supabase.rpc("cleanup_comercial"),
        supabase.from("logos_patrocinadores").select("*").eq("user_id", targetUserId).order("created_at", { ascending: false }),
        supabase.from("programas").select("id, nome, estudio, horario_inicio").eq("user_id", targetUserId).eq("ativo", true),
      ]);

      const all = (lData || []) as Logo[];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 180);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isExpired = (l: Logo) => {
        if (!l.data_final) return false;
        const d = new Date(l.data_final + "T23:59:59");
        return d.getTime() < today.getTime();
      };

      setLogos(all.filter((l) => !l.excluido && !isExpired(l)));
      setExcludedLogos(
        all.filter((l) => {
          if (l.excluido && l.excluido_at && new Date(l.excluido_at) > cutoff) return true;
          if (!l.excluido && isExpired(l)) return true;
          return false;
        })
      );
      setProgramas(pData || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dataUserId) loadData(dataUserId);
  }, [dataUserId]);

  useEffect(() => {
    if (!programaPickerOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        (!programaPickerRef.current || !programaPickerRef.current.contains(target)) &&
        (!programaPortalRef.current || !programaPortalRef.current.contains(target)) &&
        (!programaTriggerRef.current || !programaTriggerRef.current.contains(target))
      ) {
        setProgramaPickerOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProgramaPickerOpen(false);
    };
    const updatePos = () => {
      const r = programaTriggerRef.current?.getBoundingClientRect();
      if (r) setProgramaPickerPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    updatePos();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [programaPickerOpen]);

  const handleAddFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const items = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      nome: file.name.replace(/\.[^.]+$/, "").trim().toUpperCase(),
    }));
    setPendingFiles((prev) => [...prev, ...items]);
    e.target.value = "";
  };

  const updatePendingName = (idx: number, nome: string) => {
    setPendingFiles((prev) => prev.map((p, i) => (i === idx ? { ...p, nome } : p)));
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadLogo = async (file: File): Promise<string> => {
    // Keep original PNG format — do NOT compress to webp for sponsor logos
    // Storage RLS requires the first folder segment to equal auth.uid()
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id;
    if (!uid) throw new Error("Não autenticado");
    const ext = file.name.split(".").pop() || "png";
    const path = `${uid}/logos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("comercial").upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from("comercial").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targets = editingFullId ? (programaId ? [programaId] : []) : programaIds;
    if (!user || targets.length === 0 || !dataFinal) {
      toast({ title: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }

    const toDbPid = (v: string) => (v === "__none__" ? null : v);

    // Edit mode: update existing logo
    if (editingFullId) {
      setSaving(true);
      try {
        const updateData: any = { programa_id: toDbPid(targets[0]), data_final: dataFinal, nome: nomeLogo };
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
      let count = 0;
      for (const pf of pendingFiles) {
        const logo_url = await uploadLogo(pf.file);
        const nomeFinal = (pf.nome || pf.file.name.replace(/\.[^.]+$/, "")).trim().toUpperCase();
        for (const pid of targets) {
          const { error } = await supabase.from("logos_patrocinadores").insert({
            user_id: dataUserId!,
            programa_id: toDbPid(pid),
            logo_url,
            data_final: dataFinal,
            nome: nomeFinal,
          } as any);
          if (error) throw error;
          count++;
        }
      }

      toast({ title: `${count} logo(s) salva(s) em ${targets.length} destino(s)!` });
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
    setProgramaIds([]);
    setDataFinal(defaultExpiration);
    setNomeLogo("");
    setPendingFiles([]);
    setExistingLogoUrl(null);
    setEditingFullId(null);
  };

  const startFullEdit = (logo: Logo) => {
    setEditingFullId(logo.id);
    setNomeLogo(logo.nome || "");
    setProgramaId(logo.programa_id || "__none__");
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

  const handleRestore = (logo: Logo) => {
    setRestoreLogo(logo);
    setRestoreProgramaId(logo.programa_id || "");
  };

  const confirmRestore = async () => {
    if (!restoreLogo) return;
    const programaId = restoreProgramaId || null;
    const { error } = await supabase
      .from("logos_patrocinadores")
      .update({ excluido: false, excluido_at: null, ativo: true, programa_id: programaId })
      .eq("id", restoreLogo.id);
    if (error) {
      toast({ title: "Erro ao restaurar", description: error.message, variant: "destructive" });
    } else {
      const progNome = programaId ? (programas.find(p => p.id === programaId)?.nome || "programa") : "SEM PROGRAMA";
      toast({ title: `Logo restaurada no programa ${progNome}` });
    }
    setRestoreLogo(null);
    setRestoreProgramaId("");
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

  const copyLogoToPrograma = async (logo: Logo, targetProgramaId: string) => {
    if (!targetProgramaId || targetProgramaId === logo.programa_id) return;
    const { error } = await supabase.from("logos_patrocinadores").insert({
      user_id: dataUserId,
      programa_id: targetProgramaId,
      logo_url: logo.logo_url,
      nome: logo.nome,
      data_final: logo.data_final,
      ativo: true,
      excluido: false,
    });
    if (error) {
      toast({ title: "Erro ao copiar logo", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Logo copiada com sucesso" });
      await loadData();
    }
  };

  const handleDrop = async (e: React.DragEvent, targetProgramaId?: string) => {
    e.preventDefault();
    e.currentTarget.classList.remove("ring-2", "ring-blue-400");
    const item = dragItem.current;
    if (!item) return;
    if (item.excluido) {
      await handleRestore(item);
    } else if (targetProgramaId) {
      await copyLogoToPrograma(item, targetProgramaId);
    }
    dragItem.current = null;
  };

  const [copyPrompt, setCopyPrompt] = useState<{ logo: Logo; programa: Programa } | null>(null);

  const handleProgramaContextMenu = (e: React.MouseEvent, programa: Programa) => {
    const item = dragItem.current;
    if (!item || item.excluido) return;
    if (item.programa_id === programa.id) return;
    e.preventDefault();
    setCopyPrompt({ logo: item, programa });
  };

  const confirmCopyPrompt = async () => {
    if (!copyPrompt) return;
    await copyLogoToPrograma(copyPrompt.logo, copyPrompt.programa.id);
    dragItem.current = null;
    setCopyPrompt(null);
  };

  const sortedProgramas = [...programas].sort((a, b) => (a.horario_inicio || "99:99").localeCompare(b.horario_inicio || "99:99"));

  // Normaliza o rótulo do estúdio para exibição/agrupamento (traz TODOS os estúdios)
  const normalizeEstudio = (raw?: string | null) => {
    const s = (raw || "").trim();
    if (!s) return "Sem estúdio";
    if (/podcast/i.test(s)) return "Estúdio Podcast";
    if (/fm/i.test(s)) return "Estúdio FM";
    if (/news|redação|redacao/i.test(s)) return "Redação / Newsroom";
    return s;
  };
  const estudioIcon = (label: string) => {
    if (/podcast/i.test(label)) return "🎙️";
    if (/fm/i.test(label)) return "📻";
    if (/news|redação|redacao/i.test(label)) return "📰";
    if (/sem estúdio/i.test(label)) return "📦";
    return "🎬";
  };
  const estudioColor = (label: string) => {
    if (/podcast/i.test(label)) return "#8B5CF6";
    if (/fm/i.test(label)) return "#00BFF0";
    if (/news|redação|redacao/i.test(label)) return "#F59E0B";
    return "#64748B";
  };

  // Agrupa dinamicamente por estúdio (qualquer estúdio existente)
  const groupedByStudio = useMemo(() => {
    const map = new Map<string, { programa: Programa; logos: Logo[] }[]>();
    sortedProgramas.forEach((p) => {
      const key = normalizeEstudio(p.estudio);
      const gLogos = logos.filter((l) => l.programa_id === p.id && l.ativo);
      if (!gLogos.length) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ programa: p, logos: gLogos });
    });
    // Grupo especial: logos sem programa vinculado
    const semProgLogos = logos.filter((l) => !l.programa_id && l.ativo);
    if (semProgLogos.length) {
      const placeholder = { id: "__none__", nome: "SEM PROGRAMA", estudio: "Geral", horario_inicio: "" } as unknown as Programa;
      map.set("Geral", [{ programa: placeholder, logos: semProgLogos }]);
    }
    // Ordem preferida: FM primeiro, depois Podcast, depois demais alfabético
    const order = (label: string) =>
      /fm/i.test(label) ? 0 : /podcast/i.test(label) ? 1 : /news|redação|redacao/i.test(label) ? 2 : /geral/i.test(label) ? 9 : 3;
    return Array.from(map.entries())
      .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
      .map(([label, items]) => ({ label, items }));
  }, [sortedProgramas, logos]);

  const groupedExcluded = programas
    .map((p) => ({
      programa: p,
      logos: excludedLogos.filter((l) => l.programa_id === p.id),
    }))
    .filter((g) => g.logos.length > 0);


  const logosXmlUrl = useMemo(() => {
    if (!dataUserId) return "";
    const base = import.meta.env.VITE_SUPABASE_URL || "";
    return `${base}/functions/v1/serve-xml-logos?user_id=${dataUserId}`;
  }, [dataUserId]);

  // LOGOS ALL: flat list of all active logos (no program grouping)
  const logosAllXmlContent = useMemo(() => {
    if (!logos.length) return "";
    const entries = logos.filter(l => l.ativo).map(l => {
      const progName = programas.find(p => p.id === l.programa_id)?.nome || "Sem programa";
      return `  <logo>\n    <cliente>${(l.nome || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</cliente>\n    <url>${l.logo_url}</url>\n  </logo>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<logos_all>\n${entries.join("\n")}\n</logos_all>`;
  }, [logos, programas]);

  if (loading || !dataUserId) {
    return (
      <div className="nexo-scope">
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-transparent overflow-hidden">
          <div className="h-full animate-pulse rounded-r" style={{ width: "60%", background: "var(--layout-accent-color, #e53e3e)", animation: "loadbar 1.2s ease-in-out infinite" }} />
        </div>
        <style>{`@keyframes loadbar { 0% { width: 10%; margin-left: 0; } 50% { width: 60%; margin-left: 20%; } 100% { width: 10%; margin-left: 90%; } }`}</style>
        <ModulePageSkeleton variant="form" />
      </div>
    );
  }

  return (
    <div className="nexo-scope animate-fade-in">
      <div className="rounded-2xl" style={{ background: "#D6F4FB", boxShadow: "0 8px 32px rgba(0,191,240,0.15)", padding: "20px", border: "1.5px solid #00BFF0" }}>

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
                {editingFullId && (
                  <div>
                    <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Nome *</label>
                    <input type="text" value={nomeLogo} onChange={(e) => setNomeLogo(e.target.value)} placeholder="Ex: Patrocinador X"
                      className="w-full px-4 py-1.5 text-sm outline-none uppercase font-bold"
                      style={inputStyle}
                      onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>
                    Programa(s) * {!editingFullId && programaIds.length > 0 && <span className="font-normal opacity-60">({programaIds.length} selecionado{programaIds.length > 1 ? "s" : ""})</span>}
                  </label>
                  {editingFullId ? (
                    <select value={programaId} onChange={(e) => setProgramaId(e.target.value)}
                      className="w-full px-4 py-1.5 text-sm outline-none appearance-none"
                      style={inputStyle}
                    >
                      <option value="">Selecione um programa</option>
                      <option value="__none__">— SEM PROGRAMA —</option>
                      {programas.map((p) => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="relative" ref={programaPickerRef}>
                      <button
                        ref={programaTriggerRef}
                        type="button"
                        onClick={() => setProgramaPickerOpen((v) => !v)}
                        className="w-full px-4 py-1.5 text-sm outline-none text-left flex items-center justify-between"
                        style={inputStyle}
                      >
                        <span className="truncate">
                          {programaIds.length === 0
                            ? "Selecione um ou mais programas"
                            : programaIds
                                .map((id) => id === "__none__" ? "SEM PROGRAMA" : programas.find((p) => p.id === id)?.nome)
                                .filter(Boolean)
                                .join(", ")}
                        </span>
                        <ChevronDown size={14} className="opacity-60 shrink-0 ml-2" />
                      </button>
                      {programaPickerOpen && programaPickerPos && createPortal(
                        <div
                          ref={programaPortalRef}
                          className="fixed rounded-xl shadow-2xl"
                          style={{
                            top: programaPickerPos.top,
                            left: programaPickerPos.left,
                            width: programaPickerPos.width,
                            zIndex: 9999,
                            backgroundColor: "var(--layout-page-bg, #ffffff)",
                            border: "1px solid var(--layout-border-color, #333333)",
                          }}
                        >
                          <div className="p-2 border-b" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
                            <div className="relative">
                              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
                              <input
                                type="text"
                                autoFocus
                                value={programaSearch}
                                onChange={(e) => setProgramaSearch(e.target.value)}
                                placeholder="Buscar programa..."
                                className="w-full pl-7 pr-2 py-1.5 text-xs outline-none rounded-md"
                                style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between px-3 py-1.5 border-b" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
                            <div className="flex gap-3">
                              <button type="button" onClick={() => setProgramaIds(programas.map((p) => p.id))} className="text-[11px] font-semibold opacity-70 hover:opacity-100" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                                Todos
                              </button>
                              <button type="button" onClick={() => setProgramaIds([])} className="text-[11px] font-semibold opacity-70 hover:opacity-100" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                                Limpar
                              </button>
                            </div>
                            <span className="text-[10px] opacity-60" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                              {programaIds.length} selecionado{programaIds.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="max-h-72 overflow-auto">
                            {"sem programa".includes(programaSearch.toLowerCase()) && (
                              <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-black/5 border-b" style={{ color: "var(--layout-page-text, #1a1a1a)", borderColor: "color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)" }}>
                                <input
                                  type="checkbox"
                                  checked={programaIds.includes("__none__")}
                                  onChange={(e) =>
                                    setProgramaIds((prev) => (e.target.checked ? [...prev, "__none__"] : prev.filter((x) => x !== "__none__")))
                                  }
                                />
                                <span className="text-sm flex-1 truncate font-bold uppercase" style={{ opacity: 0.85 }}>— Sem Programa —</span>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: "#64748B22", color: "#64748B" }}>Geral</span>
                              </label>
                            )}
                            {programas
                              .filter((p) => p.nome.toLowerCase().includes(programaSearch.toLowerCase()))
                              .map((p) => {
                                const checked = programaIds.includes(p.id);
                                return (
                                  <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-black/5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) =>
                                        setProgramaIds((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)))
                                      }
                                    />
                                    <span className="text-sm flex-1 truncate">{p.nome}</span>
                                    <span
                                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                                      style={{
                                        background: `${estudioColor(normalizeEstudio(p.estudio))}22`,
                                        color: estudioColor(normalizeEstudio(p.estudio)),
                                      }}
                                    >
                                      {estudioIcon(normalizeEstudio(p.estudio))} {normalizeEstudio(p.estudio)}
                                    </span>
                                  </label>

                                );
                              })}
                            {programas.filter((p) => p.nome.toLowerCase().includes(programaSearch.toLowerCase())).length === 0 && (
                              <div className="px-3 py-3 text-xs opacity-60 text-center" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nenhum programa encontrado</div>
                            )}
                          </div>
                          <div className="p-2 border-t" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
                            <button
                              type="button"
                              onClick={() => { setProgramaPickerOpen(false); setProgramaSearch(""); }}
                              className="w-full py-1.5 text-xs font-semibold rounded-md"
                              style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "#fff" }}
                            >
                              Concluir
                            </button>
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>
                  )}
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

                <Button variant="save" type="submit" disabled={saving}
                >
                  {saving ? <><Loader2 className="animate-spin" size={14} /> Salvando...</> : editingFullId ? "Atualizar Logo" : `Salvar ${pendingFiles.length} logo(s)`}
                </Button>
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
                    <div key={idx} className="relative group flex flex-col items-center w-24">
                      <img src={pf.preview} alt="" className="w-20 h-20 rounded-lg object-contain" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)", backgroundColor: "repeating-conic-gradient(#ddd 0% 25%,transparent 0% 50%) 0 0/20px 20px" }} />
                      <button type="button" onClick={() => removePendingFile(idx)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                      {!editingFullId && (
                        <input
                          type="text"
                          value={pf.nome}
                          onChange={(e) => updatePendingName(idx, e.target.value)}
                          placeholder="Nome"
                          className="w-full mt-1 px-1.5 py-0.5 text-[10px] uppercase font-bold rounded outline-none text-center"
                          style={{ ...inputStyle, borderRadius: "6px" }}
                        />
                      )}
                    </div>
                  ))}
                  <label className="w-20 h-20 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors"
                    style={{ border: "2px dashed color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 20%, transparent)"; }}
                  >
                    <Plus size={18} style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }} />
                    <span className="text-[10px] mt-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Adicionar</span>
                    <input type="file" accept="image/png" multiple={!editingFullId} className="hidden" onChange={handleAddFile} />
                  </label>
                </div>
                {!editingFullId && pendingFiles.length > 0 && (
                  <p className="text-[10px] mt-2" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                    O nome de cada logo foi extraído do arquivo. Você pode editar individualmente acima.
                  </p>
                )}
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
                      const refDate = logo.excluido_at ? new Date(logo.excluido_at) : (logo.data_final ? new Date(logo.data_final + "T23:59:59") : null);
                      const diasRestantes = refDate ? Math.max(0, 180 - Math.ceil((Date.now() - refDate.getTime()) / 86400000)) : 0;
                      const isExpiredOnly = !logo.excluido;
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
                          <span className="text-[9px] block" style={{ color: "#9ca3af" }}>{isExpiredOnly ? "vencida • " : ""}{diasRestantes}d para expirar</span>
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

        {/* Renderiza uma seção por estúdio (dinâmico — todos os estúdios existentes) */}
        {groupedByStudio.map(section => {
          const color = estudioColor(section.label);
          const icon = estudioIcon(section.label);
          const totalLogos = section.items.reduce((sum, g) => sum + g.logos.length, 0);
          return (
          <div key={section.label} className="mb-6">
            <div
              className="flex items-center gap-3 mb-3 px-3 py-2 rounded-xl"
              style={{
                background: `linear-gradient(90deg, ${color}18, transparent)`,
                borderLeft: `3px solid ${color}`,
              }}
            >
              <span
                className="flex items-center justify-center rounded-lg text-sm"
                style={{ width: 30, height: 30, background: `${color}22`, color }}
              >
                {icon}
              </span>
              <h2
                className="text-[13px] font-extrabold uppercase tracking-wider"
                style={{ color: "var(--layout-page-text, #1a1a1a)", letterSpacing: 1.5 }}
              >
                {section.label}
              </h2>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: color, color: "#fff" }}
              >
                {section.items.length} {section.items.length === 1 ? "programa" : "programas"}
              </span>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${color}22`, color }}
              >
                {totalLogos} {totalLogos === 1 ? "logo" : "logos"}
              </span>
            </div>
            {section.items.map(({ programa, logos: gLogos }) => (
              <Collapsible key={programa.id} defaultOpen={false}>
                <div className="rounded-xl overflow-hidden mb-3 transition-all hover:shadow-lg" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: `1px solid ${color}20` }}
                  onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, programa.id)}
                  onContextMenu={(e) => handleProgramaContextMenu(e, programa)}
                >
                  <CollapsibleTrigger asChild>
                    <button className="w-full px-4 py-2.5 flex items-center justify-between cursor-pointer" style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 70%, black 30%))` }}>
                      <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: "#ffffff" }}>
                        {programa.horario_inicio && (
                          <span className="text-[10px] font-mono opacity-80 px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.2)" }}>{programa.horario_inicio.slice(0,5)}</span>
                        )}
                        {programa.nome}
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.25)" }}>{gLogos.length}</span>
                      </h3>
                      <ChevronDown size={16} className="transition-transform duration-200 ui-open:rotate-180" style={{ color: "#ffffff" }} />
                    </button>
                  </CollapsibleTrigger>

                  {copyPrompt && copyPrompt.programa.id === programa.id && (
                    <div className="px-4 py-3" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 8%, var(--layout-page-bg, #ffffff))", borderTop: "1px solid var(--layout-border-color, #333333)", borderBottom: "1px solid var(--layout-border-color, #333333)" }}>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-sm" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                          Deseja copiar a logo <strong>"{copyPrompt.logo.nome}"</strong> para este programa?
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => setCopyPrompt(null)}
                            className="px-4 py-1.5 text-xs font-semibold rounded-full"
                            style={{ border: "1px solid var(--layout-border-color, #333333)", color: "var(--layout-page-text, #1a1a1a)", backgroundColor: "var(--layout-page-bg, #ffffff)" }}>
                            Cancelar
                          </button>
                          <button onClick={confirmCopyPrompt}
                            className="px-4 py-1.5 text-xs font-semibold rounded-full text-white"
                            style={{ backgroundColor: "var(--layout-accent-color, #2563eb)" }}>
                            Copiar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  <CollapsibleContent>
                    <div className="p-3 sm:p-4 px-4 sm:px-10">
                      <Carousel opts={{ align: "start" }} className="w-full">
                        <CarouselContent>
                          {gLogos.map((logo) => {
                            const diasRestantes = Math.ceil((new Date(logo.data_final + "T23:59:59").getTime() - Date.now()) / 86400000);
                            return (
                              <CarouselItem key={logo.id} className="basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5">
                                <div className="space-y-2 text-center cursor-grab active:cursor-grabbing"
                                  draggable
                                  onDragStart={() => handleDragStart(logo)}
                                  onMouseDown={() => { dragItem.current = logo; }}
                                  title="Arraste para outro programa para copiar (ou clique e use o botão direito no programa de destino)"
                                >
                                  <div className="relative group">
                                    <img src={logo.logo_url} alt={logo.nome} className="w-full aspect-square rounded-lg object-contain p-2 transition-all group-hover:ring-2" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)", backgroundColor: "#2d2d2d", ['--tw-ring-color' as any]: "var(--layout-accent-color, #2563eb)" }} />
                                    <button onClick={(e) => { e.stopPropagation(); dragItem.current = logo; toast({ title: "Logo selecionada", description: "Clique com o botão direito no programa de destino para copiar." }); }}
                                      className="absolute top-1 left-1 bg-blue-500/80 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                      title="Copiar para outro programa">
                                      <Copy size={12} />
                                    </button>
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
          );
        })}
      </div>
      {restoreLogo && createPortal(
        <div
          onClick={() => setRestoreLogo(null)}
          style={{ position: "fixed", inset: 0, zIndex: 2147483001, background: "rgba(10,37,64,0.55)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "Montserrat, sans-serif" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 460, overflow: "hidden", boxShadow: "0 24px 60px rgba(10,37,64,0.25)", border: "1px solid #00BFF033" }}
          >
            <div style={{ background: "linear-gradient(135deg,#00BFF0 0%,#00A9D6 100%)", padding: "18px 22px", color: "#fff", fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em" }}>
              Restaurar Logo
            </div>
            <div style={{ padding: 22, background: "#D6F4FB" }}>
              <p style={{ color: "#0A2540", fontSize: 13, fontWeight: 600, margin: "0 0 12px" }}>
                Escolha o programa para restaurar a logo{restoreLogo.nome ? ` "${restoreLogo.nome}"` : ""}:
              </p>
              <select
                value={restoreProgramaId}
                onChange={(e) => setRestoreProgramaId(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 999, border: "2px solid #00BFF0", background: "#fff", color: "#0A2540", fontSize: 13, fontWeight: 600, fontFamily: "Montserrat, sans-serif", outline: "none" }}
              >
                <option value="">— SEM PROGRAMA —</option>
                {[...programas].sort((a, b) => a.nome.localeCompare(b.nome)).map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 18px", background: "#fff", borderTop: "1px solid #00BFF022" }}>
              <button
                type="button"
                onClick={() => setRestoreLogo(null)}
                style={{ padding: "9px 18px", borderRadius: 999, border: "2px solid #00BFF0", background: "#fff", color: "#0A2540", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer", fontFamily: "Montserrat, sans-serif" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmRestore}
                style={{ padding: "9px 20px", borderRadius: 999, border: "none", background: "#00BFF0", color: "#0A2540", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer", fontFamily: "Montserrat, sans-serif", boxShadow: "0 4px 14px #00BFF055" }}
              >
                OK
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
