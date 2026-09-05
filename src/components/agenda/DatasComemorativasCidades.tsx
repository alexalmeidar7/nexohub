import { useState, useMemo, useEffect } from "react";
import { Star, Settings, MapPin } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DATAS_COMEMORATIVAS } from "@/data/datasComemorativas";
import { ANIVERSARIOS_CIDADES, UF_LIST } from "@/data/aniversariosCidades";

const NEXO_LIME = "#C6F03C";
const NEXO_CYAN = "#00BFF0";
const NEXO_DARK = "#0A2540";
const LS_UF_KEY = "nexo:agenda:uf-cidades";

type Item = {
  date: Date;
  nome: string;
  categoria: "comemorativa" | "cidade" | "feriado";
  tag: string;
};

interface Props {
  feriados?: { date: Date; nome: string }[];
}

export default function DatasComemorativasCidades({ feriados = [] }: Props) {
  const [uf, setUf] = useState<string>(() => {
    if (typeof window === "undefined") return "GO";
    return window.localStorage.getItem(LS_UF_KEY) || "GO";
  });
  const [ufOpen, setUfOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_UF_KEY, uf);
    } catch {
      /* ignore */
    }
  }, [uf]);

  const items = useMemo<Item[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const year = today.getFullYear();

    const toItems = (
      dia: number,
      mes: number,
      nome: string,
      categoria: "comemorativa" | "cidade" | "feriado",
      tag: string,
    ): Item[] => {
      const thisYear = new Date(year, mes - 1, dia);
      const nextYear = new Date(year + 1, mes - 1, dia);
      const chosen = thisYear >= today ? thisYear : nextYear;
      return [{ date: chosen, nome, categoria, tag }];
    };

    const comemorativas = DATAS_COMEMORATIVAS.flatMap((d) =>
      toItems(d.dia, d.mes, d.nome, "comemorativa", "Nacional"),
    );
    const cidades = (ANIVERSARIOS_CIDADES[uf] || []).flatMap((c) =>
      toItems(c.dia, c.mes, `Aniversário de ${c.cidade}${c.capital ? " (capital)" : ""}`, "cidade", uf),
    );
    const feriadosItems: Item[] = feriados
      .filter((f) => f.date >= today)
      .map((f) => ({ date: f.date, nome: f.nome, categoria: "feriado", tag: "Feriado Nacional" }));

    return [...comemorativas, ...cidades, ...feriadosItems]
      .filter((it) => it.date >= today)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 16);
  }, [uf, feriados]);

  const ufNome = UF_LIST.find((u) => u.sigla === uf)?.nome || uf;

  return (
    <div
      className="overflow-hidden bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] font-sans"
    >
      <div
        className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-white"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Star size={13} className="text-[#0055ff] fill-[#0055ff]" />
          <span className="truncate text-xs font-black uppercase tracking-wider text-[#002132]">Datas Comemorativas</span>
          <Popover open={ufOpen} onOpenChange={setUfOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={`Estado para aniversário de cidades: ${ufNome}`}
                className="ml-1 inline-flex items-center justify-center transition-transform hover:rotate-45 w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                <Settings size={11} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-64 p-0 border border-slate-100 rounded-2xl shadow-xl bg-white overflow-hidden"
            >
              <div
                className="px-4 py-2.5 bg-[#002132] text-white text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-2"
              >
                <MapPin size={11} className="text-[#00BFF0]" />
                Estado das cidades
              </div>
              <div className="p-2 max-h-72 overflow-y-auto">
                {UF_LIST.map((u) => {
                  const active = u.sigla === uf;
                  const disponivel = !!ANIVERSARIOS_CIDADES[u.sigla]?.length;
                  return (
                    <button
                      key={u.sigla}
                      type="button"
                      onClick={() => {
                        setUf(u.sigla);
                        setUfOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg transition-colors ${
                        active ? "bg-blue-50 text-[#0055ff] font-bold" : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md min-w-[28px] text-center ${
                            active ? "bg-[#0055ff] text-white" : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {u.sigla}
                        </span>
                        <span className="text-xs">{u.nome}</span>
                      </span>
                      {!disponivel && (
                        <span className="text-[9px] text-slate-400 italic">vazio</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <span
          className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 uppercase"
        >
          {uf}
        </span>
      </div>

      <div className="p-3 space-y-1.5 max-h-[320px] overflow-y-auto scrollbar-hide">
        {items.length === 0 && (
          <p className="text-center text-[11px] py-6" style={{ color: "#64748B" }}>
            Nenhuma data cadastrada.
          </p>
        )}
        {items.map((item, idx) => {
          const isCidade = item.categoria === "cidade";
          const isFeriado = item.categoria === "feriado";
          const RED = "#EF4444";
          const accent = isFeriado ? RED : isCidade ? NEXO_CYAN : NEXO_LIME;
          const accentText = isFeriado || isCidade ? "#FFFFFF" : NEXO_DARK;
          const bg = isFeriado
            ? `color-mix(in srgb, ${RED} 6%, #FFFFFF)`
            : isCidade
              ? `color-mix(in srgb, ${NEXO_CYAN} 5%, #FFFFFF)`
              : `color-mix(in srgb, ${NEXO_LIME} 12%, #FFFFFF)`;
          const border = isFeriado ? `${RED}40` : isCidade ? `${NEXO_CYAN}30` : `${NEXO_LIME}55`;
          const tagColor = isFeriado ? RED : isCidade ? NEXO_CYAN : "#7A8B18";
          const weekday = format(item.date, "EEEE", { locale: ptBR }).split("-")[0];
          return (
            <div
              key={idx}
              className="p-2 rounded-xl flex items-center gap-3 group transition-colors"
              style={{ backgroundColor: bg, border: `1px solid ${border}` }}
            >
              <div
                className="w-10 h-10 rounded-md flex flex-col items-center justify-center shrink-0"
                style={{ backgroundColor: accent, color: accentText }}
              >
                <span className="text-[11px] font-black leading-none">{format(item.date, "dd")}</span>
                <span className="text-[7px] font-bold uppercase tracking-tighter opacity-90">
                  {format(item.date, "MMM", { locale: ptBR }).replace(".", "")}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[11px] font-bold truncate leading-tight"
                  style={{ color: NEXO_DARK }}
                  title={item.nome}
                >
                  {item.nome}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="text-[9px] font-semibold uppercase tracking-wider opacity-80"
                    style={{ color: tagColor }}
                  >
                    {isCidade ? `Cidade · ${item.tag}` : item.tag}
                  </span>
                  <span
                    className="text-[9px] font-medium capitalize"
                    style={{ color: "rgba(10, 37, 64, 0.55)" }}
                  >
                    · {weekday}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
