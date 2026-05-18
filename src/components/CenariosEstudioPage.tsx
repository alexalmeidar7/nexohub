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
  dias_semana?: string[];
  horario_inicio?: string;
  horario_fim?: string;
  estudio?: string;
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

  const onAirProgramId = useMemo(() => {
    if (!programas.length) return null;
    
    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const now = new Date();
    const tzParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(now);
    
    const wkShort = tzParts.find((p) => p.type === "weekday")?.value || "Sun";
    const hh = tzParts.find((p) => p.type === "hour")?.value || "00";
    const mm = tzParts.find((p) => p.type === "minute")?.value || "00";
    const ss = tzParts.find((p) => p.type === "second")?.value || "00";
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const today = dayNames[dayMap[wkShort] ?? 0];
    const nowTime = `${hh}:${mm}:${ss}`;

    const toSeconds = (time: string) => {
      const [hour = "0", minute = "0", second = "0"] = String(time ?? "").split(":");
      return Number(hour) * 3600 + Number(minute) * 60 + Number(second);
    };

    const isTimeInRange = (start: string, end: string, current: string) => {
      const startSeconds = toSeconds(start);
      const endSeconds = toSeconds(end);
      const currentSeconds = toSeconds(current);
      if (endSeconds <= startSeconds) {
        return currentSeconds >= startSeconds || currentSeconds < endSeconds;
      }
      return currentSeconds >= startSeconds && currentSeconds < endSeconds;
    };

    const candidates = programas.filter(
      (p) =>
        (p.dias_semana || []).includes(today) &&
        isTimeInRange(p.horario_inicio || "00:00:00", p.horario_fim || "23:59:59", nowTime)
    );

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].id;

    // Prioritize Estudio FM
    const fmMatch = candidates.find(p => (p as any).estudio?.toLowerCase().includes("fm"));
    return fmMatch ? fmMatch.id : candidates[0].id;
  }, [programas]);

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
            onCancel={() => setEditingIds(prev => {
              const n = new Set(prev);
              n.delete(grupo.id);
              return n;
            })}
            saving={savingId === grupo.id}
          />
        ))}

      {/* Saved templates gallery (organized by program) */}
      {(() => {
        const savedTemplates = grupos.filter((t) => {
          const a = t.tvs.find((tv) => tv.posicao === 0);
          return !!a?.imagem_url;
        });
        
        if (savedTemplates.length === 0) return null;

        // Group templates by program
        const templatesByProgram: Record<string, { nome: string, templates: Grupo[] }> = {};
        const unlinkedTemplates: Grupo[] = [];

        savedTemplates.forEach(t => {
          if (t.programa_ids.length === 0) {
            unlinkedTemplates.push(t);
          } else {
            t.programa_ids.forEach(pid => {
              const prog = programas.find(p => p.id === pid);
              if (prog) {
                if (!templatesByProgram[pid]) {
                  templatesByProgram[pid] = { nome: prog.nome, templates: [] };
                }
                // Avoid duplicates if a template is already added for this program
                if (!templatesByProgram[pid].templates.find(existing => existing.id === t.id)) {
                  templatesByProgram[pid].templates.push(t);
                }
              }
            });
          }
        });

        const renderTemplateCard = (t: Grupo) => {
          const a = t.tvs.find((tv) => tv.posicao === 0);
          const url = a?.imagem_url || "";
          const linkedNames = t.programa_ids
            .map((pid) => programas.find((p) => p.id === pid)?.nome)
            .filter(Boolean) as string[];

          return (
            <Card 
              key={t.id} 
              className="group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
              style={{
                ...layoutCardStyle,
                border: "1px solid color-mix(in srgb, var(--layout-page-text, #0d0446) 12%, transparent)",
              }}
            >
              <div
                className="w-full relative overflow-hidden bg-black"
                style={{ aspectRatio: "16/9" }}
              >
                {/* Sub-grid Preview Overlay */}
                <div 
                  className="absolute inset-0 grid gap-[1px] opacity-30"
                  style={{
                    gridTemplateColumns: `repeat(${t.cols}, 1fr)`,
                    gridTemplateRows: `repeat(${t.rows}, 1fr)`,
                  }}
                >
                  {Array.from({ length: t.rows * t.cols }).map((_, i) => (
                    <div key={i} className="border-[0.5px] border-white/20" />
                  ))}
                </div>

                <div
                  className="absolute inset-0 transition-transform duration-500 group-hover:scale-110"
                  style={{
                    backgroundImage: `url(${url})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

                {/* Floating Actions */}
                <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-300">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-9 w-9 rounded-full shadow-lg hover:bg-primary hover:text-white transition-colors"
                    onClick={() => setEditingIds((prev) => new Set(prev).add(t.id))}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-9 w-9 rounded-full shadow-lg"
                    onClick={() => removeGrupo(t.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Grid Badge */}
                <div className="absolute bottom-3 left-3">
                  <Badge className="bg-white/10 backdrop-blur-md border-white/20 text-white text-[10px] font-mono">
                    {t.rows}×{t.cols} GRID
                  </Badge>
                </div>
              </div>

              <div className="p-4">
                <div className="mb-3">
                  <h5 className="font-bold text-sm truncate" style={layoutText}>{t.nome}</h5>
                  <p className="text-[10px] mt-0.5 font-medium uppercase tracking-tight opacity-50" style={layoutText}>
                    {t.rows * t.cols} TV{t.rows * t.cols !== 1 ? "s" : ""} em layout
                  </p>
                </div>
                
                <div className="min-h-[24px]">
                  {linkedNames.length === 0 ? (
                    <span className="text-[10px] italic opacity-40 font-medium" style={layoutText}>
                      Nenhum programa vinculado
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {linkedNames.slice(0, 3).map((nome, i) => (
                        <Badge 
                          key={i} 
                          variant="secondary" 
                          className="text-[9px] px-1.5 py-0 rounded-md font-bold h-5"
                          style={{ ...layoutAccentSoft, color: "var(--layout-accent-color, #2563eb)", border: "none" }}
                        >
                          {nome}
                        </Badge>
                      ))}
                      {linkedNames.length > 3 && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 rounded-md h-5 opacity-50">
                          +{linkedNames.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        };

        return (
          <div className="space-y-10">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold uppercase tracking-widest opacity-60 flex items-center gap-2" style={layoutText}>
                <LayoutGrid className="h-4 w-4" /> Templates Disponíveis
              </h4>
            </div>

            {Object.entries(templatesByProgram).map(([pid, { nome, templates }]) => (
              <div key={pid} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border/40" />
                  <Badge variant="outline" className="px-3 py-1 border-primary/30 bg-primary/5 text-primary font-bold text-[11px] uppercase tracking-wider rounded-lg">
                    {nome}
                  </Badge>
                  <div className="h-px flex-1 bg-border/40" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {templates.map(renderTemplateCard)}
                </div>
              </div>
            ))}

            {unlinkedTemplates.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border/40" />
                  <Badge variant="outline" className="px-3 py-1 border-muted-foreground/30 bg-muted/5 text-muted-foreground font-bold text-[11px] uppercase tracking-wider rounded-lg">
                    Templates sem Programa
                  </Badge>
                  <div className="h-px flex-1 bg-border/40" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {unlinkedTemplates.map(renderTemplateCard)}
                </div>
              </div>
            )}
          </div>
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
  onCancel: () => void;
  saving: boolean;
}

function GrupoCard({ grupo, programas, onChange, onSave, onToggleProgram, onSetArte, onRemoveArte, onCancel, saving }: GrupoCardProps) {
  const total = grupo.rows * grupo.cols;
  const cells = Array.from({ length: total }, (_, i) => i);
  const arte = grupo.tvs.find((t) => t.posicao === 0);
  const arteUrl = arte?._localPreview || arte?.imagem_url || "";
  const inputId = `arte-upload-${grupo.id}`;

  return (
    <Card className="p-0 overflow-hidden border-2" style={{ ...layoutCardStyle, borderColor: "var(--layout-accent-color, #2563eb)" }}>
      {/* Editor Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-border/40 bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
            <Pencil className="h-4 w-4" />
          </div>
          <h4 className="font-bold text-base tracking-tight" style={layoutText}>Editando Template</h4>
        </div>
        <div className="flex items-center gap-2">
           <Button size="sm" variant="ghost" onClick={onCancel} style={layoutTextMuted}>
             Cancelar
           </Button>
           <Button size="sm" onClick={onSave} disabled={saving} className="shadow-lg shadow-primary/20 h-9 px-5">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Alterações
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Basic Settings */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-2">
            <Label className="text-[10px] uppercase tracking-widest font-bold mb-2 block" style={layoutTextMuted}>Nome do template</Label>
            <Input 
              value={grupo.nome} 
              onChange={(e) => onChange({ nome: e.target.value })} 
              className="h-11 rounded-xl bg-muted/30 focus-visible:ring-primary" 
              placeholder="Ex: Painel Principal Fundo"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-widest font-bold mb-2 block" style={layoutTextMuted}>Grid (Linhas)</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={grupo.rows}
              onChange={(e) => onChange({ rows: Math.max(1, Math.min(20, parseInt(e.target.value || "1"))) })}
              className="h-11 rounded-xl bg-muted/30"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-widest font-bold mb-2 block" style={layoutTextMuted}>Grid (Colunas)</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={grupo.cols}
              onChange={(e) => onChange({ cols: Math.max(1, Math.min(20, parseInt(e.target.value || "1"))) })}
              className="h-11 rounded-xl bg-muted/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8">
          {/* Programs Selection */}
          <div className="space-y-4">
            <div>
              <Label className="text-[10px] uppercase tracking-widest font-bold mb-1 block" style={layoutTextMuted}>Vincular Programas</Label>
              <p className="text-[11px] mb-3 leading-tight" style={layoutTextMuted}>Selecione quais programas ativarão este cenário automaticamente.</p>
            </div>
            
            <div className="rounded-2xl p-4 border border-border/40 bg-muted/10 max-h-[400px] overflow-y-auto">
              <div className="flex flex-col gap-2">
                {programas.length === 0 && <p className="text-xs py-4 text-center italic" style={layoutTextMuted}>Nenhum programa ativo disponível.</p>}
                {programas.map((p) => {
                  const sel = grupo.programa_ids.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onToggleProgram(p.id)}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl transition-all group"
                      style={{
                        background: sel ? "var(--layout-accent-color, #2563eb)" : "transparent",
                        color: sel ? "#fff" : "inherit",
                        border: `1px solid ${sel ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-page-text, #0d0446) 10%, transparent)"}`
                      }}
                    >
                      <span className="text-sm font-semibold truncate pr-2">{p.nome}</span>
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center border ${sel ? 'bg-white border-white' : 'border-border'}`}>
                        {sel && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Artwork & Preview */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-[10px] uppercase tracking-widest font-bold mb-1 block" style={layoutTextMuted}>Preview do Layout</Label>
                <p className="text-[11px]" style={layoutTextMuted}>Arraste ou envie a imagem base do cenário.</p>
              </div>
              
              <div className="flex items-center gap-2">
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
                <Button size="sm" variant="outline" className="rounded-lg h-8 px-3 text-[11px] font-bold uppercase tracking-tight" asChild>
                  <label htmlFor={inputId} className="cursor-pointer">
                    <Upload className="h-3 w-3 mr-1.5" /> Enviar Arte
                  </label>
                </Button>
                {arteUrl && (
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10" onClick={onRemoveArte}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <div 
              className="relative rounded-2xl overflow-hidden border-2 border-dashed flex items-center justify-center bg-muted/20 min-h-[300px] transition-all"
              style={{ borderColor: arteUrl ? "transparent" : "color-mix(in srgb, var(--layout-page-text, #0d0446) 15%, transparent)" }}
            >
              {!arteUrl ? (
                <label htmlFor={inputId} className="cursor-pointer flex flex-col items-center gap-3 p-12 text-center group">
                  <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <ImageIcon className="h-8 w-8 opacity-20" />
                  </div>
                  <div>
                    <span className="text-sm font-bold block" style={layoutText}>Nenhuma imagem selecionada</span>
                    <span className="text-xs opacity-50 block mt-1">Recomendado: 1920x1080 ou 3840x2160 (PNG/JPG)</span>
                  </div>
                </label>
              ) : (
                <div 
                  className="w-full p-4 md:p-8"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${grupo.cols}, 1fr)`,
                    gridTemplateRows: `repeat(${grupo.rows}, 1fr)`,
                    gap: '8px',
                    aspectRatio: `${grupo.cols * 16} / ${grupo.rows * 9}`,
                    maxWidth: '100%'
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
        </div>
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