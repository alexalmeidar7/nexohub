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
    const stocks = await fetchFromYahoo();
    if (stocks.length > 0) {
      return jsonResponse({ stocks });
    }

    // Fallback: try scraping from Google Finance
    const fallbackStocks = await fetchFromGoogleFinance();
    return jsonResponse({ stocks: fallbackStocks });
  } catch (error) {
    console.error("fetch-stocks error:", error);
    return jsonResponse({ stocks: [], error: String(error) });
  }
});

async function fetchFromYahoo(): Promise<any[]> {
  const symbols = STOCK_EXCHANGES.map(s => s.symbol).join(",");
  
  // Try multiple Yahoo endpoints
  const urls = [
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json",
        },
      });
      
      if (!res.ok) continue;
      const text = await res.text();
      if (text.includes("Too Many Requests") || text.includes("Edge:")) continue;
      
      const data = JSON.parse(text);
      const results = data?.quoteResponse?.result || [];
      if (results.length === 0) continue;

      return STOCK_EXCHANGES.map(exchange => {
        const quote = results.find((r: any) => r.symbol === exchange.symbol);
        if (!quote) return null;
        const price = quote.regularMarketPrice || 0;
        const pctChange = quote.regularMarketChangePercent || 0;
        return {
          symbol: exchange.symbol,
          name: exchange.name,
          flag: exchange.flag,
          value: formatNumber(price),
          change: `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%`,
          direction: pctChange > 0 ? "up" : pctChange < 0 ? "down" : "neutral",
        };
      }).filter(Boolean);
    } catch {
      continue;
    }
  }
  return [];
}

async function fetchFromGoogleFinance(): Promise<any[]> {
  const googleSymbols: Record<string, { index: string; exchange: string }> = {
    "^BVSP": { index: "IBOV", exchange: "INDEXBVL" },
    "^GSPC": { index: ".INX", exchange: "INDEXSP" },
    "^DJI": { index: ".DJI", exchange: "INDEXDJX" },
    "^IXIC": { index: ".IXIC", exchange: "INDEXNASDAQ" },
    "^FTSE": { index: "UKX", exchange: "INDEXFTSE" },
    "^N225": { index: "NI225", exchange: "INDEXNIKKEI" },
    "^GDAXI": { index: "DAX", exchange: "INDEXDB" },
  };

  const results: any[] = [];

  for (const exchange of STOCK_EXCHANGES) {
    const gf = googleSymbols[exchange.symbol];
    if (!gf) continue;
    
    try {
      const url = `https://www.google.com/finance/quote/${gf.index}:${gf.exchange}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      const html = await res.text();
      
      // Extract price from data-last-price attribute
      const priceMatch = html.match(/data-last-price="([^"]+)"/);
      const changeMatch = html.match(/data-pct-change="([^"]+)"/);
      
      if (priceMatch) {
        const price = parseFloat(priceMatch[1]);
        const pctChange = changeMatch ? parseFloat(changeMatch[1]) : 0;
        
        results.push({
          symbol: exchange.symbol,
          name: exchange.name,
          flag: exchange.flag,
          value: formatNumber(price),
          change: `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%`,
          direction: pctChange > 0 ? "up" : pctChange < 0 ? "down" : "neutral",
        });
      }
    } catch {
      continue;
    }
  }

  return results;
}

function formatNumber(n: number): string {
  if (n >= 1000) {
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function jsonResponse(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
