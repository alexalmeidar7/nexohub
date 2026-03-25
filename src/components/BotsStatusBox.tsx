import { useEffect, useMemo, useState } from "react";
import { Bot, ArrowRight } from "lucide-react";

const BOT_XML_LAST_RUN_KEY = "bot_xml_last_run";

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

  useEffect(() => {
    const rotateTimer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % botSteps.length);
    }, 5000);

    const clockTimer = setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => {
      clearInterval(rotateTimer);
      clearInterval(clockTimer);
    };
  }, []);

  const xmlLastSeen = useMemo(() => {
    const raw = localStorage.getItem(BOT_XML_LAST_RUN_KEY);
    const ts = raw ? Number(raw) : 0;
    if (!ts) return "sem leitura recente";
    const sec = Math.max(0, Math.floor((nowTs - ts) / 1000));
    return `último XML há ${sec}s`;
  }, [nowTs]);

  const step = botSteps[activeStep];

  return (
    <div className="fixed bottom-5 right-5 z-50 pointer-events-none">
      <div className="max-w-[22rem] rounded-2xl border border-border/60 bg-card/85 backdrop-blur-md px-4 py-3 shadow-xl">
        <div className="flex items-center gap-2 mb-1">
          <Bot className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-xs font-semibold text-foreground">Bots de Verificação</span>
        </div>

        <div key={step.bot} className="animate-fade-in space-y-1">
          <p className="text-xs font-bold text-foreground">{step.bot}</p>
          <p className="text-[11px] text-muted-foreground">{step.action}</p>
          <div className="flex items-center gap-1 text-[11px] text-primary">
            <ArrowRight className="h-3 w-3" />
            <span>{step.next}</span>
          </div>
        </div>

        <p className="mt-2 text-[10px] text-muted-foreground">{xmlLastSeen}</p>
      </div>
    </div>
  );
}