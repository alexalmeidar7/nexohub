import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Plus, Film } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";

interface PreRoll {
  id: string;
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
}

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export default function PreRollPage() {
  const { user } = useAuth();
  const [prerolls, setPrerolls] = useState<PreRoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form
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
    const { data } = await supabase
      .from("comercial_preroll")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
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
    setMediaType("video");
    setVideoFile(null);
    setVideoPreview("");
    setYoutubeUrl("");
    setDiasSemana([]);
    setHorarioInicio("00:00");
    setHorarioFim("23:59");
    setPriority("1");
    setLinkUrl("");
    setDataInicial(new Date());
    setDataFinal(undefined);
    setEditId(null);
  };

  const extractYoutubeId = (url: string): string | null => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (mediaType === "video" && !editId && !videoFile) {
      toast({ title: "Selecione um vídeo .mp4 (até 5MB)", variant: "destructive" });
      return;
    }
    if (mediaType === "youtube" && !youtubeUrl) {
      toast({ title: "Cole o link do YouTube", variant: "destructive" });
      return;
    }
    if (mediaType === "youtube" && !extractYoutubeId(youtubeUrl)) {
      toast({ title: "Link do YouTube inválido", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      let videoUrl = "";
      if (mediaType === "video" && videoFile) videoUrl = await uploadVideo(videoFile);

      const payload: any = {
        dias_semana: diasSemana,
        horario_inicio: horarioInicio,
        horario_fim: horarioFim,
        priority: parseInt(priority) || 1,
        link_url: linkUrl,
        media_type: mediaType,
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
      resetForm();
      loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const startEdit = (p: PreRoll) => {
    setEditId(p.id);
    setMediaType((p.media_type as "video" | "youtube") || "video");
    setDiasSemana(p.dias_semana || []);
    setHorarioInicio(p.horario_inicio);
    setHorarioFim(p.horario_fim);
    setPriority(String(p.priority));
    setLinkUrl(p.link_url || "");
    setYoutubeUrl(p.youtube_url || "");
    setVideoPreview(p.media_type === "video" ? p.video_url : "");
    setVideoFile(null);
    setDataInicial(p.data_inicial ? new Date(p.data_inicial + "T00:00:00") : undefined);
    setDataFinal(p.data_final ? new Date(p.data_final + "T00:00:00") : undefined);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("comercial_preroll").delete().eq("id", id);
    toast({ title: "Pré-Roll removido" });
    loadData();
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("comercial_preroll").update({ active: !active }).eq("id", id);
    loadData();
  };

  const getStatus = (p: PreRoll) => {
    if (!p.active) return { label: "Inativo", color: "bg-red-600/20 text-red-400" };
    const today = format(new Date(), "yyyy-MM-dd");
    if (p.data_final && today > p.data_final) return { label: "Expirado", color: "bg-yellow-600/20 text-yellow-400" };
    if (p.data_inicial && today < p.data_inicial) return { label: "Agendado", color: "bg-blue-600/20 text-blue-400" };
    return { label: "Ativo", color: "bg-green-600/20 text-green-400" };
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={32} /></div>;

  return (
    <div className="space-y-8 max-w-4xl">
      <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Film size={20} />
          {editId ? "Editar Pré-Roll" : "Novo Pré-Roll"}
        </h3>

        {/* Media type selection */}
        <div>
          <label className="text-sm font-medium block mb-2">Tipo de Mídia</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={mediaType === "video"}
                onChange={() => setMediaType("video")}
                className="accent-[#d30707]"
              />
              <span className="text-sm">Upload de vídeo (até 5MB)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={mediaType === "youtube"}
                onChange={() => setMediaType("youtube")}
                className="accent-[#d30707]"
              />
              <span className="text-sm">Link do YouTube</span>
            </label>
          </div>
        </div>

        {/* Video upload */}
        {mediaType === "video" && (
          <div>
            <label className="text-sm font-medium block mb-1">Vídeo (.mp4, máx 5MB)</label>
            <input
              type="file"
              accept="video/mp4"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.size > 5 * 1024 * 1024) {
                    toast({ title: "O vídeo deve ter no máximo 5MB", variant: "destructive" });
                    return;
                  }
                  setVideoFile(f);
                  setVideoPreview(URL.createObjectURL(f));
                }
              }}
              className="text-sm"
            />
            {videoPreview && (
              <video src={videoPreview} controls className="mt-2 w-64 rounded-lg border border-white/20" />
            )}
          </div>
        )}

        {/* YouTube URL */}
        {mediaType === "youtube" && (
          <div>
            <label className="text-sm font-medium block mb-1">Link do YouTube</label>
            <input
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm"
            />
            {youtubeUrl && extractYoutubeId(youtubeUrl) && (
              <img
                src={`https://img.youtube.com/vi/${extractYoutubeId(youtubeUrl)}/hqdefault.jpg`}
                alt="Thumbnail"
                className="mt-2 w-64 rounded-lg border border-white/20"
              />
            )}
          </div>
        )}

        <div>
          <label className="text-sm font-medium block mb-2">Dias da Semana</label>
          <div className="flex flex-wrap gap-2">
            {DIAS.map((dia) => (
              <button
                key={dia}
                type="button"
                onClick={() => toggleDia(dia)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                  diasSemana.includes(dia) ? "bg-[#d30707] text-white" : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                {dia.slice(0, 3)}
              </button>
            ))}
          </div>
          {diasSemana.length === 0 && <p className="text-xs text-muted-foreground mt-1">Todos os dias se nenhum selecionado.</p>}
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Link do Anúncio (opcional)</label>
          <input
            type="url"
            placeholder="https://exemplo.com/oferta"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">Exibirá botão "Clique Aqui" durante o pré-roll.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1">Horário Início</label>
            <input
              type="time"
              value={horarioInicio}
              onChange={(e) => setHorarioInicio(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Horário Fim</label>
            <input
              type="time"
              value={horarioFim}
              onChange={(e) => setHorarioFim(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Data Inicial</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left text-sm font-normal bg-white/5 border-white/20 hover:bg-white/10", !dataInicial && "text-muted-foreground")}>
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
            <label className="text-sm font-medium block mb-1">Data Final</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left text-sm font-normal bg-white/5 border-white/20 hover:bg-white/10", !dataFinal && "text-muted-foreground")}>
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

        <div>
          <label className="text-sm font-medium block mb-1">Prioridade</label>
          <input
            type="number"
            min="1"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-32 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#d30707] text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-[#b00606] transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
            {editId ? "Salvar Alterações" : "Cadastrar Pré-Roll"}
          </button>
          {editId && (
            <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg text-sm border border-white/20 hover:bg-white/5">
              Cancelar
            </button>
          )}
        </div>
      </form>

      {/* List — shows ALL prerolls including inactive/expired */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold">Pré-Rolls Cadastrados ({prerolls.length})</h3>
        {prerolls.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pré-roll cadastrado.</p>}
        {prerolls.map((p) => {
          const status = getStatus(p);
          return (
            <div key={p.id} className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-4">
              {p.media_type === "youtube" && p.youtube_url ? (
                <img
                  src={`https://img.youtube.com/vi/${extractYoutubeId(p.youtube_url) || ""}/mqdefault.jpg`}
                  alt="YT"
                  className="w-28 h-16 object-cover rounded-lg"
                />
              ) : (
                <video src={p.video_url} className="w-28 h-16 object-cover rounded-lg" muted />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold">
                  {p.horario_inicio} - {p.horario_fim}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {p.media_type === "youtube" ? "YouTube" : "Vídeo"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {(p.dias_semana && p.dias_semana.length > 0) ? p.dias_semana.map(d => d.slice(0, 3)).join(", ") : "Todos os dias"}
                  {" • "}Prioridade: {p.priority}
                </div>
                {(p.data_inicial || p.data_final) && (
                  <div className="text-xs text-muted-foreground">
                    {p.data_inicial && format(new Date(p.data_inicial + "T00:00:00"), "dd/MM/yyyy")}
                    {p.data_inicial && p.data_final && " → "}
                    {p.data_final && format(new Date(p.data_final + "T00:00:00"), "dd/MM/yyyy")}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-3 py-1 rounded-full font-bold ${status.color}`}>
                  {status.label}
                </span>
                <button
                  onClick={() => toggleActive(p.id, p.active)}
                  className="text-xs px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  title={p.active ? "Desativar" : "Ativar"}
                >
                  {p.active ? "Desativar" : "Ativar"}
                </button>
                <button onClick={() => startEdit(p)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(p.id)} className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
