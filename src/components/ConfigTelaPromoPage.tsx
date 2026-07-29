import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GradientPicker } from "@/components/ui/GradientPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Palette, Image as ImageIcon, Layers, ExternalLink, Save, Monitor, Type, Square, Sparkles, Sun, Moon } from "lucide-react";

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
  const gradientFallback = { background: `linear-gradient(${config.gradient_angle}deg, ${config.gradient_color_a}, ${config.gradient_color_b})` };
  switch (config.bg_type) {
    case "cor":
      return { backgroundColor: config.bg_color };
    case "imagem":
      return config.bg_image_url
        ? { backgroundImage: `url(${config.bg_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }
        : gradientFallback;
    case "degrade":
      return gradientFallback;
    default:
      return gradientFallback;
  }
}

const PRESETS: { name: string; config: Partial<TelaPromoConfig> }[] = [
  { name: "🔴 Vermelho Clássico", config: { bg_type: "degrade", gradient_color_a: "#1a1a2e", gradient_color_b: "#16213e", gradient_angle: 135, btn_color_a: "#1a1a1a", btn_color_b: "#dc2626", btn_text_color: "#ffffff", card_border_color: "#ffffff", header_text_color: "#ffffff", card_style: "rounded" } },
  { name: "🔵 Azul Moderno", config: { bg_type: "degrade", gradient_color_a: "#0f172a", gradient_color_b: "#1e3a5f", gradient_angle: 160, btn_color_a: "#1e40af", btn_color_b: "#3b82f6", btn_text_color: "#ffffff", card_border_color: "#93c5fd", header_text_color: "#e0f2fe", card_style: "rounded" } },
  { name: "🟢 Verde Neon", config: { bg_type: "degrade", gradient_color_a: "#022c22", gradient_color_b: "#064e3b", gradient_angle: 145, btn_color_a: "#065f46", btn_color_b: "#10b981", btn_text_color: "#ffffff", card_border_color: "#34d399", header_text_color: "#d1fae5", card_style: "pill" } },
  { name: "🟡 Dourado Premium", config: { bg_type: "degrade", gradient_color_a: "#1c1917", gradient_color_b: "#292524", gradient_angle: 135, btn_color_a: "#92400e", btn_color_b: "#f59e0b", btn_text_color: "#1c1917", card_border_color: "#fbbf24", header_text_color: "#fef3c7", card_style: "rounded" } },
  { name: "🟣 Roxo Vibrante", config: { bg_type: "degrade", gradient_color_a: "#1e1b4b", gradient_color_b: "#312e81", gradient_angle: 150, btn_color_a: "#5b21b6", btn_color_b: "#a78bfa", btn_text_color: "#ffffff", card_border_color: "#c4b5fd", header_text_color: "#ede9fe", card_style: "rounded" } },
  { name: "⬛ Escuro Minimalista", config: { bg_type: "cor", bg_color: "#0a0a0a", btn_color_a: "#262626", btn_color_b: "#404040", btn_text_color: "#ffffff", card_border_color: "#525252", header_text_color: "#e5e5e5", card_style: "sharp" } },
];

const inputStyle = { backgroundColor: "rgba(255,255,255,0.06)", color: "var(--layout-text)", borderColor: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.18)" };

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium uppercase tracking-wider opacity-70" style={{ color: "var(--layout-text)" }}>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-7 h-7 rounded-md border-0 cursor-pointer shrink-0" style={{ background: "transparent" }} />
        <Input value={value} onChange={e => onChange(e.target.value)} style={inputStyle} className="h-8 text-xs font-mono" />
      </div>
    </div>
  );
}

function SectionCard({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 space-y-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center gap-2">
        <Icon size={14} style={{ color: "var(--layout-accent-color, hsl(var(--primary)))" }} />
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--layout-accent-color, hsl(var(--primary)))" }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

interface Props {
  effectiveUserId?: string | null;
}

export default function ConfigTelaPromoPage({ effectiveUserId }: Props) {
  const { user } = useAuth();
  const [config, setConfig] = useState<TelaPromoConfig>(defaultTelaPromoConfig);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "sending" | "done" | "failed">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string>("");
  const [previewDark, setPreviewDark] = useState(true);

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
    const file = e.target.files[0];
    setUploading(true);
    setUploadStatus("sending");
    setUploadError("");
    setUploadProgress(5);
    // Simulated progressive indicator (Supabase JS doesn't expose native progress)
    const timer = setInterval(() => {
      setUploadProgress(p => (p < 90 ? p + Math.max(1, Math.round((90 - p) / 8)) : p));
    }, 200);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/tela-promo/bg-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("empresa-assets").upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
      setConfig(c => ({ ...c, bg_image_url: urlData.publicUrl }));
      setUploadProgress(100);
      setUploadStatus("done");
      toast.success("Imagem enviada!");
    } catch (err: any) {
      console.error("[ConfigTelaPromo] upload error", err);
      setUploadStatus("failed");
      setUploadError(err?.message || "Falha desconhecida");
      toast.error(err?.message ? `Erro ao enviar imagem: ${err.message}` : "Erro ao enviar imagem");
    } finally {
      clearInterval(timer);
      setUploading(false);
    }
  }

  const update = (partial: Partial<TelaPromoConfig>) => setConfig(c => ({ ...c, ...partial }));
  const cardRadius = config.card_style === "sharp" ? "4px" : config.card_style === "pill" ? "50px" : "16px";

  return (
    <div className="nexo-scope flex flex-col gap-4">
      {/* Action buttons */}
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <Button variant="save"
          onClick={handleSave}
          disabled={saving}
        >
          <Save size={15} />
          {saving ? "Salvando..." : "Salvar configurações"}
        </Button>

        <button
          className="min-h-10 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all hover:brightness-110 px-6"
          style={{
            background: "rgba(255,255,255,0.06)",
            color: "var(--foreground)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
          onClick={() => {
            const targetId = effectiveUserId || user?.id;
            window.open(`/user/${targetId}/nexohub/locutor`, "_blank");
          }}
        >
          <ExternalLink size={15} /> Abrir Módulo Locutor
        </button>
      </div>

      {/* Main layout */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Left: config panels */}
        <div className="flex-1 space-y-4 max-w-xl">
          {/* Presets section */}
          <SectionCard icon={Palette} title="Presets de Cores">
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map(preset => (
                <button
                  key={preset.name}
                  onClick={() => setConfig(c => ({ ...c, ...preset.config }))}
                  className="text-left px-3 py-2 rounded-lg text-xs font-medium transition-all hover:scale-[1.02] hover:brightness-125"
                  style={{ background: "rgba(255,255,255,0.06)", color: "var(--layout-text)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* Background section */}
          <SectionCard icon={Monitor} title="Fundo da Tela">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-medium uppercase tracking-wider opacity-70" style={{ color: "var(--layout-text)" }}>Tipo de fundo</Label>
                <Select value={config.bg_type} onValueChange={v => update({ bg_type: v as BgType })}>
                  <SelectTrigger className="w-full h-9 text-sm" style={inputStyle}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cor"><span className="flex items-center gap-2"><Palette size={13} /> Cor sólida</span></SelectItem>
                    <SelectItem value="imagem"><span className="flex items-center gap-2"><ImageIcon size={13} /> Imagem</span></SelectItem>
                    <SelectItem value="degrade"><span className="flex items-center gap-2"><Layers size={13} /> Degradê</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {config.bg_type === "cor" && (
                <ColorField label="Cor de fundo" value={config.bg_color} onChange={v => update({ bg_color: v })} />
              )}

              {config.bg_type === "imagem" && (
                <div className="space-y-2">
                  <Label className="text-[11px] font-medium uppercase tracking-wider opacity-70" style={{ color: "var(--layout-text)" }}>Imagem de fundo</Label>
                  <Input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} className="cursor-pointer h-9 text-sm" style={inputStyle} />
                  {uploadStatus !== "idle" && (
                    <div className="space-y-1">
                      <div className="h-1.5 w-full rounded-full overflow-hidden bg-black/10">
                        <div
                          className="h-full transition-all duration-200"
                          style={{
                            width: `${uploadProgress}%`,
                            background:
                              uploadStatus === "failed"
                                ? "#ef4444"
                                : uploadStatus === "done"
                                ? "#22c55e"
                                : "var(--layout-primary, #00BFF0)",
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--layout-text)" }}>
                        <span className="opacity-80">
                          {uploadStatus === "sending" && "Enviando imagem..."}
                          {uploadStatus === "done" && "Upload concluído"}
                          {uploadStatus === "failed" && `Falhou${uploadError ? `: ${uploadError}` : ""}`}
                        </span>
                        <span className="opacity-60 font-mono">{uploadProgress}%</span>
                      </div>
                    </div>
                  )}
                  <Input value={config.bg_image_url} onChange={e => update({ bg_image_url: e.target.value })} placeholder="https://..." className="h-9 text-sm" style={inputStyle} />
                </div>
              )}

              {config.bg_type === "degrade" && (
                <GradientPicker
                  colorA={config.gradient_color_a}
                  colorB={config.gradient_color_b}
                  angle={config.gradient_angle}
                  onChangeColorA={v => update({ gradient_color_a: v })}
                  onChangeColorB={v => update({ gradient_color_b: v })}
                  onChangeAngle={v => update({ gradient_angle: v })}
                />
              )}
            </div>
          </SectionCard>

          {/* Buttons section */}
          <SectionCard icon={Sparkles} title="Botões de Promoção">
            <div className="grid grid-cols-2 gap-3">
              <ColorField label="Cor início" value={config.btn_color_a} onChange={v => update({ btn_color_a: v })} />
              <ColorField label="Cor fim" value={config.btn_color_b} onChange={v => update({ btn_color_b: v })} />
              <ColorField label="Cor do texto" value={config.btn_text_color} onChange={v => update({ btn_text_color: v })} />
              <ColorField label="Cor da borda (hover)" value={config.card_border_color} onChange={v => update({ card_border_color: v })} />
            </div>
          </SectionCard>

          {/* Cards section */}
          <SectionCard icon={Square} title="Estilo dos Cards">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-medium uppercase tracking-wider opacity-70" style={{ color: "var(--layout-text)" }}>Formato</Label>
                <Select value={config.card_style} onValueChange={v => update({ card_style: v as CardStyle })}>
                  <SelectTrigger className="w-full h-9 text-sm" style={inputStyle}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rounded">Arredondado</SelectItem>
                    <SelectItem value="sharp">Reto</SelectItem>
                    <SelectItem value="pill">Pílula</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <ColorField label="Cor texto cabeçalho" value={config.header_text_color} onChange={v => update({ header_text_color: v })} />
            </div>
          </SectionCard>
        </div>

        {/* Right: preview */}
        <div className="flex-1 space-y-2 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-medium uppercase tracking-wider opacity-70" style={{ color: "var(--layout-text)" }}>Pré-visualização</Label>
            <button
              onClick={() => setPreviewDark(d => !d)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all"
              style={{
                background: previewDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                color: previewDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)",
                border: `1px solid ${previewDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`,
              }}
            >
              {previewDark ? <Moon size={12} /> : <Sun size={12} />}
              {previewDark ? "Escuro" : "Claro"}
            </button>
          </div>
          <div
            className="rounded-2xl border overflow-hidden aspect-video flex flex-col items-center justify-center gap-5 p-8 transition-all duration-500 ease-in-out"
            style={{
              ...buildTelaPromoBgStyle(config),
              borderColor: previewDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)",
              backgroundColor: config.bg_type === "cor" ? config.bg_color : undefined,
              ...(config.bg_type === "cor" ? {} : {}),
              boxShadow: previewDark ? "inset 0 0 60px rgba(0,0,0,0.3)" : "inset 0 0 60px rgba(255,255,255,0.1)",
            }}
          >
            <span className="text-sm font-bold uppercase tracking-[0.2em]" style={{ color: config.header_text_color }}>Promoções</span>
            <div className="flex gap-3">
              {["Promo 1", "Promo 2"].map(label => (
                <div
                  key={label}
                  className="px-5 py-2.5 font-bold text-xs shadow-lg flex items-center gap-2 transition-transform hover:scale-105"
                  style={{
                    background: `linear-gradient(135deg, ${config.btn_color_a}, ${config.btn_color_b})`,
                    color: config.btn_text_color,
                    borderRadius: cardRadius,
                    border: `2px solid transparent`,
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
                  className="w-20 h-28 flex items-center justify-center backdrop-blur-sm"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: cardRadius, border: `2px solid rgba(255,255,255,0.1)` }}
                >
                  <span style={{ color: config.header_text_color }} className="text-[10px] opacity-60">Card</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
