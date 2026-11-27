import { notifyLocalOnAir } from "@/lib/desktopLocalOnAir";
import { useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { Plus, Trash2, Image as ImageIcon, Upload, Save, Loader2, LayoutGrid, Radio, ArrowRight, Pencil, Search, Monitor, Link2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { uploadImageToStorage } from "@/lib/uploadImageToStorage";
import { compressImage } from "@/lib/imageCompressor";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirmDialog";
import { scrollToForm } from "@/lib/utils";
import { registerAddTemplate } from "./CenariosPage";

interface Programa {
  id: string;
  nome: string;
  ativo: boolean;
  dias_semana?: string[];
  horario_inicio?: string;
  horario_fim?: string;
  estudio?: string;
  capa?: string;
  thumb?: string;
}

export function getDefaultCenariosEstudioGrupos(ownerId: string, progs: Programa[]): Grupo[] {
  const result: Grupo[] = [];

  // 1. Templates vinculados a cada programa (TVS ÂNCORA 1x2 e TVS CONVIDADOS 2x2)
  progs.forEach((p) => {
    const artUrl = p.capa || p.thumb;
    if (artUrl) {
      result.push({
        id: `grupo_${ownerId}_ancora_${p.id}`,
        user_id: ownerId,
        nome: `${p.nome} - TVS ÂNCORA`,
        rows: 1,
        cols: 2,
        programa_ids: [p.id],
        tvs: [{ posicao: 0, imagem_url: artUrl }],
      });

      const convidadosUrl = p.thumb || p.capa || artUrl;
      result.push({
        id: `grupo_${ownerId}_convidados_${p.id}`,
        user_id: ownerId,
        nome: `${p.nome} - TVS CONVIDADOS`,
        rows: 2,
        cols: 2,
        programa_ids: [p.id],
        tvs: [{ posicao: 0, imagem_url: convidadosUrl }],
      });
    }
  });

  // Artes base para templates mestres gerais
  const generalArt = progs[0]?.capa || progs[0]?.thumb || "/images/CAPA_PH2.png";
  const generalArt2 = progs[1]?.capa || progs[0]?.capa || generalArt;
  const generalArt3 = progs[2]?.capa || progs[0]?.thumb || generalArt;

  // 2. Templates mestres de layout (disponíveis para transmissão geral)
  result.push({
    id: `master_ancora_${ownerId}`,
    user_id: ownerId,
    nome: "TVS ATRÁS ÂNCORA - 2 TVs",
    rows: 1,
    cols: 2,
    programa_ids: [],
    tvs: [{ posicao: 0, imagem_url: generalArt }],
  });

  result.push({
    id: `master_convidados_${ownerId}`,
    user_id: ownerId,
    nome: "TVS ATRÁS CONVIDADOS - 4 TVs",
    rows: 2,
    cols: 2,
    programa_ids: [],
    tvs: [{ posicao: 0, imagem_url: generalArt2 }],
  });

  result.push({
    id: `master_videowall_${ownerId}`,
    user_id: ownerId,
    nome: "VÍDEO WALL PRINCIPAL - 3 TVs",
    rows: 1,
    cols: 3,
    programa_ids: [],
    tvs: [{ posicao: 0, imagem_url: generalArt3 }],
  });

  return result;
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

const isValidUuid = (val: any): boolean => {
  if (typeof val !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
};

const safeUuid = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};


/* ─── Layout-token styles (respect user theme) ─── */
const layoutCardStyle: React.CSSProperties = {
  background: "color-mix(in srgb, var(--layout-page-text, #0d0446) 4%, var(--layout-page-bg, #ffffff))",
  color: "var(--layout-page-text, #0d0446)",
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

export default forwardRef<{ addGrupo: () => void }, { effectiveUserId?: string | null }>(
  ({ effectiveUserId }, ref) => {
    const { user } = useAuth();
    const targetUserId = effectiveUserId || user?.id;
    const [grupos, setGrupos] = useState<Grupo[]>([]);
    const [programas, setProgramas] = useState<Programa[]>([]);
    const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateFilter, setTemplateFilter] = useState<"all" | "linked" | "unlinked">("all");

  const loadAll = useCallback(async () => {
    const ownerId = targetUserId || user?.id;
    if (!ownerId) return;
    setLoading(true);
    const [gruposRes, tvsRes, progsRes] = await Promise.all([
      supabase.from("cenario_estudio_grupos" as any).select("*").eq("user_id", ownerId).order("created_at"),
      supabase.from("cenario_estudio_tvs" as any).select("*").eq("user_id", ownerId).order("posicao"),
      supabase.from("programas").select("id, nome, ativo, dias_semana, horario_inicio, horario_fim, estudio, capa, thumb").eq("user_id", ownerId).eq("ativo", true).order("horario_inicio"),
    ]);

    // Fail closed: a query error must never be interpreted as an empty account and
    // trigger cross-account fallbacks or cached artwork from a previous station.
    const loadError = gruposRes.error || tvsRes.error || progsRes.error;
    if (loadError) {
      console.error("Falha ao carregar cenários do usuário autenticado:", loadError);
      toast.error("Não foi possível carregar os cenários desta conta. Nenhum dado de outra conta será exibido.");
      setLoading(false);
      return;
    }

    const progs: Programa[] = ((progsRes.data as any[]) || []).map((p: any) => ({
      id: p.id,
      nome: p.nome,
      ativo: p.ativo ?? true,
      dias_semana: p.dias_semana || [],
      horario_inicio: p.horario_inicio || "00:00:00",
      horario_fim: p.horario_fim || "00:00:00",
      estudio: p.estudio || "",
      capa: p.capa || "",
      thumb: p.thumb || "",
    }));
    const ownProgramIds = new Set(progs.map((p) => p.id));
    const ownGroupRows = ((gruposRes.data as any[]) || []).filter((g) => g.user_id === ownerId);
    const ownGroupIds = new Set(ownGroupRows.map((g) => g.id));
    const tvsByGrupo: Record<string, TV[]> = {};
    ((tvsRes.data as any[]) || []).filter((t) => ownGroupIds.has(t.grupo_id)).forEach((t) => {
      tvsByGrupo[t.grupo_id] = tvsByGrupo[t.grupo_id] || [];
      tvsByGrupo[t.grupo_id].push({ id: t.id, posicao: t.posicao, imagem_url: t.imagem_url || "" });
    });
    // Program-linked templates are valid only when every linked program belongs to
    // this same account. Legacy local caches are intentionally not read here:
    // earlier fallback logic could cache another station's program artwork under this account.
    let gs: Grupo[] = ownGroupRows
      .filter((g) => {
        const ids = Array.isArray(g.programa_ids) ? g.programa_ids : [];
        return ids.length === 0 || ids.every((id: string) => ownProgramIds.has(id));
      })
      .map((g) => ({
        id: g.id,
        user_id: ownerId,
        nome: g.nome,
        rows: g.rows,
        cols: g.cols,
        programa_ids: Array.isArray(g.programa_ids) ? g.programa_ids : [],
        tvs: tvsByGrupo[g.id] || [],
      }));

    // Generate defaults only from programs fetched by the authenticated owner's ID.
    // Never use cross-account/station fallback services for this page.
    const hasValidTemplates = gs.some((g) => g.tvs.some((tv) => tv.posicao === 0 && !!tv.imagem_url));
    if (!hasValidTemplates) {
      gs = getDefaultCenariosEstudioGrupos(ownerId, progs);
    }

    setGrupos(gs);
    setProgramas(progs);
    setLoading(false);
  }, [targetUserId, user?.id, user?.email]);

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

    const isTimeInRange = (start: string, end: string, current: string, anticipationMinutes = 0) => {
      const startSeconds = toSeconds(start) - (anticipationMinutes * 60);
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
        isTimeInRange(p.horario_inicio || "00:00:00", p.horario_fim || "23:59:59", nowTime, 4)
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

  useEffect(() => {
    registerAddTemplate(() => addGrupo());
  }, []);

  const addGrupo = async () => {
    const ownerId = targetUserId || user?.id;
    if (!ownerId) return;
    const newId = safeUuid();
    const newGrupo: Grupo = {
      id: newId,
      user_id: ownerId,
      nome: "Novo template",
      rows: 1,
      cols: 2,
      programa_ids: [],
      tvs: [{ posicao: 0, imagem_url: "" }],
    };
    try {
      const { data, error } = await (supabase as any)
        .from("cenario_estudio_grupos")
        .insert({ id: newId, user_id: ownerId, nome: "Novo template", rows: 1, cols: 2, programa_ids: [] })
        .select()
        .single();
      if (error) throw error;
      if (!data?.id) throw new Error("O banco não confirmou a criação do template.");
      newGrupo.id = data.id;
      setGrupos(prev => {
        const next = [...prev, newGrupo];
        try { localStorage.setItem("nexohub_cenarios_grupos_" + ownerId, JSON.stringify(next)); } catch {}
        return next;
      });
      setEditingIds(prev => new Set(prev).add(newGrupo.id));
      toast.success("Template criado");
    } catch (err: any) {
      console.error("Erro ao criar template:", err);
      toast.error("Não foi possível criar o template: " + (err?.message || "falha no servidor."));
    }
  };

  useImperativeHandle(ref, () => ({ addGrupo }), [addGrupo]);

  const updateGrupo = (id: string, patch: Partial<Grupo>) => {
    setGrupos((prev) => {
      const next = prev.map((g) => (g.id === id ? { ...g, ...patch } : g));
      const ownerId = targetUserId || user?.id;
      if (ownerId) {
        try { localStorage.setItem(`nexohub_cenarios_grupos_${ownerId}`, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  };

  const removeGrupo = async (id: string) => {
    if (!(await confirmDialog("Excluir este template e todas as suas TVs?"))) return;
    const ownerId = targetUserId || user?.id;
    if (!ownerId) return;
    try {
      if (isValidUuid(id)) {
        const { data, error } = await (supabase as any).from("cenario_estudio_grupos")
          .delete().eq("id", id).eq("user_id", ownerId).select("id").maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error("O banco não confirmou a exclusão do template.");
      }
      notifyLocalOnAir(ownerId, "cenario_estudio_grupos", { id }, true);
      setGrupos(prev => {
        const next = prev.filter(g => g.id !== id);
        try { localStorage.setItem("nexohub_cenarios_grupos_" + ownerId, JSON.stringify(next)); } catch {}
        return next;
      });
      setEditingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success("Template excluído");
    } catch (err: any) {
      toast.error("Não foi possível excluir o template: " + (err?.message || "falha no servidor."));
    }
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

  const saveGrupo = async (grupoToSave: Grupo) => {
    const ownerId = targetUserId || user?.id;
    if (!ownerId) return;

    // Fresh group reference from state if available
    const grupo = grupos.find((g) => g.id === grupoToSave.id) || grupoToSave;
    const oldGroupId = grupo.id;
    setSavingId(oldGroupId);

    try {
      // 1) Ensure grupo.id is a valid UUID for PostgreSQL
      let currentGroupId = isValidUuid(oldGroupId) ? oldGroupId : safeUuid();
      const validProgramaIds = (grupo.programa_ids || []).filter(isValidUuid);

      {
        const { data: savedGrp, error: grpErr } = await (supabase as any)
          .from("cenario_estudio_grupos")
          .upsert({
            id: currentGroupId,
            user_id: ownerId,
            nome: grupo.nome || "Template Cenário",
            rows: Number(grupo.rows) || 1,
            cols: Number(grupo.cols) || 1,
            programa_ids: validProgramaIds,
            updated_at: new Date().toISOString(),
          })
          .select()
          .maybeSingle();

        if (grpErr) {
          console.error("Erro ao salvar template do cenário:", grpErr);
          toast.error(`Não foi possível salvar o template: ${grpErr.message || "erro no servidor"}`);
          return;
        }
        if (savedGrp?.id) currentGroupId = savedGrp.id;
      }

      // 2) Upload single artwork (posicao=0) if pending
      const arte = grupo.tvs.find((t) => t.posicao === 0);
      let arteUrl = arte?.imagem_url || "";

      if (arte?._file) {
        const ext = arte._file.type?.includes("webp") ? "webp" : arte._file.type?.includes("jpeg") ? "jpg" : "png";
        const fileContentType = arte._file.type || "image/png";
        let uploadSuccess = false;
        let lastUploadError = "";

        // O XML do vMix precisa de uma URL pública real (nunca base64).
        // Ordem de tentativa: bucket dos cenários e depois os alternativos públicos.
        const attempts: { bucket: string; path: string }[] = [
          { bucket: "cenario-estudio", path: `${ownerId}/${currentGroupId}/arte-${Date.now()}.${ext}` },
          { bucket: "empresa-assets", path: `${ownerId}/cenario-estudio/${currentGroupId}/arte-${Date.now()}.${ext}` },
          { bucket: "comercial", path: `${ownerId}/cenarios/${currentGroupId}/arte-${Date.now()}.${ext}` },
        ];

        for (const attempt of attempts) {
          if (uploadSuccess) break;
          try {
            const { error: upErr } = await (supabase as any).storage
              .from(attempt.bucket)
              .upload(attempt.path, arte._file, {
                upsert: true,
                contentType: fileContentType,
                cacheControl: "3600",
              });
            if (upErr) {
              lastUploadError = upErr.message || String(upErr);
              console.warn(`${attempt.bucket} upload notice:`, upErr);
              continue;
            }
            const { data: urlData } = (supabase as any).storage
              .from(attempt.bucket)
              .getPublicUrl(attempt.path);
            if (urlData?.publicUrl) {
              arteUrl = `${urlData.publicUrl}?t=${Date.now()}`;
              uploadSuccess = true;
            }
          } catch (e) {
            lastUploadError = e instanceof Error ? e.message : String(e);
            console.warn(`${attempt.bucket} upload error:`, e);
          }
        }

        if (!uploadSuccess) {
          toast.error(`Não foi possível enviar a imagem: ${lastUploadError || "falha no envio"}`);
          return;
        }
      }

      // 3) Upsert TVs (single record holding the artwork at posicao=0)
      {
        const { error: tvErr } = await (supabase as any).from("cenario_estudio_tvs").upsert(
          {
            grupo_id: currentGroupId,
            user_id: ownerId,
            posicao: 0,
            imagem_url: arteUrl || "",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "grupo_id,posicao" }
        );
        if (tvErr) {
          console.error("Erro ao salvar imagem do cenário:", tvErr);
          toast.error(`Imagem não registrada: ${tvErr.message || "erro no servidor"}`);
          return;
        }
      }

      notifyLocalOnAir(ownerId, "cenario_estudio_grupos", { id: currentGroupId, rows: Number(grupo.rows) || 1, cols: Number(grupo.cols) || 1, programa_ids: validProgramaIds });
      if (currentGroupId !== oldGroupId) notifyLocalOnAir(ownerId, "cenario_estudio_grupos", { id: oldGroupId }, true);
      notifyLocalOnAir(ownerId, "cenario_estudio_tvs", { grupo_id: currentGroupId, posicao: 0, imagem_url: arteUrl || "" });

      // 4) Update state & localStorage
      setGrupos((prev) => {
        const next = prev.map((g) => {
          if (g.id !== oldGroupId) return g;
          const others = g.tvs.filter((t) => t.posicao !== 0);
          return {
            ...grupo,
            id: currentGroupId,
            tvs: [{ posicao: 0, imagem_url: arteUrl || arte?.imagem_url || "", _file: undefined, _localPreview: undefined }, ...others],
          };
        });
        try {
          localStorage.setItem(`nexohub_cenarios_grupos_${ownerId}`, JSON.stringify(next));
        } catch {}
        return next;
      });

      toast.success("Template salvo");
      setEditingIds((prev) => {
        const n = new Set(prev);
        n.delete(oldGroupId);
        n.delete(currentGroupId);
        return n;
      });
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
    <div className="space-y-6">
      {/* Compact creative-library overview: primary action stays visible. */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 sm:p-6" aria-label="Biblioteca de cenários">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0055ff]/10 text-[#0055ff]">
            <LayoutGrid size={22}/>
          </span>
          <div>
            <h3 className="text-lg font-extrabold tracking-tight text-slate-900">Cenários por imagem</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Organize suas artes, monte o painel de TVs e escolha em quais programas cada cenário aparece.
            </p>
          </div>
        </div>
        <Button type="button" onClick={() => void addGrupo()} className="h-10 rounded-xl bg-[#0055ff] px-4 text-xs font-bold text-white hover:bg-[#0045d1]">
          <Plus size={16} className="mr-2"/> Novo cenário
        </Button>
      </section>
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
            <Link to="/home?page=programas">
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

      {/* The gallery is image-first, with discovery controls separate from editing. */}
      {(() => {
        const allTemplates = grupos.filter(t => !!t.tvs.find(tv => tv.posicao === 0)?.imagem_url);
        if (!allTemplates.length) return null;
        const linkedCount = allTemplates.filter(t => t.programa_ids.length > 0).length;
        const unlinkedCount = allTemplates.length - linkedCount;
        const q = templateSearch.trim().toLocaleLowerCase("pt-BR");
        const visible = allTemplates.filter(t => {
          if (templateFilter === "linked" && t.programa_ids.length === 0) return false;
          if (templateFilter === "unlinked" && t.programa_ids.length > 0) return false;
          if (!q) return true;
          return t.nome.toLocaleLowerCase("pt-BR").includes(q) ||
            t.programa_ids.some(id => programas.find(p => p.id === id)?.nome.toLocaleLowerCase("pt-BR").includes(q));
        });
        const withoutTemplate = programas.filter(p =>
          !allTemplates.some(t => t.programa_ids.includes(p.id)));
        const filters = [
          { id: "all" as const, text: "Todos", count: allTemplates.length },
          { id: "linked" as const, text: "Com programa", count: linkedCount },
          { id: "unlinked" as const, text: "Sem vínculo", count: unlinkedCount },
        ];
        return (
          <section className="space-y-4" aria-label="Biblioteca de templates">
            <div className="rounded-2xl bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">Biblioteca de cenários</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    {allTemplates.length} cenário{allTemplates.length !== 1 ? "s" : ""} · {linkedCount} vinculado{linkedCount !== 1 ? "s" : ""} a programas
                  </p>
                </div>
                <label className="relative flex h-10 w-full items-center sm:w-64">
                  <Search size={16} aria-hidden className="pointer-events-none absolute left-3 text-slate-400"/>
                  <input type="search" value={templateSearch} onChange={e => setTemplateSearch(e.target.value)}
                    placeholder="Buscar cenário ou programa" aria-label="Buscar cenário ou programa"
                    className="h-full w-full rounded-xl bg-slate-100 pl-10 pr-3 text-xs font-medium text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:bg-slate-50 focus:ring-2 focus:ring-[#0055ff]/50"/>
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar cenários">
                {filters.map(filter => (
                  <button type="button" key={filter.id} onClick={() => setTemplateFilter(filter.id)}
                    aria-pressed={templateFilter === filter.id}
                    className={"inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors " +
                      (templateFilter === filter.id
                        ? "bg-[#0055ff] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                    {filter.text}
                    <span className={"rounded-full px-1.5 py-0.5 text-[10px] " +
                      (templateFilter === filter.id ? "bg-white/20 text-white" : "bg-white text-slate-500")}>
                      {filter.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {visible.length ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {visible.map(t => {
                  const art = t.tvs.find(tv => tv.posicao === 0)?.imagem_url || "";
                  const linked = t.programa_ids
                    .map(id => programas.find(p => p.id === id))
                    .filter((p): p is Programa => !!p);
                  const onAir = !!onAirProgramId && t.programa_ids.includes(onAirProgramId);
                  const editing = editingIds.has(t.id);
                  const edit = () => {
                    setEditingIds(previous => new Set(previous).add(t.id));
                    requestAnimationFrame(() => scrollToForm());
                  };
                  return (
                    <article key={t.id}
                      className={"group flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white transition-colors " +
                        (onAir ? "ring-2 ring-[#0055ff]" : "hover:bg-slate-50")}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                      onDrop={e => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData("program-id");
                        if (!id || !programas.some(p => p.id === id)) return;
                        if (!t.programa_ids.includes(id)) toggleProgramaInGrupo(t.id, id);
                        edit();
                        toast.info("Vínculo adicionado. Salve as alterações para confirmar.");
                      }}>
                      <div className="relative aspect-video overflow-hidden bg-slate-950">
                        <div className="absolute inset-0 grid gap-[2px] p-2"
                          style={{
                            gridTemplateColumns: "repeat(" + t.cols + ",minmax(0,1fr))",
                            gridTemplateRows: "repeat(" + t.rows + ",minmax(0,1fr))",
                          }}>
                          {Array.from({ length: t.rows * t.cols }, (_, i) => (
                            <TvSlice key={i} posicao={i} row={Math.floor(i / t.cols)} col={i % t.cols}
                              rows={t.rows} cols={t.cols} imageUrl={art}/>
                          ))}
                        </div>
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/50 to-transparent"/>
                        <span className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white">
                          <Monitor size={12} className="mr-1 inline-block align-[-2px]"/> {t.cols} × {t.rows} · {t.rows * t.cols} TV{t.rows * t.cols !== 1 ? "s" : ""}
                        </span>
                        {onAir && <span className="absolute right-3 top-3 rounded-full bg-[#0055ff] px-3 py-1 text-[10px] font-extrabold text-white">
                          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-white"/> NO AR
                        </span>}
                        {editing && <span className="absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#0055ff]">
                          Editando
                        </span>}
                      </div>
                      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
                        <div className="min-w-0">
                          <h5 className="truncate text-sm font-extrabold text-slate-900" title={t.nome}>{t.nome}</h5>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {linked.length ? linked.length + " programa" + (linked.length > 1 ? "s" : "") + " vinculado" + (linked.length > 1 ? "s" : "") : "Nenhum programa vinculado"}
                          </p>
                        </div>
                        <div className="flex min-h-7 flex-wrap content-start gap-1.5">
                          {linked.length ? linked.map(p => (
                            <span key={p.id} title={p.nome}
                              className="max-w-full truncate rounded-lg bg-[#0055ff]/[0.07] px-2.5 py-1.5 text-[10px] font-semibold text-[#0055ff]">
                              <Radio size={11} className="mr-1 inline-block align-[-2px]"/>{p.nome}
                            </span>
                          )) : <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-semibold text-amber-800">
                            <Link2 size={11}/> Vincule a um programa
                          </span>}
                        </div>
                        <div className="mt-auto flex gap-2 pt-2">
                          <button type="button" onClick={edit}
                            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0055ff] px-3 text-xs font-bold text-white transition-colors hover:bg-[#0044d3]">
                            <Pencil size={14}/> Editar cenário
                          </button>
                          <button type="button" onClick={() => void removeGrupo(t.id)}
                            aria-label={"Excluir cenário " + t.nome} title="Excluir cenário"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600">
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl bg-white px-5 py-10 text-center">
                <Search size={24} className="mb-3 text-slate-300"/>
                <h5 className="text-sm font-bold text-slate-900">Nenhum cenário encontrado</h5>
                <p className="mt-1 text-xs text-slate-500">Experimente outro nome ou filtro.</p>
                <button type="button" onClick={() => { setTemplateSearch(""); setTemplateFilter("all"); }}
                  className="mt-4 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-[#0055ff] hover:bg-slate-200">
                  Limpar filtros
                </button>
              </div>
            )}

            {withoutTemplate.length > 0 && (
              <div className="rounded-2xl bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h5 className="text-sm font-extrabold text-slate-900">Programas sem cenário</h5>
                    <p className="mt-1 text-xs text-slate-500">Arraste um programa até o cenário desejado. Depois, salve a edição.</p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-bold text-amber-800">
                    {withoutTemplate.length} pendente{withoutTemplate.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {withoutTemplate.map(p => (
                    <div key={p.id} draggable
                      onDragStart={e => {
                        e.dataTransfer.effectAllowed = "copy";
                        e.dataTransfer.setData("program-id", p.id);
                      }}
                      className="inline-flex max-w-full cursor-grab items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-blue-50 hover:text-[#0055ff] active:cursor-grabbing"
                      title="Arraste até um cenário para vincular">
                      <Radio size={13} className="shrink-0"/>
                      <span className="truncate">{p.nome}</span>
                      <span className="shrink-0 text-[10px] font-normal text-slate-400">
                        {p.horario_inicio?.slice(0, 5) || ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })()}

    </div>
  );
  }
);

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
    <Card className="overflow-hidden rounded-2xl border-0 bg-white shadow-none" style={{ color: "var(--layout-page-text, #0d0446)" }}>
      {/* Editor Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0055ff]/[0.06] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
            <Pencil className="h-4 w-4" />
          </div>
          <h4 className="font-bold text-base tracking-tight" style={layoutText}>Editor de cenário</h4>
        </div>
        <div className="flex items-center gap-2">
           <Button size="sm" variant="ghost" onClick={onCancel} style={layoutTextMuted}>
             Cancelar
           </Button>
           <Button variant="save" size="sm" onClick={onSave} disabled={saving} className="h-10 rounded-xl bg-[#0055ff] px-5 font-bold text-white shadow-none hover:bg-[#0044d3]">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Alterações
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Basic Settings */}
        <div className="grid grid-cols-1 gap-4 rounded-xl bg-slate-50 p-4 md:grid-cols-4">
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
            <Label className="text-[10px] uppercase tracking-widest font-bold mb-2 block" style={layoutTextMuted}>Linhas de TVs</Label>
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
            <Label className="text-[10px] uppercase tracking-widest font-bold mb-2 block" style={layoutTextMuted}>Colunas de TVs</Label>
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(220px,1fr)_minmax(0,1.7fr)]">
          {/* Programs Selection */}
          <div className="space-y-4">
            <div>
              <Label className="text-[10px] uppercase tracking-widest font-bold mb-1 block" style={layoutTextMuted}>Vincular Programas</Label>
              <p className="text-[11px] mb-3 leading-tight" style={layoutTextMuted}>Selecione quais programas ativarão este cenário automaticamente.</p>
            </div>
            
            <div className="max-h-[390px] overflow-y-auto rounded-xl bg-slate-50 p-3">
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
                <Label className="text-[10px] uppercase tracking-widest font-bold mb-1 block" style={layoutTextMuted}>Prévia do cenário</Label>
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
              className="relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-xl bg-slate-950 transition-colors"
              style={{}}
            >
              {!arteUrl ? (
                <label htmlFor={inputId} className="cursor-pointer flex flex-col items-center gap-3 p-12 text-center group">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-white transition-transform duration-300 group-hover:scale-105">
                    <ImageIcon className="h-8 w-8 opacity-20" />
                  </div>
                  <div>
                    <span className="block text-sm font-bold text-white">Adicione a arte principal do cenário</span>
                    <span className="mt-1 block text-xs text-slate-400">PNG ou JPG · proporção de acordo com o painel de TVs</span>
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