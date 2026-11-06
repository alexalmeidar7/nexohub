import { useEffect, useMemo, useState } from "react";
import { Copy, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listXPaths, type XPathEntry } from "@/lib/xmlXPath";

interface XmlXPathDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  url?: string;
  xmlContent?: string;
}

export default function XmlXPathDialog({ open, onOpenChange, title, url, xmlContent }: XmlXPathDialogProps) {
  const [entries, setEntries] = useState<XPathEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        let xml = xmlContent;
        if (!xml) {
          if (!url) throw new Error("Feed sem URL disponível.");
          const sep = url.includes("?") ? "&" : "?";
          const res = await fetch(`${url}${sep}_xp=${Date.now()}`, { cache: "no-store" });
          if (!res.ok) throw new Error(`Não foi possível carregar o XML (HTTP ${res.status}).`);
          xml = await res.text();
        }
        const list = listXPaths(xml);
        if (!cancelled) setEntries(list);
      } catch (e) {
        if (!cancelled) {
          setEntries([]);
          setError(e instanceof Error ? e.message : "Erro ao ler o XML.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [open, url, xmlContent, reloadKey]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e => e.xpath.toLowerCase().includes(q) || e.value.toLowerCase().includes(q));
  }, [entries, filter]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("XPath copiado");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[85vh] flex flex-col gap-3 bg-white text-slate-900">
        <DialogHeader className="shrink-0">
          <DialogTitle>XPath para vMix — {title}</DialogTitle>
          <DialogDescription>
            Cada linha mostra o XPath do nó e o resultado que ele retorna agora. Clique no XPath para copiar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filtrar por nó ou valor..."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-[#0055ff]"
            />
          </div>
          <button
            type="button"
            onClick={() => setReloadKey(k => k + 1)}
            title="Atualizar"
            className="h-9 w-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-[#0055ff] hover:border-[#0055ff]"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="flex-1 min-h-[200px] overflow-auto rounded-xl border border-slate-200">
          {loading && !entries.length ? (
            <div className="h-40 flex items-center justify-center text-slate-500">
              <Loader2 className="animate-spin mr-2" size={16} /> Carregando XML...
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-red-600">{error}</div>
          ) : visible.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Nenhum nó encontrado.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 w-[55%]">XPath</th>
                  <th className="px-3 py-2">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(e => (
                  <tr key={e.xpath} className="border-t border-slate-100 align-top hover:bg-blue-50/40">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => copy(e.xpath)}
                        title="Copiar XPath"
                        className="flex items-start gap-2 text-left font-mono text-[11px] text-[#0055ff] break-all"
                      >
                        <Copy size={12} className="mt-0.5 shrink-0" />
                        {e.xpath}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-700 break-words">
                      {e.value || <span className="text-slate-300">(vazio)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="text-[10px] text-slate-400 shrink-0">{visible.length} de {entries.length} nós</div>
      </DialogContent>
    </Dialog>
  );
}
