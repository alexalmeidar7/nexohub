import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import DOMPurify from "dompurify";
import { useParams, Navigate } from "react-router-dom";
import { usePageTitle, applyPublicHead, usePublicHead } from "@/hooks/usePageTitle";
import { supabase } from "@/integrations/supabase/client";
import { getEmpresaConfig, type EmpresaConfig } from "@/components/ConfiguracoesPage";
import { findCurrentProgram } from "@/components/OnAirWidget";
import { ChevronLeft, ChevronRight, Clock, Radio, Globe, Instagram, Youtube, Phone, MessageCircle, Play, Pause, Facebook, X, Maximize, Minimize, Calendar, ImageIcon, Gift, Pizza, Truck, Star, Trophy, Music, Heart, Sparkles, Beer, ShoppingBag, Ticket, Megaphone, PartyPopper, Plus, Minus, Headphones, MonitorPlay, Users, MessageSquareQuote } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import PromoSkeleton from "@/components/skeletons/PromoSkeleton";
import { getApresentadores } from "@/components/ApresentadorForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, Legend } from "recharts";
import { useLayoutColors } from "@/hooks/useLayoutColors";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { type TelaPromoConfig, defaultTelaPromoConfig, buildTelaPromoBgStyle } from "@/components/ConfigTelaPromoPage";
import PromoInfoBoxes from "@/components/promo/PromoInfoBoxes";

interface Promocao {
  id: string;
  imagem_url: string;
  botao_url: string;
  texto: string;
  oferecimento: string;
  data_inicio: string;
  data_fim: string;
}

interface ProgramaGrade {
  id: string;
  mergedIds: string[];
  nome: string;
  apresentadorId: string;
  apresentadoresIds: string[];
  selo: string;
  capa: string;
  diasSemana: string[];
  horarioInicio: string;
  horarioFim: string;
  descricao: string;
  schedules: { dias: string[]; horarioInicio: string; horarioFim: string }[];
}

interface Testemunhal {
  id: string;
  programa_id: string | null;
  programa_ids?: string[] | null;
  texto: string;
  data_inicio: string;
  data_fim: string;
  imagem_url: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const PROGRAMAS_VISIVEIS = [
  "SERTANEJO BOM DEMAIS - 2",
  "PRIMEIRA HORA",
  "BOM DIA POSITIVA",
  "FLASHBACK POSITIVA",
  "WHATSAPP POSITIVA",
  "VALE NIGHT",
  "PALCO POSITIVA",
];

function renderBoldMarkdown(text: string) {
  const parts = text.split(/\*([^*]+)\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

function colorMix(color: string, amount: number, fallback: string) {
  return `color-mix(in srgb, ${color || fallback} ${amount}%, transparent)`;
}

export default function PromocoesKiosk() {
  const { userSlug } = useParams<{ userSlug?: string }>();
  const validSlug = userSlug && userSlug !== ":userSlug" ? userSlug : undefined;
  const isPublicMode = !!validSlug;
  // In public mode we don't want the auth user's empresa name leaking into
  // the title, so pass empty and override via effect below using config.nome.
  usePageTitle(isPublicMode ? "" : "Promoções");
  usePublicHead(isPublicMode ? validSlug : null, "Promoções");
  useLayoutColors();

  const [loading, setLoading] = useState(true);
  const [promocoes, setPromocoes] = useState<Promocao[]>([]);
  const [config, setConfig] = useState<EmpresaConfig>({} as EmpresaConfig);
  const [programas, setProgramas] = useState<ProgramaGrade[]>([]);
  const [testemunhais, setTestemunhais] = useState<Testemunhal[]>([]);
  const [onAirProgram, setOnAirProgram] = useState<{ nome: string; horarioInicio: string; horarioFim: string; progress: number; apresentadorId: string } | null>(null);
  const [apresentadores, setApresentadores] = useState<any[]>([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [selectedPromo, setSelectedPromo] = useState<Promocao | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<ProgramaGrade | null>(null);
  const [programasSectionOpen, setProgramasSectionOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [telaPromoConfig, setTelaPromoConfig] = useState<TelaPromoConfig>(defaultTelaPromoConfig);
  const [coverIndex, setCoverIndex] = useState<number | null>(null);
  const [coverSlideDir, setCoverSlideDir] = useState<"left" | "right">("right");
  const [audienceUserId, setAudienceUserId] = useState<string | null>(null);
  const [weatherInfo, setWeatherInfo] = useState<{ city: string | null; lat: number | null; lon: number | null }>({ city: null, lat: null, lon: null });
  const [streamCfg, setStreamCfg] = useState<{ audioUrl: string; audioXpath: string; videoUrl: string; videoXpath: string }>({ audioUrl: "", audioXpath: "", videoUrl: "", videoXpath: "" });
  const [audioCount, setAudioCount] = useState<number | null>(null);
  const [videoCount, setVideoCount] = useState<number | null>(null);
  const peakStorageKey = `promo-peak-audience:${userSlug || "self"}`;
  const [peakAudience, setPeakAudience] = useState<{ total: number; programa: string; locutor: string; timestamp: string; date: string } | null>(() => {
    try {
      const raw = localStorage.getItem(peakStorageKey);
      if (!raw) return null;
      const p = JSON.parse(raw);
      const today = new Date().toISOString().split("T")[0];
      return p?.date === today ? p : null;
    } catch { return null; }
  });
  const [audienceDetailsOpen, setAudienceDetailsOpen] = useState(false);
  const [audienceChart, setAudienceChart] = useState<Array<{ hora: string; audio: number; video: number; total: number; programa: string }>>([]);
  const [audienceChartLoading, setAudienceChartLoading] = useState(false);

  useEffect(() => {
    if (!audienceDetailsOpen || !audienceUserId) return;
    let cancelled = false;
    (async () => {
      setAudienceChartLoading(true);
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("audiencia_historico")
        .select("programa, audio, video, created_at")
        .eq("user_id", audienceUserId as any)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const rows = (data || []).map((r: any) => {
        const d = new Date(r.created_at);
        return {
          hora: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          audio: Number(r.audio) || 0,
          video: Number(r.video) || 0,
          total: (Number(r.audio) || 0) + (Number(r.video) || 0),
          programa: r.programa || "",
        };
      });
      setAudienceChart(rows);
      setAudienceChartLoading(false);
    })();
    return () => { cancelled = true; };
  }, [audienceDetailsOpen, audienceUserId]);

  // Shared persistent settings
  const getStoredNumber = (key: string, fallback: number, min: number, max: number) => {
    const raw = localStorage.getItem(key);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };

  const [fontSize, setFontSize] = useState(() => getStoredNumber("kiosk-font-size", 24, 12, 56));
  const [scrollSpeed, setScrollSpeed] = useState(() => getStoredNumber("promo-scroll-speed", 35, 1, 100));
  const [autoPlay, setAutoPlay] = useState(() => localStorage.getItem("kiosk-auto-play") === "true");

  const scrollRef = useRef<HTMLDivElement>(null);
  const promoScrollRef = useRef<HTMLDivElement>(null);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const programModalScrollRef = useRef<HTMLDivElement>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const [autoScrolling, setAutoScrolling] = useState(false);
  const [activeScrollTarget, setActiveScrollTarget] = useState<"promo" | "program">("promo");
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollSpeedRef = useRef(scrollSpeed);
  scrollSpeedRef.current = scrollSpeed;
  const bannerTimerRef = useRef(0);
  const [bannerProgress, setBannerProgress] = useState(0);
  const promoAccentGradient = `linear-gradient(135deg, ${telaPromoConfig.btn_color_a} 0%, ${telaPromoConfig.btn_color_b} 100%)`;
  const promoAccentGradientReverse = `linear-gradient(270deg, ${telaPromoConfig.btn_color_b} 0%, ${telaPromoConfig.btn_color_a} 100%)`;
  const promoDarkGradient = `linear-gradient(135deg, ${telaPromoConfig.btn_color_a} 0%, color-mix(in srgb, ${telaPromoConfig.btn_color_b} 35%, black) 100%)`;
  const promoThemeVars = {
    "--promo-btn-a": telaPromoConfig.btn_color_a,
    "--promo-btn-b": telaPromoConfig.btn_color_b,
    "--promo-text": telaPromoConfig.btn_text_color,
    "--promo-border": telaPromoConfig.card_border_color,
    "--promo-header": telaPromoConfig.header_text_color,
  } as React.CSSProperties;

  // Persist font size
  useEffect(() => {
    localStorage.setItem("kiosk-font-size", String(fontSize));
  }, [fontSize]);

  // Persist scroll speed
  useEffect(() => {
    localStorage.setItem("promo-scroll-speed", String(scrollSpeed));
  }, [scrollSpeed]);

  // Persist auto-play
  useEffect(() => {
    localStorage.setItem("kiosk-auto-play", String(autoPlay));
  }, [autoPlay]);

  // Fullscreen toggle
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Public-mode title + favicon: refine using the empresa data fully loaded
  // for this page (usePublicHead already ran a slug-based pass on mount).
  useEffect(() => {
    if (!isPublicMode) return;
    const nome = (config?.nome || "")
      .replace(/\s*[-–—]\s*promoç(ões|ao|ão)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    applyPublicHead(nome || null, config?.logo || null, "Promoções");
  }, [isPublicMode, config?.nome, config?.logo]);



  useEffect(() => {
    const loadPublic = async () => {
      if (!validSlug) return;
      const { data, error } = await supabase.functions.invoke("public-promo-data", { body: { slug: validSlug } });
      if (error || !data) return;

      const empresa = data.empresa;
      if (empresa) {
        setConfig({
          nome: empresa.nome || "", logo: empresa.logo || "", backgroundUrl: empresa.background_url || "",
          endereco: empresa.endereco || "", telefoneComercial: empresa.telefone_comercial || "",
          telefoneParticipacao: empresa.telefone_participacao || "", site: empresa.site || "",
          instagram: empresa.instagram || "", facebook: empresa.facebook || "", youtube: empresa.youtube || "",
          plano: empresa.plano || "",
        });
        setStreamCfg({
          audioUrl: empresa.audio_stream_api_url || "",
          audioXpath: empresa.audio_stream_xpath || "",
          videoUrl: empresa.video_stream_api_url || "",
          videoXpath: empresa.video_stream_xpath || "",
        });
      }
      if (data.userId) setAudienceUserId(data.userId);
      setWeatherInfo({
        city: data.weather_city || null,
        lat: data.weather_lat != null ? Number(data.weather_lat) : null,
        lon: data.weather_lon != null ? Number(data.weather_lon) : null,
      });

      const today = new Date().toISOString().split("T")[0];
      const activePromos = (data.promocoes || []).filter((p: any) => 
        p.data_inicio && p.data_fim && p.data_inicio <= today && p.data_fim >= today
      );
      setPromocoes(activePromos);
      const activeTestemunhais = (data.testemunhais || []).filter((t: any) => 
        t.data_inicio && t.data_fim && t.data_inicio <= today && t.data_fim >= today
      );
      setTestemunhais(activeTestemunhais);

      // Note: Promotion injection removed from witness list per user request ("tire a promoção no final do texto da citação")
      setTestemunhais(activeTestemunhais);


      if (data.tela_promo_config) {
        setTelaPromoConfig({ ...defaultTelaPromoConfig, ...data.tela_promo_config });
      }

      const mapped = (data.programas || []).map((p: any) => ({
        id: p.id, mergedIds: [p.id], nome: p.nome, apresentadorId: p.apresentador_id || "", apresentadoresIds: p.apresentadores_ids || [], selo: p.selo || "",
        capa: p.capa || "", diasSemana: p.dias_semana || [], horarioInicio: p.horario_inicio,
        horarioFim: p.horario_fim, descricao: p.descricao || "",
        schedules: [{ dias: p.dias_semana || [], horarioInicio: p.horario_inicio, horarioFim: p.horario_fim }],
      }));
      setProgramas(mapped);

      const aprs = (data.apresentadores || []).map((a: any) => ({
        id: a.id, nome: a.nome, cargo: a.cargo || "", instagram: a.instagram || "",
        foto: a.foto || "", ativo: a.ativo,
      }));
      setApresentadores(aprs);
    };

    const loadAuth = async () => {
      const [empresaData, { data: promoData }, { data: progsData }, { data: testData }, { data: settingsData }] = await Promise.all([
        getEmpresaConfig(),
        supabase.from("promocoes").select("*").order("data_inicio"),
        supabase.from("programas").select("*").eq("ativo", true).ilike("estudio", "%fm%"),
        supabase.from("testemunhais").select("*"),
        supabase.from("user_settings").select("cenario_config, weather_city, weather_lat, weather_lon").maybeSingle(),
      ]);
      setConfig(empresaData);
      if (settingsData) {
        setWeatherInfo({
          city: (settingsData as any).weather_city || null,
          lat: (settingsData as any).weather_lat != null ? Number((settingsData as any).weather_lat) : null,
          lon: (settingsData as any).weather_lon != null ? Number((settingsData as any).weather_lon) : null,
        });
      }
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (uid) {
          setAudienceUserId(uid);
          const { data: ec } = await supabase
            .from("empresa_config")
            .select("audio_stream_api_url, audio_stream_xpath, video_stream_api_url, video_stream_xpath")
            .eq("user_id", uid as any)
            .maybeSingle();
          if (ec) {
            setStreamCfg({
              audioUrl: (ec as any).audio_stream_api_url || "",
              audioXpath: (ec as any).audio_stream_xpath || "",
              videoUrl: (ec as any).video_stream_api_url || "",
              videoXpath: (ec as any).video_stream_xpath || "",
            });
          }
        }
      } catch { /* ignore */ }

      if (settingsData?.cenario_config) {
        const raw = settingsData.cenario_config as any;
        if (raw.tela_promo_bg) {
          setTelaPromoConfig({ ...defaultTelaPromoConfig, ...raw.tela_promo_bg });
        }
      }

      const today = new Date().toISOString().split("T")[0];
      const activePromos = (promoData || []).filter((p: any) => 
        p.data_inicio && p.data_fim && p.data_inicio <= today && p.data_fim >= today
      );
      setPromocoes(activePromos);
      const activeTestemunhais = (testData || []).filter((t: any) => 
        t.data_inicio && t.data_fim && t.data_inicio <= today && t.data_fim >= today
      );
      setTestemunhais(activeTestemunhais);

      // Note: Promotion injection removed from witness list per user request ("tire a promoção no final do texto da citação")
      setTestemunhais(activeTestemunhais);


      const mapped = (progsData || []).map((p: any) => ({
        id: p.id, mergedIds: [p.id], nome: p.nome, apresentadorId: p.apresentador_id || "", apresentadoresIds: p.apresentadores_ids || [], selo: p.selo || "",
        capa: p.capa || "", diasSemana: p.dias_semana || [], horarioInicio: p.horario_inicio,
        horarioFim: p.horario_fim, descricao: p.descricao || "",
        schedules: [{ dias: p.dias_semana || [], horarioInicio: p.horario_inicio, horarioFim: p.horario_fim }],
      }));
      setProgramas(mapped);

      const aprs = await getApresentadores();
      setApresentadores(aprs);
    };

    const load = isPublicMode ? loadPublic : loadAuth;
    load().finally(() => setLoading(false));
    const interval = setInterval(load, 10000); // Changed from 30s to 10s for better synchronization
    return () => clearInterval(interval);
  }, [isPublicMode, userSlug]);

  // Banner auto-rotate with progress tracking
  const BANNER_DURATION = 5000;
  const PROGRESS_INTERVAL = 50;

  useEffect(() => {
    const banners = promocoes.filter(p => p.imagem_url);
    if (banners.length <= 1) return;
    bannerTimerRef.current = 0;
    setBannerProgress(0);
    const timer = setInterval(() => {
      bannerTimerRef.current += PROGRESS_INTERVAL;
      const pct = (bannerTimerRef.current / BANNER_DURATION) * 100;
      if (pct >= 100) {
        setCurrentBannerIndex(prev => (prev + 1) % banners.length);
        bannerTimerRef.current = 0;
        setBannerProgress(0);
      } else {
        setBannerProgress(pct);
      }
    }, PROGRESS_INTERVAL);
    return () => clearInterval(timer);
  }, [promocoes]);

  const changeBanner = (index: number) => {
    setCurrentBannerIndex(index);
    bannerTimerRef.current = 0;
    setBannerProgress(0);
  };

  // ---- Audiência ao vivo (áudio x vídeo) ----
  useEffect(() => {
    if (!audienceUserId || !streamCfg.audioUrl) { setAudioCount(null); return; }
    let cancelled = false;
    const tick = async () => {
      try {
        const body: Record<string, unknown> = { userId: audienceUserId, urls: [streamCfg.audioUrl] };
        if (streamCfg.audioXpath) body.xpath = streamCfg.audioXpath;
        const { data } = await supabase.functions.invoke("count-stream-listeners", { body });
        if (!cancelled && data && (data as any).ok) {
          const n = (data as any).listeners;
          setAudioCount(typeof n === "number" ? n : null);
        }
      } catch { /* ignore */ }
    };
    tick();
    const iv = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [audienceUserId, streamCfg.audioUrl, streamCfg.audioXpath]);

  useEffect(() => {
    if (!streamCfg.videoUrl || !streamCfg.videoXpath) { setVideoCount(null); return; }
    let cancelled = false;
    const extract = (text: string, rawPath: string): number | null => {
      const path = rawPath.replace(/^\/+/, "").split("/").map(s => s.trim()).filter(Boolean);
      if (!path.length) return null;
      const trimmed = text.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          let cur: any = JSON.parse(trimmed);
          for (const k of path) { if (cur == null) return null; if (Array.isArray(cur)) cur = cur[0]; cur = cur?.[k]; }
          if (Array.isArray(cur)) cur = cur[0];
          const n = typeof cur === "string" ? parseInt(cur, 10) : Number(cur);
          return Number.isFinite(n) ? n : null;
        } catch { /* fallthrough */ }
      }
      let scope = trimmed;
      for (const tag of path) {
        const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
        const m = scope.match(re);
        if (!m) return null;
        scope = m[1];
      }
      const inner = scope.replace(/<[^>]+>/g, "").trim();
      const n = parseInt(inner, 10);
      return Number.isFinite(n) ? n : null;
    };
    const tick = async () => {
      try {
        const r = await fetch(streamCfg.videoUrl, { cache: "no-store" });
        const text = (await r.text()).trim();
        const n = extract(text, streamCfg.videoXpath);
        if (!cancelled) setVideoCount(typeof n === "number" ? n : null);
      } catch { if (!cancelled) setVideoCount(null); }
    };
    tick();
    const iv = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [streamCfg.videoUrl, streamCfg.videoXpath]);

  // Rastreia o pico de audiência do dia
  useEffect(() => {
    if (audioCount === null && videoCount === null) return;
    const total = (audioCount ?? 0) + (videoCount ?? 0);
    if (total <= 0) return;
    const today = new Date().toISOString().split("T")[0];
    const presenter = onAirProgram?.apresentadorId
      ? apresentadores.find(a => a.id === onAirProgram.apresentadorId)
      : null;
    setPeakAudience(prev => {
      if (prev && prev.date === today && prev.total >= total) return prev;
      const next = {
        total,
        programa: onAirProgram?.nome || "Programação Musical",
        locutor: presenter?.nome || "—",
        timestamp: new Date().toISOString(),
        date: today,
      };
      try { localStorage.setItem(peakStorageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [audioCount, videoCount, onAirProgram, apresentadores]);

  useEffect(() => {
    const update = () => {
      const current = findCurrentProgram(programas as any);
      if (current) {
        setOnAirProgram({
          nome: current.programa.nome || "",
          horarioInicio: (current.programa as any).horarioInicio,
          horarioFim: (current.programa as any).horarioFim,
          progress: Math.min(100, Math.max(0, current.progress)),
          apresentadorId: (current.programa as any).apresentadorId || "",
        });
      } else {
        setOnAirProgram(null);
      }
    };
    update();
    const interval = setInterval(update, 2000);
    return () => clearInterval(interval);
  }, [programas]);

  // Auto scroll - works for whichever modal is open
  const getActiveScrollRef = useCallback(() => {
    return activeScrollTarget === "promo" ? modalScrollRef : programModalScrollRef;
  }, [activeScrollTarget]);

  const normalizeProgramName = (name: string) =>
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

  const getTestemunhalProgramIds = (t: Testemunhal) => {
    const list = Array.isArray(t.programa_ids) ? t.programa_ids.filter(Boolean) : [];
    if (t.programa_id) list.push(t.programa_id);
    return Array.from(new Set(list));
  };


  // Cada programa possui uma única citação vigente. Registros antigos duplicados
  // não devem aparecer como novas citações: prevalece o texto atualizado por último.
  const getTestemunhaisForProgram = (prog: ProgramaGrade) => {
    const today = new Date().toISOString().split("T")[0];
    const baseIds = new Set(prog.mergedIds || [prog.id]);
    // Inclui todos os IDs de programas com o mesmo nome normalizado (grade duplicada)
    const key = normalizeProgramName(prog.nome);
    for (const p of programas) {
      if (normalizeProgramName(p.nome) === key) baseIds.add(p.id);
    }

    const matches = testemunhais.filter(t => {
      const tIds = getTestemunhalProgramIds(t);
      if (tIds.length === 0) return false;
      const matchesId = tIds.some(id => baseIds.has(id));
      const isWithinDate = t.data_inicio && t.data_fim && t.data_inicio <= today && t.data_fim >= today;
      return matchesId && isWithinDate;
    });

    const standardTests = matches
      .filter(t => !(t as any).is_promo)
      .sort((a, b) => {
        const aTime = Date.parse(a.updated_at || a.created_at || a.data_inicio || "") || 0;
        const bTime = Date.parse(b.updated_at || b.created_at || b.data_inicio || "") || 0;
        return bTime - aTime;
      })
      .slice(0, 1);

    const promoTests = matches.filter(t => (t as any).is_promo);

    return [...standardTests, ...promoTests];
  };

  // Mapa global nome-normalizado -> capa preferida (primeira não-vazia encontrada em todos os programas)
  const canonicalCoverByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of programas) {
      if (!p.capa) continue;
      const key = normalizeProgramName(p.nome);
      if (!map.has(key)) map.set(key, p.capa);
    }
    return map;
  }, [programas]);

  const mergeProgramList = (list: ProgramaGrade[]) => Array.from(
    list
      .slice()
      .sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio))
      .reduce((map, programa) => {
        const dedupeKey = normalizeProgramName(programa.nome);
        const mergedIds = Array.from(new Set([...(programa.mergedIds || []), programa.id]));
        const canonicalCover = canonicalCoverByName.get(dedupeKey) || programa.capa || "";
        const existing = map.get(dedupeKey);
        if (!existing) {
          map.set(dedupeKey, { ...programa, capa: canonicalCover, mergedIds });
        } else {
          existing.mergedIds = Array.from(new Set([...existing.mergedIds, ...mergedIds]));
          existing.diasSemana = [...new Set([...existing.diasSemana, ...programa.diasSemana])];
          existing.schedules = [...existing.schedules, ...programa.schedules];
          if (canonicalCover) existing.capa = canonicalCover;
        }
        return map;
      }, new Map<string, ProgramaGrade>())
      .values(),
  );

  const todayDateStr = new Date().toISOString().split("T")[0];
  const programIdsWithTestemunhais = new Set(
    testemunhais
      .filter(t =>
        t.data_inicio && t.data_fim &&
        t.data_inicio <= todayDateStr && t.data_fim >= todayDateStr
      )
      .flatMap(t => getTestemunhalProgramIds(t))
  );

  // Nomes normalizados que possuem citação (para incluir grades duplicadas do mesmo programa)
  const programNamesWithTestemunhais = new Set(
    programas
      .filter(p => programIdsWithTestemunhais.has(p.id))
      .map(p => normalizeProgramName(p.nome))
  );

  const filteredPrograms = mergeProgramList(
    programas.filter(p => programNamesWithTestemunhais.has(normalizeProgramName(p.nome)))
  );

  const todayDateNow = new Date().toISOString().split("T")[0];
  const banners = promocoes.filter(p => 
    p.imagem_url && p.data_inicio && p.data_fim && p.data_inicio <= todayDateNow && p.data_fim >= todayDateNow
  );
  const botoes = promocoes.filter(p => 
    p.botao_url && p.data_inicio && p.data_fim && p.data_inicio <= todayDateNow && p.data_fim >= todayDateNow
  );

  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startScroll = useCallback((ref: React.RefObject<HTMLDivElement>, direction: "left" | "right") => {
    stopScroll();
    const step = () => {
      ref.current?.scrollBy({ left: direction === "left" ? -8 : 8 });
    };
    step();
    scrollIntervalRef.current = setInterval(step, 16);
  }, []);

  const stopScroll = useCallback(() => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
    lastFrameTimeRef.current = null;
    setAutoScrolling(false);
  }, []);

  const startAutoScroll = useCallback((target: "promo" | "program") => {
    setActiveScrollTarget(target);

    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }

    lastFrameTimeRef.current = null;
    setAutoScrolling(true);

    const animate = (time: number) => {
      const ref = target === "promo" ? modalScrollRef : programModalScrollRef;

      if (ref.current) {
        if (lastFrameTimeRef.current === null) {
          lastFrameTimeRef.current = time;
        }

        const elapsed = time - lastFrameTimeRef.current;
        lastFrameTimeRef.current = time;

        const pixelsPerSecond = 30 + scrollSpeedRef.current * 12;
        const pixelsToScroll = (pixelsPerSecond * elapsed) / 1000;
        ref.current.scrollTop += pixelsToScroll;
      }

      autoScrollFrameRef.current = requestAnimationFrame(animate);
    };

    autoScrollFrameRef.current = requestAnimationFrame(animate);
  }, []);

  const toggleAutoScroll = (target: "promo" | "program") => {
    if (autoScrolling && activeScrollTarget === target) {
      stopAutoScroll();
      return;
    }
    startAutoScroll(target);
  };

  const handleAutoPlayChange = (enabled: boolean) => {
    setAutoPlay(enabled);
    
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
  };

  const closePromoModal = () => {
    setSelectedPromo(null);
    stopAutoScroll();
    if (autoPlayTimerRef.current) { clearTimeout(autoPlayTimerRef.current); autoPlayTimerRef.current = null; }
  };

  const closeProgramModal = () => {
    setSelectedProgram(null);
    stopAutoScroll();
    if (autoPlayTimerRef.current) { clearTimeout(autoPlayTimerRef.current); autoPlayTimerRef.current = null; }
  };

  // Auto-play on modal open disabled
  useEffect(() => {
    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, [selectedPromo, autoPlay, startAutoScroll]);

  useEffect(() => {
    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, [selectedProgram, autoPlay, startAutoScroll]);


  // Pré-carrega imagens do programa atual/anterior/próximo com debounce + cancelamento
  const preloadedUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const pending: HTMLImageElement[] = [];
    const timer = window.setTimeout(() => {
      const list = mergeProgramList(programas);
      if (!list.length) return;
      const onAirIdx = onAirProgram ? list.findIndex(p => normalizeProgramName(p.nome) === normalizeProgramName(onAirProgram.nome)) : -1;
      const activeIdx = coverIndex ?? (onAirIdx >= 0 ? onAirIdx : 0);
      const targets = [
        list[activeIdx],
        list[(activeIdx + 1) % list.length],
        list[(activeIdx - 1 + list.length) % list.length],
      ].filter(Boolean);
      const urls = new Set<string>();
      for (const prog of targets) {
        if (prog?.capa) urls.add(prog.capa);
        const tests = getTestemunhaisForProgram(prog!);
        for (const t of tests) if (t.imagem_url) urls.add(t.imagem_url);
      }
      const cache = preloadedUrlsRef.current;
      urls.forEach(url => {
        if (cache.has(url)) return;
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        img.onload = img.onerror = () => cache.add(url);
        pending.push(img);
      });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      for (const img of pending) {
        if (!img.complete) {
          img.onload = null;
          img.onerror = null;
          img.src = ""; // aborta o download em navegadores modernos
        }
      }
    };
  }, [coverIndex, onAirProgram, programas, testemunhais]);


  const ProgressCircle = ({ active, progress }: { active: boolean; progress: number }) => {
    if (!active) {
      return (
        <span
          className="block rounded-full transition-all duration-300"
          style={{
            width: 6,
            height: 6,
            backgroundColor: "rgba(255,255,255,0.45)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.15)",
          }}
        />
      );
    }
    return (
      <span
        className="relative block rounded-full overflow-hidden transition-all duration-300"
        style={{
          width: 28,
          height: 6,
          backgroundColor: "rgba(255,255,255,0.35)",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.15)",
        }}
      >
        <span
          className="absolute inset-y-0 left-0"
          style={{
            width: `${Math.min(100, Math.max(0, progress))}%`,
            backgroundColor: "#ffffff",
            transition: "width 50ms linear",
            boxShadow: "0 0 6px rgba(255,255,255,0.5)",
          }}
        />
      </span>
    );
  };


  // Spacebar to toggle play/pause when a modal is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      if (selectedPromo) toggleAutoScroll("promo");
      else if (selectedProgram) toggleAutoScroll("program");
    };
    if (selectedPromo || selectedProgram) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPromo, selectedProgram, autoScrolling, activeScrollTarget]);

   // Inline teleprompter controls renderer (not a component to avoid remount)
  const renderTeleprompterControls = (target: "promo" | "program") => (
    <div className="flex items-center gap-3 p-[10px] rounded-xl" style={{ backgroundColor: "var(--layout-slider-bg, #1b1b1d)" }}>
      <div className="flex items-center gap-1.5 flex-1 pl-2">
        <button 
          type="button" 
          onClick={() => setFontSize(s => Math.max(12, s - 2))} 
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold hover:brightness-125 transition" 
          style={{ backgroundColor: "var(--layout-accent-color, #a60101)" }}
          title="Diminuir texto"
        >
          <Minus size={14} />
        </button>
        <button 
          type="button" 
          onClick={() => setFontSize(s => Math.min(56, s + 2))} 
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold hover:brightness-125 transition" 
          style={{ backgroundColor: "var(--layout-accent-color, #a60101)" }}
          title="Aumentar texto"
        >
          <Plus size={14} />
        </button>
      </div>
      
      <div className="flex items-center gap-2 flex-[4] justify-center px-4">
        <span className="text-[11px] font-bold uppercase tracking-wider opacity-60">Aumentar e diminuir o tamanho do texto</span>
      </div>
      <div className="flex-1" />
    </div>
  );

  if (userSlug === ":userSlug") {
    return <Navigate to="/telapromo" replace />;
  }
  if (loading) {
    return <PromoSkeleton />;
  }


  return (
    <div className="text-white min-h-screen p-8 flex flex-col items-center animate-fade-in" style={{ ...buildTelaPromoBgStyle(telaPromoConfig), ...promoThemeVars, color: telaPromoConfig.header_text_color }}>
      <style>{`
        .no-scrollbar::-webkit-scrollbar{display:none}
        .no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
        .promo-scroll::-webkit-scrollbar{width:10px}
        .promo-scroll::-webkit-scrollbar-track{background:var(--promo-btn-a);border-radius:5px}
        .promo-scroll::-webkit-scrollbar-thumb{background:var(--promo-border);border-radius:5px}
        .promo-scroll::-webkit-scrollbar-button{display:block;height:10px;background:var(--promo-border);border-radius:2px}
        .promo-scroll{scrollbar-width:thin;scrollbar-color:var(--promo-border) var(--promo-btn-a)}
        @keyframes pulse-border{0%,100%{box-shadow:0 0 0 3px var(--promo-border)}50%{box-shadow:0 0 0 3px color-mix(in srgb,var(--promo-border) 20%, transparent)}}
        .animate-pulse-border{animation:pulse-border 1.5s ease-in-out infinite}
        @keyframes audience-shimmer{0%{background-position:0 0}100%{background-position:40px 0}}
        @keyframes audience-glow-red{0%,100%{box-shadow:inset 0 0 12px rgba(0,0,0,.35),0 0 12px color-mix(in srgb,var(--promo-btn-b) 55%, transparent)}50%{box-shadow:inset 0 0 18px rgba(0,0,0,.35),0 0 22px color-mix(in srgb,var(--promo-btn-b) 95%, transparent)}}
        @keyframes audience-glow-white{0%,100%{box-shadow:inset 0 0 12px rgba(0,0,0,.15),0 0 12px color-mix(in srgb,var(--promo-border) 55%, transparent)}50%{box-shadow:inset 0 0 18px rgba(0,0,0,.15),0 0 22px color-mix(in srgb,var(--promo-border) 95%, transparent)}}
        @keyframes audience-crown{0%,100%{transform:translateY(-50%) rotate(-8deg) scale(1)}50%{transform:translateY(-70%) rotate(8deg) scale(1.15)}}
        @keyframes audience-confetti{0%{transform:translateY(-6px) rotate(0);opacity:0}20%{opacity:1}100%{transform:translateY(28px) rotate(360deg);opacity:0}}
        .audience-winner-stripes{background-image:linear-gradient(115deg,color-mix(in srgb,var(--promo-text) 28%, transparent) 0 12px,transparent 12px 24px);background-size:40px 100%;animation:audience-shimmer 1.1s linear infinite}
        .audience-winner-red{animation:audience-glow-red 1.4s ease-in-out infinite}
        .audience-winner-white{animation:audience-glow-white 1.4s ease-in-out infinite}
        .audience-crown{animation:audience-crown 1.2s ease-in-out infinite;transform-origin:center}
        .audience-confetti{position:absolute;top:0;width:4px;height:8px;border-radius:1px;animation:audience-confetti 1.6s ease-in infinite}
      `}</style>

      <div className="w-full max-w-[1000px] flex flex-col gap-6">

        {/* Header */}
        <div className="flex justify-between items-center w-full px-2">
          <div className="flex items-center gap-3">
            <Radio size={16} style={{ color: telaPromoConfig.btn_color_b, filter: `drop-shadow(0 0 8px ${colorMix(telaPromoConfig.btn_color_b, 70, "#ffffff")})` }} className="animate-pulse" />

            {/* Presenter photo - ao lado do ícone de ao vivo */}
            {(() => {
              const presenter = onAirProgram?.apresentadorId
                ? apresentadores.find(a => a.id === onAirProgram.apresentadorId)
                : null;
              return presenter?.foto ? (
                <div className="relative group/presenter">
                  <div
                    className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center"
                    style={{ background: promoAccentGradient, boxShadow: `0 0 0 2px ${colorMix(telaPromoConfig.card_border_color, 35, "#ffffff")}` }}
                  >
                    <img src={presenter.foto} alt={presenter.nome} className="w-full h-full object-cover" />
                  </div>
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded whitespace-nowrap opacity-0 group-hover/presenter:opacity-100 transition-opacity z-10" style={{ background: promoDarkGradient, color: telaPromoConfig.btn_text_color }}>
                    {presenter.nome}
                  </div>
                </div>
              ) : null;
            })()}

            <div>
              <span className="font-bold uppercase tracking-widest text-xs" style={{ color: telaPromoConfig.header_text_color }}>No Ar</span>
              <p className="text-sm font-semibold truncate max-w-[300px]" style={{ color: telaPromoConfig.header_text_color }}>
                {onAirProgram?.nome || "Programação Musical"}
              </p>
              {onAirProgram && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px]" style={{ color: colorMix(telaPromoConfig.header_text_color, 60, "#ffffff") }}>
                    {onAirProgram.horarioInicio.slice(0, 5)} às {onAirProgram.horarioFim.slice(0, 5)}
                  </span>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ width: 160, backgroundColor: telaPromoConfig.btn_color_a }}>
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${onAirProgram.progress}%`, background: promoAccentGradient }}
                    />
                  </div>
                </div>
              )}
            </div>


            {/* Contact info */}
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-3 ml-3">
                {config.site && (
                  <Tooltip>
                    <TooltipTrigger><Globe size={14} className="cursor-pointer" style={{ color: telaPromoConfig.header_text_color }} /></TooltipTrigger>
                    <TooltipContent><p>{config.site}</p></TooltipContent>
                  </Tooltip>
                )}
                {config.instagram && (
                  <Tooltip>
                    <TooltipTrigger><Instagram size={14} className="cursor-pointer" style={{ color: telaPromoConfig.header_text_color }} /></TooltipTrigger>
                    <TooltipContent><p>{config.instagram}</p></TooltipContent>
                  </Tooltip>
                )}
                {config.youtube && (
                  <Tooltip>
                    <TooltipTrigger><Youtube size={14} className="cursor-pointer" style={{ color: telaPromoConfig.header_text_color }} /></TooltipTrigger>
                    <TooltipContent><p>{config.youtube}</p></TooltipContent>
                  </Tooltip>
                )}
                {config.facebook && (
                  <Tooltip>
                    <TooltipTrigger><Facebook size={14} className="cursor-pointer" style={{ color: telaPromoConfig.header_text_color }} /></TooltipTrigger>
                    <TooltipContent><p>{config.facebook}</p></TooltipContent>
                  </Tooltip>
                )}

                {/* Telefones */}
                {config.telefoneParticipacao && (
                  <div className="flex flex-col items-center ml-2">
                    <div className="flex items-center gap-1">
                      <MessageCircle size={15} style={{ color: telaPromoConfig.header_text_color }} />
                      <span className="font-bold text-[16px]" style={{ color: telaPromoConfig.header_text_color }}>{config.telefoneParticipacao}</span>
                    </div>
                    <span className="text-xs" style={{ color: telaPromoConfig.header_text_color }}>whatsapp ouvinte</span>
                  </div>
                )}
                {config.telefoneComercial && (
                  <div className="flex flex-col items-center ml-2">
                    <div className="flex items-center gap-1">
                      <Phone size={15} style={{ color: telaPromoConfig.header_text_color }} />
                      <span className="font-bold text-[16px]" style={{ color: telaPromoConfig.header_text_color }}>{config.telefoneComercial}</span>
                    </div>
                    <span className="text-xs" style={{ color: telaPromoConfig.header_text_color }}>telefone comercial</span>
                  </div>
                )}
              </div>
            </TooltipProvider>
          </div>

          {/* Logo + Fullscreen */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
              title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
            {config.logo && (
              <img src={config.logo} alt={config.nome} className="h-[90px] w-auto object-contain" />
            )}
          </div>
        </div>

        {/* Boxes informativos acima da barra de audiência */}
        <PromoInfoBoxes
          weatherCity={weatherInfo.city}
          weatherLat={weatherInfo.lat}
          weatherLon={weatherInfo.lon}
          userId={audienceUserId}
        />

        {/* Barra Batalha de Audiência: Áudio (esq) vs Vídeo (dir) */}
        {(() => {
          const a = Math.max(0, audioCount ?? 0);
          const v = Math.max(0, videoCount ?? 0);
          const total = a + v;
          const hasData = (audioCount !== null) || (videoCount !== null);
          const audioPct = total > 0 ? (a / total) * 100 : 50;
          const videoPct = 100 - audioPct;
          const fmt = (n: number | null) => n === null ? "—" : n.toLocaleString("pt-BR");
          const audioWins = hasData && a > v;
          const videoWins = hasData && v > a;
          const confettiColors = [telaPromoConfig.btn_color_a, telaPromoConfig.btn_color_b, telaPromoConfig.card_border_color, telaPromoConfig.btn_text_color];
          return (
            <div className="w-full px-2 -mt-2 flex items-center gap-2">
              <div
                className="relative flex-1 min-w-0 h-10 rounded-full overflow-hidden flex items-stretch shadow-[0_4px_16px_rgba(0,0,0,0.45)]"
                style={{ backgroundColor: colorMix(telaPromoConfig.btn_color_a, 18, "#0a0a0a"), border: `1px solid ${colorMix(telaPromoConfig.card_border_color, 24, "#ffffff")}` }}
                title="Audiência ao vivo: áudio × vídeo"
              >
                {/* Preenchimento áudio */}
                <div
                  className={`absolute inset-y-0 left-0 transition-[width] duration-700 ease-out ${audioWins ? "audience-winner-red" : ""}`}
                  style={{
                    width: `${audioPct}%`,
                    background: promoAccentGradient,
                    boxShadow: "inset 0 0 12px rgba(0,0,0,0.35)",
                  }}
                >
                  {audioWins && <div className="absolute inset-0 audience-winner-stripes pointer-events-none" />}
                </div>
                {/* Preenchimento vídeo */}
                <div
                  className={`absolute inset-y-0 right-0 transition-[width] duration-700 ease-out ${videoWins ? "audience-winner-white" : ""}`}
                  style={{
                    width: `${videoPct}%`,
                    background: promoAccentGradientReverse,
                    boxShadow: "inset 0 0 12px rgba(0,0,0,0.15)",
                  }}
                >
                  {videoWins && <div className="absolute inset-0 audience-winner-stripes pointer-events-none" />}
                </div>
                {/* Divisor central animado */}
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-black transition-[left] duration-700 ease-out"
                  style={{ left: `calc(${audioPct}% - 1px)`, boxShadow: "0 0 6px rgba(0,0,0,0.6)" }}
                />
                {/* Confetes festivos sobre o lado vencedor */}
                {(audioWins || videoWins) && (
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 overflow-hidden z-[5]"
                    style={audioWins ? { left: 0, width: `${audioPct}%` } : { right: 0, width: `${videoPct}%` }}
                  >
                    {Array.from({ length: 8 }).map((_, i) => (
                      <span
                        key={i}
                        className="audience-confetti"
                        style={{
                          left: `${(i * 13 + 5) % 95}%`,
                          backgroundColor: confettiColors[i % confettiColors.length],
                          animationDelay: `${(i * 0.18).toFixed(2)}s`,
                        }}
                      />
                    ))}
                  </div>
                )}
                {/* Conteúdo à esquerda (áudio) */}
                <div className="relative z-10 flex items-center gap-2 pl-2 pr-4 h-full">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center relative" style={{ backgroundColor: colorMix(telaPromoConfig.btn_color_a, 55, "#000000"), color: telaPromoConfig.btn_text_color }}>
                    <Headphones size={14} />
                    {audioWins && (
                      <Trophy size={12} className="audience-crown absolute -top-3 left-1/2 -translate-x-1/2" style={{ color: telaPromoConfig.card_border_color, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }} />
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5 px-2 py-1 rounded-md" style={{ backgroundColor: colorMix(telaPromoConfig.btn_color_a, 62, "#000000"), color: telaPromoConfig.btn_text_color, backdropFilter: "blur(4px)" }}>
                    <span className="font-black text-sm leading-none tabular-nums">{fmt(audioCount)}</span>
                    <span className="text-[10px] uppercase tracking-wider font-semibold opacity-90">Áudio</span>
                  </div>
                </div>
                {/* Conteúdo à direita (vídeo) */}
                <div className="relative z-10 flex items-center gap-2 pr-2 pl-4 h-full ml-auto">
                  <div className="flex items-baseline gap-1.5 px-2 py-1 rounded-md" style={{ backgroundColor: colorMix(telaPromoConfig.btn_color_a, 62, "#000000"), color: telaPromoConfig.btn_text_color, backdropFilter: "blur(4px)" }}>
                    <span className="text-[10px] uppercase tracking-wider font-semibold opacity-90">Vídeo</span>
                    <span className="font-black text-sm leading-none tabular-nums">{fmt(videoCount)}</span>
                  </div>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center relative" style={{ backgroundColor: colorMix(telaPromoConfig.btn_color_b, 55, "#000000"), color: telaPromoConfig.btn_text_color }}>
                    <MonitorPlay size={14} />
                    {videoWins && (
                      <Trophy size={12} className="audience-crown absolute -top-3 left-1/2 -translate-x-1/2" style={{ color: telaPromoConfig.card_border_color, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }} />
                    )}
                  </div>
                </div>
              </div>
              {/* Total de espectadores + Tooltip com pico do dia */}
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      onClick={() => setAudienceDetailsOpen(true)}
                      className="flex-shrink-0 h-10 px-3 rounded-full flex items-center gap-2 shadow-[0_4px_16px_rgba(0,0,0,0.45)] cursor-pointer hover:brightness-110 transition"
                      style={{
                        background: promoDarkGradient,
                        border: `1px solid ${colorMix(telaPromoConfig.card_border_color, 32, "#ffffff")}`,
                        color: telaPromoConfig.btn_text_color,
                      }}
                    >
                      <Users size={14} />
                      <div className="flex items-baseline gap-1">
                        <span className="font-black text-sm leading-none tabular-nums">{hasData ? total.toLocaleString("pt-BR") : "—"}</span>
                        <span className="text-[10px] uppercase tracking-wider font-semibold opacity-90">Total</span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="border border-white/15 p-0 overflow-hidden"
                    style={{ background: promoDarkGradient, color: telaPromoConfig.btn_text_color, borderColor: colorMix(telaPromoConfig.card_border_color, 32, "#ffffff") }}
                  >
                    {peakAudience ? (() => {
                      const d = new Date(peakAudience.timestamp);
                      const dataStr = d.toLocaleDateString("pt-BR");
                      const horaStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                      return (
                        <div className="min-w-[220px]">
                          <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ background: promoAccentGradient, borderColor: colorMix(telaPromoConfig.card_border_color, 24, "#ffffff") }}>
                            <Trophy size={16} style={{ color: telaPromoConfig.btn_text_color }} />
                            <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: telaPromoConfig.btn_text_color }}>Melhor audiência do dia</span>
                          </div>
                          <div className="px-3 py-2.5 space-y-1.5">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-2xl font-black tabular-nums leading-none" style={{ color: telaPromoConfig.btn_text_color }}>{peakAudience.total.toLocaleString("pt-BR")}</span>
                              <span className="text-[10px] uppercase tracking-wider opacity-70">espectadores</span>
                            </div>
                            <div className="text-[11px] opacity-90"><span className="opacity-60">Programa:</span> <span className="font-semibold">{peakAudience.programa}</span></div>
                            <div className="text-[11px] opacity-90"><span className="opacity-60">Locutor:</span> <span className="font-semibold">{peakAudience.locutor}</span></div>
                            <div className="text-[11px] opacity-90 flex items-center gap-2 pt-0.5">
                              <span><span className="opacity-60">Data:</span> {dataStr}</span>
                              <span><span className="opacity-60">Hora:</span> {horaStr}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAudienceDetailsOpen(true)}
                              className="mt-2 w-full py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all hover:brightness-110"
                              style={{ background: promoAccentGradient, color: telaPromoConfig.btn_text_color, border: `1px solid ${colorMix(telaPromoConfig.card_border_color, 32, "#ffffff")}` }}
                            >
                              Ver detalhes
                            </button>

                          </div>
                        </div>
                      );
                    })() : (
                      <div className="px-3 py-2.5 flex items-center gap-2 min-w-[200px]">
                        <Trophy size={14} style={{ color: telaPromoConfig.btn_color_b }} />
                        <span className="text-[11px] opacity-80">Aguardando primeira medição do dia…</span>
                      </div>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          );
        })()}


        {/* Banner rotativo + capa do programa no ar */}
        {(() => {
          // Programas ordenados pela grade (horário de início), deduplicados por nome
          const scheduleList = mergeProgramList(programas);
          const onAirIdx = onAirProgram
            ? scheduleList.findIndex(p => normalizeProgramName(p.nome) === normalizeProgramName(onAirProgram.nome))
            : -1;
          const activeIdx = coverIndex ?? (onAirIdx >= 0 ? onAirIdx : 0);
          const currentProg = scheduleList[activeIdx] ?? null;
          const goPrev = (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (!scheduleList.length) return;
            setCoverSlideDir("left");
            setCoverIndex((activeIdx - 1 + scheduleList.length) % scheduleList.length);
          };
          const goNext = (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (!scheduleList.length) return;
            setCoverSlideDir("right");
            setCoverIndex((activeIdx + 1) % scheduleList.length);
          };
          return (
            <div className="w-full flex gap-4 items-stretch">
              <div className="flex-1 min-w-0 overflow-hidden rounded-xl shadow-2xl relative" style={{ height: 276 }}>
                {banners.length > 0 ? (
                  <div className="relative w-full h-full overflow-hidden">
                    <div
                      className="flex transition-transform duration-700 ease-in-out h-full"
                      style={{ transform: `translateX(-${currentBannerIndex * 100}%)` }}
                    >
                      {banners.map((banner) => (
                        <div key={banner.id} className="w-full h-full flex-shrink-0 flex items-center justify-center bg-black/20">
                          <img src={banner.imagem_url} alt={banner.texto} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-white/30">Nenhum banner ativo</div>
                )}

                {banners.length > 1 && (
                  <>
                    <button
                      onClick={() => changeBanner((currentBannerIndex - 1 + banners.length) % banners.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center z-10"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      onClick={() => changeBanner((currentBannerIndex + 1) % banners.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center z-10"
                    >
                      <ChevronRight size={20} />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 items-center px-2.5 py-1.5 rounded-full backdrop-blur-md" style={{ backgroundColor: "rgba(0,0,0,0.35)" }}>
                      {banners.map((_, i) => (
                        <button key={i} onClick={() => changeBanner(i)} className="cursor-pointer flex items-center justify-center hover:opacity-80 transition-opacity" aria-label={`Ir para banner ${i + 1}`}>
                          <ProgressCircle active={i === currentBannerIndex} progress={i === currentBannerIndex ? bannerProgress : 0} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {currentProg?.capa && (
                <div
                  className="group/cover flex-shrink-0 rounded-xl overflow-hidden relative cursor-pointer transition-transform duration-200 hover:scale-[1.03]"
                  style={{ width: 207, height: 276, contain: "paint", isolation: "isolate" }}
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (currentProg) { 
                      const progWithLatestIds = programas.find(p => normalizeProgramName(p.nome) === normalizeProgramName(currentProg.nome));
                      setSelectedProgram(progWithLatestIds ? {...progWithLatestIds} : {...currentProg}); 
                      stopAutoScroll(); 
                    } 
                  }}
                  title="Citações"
                >
                    <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full text-[11px] font-semibold backdrop-blur-md opacity-0 group-hover/cover:opacity-100 transition-opacity duration-200 z-20 whitespace-nowrap shadow-lg" style={{ background: promoDarkGradient, color: telaPromoConfig.btn_text_color }}>
                    Citações
                  </div>
                  <div
                    key={`${normalizeProgramName(currentProg.nome)}-${currentProg.capa}`}
                    aria-label={currentProg.nome}
                    className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat"
                    style={{
                      backgroundImage: `url(${currentProg.capa})`,
                      animation: `${coverSlideDir === "right" ? "cover-slide-in-right" : "cover-slide-in-left"} 320ms ease-out`,
                    }}
                  />
                  {scheduleList.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={goPrev}
                        className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/85 text-white rounded-full w-7 h-7 flex items-center justify-center opacity-0 pointer-events-none group-hover/cover:opacity-100 group-hover/cover:pointer-events-auto transition-opacity z-10"
                        aria-label="Programa anterior"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={goNext}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/85 text-white rounded-full w-7 h-7 flex items-center justify-center opacity-0 pointer-events-none group-hover/cover:opacity-100 group-hover/cover:pointer-events-auto transition-opacity z-10"
                        aria-label="Próximo programa"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Programas removidos conforme solicitado */}

        {/* Promoções */}
        {botoes.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-4" style={{ color: "white" }}>Promoções</h2>

            <div className="grid grid-cols-4 gap-4">
              {botoes.map(promo => {
                const title = (promo.botao_url || "").toLowerCase();
                const PromoIcon =
                  title.includes("prêmio") || title.includes("premio") ? Gift :
                  title.includes("pizza") ? Pizza :
                  title.includes("burger") || title.includes("hambur") ? ShoppingBag :
                  title.includes("resenha") || title.includes("happy") || title.includes("cervej") || title.includes("chop") ? Beer :
                  title.includes("estrada") || title.includes("moviment") ? Truck :
                  title.includes("positiva") && title.includes("parada") ? Trophy :
                  title.includes("night") || title.includes("noite") || title.includes("cabaré") || title.includes("balada") ? PartyPopper :
                  title.includes("music") || title.includes("karaoke") || title.includes("palco") ? Music :
                  title.includes("amor") || title.includes("heart") || title.includes("namor") ? Heart :
                  title.includes("ingresso") || title.includes("ticket") ? Ticket :
                  title.includes("star") || title.includes("estrela") ? Star :
                  Sparkles;

                const cardRadius = telaPromoConfig.card_style === "sharp" ? "4px" : telaPromoConfig.card_style === "pill" ? "50px" : "16px";

                return (
                  <div
                    key={promo.id}
                    className="w-full h-16 cursor-pointer transition-all duration-200 flex items-center gap-3 px-4 font-bold text-sm outline-4 outline-transparent hover:scale-[1.03] shadow-lg overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${telaPromoConfig.btn_color_a} 0%, ${telaPromoConfig.btn_color_b} 100%)`,
                      color: telaPromoConfig.btn_text_color,
                      borderRadius: cardRadius,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.outline = `4px solid ${telaPromoConfig.card_border_color}`; }}
                    onMouseLeave={e => { e.currentTarget.style.outline = "4px solid transparent"; }}
                    onClick={() => setSelectedPromo(promo)}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.25)" }}>
                      <PromoIcon size={18} />
                    </div>
                    <span className="truncate">{promo.botao_url}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal da Promoção */}
      <style>{`
        .promo-text-force-white,
        .promo-text-force-white * {
          color: white !important;
        }
      `}</style>

      {/* Dialog de detalhes de audiência do dia */}
      <Dialog open={audienceDetailsOpen} onOpenChange={setAudienceDetailsOpen}>
        <DialogContent className="max-w-3xl text-white border border-white/10 p-0 overflow-hidden" style={{ backgroundColor: "#0a0a0a" }}>
          <DialogHeader className="px-5 py-4 border-b border-white/10" style={{ background: "linear-gradient(90deg, rgba(215,13,14,0.6), rgba(0,0,0,0))" }}>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Trophy size={18} style={{ color: "#ffffff" }} />
              Audiência do dia
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg p-3 border border-white/10" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Programa</div>
              <div className="text-sm font-bold truncate">{peakAudience?.programa || "—"}</div>
            </div>
            <div className="rounded-lg p-3 border border-white/10" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Locutor</div>
              <div className="text-sm font-bold truncate">{peakAudience?.locutor || "—"}</div>
            </div>
            <div className="rounded-lg p-3 border" style={{ background: "linear-gradient(135deg, #d70d0e 0%, #000 100%)", borderColor: "rgba(255,255,255,0.2)" }}>
              <div className="text-[10px] uppercase tracking-wider opacity-80 mb-1 text-white">Pico do dia</div>
              <div className="text-2xl font-black tabular-nums leading-none text-white">{peakAudience ? peakAudience.total.toLocaleString("pt-BR") : "—"}</div>
              {peakAudience && (
                <div className="text-[10px] opacity-80 mt-1 text-white">
                  {new Date(peakAudience.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          </div>

          <div className="px-5 py-4">
            <div className="text-[11px] uppercase tracking-wider opacity-60 mb-2">Evolução ao longo do dia</div>
            <div className="w-full h-[300px] rounded-lg border border-white/10 p-2" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
              {audienceChartLoading ? (
                <div className="w-full h-full flex items-center justify-center text-white/60 text-sm">Carregando…</div>
              ) : audienceChart.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-white/50 text-sm">Sem dados registrados hoje.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={audienceChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradAudio" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#d70d0e" stopOpacity={0.85} />
                        <stop offset="100%" stopColor="#d70d0e" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="gradVideo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#ffffff" stopOpacity={0.03} />
                      </linearGradient>
                      <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#d70d0e" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="hora" stroke="rgba(255,255,255,0.6)" tick={{ fontSize: 11 }} />
                    <YAxis stroke="rgba(255,255,255,0.6)" tick={{ fontSize: 11 }} />
                    <RTooltip
                      contentStyle={{ backgroundColor: "#000", border: "1px solid #d70d0e", color: "#fff", borderRadius: 8 }}
                      labelStyle={{ color: "#ffffff", fontWeight: 700 }}
                      itemStyle={{ color: "#ffffff" }}
                    />
                    <Legend wrapperStyle={{ color: "#fff", fontSize: 12 }} />
                    <Area type="monotone" dataKey="audio" name="Áudio" stroke="#d70d0e" strokeWidth={2.5} fill="url(#gradAudio)" />
                    <Area type="monotone" dataKey="video" name="Vídeo" stroke="#ffffff" strokeWidth={2} fill="url(#gradVideo)" />
                    <Area type="monotone" dataKey="total" name="Total" stroke="#ffffff" strokeWidth={2} strokeDasharray="4 3" fill="none" />

                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedPromo} onOpenChange={(open) => { 
        if (!open) closePromoModal(); 
        else {
          // Reset scroll to top when opening the modal
          setTimeout(() => {
            if (modalScrollRef.current) {
              modalScrollRef.current.scrollTop = 0;
            }
          }, 0);
        }
      }}>
        <DialogContent className="promo-text-force-white border-zinc-800 text-white max-w-2xl w-[95vw] sm:w-full h-[85vh] sm:h-[80vh] overflow-hidden flex flex-col p-0 [&>button]:bg-white [&>button]:text-zinc-900 [&>button]:rounded-full [&>button]:w-9 [&>button]:h-9 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:shadow-lg [&>button]:hover:bg-red-500 [&>button]:hover:text-white [&>button]:transition-all [&>button]:top-3 [&>button]:right-3 [&>button_svg]:w-5 [&>button_svg]:h-5" style={{ backgroundColor: "#111111" }}>
          {/* Banner fixo no topo com padding */}
          {selectedPromo?.imagem_url && (
            <div className="flex-shrink-0 pt-4 px-4">
              <img src={selectedPromo.imagem_url} alt="Banner" className="w-full object-contain max-h-[220px] rounded-lg" />
            </div>
          )}

          {/* Período com ícone de calendário */}
          <div className="px-4 pt-2 text-xs flex items-center gap-1.5 flex-shrink-0" style={{ color: "rgba(255, 255, 255, 0.6)" }}>
            <Calendar size={12} />
            <span>Período: {selectedPromo?.data_inicio} a {selectedPromo?.data_fim}</span>
          </div>

          {/* Controles teleprompter - painel estilizado */}
          <div className="flex-shrink-0 px-4 pt-2">
            {renderTeleprompterControls("promo")}
          </div>

          {/* Corpo: texto + oferecimento dentro do scroll, alinhado ao X */}
          <div ref={modalScrollRef} className="overflow-y-auto flex-1 min-h-0 promo-scroll px-4 sm:px-6 pb-6 mr-[1px]">
            <div
              className="font-bold promo-html-content whitespace-pre-wrap ql-editor !p-0 break-words"
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.4, color: "white" }}
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize((selectedPromo?.texto || "")
                  .replace(/color:\s*(?:rgb\(\s*\d+[\s,]+\d+[\s,]+\d+\s*\)|#[0-9a-f]+)/gi, "color: white"), {
                  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'span', 'div', 'ul', 'ol', 'li'],
                  ALLOWED_ATTR: ['style', 'class']
                }),
              }}
            />

            {/* Oferecimento dentro do scroll, após o texto */}
            {selectedPromo?.oferecimento && selectedPromo.oferecimento !== "-" && (
              <div className="mt-6 pt-4 border-t border-white/10 text-center">
                <span className="text-sm uppercase tracking-wider" style={{ color: "rgba(255, 255, 255, 0.5)" }}>Oferecimento</span>
                <div
                  className="text-lg sm:text-xl font-bold mt-2 promo-html-content break-words"
                  style={{ color: "white" }}
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(selectedPromo.oferecimento
                      .replace(/\/\//g, "<br/>")
                      .replace(/color:\s*(?:rgb\(\s*\d+[\s,]+\d+[\s,]+\d+\s*\)|#[0-9a-f]+)/gi, "color: white"), {
                      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'span', 'div'],
                      ALLOWED_ATTR: ['style', 'class']
                    }),
                  }}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Programação */}
      <Dialog open={!!selectedProgram} onOpenChange={(open) => { 
        if (!open) closeProgramModal(); 
        else {
          // Reset scroll to top when opening the modal
          setTimeout(() => {
            if (programModalScrollRef.current) {
              programModalScrollRef.current.scrollTop = 0;
            }
          }, 0);
        }
      }}>
        <DialogContent className="border-zinc-800 text-white max-w-[1500px] w-[96vw] h-[88vh] sm:h-[86vh] overflow-hidden p-0 [&>button]:bg-white [&>button]:text-zinc-900 [&>button]:rounded-full [&>button]:w-12 [&>button]:h-12 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:shadow-[0_0_18px_rgba(255,255,255,0.35)] [&>button]:hover:bg-red-500 [&>button]:hover:text-white [&>button]:hover:shadow-[0_0_22px_rgba(239,68,68,0.55)] [&>button]:transition-all [&>button]:top-3 [&>button]:right-3 [&>button]:border-2 [&>button]:border-white/90 [&>button_svg]:w-6 [&>button_svg]:h-6" style={{ backgroundColor: "#111111" }}>
          {/* Botões de ajuste de fonte ao lado esquerdo do botão fechar */}
          <div className="absolute top-3 right-16 z-50 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFontSize(s => Math.max(12, s - 2))}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold hover:scale-110 transition shadow-[0_0_12px_rgba(0,0,0,0.4)]"
              style={{ backgroundColor: "var(--layout-accent-color, #a60101)" }}
              title="Diminuir texto"
            >
              <Minus size={18} />
            </button>
            <button
              type="button"
              onClick={() => setFontSize(s => Math.min(56, s + 2))}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold hover:scale-110 transition shadow-[0_0_12px_rgba(0,0,0,0.4)]"
              style={{ backgroundColor: "var(--layout-accent-color, #a60101)" }}
              title="Aumentar texto"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="flex flex-col flex-1 min-h-0 min-w-0 h-full">
              {/* Header com Logo e Horário */}
              <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-white/10 flex-shrink-0 gap-3" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                  <div className="flex items-center gap-4">
                    {selectedProgram?.capa && (
                      <div className="w-16 h-16 rounded-xl overflow-hidden shadow-lg border border-white/10">
                        <img src={selectedProgram.capa} alt={selectedProgram.nome} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex flex-col">
                      <h2 className="text-xl font-black tracking-tight" style={{ color: "white" }}>{selectedProgram?.nome}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock size={14} className="text-white/40" />
                        {selectedProgram?.schedules && selectedProgram.schedules.length > 0 ? (
                          selectedProgram.schedules.map((s, i) => (
                            <div key={i} className="text-sm font-bold" style={{ color: "rgba(255, 255, 255, 0.7)" }}>
                              {s.horarioInicio.slice(0, 5)} às {s.horarioFim.slice(0, 5)}
                              {s.dias.length > 0 && <span className="text-[10px] ml-1 opacity-50 font-normal">({s.dias.join(", ")})</span>}
                            </div>
                          ))
                        ) : (
                          <div className="text-sm font-bold" style={{ color: "rgba(255, 255, 255, 0.7)" }}>
                            {selectedProgram?.horarioInicio.slice(0, 5)} às {selectedProgram?.horarioFim.slice(0, 5)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
              </div>


              {/* Testemunhais com scroll, alinhado ao X */}
              <div ref={programModalScrollRef} className="overflow-y-auto flex-1 min-h-0 promo-scroll px-4 sm:px-8 pb-32 mr-[1px] flex flex-col items-center">
                {(() => {
                  const tests = selectedProgram ? getTestemunhaisForProgram(selectedProgram) : [];
                  if (tests.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center w-full">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                          <MessageSquareQuote size={22} style={{ color: "rgba(255,255,255,0.3)" }} />
                        </div>
                        <p className="text-sm" style={{ color: "rgba(255, 255, 255, 0.4)" }}>Nenhuma citação disponível para este programa.</p>
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-col w-full py-4">
                      {tests.map((t) => (
                        <div
                          key={t.id}
                          className="relative rounded-2xl overflow-hidden border border-white/10 shadow-xl w-full mb-12 last:mb-0"
                          style={{ backgroundColor: "#1a1a1a" }}
                        >
                          {/* Barra de destaque no topo */}
                          <div className="h-1 w-full" style={{ backgroundColor: (t as any).is_promo ? "#00BFF0" : "var(--layout-accent-color, #a60101)" }} />

                          <div className="p-6 sm:p-8">
                            {/* Imagem do testemunhal removida conforme solicitado */}

                            <div
                              className="max-w-none [&_*]:!bg-transparent [&_p]:!my-0 [&_p+p]:!mt-[0.6em] [&_p:empty]:!min-h-[0.9em] [&_p>br:only-child]:!block [&_ul]:!my-[0.6em] [&_ol]:!my-[0.6em] [&_li]:!mb-[0.25em] ql-editor !p-0 whitespace-pre-wrap break-words"
                              style={{ fontSize: `${fontSize}px`, lineHeight: 1.5, color: "white", wordBreak: "keep-all", overflowWrap: "anywhere", hyphens: "none" }}
                              dangerouslySetInnerHTML={{
                                __html: DOMPurify.sanitize(t.texto
                                  .replace(/color:\s*(?:rgb\(\s*\d+[\s,]+\d+[\s,]+\d+\s*\)|#[0-9a-f]+)/gi, "color: white")
                                  .replace(/background-color:\s*(?:transparent|rgb\(\s*\d+[\s,]+\d+[\s,]+\d+\s*\)|#[0-9a-f]+)/gi, "background-color: transparent")
                                  .replace(/font-size\s*:\s*[^;\"]+;?/gi, "")
                                  .replace(/line-height\s*:\s*[^;\"]+;?/gi, "")
                                  .replace(/margin-(?:top|bottom)\s*:\s*[^;\"]+;?/gi, ""), {
                                  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'span', 'div', 'ul', 'ol', 'li'],
                                  ALLOWED_ATTR: ['style', 'class']
                                }),
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

              </div>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
