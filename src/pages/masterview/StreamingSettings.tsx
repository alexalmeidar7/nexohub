import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, Trash2, Radio, Video, Youtube, ArrowLeft, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import ProtectedRoute from "@/components/ProtectedRoute";

interface Channel {
  id: string;
  name: string;
  url: string;
  type: string;
  cover_url: string;
  background_url: string;
  active: boolean;
}

const typeIcons: Record<string, typeof Video> = {
  video: Video,
  audio: Radio,
  youtube: Youtube,
};

const typeLabels: Record<string, string> = {
  video: "Vídeo ao vivo",
  audio: "Áudio ao vivo",
  youtube: "Vídeo do YouTube",
};

function StreamingSettingsContent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState("video");
  const [coverUrl, setCoverUrl] = useState("");
  const [bgUrl, setBgUrl] = useState("");

  useEffect(() => {
    if (user) loadChannels();
  }, [user]);

  const loadChannels = async () => {
    const { data } = await supabase
      .from("streaming_channels")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at");
    setChannels((data || []) as Channel[]);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!user || !name.trim() || !url.trim()) {
      toast({ title: "Preencha nome e URL do canal", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("streaming_channels").insert({
      user_id: user.id,
      name: name.trim(),
      url: url.trim(),
      type,
      cover_url: coverUrl,
      background_url: bgUrl,
    });

    if (error) {
      toast({ title: "Erro ao adicionar canal", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Canal adicionado!" });
      setName("");
      setUrl("");
      setType("video");
      setCoverUrl("");
      setBgUrl("");
      await loadChannels();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("streaming_channels").delete().eq("id", id);
    await loadChannels();
    toast({ title: "Canal removido." });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/masterview/home")} className="gap-2">
            <ArrowLeft size={16} /> Voltar
          </Button>
          <div>
            <p className="text-xs text-muted-foreground font-medium tracking-widest uppercase">Configurações</p>
            <h2 className="text-2xl font-light">Canais de Streaming</h2>
          </div>
        </div>

        {/* Add Channel Form */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold">Adicionar Canal</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Nome do Canal</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Positiva FM" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tipo</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">Vídeo ao vivo</SelectItem>
                  <SelectItem value="audio">Áudio ao vivo</SelectItem>
                  <SelectItem value="youtube">Vídeo do YouTube</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs text-muted-foreground">URL do Streaming</label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">URL da Capa (opcional)</label>
              <Input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">URL do Fundo (opcional)</label>
              <Input value={bgUrl} onChange={(e) => setBgUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <Button onClick={handleAdd} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
            Adicionar Canal
          </Button>
        </div>

        {/* Channel List */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Canais Cadastrados ({channels.length})</h3>
          {channels.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum canal cadastrado.</p>
          ) : (
            channels.map((ch) => {
              const TypeIcon = typeIcons[ch.type] || Radio;
              return (
                <div key={ch.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <TypeIcon size={18} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{ch.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{ch.url}</p>
                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full mt-1 inline-block">
                      {typeLabels[ch.type] || ch.type}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(ch.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function StreamingSettings() {
  return (
    <ProtectedRoute>
      <StreamingSettingsContent />
    </ProtectedRoute>
  );
}
