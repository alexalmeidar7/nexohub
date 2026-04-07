import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Palette, Image as ImageIcon, Layers, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Palette, Image as ImageIcon, Layers } from "lucide-react";

type BgType = "cor" | "imagem" | "degrade";
type CardStyle = "rounded" | "sharp" | "pill";

export interface TelaPromoConfig {
  bg_type: BgType;
  bg_color: string;
  bg_image_url: string;
  gradient_color_a: string;
  gradient_color_b: string;
  gradient_angle: number;
  btn_color_a: string;
  btn_color_b: string;
  btn_text_color: string;
  card_style: CardStyle;
  card_border_color: string;
  header_text_color: string;
}

export const defaultTelaPromoConfig: TelaPromoConfig = {
  bg_type: "cor",
  bg_color: "#000000",
  bg_image_url: "",
  gradient_color_a: "#1a1a2e",
  gradient_color_b: "#16213e",
  gradient_angle: 135,
  btn_color_a: "#1a1a1a",
  btn_color_b: "#dc2626",
  btn_text_color: "#ffffff",
  card_style: "rounded",
  card_border_color: "#ffffff",
  header_text_color: "#ffffff",
};

export function buildTelaPromoBgStyle(config: TelaPromoConfig): React.CSSProperties {
  switch (config.bg_type) {
    case "cor":
      return { backgroundColor: config.bg_color };
    case "imagem":
      return config.bg_image_url
        ? { backgroundImage: `url(${config.bg_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }
        : { backgroundColor: "#000" };
    case "degrade":
      return { background: `linear-gradient(${config.gradient_angle}deg, ${config.gradient_color_a}, ${config.gradient_color_b})` };
    default:
      return { backgroundColor: "#000" };
  }
}

const inputStyle = { backgroundColor: "rgba(255,255,255,0.06)", color: "var(--layout-text)", borderColor: "rgba(255,255,255,0.1)" };

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs" style={{ color: "var(--layout-text)" }}>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-8 h-8 rounded border-0 cursor-pointer" />
        <Input value={value} onChange={e => onChange(e.target.value)} style={inputStyle} className="flex-1" />
      </div>
    </div>
  );
}

export default function ConfigTelaPromoPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState<TelaPromoConfig>(defaultTelaPromoConfig);
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
          setConfig({ ...defaultTelaPromoConfig, ...raw.tela_promo_bg });
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

  const cardRadius = config.card_style === "sharp" ? "4px" : config.card_style === "pill" ? "50px" : "16px";

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Settings panel */}
      <div className="flex-1 space-y-6 max-w-lg">
        {/* --- Background --- */}
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--layout-accent)" }}>Fundo da Tela</h3>

        <div className="space-y-3">
          <Label className="text-sm font-semibold" style={{ color: "var(--layout-text)" }}>Tipo de fundo</Label>
          <Select value={config.bg_type} onValueChange={v => update({ bg_type: v as BgType })}>
            <SelectTrigger className="w-full" style={inputStyle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cor"><span className="flex items-center gap-2"><Palette size={14} /> Cor sólida</span></SelectItem>
              <SelectItem value="imagem"><span className="flex items-center gap-2"><ImageIcon size={14} /> Imagem</span></SelectItem>
              <SelectItem value="degrade"><span className="flex items-center gap-2"><Layers size={14} /> Degradê</span></SelectItem>
            </SelectContent>
          </Select>
        </div>

        {config.bg_type === "cor" && (
          <ColorField label="Cor de fundo" value={config.bg_color} onChange={v => update({ bg_color: v })} />
        )}

        {config.bg_type === "imagem" && (
          <div className="space-y-3">
            <Label className="text-sm" style={{ color: "var(--layout-text)" }}>Imagem de fundo</Label>
            <Input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} className="cursor-pointer" style={inputStyle} />
            <Input value={config.bg_image_url} onChange={e => update({ bg_image_url: e.target.value })} placeholder="https://..." style={inputStyle} />
          </div>
        )}

        {config.bg_type === "degrade" && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <ColorField label="Cor A" value={config.gradient_color_a} onChange={v => update({ gradient_color_a: v })} />
              <ColorField label="Cor B" value={config.gradient_color_b} onChange={v => update({ gradient_color_b: v })} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm" style={{ color: "var(--layout-text)" }}>Ângulo ({config.gradient_angle}°)</Label>
              <Slider value={[config.gradient_angle]} onValueChange={v => update({ gradient_angle: v[0] })} min={0} max={360} step={1} />
            </div>
          </div>
        )}

        {/* --- Buttons --- */}
        <div className="border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--layout-accent)" }}>Botões de Promoção</h3>
          <div className="grid grid-cols-2 gap-4">
            <ColorField label="Cor início" value={config.btn_color_a} onChange={v => update({ btn_color_a: v })} />
            <ColorField label="Cor fim" value={config.btn_color_b} onChange={v => update({ btn_color_b: v })} />
            <ColorField label="Cor do texto" value={config.btn_text_color} onChange={v => update({ btn_text_color: v })} />
            <ColorField label="Cor da borda (hover)" value={config.card_border_color} onChange={v => update({ card_border_color: v })} />
          </div>
        </div>

        {/* --- Cards --- */}
        <div className="border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "var(--layout-accent)" }}>Estilo dos Cards</h3>
          <div className="space-y-3">
            <Label className="text-sm" style={{ color: "var(--layout-text)" }}>Formato</Label>
            <Select value={config.card_style} onValueChange={v => update({ card_style: v as CardStyle })}>
              <SelectTrigger className="w-full" style={inputStyle}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rounded">Arredondado</SelectItem>
                <SelectItem value="sharp">Reto</SelectItem>
                <SelectItem value="pill">Pílula</SelectItem>
              </SelectContent>
            </Select>
            <ColorField label="Cor do texto do cabeçalho" value={config.header_text_color} onChange={v => update({ header_text_color: v })} />
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving} className="flex-1" style={{ background: "linear-gradient(135deg, var(--layout-button-bg), var(--layout-accent))", color: "#fff" }}>
            {saving ? "Salvando..." : "Salvar configurações"}
          </Button>
          <Button
            variant="outline"
            className="flex items-center gap-2"
            style={{ borderColor: "rgba(255,255,255,0.15)", color: "var(--layout-text)" }}
            onClick={() => {
              const slug = user?.email?.split("@")[0] || "";
              window.open(`/user/${slug}/nexohub/telapromo`, "_blank");
            }}
          >
            <ExternalLink size={14} /> Abrir Tela Promo
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 space-y-3">
        <Label className="text-sm font-semibold" style={{ color: "var(--layout-text)" }}>Pré-visualização</Label>
        <div
          className="rounded-2xl border overflow-hidden aspect-video flex flex-col items-center justify-center gap-4 p-6"
          style={{ ...buildTelaPromoBgStyle(config), borderColor: "rgba(255,255,255,0.1)" }}
        >
          <span className="text-sm font-bold uppercase tracking-widest" style={{ color: config.header_text_color }}>Promoções</span>
          <div className="flex gap-3">
            {["Promo 1", "Promo 2"].map(label => (
              <div
                key={label}
                className="px-5 py-2.5 font-bold text-xs shadow-lg flex items-center gap-2"
                style={{
                  background: `linear-gradient(135deg, ${config.btn_color_a}, ${config.btn_color_b})`,
                  color: config.btn_text_color,
                  borderRadius: cardRadius,
                }}
              >
                {label}
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            {[1, 2].map(i => (
              <div
                key={i}
                className="w-20 h-28 flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", borderRadius: cardRadius, border: `2px solid transparent` }}
              >
                <span style={{ color: config.header_text_color }} className="text-[10px]">Card</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
