import { useState, useRef, useCallback } from "react";
import { X, GripVertical, Clock, Trash2, Newspaper, Pencil, FileDown, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { JornalConfig } from "./MontarJornalInline";
import JornalExportView from "./JornalExportView";

export interface JornalNewsItem {
  portal: string;
  title: string;
  imageUrl: string;
  body?: string;
  link?: string;
}

interface Props {
  config: JornalConfig;
  selectedNews: JornalNewsItem[];
  onClose: () => void;
}

function decodeHtmlEntities(str: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = str;
  return textarea.value;
}

export default function JornalBlockBuilder({ config, selectedNews, onClose }: Props) {
  const [blocks, setBlocks] = useState<Record<number, JornalNewsItem[]>>(() => {
    const init: Record<number, JornalNewsItem[]> = {};
    for (let i = 1; i <= config.blocos; i++) init[i] = [];
    return init;
  });

  const [editingItem, setEditingItem] = useState<{ blockNum: number; index: number; item: JornalNewsItem } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editBody, setEditBody] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [fetchingBody, setFetchingBody] = useState<string | null>(null);

  const dragItem = useRef<{ source: number; index: number } | null>(null);
  const dragOverItem = useRef<{ block: number; index: number } | null>(null);

  const fetchBodyForItem = useCallback(async (item: JornalNewsItem): Promise<string> => {
    if (item.body) return item.body;
    if (!item.link) return "";
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!supabaseUrl || !supabaseKey) return "";
      const res = await fetch(`${supabaseUrl}/functions/v1/fetch-rss`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
        body: JSON.stringify({ url: item.link }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      if (data.content) {
        const html = data.content;
        const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        if (articleMatch) return articleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
        const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
        if (ogDescMatch) return decodeHtmlEntities(ogDescMatch[1]);
        const pMatches = html.match(/<p[^>]*>([^<]{40,})<\/p>/gi);
        if (pMatches) return pMatches.slice(0, 8).map((p: string) => p.replace(/<[^>]+>/g, "").trim()).join("\n\n").slice(0, 3000);
      }
    } catch {}
    return "";
  }, []);

  const handleDragStart = (source: number, index: number) => {
    dragItem.current = { source, index };
  };

  const handleDragOverItem = (blockNum: number, index: number, e: React.DragEvent) => {
    e.preventDefault();
    dragOverItem.current = { block: blockNum, index };
  };

  const handleDropOnBlock = async (blockNum: number, e: React.DragEvent) => {
    e.preventDefault();
    const jsonData = e.dataTransfer.getData("text/plain");
    if (jsonData) {
      try {
        const parsed = JSON.parse(jsonData);

        if (parsed.type === "previsao_tempo" && parsed.text) {
          const weatherItem: JornalNewsItem = { portal: "Previsão do Tempo", title: `🌤️ Previsão — ${parsed.city}`, imageUrl: "", body: parsed.text };
          const alreadyInBlock = blocks[blockNum]?.some(n => n.portal === "Previsão do Tempo");
          if (!alreadyInBlock) {
            setBlocks(prev => ({ ...prev, [blockNum]: [...(prev[blockNum] || []), weatherItem] }));
          }
          dragItem.current = null;
          return;
        }

        if (parsed.type === "bloco_economia" && Array.isArray(parsed.items)) {
          const moedas = parsed.items.filter((c: any) => c.name.includes("/"));
          const bolsas = parsed.items.filter((c: any) => !c.name.includes("/"));
          const moedasText = moedas.map((c: any) => `${c.name} ${c.value} (${c.change})`).join(", ");
          const bolsasText = bolsas.map((c: any) => `${c.name} ${c.value} (${c.change})`).join(", ");
          let text = "Vamos ver como anda o mercado no dia de hoje";
          if (moedasText) text += ` - ${moedasText}`;
          if (bolsasText) text += ` - e as bolsas operam ${bolsasText}`;
          const econItem: JornalNewsItem = { portal: "Economia", title: text, imageUrl: "", body: text };
          const alreadyInBlock = blocks[blockNum]?.some(n => n.portal === "Economia" && n.title.startsWith("Vamos ver como anda"));
          if (!alreadyInBlock) {
            setBlocks(prev => ({ ...prev, [blockNum]: [...(prev[blockNum] || []), econItem] }));
          }
          dragItem.current = null;
          return;
        }

        const item = parsed as JornalNewsItem;
        if (item.portal && item.title) {
          const alreadyInBlock = blocks[blockNum]?.some(n => n.title === item.title);
          if (!alreadyInBlock) {
            // Fetch body if not present
            let body = item.body || "";
            if (!body && item.link) {
              const key = `${blockNum}-${item.title}`;
              setFetchingBody(key);
              body = await fetchBodyForItem(item);
              setFetchingBody(null);
            }
            setBlocks(prev => ({ ...prev, [blockNum]: [...(prev[blockNum] || []), { ...item, body }] }));
          }
          dragItem.current = null;
          return;
        }
      } catch {}
    }

    // Internal reorder/move
    if (!dragItem.current) return;
    const { source, index } = dragItem.current;
    const fromBlock = blocks[source];
    const movedItem = fromBlock?.[index];
    if (movedItem) {
      const targetIndex = dragOverItem.current?.block === blockNum ? dragOverItem.current.index : (blocks[blockNum]?.length || 0);
      setBlocks(prev => {
        const newSource = prev[source].filter((_, i) => i !== index);
        const newTarget = source === blockNum ? newSource : [...(prev[blockNum] || [])];
        if (source === blockNum) {
          newSource.splice(targetIndex > index ? targetIndex - 1 : targetIndex, 0, movedItem);
          return { ...prev, [source]: newSource };
        }
        newTarget.splice(targetIndex, 0, movedItem);
        return { ...prev, [source]: newSource, [blockNum]: newTarget };
      });
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const removeFromBlock = (blockNum: number, index: number) => {
    setBlocks(prev => ({ ...prev, [blockNum]: prev[blockNum].filter((_, i) => i !== index) }));
  };

  const openEdit = (blockNum: number, index: number) => {
    const item = blocks[blockNum][index];
    setEditingItem({ blockNum, index, item });
    setEditTitle(item.title);
    setEditImageUrl(item.imageUrl);
    setEditBody(item.body || "");
  };

  const saveEdit = () => {
    if (!editingItem) return;
    const { blockNum, index } = editingItem;
    setBlocks(prev => {
      const updated = [...prev[blockNum]];
      updated[index] = { ...updated[index], title: editTitle, imageUrl: editImageUrl, body: editBody };
      return { ...prev, [blockNum]: updated };
    });
    setEditingItem(null);
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

  if (showExport) {
    return <JornalExportView config={config} blocks={blocks} onClose={() => setShowExport(false)} />;
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #2ec1f7", backgroundColor: "#ffffff" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 font-bold text-xs" style={{ backgroundColor: "#2ec1f7", color: "#0d0446", borderBottom: "1px solid #2ec1f7" }}>
        <span className="flex items-center gap-2">
          <Newspaper size={14} />
          Jornal: {config.programaNome}
        </span>
        <button onClick={onClose} className="hover:opacity-70 transition-opacity">
          <X size={16} />
        </button>
      </div>

      {/* Blocks */}
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
              <div className="flex items-center justify-between px-3 py-2 text-xs font-bold" style={{ backgroundColor: "#a8e2f7", color: "#0d0446", borderBottom: "1px solid rgba(46,193,247,0.2)" }}>
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
                      onDragOver={(e) => handleDragOverItem(blockNum, ni, e)}
                      className="flex items-start gap-2 px-2 py-2 rounded text-xs cursor-grab active:cursor-grabbing hover:bg-gray-50"
                      style={{ borderBottom: "1px solid rgba(13,4,70,0.05)" }}
                    >
                      <GripVertical size={12} className="shrink-0 mt-0.5" style={{ color: "rgba(13,4,70,0.2)" }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold line-clamp-2 leading-tight" style={{ color: "#0d0446" }}>{n.title}</p>
                        {n.body && (
                          <p className="line-clamp-3 mt-0.5 leading-snug" style={{ color: "rgba(13,4,70,0.5)", fontSize: "10px" }}>
                            {n.body}
                          </p>
                        )}
                        {!n.body && n.link && (
                          <p className="mt-0.5 italic" style={{ color: "rgba(13,4,70,0.3)", fontSize: "10px" }}>
                            Texto não disponível
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <span className="text-[8px] px-1 rounded text-center" style={{ backgroundColor: "rgba(46,193,247,0.1)", color: "#2ec1f7" }}>{n.portal}</span>
                        <button onClick={() => openEdit(blockNum, ni)} className="p-0.5 rounded hover:bg-blue-50 transition-colors" title="Editar matéria">
                          <Pencil size={10} style={{ color: "#2ec1f7" }} />
                        </button>
                        <button onClick={() => removeFromBlock(blockNum, ni)} className="p-0.5 rounded hover:bg-red-50 transition-colors" title="Remover">
                          <Trash2 size={10} style={{ color: "rgba(13,4,70,0.3)" }} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Export Button */}
      <div className="px-3 py-2" style={{ borderTop: "1px solid rgba(13,4,70,0.1)" }}>
        <button
          onClick={() => setShowExport(true)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-colors"
          style={{ backgroundColor: "#0d0446", color: "#ffffff" }}
        >
          <FileDown size={14} />
          Exportar Jornal
        </button>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col" style={{ backgroundColor: "#ffffff", borderRadius: "20px", border: "1px solid #2ec1f7" }}>
          <style>{`
            .edit-materia-input:focus, .edit-materia-input:focus-visible, .edit-materia-input:active {
              outline: none !important;
              box-shadow: none !important;
              ring: none !important;
              border-color: #2ec1f7 !important;
            }
          `}</style>
          <DialogHeader>
            <DialogTitle className="text-sm font-bold" style={{ color: "#0d0446" }}>Editar Matéria</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div>
              <Label className="text-xs font-semibold" style={{ color: "#0d0446" }}>Título</Label>
              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="edit-materia-input text-xs mt-1 font-bold" style={{ borderColor: "#2ec1f7", borderRadius: "9999px", backgroundColor: "#ffffff", color: "#0d0446" }} />
            </div>
            <div>
              <Label className="text-xs font-semibold" style={{ color: "#0d0446" }}>URL da Imagem</Label>
              <Input value={editImageUrl} onChange={e => setEditImageUrl(e.target.value)} className="edit-materia-input mt-1" placeholder="https://..." style={{ borderColor: "#2ec1f7", borderRadius: "9999px", backgroundColor: "#ffffff", color: "#0d0446", fontSize: "10px" }} />
              {editImageUrl && (
                <img src={editImageUrl} alt="" className="mt-1 w-full h-24 object-cover rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
            </div>
            <div className="flex-1 flex flex-col min-h-0">
              <Label className="text-xs font-semibold" style={{ color: "#0d0446" }}>Texto da Matéria</Label>
              <Textarea value={editBody} onChange={e => setEditBody(e.target.value)} className="edit-materia-input text-xs mt-1 flex-1" style={{ borderColor: "#2ec1f7", borderRadius: "20px", backgroundColor: "#ffffff", color: "#0d0446", minHeight: "200px", maxHeight: "calc(90vh - 320px)", resize: "none" }} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingItem(null)} style={{ borderColor: "#2ec1f7", borderRadius: "9999px", color: "#0d0446", backgroundColor: "#ffffff" }}>Cancelar</Button>
              <Button size="sm" onClick={saveEdit} style={{ backgroundColor: "#2ec1f7", color: "#0d0446", borderRadius: "9999px" }}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
