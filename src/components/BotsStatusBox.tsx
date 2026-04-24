import { useEffect, useMemo, useState, useCallback } from "react";
import { Bot, ChevronDown, ChevronUp, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const BOT_BOX_MINIMIZED_KEY = "bot_box_minimized";
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
  const [minimized, setMinimized] = useState(() => localStorage.getItem(BOT_BOX_MINIMIZED_KEY) === "true");
  const [bots, setBots] = useState<BotStatus[]>([
    { name: "BotXMLMusica", label: "XML Música", ok: false, detail: "Aguardando...", lastRun: 0 },
    { name: "BotMusicaEmTudo", label: "Sync Telas", ok: false, detail: "Aguardando...", lastRun: 0 },
    { name: "BotLogosPats", label: "Logos/Pats", ok: false, detail: "Aguardando...", lastRun: 0 },
  ]);

  const toggleMinimize = useCallback(() => {
    setMinimized((prev) => {
      localStorage.setItem(BOT_BOX_MINIMIZED_KEY, String(!prev));
      return !prev;
    });
  }, []);

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

  const xmlAge = useMemo(() => {
    const ts = Number(localStorage.getItem(BOT_XML_LAST_RUN_KEY) || "0");
    if (!ts) return "—";
    return `${Math.max(0, Math.floor((nowTs - ts) / 1000))}s`;
  }, [nowTs]);

  const allOk = bots.every(b => b.ok);

  if (minimized) {
    return (
      <div className="fixed bottom-3 right-3 z-50">
        <button
          onClick={toggleMinimize}
          className="flex items-center gap-1.5 rounded-full border border-border/40 bg-card/70 backdrop-blur-sm px-2.5 py-1 shadow-md hover:bg-card/90 transition-all"
        >
          {allOk
            ? <CheckCircle2 className="h-3 w-3 text-green-400" />
            : <Bot className="h-3 w-3 text-primary animate-pulse" />
          }
          <span className="text-[10px] text-muted-foreground font-mono">{xmlAge}</span>
          <ChevronUp className="h-2.5 w-2.5 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-3 right-3 z-50">
      <div className="w-[16rem] rounded-xl border border-border/30 bg-card/60 backdrop-blur-sm px-3 py-2 shadow-md">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Bot className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-semibold text-muted-foreground">Bots</span>
            <span className="text-[9px] font-mono text-muted-foreground/60">XML {xmlAge}</span>
          </div>
          <button onClick={toggleMinimize} className="p-0.5 hover:bg-muted/50 rounded transition-colors">
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-1">
          {bots.map(bot => (
            <div key={bot.name} className="flex items-start gap-1.5">
              {bot.ok
                ? <CheckCircle2 className="h-3 w-3 text-green-400 mt-[1px] shrink-0" />
                : <AlertCircle className="h-3 w-3 text-yellow-400 mt-[1px] shrink-0 animate-pulse" />
              }
              <div className="min-w-0">
                <p className="text-[9px] font-semibold text-foreground/70 leading-none">{bot.label}</p>
                <p className="text-[8px] text-muted-foreground/70 leading-tight truncate">{bot.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
