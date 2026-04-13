import { useState, useEffect, useRef } from "react";
import { Swords, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import XmlLinkRow from "./XmlLinkRow";

interface Artista {
  nome: string;
  musica: string;
  porcentagem: number;
  imagemUrl: string;
}

interface BattleState {
  artista1: Artista;
  artista2: Artista;
}

const EMPTY_ARTIST: Artista = {
  nome: "",
  musica: "",
  porcentagem: 0,
  imagemUrl: "",
};

const LOCAL_STORAGE_KEY = "vmix-batalha-musical";
const SETTINGS_KEY = "batalha_musical";

function clampPercentage(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function normalizeArtista(value: unknown): Artista {
  const artist = value && typeof value === "object" ? (value as Partial<Artista>) : {};

  return {
    nome: typeof artist.nome === "string" ? artist.nome : "",
    musica: typeof artist.musica === "string" ? artist.musica : "",
    porcentagem: clampPercentage(artist.porcentagem),
    imagemUrl: typeof artist.imagemUrl === "string" ? artist.imagemUrl : "",
  };
}

function normalizeBattleState(value: unknown): BattleState {
  const battle = value && typeof value === "object" ? value as Partial<BattleState> : {};
  const artista1 = normalizeArtista(battle.artista1);
  const artista2 = normalizeArtista(battle.artista2);

  artista2.porcentagem = 100 - artista1.porcentagem;

  return { artista1, artista2 };
}


async function fetchArtistImage(artistName: string): Promise<string> {
  const artist = artistName.trim();
  if (!artist) return "";

  try {
    const { data, error } = await supabase.functions.invoke("fetch-artist-image", {
      body: { artist },
    });

    if (error || !data?.ok || !data?.url) {
      return "";
    }

    return data.url;
  } catch {
    return "";
  }
}

export default function BatalhaMusicalPage() {
  const { user } = useAuth();
  const [artista1, setArtista1] = useState<Artista>({ ...EMPTY_ARTIST });
  const [artista2, setArtista2] = useState<Artista>({ ...EMPTY_ARTIST });
  const [loading1, setLoading1] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const [hasLoadedState, setHasLoadedState] = useState(false);
  const debounce1 = useRef<ReturnType<typeof setTimeout>>();
  const debounce2 = useRef<ReturnType<typeof setTimeout>>();
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const request1Ref = useRef(0);
  const request2Ref = useRef(0);
  const imageCacheRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    const applyState = (state: BattleState) => {
      if (state.artista1.nome && state.artista1.imagemUrl) {
        imageCacheRef.current[state.artista1.nome.trim().toLowerCase()] = state.artista1.imagemUrl;
      }

      if (state.artista2.nome && state.artista2.imagemUrl) {
        imageCacheRef.current[state.artista2.nome.trim().toLowerCase()] = state.artista2.imagemUrl;
      }

      setArtista1(state.artista1);
      setArtista2(state.artista2);
    };

    const loadState = async () => {
      try {
        const localRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (localRaw) {
          const localState = normalizeBattleState(JSON.parse(localRaw));
          if (!cancelled) applyState(localState);
        }
      } catch {
        // ignore invalid local data
      }

      if (!user) {
        if (!cancelled) setHasLoadedState(true);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("user_settings")
          .select("cenario_config")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!cancelled && !error && data?.cenario_config && typeof data.cenario_config === "object") {
          const savedState = (data.cenario_config as Record<string, unknown>)[SETTINGS_KEY];
          if (savedState) {
            applyState(normalizeBattleState(savedState));
          }
        }
      } catch (error) {
        console.error("Erro ao carregar Batalha Musical:", error);
      }

      if (!cancelled) {
        setHasLoadedState(true);
      }
    };

    loadState();

    return () => {
      cancelled = true;
      clearTimeout(saveTimeout.current);
    };
  }, [user]);

  useEffect(() => {
    if (!hasLoadedState) return;

    const payload: BattleState = { artista1, artista2 };

    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore local persistence errors
    }

    if (!user) return;

    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      try {
        const { data: existing } = await supabase
          .from("user_settings")
          .select("cenario_config")
          .eq("user_id", user.id)
          .maybeSingle();

        const previousConfig = existing?.cenario_config && typeof existing.cenario_config === "object"
          ? existing.cenario_config as Record<string, unknown>
          : {};

        const { error } = await supabase
          .from("user_settings")
          .upsert(
            {
              user_id: user.id,
              cenario_config: {
                ...previousConfig,
                [SETTINGS_KEY]: payload,
              } as any,
            },
            { onConflict: "user_id" }
          );

        if (error) {
          console.error("Erro ao salvar Batalha Musical:", error);
        }
      } catch (error) {
        console.error("Erro ao salvar Batalha Musical:", error);
      }
    }, 600);

    return () => clearTimeout(saveTimeout.current);
  }, [artista1, artista2, hasLoadedState, user]);

  // Fetch artist 1 image on name change (debounced)
  useEffect(() => {
    clearTimeout(debounce1.current);
    const artistName = artista1.nome.trim();
    const requestId = ++request1Ref.current;

    if (!artistName) {
      setLoading1(false);
      setArtista1(prev => prev.imagemUrl ? { ...prev, imagemUrl: "" } : prev);
      return;
    }

    const cacheKey = artistName.toLowerCase();
    const cachedUrl = imageCacheRef.current[cacheKey];

    if (cachedUrl) {
      setLoading1(false);
      setArtista1(prev => prev.nome.trim() === artistName && prev.imagemUrl !== cachedUrl
        ? { ...prev, imagemUrl: cachedUrl }
        : prev);
      return;
    }

    setLoading1(false);
    debounce1.current = setTimeout(async () => {
      setLoading1(true);
      const url = await fetchArtistImage(artistName);
      if (request1Ref.current !== requestId) return;
      if (url) {
        imageCacheRef.current[cacheKey] = url;
      }
      setArtista1(prev => prev.nome.trim() === artistName ? { ...prev, imagemUrl: url } : prev);
      setLoading1(false);
    }, 500);
    return () => clearTimeout(debounce1.current);
  }, [artista1.nome]);

  // Fetch artist 2 image on name change (debounced)
  useEffect(() => {
    clearTimeout(debounce2.current);
    const artistName = artista2.nome.trim();
    const requestId = ++request2Ref.current;

    if (!artistName) {
      setLoading2(false);
      setArtista2(prev => prev.imagemUrl ? { ...prev, imagemUrl: "" } : prev);
      return;
    }

    const cacheKey = artistName.toLowerCase();
    const cachedUrl = imageCacheRef.current[cacheKey];

    if (cachedUrl) {
      setLoading2(false);
      setArtista2(prev => prev.nome.trim() === artistName && prev.imagemUrl !== cachedUrl
        ? { ...prev, imagemUrl: cachedUrl }
        : prev);
      return;
    }

    setLoading2(false);
    debounce2.current = setTimeout(async () => {
      setLoading2(true);
      const url = await fetchArtistImage(artistName);
      if (request2Ref.current !== requestId) return;
      if (url) {
        imageCacheRef.current[cacheKey] = url;
      }
      setArtista2(prev => prev.nome.trim() === artistName ? { ...prev, imagemUrl: url } : prev);
      setLoading2(false);
    }, 500);
    return () => clearTimeout(debounce2.current);
  }, [artista2.nome]);

  const updateArtista1 = (field: keyof Artista, value: string | number) => {
    if (field === "porcentagem") {
      setArtista1(prev => ({ ...prev, porcentagem: value as number }));
      setArtista2(prev => ({ ...prev, porcentagem: 100 - (value as number) }));
    } else if (field === "nome") {
      setArtista1(prev => ({ ...prev, nome: value as string }));
    } else {
      setArtista1(prev => ({ ...prev, [field]: value }));
    }
  };

  const updateArtista2 = (field: keyof Artista, value: string | number) => {
    if (field === "porcentagem") {
      setArtista2(prev => ({ ...prev, porcentagem: value as number }));
      setArtista1(prev => ({ ...prev, porcentagem: 100 - (value as number) }));
    } else if (field === "nome") {
      setArtista2(prev => ({ ...prev, nome: value as string }));
    } else {
      setArtista2(prev => ({ ...prev, [field]: value }));
    }
  };

  const batalhaXmlUrl = user
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-xml-batalha?user_id=${user.id}`
    : "";

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

      {/* XML Link */}
      {batalhaXmlUrl && (
        <XmlLinkRow label="XML BATALHA MUSICAL" permanentUrl={batalhaXmlUrl} dark />
      )}
    </div>
  );
}
