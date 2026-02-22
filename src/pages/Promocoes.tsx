import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEmpresaConfig, type EmpresaConfig } from "@/components/ConfiguracoesPage";
import { findCurrentProgram } from "@/components/OnAirWidget";
import { ChevronLeft, ChevronRight, Clock, Radio, Globe, Instagram, Youtube, Phone, MessageCircle, Play, Pause, Facebook, X, Maximize, Minimize, Calendar } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getApresentadores } from "@/components/ApresentadorForm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

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
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem("kiosk-font-size");
    return saved ? Number(saved) : 24;
  });
  const [scrollSpeed, setScrollSpeed] = useState(() => {
    const saved = localStorage.getItem("promo-scroll-speed");
    return saved ? Number(saved) : 30;
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const promoScrollRef = useRef<HTMLDivElement>(null);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const programModalScrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [autoScrolling, setAutoScrolling] = useState(false);
  const [activeScrollTarget, setActiveScrollTarget] = useState<"promo" | "program">("promo");
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

  useEffect(() => {
    if (autoScrolling && autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      const ref = getActiveScrollRef();
      autoScrollRef.current = setInterval(() => {
        ref.current?.scrollBy({ top: 1 });
      }, scrollSpeed);
    }
  }, [scrollSpeed, autoScrolling, getActiveScrollRef]);

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

  const toggleAutoScroll = (target: "promo" | "program") => {
    if (autoScrolling) {
      if (autoScrollRef.current) { clearInterval(autoScrollRef.current); autoScrollRef.current = null; }
      setAutoScrolling(false);
    } else {
      setActiveScrollTarget(target);
      const ref = target === "promo" ? modalScrollRef : programModalScrollRef;
      autoScrollRef.current = setInterval(() => {
        ref.current?.scrollBy({ top: 1 });
      }, scrollSpeed);
      setAutoScrolling(true);
    }
  };

  const closePromoModal = () => {
    setSelectedPromo(null);
    setAutoScrolling(false);
    if (autoScrollRef.current) { clearInterval(autoScrollRef.current); autoScrollRef.current = null; }
  };

  const closeProgramModal = () => {
    setSelectedProgram(null);
    setAutoScrolling(false);
    if (autoScrollRef.current) { clearInterval(autoScrollRef.current); autoScrollRef.current = null; }
  };

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

  // Shared teleprompter controls component
  const TeleprompterControls = ({ target }: { target: "promo" | "program" }) => (
    <div className="flex items-center gap-3 px-4 py-1">
      <button onClick={() => toggleAutoScroll(target)} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center">
        {autoScrolling && activeScrollTarget === target ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <div className="flex items-center gap-2 flex-1 max-w-[200px]">
        <span className="text-[10px] text-white/50">Vel.</span>
        <Slider
          value={[60 - scrollSpeed]}
          min={10}
          max={55}
          step={5}
          onValueChange={([v]) => setScrollSpeed(60 - v)}
          className="flex-1"
        />
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <button onClick={() => setFontSize(s => Math.max(12, s - 2))} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold">A-</button>
        <button onClick={() => setFontSize(s => Math.min(48, s + 2))} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold">A+</button>
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
          {/* Banner fixo */}
          {selectedPromo?.imagem_url && (
            <img src={selectedPromo.imagem_url} alt="Banner" className="w-full object-contain max-h-[250px] flex-shrink-0" />
          )}

          {/* Período com ícone de calendário */}
          <div className="px-4 pt-2 text-xs text-white/60 flex items-center gap-1.5 flex-shrink-0">
            <Calendar size={12} />
            <span>Período: {selectedPromo?.data_inicio} a {selectedPromo?.data_fim}</span>
          </div>

          {/* Controles teleprompter */}
          <div className="flex-shrink-0">
            <TeleprompterControls target="promo" />
          </div>

          {/* Corpo: texto + oferecimento dentro do scroll */}
          <div ref={modalScrollRef} className="overflow-y-auto flex-1 min-h-0 promo-scroll px-4 pb-4">
            <div className="text-white font-bold whitespace-pre-line" style={{ fontSize }}>
              {selectedPromo?.texto?.split("\n").map((line, i) => (
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
                <span className="text-white/50 text-xs uppercase tracking-wider">Oferecimento</span>
                <p className="text-white text-sm font-semibold mt-1">{selectedPromo.oferecimento}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Programação */}
      <Dialog open={!!selectedProgram} onOpenChange={(open) => { if (!open) closeProgramModal(); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-3xl h-[80vh] overflow-hidden flex flex-col p-0 [&>button]:hover:text-red-600 [&>button]:transition-colors">
          <div className="flex flex-col md:flex-row flex-1 min-h-0">
            {/* Coluna esquerda: capa com object-contain */}
            {selectedProgram?.capa && (
              <div className="md:w-1/2 flex-shrink-0 bg-black flex items-center justify-center">
                <img src={selectedProgram.capa} alt={selectedProgram.nome} className="w-full h-full object-contain" />
              </div>
            )}

            {/* Coluna direita: info + conteúdo */}
            <div className="flex flex-col flex-1 min-h-0">
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

              {/* Controles teleprompter */}
              <div className="flex-shrink-0">
                <TeleprompterControls target="program" />
              </div>

              {/* Testemunhais com scroll */}
              <div ref={programModalScrollRef} className="overflow-y-auto flex-1 min-h-0 promo-scroll px-4 pb-4">
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
                      <div className="text-white whitespace-pre-line" style={{ fontSize }}>
                        {t.texto.split("\n").map((line, i) => (
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
