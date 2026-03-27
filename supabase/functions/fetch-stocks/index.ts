import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STOCK_EXCHANGES = [
  { symbol: "^BVSP", name: "Ibovespa", flag: "🇧🇷", gfIndex: ".BVSP", gfExchange: "INDEXBVL" },
  { symbol: "^GSPC", name: "S&P 500", flag: "🇺🇸", gfIndex: ".INX", gfExchange: "INDEXSP" },
  { symbol: "^DJI", name: "Dow Jones", flag: "🇺🇸", gfIndex: ".DJI", gfExchange: "INDEXDJX" },
  { symbol: "^IXIC", name: "Nasdaq", flag: "🇺🇸", gfIndex: ".IXIC", gfExchange: "INDEXNASDAQ" },
  { symbol: "^FTSE", name: "FTSE 100", flag: "🇬🇧", gfIndex: "UKX", gfExchange: "INDEXFTSE" },
  { symbol: "^N225", name: "Nikkei 225", flag: "🇯🇵", gfIndex: "NI225", gfExchange: "INDEXNIKKEI" },
  { symbol: "^GDAXI", name: "DAX", flag: "🇩🇪", gfIndex: "DAX", gfExchange: "INDEXDB" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stocks = await fetchAllFromGoogle();
    return new Response(JSON.stringify({ stocks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("fetch-stocks error:", error);
    return new Response(JSON.stringify({ stocks: [], error: String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function fetchAllFromGoogle(): Promise<any[]> {
  const results = await Promise.allSettled(
    STOCK_EXCHANGES.map(async (exchange) => {
      const url = `https://www.google.com/finance/quote/${exchange.gfIndex}:${exchange.gfExchange}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      });
      const html = await res.text();

      // Extract price from data-last-price or page title
      let price = 0;
      const priceAttr = html.match(/data-last-price="([^"]+)"/);
      if (priceAttr) {
        price = parseFloat(priceAttr[1]);
      } else {
        // Fallback: extract from page title "Index Name 123,456.78 ..."
        const titleMatch = html.match(/<title>[^<]*?([\d,]+\.\d{2})/);
        if (titleMatch) {
          price = parseFloat(titleMatch[1].replace(/,/g, ""));
        }
      }

      // Extract first percentage change
      let pctChange = 0;
      // Look for the change near the price section - pattern like "(−1.82%)" or "(+0.52%)"
      const pctMatches = html.match(/\(([-−+]?\d+\.\d+%)\)/g);
      if (pctMatches && pctMatches.length > 0) {
        const raw = pctMatches[0].replace(/[()%]/g, "").replace("−", "-");
        pctChange = parseFloat(raw);
      } else {
        const simplePct = html.match(/>([-+]?\d+\.\d+%)</);
        if (simplePct) {
          pctChange = parseFloat(simplePct[1].replace("%", ""));
        }
      }

      if (price === 0) return null;

      return {
        symbol: exchange.symbol,
        name: exchange.name,
        flag: exchange.flag,
        value: formatNumber(price),
        change: `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%`,
        direction: pctChange > 0 ? "up" : pctChange < 0 ? "down" : "neutral",
      };
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
    .map(r => r.value);
}

function formatNumber(n: number): string {
  if (n >= 1000) {
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
