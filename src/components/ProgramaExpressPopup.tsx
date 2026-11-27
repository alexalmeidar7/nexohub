import { publishDesktopRoteiro } from "@/lib/desktopRoteiroPublish";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Zap, Plus, Trash2, Link2, Loader2, Image, Type, Check, X as XIcon, ChevronDown, ChevronUp, Pencil, Users, Search, UserPlus, ClipboardPaste, ArrowUp, ArrowDown } from "lucide-react";
import { decodeHtmlEntities } from "@/lib/textEncoding";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Participante {
  nome: string;
  cargo: string;
  instagram: string;
}

const BLOCK_COLORS = [
  "#268ffa", // azul
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
  resumo?: string;
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
  open: boolean;
  onOpenChange: (o: boolean) => void;
  programas: Programa[];
  estudios: string[];
  onFinish: () => void;
  editData?: ExpressEditData | null;
}
/* Inline participant row with editable cargo */
function ParticipanteRow({ participante, inputStyle, onRemove, onUpdateCargo, userId }: {
  participante: { nome: string; cargo: string; instagram: string };
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
      <span className="font-semibold truncate min-w-0" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
        {participante.nome}
      </span>

      {editing ? (
        <input
          autoFocus
          value={cargoVal}
          onChange={e => setCargoVal(e.target.value)}
          onBlur={saveCargo}
          onKeyDown={e => { if (e.key === "Enter") saveCargo(); }}
          className="w-full px-1.5 py-0.5 rounded text-[10px] outline-none min-w-0"
          style={inputStyle}
          placeholder="Cargo..."
        />
      ) : (
        <button
          type="button"
          onClick={() => { setCargoVal(participante.cargo); setEditing(true); }}
          className="text-[10px] min-w-0 cursor-pointer hover:opacity-70 flex items-center gap-0.5 text-left"
          style={{ color: participante.cargo ? "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 35%, transparent)" }}
          title="Clique para editar cargo"
        >
          <span className="truncate">{participante.cargo || "..."}</span>
          <Pencil size={9} className="shrink-0" />
        </button>
      )}

      <span className="text-[10px] truncate min-w-0" style={{ color: "#268ffa" }}>
        {participante.instagram ? `@${participante.instagram.replace("@", "")}` : "..."}
      </span>

      <button onClick={onRemove} className="p-0.5 rounded hover:opacity-70 shrink-0" style={{ color: "#ef4444" }}>
        <Trash2 size={11} />
      </button>
    </div>
  );
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
  const [showPastePopup, setShowPastePopup] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [escaladaList, setEscaladaList] = useState<string[]>([]);
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

  // Load edit data when popup opens
  if (open && editData && !initialized) {
    setEstudio(editData.estudio);
    setProgramaId(editData.programaId);
    setBlocos(editData.blocos.length > 0 ? editData.blocos : [{ noticias: [{ titulo: "", imagemUrl: "", escalada: false }] }]);
    setParticipantes(editData.participantes || []);
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

    // Helper: strip markdown bold (** or *), bullets, numbers for display
    const cleanLabel = (s: string) => s.replace(/\*+/g, "").replace(/^[-•–]\s+/, "").replace(/^\d+[\.\)]\s*/, "").trim();

    // Extract URL from markdown link [text](url) or plain URL
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

      // First two non-empty lines = Estúdio and Programa
      if (i === 0) {
        // Check labeled format "Estúdio: xxx"
        const estMatch = cleaned.match(/^est[uú]dio\s*:\s*(.+)/i);
        parsedEstudio = estMatch ? estMatch[1].trim() : cleaned;
        continue;
      }
      if (i === 1) {
        const progMatch = cleaned.match(/^programa\s*:\s*(.+)/i);
        parsedPrograma = progMatch ? progMatch[1].trim() : cleaned;
        continue;
      }

      // Detect section headers
      if (linha.replace(/\*/g, "").trim().toUpperCase().startsWith("EQUIPE")) {
        secaoAtual = "equipe";
        continue;
      }
      if (linha.replace(/\*/g, "").trim().toUpperCase().startsWith("ESCALADA")) {
        secaoAtual = "escalada";
        continue;
      }
      if (linha.replace(/\*/g, "").trim().toUpperCase().startsWith("BLOCO")) {
        secaoAtual = "blocos";
        // Save previous bloco
        if (blocoAtual && blocoAtual.length > 0) {
          parsedBlocos.push({ noticias: blocoAtual });
        }
        blocoAtual = [];
        continue;
      }

      // Fill data based on current section
      if (secaoAtual === "equipe") {
        // Format: "Nome – cargo : @instagram" or "Nome - cargo: @instagram"
        const partes = cleaned.match(/(.*?)[\s]*[-–—][\s]*(.*?):(.*)/);
        if (partes) {
          const nome = partes[1].trim();
          const cargo = partes[2].trim();
          let instagram = partes[3].trim();
          if (instagram && !instagram.startsWith("@")) instagram = `@${instagram}`;
          if (nome) parsedParticipantes.push({ nome, cargo, instagram });
        } else if (cleaned) {
          parsedParticipantes.push({ nome: cleaned, cargo: "", instagram: "" });
        }
      } else if (secaoAtual === "escalada") {
        const item = cleaned.replace(/\*$/, "").trim();
        if (item) parsedEscalada.push(item);
      } else if (secaoAtual === "blocos" && blocoAtual) {
        if (!cleaned) continue;
        const url = extractUrl(linha);
        blocoAtual.push({
          titulo: url ? "" : cleaned,
          imagemUrl: "",
          escalada: false,
          link: url || undefined,
        });
      }
    }

    // Push last bloco
    if (blocoAtual && blocoAtual.length > 0) {
      parsedBlocos.push({ noticias: blocoAtual });
    }

    // Set Estúdio
    if (parsedEstudio) {
      const matched = estudios.find(e => e.toLowerCase() === parsedEstudio.toLowerCase());
      if (matched) setEstudio(matched);
      else { setEstudio(parsedEstudio); toast.info(`Estúdio "${parsedEstudio}" não encontrado na lista`); }
    }

    // Set Programa
    if (parsedPrograma) {
      const matched = programas.find(p => p.nome.toLowerCase() === parsedPrograma.toLowerCase());
      if (matched) setProgramaId(matched.id);
      else {
        const partial = programas.find(p => p.nome.toLowerCase().includes(parsedPrograma.toLowerCase()) || parsedPrograma.toLowerCase().includes(p.nome.toLowerCase()));
        if (partial) setProgramaId(partial.id);
        else toast.warning(`Programa "${parsedPrograma}" não encontrado`);
      }
    }

    if (parsedParticipantes.length > 0) setParticipantes(parsedParticipantes);
    if (parsedEscalada.length > 0) setEscaladaList(parsedEscalada);
    if (parsedBlocos.length > 0) setBlocos(parsedBlocos);

    const summary = [];
    if (parsedEstudio) summary.push(`Estúdio: ${parsedEstudio}`);
    if (parsedPrograma) summary.push(`Programa: ${parsedPrograma}`);
    if (parsedParticipantes.length > 0) summary.push(`${parsedParticipantes.length} participantes`);
    if (parsedEscalada.length > 0) summary.push(`${parsedEscalada.length} escaladas`);
    if (parsedBlocos.length > 0) summary.push(`${parsedBlocos.length} blocos`);

    setShowPastePopup(false);
    setPasteText("");
    toast.success(`Importado: ${summary.join(", ")}`);

    // Auto-fetch links after import
    if (parsedBlocos.length > 0) {
      const linksToFetch: { bi: number; ni: number; url: string }[] = [];
      parsedBlocos.forEach((b, bi) => {
        b.noticias.forEach((n, ni) => {
          if (n.link && n.link.startsWith("http")) {
            linksToFetch.push({ bi, ni, url: n.link });
          }
        });
      });
      if (linksToFetch.length > 0) {
        toast.info(`Buscando dados de ${linksToFetch.length} links...`);
        // Fetch all links in parallel
        linksToFetch.forEach(({ bi, ni, url }) => {
          fetchFromLink(bi, ni, url);
        });
      }
    }
  };

  const updateNoticia = (bi: number, ni: number, field: keyof NewsItem, value: any) => {
    setBlocos(prev => {
      const noticia = prev[bi].noticias[ni];
      
      // Se estiver marcando como escalada, adiciona o resumo à lista de escaladas
      if (field === "escalada" && value === true) {
        const textToUse = noticia.resumo || noticia.titulo;
        if (textToUse && !escaladaList.includes(textToUse)) {
          setEscaladaList(current => [...current, textToUse]);
        }
      } 
      // Se estiver desmarcando, removemos da lista se o texto for exatamente igual
      else if (field === "escalada" && value === false) {
        const textToRemove = noticia.resumo || noticia.titulo;
        if (textToRemove) {
          setEscaladaList(current => current.filter(item => item !== textToRemove));
        }
      }

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
        body: { url, generate_summary: true },
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

        const rawTitle = getMetaContent("og:title") || getMetaContent("twitter:title") || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").trim();
        let title = rawTitle.includes("|") ? rawTitle.split("|")[0].trim() : rawTitle;
        if (title.includes(" - ")) title = title.split(" - ")[0].trim();
        const image = getMetaContent("og:image") || getMetaContent("twitter:image");
        const summary = data.summary;

        const decodeFull = (v: string) => {
          let s = v;
          for (let i = 0; i < 3; i++) {
            const d = decodeHtmlEntities(s);
            if (d === s) break;
            s = d;
          }
          return s;
        };
        if (title) updateNoticia(bi, ni, "titulo", decodeFull(title));
        if (image) updateNoticia(bi, ni, "imagemUrl", decodeFull(image));
        if (summary) updateNoticia(bi, ni, "resumo", decodeFull(summary));
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
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<programaExpress>\n`;
    xml += `  <programa>${programaNome}</programa>\n`;
    xml += `  <estudio>${estudio}</estudio>\n`;
    xml += `  <data>${new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}</data>\n`;

    if (participantes.length > 0) {
      xml += `  <participantes>\n`;
      participantes.forEach((p) => {
        xml += `    <item>\n`;
        xml += `      <nome>${escXml(p.nome)}</nome>\n`;
        xml += `      <cargo>${escXml(p.cargo)}</cargo>\n`;
        xml += `      <instagram>${escXml(p.instagram)}</instagram>\n`;
        xml += `    </item>\n`;
      });
      xml += `  </participantes>\n`;
    }

    if (escaladaList.length > 0) {
      xml += `  <escalada>\n`;
      escaladaList.forEach((t, i) => {
        xml += `    <item ordem="${i + 1}">\n`;
        xml += `      <titulo>${escXml(t)}</titulo>\n`;
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

      // Build HTML content for roteiro
      let html = `<h2 style="text-align:center;font-weight:bold;">PROGRAMA EXPRESS — ${programaNome}</h2>`;
      if (participantes.length > 0) {
        html += `<h3 style="font-weight:bold;margin-top:16px;">👥 PARTICIPANTES</h3><ul>`;
        participantes.forEach(p => { html += `<li><strong>${p.nome}</strong>${p.cargo ? ` — ${p.cargo}` : ""}${p.instagram ? ` (@${p.instagram.replace("@", "")})` : ""}</li>`; });
        html += `</ul>`;
      }
      if (escaladaList.length > 0) {
        html += `<h3 style="font-weight:bold;margin-top:16px;">📢 ESCALADA</h3><ul>`;
        escaladaList.forEach(t => { html += `<li><strong>${t}</strong></li>`; });
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

      const blob = new Blob([xmlContent], { type: "application/xml; charset=utf-8" });
      const fileName = `express_${programaId}_${Date.now()}.xml`;
      const filePath = `express/${user.id}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from("empresa-assets").upload(filePath, blob, { upsert: true, contentType: "application/xml; charset=utf-8" });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(filePath);
      const xmlUrl = urlData.publicUrl;

      // Store blocos + participantes as JSON for edit reconstruction
      const blocosJson = JSON.stringify({ blocos, participantes });
      const tickertitulos = blocos
        .flatMap(b => (b.noticias || []).filter(n => n?.titulo?.trim()).map(n => n.titulo.trim()))
        .join("  •  ");
      const nowIso = new Date().toISOString();
      const savedDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

      const isUuid = (v: any): v is string =>
        typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

      const payload: any = {
        programa_nome: programaNome,
        estudio,
        titulo: `PROGRAMA EXPRESS — ${programaNome}`,
        subtitulo: `express_xml::${xmlUrl}`,
        conteudo_html: html,
        participantes: blocosJson,
        tickertitulos,
        status: "feito",
        data_programa: savedDate,
        xml_pushed_at: nowIso,
        updated_at: nowIso,
      };

      // Confirm the write actually landed (an update matching 0 rows returns no error)
      let saved = false;
      if (isUuid(editingId)) {
        const upd = await supabase.from("roteiros").update(payload).eq("id", editingId).eq("user_id", user.id).select("id");
        if (upd.error) throw upd.error;
        saved = !!upd.data && upd.data.length > 0;
      }
      if (!saved) {
        const upd2 = await supabase
          .from("roteiros")
          .update(payload)
          .eq("user_id", user.id)
          .eq("programa_nome", programaNome)
          .eq("estudio", estudio)
          .is("agendado_para_envio", null)
          .select("id");
        saved = !upd2.error && !!upd2.data && upd2.data.length > 0;
      }
      if (!saved) {
        const { data: inserted, error } = await supabase.from("roteiros").insert({
          ...payload,
          user_id: user.id,
          tipo_programa: "Jornalístico",
          data_programa: savedDate,
          horario: new Date().toTimeString().slice(0, 5),
        }).select("id").single();
        if (error || !inserted?.id) throw error || new Error("Roteiro não persistido");
      }
      const { data: confirmed, error: confirmError } = await supabase.from("roteiros")
         .select("id, participantes")
         .eq("user_id", user.id)
         .eq("programa_nome", programaNome)
         .eq("estudio", estudio)
         .is("agendado_para_envio", null)
         .order("updated_at", { ascending: false })
         .limit(1).maybeSingle();
      if (confirmError || !confirmed || JSON.stringify(typeof confirmed.participantes === "string" ? JSON.parse(confirmed.participantes) : confirmed.participantes) !== JSON.stringify(JSON.parse(blocosJson))) {
        throw confirmError || new Error("O conteúdo do roteiro não foi confirmado no banco de dados");
      }


      const clientAcc = findClientAccountById(user.id) || (user.email ? findClientAccountByEmail(user.email) : null);
      await publishDesktopRoteiro(clientAcc?.slug || user.id.slice(0, 8), estudio,
        xmlContent, nowIso, html, new Date().toTimeString().slice(0, 5));

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
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto overflow-x-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "none", scrollbarGutter: "stable both-edges" }}>
        <button onClick={() => { reset(); onOpenChange(false); }} className="absolute top-3 right-3 rounded-full p-1 hover:opacity-70 transition-opacity" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
          <XIcon size={18} />
        </button>

        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
              <Zap size={20} style={{ color: "#268ffa" }} />
              {editingId ? "Monte seu Roteiro" : "Monte seu Roteiro"}
            </DialogTitle>
            <button
              onClick={() => setShowPastePopup(true)}
              className="flex items-center gap-1.5 text-[11px] font-semibold py-1.5 px-3 rounded-lg hover:opacity-80 transition-all mr-6"
              style={{ backgroundColor: "color-mix(in srgb, #268ffa 12%, transparent)", color: "#268ffa" }}
            >
              <ClipboardPaste size={13} /> Colar Roteiro
            </button>
          </div>
        </DialogHeader>

        {/* Paste Script Popup */}
        {showPastePopup && (
          <div className="rounded-xl p-3 space-y-2" style={{ border: "2px solid #268ffa", backgroundColor: "color-mix(in srgb, #268ffa 6%, transparent)" }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: "#268ffa" }}>
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
              placeholder={"Estúdio: Estudio FM\nPrograma: Papo Cabeça\n\nEQUIPE:\n- Henrique Augusto – âncora: @henriquelocuteiro\n- Maria Silva – repórter: @mariasilva\n\nESCALADA:\n1. TÍTULO DA NOTÍCIA 1\n2. TÍTULO DA NOTÍCIA 2\n\nBLOCO 1:\n- https://link-da-materia.com\n- https://outro-link.com\n\nBLOCO 2:\n- https://mais-um-link.com"}
              className="w-full px-3 py-2 rounded-lg text-[11px] outline-none resize-none"
              rows={10}
              style={inputStyle}
            />
            <button
              onClick={parsePastedScript}
              disabled={!pasteText.trim()}
              className="w-full py-2 rounded-lg text-[11px] font-bold transition-all hover:opacity-90 flex items-center justify-center gap-1.5 disabled:opacity-40"
              style={{ backgroundColor: "#268ffa", color: "var(--layout-header-text, #fff)" }}
            >
              <Check size={12} /> Importar Roteiro
            </button>
          </div>
        )}

        {/* Estudio + Programa */}
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <label className="text-[11px] font-semibold mb-1 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Estúdio</label>
            <Select value={estudio} onValueChange={v => { setEstudio(v); setProgramaId(""); }}>
              <SelectTrigger className="w-full text-xs h-10">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {estudios.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] font-semibold mb-1 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Programa</label>
            <Select value={programaId} onValueChange={v => setProgramaId(v)}>
              <SelectTrigger className="w-full text-xs h-10">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {filteredProgramas.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Participantes */}
        <div className="mt-4 rounded-xl p-3" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 25%, transparent)", backgroundColor: "color-mix(in srgb, #268ffa 4%, transparent)" }}>
          <p className="text-xs font-bold flex items-center gap-1.5 mb-2" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
            <Users size={14} style={{ color: "#268ffa" }} />
            Participantes
          </p>

          {/* Listed participants */}
          {participantes.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {participantes.map((p, idx) => (
                <ParticipanteRow key={idx} participante={p} inputStyle={inputStyle} onRemove={() => removeParticipante(idx)} onUpdateCargo={(cargo) => {
                  setParticipantes(prev => prev.map((x, i) => i === idx ? { ...x, cargo } : x));
                }} userId={user?.id || ""} />
              ))}
            </div>
          )}

          {/* Search bar */}
          <div ref={searchRef} className="relative">
            <div className="flex gap-1.5 items-center">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--layout-icon-color, #888)" }} />
                <input
                  value={searchNome}
                  onChange={e => { setSearchNome(e.target.value); setShowResults(true); }}
                  onFocus={() => { if (searchResults.length > 0 || noResults) setShowResults(true); }}
                  placeholder="Buscar participante pelo nome..."
                  className="w-full pl-7 pr-3 py-1.5 rounded-lg text-[11px] outline-none"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Dropdown results */}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 25%, transparent)" }}>
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => addParticipante(r)}
                    className="w-full text-left px-3 py-2 text-[11px] hover:opacity-80 transition-all flex items-center gap-2"
                    style={{
                      color: "var(--layout-page-text, #1a1a1a)",
                      borderBottom: i < searchResults.length - 1 ? "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 10%, transparent)" : "none"
                    }}
                  >
                    <span className="font-semibold flex-1 truncate">{r.nome}</span>
                    {r.cargo && <span className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>{r.cargo}</span>}
                    {r.instagram && <span className="text-[10px]" style={{ color: "#268ffa" }}>@{r.instagram.replace("@", "")}</span>}
                  </button>
                ))}
              </div>
            )}
            {showResults && noResults && searchNome.trim().length > 1 && (
              <div className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden p-3" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 25%, transparent)" }}>
                <p className="text-[11px] mb-2" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  Nenhum resultado para "<strong>{searchNome}</strong>".
                </p>
                <button
                  onClick={openNewContactPopup}
                  className="flex items-center gap-1.5 text-[11px] font-semibold py-1.5 px-3 rounded-lg hover:opacity-80 transition-all"
                  style={{ backgroundColor: "color-mix(in srgb, #268ffa 12%, transparent)", color: "#268ffa" }}
                >
                  <UserPlus size={12} /> Vamos salvar esse contato?
                </button>
              </div>
            )}
          </div>
        </div>

        {/* New Contact Popup */}
        {showNewContact && (
          <div className="rounded-xl p-3 mt-2 space-y-2" style={{ border: "2px solid #268ffa", backgroundColor: "color-mix(in srgb, #268ffa 6%, transparent)" }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: "#268ffa" }}>
                <UserPlus size={14} /> Novo Participante
              </p>
              <button onClick={() => setShowNewContact(false)} className="p-0.5 rounded hover:opacity-70" style={{ color: "var(--layout-page-text)" }}>
                <XIcon size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold mb-0.5 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nome</label>
                <input value={newContact.nome} onChange={e => setNewContact(p => ({ ...p, nome: e.target.value }))} className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="text-[10px] font-semibold mb-0.5 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Cargo</label>
                <input value={newContact.cargo} onChange={e => setNewContact(p => ({ ...p, cargo: e.target.value }))} placeholder="Ex: Repórter" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="text-[10px] font-semibold mb-0.5 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Instagram</label>
                <input value={newContact.instagram} onChange={e => setNewContact(p => ({ ...p, instagram: e.target.value }))} placeholder="@usuario" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="text-[10px] font-semibold mb-0.5 block" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>WhatsApp</label>
                <input value={newContact.whatsapp} onChange={e => setNewContact(p => ({ ...p, whatsapp: e.target.value }))} placeholder="(00) 00000-0000" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none" style={inputStyle} />
              </div>
            </div>
            <Button variant="save"
              onClick={saveNewContact}
              disabled={savingContact || !newContact.nome.trim()}
            >
              {savingContact ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Salvar e Incluir
            </Button>
          </div>
        )}

        {/* Escalada */}
        <div className="mt-4 rounded-xl p-3" style={{ border: "1px solid color-mix(in srgb, #f59e0b 30%, transparent)", backgroundColor: "color-mix(in srgb, #f59e0b 5%, transparent)" }}>
          <p className="text-xs font-bold flex items-center gap-1.5 mb-2" style={{ color: "#f59e0b" }}>
            📢 Escalada
            {escaladaList.length > 0 && (
              <span className="text-[10px] font-normal" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                ({escaladaList.length} {escaladaList.length === 1 ? "item" : "itens"})
              </span>
            )}
          </p>
          <div className="space-y-1.5">
            {escaladaList.map((item, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <span className="text-[10px] font-bold shrink-0 w-5 text-center" style={{ color: "#f59e0b" }}>{idx + 1}.</span>
                <div className="flex flex-col shrink-0">
                  <button
                    onClick={() => { if (idx === 0) return; setEscaladaList(prev => { const c = [...prev]; [c[idx - 1], c[idx]] = [c[idx], c[idx - 1]]; return c; }); }}
                    disabled={idx === 0}
                    className="p-0.5 rounded hover:opacity-70 disabled:opacity-20"
                    style={{ color: "#f59e0b" }}
                  ><ArrowUp size={10} /></button>
                  <button
                    onClick={() => { if (idx === escaladaList.length - 1) return; setEscaladaList(prev => { const c = [...prev]; [c[idx], c[idx + 1]] = [c[idx + 1], c[idx]]; return c; }); }}
                    disabled={idx === escaladaList.length - 1}
                    className="p-0.5 rounded hover:opacity-70 disabled:opacity-20"
                    style={{ color: "#f59e0b" }}
                  ><ArrowDown size={10} /></button>
                </div>
                <input
                  value={item}
                  onChange={e => setEscaladaList(prev => prev.map((v, i) => i === idx ? e.target.value : v))}
                  className="flex-1 px-2.5 py-1.5 rounded-lg text-[11px] outline-none min-w-0"
                  style={inputStyle}
                  placeholder="Título da manchete..."
                />
                <button onClick={() => setEscaladaList(prev => prev.filter((_, i) => i !== idx))} className="p-1 rounded-full hover:opacity-70 shrink-0" style={{ color: "#ef4444" }}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setEscaladaList(prev => [...prev, ""])}
            className="flex items-center gap-1 text-[11px] font-semibold py-1.5 px-3 rounded-full hover:opacity-80 transition-all mt-2"
            style={{ color: "#f59e0b", border: "1px dashed color-mix(in srgb, #f59e0b 40%, transparent)" }}
          >
            <Plus size={12} /> Adicionar manchete
          </button>
        </div>

        {/* Blocos */}
        <div className="space-y-4 mt-4 min-w-0 w-full">
          {blocos.map((bloco, bi) => (
            <div key={bi} className="rounded-xl p-3 min-w-0 w-full overflow-hidden" style={{ border: `2px solid ${BLOCK_COLORS[bi % BLOCK_COLORS.length]}44`, backgroundColor: `${BLOCK_COLORS[bi % BLOCK_COLORS.length]}0a` }}>
              <div className="flex items-center justify-between mb-2 cursor-pointer min-w-0" onClick={() => toggleCollapse(bi)}>
                <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: BLOCK_COLORS[bi % BLOCK_COLORS.length] }}>
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
                  <button onClick={() => addNoticia(bi)} className="flex items-center gap-1 text-[11px] font-semibold py-1.5 px-3 rounded-full hover:opacity-80 transition-all" style={{ color: "#268ffa", border: "1px dashed color-mix(in srgb, #268ffa 40%, transparent)" }}>
                    <Plus size={12} /> Adicionar notícia
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <button onClick={addBloco} className="w-full py-2.5 rounded-xl text-xs font-bold transition-all hover:opacity-80 mt-2" style={{ border: "2px dashed color-mix(in srgb, #268ffa 40%, transparent)", color: "#268ffa", backgroundColor: "color-mix(in srgb, #268ffa 4%, transparent)" }}>
          <Plus size={14} className="inline mr-1" /> Adicionar Bloco {blocos.length + 1}
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || !programaId}
          className="btn-skyglass-accent w-full py-3 text-sm mt-3 disabled:opacity-40"
          style={{ borderRadius: "12px" }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
          {saving ? "Salvando..." : "Salvar"}
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
  const [linkInput, setLinkInput] = useState(noticia.link || "");
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
        className="rounded-lg px-3 py-2 flex items-center justify-between cursor-pointer hover:opacity-90 transition-all overflow-hidden"
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
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "color-mix(in srgb, #268ffa 15%, transparent)", color: "#268ffa" }}>
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
    <div className="rounded-lg p-2.5 space-y-2 w-full min-w-0 overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 80%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 15%, transparent)", maxWidth: "100%", boxSizing: "border-box" }}>
      <div className="flex items-center justify-between min-w-0">
        <p className="text-[10px] font-bold uppercase" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
          Notícia {ni + 1}
        </p>
        <div className="flex items-center gap-1 shrink-0">
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
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 items-center w-full min-w-0 max-w-full overflow-hidden">
        <div className="relative min-w-0 max-w-full overflow-hidden">
          <Link2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--layout-icon-color, #888)" }} />
          <input
            value={linkInput}
            onChange={e => setLinkInput(e.target.value)}
            onPaste={e => { const t = e.clipboardData.getData("text"); setTimeout(() => handlePasteLink(t), 50); }}
            placeholder="Cole o link da matéria"
            className="block w-full min-w-0 max-w-full pl-7 pr-3 py-1.5 rounded-lg text-[11px] outline-none"
            style={{ ...inputStyle, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
          />
        </div>
        <button
          onClick={() => handlePasteLink(linkInput)}
          disabled={isFetching || !linkInput}
          className="px-2 py-1.5 rounded-lg text-[10px] font-bold disabled:opacity-30 shrink-0"
          style={{ backgroundColor: "#268ffa", color: "var(--layout-header-text, #fff)" }}
        >
          {isFetching ? <Loader2 size={12} className="animate-spin" /> : "Buscar"}
        </button>
      </div>

      {/* Manual fields */}
      <div className="w-full min-w-0 max-w-full overflow-hidden">
        <div className="flex items-center gap-1 mb-1">
          <Type size={10} style={{ color: "var(--layout-icon-color)" }} />
          <span className="text-[10px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Título / Tarja</span>
      </div>
      
      <div className="w-full min-w-0 max-w-full overflow-hidden">
        <div className="flex items-center gap-1 mb-1">
          <Type size={10} style={{ color: "var(--layout-icon-color)" }} />
          <span className="text-[10px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Resumo (p/ Escalada)</span>
        </div>
        <textarea
          value={noticia.resumo || ""}
          onChange={e => onUpdate(bi, ni, "resumo", e.target.value)}
          placeholder="Resumo curto para a escalada..."
          className="block w-full min-w-0 max-w-full px-3 py-1.5 rounded-lg text-[11px] outline-none h-12 resize-none"
          style={{ ...inputStyle, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
        />
      </div>
        <input
          value={noticia.titulo}
          onChange={e => onUpdate(bi, ni, "titulo", e.target.value)}
          placeholder="Título da matéria"
          className="block w-full min-w-0 max-w-full px-3 py-1.5 rounded-lg text-[11px] outline-none"
          style={{ ...inputStyle, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
        />
      </div>

      <div className="w-full min-w-0 max-w-full overflow-hidden">
        <div className="flex items-center gap-1 mb-1">
          <Image size={10} style={{ color: "var(--layout-icon-color)" }} />
          <span className="text-[10px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>URL Imagem</span>
        </div>
        <input
          value={noticia.imagemUrl}
          onChange={e => onUpdate(bi, ni, "imagemUrl", e.target.value)}
          placeholder="https://..."
          className="block w-full min-w-0 max-w-full px-3 py-1.5 rounded-lg text-[11px] outline-none"
          style={{ ...inputStyle, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}
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
            borderColor: noticia.escalada ? "#268ffa" : "color-mix(in srgb, var(--layout-border-color, #333333) 40%, transparent)",
            backgroundColor: noticia.escalada ? "#268ffa" : "transparent",
          }}
        >
          {noticia.escalada && <Check size={10} style={{ color: "var(--layout-header-text, #fff)" }} />}
        </div>
        <span className="text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Escalada</span>
      </label>
    </div>
  );
}
