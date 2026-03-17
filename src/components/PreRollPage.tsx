import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Plus, Film, Eye, MousePointerClick, Image, Monitor, Play } from "lucide-react";
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

  // New fields
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [videoPosition, setVideoPosition] = useState<"center" | "left" | "right">("center");
  const [showPreview, setShowPreview] = useState(false);

  const bgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("comercial_preroll").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (data) setPrerolls(data as unknown as PreRoll[]);
    setLoading(false);
  };

  const toggleDia = (dia: string) => {
    setDiasSemana((prev) => (prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]));
  };

  const uploadVideo = async (file: File): Promise<string> => {
    if (file.size > 5 * 1024 * 1024) throw new Error("O vídeo deve ter no máximo 5MB");
    const ext = file.name.split(".").pop();
    const path = `${user!.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("preroll").upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("preroll").getPublicUrl(path);
    return data.publicUrl;
  };

  const uploadBackground = async (file: File): Promise<string> => {
    const compressed = await compressImage(file);
    const path = `${user!.id}/bg-${Date.now()}.webp`;
    const { error } = await supabase.storage.from("preroll").upload(path, compressed);
    if (error) throw error;
    const { data } = supabase.storage.from("preroll").getPublicUrl(path);
    return data.publicUrl;
  };

  const resetForm = () => {
    setNome(""); setActiveField(true);
    setMediaType("video"); setVideoFile(null); setVideoPreview(""); setYoutubeUrl("");
    setDiasSemana([]); setHorarioInicio("00:00"); setHorarioFim("23:59");
    setPriority("1"); setLinkUrl(""); setDataInicial(new Date()); setDataFinal(undefined); setEditId(null);
    setBackgroundFile(null); setBackgroundPreview(""); setAspectRatio("16:9"); setVideoPosition("center"); setShowPreview(false);
  };

  const extractYoutubeId = (url: string): string | null => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (mediaType === "video" && !editId && !videoFile) { toast({ title: "Selecione um vídeo .mp4 (até 5MB)", variant: "destructive" }); return; }
    if (mediaType === "youtube" && !youtubeUrl) { toast({ title: "Cole o link do YouTube", variant: "destructive" }); return; }
    if (mediaType === "youtube" && !extractYoutubeId(youtubeUrl)) { toast({ title: "Link do YouTube inválido", variant: "destructive" }); return; }
    setSaving(true);
    try {
      let videoUrl = "";
      if (mediaType === "video" && videoFile) videoUrl = await uploadVideo(videoFile);
      let bgUrl: string | undefined;
      if (backgroundFile) bgUrl = await uploadBackground(backgroundFile);

      const payload: any = {
        nome, active: activeField,
        dias_semana: diasSemana, horario_inicio: horarioInicio, horario_fim: horarioFim,
        priority: parseInt(priority) || 1, link_url: linkUrl, media_type: mediaType,
        youtube_url: mediaType === "youtube" ? youtubeUrl : "",
        data_inicial: dataInicial ? format(dataInicial, "yyyy-MM-dd") : null,
        data_final: dataFinal ? format(dataFinal, "yyyy-MM-dd") : null,
        aspect_ratio: aspectRatio,
        video_position: videoPosition,
      };
      if (bgUrl !== undefined) payload.background_url = bgUrl;

      if (editId) {
        if (videoUrl) payload.video_url = videoUrl;
        await supabase.from("comercial_preroll").update(payload).eq("id", editId);
        toast({ title: "Pré-Roll atualizado!" });
      } else {
        payload.user_id = user.id;
        payload.video_url = mediaType === "video" ? videoUrl : "";
        if (!bgUrl) payload.background_url = "";
        await supabase.from("comercial_preroll").insert(payload);
        toast({ title: "Pré-Roll cadastrado!" });
      }
      resetForm(); loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const startEdit = (p: PreRoll) => {
    setEditId(p.id); setNome(p.nome || ""); setActiveField(p.active);
    setMediaType((p.media_type as "video" | "youtube") || "video");
    setDiasSemana(p.dias_semana || []); setHorarioInicio(p.horario_inicio); setHorarioFim(p.horario_fim);
    setPriority(String(p.priority)); setLinkUrl(p.link_url || ""); setYoutubeUrl(p.youtube_url || "");
    setVideoPreview(p.media_type === "video" ? p.video_url : ""); setVideoFile(null);
    setDataInicial(p.data_inicial ? new Date(p.data_inicial + "T00:00:00") : undefined);
    setDataFinal(p.data_final ? new Date(p.data_final + "T00:00:00") : undefined);
    setBackgroundPreview(p.background_url || ""); setBackgroundFile(null);
    setAspectRatio((p.aspect_ratio as "16:9" | "9:16") || "16:9");
    setVideoPosition((p.video_position as "center" | "left" | "right") || "center");
    setShowPreview(false);
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
    if (p.data_inicial && today < p.data_inicial) return { label: "Agendado", color: { backgroundColor: "rgba(45,190,243,0.1)", color: "#2dbef3" } };
    return { label: "Ativo", color: { backgroundColor: "rgba(34,197,94,0.1)", color: "#22c55e" } };
  };

  if (loading) return <ModulePageSkeleton />;

  const inputStyle: React.CSSProperties = {
    backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px",
  };

  const sectionHeader = (icon: string, title: string) => (
    <div className="flex items-center gap-2 mb-3 mt-1">
      <span className="text-sm">{icon}</span>
      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#0d0446" }}>{title}</span>
      <div className="flex-1 h-px" style={{ backgroundColor: "rgba(13,4,70,0.1)" }} />
    </div>
  );

  // Get a preview thumbnail
  const getPreviewThumb = (): string | null => {
    if (mediaType === "youtube" && youtubeUrl) {
      const id = extractYoutubeId(youtubeUrl);
      if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    }
    if (videoPreview) return null; // video element needed
    return null;
  };

  return (
    <div className="animate-fade-in">
      <div className="rounded-2xl" style={{ background: "#d9e9fa", boxShadow: "0 8px 32px rgba(13,4,70,0.12)", padding: "20px" }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(13,4,70,0.08)" }}>
            <Film size={20} style={{ color: "#0d0446" }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: "#0d0446" }}>Pré-Roll</h3>
            <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.5)" }}>Gerencie anúncios exibidos antes do conteúdo ao vivo</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="rounded-xl overflow-hidden mb-5" style={{ backgroundColor: "#ffffff", boxShadow: "0 2px 12px rgba(13,4,70,0.06)" }}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)" }}>
            <h3 className="text-sm font-bold" style={{ color: "#ffffff" }}>
              {editId ? "✏️ Editar Pré-Roll" : "➕ Novo Pré-Roll"}
            </h3>
            {editId && (
              <button type="button" onClick={resetForm}
                className="flex items-center gap-1 px-3 py-1 text-[10px] font-bold rounded-full transition-all"
                style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.3)" }}
              >
                Cancelar
              </button>
            )}
          </div>

          <div className="p-5 space-y-5">
            {/* ──── SEÇÃO 1: IDENTIFICAÇÃO ──── */}
            {sectionHeader("🏷️", "Identificação")}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "#0d0446" }}>Nome do Pré-Roll</label>
                <input type="text" placeholder="Ex: Campanha Black Friday" value={nome} onChange={(e) => setNome(e.target.value)}
                  className="w-full px-4 py-1.5 text-sm outline-none transition-colors" style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-1.5">
                  <input type="checkbox" checked={activeField} onChange={(e) => setActiveField(e.target.checked)}
                    className="w-4 h-4 rounded" style={{ accentColor: "#0d0446" }} />
                  <span className="text-xs font-semibold" style={{ color: "#0d0446" }}>Ativo</span>
                  <span className="text-[10px]" style={{ color: "rgba(13,4,70,0.4)" }}>— Desmarque para salvar como inativo</span>
                </label>
              </div>
            </div>

            {/* ──── SEÇÃO 2: MÍDIA ──── */}
            {sectionHeader("🎬", "Mídia")}

            {/* Media type */}
            <div>
              <label className="text-xs font-semibold block mb-2" style={{ color: "#0d0446" }}>Tipo de Mídia</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={mediaType === "video"} onChange={() => setMediaType("video")} style={{ accentColor: "#0d0446" }} />
                  <span className="text-xs" style={{ color: "#0d0446" }}>Upload de vídeo (até 5MB)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={mediaType === "youtube"} onChange={() => setMediaType("youtube")} style={{ accentColor: "#0d0446" }} />
                  <span className="text-xs" style={{ color: "#0d0446" }}>Link do YouTube</span>
                </label>
              </div>
            </div>

            {mediaType === "video" && (
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "#0d0446" }}>Vídeo (.mp4, máx 5MB)</label>
                <input type="file" accept="video/mp4" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 5 * 1024 * 1024) { toast({ title: "O vídeo deve ter no máximo 5MB", variant: "destructive" }); return; }
                    setVideoFile(f); setVideoPreview(URL.createObjectURL(f));
                  }
                }} className="text-xs" style={{ color: "#0d0446" }} />
                {videoPreview && <video src={videoPreview} controls className="mt-2 w-64 rounded-lg" style={{ border: "1px solid rgba(13,4,70,0.1)" }} />}
              </div>
            )}

            {mediaType === "youtube" && (
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "#0d0446" }}>Link do YouTube</label>
                <input type="url" placeholder="https://www.youtube.com/watch?v=..." value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)}
                  className="w-full px-4 py-1.5 text-sm outline-none transition-colors" style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
                />
                {youtubeUrl && extractYoutubeId(youtubeUrl) && (
                  <img src={`https://img.youtube.com/vi/${extractYoutubeId(youtubeUrl)}/hqdefault.jpg`} alt="Thumbnail" className="mt-2 w-64 rounded-lg" style={{ border: "1px solid rgba(13,4,70,0.1)" }} />
                )}
              </div>
            )}

            {/* Aspect Ratio + Position */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Aspect Ratio */}
              <div>
                <label className="text-xs font-semibold block mb-2" style={{ color: "#0d0446" }}>Proporção do Vídeo</label>
                <div className="flex gap-3">
                  {(["16:9", "9:16"] as const).map((ratio) => (
                    <button key={ratio} type="button" onClick={() => setAspectRatio(ratio)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all"
                      style={{
                        border: aspectRatio === ratio ? "2px solid #0d0446" : "2px solid rgba(13,4,70,0.1)",
                        backgroundColor: aspectRatio === ratio ? "rgba(13,4,70,0.05)" : "transparent",
                      }}
                    >
                      <div
                        className="rounded"
                        style={{
                          width: ratio === "16:9" ? 48 : 24,
                          height: ratio === "16:9" ? 27 : 42,
                          backgroundColor: aspectRatio === ratio ? "#0d0446" : "rgba(13,4,70,0.15)",
                          transition: "background-color 0.2s",
                        }}
                      />
                      <span className="text-[10px] font-bold" style={{ color: aspectRatio === ratio ? "#0d0446" : "rgba(13,4,70,0.4)" }}>{ratio}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Video Position */}
              <div>
                <label className="text-xs font-semibold block mb-2" style={{ color: "#0d0446" }}>Posição do Vídeo</label>
                <div className="flex gap-3">
                  {([
                    { value: "left", label: "Esquerda", align: "flex-start" },
                    { value: "center", label: "Centro", align: "center" },
                    { value: "right", label: "Direita", align: "flex-end" },
                  ] as const).map((pos) => (
                    <button key={pos.value} type="button" onClick={() => setVideoPosition(pos.value)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all flex-1"
                      style={{
                        border: videoPosition === pos.value ? "2px solid #0d0446" : "2px solid rgba(13,4,70,0.1)",
                        backgroundColor: videoPosition === pos.value ? "rgba(13,4,70,0.05)" : "transparent",
                      }}
                    >
                      {/* Visual representation */}
                      <div className="w-12 h-8 rounded overflow-hidden flex" style={{
                        backgroundColor: "rgba(13,4,70,0.06)",
                        justifyContent: pos.align,
                        alignItems: "center",
                        padding: "2px",
                      }}>
                        <div className="rounded-sm" style={{
                          width: aspectRatio === "16:9" ? 20 : 10,
                          height: aspectRatio === "16:9" ? 12 : 22,
                          backgroundColor: videoPosition === pos.value ? "#0d0446" : "rgba(13,4,70,0.2)",
                          transition: "background-color 0.2s",
                          flexShrink: 0,
                        }} />
                      </div>
                      <span className="text-[10px] font-bold" style={{ color: videoPosition === pos.value ? "#0d0446" : "rgba(13,4,70,0.4)" }}>
                        {pos.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Background image */}
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: "#0d0446" }}>
                <Image size={12} className="inline mr-1" />
                Background do Pré-Roll (opcional)
              </label>
              <p className="text-[10px] mb-2" style={{ color: "rgba(13,4,70,0.4)" }}>
                Imagem de fundo exibida atrás do vídeo. Se não enviar, será usado o gradiente padrão.
              </p>
              <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setBackgroundFile(f); setBackgroundPreview(URL.createObjectURL(f)); }
              }} />
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => bgInputRef.current?.click()}
                  className="px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2"
                  style={{ backgroundColor: "rgba(13,4,70,0.06)", color: "#0d0446", border: "1px solid rgba(13,4,70,0.15)" }}
                >
                  <Image size={14} /> Escolher imagem
                </button>
                {backgroundPreview && (
                  <div className="flex items-center gap-2">
                    <img src={backgroundPreview} alt="Background" className="w-16 h-10 object-cover rounded-lg" style={{ border: "1px solid rgba(13,4,70,0.1)" }} />
                    <button type="button" onClick={() => { setBackgroundFile(null); setBackgroundPreview(""); }}
                      className="text-[10px] px-2 py-1 rounded-full" style={{ color: "#dc2626", backgroundColor: "rgba(220,38,38,0.1)" }}>
                      Remover
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ──── SEÇÃO 3: AGENDAMENTO ──── */}
            {sectionHeader("📅", "Agendamento")}

            {/* Days */}
            <div>
              <label className="text-xs font-semibold block mb-2" style={{ color: "#0d0446" }}>Dias da Semana</label>
              <div className="flex flex-wrap gap-2">
                {DIAS.map((dia) => (
                  <button key={dia} type="button" onClick={() => toggleDia(dia)}
                    className="px-3 py-1 rounded-full text-[10px] font-bold transition-all"
                    style={diasSemana.includes(dia)
                      ? { backgroundColor: "#0d0446", color: "#ffffff" }
                      : { backgroundColor: "rgba(13,4,70,0.06)", color: "rgba(13,4,70,0.5)" }
                    }
                  >
                    {dia.slice(0, 3)}
                  </button>
                ))}
              </div>
              {diasSemana.length === 0 && <p className="text-[10px] mt-1" style={{ color: "rgba(13,4,70,0.4)" }}>Todos os dias se nenhum selecionado.</p>}
            </div>

            {/* Schedule grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "#0d0446" }}>Horário Início</label>
                <input type="time" value={horarioInicio} onChange={(e) => setHorarioInicio(e.target.value)}
                  className="w-full px-4 py-1.5 text-sm outline-none transition-colors" style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "#0d0446" }}>Horário Fim</label>
                <input type="time" value={horarioFim} onChange={(e) => setHorarioFim(e.target.value)}
                  className="w-full px-4 py-1.5 text-sm outline-none transition-colors" style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "#0d0446" }}>Data Inicial</label>
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
                <label className="text-xs font-semibold block mb-1" style={{ color: "#0d0446" }}>Data Final</label>
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
            {sectionHeader("⚙️", "Configurações")}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Link */}
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "#0d0446" }}>Link do Anúncio (opcional)</label>
                <input type="url" placeholder="https://exemplo.com/oferta" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
                  className="w-full px-4 py-1.5 text-sm outline-none transition-colors" style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
                />
                <p className="text-[10px] mt-1" style={{ color: "rgba(13,4,70,0.4)" }}>Exibirá QR Code durante o pré-roll.</p>
              </div>
              {/* Priority */}
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "#0d0446" }}>Prioridade</label>
                <input type="number" min="1" value={priority} onChange={(e) => setPriority(e.target.value)}
                  className="w-32 px-4 py-1.5 text-sm outline-none transition-colors" style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
                />
              </div>
            </div>

            {/* ──── SEÇÃO 5: PRÉ-VISUALIZAÇÃO ──── */}
            {sectionHeader("👁️", "Pré-visualização")}

            <button type="button" onClick={() => setShowPreview(!showPreview)}
              className="px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2"
              style={{
                backgroundColor: showPreview ? "#0d0446" : "rgba(13,4,70,0.06)",
                color: showPreview ? "#ffffff" : "#0d0446",
                border: "1px solid rgba(13,4,70,0.15)",
              }}
            >
              <Monitor size={14} />
              {showPreview ? "Ocultar Preview" : "Visualizar Pré-Roll"}
            </button>

            {showPreview && (
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.1)" }}>
                {/* Preview container */}
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
                  {/* Video placeholder */}
                  <div
                    className="relative shadow-2xl overflow-hidden"
                    style={{
                      aspectRatio: aspectRatio === "16:9" ? "16 / 9" : "9 / 16",
                      height: aspectRatio === "16:9" ? "85%" : "90%",
                      backgroundColor: "hsl(0 0% 0%)",
                      borderRadius: "1rem",
                    }}
                  >
                    {/* Video content */}
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

                    {/* Skip button mock */}
                    <div className="absolute top-3 right-3 z-10">
                      <span className="px-3 py-1 rounded-full text-[10px] font-medium" style={{ backgroundColor: "hsl(0 100% 40%)", color: "white" }}>
                        pular 5s
                      </span>
                    </div>

                    {/* QR Code mock */}
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
                <div className="px-3 py-2 text-center" style={{ backgroundColor: "rgba(13,4,70,0.03)" }}>
                  <span className="text-[10px]" style={{ color: "rgba(13,4,70,0.5)" }}>
                    Preview aproximado — proporção {aspectRatio}, posição {videoPosition === "center" ? "centro" : videoPosition === "left" ? "esquerda" : "direita"}
                  </span>
                </div>
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={saving}
              className="px-6 py-2 font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-50 rounded-full"
              style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff", border: "none" }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 15px rgba(38,143,250,0.4)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              {editId ? "Salvar Alterações" : "Cadastrar Pré-Roll"}
            </button>
          </div>
        </form>

        {/* List */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", boxShadow: "0 2px 12px rgba(13,4,70,0.06)" }}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)" }}>
            <h3 className="text-sm font-bold" style={{ color: "#ffffff" }}>📋 Pré-Rolls Cadastrados</h3>
            <span className="text-[9px] font-normal px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff" }}>
              {prerolls.length} item{prerolls.length !== 1 ? "s" : ""}
            </span>
          </div>

          {prerolls.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: "rgba(13,4,70,0.4)" }}>Nenhum pré-roll cadastrado.</p>
          ) : (
            <div className="p-3 space-y-2">
              {prerolls.map((p) => {
                const status = getStatus(p);
                return (
                  <div key={p.id} className="flex items-center gap-4 rounded-xl p-3" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.06)" }}>
                    {p.media_type === "youtube" && p.youtube_url ? (
                      <img src={`https://img.youtube.com/vi/${extractYoutubeId(p.youtube_url) || ""}/mqdefault.jpg`} alt="YT" className="w-28 h-16 object-cover rounded-lg" />
                    ) : (
                      <video src={p.video_url} className="w-28 h-16 object-cover rounded-lg" muted />
                    )}
                    <div className="flex-1 min-w-0">
                      {p.nome && (
                        <div className="text-xs font-bold truncate" style={{ color: "#0d0446" }}>{p.nome}</div>
                      )}
                      <div className="text-xs font-bold" style={{ color: p.nome ? "rgba(13,4,70,0.6)" : "#0d0446" }}>
                        {p.horario_inicio} - {p.horario_fim}
                        <span className="ml-2 text-[10px] font-normal" style={{ color: "rgba(13,4,70,0.4)" }}>
                          {p.media_type === "youtube" ? "YouTube" : "Vídeo"} • {p.aspect_ratio || "16:9"}
                        </span>
                      </div>
                      <div className="text-[10px]" style={{ color: "rgba(13,4,70,0.5)" }}>
                        {(p.dias_semana && p.dias_semana.length > 0) ? p.dias_semana.map(d => d.slice(0, 3)).join(", ") : "Todos os dias"}
                        {" • "}Prioridade: {p.priority}
                        {" • "}Posição: {p.video_position === "center" ? "Centro" : p.video_position === "left" ? "Esquerda" : "Direita"}
                      </div>
                      {(p.data_inicial || p.data_final) && (
                        <div className="text-[10px]" style={{ color: "rgba(13,4,70,0.4)" }}>
                          {p.data_inicial && format(new Date(p.data_inicial + "T00:00:00"), "dd/MM/yyyy")}
                          {p.data_inicial && p.data_final && " → "}
                          {p.data_final && format(new Date(p.data_final + "T00:00:00"), "dd/MM/yyyy")}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-[10px]" style={{ color: "rgba(13,4,70,0.5)" }}>
                          <Eye size={11} /> {p.views_count || 0} visualizações
                        </span>
                        <span className="flex items-center gap-1 text-[10px]" style={{ color: "rgba(13,4,70,0.5)" }}>
                          <MousePointerClick size={11} /> {p.clicks_count || 0} cliques
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] px-3 py-1 rounded-full font-bold" style={status.color}>
                        {status.label}
                      </span>
                      <button onClick={() => toggleActive(p.id, p.active)}
                        className="text-[10px] px-2 py-1 rounded-full transition-colors"
                        style={{ backgroundColor: "rgba(13,4,70,0.06)", color: "#0d0446" }}
                      >
                        {p.active ? "Desativar" : "Ativar"}
                      </button>
                      <button onClick={() => startEdit(p)} className="p-1.5 rounded-lg transition-colors" style={{ color: "rgba(13,4,70,0.4)" }}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg transition-colors" style={{ color: "rgba(13,4,70,0.4)" }}>
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
