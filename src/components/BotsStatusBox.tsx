import { useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";


// Per-user scoped keys — declared inside component using user.id

interface BotStatus {
  name: string;
  label: string;
  ok: boolean;
  detail: string;
  lastRun: number;
}

export default function BotsStatusBox() {
  const { user } = useAuth();
  const BOT_XML_LAST_RUN_KEY = user ? `bot_xml_last_run::${user.id}` : "bot_xml_last_run::__none__";
  const MUSIC_DATA_KEY = user ? `masterview_music_data::${user.id}` : "masterview_music_data::__none__";
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [bots, setBots] = useState<BotStatus[]>([
    { name: "BotXMLMusica", label: "XML Música", ok: false, detail: "Aguardando...", lastRun: 0 },
    { name: "BotMusicaEmTudo", label: "Sync Telas", ok: false, detail: "Aguardando...", lastRun: 0 },
    { name: "BotLogosPats", label: "Logos/Pats", ok: false, detail: "Aguardando...", lastRun: 0 },
    { name: "BotNoticiasFontes", label: "Notícias Fontes", ok: false, detail: "Aguardando...", lastRun: 0 },
  ]);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // BotXMLMusica — check localStorage for XML read timestamp (every 5s)
  useEffect(() => {
    const check = () => {
      const ts = Number(localStorage.getItem(BOT_XML_LAST_RUN_KEY) || "0");
      const musicRaw = localStorage.getItem(MUSIC_DATA_KEY);
      let detail = "Sem leitura";
      let ok = false;
      if (ts > 0) {
        const ago = Math.floor((Date.now() - ts) / 1000);
        ok = ago < 15;
        if (musicRaw) {
          try {
            const m = JSON.parse(musicRaw);
            detail = ok
              ? `✓ ${m.titulo || "?"} — ${m.artista || "?"}`
              : `⚠ Última leitura ${ago}s atrás`;
          } catch {
            detail = ok ? `Lido há ${ago}s` : `⚠ ${ago}s sem leitura`;
          }
        } else {
          detail = ok ? `Lido há ${ago}s` : `⚠ ${ago}s sem leitura`;
        }
      }
      setBots(prev => prev.map(b => b.name === "BotXMLMusica" ? { ...b, ok, detail, lastRun: ts } : b));
    };
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, []);

  // BotMusicaEmTudo — verify music data consistency (every 15s)
  useEffect(() => {
    const check = () => {
      const musicRaw = localStorage.getItem(MUSIC_DATA_KEY);
      if (!musicRaw) {
        setBots(prev => prev.map(b => b.name === "BotMusicaEmTudo" ? { ...b, ok: false, detail: "Sem dados de música", lastRun: 0 } : b));
        return;
      }
      try {
        const m = JSON.parse(musicRaw);
        const titulo = (m.titulo || "").trim().toLowerCase();
        const hasTrack = titulo !== "" && titulo !== "sem título" && titulo !== "sem titulo";
        const hasCover = !!m.capa;
        const ok = hasTrack;
        const detail = hasTrack
          ? `${m.titulo} ${hasCover ? "🎨" : "⏳ buscando capa"}`
          : "Aguardando faixa válida";
        setBots(prev => prev.map(b => b.name === "BotMusicaEmTudo" ? { ...b, ok, detail, lastRun: Date.now() } : b));
      } catch {
        setBots(prev => prev.map(b => b.name === "BotMusicaEmTudo" ? { ...b, ok: false, detail: "Erro ao ler dados", lastRun: 0 } : b));
      }
    };
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, []);

  // BotLogosPats — check logos count from DB (every 2min)
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      try {
        const { count, error } = await supabase
          .from("logos_patrocinadores")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("ativo", true)
          .eq("excluido", false);

        if (error) {
          setBots(prev => prev.map(b => b.name === "BotLogosPats" ? { ...b, ok: false, detail: "Erro ao verificar", lastRun: Date.now() } : b));
        } else {
          setBots(prev => prev.map(b => b.name === "BotLogosPats" ? { ...b, ok: true, detail: `${count ?? 0} logos ativas`, lastRun: Date.now() } : b));
        }
      } catch {
        setBots(prev => prev.map(b => b.name === "BotLogosPats" ? { ...b, ok: false, detail: "Falha na verificação", lastRun: Date.now() } : b));
      }
    };
    check();
    const t = setInterval(check, 120000);
    return () => clearInterval(t);
  }, [user]);

  // BotNoticiasFontes — verifica cache de notícias no backend (a cada 60s)
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      try {
        const { data, error } = await supabase
          .from("news_cache")
          .select("updated_at, items")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(20);
        if (error || !data || data.length === 0) {
          setBots(prev => prev.map(b => b.name === "BotNoticiasFontes" ? { ...b, ok: false, detail: "Sem cache ainda", lastRun: 0 } : b));
          return;
        }
        const newestTs = new Date(data[0].updated_at as string).getTime();
        try { localStorage.setItem("bot_news_cache_last_run", String(newestTs)); } catch {}
        const ageMin = Math.floor((Date.now() - newestTs) / 60000);
        const total = (data as any[]).reduce((a, r) => a + (Array.isArray(r.items) ? r.items.length : 0), 0);
        const ok = ageMin < 15;
        setBots(prev => prev.map(b => b.name === "BotNoticiasFontes" ? {
          ...b,
          ok,
          detail: ok ? `${total} notícias • ${ageMin}min` : `⚠ Cache ${ageMin}min atrás`,
          lastRun: newestTs,
        } : b));
      } catch {
        setBots(prev => prev.map(b => b.name === "BotNoticiasFontes" ? { ...b, ok: false, detail: "Falha ao verificar", lastRun: Date.now() } : b));
      }
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [user]);

  const xmlAge = useMemo(() => {
    const ts = Number(localStorage.getItem(BOT_XML_LAST_RUN_KEY) || "0");
    if (!ts) return "—";
    return `${Math.max(0, Math.floor((nowTs - ts) / 1000))}s`;
  }, [nowTs]);

  const allOk = bots.every(b => b.ok);

  return (
    <Tooltip delayDuration={100}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="relative flex items-center justify-center w-8 h-8 shrink-0 rounded-full text-slate-700 hover:text-black hover:bg-slate-100/80 active:scale-95 transition-all outline-none ml-0.5 cursor-pointer select-none"
          aria-label="Status dos Bots"
        >
          <Bot className="w-4 h-4 text-white transition-transform hover:scale-110" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#0055ff]" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="center"
        sideOffset={8}
        className="z-[9999] p-0 border-0 bg-transparent shadow-none"
      >
        <div className="bg-[#000000] border border-white/10 rounded-2xl p-3 shadow-[0_16px_40px_rgba(0,0,0,0.55)] min-w-[230px] max-w-[280px] text-white animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
            <div className="flex items-center gap-1.5">
              <Bot className={`w-3.5 h-3.5 ${allOk ? "text-emerald-400" : "text-amber-400"}`} />
              <span className="text-[11px] font-bold tracking-tight text-white">Status dos Bots</span>
            </div>
            <span className="text-[9px] font-mono text-white/50 bg-white/5 px-2 py-0.5 rounded-full">
              XML {xmlAge}
            </span>
          </div>

          <div className="space-y-2">
            {bots.map(bot => (
              <div key={bot.name} className="flex items-start gap-2">
                {bot.ok ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0 animate-pulse" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold text-white/90 leading-tight">{bot.label}</p>
                  <p className="text-[9px] text-white/60 leading-tight truncate mt-0.5">{bot.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
