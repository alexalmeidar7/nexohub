import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEmpresaConfig, type EmpresaConfig } from "@/components/ConfiguracoesPage";
import { findCurrentProgram } from "@/components/OnAirWidget";
import { ChevronLeft, ChevronRight, Clock, Radio, Globe, Instagram, Youtube, Phone, MessageCircle, Play, Pause } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getApresentadores } from "@/components/ApresentadorForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

export default function PromocoesKiosk() {
  const [promocoes, setPromocoes] = useState<Promocao[]>([]);
  const [config, setConfig] = useState<EmpresaConfig>({} as EmpresaConfig);
  const [programas, setProgramas] = useState<ProgramaGrade[]>([]);
  const [onAirProgram, setOnAirProgram] = useState<{ nome: string; horarioInicio: string; horarioFim: string; progress: number; apresentadorId: string } | null>(null);
  const [apresentadores, setApresentadores] = useState<any[]>([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [selectedPromo, setSelectedPromo] = useState<Promocao | null>(null);
  const [fontSize, setFontSize] = useState(14);
  const scrollRef = useRef<HTMLDivElement>(null);
  const promoScrollRef = useRef<HTMLDivElement>(null);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [autoScrolling, setAutoScrolling] = useState(false);
  useEffect(() => {
    const load = async () => {
      const [empresaData, { data: promoData }, { data: progsData }] = await Promise.all([
        getEmpresaConfig(),
        supabase.from("promocoes").select("*").order("data_inicio"),
        supabase.from("programas").select("*").eq("ativo", true),
      ]);
      setConfig(empresaData);

      const today = new Date().toISOString().split("T")[0];
      const activePromos = (promoData || []).filter((p: any) => p.data_inicio <= today && p.data_fim >= today);
      setPromocoes(activePromos);

      const mapped = (progsData || []).map((p: any) => ({
        id: p.id,
        nome: p.nome,
        apresentadorId: p.apresentador_id || "",
        selo: p.selo || "",
        capa: p.capa || "",
        diasSemana: p.dias_semana || [],
        horarioInicio: p.horario_inicio,
        horarioFim: p.horario_fim,
      }));
      setProgramas(mapped);

      const aprs = await getApresentadores();
      setApresentadores(aprs);
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const banners = promocoes.filter(p => p.imagem_url);
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentBannerIndex(prev => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [promocoes]);

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

  return (
    <div className="text-white min-h-screen p-8 flex flex-col items-center" style={{ background: "url('/images/kiosk-bg.png') center center / cover no-repeat fixed", backgroundColor: "#000" }}>
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>

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
                    <TooltipTrigger><Globe size={14} className="text-white cursor-pointer" /></TooltipTrigger>
                    <TooltipContent><p>{config.facebook}</p></TooltipContent>
                  </Tooltip>
                )}
              {config.telefoneParticipacao && (
                <div className="flex items-center gap-1 font-bold text-[16px]" style={{ color: "#d70d0e" }}>
                  <MessageCircle size={15} />
                  <span>{config.telefoneParticipacao}</span>
                </div>
              )}
              {config.telefoneComercial && (
                <div className="flex items-center gap-1 font-bold text-[16px]" style={{ color: "#d70d0e" }}>
                  <Phone size={15} />
                  <span>{config.telefoneComercial}</span>
                </div>
              )}
              </div>
            </TooltipProvider>
          </div>

          {config.logo && (
            <img src={config.logo} alt={config.nome} className="h-[90px] w-auto object-contain" />
          )}
        </div>

        {/* Banner */}
        <div className="w-full overflow-hidden rounded-xl shadow-2xl relative">
          {banners.length > 0 ? (
            banners.map((banner, index) => (
              <div
                key={banner.id}
                className="w-full transition-opacity duration-1000"
                style={{ opacity: index === currentBannerIndex ? 1 : 0, display: index === currentBannerIndex ? "block" : "none" }}
              >
                <img src={banner.imagem_url} alt={banner.texto} className="w-full h-auto object-contain" />
              </div>
            ))
          ) : (
            <div className="h-[200px] flex items-center justify-center text-white/30">Nenhum banner ativo</div>
          )}

          {banners.length > 1 && (
            <>
              <button
                onClick={() => setCurrentBannerIndex(prev => (prev - 1 + banners.length) % banners.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center z-10 transition-opacity"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => setCurrentBannerIndex(prev => (prev + 1) % banners.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center z-10 transition-opacity"
              >
                <ChevronRight size={20} />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {banners.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentBannerIndex(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentBannerIndex ? "bg-red-600 scale-125" : "bg-white/40"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Programação */}
        {filteredPrograms.length > 0 && (
          <div className="relative group">
            <h2 className="text-lg font-bold mb-4">Programação</h2>
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
      <Dialog open={!!selectedPromo} onOpenChange={(open) => {
        if (!open) {
          setSelectedPromo(null);
          setFontSize(14);
          setAutoScrolling(false);
          if (autoScrollRef.current) { clearInterval(autoScrollRef.current); autoScrollRef.current = null; }
        }
      }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xs text-white/60">
              Período: {selectedPromo?.data_inicio} a {selectedPromo?.data_fim}
            </DialogTitle>
          </DialogHeader>

          {selectedPromo?.imagem_url && (
            <img src={selectedPromo.imagem_url} alt="Banner" className="w-full rounded-lg object-contain max-h-[300px]" />
          )}

          {/* Controle de font + auto scroll */}
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => {
                if (autoScrolling) {
                  if (autoScrollRef.current) { clearInterval(autoScrollRef.current); autoScrollRef.current = null; }
                  setAutoScrolling(false);
                } else {
                  autoScrollRef.current = setInterval(() => {
                    modalScrollRef.current?.scrollBy({ top: 1 });
                  }, 30);
                  setAutoScrolling(true);
                }
              }}
              className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center"
            >
              {autoScrolling ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <button onClick={() => setFontSize(s => Math.max(10, s - 2))} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold">A-</button>
            <button onClick={() => setFontSize(s => Math.min(24, s + 2))} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold">A+</button>
          </div>

          {/* Descrição com scroll */}
          <div ref={modalScrollRef} className="overflow-y-auto flex-1 min-h-0">
            <div className="text-white font-bold whitespace-pre-line" style={{ fontSize }}>
              {selectedPromo?.texto?.split("\n").map((line, i) => (
                <p
                  key={i}
                  className="px-1 py-0.5 rounded transition-colors"
                  style={{ cursor: "default" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#a30101")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {line || "\u00A0"}
                </p>
              ))}
            </div>
          </div>

          {/* Oferecimento fixo */}
          {selectedPromo?.oferecimento && selectedPromo.oferecimento !== "-" && (
            <div className="text-white text-xs border-t border-zinc-800 pt-3">
              <span className="font-semibold">Oferecimento:</span> {selectedPromo.oferecimento}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
