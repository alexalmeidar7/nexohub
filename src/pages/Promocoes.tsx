import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEmpresaConfig, type EmpresaConfig } from "@/components/ConfiguracoesPage";
import { findCurrentProgram } from "@/components/OnAirWidget";
import { getMusicData } from "@/components/MusicaNoAr";
import { Radio, Music, ChevronLeft, ChevronRight } from "lucide-react";
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

const DIAS_MAP: Record<number, string> = {
  1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo",
};

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
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [onAirProgram, setOnAirProgram] = useState<{ nome: string; horarioInicio: string; horarioFim: string } | null>(null);
  const [musicInfo, setMusicInfo] = useState<{ titulo: string; artista: string } | null>(null);
  const [programScrollIndex, setProgramScrollIndex] = useState(0);
  const [promoScrollIndex, setPromoScrollIndex] = useState(0);
  const [selectedPromo, setSelectedPromo] = useState<Promocao | null>(null);

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

  // On-air program & music - refresh every 2s
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

      const m = getMusicData();
      if (m && !m.finished) {
        setMusicInfo({ titulo: m.music.titulo, artista: m.music.artista });
      } else {
        setMusicInfo(null);
      }
    };
    update();
    const interval = setInterval(update, 2000);
    return () => clearInterval(interval);
  }, [programas]);

  // Filter programs to only show specific ones
  const filteredPrograms = programas
    .filter(p => PROGRAMAS_VISIVEIS.some(name => p.nome.toUpperCase().includes(name) || name.includes(p.nome.toUpperCase())))
    .sort((a, b) => {
      const idxA = PROGRAMAS_VISIVEIS.findIndex(name => a.nome.toUpperCase().includes(name) || name.includes(a.nome.toUpperCase()));
      const idxB = PROGRAMAS_VISIVEIS.findIndex(name => b.nome.toUpperCase().includes(name) || name.includes(b.nome.toUpperCase()));
      return idxA - idxB;
    });

  const banners = promocoes.filter(p => p.imagem_url);
  const botoes = promocoes.filter(p => p.botao_url);

  const ITEMS_PER_PAGE = 4;
  const visiblePrograms = filteredPrograms.slice(programScrollIndex, programScrollIndex + ITEMS_PER_PAGE);
  const canScrollLeft = programScrollIndex > 0;
  const canScrollRight = programScrollIndex + ITEMS_PER_PAGE < filteredPrograms.length;

  const visibleBotoes = botoes.slice(promoScrollIndex, promoScrollIndex + ITEMS_PER_PAGE);
  const canPromoLeft = promoScrollIndex > 0;
  const canPromoRight = promoScrollIndex + ITEMS_PER_PAGE < botoes.length;

  return (
    <div className="min-h-screen bg-black text-white overflow-y-auto">

      {/* HEADER TRANSPARENTE - overlay sobre o banner */}
      <header className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6 flex-1 min-w-0">
          {/* No Ar info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <Radio size={16} className="text-red-600 animate-pulse" />
              <span className="text-red-600 font-bold text-xs uppercase tracking-wider">No Ar:</span>
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate drop-shadow-lg">
                {onAirProgram?.nome || "Programação Musical"}
              </p>
              {onAirProgram && (
                <p className="text-white/70 text-[10px] drop-shadow-lg">
                  {onAirProgram.horarioInicio.slice(0, 5)} às {onAirProgram.horarioFim.slice(0, 5)}
                </p>
              )}
            </div>
          </div>

        </div>

        {/* LOGO - centralizado, 50% maior */}
        {config.logo && (
          <img
            src={config.logo}
            alt={config.nome}
            className="h-18 w-auto object-contain shrink-0 drop-shadow-xl"
            style={{ height: "108px" }}
          />
        )}
      </header>

      {/* CARROSSEL DE BANNERS - ocupa toda a página */}
      <div className="relative w-full flex items-center justify-center">
        {banners.length > 0 ? (
          banners.map((banner, index) => (
            <div
              key={banner.id}
              className={`w-full transition-opacity duration-1000 ease-in-out ${index === currentBannerIndex ? "" : "absolute inset-0"}`}
              style={{ opacity: index === currentBannerIndex ? 1 : 0, display: index === currentBannerIndex ? "block" : "none" }}
            >
              <img
                src={banner.imagem_url}
                alt={banner.texto}
                className="w-full h-auto object-contain"
              />
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center h-full text-white/30 text-lg">
            Nenhum banner de promoção ativo
          </div>
        )}

        {/* Banner indicators */}
        {banners.length > 1 && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 flex gap-2">
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

      {/* SEÇÃO INFERIOR - Capas e Botões */}
      <div className="bg-black px-6 py-8 space-y-6">

        {/* Capas dos Programas */}
        {filteredPrograms.length > 0 && (
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setProgramScrollIndex(Math.max(0, programScrollIndex - ITEMS_PER_PAGE))}
              disabled={!canScrollLeft}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-20 hover:bg-white/20 transition-colors shrink-0"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex gap-[7px] justify-center">
              {visiblePrograms.map(prog => (
                <div
                  key={prog.id}
                  className="flex-shrink-0 rounded-xl overflow-hidden border-0 relative cursor-pointer hover:opacity-70 transition-opacity"
                >
                  {prog.capa ? (
                    <img src={prog.capa} alt={prog.nome} className="w-auto h-auto object-contain" />
                  ) : (
                    <div className="w-full flex items-center justify-center bg-white/5" style={{ height: "80px" }}>
                      <Radio size={16} className="text-white/20" />
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

            <button
              onClick={() => setProgramScrollIndex(programScrollIndex + ITEMS_PER_PAGE)}
              disabled={!canScrollRight}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-20 hover:bg-white/20 transition-colors shrink-0"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* Botões das Promoções */}
        {botoes.length > 0 && (
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setPromoScrollIndex(Math.max(0, promoScrollIndex - ITEMS_PER_PAGE))}
              disabled={!canPromoLeft}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-20 hover:bg-white/20 transition-colors shrink-0"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex gap-3 justify-center">
              {visibleBotoes.map(botao => (
                <button
                  key={botao.id}
                  onClick={() => setSelectedPromo(botao)}
                  className="border-none p-0 bg-transparent hover:opacity-70 transition-opacity cursor-pointer"
                >
                  <img
                    src={botao.botao_url}
                    alt={botao.texto}
                    className="w-auto h-auto object-contain"
                  />
                </button>
              ))}
            </div>

            <button
              onClick={() => setPromoScrollIndex(promoScrollIndex + ITEMS_PER_PAGE)}
              disabled={!canPromoRight}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-20 hover:bg-white/20 transition-colors shrink-0"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>

      {/* Modal de Promoção */}
      <Dialog open={!!selectedPromo} onOpenChange={(open) => !open && setSelectedPromo(null)}>
        <DialogContent className="bg-black/95 border-white/20 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{selectedPromo?.texto || "Promoção"}</DialogTitle>
            {selectedPromo?.oferecimento && (
              <DialogDescription className="text-white/60">
                Oferecimento: {selectedPromo.oferecimento}
              </DialogDescription>
            )}
          </DialogHeader>
          {selectedPromo?.imagem_url && (
            <img src={selectedPromo.imagem_url} alt={selectedPromo.texto} className="w-full rounded-lg object-cover max-h-64" />
          )}
          <div className="space-y-2 text-sm text-white/70">
            <p>Período: {selectedPromo?.data_inicio} a {selectedPromo?.data_fim}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
