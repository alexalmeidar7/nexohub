import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Plus, Film, Eye, MousePointerClick, Image, Monitor, Play, Tag, Video, Calendar as CalendarLucide, Settings2, Sparkles } from "lucide-react";
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

  const bgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("comercial_preroll").select("*").eq("user_id", user.id).order("priority");
    if (data) setPrerolls(data as any);
    setLoading(false);
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
    setVideoPosition("center"); setShowPreview(false); setIsMidroll(false);
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
        is_midroll: isMidroll,
      };

      if (editId) {
        await supabase.from("comercial_preroll").update(payload).eq("id", editId);
        toast({ title: "Pré-Roll atualizado!" });
      } else {
        await supabase.from("comercial_preroll").insert(payload);
        toast({ title: "Pré-Roll cadastrado!" });
      }
      resetForm(); loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("comercial_preroll").delete().eq("id", id);
    toast({ title: "Pré-Roll removido" }); loadData();
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("comercial_preroll").update({ active: !active }).eq("id", id);
    loadData();
  };

  const getStatus = (p: PreRoll) => {
    if (!p.active) return { label: "Inativo", color: { backgroundColor: "rgba(220,38,38,0.1)", color: "#dc2626" } };
    const today = format(new Date(), "yyyy-MM-dd");
    if (p.data_final && today > p.data_final) return { label: "Expirado", color: { backgroundColor: "rgba(234,179,8,0.1)", color: "#eab308" } };
    if (p.data_inicial && today < p.data_inicial) return { label: "Agendado", color: { backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #444444) 10%, transparent)", color: "var(--layout-accent-color, #444444)" } };
    return { label: "Ativo", color: { backgroundColor: "rgba(34,197,94,0.1)", color: "#22c55e" } };
  };

  if (loading) return <ModulePageSkeleton />;

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--layout-page-bg, #ffffff)",
    border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)",
    color: "var(--layout-page-text, #1a1a1a)",
    borderRadius: "12px",
  };

  const focusHandler = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "var(--layout-accent-color, #444444)";
    e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--layout-accent-color, #444444) 12%, transparent)";
  };
  const blurHandler = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)";
    e.currentTarget.style.boxShadow = "none";
  };

  const sectionHeader = (icon: React.ReactNode, title: string) => (
    <div className="flex items-center gap-2.5 mb-4 mt-2">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-accent-color, #444444) 10%, transparent)" }}>
        {icon}
      </div>
      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{title}</span>
      <div className="flex-1 h-px" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }} />
    </div>
  );

  return (
    <div className="animate-fade-in">
      <div className="rounded-2xl" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 12%, var(--layout-page-bg, #ffffff) 88%)", boxShadow: "0 8px 32px rgba(0,0,0,0.10)", padding: "20px" }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
            <Film size={20} style={{ color: "var(--layout-icon-color, #888888)" }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Pré-Roll</h3>
            <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Gerencie anúncios exibidos antes do conteúdo ao vivo</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", color: "var(--layout-header-text, #ffffff)" }}>
            <h3 className="text-sm font-bold">
              {editId ? "✏️ Editar Pré-Roll" : "➕ Novo Pré-Roll"}
            </h3>
            {editId && (
              <button type="button" onClick={resetForm}
                className="flex items-center gap-1 px-3 py-1 text-[10px] font-bold rounded-full transition-all"
                style={{ backgroundColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)" }}
              >
                Cancelar
              </button>
            )}
          </div>

          <div className="p-5 space-y-6">
            {/* ──── SEÇÃO 1: IDENTIFICAÇÃO ──── */}
            {sectionHeader(<Tag size={14} style={{ color: "var(--layout-accent-color, #444444)" }} />, "Identificação")}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nome do Pré-Roll</label>
                <input type="text" placeholder="Ex: Campanha Black Friday" value={nome} onChange={(e) => setNome(e.target.value)}
                  className="w-full px-4 py-2 text-sm outline-none transition-all" style={inputStyle}
                  onFocus={focusHandler} onBlur={blurHandler}
                />
              </div>
              <div>
                <label className="flex items-center gap-2.5 cursor-pointer py-2">
                  <input type="checkbox" checked={activeField} onChange={(e) => setActiveField(e.target.checked)}
                    className="w-4 h-4 rounded" style={{ accentColor: "var(--layout-accent-color, #444444)" }} />
                  <span className="text-xs font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Ativo</span>
                  <span className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>— Desmarque para salvar como inativo</span>
                </label>
              </div>
            </div>

            {/* ──── SEÇÃO 2: MÍDIA ──── */}
            {sectionHeader(<Video size={14} style={{ color: "var(--layout-accent-color, #444444)" }} />, "Mídia")}

            {/* Media type */}
            <div>
              <label className="text-xs font-semibold block mb-2" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Tipo de Mídia</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={mediaType === "video"} onChange={() => setMediaType("video")} style={{ accentColor: "var(--layout-accent-color, #444444)" }} />
                  <span className="text-xs" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Upload de vídeo (até 5MB)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={mediaType === "youtube"} onChange={() => setMediaType("youtube")} style={{ accentColor: "var(--layout-accent-color, #444444)" }} />
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

            {/* Aspect Ratio + Position */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Aspect Ratio */}
              <div>
                <label className="text-xs font-semibold block mb-2" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Proporção do Vídeo</label>
                <div className="flex gap-3">
                  {(["16:9", "9:16", "full"] as const).map((ratio) => (
                    <button key={ratio} type="button" onClick={() => setAspectRatio(ratio)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all"
                      style={{
                        border: aspectRatio === ratio ? "2px solid var(--layout-accent-color, #444444)" : "2px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)",
                        backgroundColor: aspectRatio === ratio ? "color-mix(in srgb, var(--layout-accent-color, #444444) 8%, transparent)" : "transparent",
                      }}
                    >
                      <div
                        className="rounded"
                        style={{
                          width: ratio === "16:9" ? 48 : ratio === "9:16" ? 24 : 48,
                          height: ratio === "16:9" ? 27 : ratio === "9:16" ? 42 : 32,
                          backgroundColor: aspectRatio === ratio ? "var(--layout-accent-color, #444444)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)",
                          transition: "background-color 0.2s",
                        }}
                      />
                      <span className="text-[10px] font-bold" style={{ color: aspectRatio === ratio ? "var(--layout-accent-color, #444444)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                        {ratio === "full" ? "Full" : ratio}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Video Position */}
              <div>
                <label className="text-xs font-semibold block mb-2" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Posição do Vídeo</label>
                <div className="flex gap-3">
                  {([
                    { value: "left", label: "Esquerda", align: "flex-start" },
                    { value: "center", label: "Centro", align: "center" },
                    { value: "right", label: "Direita", align: "flex-end" },
                  ] as const).map((pos) => (
                    <button key={pos.value} type="button" onClick={() => setVideoPosition(pos.value)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all flex-1"
                      style={{
                        border: videoPosition === pos.value ? "2px solid var(--layout-accent-color, #444444)" : "2px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)",
                        backgroundColor: videoPosition === pos.value ? "color-mix(in srgb, var(--layout-accent-color, #444444) 8%, transparent)" : "transparent",
                      }}
                    >
                      <div className="w-12 h-8 rounded overflow-hidden flex" style={{
                        backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)",
                        justifyContent: pos.align,
                        alignItems: "center",
                        padding: "2px",
                      }}>
                        <div className="rounded-sm" style={{
                          width: aspectRatio === "16:9" ? 20 : 10,
                          height: aspectRatio === "16:9" ? 12 : 22,
                          backgroundColor: videoPosition === pos.value ? "var(--layout-accent-color, #444444)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 20%, transparent)",
                          transition: "background-color 0.2s",
                          flexShrink: 0,
                        }} />
                      </div>
                      <span className="text-[10px] font-bold" style={{ color: videoPosition === pos.value ? "var(--layout-accent-color, #444444)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                        {pos.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Background image */}
            <div>
              <label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                <Image size={13} style={{ color: "var(--layout-icon-color, #888888)" }} />
                Background do Pré-Roll (opcional)
              </label>
              <p className="text-[10px] mb-2.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                Imagem de fundo exibida atrás do vídeo. Se não enviar, será usado o gradiente padrão.
              </p>
              <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setBackgroundFile(f); setBackgroundPreview(URL.createObjectURL(f)); }
              }} />
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => bgInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 hover:shadow-md"
                  style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #444444) 8%, transparent)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)" }}
                >
                  <Image size={14} style={{ color: "var(--layout-icon-color, #888888)" }} /> Escolher imagem
                </button>
                {backgroundPreview && (
                  <div className="flex items-center gap-2">
                    <img src={backgroundPreview} alt="Background" className="w-16 h-10 object-cover rounded-lg" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)" }} />
                    <button type="button" onClick={() => { setBackgroundFile(null); setBackgroundPreview(""); }}
                      className="text-[10px] px-2.5 py-1 rounded-full font-medium" style={{ color: "#dc2626", backgroundColor: "rgba(220,38,38,0.08)" }}>
                      Remover
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ──── SEÇÃO 3: AGENDAMENTO ──── */}
            {sectionHeader(<CalendarLucide size={14} style={{ color: "var(--layout-accent-color, #444444)" }} />, "Agendamento")}

            {/* Days */}
            <div>
              <label className="text-xs font-semibold block mb-2" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Dias da Semana</label>
              <div className="flex flex-wrap gap-2">
                {DIAS.map((dia) => (
                  <button key={dia} type="button" onClick={() => toggleDia(dia)}
                    className="px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all"
                    style={diasSemana.includes(dia)
                      ? { backgroundColor: "var(--layout-header-bg, #1a1a1a)", color: "var(--layout-header-text, #ffffff)", boxShadow: "0 2px 8px color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 30%, transparent)" }
                      : { backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)", color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }
                    }
                  >
                    {dia.slice(0, 3)}
                  </button>
                ))}
              </div>
              {diasSemana.length === 0 && <p className="text-[10px] mt-1.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Todos os dias se nenhum selecionado.</p>}
            </div>

            {/* Schedule grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Horário Início</label>
                <input type="time" value={horarioInicio} onChange={(e) => setHorarioInicio(e.target.value)}
                  className="w-full px-4 py-2 text-sm outline-none transition-all" style={inputStyle}
                  onFocus={focusHandler} onBlur={blurHandler}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Horário Fim</label>
                <input type="time" value={horarioFim} onChange={(e) => setHorarioFim(e.target.value)}
                  className="w-full px-4 py-2 text-sm outline-none transition-all" style={inputStyle}
                  onFocus={focusHandler} onBlur={blurHandler}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Data Inicial</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left text-sm font-normal", !dataInicial && "text-muted-foreground")}
                      style={{ ...inputStyle, display: "flex" }}>
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
                    <Button variant="outline" className={cn("w-full justify-start text-left text-sm font-normal", !dataFinal && "text-muted-foreground")}
                      style={{ ...inputStyle, display: "flex" }}>
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
            {sectionHeader(<Settings2 size={14} style={{ color: "var(--layout-accent-color, #444444)" }} />, "Configurações")}

            {/* Mid-Roll checkbox */}
            <div className="rounded-xl p-4" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #444444) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-accent-color, #444444) 15%, transparent)" }}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={isMidroll} onChange={(e) => setIsMidroll(e.target.checked)}
                  className="w-4 h-4 rounded" style={{ accentColor: "var(--layout-accent-color, #444444)" }} />
                <div>
                  <span className="text-xs font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Mid-Roll (Intervalo)</span>
                  <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                    Marque para usar este vídeo como comercial de intervalo nos canais de catálogo. Máx. 3 seguidos.
                  </p>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Link */}
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Link do Anúncio (opcional)</label>
                <input type="url" placeholder="https://exemplo.com/oferta" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
                  className="w-full px-4 py-2 text-sm outline-none transition-all" style={inputStyle}
                  onFocus={focusHandler} onBlur={blurHandler}
                />
                <p className="text-[10px] mt-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Exibirá QR Code durante o pré-roll.</p>
              </div>
              {/* Priority */}
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Prioridade</label>
                <input type="number" min="1" value={priority} onChange={(e) => setPriority(e.target.value)}
                  className="w-32 px-4 py-2 text-sm outline-none transition-all" style={inputStyle}
                  onFocus={focusHandler} onBlur={blurHandler}
                />
              </div>
            </div>

            {/* ──── SEÇÃO 5: PRÉ-VISUALIZAÇÃO ──── */}
            {sectionHeader(<Sparkles size={14} style={{ color: "var(--layout-accent-color, #444444)" }} />, "Pré-visualização")}

            <button type="button" onClick={() => setShowPreview(!showPreview)}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
              style={{
                backgroundColor: showPreview ? "var(--layout-header-bg, #1a1a1a)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)",
                color: showPreview ? "var(--layout-header-text, #ffffff)" : "var(--layout-page-text, #1a1a1a)",
                border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)",
              }}
            >
              <Monitor size={14} />
              {showPreview ? "Ocultar Preview" : "Visualizar Pré-Roll"}
            </button>

            {showPreview && (
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)" }}>
                <div
                  className="relative w-full flex items-center p-4"
                  style={{
                    aspectRatio: "16 / 9",
                    background: backgroundPreview
                      ? `url(${backgroundPreview}) center/cover no-repeat`
                      : "linear-gradient(to bottom right, hsl(0 100% 50%), hsl(0 0% 0%) 40%)",
                    justifyContent: videoPosition === "left" ? "flex-start" : videoPosition === "right" ? "flex-end" : "center",
                  }}
                >
                  <div
                    className="relative shadow-2xl overflow-hidden"
                    style={{
                      aspectRatio: aspectRatio === "16:9" ? "16 / 9" : "9 / 16",
                      height: aspectRatio === "16:9" ? "85%" : "90%",
                      backgroundColor: "hsl(0 0% 0%)",
                      borderRadius: "1rem",
                    }}
                  >
                    {mediaType === "youtube" && youtubeUrl && extractYoutubeId(youtubeUrl) ? (
                      <img
                        src={`https://img.youtube.com/vi/${extractYoutubeId(youtubeUrl)}/hqdefault.jpg`}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : videoPreview ? (
                      <video src={videoPreview} muted className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Play size={32} style={{ color: "rgba(255,255,255,0.3)" }} />
                      </div>
                    )}

                    <div className="absolute top-3 right-3 z-10">
                      <span className="px-3 py-1 rounded-full text-[10px] font-medium" style={{ backgroundColor: "hsl(0 100% 40%)", color: "white" }}>
                        pular 5s
                      </span>
                    </div>

                    {linkUrl && (
                      <div className="absolute top-3 left-3 z-10 flex flex-col items-center p-2 rounded-lg" style={{ backgroundColor: "hsl(0 100% 40%)" }}>
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
                    Preview aproximado — proporção {aspectRatio}, posição {videoPosition === "center" ? "centro" : videoPosition === "left" ? "esquerda" : "direita"}
                  </span>
                </div>
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={saving}
              className="w-full sm:w-auto px-8 py-2.5 font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 rounded-xl hover:shadow-lg"
              style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", color: "var(--layout-header-text, #ffffff)", border: "none" }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 20px color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 40%, transparent)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              {editId ? "Salvar Alterações" : "Cadastrar Pré-Roll"}
            </button>
          </div>
        </form>

        {/* List */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", color: "var(--layout-header-text, #ffffff)" }}>
            <h3 className="text-sm font-bold">📋 Pré-Rolls Cadastrados</h3>
            <span className="text-[9px] font-normal px-2.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
              {prerolls.length} item{prerolls.length !== 1 ? "s" : ""}
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
                            <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #444444) 15%, transparent)", color: "var(--layout-icon-color, #888888)" }}>Mid-Roll</span>
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
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                          <Eye size={11} /> {p.views_count || 0} visualizações
                        </span>
                        <span className="flex items-center gap-1 text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                          <MousePointerClick size={11} /> {p.clicks_count || 0} cliques
                        </span>
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
