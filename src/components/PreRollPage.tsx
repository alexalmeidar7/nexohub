import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Plus, Film } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

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
}

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export default function PreRollPage() {
  const { user } = useAuth();
  const [prerolls, setPrerolls] = useState<PreRoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState("");
  const [diasSemana, setDiasSemana] = useState<string[]>([]);
  const [horarioInicio, setHorarioInicio] = useState("00:00");
  const [horarioFim, setHorarioFim] = useState("23:59");
  const [priority, setPriority] = useState("1");
  const [linkUrl, setLinkUrl] = useState("");
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
    if (data) setPrerolls(data as PreRoll[]);
    setLoading(false);
  };

  const toggleDia = (dia: string) => {
    setDiasSemana((prev) => (prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]));
  };

  const uploadVideo = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop();
    const path = `${user!.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("preroll").upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("preroll").getPublicUrl(path);
    return data.publicUrl;
  };

  const resetForm = () => {
    setVideoFile(null);
    setVideoPreview("");
    setDiasSemana([]);
    setHorarioInicio("00:00");
    setHorarioFim("23:59");
    setPriority("1");
    setLinkUrl("");
    setEditId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!editId && !videoFile) {
      toast({ title: "Selecione um vídeo .mp4", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let videoUrl = "";
      if (videoFile) videoUrl = await uploadVideo(videoFile);

      if (editId) {
        const update: any = {
          dias_semana: diasSemana,
          horario_inicio: horarioInicio,
          horario_fim: horarioFim,
          priority: parseInt(priority) || 1,
          link_url: linkUrl,
        };
        if (videoUrl) update.video_url = videoUrl;
        await supabase.from("comercial_preroll").update(update).eq("id", editId);
        toast({ title: "Pre-Roll atualizado!" });
      } else {
        await supabase.from("comercial_preroll").insert({
          user_id: user.id,
          video_url: videoUrl,
          dias_semana: diasSemana,
          horario_inicio: horarioInicio,
          horario_fim: horarioFim,
          priority: parseInt(priority) || 1,
          link_url: linkUrl,
        });
        toast({ title: "Pre-Roll cadastrado!" });
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
    setDiasSemana(p.dias_semana || []);
    setHorarioInicio(p.horario_inicio);
    setHorarioFim(p.horario_fim);
    setPriority(String(p.priority));
    setLinkUrl((p as any).link_url || "");
    setVideoPreview(p.video_url);
    setVideoFile(null);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("comercial_preroll").delete().eq("id", id);
    toast({ title: "Pre-Roll removido" });
    loadData();
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("comercial_preroll").update({ active: !active }).eq("id", id);
    loadData();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={32} /></div>;

  return (
    <div className="space-y-8 max-w-4xl">
      <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Film size={20} />
          {editId ? "Editar Pre-Roll" : "Novo Pre-Roll"}
        </h3>

        <div>
          <label className="text-sm font-medium block mb-1">Vídeo (.mp4)</label>
          <input
            type="file"
            accept="video/mp4"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
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
          <p className="text-xs text-muted-foreground mt-1">Exibirá botão "Clique Aqui" durante o pre-roll.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
            <label className="text-sm font-medium block mb-1">Prioridade</label>
            <input
              type="number"
              min="1"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#d30707] text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-[#b00606] transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
            {editId ? "Salvar Alterações" : "Cadastrar Pre-Roll"}
          </button>
          {editId && (
            <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg text-sm border border-white/20 hover:bg-white/5">
              Cancelar
            </button>
          )}
        </div>
      </form>

      {/* List */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold">Pre-Rolls Cadastrados ({prerolls.length})</h3>
        {prerolls.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pre-roll cadastrado.</p>}
        {prerolls.map((p) => (
          <div key={p.id} className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-4">
            <video src={p.video_url} className="w-28 h-16 object-cover rounded-lg" muted />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">
                {p.horario_inicio} - {p.horario_fim}
              </div>
              <div className="text-xs text-muted-foreground">
                {(p.dias_semana && p.dias_semana.length > 0) ? p.dias_semana.map(d => d.slice(0, 3)).join(", ") : "Todos os dias"}
                {" • "}Prioridade: {p.priority}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => toggleActive(p.id, p.active)}
                className={`text-xs px-3 py-1 rounded-full font-bold ${p.active ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}
              >
                {p.active ? "Ativo" : "Inativo"}
              </button>
              <button onClick={() => startEdit(p)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <Pencil size={14} />
              </button>
              <button onClick={() => handleDelete(p.id)} className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
