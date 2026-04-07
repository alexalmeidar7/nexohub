import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Palette, Image as ImageIcon, Layers } from "lucide-react";

type BgType = "cor" | "imagem" | "degrade";

interface TelaPromoConfig {
  bg_type: BgType;
  bg_color: string;
  bg_image_url: string;
  gradient_color_a: string;
  gradient_color_b: string;
  gradient_angle: number;
}

const defaultConfig: TelaPromoConfig = {
  bg_type: "cor",
  bg_color: "#1a1a2e",
  bg_image_url: "",
  gradient_color_a: "#1a1a2e",
  gradient_color_b: "#16213e",
  gradient_angle: 135,
};

function buildPreviewStyle(config: TelaPromoConfig): React.CSSProperties {
  switch (config.bg_type) {
    case "cor":
      return { backgroundColor: config.bg_color };
    case "imagem":
      return config.bg_image_url
        ? { backgroundImage: `url(${config.bg_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }
        : { backgroundColor: "#1a1a2e" };
    case "degrade":
      return { background: `linear-gradient(${config.gradient_angle}deg, ${config.gradient_color_a}, ${config.gradient_color_b})` };
    default:
      return { backgroundColor: "#1a1a2e" };
  }
}

export default function ConfigTelaPromoPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState<TelaPromoConfig>(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("cenario_config")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.cenario_config) {
        const raw = data.cenario_config as any;
        if (raw.tela_promo_bg) {
          setConfig({ ...defaultConfig, ...raw.tela_promo_bg });
        }
      }
    })();
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("user_settings")
        .select("cenario_config")
        .eq("user_id", user.id)
        .maybeSingle();

      const prev = (existing?.cenario_config as any) || {};
      const merged = { ...prev, tela_promo_bg: config };

      await supabase
        .from("user_settings")
        .upsert({ user_id: user.id, cenario_config: merged as any }, { onConflict: "user_id" });

      toast.success("Configurações salvas!");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user || !e.target.files?.[0]) return;
    setUploading(true);
    try {
      const file = e.target.files[0];
      const ext = file.name.split(".").pop();
      const path = `${user.id}/tela-promo-bg.${ext}`;
      const { error } = await supabase.storage.from("backgrounds").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("backgrounds").getPublicUrl(path);
      setConfig(c => ({ ...c, bg_image_url: urlData.publicUrl }));
      toast.success("Imagem enviada!");
    } catch {
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  }

  const update = (partial: Partial<TelaPromoConfig>) => setConfig(c => ({ ...c, ...partial }));

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Settings panel */}
      <div className="flex-1 space-y-6">
        <div className="space-y-3">
          <Label className="text-sm font-semibold" style={{ color: "var(--layout-text)" }}>Tipo de fundo</Label>
          <Select value={config.bg_type} onValueChange={v => update({ bg_type: v as BgType })}>
            <SelectTrigger className="w-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--layout-text)", borderColor: "rgba(255,255,255,0.1)" }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cor">
                <span className="flex items-center gap-2"><Palette size={14} /> Cor sólida</span>
              </SelectItem>
              <SelectItem value="imagem">
                <span className="flex items-center gap-2"><ImageIcon size={14} /> Imagem</span>
              </SelectItem>
              <SelectItem value="degrade">
                <span className="flex items-center gap-2"><Layers size={14} /> Degradê</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {config.bg_type === "cor" && (
          <div className="space-y-2">
            <Label className="text-sm" style={{ color: "var(--layout-text)" }}>Cor de fundo</Label>
            <div className="flex items-center gap-3">
              <input type="color" value={config.bg_color} onChange={e => update({ bg_color: e.target.value })} className="w-10 h-10 rounded-lg border-0 cursor-pointer" />
              <Input value={config.bg_color} onChange={e => update({ bg_color: e.target.value })} className="flex-1" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--layout-text)", borderColor: "rgba(255,255,255,0.1)" }} />
            </div>
          </div>
        )}

        {config.bg_type === "imagem" && (
          <div className="space-y-3">
            <Label className="text-sm" style={{ color: "var(--layout-text)" }}>Imagem de fundo</Label>
            <Input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} className="cursor-pointer" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--layout-text)", borderColor: "rgba(255,255,255,0.1)" }} />
            {config.bg_image_url && (
              <div className="space-y-2">
                <Label className="text-xs" style={{ color: "var(--layout-text)" }}>ou insira a URL</Label>
                <Input value={config.bg_image_url} onChange={e => update({ bg_image_url: e.target.value })} placeholder="https://..." style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--layout-text)", borderColor: "rgba(255,255,255,0.1)" }} />
              </div>
            )}
          </div>
        )}

        {config.bg_type === "degrade" && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label className="text-sm" style={{ color: "var(--layout-text)" }}>Cor A</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={config.gradient_color_a} onChange={e => update({ gradient_color_a: e.target.value })} className="w-8 h-8 rounded border-0 cursor-pointer" />
                  <Input value={config.gradient_color_a} onChange={e => update({ gradient_color_a: e.target.value })} style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--layout-text)", borderColor: "rgba(255,255,255,0.1)" }} />
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-sm" style={{ color: "var(--layout-text)" }}>Cor B</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={config.gradient_color_b} onChange={e => update({ gradient_color_b: e.target.value })} className="w-8 h-8 rounded border-0 cursor-pointer" />
                  <Input value={config.gradient_color_b} onChange={e => update({ gradient_color_b: e.target.value })} style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--layout-text)", borderColor: "rgba(255,255,255,0.1)" }} />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm" style={{ color: "var(--layout-text)" }}>Ângulo ({config.gradient_angle}°)</Label>
              <Slider value={[config.gradient_angle]} onValueChange={v => update({ gradient_angle: v[0] })} min={0} max={360} step={1} />
            </div>
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full" style={{ background: "linear-gradient(135deg, var(--layout-button-bg), var(--layout-accent))", color: "#fff" }}>
          {saving ? "Salvando..." : "Salvar configurações"}
        </Button>
      </div>

      {/* Preview */}
      <div className="flex-1 space-y-3">
        <Label className="text-sm font-semibold" style={{ color: "var(--layout-text)" }}>Pré-visualização</Label>
        <div
          className="rounded-2xl border overflow-hidden aspect-video flex items-center justify-center"
          style={{ ...buildPreviewStyle(config), borderColor: "rgba(255,255,255,0.1)" }}
        >
          <span className="text-white/40 text-sm font-medium">Tela Promo</span>
        </div>
      </div>
    </div>
  );
}
