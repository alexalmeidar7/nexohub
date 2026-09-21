import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Radio, MapPin, Clock, Mic, Music, ChevronLeft, ChevronRight, Disc, Volume2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveEffectiveOnAir } from "@/lib/onAirResolver";
import { resolvePresenterForProgram } from "@/lib/onAirPresenterResolver";
import { resolveSafePresenterPhoto } from "@/components/FloatingOnAirPresenter";
import {
  normalizeClientKey,
  getClientHouseMixProgramsSync,
  DEFAULT_STATION_DATA,
  type HouseMixProgram
} from "@/lib/houseMixProgramasService";
import { DEFAULT_AGENCY_CLIENTS, getStoredMetadata } from "@/components/ClientesPage";
import { SEED_TOCADAS } from "@/components/AdminInfoMusicPage";

interface RadioLiveInfo {
  id: string;
  nome: string;
  frequencia?: string;
  cidade: string;
  estado: string;
  programaNome: string;
  horarioInicio: string;
  horarioFim: string;
  estudio?: string;
  locutorNome: string;
  locutorFoto?: string;
  locutorInstagram?: string;
  musicaTitulo: string;
  musicaArtista: string;
  musicaCapa?: string;
  logoUrl?: string;
}

const FALLBACK_COVER = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=400&auto=format&fit=crop&q=80";

const KNOWN_COVERS: Record<string, string> = {
  "the weeknd|save your tears": "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/64/00/c7/6400c735-a50d-d128-444f-c0c1ea9ec0d1/20UMGIM10300.rgb.jpg/600x600bb.jpg",
  "the weeknd|blinding lights": "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/64/00/c7/6400c735-a50d-d128-444f-c0c1ea9ec0d1/20UMGIM10300.rgb.jpg/600x600bb.jpg",
  "chitaozinho & xororo|evidencias": "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/4b/c9/28/4bc92823-1d00-bb60-15cb-ae2ebfc36605/00044006764522.rgb.jpg/600x600bb.jpg",
  "ana castela & melody|pipoco": "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/b8/b6/a9/b8b6a978-65ec-54f3-2aa2-f38b0d475ef4/7891430485121.jpg/600x600bb.jpg",
  "milionario & jose rico|estrada da vida": "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e5/22/e1/e522e118-28c0-84cf-d621-e8d1aa3da3ba/00602537553535.rgb.jpg/600x600bb.jpg",
  "gusttavo lima|bloqueado": "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/4b/58/bd/4b58bd7b-f975-f5b2-383a-4db511f5a54e/7891430477829.jpg/600x600bb.jpg",
  "lady gaga|abracadabra": "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/21/d9/cb/21d9cb52-5a21-9e7f-b883-294025d26210/25UMGIM10375.rgb.jpg/600x600bb.jpg",
  "coldplay|yellow": "https://is1-ssl.mzstatic.com/image/thumb/Music118/v4/05/96/97/059697ef-5a3a-2325-13b7-f5dc4325e0e0/0724352778351.jpg/600x600bb.jpg",
  "dua lipa|houdini": "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/c3/91/97/c39197c0-2fbe-a827-0cf2-b5e024dc533f/5054197825227.jpg/600x600bb.jpg",
  "bruno mars|locked out of heaven": "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/64/6b/c9/646bc920-56aa-6752-96cb-206e87f54ea3/075679958189.jpg/600x600bb.jpg",
};

async function fetchiTunesCover(titulo: string, artista: string): Promise<string | null> {
  const normKey = `${artista.toLowerCase().trim()}|${titulo.toLowerCase().trim()}`;
  if (KNOWN_COVERS[normKey]) return KNOWN_COVERS[normKey];

  try {
    const cleanQuery = `${artista} ${titulo}`.replace(/[\(\)\/\-]/g, " ").trim();
    const query = encodeURIComponent(cleanQuery);
    const res = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&limit=1`);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].artworkUrl100?.replace("100x100", "600x600") || null;
    }
  } catch {
    // fallback
  }
  return null;
}

// Filtro estrito: apenas clientes que são de fato EMISSORAS DE RÁDIO (exclui empresas de TI/serviços como Nexo Brasil)
function isRadioEmissora(client: { nome?: string; nome_empresarial?: string; categoria?: string; razao_social?: string }): boolean {
  const cat = (client.categoria || "").trim().toUpperCase();
  const name = (client.nome_empresarial || client.razao_social || client.nome || "").trim().toUpperCase();

  // Exclusões explícitas
  if (name.includes("NEXO BRASIL") || name.includes("NEXO BR") || name.includes("MÍDIA & TECNOLOGIA") || cat.includes("SERVIÇOS") || cat.includes("CORPORATIVO")) {
    return false;
  }

  if (cat.includes("RÁDIO") || cat.includes("RADIO") || cat === "EMISSORA DE RÁDIO") {
    return true;
  }

  if (name.includes("FM") || name.includes("AM") || name.includes("RÁDIO") || name.includes("RADIO")) {
    return true;
  }

  return false;
}

export default function AgoraNasRadiosWidget() {
  const [radiosList, setRadiosList] = useState<RadioLiveInfo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [fadeAnim, setFadeAnim] = useState(true);
  const [progress, setProgress] = useState(0);
  const coverCacheRef = useRef<Record<string, string>>({ ...KNOWN_COVERS });

  // Carrega as informações reais de cada Emissora de Rádio direto do House Mix
  const loadDynamicRadios = useCallback(async () => {
    try {
      const storedMeta = getStoredMetadata();

      // 1. Busca programas cadastrados no Supabase, apresentadores e últimas músicas tocadas
      const [progsRes, apsRes, tocadasRes, logosRes, empRes] = await Promise.all([
        supabase
          .from("programas")
          .select("id, user_id, cliente_nome, nome, estudio, horario_inicio, horario_fim, dias_semana, apresentador_id, apresentadores_ids, ativo")
          .eq("ativo", true),
        supabase
          .from("apresentadores")
          .select("id, nome, foto, instagram, cargo, user_id"),
        supabase
          .from("musicas_tocadas")
          .select("id, user_id, artista, musica, programa, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("logos_patrocinadores")
          .select("id, user_id, nome, logo_url, ativo")
          .eq("excluido", false),
        supabase
          .from("empresa_config")
          .select("user_id, nome, logo, ativo"),
      ]);

      const dbProgramas = progsRes.data || [];
      const dbApresentadores = apsRes.data || [];
      const dbTocadas = tocadasRes.data || [];

      // 2. Compila a lista única de clientes da agência
      const rawClients: Array<{ id: string; user_id?: string; nome: string; nome_empresarial: string; categoria?: string; cidade?: string; estado?: string; logo_url?: string | null }> = [];

      // A) DEFAULT_AGENCY_CLIENTS (filtrados)
      Object.entries(DEFAULT_AGENCY_CLIENTS).forEach(([key, def]) => {
        if (!isRadioEmissora({ nome: key, nome_empresarial: def.nome_empresarial, categoria: def.categoria, razao_social: def.razao_social })) return;
        rawClients.push({
          id: key,
          nome: def.nome_empresarial || def.razao_social || key,
          nome_empresarial: def.nome_empresarial || def.razao_social || key,
          categoria: def.categoria || "EMISSORA DE RÁDIO",
          cidade: def.cidade || "",
          estado: def.estado || "",
        });
      });

      // B) logos_patrocinadores & empresa_config
      (logosRes.data || []).forEach((item: any) => {
        const meta = storedMeta[item.id] || storedMeta[item.nome] || {};
        const clientObj = {
          id: item.id,
          user_id: item.user_id,
          nome: item.nome,
          nome_empresarial: meta.nome_empresarial || meta.razao_social || item.nome,
          categoria: meta.categoria || "EMISSORA DE RÁDIO",
          cidade: meta.cidade || "",
          estado: meta.estado || "",
          logo_url: item.logo_url,
        };
        if (isRadioEmissora(clientObj)) {
          rawClients.push(clientObj);
        }
      });

      (empRes.data || []).forEach((emp: any) => {
        const meta = storedMeta[emp.user_id] || storedMeta[emp.nome] || {};
        const clientObj = {
          id: emp.user_id,
          user_id: emp.user_id,
          nome: emp.nome,
          nome_empresarial: meta.nome_empresarial || meta.razao_social || emp.nome,
          categoria: meta.categoria || "EMISSORA DE RÁDIO",
          cidade: meta.cidade || "",
          estado: meta.estado || "",
          logo_url: emp.logo,
        };
        if (isRadioEmissora(clientObj)) {
          rawClients.push(clientObj);
        }
      });

      // C) Metadados locais
      Object.entries(storedMeta).forEach(([key, meta]: any) => {
        const clientObj = {
          id: key,
          nome: meta.nome_empresarial || meta.razao_social || key,
          nome_empresarial: meta.nome_empresarial || meta.razao_social || key,
          categoria: meta.categoria || "EMISSORA DE RÁDIO",
          cidade: meta.cidade || "",
          estado: meta.estado || "",
          logo_url: meta.logo_url || meta.logo || null,
        };
        if (isRadioEmissora(clientObj)) {
          rawClients.push(clientObj);
        }
      });

      // 3. Unifica as emissoras por chave canônica
      const seenCanonical = new Set<string>();
      const unifiedRadios: typeof rawClients = [];

      for (const cli of rawClients) {
        const canonical = normalizeClientKey(cli.nome_empresarial || cli.nome);
        if (!canonical || seenCanonical.has(canonical)) continue;
        seenCanonical.add(canonical);
        unifiedRadios.push(cli);
      }

      // Se não encontrou nenhuma rádio, usa as rádios padrão oficiais
      if (unifiedRadios.length === 0) {
        unifiedRadios.push(
          { id: "INTERATIVA FM", nome: "INTERATIVA FM", nome_empresarial: "INTERATIVA FM", categoria: "EMISSORA DE RÁDIO", cidade: "Goiânia", estado: "GO" },
          { id: "CULTURA FM 97.3 FM", nome: "CULTURA FM 97.3 FM", nome_empresarial: "CULTURA FM 97.3 FM", categoria: "EMISSORA DE RÁDIO", cidade: "Chapadão do Sul", estado: "MS" },
          { id: "JORNAL FM", nome: "JORNAL FM", nome_empresarial: "JORNAL FM", categoria: "EMISSORA DE RÁDIO", cidade: "Goiânia", estado: "GO" },
          { id: "POSITIVA FM", nome: "POSITIVA FM", nome_empresarial: "POSITIVA FM", categoria: "EMISSORA DE RÁDIO", cidade: "Goiânia", estado: "GO" }
        );
      }

      // 4. Constrói as informações reais de cada rádio a partir do House Mix
      const resultList: RadioLiveInfo[] = unifiedRadios.map((cli) => {
        const canonical = normalizeClientKey(cli.nome_empresarial || cli.nome);

        // A) Resolução real da grade de programas do House Mix
        const houseMixData = getClientHouseMixProgramsSync(cli, dbProgramas);
        const onAirResult = resolveEffectiveOnAir(houseMixData.programas);

        let progNoAr = "PROGRAMAÇÃO MUSICAL";
        let hInicio = "08:00";
        let hFim = "12:00";
        let estudio = "ESTÚDIO PRINCIPAL (AO VIVO)";
        let locutorNome = "Equipe de Locução";
        let locutorFoto: string | undefined = undefined;
        let locutorInstagram: string | undefined = undefined;

        if (onAirResult.current) {
          progNoAr = onAirResult.current.nome;
          hInicio = onAirResult.current.horario_inicio ? onAirResult.current.horario_inicio.slice(0, 5) : hInicio;
          hFim = onAirResult.current.horario_fim ? onAirResult.current.horario_fim.slice(0, 5) : hFim;
          estudio = onAirResult.current.estudio ? onAirResult.current.estudio.toUpperCase() : estudio;

          // Localiza o apresentador real do programa
          const resolvedAp = resolvePresenterForProgram(onAirResult.current, dbApresentadores, cli.id);
          if (resolvedAp) {
            locutorNome = resolvedAp.nome;
            locutorFoto = resolveSafePresenterPhoto(resolvedAp.foto, resolvedAp.nome, cli.id || cli.nome);
            if (resolvedAp.instagram) locutorInstagram = `@${resolvedAp.instagram.replace(/^@/, "")}`;
          } else {
            const apId = onAirResult.current.apresentador_id || (onAirResult.current.apresentadores_ids && onAirResult.current.apresentadores_ids[0]);
            if (apId) {
              const ap = dbApresentadores.find((a) => a.id === apId);
              if (ap) {
                locutorNome = ap.nome;
                locutorFoto = resolveSafePresenterPhoto(ap.foto, ap.nome, cli.id || cli.nome);
                if (ap.instagram) locutorInstagram = `@${ap.instagram.replace(/^@/, "")}`;
              }
            }
          }
        }

        // Se não houver apresentador no programa, busca algum locutor cadastrado vinculado à rádio
        if (locutorNome === "Equipe de Locução" && dbApresentadores.length > 0) {
          const matchingAp = dbApresentadores.find((a) => {
            const uid = (a.user_id || "").toUpperCase();
            return uid.includes(canonical) || canonical.includes(uid);
          });
          if (matchingAp) {
            locutorNome = matchingAp.nome;
            locutorFoto = resolveSafePresenterPhoto(matchingAp.foto, matchingAp.nome, cli.id || cli.nome);
            if (matchingAp.instagram) locutorInstagram = `@${matchingAp.instagram.replace(/^@/, "")}`;
          }
        }

        // B) Localiza a música tocada no momento para essa rádio
        const clientTocada = dbTocadas.find((t) => {
          const uid = (t.user_id || "").toUpperCase();
          return uid.includes(canonical) || canonical.includes(uid);
        });

        const seedTocada = SEED_TOCADAS.find((s) => {
          const uid = (s.user_id || "").toUpperCase();
          return uid.includes(canonical) || canonical.includes(uid);
        });

        const musicaTitulo = clientTocada?.musica || seedTocada?.musica || "Save Your Tears";
        const musicaArtista = clientTocada?.artista || seedTocada?.artista || "The Weeknd";

        // C) Capa da música pré-conhecida ou cache
        const cacheKey = `${musicaArtista.toLowerCase().trim()}|${musicaTitulo.toLowerCase().trim()}`;
        const musicaCapa = coverCacheRef.current[cacheKey] || KNOWN_COVERS[cacheKey] || undefined;

        // Frequência padrão por emissora
        let frequencia = "FM";
        if (canonical.includes("CULTURA")) frequencia = "97.3 FM";
        else if (canonical.includes("INTERATIVA")) frequencia = "94.9 FM";
        else if (canonical.includes("JORNAL")) frequencia = "89.5 FM";
        else if (canonical.includes("POSITIVA")) frequencia = "98.7 FM";

        // Cidade padrão se não informada
        let cidade = cli.cidade || "Goiânia";
        let estado = cli.estado || "GO";
        if (canonical.includes("CULTURA")) {
          cidade = cli.cidade || "Chapadão do Sul";
          estado = cli.estado || "MS";
        }

        return {
          id: cli.id || canonical,
          nome: cli.nome_empresarial || cli.nome || canonical,
          frequencia,
          cidade,
          estado,
          programaNome: progNoAr,
          horarioInicio: hInicio,
          horarioFim: hFim,
          estudio,
          locutorNome,
          locutorFoto,
          locutorInstagram,
          musicaTitulo,
          musicaArtista,
          musicaCapa,
          logoUrl: cli.logo_url || undefined,
        };
      });

      setRadiosList(resultList);
    } catch (err) {
      console.warn("Erro ao carregar dados dinâmicos do House Mix para o widget:", err);
    }
  }, []);

  useEffect(() => {
    loadDynamicRadios();
  }, [loadDynamicRadios]);

  // Carrega capas em alta resolução via iTunes para as músicas que ainda não possuem capa
  useEffect(() => {
    if (radiosList.length === 0) return;
    const current = radiosList[currentIndex];
    if (current && (!current.musicaCapa || current.musicaCapa.includes("unsplash"))) {
      const cacheKey = `${current.musicaArtista.toLowerCase().trim()}|${current.musicaTitulo.toLowerCase().trim()}`;
      if (coverCacheRef.current[cacheKey]) {
        setRadiosList((prev) =>
          prev.map((r, i) => (i === currentIndex ? { ...r, musicaCapa: coverCacheRef.current[cacheKey] } : r))
        );
      } else {
        fetchiTunesCover(current.musicaTitulo, current.musicaArtista).then((coverUrl) => {
          if (coverUrl) {
            coverCacheRef.current[cacheKey] = coverUrl;
            setRadiosList((prev) =>
              prev.map((r, i) => (i === currentIndex ? { ...r, musicaCapa: coverUrl } : r))
            );
          }
        });
      }
    }
  }, [currentIndex, radiosList]);

  // Rotação a cada 9 SEGUNDOS (conforme solicitado pelo usuário)
  useEffect(() => {
    if (isPaused || radiosList.length <= 1) return;

    const intervalStep = 50; // atualiza a barra a cada 50ms
    const totalDuration = 9000; // 9 segundos por rádio
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += intervalStep;
      setProgress((elapsed / totalDuration) * 100);

      if (elapsed >= totalDuration) {
        setFadeAnim(false);
        setTimeout(() => {
          setCurrentIndex((prev) => (prev + 1) % radiosList.length);
          setProgress(0);
          setFadeAnim(true);
        }, 220);
        elapsed = 0;
      }
    }, intervalStep);

    return () => clearInterval(timer);
  }, [isPaused, radiosList.length]);

  const handleNext = () => {
    setFadeAnim(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % radiosList.length);
      setProgress(0);
      setFadeAnim(true);
    }, 150);
  };

  const handlePrev = () => {
    setFadeAnim(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + radiosList.length) % radiosList.length);
      setProgress(0);
      setFadeAnim(true);
    }, 150);
  };

  if (radiosList.length === 0) {
    return (
      <div className="bg-[#090D15] rounded-3xl p-5 border border-slate-800/80 flex items-center justify-center w-full flex-1 h-[280px] text-slate-400 text-xs">
        <Disc className="w-5 h-5 animate-spin mr-2 text-[#00BFF0]" /> Carregando rádios ao vivo do House Mix...
      </div>
    );
  }

  const currentRadio = radiosList[currentIndex] || radiosList[0];

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="bg-[#090D15] rounded-3xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.35)] border border-slate-800/80 flex flex-col justify-between w-full flex-1 h-[280px] relative overflow-hidden text-white select-none group"
      style={{
        background: "linear-gradient(135deg, #0B0F1A 0%, #080C14 55%, #05070D 100%)",
      }}
    >
      {/* Luz ambiente de fundo elegante */}
      <div className="pointer-events-none absolute -top-24 -right-20 w-80 h-80 bg-[#0055ff]/15 rounded-full blur-3xl transition-opacity duration-700 opacity-60 group-hover:opacity-90" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl" />

      {/* 1. TOPO: Título + Badge de Rádio & Localização + Navegação */}
      <div className="flex items-center justify-between gap-3 relative z-10">
        <div className="flex items-center gap-2">
          {/* Badge Ao Vivo */}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[10px] font-black uppercase tracking-wider shadow-sm">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            AO VIVO
          </span>
          <h3 className="text-xs font-black tracking-widest uppercase text-slate-300">
            agora nas rádios
          </h3>
        </div>

        {/* Emissora Atual + Cidade */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white/[0.07] px-3 py-1 rounded-full border border-white/10 backdrop-blur-md shadow-sm">
            <Radio className="w-3.5 h-3.5 text-[#00BFF0]" />
            <span className="text-xs font-extrabold text-white tracking-wide">
              {currentRadio.nome}
            </span>
            {currentRadio.frequencia && (
              <span className="text-[10px] font-bold text-slate-400 ml-0.5">
                • {currentRadio.frequencia}
              </span>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-1 text-[11px] font-semibold text-slate-400 bg-black/40 px-2.5 py-1 rounded-full border border-slate-800">
            <MapPin className="w-3 h-3 text-[#00BFF0]" />
            <span>
              {currentRadio.cidade} - {currentRadio.estado}
            </span>
          </div>

          {/* Botões manuais de navegação */}
          <div className="flex items-center gap-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handlePrev}
              className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
              title="Rádio Anterior"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
              title="Próxima Rádio"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. CONTEÚDO PRINCIPAL (Grid com Programa no Ar / Locutor à esquerda e Música / Capa à direita) */}
      <div
        className={`grid grid-cols-1 md:grid-cols-2 gap-4 items-center my-auto transition-all duration-300 relative z-10 ${
          fadeAnim ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
        }`}
      >
        {/* COLUNA 1: Programa no Ar & Locutor */}
        <div className="flex flex-col justify-between space-y-2 pr-0 md:pr-3 md:border-r md:border-white/10">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 text-[#00BFF0]" /> PROGRAMA NO AR
              </span>
              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-300 bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                <Clock className="w-3 h-3 text-[#00BFF0]" />
                <span>
                  {currentRadio.horarioInicio} - {currentRadio.horarioFim}
                </span>
              </div>
            </div>
            <h4 className="text-sm sm:text-base font-black text-white truncate mt-1 tracking-tight">
              {currentRadio.programaNome}
            </h4>
            {currentRadio.estudio && (
              <p className="text-[10px] font-medium text-slate-400 truncate">
                {currentRadio.estudio}
              </p>
            )}
          </div>

          {/* Card do Locutor / Apresentador */}
          <div className="flex items-center gap-3 p-2 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm">
            <div className="relative shrink-0">
              {resolveSafePresenterPhoto(currentRadio.locutorFoto, currentRadio.locutorNome, currentRadio.id || currentRadio.name) ? (
                <img
                  src={resolveSafePresenterPhoto(currentRadio.locutorFoto, currentRadio.locutorNome, currentRadio.id || currentRadio.name)}
                  alt={currentRadio.locutorNome}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-[#00BFF0]/40 shadow-md"
                  onError={(e) => {
                    const fallback = resolveSafePresenterPhoto("", currentRadio.locutorNome, currentRadio.id || currentRadio.name) || "/locutores/sem-loc.png";
                    (e.currentTarget as HTMLImageElement).src = fallback;
                  }}
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 border border-slate-600 flex items-center justify-center text-white font-bold text-xs shadow-md">
                  <Mic className="w-4 h-4 text-[#00BFF0]" />
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[#090D15] flex items-center justify-center" title="No Ar">
                <span className="w-1 h-1 bg-white rounded-full" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">
                LOCUÇÃO / APRESENTAÇÃO
              </p>
              <p className="text-xs font-bold text-white truncate">
                {currentRadio.locutorNome}
              </p>
              {currentRadio.locutorInstagram && (
                <p className="text-[10px] font-medium text-[#00BFF0] truncate">
                  {currentRadio.locutorInstagram}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* COLUNA 2: Música Tocando Agora + Capa do Álbum */}
        <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-gradient-to-r from-white/[0.06] via-white/[0.03] to-transparent border border-white/[0.08] backdrop-blur-md shadow-inner">
          {/* Capa com Efeito Vinil e Fallback Garantido */}
          <div className="relative shrink-0 group/cover">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden shadow-2xl border border-white/20 bg-slate-900 relative">
              <img
                src={currentRadio.musicaCapa || FALLBACK_COVER}
                alt={currentRadio.musicaTitulo}
                className="w-full h-full object-cover transition-transform duration-500 group-hover/cover:scale-105"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = FALLBACK_COVER;
                }}
              />
            </div>
            {/* Ícone de Equalizador / Vinil no canto */}
            <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-black p-1 rounded-full shadow-lg border border-black/40">
              <Volume2 className="w-2.5 h-2.5" />
            </div>
          </div>

          {/* Informações da Música */}
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase tracking-wider mb-1">
              <Music className="w-2.5 h-2.5 animate-pulse" />
              TOCANDO AGORA
            </div>
            <h5 className="text-sm font-black text-white truncate leading-tight tracking-tight">
              {currentRadio.musicaTitulo}
            </h5>
            <p className="text-xs font-semibold text-slate-300 truncate mt-0.5">
              {currentRadio.musicaArtista}
            </p>
            <div className="flex items-center gap-1 mt-1 text-[9px] text-slate-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Programação Musical Automática</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. RODAPÉ: Indicadores de Paginação / Dots + Barra de Tempo 9s */}
      <div className="relative z-10 pt-1">
        <div className="flex items-center justify-between">
          {/* Dots de cada Rádio */}
          <div className="flex items-center gap-1.5">
            {radiosList.map((r, idx) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setFadeAnim(false);
                  setTimeout(() => {
                    setCurrentIndex(idx);
                    setProgress(0);
                    setFadeAnim(true);
                  }, 150);
                }}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  currentIndex === idx
                    ? "w-6 bg-[#00BFF0]"
                    : "w-2 bg-slate-700 hover:bg-slate-500"
                }`}
                title={`Ir para ${r.nome}`}
              />
            ))}
          </div>

          {/* Contador 01/04 e Status de pausa */}
          <div className="flex items-center gap-2">
            {isPaused && (
              <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">
                (pausado)
              </span>
            )}
            <span className="text-[10px] font-black text-slate-400 tracking-wider">
              {String(currentIndex + 1).padStart(2, "0")} / {String(radiosList.length).padStart(2, "0")}
            </span>
          </div>
        </div>

        {/* Linha de progresso dos 9 segundos na borda inferior */}
        <div className="w-full bg-slate-800/60 h-0.5 rounded-full mt-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#0055ff] via-[#00BFF0] to-emerald-400 transition-all ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
