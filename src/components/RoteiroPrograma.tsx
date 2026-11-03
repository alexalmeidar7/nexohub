import { useState, useEffect, Suspense, useMemo, useCallback, useRef } from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History, Trash2, Pencil, MessageSquare, FileText, X, Check, RefreshCw, Zap, Bot, Send, Calendar, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

const WhatsAppSendDialog = lazyRetry(() => import("./WhatsAppSendDialog"));
import ProgramaExpressInline from "./ProgramaExpressInline";
const AutomacaoProgramaSection = lazyRetry(() => import("./AutomacaoProgramaSection"));
import HistoricoTable from "./HistoricoTable";
import type { ExpressEditData } from "./ProgramaExpressInline";
import { getProgramas } from "./ProgramaForm";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";

// Palette (nexo-form-design-system) — alinhado ao Cadastro de Cliente
const CYAN = "#0055ff";
const LIME = "#0055ff";
const CARD_BG = "#ffffff";
const DARK = "#002132";
const MONT: React.CSSProperties = { fontFamily: "'Montserrat', sans-serif" };

// Formata timestamp UTC do banco no fuso local do usuário (respeita DST automaticamente).
const LOCAL_TZ = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "America/Sao_Paulo";
function formatLocal(iso: string | null | undefined, pattern: "full" | "short" = "full"): string {
  if (!iso) return "";
  let dateStr = String(iso).trim();
  if (dateStr.includes(" ") && !dateStr.includes("T")) {
    dateStr = dateStr.replace(" ", "T");
  }
  if (!/([+-]\d{2}(:?\d{2})?|Z)$/i.test(dateStr)) {
    dateStr = `${dateStr}Z`;
  }
  const d = new Date(dateStr);
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
  apresentadores_ids?: string[] | null;
  capa: string | null;
  selo: string | null;
}

function findProgramaForRoteiro(r: any, progs: Programa[]): Programa | undefined {
  if (!r || !Array.isArray(progs) || progs.length === 0) return undefined;
  if (r.programa_id) {
    const byId = progs.find(p => p.id === r.programa_id);
    if (byId) return byId;
  }
  const rawName = (r.programa_nome || "").replace(/^PROGRAMA EXPRESS\s*[-—]\s*/i, "").trim();
  const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  const target = norm(rawName);
  if (!target) return undefined;
  return progs.find(p => norm(p.nome) === target) ||
         progs.find(p => norm(p.nome).includes(target) || target.includes(norm(p.nome)));
}

export default function RoteiroPrograma({ effectiveUserId: propEffectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const [resolvedUserId, setResolvedUserId] = useState<string>("");
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
  const [novoRoteiroOpen, setNovoRoteiroOpen] = useState(false);
  const [automacaoOpen, setAutomacaoOpen] = useState(false);
  const [agendados, setAgendados] = useState<any[]>([]);

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
      data_programa: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
      updated_at: new Date().toISOString(),
    };
    if (tickertitulos !== null) updatePayload.tickertitulos = tickertitulos;

    // Confirma que a linha foi realmente atualizada. Sem o .select(), um update
    // que não encontra a linha (id local/antigo) retorna sucesso e o XML continua
    // com os dados antigos.
    let { data: updatedRows, error } = await supabase
      .from("roteiros")
      .update(updatePayload)
      .eq("id", txtEditRoteiroId)
      .eq("user_id", roteiro?.user_id || resolvedUserId || propEffectiveUserId || user?.id)
      .select("id");

    if (!error && (!updatedRows || updatedRows.length === 0) && roteiro?.programa_nome) {
      const ownerId = roteiro.user_id || resolvedUserId || propEffectiveUserId || user?.id;
      if (ownerId) {
        const retry = await supabase
          .from("roteiros")
          .update(updatePayload)
          .eq("user_id", ownerId)
          .eq("programa_nome", roteiro.programa_nome)
          .select("id");
        updatedRows = retry.data;
        error = retry.error;
      }
    }

    if (error || !updatedRows || updatedRows.length === 0) {
      setTxtSaving(false);
      toast.error(`Não foi possível salvar este roteiro no servidor: ${error?.message || "registro não encontrado"}`);
      return;
    }

    // ── Regenerate XML and sync immediately ──
    // Usa o MESMO caminho completo de publicação do botão de envio (sincronismo local,
    // upload no storage com caminho de fallback e função de persistência), para que o
    // XML do roteiro sempre reflita as informações recém-salvas.
    if (!error) {
      try {
        await regenRef.current({
          ...roteiro,
          id: updatedRows?.[0]?.id || txtEditRoteiroId,
          conteudo_html: txtEditText,
          participantes: JSON.stringify(updatedParticipantes),
          data_programa: updatePayload.data_programa,
          updated_at: updatePayload.updated_at,
          ...(tickertitulos !== null ? { tickertitulos } : {}),
        });
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

  const getLocalStorageKey = (uId: string) => `nexohub_roteiros_${uId}`;

  const getStoredRoteiros = (uId: string): any[] => {
    try {
      const raw = localStorage.getItem(getLocalStorageKey(uId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  };

  const saveStoredRoteiros = (uId: string, list: any[]) => {
    try {
      localStorage.setItem(getLocalStorageKey(uId), JSON.stringify(list));
    } catch {}
  };

  const resolveEffectiveUserId = async (): Promise<string> => {
    if (propEffectiveUserId) return propEffectiveUserId;
    if (!user) return "";
    try {
      const { data: sub } = await supabase
        .from("sub_users")
        .select("parent_user_id, ativo")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (sub?.ativo && sub.parent_user_id) return sub.parent_user_id;
    } catch {}
    return user.id;
  };

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const withDeadline = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout carregando ${label}`)), ms)
        ),
      ]);

    let effectiveUserId = user.id;
    let programasList: Programa[] = [];

    try {
      // A resolução de subusuário não pode manter a tela inteira em skeleton.
      try {
        effectiveUserId = await withDeadline(resolveEffectiveUserId(), 5000, "usuário");
      } catch {
        effectiveUserId = propEffectiveUserId || user.id;
      }
      setResolvedUserId(effectiveUserId);

      try {
        const result = await withDeadline(
          supabase
            .from("programas")
            .select("id, nome, estudio, tipo_programa, horario_inicio, horario_fim, dias_semana, apresentador_id, apresentadores_ids, capa, selo")
            .eq("ativo", true)
            .eq("user_id", effectiveUserId),
          7000,
          "programas"
        );
        if (!result.error && result.data?.length) programasList = result.data as Programa[];
      } catch (error) {
        console.warn("[RoteiroPrograma] consulta de programas indisponível; tentando cache:", error);
      }

      if (programasList.length === 0) {
        try {
          const fallbackProgs = await withDeadline(
            getProgramas(effectiveUserId, user.email),
            5000,
            "cache de programas"
          );
          if (fallbackProgs?.length) {
            const map = new Map<string, Programa>();
            fallbackProgs.forEach((p: any) => {
              const formatted: Programa = {
                id: p.id,
                nome: p.nome,
                estudio: p.estudio || "",
                tipo_programa: p.tipo_programa || p.tipoPrograma || null,
                horario_inicio: p.horario_inicio || p.horarioInicio || "",
                horario_fim: p.horario_fim || p.horarioFim || "",
                dias_semana: Array.isArray(p.dias_semana) ? p.dias_semana : (Array.isArray(p.diasSemana) ? p.diasSemana : (p.dias_semana ? p.dias_semana.split(",") : [])),
                apresentador_id: p.apresentador_id || p.apresentadorId || null,
                apresentadores_ids: (p as any).apresentadores_ids || (p as any).apresentadoresIds || (p.apresentador_id ? [p.apresentador_id] : (p as any).apresentadorId ? [(p as any).apresentadorId] : null),
                capa: p.capa || null,
                selo: p.selo || null,
              };
              if (formatted.id) map.set(formatted.id, formatted);
            });
            programasList = Array.from(map.values());
          }
        } catch (error) {
          console.warn("[RoteiroPrograma] cache de programas indisponível:", error);
        }
      }

      setProgramas(programasList);
      setEstudios([...new Set(programasList.map(p => p.estudio).filter(Boolean))] as string[]);
    } finally {
      // Sempre libera a interface; o histórico pode continuar carregando em segundo plano.
      setLoading(false);
    }

    void fetchHistorico(programasList).catch((error) =>
      console.warn("[RoteiroPrograma] falha ao carregar histórico:", error)
    );
  }, [user, propEffectiveUserId]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handleProgramasUpdated = () => {
      load();
    };
    const handleRoteirosUpdated = () => {
      fetchHistorico();
    };
    window.addEventListener("nexohub:programas-updated", handleProgramasUpdated);
    window.addEventListener("housemix:programas-updated", handleProgramasUpdated);
    window.addEventListener("nexohub:roteiros-updated", handleRoteirosUpdated);
    return () => {
      window.removeEventListener("nexohub:programas-updated", handleProgramasUpdated);
      window.removeEventListener("housemix:programas-updated", handleProgramasUpdated);
      window.removeEventListener("nexohub:roteiros-updated", handleRoteirosUpdated);
    };
  }, [load]);

  const parseXmlToRoteiro = (
    xmlText: string,
    xmlUrl: string,
    fileId: string,
    effectiveUserId: string,
    fileCreatedAt?: string,
    knownProgramas?: Programa[]
  ) => {
    const getTag = (xml: string, tag: string) => {
      const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return m ? m[1].trim() : "";
    };

    const decodeXml = (s: string) => {
      if (!s) return "";
      return s
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    };

    const cleanXmlVal = (s: string) => {
      if (!s) return "";
      return decodeXml(s)
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
        .replace(/<[^>]+>/g, "")
        .trim();
    };

    const isItemsDados = xmlText.includes("<items>") && xmlText.includes("<dados>");

    let rawProg = getTag(xmlText, "programa");
    let rawTitulo = getTag(xmlText, "titulo");
    let rawEstudio = getTag(xmlText, "estudio");

    let programaNome = cleanXmlVal(rawProg);
    if (!programaNome && rawTitulo) {
      const cleanTit = cleanXmlVal(rawTitulo);
      if (cleanTit.includes("—")) programaNome = cleanTit.split("—")[1].trim();
      else if (cleanTit.includes("-")) programaNome = cleanTit.split("-")[1].trim();
      else programaNome = cleanTit;
    }
    if (!programaNome) programaNome = "Programa";

    // Limpa prefixos conhecidos caso tenham sido gravados
    if (programaNome.toUpperCase().startsWith("PROGRAMA EXPRESS — ")) {
      programaNome = programaNome.substring(19).trim();
    } else if (programaNome.toUpperCase().startsWith("PROGRAMA EXPRESS - ")) {
      programaNome = programaNome.substring(19).trim();
    }

    let rawEstudioClean = cleanXmlVal(rawEstudio);
    let estudio = rawEstudioClean;

    // Se o XML não tiver estúdio explícito, detecta pelo nome do programa
    if (!estudio) {
      const lowerProg = programaNome.toLowerCase();
      if (
        lowerProg.includes("bate papo") ||
        lowerProg.includes("conversas") ||
        lowerProg.includes("família") ||
        lowerProg.includes("familia") ||
        lowerProg.includes("política") ||
        lowerProg.includes("politica") ||
        lowerProg.includes("podcast") ||
        lowerProg.includes("debate")
      ) {
        estudio = "PODCAST";
      } else {
        estudio = "ESTÚDIO FM";
      }
    }

    // Tenta encontrar o estúdio correto na grade de programas cadastrados
    let matchedProg: Programa | undefined;
    if (knownProgramas && knownProgramas.length > 0) {
      matchedProg = knownProgramas.find(
        p => p.nome?.toLowerCase().trim() === programaNome.toLowerCase().trim()
      ) || findProgramaForRoteiro({ programa_nome: programaNome }, knownProgramas);
      if (matchedProg && matchedProg.estudio) {
        estudio = matchedProg.estudio;
      }
    }

    // Normalização dos estúdios padrão
    const normEst = estudio.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    if (normEst === "ESTUDIO FM" || normEst === "FM" || normEst === "ESTUDIO PRINCIPAL" || normEst === "PRINCIPAL") {
      estudio = "ESTÚDIO FM";
    } else if (normEst.includes("PODCAST")) {
      estudio = "PODCAST";
    }

    const rawData = cleanXmlVal(getTag(xmlText, "data"));
    let dataPrograma = rawData;
    if (!dataPrograma && fileCreatedAt) {
      try {
        const d = new Date(fileCreatedAt);
        dataPrograma = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      } catch {}
    }
    if (!dataPrograma) {
      const now = new Date();
      dataPrograma = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }

    const rawHorario = cleanXmlVal(getTag(xmlText, "horario") || getTag(xmlText, "hora") || getTag(xmlText, "hora_inicio"));
    let finalHorario = rawHorario;
    if (!finalHorario && matchedProg?.horario_inicio) {
      finalHorario = matchedProg.horario_inicio.slice(0, 5);
    }
    if (!finalHorario && fileCreatedAt) {
      try {
        const d = new Date(fileCreatedAt);
        finalHorario = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      } catch {}
    }
    if (!finalHorario) finalHorario = "08:00";

    const participantes: any[] = [];
    const escaladaList: any[] = [];
    const blocos: any[] = [];
    let podcastData: any = null;

    if (isItemsDados) {
      const partNome = cleanXmlVal(getTag(xmlText, "participante_nome"));
      const partCargo = cleanXmlVal(getTag(xmlText, "participante_cargo") || "Apresentador");
      const insta = cleanXmlVal(getTag(xmlText, "rede_social_instagram_texto"));
      if (partNome) {
        participantes.push({ nome: partNome, cargo: partCargo, instagram: insta });
      }
    } else {
      const participantesMatch = xmlText.match(/<participantes>([\s\S]*?)<\/participantes>/i);
      if (participantesMatch) {
        const partXml = participantesMatch[1];
        const itemMatches = partXml.matchAll(/<(?:participante\d+|item)>([\s\S]*?)<\/(?:participante\d+|item)>/gi);
        for (const match of itemMatches) {
          const inner = match[1];
          const nome = cleanXmlVal(getTag(inner, "nome"));
          const cargo = cleanXmlVal(getTag(inner, "cargo"));
          const instagram = cleanXmlVal(getTag(inner, "instagram"));
          if (nome) participantes.push({ nome, cargo, instagram });
        }
      }

      const escaladaMatch = xmlText.match(/<escalada>([\s\S]*?)<\/escalada>/i);
      if (escaladaMatch) {
        const escXml = escaladaMatch[1];
        const itemMatches = escXml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi);
        for (const match of itemMatches) {
          const inner = match[1];
          const titulo = cleanXmlVal(getTag(inner, "titulo"));
          const imagem = cleanXmlVal(getTag(inner, "imagem"));
          if (titulo) escaladaList.push({ titulo, imagemUrl: imagem });
        }
      }

      const roteiroMatch = xmlText.match(/<roteiro>([\s\S]*?)<\/roteiro>/i);
      if (roteiroMatch) {
        const rXml = roteiroMatch[1];
        const tituloTarja = cleanXmlVal(getTag(rXml, "tituloTarja") || getTag(rXml, "titulo"));
        const subtituloTarja = cleanXmlVal(getTag(rXml, "subtituloTarja") || getTag(rXml, "subtitulo"));
        const introducao = cleanXmlVal(getTag(rXml, "introducao"));
        const concluindo = cleanXmlVal(getTag(rXml, "concluindo"));
        const perguntas: string[] = [];
        const perMatches = rXml.matchAll(/<pergunta[^>]*>([\s\S]*?)<\/pergunta>/gi);
        for (const pm of perMatches) {
          const pText = cleanXmlVal(pm[1]);
          if (pText) perguntas.push(pText);
        }
        podcastData = {
          tituloTarja,
          subtituloTarja,
          introducao,
          perguntas,
          concluindo,
          apoioImagens: [],
          apoioVideos: []
        };
        if (tituloTarja || perguntas.length > 0) {
          blocos.push({
            noticias: [{
              titulo: tituloTarja || (perguntas[0] || "PAUTA PODCAST"),
              resumo: introducao,
              texto_materia: concluindo || perguntas.join("\n"),
              escalada: false
            }]
          });
        }
      }

      const blocoMatches = xmlText.matchAll(/<bloco[^>]*>([\s\S]*?)<\/bloco>/gi);
      for (const bMatch of blocoMatches) {
        const bXml = bMatch[1];
        const noticias: any[] = [];
        const notMatches = bXml.matchAll(/<noticia[^>]*>([\s\S]*?)<\/noticia>/gi);
        for (const nMatch of notMatches) {
          const nXml = nMatch[1];
          const titulo = cleanXmlVal(getTag(nXml, "titulo"));
          const imagem = cleanXmlVal(getTag(nXml, "imagem"));
          const resumo = cleanXmlVal(getTag(nXml, "resumo"));
          const texto = cleanXmlVal(getTag(nXml, "texto_materia") || getTag(nXml, "texto"));
          const escalada = getTag(nXml, "escalada") === "true";
          if (titulo || texto) {
            noticias.push({
              titulo,
              imagemUrl: imagem,
              resumo,
              texto_materia: texto,
              escalada
            });
          }
        }
        if (noticias.length > 0) blocos.push({ noticias });
      }
    }

    const participantesData = {
      participantes,
      escaladaList,
      blocos,
      ...(podcastData ? { podcastData } : {})
    };

    let textoFormatado = `Estúdio: ${estudio}\nPrograma: ${programaNome}\n\n`;
    if (participantes.length > 0) {
      textoFormatado += `EQUIPE:\n`;
      participantes.forEach(p => {
        textoFormatado += `- ${p.nome}${p.cargo ? ` – ${p.cargo}` : ""}${p.instagram ? ` : ${p.instagram}` : ""}\n`;
      });
      textoFormatado += `\n`;
    }
    if (podcastData?.tituloTarja) {
      textoFormatado += `PAUTA:\n- ${podcastData.tituloTarja}\n\n`;
    }
    if (escaladaList.length > 0) {
      textoFormatado += `ESCALADA:\n`;
      escaladaList.forEach((e, idx) => {
        textoFormatado += `${idx + 1}. ${e.titulo}\n`;
      });
      textoFormatado += `\n`;
    }
    blocos.forEach((b, idx) => {
      textoFormatado += `BLOCO ${idx + 1}:\n`;
      b.noticias.forEach((n: any) => {
        textoFormatado += `- ${n.titulo}\n`;
      });
      textoFormatado += `\n`;
    });

    const ticker = escaladaList.length > 0
      ? escaladaList.map(e => e.titulo).join(" • ")
      : blocos.flatMap(b => b.noticias.map((n: any) => n.titulo)).join(" • ");

    return {
      id: fileId,
      user_id: effectiveUserId,
      programa_nome: programaNome,
      programa_id: matchedProg?.id || "",
      estudio: estudio,
      titulo: `PROGRAMA EXPRESS — ${programaNome}`,
      subtitulo: `express_xml::${xmlUrl}`,
      tipo_programa: matchedProg?.tipo_programa || "Jornalístico / Talk",
      data_programa: dataPrograma,
      horario: finalHorario,
      conteudo_html: textoFormatado.trim(),
      participantes: JSON.stringify(participantesData),
      status: "feito",
      tickertitulos: ticker,
      created_at: fileCreatedAt || new Date().toISOString(),
      updated_at: fileCreatedAt || new Date().toISOString(),
      xml_pushed_at: fileCreatedAt || new Date().toISOString(),
    };
  };

  const fetchHistorico = async (_currentProgramas?: Programa[]) => {
    if (!user) return;
    const effectiveUserId = await resolveEffectiveUserId();
    const progs = _currentProgramas || programas;

    const candidateUserIds = [effectiveUserId];

    let dbRoteiros: any[] = [];
    let dbUnavailable = false;
    try {
      const res = await supabase
        .from("roteiros")
        .select("*")
        .eq("user_id", effectiveUserId)
        .order("updated_at", { ascending: false });
      if (res.error) dbUnavailable = true;
      if (!res.error && res.data && res.data.length > 0) {
        dbRoteiros = res.data.filter((r: any) => !r.programa_nome?.includes("<"));
      }
    } catch { dbUnavailable = true; }

    // O banco de dados é a ÚNICA fonte de verdade. O cache local só é usado
    // quando o banco não respondeu com nenhum registro (modo offline),
    // evitando datas/horários diferentes entre preview e usuário final.
    let data: any[] = [];

    if (dbRoteiros.length > 0) {
      data = [...dbRoteiros];
      data.sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || 0).getTime() -
          new Date(a.updated_at || a.created_at || 0).getTime()
      );
      // Cache local reescrito integralmente com o estado do banco
      candidateUserIds.forEach((uid) => saveStoredRoteiros(uid, data));
    } else if (dbUnavailable) {
      const localRoteiros: any[] = [];
      candidateUserIds.forEach((uid) => {
        const stored = getStoredRoteiros(uid);
        if (Array.isArray(stored) && stored.length > 0) {
          localRoteiros.push(...stored.filter((r: any) => !r.programa_nome?.includes("<")));
        }
      });
      const combinedMap = new Map<string, any>();
      localRoteiros.forEach((r) => {
        if (r?.id) combinedMap.set(r.id, r);
      });
      data = Array.from(combinedMap.values());
      data.sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || 0).getTime() -
          new Date(a.updated_at || a.created_at || 0).getTime()
      );
    }


    // Se a tabela estiver vazia, busca os arquivos XML REAIS gravados no Storage (empresa-assets/express/{userId})
    if (data.length === 0 && dbUnavailable) {
      try {
        let files: any[] = [];
        try {
          const res = await supabase.storage
            .from("empresa-assets")
            .list(`express/${effectiveUserId}`, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
          if (res.data && res.data.length > 0) {
            files = res.data;
          }
        } catch {}

        if (files.length === 0) {
          try {
            const anonKey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || "";
            const sbUrl = (import.meta as any).env?.VITE_SUPABASE_URL || "https://qazvgmgdidjhbvcuinpy.supabase.co";
            const res = await fetch(`${sbUrl}/storage/v1/object/list/empresa-assets`, {
              method: "POST",
              headers: {
                "apikey": anonKey,
                "Authorization": `Bearer ${anonKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                prefix: `express/${effectiveUserId}`,
                limit: 100,
                sortBy: { column: "created_at", order: "desc" },
              }),
            });
            if (res.ok) {
              const listData = await res.json();
              if (Array.isArray(listData) && listData.length > 0) {
                files = listData;
              }
            }
          } catch (listErr) {
            console.warn("Erro ao listar storage com anonKey:", listErr);
          }
        }

        if (files && files.length > 0) {
          const xmlFiles = files.filter(f => f.name.endsWith(".xml"));
          const recentXmlFiles = xmlFiles.slice(0, 30);
          const parsedResults = await Promise.all(
            recentXmlFiles.map(async (file) => {
              try {
                const { data: pubUrl } = supabase.storage
                  .from("empresa-assets")
                  .getPublicUrl(`express/${effectiveUserId}/${file.name}`);
                const fileUrl = pubUrl.publicUrl;
                const res = await fetch(fileUrl);
                if (res.ok) {
                  const xmlContent = await res.text();
                  return parseXmlToRoteiro(
                    xmlContent,
                    fileUrl,
                    file.name.replace(".xml", ""),
                    effectiveUserId,
                    file.created_at || file.updated_at,
                    progs
                  );
                }
              } catch (err) {
                console.warn("Erro ao processar XML de roteiro:", file.name, err);
              }
              return null;
            })
          );

          const parsedRoteiros: any[] = parsedResults.filter(Boolean);

          if (parsedRoteiros.length > 0) {
            // Deduplica mantendo a versão mais recente de cada programa
            parsedRoteiros.sort((a, b) => new Date(b.created_at || b.updated_at || 0).getTime() - new Date(a.created_at || a.updated_at || 0).getTime());
            const progMap = new Map<string, any>();
            for (const r of parsedRoteiros) {
              const key = (r.programa_nome || "").toLowerCase().trim();
              if (key && !progMap.has(key)) {
                progMap.set(key, r);
              }
            }
            data = Array.from(progMap.values());
            data.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
            candidateUserIds.forEach((uid) => saveStoredRoteiros(uid, data));
          }
        }
      } catch (e) {
        console.warn("Erro ao buscar XMLs do storage:", e);
      }
    }

    // Se ainda vazio, consulta o endpoint oficial do servidor serve-xml-roteiro-estudio para os estúdios reais
    if (data.length === 0 && dbUnavailable) {
      try {
        const candidateEstudios = Array.from(new Set([
          "Estudio FM",
          "Podcast",
          "ESTÚDIO FM",
          "PODCAST",
          ...progs.map(p => p.estudio).filter(Boolean)
        ]));

        const serverRoteiros: any[] = [];
        for (const est of candidateEstudios) {
          try {
            const res = await fetch(`https://qazvgmgdidjhbvcuinpy.supabase.co/functions/v1/serve-xml-roteiro-estudio?user_id=${effectiveUserId}&estudio=${encodeURIComponent(est)}`);
            if (res.ok) {
              const xmlText = await res.text();
              if (xmlText.includes("<programaExpress>") && !xmlText.includes("<error>")) {
                const parsed = parseXmlToRoteiro(
                  xmlText,
                  `https://qazvgmgdidjhbvcuinpy.supabase.co/functions/v1/serve-xml-roteiro-estudio?user_id=${effectiveUserId}&estudio=${encodeURIComponent(est)}`,
                  `srv_${effectiveUserId}_${est.replace(/\s+/g, "_")}`,
                  effectiveUserId,
                  new Date().toISOString(),
                  progs
                );
                if (parsed && (parsed.conteudo_html || parsed.participantes)) {
                  serverRoteiros.push(parsed);
                }
              }
            }
          } catch {}
        }

        if (serverRoteiros.length > 0) {
          const progMap = new Map<string, any>();
          for (const r of serverRoteiros) {
            const key = (r.programa_nome || r.estudio || "").toLowerCase().trim();
            if (key && !progMap.has(key)) {
              progMap.set(key, r);
            }
          }
          data = Array.from(progMap.values());
          saveStoredRoteiros(effectiveUserId, data);
        }
      } catch (e) {
        console.warn("Erro ao buscar serve-xml-roteiro-estudio:", e);
      }
    }

    if (!data || data.length === 0) {
      setHistorico([]);
      setAgendados([]);
      return;
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Roteiros agendados vencidos (mais de 1h após o horário agendado) saem da lista de agendados
    const expiredAgendados = data.filter(
      (r: any) => r.agendado_para_envio && new Date(r.agendado_para_envio) <= oneHourAgo
    );
    if (expiredAgendados.length > 0) {
      const expiredIds = expiredAgendados.map((r: any) => r.id);
      try {
        await supabase.from("roteiros").update({ agendado_para_envio: null }).in("id", expiredIds);
      } catch {}
      for (const r of data) {
        if (expiredIds.includes(r.id)) r.agendado_para_envio = null;
      }
    }

    // 1. Roteiros agendados: todos com data de agendamento ativa
    const activeAgendados = data.filter((r: any) => !!r.agendado_para_envio);
    activeAgendados.sort((a: any, b: any) => new Date(a.agendado_para_envio).getTime() - new Date(b.agendado_para_envio).getTime());

    // 2. Roteiros cadastrados (boxes principais por programa + estúdio)
    // Permite que programas agendados também mantenham seu box em cadastrados
    const baseItems = data.filter((r: any) => !r.agendado_para_envio);
    const candidatesForBoxes = baseItems.length > 0 ? [...baseItems, ...data] : data;
    const progMap = new Map<string, any>();
    for (const r of candidatesForBoxes) {
      const key = `${(r.programa_nome || "").toLowerCase().trim()}__${(r.estudio || "").toLowerCase().trim()}`;
      if (key && !progMap.has(key)) {
        progMap.set(key, r);
      } else if (!key) {
        progMap.set(r.id, r);
      }
    }
    const finalHistorico = Array.from(progMap.values());
    finalHistorico.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());

    setHistorico(finalHistorico);
    setAgendados(activeAgendados);
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
      try {
        await supabase.from("roteiros").update({ status: "feito" }).in("id", toMarkFeito);
      } catch {}
      for (const id of toMarkFeito) {
        const rot = data.find(r => r.id === id);
        if (!rot) continue;
        try {
          const { data: eventos } = await supabase.from("agenda_eventos").select("id, descricao").eq("user_id", effectiveUserId).ilike("descricao", `%Roteiro: ${rot.programa_nome}%`).eq("data", rot.horario ? `${rot.data_programa}T${rot.horario}:00` : rot.data_programa);
          if (eventos && eventos.length > 0) {
            for (const ev of eventos) {
              if (!ev.descricao?.includes("[VENCIDO]")) {
                await supabase.from("agenda_eventos").update({ descricao: `[VENCIDO] ${ev.descricao}` }).eq("id", ev.id);
              }
            }
          }
        } catch {}
      }
    }
  };

  useEffect(() => {
    if (user) fetchHistorico();
    const handleUpdated = () => {
      fetchHistorico();
    };
    window.addEventListener("nexohub:roteiros-updated", handleUpdated);
    return () => window.removeEventListener("nexohub:roteiros-updated", handleUpdated);
  }, [user, propEffectiveUserId]);

  const excluirRoteiro = async (id: string) => {
    const effectiveUserId = await resolveEffectiveUserId();
    const roteiro = historico.find(r => r.id === id);
    try {
      await supabase.from("roteiros").delete().eq("id", id);
      if (roteiro && user) {
        await supabase.from("agenda_eventos").delete().eq("user_id", effectiveUserId).eq("data", roteiro.data_programa).like("descricao", `Roteiro: ${roteiro.programa_nome}%`);
      }
    } catch {}

    const acc = findClientAccountById(effectiveUserId) || findClientAccountByEmail(user?.email);
    const candidateUserIds = Array.from(
      new Set([effectiveUserId, user?.id, propEffectiveUserId, resolvedUserId, acc?.id, acc?.parentUserId].filter(Boolean) as string[])
    );
    candidateUserIds.forEach((uid) => {
      const updated = getStoredRoteiros(uid).filter(r => r.id !== id);
      saveStoredRoteiros(uid, updated);
    });
    toast.success("Roteiro excluído");
    fetchHistorico();
  };

  const cancelAgendamento = async (id: string) => {
    try {
      const { error } = await supabase
        .from("roteiros")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Agendamento cancelado");
      fetchHistorico();
    } catch (e) {
      toast.error("Erro ao cancelar agendamento");
    }
  };

  const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");


  const regenerateXmlForRoteiro = async (r: any): Promise<boolean> => {
    try {
      if (!r) return false;

      let parts: any = {};
      try {
        let raw = r.participantes;
        if (typeof raw === "string") raw = JSON.parse(raw);
        if (typeof raw === "string") raw = JSON.parse(raw);
        parts = Array.isArray(raw) ? { blocos: [], participantes: raw } : (raw || {});
      } catch {
        parts = {};
      }

      const pList: any[] = parts.participantes || [];
      const blocosList: any[] = parts.blocos || [];
      const escaladaItems: any[] = parts.escaladaList || [];
      const podcastData = parts.podcastData;
      const isPodcast = !!podcastData;

      // Construct valid XML for Programa Express / vMix
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<programaExpress>\n`;
      xml += `  <programa>${escXml(r.programa_nome || "")}</programa>\n`;
      xml += `  <estudio>${escXml(r.estudio || "")}</estudio>\n`;
      xml += `  <data>${r.data_programa || new Date().toISOString().split("T")[0]}</data>\n`;
      if (r.horario) {
        xml += `  <horario>${escXml(r.horario)}</horario>\n`;
        xml += `  <hora>${escXml(r.horario)}</hora>\n`;
      }

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

      if (isPodcast) {
        const podcast = podcastData;
        xml += `  <roteiro>\n`;
        xml += `    <tituloTarja>${escXml(podcast.tituloTarja || "")}</tituloTarja>\n`;
        xml += `    <subtituloTarja>${escXml(podcast.subtituloTarja || "")}</subtituloTarja>\n`;
        xml += `    <introducao>${escXml(podcast.introducao || "")}</introducao>\n`;
        xml += `    <perguntas>\n`;
        (podcast.perguntas || []).filter((p: any) => p?.trim()).forEach((p: any, i: number) => { 
          xml += `      <pergunta ordem="${i + 1}">${escXml(p)}</pergunta>\n`; 
        });
        xml += `    </perguntas>\n`;
        xml += `    <concluindo>${escXml(podcast.concluindo || "")}</concluindo>\n`;
        xml += `  </roteiro>\n`;
      } else {
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
      }

      xml += `</programaExpress>`;

      // Extract storage file path if subtitulo has express_xml:: URL
      let filePath = "";
      let xmlUrl = "";
      if (r.subtitulo?.startsWith("express_xml::")) {
        try {
          xmlUrl = r.subtitulo.replace("express_xml::", "");
          const urlObj = new URL(xmlUrl);
          const pathMatch = urlObj.pathname.match(/\/object\/public\/empresa-assets\/(.+)$/);
          if (pathMatch) filePath = decodeURIComponent(pathMatch[1]);
        } catch {}
      }

      const cleanId = String(r.id || "").replace(/^express_/, "");
      const owner = r.user_id || propEffectiveUserId || resolvedUserId || user?.id;
      if (!owner) throw new Error("Conta do roteiro não identificada");
      if (!filePath) {
        filePath = `express/${owner}/express_${cleanId}.xml`;
      }

      // 1. Sync to local /api/sync-xml-roteiro (writes to public/xml/[slug]/roteiro.xml)
      try {
        const clientAcc = findClientAccountById(owner) || findClientAccountByEmail(user?.email);
        const slug = clientAcc?.slug || owner;
        await fetch("/api/sync-xml-roteiro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, userId: owner, estudio: r.estudio, xml, roteiro: r }),
        });
      } catch {}

      // 2. Upload to Supabase Storage (empresa-assets)
      try {
        const blob = new Blob([new TextEncoder().encode(xml)], { type: "application/xml; charset=utf-8" });
        const { data: upData } = await supabase.storage.from("empresa-assets").upload(filePath, blob, {
          upsert: true,
          contentType: "application/xml; charset=utf-8",
          cacheControl: "0",
        });
        if (!xmlUrl && upData) {
          const { data: pubData } = supabase.storage.from("empresa-assets").getPublicUrl(filePath);
          if (pubData?.publicUrl) xmlUrl = pubData.publicUrl;
        }
      } catch (upErr) {
        console.warn("[RegenXML] Storage direct upload warning:", upErr);
      }

      // 3. Optional edge function invoke if cleanId is a valid UUID in roteiros table
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
      if (isUuid) {
        try {
          const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID || "zzjfzxxvxbspbdkodoix";
          const anonKey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || "";
          const fnUrl = `https://${projectId}.supabase.co/functions/v1/roteiro-xml?id=${cleanId}&force=1&persist=1&t=${Date.now()}`;
          await fetch(fnUrl, {
            headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
            cache: "no-store",
          });
        } catch {}
      }

      // 4. Update xml_pushed_at timestamp
      const nowIso = new Date().toISOString();
      r.xml_pushed_at = nowIso;
      if (xmlUrl && !r.subtitulo) {
        r.subtitulo = `express_xml::${xmlUrl}`;
      }

      // Update Supabase DB table
      try {
        const updatePayload: any = { xml_pushed_at: nowIso };
        if (isUuid) {
          await supabase.from("roteiros").update(updatePayload).eq("id", cleanId).eq("user_id", owner);
        }
        if (r.user_id && r.programa_nome) {
          await supabase.from("roteiros").update(updatePayload).eq("user_id", owner).eq("programa_nome", r.programa_nome);
        }
      } catch {}

      // O cache local pertence somente à conta do roteiro.
      const candidateUids = [owner];

      candidateUids.forEach((uid) => {
        try {
          const list = getStoredRoteiros(uid);
          if (Array.isArray(list) && list.length > 0) {
            const idx = list.findIndex((item: any) =>
              item.id === r.id ||
              (item.programa_nome === r.programa_nome && item.estudio === r.estudio)
            );
            if (idx >= 0) {
              list[idx] = { ...list[idx], xml_pushed_at: nowIso };
              saveStoredRoteiros(uid, list);
            }
          }
        } catch {}
      });

      // Update in-memory state
      setHistorico((prev) =>
        prev.map((item) =>
          item.id === r.id || (item.programa_nome === r.programa_nome && item.estudio === r.estudio)
            ? { ...item, xml_pushed_at: nowIso }
            : item
        )
      );

      return true;
    } catch (e) {
      console.warn(`[RegenXML] Error on roteiro ${r?.id}:`, e);
      return false;
    }
  };

  // ── Agendador local: envia o XML exatamente ao atingir a data/hora agendada ──
  const autoSendingRef = useRef<Set<string>>(new Set());
  const agendadosRef = useRef<any[]>([]);
  agendadosRef.current = agendados;
  const regenRef = useRef(regenerateXmlForRoteiro);
  regenRef.current = regenerateXmlForRoteiro;

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      const now = Date.now();
      const due = agendadosRef.current.filter((r: any) => {
        if (!r.agendado_para_envio || r.enviado_agendamento) return false;
        if (autoSendingRef.current.has(r.id)) return false;
        return new Date(r.agendado_para_envio).getTime() <= now;
      });
      if (due.length === 0) return;
      for (const r of due) {
        autoSendingRef.current.add(r.id);
        try {
          const ok = await regenRef.current(r);
          if (ok) {
            await supabase.from("roteiros").update({
              xml_pushed_at: new Date().toISOString(),
              agendado_para_envio: null,
              enviado_agendamento: true,
            }).eq("id", r.id);
            toast.success(`Roteiro "${r.programa_nome || "Programa"}" enviado automaticamente para o vMix`);
          }
        } catch (e) {
          console.warn("[AutoSendRoteiro] falha", e);
        } finally {
          autoSendingRef.current.delete(r.id);
        }
      }
      if (!stopped) fetchHistorico();
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { stopped = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);


  const regenerateAllXmls = async () => {
    if (!user) return;
    setRegenerating(true);
    try {
      const effectiveUserId = await resolveEffectiveUserId();
      const { data: allRoteiros } = await supabase
        .from("roteiros")
        .select("id, programa_nome, estudio, data_programa, subtitulo, participantes")
        .eq("user_id", effectiveUserId)
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
    return (
      <div className="px-6 pt-4 pb-2" style={MONT}>
        <div style={{ background: CARD_BG, borderRadius: 24, padding: "18px 20px" }}>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <History size={14} style={{ color: CYAN }} />
              <span style={{ ...MONT, fontSize: 13, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: DARK }}>
                Roteiros Cadastrados
              </span>
              <span style={{ ...MONT, fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 999, background: "#FFFFFF", border: `2px solid ${CYAN}`, color: CYAN }}>
                {historico.length}
              </span>
            </div>
          </div>
          {historico.length === 0 ? (
            <div className="text-center py-8" style={{ background: "#FFFFFF", borderRadius: 16, border: `1px dashed ${CYAN}` }}>
              <FileText size={28} className="mx-auto mb-2 opacity-40" style={{ color: DARK }} />
              <p style={{ ...MONT, fontSize: 13, fontWeight: 700, color: DARK, margin: "0 0 6px" }}>Nenhum roteiro cadastrado no momento</p>
              <p style={{ ...MONT, fontSize: 11, color: "#64748B", margin: 0 }}>Clique em "+ Novo Roteiro" acima para criar um novo roteiro.</p>
            </div>
          ) : activeTab === "historico" ? (

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
                const prog = findProgramaForRoteiro(r, programas);
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
                  estudio: r.estudio || prog?.estudio || "", 
                  programaId: prog?.id || r.programa_id || "", 
                  programaNome: prog?.nome || r.programa_nome || "",
                  blocos, 
                  participantes: editParticipantes, 
                  escaladaList: editEscaladaList, 
                  existingXmlPath, 
                  podcastData: editPodcastData,
                  horario: r.horario || prog?.horario_inicio || "",
                  dataPrograma: r.data_programa || "",
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
            const normKey = (s: string) =>
              (s || "")
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/\s+/g, " ")
                .trim()
                .toUpperCase();
            // agrupa por estúdio normalizado (evita seções duplicadas por caixa/acento/espaços)
            const grupos = new Map<string, { label: string; itens: any[] }>();
            historico.forEach(r => {
              const raw = ((r.estudio || "").replace(/\s+/g, " ").trim()) || "Sem estúdio";
              const key = normKey(raw) || "SEM ESTUDIO";
              const existing = grupos.get(key);
              if (existing) existing.itens.push(r);
              else grupos.set(key, { label: raw, itens: [r] });
            });
            const estudios = Array.from(grupos.keys()).sort((a, b) =>
              grupos.get(a)!.label.localeCompare(grupos.get(b)!.label, "pt-BR")
            );
            return (
              <div className="flex flex-col gap-3">
                {estudios.map(est => (
                  <div key={est}>
                    <div className="flex items-center gap-2 mb-2 px-0.5">
                      <span style={{ display: "inline-block", width: 6, height: 14, borderRadius: 999, background: CYAN }} />
                      <span style={{ ...MONT, fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: DARK }}>
                        {grupos.get(est)!.label}
                      </span>
                      <span style={{ ...MONT, fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 999, background: "#FFFFFF", border: `2px solid ${CYAN}`, color: CYAN }}>
                        {grupos.get(est)!.itens.length}
                      </span>
                      <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${CYAN}55, transparent)` }} />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {grupos.get(est)!.itens.map(r => {

                        const [yy, mm, dd] = (r.data_programa || "").split("-").map(Number);
                        const dataFormatada = yy ? format(new Date(yy, (mm || 1) - 1, dd || 1), "dd/MM/yyyy") : "";
                        const hasXml = (typeof r.subtitulo === "string" && r.subtitulo.startsWith("express_xml::")) || String(r.id || "").startsWith("express_") || !!r.participantes;
                        const isAuto = typeof r.titulo === "string" && r.titulo.includes("[AUTO]");
                        return (
                          <div
                            key={r.id}
                            className="group flex-shrink-0 flex flex-col gap-2 transition-colors duration-150"
                            style={{
                              ...MONT,
                              minWidth: 196,
                              maxWidth: 214,
                              padding: 11,
                              borderRadius: 16,
                              background: "#FFFFFF",
                              border: `2px solid ${isAuto ? "#8b5cf6" : CYAN}`,
                              boxShadow: "0 2px 10px rgba(10, 37, 64, 0.06)",
                            }}
                            onMouseEnter={(event) => {
                              event.currentTarget.style.backgroundColor = "#EEF4FF";
                            }}
                            onMouseLeave={(event) => {
                              event.currentTarget.style.backgroundColor = "#FFFFFF";
                            }}
                          >
                            <div className="flex items-start gap-1.5">
                              <p style={{ ...MONT, flex: 1, fontSize: 13, fontWeight: 800, color: CYAN, lineHeight: 1.25, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
                              // Primeiro título real do roteiro (sem o rótulo "PROGRAMA EXPRESS —")
                              let firstTitle = "";
                              const pickTitle = (t: any) => {
                                const s = String(t || "").replace(/^PROGRAMA EXPRESS\s*[-—]\s*/i, "").trim();
                                return s;
                              };
                              if (escaladaItems.length > 0) firstTitle = pickTitle(escaladaItems[0]?.titulo || escaladaItems[0]);
                              if (!firstTitle) {
                                for (const b of blocosList) {
                                  const n = (b.noticias || []).find((x: any) => x.titulo);
                                  if (n) { firstTitle = pickTitle(n.titulo); break; }
                                }
                              }
                              const participantesStr = pList.map((p: any) => p.nome).filter(Boolean).join(", ");
                              return (
                                <>
                                  {updStr && (
                                    <div style={{ ...MONT, fontSize: 10, color: "#64748B", fontWeight: 700 }}>
                                      Atualizado em: <span style={{ color: DARK }}>{updStr}</span>
                                    </div>
                                  )}
                                  {participantesStr && (
                                    <p style={{ ...MONT, fontSize: 10, lineHeight: 1.4, color: "#475569", margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                      👥 {participantesStr}
                                    </p>
                                  )}
                                  {firstTitle && (
                                    <p style={{ ...MONT, fontSize: 11, fontWeight: 700, lineHeight: 1.35, color: DARK, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                      {firstTitle}
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
                              }} style={{ width: 28, height: 28, borderRadius: "50%", background: CYAN, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.15s ease, box-shadow 0.15s ease", boxShadow: "0 2px 6px rgba(0, 85, 255, 0.28)" }} title="Enviar por WhatsApp">
                                <MessageSquare size={13} style={{ color: "#FFFFFF" }} />
                              </button>
                              {hasXml && (
                                <button onClick={async () => {
                                  toast.info("Enviando para o XML...");
                                  const ok = await regenerateXmlForRoteiro(r);
                                  if (ok) {
                                    const now = new Date().toISOString();
                                    try {
                                      const cleanId = String(r.id || "").replace(/^express_/, "");
                                      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
                                      if (isUuid) {
                                        await supabase.from("roteiros").update({ xml_pushed_at: now }).eq("id", cleanId);
                                      }
                                    } catch {}
                                    toast.success("O XML atualizado com sucesso!");
                                    fetchHistorico();
                                  } else toast.error("Falha ao enviar XML");
                                }} style={{ width: 28, height: 28, borderRadius: "50%", background: CYAN, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.15s ease, box-shadow 0.15s ease", boxShadow: "0 2px 6px rgba(0, 85, 255, 0.28)" }} title="Enviar para o XML">
                                  <Send size={13} style={{ color: "#FFFFFF" }} />
                                </button>
                              )}
                              <button onClick={() => {
                                let blocos = []; let editParticipantes: any[] = []; let editEscaladaList: any[] = []; let editPodcastData: any = undefined;
                                try { const parsed = typeof r.participantes === "string" ? JSON.parse(r.participantes) : r.participantes || []; if (parsed && parsed.blocos) { blocos = parsed.blocos; editParticipantes = parsed.participantes || []; editEscaladaList = parsed.escaladaList || []; editPodcastData = parsed.podcastData || undefined; } else { blocos = Array.isArray(parsed) ? parsed : []; } } catch { blocos = []; }
                                const prog = findProgramaForRoteiro(r, programas);
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
                                  estudio: r.estudio || prog?.estudio || "",
                                  programaId: prog?.id || r.programa_id || "",
                                  programaNome: prog?.nome || r.programa_nome || "",
                                  blocos,
                                  participantes: editParticipantes,
                                  escaladaList: editEscaladaList,
                                  existingXmlPath,
                                  podcastData: editPodcastData,
                                  horario: r.horario || prog?.horario_inicio || "",
                                  dataPrograma: r.data_programa || "",
                                });
                                setNovoRoteiroOpen(true);
                              }} style={{ width: 28, height: 28, borderRadius: "50%", background: CYAN, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.15s ease, box-shadow 0.15s ease", boxShadow: "0 2px 6px rgba(0, 85, 255, 0.28)" }} title="Editar">
                                <Pencil size={13} style={{ color: "#FFFFFF" }} />
                              </button>
                              <button onClick={() => excluirRoteiro(r.id)} style={{ marginLeft: "auto", width: 28, height: 28, borderRadius: "50%", background: CYAN, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.15s ease, box-shadow 0.15s ease", boxShadow: "0 2px 6px rgba(0, 85, 255, 0.28)" }} title="Excluir">
                                <Trash2 size={13} style={{ color: "#FFFFFF" }} />
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







          <div className="mt-8 mb-4 flex items-center gap-3">
            <Calendar size={14} style={{ color: CYAN }} />
            <span style={{ ...MONT, fontSize: 13, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: DARK }}>
              Roteiros Agendados
            </span>
          </div>
          {agendados.length === 0 ? (
            <div className="text-center py-8" style={{ background: "#F8FAFC", borderRadius: 16 }}>
              <span style={{ ...MONT, fontSize: 11, color: "#94A3B8" }}>
                Nenhum roteiro agendado
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {agendados.map((r) => {
                const prog = programas.find(p => p.id === r.programa_id);
                return (
                  <div key={r.id} className="relative flex items-stretch gap-4 pl-0">
                    {/* ── Timeline: Data e depois Horário ── */}
                    <div className="flex flex-col items-center shrink-0" style={{ width: 96 }}>
                      <div
                        className="w-full flex flex-col items-center justify-center py-2"
                        style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12 }}
                      >
                        <span style={{ ...MONT, fontSize: 9, fontWeight: 800, letterSpacing: 1, color: "#94A3B8", textTransform: "uppercase" }}>
                          {new Date(r.agendado_para_envio).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                        </span>
                        <span style={{ ...MONT, fontSize: 20, fontWeight: 900, lineHeight: 1.1, color: DARK }}>
                          {new Date(r.agendado_para_envio).toLocaleDateString("pt-BR", { day: "2-digit" })}
                        </span>
                        <span style={{ ...MONT, fontSize: 9, fontWeight: 800, letterSpacing: 1, color: "#94A3B8", textTransform: "uppercase" }}>
                          {new Date(r.agendado_para_envio).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                        </span>
                      </div>
                      <div
                        className="mt-1.5 w-full flex items-center justify-center gap-1 py-1"
                        style={{ background: CYAN, borderRadius: 999 }}
                      >
                        <Clock size={11} color="#fff" />
                        <span style={{ ...MONT, fontSize: 11, fontWeight: 900, color: "#fff", letterSpacing: 0.5 }}>
                          {new Date(r.agendado_para_envio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="flex-1 w-px my-1" style={{ background: "#E2E8F0" }} />
                    </div>
                    <div className="flex-1 flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:border-cyan-200 transition-colors">
                    <div className="flex-1">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <h4 style={{ ...MONT, fontSize: 13, fontWeight: 700, color: DARK, margin: 0 }}>
                            {r.programa_nome || 'Programa'}
                          </h4>
                          {r.titulo && r.titulo !== `PROGRAMA EXPRESS — ${r.programa_nome}` && (
                            <span style={{ ...MONT, fontSize: 10, color: "#64748B", fontWeight: 600 }}>
                              • {r.titulo.replace("PROGRAMA EXPRESS — ", "")}
                            </span>
                          )}
                        </div>
                        {(() => {
                          let pNames = "";
                          try {
                            const parsed = typeof r.participantes === "string" ? JSON.parse(r.participantes) : r.participantes || {};
                            const pList = parsed.participantes || (Array.isArray(parsed) ? parsed : []);
                            pNames = pList.map((p: any) => p.nome).filter(Boolean).join(", ");
                          } catch (e) {
                            console.error("Erro ao processar participantes agendados:", e);
                          }
                          return pNames ? (
                            <span style={{ ...MONT, fontSize: 10, color: CYAN, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                              {pNames}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <p style={{ ...MONT, fontSize: 10, color: "#94A3B8", marginTop: 4, margin: 0, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>
                        Envio automático do XML no horário agendado
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={async () => {
                          toast.info("Enviando para o vMix...");
                          const ok = await regenerateXmlForRoteiro(r);
                          if (ok) {
                            const now = new Date().toISOString();
                            try {
                              const cleanId = String(r.id || "").replace(/^express_/, "");
                              const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
                              if (isUuid) {
                                await supabase.from("roteiros").update({ 
                                  xml_pushed_at: now,
                                  agendado_para_envio: null,
                                  enviado_agendamento: true 
                                }).eq("id", cleanId);
                              }
                            } catch {}
                            toast.success("Roteiro enviado para o vMix com sucesso!");
                            fetchHistorico();
                          } else {
                            toast.error("Falha ao enviar para o vMix");
                          }
                        }} 
                        className="p-2 hover:bg-cyan-50 rounded-lg text-cyan-500 transition-colors" 
                        title="Enviar para o vMix agora"
                      >
                        <Send size={16} />
                      </button>
                      <button onClick={() => {
                        let blocos = []; let editParticipantes: any[] = []; let editEscaladaList: any[] = []; let editPodcastData: any = undefined;
                        try { const parsed = typeof r.participantes === "string" ? JSON.parse(r.participantes) : r.participantes || []; if (parsed && parsed.blocos) { blocos = parsed.blocos; editParticipantes = parsed.participantes || []; editEscaladaList = parsed.escaladaList || []; editPodcastData = parsed.podcastData || undefined; } else { blocos = Array.isArray(parsed) ? parsed : []; } } catch { blocos = []; }
                        const prog = findProgramaForRoteiro(r, programas);
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
                          estudio: r.estudio || prog?.estudio || "",
                          programaId: prog?.id || r.programa_id || "",
                          programaNome: prog?.nome || r.programa_nome || "",
                          blocos,
                          participantes: editParticipantes,
                          escaladaList: editEscaladaList,
                          existingXmlPath,
                          podcastData: editPodcastData,
                          agendaEventoId: r.id,
                          horario: r.horario || prog?.horario_inicio || "",
                          dataPrograma: r.data_programa || "",
                        });
                        setNovoRoteiroOpen(true);
                      }} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors" title="Editar Agendamento">
                        <Pencil size={16} />
                      </button>
                      <button 
                        onClick={() => cancelAgendamento(r.id)}
                        className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors"
                        title="Cancelar Agendamento"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}, [historico, agendados, programas, activeTab, regenerating, cancelAgendamento]);











































  if (loading) return <ModulePageSkeleton variant="form" />;

  const ORANGE = "#fe8900";

  return (
    <div className="animate-fade-in space-y-5 w-full max-w-none mx-0" style={MONT}>
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
          effectiveUserId={resolvedUserId || propEffectiveUserId || user?.id}
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
