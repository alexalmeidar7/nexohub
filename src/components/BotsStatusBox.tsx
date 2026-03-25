import { useEffect, useMemo, useState } from "react";
import { Bot, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";

const BOT_XML_LAST_RUN_KEY = "bot_xml_last_run";
const BOT_BOX_MINIMIZED_KEY = "bot_box_minimized";

const botSteps = [
  {
    bot: "BotXMLMusica",
    action: "Lendo XML da música e validando latência",
    next: "Próximo: BotMusicaEmTudo (15s)",
  },
  {
    bot: "BotMusicaEmTudo",
    action: "Sincronizando título, artista e capa em todas as telas",
    next: "Próximo: BotLogosPats (2min)",
  },
  {
    bot: "BotLogosPats",
    action: "Atualizando XML de logos e patrocinadores",
    next: "Próximo: BotXMLMusica (10s)",
  },
];

export default function BotsStatusBox() {
  const [activeStep, setActiveStep] = useState(0);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [minimized, setMinimized] = useState(() => localStorage.getItem(BOT_BOX_MINIMIZED_KEY) === "true");

  useEffect(() => {
    const rotateTimer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % botSteps.length);
    }, 5000);
    const clockTimer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => { clearInterval(rotateTimer); clearInterval(clockTimer); };
  }, []);

  const toggleMinimize = () => {
    setMinimized((prev) => {
      localStorage.setItem(BOT_BOX_MINIMIZED_KEY, String(!prev));
      return !prev;
    });
  };

  const xmlLastSeen = useMemo(() => {
    const raw = localStorage.getItem(BOT_XML_LAST_RUN_KEY);
    const ts = raw ? Number(raw) : 0;
    if (!ts) return "sem leitura";
    const sec = Math.max(0, Math.floor((nowTs - ts) / 1000));
    return `XML ${sec}s`;
  }, [nowTs]);

  const step = botSteps[activeStep];

  if (minimized) {
    return (
      <div className="fixed bottom-3 right-3 z-50">
        <button
          onClick={toggleMinimize}
          className="flex items-center gap-1.5 rounded-full border border-border/40 bg-card/70 backdrop-blur-sm px-2.5 py-1 shadow-md hover:bg-card/90 transition-all"
        >
          <Bot className="h-3 w-3 text-primary animate-pulse" />
          <span className="text-[10px] text-muted-foreground">{xmlLastSeen}</span>
          <ChevronUp className="h-2.5 w-2.5 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-3 right-3 z-50">
      <div className="max-w-[18rem] rounded-xl border border-border/30 bg-card/60 backdrop-blur-sm px-3 py-2 shadow-md">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <Bot className="h-3 w-3 text-primary animate-pulse" />
            <span className="text-[10px] font-medium text-muted-foreground">Bots</span>
          </div>
          <button onClick={toggleMinimize} className="p-0.5 hover:bg-muted/50 rounded transition-colors">
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>

        <div key={step.bot} className="animate-fade-in space-y-0.5">
          <p className="text-[10px] font-semibold text-foreground/80">{step.bot}</p>
          <p className="text-[9px] text-muted-foreground leading-tight">{step.action}</p>
          <div className="flex items-center gap-1 text-[9px] text-primary/70">
            <ArrowRight className="h-2.5 w-2.5" />
            <span>{step.next}</span>
          </div>
        </div>

        <p className="mt-1 text-[9px] text-muted-foreground/60">{xmlLastSeen}</p>
      </div>
    </div>
  );
}
