import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Plus, Film, Eye, MousePointerClick, Image, Monitor, Play, Tag, Video, Calendar as CalendarLucide, Settings2, Sparkles, Globe, MapPin } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { toast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { compressImage } from "@/lib/imageCompressor";
import { QRCodeSVG } from "qrcode.react";

interface PreRoll {
  id: string;
  nome: string;
  video_url: string;
  dias_semana: string[];
  horario_inicio: string;
  horario_fim: string;
  priority: number;
  active: boolean;
  skip_enabled: boolean;
  created_at: string;
  media_type: string;
  youtube_url: string | null;
  link_url: string | null;
  data_inicial: string | null;
  data_final: string | null;
  views_count: number;
  clicks_count: number;
  background_url: string | null;
  aspect_ratio: string;
  video_position: string;
  is_midroll: boolean;
  placements: string[] | null;
}

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export default function PreRollPage() {
  const { user } = useAuth();
  const [prerolls, setPrerolls] = useState<PreRoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [nome, setNome] = useState("");
  const [activeField, setActiveField] = useState(true);
  const [mediaType, setMediaType] = useState<"video" | "youtube">("video");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [diasSemana, setDiasSemana] = useState<string[]>([]);
  const [horarioInicio, setHorarioInicio] = useState("00:00");
  const [horarioFim, setHorarioFim] = useState("23:59");
  const [priority, setPriority] = useState("1");
  const [linkUrl, setLinkUrl] = useState("");
  const [dataInicial, setDataInicial] = useState<Date | undefined>(new Date());
  const [dataFinal, setDataFinal] = useState<Date | undefined>(undefined);
  const [editId, setEditId] = useState<string | null>(null);

  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "full">("16:9");
  const [videoPosition, setVideoPosition] = useState<"center" | "left" | "right">("center");
  const [showPreview, setShowPreview] = useState(false);
  const [isMidroll, setIsMidroll] = useState(false);
  const [placements, setPlacements] = useState<string[]>(["pre_roll"]);

  const bgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from("comercial_preroll").select("*")
        .eq("user_id", user.id).order("priority");
      if (error) throw error;
      setPrerolls((data || []) as any);
    } catch (error: any) {
      console.error("Falha ao carregar anúncios pré-roll:", error);
      toast({ title: "Não foi possível carregar os anúncios", description: error?.message || "Erro ao consultar o banco.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const extractYoutubeId = (url: string) => {
    const m = url.match(/(?:v=|\/embed\/|\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
    return m?.[1] || null;
  };

  const resetForm = () => {
    setNome(""); setActiveField(true); setMediaType("video"); setVideoFile(null); setVideoPreview("");
    setYoutubeUrl(""); setDiasSemana([]); setHorarioInicio("00:00"); setHorarioFim("23:59");
    setPriority("1"); setLinkUrl(""); setDataInicial(new Date()); setDataFinal(undefined);
    setEditId(null); setBackgroundFile(null); setBackgroundPreview(""); setAspectRatio("16:9");
    setVideoPosition("center"); setShowPreview(false); setIsMidroll(false); setPlacements(["pre_roll"]);
  };

  const startEdit = (p: PreRoll) => {
    setEditId(p.id); setNome(p.nome); setActiveField(p.active);
    setMediaType(p.media_type === "youtube" ? "youtube" : "video");
    if (p.media_type !== "youtube") setVideoPreview(p.video_url);
    if (p.youtube_url) setYoutubeUrl(p.youtube_url);
    setDiasSemana(p.dias_semana || []);
    setHorarioInicio(p.horario_inicio); setHorarioFim(p.horario_fim);
    setPriority(String(p.priority)); setLinkUrl(p.link_url || "");
    setDataInicial(p.data_inicial ? new Date(p.data_inicial + "T00:00:00") : undefined);
    setDataFinal(p.data_final ? new Date(p.data_final + "T00:00:00") : undefined);
    setAspectRatio((p.aspect_ratio || "16:9") as any);
    setVideoPosition((p.video_position || "center") as any);
    setBackgroundPreview(p.background_url || "");
    setIsMidroll(p.is_midroll || false);
    const pl = (p as any).placements as string[] | null | undefined;
    if (pl && pl.length > 0) setPlacements(pl);
    else setPlacements(p.is_midroll ? ["pre_roll", "mid_roll"] : ["pre_roll"]);
  };

  const toggleDia = (dia: string) => {
    setDiasSemana((prev) => prev.includes(dia) ? prev.filter(d => d !== dia) : [...prev, dia]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      let videoUrl = videoPreview;
      if (mediaType === "video" && videoFile) {
        const path = `prerolls/${user.id}/${Date.now()}_${videoFile.name}`;
        const { error } = await supabase.storage.from("preroll-videos").upload(path, videoFile, { upsert: true });
        if (error) throw error;
        const { data: pub } = supabase.storage.from("preroll-videos").getPublicUrl(path);
        videoUrl = pub.publicUrl;
      }

      let bgUrl = backgroundPreview;
      if (backgroundFile) {
        const compressed = await compressImage(backgroundFile, 1200, 0.85);
        const path = `prerolls/${user.id}/bg_${Date.now()}.jpg`;
        const { error } = await supabase.storage.from("preroll-videos").upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
        if (error) throw error;
        const { data: pub } = supabase.storage.from("preroll-videos").getPublicUrl(path);
        bgUrl = pub.publicUrl;
      }

      const payload = {
        user_id: user.id,
        nome,
        active: activeField,
        media_type: mediaType,
        video_url: mediaType === "video" ? videoUrl : "",
        youtube_url: mediaType === "youtube" ? youtubeUrl : null,
        dias_semana: diasSemana,
        horario_inicio: horarioInicio,
        horario_fim: horarioFim,
        priority: parseInt(priority) || 1,
        link_url: linkUrl || null,
        data_inicial: dataInicial ? format(dataInicial, "yyyy-MM-dd") : null,
        data_final: dataFinal ? format(dataFinal, "yyyy-MM-dd") : null,
        background_url: bgUrl || null,
        aspect_ratio: aspectRatio,
        video_position: videoPosition,
        is_midroll: placements.includes("mid_roll") || isMidroll,
        placements: placements.length > 0 ? placements : ["pre_roll"],
      };

      if (editId) {
        const { data, error } = await supabase.from("comercial_preroll").update(payload)
          .eq("id", editId).eq("user_id", user.id).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("O banco não confirmou a atualização do anúncio.");
        toast({ title: "Anúncio atualizado!" });
      } else {
        const { data, error } = await supabase.from("comercial_preroll").insert(payload).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("O banco não confirmou o cadastro do anúncio.");
        toast({ title: "Anúncio cadastrado!" });
      }
      resetForm();
      await loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from("comercial_preroll").delete()
        .eq("id", id).eq("user_id", user.id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("O banco não confirmou a exclusão do anúncio.");
      toast({ title: "Anúncio removido" });
      await loadData();
    } catch (error: any) {
      toast({ title: "Não foi possível remover o anúncio", description: error?.message || "Erro ao excluir no banco.", variant: "destructive" });
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from("comercial_preroll").update({ active: !active })
        .eq("id", id).eq("user_id", user.id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("O banco não confirmou a alteração de status.");
      await loadData();
    } catch (error: any) {
      toast({ title: "Não foi possível alterar o status", description: error?.message || "Erro ao atualizar no banco.", variant: "destructive" });
    }
  };

  const getStatus = (p: PreRoll) => {
    if (!p.active) return { label: "Inativo", color: { backgroundColor: "rgba(220,38,38,0.1)", color: "#dc2626" } };
    const today = format(new Date(), "yyyy-MM-dd");
    if (p.data_final && today > p.data_final) return { label: "Expirado", color: { backgroundColor: "rgba(234,179,8,0.1)", color: "#eab308" } };
    if (p.data_inicial && today < p.data_inicial) return { label: "Agendado", color: { backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)", color: "var(--layout-accent-color, #2563eb)" } };
    return { label: "Ativo", color: { backgroundColor: "rgba(34,197,94,0.1)", color: "#22c55e" } };
  };

  if (loading) return <ModulePageSkeleton variant="form" />;

  /* Nexo form palette */
  const CYAN = "#00BFF0";
  const LIME = "#C6F03C";
  const BG = "#D6F4FB";
  const INK = "#002132";

  const inputStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    border: `2px solid ${CYAN}4D`,
    color: INK,
    borderRadius: "9999px",
    height: "44px",
    padding: "0 16px",
  };

  const focusHandler = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = CYAN;
    e.currentTarget.style.boxShadow = `0 0 0 4px ${CYAN}26`;
  };
  const blurHandler = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = `${CYAN}4D`;
    e.currentTarget.style.boxShadow = "none";
  };

  const sectionHeader = (icon: React.ReactNode, title: string) => (
    <div className="flex items-center gap-2.5 mb-4 mt-2">
      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${CYAN}1F`, color: CYAN }}>
        {icon}
      </div>
      <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: INK }}>{title}</span>
      <div className="flex-1 h-px" style={{ backgroundColor: `${INK}14` }} />
    </div>
  );

  return (
    <div className="nexo-scope animate-fade-in w-full max-w-none mx-0" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        ADS — Pre-Roll
      </div>
      <div className="rounded-3xl p-6" style={{ background: BG }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: "#fff", boxShadow: `0 6px 18px ${CYAN}33` }}>
            <Film size={20} style={{ color: CYAN }} />
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: CYAN }}>Comercial · Vídeo</div>
            <h3 className="text-2xl font-black leading-tight" style={{ color: INK }}>
              {editId ? "Editar anúncio" : "Novo anúncio"}
            </h3>
          </div>
          {editId && (
            <button type="button" onClick={resetForm}
              className="h-9 px-4 rounded-full text-xs font-bold bg-white/70 hover:bg-white transition"
              style={{ color: INK, border: `2px solid ${INK}20` }}>
              Cancelar edição
            </button>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="rounded-2xl overflow-hidden mb-6 bg-white" style={{ boxShadow: "0 4px 20px rgba(0,33,50,0.06)" }}>


          <div className="p-5 space-y-6">
            {/* ──── SEÇÃO 1: IDENTIFICAÇÃO ──── */}
            {sectionHeader(<Tag size={14} style={{ color: "var(--layout-accent-color, #2563eb)" }} />, "Identificação")}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nome do Anúncio</label>
                <input type="text" placeholder="Ex: Campanha Black Friday" value={nome} onChange={(e) => setNome(e.target.value)}
                  className="w-full px-4 py-2 text-sm outline-none transition-all" style={inputStyle}
                  onFocus={focusHandler} onBlur={blurHandler}
                />
              </div>
              <div>
                <label className="flex items-center gap-2.5 cursor-pointer py-2">
                  <input type="checkbox" checked={activeField} onChange={(e) => setActiveField(e.target.checked)}
                    className="w-4 h-4 rounded" style={{ accentColor: "var(--layout-accent-color, #2563eb)" }} />
                  <span className="text-xs font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Ativo</span>
                  <span className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>— Desmarque para salvar como inativo</span>
                </label>
              </div>
            </div>

            {/* ──── ONDE VAMOS ANUNCIAR? ──── */}
            {sectionHeader(<MapPin size={14} style={{ color: "var(--layout-accent-color, #2563eb)" }} />, "Onde vamos anunciar?")}
            <div>
              <p className="text-[11px] mb-3" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>
                Selecione um ou mais locais onde este anúncio será exibido.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([
                  { value: "site", label: "SITE", desc: "Portal de notícias", icon: Globe },
                  { value: "pre_roll", label: "PRE ROLL", desc: "Antes do conteúdo", icon: Film },
                  { value: "mid_roll", label: "MID ROLL", desc: "Durante o conteúdo", icon: Play },
                ] as const).map(({ value, label, desc, icon: Icon }) => {
                  const selected = placements.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setPlacements((prev) => {
                          const next = prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value];
                          return next.length === 0 ? [value] : next;
                        });
                        if (value === "mid_roll") setIsMidroll((prev) => !prev);
                      }}
                      className="flex items-center gap-3 p-3 rounded-xl transition-all text-left"
                      style={{
                        border: selected ? "2px solid var(--layout-accent-color, #2563eb)" : "2px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)",
                        backgroundColor: selected ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 8%, transparent)" : "transparent",
                      }}
                    >
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: selected ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
                        <Icon size={16} style={{ color: selected ? "#ffffff" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: selected ? "var(--layout-accent-color, #2563eb)" : "var(--layout-page-text, #1a1a1a)" }}>{label}</div>
                        <div className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 45%, transparent)" }}>{desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>


            {/* ──── SEÇÃO 2: MÍDIA ──── */}
            {sectionHeader(<Video size={14} style={{ color: "var(--layout-accent-color, #2563eb)" }} />, "Mídia")}

            {/* Media type */}
            <div>
              <label className="text-xs font-semibold block mb-2" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Tipo de Mídia</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={mediaType === "video"} onChange={() => setMediaType("video")} style={{ accentColor: "var(--layout-accent-color, #2563eb)" }} />
                  <span className="text-xs" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Upload de vídeo (até 5MB)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={mediaType === "youtube"} onChange={() => setMediaType("youtube")} style={{ accentColor: "var(--layout-accent-color, #2563eb)" }} />
                  <span className="text-xs" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Link do YouTube</span>
                </label>
              </div>
            </div>

            {mediaType === "video" && (
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Vídeo (.mp4, máx 5MB)</label>
                <input type="file" accept="video/mp4" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 5 * 1024 * 1024) { toast({ title: "O vídeo deve ter no máximo 5MB", variant: "destructive" }); return; }
                    setVideoFile(f); setVideoPreview(URL.createObjectURL(f));
                  }
                }} className="text-xs" style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
                {videoPreview && <video src={videoPreview} controls className="mt-2 w-64 rounded-lg" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)" }} />}
              </div>
            )}

            {mediaType === "youtube" && (
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Link do YouTube</label>
                <input type="url" placeholder="https://www.youtube.com/watch?v=..." value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)}
                  className="w-full px-4 py-2 text-sm outline-none transition-all" style={inputStyle}
                  onFocus={focusHandler} onBlur={blurHandler}
                />
                {youtubeUrl && extractYoutubeId(youtubeUrl) && (
                  <img src={`https://img.youtube.com/vi/${extractYoutubeId(youtubeUrl)}/hqdefault.jpg`} alt="Thumbnail" className="mt-2 w-64 rounded-lg" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)" }} />
                )}
              </div>
            )}

            {/* ──── SEÇÃO PRE-ROLL & MID-ROLL LADO A LADO ──── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* ── PRE-ROLL ── */}
              <div className="rounded-xl p-4" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)", backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 3%, transparent)" }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent)" }}>
                    <Film size={13} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Anúncio</span>
                </div>

                {/* Proporção */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Proporção do Vídeo</label>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent)", color: "var(--layout-accent-color, #2563eb)" }}>{aspectRatio === "full" ? "FULL" : aspectRatio}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(["16:9", "9:16", "full"] as const).map((ratio) => {
                      const sel = aspectRatio === ratio;
                      const w = ratio === "16:9" ? 44 : ratio === "9:16" ? 22 : 46;
                      const h = ratio === "16:9" ? 25 : ratio === "9:16" ? 38 : 30;
                      return (
                        <button key={ratio} type="button" onClick={() => setAspectRatio(ratio)}
                          className="group relative flex flex-col items-center justify-end gap-2 pt-4 pb-2.5 rounded-2xl transition-all overflow-hidden"
                          style={{
                            border: sel ? "2px solid var(--layout-accent-color, #2563eb)" : "1.5px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)",
                            background: sel
                              ? "linear-gradient(180deg, color-mix(in srgb, var(--layout-accent-color, #2563eb) 14%, transparent) 0%, color-mix(in srgb, var(--layout-accent-color, #2563eb) 4%, transparent) 100%)"
                              : "linear-gradient(180deg, color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent) 0%, transparent 100%)",
                            boxShadow: sel ? "0 6px 18px color-mix(in srgb, var(--layout-accent-color, #2563eb) 25%, transparent)" : "none",
                            minHeight: 78,
                          }}>
                          <div className="flex items-center justify-center" style={{ height: 44 }}>
                            <div style={{
                              width: w, height: h,
                              borderRadius: 5,
                              background: sel
                                ? "linear-gradient(135deg, var(--layout-accent-color, #2563eb), color-mix(in srgb, var(--layout-accent-color, #2563eb) 70%, #000))"
                                : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 12%, transparent)",
                              boxShadow: sel ? "0 3px 10px color-mix(in srgb, var(--layout-accent-color, #2563eb) 35%, transparent)" : "none",
                              transition: "all .2s",
                            }} />
                          </div>
                          <span className="text-[10px] font-extrabold tracking-wider" style={{ color: sel ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>{ratio === "full" ? "FULL" : ratio}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Posição */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Posição do Vídeo</label>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent)", color: "var(--layout-accent-color, #2563eb)" }}>
                      {videoPosition === "left" ? "Esquerda" : videoPosition === "right" ? "Direita" : "Centro"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: "left", label: "Esquerda", align: "flex-start" },
                      { value: "center", label: "Centro", align: "center" },
                      { value: "right", label: "Direita", align: "flex-end" },
                    ] as const).map((pos) => {
                      const sel = videoPosition === pos.value;
                      return (
                        <button key={pos.value} type="button" onClick={() => setVideoPosition(pos.value)}
                          className="flex flex-col items-center gap-2 pt-3 pb-2.5 rounded-2xl transition-all"
                          style={{
                            border: sel ? "2px solid var(--layout-accent-color, #2563eb)" : "1.5px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)",
                            background: sel
                              ? "linear-gradient(180deg, color-mix(in srgb, var(--layout-accent-color, #2563eb) 14%, transparent) 0%, color-mix(in srgb, var(--layout-accent-color, #2563eb) 4%, transparent) 100%)"
                              : "linear-gradient(180deg, color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent) 0%, transparent 100%)",
                            boxShadow: sel ? "0 6px 18px color-mix(in srgb, var(--layout-accent-color, #2563eb) 22%, transparent)" : "none",
                          }}>
                          <div className="flex overflow-hidden" style={{
                            width: 52, height: 32, borderRadius: 6,
                            backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)",
                            justifyContent: pos.align, alignItems: "center", padding: 3,
                            border: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)",
                          }}>
                            <div style={{
                              width: aspectRatio === "9:16" ? 8 : aspectRatio === "full" ? 44 : 20,
                              height: aspectRatio === "9:16" ? 22 : aspectRatio === "full" ? 24 : 12,
                              borderRadius: 3,
                              background: sel
                                ? "linear-gradient(135deg, var(--layout-accent-color, #2563eb), color-mix(in srgb, var(--layout-accent-color, #2563eb) 70%, #000))"
                                : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 22%, transparent)",
                              boxShadow: sel ? "0 2px 6px color-mix(in srgb, var(--layout-accent-color, #2563eb) 40%, transparent)" : "none",
                              transition: "all .2s",
                              flexShrink: 0,
                            }} />
                          </div>
                          <span className="text-[10px] font-extrabold tracking-wider uppercase" style={{ color: sel ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>{pos.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Background */}
                <div className="rounded-2xl p-3" style={{
                  border: "1.5px dashed color-mix(in srgb, var(--layout-page-text, #1a1a1a) 18%, transparent)",
                  backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 2%, transparent)",
                }}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                      <Image size={12} style={{ color: "var(--layout-accent-color, #2563eb)" }} /> Background
                    </label>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)", color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>Opcional</span>
                  </div>
                  <p className="text-[10px] mb-2.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 45%, transparent)" }}>Imagem de fundo exibida atrás do vídeo.</p>
                  <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setBackgroundFile(f); setBackgroundPreview(URL.createObjectURL(f)); } }} />
                  <div className="flex items-center gap-2.5">
                    {backgroundPreview ? (
                      <div className="relative rounded-lg overflow-hidden group" style={{ width: 64, height: 40, border: "1.5px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 40%, transparent)", boxShadow: "0 3px 10px rgba(0,0,0,0.08)" }}>
                        <img src={backgroundPreview} alt="Background" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => { setBackgroundFile(null); setBackgroundPreview(""); }} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ color: "#fff", backgroundColor: "rgba(220,38,38,0.9)" }}>✕</button>
                      </div>
                    ) : (
                      <div className="rounded-lg flex items-center justify-center" style={{ width: 64, height: 40, border: "1.5px dashed color-mix(in srgb, var(--layout-page-text, #1a1a1a) 20%, transparent)", backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 4%, transparent)" }}>
                        <Image size={16} style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 30%, transparent)" }} />
                      </div>
                    )}
                    <button type="button" onClick={() => bgInputRef.current?.click()}
                      className="flex-1 px-3 py-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 hover:shadow-md"
                      style={{
                        background: "linear-gradient(135deg, var(--layout-accent-color, #2563eb), color-mix(in srgb, var(--layout-accent-color, #2563eb) 75%, #000))",
                        color: "#fff",
                        boxShadow: "0 3px 10px color-mix(in srgb, var(--layout-accent-color, #2563eb) 35%, transparent)",
                      }}>
                      <Image size={12} /> {backgroundPreview ? "Trocar Imagem" : "Escolher Imagem"}
                    </button>
                  </div>
                </div>
              </div>

              {/* ── MID-ROLL ── */}
              <div className="rounded-xl p-4 flex flex-col" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)", backgroundColor: "color-mix(in srgb, var(--layout-button-bg, #2563eb) 3%, transparent)" }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-button-bg, #2563eb) 12%, transparent)" }}>
                    <Play size={13} style={{ color: "var(--layout-button-bg, #2563eb)" }} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Mid-Roll</span>
                </div>
                <div className="rounded-xl p-4 flex-1" style={{ backgroundColor: "color-mix(in srgb, var(--layout-button-bg, #2563eb) 5%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-button-bg, #2563eb) 15%, transparent)" }}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={isMidroll} onChange={(e) => setIsMidroll(e.target.checked)} className="w-4 h-4 rounded mt-0.5" style={{ accentColor: "var(--layout-button-bg, #2563eb)" }} />
                    <div>
                      <span className="text-xs font-bold block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Ativar como Mid-Roll</span>
                      <p className="text-[10px] mt-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Este vídeo também será utilizado como comercial de intervalo nos canais de catálogo. Máximo de 3 mid-rolls consecutivos.</p>
                    </div>
                  </label>
                </div>
                {isMidroll && (
                  <div className="mt-3 px-3 py-2 rounded-lg text-[10px] font-medium flex items-center gap-2" style={{ backgroundColor: "color-mix(in srgb, var(--layout-button-bg, #2563eb) 8%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}>
                    <Play size={11} style={{ color: "var(--layout-button-bg, #2563eb)" }} />
                    Este anúncio aparecerá como pré-roll <strong>e</strong> mid-roll
                  </div>
                )}
              </div>
            </div>

            {/* ──── SEÇÃO 3: AGENDAMENTO ──── */}
            {sectionHeader(<CalendarLucide size={14} style={{ color: "var(--layout-accent-color, #2563eb)" }} />, "Agendamento")}
            <div>
              <label className="text-xs font-semibold block mb-2" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Dias da Semana</label>
              <div className="flex flex-wrap gap-2">
                {DIAS.map((dia) => (
                  <button key={dia} type="button" onClick={() => toggleDia(dia)}
                    className="px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all"
                    style={diasSemana.includes(dia)
                      ? { backgroundColor: "var(--layout-header-bg, #1a1a1a)", color: "var(--layout-header-text, #ffffff)", boxShadow: "0 2px 8px color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 30%, transparent)" }
                      : { backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)", color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }
                    }>{dia.slice(0, 3)}</button>
                ))}
              </div>
              {diasSemana.length === 0 && <p className="text-[10px] mt-1.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Todos os dias se nenhum selecionado.</p>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Horário Início</label>
                <input type="time" value={horarioInicio} onChange={(e) => setHorarioInicio(e.target.value)} className="w-full px-4 py-2 text-sm outline-none transition-all" style={inputStyle} onFocus={focusHandler} onBlur={blurHandler} />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Horário Fim</label>
                <input type="time" value={horarioFim} onChange={(e) => setHorarioFim(e.target.value)} className="w-full px-4 py-2 text-sm outline-none transition-all" style={inputStyle} onFocus={focusHandler} onBlur={blurHandler} />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Data Inicial</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left text-sm font-normal", !dataInicial && "text-muted-foreground")} style={{ ...inputStyle, display: "flex" }}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dataInicial ? format(dataInicial, "dd/MM/yyyy") : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dataInicial} onSelect={setDataInicial} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Data Final</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left text-sm font-normal", !dataFinal && "text-muted-foreground")} style={{ ...inputStyle, display: "flex" }}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dataFinal ? format(dataFinal, "dd/MM/yyyy") : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dataFinal} onSelect={setDataFinal} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* ──── SEÇÃO 4: CONFIGURAÇÕES ──── */}
            {sectionHeader(<Settings2 size={14} style={{ color: "var(--layout-accent-color, #2563eb)" }} />, "Configurações")}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Link do Anúncio (opcional)</label>
                <input type="url" placeholder="https://exemplo.com/oferta" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="w-full px-4 py-2 text-sm outline-none transition-all" style={inputStyle} onFocus={focusHandler} onBlur={blurHandler} />
                <p className="text-[10px] mt-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Exibirá QR Code durante o pré-roll.</p>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Prioridade</label>
                <input type="number" min="1" value={priority} onChange={(e) => setPriority(e.target.value)} className="w-32 px-4 py-2 text-sm outline-none transition-all" style={inputStyle} onFocus={focusHandler} onBlur={blurHandler} />
              </div>
            </div>

            {/* ──── SEÇÃO 5: PRÉ-VISUALIZAÇÃO ──── */}
            {sectionHeader(<Sparkles size={14} style={{ color: "var(--layout-accent-color, #2563eb)" }} />, "Pré-visualização")}
            <div className={`grid gap-4 ${isMidroll ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
                {/* Pre-Roll Preview */}
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)" }}>
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 8%, transparent)", color: "var(--layout-accent-color, #2563eb)" }}>
                    <Film size={11} className="inline mr-1" /> Anúncio
                  </div>
                  <div className="relative w-full flex items-center p-4" style={{
                    aspectRatio: "16 / 9",
                    background: backgroundPreview ? `url(${backgroundPreview}) center/cover no-repeat` : "linear-gradient(to bottom right, hsl(var(--player-accent, 0 100% 50%)), hsl(0 0% 0%) 40%)",
                    justifyContent: videoPosition === "left" ? "flex-start" : videoPosition === "right" ? "flex-end" : "center",
                  }}>
                    <div className="relative shadow-2xl overflow-hidden" style={{ aspectRatio: aspectRatio === "16:9" ? "16 / 9" : "9 / 16", height: aspectRatio === "16:9" ? "85%" : "90%", backgroundColor: "hsl(0 0% 0%)", borderRadius: "1rem" }}>
                      {mediaType === "youtube" && youtubeUrl && extractYoutubeId(youtubeUrl) ? (
                        <img src={`https://img.youtube.com/vi/${extractYoutubeId(youtubeUrl)}/hqdefault.jpg`} alt="Preview" className="w-full h-full object-cover" />
                      ) : videoPreview ? (
                        <video src={videoPreview} muted className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Play size={32} style={{ color: "rgba(255,255,255,0.3)" }} /></div>
                      )}
                      <div className="absolute top-3 right-3 z-10">
                        <span className="px-3 py-1 rounded-full text-[10px] font-medium" style={{ backgroundColor: "var(--layout-button-bg, #2563eb)", color: "white" }}>pular 5s</span>
                      </div>
                      {linkUrl && (
                        <div className="absolute top-3 left-3 z-10 flex flex-col items-center p-2 rounded-lg" style={{ backgroundColor: "var(--layout-button-bg, #2563eb)" }}>
                          <div className="bg-white rounded p-1 w-10 h-10 flex items-center justify-center">
                            <QRCodeSVG value={linkUrl} size={32} level="M" bgColor="#ffffff" fgColor="#000000" />
                          </div>
                          <span className="text-white text-[7px] mt-1 font-semibold">clique/escaneie</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="px-3 py-2 text-center" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)" }}>
                    <span className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                      Proporção {aspectRatio} • Posição {videoPosition === "center" ? "centro" : videoPosition === "left" ? "esquerda" : "direita"}
                    </span>
                  </div>
                </div>

                {/* Mid-Roll Preview */}
                {isMidroll && (
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)" }}>
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: "color-mix(in srgb, var(--layout-button-bg, #2563eb) 8%, transparent)", color: "var(--layout-button-bg, #2563eb)" }}>
                      <Play size={11} className="inline mr-1" /> Mid-Roll
                    </div>
                    <div className="relative w-full flex items-center justify-center" style={{ aspectRatio: "16 / 9", background: "linear-gradient(135deg, hsl(0 0% 5%), hsl(0 0% 12%))" }}>
                      <div className="relative shadow-2xl overflow-hidden" style={{ width: "100%", height: "100%" }}>
                        {mediaType === "youtube" && youtubeUrl && extractYoutubeId(youtubeUrl) ? (
                          <img src={`https://img.youtube.com/vi/${extractYoutubeId(youtubeUrl)}/hqdefault.jpg`} alt="Preview" className="w-full h-full object-cover" />
                        ) : videoPreview ? (
                          <video src={videoPreview} muted className="w-full h-full object-contain" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><Play size={32} style={{ color: "rgba(255,255,255,0.3)" }} /></div>
                        )}
                        <div className="absolute top-3 right-3 flex items-center z-10">
                          <span className="px-3 py-1.5 rounded-full text-[9px] font-bold" style={{ backgroundColor: "var(--layout-button-bg, #2563eb)", color: "white" }}>
                            anúncio&nbsp;&nbsp;1/3&nbsp;&nbsp;0:15
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="px-3 py-2 text-center" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)" }}>
                      <span className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Tela cheia • Sem botão pular • Máx. 3 consecutivos</span>
                    </div>
                  </div>
                )}
              </div>

            {/* Submit */}
            <div className="flex justify-end pt-2">
              <button type="submit" disabled={saving}
                className="h-12 px-7 rounded-full text-sm font-black flex items-center gap-2 disabled:opacity-50 transition hover:brightness-95"
                style={{ background: LIME, color: INK, boxShadow: `0 8px 24px ${LIME}66` }}>
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                {editId ? "Salvar alterações" : "Cadastrar anúncio"}
              </button>
            </div>
          </div>
        </form>

        {/* List */}
        <div className="rounded-2xl overflow-hidden bg-white" style={{ boxShadow: "0 4px 20px rgba(0,33,50,0.06)" }}>
          <div className="px-5 py-3.5 flex items-center gap-2 border-b" style={{ borderColor: `${INK}12` }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `${CYAN}1F`, color: CYAN }}><Film size={14}/></div>
            <h3 className="text-sm font-black" style={{ color: INK }}>Anúncios cadastrados</h3>
            <span className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${CYAN}1F`, color: CYAN }}>
              {prerolls.length}
            </span>
          </div>


          {prerolls.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Nenhum pré-roll cadastrado.</p>
          ) : (
            <div className="p-3 space-y-2">
              {prerolls.map((p) => {
                const status = getStatus(p);
                return (
                  <div key={p.id} className="flex items-center gap-4 rounded-xl p-3 transition-all hover:shadow-sm" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)" }}>
                    {p.media_type === "youtube" && p.youtube_url ? (
                      <img src={`https://img.youtube.com/vi/${extractYoutubeId(p.youtube_url) || ""}/mqdefault.jpg`} alt="YT" className="w-28 h-16 object-cover rounded-lg" />
                    ) : (
                      <video src={p.video_url} className="w-28 h-16 object-cover rounded-lg" muted />
                    )}
                    <div className="flex-1 min-w-0">
                      {p.nome && (
                        <div className="text-xs font-bold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{p.nome}</div>
                      )}
                      <div className="text-xs font-bold" style={{ color: p.nome ? "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" : "var(--layout-page-text, #1a1a1a)" }}>
                        {p.horario_inicio} - {p.horario_fim}
                        <span className="ml-2 text-[10px] font-normal" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                          {p.media_type === "youtube" ? "YouTube" : "Vídeo"} • {p.aspect_ratio || "16:9"}
                          {(p as any).is_midroll && (
                            <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 15%, transparent)", color: "var(--layout-icon-color, #888888)" }}>Mid-Roll</span>
                          )}
                        </span>
                      </div>
                      <div className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                        {(p.dias_semana && p.dias_semana.length > 0) ? p.dias_semana.map(d => d.slice(0, 3)).join(", ") : "Todos os dias"}
                        {" • "}Prioridade: {p.priority}
                        {" • "}Posição: {p.video_position === "center" ? "Centro" : p.video_position === "left" ? "Esquerda" : "Direita"}
                      </div>
                      {(p.data_inicial || p.data_final) && (
                        <div className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                          {p.data_inicial && format(new Date(p.data_inicial + "T00:00:00"), "dd/MM/yyyy")}
                          {p.data_inicial && p.data_final && " → "}
                          {p.data_final && format(new Date(p.data_final + "T00:00:00"), "dd/MM/yyyy")}
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-2 p-2 rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)" }}>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold uppercase tracking-wider opacity-60" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Exibições</span>
                          <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--layout-accent-color, #2563eb)" }}>
                            <Eye size={13} /> {p.views_count || 0}
                          </span>
                        </div>
                        <div className="w-px h-6" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)" }} />
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold uppercase tracking-wider opacity-60" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Cliques</span>
                          <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                            <MousePointerClick size={13} /> {p.clicks_count || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] px-3 py-1 rounded-full font-bold" style={status.color}>
                        {status.label}
                      </span>
                      <button onClick={() => toggleActive(p.id, p.active)}
                        className="text-[10px] px-2.5 py-1 rounded-full transition-colors font-medium"
                        style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}
                      >
                        {p.active ? "Desativar" : "Ativar"}
                      </button>
                      <button onClick={() => startEdit(p)} className="p-1.5 rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--layout-page-text)_8%,transparent)]" style={{ color: "var(--layout-icon-color, #888888)" }}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg transition-colors hover:bg-[rgba(220,38,38,0.08)]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
