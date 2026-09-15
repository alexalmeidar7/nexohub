import { useState, useMemo, useEffect } from "react";
import { CalendarDays, MapPin, ChevronDown, Check } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DATAS_COMEMORATIVAS } from "@/data/datasComemorativas";
import { ANIVERSARIOS_CIDADES, UF_LIST } from "@/data/aniversariosCidades";

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
  const today = new Date();

  return (
    <div className="overflow-hidden bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] font-sans">
      <div className="flex items-center justify-between gap-2 pl-6 pr-12 py-4 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays size={16} className="text-[#0055ff]" />
          <span className="truncate text-sm font-black uppercase tracking-wider text-[#002132]">
            Datas Comemorativas
          </span>
        </div>

        <Popover open={ufOpen} onOpenChange={setUfOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={`Filtrar aniversários de cidades por estado (atual: ${ufNome})`}
              className="h-7 px-2.5 text-[10px] bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-full font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <MapPin size={11} className="text-[#0055ff]" />
              <span className="font-bold">{uf}</span>
              <ChevronDown size={10} className="text-slate-400" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-64 p-0 border border-slate-100 rounded-2xl shadow-xl bg-white overflow-hidden z-50"
          >
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#002132]">
                <MapPin size={12} className="text-[#0055ff]" />
                <span>Estado das Cidades</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Selecione</span>
            </div>
            <div className="p-1.5 max-h-64 overflow-y-auto space-y-0.5">
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
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-colors text-xs ${
                      active
                        ? "bg-blue-50 text-[#0055ff] font-bold"
                        : "hover:bg-slate-50 text-slate-700 font-medium"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md min-w-[26px] text-center ${
                          active
                            ? "bg-[#0055ff] text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {u.sigla}
                      </span>
                      <span className="truncate">{u.nome}</span>
                    </div>
                    {active ? (
                      <Check size={12} className="text-[#0055ff] shrink-0" />
                    ) : !disponivel ? (
                      <span className="text-[9px] text-slate-300 italic shrink-0">sem dados</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="p-4 space-y-2 max-h-[440px] overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-xs py-6 text-center text-slate-400">
            Nenhuma data comemorativa cadastrada.
          </p>
        ) : (
          items.map((item, idx) => {
            const isCidade = item.categoria === "cidade";
            const isFeriado = item.categoria === "feriado";
            const isItemToday = isSameDay(item.date, today);
            const weekday = format(item.date, "EEEE", { locale: ptBR }).split("-")[0];

            return (
              <div
                key={idx}
                className="rounded-full px-4 py-2.5 flex items-center gap-3 transition-all duration-200 bg-white hover:bg-slate-50/90 border border-slate-100 hover:border-[#0055ff]/40 hover:shadow-md hover:-translate-y-0.5 group cursor-pointer"
              >
                {/* Badge de Data com círculo e borda na cor #0055ff */}
                <div
                  className={`w-10 h-10 rounded-full flex flex-col items-center justify-center shrink-0 border transition-all duration-200 group-hover:scale-105 ${
                    isFeriado
                      ? "bg-rose-50/80 border-rose-200 text-rose-600 group-hover:border-rose-400"
                      : "bg-[#0055ff]/5 border-[#0055ff]/30 text-[#0055ff] group-hover:border-[#0055ff]"
                  }`}
                >
                  <span className="text-[12px] font-black leading-none">{format(item.date, "dd")}</span>
                  <span className="text-[8px] font-bold uppercase tracking-wider opacity-80 mt-0.5">
                    {format(item.date, "MMM", { locale: ptBR }).replace(".", "")}
                  </span>
                </div>

                {/* Conteúdo textual */}
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs font-bold truncate text-[#0055ff] group-hover:text-[#0047e1] transition-colors"
                    title={item.nome}
                  >
                    {item.nome}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span
                      className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full ${
                        isFeriado
                          ? "bg-rose-100/70 text-rose-700"
                          : "bg-[#0055ff]/10 text-[#0055ff]"
                      }`}
                    >
                      {isCidade ? `CIDADE · ${item.tag}` : item.tag.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-slate-400 capitalize font-medium">
                      {weekday}
                    </span>
                  </div>
                </div>

                {/* Selo se for Hoje */}
                {isItemToday && (
                  <span className="text-[9px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0">
                    HOJE
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
