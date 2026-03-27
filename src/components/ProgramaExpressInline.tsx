import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Zap, Plus, Trash2, Link2, Loader2, Image, Type, Check, X as XIcon, ChevronDown, ChevronUp, Pencil, Users, Search, UserPlus, ClipboardPaste, ArrowUp, ArrowDown, CheckCircle2 } from "lucide-react";
import { decodeHtmlEntities } from "@/lib/textEncoding";

interface Participante {
  nome: string;
  cargo: string;
  instagram: string;
}

const BLOCK_COLORS = [
  "#2ec1f7", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
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
  participantes?: Participante[];
}

interface Props {
  programas: Programa[];
  estudios: string[];
  onFinish: () => void;
  editData?: ExpressEditData | null;
}

/* Inline participant row with editable cargo */
function ParticipanteRow({ participante, inputStyle, onRemove, onUpdateCargo, userId }: {
  participante: Participante;
  inputStyle: React.CSSProperties;
  onRemove: () => void;
  onUpdateCargo: (cargo: string) => void;
  userId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [cargoVal, setCargoVal] = useState(participante.cargo);

  const saveCargo = async () => {
    setEditing(false);
    const trimmed = cargoVal.trim();
    if (trimmed !== participante.cargo) {
      onUpdateCargo(trimmed);
      await supabase.from("apresentadores").update({ cargo: trimmed }).eq("nome", participante.nome).eq("user_id", userId);
    }
  };

  return (
    <div
      className="grid w-full grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] overflow-hidden"
      style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 90%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 12%, transparent)" }}
    >
      <span className="font-semibold truncate min-w-0" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{participante.nome}</span>
      {editing ? (
        <input autoFocus value={cargoVal} onChange={e => setCargoVal(e.target.value)} onBlur={saveCargo} onKeyDown={e => { if (e.key === "Enter") saveCargo(); }} className="w-full px-1.5 py-0.5 rounded text-[10px] outline-none min-w-0" style={inputStyle} placeholder="Cargo..." />
      ) : (
        <button type="button" onClick={() => { setCargoVal(participante.cargo); setEditing(true); }} className="text-[10px] min-w-0 cursor-pointer hover:opacity-70 flex items-center gap-0.5 text-left" style={{ color: participante.cargo ? "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 35%, transparent)" }} title="Clique para editar cargo">
          <span className="truncate">{participante.cargo || "..."}</span>
          <Pencil size={9} className="shrink-0" />
        </button>
      )}
      <span className="text-[10px] truncate min-w-0" style={{ color: "var(--layout-accent-color, #2ec1f7)" }}>
        {participante.instagram ? `@${participante.instagram.replace("@", "")}` : "..."}
      </span>
      <button onClick={onRemove} className="p-0.5 rounded hover:opacity-70 shrink-0" style={{ color: "#ef4444" }}>
        <Trash2 size={11} />
      </button>
    </div>
  );
}

export default function ProgramaExpressInline({ programas, estudios, onFinish, editData }: Props) {
  const { user } = useAuth();
  const [estudio, setEstudio] = useState("");
  const [programaId, setProgramaId] = useState("");
  const [blocos, setBlocos] = useState<Bloco[]>([{ noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }]);
  const [fetchingLink, setFetchingLink] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [collapsedBlocos, setCollapsedBlocos] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [showPastePopup, setShowPastePopup] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [escaladaList, setEscaladaList] = useState<{titulo: string; imagemUrl: string}[]>([]);
  const [searchNome, setSearchNome] = useState("");
  const [searchResults, setSearchResults] = useState<Participante[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContact, setNewContact] = useState<{ nome: string; cargo: string; instagram: string; whatsapp: string }>({ nome: "", cargo: "", instagram: "", whatsapp: "" });
  const [savingContact, setSavingContact] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const filteredProgramas = estudio ? programas.filter(p => p.estudio === estudio) : programas;
  const programaNome = programas.find(p => p.id === programaId)?.nome || "";

  // Search apresentadores
  useEffect(() => {
    if (!searchNome.trim() || !user) { setSearchResults([]); setNoResults(false); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("apresentadores")
        .select("nome, cargo, instagram")
        .eq("user_id", user.id)
        .ilike("nome", `%${searchNome}%`)
        .limit(5);
      if (data && data.length > 0) {
        setSearchResults(data.map(d => ({ nome: d.nome, cargo: d.cargo || "", instagram: d.instagram || "" })));
        setNoResults(false);
      } else {
        setSearchResults([]);
        setNoResults(true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchNome, user]);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Load edit data
  useEffect(() => {
    if (editData && !initialized) {
      setEstudio(editData.estudio);
      setProgramaId(editData.programaId);
      setBlocos(editData.blocos.length > 0 ? editData.blocos : [{ noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }]);
      setParticipantes(editData.participantes || []);
      setEditingId(editData.roteiroId);
      setInitialized(true);
    }
  }, [editData, initialized]);

  const addParticipante = (p: Participante) => {
    if (participantes.some(x => x.nome === p.nome)) { toast.info("Participante já adicionado"); return; }
    setParticipantes(prev => [...prev, p]);
    setSearchNome("");
    setSearchResults([]);
    setShowResults(false);
  };

  const removeParticipante = (idx: number) => {
    setParticipantes(prev => prev.filter((_, i) => i !== idx));
  };

  const openNewContactPopup = () => {
    setNewContact({ nome: searchNome.trim(), cargo: "", instagram: "", whatsapp: "" });
    setShowNewContact(true);
    setShowResults(false);
    setNoResults(false);
  };

  const saveNewContact = async () => {
    if (!user || !newContact.nome.trim()) return;
    setSavingContact(true);
    try {
      const { error } = await supabase.from("apresentadores").insert({
        user_id: user.id,
        nome: newContact.nome.trim(),
        cargo: newContact.cargo.trim(),
        instagram: newContact.instagram.trim(),
        whatsapp: newContact.whatsapp.trim(),
      });
      if (error) throw error;
      addParticipante({ nome: newContact.nome.trim(), cargo: newContact.cargo.trim(), instagram: newContact.instagram.trim() });
      setShowNewContact(false);
      toast.success("Contato salvo e adicionado!");
    } catch {
      toast.error("Erro ao salvar contato");
    }
    setSavingContact(false);
  };

  const reset = () => {
    setEstudio("");
    setProgramaId("");
    setBlocos([{ noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }]);
    setFetchingLink(null);
    setSaving(false);
    setCollapsedBlocos(new Set());
    setEditingId(null);
    setInitialized(false);
    setParticipantes([]);
    setEscaladaList([]);
    setSearchNome("");
    setSearchResults([]);
    setShowResults(false);
    setNoResults(false);
    setShowNewContact(false);
  };

  const parsePastedScript = () => {
    if (!pasteText.trim()) { toast.error("Cole o texto do roteiro"); return; }
    const linhas = pasteText.split('\n').map(l => l.trim()).filter(l => l !== '');
    if (linhas.length < 2) { toast.error("O roteiro precisa de pelo menos 2 linhas"); return; }
    const cleanLabel = (s: string) => s.replace(/\*+/g, "").replace(/^[-•–]\s+/, "").replace(/^\d+[\.\)]\s*/, "").trim();
    const extractUrl = (s: string): string | null => {
      const mdLink = s.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
      if (mdLink) return mdLink[1];
      const plainUrl = s.match(/(https?:\/\/[^\s]+)/);
      if (plainUrl) return plainUrl[1];
      return null;
    };

    let parsedEstudio = "";
    let parsedPrograma = "";
    const parsedParticipantes: Participante[] = [];
    const parsedEscalada: string[] = [];
    const parsedBlocos: Bloco[] = [];
    let secaoAtual = "cabecalho";
    let blocoAtual: NewsItem[] | null = null;

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const cleaned = cleanLabel(linha);
      if (i === 0) { const estMatch = cleaned.match(/^est[uú]dio\s*:\s*(.+)/i); parsedEstudio = estMatch ? estMatch[1].trim() : cleaned; continue; }
      if (i === 1) { const progMatch = cleaned.match(/^programa\s*:\s*(.+)/i); parsedPrograma = progMatch ? progMatch[1].trim() : cleaned; continue; }
      if (linha.replace(/\*/g, "").trim().toUpperCase().startsWith("EQUIPE")) { secaoAtual = "equipe"; continue; }
      if (linha.replace(/\*/g, "").trim().toUpperCase().startsWith("ESCALADA")) { secaoAtual = "escalada"; continue; }
      if (linha.replace(/\*/g, "").trim().toUpperCase().startsWith("BLOCO")) { secaoAtual = "blocos"; if (blocoAtual && blocoAtual.length > 0) parsedBlocos.push({ noticias: blocoAtual }); blocoAtual = []; continue; }
      if (secaoAtual === "equipe") {
        const partes = cleaned.match(/(.*?)[\s]*[-–—][\s]*(.*?):(.*)/);
        if (partes) { const nome = partes[1].trim(); const cargo = partes[2].trim(); let instagram = partes[3].trim(); if (instagram && !instagram.startsWith("@")) instagram = `@${instagram}`; if (nome) parsedParticipantes.push({ nome, cargo, instagram }); }
        else if (cleaned) parsedParticipantes.push({ nome: cleaned, cargo: "", instagram: "" });
      } else if (secaoAtual === "escalada") { const item = cleaned.replace(/\*$/, "").trim(); if (item) parsedEscalada.push(item); }
      else if (secaoAtual === "blocos" && blocoAtual) { if (!cleaned) continue; const url = extractUrl(linha); blocoAtual.push({ titulo: url ? "" : cleaned, imagemUrl: "", escalada: false, link: url || undefined }); }
    }
    if (blocoAtual && blocoAtual.length > 0) parsedBlocos.push({ noticias: blocoAtual });
    if (parsedEstudio) { const matched = estudios.find(e => e.toLowerCase() === parsedEstudio.toLowerCase()); if (matched) setEstudio(matched); else { setEstudio(parsedEstudio); toast.info(`Estúdio "${parsedEstudio}" não encontrado na lista`); } }
    if (parsedPrograma) { const matched = programas.find(p => p.nome.toLowerCase() === parsedPrograma.toLowerCase()); if (matched) setProgramaId(matched.id); else { const partial = programas.find(p => p.nome.toLowerCase().includes(parsedPrograma.toLowerCase()) || parsedPrograma.toLowerCase().includes(p.nome.toLowerCase())); if (partial) setProgramaId(partial.id); else toast.warning(`Programa "${parsedPrograma}" não encontrado`); } }
    if (parsedParticipantes.length > 0) setParticipantes(parsedParticipantes);
    if (parsedEscalada.length > 0) setEscaladaList(parsedEscalada.map(t => ({ titulo: t, imagemUrl: "" })));
    if (parsedBlocos.length > 0) setBlocos(parsedBlocos);
    setShowPastePopup(false);
    setPasteText("");
    toast.success("Roteiro importado com sucesso!");
    if (parsedBlocos.length > 0) {
      const linksToFetch: { bi: number; ni: number; url: string }[] = [];
      parsedBlocos.forEach((b, bi) => { b.noticias.forEach((n, ni) => { if (n.link && n.link.startsWith("http")) linksToFetch.push({ bi, ni, url: n.link }); }); });
      if (linksToFetch.length > 0) { toast.info(`Buscando dados de ${linksToFetch.length} links...`); linksToFetch.forEach(({ bi, ni, url }) => fetchFromLink(bi, ni, url)); }
    }
  };

  const updateNoticia = (bi: number, ni: number, field: keyof NewsItem, value: any) => {
    setBlocos(prev => {
      const updated = prev.map((b, i) => i === bi ? { ...b, noticias: b.noticias.map((n, j) => j === ni ? { ...n, [field]: value } : n) } : b);
      // Sync escaladaList when escalada checkbox is toggled
      if (field === "escalada") {
        const noticia = prev[bi]?.noticias[ni];
        if (noticia) {
          if (value && noticia.titulo) {
            setEscaladaList(prevList => {
              if (prevList.some(e => e.titulo === noticia.titulo)) return prevList;
              return [...prevList, { titulo: noticia.titulo, imagemUrl: noticia.imagemUrl || "" }];
            });
          } else if (!value && noticia.titulo) {
            setEscaladaList(prevList => prevList.filter(e => e.titulo !== noticia.titulo));
          }
        }
      }
      return updated;
    });
  };
  const addNoticia = (bi: number) => { setBlocos(prev => prev.map((b, i) => i === bi ? { ...b, noticias: [...b.noticias, { titulo: "", imagemUrl: "", escalada: false }] } : b)); };
  const removeNoticia = (bi: number, ni: number) => { setBlocos(prev => prev.map((b, i) => i === bi ? { ...b, noticias: b.noticias.filter((_, j) => j !== ni) } : b)); };
  const addBloco = () => { setBlocos(prev => [...prev, { noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }]); };
  const removeBloco = (bi: number) => { setBlocos(prev => prev.filter((_, i) => i !== bi)); setCollapsedBlocos(prev => { const n = new Set(prev); n.delete(bi); return n; }); };
  const toggleCollapse = (bi: number) => { setCollapsedBlocos(prev => { const n = new Set(prev); if (n.has(bi)) n.delete(bi); else n.add(bi); return n; }); };

  const fetchFromLink = async (bi: number, ni: number, url: string) => {
    if (!url.startsWith("http")) return;
    setFetchingLink(`${bi}-${ni}`);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-rss", { body: { url } });
      if (!error && data?.ok && data.content) {
        const html = data.content as string;
        const getMetaContent = (property: string): string => {
          const patterns = [
            new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
            new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
            new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
            new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, "i"),
          ];
          for (const p of patterns) { const m = html.match(p); if (m?.[1]) return m[1]; }
          return "";
        };
        const title = getMetaContent("og:title") || getMetaContent("twitter:title") || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").trim();
        const image = getMetaContent("og:image") || getMetaContent("twitter:image");
        const decodeFull = (v: string) => { let s = v; for (let i = 0; i < 3; i++) { const d = decodeHtmlEntities(s); if (d === s) break; s = d; } return s; };
        if (title) updateNoticia(bi, ni, "titulo", decodeFull(title));
        if (image) updateNoticia(bi, ni, "imagemUrl", decodeFull(image));
        updateNoticia(bi, ni, "link", url);
        if (title) toast.success("Dados extraídos do link!"); else toast.warning("Link carregado, mas não foi possível extrair o título");
      } else { toast.error("Não foi possível acessar o link"); }
    } catch { toast.error("Não foi possível extrair dados do link"); }
    setFetchingLink(null);
  };

  const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const generateXml = (): string => {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<programaExpress>\n`;
    xml += `  <programa>${programaNome}</programa>\n  <estudio>${estudio}</estudio>\n  <data>${new Date().toISOString().split("T")[0]}</data>\n`;
    if (participantes.length > 0) { xml += `  <participantes>\n`; participantes.forEach((p, pi) => { xml += `    <participante${pi + 1}>\n      <nome>${escXml(p.nome)}</nome>\n      <cargo>${escXml(p.cargo)}</cargo>\n      <instagram>${escXml(p.instagram)}</instagram>\n    </participante${pi + 1}>\n`; }); xml += `  </participantes>\n`; }
    if (escaladaList.length > 0) { xml += `  <escalada>\n`; escaladaList.forEach((e, i) => { xml += `    <item ordem="${i + 1}">\n      <titulo>${escXml(e.titulo)}</titulo>\n      <imagem>${escXml(e.imagemUrl)}</imagem>\n    </item>\n`; }); xml += `  </escalada>\n`; }
    blocos.forEach((b, bi) => { xml += `  <bloco numero="${bi + 1}">\n`; b.noticias.forEach((n, ni) => { if (!n.titulo) return; xml += `    <noticia ordem="${ni + 1}">\n      <titulo>${escXml(n.titulo)}</titulo>\n      <imagem>${escXml(n.imagemUrl)}</imagem>\n      <escalada>${n.escalada}</escalada>\n    </noticia>\n`; }); xml += `  </bloco>\n`; });
    xml += `</programaExpress>`;
    return xml;
  };

  const handleSave = async () => {
    if (!user || !programaId) return;
    const totalNews = blocos.reduce((s, b) => s + b.noticias.filter(n => n.titulo).length, 0);
    if (totalNews === 0) { toast.error("Adicione pelo menos uma notícia"); return; }
    setSaving(true);
    try {
      const xmlContent = generateXml();
      let html = `<h2 style="text-align:center;font-weight:bold;">PROGRAMA EXPRESS — ${programaNome}</h2>`;
      if (participantes.length > 0) { html += `<h3 style="font-weight:bold;margin-top:16px;">👥 PARTICIPANTES</h3><ul>`; participantes.forEach(p => { html += `<li><strong>${p.nome}</strong>${p.cargo ? ` — ${p.cargo}` : ""}${p.instagram ? ` (@${p.instagram.replace("@", "")})` : ""}</li>`; }); html += `</ul>`; }
      if (escaladaList.length > 0) { html += `<h3 style="font-weight:bold;margin-top:16px;">📢 ESCALADA</h3><ul>`; escaladaList.forEach(e => { html += `<li><strong>${e.titulo}</strong></li>`; }); html += `</ul>`; }
      blocos.forEach((b, bi) => { html += `<h3 style="font-weight:bold;margin-top:16px;">📺 BLOCO ${bi + 1}</h3>`; b.noticias.forEach((n, ni) => { if (!n.titulo) return; html += `<p><strong>Notícia ${ni + 1}:</strong> ${n.titulo}</p>`; if (n.imagemUrl) html += `<p><em>Imagem:</em> <a href="${n.imagemUrl}">${n.imagemUrl}</a></p>`; }); });

      const blob = new Blob([xmlContent], { type: "application/xml" });
      const fileName = `express_${programaId}_${Date.now()}.xml`;
      const filePath = `express/${user.id}/${fileName}`;
      await supabase.storage.from("empresa-assets").upload(filePath, blob, { upsert: true, contentType: "application/xml" });
      const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(filePath);
      const xmlUrl = urlData.publicUrl;
      const blocosJson = JSON.stringify({ blocos, participantes });

      if (editingId) {
        const { error } = await supabase.from("roteiros").update({ programa_nome: programaNome, estudio, titulo: `PROGRAMA EXPRESS — ${programaNome}`, subtitulo: `express_xml::${xmlUrl}`, conteudo_html: html, participantes: blocosJson }).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("roteiros").insert({ user_id: user.id, programa_nome: programaNome, estudio, titulo: `PROGRAMA EXPRESS — ${programaNome}`, subtitulo: `express_xml::${xmlUrl}`, tipo_programa: "Jornalístico", data_programa: new Date().toISOString().split("T")[0], horario: new Date().toTimeString().slice(0, 5), conteudo_html: html, participantes: blocosJson, status: "feito" });
        if (error) throw error;
      }
      toast.success("Programa Express salvo com sucesso!");
      reset();
      onFinish();
    } catch (e) { console.error(e); toast.error("Erro ao salvar Programa Express"); }
    setSaving(false);
  };

  const inputStyle = {
    backgroundColor: "rgba(13,4,70,0.03)",
    border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 35%, transparent)",
    color: "var(--layout-page-text, #1a1a1a)",
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#ffffff", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)" }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #0d0446), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", color: "var(--layout-header-text, #ffffff)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
            <Zap size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold drop-shadow-sm">{editingId ? "Editar Programa Express" : "Programa Express"}</h3>
            <p className="text-xs drop-shadow-sm" style={{ opacity: 0.8 }}>Monte seu roteiro de forma rápida</p>
          </div>
        </div>
        <button
          onClick={() => setShowPastePopup(true)}
          className="flex items-center gap-1.5 text-[11px] font-semibold py-1.5 px-3 rounded-lg hover:opacity-80 transition-all"
          style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "var(--layout-header-text, #ffffff)" }}
        >
          <ClipboardPaste size={13} /> Colar Roteiro
        </button>
      </div>

      <div className="p-6 space-y-5">
        {/* Paste Script */}
        {showPastePopup && (
          <div className="rounded-xl p-3 space-y-2" style={{ border: "2px solid var(--layout-accent-color, #2ec1f7)", backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 6%, transparent)" }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: "var(--layout-accent-color, #2ec1f7)" }}>
                <ClipboardPaste size={14} /> Colar Roteiro
              </p>
              <button onClick={() => { setShowPastePopup(false); setPasteText(""); }} className="p-0.5 rounded hover:opacity-70" style={{ color: "var(--layout-page-text)" }}>
                <XIcon size={14} />
              </button>
            </div>
            <p className="text-[10px] leading-relaxed" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
              Cole o texto seguindo o formato:<br/>
              <strong>Estúdio:</strong> Nome do Estúdio<br/>
              <strong>Programa:</strong> Nome do Programa<br/>
              <strong>EQUIPE:</strong> Nome – cargo : @instagram<br/>
              <strong>ESCALADA:</strong> títulos numerados<br/>
              <strong>BLOCO 1:</strong> links ou textos das tarjas
            </p>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder={"Estúdio: Estudio FM\nPrograma: Papo Cabeça\n\nEQUIPE:\n- Henrique – âncora: @henrique\n\nESCALADA:\n1. TÍTULO 1\n\nBLOCO 1:\n- https://link.com"}
              className="w-full px-3 py-2 rounded-lg text-[11px] outline-none resize-none"
              rows={10}
              style={inputStyle}
            />
            <button onClick={parsePastedScript} disabled={!pasteText.trim()} className="w-full py-2 rounded-lg text-[11px] font-bold transition-all hover:opacity-90 flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ backgroundColor: "var(--layout-accent-color, #2ec1f7)", color: "var(--layout-header-text, #fff)" }}>
              <Check size={12} /> Importar Roteiro
            </button>
          </div>
        )}

        {/* Estudio + Programa */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Identificação do programa</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold mb-1.5 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Estúdio</label>
              <select value={estudio} onChange={e => { setEstudio(e.target.value); setProgramaId(""); }} className="w-full px-3 py-2.5 rounded-xl text-xs outline-none transition-all" style={inputStyle}>
                <option value="">Selecione</option>
                {estudios.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold mb-1.5 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Programa</label>
              <select value={programaId} onChange={e => setProgramaId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-xs outline-none transition-all" style={inputStyle}>
                <option value="">Selecione</option>
                {filteredProgramas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="h-px" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)" }} />

        {/* Participantes */}
        <div className="rounded-xl p-4" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 25%, transparent)", backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 4%, transparent)" }}>
          <p className="text-xs font-bold flex items-center gap-1.5 mb-3" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            <Users size={14} style={{ color: "var(--layout-accent-color, #2ec1f7)" }} />
            Participantes
          </p>
          {participantes.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {participantes.map((p, idx) => (
                <ParticipanteRow key={idx} participante={p} inputStyle={inputStyle} onRemove={() => removeParticipante(idx)} onUpdateCargo={(cargo) => { setParticipantes(prev => prev.map((x, i) => i === idx ? { ...x, cargo } : x)); }} userId={user?.id || ""} />
              ))}
            </div>
          )}
          <div ref={searchRef} className="relative">
            <div className="flex gap-1.5 items-center">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--layout-icon-color, #888)" }} />
                <input value={searchNome} onChange={e => { setSearchNome(e.target.value); setShowResults(true); }} onFocus={() => { if (searchResults.length > 0 || noResults) setShowResults(true); }} placeholder="Buscar participante pelo nome..." className="w-full pl-7 pr-3 py-2 rounded-lg text-[11px] outline-none" style={inputStyle} />
              </div>
            </div>
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 25%, transparent)" }}>
                {searchResults.map((r, i) => (
                  <button key={i} onClick={() => addParticipante(r)} className="w-full text-left px-3 py-2 text-[11px] hover:opacity-80 transition-all flex items-center gap-2" style={{ color: "var(--layout-page-text, #1a1a1a)", borderBottom: i < searchResults.length - 1 ? "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 10%, transparent)" : "none" }}>
                    <span className="font-semibold flex-1 truncate">{r.nome}</span>
                    {r.cargo && <span className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>{r.cargo}</span>}
                    {r.instagram && <span className="text-[10px]" style={{ color: "var(--layout-accent-color, #2ec1f7)" }}>@{r.instagram.replace("@", "")}</span>}
                  </button>
                ))}
              </div>
            )}
            {showResults && noResults && searchNome.trim().length > 1 && (
              <div className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden p-3" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 25%, transparent)" }}>
                <p className="text-[11px] mb-2" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nenhum resultado para "<strong>{searchNome}</strong>".</p>
                <button onClick={openNewContactPopup} className="flex items-center gap-1.5 text-[11px] font-semibold py-1.5 px-3 rounded-lg hover:opacity-80 transition-all" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 12%, transparent)", color: "var(--layout-accent-color, #2ec1f7)" }}>
                  <UserPlus size={12} /> Vamos salvar esse contato?
                </button>
              </div>
            )}
          </div>
        </div>

        {/* New Contact */}
        {showNewContact && (
          <div className="rounded-xl p-3 space-y-2" style={{ border: "2px solid var(--layout-accent-color, #2ec1f7)", backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 6%, transparent)" }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: "var(--layout-accent-color, #2ec1f7)" }}><UserPlus size={14} /> Novo Participante</p>
              <button onClick={() => setShowNewContact(false)} className="p-0.5 rounded hover:opacity-70" style={{ color: "var(--layout-page-text)" }}><XIcon size={14} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[10px] font-semibold mb-0.5 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nome</label><input value={newContact.nome} onChange={e => setNewContact(p => ({ ...p, nome: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none" style={inputStyle} /></div>
              <div><label className="text-[10px] font-semibold mb-0.5 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Cargo</label><input value={newContact.cargo} onChange={e => setNewContact(p => ({ ...p, cargo: e.target.value }))} placeholder="Ex: Repórter" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none" style={inputStyle} /></div>
              <div><label className="text-[10px] font-semibold mb-0.5 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Instagram</label><input value={newContact.instagram} onChange={e => setNewContact(p => ({ ...p, instagram: e.target.value }))} placeholder="@usuario" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none" style={inputStyle} /></div>
              <div><label className="text-[10px] font-semibold mb-0.5 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>WhatsApp</label><input value={newContact.whatsapp} onChange={e => setNewContact(p => ({ ...p, whatsapp: e.target.value }))} placeholder="(00) 00000-0000" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none" style={inputStyle} /></div>
            </div>
            <button onClick={saveNewContact} disabled={savingContact || !newContact.nome.trim()} className="w-full py-2 rounded-lg text-[11px] font-bold transition-all hover:opacity-90 flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ backgroundColor: "var(--layout-accent-color, #2ec1f7)", color: "var(--layout-header-text, #fff)" }}>
              {savingContact ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salvar e Incluir
            </button>
          </div>
        )}

        {/* Escalada */}
        <div className="rounded-xl p-4" style={{ border: "1px solid color-mix(in srgb, #f59e0b 30%, transparent)", backgroundColor: "color-mix(in srgb, #f59e0b 5%, transparent)" }}>
          <p className="text-xs font-bold flex items-center gap-1.5 mb-2" style={{ color: "#f59e0b" }}>
            📢 Escalada
            {escaladaList.length > 0 && <span className="text-[10px] font-normal" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>({escaladaList.length} {escaladaList.length === 1 ? "item" : "itens"})</span>}
          </p>
          <div className="space-y-1.5">
            {escaladaList.map((item, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold shrink-0 w-5 text-center" style={{ color: "#f59e0b" }}>{idx + 1}.</span>
                <div className="flex flex-col shrink-0">
                  <button onClick={() => { if (idx === 0) return; setEscaladaList(prev => { const c = [...prev]; [c[idx - 1], c[idx]] = [c[idx], c[idx - 1]]; return c; }); }} disabled={idx === 0} className="p-0.5 rounded hover:opacity-70 disabled:opacity-20" style={{ color: "#f59e0b" }}><ArrowUp size={10} /></button>
                  <button onClick={() => { if (idx === escaladaList.length - 1) return; setEscaladaList(prev => { const c = [...prev]; [c[idx], c[idx + 1]] = [c[idx + 1], c[idx]]; return c; }); }} disabled={idx === escaladaList.length - 1} className="p-0.5 rounded hover:opacity-70 disabled:opacity-20" style={{ color: "#f59e0b" }}><ArrowDown size={10} /></button>
                </div>
                {item.imagemUrl && item.imagemUrl.startsWith("http") && (
                  <img src={item.imagemUrl} alt="" className="w-10 h-7 object-cover rounded shrink-0" onError={e => (e.currentTarget.style.display = "none")} />
                )}
                <input value={item.titulo} onChange={e => setEscaladaList(prev => prev.map((v, i) => i === idx ? { ...v, titulo: e.target.value } : v))} className="flex-1 px-2.5 py-1.5 rounded-lg text-[11px] outline-none min-w-0" style={inputStyle} placeholder="Título da manchete..." />
                <button onClick={() => setEscaladaList(prev => prev.filter((_, i) => i !== idx))} className="p-1 rounded-full hover:opacity-70 shrink-0" style={{ color: "#ef4444" }}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
          <button onClick={() => setEscaladaList(prev => [...prev, { titulo: "", imagemUrl: "" }])} className="flex items-center gap-1 text-[11px] font-semibold py-1.5 px-3 rounded-full hover:opacity-80 transition-all mt-2" style={{ color: "#f59e0b", border: "1px dashed color-mix(in srgb, #f59e0b 40%, transparent)" }}>
            <Plus size={12} /> Adicionar manchete
          </button>
        </div>

        {/* Blocos */}
        <div className="space-y-4 min-w-0 w-full">
          {blocos.map((bloco, bi) => (
            <div key={bi} className="rounded-xl p-3 min-w-0 w-full overflow-hidden" style={{ border: `2px solid ${BLOCK_COLORS[bi % BLOCK_COLORS.length]}44`, backgroundColor: `${BLOCK_COLORS[bi % BLOCK_COLORS.length]}0a` }}>
              <div className="flex items-center justify-between mb-2 cursor-pointer min-w-0" onClick={() => toggleCollapse(bi)}>
                <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: BLOCK_COLORS[bi % BLOCK_COLORS.length] }}>
                  📺 BLOCO {bi + 1}
                  <span className="text-[10px] font-normal" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>({bloco.noticias.length} {bloco.noticias.length === 1 ? "notícia" : "notícias"})</span>
                </p>
                <div className="flex items-center gap-1">
                  {blocos.length > 1 && <button onClick={(e) => { e.stopPropagation(); removeBloco(bi); }} className="p-1 rounded-full hover:opacity-70" style={{ color: "#ef4444" }}><Trash2 size={13} /></button>}
                  {collapsedBlocos.has(bi) ? <ChevronDown size={14} style={{ color: "var(--layout-page-text)" }} /> : <ChevronUp size={14} style={{ color: "var(--layout-page-text)" }} />}
                </div>
              </div>
              {!collapsedBlocos.has(bi) && (
                <div className="space-y-3">
                  {bloco.noticias.map((noticia, ni) => (
                    <NoticiaItem key={ni} noticia={noticia} bi={bi} ni={ni} inputStyle={inputStyle} fetchingLink={fetchingLink} onUpdate={updateNoticia} onRemove={removeNoticia} onFetchLink={fetchFromLink} canRemove={bloco.noticias.length > 1} />
                  ))}
                  <button onClick={() => addNoticia(bi)} className="flex items-center gap-1 text-[11px] font-semibold py-1.5 px-3 rounded-full hover:opacity-80 transition-all" style={{ color: "var(--layout-accent-color, #2ec1f7)", border: "1px dashed color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 40%, transparent)" }}>
                    <Plus size={12} /> Adicionar notícia
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <button onClick={addBloco} className="w-full py-2.5 rounded-xl text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]" style={{ border: "2px dashed color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 50%, transparent)", color: "var(--layout-accent-color, #2ec1f7)", backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 6%, transparent)" }}>
          <Plus size={14} className="inline mr-1" /> Adicionar Bloco {blocos.length + 1}
        </button>

        {/* Save */}
        <button onClick={handleSave} disabled={saving || !programaId} className="w-full py-4 rounded-xl text-sm font-bold transition-all hover:scale-[1.01] hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-2.5 disabled:opacity-40 disabled:hover:scale-100" style={{ background: "linear-gradient(135deg, var(--layout-accent-color, #2ec1f7), color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 65%, #000 35%))", color: "var(--layout-header-text, #ffffff)", boxShadow: "0 6px 24px color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 35%, transparent)", letterSpacing: "0.03em" }}>
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
          {saving ? "Salvando..." : "Finalizar Programa Express"}
        </button>
      </div>
    </div>
  );
}

/* Sub-component for each noticia row */
function NoticiaItem({ noticia, bi, ni, inputStyle, fetchingLink, onUpdate, onRemove, onFetchLink, canRemove }: {
  noticia: NewsItem; bi: number; ni: number;
  inputStyle: React.CSSProperties; fetchingLink: string | null;
  onUpdate: (bi: number, ni: number, field: keyof NewsItem, value: any) => void;
  onRemove: (bi: number, ni: number) => void;
  onFetchLink: (bi: number, ni: number, url: string) => void;
  canRemove: boolean;
}) {
  const [linkInput, setLinkInput] = useState(noticia.link || "");
  const [collapsed, setCollapsed] = useState(false);
  const isFetching = fetchingLink === `${bi}-${ni}`;

  const handlePasteLink = (url: string) => { setLinkInput(url); if (url.startsWith("http")) onFetchLink(bi, ni, url); };
  const prevTituloRef = useState({ val: noticia.titulo })[0];
  if (noticia.titulo && !prevTituloRef.val && !collapsed) { setTimeout(() => setCollapsed(true), 300); }
  prevTituloRef.val = noticia.titulo;

  if (collapsed && noticia.titulo) {
    return (
      <div className="rounded-lg px-3 py-2 flex items-center justify-between cursor-pointer hover:opacity-90 transition-all overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 80%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 15%, transparent)" }} onClick={() => setCollapsed(false)}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase shrink-0" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Notícia {ni + 1}</p>
          <p className="text-[11px] truncate font-medium" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{noticia.titulo}</p>
          {noticia.escalada && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 15%, transparent)", color: "var(--layout-accent-color, #2ec1f7)" }}>ESCALADA</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <Pencil size={12} style={{ color: "var(--layout-icon-color, #888)" }} />
          {canRemove && <button onClick={(e) => { e.stopPropagation(); onRemove(bi, ni); }} className="p-0.5 rounded hover:opacity-70" style={{ color: "#ef4444" }}><Trash2 size={12} /></button>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg p-2.5 space-y-2 w-full min-w-0 overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 80%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 15%, transparent)", maxWidth: "100%", boxSizing: "border-box" }}>
      <div className="flex items-center justify-between min-w-0">
        <p className="text-[10px] font-bold uppercase" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Notícia {ni + 1}</p>
        <div className="flex items-center gap-1 shrink-0">
          {noticia.titulo && <button onClick={() => setCollapsed(true)} className="p-0.5 rounded hover:opacity-70" style={{ color: "var(--layout-icon-color, #888)" }}><ChevronUp size={12} /></button>}
          {canRemove && <button onClick={() => onRemove(bi, ni)} className="p-0.5 rounded hover:opacity-70" style={{ color: "#ef4444" }}><Trash2 size={12} /></button>}
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 items-center w-full min-w-0 max-w-full overflow-hidden">
        <div className="relative min-w-0 max-w-full overflow-hidden">
          <Link2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--layout-icon-color, #888)" }} />
          <input value={linkInput} onChange={e => setLinkInput(e.target.value)} onPaste={e => { const t = e.clipboardData.getData("text"); setTimeout(() => handlePasteLink(t), 50); }} placeholder="Cole o link da matéria" className="block w-full min-w-0 max-w-full pl-7 pr-3 py-1.5 rounded-lg text-[11px] outline-none" style={{ ...inputStyle, width: "100%", maxWidth: "100%", boxSizing: "border-box" }} />
        </div>
        <button onClick={() => handlePasteLink(linkInput)} disabled={isFetching || !linkInput} className="px-3.5 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-30 shrink-0 flex items-center gap-1.5 transition-all hover:scale-105 hover:shadow-md active:scale-95" style={{ background: "linear-gradient(135deg, var(--layout-accent-color, #2ec1f7), color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 75%, #000 25%))", color: "var(--layout-header-text, #fff)", boxShadow: "0 2px 8px color-mix(in srgb, var(--layout-accent-color, #2ec1f7) 25%, transparent)" }}>
          {isFetching ? <Loader2 size={12} className="animate-spin" /> : <><Search size={11} /> Buscar</>}
        </button>
      </div>
      <div className="w-full min-w-0 max-w-full overflow-hidden">
        <div className="flex items-center gap-1 mb-1"><Type size={10} style={{ color: "var(--layout-icon-color)" }} /><span className="text-[10px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Título / Tarja</span></div>
        <input value={noticia.titulo} onChange={e => onUpdate(bi, ni, "titulo", e.target.value)} placeholder="Título da matéria" className="block w-full min-w-0 max-w-full px-3 py-1.5 rounded-lg text-[11px] outline-none" style={{ ...inputStyle, width: "100%", maxWidth: "100%", boxSizing: "border-box" }} />
      </div>
      <div className="w-full min-w-0 max-w-full overflow-hidden">
        <div className="flex items-center gap-1 mb-1"><Image size={10} style={{ color: "var(--layout-icon-color)" }} /><span className="text-[10px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>URL Imagem</span></div>
        <input value={noticia.imagemUrl} onChange={e => onUpdate(bi, ni, "imagemUrl", e.target.value)} placeholder="https://..." className="block w-full min-w-0 max-w-full px-3 py-1.5 rounded-lg text-[11px] outline-none" style={{ ...inputStyle, width: "100%", maxWidth: "100%", boxSizing: "border-box" }} />
      </div>
      {noticia.imagemUrl && noticia.imagemUrl.startsWith("http") && <img src={noticia.imagemUrl} alt="" className="w-16 h-10 object-cover rounded" onError={e => (e.currentTarget.style.display = "none")} />}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <div onClick={() => onUpdate(bi, ni, "escalada", !noticia.escalada)} className="w-4 h-4 rounded border flex items-center justify-center transition-all cursor-pointer" style={{ borderColor: noticia.escalada ? "var(--layout-accent-color, #2ec1f7)" : "color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)", backgroundColor: noticia.escalada ? "var(--layout-accent-color, #2ec1f7)" : "transparent" }}>
          {noticia.escalada && <Check size={10} style={{ color: "var(--layout-header-text, #fff)" }} />}
        </div>
        <span className="text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Escalada</span>
      </label>
    </div>
  );
}
