import { useState, useEffect, useRef } from "react";
import { Swords, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import XmlLinkRow from "./XmlLinkRow";

interface Artista {
  nome: string;
  musica: string;
  porcentagem: number;
  imagemUrl: string;
}

async function fetchDeezerImage(artistName: string): Promise<string> {
  if (!artistName.trim()) return "";
  try {
    const res = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName.trim())}&limit=1&output=jsonp&callback=`);
    const text = await res.text();
    // Handle JSONP or plain JSON
    const clean = text.replace(/^\s*\(/, "").replace(/\)\s*;?\s*$/, "");
    const data = JSON.parse(clean);
    return data?.data?.[0]?.picture_xl || data?.data?.[0]?.picture_big || "";
  } catch {
    // Fallback: try via corsproxy
    try {
      const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName.trim())}&limit=1`)}`);
      const data = await res.json();
      return data?.data?.[0]?.picture_xl || data?.data?.[0]?.picture_big || "";
    } catch {
      return "";
    }
  }
}

export default function BatalhaMusicalPage() {
  const [artista1, setArtista1] = useState<Artista>({ nome: "", musica: "", porcentagem: 50, imagemUrl: "" });
  const [artista2, setArtista2] = useState<Artista>({ nome: "", musica: "", porcentagem: 50, imagemUrl: "" });
  const [loading1, setLoading1] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const debounce1 = useRef<ReturnType<typeof setTimeout>>();
  const debounce2 = useRef<ReturnType<typeof setTimeout>>();

  // Fetch artist 1 image on name change (debounced)
  useEffect(() => {
    clearTimeout(debounce1.current);
    if (!artista1.nome.trim()) {
      setArtista1(prev => ({ ...prev, imagemUrl: "" }));
      return;
    }
    debounce1.current = setTimeout(async () => {
      setLoading1(true);
      const url = await fetchDeezerImage(artista1.nome);
      setArtista1(prev => ({ ...prev, imagemUrl: url }));
      setLoading1(false);
    }, 800);
    return () => clearTimeout(debounce1.current);
  }, [artista1.nome]);

  // Fetch artist 2 image on name change (debounced)
  useEffect(() => {
    clearTimeout(debounce2.current);
    if (!artista2.nome.trim()) {
      setArtista2(prev => ({ ...prev, imagemUrl: "" }));
      return;
    }
    debounce2.current = setTimeout(async () => {
      setLoading2(true);
      const url = await fetchDeezerImage(artista2.nome);
      setArtista2(prev => ({ ...prev, imagemUrl: url }));
      setLoading2(false);
    }, 800);
    return () => clearTimeout(debounce2.current);
  }, [artista2.nome]);

  const updateArtista1 = (field: keyof Artista, value: string | number) => {
    if (field === "porcentagem") {
      setArtista1(prev => ({ ...prev, porcentagem: value as number }));
      setArtista2(prev => ({ ...prev, porcentagem: 100 - (value as number) }));
    } else {
      setArtista1(prev => ({ ...prev, [field]: value }));
    }
  };

  const updateArtista2 = (field: keyof Artista, value: string | number) => {
    if (field === "porcentagem") {
      setArtista2(prev => ({ ...prev, porcentagem: value as number }));
      setArtista1(prev => ({ ...prev, porcentagem: 100 - (value as number) }));
    } else {
      setArtista2(prev => ({ ...prev, [field]: value }));
    }
  };

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <batalha>
    <artista1_nome>${artista1.nome}</artista1_nome>
    <artista1_musica>${artista1.musica}</artista1_musica>
    <artista1_porcentagem>${artista1.porcentagem}</artista1_porcentagem>
    <artista1_imagem>${artista1.imagemUrl}</artista1_imagem>
    <artista2_nome>${artista2.nome}</artista2_nome>
    <artista2_musica>${artista2.musica}</artista2_musica>
    <artista2_porcentagem>${artista2.porcentagem}</artista2_porcentagem>
    <artista2_imagem>${artista2.imagemUrl}</artista2_imagem>
  </batalha>
</items>`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(xmlContent).then(() => {
      setCopied(true);
      toast.success("XML copiado!");
      setTimeout(() => setCopied(false), 2000);
    });
  }, [xmlContent]);

  const color1 = "#3b82f6";
  const color2 = "#ef4444";

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3">
          <Swords className="h-7 w-7 text-yellow-400" />
          <h2 className="text-2xl font-bold text-white tracking-tight">Batalha Musical</h2>
          <Swords className="h-7 w-7 text-yellow-400 scale-x-[-1]" />
        </div>
        <p className="text-white/40 text-sm">Configure os artistas e acompanhe a disputa</p>
      </div>

      {/* Battle bar */}
      <div className="relative h-12 rounded-2xl overflow-hidden border border-white/10" style={{ background: "rgba(0,0,0,0.3)" }}>
        <div
          className="absolute inset-y-0 left-0 transition-all duration-500 ease-out flex items-center justify-center"
          style={{ width: `${artista1.porcentagem}%`, background: `linear-gradient(90deg, ${color1}, ${color1}cc)` }}
        >
          {artista1.porcentagem > 15 && (
            <span className="text-white font-bold text-sm drop-shadow">{artista1.nome || "Artista 1"} — {artista1.porcentagem}%</span>
          )}
        </div>
        <div
          className="absolute inset-y-0 right-0 transition-all duration-500 ease-out flex items-center justify-center"
          style={{ width: `${artista2.porcentagem}%`, background: `linear-gradient(90deg, ${color2}cc, ${color2})` }}
        >
          {artista2.porcentagem > 15 && (
            <span className="text-white font-bold text-sm drop-shadow">{artista2.nome || "Artista 2"} — {artista2.porcentagem}%</span>
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <span className="bg-black/70 text-yellow-400 font-black text-xs px-2 py-1 rounded-full border border-yellow-400/30">VS</span>
        </div>
      </div>

      {/* Artists cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Artista 1 */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${color1}33` }}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full" style={{ background: color1 }} />
            <h3 className="text-white font-bold text-sm uppercase tracking-wider">Artista 1</h3>
            {loading1 && <Loader2 className="h-3 w-3 animate-spin text-white/40" />}
          </div>

          {/* Artist image preview */}
          {artista1.imagemUrl && (
            <div className="flex justify-center">
              <img src={artista1.imagemUrl} alt={artista1.nome} className="w-24 h-24 rounded-full object-cover border-2" style={{ borderColor: `${color1}66` }} />
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-white/50 text-[11px] uppercase tracking-wider mb-1 block">Nome do Artista</label>
              <Input
                value={artista1.nome}
                onChange={e => updateArtista1("nome", e.target.value)}
                placeholder="Ex: Bruno Mars"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-10"
              />
            </div>
            <div>
              <label className="text-white/50 text-[11px] uppercase tracking-wider mb-1 block">Música</label>
              <Input
                value={artista1.musica}
                onChange={e => updateArtista1("musica", e.target.value)}
                placeholder="Ex: Uptown Funk"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-10"
              />
            </div>
            <div>
              <label className="text-white/50 text-[11px] uppercase tracking-wider mb-1 block">
                Porcentagem: <span className="text-white font-bold">{artista1.porcentagem}%</span>
              </label>
              <Slider
                value={[artista1.porcentagem]}
                onValueChange={([v]) => updateArtista1("porcentagem", v)}
                max={100}
                min={0}
                step={1}
                className="py-2"
              />
            </div>
          </div>
        </div>

        {/* Artista 2 */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${color2}33` }}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full" style={{ background: color2 }} />
            <h3 className="text-white font-bold text-sm uppercase tracking-wider">Artista 2</h3>
            {loading2 && <Loader2 className="h-3 w-3 animate-spin text-white/40" />}
          </div>

          {/* Artist image preview */}
          {artista2.imagemUrl && (
            <div className="flex justify-center">
              <img src={artista2.imagemUrl} alt={artista2.nome} className="w-24 h-24 rounded-full object-cover border-2" style={{ borderColor: `${color2}66` }} />
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-white/50 text-[11px] uppercase tracking-wider mb-1 block">Nome do Artista</label>
              <Input
                value={artista2.nome}
                onChange={e => updateArtista2("nome", e.target.value)}
                placeholder="Ex: The Weeknd"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-10"
              />
            </div>
            <div>
              <label className="text-white/50 text-[11px] uppercase tracking-wider mb-1 block">Música</label>
              <Input
                value={artista2.musica}
                onChange={e => updateArtista2("musica", e.target.value)}
                placeholder="Ex: Blinding Lights"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-10"
              />
            </div>
            <div>
              <label className="text-white/50 text-[11px] uppercase tracking-wider mb-1 block">
                Porcentagem: <span className="text-white font-bold">{artista2.porcentagem}%</span>
              </label>
              <Slider
                value={[artista2.porcentagem]}
                onValueChange={([v]) => updateArtista2("porcentagem", v)}
                max={100}
                min={0}
                step={1}
                className="py-2"
              />
            </div>
          </div>
        </div>
      </div>

      {/* XML Output */}
      <div className="rounded-2xl p-5 space-y-3" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold text-sm uppercase tracking-wider">XML da Batalha</h3>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: copied ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.08)",
              color: copied ? "#22c55e" : "rgba(255,255,255,0.7)",
              border: copied ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copiado!" : "Copiar XML"}
          </button>
        </div>
        <pre
          className="text-[11px] leading-relaxed overflow-x-auto rounded-xl p-4 select-all"
          style={{ background: "rgba(0,0,0,0.4)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          {xmlContent}
        </pre>
      </div>
    </div>
  );
}
