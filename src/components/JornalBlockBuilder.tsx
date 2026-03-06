import { useState, useRef } from "react";
import { X, GripVertical, Clock, Trash2, Newspaper } from "lucide-react";
import type { JornalConfig } from "./MontarJornalWizard";

interface NewsItem {
  portal: string;
  title: string;
  imageUrl: string;
}

interface Props {
  config: JornalConfig;
  selectedNews: NewsItem[];
  onClose: () => void;
}

export default function JornalBlockBuilder({ config, selectedNews, onClose }: Props) {
  const [blocks, setBlocks] = useState<Record<number, NewsItem[]>>(() => {
    const init: Record<number, NewsItem[]> = {};
    for (let i = 1; i <= config.blocos; i++) init[i] = [];
    return init;
  });

  const dragItem = useRef<{ source: number; index: number } | null>(null);

  const handleDragStart = (source: number, index: number) => {
    dragItem.current = { source, index };
  };

  const handleDropOnBlock = (blockNum: number, e: React.DragEvent) => {
    e.preventDefault();

    // Try to get data from portal drag (from NoticiasPanel accordion)
    const jsonData = e.dataTransfer.getData("text/plain");
    if (jsonData) {
      try {
        const item = JSON.parse(jsonData) as NewsItem;
        if (item.portal && item.title) {
          // Check if already in this block
          const alreadyInBlock = blocks[blockNum]?.some(n => n.title === item.title);
          if (!alreadyInBlock) {
            setBlocks(prev => ({
              ...prev,
              [blockNum]: [...(prev[blockNum] || []), item],
            }));
          }
          dragItem.current = null;
          return;
        }
      } catch {}
    }

    // Internal drag between blocks
    if (!dragItem.current) return;
    const { source, index } = dragItem.current;
    const fromBlock = blocks[source];
    const item = fromBlock?.[index];
    if (item) {
      setBlocks(prev => ({
        ...prev,
        [source]: prev[source].filter((_, i) => i !== index),
        [blockNum]: [...(prev[blockNum] || []), item],
      }));
    }
    dragItem.current = null;
  };

  const removeFromBlock = (blockNum: number, index: number) => {
    setBlocks(prev => ({
      ...prev,
      [blockNum]: prev[blockNum].filter((_, i) => i !== index),
    }));
  };

  // Build sequence
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
      <div className="flex items-center justify-between px-4 py-2 text-white font-bold text-xs" style={{ backgroundColor: "#0d0446" }}>
        <span className="flex items-center gap-2">
          <Newspaper size={14} />
          Jornal: {config.programaNome}
        </span>
        <button onClick={onClose} className="hover:opacity-70 transition-opacity">
          <X size={16} />
        </button>
      </div>

      {/* Blocks only */}
      <div className="overflow-y-auto p-3 space-y-3" style={{ maxHeight: "500px" }}>
        {sequence.map((item, idx) => {
          if (item.type === "intervalo") {
            return (
              <div key={`int-${idx}`} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "rgba(13,4,70,0.03)", color: "rgba(13,4,70,0.4)" }}>
                <Clock size={12} />
                Intervalo {item.num} — {config.tempoIntervaloMin} min
              </div>
            );
          }
          if (item.type === "testemunha") {
            return (
              <div key="test" className="rounded-lg p-3 text-xs" style={{ backgroundColor: "rgba(46,193,247,0.05)", border: "1px dashed #2ec1f7" }}>
                <p className="font-bold mb-1" style={{ color: "#2ec1f7" }}>🎤 Testemunha — {config.horarioTestemunha || "Horário não definido"}</p>
                <p style={{ color: "rgba(13,4,70,0.5)" }}>{config.textoTestemunhal || "Sem texto definido"}</p>
              </div>
            );
          }

          const blockNum = item.num!;
          const blockItems = blocks[blockNum] || [];
          return (
            <div
              key={`blk-${blockNum}`}
              className="rounded-lg overflow-hidden"
              style={{ border: "1px solid rgba(46,193,247,0.3)" }}
              onDragOver={e => e.preventDefault()}
              onDrop={(e) => handleDropOnBlock(blockNum, e)}
            >
              <div className="flex items-center justify-between px-3 py-2 text-xs font-bold" style={{ backgroundColor: "#ffffff", color: "#0d0446", borderBottom: "1px solid rgba(46,193,247,0.2)" }}>
                <span>Bloco {blockNum}</span>
                <span className="font-normal" style={{ color: "rgba(13,4,70,0.4)" }}>{config.tempoBlocoMin} min · {blockItems.length} notícia(s)</span>
              </div>
              <div className="min-h-[40px] p-1">
                {blockItems.length === 0 ? (
                  <p className="text-[10px] text-center py-3" style={{ color: "rgba(13,4,70,0.3)" }}>
                    Arraste notícias dos portais para este bloco
                  </p>
                ) : (
                  blockItems.map((n, ni) => (
                    <div
                      key={ni}
                      draggable
                      onDragStart={() => handleDragStart(blockNum, ni)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-grab active:cursor-grabbing hover:bg-gray-50"
                      style={{ borderBottom: "1px solid rgba(13,4,70,0.03)" }}
                    >
                      <GripVertical size={10} style={{ color: "rgba(13,4,70,0.2)" }} />
                      <span className="flex-1 line-clamp-1" style={{ color: "#0d0446" }}>{n.title}</span>
                      <span className="text-[8px] px-1 rounded shrink-0" style={{ backgroundColor: "rgba(46,193,247,0.1)", color: "#2ec1f7" }}>{n.portal}</span>
                      <button onClick={() => removeFromBlock(blockNum, ni)} className="shrink-0 hover:opacity-70">
                        <Trash2 size={10} style={{ color: "rgba(13,4,70,0.3)" }} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Need useRef import
import { useRef } from "react";
