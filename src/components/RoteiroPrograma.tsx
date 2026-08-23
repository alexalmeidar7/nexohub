import { useState, useEffect, lazy, Suspense, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History, Trash2, Pencil, Code2, Copy, MessageSquare, FileText, X, Check, RefreshCw, ChevronDown, ChevronUp, Zap, Bot, Send, Calendar, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

const WhatsAppSendDialog = lazy(() => import("./WhatsAppSendDialog"));
const ProgramaExpressInline = lazy(() => import("./ProgramaExpressInline"));
const AutomacaoProgramaSection = lazy(() => import("./AutomacaoProgramaSection"));
import HistoricoTable from "./HistoricoTable";
import type { ExpressEditData } from "./ProgramaExpressInline";

// Palette (nexo-form-design-system) — mesmo padrão do Cadastro de Ouvinte
const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const CARD_BG = "#D6F4FB";
const DARK = "#0A2540";
const MONT: React.CSSProperties = { fontFamily: "'Montserrat', sans-serif" };

// Formata timestamp UTC do banco no fuso local do usuário (respeita DST automaticamente).
const LOCAL_TZ = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
function formatLocal(iso: string | null | undefined, pattern: "full" | "short" = "full"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions =
    pattern === "full"
      ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: LOCAL_TZ }
      : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: LOCAL_TZ };
  const parts = new Intl.DateTimeFormat("pt-BR", opts).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  if (pattern === "short") return `${get("day")}/${get("month")} às ${get("hour")}:${get("minute")}`;
  return `${get("day")}/${get("month")}/${get("year")} · ${get("hour")}:${get("minute")}`;
}

interface Programa {
  id: string;
  nome: string;
  estudio: string;
  tipo_programa: string | null;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: string[];
  apresentador_id: string | null;
  capa: string | null;
  selo: string | null;
}

export default function RoteiroPrograma() {
  const { user } = useAuth();
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [loading, setLoading] = useState(true);
  const [estudios, setEstudios] = useState<string[]>([]);
  const [historico, setHistorico] = useState<any[]>([]);
  const [regenerating, setRegenerating] = useState(false);
  
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [whatsAppHistoricoData, setWhatsAppHistoricoData] = useState<any>(null);
  const [expressEditData, setExpressEditData] = useState<ExpressEditData | null>(null);
  const [txtEditRoteiroId, setTxtEditRoteiroId] = useState<string | null>(null);
  const [txtEditText, setTxtEditText] = useState("");
  const [txtSaving, setTxtSaving] = useState(false);
  const [externalPasteText, setExternalPasteText] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"recentes" | "historico">("recentes");
  const [historicoOpen, setHistoricoOpen] = useState(true);
  const [novoRoteiroOpen, setNovoRoteiroOpen] = useState(false);
  const [automacaoOpen, setAutomacaoOpen] = useState(false);

  const roteiroToPlainText = (r: any): string => {
    let parts: any = null;
    try { let raw = r.participantes; if (typeof raw === "string") raw = JSON.parse(raw); if (typeof raw === "string") raw = JSON.parse(raw); parts = raw; } catch { parts = {}; }
    const parsed = Array.isArray(parts) ? { blocos: [], participantes: parts } : (parts || {});
    const pList: any[] = parsed.participantes || [];
    const blocosList: any[] = parsed.blocos || [];
    const escaladaItems: any[] = parsed.escaladaList || [];

    let text = "";
    text += `Estúdio: ${r.estudio || ""}\n`;
    text += `Programa: ${r.programa_nome || ""}\n\n`;
    if (pList.length > 0) {
      text += `EQUIPE:\n`;
      pList.forEach((p: any) => {
        text += `- ${p.nome || ""}${p.cargo ? ` – ${p.cargo}` : ""}${p.instagram ? ` : ${p.instagram.startsWith("@") ? p.instagram : `@${p.instagram}`}` : ""}\n`;
      });
      text += "\n";
    }
    if (escaladaItems.length > 0) {
      text += `ESCALADA:\n`;
      escaladaItems.forEach((e: any, i: number) => { text += `${i + 1}. ${e.titulo || e}\n`; });
      text += "\n";
    }
    blocosList.forEach((b: any, bi: number) => {
      text += `BLOCO ${bi + 1}:\n`;
      (b.noticias || []).forEach((n: any) => {
        if (!n.titulo) return;
        text += `- ${n.titulo}\n`;
      });
      text += "\n";
    });
    return text.trim();
  };

  const fetchLinkMeta = async (url: string): Promise<{ titulo: string; imagemUrl: string; resumo: string } | null> => {
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
        const rawTitulo = getMetaContent("og:title") || getMetaContent("twitter:title") || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").trim();
        let titulo = rawTitulo.includes("|") ? rawTitulo.split("|")[0].trim() : rawTitulo;
        if (titulo.includes(" - ")) titulo = titulo.split(" - ")[0].trim();
        const imagemUrl = getMetaContent("og:image") || getMetaContent("twitter:image");
        let resumo = getMetaContent("og:description") || getMetaContent("twitter:description") || getMetaContent("description");
        if (!resumo) {
          const pMatches = html.match(/<p[^>]*>([^<]{40,})<\/p>/gi);
          if (pMatches) {
            resumo = pMatches[0].replace(/<[^>]+>/g, "").trim().slice(0, 300);
          }
        }
        if (titulo || imagemUrl || resumo) return { titulo, imagemUrl, resumo };
      }
    } catch {}
    return null;
  };

  const handleSaveTxtRoteiro = async () => {
    if (!txtEditRoteiroId || !txtEditText.trim()) {
      if (!txtEditText.trim()) toast.error("Conteúdo vazio");
      return;
    }
    setTxtSaving(true);

    const roteiro = historico.find(r => r.id === txtEditRoteiroId);

    // ── Parse full text back into structured data ──
    const linhas = txtEditText.split("\n").map(l => l.trim());
    const cleanLabel = (s: string) => s.replace(/\*+/g, "").replace(/^[-•–]\s+/, "").replace(/^\d+[\.\)]\s*/, "").trim();
    const extractUrl = (s: string): string | null => {
      const mdLink = s.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
      if (mdLink) return mdLink[1];
      const plainUrl = s.match(/(https?:\/\/[^\s]+)/);
      if (plainUrl) return plainUrl[1];
      return null;
    };

    const extractMeta = (s: string, tag: string): string | null => {
      const regex = new RegExp(`\\[${tag}:(.*?)\\]`, "i");
      const match = s.match(regex);
      return match ? match[1].trim().replace(/\\n/g, "\n") : null;
    };

    const parsedParticipantes: any[] = [];
    const parsedEscalada: any[] = [];
    const parsedBlocos: any[] = [];
    let secaoAtual = "cabecalho";
    let blocoAtual: any[] | null = null;

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      if (!linha) continue;
      const cleaned = cleanLabel(linha);
      if (!cleaned) continue;

      if (linha.replace(/\*/g, "").trim().toUpperCase().startsWith("EQUIPE")) { secaoAtual = "equipe"; continue; }
      if (linha.replace(/\*/g, "").trim().toUpperCase().startsWith("ESCALADA")) { secaoAtual = "escalada"; continue; }
      if (linha.replace(/\*/g, "").trim().toUpperCase().match(/^BLOCO\s*\d*/i)) {
        secaoAtual = "blocos";
        if (blocoAtual && blocoAtual.length > 0) {
          const validNews = blocoAtual.filter(n => n.titulo?.trim() || n.texto_materia?.trim() || n.link?.trim());
          if (validNews.length > 0) parsedBlocos.push({ noticias: validNews });
        }
        blocoAtual = [];
        continue;
      }

      if (secaoAtual === "cabecalho") continue; // skip Estúdio/Programa header lines
      if (secaoAtual === "equipe") {
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
        if (item) parsedEscalada.push({ titulo: item, imagemUrl: "" });
      } else if (secaoAtual === "blocos" && blocoAtual) {
        const url = extractUrl(linha);
        const resumo = extractMeta(linha, "RESUMO");
        const texto = extractMeta(linha, "TEXTO");
        let finalTitle = cleaned.replace(/\[RESUMO:.*?\]/gi, "").replace(/\[TEXTO:.*?\]/gi, "").trim();
        if (url) finalTitle = "";
        blocoAtual.push({ 
          titulo: finalTitle, 
          imagemUrl: "", 
          escalada: false, 
          link: url || undefined,
          resumo: resumo || undefined,
          texto_materia: texto || undefined
        });
      }
    }
    if (blocoAtual && blocoAtual.length > 0) {
      const validNews = blocoAtual.filter(n => n.titulo?.trim() || n.texto_materia?.trim() || n.link?.trim());
      if (validNews.length > 0) parsedBlocos.push({ noticias: validNews });
    }

    // ── Fetch metadata for all URLs in blocos ──
    const linksToFetch: { bi: number; ni: number; url: string }[] = [];
    parsedBlocos.forEach((b, bi) => {
      (b.noticias || []).forEach((n: any, ni: number) => {
        if (n.link && n.link.startsWith("http")) linksToFetch.push({ bi, ni, url: n.link });
      });
    });

    if (linksToFetch.length > 0) {
      toast.info(`Buscando dados de ${linksToFetch.length} link(s)...`);
      const metaResults = await Promise.all(
        linksToFetch.map(({ bi, ni, url }) =>
          fetchLinkMeta(url).then(meta => ({ bi, ni, url, meta }))
        )
      );
      for (const { bi, ni, meta } of metaResults) {
        if (meta) {
          if (meta.titulo) parsedBlocos[bi].noticias[ni].titulo = meta.titulo;
          if (meta.imagemUrl) parsedBlocos[bi].noticias[ni].imagemUrl = meta.imagemUrl;
          if (meta.resumo) parsedBlocos[bi].noticias[ni].resumo = meta.resumo;
        }
      }
    }

    // ── Preserve existing structured data and merge parsed sections ──
    let existingParsed: any = {};
    if (roteiro) {
      try {
        let raw = roteiro.participantes;
        if (typeof raw === "string") raw = JSON.parse(raw);
        if (typeof raw === "string") raw = JSON.parse(raw);
        existingParsed = Array.isArray(raw) ? { blocos: [], participantes: raw } : (raw || {});
      } catch { existingParsed = {}; }
    }

    const updatedParticipantes = {
      ...existingParsed,
      participantes: parsedParticipantes.length > 0 ? parsedParticipantes : (existingParsed.participantes || []),
      escaladaList: parsedEscalada.length > 0 ? parsedEscalada : (existingParsed.escaladaList || []),
      blocos: parsedBlocos.length > 0 ? parsedBlocos : (existingParsed.blocos || []),
    };

    // ── Build tickertitulos for journalistic roteiros ──
    let tickertitulos: string | null = null;
    if (roteiro?.tipo_programa === "Jornalístico" || roteiro?.tipo_programa === "jornalistico") {
      const allTitles: string[] = [];
      (updatedParticipantes.blocos || []).forEach((b: any) => {
        (b.noticias || []).forEach((n: any) => {
          if (n.titulo) allTitles.push(n.titulo);
        });
      });
      if (allTitles.length > 0) tickertitulos = allTitles.join(" • ");
    }

    // Validate final structured data before saving
    const finalNewsCount = (updatedParticipantes.blocos || []).reduce((s: number, b: any) => s + (b.noticias || []).filter((n: any) => n.titulo?.trim() || n.texto_materia?.trim() || n.link?.trim()).length, 0);
    if (finalNewsCount === 0) {
      toast.error("O roteiro processado não contém notícias válidas. Verifique a formatação.");
      setTxtSaving(false);
      return;
    }

    const updatePayload: any = {
      conteudo_html: txtEditText,
      participantes: JSON.stringify(updatedParticipantes),
      updated_at: new Date().toISOString(),
    };
    if (tickertitulos !== null) updatePayload.tickertitulos = tickertitulos;

    const { error } = await supabase.from("roteiros").update(updatePayload).eq("id", txtEditRoteiroId);

    // ── Regenerate XML if roteiro has one ──
    if (!error && roteiro?.subtitulo?.startsWith("express_xml::")) {
      try {
        const pList = updatedParticipantes.participantes || [];
        const blocosList = updatedParticipantes.blocos || [];
        const escaladaItems = updatedParticipantes.escaladaList || [];

        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<programaExpress>\n`;
        xml += `  <programa>${escXml(roteiro.programa_nome || "")}</programa>\n`;
        xml += `  <estudio>${escXml(roteiro.estudio || "")}</estudio>\n`;
        xml += `  <data>${roteiro.data_programa || new Date().toISOString().split("T")[0]}</data>\n`;

        if (pList.length > 0) {
          xml += `  <participantes>\n`;
          pList.forEach((p: any) => {
            xml += `    <item>\n`;
            xml += `      <nome>${escXml(p.nome || "")}</nome>\n`;
            xml += `      <cargo>${escXml(p.cargo || "")}</cargo>\n`;
            xml += `      <instagram>${escXml(p.instagram || "")}</instagram>\n`;
            xml += `    </item>\n`;
          });
          xml += `  </participantes>\n`;
        }

        if (escaladaItems.length > 0) {
          xml += `  <escalada>\n`;
          escaladaItems.forEach((e: any, i: number) => {
            xml += `    <item ordem="${i + 1}">\n`;
            xml += `      <titulo>${escXml(typeof e === "string" ? e : e.titulo || "")}</titulo>\n`;
            xml += `      <imagem>${escXml(typeof e === "string" ? "" : e.imagemUrl || "")}</imagem>\n`;
            xml += `    </item>\n`;
          });
          xml += `  </escalada>\n`;
        }

        blocosList.forEach((b: any, bi: number) => {
          xml += `  <bloco numero="${bi + 1}">\n`;
          (b.noticias || []).forEach((n: any, ni: number) => {
            if (!n.titulo) return;
            xml += `    <noticia ordem="${ni + 1}">\n`;
            xml += `      <titulo>${escXml(n.titulo)}</titulo>\n`;
            xml += `      <resumo>${escXml(n.resumo || "")}</resumo>\n`;
            xml += `      <texto_materia>${escXml(n.texto_materia || "")}</texto_materia>\n`;
            xml += `      <imagem>${escXml(n.imagemUrl || "")}</imagem>\n`;
            xml += `      <escalada>${n.escalada || false}</escalada>\n`;
            xml += `    </noticia>\n`;
          });
          xml += `  </bloco>\n`;
        });

        xml += `</programaExpress>`;

        const xmlUrl = roteiro.subtitulo.replace("express_xml::", "");
        const urlObj = new URL(xmlUrl);
        const pathMatch = urlObj.pathname.match(/\/object\/public\/empresa-assets\/(.+)$/);
        if (pathMatch) {
          const filePath = decodeURIComponent(pathMatch[1]);
          const blob = new Blob([new TextEncoder().encode(xml)], { type: "application/xml" });
          await supabase.storage.from("empresa-assets").upload(filePath, blob, { upsert: true, contentType: "application/xml" });
          await supabase.from("roteiros").update({ xml_pushed_at: new Date().toISOString() }).eq("id", roteiro.id);
        }
      } catch (e) {
        console.warn("[TxtEdit] XML regen error:", e);
      }
    }

    setTxtSaving(false);
    if (error) { toast.error("Erro ao salvar"); return; }
    toast.success("Roteiro atualizado!");
    setTxtEditRoteiroId(null);
    setTxtEditText("");
    fetchHistorico();
  };

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      // Resolve effective user id: sub-users inherit parent's programs/schedule
      const { data: sub } = await supabase
        .from("sub_users")
        .select("parent_user_id, ativo")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      const effectiveUserId = sub?.ativo && sub.parent_user_id ? sub.parent_user_id : user.id;

      const { data: progs } = await supabase
        .from("programas")
        .select("id, nome, estudio, tipo_programa, horario_inicio, horario_fim, dias_semana, apresentador_id, capa, selo")
        .eq("ativo", true)
        .eq("user_id", effectiveUserId);
      const programasList = progs || [];
      setProgramas(programasList);
      const uniqueEstudios = [...new Set(programasList.map(p => p.estudio).filter(Boolean))] as string[];
      setEstudios(uniqueEstudios);
      setLoading(false);
    };
    load();
  }, [user]);

  const fetchHistorico = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("roteiros")
      .select("*")
      .eq("user_id", user.id)
      .order("data_programa", { ascending: false })
      .order("horario", { ascending: false, nullsFirst: false })
      .limit(10);
    if (!data) { setHistorico([]); return; }

    const now = new Date();
    const toMarkFeito: string[] = [];
    for (const r of data) {
      if (r.status === "feito" || r.status === "rascunho") continue;
      let eventTime: Date;
      if (r.horario) { eventTime = new Date(`${r.data_programa}T${r.horario}:00`); }
      else { eventTime = new Date(`${r.data_programa}T23:59:00`); }
      const oneHourAfter = new Date(eventTime.getTime() + 60 * 60 * 1000);
      if (now >= oneHourAfter) { toMarkFeito.push(r.id); r.status = "feito"; }
    }
    if (toMarkFeito.length > 0) {
      await supabase.from("roteiros").update({ status: "feito" }).in("id", toMarkFeito);
      for (const id of toMarkFeito) {
        const rot = data.find(r => r.id === id);
        if (!rot) continue;
        const { data: eventos } = await supabase.from("agenda_eventos").select("id, descricao").eq("user_id", user.id).ilike("descricao", `%Roteiro: ${rot.programa_nome}%`).eq("data", rot.horario ? `${rot.data_programa}T${rot.horario}:00` : rot.data_programa);
        if (eventos && eventos.length > 0) {
          for (const ev of eventos) {
            if (!ev.descricao?.includes("[VENCIDO]")) {
              await supabase.from("agenda_eventos").update({ descricao: `[VENCIDO] ${ev.descricao}` }).eq("id", ev.id);
            }
          }
        }
      }
    }
    setHistorico(data);
  };

  useEffect(() => { if (user) fetchHistorico(); }, [user]);

  const excluirRoteiro = async (id: string) => {
    const roteiro = historico.find(r => r.id === id);
    const { error } = await supabase.from("roteiros").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir roteiro"); }
    else {
      if (roteiro && user) {
        await supabase.from("agenda_eventos").delete().eq("user_id", user.id).eq("data", roteiro.data_programa).like("descricao", `Roteiro: ${roteiro.programa_nome}%`);
      }
      toast.success("Roteiro excluído");
      fetchHistorico();
    }
  };

  const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const regenerateXmlForRoteiro = async (r: any): Promise<boolean> => {
    try {
      if (!r?.subtitulo || !String(r.subtitulo).startsWith("express_xml::")) return false;

      // Delega geração + upload à edge function (service role bypassa RLS do storage,
      // que exige foldername[1] = auth.uid() e falha para paths express/<owner>/...).
      const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID || "zzjfzxxvxbspbdkodoix";
      const anonKey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || "";
      const fnUrl = `https://${projectId}.supabase.co/functions/v1/roteiro-xml?id=${r.id}&force=1&persist=1&t=${Date.now()}`;
      const resp = await fetch(fnUrl, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        cache: "no-store",
      });
      if (!resp.ok) {
        console.warn("[RegenXML] roteiro-xml fetch falhou", resp.status);
        return false;
      }
      const xml = await resp.text();
      if (!xml || xml.includes("<error>")) {
        console.warn("[RegenXML] xml inválido", xml.slice(0, 200));
        return false;
      }
      await supabase.from("roteiros").update({ xml_pushed_at: new Date().toISOString() }).eq("id", r.id);
      return true;
    } catch (e) {
      console.warn(`[RegenXML] Error on roteiro ${r?.id}:`, e);
      return false;
    }
  };


  const regenerateAllXmls = async () => {
    if (!user) return;
    setRegenerating(true);
    try {
      const { data: allRoteiros } = await supabase
        .from("roteiros")
        .select("id, programa_nome, estudio, data_programa, subtitulo, participantes")
        .eq("user_id", user.id)
        .like("subtitulo", "express_xml::%");

      if (!allRoteiros || allRoteiros.length === 0) {
        toast.info("Nenhum roteiro com XML encontrado");
        setRegenerating(false);
        return;
      }

      let count = 0;
      for (const r of allRoteiros) {
        const ok = await regenerateXmlForRoteiro(r);
        if (ok) count++;
      }
      toast.success(`${count} XML(s) regenerado(s) com sucesso!`);
    } catch (e) {
      toast.error("Erro ao regenerar XMLs");
      console.error(e);
    }
    setRegenerating(false);
  };


  const historicoSlot = useMemo(() => {
    if (historico.length === 0) return null;
    return (
      <div className="px-6 pt-4 pb-2" style={MONT}>
        <div style={{ background: CARD_BG, borderRadius: 24, padding: "18px 20px" }}>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <button
              onClick={() => setHistoricoOpen(o => !o)}
              className="flex items-center gap-2 hover:opacity-80 transition"
              title={historicoOpen ? "Recolher" : "Expandir"}
            >
              <History size={14} style={{ color: CYAN }} />
              <span style={{ ...MONT, fontSize: 13, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: DARK }}>
                Roteiros Cadastrados
              </span>
              {historicoOpen
                ? <ChevronUp size={14} style={{ color: CYAN }} />
                : <ChevronDown size={14} style={{ color: "#94A3B8" }} />}
            </button>
          </div>
          {historicoOpen && (<>
          {activeTab === "historico" ? (

            <HistoricoTable 
              historico={historico} 
              onEdit={(r) => {
                let blocos = []; let editParticipantes: any[] = []; let editEscaladaList: any[] = []; let editPodcastData: any = undefined;
                try { 
                  const parsed = typeof r.participantes === "string" ? JSON.parse(r.participantes) : r.participantes || []; 
                  if (parsed && parsed.blocos) { 
                    blocos = parsed.blocos; 
                    editParticipantes = parsed.participantes || []; 
                    editEscaladaList = parsed.escaladaList || []; 
                    editPodcastData = parsed.podcastData || undefined; 
                  } else { 
                    blocos = Array.isArray(parsed) ? parsed : []; 
                  } 
                } catch { 
                  blocos = []; 
                }
                const prog = programas.find(p => p.nome === r.programa_nome);
                let existingXmlPath: string | undefined;
                if (r.subtitulo?.startsWith("express_xml::")) {
                  try {
                    const xmlUrl = r.subtitulo.replace("express_xml::", "");
                    const urlObj = new URL(xmlUrl);
                    const pathMatch = urlObj.pathname.match(/\/object\/public\/empresa-assets\/(.+)$/);
                    if (pathMatch) existingXmlPath = pathMatch[1];
                  } catch {}
                }
                setExpressEditData({ 
                  roteiroId: r.id, 
                  estudio: r.estudio || "", 
                  programaId: prog?.id || "", 
                  blocos, 
                  participantes: editParticipantes, 
                  escaladaList: editEscaladaList, 
                  existingXmlPath, 
                  podcastData: editPodcastData 
                });
                setNovoRoteiroOpen(true);
                // Scroll to top to see the edit form
                window.scrollTo({ top: 0, behavior: 'smooth' });
                // Force sync with parent component's scroll ref if possible
                const dashboardContent = document.querySelector('.overflow-y-auto.flex-1');
                if (dashboardContent) dashboardContent.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          ) : (
          (() => {
            const grupos = new Map<string, any[]>();
            historico.forEach(r => {
              const key = ((r.estudio || "").trim()) || "Sem estúdio";
              if (!grupos.has(key)) grupos.set(key, []);
              grupos.get(key)!.push(r);
            });
            const estudios = Array.from(grupos.keys()).sort((a, b) => a.localeCompare(b, "pt-BR"));
            return (
              <div className="flex flex-col gap-3">
                {estudios.map(est => (
                  <div key={est}>
                    <div className="flex items-center gap-2 mb-2 px-0.5">
                      <span style={{ display: "inline-block", width: 6, height: 14, borderRadius: 999, background: CYAN }} />
                      <span style={{ ...MONT, fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: DARK }}>
                        {est}
                      </span>
                      <span style={{ ...MONT, fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 999, background: "#FFFFFF", border: `2px solid ${CYAN}`, color: CYAN }}>
                        {grupos.get(est)!.length}
                      </span>
                      <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${CYAN}55, transparent)` }} />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {grupos.get(est)!.map(r => {
                        const [yy, mm, dd] = (r.data_programa || "").split("-").map(Number);
                        const dataFormatada = yy ? format(new Date(yy, (mm || 1) - 1, dd || 1), "dd/MM/yyyy") : "";
                        const hasXml = typeof r.subtitulo === "string" && r.subtitulo.startsWith("express_xml::");
                        const isAuto = typeof r.titulo === "string" && r.titulo.includes("[AUTO]");
                        const cleanTitulo = (r.titulo || "").replace("[AUTO]", "").trim();
                        return (
                          <div
                            key={r.id}
                            className="flex-shrink-0 flex flex-col gap-2 transition-all hover:-translate-y-0.5"
                            style={{
                              ...MONT,
                              minWidth: 240,
                              maxWidth: 290,
                              padding: 14,
                              borderRadius: 20,
                              background: "#FFFFFF",
                              border: `2px solid ${isAuto ? "#8b5cf6" : CYAN}`,
                              boxShadow: "0 2px 10px rgba(10, 37, 64, 0.06)",
                            }}
                          >
                            <div className="flex items-start gap-1.5">
                              <p style={{ ...MONT, flex: 1, fontSize: 13, fontWeight: 800, color: DARK, lineHeight: 1.25, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {r.programa_nome || "Sem programa"}
                                
                              </p>
                              {isAuto && (
                                <span style={{ ...MONT, fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "#8b5cf6", color: "#fff", letterSpacing: 1 }} title="Gerado por Automação">
                                  AUTO
                                </span>
                              )}
                            </div>
                            {(() => {
                              const updStr = formatLocal(r.updated_at, "short");
                              const updFull = formatLocal(r.updated_at, "full");
                              let parts: any = null;
                              try { let raw = r.participantes; if (typeof raw === "string") raw = JSON.parse(raw); if (typeof raw === "string") raw = JSON.parse(raw); parts = raw; } catch { parts = {}; }
                              const parsed = Array.isArray(parts) ? { blocos: [], participantes: parts } : (parts || {});
                              const pList: any[] = parsed.participantes || [];
                              const blocosList: any[] = parsed.blocos || [];
                              const escaladaItems: any[] = parsed.escaladaList || [];
                              let firstTitle = "";
                              if (escaladaItems.length > 0) firstTitle = escaladaItems[0]?.titulo || escaladaItems[0] || "";
                              if (!firstTitle) {
                                for (const b of blocosList) {
                                  const n = (b.noticias || []).find((x: any) => x.titulo);
                                  if (n) { firstTitle = n.titulo; break; }
                                }
                              }
                              if (!firstTitle) firstTitle = cleanTitulo;
                              const participantesStr = pList.map((p: any) => p.nome).filter(Boolean).join(", ");
                              return (
                                <>
                                  {updStr && (
                                    <div style={{ ...MONT, fontSize: 10, color: "#64748B", fontWeight: 700 }}>
                                      Atualizado em: <span style={{ color: DARK }}>{updStr}</span>
                                    </div>
                                  )}
                                  {firstTitle && (
                                    <p style={{ ...MONT, fontSize: 11, fontWeight: 700, lineHeight: 1.35, color: DARK, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                      {firstTitle}
                                    </p>
                                  )}
                                  {participantesStr && (
                                    <p style={{ ...MONT, fontSize: 10, lineHeight: 1.4, color: "#475569", margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                      👥 {participantesStr}
                                    </p>
                                  )}
                                  {(() => {
                                    const pushedStr = formatLocal((r as any).xml_pushed_at, "full");
                                    const hasPushed = !!pushedStr;
                                    return (
                                      <div className="flex items-center gap-1.5 flex-wrap" style={{ ...MONT, fontSize: 10, fontWeight: 700 }}>
                                        <span style={{ padding: "3px 8px", borderRadius: 999, background: CARD_BG, color: DARK, border: `1px solid ${CYAN}` }} title="Última edição (fuso local)">
                                          Editado: {updFull || "—"}
                                        </span>
                                        <span
                                          style={{
                                            padding: "3px 8px",
                                            borderRadius: 999,
                                            background: hasPushed ? "#d9ff65" : CARD_BG,
                                            color: hasPushed ? "#0f172a" : "#94a3b8",
                                            border: `1px solid ${hasPushed ? "#a3e635" : "#cbd5e1"}`,
                                          }}
                                          title="Envio ao XML (fuso local)"
                                        >
                                          XML: {hasPushed ? pushedStr : "não enviado"}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </>
                              );
                            })()}
                            <div className="flex items-center gap-1 mt-auto pt-1">
                              <button onClick={async () => {
                                let parts: any = null;
                                try { let raw = r.participantes; if (typeof raw === "string") raw = JSON.parse(raw); if (typeof raw === "string") raw = JSON.parse(raw); parts = raw; } catch { parts = []; }
                                const parsed = Array.isArray(parts) ? { blocos: [], participantes: parts } : (parts || {});
                                const pList: any[] = parsed.participantes || [];
                                const blocosList: any[] = parsed.blocos || [];
                                const dataStr = format(new Date(r.data_programa), "dd/MM/yyyy");
                                const prog = programas.find(p => p.nome === r.programa_nome);
                                const horarioInicio = prog?.horario_inicio?.slice(0, 5) || r.horario || "";
                                const allLinks: string[] = [];
                                blocosList.forEach((b: any) => (b.noticias || []).forEach((n: any) => { if (n.link) allLinks.push(n.link); }));
                                const linkMap = new Map<string, string>();
                                if (allLinks.length > 0) {
                                  toast.info("Encurtando links...");
                                  try { const { data: shortData } = await supabase.functions.invoke("format-whatsapp", { body: { urls: allLinks } }); if (shortData?.shortened) allLinks.forEach((url, i) => linkMap.set(url, shortData.shortened[i])); } catch { allLinks.forEach(url => linkMap.set(url, url)); }
                                }
                                let msg = `*${r.programa_nome || "Programa"}*\n📅 ${dataStr}${horarioInicio ? ` às ${horarioInicio}` : ""}\n\n`;
                                if (pList.length > 0) { msg += `👥 *Participantes:*\n`; pList.forEach((p: any) => { msg += `• ${p.nome}${p.cargo ? ` — ${p.cargo}` : ""}${p.instagram ? ` (${p.instagram.startsWith("@") ? p.instagram : "@" + p.instagram})` : ""}\n`; }); msg += `\n`; }
                                const escaladaItems = blocosList.flatMap((b: any) => (b.noticias || []).filter((n: any) => n.escalada).map((n: any) => n.titulo)).filter(Boolean);
                                if (escaladaItems.length > 0) { msg += `📢 *Escalada:*\n`; escaladaItems.forEach((t: string, i: number) => { msg += `${i + 1}. ${t}\n`; }); msg += `\n`; }
                                blocosList.forEach((b: any, bi: number) => { const noticias = (b.noticias || []).filter((n: any) => n.titulo); if (noticias.length === 0) return; msg += `📺 *BLOCO ${bi + 1}:*\n`; noticias.forEach((n: any) => { msg += `• ${n.titulo}`; if (n.link) msg += `\n  🔗 ${linkMap.get(n.link) || n.link}`; msg += `\n`; }); msg += `\n`; });
                                msg += `_Nos vemos no programa ;)_`;
                                setWhatsAppHistoricoData({ titulo: r.titulo || "Roteiro", programaNome: r.programa_nome || "", estudio: r.estudio || "", data: dataStr, horario: r.horario || "", participantes: pList, conteudoTexto: "", _expressFormatted: msg });
                                setShowWhatsAppDialog(true);
                              }} style={{ width: 30, height: 30, borderRadius: "50%", background: "#296f4d", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Enviar por WhatsApp">
                                <MessageSquare size={13} style={{ color: "#d9ff65" }} />
                              </button>
                              {hasXml && (
                                <button onClick={async () => {
                                  toast.info("Enviando para o XML...");
                                  const ok = await regenerateXmlForRoteiro(r);
                                  if (ok) {
                                    const now = new Date().toISOString();
                                    await supabase.from("roteiros").update({ xml_pushed_at: now }).eq("id", r.id);
                                    toast.success("O XML atualizado com sucesso!");
                                    fetchHistorico();
                                  } else toast.error("Falha ao enviar XML");
                                }} style={{ width: 30, height: 30, borderRadius: "50%", background: "#00dbff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="O XML' atualize a data e horário automáticamente">
                                  <Send size={13} style={{ color: "#FFFFFF" }} />
                                </button>
                              )}
                              <button onClick={() => {
                                let blocos = []; let editParticipantes: any[] = []; let editEscaladaList: any[] = []; let editPodcastData: any = undefined;
                                try { const parsed = typeof r.participantes === "string" ? JSON.parse(r.participantes) : r.participantes || []; if (parsed && parsed.blocos) { blocos = parsed.blocos; editParticipantes = parsed.participantes || []; editEscaladaList = parsed.escaladaList || []; editPodcastData = parsed.podcastData || undefined; } else { blocos = Array.isArray(parsed) ? parsed : []; } } catch { blocos = []; }
                                const prog = programas.find(p => p.nome === r.programa_nome);
                                let existingXmlPath: string | undefined;
                                if (r.subtitulo?.startsWith("express_xml::")) {
                                  try {
                                    const xmlUrl = r.subtitulo.replace("express_xml::", "");
                                    const urlObj = new URL(xmlUrl);
                                    const pathMatch = urlObj.pathname.match(/\/object\/public\/empresa-assets\/(.+)$/);
                                    if (pathMatch) existingXmlPath = pathMatch[1];
                                  } catch {}
                                }
                                setExpressEditData({ roteiroId: r.id, estudio: r.estudio || "", programaId: prog?.id || "", blocos, participantes: editParticipantes, escaladaList: editEscaladaList, existingXmlPath, podcastData: editPodcastData });
                                setNovoRoteiroOpen(true);
                              }} style={{ width: 30, height: 30, borderRadius: "50%", background: CARD_BG, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Editar">
                                <Pencil size={13} style={{ color: DARK }} />
                              </button>
                              <button onClick={() => excluirRoteiro(r.id)} style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: "50%", background: "#FEE2E2", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Excluir">
                                <Trash2 size={13} style={{ color: "#dc2626" }} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}



















        </>)}
      </div>
    </div>
  );
}, [historico, programas, activeTab, regenerating, historicoOpen]);







  if (loading) return <ModulePageSkeleton />;

  const ORANGE = "#fe8900";

  return (
    <div className="animate-fade-in space-y-5" style={MONT}>
      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        vMix — Roteiro de Programa
      </div>
      <div className="px-6 pt-4 pb-2">
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {!novoRoteiroOpen && (
            <button
              onClick={() => { setAutomacaoOpen(false); setExpressEditData(null); setNovoRoteiroOpen(true); }}
              style={{
                ...MONT,
                height: 64,
                padding: "0 22px",
                borderRadius: 20,
                background: CYAN,
                color: "#FFFFFF",
                border: `2px solid ${CYAN}`,
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                cursor: "pointer",
                boxShadow: "0 6px 20px rgba(0, 191, 240, 0.35)",
                transition: "all 0.2s ease",
              }}
              title="Abrir formulário de novo roteiro"
            >
              <Zap size={16} />
              Novo Roteiro
            </button>
          )}
        </div>
      </div>

      

      {estudios.length > 0 && (
        <div className="px-6 pt-4 pb-2" style={MONT}>
          <div style={{ background: CARD_BG, borderRadius: 24, padding: "18px 20px" }}>
            <div className="flex items-center gap-3 mb-3">
              <Code2 size={14} style={{ color: CYAN }} />
              <p style={{ ...MONT, fontSize: 13, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: DARK, margin: 0 }}>
                XML Roteiro por Estúdio
              </p>
              <span style={{ ...MONT, fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 999, background: "#FFFFFF", border: `2px solid ${CYAN}`, color: CYAN }}>
                {estudios.length}
              </span>
            </div>
            
            {/* scheduled roteiros list */}
            <div className="mt-8 border-t border-[#00BFF0] pt-6 pb-6">
              <div className="flex items-center gap-3 mb-4">
                <Calendar size={14} style={{ color: CYAN }} />
                <p style={{ ...MONT, fontSize: 13, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: DARK, margin: 0 }}>
                  Roteiros Agendados
                </p>
              </div>
              
              <div className="space-y-2">
                {historico.filter(r => r.agendado_para_envio).length === 0 ? (
                  <div className="p-4 rounded-xl text-center italic text-xs opacity-60" style={{ backgroundColor: "#FFFFFF", border: `1px dashed ${CYAN}` }}>
                    em roteiro de programa - ao cadastrar ou editar um programa - ao lado do botão 'finalizar edição' coloque um botão 'agendar roteiro' ao clicar nesse botão abre um pop up para o usuário colocar a data
                  </div>
                ) : (
                  historico.filter(r => r.agendado_para_envio).map(r => (
                    <div 
                      key={r.id} 
                      className="flex items-center justify-between p-3 rounded-xl bg-white border border-[#00BFF0]33"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.enviado_agendamento ? "#22c55e" : "#f59e0b" }} />
                        <div>
                          <p className="text-xs font-bold" style={{ color: DARK }}>{r.programa_nome || "Sem nome"}</p>
                          <p className="text-[10px] opacity-60">
                            {r.enviado_agendamento ? "Enviado em: " : "Agendado para: "}
                            {new Date(r.agendado_para_envio).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      {r.enviado_agendamento && <CheckCircle2 size={14} className="text-[#22c55e]" />}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {estudios.map(est => {
                const xmlUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-xml-roteiro-estudio?user_id=${user?.id || ""}&estudio=${encodeURIComponent(est)}`;
                return (
                  <div
                    key={est}
                    className="flex items-center gap-3 transition-all hover:-translate-y-0.5"
                    style={{ ...MONT, padding: "10px 14px", borderRadius: 999, background: "#FFFFFF", border: `2px solid ${CYAN}` }}
                  >
                    <span style={{ width: 34, height: 34, borderRadius: "50%", background: CARD_BG, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Code2 size={14} style={{ color: CYAN }} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p style={{ ...MONT, fontSize: 9, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: "#64748B", margin: 0 }}>XML Roteiro</p>
                      <p style={{ ...MONT, fontSize: 13, fontWeight: 800, color: DARK, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{est}</p>
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(xmlUrl).then(() => toast.success(`URL do XML de ${est} copiada!`)).catch(() => toast.error("Erro ao copiar"))}
                      style={{ width: 34, height: 34, borderRadius: "50%", background: LIME, color: DARK, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 12px rgba(198, 240, 60, 0.4)" }}
                      title={`Copiar URL: ${xmlUrl}`}
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                );
              })}
            </div>


          </div>
        </div>
      )}

      {!novoRoteiroOpen && historicoSlot}

      {/* Modal: Novo Roteiro */}
      <Suspense fallback={null}>
        <ProgramaExpressInline
          programas={programas}
          estudios={estudios}
          onFinish={async () => { setExpressEditData(null); setNovoRoteiroOpen(false); await fetchHistorico(); }}
          editData={expressEditData}
          novoOpen={novoRoteiroOpen}
          onNovoOpenChange={(v) => { setNovoRoteiroOpen(v); if (!v) setExpressEditData(null); }}
          hideNovoToggle
          renderAsModal
          externalPasteText={externalPasteText}
          onExternalPasteConsumed={() => setExternalPasteText(null)}
        />
      </Suspense>

      {/* Modal: Automação de Programa */}
      {automacaoOpen && createPortal(
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) setAutomacaoOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(10, 37, 64, 0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}
        >
          <div style={{ position: "relative", width: "100%", maxWidth: 980, background: "#ffffff", borderRadius: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", overflow: "hidden" }}>
            <button
              onClick={() => setAutomacaoOpen(false)}
              aria-label="Fechar"
              style={{ position: "absolute", top: 12, right: 12, width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.95)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}
            >
              <X size={16} style={{ color: DARK }} />
            </button>
            <div style={{ padding: "20px 8px 20px" }}>
              <Suspense fallback={null}>
                <AutomacaoProgramaSection
                  programas={programas}
                  onGenerateRoteiro={(text) => { setAutomacaoOpen(false); setExternalPasteText(text); setNovoRoteiroOpen(true); }}
                  open
                  onOpenChange={setAutomacaoOpen}
                  hideToggle
                />
              </Suspense>
            </div>
          </div>
        </div>,
        document.body
      )}


      <Suspense fallback={null}>
        <WhatsAppSendDialog
          open={showWhatsAppDialog}
          onClose={() => { setShowWhatsAppDialog(false); setWhatsAppHistoricoData(null); }}
          roteiroData={whatsAppHistoricoData || {
            titulo: "Roteiro",
            programaNome: "",
            estudio: "",
            data: format(new Date(), "dd/MM/yyyy"),
            horario: "",
            participantes: [],
            conteudoTexto: "",
          }}
        />
      </Suspense>

      {/* TXT Edit Popup — rendered via portal to avoid parent re-render issues */}
      {txtEditRoteiroId && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) { setTxtEditRoteiroId(null); setTxtEditText(""); } }}>
          <div className="w-full max-w-lg mx-4 rounded-2xl p-5 space-y-3 shadow-2xl" style={{ backgroundColor: "var(--layout-page-bg, #fff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)" }} onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--layout-accent-color, #2563eb)" }}>
                <FileText size={16} /> Editar Roteiro TXT
              </p>
              <button onClick={() => { setTxtEditRoteiroId(null); setTxtEditText(""); }} className="p-1 rounded-full hover:opacity-70 transition" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                <X size={16} />
              </button>
            </div>
            <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
              Cole ou edite o conteúdo do roteiro abaixo
            </p>
            <textarea
              value={txtEditText}
              onChange={e => setTxtEditText(e.target.value)}
              placeholder="Cole o texto do roteiro aqui..."
              className="w-full px-3 py-2 rounded-xl text-xs outline-none resize-none"
              rows={14}
              style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }}
            />
            <button
              onClick={handleSaveTxtRoteiro}
              disabled={txtSaving || !txtEditText.trim()}
              className="w-full py-2.5 rounded-xl text-xs font-bold transition-all hover:brightness-110 flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ backgroundColor: "var(--layout-accent-color, #dc2626)", color: "#fff" }}
            >
              <Check size={14} /> {txtSaving ? "Atualizando..." : "Atualizar Roteiro"}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
