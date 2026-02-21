import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEmpresaConfig, type EmpresaConfig } from "@/components/ConfiguracoesPage";
import { findCurrentProgram } from "@/components/OnAirWidget";
import { getMusicData } from "@/components/MusicaNoAr";
import { ChevronLeft, ChevronRight, Clock, Calendar, ChevronDown, ChevronUp } from "lucide-react";

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
  descricao?: string;
}

const PROGRAMAS_VISIVEIS = [
  "SERTANEJO BOM DEMAIS 1ª EDIÇÃO",
  "PRIMEIRA HORA",
  "BOM DIA POSITIVA",
  "FLASHBACK POSITIVA",
  "WHATSAPP POSITIVA",
  "SERTANEJO BOM DEMAIS 2ª EDIÇÃO",
  "VALE NIGHT",
  "PALCO POSITIVA",
];

export default function PromocoesKiosk() {
  const [promocoes, setPromocoes] = useState<Promocao[]>([]);
  const [config, setConfig] = useState<EmpresaConfig>({} as EmpresaConfig);
  const [programas, setProgramas] = useState<ProgramaGrade[]>([]);
  const [onAirProgram, setOnAirProgram] = useState<{ nome: string; horarioInicio: string; horarioFim: string } | null>(null);
  const [openDesc, setOpenDesc] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  // Load data
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
        descricao: p.descricao || "",
      }));
      setProgramas(mapped);
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  // Banner carousel - 5s
  useEffect(() => {
    const banners = promocoes.filter(p => p.imagem_url);
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentBannerIndex(prev => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [promocoes]);

  // On-air program refresh
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

  // Filtered programs
  const filteredPrograms = programas
    .filter(p => PROGRAMAS_VISIVEIS.some(name => p.nome.toUpperCase().includes(name) || name.includes(p.nome.toUpperCase())))
    .sort((a, b) => {
      const idxA = PROGRAMAS_VISIVEIS.findIndex(name => a.nome.toUpperCase().includes(name) || name.includes(a.nome.toUpperCase()));
      const idxB = PROGRAMAS_VISIVEIS.findIndex(name => b.nome.toUpperCase().includes(name) || name.includes(b.nome.toUpperCase()));
      return idxA - idxB;
    });

  const banners = promocoes.filter(p => p.imagem_url);
  const botoes = promocoes.filter(p => p.botao_url);

  // Hover scroll
  const sideScroll = (direction: "left" | "right") => {
    const { current } = scrollRef;
    if (current) {
      const scrollAmount = direction === "left" ? -300 : 300;
      current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  return (
    <div className="bg-zinc-900 text-white min-h-screen p-8 flex flex-col items-center">
      <div className="w-full max-w-[1000px] flex flex-col gap-6">

        {/* Header: No Ar + Logo */}
        <div className="flex justify-between items-center w-full px-2">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
            </span>
            <div>
              <span className="font-bold uppercase tracking-widest text-xs text-red-500">No Ar</span>
              {onAirProgram && (
                <p className="text-white/80 text-xs truncate max-w-[200px]">{onAirProgram.nome}</p>
              )}
            </div>
          </div>

          {config.logo && (
            <img
              src={config.logo}
              alt={config.nome}
              className="h-[60px] w-auto object-contain"
            />
          )}
        </div>

        {/* Banner */}
        <div className="w-full overflow-hidden rounded-xl shadow-2xl relative">
          {banners.length > 0 ? (
            banners.map((banner, index) => (
              <div
                key={banner.id}
                className="w-full transition-opacity duration-1000"
                style={{
                  opacity: index === currentBannerIndex ? 1 : 0,
                  display: index === currentBannerIndex ? "block" : "none",
                }}
              >
                <img
                  src={banner.imagem_url}
                  alt={banner.texto}
                  className="w-full h-auto object-contain"
                />
              </div>
            ))
          ) : (
            <div className="h-[200px] flex items-center justify-center text-white/30">
              Nenhum banner ativo
            </div>
          )}

          {banners.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
              {banners.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentBannerIndex(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    i === currentBannerIndex ? "bg-red-600 scale-125" : "bg-white/40"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Programação - Scroll horizontal com hover */}
        {filteredPrograms.length > 0 && (
          <div className="relative group">
            <h2 className="text-lg font-bold mb-4">Programação</h2>

            {/* Setas hover */}
            <div
              onMouseEnter={() => sideScroll("left")}
              className="absolute left-[-45px] top-1/2 -translate-y-1/2 p-2 cursor-pointer opacity-30 hover:opacity-100 transition-opacity z-10"
            >
              <ChevronLeft size={36} />
            </div>
            <div
              onMouseEnter={() => sideScroll("right")}
              className="absolute right-[-45px] top-1/2 -translate-y-1/2 p-2 cursor-pointer opacity-30 hover:opacity-100 transition-opacity z-10"
            >
              <ChevronRight size={36} />
            </div>

            <div
              ref={scrollRef}
              className="flex gap-4 overflow-x-auto scroll-smooth"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <style>{`.no-scrollbar::-webkit-scrollbar{display:none}`}</style>
              {filteredPrograms.map(prog => (
                <div
                  key={prog.id}
                  className="min-w-[230px] h-[300px] relative rounded-lg overflow-hidden flex-shrink-0 shadow-lg border border-zinc-800 hover:border-zinc-600 transition-colors"
                >
                  {prog.capa ? (
                    <img src={prog.capa} alt={prog.nome} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                      <Clock size={24} className="text-zinc-600" />
                    </div>
                  )}

                  {/* Horário no topo direito */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 text-[11px] font-bold drop-shadow-lg">
                    <Clock size={12} />
                    <span>{prog.horarioInicio.slice(0, 5)} às {prog.horarioFim.slice(0, 5)}</span>
                  </div>

                  {/* Nome no fundo */}
                  <div className="absolute bottom-0 w-full p-3 bg-gradient-to-t from-black/90 to-transparent">
                    <p className="text-sm font-semibold truncate">{prog.nome}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Promoções em Grid */}
        {botoes.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-4">Promoções</h2>
            <div className="grid grid-cols-2 gap-4">
              {botoes.map(promo => (
                <div
                  key={promo.id}
                  className="relative rounded-lg overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-colors cursor-pointer"
                >
                  <img
                    src={promo.botao_url}
                    alt={promo.texto}
                    className="w-full h-auto object-contain"
                  />
                  {/* Data no topo direito */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 text-[11px] font-bold drop-shadow-lg bg-black/50 px-2 py-1 rounded">
                    <Calendar size={12} />
                    <span>até {promo.data_fim}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sanfona - Sobre os Programas */}
        {filteredPrograms.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-4">Sobre os Programas</h2>
            <div className="bg-zinc-800/50 rounded-lg overflow-hidden">
              {filteredPrograms.map(prog => (
                <div key={prog.id} className="border-b border-zinc-700 last:border-none">
                  <button
                    onClick={() => setOpenDesc(openDesc === prog.id ? null : prog.id)}
                    className="w-full flex justify-between items-center p-4 hover:bg-zinc-700/50 transition-colors text-left"
                  >
                    <span className="font-medium text-sm">{prog.nome}</span>
                    {openDesc === prog.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>

                  {openDesc === prog.id && (
                    <div className="px-4 pb-4 text-zinc-300 text-sm italic animate-in fade-in slide-in-from-top-1">
                      {prog.descricao ? `"${prog.descricao}"` : "Sem descrição disponível."}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
