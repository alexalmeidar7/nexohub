import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEmpresaConfig, type EmpresaConfig } from "@/components/ConfiguracoesPage";
import { findCurrentProgram } from "@/components/OnAirWidget";
import { ChevronLeft, ChevronRight, Clock, Radio, Globe, Instagram, Youtube, Phone, MessageCircle, Play, Pause, Facebook, X, Maximize, Minimize, Calendar } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getApresentadores } from "@/components/ApresentadorForm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";

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
  nome: string;
  apresentadorId: string;
  selo: string;
  capa: string;
  diasSemana: string[];
  horarioInicio: string;
  horarioFim: string;
  descricao: string;
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
  "SERTANEJO BOM DEMAIS",
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
    const load = async () => {
      const [empresaData, { data: promoData }, { data: progsData }, { data: testData }] = await Promise.all([
        getEmpresaConfig(),
        supabase.from("promocoes").select("*").order("data_inicio"),
        supabase.from("programas").select("*").eq("ativo", true),
        supabase.from("testemunhais").select("*"),
      ]);
      setConfig(empresaData);

      const today = new Date().toISOString().split("T")[0];
      const activePromos = (promoData || []).filter((p: any) => p.data_inicio <= today && p.data_fim >= today);
      setPromocoes(activePromos);
      setTestemunhais(testData || []);

      const mapped = (progsData || []).map((p: any) => ({
        id: p.id,
        nome: p.nome,
        apresentadorId: p.apresentador_id || "",
        selo: p.selo || "",
        capa: p.capa || "",
        diasSemana: p.dias_semana || [],
        horarioInicio: p.horario_inicio,
        horarioFim: p.horario_fim,
        descricao: p.descricao || "",
      }));
      setProgramas(mapped);

      const aprs = await getApresentadores();
      setApresentadores(aprs);
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

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

  const filteredPrograms = programas
    .filter(p => PROGRAMAS_VISIVEIS.some(name => p.nome.toUpperCase().includes(name)))
    .sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));

  const banners = promocoes.filter(p => p.imagem_url);
  const botoes = promocoes.filter(p => p.botao_url);

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

        const pixelsPerSecond = 15 + scrollSpeedRef.current * 1.8;
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

  const getTestemunhaisForProgram = (programId: string) => {
    const today = new Date().toISOString().split("T")[0];
    return testemunhais.filter(t => t.programa_id === programId && t.data_inicio <= today && t.data_fim >= today);
  };

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

  // Inline teleprompter controls renderer (not a component to avoid remount)
  const renderTeleprompterControls = (target: "promo" | "program") => (
    <div className="flex items-center gap-3 p-[15px] rounded-xl" style={{ backgroundColor: "#1b1b1d" }}>
      <button
        type="button"
        onClick={() => toggleAutoScroll(target)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-white hover:brightness-125 transition"
        style={{ backgroundColor: "#a60101" }}
      >
        {autoScrolling && activeScrollTarget === target ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="flex items-center gap-1">
        <Checkbox
          checked={autoPlay}
          onCheckedChange={(v) => handleAutoPlayChange(v === true)}
          className="border-white/40 data-[state=checked]:bg-[#a60101] data-[state=checked]:border-[#a60101]"
        />
        <span className="text-[10px] text-white/60">Auto</span>
      </div>
      <div className="flex items-center gap-2 flex-1 max-w-[180px]">
        <span className="text-[10px] text-white/50">Vel.</span>
        <Slider
          value={[scrollSpeed]}
          min={1}
          max={100}
          step={1}
          onValueChange={([v]) => setScrollSpeed(v)}
          className="flex-1 [&_[role=slider]]:h-5 [&_[role=slider]]:w-5 [&_[role=slider]]:cursor-grab [&_[role=slider]]:active:cursor-grabbing [&_[role=slider]]:bg-[#a60101] [&_[role=slider]]:border-[#a60101] [&_.relative]:bg-white/20 [&_[data-orientation=horizontal]>.absolute]:bg-[#a60101]"
        />
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <button type="button" onClick={() => setFontSize(s => Math.max(12, s - 2))} className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold hover:brightness-125 transition" style={{ backgroundColor: "#a60101" }}>A-</button>
        <button type="button" onClick={() => setFontSize(s => Math.min(56, s + 2))} className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold hover:brightness-125 transition" style={{ backgroundColor: "#a60101" }}>A+</button>
      </div>
    </div>
  );

  return (
    <div className="text-white min-h-screen p-8 flex flex-col items-center" style={{ background: "url('/images/kiosk-bg.png') center center / cover no-repeat fixed", backgroundColor: "#000" }}>
      <style>{`
        .no-scrollbar::-webkit-scrollbar{display:none}
        .no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
        .promo-scroll::-webkit-scrollbar{width:10px}
        .promo-scroll::-webkit-scrollbar-track{background:#a60101;border-radius:5px}
        .promo-scroll::-webkit-scrollbar-thumb{background:white;border-radius:5px}
        .promo-scroll::-webkit-scrollbar-button{display:block;height:10px;background:white;border-radius:2px}
        .promo-scroll{scrollbar-width:thin;scrollbar-color:white #a60101}
      `}</style>

      <div className="w-full max-w-[1000px] flex flex-col gap-6">

        {/* Header */}
        <div className="flex justify-between items-center w-full px-2">
          <div className="flex items-center gap-3">
            <Radio size={16} style={{ color: "#be0101" }} className="animate-pulse" />
            <div>
              <span className="font-bold uppercase tracking-widest text-xs" style={{ color: "#be0101" }}>No Ar</span>
              <p className="text-white text-sm font-semibold truncate max-w-[300px]">
                {onAirProgram?.nome || "Programação Musical"}
              </p>
              {onAirProgram && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-white/60 text-[10px]">
                    {onAirProgram.horarioInicio.slice(0, 5)} às {onAirProgram.horarioFim.slice(0, 5)}
                  </span>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ width: 160, backgroundColor: "#d70d0e" }}>
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${onAirProgram.progress}%`, backgroundColor: "#ffffff" }}
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
                  <div className="w-14 h-14 rounded-full overflow-hidden" style={{ backgroundColor: "#d70d0e" }}>
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
                    <TooltipTrigger><Globe size={14} className="text-white cursor-pointer" /></TooltipTrigger>
                    <TooltipContent><p>{config.site}</p></TooltipContent>
                  </Tooltip>
                )}
                {config.instagram && (
                  <Tooltip>
                    <TooltipTrigger><Instagram size={14} className="text-white cursor-pointer" /></TooltipTrigger>
                    <TooltipContent><p>{config.instagram}</p></TooltipContent>
                  </Tooltip>
                )}
                {config.youtube && (
                  <Tooltip>
                    <TooltipTrigger><Youtube size={14} className="text-white cursor-pointer" /></TooltipTrigger>
                    <TooltipContent><p>{config.youtube}</p></TooltipContent>
                  </Tooltip>
                )}
                {config.facebook && (
                  <Tooltip>
                    <TooltipTrigger><Facebook size={14} className="text-white cursor-pointer" /></TooltipTrigger>
                    <TooltipContent><p>{config.facebook}</p></TooltipContent>
                  </Tooltip>
                )}

                {/* Telefones */}
                {config.telefoneParticipacao && (
                  <div className="flex flex-col items-center ml-2">
                    <div className="flex items-center gap-1">
                      <MessageCircle size={15} style={{ color: "#FF0000" }} />
                      <span className="font-bold text-[16px] text-white">{config.telefoneParticipacao}</span>
                    </div>
                    <span className="text-xs" style={{ color: "#FF0000" }}>whatsapp ouvinte</span>
                  </div>
                )}
                {config.telefoneComercial && (
                  <div className="flex flex-col items-center ml-2">
                    <div className="flex items-center gap-1">
                      <Phone size={15} style={{ color: "#FF0000" }} />
                      <span className="font-bold text-[16px] text-white">{config.telefoneComercial}</span>
                    </div>
                    <span className="text-xs" style={{ color: "#FF0000" }}>telefone comercial</span>
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

        {/* Banner with slide animation */}
        <div className="w-full overflow-hidden rounded-xl shadow-2xl relative">
          {banners.length > 0 ? (
            <div className="relative w-full overflow-hidden">
              <div
                className="flex transition-transform duration-700 ease-in-out"
                style={{ transform: `translateX(-${currentBannerIndex * 100}%)` }}
              >
                {banners.map((banner) => (
                  <div key={banner.id} className="w-full flex-shrink-0">
                    <img src={banner.imagem_url} alt={banner.texto} className="w-full h-auto object-contain" />
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

        {/* Programação - sem título */}
        {filteredPrograms.length > 0 && (
          <div className="relative group">
            <div onMouseEnter={() => startScroll(scrollRef, "left")} onMouseLeave={stopScroll} className="absolute left-[-45px] top-1/2 -translate-y-1/2 p-2 cursor-pointer opacity-30 hover:opacity-100 transition-opacity z-10">
              <ChevronLeft size={36} />
            </div>
            <div onMouseEnter={() => startScroll(scrollRef, "right")} onMouseLeave={stopScroll} className="absolute right-[-45px] top-1/2 -translate-y-1/2 p-2 cursor-pointer opacity-30 hover:opacity-100 transition-opacity z-10">
              <ChevronRight size={36} />
            </div>

            <div ref={scrollRef} className="flex gap-4 overflow-x-auto scroll-smooth no-scrollbar">
              {filteredPrograms.map(prog => (
                <div
                  key={prog.id}
                  className="min-w-[230px] relative rounded-lg overflow-hidden flex-shrink-0 cursor-pointer hover:opacity-70 transition-opacity"
                  onClick={() => setSelectedProgram(prog)}
                >
                  {prog.capa ? (
                    <img src={prog.capa} alt={prog.nome} className="w-full h-auto object-contain" />
                  ) : (
                    <div className="w-full h-[300px] bg-zinc-800 flex items-center justify-center">
                      <Clock size={24} className="text-zinc-600" />
                    </div>
                  )}
                  <div className="absolute bottom-1 left-0 right-0 text-center">
                    <span className="text-[10px] font-bold text-white drop-shadow-lg bg-black/50 px-1.5 py-0.5 rounded">
                      {prog.horarioInicio.slice(0, 5)} - {prog.horarioFim.slice(0, 5)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Promoções */}
        {botoes.length > 0 && (
          <div className="relative group">
            <h2 className="text-lg font-bold mb-4">Promoções</h2>
            <div onMouseEnter={() => startScroll(promoScrollRef, "left")} onMouseLeave={stopScroll} className="absolute left-[-45px] top-1/2 -translate-y-1/2 p-2 cursor-pointer opacity-30 hover:opacity-100 transition-opacity z-10">
              <ChevronLeft size={36} />
            </div>
            <div onMouseEnter={() => startScroll(promoScrollRef, "right")} onMouseLeave={stopScroll} className="absolute right-[-45px] top-1/2 -translate-y-1/2 p-2 cursor-pointer opacity-30 hover:opacity-100 transition-opacity z-10">
              <ChevronRight size={36} />
            </div>

            <div ref={promoScrollRef} className="flex gap-4 overflow-x-auto scroll-smooth no-scrollbar">
              {botoes.map(promo => (
                <div
                  key={promo.id}
                  className="flex-shrink-0 cursor-pointer hover:opacity-70 transition-opacity"
                  onClick={() => setSelectedPromo(promo)}
                >
                  <img src={promo.botao_url} alt={promo.texto} className="h-auto w-auto object-contain rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal da Promoção */}
      <Dialog open={!!selectedPromo} onOpenChange={(open) => { if (!open) closePromoModal(); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl h-[80vh] overflow-hidden flex flex-col p-0 [&>button]:hover:text-red-600 [&>button]:transition-colors">
          {/* Banner fixo no topo com padding */}
          {selectedPromo?.imagem_url && (
            <div className="flex-shrink-0 pt-4 px-4">
              <img src={selectedPromo.imagem_url} alt="Banner" className="w-full object-contain max-h-[220px] rounded-lg" />
            </div>
          )}

          {/* Período com ícone de calendário */}
          <div className="px-4 pt-2 text-xs text-white/60 flex items-center gap-1.5 flex-shrink-0">
            <Calendar size={12} />
            <span>Período: {selectedPromo?.data_inicio} a {selectedPromo?.data_fim}</span>
          </div>

          {/* Controles teleprompter - painel estilizado */}
          <div className="flex-shrink-0 px-4 pt-2">
            {renderTeleprompterControls("promo")}
          </div>

          {/* Corpo: texto + oferecimento dentro do scroll, alinhado ao X */}
          <div ref={modalScrollRef} className="overflow-y-auto flex-1 min-h-0 promo-scroll px-4 pb-4 mr-[1px]">
            <div className="text-white font-bold whitespace-pre-line" style={{ fontSize: `${fontSize}px` }}>
              {selectedPromo?.texto?.replace(/\/\//g, "\n").split("\n").map((line, i) => (
                <p
                  key={i}
                  className="px-1 py-0.5 rounded transition-colors cursor-default"
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#a30101")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {line ? renderBoldMarkdown(line) : "\u00A0"}
                </p>
              ))}
            </div>

            {/* Oferecimento dentro do scroll, após o texto */}
            {selectedPromo?.oferecimento && selectedPromo.oferecimento !== "-" && (
              <div className="mt-6 pt-4 border-t border-white/10 text-center">
              <span className="text-white/50 text-sm uppercase tracking-wider">Oferecimento</span>
                <p className="text-white text-xl font-bold mt-2">{selectedPromo.oferecimento.replace(/\/\//g, "\n").split("\n").map((line, i) => (
                  <span key={i}>{line}{i < selectedPromo.oferecimento.replace(/\/\//g, "\n").split("\n").length - 1 && <br />}</span>
                ))}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Programação */}
      <Dialog open={!!selectedProgram} onOpenChange={(open) => { if (!open) closeProgramModal(); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-4xl h-[80vh] overflow-hidden p-0 [&>button]:hover:text-red-600 [&>button]:transition-colors">
          <div className="flex flex-col flex-1 min-h-0 min-w-0 h-full">
              {/* Horário em destaque */}
              <div className="px-4 pt-4 pb-1 flex-shrink-0">
                <div className="text-lg font-bold text-white">
                  {selectedProgram?.horarioInicio.slice(0, 5)} às {selectedProgram?.horarioFim.slice(0, 5)}
                </div>
                {selectedProgram?.diasSemana && selectedProgram.diasSemana.length > 0 && (
                  <div className="text-xs text-white/60 mt-0.5">
                    {selectedProgram.diasSemana.join(", ")}
                  </div>
                )}
              </div>

              {/* Rótulo Citações */}
              <div className="px-4 py-1 flex-shrink-0">
                <span className="text-sm font-bold" style={{ color: "#FF0000" }}>Citações</span>
              </div>

              {/* Controles teleprompter - painel estilizado */}
              <div className="flex-shrink-0 px-4 pt-1 pb-2">
                {renderTeleprompterControls("program")}
              </div>

              {/* Testemunhais com scroll, alinhado ao X */}
              <div ref={programModalScrollRef} className="overflow-y-auto flex-1 min-h-0 promo-scroll px-4 pb-4 mr-[1px]">
                {(() => {
                  const tests = selectedProgram ? getTestemunhaisForProgram(selectedProgram.id) : [];
                  if (tests.length === 0) {
                    return <p className="text-white/40 text-sm">Nenhum conteúdo disponível.</p>;
                  }
                  return tests.map(t => (
                    <div key={t.id} className="mb-4">
                      {t.imagem_url && (
                        <img src={t.imagem_url} alt="" className="w-full rounded-lg mb-2 object-contain max-h-[200px]" />
                      )}
                      <div className="text-white whitespace-pre-line" style={{ fontSize: `${fontSize}px` }}>
                        {t.texto.replace(/\/\//g, "\n").split("\n").map((line, i) => (
                          <p
                            key={i}
                            className="px-1 py-0.5 rounded transition-colors cursor-default"
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#a30101")}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                          >
                            {line ? renderBoldMarkdown(line) : "\u00A0"}
                          </p>
                        ))}
                      </div>
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
