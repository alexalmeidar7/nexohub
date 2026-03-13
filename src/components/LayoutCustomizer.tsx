import { useState, useEffect, useRef } from "react";
import { Palette, Save, RotateCcw, Upload, ImageIcon, X, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { compressImage } from "@/lib/imageCompressor";

// --- Contrast Analysis Utilities ---
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(c => Math.min(255, Math.max(0, Math.round(c))).toString(16).padStart(2, "0")).join("");
}

function adjustForContrast(textHex: string, bgHex: string, minRatio = 4.5): string {
  const ratio = contrastRatio(textHex, bgHex);
  if (ratio >= minRatio) return textHex;
  // Determine if we should lighten or darken the text
  const bgLum = relativeLuminance(hexToRgb(bgHex));
  const [r, g, b] = hexToRgb(textHex);
  const direction = bgLum > 0.5 ? -1 : 1; // darken text on light bg, lighten on dark bg
  let adjusted = [r, g, b] as [number, number, number];
  for (let i = 0; i < 100; i++) {
    adjusted = adjusted.map(c => c + direction * 3) as [number, number, number];
    adjusted = adjusted.map(c => Math.min(255, Math.max(0, c))) as [number, number, number];
    const newHex = rgbToHex(...adjusted);
    if (contrastRatio(newHex, bgHex) >= minRatio) return newHex;
  }
  return bgLum > 0.5 ? "#000000" : "#ffffff";
}

interface ContrastIssue {
  label: string;
  textColor: string;
  bgColor: string;
  ratio: number;
  fixedColor: string;
  textKey: string;
}

function analyzeContrast(colors: LayoutColors): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  const pairs: { label: string; textKey: string; textColor: string; bgColor: string }[] = [
    { label: "Texto da página sobre fundo da página", textKey: "pageText", textColor: colors.pageText, bgColor: colors.pageBg },
    { label: "Texto do cabeçalho sobre fundo do cabeçalho", textKey: "headerText", textColor: colors.headerText, bgColor: colors.headerBg },
    { label: "Texto dos botões sobre fundo dos botões", textKey: "buttonText", textColor: colors.buttonText, bgColor: colors.buttonBg },
    { label: "Links sobre fundo da página", textKey: "linkColor", textColor: colors.linkColor, bgColor: colors.pageBg },
    { label: "Cor de destaque sobre fundo da página", textKey: "accentColor", textColor: colors.accentColor, bgColor: colors.pageBg },
  ];
  for (const pair of pairs) {
    if (!/^#[0-9a-fA-F]{6}$/.test(pair.textColor) || !/^#[0-9a-fA-F]{6}$/.test(pair.bgColor)) continue;
    const ratio = contrastRatio(pair.textColor, pair.bgColor);
    if (ratio < 4.5) {
      issues.push({
        ...pair,
        ratio,
        fixedColor: adjustForContrast(pair.textColor, pair.bgColor),
      });
    }
  }
  return issues;
}

interface LayoutColors {
  pageBg: string;
  pageText: string;
  headerBg: string;
  headerText: string;
  buttonBg: string;
  buttonText: string;
  linkColor: string;
  accentColor: string;
  homeBgType: "color" | "image";
  homeBgColor: string;
  homeBgImage: string;
}

const defaultColors: LayoutColors = {
  pageBg: "#ffffff",
  pageText: "#0d0446",
  headerBg: "#0d0446",
  headerText: "#ffffff",
  buttonBg: "#be0101",
  buttonText: "#ffffff",
  linkColor: "#2dbef3",
  accentColor: "#be0101",
  homeBgType: "color",
  homeBgColor: "#0d0446",
  homeBgImage: "",
};

const colorLabels: Record<string, string> = {
  pageBg: "Fundo da Página",
  pageText: "Texto da Página",
  headerBg: "Fundo do Cabeçalho",
  headerText: "Texto do Cabeçalho",
  buttonBg: "Fundo dos Botões",
  buttonText: "Texto dos Botões",
  linkColor: "Cor dos Links",
  accentColor: "Cor de Destaque",
};

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [inputVal, setInputVal] = useState(value);

  useEffect(() => { setInputVal(value); }, [value]);

  const handleTextChange = (raw: string) => {
    let v = raw.trim();
    if (v && !v.startsWith("#")) v = "#" + v;
    setInputVal(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
  };

  return (
    <div className="flex items-center gap-3 rounded-xl p-3 transition-all hover:shadow-sm" style={{ backgroundColor: "rgba(13,4,70,0.02)", border: "1px solid rgba(13,4,70,0.06)" }}>
      <input
        type="color"
        value={value}
        onChange={(e) => { onChange(e.target.value); setInputVal(e.target.value); }}
        className="w-9 h-9 rounded-lg cursor-pointer border-none p-0 shrink-0"
        style={{ WebkitAppearance: "none", background: "none" }}
      />
      <div className="flex-1 space-y-1">
        <label className="block text-[11px] font-bold uppercase tracking-wider" style={{ color: "#0d0446" }}>{label}</label>
        <input
          type="text"
          value={inputVal}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="#000000"
          className="w-full px-3 py-1.5 text-xs outline-none transition-colors font-mono"
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid rgba(13,4,70,0.15)",
            color: "#0d0446",
            borderRadius: "12px",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#2dbef3"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(13,4,70,0.15)"; }}
        />
      </div>
    </div>
  );
}

export default function LayoutCustomizer() {
  const { user } = useAuth();
  const [colors, setColors] = useState<LayoutColors>(defaultColors);
  const [saving, setSaving] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const originalRef = useRef<LayoutColors>(defaultColors);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_settings").select("dashboard_items").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data?.dashboard_items && typeof data.dashboard_items === "object" && (data.dashboard_items as any).layout_colors) {
        const loaded = { ...defaultColors, ...(data.dashboard_items as any).layout_colors };
        setColors(loaded);
        originalRef.current = loaded;
      }
    });
  }, [user]);

  const updateColor = (key: keyof LayoutColors, value: string) => {
    setColors(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const persistColors = async (c: LayoutColors) => {
    if (!user) return;
    const { data: existing } = await supabase.from("user_settings").select("dashboard_items").eq("user_id", user.id).maybeSingle();
    const current = (existing?.dashboard_items && typeof existing.dashboard_items === "object") ? existing.dashboard_items as Record<string, any> : {};
    await supabase.from("user_settings").upsert([{
      user_id: user.id,
      dashboard_items: { ...current, layout_colors: c } as any,
      updated_at: new Date().toISOString(),
    }], { onConflict: "user_id" });
  };

  const handleSave = async () => {
    setSaving(true);
    await persistColors(colors);
    setSaving(false);
    toast.success("Layout salvo com sucesso!");
    originalRef.current = colors;
    setHasChanges(false);
    // Reload page to apply changes
    setTimeout(() => window.location.reload(), 800);
  };

  const resetColors = async () => {
    setColors(defaultColors);
    setSaving(true);
    await persistColors(defaultColors);
    setSaving(false);
    toast.success("Cores restauradas ao padrão.");
    originalRef.current = defaultColors;
    setHasChanges(false);
    setTimeout(() => window.location.reload(), 800);
  };

  const handleBgImageUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !user) return;
      setUploadingBg(true);
      try {
        const compressed = await compressImage(file);
        const ext = compressed.name.split(".").pop() || "webp";
        const path = `${user.id}/home-bg-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("empresa-assets").upload(path, compressed, { upsert: true });
        if (error) { toast.error("Erro no upload: " + error.message); setUploadingBg(false); return; }
        const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
        setColors(prev => ({ ...prev, homeBgImage: urlData.publicUrl, homeBgType: "image" }));
        setHasChanges(true);
        toast.success("Imagem carregada!");
      } catch { toast.error("Erro ao processar imagem."); }
      setUploadingBg(false);
    };
    input.click();
  };

  return (
    <div className="space-y-6">
      {/* Home Background Section */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(46,193,247,0.2)", backgroundColor: "rgba(46,193,247,0.03)" }}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)" }}>
          <ImageIcon size={16} className="text-white" />
          <h4 className="text-sm font-bold text-white">Fundo da Home</h4>
        </div>
        <div className="p-5 space-y-4">
          {/* Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => { updateColor("homeBgType", "color"); }}
              className="px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2"
              style={{
                backgroundColor: colors.homeBgType === "color" ? "#0d0446" : "rgba(13,4,70,0.05)",
                color: colors.homeBgType === "color" ? "#ffffff" : "#0d0446",
                boxShadow: colors.homeBgType === "color" ? "0 4px 12px rgba(13,4,70,0.25)" : "none",
              }}
            >
              <Palette size={14} /> Cor de Fundo
            </button>
            <button
              onClick={() => { updateColor("homeBgType", "image"); }}
              className="px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2"
              style={{
                backgroundColor: colors.homeBgType === "image" ? "#0d0446" : "rgba(13,4,70,0.05)",
                color: colors.homeBgType === "image" ? "#ffffff" : "#0d0446",
                boxShadow: colors.homeBgType === "image" ? "0 4px 12px rgba(13,4,70,0.25)" : "none",
              }}
            >
              <ImageIcon size={14} /> Imagem de Fundo
            </button>
          </div>

          {colors.homeBgType === "color" ? (
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={colors.homeBgColor}
                onChange={(e) => updateColor("homeBgColor", e.target.value)}
                className="w-12 h-12 rounded-xl cursor-pointer border-none p-0 shrink-0"
                style={{ WebkitAppearance: "none", background: "none" }}
              />
              <div className="flex-1 space-y-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider" style={{ color: "#0d0446" }}>Código RGB</label>
                <input
                  type="text"
                  value={colors.homeBgColor}
                  onChange={(e) => {
                    let v = e.target.value.trim();
                    if (v && !v.startsWith("#")) v = "#" + v;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v) || v === "") {
                      setColors(prev => ({ ...prev, homeBgColor: v }));
                      setHasChanges(true);
                    }
                  }}
                  placeholder="#0d0446"
                  className="w-full px-4 py-2 text-sm outline-none transition-colors font-mono"
                  style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.15)", color: "#0d0446", borderRadius: "12px" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(13,4,70,0.15)"; }}
                />
              </div>
              {/* Preview swatch */}
              <div className="w-20 h-12 rounded-xl shadow-inner" style={{ backgroundColor: colors.homeBgColor, border: "1px solid rgba(13,4,70,0.1)" }} />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBgImageUpload}
                  disabled={uploadingBg}
                  className="px-5 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
                  style={{ backgroundColor: "#0d0446", color: "#ffffff" }}
                >
                  {uploadingBg ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {uploadingBg ? "Enviando..." : "Carregar Imagem (1920×1080)"}
                </button>
                {colors.homeBgImage && (
                  <button
                    onClick={() => { updateColor("homeBgImage", ""); }}
                    className="p-2 rounded-lg transition-all hover:bg-red-50"
                    title="Remover imagem"
                  >
                    <X size={16} style={{ color: "#dc2626" }} />
                  </button>
                )}
              </div>
              {colors.homeBgImage && (
                <div className="rounded-xl overflow-hidden shadow-md" style={{ border: "1px solid rgba(13,4,70,0.1)" }}>
                  <img src={colors.homeBgImage} alt="Fundo da Home" className="w-full h-32 object-cover" />
                </div>
              )}
              {!colors.homeBgImage && (
                <p className="text-[10px] italic" style={{ color: "rgba(13,4,70,0.4)" }}>Recomendado: 1920×1080 pixels (PNG ou JPG)</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Color inputs grid */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Palette size={16} style={{ color: "#0d0446" }} />
          <h4 className="text-sm font-bold" style={{ color: "#0d0446" }}>Cores do Layout</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(Object.keys(colorLabels) as string[]).map((key) => (
            <ColorInput key={key} label={colorLabels[key]} value={(colors as any)[key]} onChange={(v) => updateColor(key as keyof LayoutColors, v)} />
          ))}
        </div>
      </div>

      {/* Mockup preview */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.12)", boxShadow: "0 8px 32px rgba(13,4,70,0.10), 0 2px 8px rgba(13,4,70,0.06)" }}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-2">
            <Palette size={14} className="text-white/70" />
            <span className="text-xs font-bold text-white/90 uppercase tracking-wider">Pré-visualização</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#ff5f57" }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#febc2e" }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#28c840" }} />
          </div>
        </div>

        {/* Browser chrome */}
        <div className="px-4 py-2 flex items-center gap-3" style={{ backgroundColor: "#f5f5f7", borderBottom: "1px solid rgba(13,4,70,0.08)" }}>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: "rgba(13,4,70,0.08)" }}>
              <span style={{ fontSize: 9, color: "rgba(13,4,70,0.4)" }}>‹</span>
            </div>
            <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: "rgba(13,4,70,0.08)" }}>
              <span style={{ fontSize: 9, color: "rgba(13,4,70,0.4)" }}>›</span>
            </div>
          </div>
          <div className="flex-1 h-6 rounded-lg flex items-center px-3" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.1)" }}>
            <span style={{ fontSize: 9, color: "rgba(13,4,70,0.35)", fontFamily: "monospace" }}>https://minharadio.com.br</span>
          </div>
        </div>

        {/* Mockup page */}
        <div style={{ backgroundColor: colors.pageBg, color: colors.pageText }} className="transition-colors duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 transition-colors duration-300" style={{ backgroundColor: colors.headerBg }}>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: colors.accentColor }}>
                <span className="text-[10px] font-black" style={{ color: colors.buttonText }}>R</span>
              </div>
              <span className="text-xs font-bold transition-colors duration-300" style={{ color: colors.headerText }}>Minha Rádio</span>
            </div>
            <div className="flex items-center gap-4">
              {["Início", "Programas", "Contato"].map((l) => (
                <span key={l} className="text-[10px] cursor-pointer font-medium transition-colors duration-300" style={{ color: colors.linkColor }}>{l}</span>
              ))}
            </div>
          </div>

          {/* Hero banner */}
          <div className="px-5 py-5 transition-colors duration-300" style={{ background: `linear-gradient(135deg, ${colors.headerBg}ee, ${colors.accentColor}88)` }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: colors.accentColor }}>AO VIVO</p>
            <h2 className="text-sm font-bold mb-1" style={{ color: colors.headerText }}>Primeira Hora Positiva</h2>
            <p className="text-[10px] leading-relaxed mb-3" style={{ color: colors.headerText, opacity: 0.7 }}>O melhor conteúdo da manhã começa aqui.</p>
            <button className="px-4 py-1.5 text-[10px] font-bold rounded-full transition-colors duration-300" style={{ backgroundColor: colors.buttonBg, color: colors.buttonText }}>
              ▶ Ouvir Agora
            </button>
          </div>

          {/* Content area */}
          <div className="p-5 space-y-4">
            {/* Cards row */}
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { title: "Manhã Show", time: "06:00 - 09:00" },
                { title: "Tarde Hits", time: "13:00 - 17:00" },
                { title: "Noite Musical", time: "20:00 - 00:00" },
              ].map((item) => (
                <div key={item.title} className="rounded-xl overflow-hidden transition-colors duration-300" style={{ backgroundColor: colors.headerBg + "0d", border: `1px solid ${colors.accentColor}22` }}>
                  <div className="h-10 w-full" style={{ background: `linear-gradient(135deg, ${colors.accentColor}30, ${colors.headerBg}20)` }} />
                  <div className="px-2.5 py-2">
                    <p className="text-[10px] font-bold" style={{ color: colors.pageText }}>{item.title}</p>
                    <p className="text-[9px] mt-0.5" style={{ color: colors.pageText, opacity: 0.5 }}>{item.time}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Link + text sample */}
            <div className="flex items-center gap-3">
              <a href="#" className="text-[10px] font-medium underline underline-offset-2 transition-colors duration-300" style={{ color: colors.linkColor }} onClick={(e) => e.preventDefault()}>
                Ver grade completa →
              </a>
              <span className="text-[9px] font-semibold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: colors.accentColor + "1a", color: colors.accentColor }}>
                DESTAQUE
              </span>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2.5">
              <button className="px-4 py-1.5 text-[10px] font-bold rounded-full transition-colors duration-300" style={{ backgroundColor: colors.buttonBg, color: colors.buttonText }}>
                Participar
              </button>
              <button className="px-4 py-1.5 text-[10px] font-bold rounded-full transition-colors duration-300" style={{ backgroundColor: "transparent", color: colors.buttonBg, border: `1.5px solid ${colors.buttonBg}` }}>
                Ver Promoções
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-2.5 flex items-center justify-between transition-colors duration-300" style={{ backgroundColor: colors.headerBg, borderTop: `1px solid ${colors.accentColor}22` }}>
            <span className="text-[9px] font-medium" style={{ color: colors.headerText, opacity: 0.5 }}>© 2026 Minha Rádio</span>
            <div className="flex items-center gap-3">
              <span className="text-[9px] cursor-pointer font-medium" style={{ color: colors.linkColor }}>Termos</span>
              <span className="text-[9px] cursor-pointer font-medium" style={{ color: colors.linkColor }}>Contato</span>
            </div>
          </div>
        </div>
      </div>

      {/* Contrast Analysis Section */}
      {(() => {
        const issues = analyzeContrast(colors);
        if (issues.length === 0) return null;
        return (
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(220,38,38,0.3)", backgroundColor: "rgba(220,38,38,0.04)" }}>
            <div className="px-5 py-3 flex items-center gap-2" style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)" }}>
              <AlertTriangle size={16} className="text-white" />
              <h4 className="text-sm font-bold text-white">Problemas de Legibilidade Detectados</h4>
            </div>
            <div className="p-4 space-y-3">
              {issues.map((issue, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl p-3" style={{ backgroundColor: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.12)" }}>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="w-6 h-6 rounded-md flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: issue.bgColor, color: issue.textColor, border: "1px solid rgba(0,0,0,0.15)" }}>
                      Aa
                    </div>
                    <span className="text-[10px]" style={{ color: "#dc2626" }}>→</span>
                    <div className="w-6 h-6 rounded-md flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: issue.bgColor, color: issue.fixedColor, border: "1px solid rgba(0,0,0,0.15)" }}>
                      Aa
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold" style={{ color: "#0d0446" }}>{issue.label}</p>
                    <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.5)" }}>
                      Contraste: {issue.ratio.toFixed(1)}:1 (mínimo: 4.5:1)
                    </p>
                  </div>
                  <button
                    onClick={() => { updateColor(issue.textKey as keyof LayoutColors, issue.fixedColor); }}
                    className="px-3 py-1 text-[10px] font-bold rounded-lg transition-all shrink-0"
                    style={{ backgroundColor: "#dc2626", color: "#ffffff" }}
                  >
                    Corrigir
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  let updated = { ...colors };
                  for (const issue of issues) {
                    (updated as any)[issue.textKey] = issue.fixedColor;
                  }
                  setColors(updated);
                  setHasChanges(true);
                  toast.success("Todas as cores foram ajustadas para garantir legibilidade!");
                }}
                className="w-full px-4 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
                style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)", color: "#ffffff", boxShadow: "0 4px 12px rgba(220,38,38,0.25)" }}
              >
                <Sparkles size={14} /> Corrigir Todos Automaticamente
              </button>
            </div>
          </div>
        );
      })()}

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={resetColors}
          className="px-5 py-2.5 text-xs font-bold flex items-center gap-2 rounded-xl transition-all"
          style={{ backgroundColor: "rgba(13,4,70,0.05)", color: "#0d0446" }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(13,4,70,0.1)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(13,4,70,0.05)"; }}
        >
          <RotateCcw size={13} /> Restaurar Padrão
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="px-8 py-2.5 text-sm font-bold flex items-center gap-2 rounded-xl transition-all disabled:opacity-40"
          style={{ background: hasChanges ? "linear-gradient(135deg, #268ffa, #2dbef3)" : "rgba(13,4,70,0.15)", color: "#ffffff", boxShadow: hasChanges ? "0 4px 16px rgba(38,143,250,0.3)" : "none" }}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? "Salvando..." : "Salvar Alterações"}
        </button>
      </div>
    </div>
  );
}
