import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STOCK_EXCHANGES = [
  { symbol: "^BVSP", name: "Ibovespa", flag: "🇧🇷" },
  { symbol: "^GSPC", name: "S&P 500", flag: "🇺🇸" },
  { symbol: "^DJI", name: "Dow Jones", flag: "🇺🇸" },
  { symbol: "^IXIC", name: "Nasdaq", flag: "🇺🇸" },
  { symbol: "^FTSE", name: "FTSE 100", flag: "🇬🇧" },
  { symbol: "^N225", name: "Nikkei 225", flag: "🇯🇵" },
  { symbol: "^GDAXI", name: "DAX", flag: "🇩🇪" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const symbols = STOCK_EXCHANGES.map(s => s.symbol).join(",");
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChangePercent,shortName`;
    
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!res.ok) {
      // Fallback: try v6
      const url2 = `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${encodeURIComponent(symbols)}`;
      const res2 = await fetch(url2, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res2.ok) throw new Error("Yahoo Finance unavailable");
      const data2 = await res2.json();
      const results = data2?.quoteResponse?.result || [];
      return buildResponse(results);
    }

    const data = await res.json();
    const results = data?.quoteResponse?.result || [];
    return buildResponse(results);
  } catch (error) {
    console.error("fetch-stocks error:", error);
    return new Response(JSON.stringify({ stocks: [], error: String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});

function buildResponse(results: any[]) {
  const stocks = STOCK_EXCHANGES.map(exchange => {
    const quote = results.find((r: any) => r.symbol === exchange.symbol);
    if (!quote) return null;

    const price = quote.regularMarketPrice || 0;
    const pctChange = quote.regularMarketChangePercent || 0;

    return {
      symbol: exchange.symbol,
      name: exchange.name,
      flag: exchange.flag,
      value: price.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
      change: `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%`,
      direction: pctChange > 0 ? "up" : pctChange < 0 ? "down" : "neutral",
    };
  }).filter(Boolean);

  return new Response(JSON.stringify({ stocks }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
