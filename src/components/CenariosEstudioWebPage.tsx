import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Copy, ExternalLink, Loader2, MonitorSmartphone, Sparkles, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirmDialog";

interface WebScene {
  id: string;
  nome: string;
  orientation: "horizontal" | "vertical";
  tv_count: number;
  content: {
    gradient?: boolean;
    presenter?: boolean;
    artist?: boolean;
    sponsors?: boolean;
  };
  updated_at?: string;
}

const CONTENT_LABELS: Array<{ key: keyof WebScene["content"]; label: string; hint: string }> = [
  { key: "gradient", label: "Fundo em degradê", hint: "Base elegante quando não há mídia" },
  { key: "presenter", label: "Foto do locutor", hint: "Do apresentador no ar agora" },
  { key: "artist", label: "Imagem do artista", hint: "Capa da música tocando" },
  { key: "sponsors", label: "Logos dos patrocinadores", hint: "Do programa no ar" },
];

export default function CenariosEstudioWebPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const [scenes, setScenes] = useState<WebScene[]>([]);
  const [userSlug, setUserSlug] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wizard, setWizard] = useState<Omit<WebScene, "id">>({
    nome: "Novo cenário web",
    orientation: "horizontal",
    tv_count: 2,
    content: { gradient: true, presenter: true, artist: true, sponsors: true },
  });

  const getLocalStorageKey = (uId: string) => `nexohub_cenarios_web_${uId}`;

  const load = useCallback(async () => {
    if (!targetUserId) return;
    setLoading(true);
    let rows: WebScene[] = [];
    try {
      const [scenesRes, profileRes] = await Promise.all([
        supabase.from("cenario_estudio_web" as any).select("*").eq("user_id", targetUserId).order("created_at"),
        supabase.from("profiles").select("nome, email").eq("user_id", targetUserId).maybeSingle(),
      ]);
      if (scenesRes.data) {
        rows = scenesRes.data as any[];
      }
      const nome = (profileRes.data as any)?.nome || (profileRes.data as any)?.email || "";
      const slug = String(nome).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 32) || targetUserId.slice(0, 8);
      setUserSlug(slug);
    } catch {}

    setScenes(rows);
    setLoading(false);
  }, [targetUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const buildUrl = (id: string) => `${window.location.origin}/cenario-estudio-web/${userSlug}/${id}`;

  const createScene = async () => {
    if (!targetUserId) return;
    setSavingId("__new__");
    try {
      const { data, error } = await (supabase as any)
        .from("cenario_estudio_web")
        .insert({
          user_id: targetUserId,
          nome: wizard.nome || "Novo cenário web",
          orientation: wizard.orientation,
          tv_count: wizard.tv_count,
          content: wizard.content,
        })
        .select()
        .single();
      if (error) throw error;
      if (!data?.id) throw new Error("O banco não confirmou a criação do cenário.");
      const newScene = data as WebScene;
      setScenes(prev => {
        const updated = [...prev, newScene];
        try { localStorage.setItem(getLocalStorageKey(targetUserId), JSON.stringify(updated)); } catch {}
        return updated;
      });
      setShowWizard(false);
      setWizard({ nome: "Novo cenário web", orientation: "horizontal", tv_count: 2, content: { gradient: true, presenter: true, artist: true, sponsors: true } });
      toast.success("Cenário web criado");
    } catch (err: any) {
      console.error("Falha ao criar cenário web:", err);
      toast.error("Não foi possível criar o cenário: " + (err?.message || "falha no servidor."));
    } finally {
      setSavingId(null);
    }
  };

  const saveScene = async (scene: WebScene) => {
    if (!targetUserId) return;
    setSavingId(scene.id);
    try {
      const { data, error } = await (supabase as any)
        .from("cenario_estudio_web")
        .update({ nome: scene.nome, orientation: scene.orientation, tv_count: scene.tv_count, content: scene.content })
        .eq("id", scene.id)
        .eq("user_id", targetUserId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) throw new Error("O banco não confirmou a atualização do cenário.");
      setScenes(prev => {
        const updated = prev.map(item => item.id === scene.id ? scene : item);
        try { localStorage.setItem(getLocalStorageKey(targetUserId), JSON.stringify(updated)); } catch {}
        return updated;
      });
      toast.success("Cenário salvo");
      setEditingId(null);
    } catch (err: any) {
      toast.error("Não foi possível salvar o cenário: " + (err?.message || "falha no servidor."));
    } finally {
      setSavingId(null);
    }
  };

  const removeScene = async (id: string) => {
    if (!targetUserId) return;
    if (!(await confirmDialog("Excluir este cenário web?"))) return;
    try {
      const { data, error } = await (supabase as any).from("cenario_estudio_web")
        .delete().eq("id", id).eq("user_id", targetUserId).select("id").maybeSingle();
      if (error) throw error;
      if (!data?.id) throw new Error("O banco não confirmou a exclusão do cenário.");
      setScenes(prev => {
        const updated = prev.filter(scene => scene.id !== id);
        try { localStorage.setItem(getLocalStorageKey(targetUserId), JSON.stringify(updated)); } catch {}
        return updated;
      });
      toast.success("Cenário excluído");
    } catch (err: any) {
      toast.error("Não foi possível excluir o cenário: " + (err?.message || "falha no servidor."));
    }
  };

  const updateLocal = (id: string, patch: Partial<WebScene>) => {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        vMix — Cenário Web
      </div>
      {/* Header */}
      <div className="bg-white border-2 border-[#00BFF0] rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-full bg-[#00BFF0] flex items-center justify-center text-white">
            <MonitorSmartphone className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-[#0A2540] text-sm font-bold uppercase tracking-widest leading-none">Cenário Web</h1>
            <p className="text-[11px] text-[#64748B] mt-1">
              Páginas web dinâmicas para o navegador do vMix (1920×1080)
            </p>
          </div>
        </div>
        <Button
          onClick={() => setShowWizard(true)}
          className="h-9 px-5 rounded-full bg-[#C6F03C] hover:bg-[#C6F03C]/90 text-[#0A2540] text-[10px] font-bold uppercase tracking-wider shadow-sm"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo cenário web
        </Button>
      </div>

      {/* Wizard */}
      {showWizard && (
        <Card className="p-5 border-2 border-[#00BFF0]/30 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0A2540] flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#00BFF0]" /> Novo cenário web
            </h3>
            <button className="text-slate-400 hover:text-slate-600" onClick={() => setShowWizard(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <Label className="text-xs">Nome do cenário</Label>
            <Input value={wizard.nome} onChange={(e) => setWizard({ ...wizard, nome: e.target.value })} className="mt-1" />
          </div>

          {/* 1. Formato */}
          <div>
            <Label className="text-xs mb-2 block">1. Formato</Label>
            <div className="grid grid-cols-2 gap-3">
              {(["horizontal", "vertical"] as const).map((o) => {
                const active = wizard.orientation === o;
                return (
                  <button
                    key={o}
                    onClick={() => setWizard({ ...wizard, orientation: o })}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${active ? "border-[#00BFF0] bg-[#D6F4FB]" : "border-slate-200 hover:border-slate-300"}`}
                  >
                    <div className={`text-xs font-bold uppercase tracking-wider ${active ? "text-[#0A2540]" : "text-slate-600"}`}>
                      {o === "horizontal" ? "Horizontal" : "Vertical"}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      {o === "horizontal" ? "TVs lado a lado" : "TVs empilhadas"}
                    </div>
                    <div className={`mt-3 rounded-md bg-white border ${active ? "border-[#00BFF0]" : "border-slate-200"}`} style={{ aspectRatio: o === "horizontal" ? "16 / 9" : "9 / 16", height: 60 }} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Quantas TVs */}
          <div>
            <Label className="text-xs mb-2 block">2. Quantidade de TVs (base 1920×1080)</Label>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3, 4, 6].map((n) => {
                const active = wizard.tv_count === n;
                return (
                  <button
                    key={n}
                    onClick={() => setWizard({ ...wizard, tv_count: n })}
                    className={`h-11 min-w-[52px] px-4 rounded-full text-sm font-bold transition-all ${active ? "bg-[#0A2540] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  >
                    {n} TV{n > 1 ? "s" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Conteúdo */}
          <div>
            <Label className="text-xs mb-2 block">3. Conteúdo</Label>
            <div className="grid sm:grid-cols-2 gap-2">
              {CONTENT_LABELS.map((c) => {
                const active = !!wizard.content[c.key];
                return (
                  <label
                    key={c.key}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${active ? "border-[#00BFF0] bg-[#D6F4FB]" : "border-slate-200"}`}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setWizard({ ...wizard, content: { ...wizard.content, [c.key]: e.target.checked } })}
                      className="mt-1"
                    />
                    <div>
                      <div className="text-xs font-bold text-[#0A2540]">{c.label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{c.hint}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={() => setShowWizard(false)}>
              Cancelar
            </Button>
            <Button onClick={createScene} disabled={savingId === "__new__"} className="bg-[#C6F03C] hover:bg-[#C6F03C]/90 text-[#0A2540]">
              {savingId === "__new__" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Criar cenário
            </Button>
          </div>
        </Card>
      )}

      {/* Lista */}
      {scenes.length === 0 && !showWizard && (
        <Card className="p-10 text-center border-dashed">
          <MonitorSmartphone className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">
            Nenhum cenário web criado. Clique em <span className="font-semibold text-[#0A2540]">Novo cenário web</span> para começar.
          </p>
        </Card>
      )}

      {scenes.map((s) => {
        const editing = editingId === s.id;
        const url = buildUrl(s.id);
        return (
          <Card key={s.id} className="p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              {editing ? (
                <Input value={s.nome} onChange={(e) => updateLocal(s.id, { nome: e.target.value })} className="max-w-xs" />
              ) : (
                <div className="flex-1">
                  <div className="text-sm font-bold text-[#0A2540]">{s.nome}</div>
                  <div className="text-[11px] text-slate-500">
                    {s.orientation === "horizontal" ? "Horizontal" : "Vertical"} · {s.tv_count} TV{s.tv_count > 1 ? "s" : ""} · {" "}
                    {Object.entries(s.content || {})
                      .filter(([, v]) => v)
                      .map(([k]) => CONTENT_LABELS.find((c) => c.key === k)?.label)
                      .filter(Boolean)
                      .join(" · ") || "sem conteúdo"}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                {editing ? (
                  <>
                    <Button size="sm" onClick={() => saveScene(s)} disabled={savingId === s.id} className="bg-[#C6F03C] hover:bg-[#C6F03C]/90 text-[#0A2540]">
                      {savingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); load(); }}>
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(s.id)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeScene(s.id)} className="text-red-600 hover:text-red-700">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {editing && (
              <div className="grid md:grid-cols-3 gap-4 pt-3 border-t">
                <div>
                  <Label className="text-xs">Formato</Label>
                  <div className="flex gap-2 mt-1">
                    {(["horizontal", "vertical"] as const).map((o) => (
                      <button
                        key={o}
                        onClick={() => updateLocal(s.id, { orientation: o })}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold ${s.orientation === o ? "bg-[#0A2540] text-white" : "bg-slate-100 text-slate-600"}`}
                      >
                        {o === "horizontal" ? "Horizontal" : "Vertical"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Quantidade de TVs</Label>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {[1, 2, 3, 4, 6].map((n) => (
                      <button
                        key={n}
                        onClick={() => updateLocal(s.id, { tv_count: n })}
                        className={`h-8 min-w-[36px] px-3 rounded-full text-xs font-bold ${s.tv_count === n ? "bg-[#0A2540] text-white" : "bg-slate-100 text-slate-600"}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Conteúdo</Label>
                  <div className="mt-1 space-y-1">
                    {CONTENT_LABELS.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={!!s.content?.[c.key]}
                          onChange={(e) =>
                            updateLocal(s.id, { content: { ...(s.content || {}), [c.key]: e.target.checked } })
                          }
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* URL para vMix */}
            <div className="flex items-center gap-2 bg-slate-50 border border-[#00BFF0]/20 rounded-full pl-4 pr-1 py-1">
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
              <code className="text-[11px] font-mono truncate flex-1 text-[#0A2540]">{url}</code>
              <Button
                size="sm"
                onClick={() => copyUrl(url)}
                className="h-7 px-3 rounded-full bg-[#0A2540] hover:bg-[#0A2540]/90 text-white text-[10px] font-bold uppercase tracking-wider"
              >
                <Copy className="h-3 w-3 mr-1" /> Copiar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.open(url, "_blank")}
                className="h-7 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider"
              >
                Abrir
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
