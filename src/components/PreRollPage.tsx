import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Plus, Film, Eye, MousePointerClick } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { toast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";

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

  const resetForm = () => {
    setMediaType("video"); setVideoFile(null); setVideoPreview(""); setYoutubeUrl("");
    setDiasSemana([]); setHorarioInicio("00:00"); setHorarioFim("23:59");
    setPriority("1"); setLinkUrl(""); setDataInicial(new Date()); setDataFinal(undefined); setEditId(null);
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
      const payload: any = {
        dias_semana: diasSemana, horario_inicio: horarioInicio, horario_fim: horarioFim,
        priority: parseInt(priority) || 1, link_url: linkUrl, media_type: mediaType,
        youtube_url: mediaType === "youtube" ? youtubeUrl : "",
        data_inicial: dataInicial ? format(dataInicial, "yyyy-MM-dd") : null,
        data_final: dataFinal ? format(dataFinal, "yyyy-MM-dd") : null,
      };
      if (editId) {
        if (videoUrl) payload.video_url = videoUrl;
        await supabase.from("comercial_preroll").update(payload).eq("id", editId);
        toast({ title: "Pré-Roll atualizado!" });
      } else {
        payload.user_id = user.id;
        payload.video_url = mediaType === "video" ? videoUrl : "";
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
    setEditId(p.id); setMediaType((p.media_type as "video" | "youtube") || "video");
    setDiasSemana(p.dias_semana || []); setHorarioInicio(p.horario_inicio); setHorarioFim(p.horario_fim);
    setPriority(String(p.priority)); setLinkUrl(p.link_url || ""); setYoutubeUrl(p.youtube_url || "");
    setVideoPreview(p.media_type === "video" ? p.video_url : ""); setVideoFile(null);
    setDataInicial(p.data_inicial ? new Date(p.data_inicial + "T00:00:00") : undefined);
    setDataFinal(p.data_final ? new Date(p.data_final + "T00:00:00") : undefined);
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

          <div className="p-5 space-y-4">
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

            {/* Link */}
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: "#0d0446" }}>Link do Anúncio (opcional)</label>
              <input type="url" placeholder="https://exemplo.com/oferta" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
                className="w-full px-4 py-1.5 text-sm outline-none transition-colors" style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
              />
              <p className="text-[10px] mt-1" style={{ color: "rgba(13,4,70,0.4)" }}>Exibirá botão "Clique Aqui" durante o pré-roll.</p>
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

            {/* Priority */}
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: "#0d0446" }}>Prioridade</label>
              <input type="number" min="1" value={priority} onChange={(e) => setPriority(e.target.value)}
                className="w-32 px-4 py-1.5 text-sm outline-none transition-colors" style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
              />
            </div>

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
                      <div className="text-xs font-bold" style={{ color: "#0d0446" }}>
                        {p.horario_inicio} - {p.horario_fim}
                        <span className="ml-2 text-[10px] font-normal" style={{ color: "rgba(13,4,70,0.4)" }}>
                          {p.media_type === "youtube" ? "YouTube" : "Vídeo"}
                        </span>
                      </div>
                      <div className="text-[10px]" style={{ color: "rgba(13,4,70,0.5)" }}>
                        {(p.dias_semana && p.dias_semana.length > 0) ? p.dias_semana.map(d => d.slice(0, 3)).join(", ") : "Todos os dias"}
                        {" • "}Prioridade: {p.priority}
                      </div>
                      {(p.data_inicial || p.data_final) && (
                        <div className="text-[10px]" style={{ color: "rgba(13,4,70,0.4)" }}>
                          {p.data_inicial && format(new Date(p.data_inicial + "T00:00:00"), "dd/MM/yyyy")}
                          {p.data_inicial && p.data_final && " → "}
                          {p.data_final && format(new Date(p.data_final + "T00:00:00"), "dd/MM/yyyy")}
                        </div>
                      )}
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
