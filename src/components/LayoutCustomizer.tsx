import { useState, useEffect, useRef } from "react";
import { Palette, Save, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface LayoutColors {
  pageBg: string;
  pageText: string;
  headerBg: string;
  headerText: string;
  buttonBg: string;
  buttonText: string;
  linkColor: string;
  accentColor: string;
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
};

const colorLabels: Record<keyof LayoutColors, string> = {
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
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => { onChange(e.target.value); setInputVal(e.target.value); }}
        className="w-8 h-8 rounded-lg cursor-pointer border-none p-0"
        style={{ WebkitAppearance: "none", background: "none" }}
      />
      <div className="flex-1 space-y-0.5">
        <label className="block text-[11px] font-semibold" style={{ color: "#0d0446" }}>{label}</label>
        <input
          type="text"
          value={inputVal}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="#000000"
          className="w-full px-3 py-1.5 text-xs outline-none transition-colors"
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #0d0446",
            color: "#0d0446",
            borderRadius: "20px",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#2dbef3"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#0d0446"; }}
        />
      </div>
    </div>
  );
}

export default function LayoutCustomizer() {
  const { user } = useAuth();
  const [colors, setColors] = useState<LayoutColors>(defaultColors);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_settings").select("dashboard_items").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data?.dashboard_items && typeof data.dashboard_items === "object" && (data.dashboard_items as any).layout_colors) {
        setColors({ ...defaultColors, ...(data.dashboard_items as any).layout_colors });
      }
    });
  }, [user]);

  const updateColor = (key: keyof LayoutColors, value: string) => {
    const next = { ...colors, [key]: value };
    setColors(next);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => persistColors(next), 800);
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

  const resetColors = () => {
    setColors(defaultColors);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => { persistColors(defaultColors); toast.success("Cores restauradas ao padrão."); }, 300);
  };

  return (
    <div className="space-y-5">
      {/* Color inputs grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.keys(colorLabels) as (keyof LayoutColors)[]).map((key) => (
          <ColorInput key={key} label={colorLabels[key]} value={colors[key]} onChange={(v) => updateColor(key, v)} />
        ))}
      </div>

      {/* Reset button */}
      <div className="flex justify-end">
        <button
          onClick={resetColors}
          className="px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 rounded-full transition-all"
          style={{ backgroundColor: "#ffffff", color: "#0d0446", border: "2px solid #0d0446", borderRadius: "20px" }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "#0d0446"; }}
        >
          <RotateCcw size={12} /> Restaurar Padrão
        </button>
      </div>

      {/* Mockup preview */}
      <div className="rounded-2xl overflow-hidden shadow-lg" style={{ border: "1px solid rgba(13,4,70,0.1)" }}>
        <div className="text-xs font-bold uppercase tracking-wider px-4 py-2 flex items-center gap-2" style={{ backgroundColor: "rgba(13,4,70,0.05)", color: "#0d0446" }}>
          <Palette size={14} /> Pré-visualização do Layout
        </div>

        {/* Mockup page */}
        <div style={{ backgroundColor: colors.pageBg, color: colors.pageText, minHeight: 320 }} className="transition-colors duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 transition-colors duration-300" style={{ backgroundColor: colors.headerBg }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: colors.accentColor, opacity: 0.8 }} />
              <span className="text-sm font-bold transition-colors duration-300" style={{ color: colors.headerText }}>Minha Rádio</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[11px] cursor-pointer transition-colors duration-300" style={{ color: colors.linkColor }}>Início</span>
              <span className="text-[11px] cursor-pointer transition-colors duration-300" style={{ color: colors.linkColor }}>Programas</span>
              <span className="text-[11px] cursor-pointer transition-colors duration-300" style={{ color: colors.linkColor }}>Contato</span>
            </div>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4">
            <h2 className="text-base font-bold transition-colors duration-300" style={{ color: colors.pageText }}>
              Título da Página
            </h2>
            <p className="text-xs leading-relaxed transition-colors duration-300" style={{ color: colors.pageText, opacity: 0.7 }}>
              Este é um exemplo de como o texto ficará com as cores selecionadas. Ajuste os valores RGB para personalizar a identidade visual da sua plataforma.
            </p>

            <div className="flex items-center gap-2">
              <a href="#" className="text-xs underline transition-colors duration-300" style={{ color: colors.linkColor }} onClick={(e) => e.preventDefault()}>
                Link de exemplo
              </a>
              <span className="text-[10px]" style={{ color: colors.pageText, opacity: 0.4 }}>|</span>
              <a href="#" className="text-xs underline transition-colors duration-300" style={{ color: colors.linkColor }} onClick={(e) => e.preventDefault()}>
                Outro link
              </a>
            </div>

            {/* Cards row */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              {["Programa 1", "Programa 2", "Programa 3"].map((title) => (
                <div key={title} className="rounded-xl p-3 space-y-2 transition-colors duration-300" style={{ backgroundColor: colors.headerBg + "22", border: `1px solid ${colors.accentColor}33` }}>
                  <div className="w-full h-12 rounded-lg" style={{ backgroundColor: colors.accentColor + "20" }} />
                  <p className="text-[11px] font-semibold" style={{ color: colors.pageText }}>{title}</p>
                  <p className="text-[9px]" style={{ color: colors.pageText, opacity: 0.5 }}>Descrição breve do programa</p>
                </div>
              ))}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button className="px-4 py-2 text-xs font-bold rounded-full transition-colors duration-300" style={{ backgroundColor: colors.buttonBg, color: colors.buttonText }}>
                Botão Primário
              </button>
              <button className="px-4 py-2 text-xs font-bold rounded-full transition-colors duration-300" style={{ backgroundColor: "transparent", color: colors.buttonBg, border: `2px solid ${colors.buttonBg}` }}>
                Botão Secundário
              </button>
              <span className="text-xs font-semibold px-3 py-1 rounded-full transition-colors duration-300" style={{ backgroundColor: colors.accentColor + "22", color: colors.accentColor }}>
                Destaque
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 flex items-center justify-between transition-colors duration-300" style={{ backgroundColor: colors.headerBg, borderTop: `1px solid ${colors.accentColor}33` }}>
            <span className="text-[10px]" style={{ color: colors.headerText, opacity: 0.6 }}>© 2026 Minha Rádio — Todos os direitos reservados</span>
            <span className="text-[10px] cursor-pointer" style={{ color: colors.linkColor }}>Termos de Uso</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(13,4,70,0.5)" }}>
        <Save size={12} />
        <span>As cores são salvas automaticamente.</span>
      </div>
    </div>
  );
}
