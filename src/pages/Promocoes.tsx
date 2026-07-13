import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Navigate } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";
import { supabase } from "@/integrations/supabase/client";
import { getEmpresaConfig, type EmpresaConfig } from "@/components/ConfiguracoesPage";
import { findCurrentProgram } from "@/components/OnAirWidget";
import { ChevronLeft, ChevronRight, Clock, Radio, Globe, Instagram, Youtube, Phone, MessageCircle, Play, Pause, Facebook, X, Maximize, Minimize, Calendar, ImageIcon, Gift, Pizza, Truck, Star, Trophy, Music, Heart, Sparkles, Beer, ShoppingBag, Ticket, Megaphone, PartyPopper } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import PromoSkeleton from "@/components/skeletons/PromoSkeleton";
import { getApresentadores } from "@/components/ApresentadorForm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useLayoutColors } from "@/hooks/useLayoutColors";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { type TelaPromoConfig, defaultTelaPromoConfig, buildTelaPromoBgStyle } from "@/components/ConfigTelaPromoPage";

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
  programa_id: string;
  texto: string;
  data_inicio: string;
  data_fim: string;
  imagem_url: string | null;
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

export default function PromocoesKiosk() {
  usePageTitle("Promoções");
  useLayoutColors();
  const { userSlug } = useParams<{ userSlug?: string }>();
  // Guard against the literal ":userSlug" segment (happens when something
  // navigates to the route template without interpolating the param).
  const validSlug = userSlug && userSlug !== ":userSlug" ? userSlug : undefined;
  const isPublicMode = !!validSlug;
  if (userSlug === ":userSlug") {
    return <Navigate to="/telapromo" replace />;
  }
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [telaPromoConfig, setTelaPromoConfig] = useState<TelaPromoConfig>(defaultTelaPromoConfig);
  const [coverIndex, setCoverIndex] = useState<number | null>(null);
  const [coverSlideDir, setCoverSlideDir] = useState<"left" | "right">("right");

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
      }

      const today = new Date().toISOString().split("T")[0];
      const activePromos = (data.promocoes || []).filter((p: any) => 
        p.data_inicio && p.data_fim && p.data_inicio <= today && p.data_fim >= today
      );
      setPromocoes(activePromos);
      const activeTestemunhais = (data.testemunhais || []).filter((t: any) => 
        t.data_inicio && t.data_fim && t.data_inicio <= today && t.data_fim >= today
      );
      setTestemunhais(activeTestemunhais);

      if (data.tela_promo_config) {
        setTelaPromoConfig({ ...defaultTelaPromoConfig, ...data.tela_promo_config });
      }

      const mapped = (data.programas || []).map((p: any) => ({
        id: p.id, mergedIds: [p.id], nome: p.nome, apresentadorId: p.apresentador_id || "", selo: p.selo || "",
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
        supabase.from("user_settings").select("cenario_config").maybeSingle(),
      ]);
      setConfig(empresaData);

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

      const mapped = (progsData || []).map((p: any) => ({
        id: p.id, mergedIds: [p.id], nome: p.nome, apresentadorId: p.apresentador_id || "", selo: p.selo || "",
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

  useEffect(() => {
    const update = () => {
      const current = findCurrentProgram(programas as any);
      if (current) {
        setOnAirProgram({
          nome: current.programa.nome,
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

  const mergeProgramList = (list: ProgramaGrade[]) => Array.from(
    list
      .slice()
      .sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio))
      .reduce((map, programa) => {
        const dedupeKey = normalizeProgramName(programa.nome);
        const mergedIds = Array.from(new Set([...(programa.mergedIds || []), programa.id]));
        const existing = map.get(dedupeKey);
        if (!existing) {
          map.set(dedupeKey, { ...programa, mergedIds });
        } else {
          existing.mergedIds = Array.from(new Set([...existing.mergedIds, ...mergedIds]));
          existing.diasSemana = [...new Set([...existing.diasSemana, ...programa.diasSemana])];
          existing.schedules = [...existing.schedules, ...programa.schedules];
        }
        return map;
      }, new Map<string, ProgramaGrade>())
      .values(),
  );

  const todayDateStr = new Date().toISOString().split("T")[0];
  const programIdsWithTestemunhais = new Set(
    testemunhais
      .filter(t => 
        t.programa_id && 
        t.data_inicio && t.data_fim && 
        t.data_inicio <= todayDateStr && t.data_fim >= todayDateStr
      )
      .map(t => t.programa_id)
  );

  const filteredPrograms = mergeProgramList(
    programas.filter(p => programIdsWithTestemunhais.has(p.id))
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

    const hasOpenModal = !!selectedPromo || !!selectedProgram;
    if (!enabled || !hasOpenModal) return;

    autoPlayTimerRef.current = setTimeout(() => {
      if (selectedProgram) startAutoScroll("program");
      if (selectedPromo) startAutoScroll("promo");
    }, 3000);
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

  // Auto-play on modal open
  useEffect(() => {
    if (selectedPromo && autoPlay) {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = setTimeout(() => startAutoScroll("promo"), 3000);
    }

    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, [selectedPromo, autoPlay, startAutoScroll]);

  useEffect(() => {
    if (selectedProgram && autoPlay) {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = setTimeout(() => startAutoScroll("program"), 3000);
    }

    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, [selectedProgram, autoPlay, startAutoScroll]);

  const getTestemunhaisForProgram = (prog: ProgramaGrade) => {
    const today = new Date().toISOString().split("T")[0];
    const ids = new Set(prog.mergedIds);
    return testemunhais.filter(t => t.programa_id && ids.has(t.programa_id) && t.data_inicio <= today && t.data_fim >= today);
  };

  // Pré-carrega imagens do programa atual/anterior/próximo com debounce + cancelamento
  const preloadedUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const list = mergeProgramList(programas);
      if (!list.length) return;
      const onAirIdx = onAirProgram ? list.findIndex(p => p.nome === onAirProgram.nome) : -1;
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
      const pending: HTMLImageElement[] = [];
      urls.forEach(url => {
        if (cache.has(url)) return;
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        img.onload = img.onerror = () => cache.add(url);
        pending.push(img);
      });
      // Guarda handles para cancelamento caso o efeito seja limpo antes de terminar
      (timer as unknown as { pending?: HTMLImageElement[] }).pending = pending;
    }, 180);

    return () => {
      window.clearTimeout(timer);
      const pending = (timer as unknown as { pending?: HTMLImageElement[] }).pending;
      if (pending) {
        for (const img of pending) {
          if (!img.complete) {
            img.onload = null;
            img.onerror = null;
            img.src = ""; // aborta o download em navegadores modernos
          }
        }
      }
    };
  }, [coverIndex, onAirProgram, programas, testemunhais]);


  const ProgressCircle = ({ active, progress }: { active: boolean; progress: number }) => {
    const r = 5;
    const circumference = 2 * Math.PI * r;
    const dashoffset = circumference - (progress / 100) * circumference;
    if (!active) {
      return (
        <svg width="14" height="14" viewBox="0 0 14 14">
          <circle cx="7" cy="7" r={r} fill="white" />
        </svg>
      );
    }
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="7" cy="7" r={r} fill="none" stroke="white" strokeWidth="2" />
        <circle cx="7" cy="7" r={r} fill="none" stroke="#d70d0e" strokeWidth="2"
          strokeDasharray={circumference} strokeDashoffset={dashoffset}
          style={{ transition: "stroke-dashoffset 50ms linear" }}
        />
      </svg>
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
    <div className="flex items-center gap-3 p-[15px] rounded-xl" style={{ backgroundColor: "var(--layout-slider-bg, #1b1b1d)" }}>
      <button
        type="button"
        onClick={() => toggleAutoScroll(target)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-white hover:brightness-125 transition"
        style={{ backgroundColor: "var(--layout-accent-color, #a60101)" }}
      >
        {autoScrolling && activeScrollTarget === target ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="flex items-center gap-1">
        <Checkbox
          checked={autoPlay}
          onCheckedChange={(v) => handleAutoPlayChange(v === true)}
          className="border-white/40 data-[state=checked]:bg-[var(--layout-accent-color,#a60101)] data-[state=checked]:border-[var(--layout-accent-color,#a60101)]"
        />
        <span className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #ffffff) 60%, transparent)" }}>Auto</span>
      </div>
      <div className="flex items-center gap-2 flex-1 max-w-[180px]">
        <span className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #ffffff) 50%, transparent)" }}>Vel.</span>
        <Slider
          value={[scrollSpeed]}
          min={1}
          max={100}
          step={1}
          onValueChange={([v]) => setScrollSpeed(v)}
          className="flex-1 [&_[role=slider]]:h-5 [&_[role=slider]]:w-5 [&_[role=slider]]:cursor-grab [&_[role=slider]]:active:cursor-grabbing [&_[role=slider]]:bg-[var(--layout-accent-color,#a60101)] [&_[role=slider]]:border-[var(--layout-accent-color,#a60101)] [&_.relative]:bg-white/20 [&_[data-orientation=horizontal]>.absolute]:bg-[var(--layout-accent-color,#a60101)]"
        />
        <span className="text-[9px] whitespace-nowrap" style={{ color: "color-mix(in srgb, var(--layout-page-text, #ffffff) 40%, transparent)" }}>espaço = play/pause</span>
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <button type="button" onClick={() => setFontSize(s => Math.max(12, s - 2))} className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold hover:brightness-125 transition" style={{ backgroundColor: "var(--layout-accent-color, #a60101)" }}>A-</button>
        <button type="button" onClick={() => setFontSize(s => Math.min(56, s + 2))} className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold hover:brightness-125 transition" style={{ backgroundColor: "var(--layout-accent-color, #a60101)" }}>A+</button>
      </div>
    </div>
  );

  if (loading) {
    return <PromoSkeleton />;
  }

  return (
    <div className="text-white min-h-screen p-8 flex flex-col items-center" style={{ ...buildTelaPromoBgStyle(telaPromoConfig), color: telaPromoConfig.header_text_color }}>
      <style>{`
        .no-scrollbar::-webkit-scrollbar{display:none}
        .no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
        .promo-scroll::-webkit-scrollbar{width:10px}
        .promo-scroll::-webkit-scrollbar-track{background:var(--layout-accent-color, #a60101);border-radius:5px}
        .promo-scroll::-webkit-scrollbar-thumb{background:white;border-radius:5px}
        .promo-scroll::-webkit-scrollbar-button{display:block;height:10px;background:white;border-radius:2px}
        .promo-scroll{scrollbar-width:thin;scrollbar-color:white var(--layout-accent-color, #a60101)}
        @keyframes pulse-border{0%,100%{box-shadow:0 0 0 3px rgba(251,216,55,1)}50%{box-shadow:0 0 0 3px rgba(251,216,55,0.2)}}
        .animate-pulse-border{animation:pulse-border 1.5s ease-in-out infinite}
      `}</style>

      <div className="w-full max-w-[1000px] flex flex-col gap-6">

        {/* Header */}
        <div className="flex justify-between items-center w-full px-2">
          <div className="flex items-center gap-3">
            <Radio size={16} style={{ color: "#ff0000" }} className="animate-pulse" />
            <div>
              <span className="font-bold uppercase tracking-widest text-xs" style={{ color: "var(--layout-header-text, #ffffff)" }}>No Ar</span>
              <p className="text-sm font-semibold truncate max-w-[300px]" style={{ color: "var(--layout-header-text, #ffffff)" }}>
                {onAirProgram?.nome || "Programação Musical"}
              </p>
              {onAirProgram && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-header-text, #ffffff) 60%, transparent)" }}>
                    {onAirProgram.horarioInicio.slice(0, 5)} às {onAirProgram.horarioFim.slice(0, 5)}
                  </span>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ width: 160, backgroundColor: "var(--layout-accent-color, #d70d0e)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${onAirProgram.progress}%`, backgroundColor: "var(--layout-header-text, #ffffff)" }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Presenter photo */}
            {(() => {
              const presenter = onAirProgram?.apresentadorId
                ? apresentadores.find(a => a.id === onAirProgram.apresentadorId)
                : null;
              return presenter?.foto ? (
                <div className="relative group/presenter ml-2">
                  <div className="w-14 h-14 rounded-full overflow-hidden" style={{ backgroundColor: "var(--layout-accent-color, #d70d0e)" }}>
                    <img src={presenter.foto} alt={presenter.nome} className="w-full h-full object-cover" />
                  </div>
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap opacity-0 group-hover/presenter:opacity-100 transition-opacity">
                    {presenter.nome}
                  </div>
                </div>
              ) : null;
            })()}

            {/* Contact info */}
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-3 ml-3">
                {config.site && (
                  <Tooltip>
                    <TooltipTrigger><Globe size={14} className="cursor-pointer" style={{ color: "var(--layout-header-text, #ffffff)" }} /></TooltipTrigger>
                    <TooltipContent><p>{config.site}</p></TooltipContent>
                  </Tooltip>
                )}
                {config.instagram && (
                  <Tooltip>
                    <TooltipTrigger><Instagram size={14} className="cursor-pointer" style={{ color: "var(--layout-header-text, #ffffff)" }} /></TooltipTrigger>
                    <TooltipContent><p>{config.instagram}</p></TooltipContent>
                  </Tooltip>
                )}
                {config.youtube && (
                  <Tooltip>
                    <TooltipTrigger><Youtube size={14} className="cursor-pointer" style={{ color: "var(--layout-header-text, #ffffff)" }} /></TooltipTrigger>
                    <TooltipContent><p>{config.youtube}</p></TooltipContent>
                  </Tooltip>
                )}
                {config.facebook && (
                  <Tooltip>
                    <TooltipTrigger><Facebook size={14} className="cursor-pointer" style={{ color: "var(--layout-header-text, #ffffff)" }} /></TooltipTrigger>
                    <TooltipContent><p>{config.facebook}</p></TooltipContent>
                  </Tooltip>
                )}

                {/* Telefones */}
                {config.telefoneParticipacao && (
                  <div className="flex flex-col items-center ml-2">
                    <div className="flex items-center gap-1">
                      <MessageCircle size={15} style={{ color: "var(--layout-header-text, #ffffff)" }} />
                      <span className="font-bold text-[16px]" style={{ color: "var(--layout-header-text, #ffffff)" }}>{config.telefoneParticipacao}</span>
                    </div>
                    <span className="text-xs" style={{ color: "var(--layout-header-text, #ffffff)" }}>whatsapp ouvinte</span>
                  </div>
                )}
                {config.telefoneComercial && (
                  <div className="flex flex-col items-center ml-2">
                    <div className="flex items-center gap-1">
                      <Phone size={15} style={{ color: "var(--layout-header-text, #ffffff)" }} />
                      <span className="font-bold text-[16px]" style={{ color: "var(--layout-header-text, #ffffff)" }}>{config.telefoneComercial}</span>
                    </div>
                    <span className="text-xs" style={{ color: "var(--layout-header-text, #ffffff)" }}>telefone comercial</span>
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

        {/* Banner rotativo + capa do programa no ar */}
        {(() => {
          // Programas ordenados pela grade (horário de início), deduplicados por nome
          const scheduleList = mergeProgramList(programas);
          const onAirIdx = onAirProgram
            ? scheduleList.findIndex(p => p.nome === onAirProgram.nome)
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
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 items-center">
                      {banners.map((_, i) => (
                        <button key={i} onClick={() => changeBanner(i)} className="cursor-pointer">
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
                  onClick={() => { if (currentProg) setSelectedProgram(currentProg); }}
                >
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

        {/* Programação - sem título */}
        {filteredPrograms.length > 0 && (
          <div className="relative group">
            <div onMouseEnter={() => startScroll(scrollRef, "left")} onMouseLeave={stopScroll} className="absolute left-[-45px] top-1/2 -translate-y-1/2 p-2 cursor-pointer opacity-30 hover:opacity-100 transition-opacity z-10">
              <ChevronLeft size={36} />
            </div>
            <div onMouseEnter={() => startScroll(scrollRef, "right")} onMouseLeave={stopScroll} className="absolute right-[-45px] top-1/2 -translate-y-1/2 p-2 cursor-pointer opacity-30 hover:opacity-100 transition-opacity z-10">
              <ChevronRight size={36} />
            </div>

            <div ref={scrollRef} className="flex gap-4 overflow-x-auto scroll-smooth no-scrollbar py-2 -my-2 px-1 -mx-1">
              {filteredPrograms.map(prog => (
                <div
                  key={prog.id}
                  className="w-[180px] h-[240px] relative rounded-lg overflow-hidden flex-shrink-0 cursor-pointer transition-all duration-200 outline-4 outline-transparent hover:scale-105"
                  onMouseEnter={e => { e.currentTarget.style.outline = `4px solid ${telaPromoConfig.card_border_color}`; }}
                  onMouseLeave={e => { e.currentTarget.style.outline = "4px solid transparent"; }}
                  onClick={() => setSelectedProgram(prog)}
                >
                  {prog.capa ? (
                    <img src={prog.capa} alt={prog.nome} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 w-full h-full bg-zinc-800 flex items-center justify-center">
                      <Clock size={24} className="text-zinc-600" />
                    </div>
                  )}
                  {onAirProgram?.nome === prog.nome && (
                    <span className="absolute top-2 left-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded" style={{ backgroundColor: "#fbd837", color: "#000" }}>
                      No Ar
                    </span>
                  )}
                  <div className="absolute bottom-1 left-0 right-0 text-center flex flex-col items-center gap-0.5">
                    {prog.schedules.map((s, i) => (
                      <span key={i} className="text-[10px] font-bold text-white drop-shadow-lg px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--layout-accent-color, rgba(0,0,0,0.5))" }}>
                        {s.horarioInicio.slice(0, 5)} - {s.horarioFim.slice(0, 5)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Promoções */}
        {botoes.length > 0 && (
          <div className="relative group">
            <h2 className="text-lg font-bold mb-4" style={{ color: "white" }}>Promoções</h2>
            <div onMouseEnter={() => startScroll(promoScrollRef, "left")} onMouseLeave={stopScroll} className="absolute left-[-45px] top-1/2 -translate-y-1/2 p-2 cursor-pointer opacity-30 hover:opacity-100 transition-opacity z-10">
              <ChevronLeft size={36} />
            </div>
            <div onMouseEnter={() => startScroll(promoScrollRef, "right")} onMouseLeave={stopScroll} className="absolute right-[-45px] top-1/2 -translate-y-1/2 p-2 cursor-pointer opacity-30 hover:opacity-100 transition-opacity z-10">
              <ChevronRight size={36} />
            </div>

            <div ref={promoScrollRef} className="flex gap-5 overflow-x-auto scroll-smooth no-scrollbar py-2 -my-2 px-1 -mx-1">
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
                    className="flex-shrink-0 cursor-pointer transition-all duration-200 flex items-center gap-3 px-6 py-3.5 font-bold text-sm outline-4 outline-transparent hover:scale-105 shadow-lg"
                    style={{
                      background: `linear-gradient(135deg, ${telaPromoConfig.btn_color_a} 0%, ${telaPromoConfig.btn_color_b} 100%)`,
                      color: telaPromoConfig.btn_text_color,
                      borderRadius: cardRadius,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.outline = `4px solid ${telaPromoConfig.card_border_color}`; }}
                    onMouseLeave={e => { e.currentTarget.style.outline = "4px solid transparent"; }}
                    onClick={() => setSelectedPromo(promo)}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.25)" }}>
                      <PromoIcon size={18} />
                    </div>
                    <span className="whitespace-nowrap">{promo.botao_url}</span>
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
      <Dialog open={!!selectedPromo} onOpenChange={(open) => { if (!open) closePromoModal(); }}>
        <DialogContent className="promo-text-force-white border-zinc-800 text-white max-w-2xl h-[80vh] overflow-hidden flex flex-col p-0 [&>button]:bg-white [&>button]:text-zinc-900 [&>button]:rounded-full [&>button]:w-9 [&>button]:h-9 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:shadow-lg [&>button]:hover:bg-red-500 [&>button]:hover:text-white [&>button]:transition-all [&>button]:top-3 [&>button]:right-3 [&>button_svg]:w-5 [&>button_svg]:h-5" style={{ backgroundColor: "#111111" }}>
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
          <div ref={modalScrollRef} className="overflow-y-auto flex-1 min-h-0 promo-scroll px-4 pb-4 mr-[1px]">
            <div
              className="font-bold promo-html-content"
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.4, color: "white" }}
              dangerouslySetInnerHTML={{
                __html: (selectedPromo?.texto || "")
                  .replace(/\/\//g, "<br/>")
                  .replace(/color:\s*rgb\(\s*0[\s,]+0[\s,]+0\s*\)/gi, "color: white")
                  .replace(/color:\s*#000(?:000)?/gi, "color: white"),
              }}
            />

            {/* Oferecimento dentro do scroll, após o texto */}
            {selectedPromo?.oferecimento && selectedPromo.oferecimento !== "-" && (
              <div className="mt-6 pt-4 border-t border-white/10 text-center">
                <span className="text-sm uppercase tracking-wider" style={{ color: "rgba(255, 255, 255, 0.5)" }}>Oferecimento</span>
                <div
                  className="text-xl font-bold mt-2 promo-html-content"
                  style={{ color: "white" }}
                  dangerouslySetInnerHTML={{
                    __html: selectedPromo.oferecimento
                      .replace(/\/\//g, "<br/>")
                      .replace(/color:\s*rgb\(\s*0[\s,]+0[\s,]+0\s*\)/gi, "color: white")
                      .replace(/color:\s*#000(?:000)?/gi, "color: white"),
                  }}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Programação */}
      <Dialog open={!!selectedProgram} onOpenChange={(open) => { if (!open) closeProgramModal(); }}>
        <DialogContent className="border-zinc-800 text-white max-w-4xl h-[80vh] overflow-hidden p-0 [&>button]:bg-white [&>button]:text-zinc-900 [&>button]:rounded-full [&>button]:w-9 [&>button]:h-9 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:shadow-lg [&>button]:hover:bg-red-500 [&>button]:hover:text-white [&>button]:transition-all [&>button]:top-3 [&>button]:right-3 [&>button_svg]:w-5 [&>button_svg]:h-5" style={{ backgroundColor: "#111111" }}>
          <div className="flex flex-col flex-1 min-h-0 min-w-0 h-full">
              {/* Horário em destaque */}
              <div className="px-4 pt-4 pb-1 flex-shrink-0">
                  {selectedProgram?.schedules && selectedProgram.schedules.length > 0 ? (
                    selectedProgram.schedules.map((s, i) => (
                      <div key={i} className="text-lg font-bold" style={{ color: "white" }}>
                        {s.horarioInicio.slice(0, 5)} às {s.horarioFim.slice(0, 5)}
                        {s.dias.length > 0 && <span className="text-xs ml-2 font-normal" style={{ color: "rgba(255, 255, 255, 0.6)" }}>{s.dias.join(", ")}</span>}
                      </div>
                    ))
                  ) : (
                    <div className="text-lg font-bold" style={{ color: "white" }}>
                      {selectedProgram?.horarioInicio.slice(0, 5)} às {selectedProgram?.horarioFim.slice(0, 5)}
                    </div>
                  )}
              </div>

              {/* Rótulo Citações */}
              <div className="px-4 py-1 flex-shrink-0">
                <span className="text-sm font-bold" style={{ color: "var(--layout-accent-color, #FF0000)" }}>Citações</span>
              </div>

              {/* Controles teleprompter - painel estilizado */}
              <div className="flex-shrink-0 px-4 pt-1 pb-2">
                {renderTeleprompterControls("program")}
              </div>

              {/* Testemunhais com scroll, alinhado ao X */}
              <div ref={programModalScrollRef} className="overflow-y-auto flex-1 min-h-0 promo-scroll px-4 pb-4 mr-[1px]">
                {(() => {
                  const tests = selectedProgram ? getTestemunhaisForProgram(selectedProgram) : [];
                  if (tests.length === 0) {
                    return <p className="text-sm" style={{ color: "rgba(255, 255, 255, 0.4)" }}>Nenhum conteúdo disponível.</p>;
                  }
                  return tests.map(t => (
                    <div key={t.id} className="mb-6 p-6 rounded-2xl shadow-xl border border-white/5" style={{ backgroundColor: "#1a1a1a" }}>
                      {t.imagem_url && (
                        <img src={t.imagem_url} alt="" className="w-full rounded-lg mb-4 object-contain max-h-[300px]" />
                      )}
                      <div
                        className="max-w-none leading-[1.35] [&_*]:!bg-transparent [&_*]:leading-[1.35] [&_p]:!my-0 [&_p+p]:!mt-2"
                        style={{ fontSize: `${fontSize}px`, lineHeight: 1.35, color: "white" }}
                        dangerouslySetInnerHTML={{
                          __html: t.texto
                            .replace(/\/\//g, "<br/>")
                            .replace(/color:\s*rgb\(\s*0[\s,]+0[\s,]+0\s*\)/gi, "color: white")
                            .replace(/color:\s*#000(?:000)?/gi, "color: white")
                            .replace(/background-color:\s*(?:transparent|rgb\(\s*\d+[\s,]+\d+[\s,]+\d+\s*\)|#[0-9a-f]+)/gi, "background-color: transparent")
                            .replace(/font-size\s*:\s*[^;\"]+;?/gi, "")
                            .replace(/line-height\s*:\s*[^;\"]+;?/gi, "")
                            .replace(/margin-(?:top|bottom)\s*:\s*[^;\"]+;?/gi, ""),
                        }}
                      />
                    </div>
                  ));
                })()}
              </div>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
