import { ChevronDown, ChevronUp, DollarSign, Loader2 } from "lucide-react";

type QuoteDirection = "up" | "down" | "neutral";

interface CurrencyOption {
  value: string;
  label: string;
  flag: string;
}

interface LiveCurrency {
  code: string;
  name: string;
  value: string;
  change: string;
  direction: QuoteDirection;
}

interface LiveStock {
  symbol: string;
  name: string;
  flag: string;
  value: string;
  change: string;
  direction: QuoteDirection;
}

interface Props {
  accentColor: string;
  currencyOptions: CurrencyOption[];
  currencySubTab: "moedas" | "bolsas";
  currencyCodes: string[];
  liveCurrencies: LiveCurrency[];
  liveStocks: LiveStock[];
  loadingCurrencies?: boolean;
  loadingStocks?: boolean;
  size: (value: number) => number;
}

const COUNTRY_FLAG_MAP: Record<string, string> = {
  US: "🇺🇸",
  EU: "🇪🇺",
  GB: "🇬🇧",
  AR: "🇦🇷",
  JP: "🇯🇵",
  BT: "₿",
  ET: "Ξ",
  BR: "🇧🇷",
  DE: "🇩🇪",
};

const SURFACE_BG = "rgba(0, 0, 0, 0.15)";
const SURFACE_BORDER = "none";
const POSITIVE = "hsl(142 70% 55%)";
const NEGATIVE = "hsl(0 85% 68%)";
const MUTED = "hsl(0 0% 100% / 0.5)";

function resolveFlag(flag?: string) {
  if (!flag) return "";
  if (COUNTRY_FLAG_MAP[flag]) return COUNTRY_FLAG_MAP[flag];

  const parsedFlag = flag.replace(/[^A-Z]/g, "").slice(0, 2);
  return COUNTRY_FLAG_MAP[parsedFlag] || flag;
}

function TrendLabel({
  change,
  direction,
  size,
}: {
  change: string;
  direction: QuoteDirection;
  size: (value: number) => number;
}) {
  const iconSize = `${size(1.8)}px`;
  const color = direction === "up" ? POSITIVE : direction === "down" ? NEGATIVE : MUTED;

  return (
    <div className="flex items-center" style={{ gap: `${size(0.5)}px`, marginTop: `${size(0.4)}px` }}>
      <span className="font-bold tabular-nums" style={{ fontSize: `${size(1.4)}px`, color }}>
        {change}
      </span>
      {direction === "up" && <ChevronUp style={{ width: iconSize, height: iconSize, color }} strokeWidth={3} />}
      {direction === "down" && <ChevronDown style={{ width: iconSize, height: iconSize, color }} strokeWidth={3} />}
    </div>
  );
}

function QuoteCard({
  leading,
  title,
  subtitle,
  value,
  change,
  direction,
  size,
  index,
}: {
  leading: string;
  title: string;
  subtitle?: string;
  value?: string;
  change?: string;
  direction?: QuoteDirection;
  size: (value: number) => number;
  index: number;
}) {
  return (
    <div
      className={`w-full cenario-anim-row-${Math.min(index + 1, 8)}`}
      style={{
        padding: `${size(2)}px ${size(2.5)}px`,
        background: SURFACE_BG,
        borderRadius: `${size(2)}px`,
        border: SURFACE_BORDER,
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center" style={{ gap: `${size(1.5)}px`, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: `${size(3.5)}px`, lineHeight: 1, minWidth: `${size(4)}px`, textAlign: 'center' }}>{leading}</span>
          <div className="flex flex-col" style={{ minWidth: 0 }}>
            <span className="font-black truncate" style={{ fontSize: `${size(2.4)}px`, lineHeight: 1.1 }}>
              {title}
            </span>
            {subtitle ? (
              <span className="truncate" style={{ fontSize: `${size(1.2)}px`, opacity: 0.35, lineHeight: 1.2 }}>
                {subtitle}
              </span>
            ) : null}
          </div>
        </div>

        {value ? (
          <div className="flex flex-col items-end" style={{ flexShrink: 0 }}>
            <span className="font-black tabular-nums" style={{ fontSize: `${size(2.8)}px`, lineHeight: 1.1 }}>
              {value}
            </span>
            {change && direction ? <TrendLabel change={change} direction={direction} size={size} /> : null}
          </div>
        ) : (
          <span className="opacity-30" style={{ fontSize: `${size(2.5)}px` }}>
            ---
          </span>
        )}
      </div>
    </div>
  );
}

export default function CenarioQuotesPanel({
  accentColor,
  currencyOptions,
  currencySubTab,
  currencyCodes,
  liveCurrencies,
  liveStocks,
  loadingCurrencies = false,
  loadingStocks = false,
  size,
}: Props) {
  const isCurrencies = currencySubTab === "moedas";
  const isLoading = isCurrencies ? loadingCurrencies && !liveCurrencies.length : loadingStocks && !liveStocks.length;

  return (
    <>
      <div className="text-center" style={{ marginBottom: `${size(3)}px` }}>
        <DollarSign
          className="drop-shadow-lg mx-auto"
          style={{ width: `${size(4.5)}px`, height: `${size(4.5)}px`, color: accentColor, opacity: 0.6, marginBottom: `${size(0.8)}px` }}
        />
        <div className="font-extrabold leading-none" style={{ fontSize: `${size(4.5)}px`, letterSpacing: "-0.03em", textShadow: "0 2px 16px rgba(0,0,0,0.5)" }}>
          cotação
        </div>
        <div className="font-bold uppercase tracking-widest" style={{ fontSize: `${size(1.8)}px`, color: accentColor, marginTop: `${size(0.5)}px`, letterSpacing: "0.2em" }}>
          {currencySubTab === "moedas" ? "moedas" : "bolsas"}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-1 opacity-80" style={{ fontSize: `${size(1.8)}px` }}>
          <Loader2 size={size(2)} className="animate-spin" /> Carregando...
        </div>
      ) : isCurrencies ? (
        <div className="w-full flex flex-col" style={{ gap: `${size(1.5)}px`, maxWidth: `${size(50)}px` }}>
          {currencyCodes.map((code, idx) => {
            const option = currencyOptions.find((item) => item.value === code);
            const live = liveCurrencies.find((item) => item.code === code);
            return (
              <QuoteCard
                key={code}
                index={idx}
                leading={resolveFlag(option?.flag)}
                title={code}
                subtitle={option?.label?.split("(")[0]?.trim()}
                value={live ? `R$ ${live.value}` : undefined}
                change={live?.change}
                direction={live?.direction}
                size={size}
              />
            );
          })}
        </div>
      ) : (
        <div className="w-full flex flex-col" style={{ gap: `${size(1.5)}px`, maxWidth: `${size(50)}px` }}>
          {liveStocks.map((stock, idx) => (
            <QuoteCard
              key={stock.symbol}
              index={idx}
              leading={resolveFlag(stock.flag)}
              title={stock.name}
              value={stock.value}
              change={stock.change}
              direction={stock.direction}
              size={size}
            />
          ))}

          {!loadingStocks && !liveStocks.length ? (
            <div className="opacity-60 text-center" style={{ fontSize: `${size(2.2)}px` }}>
              Dados indisponíveis
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}