import { useState, useEffect, lazy, Suspense, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History, Trash2, Pencil, Code2, Copy, MessageSquare, FileText, X, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

const WhatsAppSendDialog = lazy(() => import("./WhatsAppSendDialog"));
const ProgramaExpressInline = lazy(() => import("./ProgramaExpressInline"));
const AutomacaoProgramaSection = lazy(() => import("./AutomacaoProgramaSection"));
import HistoricoTable from "./HistoricoTable";
import type { ExpressEditData } from "./ProgramaExpressInline";

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
      const { data: progs } = await supabase.from("programas").select("id, nome, estudio, tipo_programa, horario_inicio, horario_fim, dias_semana, apresentador_id, capa, selo").eq("ativo", true);
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

      // Pega XML completo direto da edge function (sempre fresco)
      const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID || "zzjfzxxvxbspbdkodoix";
      const anonKey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || "";
      const fnUrl = `https://${projectId}.supabase.co/functions/v1/roteiro-xml?id=${r.id}&force=1&t=${Date.now()}`;
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

      const xmlUrl = r.subtitulo!.replace("express_xml::", "");
      const urlObj = new URL(xmlUrl);
      const pathMatch = urlObj.pathname.match(/\/object\/public\/empresa-assets\/(.+)$/);
      if (!pathMatch) return false;
      const filePath = decodeURIComponent(pathMatch[1]);

      const blob = new Blob([new TextEncoder().encode(xml)], { type: "application/xml" });
      const { error } = await supabase.storage
        .from("empresa-assets")
        .upload(filePath, blob, { upsert: true, contentType: "application/xml", cacheControl: "0" });
      if (error) {
        console.warn("[RegenXML] upload error", error);
        return false;
      }
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
      <div className="px-6 pt-4 pb-2">
        <div className="rounded-xl p-3" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 14%, transparent)" }}>
          <div className="flex items-center gap-2 mb-2">
            <History size={12} style={{ color: "var(--layout-icon-color, #888888)" }} />
            <div className="flex items-center gap-1">
              {(["recentes", "historico"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className="text-[11px] font-bold px-2 py-0.5 rounded-md transition"
                  style={{
                    backgroundColor: activeTab === t ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 12%, transparent)" : "transparent",
                    color: activeTab === t ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)",
                  }}
                >
                  {t === "recentes" ? "Últimos roteiros" : "Histórico (30 dias)"}
                </button>
              ))}
            </div>
            {activeTab === "recentes" && (
              <button
                onClick={regenerateAllXmls}
                disabled={regenerating}
                className="text-[9px] px-2 py-0.5 rounded-md font-bold flex items-center gap-1 hover:opacity-80 transition disabled:opacity-40 ml-auto"
                style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)", color: "var(--layout-accent-color, #2563eb)" }}
                title="Regenerar todos os XMLs com a estrutura atualizada"
              >
                <RefreshCw size={10} className={regenerating ? "animate-spin" : ""} />
                {regenerating ? "Regenerando..." : "Regenerar XMLs"}
              </button>
            )}
          </div>
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
                    <div className="flex items-center gap-2 mb-1.5 px-0.5">
                      <span className="inline-block w-1 h-3 rounded-full" style={{ backgroundColor: "var(--layout-accent-color, #2563eb)" }} />
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 70%, transparent)" }}>
                        {est}
                      </span>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)", color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>
                        {grupos.get(est)!.length}
                      </span>
                      <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, color-mix(in srgb, var(--layout-border-color, #333333) 18%, transparent), transparent)" }} />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {grupos.get(est)!.map(r => {
                        const [yy, mm, dd] = (r.data_programa || "").split("-").map(Number);
                        const dataFormatada = yy ? format(new Date(yy, (mm || 1) - 1, dd || 1), "dd/MM/yyyy") : "";
                        const hasXml = typeof r.subtitulo === "string" && r.subtitulo.startsWith("express_xml::");
                        const isAuto = typeof r.titulo === "string" && r.titulo.includes("[AUTO]");
                        const cleanTitulo = (r.titulo || "").replace("[AUTO]", "").trim();
                        return (
                          <div key={r.id} className="flex-shrink-0 rounded-xl p-3 flex flex-col gap-2 transition-all hover:-translate-y-0.5 hover:shadow-md" style={{ minWidth: "230px", maxWidth: "280px", backgroundColor: isAuto ? "color-mix(in srgb, #8b5cf6 6%, transparent)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)", border: isAuto ? "1px solid color-mix(in srgb, #8b5cf6 45%, transparent)" : "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 10%, transparent)" }}>
                            <div className="flex items-start gap-1.5">
                              <p className="text-xs font-bold truncate flex-1 leading-tight" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                                {r.programa_nome || "Sem programa"}
                                {r.numero_roteiro && <span className="text-[10px] font-semibold ml-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 45%, transparent)" }}>#{r.numero_roteiro}</span>}
                              </p>
                              {isAuto && (
                                <span className="text-[8px] px-1.5 py-0.5 rounded-md font-bold flex-shrink-0" style={{ backgroundColor: "#8b5cf6", color: "#fff" }} title="Gerado por Automação">
                                  AUTO
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
                              <span className="font-semibold">{dataFormatada}</span>
                              {r.horario && <><span className="opacity-40">·</span><span>{r.horario}</span></>}
                            </div>
                            {cleanTitulo && (
                              <p className="text-[10px] line-clamp-2 leading-snug" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 75%, transparent)" }}>
                                {cleanTitulo}
                              </p>
                            )}
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
                              }} className="h-6 w-6 flex items-center justify-center rounded-md hover:opacity-70 transition" style={{ backgroundColor: "rgba(37,211,102,0.08)" }} title="Enviar por WhatsApp">
                                <MessageSquare size={10} style={{ color: "#25d366" }} />
                              </button>
                              {hasXml && (
                                <button onClick={async () => {
                                  toast.info("Enviando para o XML...");
                                  const ok = await regenerateXmlForRoteiro(r);
                                  if (ok) {
                                    await supabase.from("roteiros").update({ xml_pushed_at: new Date().toISOString() }).eq("id", r.id);
                                    toast.success("XML atualizado!");
                                  } else toast.error("Falha ao enviar XML");
                                }} className="h-6 w-6 flex items-center justify-center rounded-md hover:opacity-70 transition" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)" }} title="Enviar para o XML">
                                  <Code2 size={10} style={{ color: "var(--layout-accent-color, #2563eb)" }} />
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
                              }} className="h-6 w-6 flex items-center justify-center rounded-md hover:opacity-70 transition" style={{ backgroundColor: "rgba(38,143,250,0.08)" }} title="Editar">
                                <Pencil size={10} style={{ color: "var(--layout-icon-color, #888888)" }} />
                              </button>
                              <button onClick={() => excluirRoteiro(r.id)} className="h-6 w-6 flex items-center justify-center rounded-md hover:opacity-70 transition ml-auto" style={{ backgroundColor: "rgba(220,38,38,0.08)" }} title="Excluir">
                                <Trash2 size={10} style={{ color: "#dc2626" }} />
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
          })()
          )}
        </div>
      </div>
    );
  }, [historico, programas, activeTab, regenerating]);

  if (loading) return <ModulePageSkeleton />;

  return (
    <div className="animate-fade-in space-y-5">
      <Suspense fallback={<ModulePageSkeleton />}>
        <ProgramaExpressInline
          programas={programas}
          estudios={estudios}
          onFinish={async () => { setExpressEditData(null); await fetchHistorico(); }}
          editData={expressEditData}
          afterHeader={<>
            {estudios.length > 0 && (
              <div className="px-6 pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Code2 size={12} style={{ color: "var(--layout-icon-color, #888888)" }} />
                  <p className="text-[11px] font-bold" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 65%, transparent)" }}>
                    XML Roteiro por Estúdio
                  </p>
                </div>
                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                  {estudios.map(est => {
                    const xmlUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-xml-roteiro-estudio?user_id=${user?.id || ""}&estudio=${encodeURIComponent(est)}`;
                    return (
                      <div key={est} className="rounded-xl p-3 flex items-center gap-2"
                        style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 18%, transparent)" }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>
                            XML ROTEIRO
                          </p>
                          <p className="text-xs font-bold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{est}</p>
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(xmlUrl).then(() => toast.success(`URL do XML de ${est} copiada!`)).catch(() => toast.error("Erro ao copiar"))}
                          className="h-7 px-2 flex items-center gap-1 rounded-md text-[10px] font-bold hover:opacity-80 transition"
                          style={{ backgroundColor: "var(--layout-accent-color, #2563eb)", color: "#fff" }}
                          title={xmlUrl}
                        >
                          <Copy size={11} /> Copiar XML
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {historicoSlot}
            <Suspense fallback={null}>
              <AutomacaoProgramaSection
                programas={programas}
                onGenerateRoteiro={(text) => setExternalPasteText(text)}
              />
            </Suspense>

          </>}
          externalPasteText={externalPasteText}
          onExternalPasteConsumed={() => setExternalPasteText(null)}
        />
      </Suspense>

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
