import { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import type { JornalConfig } from "./MontarJornalInline";
import type { JornalNewsItem } from "./JornalBlockBuilder";

interface Props {
  config: JornalConfig;
  blocks: Record<number, JornalNewsItem[]>;
  onClose: () => void;
}

export default function JornalExportView({ config, blocks, onClose }: Props) {
  const [readTitles, setReadTitles] = useState<Set<string>>(new Set());
  const now = new Date();
  const dia = now.toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const hora = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const toggleRead = (title: string) => {
    setReadTitles(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const sequence: { type: "bloco" | "intervalo" | "testemunha"; num?: number }[] = [];
  for (let i = 1; i <= config.blocos; i++) {
    sequence.push({ type: "bloco", num: i });
    if (i < config.blocos && i <= config.intervalos) {
      sequence.push({ type: "intervalo", num: i });
    }
  }
  if (config.temTestemunha) {
    sequence.push({ type: "testemunha" });
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.1)", backgroundColor: "#ffffff" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid rgba(13,4,70,0.1)", backgroundColor: "#0d0446" }}>
        <button onClick={onClose} className="hover:opacity-70 transition-opacity" style={{ color: "#ffffff" }}>
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h2 className="font-bold text-sm" style={{ color: "#ffffff" }}>{config.programaNome}</h2>
          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.6)" }}>
            {dia} · Montado às {hora}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="overflow-y-auto p-4 space-y-4" style={{ maxHeight: "70vh" }}>
        {sequence.map((item, idx) => {
          if (item.type === "intervalo") {
            return (
              <div key={`int-${idx}`} className="text-center py-2">
                <span className="text-[10px] px-3 py-1 rounded-full" style={{ backgroundColor: "rgba(13,4,70,0.05)", color: "rgba(13,4,70,0.4)" }}>
                  ⏸ Intervalo {item.num} — {config.tempoIntervaloMin} min
                </span>
              </div>
            );
          }
          if (item.type === "testemunha") {
            return (
              <div key="test" className="rounded-lg p-3" style={{ backgroundColor: "rgba(46,193,247,0.05)", border: "1px dashed #2ec1f7" }}>
                <p className="font-bold text-xs" style={{ color: "#2ec1f7" }}>🎤 Testemunha — {config.horarioTestemunha || "Horário não definido"}</p>
                <p className="text-xs mt-1" style={{ color: "rgba(13,4,70,0.5)" }}>{config.textoTestemunhal || ""}</p>
              </div>
            );
          }

          const blockNum = item.num!;
          const blockItems = blocks[blockNum] || [];
          return (
            <div key={`blk-${blockNum}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: "#0d0446", color: "#ffffff" }}>
                  Bloco {blockNum}
                </span>
                <span className="text-[10px]" style={{ color: "rgba(13,4,70,0.4)" }}>{config.tempoBlocoMin} min</span>
              </div>
              {blockItems.length === 0 ? (
                <p className="text-[10px] italic pl-2" style={{ color: "rgba(13,4,70,0.3)" }}>Nenhuma notícia neste bloco</p>
              ) : (
                <div className="space-y-3 pl-1">
                  {blockItems.map((n, ni) => {
                    const isRead = readTitles.has(n.title);
                    return (
                      <div key={ni} className="rounded-lg p-3" style={{ backgroundColor: isRead ? "rgba(46,193,247,0.05)" : "rgba(13,4,70,0.02)", border: `1px solid ${isRead ? "rgba(46,193,247,0.3)" : "rgba(13,4,70,0.06)"}` }}>
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => toggleRead(n.title)}
                            className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center transition-colors"
                            style={{
                              backgroundColor: isRead ? "#2ec1f7" : "transparent",
                              border: isRead ? "none" : "2px solid rgba(13,4,70,0.2)",
                            }}
                            title={isRead ? "Marcar como não lido" : "Marcar como lido"}
                          >
                            {isRead && <Check size={10} style={{ color: "#ffffff" }} />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p
                              className="font-bold text-xs leading-tight cursor-pointer"
                              style={{
                                color: "#0d0446",
                                textDecoration: isRead ? "line-through" : "none",
                                opacity: isRead ? 0.5 : 1,
                              }}
                              onClick={() => toggleRead(n.title)}
                            >
                              {n.title}
                            </p>
                            <span className="text-[8px] px-1 rounded mt-1 inline-block" style={{ backgroundColor: "rgba(46,193,247,0.1)", color: "#2ec1f7" }}>{n.portal}</span>
                            {n.body && (
                              <p className="text-[11px] mt-2 leading-relaxed whitespace-pre-line" style={{ color: "rgba(13,4,70,0.7)" }}>
                                {n.body}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
