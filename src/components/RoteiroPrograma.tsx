import { useState, useEffect, lazy, Suspense, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History, Trash2, Pencil, Code2, Copy, MessageSquare, FileText, X, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

const WhatsAppSendDialog = lazy(() => import("./WhatsAppSendDialog"));
const ProgramaExpressInline = lazy(() => import("./ProgramaExpressInline"));
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

  const fetchLinkMeta = async (url: string): Promise<{ titulo: string; imagemUrl: string } | null> => {
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
        if (titulo || imagemUrl) return { titulo, imagemUrl };
      }
    } catch {}
    return null;
  };

  const handleSaveTxtRoteiro = async () => {
    if (!txtEditRoteiroId || !txtEditText.trim()) return;
    setTxtSaving(true);

    // Parse URLs from text
    const urlRegex = /https?:\/\/[^\s,)}\]]+/gi;
    const lines = txtEditText.split("\n");
    const foundUrls: string[] = [];
    lines.forEach(line => { const matches = line.match(urlRegex); if (matches) foundUrls.push(...matches); });

    // Fetch metadata for all new URLs
    let updatedParticipantes: any = null;
    if (foundUrls.length > 0) {
      const roteiro = historico.find(r => r.id === txtEditRoteiroId);
      if (roteiro) {
        let parts: any = null;
        try { let raw = roteiro.participantes; if (typeof raw === "string") raw = JSON.parse(raw); if (typeof raw === "string") raw = JSON.parse(raw); parts = raw; } catch { parts = {}; }
        const parsed = Array.isArray(parts) ? { blocos: [], participantes: parts } : (parts || {});
        const blocosList: any[] = parsed.blocos || [];

        // Collect existing links
        const existingLinks = new Set<string>();
        blocosList.forEach((b: any) => (b.noticias || []).forEach((n: any) => { if (n.link) existingLinks.add(n.link); }));

        // Find new links
        const newUrls = foundUrls.filter(u => !existingLinks.has(u));

        if (newUrls.length > 0) {
          toast.info(`Buscando dados de ${newUrls.length} link(s)...`);
          const metaResults = await Promise.all(newUrls.map(u => fetchLinkMeta(u).then(meta => ({ url: u, meta }))));

          // Add new links as noticias to the last bloco (or create one)
          if (blocosList.length === 0) blocosList.push({ noticias: [] });
          const lastBloco = blocosList[blocosList.length - 1];
          if (!lastBloco.noticias) lastBloco.noticias = [];

          for (const { url, meta } of metaResults) {
            lastBloco.noticias.push({
              titulo: meta?.titulo || url,
              imagemUrl: meta?.imagemUrl || "",
              escalada: false,
              link: url,
            });
          }

          updatedParticipantes = { ...parsed, blocos: blocosList };
        }
      }
    }

    const updatePayload: any = { conteudo_html: txtEditText, updated_at: new Date().toISOString() };
    if (updatedParticipantes) updatePayload.participantes = JSON.stringify(updatedParticipantes);

    const { error } = await supabase.from("roteiros").update(updatePayload).eq("id", txtEditRoteiroId);
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
      .order("created_at", { ascending: false })
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

  const historicoSlot = useMemo(() => {
    if (historico.length === 0) return null;
    return (
      <div className="px-6 pt-4 pb-2">
        <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)" }}>
          <div className="flex items-center gap-2 mb-2">
            <History size={12} style={{ color: "var(--layout-icon-color, #888888)" }} />
            <p className="text-[11px] font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Últimos roteiros</p>
            <span className="text-[10px] ml-auto" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>{historico.length}</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {historico.map((r, idx) => {
              const dataFormatada = format(new Date(r.data_programa), "dd/MM/yyyy");
              const isFeito = r.status === "feito";
              const isAgd = r.status === "agendado";
              return (
                <div key={r.id} className="flex-shrink-0 rounded-lg p-2.5 flex flex-col gap-1.5 transition-all hover:brightness-95" style={{ minWidth: "220px", maxWidth: "280px", backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 12%, transparent)" }}>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold truncate flex-1" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                      {r.programa_nome || "Sem programa"}
                      {r.numero_roteiro && <span className="text-[10px] font-semibold" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}> #{r.numero_roteiro}</span>}
                    </p>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0" style={{
                      backgroundColor: isFeito ? "rgba(22,163,74,0.1)" : isAgd ? "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)",
                      color: isFeito ? "#16a34a" : isAgd ? "var(--layout-accent-color, #2563eb)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)",
                    }}>{isFeito ? "feito" : isAgd ? "agendado" : r.status}</span>
                  </div>
                  <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)" }}>
                    {dataFormatada} {r.horario ? `· ${r.horario}` : ""} {r.titulo ? `· ${r.titulo}` : ""}
                  </p>
                  <div className="flex items-center gap-1 mt-auto">
                    {r.subtitulo?.startsWith("express_xml::") && (
                      <button onClick={() => { const xmlUrl = r.subtitulo.replace("express_xml::", ""); navigator.clipboard.writeText(xmlUrl).then(() => toast.success("URL do XML copiada!")).catch(() => toast.error("Erro ao copiar")); }}
                        className="h-6 px-1.5 flex items-center justify-center gap-1 rounded-md hover:opacity-70 transition text-[8px] font-bold"
                        style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)", color: "var(--layout-accent-color, #2563eb)" }} title="Copiar URL do XML">
                        <Code2 size={10} /> XML
                      </button>
                    )}
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
                    <button onClick={() => {
                      let blocos = []; let editParticipantes: any[] = []; let editEscaladaList: any[] = [];
                      try { const parsed = typeof r.participantes === "string" ? JSON.parse(r.participantes) : r.participantes || []; if (parsed && parsed.blocos) { blocos = parsed.blocos; editParticipantes = parsed.participantes || []; editEscaladaList = parsed.escaladaList || []; } else { blocos = Array.isArray(parsed) ? parsed : []; } } catch { blocos = []; }
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
                      setExpressEditData({ roteiroId: r.id, estudio: r.estudio || "", programaId: prog?.id || "", blocos, participantes: editParticipantes, escaladaList: editEscaladaList, existingXmlPath });
                    }} className="h-6 w-6 flex items-center justify-center rounded-md hover:opacity-70 transition" style={{ backgroundColor: "rgba(38,143,250,0.08)" }} title="Editar">
                      <Pencil size={10} style={{ color: "var(--layout-icon-color, #888888)" }} />
                    </button>
                    <button onClick={() => excluirRoteiro(r.id)} className="h-6 w-6 flex items-center justify-center rounded-md hover:opacity-70 transition" style={{ backgroundColor: "rgba(220,38,38,0.08)" }} title="Excluir">
                      <Trash2 size={10} style={{ color: "#dc2626" }} />
                    </button>
                    <button onClick={() => { setTxtEditRoteiroId(r.id); setTxtEditText(roteiroToPlainText(r)); }} className="h-6 px-1.5 flex items-center justify-center gap-1 rounded-md hover:opacity-70 transition text-[8px] font-bold" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)", color: "var(--layout-accent-color, #2563eb)" }} title="Editar Roteiro TXT">
                      <FileText size={10} /> TXT
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }, [historico, programas]);

  if (loading) return <ModulePageSkeleton />;

  return (
    <div className="animate-fade-in space-y-5">
      <Suspense fallback={<ModulePageSkeleton />}>
        <ProgramaExpressInline
          programas={programas}
          estudios={estudios}
          onFinish={async () => { setExpressEditData(null); await fetchHistorico(); }}
          editData={expressEditData}
          afterHeader={historicoSlot}
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

      {/* TXT Edit Popup */}
      {txtEditRoteiroId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => { setTxtEditRoteiroId(null); setTxtEditText(""); }}>
          <div className="w-full max-w-lg mx-4 rounded-2xl p-5 space-y-3 shadow-2xl" style={{ backgroundColor: "var(--layout-page-bg, #fff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)" }} onClick={e => e.stopPropagation()}>
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
              <Check size={14} /> {txtSaving ? "Salvando..." : "Salvar Roteiro"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
