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
      className="overflow-hidden"
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: 20,
        border: "1px solid #E5F5FB",
        boxShadow: "0 2px 12px rgba(10, 37, 64, 0.04)",
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{
          padding: "12px 18px",
          background: NEXO_DARK,
          color: "#FFFFFF",
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: 2,
          textTransform: "uppercase",
          fontFamily: "'Montserrat', sans-serif",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Star size={12} style={{ color: NEXO_LIME, fill: NEXO_LIME }} />
          <span className="truncate" style={{ color: "#FFFFFF" }}>DATAS COMEMORATIVAS</span>
          <Popover open={ufOpen} onOpenChange={setUfOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={`Estado para aniversário de cidades: ${ufNome}`}
                className="ml-1 inline-flex items-center justify-center transition-transform hover:rotate-45"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "rgba(198, 240, 60, 0.15)",
                  border: `1px solid ${NEXO_LIME}55`,
                  color: NEXO_LIME,
                  cursor: "pointer",
                }}
              >
                <Settings size={11} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-64 p-0 border-0"
              style={{
                background: "#FFFFFF",
                borderRadius: 14,
                boxShadow: "0 12px 40px rgba(10, 37, 64, 0.18)",
                border: `1px solid ${NEXO_CYAN}40`,
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  background: NEXO_DARK,
                  color: "#FFFFFF",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 14,
                  fontFamily: "'Montserrat', sans-serif",
                }}
                className="flex items-center gap-2"
              >
                <MapPin size={11} style={{ color: NEXO_LIME }} />
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
                      className="w-full flex items-center justify-between px-3 py-1.5 rounded-md transition-colors"
                      style={{
                        background: active ? `${NEXO_CYAN}15` : "transparent",
                        color: active ? NEXO_DARK : "#334155",
                        fontFamily: "'Montserrat', sans-serif",
                      }}
                      onMouseEnter={(e) => {
                        if (!active) e.currentTarget.style.background = "#F1F9FB";
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: "2px 6px",
                            borderRadius: 6,
                            background: active ? NEXO_CYAN : "#E5F5FB",
                            color: active ? "#FFFFFF" : NEXO_DARK,
                            minWidth: 28,
                            textAlign: "center",
                          }}
                        >
                          {u.sigla}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: active ? 700 : 500 }}>{u.nome}</span>
                      </span>
                      {!disponivel && (
                        <span style={{ fontSize: 9, color: "#94A3B8", fontStyle: "italic" }}>vazio</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1,
            padding: "3px 8px",
            borderRadius: 999,
            background: `${NEXO_CYAN}30`,
            color: "#FFFFFF",
          }}
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
