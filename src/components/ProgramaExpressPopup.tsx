import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Zap, Plus, Trash2, Link2, Loader2, Image, Type, Check, X as XIcon, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { decodeHtmlEntities } from "@/lib/textEncoding";

const BLOCK_COLORS = [
  "#2ec1f7", // azul
  "#f59e0b", // amarelo
  "#10b981", // verde
  "#ef4444", // vermelho
  "#8b5cf6", // roxo
  "#ec4899", // rosa
  "#06b6d4", // ciano
  "#f97316", // laranja
];

interface NewsItem {
  titulo: string;
  imagemUrl: string;
  escalada: boolean;
  link?: string;
}

interface Bloco {
  noticias: NewsItem[];
}

interface Programa {
  id: string;
  nome: string;
  estudio: string;
}

export interface ExpressEditData {
  roteiroId: string;
  estudio: string;
  programaId: string;
  blocos: Bloco[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  programas: Programa[];
  estudios: string[];
  onFinish: () => void;
  editData?: ExpressEditData | null;
}

export default function ProgramaExpressPopup({ open, onOpenChange, programas, estudios, onFinish, editData }: Props) {
  const { user } = useAuth();
  const [estudio, setEstudio] = useState("");
  const [programaId, setProgramaId] = useState("");
  const [blocos, setBlocos] = useState<Bloco[]>([{ noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }]);
  const [fetchingLink, setFetchingLink] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [collapsedBlocos, setCollapsedBlocos] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const filteredProgramas = estudio ? programas.filter(p => p.estudio === estudio) : programas;
  const programaNome = programas.find(p => p.id === programaId)?.nome || "";

  // Load edit data when popup opens
  if (open && editData && !initialized) {
    setEstudio(editData.estudio);
    setProgramaId(editData.programaId);
    setBlocos(editData.blocos.length > 0 ? editData.blocos : [{ noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }]);
    setEditingId(editData.roteiroId);
    setInitialized(true);
  }
  if (!open && initialized) {
    setInitialized(false);
  }

  const reset = () => {
    setEstudio("");
    setProgramaId("");
    setBlocos([{ noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }]);
    setFetchingLink(null);
    setSaving(false);
    setCollapsedBlocos(new Set());
    setEditingId(null);
    setInitialized(false);
  };

  const updateNoticia = (bi: number, ni: number, field: keyof NewsItem, value: any) => {
    setBlocos(prev => {
      const copy = prev.map((b, i) => i === bi ? { ...b, noticias: b.noticias.map((n, j) => j === ni ? { ...n, [field]: value } : n) } : b);
      return copy;
    });
  };

  const addNoticia = (bi: number) => {
    setBlocos(prev => prev.map((b, i) => i === bi ? { ...b, noticias: [...b.noticias, { titulo: "", imagemUrl: "", escalada: false }] } : b));
  };

  const removeNoticia = (bi: number, ni: number) => {
    setBlocos(prev => prev.map((b, i) => i === bi ? { ...b, noticias: b.noticias.filter((_, j) => j !== ni) } : b));
  };

  const addBloco = () => {
    setBlocos(prev => [...prev, { noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }]);
  };

  const removeBloco = (bi: number) => {
    setBlocos(prev => prev.filter((_, i) => i !== bi));
    setCollapsedBlocos(prev => { const n = new Set(prev); n.delete(bi); return n; });
  };

  const toggleCollapse = (bi: number) => {
    setCollapsedBlocos(prev => {
      const n = new Set(prev);
      if (n.has(bi)) n.delete(bi); else n.add(bi);
      return n;
    });
  };

  const fetchFromLink = async (bi: number, ni: number, url: string) => {
    if (!url.startsWith("http")) return;
    const key = `${bi}-${ni}`;
    setFetchingLink(key);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-rss", {
        body: { url },
      });
      if (!error && data?.ok && data.content) {
        const html = data.content as string;
        // Parse OG meta tags from HTML
        const getMetaContent = (property: string): string => {
          const patterns = [
            new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
            new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
            new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
            new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, "i"),
          ];
          for (const p of patterns) {
            const m = html.match(p);
            if (m?.[1]) return m[1];
          }
          return "";
        };

        const title = getMetaContent("og:title") || getMetaContent("twitter:title") || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").trim();
        const image = getMetaContent("og:image") || getMetaContent("twitter:image");

        if (title) updateNoticia(bi, ni, "titulo", title);
        if (image) updateNoticia(bi, ni, "imagemUrl", image);
        updateNoticia(bi, ni, "link", url);
        if (title) toast.success("Dados extraídos do link!");
        else toast.warning("Link carregado, mas não foi possível extrair o título");
      } else {
        toast.error("Não foi possível acessar o link");
      }
    } catch {
      toast.error("Não foi possível extrair dados do link");
    }
    setFetchingLink(null);
  };

  const generateXml = (): string => {
    const escaladaItems = blocos.flatMap(b => b.noticias.filter(n => n.escalada && n.titulo));
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<programaExpress>\n`;
    xml += `  <programa>${programaNome}</programa>\n`;
    xml += `  <estudio>${estudio}</estudio>\n`;
    xml += `  <data>${new Date().toISOString().split("T")[0]}</data>\n`;

    if (escaladaItems.length > 0) {
      xml += `  <escalada>\n`;
      escaladaItems.forEach((n, i) => {
        xml += `    <item ordem="${i + 1}">\n`;
        xml += `      <titulo>${escXml(n.titulo)}</titulo>\n`;
        xml += `      <imagem>${escXml(n.imagemUrl)}</imagem>\n`;
        xml += `    </item>\n`;
      });
      xml += `  </escalada>\n`;
    }

    blocos.forEach((b, bi) => {
      xml += `  <bloco numero="${bi + 1}">\n`;
      b.noticias.forEach((n, ni) => {
        if (!n.titulo) return;
        xml += `    <noticia ordem="${ni + 1}">\n`;
        xml += `      <titulo>${escXml(n.titulo)}</titulo>\n`;
        xml += `      <imagem>${escXml(n.imagemUrl)}</imagem>\n`;
        xml += `      <escalada>${n.escalada}</escalada>\n`;
        if (n.link) xml += `      <link>${escXml(n.link)}</link>\n`;
        xml += `    </noticia>\n`;
      });
      xml += `  </bloco>\n`;
    });

    xml += `</programaExpress>`;
    return xml;
  };

  const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const handleSave = async () => {
    if (!user || !programaId) return;
    const totalNews = blocos.reduce((s, b) => s + b.noticias.filter(n => n.titulo).length, 0);
    if (totalNews === 0) { toast.error("Adicione pelo menos uma notícia"); return; }

    setSaving(true);
    try {
      const xmlContent = generateXml();
      const escaladaItems = blocos.flatMap(b => b.noticias.filter(n => n.escalada && n.titulo));

      // Build HTML content for roteiro
      let html = `<h2 style="text-align:center;font-weight:bold;">PROGRAMA EXPRESS — ${programaNome}</h2>`;
      if (escaladaItems.length > 0) {
        html += `<h3 style="font-weight:bold;margin-top:16px;">📢 ESCALADA</h3><ul>`;
        escaladaItems.forEach(n => { html += `<li><strong>${n.titulo}</strong></li>`; });
        html += `</ul>`;
      }
      blocos.forEach((b, bi) => {
        html += `<h3 style="font-weight:bold;margin-top:16px;">📺 BLOCO ${bi + 1}</h3>`;
        b.noticias.forEach((n, ni) => {
          if (!n.titulo) return;
          html += `<p><strong>Notícia ${ni + 1}:</strong> ${n.titulo}</p>`;
          if (n.imagemUrl) html += `<p><em>Imagem:</em> <a href="${n.imagemUrl}">${n.imagemUrl}</a></p>`;
        });
      });

      // Upload XML first to get URL
      const blob = new Blob([xmlContent], { type: "application/xml" });
      const fileName = `express_${programaId}_${Date.now()}.xml`;
      const filePath = `express/${user.id}/${fileName}`;
      await supabase.storage.from("empresa-assets").upload(filePath, blob, { upsert: true, contentType: "application/xml" });
      const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(filePath);
      const xmlUrl = urlData.publicUrl;

      // Store blocos as JSON in participantes for edit reconstruction
      const blocosJson = JSON.stringify(blocos);

      if (editingId) {
        // Update existing
        const { error } = await supabase.from("roteiros").update({
          programa_nome: programaNome,
          estudio,
          titulo: `PROGRAMA EXPRESS — ${programaNome}`,
          subtitulo: `express_xml::${xmlUrl}`,
          conteudo_html: html,
          participantes: blocosJson,
        }).eq("id", editingId);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase.from("roteiros").insert({
          user_id: user.id,
          programa_nome: programaNome,
          estudio,
          titulo: `PROGRAMA EXPRESS — ${programaNome}`,
          subtitulo: `express_xml::${xmlUrl}`,
          tipo_programa: "Jornalístico",
          data_programa: new Date().toISOString().split("T")[0],
          horario: new Date().toTimeString().slice(0, 5),
          conteudo_html: html,
          participantes: blocosJson,
          status: "feito",
        });
        if (error) throw error;
      }

      toast.success("Programa Express salvo com sucesso!");
      reset();
      onOpenChange(false);
      onFinish();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar Programa Express");
    }
    setSaving(false);
  };

  const inputStyle = {
    backgroundColor: "rgba(13,4,70,0.03)",
    border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)",
    color: "var(--layout-page-text, #1a1a1a)",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onOpenChange(false); } }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto overflow-x-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "none" }}>
        <button onClick={() => { reset(); onOpenChange(false); }} className="absolute top-3 right-3 rounded-full p-1 hover:opacity-70 transition-opacity" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
          <XIcon size={18} />
        </button>

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            <Zap size={20} style={{ color: "var(--layout-accent-color, #2ec1f7)" }} />
            {editingId ? "Editar Programa Express" : "Programa Express"}
          </DialogTitle>
        </DialogHeader>

        {/* Estudio + Programa */}
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <label className="text-[11px] font-semibold mb-1 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Estúdio</label>
            <select value={estudio} onChange={e => { setEstudio(e.target.value); setProgramaId(""); }} className="w-full px-3 py-2 rounded-xl text-xs outline-none" style={inputStyle}>
              <option value="">Selecione</option>
              {estudios.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold mb-1 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Programa</label>
            <select value={programaId} onChange={e => setProgramaId(e.target.value)} className="w-full px-3 py-2 rounded-xl text-xs outline-none" style={inputStyle}>
              <option value="">Selecione</option>
              {filteredProgramas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        </div>

        {/* Blocos */}
        <div className="space-y-4 mt-4">
          {blocos.map((bloco, bi) => (
            <div key={bi} className="rounded-xl p-3" style={{ border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 30%, transparent)", backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 4%, transparent)" }}>
              <div className="flex items-center justify-between mb-2 cursor-pointer" onClick={() => toggleCollapse(bi)}>
                <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: "var(--layout-accent-color, #2ec1f7)" }}>
                  📺 BLOCO {bi + 1}
                  <span className="text-[10px] font-normal" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                    ({bloco.noticias.length} {bloco.noticias.length === 1 ? "notícia" : "notícias"})
                  </span>
                </p>
                <div className="flex items-center gap-1">
                  {blocos.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); removeBloco(bi); }} className="p-1 rounded-full hover:opacity-70" style={{ color: "#ef4444" }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                  {collapsedBlocos.has(bi) ? <ChevronDown size={14} style={{ color: "var(--layout-page-text)" }} /> : <ChevronUp size={14} style={{ color: "var(--layout-page-text)" }} />}
                </div>
              </div>

              {!collapsedBlocos.has(bi) && (
                <div className="space-y-3">
                  {bloco.noticias.map((noticia, ni) => (
                    <NoticiaItem
                      key={ni}
                      noticia={noticia}
                      bi={bi}
                      ni={ni}
                      inputStyle={inputStyle}
                      fetchingLink={fetchingLink}
                      onUpdate={updateNoticia}
                      onRemove={removeNoticia}
                      onFetchLink={fetchFromLink}
                      canRemove={bloco.noticias.length > 1}
                    />
                  ))}
                  <button onClick={() => addNoticia(bi)} className="flex items-center gap-1 text-[11px] font-semibold py-1.5 px-3 rounded-full hover:opacity-80 transition-all" style={{ color: "var(--layout-accent-color, #2ec1f7)", border: "1px dashed color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 40%, transparent)" }}>
                    <Plus size={12} /> Adicionar notícia
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <button onClick={addBloco} className="w-full py-2.5 rounded-xl text-xs font-bold transition-all hover:opacity-80 mt-2" style={{ border: "2px dashed color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 40%, transparent)", color: "var(--layout-accent-color, #2ec1f7)", backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 4%, transparent)" }}>
          <Plus size={14} className="inline mr-1" /> Adicionar Bloco {blocos.length + 1}
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || !programaId}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 mt-3 flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, var(--layout-accent-color, #2ec1f7), color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 70%, white 30%))", color: "var(--layout-header-text, #ffffff)", boxShadow: "0 4px 16px color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 30%, transparent)" }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
          {saving ? "Salvando..." : "Finalizar Programa Express"}
        </button>
      </DialogContent>
    </Dialog>
  );
}

/* Sub-component for each noticia row */
function NoticiaItem({ noticia, bi, ni, inputStyle, fetchingLink, onUpdate, onRemove, onFetchLink, canRemove }: {
  noticia: NewsItem;
  bi: number; ni: number;
  inputStyle: React.CSSProperties;
  fetchingLink: string | null;
  onUpdate: (bi: number, ni: number, field: keyof NewsItem, value: any) => void;
  onRemove: (bi: number, ni: number) => void;
  onFetchLink: (bi: number, ni: number, url: string) => void;
  canRemove: boolean;
}) {
  const [linkInput, setLinkInput] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const isFetching = fetchingLink === `${bi}-${ni}`;

  const handlePasteLink = (url: string) => {
    setLinkInput(url);
    if (url.startsWith("http")) onFetchLink(bi, ni, url);
  };

  // Auto-collapse when title is filled
  const prevTituloRef = useState({ val: noticia.titulo })[0];
  if (noticia.titulo && !prevTituloRef.val && !collapsed) {
    setTimeout(() => setCollapsed(true), 300);
  }
  prevTituloRef.val = noticia.titulo;

  // Collapsed view
  if (collapsed && noticia.titulo) {
    return (
      <div
        className="rounded-lg px-3 py-2 flex items-center justify-between cursor-pointer hover:opacity-90 transition-all"
        style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 80%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 15%, transparent)" }}
        onClick={() => setCollapsed(false)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase shrink-0" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
            Notícia {ni + 1}
          </p>
          <p className="text-[11px] truncate font-medium" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            {noticia.titulo}
          </p>
          {noticia.escalada && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 15%, transparent)", color: "var(--layout-accent-color, #2ec1f7)" }}>
              ESCALADA
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <Pencil size={12} style={{ color: "var(--layout-icon-color, #888)" }} />
          {canRemove && (
            <button onClick={(e) => { e.stopPropagation(); onRemove(bi, ni); }} className="p-0.5 rounded hover:opacity-70" style={{ color: "#ef4444" }}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg p-2.5 space-y-2 overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 80%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 15%, transparent)" }}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
          Notícia {ni + 1}
        </p>
        <div className="flex items-center gap-1">
          {noticia.titulo && (
            <button onClick={() => setCollapsed(true)} className="p-0.5 rounded hover:opacity-70" style={{ color: "var(--layout-icon-color, #888)" }}>
              <ChevronUp size={12} />
            </button>
          )}
          {canRemove && (
            <button onClick={() => onRemove(bi, ni)} className="p-0.5 rounded hover:opacity-70" style={{ color: "#ef4444" }}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Link fetch */}
      <div className="flex gap-1.5 items-center min-w-0">
        <div className="relative flex-1">
          <Link2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--layout-icon-color, #888)" }} />
          <input
            value={linkInput}
            onChange={e => setLinkInput(e.target.value)}
            onPaste={e => { const t = e.clipboardData.getData("text"); setTimeout(() => handlePasteLink(t), 50); }}
            placeholder="Cole o link da matéria"
            className="w-full pl-7 pr-3 py-1.5 rounded-lg text-[11px] outline-none"
            style={inputStyle}
          />
        </div>
        <button
          onClick={() => handlePasteLink(linkInput)}
          disabled={isFetching || !linkInput}
          className="px-2 py-1.5 rounded-lg text-[10px] font-bold disabled:opacity-30"
          style={{ backgroundColor: "var(--layout-accent-color, #2ec1f7)", color: "var(--layout-header-text, #fff)" }}
        >
          {isFetching ? <Loader2 size={12} className="animate-spin" /> : "Buscar"}
        </button>
      </div>

      {/* Manual fields */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Type size={10} style={{ color: "var(--layout-icon-color)" }} />
          <span className="text-[10px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Título / Tarja</span>
        </div>
        <input
          value={noticia.titulo}
          onChange={e => onUpdate(bi, ni, "titulo", e.target.value)}
          placeholder="Título da matéria"
          className="w-full px-3 py-1.5 rounded-lg text-[11px] outline-none"
          style={inputStyle}
        />
      </div>

      <div>
        <div className="flex items-center gap-1 mb-1">
          <Image size={10} style={{ color: "var(--layout-icon-color)" }} />
          <span className="text-[10px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>URL Imagem</span>
        </div>
        <input
          value={noticia.imagemUrl}
          onChange={e => onUpdate(bi, ni, "imagemUrl", e.target.value)}
          placeholder="https://..."
          className="w-full px-3 py-1.5 rounded-lg text-[11px] outline-none"
          style={inputStyle}
        />
      </div>

      {/* Thumbnail preview */}
      {noticia.imagemUrl && noticia.imagemUrl.startsWith("http") && (
        <img src={noticia.imagemUrl} alt="" className="w-16 h-10 object-cover rounded" onError={e => (e.currentTarget.style.display = "none")} />
      )}

      {/* Escalada checkbox */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <div
          onClick={() => onUpdate(bi, ni, "escalada", !noticia.escalada)}
          className="w-4 h-4 rounded border flex items-center justify-center transition-all cursor-pointer"
          style={{
            borderColor: noticia.escalada ? "var(--layout-accent-color, #2ec1f7)" : "color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)",
            backgroundColor: noticia.escalada ? "var(--layout-accent-color, #2ec1f7)" : "transparent",
          }}
        >
          {noticia.escalada && <Check size={10} style={{ color: "var(--layout-header-text, #fff)" }} />}
        </div>
        <span className="text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Escalada</span>
      </label>
    </div>
  );
}
