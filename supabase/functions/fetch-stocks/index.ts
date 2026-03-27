import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STOCK_EXCHANGES = [
  { symbol: "^BVSP", name: "Ibovespa", flag: "🇧🇷", gfPath: "IBOV:INDEXBVL" },
  { symbol: "^GSPC", name: "S&P 500", flag: "🇺🇸", gfPath: ".INX:INDEXSP" },
  { symbol: "^DJI", name: "Dow Jones", flag: "🇺🇸", gfPath: ".DJI:INDEXDJX" },
  { symbol: "^IXIC", name: "Nasdaq", flag: "🇺🇸", gfPath: ".IXIC:INDEXNASDAQ" },
  { symbol: "^FTSE", name: "FTSE 100", flag: "🇬🇧", gfPath: "UKX:INDEXFTSE" },
  { symbol: "^N225", name: "Nikkei 225", flag: "🇯🇵", gfPath: "NI225:INDEXNIKKEI" },
  { symbol: "^GDAXI", name: "DAX", flag: "🇩🇪", gfPath: "DAX:INDEXDB" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stocks = await fetchAll();
    return new Response(JSON.stringify({ stocks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ stocks: [], error: String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function fetchAll(): Promise<any[]> {
  const results = await Promise.allSettled(
    STOCK_EXCHANGES.map(async (ex) => {
      const url = `https://www.google.com/finance/quote/${ex.gfPath}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      const html = await res.text();

      // 1) data-last-price
      let price = 0;
      const dlp = html.match(/data-last-price="([^"]+)"/);
      if (dlp) {
        price = parseFloat(dlp[1]);
      }

      // 2) Fallback: biggest number with comma-thousands and decimals in the page
      if (price === 0) {
        const allNums = [...html.matchAll(/>(\d{1,3}(?:,\d{3})+\.\d{2})</g)]
          .map(m => parseFloat(m[1].replace(/,/g, "")))
          .sort((a, b) => b - a);
        if (allNums.length > 0) price = allNums[0];
      }

      // Percentage: first >X.XX%< pattern in the page
      let pct = 0;
      const pctMatch = html.match(/>([-+]?\d+\.\d+)%</);
      if (pctMatch) {
        pct = parseFloat(pctMatch[1]);
      }

      if (price === 0) return null;

      return {
        symbol: ex.symbol, name: ex.name, flag: ex.flag,
        value: price >= 1000
          ? price.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
          : price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        change: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
        direction: pct > 0 ? ("up" as const) : pct < 0 ? ("down" as const) : ("neutral" as const),
      };
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
    .map(r => r.value);
}
