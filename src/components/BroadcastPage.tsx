import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Eye, Upload, Trash2, Instagram, Globe, MessageCircle } from "lucide-react";

interface BroadcastData {
  assunto: string;
  ticker: string;
  redes_sociais: { tipo: string; valor: string }[];
  locutor_override: string;
}

const defaultBroadcast: BroadcastData = {
  assunto: "",
  ticker: "",
  redes_sociais: [{ tipo: "instagram", valor: "" }],
  locutor_override: "",
};

const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  instagram: <Instagram size={14} />,
  site: <Globe size={14} />,
  whatsapp: <MessageCircle size={14} />,
};

const SOCIAL_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "site", label: "Site" },
  { value: "whatsapp", label: "WhatsApp" },
];

export default function BroadcastPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<BroadcastData>(defaultBroadcast);
  const [saving, setSaving] = useState(false);
  const [empresaLogo, setEmpresaLogo] = useState<string | null>(null);
  const [programaLogo, setProgramaLogo] = useState<string | null>(null);
  const [locutorFoto, setLocutorFoto] = useState<string | null>(null);
  const [locutorNome, setLocutorNome] = useState("");
  const [programaNome, setProgramaNome] = useState("");
  const [accentColor, setAccentColor] = useState("#dc2626");

  // Load data
  useEffect(() => {
    if (!user) return;
    (async () => {
      // Empresa logo
      const { data: emp } = await supabase.from("empresa_config").select("logo, nome").eq("user_id", user.id).maybeSingle();
      if (emp?.logo) setEmpresaLogo(emp.logo);

      // Current program
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const nowTime = `${hh}:${mm}`;
      const dias = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
      const hoje = dias[now.getDay()];

      const { data: progs } = await supabase
        .from("programas")
        .select("id, nome, selo, apresentadores_ids, apresentador_id")
        .eq("user_id", user.id)
        .eq("ativo", true)
        .lte("horario_inicio", nowTime)
        .gte("horario_fim", nowTime);

      const prog = progs?.find(p => true); // first match
      if (prog) {
        setProgramaNome(prog.nome);
        if (prog.selo) setProgramaLogo(prog.selo);

        // Get presenter
        const apIds = prog.apresentadores_ids || (prog.apresentador_id ? [prog.apresentador_id] : []);
        if (apIds.length > 0) {
          const { data: ap } = await supabase.from("apresentadores").select("nome, foto").in("id", apIds).limit(1).maybeSingle();
          if (ap) {
            setLocutorNome(ap.nome);
            if (ap.foto) setLocutorFoto(ap.foto);
          }
        }
      }

      // Accent color
      const { data: settings } = await supabase.from("user_settings").select("dashboard_items").eq("user_id", user.id).maybeSingle();
      if (settings?.dashboard_items && typeof settings.dashboard_items === "object") {
        const lc = (settings.dashboard_items as any).layout_colors;
        if (lc?.accentColor) setAccentColor(lc.accentColor);
      }

      // Load saved broadcast data
      const { data: us } = await supabase.from("user_settings").select("cenario_config").eq("user_id", user.id).maybeSingle();
      if (us?.cenario_config && typeof us.cenario_config === "object") {
        const bc = (us.cenario_config as any).broadcast;
        if (bc) setData({ ...defaultBroadcast, ...bc });
      }
    })();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Get current cenario_config
      const { data: current } = await supabase.from("user_settings").select("cenario_config").eq("user_id", user.id).maybeSingle();
      const existing = (current?.cenario_config && typeof current.cenario_config === "object") ? current.cenario_config as Record<string, any> : {};
      
      await supabase.from("user_settings").update({
        cenario_config: { ...existing, broadcast: data },
      }).eq("user_id", user.id);

      toast({ title: "Broadcast salvo com sucesso!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
    setSaving(false);
  };

  const updateSocial = (index: number, field: "tipo" | "valor", value: string) => {
    const updated = [...data.redes_sociais];
    updated[index] = { ...updated[index], [field]: value };
    setData({ ...data, redes_sociais: updated });
  };

  const addSocial = () => {
    setData({ ...data, redes_sociais: [...data.redes_sociais, { tipo: "instagram", valor: "" }] });
  };

  const removeSocial = (index: number) => {
    setData({ ...data, redes_sociais: data.redes_sociais.filter((_, i) => i !== index) });
  };

  const displayLocutor = data.locutor_override || locutorNome || "Locutor";

  return (
    <div className="flex gap-6 h-full min-h-0">
      {/* ── Left: Form ── */}
      <div className="w-[340px] shrink-0 space-y-4 overflow-y-auto pr-2" style={{ maxHeight: "calc(100vh - 200px)" }}>
        <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: "#aaa" }}>Configurar Broadcast</h2>

        {/* Assunto */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Assunto / Título</label>
          <input
            type="text"
            value={data.assunto}
            onChange={e => setData({ ...data, assunto: e.target.value })}
            placeholder="Base para assunto"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ backgroundColor: "#1e1e24", color: "#e0e0e0", border: "1px solid #ffffff10" }}
          />
        </div>

        {/* Locutor override */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Nome do Locutor (override)</label>
          <input
            type="text"
            value={data.locutor_override}
            onChange={e => setData({ ...data, locutor_override: e.target.value })}
            placeholder={locutorNome || "Nome do locutor"}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ backgroundColor: "#1e1e24", color: "#e0e0e0", border: "1px solid #ffffff10" }}
          />
        </div>

        {/* Redes Sociais */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Redes Sociais</label>
          {data.redes_sociais.map((rs, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={rs.tipo}
                onChange={e => updateSocial(i, "tipo", e.target.value)}
                className="px-2 py-1.5 rounded-lg text-xs"
                style={{ backgroundColor: "#1e1e24", color: "#ccc", border: "1px solid #ffffff10" }}
              >
                {SOCIAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input
                type="text"
                value={rs.valor}
                onChange={e => updateSocial(i, "valor", e.target.value)}
                placeholder="@usuario"
                className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{ backgroundColor: "#1e1e24", color: "#e0e0e0", border: "1px solid #ffffff10" }}
              />
              <button onClick={() => removeSocial(i)} className="text-red-400 hover:text-red-300 p-1">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button onClick={addSocial} className="text-[11px] px-3 py-1 rounded-lg" style={{ backgroundColor: "#ffffff08", color: "#888" }}>
            + Adicionar rede
          </button>
        </div>

        {/* Ticker */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Texto Ticker</label>
          <textarea
            value={data.ticker}
            onChange={e => setData({ ...data, ticker: e.target.value })}
            placeholder="Texto que rola na parte inferior..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
            style={{ backgroundColor: "#1e1e24", color: "#e0e0e0", border: "1px solid #ffffff10" }}
          />
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: "#dc2626", color: "#fff" }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar Broadcast
        </button>
      </div>

      {/* ── Right: Mockup Preview ── */}
      <div className="flex-1 flex items-center justify-center">
        <div
          className="relative w-full rounded-xl overflow-hidden"
          style={{
            aspectRatio: "16/9",
            maxWidth: 900,
            backgroundColor: "#000",
            border: "1px solid #ffffff10",
          }}
        >
          {/* Top left: Logo empresa */}
          <div className="absolute" style={{ top: "5%", left: "4%" }}>
            {empresaLogo ? (
              <img src={empresaLogo} alt="Logo" className="h-12 w-12 rounded-full object-cover" style={{ border: `2px solid ${accentColor}` }} />
            ) : (
              <div className="h-12 w-12 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: accentColor, color: "#000" }}>
                LOGO
              </div>
            )}
            <span className="text-[9px] font-bold mt-1 block" style={{ color: "#fff" }}>LOGO DA EMPRESA</span>
          </div>

          {/* Top right: Logo programa */}
          <div className="absolute flex items-center gap-2" style={{ top: "5%", right: "4%" }}>
            <span className="text-[9px] font-bold" style={{ color: "#fff" }}>LOGO DO PROGRAMA</span>
            {programaLogo ? (
              <img src={programaLogo} alt="Programa" className="h-12 w-12 rounded-full object-cover" style={{ border: `2px solid ${accentColor}` }} />
            ) : (
              <div className="h-12 w-12 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: accentColor, color: "#000" }}>
                PROG
              </div>
            )}
          </div>

          {/* Bottom left: Locutor data */}
          <div
            className="absolute"
            style={{
              bottom: "12%",
              left: "4%",
              backgroundColor: "#fff",
              padding: "12px 18px",
              borderRadius: "4px 4px 0 0",
              minWidth: 180,
            }}
          >
            <div className="text-sm font-black uppercase leading-tight" style={{ color: "#111" }}>
              {displayLocutor.split(" ").map((w, i) => <div key={i}>{w}</div>)}
            </div>
            <div className="text-[9px] font-semibold uppercase mt-0.5" style={{ color: "#555" }}>NO AR</div>
          </div>

          {/* Bottom: Subject bar */}
          <div
            className="absolute"
            style={{
              bottom: 0,
              left: "4%",
              right: "4%",
              backgroundColor: "rgba(245,245,245,0.95)",
              padding: "10px 16px",
              borderRadius: "0",
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-5 rounded-sm" style={{ backgroundColor: accentColor }} />
              <span className="text-sm font-black uppercase" style={{ color: "#111" }}>
                {data.assunto || "BASE PARA ASSUNTO"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px]" style={{ color: "#555" }}>
              {/* Social badges */}
              {data.redes_sociais.filter(r => r.valor).map((rs, i) => (
                <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-semibold" style={{ backgroundColor: accentColor + "22", color: accentColor }}>
                  {SOCIAL_ICONS[rs.tipo] || <Globe size={10} />}
                  {rs.valor}
                </span>
              ))}
              {data.ticker && (
                <>
                  <span style={{ color: "#bbb" }}>→</span>
                  <span className="text-[10px] truncate" style={{ color: "#777", maxWidth: 300 }}>
                    {data.ticker}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
