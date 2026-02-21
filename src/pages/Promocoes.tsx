import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEmpresaConfig, type EmpresaConfig } from "@/components/ConfiguracoesPage";
import { findCurrentProgram } from "@/components/OnAirWidget";
import { ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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
  const [onAirProgram, setOnAirProgram] = useState<{ nome: string; horarioInicio: string; horarioFim: string } | null>(null);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [selectedPromo, setSelectedPromo] = useState<Promocao | null>(null);
  const [fontSize, setFontSize] = useState(14);
  const scrollRef = useRef<HTMLDivElement>(null);
  const promoScrollRef = useRef<HTMLDivElement>(null);

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

  const sideScroll = (ref: React.RefObject<HTMLDivElement>, direction: "left" | "right") => {
    const el = ref.current;
    if (el) {
      el.scrollBy({ left: direction === "left" ? -300 : 300, behavior: "smooth" });
    }
  };

  return (
    <div className="bg-black text-white min-h-screen p-8 flex flex-col items-center">
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>

      <div className="w-full max-w-[1000px] flex flex-col gap-6">

        {/* Header */}
        <div className="flex justify-between items-center w-full px-2">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
            </span>
            <div>
              <span className="font-bold uppercase tracking-widest text-xs text-red-500">No Ar</span>
              <p className="text-white/80 text-sm truncate max-w-[300px]">
                {onAirProgram?.nome || "Programação Musical"}
              </p>
              {onAirProgram && (
                <p className="text-white/50 text-[10px]">
                  {onAirProgram.horarioInicio.slice(0, 5)} às {onAirProgram.horarioFim.slice(0, 5)}
                </p>
              )}
            </div>
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
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {banners.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentBannerIndex(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentBannerIndex ? "bg-red-600 scale-125" : "bg-white/40"}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Programação */}
        {filteredPrograms.length > 0 && (
          <div className="relative group">
            <h2 className="text-lg font-bold mb-4">Programação</h2>
            <div onMouseEnter={() => sideScroll(scrollRef, "left")} className="absolute left-[-45px] top-1/2 -translate-y-1/2 p-2 cursor-pointer opacity-30 hover:opacity-100 transition-opacity z-10">
              <ChevronLeft size={36} />
            </div>
            <div onMouseEnter={() => sideScroll(scrollRef, "right")} className="absolute right-[-45px] top-1/2 -translate-y-1/2 p-2 cursor-pointer opacity-30 hover:opacity-100 transition-opacity z-10">
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
            <div onMouseEnter={() => sideScroll(promoScrollRef, "left")} className="absolute left-[-45px] top-1/2 -translate-y-1/2 p-2 cursor-pointer opacity-30 hover:opacity-100 transition-opacity z-10">
              <ChevronLeft size={36} />
            </div>
            <div onMouseEnter={() => sideScroll(promoScrollRef, "right")} className="absolute right-[-45px] top-1/2 -translate-y-1/2 p-2 cursor-pointer opacity-30 hover:opacity-100 transition-opacity z-10">
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
      <Dialog open={!!selectedPromo} onOpenChange={(open) => { if (!open) { setSelectedPromo(null); setFontSize(14); } }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">{selectedPromo?.texto?.split("\n")[0] || "Promoção"}</DialogTitle>
          </DialogHeader>

          {selectedPromo?.imagem_url && (
            <img src={selectedPromo.imagem_url} alt="Banner" className="w-full rounded-lg object-contain max-h-[300px]" />
          )}

          {/* Controle de font */}
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => setFontSize(s => Math.max(10, s - 2))} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold">A-</button>
            <button onClick={() => setFontSize(s => Math.min(24, s + 2))} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold">A+</button>
          </div>

          {/* Descrição */}
          <div className="text-white font-bold whitespace-pre-line max-h-[250px] overflow-y-auto" style={{ fontSize }}>
            {selectedPromo?.texto}
          </div>

          {/* Oferecimento */}
          {selectedPromo?.oferecimento && selectedPromo.oferecimento !== "-" && (
            <div className="text-white/50 text-xs border-t border-zinc-800 pt-3">
              <span className="text-white/70 font-semibold">Oferecimento:</span> {selectedPromo.oferecimento}
            </div>
          )}

          {/* Período */}
          <div className="text-white/40 text-xs">
            Período: {selectedPromo?.data_inicio} a {selectedPromo?.data_fim}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
