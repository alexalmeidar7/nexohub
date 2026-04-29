import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Trash2, Image as ImageIcon, Upload, Save, Tv, Link as LinkIcon, Copy, Loader2, LayoutGrid, Radio, ArrowRight, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { uploadImageToStorage } from "@/lib/uploadImageToStorage";
import { compressImage } from "@/lib/imageCompressor";
import { toast } from "sonner";

interface Programa {
  id: string;
  nome: string;
  ativo: boolean;
}

interface Grupo {
  id: string;
  user_id: string;
  nome: string;
  rows: number;
  cols: number;
  programa_ids: string[];
  tvs: TV[];
}

interface TV {
  id?: string;
  posicao: number;
  imagem_url: string;
  _localPreview?: string;
  _file?: File;
}

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(String(reader.result));
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });

/* ─── Layout-token styles (respect user theme) ─── */
const layoutCardStyle: React.CSSProperties = {
  background: "color-mix(in srgb, var(--layout-page-text, #0d0446) 4%, var(--layout-page-bg, #ffffff))",
  color: "var(--layout-page-text, #0d0446)",
  border: "1px solid color-mix(in srgb, var(--layout-page-text, #0d0446) 10%, transparent)",
};
const layoutInnerStyle: React.CSSProperties = {
  background: "color-mix(in srgb, var(--layout-page-text, #0d0446) 5%, var(--layout-page-bg, #ffffff))",
  border: "1px solid color-mix(in srgb, var(--layout-page-text, #0d0446) 10%, transparent)",
};
const layoutTextMuted: React.CSSProperties = {
  color: "color-mix(in srgb, var(--layout-page-text, #0d0446) 70%, transparent)",
};
const layoutText: React.CSSProperties = { color: "var(--layout-page-text, #0d0446)" };
const layoutAccentSoft: React.CSSProperties = {
  background: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 14%, transparent)",
};
const layoutAccent: React.CSSProperties = { color: "var(--layout-accent-color, #2563eb)" };

export default function CenariosEstudioPage() {
  const { user } = useAuth();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());

  const xmlUrl = useMemo(() => {
    if (!user?.id) return "";
    const base = (import.meta as any).env?.VITE_SUPABASE_URL || "";
    return `${base}/functions/v1/serve-xml-cenarios-estudio?uid=${user.id}`;
  }, [user?.id]);

  const loadAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [gruposRes, tvsRes, progsRes] = await Promise.all([
      supabase.from("cenario_estudio_grupos" as any).select("*").eq("user_id", user.id).order("created_at"),
      supabase.from("cenario_estudio_tvs" as any).select("*").eq("user_id", user.id).order("posicao"),
      supabase.from("programas").select("id, nome, ativo").eq("user_id", user.id).eq("ativo", true).order("nome"),
    ]);
    const tvsByGrupo: Record<string, TV[]> = {};
    ((tvsRes.data as any[]) || []).forEach((t) => {
      tvsByGrupo[t.grupo_id] = tvsByGrupo[t.grupo_id] || [];
      tvsByGrupo[t.grupo_id].push({ id: t.id, posicao: t.posicao, imagem_url: t.imagem_url || "" });
    });
    const gs: Grupo[] = ((gruposRes.data as any[]) || []).map((g) => ({
      id: g.id,
      user_id: g.user_id,
      nome: g.nome,
      rows: g.rows,
      cols: g.cols,
      programa_ids: g.programa_ids || [],
      tvs: tvsByGrupo[g.id] || [],
    }));
    setGrupos(gs);
    setProgramas((progsRes.data as Programa[]) || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const addGrupo = async () => {
    if (!user?.id) return;
    const { data, error } = await (supabase as any)
      .from("cenario_estudio_grupos")
      .insert({ user_id: user.id, nome: "Novo template", rows: 1, cols: 2, programa_ids: [] })
      .select()
      .single();
    if (error) {
      toast.error("Erro ao criar grupo");
      return;
    }
    setGrupos((prev) => [...prev, { ...(data as any), tvs: [], programa_ids: [] }]);
    setEditingIds((prev) => new Set(prev).add((data as any).id));
    toast.success("Template criado");
  };

  const updateGrupo = (id: string, patch: Partial<Grupo>) => {
    setGrupos((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const removeGrupo = async (id: string) => {
    if (!confirm("Excluir este template e todas as suas TVs?")) return;
    const { error } = await (supabase as any).from("cenario_estudio_grupos").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir");
      return;
    }
    setGrupos((prev) => prev.filter((g) => g.id !== id));
    setEditingIds((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    toast.success("Template excluído");
  };

  // Single artwork per group: stored at posicao=0
  const setGrupoArte = async (grupoId: string, file: File) => {
    const compressed = await compressImage(file, 3840, 3840, 0.9);
    const dataUrl = await fileToDataUrl(compressed);
    setGrupos((prev) =>
      prev.map((g) => {
        if (g.id !== grupoId) return g;
        const others = g.tvs.filter((t) => t.posicao !== 0);
        const existing = g.tvs.find((t) => t.posicao === 0);
        const next: TV = { ...(existing || { posicao: 0, imagem_url: "" }), _localPreview: dataUrl, _file: compressed };
        return { ...g, tvs: [next, ...others] };
      }),
    );
  };

  const removeGrupoArte = (grupoId: string) => {
    setGrupos((prev) =>
      prev.map((g) => {
        if (g.id !== grupoId) return g;
        return {
          ...g,
          tvs: g.tvs
            .filter((t) => t.posicao !== 0)
            .concat([{ posicao: 0, imagem_url: "", _localPreview: undefined, _file: undefined }]),
        };
      }),
    );
  };

  const saveGrupo = async (grupo: Grupo) => {
    if (!user?.id) return;
    setSavingId(grupo.id);
    try {
      // 1) update grupo
      const { error: gErr } = await (supabase as any)
        .from("cenario_estudio_grupos")
        .update({
          nome: grupo.nome,
          rows: grupo.rows,
          cols: grupo.cols,
          programa_ids: grupo.programa_ids,
        })
        .eq("id", grupo.id);
      if (gErr) throw gErr;

      // 2) upload single artwork (posicao=0) if pending
      const arte = grupo.tvs.find((t) => t.posicao === 0);
      let arteUrl = arte?.imagem_url || "";
      if (arte?._file) {
        // Upload as PNG directly (vMix compatibility - URL must end in .png)
        const pngPath = `${user.id}/${grupo.id}/arte-${Date.now()}.png`;
        const { error: upErr } = await (supabase as any).storage
          .from("cenario-estudio")
          .upload(pngPath, arte._file, { upsert: true, contentType: "image/png", cacheControl: "3600" });
        if (upErr) throw upErr;
        const { data: urlData } = (supabase as any).storage.from("cenario-estudio").getPublicUrl(pngPath);
        arteUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      }

      // 3) replace TVs (single record holding the artwork)
      await (supabase as any).from("cenario_estudio_tvs").delete().eq("grupo_id", grupo.id);
      if (arteUrl) {
        const { error: tErr } = await (supabase as any).from("cenario_estudio_tvs").insert([
          { grupo_id: grupo.id, user_id: user.id, posicao: 0, imagem_url: arteUrl },
        ]);
        if (tErr) throw tErr;
      }

      // Bump grupo updated_at so XML cache-buster reflects the change immediately
      await (supabase as any)
        .from("cenario_estudio_grupos")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", grupo.id);

      toast.success("Template salvo");
      setEditingIds((prev) => {
        const n = new Set(prev);
        n.delete(grupo.id);
        return n;
      });
      await loadAll();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar grupo");
    } finally {
      setSavingId(null);
    }
  };

  const toggleProgramaInGrupo = (grupoId: string, programaId: string) => {
    setGrupos((prev) =>
      prev.map((g) => {
        if (g.id !== grupoId) return g;
        const has = g.programa_ids.includes(programaId);
        return {
          ...g,
          programa_ids: has ? g.programa_ids.filter((p) => p !== programaId) : [...g.programa_ids, programaId],
        };
      }),
    );
  };

  const copyXmlUrl = () => {
    navigator.clipboard.writeText(xmlUrl);
    toast.success("Link XML copiado");
  };

  if (loading) {
    return (
      <div className="space-y-5">
        {/* Header skeleton */}
        <Card className="p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full max-w-md" />
              </div>
            </div>
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="mt-4 pt-4 border-t border-border/60">
            <Skeleton className="h-3 w-32 mb-2" />
            <Skeleton className="h-10 w-full" />
          </div>
        </Card>

        {/* Group skeletons */}
        {[0, 1].map((i) => (
          <Card key={i} className="p-5 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3">
              <div className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-9 w-full" /></div>
              <div className="space-y-2"><Skeleton className="h-3 w-12" /><Skeleton className="h-9 w-24" /></div>
              <div className="space-y-2"><Skeleton className="h-3 w-16" /><Skeleton className="h-9 w-24" /></div>
              <div className="flex gap-2 items-end"><Skeleton className="h-9 w-20" /><Skeleton className="h-9 w-20" /></div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <Skeleton className="h-3 w-40 mb-3" />
              <div className="flex flex-wrap gap-2">
                {[60, 80, 70, 90, 65].map((w, idx) => <Skeleton key={idx} className="h-6 rounded-full" style={{ width: `${w}px` }} />)}
              </div>
            </div>
            <div>
              <Skeleton className="h-3 w-32 mb-3" />
              <Skeleton className="h-48 w-full rounded-lg" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  const noProgramas = programas.length === 0;

  return (
    <div className="space-y-5">
      {/* Header info + XML */}
      <Card className="p-6 relative overflow-hidden" style={layoutCardStyle}>
        {/* Abstract background elements for visual interest */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-primary/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />

        <div className="relative flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex items-center gap-4 shrink-0">
            <div className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-accent/20" style={{ ...layoutAccentSoft, border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)" }}>
              <Tv className="h-7 w-7" style={layoutAccent} />
            </div>
            <div>
              <h3 className="font-bold text-2xl tracking-tight" style={layoutText}>Cenários Estúdio</h3>
              <p className="text-sm mt-1 max-w-sm leading-relaxed" style={layoutTextMuted}>
                Configure o layout das TVs e vincule aos seus programas para sincronização automática via vMix.
              </p>
            </div>
          </div>

          <div className="flex-1 min-w-0 lg:pl-8 lg:border-l lg:border-border/40">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[10px] uppercase tracking-[0.2em] font-bold" style={layoutTextMuted}>
                Integração vMix (XML Link)
              </Label>
              <Badge variant="outline" className="text-[10px] font-mono px-2 py-0 h-5" style={{ ...layoutAccentSoft, color: "var(--layout-accent-color, #2563eb)", borderColor: "transparent" }}>
                Active
              </Badge>
            </div>
            <div className="group relative flex items-center gap-2 p-1 pl-3 rounded-xl transition-all duration-200" style={layoutInnerStyle}>
              <LinkIcon className="h-4 w-4 shrink-0 opacity-50" style={layoutTextMuted} />
              <code className="text-sm truncate flex-1 font-mono py-2" style={layoutText}>{xmlUrl}</code>
              <Button size="sm" variant="secondary" className="h-9 px-4 rounded-lg shadow-sm font-medium hover:scale-[1.02] active:scale-[0.98] transition-all" onClick={copyXmlUrl}>
                <Copy className="h-3.5 w-3.5 mr-2" /> Copiar Link
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 flex justify-end items-center gap-4 border-t border-border/40">
          <p className="hidden md:block text-[11px] font-medium" style={layoutTextMuted}>
            {grupos.length} template{grupos.length !== 1 ? "s" : ""} configurado{grupos.length !== 1 ? "s" : ""}
          </p>
          <Button onClick={addGrupo} className="h-10 px-6 rounded-xl shadow-md shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]" disabled={noProgramas}>
            <Plus className="h-4 w-4 mr-2" /> Criar Novo Template
          </Button>
        </div>
      </Card>

      {/* Empty state: no programas registered (priority over "no grupos") */}
      {noProgramas && (
        <Card className="p-10 text-center border-dashed" style={layoutCardStyle}>
          <div className="mx-auto h-14 w-14 rounded-full flex items-center justify-center mb-4" style={layoutAccentSoft}>
            <Radio className="h-7 w-7" style={layoutAccent} />
          </div>
          <h4 className="font-semibold text-base mb-2" style={layoutText}>Cadastre programas primeiro</h4>
          <p className="text-sm max-w-md mx-auto mb-5 leading-relaxed" style={layoutTextMuted}>
            Para criar grupos de TVs e vincular ao programa no ar, você precisa ter ao menos um programa ativo cadastrado.
          </p>
          <Button asChild size="sm">
            <Link to="/user/nexohub/programas">
              Cadastrar programa <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </Card>
      )}

      {/* Empty state: programas exist, no template being edited and none saved */}
      {!noProgramas && grupos.length === 0 && (
        <Card className="p-10 text-center border-dashed" style={layoutCardStyle}>
          <div className="mx-auto h-14 w-14 rounded-full flex items-center justify-center mb-4" style={layoutAccentSoft}>
            <LayoutGrid className="h-7 w-7" style={layoutAccent} />
          </div>
          <h4 className="font-semibold text-base mb-2" style={layoutText}>Nenhum template criado</h4>
          <p className="text-sm max-w-md mx-auto mb-5 leading-relaxed" style={layoutTextMuted}>
            Crie um template para definir o layout das TVs do cenário (ex: <span className="font-medium" style={layoutText}>"TVs atrás da âncora"</span>),
            envie a arte e vincule aos programas que devem usar esse cenário.
          </p>
          <Button onClick={addGrupo} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Criar primeiro template
          </Button>
        </Card>
      )}

      {/* Editor: only render groups currently being edited */}
      {grupos
        .filter((g) => editingIds.has(g.id))
        .map((grupo) => (
          <GrupoCard
            key={grupo.id}
            grupo={grupo}
            programas={programas}
            onChange={(patch) => updateGrupo(grupo.id, patch)}
            onSave={() => saveGrupo(grupo)}
            onToggleProgram={(pid) => toggleProgramaInGrupo(grupo.id, pid)}
            onSetArte={(file) => setGrupoArte(grupo.id, file)}
            onRemoveArte={() => removeGrupoArte(grupo.id)}
            saving={savingId === grupo.id}
          />
        ))}

      {/* Saved templates gallery (always visible when there are saved templates) */}
      {(() => {
        const savedTemplates = grupos.filter((t) => {
          const a = t.tvs.find((tv) => tv.posicao === 0);
          return !!a?.imagem_url;
        });
        if (savedTemplates.length === 0) return null;
        return (
          <Card className="p-5" style={layoutCardStyle}>
            <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
              <div>
                <Label className="text-xs uppercase tracking-wider font-semibold" style={layoutTextMuted}>
                  Templates criados
                </Label>
                <p className="text-[11px] mt-0.5" style={layoutTextMuted}>
                  Passe o mouse para editar ou excluir.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {savedTemplates.map((t) => {
                const a = t.tvs.find((tv) => tv.posicao === 0);
                const url = a?.imagem_url || "";
                const linkedNames = t.programa_ids
                  .map((pid) => programas.find((p) => p.id === pid)?.nome)
                  .filter(Boolean) as string[];
                return (
                  <div
                    key={t.id}
                    className="group relative rounded-md overflow-hidden flex flex-col"
                    style={{
                      border: "1px solid color-mix(in srgb, var(--layout-page-text, #0d0446) 15%, transparent)",
                      background: "color-mix(in srgb, var(--layout-page-text, #0d0446) 6%, var(--layout-page-bg, #ffffff))",
                    }}
                  >
                    <div
                      className="w-full relative"
                      style={{
                        aspectRatio: `${t.cols * 16} / ${t.rows * 9}`,
                        backgroundImage: `url(${url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundColor: "#000",
                      }}
                    >
                      {/* Hover overlay with edit/delete */}
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                        style={{
                          background:
                            "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0) 100%)",
                        }}
                      />
                      <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-[-4px] group-hover:translate-y-0">
                        <button
                          type="button"
                          onClick={() => setEditingIds((prev) => new Set(prev).add(t.id))}
                          title="Editar template"
                          className="h-8 w-8 rounded-full inline-flex items-center justify-center backdrop-blur-md shadow-md hover:scale-110 active:scale-95 transition-transform"
                          style={{
                            background: "rgba(255,255,255,0.92)",
                            color: "var(--layout-accent-color, #2563eb)",
                            border: "1px solid rgba(255,255,255,0.6)",
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeGrupo(t.id)}
                          title="Excluir template"
                          className="h-8 w-8 rounded-full inline-flex items-center justify-center backdrop-blur-md shadow-md hover:scale-110 active:scale-95 transition-transform"
                          style={{
                            background: "rgba(239,68,68,0.95)",
                            color: "#ffffff",
                            border: "1px solid rgba(255,255,255,0.4)",
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="px-2.5 py-2 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium truncate" style={layoutText} title={t.nome}>
                          {t.nome}
                        </span>
                        <span className="text-[10px] font-mono shrink-0" style={layoutTextMuted}>
                          {t.rows}×{t.cols}
                        </span>
                      </div>
                      {linkedNames.length === 0 ? (
                        <span className="text-[10px] italic" style={layoutTextMuted}>
                          Nenhum programa vinculado
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {linkedNames.map((nome, i) => (
                            <span
                              key={i}
                              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium truncate max-w-full"
                              style={{ ...layoutAccentSoft, color: "var(--layout-accent-color, #2563eb)" }}
                              title={nome}
                            >
                              {nome}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}
    </div>
  );
}

/* ─── Grupo Card ─── */
interface GrupoCardProps {
  grupo: Grupo;
  programas: Programa[];
  onChange: (patch: Partial<Grupo>) => void;
  onSave: () => void;
  onToggleProgram: (programaId: string) => void;
  onSetArte: (file: File) => void;
  onRemoveArte: () => void;
  saving: boolean;
}

function GrupoCard({ grupo, programas, onChange, onSave, onToggleProgram, onSetArte, onRemoveArte, saving }: GrupoCardProps) {
  const total = grupo.rows * grupo.cols;
  const cells = Array.from({ length: total }, (_, i) => i);
  const arte = grupo.tvs.find((t) => t.posicao === 0);
  const arteUrl = arte?._localPreview || arte?.imagem_url || "";
  const inputId = `arte-upload-${grupo.id}`;

  return (
    <Card className="p-5 space-y-6" style={layoutCardStyle}>
      {/* Top: nome + grid + ações */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 md:items-end">
        <div>
          <Label className="text-xs uppercase tracking-wider font-semibold" style={layoutTextMuted}>Nome do template</Label>
          <Input value={grupo.nome} onChange={(e) => onChange({ nome: e.target.value })} className="mt-1.5 text-sm" />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider font-semibold" style={layoutTextMuted}>Linhas</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={grupo.rows}
            onChange={(e) => onChange({ rows: Math.max(1, Math.min(20, parseInt(e.target.value || "1"))) })}
            className="mt-1.5 w-24 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider font-semibold" style={layoutTextMuted}>Colunas</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={grupo.cols}
            onChange={(e) => onChange({ cols: Math.max(1, Math.min(20, parseInt(e.target.value || "1"))) })}
            className="mt-1.5 w-24 text-sm"
          />
        </div>
      </div>

      {/* Programas vinculados */}
      <div className="rounded-lg p-4" style={layoutInnerStyle}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <Label className="text-xs uppercase tracking-wider font-semibold" style={layoutTextMuted}>Programas vinculados</Label>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ ...layoutAccentSoft, color: "var(--layout-accent-color, #2563eb)" }}
          >
            {grupo.programa_ids.length} selecionado(s)
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {programas.length === 0 && <p className="text-sm" style={layoutTextMuted}>Nenhum programa cadastrado.</p>}
          {programas.map((p) => {
            const sel = grupo.programa_ids.includes(p.id);
            const selStyle: React.CSSProperties = sel
              ? {
                  background: "var(--layout-accent-color, #2563eb)",
                  color: "var(--layout-page-bg, #ffffff)",
                  border: "1px solid var(--layout-accent-color, #2563eb)",
                }
              : {
                  background: "transparent",
                  color: "var(--layout-page-text, #0d0446)",
                  border: "1px solid color-mix(in srgb, var(--layout-page-text, #0d0446) 25%, transparent)",
                };
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onToggleProgram(p.id)}
                className="cursor-pointer select-none px-3 py-1 text-xs rounded-full hover:opacity-80 transition-opacity font-medium"
                style={selStyle}
              >
                {p.nome}
              </button>
            );
          })}
        </div>
      </div>

      {/* Arte única + mockup do grid */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold" style={layoutTextMuted}>Arte do cenário</Label>
            <p className="text-[11px] mt-0.5" style={layoutTextMuted}>
              Envie uma única arte — ela é dividida proporcionalmente entre as TVs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ ...layoutInnerStyle }}>
              {grupo.rows} × {grupo.cols} = {total} TV{total !== 1 ? "s" : ""}
            </span>
            <input
              id={inputId}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onSetArte(f);
                e.target.value = "";
              }}
            />
            <label htmlFor={inputId}>
              <Button size="sm" variant="outline" asChild>
                <span className="cursor-pointer">
                  <Upload className="h-3.5 w-3.5 mr-1" /> {arteUrl ? "Trocar arte" : "Enviar arte"}
                </span>
              </Button>
            </label>
            {arteUrl && (
              <Button size="sm" variant="outline" onClick={onRemoveArte}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div className="rounded-lg p-6" style={layoutInnerStyle}>
          {!arteUrl ? (
            <label
              htmlFor={inputId}
              className="mx-auto flex flex-col items-center justify-center cursor-pointer rounded-md border-2 border-dashed transition-colors"
              style={{
                borderColor: "color-mix(in srgb, var(--layout-page-text, #0d0446) 20%, transparent)",
                maxWidth: `${Math.min(900, grupo.cols * 220)}px`,
                aspectRatio: `${grupo.cols * 16} / ${grupo.rows * 9}`,
                width: "100%",
              }}
            >
              <Upload className="h-6 w-6 mb-2" style={layoutTextMuted} />
              <span className="text-xs uppercase tracking-wider" style={layoutTextMuted}>Clique para enviar a arte</span>
            </label>
          ) : (
            <div
              className="mx-auto grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${grupo.cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${grupo.rows}, minmax(0, 1fr))`,
                maxWidth: `${Math.min(900, grupo.cols * 220)}px`,
                aspectRatio: `${grupo.cols * 16} / ${grupo.rows * 9}`,
              }}
            >
              {cells.map((pos) => {
                const row = Math.floor(pos / grupo.cols);
                const col = pos % grupo.cols;
                return (
                  <TvSlice
                    key={pos}
                    posicao={pos}
                    row={row}
                    col={col}
                    rows={grupo.rows}
                    cols={grupo.cols}
                    imageUrl={arteUrl}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Save action — placed below the artwork section */}
      <div className="flex justify-end">
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Salvar template
        </Button>
      </div>
    </Card>
  );
}

/* ─── TV Slice (single artwork divided proportionally) ─── */
function TvSlice({
  posicao,
  row,
  col,
  rows,
  cols,
  imageUrl,
}: {
  posicao: number;
  row: number;
  col: number;
  rows: number;
  cols: number;
  imageUrl: string;
}) {
  // Use background-size = (cols*100%) x (rows*100%) and background-position so each cell shows its slice.
  const bgSizeX = cols * 100;
  const bgSizeY = rows * 100;
  const posX = cols > 1 ? (col / (cols - 1)) * 100 : 50;
  const posY = rows > 1 ? (row / (rows - 1)) * 100 : 50;
  return (
    <div className="relative">
      <div
        className="absolute inset-0 rounded-md overflow-hidden shadow-inner"
        style={{
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: `${bgSizeX}% ${bgSizeY}%`,
          backgroundPosition: `${posX}% ${posY}%`,
          backgroundRepeat: "no-repeat",
          border: "2px solid color-mix(in srgb, var(--layout-page-text, #0d0446) 25%, transparent)",
        }}
      >
        <span
          className="absolute top-1 left-1 text-[9px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}
        >
          #{posicao + 1}
        </span>
      </div>
    </div>
  );
}