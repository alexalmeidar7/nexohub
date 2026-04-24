import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Trash2, Image as ImageIcon, Upload, Save, Tv, Link as LinkIcon, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export default function CenariosEstudioPage() {
  const { user } = useAuth();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

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
      .insert({ user_id: user.id, nome: "Novo grupo", rows: 1, cols: 2, programa_ids: [] })
      .select()
      .single();
    if (error) {
      toast.error("Erro ao criar grupo");
      return;
    }
    setGrupos((prev) => [...prev, { ...(data as any), tvs: [], programa_ids: [] }]);
    toast.success("Grupo criado");
  };

  const updateGrupo = (id: string, patch: Partial<Grupo>) => {
    setGrupos((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const removeGrupo = async (id: string) => {
    if (!confirm("Excluir este grupo e todas as suas TVs?")) return;
    const { error } = await (supabase as any).from("cenario_estudio_grupos").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir");
      return;
    }
    setGrupos((prev) => prev.filter((g) => g.id !== id));
    toast.success("Grupo excluído");
  };

  const setTvImage = async (grupoId: string, posicao: number, file: File) => {
    const compressed = await compressImage(file, 1920, 1920, 0.85);
    const dataUrl = await fileToDataUrl(compressed);
    setGrupos((prev) =>
      prev.map((g) => {
        if (g.id !== grupoId) return g;
        const tvs = [...g.tvs];
        const idx = tvs.findIndex((t) => t.posicao === posicao);
        if (idx >= 0) tvs[idx] = { ...tvs[idx], _localPreview: dataUrl, _file: compressed };
        else tvs.push({ posicao, imagem_url: "", _localPreview: dataUrl, _file: compressed });
        return { ...g, tvs };
      }),
    );
  };

  const removeTvImage = (grupoId: string, posicao: number) => {
    setGrupos((prev) =>
      prev.map((g) => {
        if (g.id !== grupoId) return g;
        return {
          ...g,
          tvs: g.tvs.map((t) => (t.posicao === posicao ? { ...t, imagem_url: "", _localPreview: undefined, _file: undefined } : t)),
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

      // 2) upload pending files + collect upserts
      const total = grupo.rows * grupo.cols;
      const finalTvs: { posicao: number; imagem_url: string }[] = [];
      for (let i = 0; i < total; i++) {
        const tv = grupo.tvs.find((t) => t.posicao === i);
        if (!tv) continue;
        let url = tv.imagem_url;
        if (tv._file) {
          const dataUrl = await fileToDataUrl(tv._file);
          url = await uploadImageToStorage(
            dataUrl,
            "cenario-estudio",
            `${user.id}/${grupo.id}/tv-${i}-${Date.now()}.webp`,
            1920,
            0.85,
          );
        }
        if (url) finalTvs.push({ posicao: i, imagem_url: url });
      }

      // 3) replace TVs (delete + insert) — simpler than upsert with constraint
      await (supabase as any).from("cenario_estudio_tvs").delete().eq("grupo_id", grupo.id);
      if (finalTvs.length > 0) {
        const { error: tErr } = await (supabase as any).from("cenario_estudio_tvs").insert(
          finalTvs.map((t) => ({
            grupo_id: grupo.id,
            user_id: user.id,
            posicao: t.posicao,
            imagem_url: t.imagem_url,
          })),
        );
        if (tErr) throw tErr;
      }

      toast.success("Grupo salvo");
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
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header info + XML */}
      <Card className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Tv className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-base leading-tight text-foreground">Cenários Estúdio</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                Monte grupos de TVs e vincule a programas. O vMix consome o XML e troca automaticamente conforme o programa no ar.
              </p>
            </div>
          </div>
          <Button onClick={addGrupo} size="sm" className="shrink-0 self-start lg:self-auto">
            <Plus className="h-4 w-4 mr-1" /> Novo grupo
          </Button>
        </div>
        <div className="mt-4 pt-4 border-t border-border/60">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Link XML para o vMix</Label>
          <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-border/60">
            <LinkIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <code className="text-xs text-foreground/80 truncate flex-1 font-mono">{xmlUrl}</code>
            <Button size="sm" variant="ghost" className="h-7 px-2 shrink-0" onClick={copyXmlUrl}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
            </Button>
          </div>
        </div>
      </Card>

      {grupos.length === 0 && (
        <Card className="p-10 text-center text-muted-foreground">
          <Tv className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Nenhum grupo criado ainda.</p>
          <Button onClick={addGrupo} variant="outline" size="sm" className="mt-4">
            <Plus className="h-4 w-4 mr-1" /> Criar primeiro grupo
          </Button>
        </Card>
      )}

      {grupos.map((grupo) => (
        <GrupoCard
          key={grupo.id}
          grupo={grupo}
          programas={programas}
          onChange={(patch) => updateGrupo(grupo.id, patch)}
          onRemove={() => removeGrupo(grupo.id)}
          onSave={() => saveGrupo(grupo)}
          onToggleProgram={(pid) => toggleProgramaInGrupo(grupo.id, pid)}
          onSetImage={(pos, file) => setTvImage(grupo.id, pos, file)}
          onRemoveImage={(pos) => removeTvImage(grupo.id, pos)}
          saving={savingId === grupo.id}
        />
      ))}
    </div>
  );
}

/* ─── Grupo Card ─── */
interface GrupoCardProps {
  grupo: Grupo;
  programas: Programa[];
  onChange: (patch: Partial<Grupo>) => void;
  onRemove: () => void;
  onSave: () => void;
  onToggleProgram: (programaId: string) => void;
  onSetImage: (posicao: number, file: File) => void;
  onRemoveImage: (posicao: number) => void;
  saving: boolean;
}

function GrupoCard({ grupo, programas, onChange, onRemove, onSave, onToggleProgram, onSetImage, onRemoveImage, saving }: GrupoCardProps) {
  const total = grupo.rows * grupo.cols;
  const cells = Array.from({ length: total }, (_, i) => i);

  return (
    <Card className="p-5 space-y-5">
      {/* Top: nome + grid + ações */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">Nome do grupo</Label>
          <Input value={grupo.nome} onChange={(e) => onChange({ nome: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Linhas</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={grupo.rows}
            onChange={(e) => onChange({ rows: Math.max(1, Math.min(20, parseInt(e.target.value || "1"))) })}
            className="mt-1 w-20"
          />
        </div>
        <div>
          <Label className="text-xs">Colunas</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={grupo.cols}
            onChange={(e) => onChange({ cols: Math.max(1, Math.min(20, parseInt(e.target.value || "1"))) })}
            className="mt-1 w-20"
          />
        </div>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4 mr-1" /> Excluir
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Programas vinculados */}
      <div>
        <Label className="text-xs mb-2 block">Programas vinculados ({grupo.programa_ids.length})</Label>
        <div className="flex flex-wrap gap-2">
          {programas.length === 0 && <p className="text-xs text-muted-foreground">Nenhum programa cadastrado.</p>}
          {programas.map((p) => {
            const sel = grupo.programa_ids.includes(p.id);
            return (
              <Badge
                key={p.id}
                variant={sel ? "default" : "outline"}
                className="cursor-pointer select-none"
                onClick={() => onToggleProgram(p.id)}
              >
                {p.nome}
              </Badge>
            );
          })}
        </div>
      </div>

      {/* Mockup do grid */}
      <div>
        <Label className="text-xs mb-2 block">
          Mockup do cenário ({grupo.rows} × {grupo.cols} = {total} TVs)
        </Label>
        <div className="rounded-lg bg-gradient-to-b from-zinc-900 to-zinc-800 p-6">
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
              const tv = grupo.tvs.find((t) => t.posicao === pos);
              const preview = tv?._localPreview || tv?.imagem_url || "";
              return (
                <TvCell
                  key={pos}
                  posicao={pos}
                  imageUrl={preview}
                  onUpload={(file) => onSetImage(pos, file)}
                  onClear={() => onRemoveImage(pos)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ─── TV Cell ─── */
function TvCell({
  posicao,
  imageUrl,
  onUpload,
  onClear,
}: {
  posicao: number;
  imageUrl: string;
  onUpload: (file: File) => void;
  onClear: () => void;
}) {
  const inputId = `tv-upload-${posicao}-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div className="relative group">
      <div className="absolute inset-0 rounded-md border-[3px] border-zinc-700 bg-black overflow-hidden shadow-inner">
        {imageUrl ? (
          <img src={imageUrl} alt={`TV ${posicao + 1}`} className="w-full h-full object-cover" />
        ) : (
          <label
            htmlFor={inputId}
            className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
          >
            <Upload className="h-5 w-5 mb-1" />
            <span className="text-[10px] uppercase tracking-wider">TV {posicao + 1}</span>
          </label>
        )}
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
        {imageUrl && (
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 flex items-center justify-center gap-2">
            <label htmlFor={inputId} className="cursor-pointer">
              <Button size="sm" variant="secondary" asChild>
                <span><ImageIcon className="h-3.5 w-3.5 mr-1" /> Trocar</span>
              </Button>
            </label>
            <Button size="sm" variant="destructive" onClick={onClear}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <span className="absolute top-1 left-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/60 text-white/70">
          #{posicao + 1}
        </span>
      </div>
    </div>
  );
}
