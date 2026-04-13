import { useState } from "react";
import { Music, Swords } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

interface Artista {
  nome: string;
  musica: string;
  porcentagem: number;
}

export default function BatalhaMusicalPage() {
  const [artista1, setArtista1] = useState<Artista>({ nome: "", musica: "", porcentagem: 50 });
  const [artista2, setArtista2] = useState<Artista>({ nome: "", musica: "", porcentagem: 50 });

  const updateArtista1 = (field: keyof Artista, value: string | number) => {
    const updated = { ...artista1, [field]: value };
    if (field === "porcentagem") {
      setArtista2(prev => ({ ...prev, porcentagem: 100 - (value as number) }));
    }
    setArtista1(updated);
  };

  const updateArtista2 = (field: keyof Artista, value: string | number) => {
    const updated = { ...artista2, [field]: value };
    if (field === "porcentagem") {
      setArtista1(prev => ({ ...prev, porcentagem: 100 - (value as number) }));
    }
    setArtista2(updated);
  };

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
        {/* VS divider */}
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
          </div>

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
          </div>

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
    </div>
  );
}
