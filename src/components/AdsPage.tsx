import PlayerAdsPage from './PlayerAdsPage';
import { DateInput } from "@/components/ui/date-input";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Film, Music, MessageCircle, Upload, CalendarIcon, Plus, Save, Settings2,
  BarChart3, Radio, Trash2, ShieldCheck, Link2, X, Check, Pause, Play,
  Pencil, Eye, UserPlus, Loader2, ListMusic, Clock, ImageIcon,
} from "lucide-react";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { cn, scrollToForm } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const CYAN = "#0055ff";
const LIME = "#0055ff";
const BG = "#ffffff";
const INK = "#002132";

const inputCls =
  "w-full h-11 px-5 rounded-full text-xs font-semibold uppercase bg-[#f8fafc] outline-none transition-all " +
  "border border-slate-200/90 focus:bg-white focus:border-[#0055ff] " +
  "placeholder:text-slate-400 text-[#0f172a]";

const textareaCls =
  "w-full px-4 py-3 rounded-2xl text-sm bg-white outline-none transition-all resize-none " +
  "border-2 border-[#00BFF0]/30 focus:border-[#00BFF0] focus:ring-4 focus:ring-[#00BFF0]/15 " +
  "placeholder:text-[#002132]/40 text-[#002132]";

const labelCls =
  "text-[11px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 text-[#002132]";

const cardCls = "rounded-2xl bg-white p-5";
const cardStyle = { boxShadow: "0 4px 20px rgba(0,33,50,0.06)" } as const;

type VideoSlot = "preroll" | "midroll" | "break";

interface Campanha {
  id: string;
  nome: string;
  cliente: string;
  inicio: string | null;
  fim: string | null;
  inicioData?: string | null;
  fimData?: string | null;
  canais: string[];
  status: "Ativa" | "Pausada";
  views: number;
  clicks: number;
  midia: string | null;
  midiaUrl?: string | null;
  mediaType?: "video" | "audio" | "image" | null;
  linkUrl?: string | null;
  slots?: VideoSlot[];
}

interface BreakItem {
  id: string;
  titulo: string;
  duracao: string;
  campanha?: string;
  origemId?: string;
  mediaUrl?: string;
  mediaType?: "video" | "audio" | "image" | null;
}
interface BreakPlaylist {
  id: string;
  nome: string;
  usarHorario: boolean;
  horaInicio: string;
  horaFim: string;
  dias: number[];
  itens: BreakItem[];
}

const DIAS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

/* ------------------------------------------------------------------ *
 * LÓGICA DE GATILHO DO BREAK COMERCIAL
 * ------------------------------------------------------------------ */
export function handleMetadataTick(
  nomeDoArtista: string,
  palavraChave: string,
  playlist: { id: string; titulo: string }[],
) {
  if (nomeDoArtista.trim().toUpperCase() === palavraChave.trim().toUpperCase()) {
    const randomizada = [...playlist].sort(() => Math.random() - 0.5);
    return { action: "PLAY_BREAK" as const, playlist: randomizada };
  }
  return { action: "RESUME_LIVE" as const, playlist: [] };
}

export default function AdsPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const targetUserId = effectiveUserId || user?.id;

  /* ---------------- CLIENTES ---------------- */
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [novoClienteOpen, setNovoClienteOpen] = useState(false);
  const [salvandoCliente, setSalvandoCliente] = useState(false);
  const [novoCliente, setNovoCliente] = useState({
    nome: "", cnpj: "", telefone: "", endereco: "", cliente_desde: "", executiva_venda: "",
  });

  const getLocalStorageKey = (uId: string) => `nexohub_ads_${uId}`;

  const loadClientes = async () => {
    if (!targetUserId) {
      setClientes([]);
      setLoadingClientes(false);
      return;
    }
    setLoadingClientes(true);
    try {
      const query = supabase
        .from("logos_patrocinadores")
        .select("id, nome")
        .eq("excluido", false)
        .eq("user_id", targetUserId);
      const { data, error } = await query.order("nome");
      if (error) throw error;
      const seen = new Set<string>();
      const list: { id: string; nome: string }[] = [];
      (data || []).forEach((c: any) => {
        const key = c.nome?.trim().toUpperCase();
        if (key && !seen.has(key)) { seen.add(key); list.push({ id: c.id, nome: c.nome }); }
      });
      setClientes(list);
    } finally {
      setLoadingClientes(false);
    }
  };

  useEffect(() => { void loadClientes(); }, [targetUserId]);

  async function salvarNovoCliente() {
    if (!novoCliente.nome.trim()) {
      toast({ title: "Informe a razão social", variant: "destructive" });
      return;
    }
    setSalvandoCliente(true);
    try {
      const nome = novoCliente.nome.trim().toUpperCase();
      const { error } = await supabase.from("logos_patrocinadores").insert({
        nome,
        cnpj: novoCliente.cnpj.replace(/\D/g, "") || null,
        telefone: novoCliente.telefone || null,
        endereco: novoCliente.endereco || null,
        user_id: targetUserId,
        ativo: true,
        excluido: false,
        data_final: new Date(new Date().getFullYear() + 10, 11, 31).toISOString().split("T")[0],
      });
      if (error) throw error;
      toast({ title: "Cliente cadastrado com sucesso" });
      setNovoClienteOpen(false);
      setNovoCliente({ nome: "", cnpj: "", telefone: "", endereco: "", cliente_desde: "", executiva_venda: "" });
      loadClientes();
    } catch (e: any) {
      toast({ title: "Erro ao cadastrar cliente", description: e.message, variant: "destructive" });
    } finally {
      setSalvandoCliente(false);
    }
  }

  /* ---------------- FORMULÁRIO ---------------- */
  const formRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDates, setEditingDates] = useState<{ start: string | null; end: string | null } | null>(null);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const [chVideo, setChVideo] = useState(false);
  const [chAudio, setChAudio] = useState(false);
  const [chChatbot, setChChatbot] = useState(false);

  const [videoSlots, setVideoSlots] = useState<VideoSlot[]>(["preroll"]);
  const [breakPickerOpen, setBreakPickerOpen] = useState(false);
  const [botMessage, setBotMessage] = useState("");
  const [botLink, setBotLink] = useState("");
  const [videoLink, setVideoLink] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMediaType, setPreviewMediaType] = useState<"video" | "audio" | "image" | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isVideoMedia = previewMediaType === "video";

  function attachFile(f: File | null) {
    if (!f) return;
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewMediaType(f.type.startsWith("audio") ? "audio" : f.type.startsWith("image") ? "image" : "video");
    setPreviewUrl(URL.createObjectURL(f));
  }

  function clearFile() {
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl("");
    setPreviewMediaType(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function resetForm() {
    setEditingId(null);
    setEditingDates(null);
    setName(""); setClient(""); setStartDate(undefined); setEndDate(undefined);
    setChVideo(false); setChAudio(false); setChChatbot(false);
    setVideoSlots(["preroll"]); setBotMessage(""); setBotLink(""); setVideoLink("");
    clearFile();
  }

  /* ---------------- CAMPANHAS (persistidas em comercial_preroll) ---------------- */
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [previewCampanha, setPreviewCampanha] = useState<Campanha | null>(null);
  const [salvandoCampanha, setSalvandoCampanha] = useState(false);

  const DIAS_DB = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

  const rowToCampanha = (r: any): Campanha => ({
    id: r.id,
    nome: r.nome || "",
    cliente: r.ads_cliente || "",
    inicio: r.data_inicial ? format(new Date(`${r.data_inicial}T12:00:00`), "dd/MM/yyyy") : null,
    fim: r.data_final ? format(new Date(`${r.data_final}T12:00:00`), "dd/MM/yyyy") : null,
    inicioData: r.data_inicial || null,
    fimData: r.data_final || null,
    canais: (r.ads_canais && r.ads_canais.length ? r.ads_canais : ["Vídeo (preroll)"]) as string[],
    status: r.active ? "Ativa" : "Pausada",
    views: r.views_count || 0,
    clicks: r.clicks_count || 0,
    midia: r.video_url ? decodeURIComponent(r.video_url.split("/").pop() || "") : null,
    midiaUrl: r.video_url || null,
    mediaType: r.media_type === "audio" || r.media_type === "image" ? r.media_type : r.video_url ? "video" : null,
    linkUrl: r.link_url || null,
    slots: [
      ...(Array.isArray(r.ads_canais) && r.ads_canais.some((canal: string) => canal.toUpperCase() === "BREAK") ? ["break" as VideoSlot] : []),
      ...(Array.isArray(r.ads_canais) && r.ads_canais.some((canal: string) => canal.toLowerCase().includes("midroll")) || r.is_midroll ? ["midroll" as VideoSlot] : []),
      ...(Array.isArray(r.ads_canais) && r.ads_canais.some((canal: string) => canal.toLowerCase().includes("preroll")) || (!r.is_midroll && !Array.isArray(r.ads_canais)) ? ["preroll" as VideoSlot] : []),
    ],
  });

  const getStoredCampanhas = (uId: string): Campanha[] => {
    try {
      const raw = localStorage.getItem(getLocalStorageKey(uId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  };

  const saveStoredCampanhas = (uId: string, list: Campanha[]) => {
    try {
      localStorage.setItem(getLocalStorageKey(uId), JSON.stringify(list));
    } catch {}
  };

  const loadCampanhas = async () => {
    if (!targetUserId) {
      setCampanhas([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("comercial_preroll")
        .select("*")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Quando a consulta online funciona, o banco é a fonte da verdade.
      // Não mesclar cache antigo por cima: isso ressuscitava campanhas excluídas
      // e sobrescrevia alterações recentes com dados locais desatualizados.
      const list = (data || []).map(rowToCampanha);
      setCampanhas(list);
      saveStoredCampanhas(targetUserId, list);
    } catch (e) {
      console.warn("Supabase fetch comercial_preroll warning:", e);
      setCampanhas(getStoredCampanhas(targetUserId));
    }
  };

  useEffect(() => { loadCampanhas(); }, [targetUserId]);

  useEffect(() => {
    if (!targetUserId) return;

    const channel = supabase
      .channel(`comercial-campanhas-${targetUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comercial_preroll", filter: `user_id=eq.${targetUserId}` },
        () => { void loadCampanhas(); },
      )
      .subscribe();

    const refreshOnFocus = () => {
      if (!document.hidden) void loadCampanhas();
    };

    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      document.removeEventListener("visibilitychange", refreshOnFocus);
      supabase.removeChannel(channel);
    };
  }, [targetUserId]);

  async function saveCampaign() {
    if (!targetUserId) {
      toast({ title: "Sessão expirada", variant: "destructive" });
      return;
    }
    if (!name.trim() || !client.trim()) {
      toast({ title: "Preencha nome da campanha e cliente", variant: "destructive" });
      return;
    }
    if (!chVideo && !chAudio && !chChatbot) {
      toast({ title: "Selecione ao menos um posicionamento", variant: "destructive" });
      return;
    }
    const canais = [
      ...(chVideo ? videoSlots.map(slot => slot === "break" ? "BREAK" : `Vídeo (${slot})`) : []),
      chAudio ? "Áudio (pre-roll)" : null,
      chChatbot ? "Chatbot" : null,
    ].filter(Boolean) as string[];

    // Quando Break Comercial estiver entre os formatos, a campanha segue as diretrizes
    // (horário e dias da semana) da playlist escolhida para o break.
    const plRef = playlists.find(p => p.id === selectedPl);
    const usaBreak = chVideo && videoSlots.includes("break") && !!plRef;
    const horarioInicio = usaBreak && plRef!.usarHorario ? plRef!.horaInicio : "00:00";
    const horarioFim = usaBreak && plRef!.usarHorario ? plRef!.horaFim : "23:59";
    const diasSemana = usaBreak ? plRef!.dias.map(d => DIAS_DB[d]) : [];

    setSalvandoCampanha(true);
    try {
      let mediaUrl: string | null = null;
      let mediaType = "video";
      if (file) {
        mediaType = file.type.startsWith("image") ? "image" : file.type.startsWith("audio") ? "audio" : "video";
        try {
          const ext = file.name.split(".").pop() || "bin";
          const path = `${targetUserId}/ads-${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage.from("preroll").upload(path, file, { upsert: true });
          if (!upErr) {
            mediaUrl = supabase.storage.from("preroll").getPublicUrl(path).data.publicUrl;
          }
        } catch {}

        // Fallback para Base64 caso o storage rejeite
        if (!mediaUrl) {
          mediaUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve("");
            reader.readAsDataURL(file);
          });
        }
      }

      const id = editingId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ads_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
      const existing = editingId ? campanhas.find(c => c.id === editingId) : null;

      const finalMediaUrl = mediaUrl || existing?.midiaUrl || null;
      const finalMediaType = (file ? mediaType : existing?.mediaType) || "video";

      const newCampanha: Campanha = {
        id,
        nome: name.trim(),
        cliente: client.trim(),
        status: "Ativa",
        canais: canais.length ? canais : ["Vídeo (preroll)"],
        inicio: startDate ? format(startDate, "dd/MM/yyyy") : null,
        fim: endDate ? format(endDate, "dd/MM/yyyy") : null,
        inicioData: startDate ? format(startDate, "yyyy-MM-dd") : null,
        fimData: endDate ? format(endDate, "yyyy-MM-dd") : null,
        views: existing?.views || 0,
        clicks: existing?.clicks || 0,
        midia: file ? file.name : existing?.midia || null,
        midiaUrl: finalMediaUrl,
        mediaType: finalMediaType as any,
        linkUrl: videoLink.trim() || botLink.trim() || "",
        slots: chVideo ? videoSlots : [],
      };

      // Atualiza estado e localStorage imediatamente
      const currentList = getStoredCampanhas(targetUserId);
      const map = new Map<string, Campanha>();
      campanhas.forEach(c => map.set(c.id, c));
      currentList.forEach(c => map.set(c.id, c));
      map.set(id, newCampanha);

      const updatedList = editingId
        ? Array.from(map.values()).map(c => c.id === editingId ? newCampanha : c)
        : [newCampanha, ...Array.from(map.values()).filter(c => c.id !== id)];

      setCampanhas(updatedList);
      saveStoredCampanhas(targetUserId, updatedList);

      const payload: any = {
        user_id: targetUserId,
        nome: name.trim(),
        ads_cliente: client.trim(),
        ads_canais: canais,
        horario_inicio: horarioInicio,
        horario_fim: horarioFim,
        dias_semana: diasSemana,
        data_inicial: startDate ? format(startDate, "yyyy-MM-dd") : editingDates?.start || null,
        data_final: endDate ? format(endDate, "yyyy-MM-dd") : editingDates?.end || null,
        is_midroll: chVideo && videoSlots.includes("midroll"),
        placements: [
          ...(chVideo ? videoSlots.map(slot => slot === "midroll" ? "mid_roll" : slot === "preroll" ? "pre_roll" : "break") : []),
          ...(chAudio ? ["pre_roll"] : []),
        ],
        link_url: videoLink.trim() || botLink.trim() || "",
        active: true,
      };
      if (finalMediaUrl) { payload.video_url = finalMediaUrl; payload.media_type = finalMediaType; }

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (editingId && isUuid) {
        const { data, error } = await supabase.from("comercial_preroll").update(payload)
          .eq("id", editingId).eq("user_id", targetUserId).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("O banco não confirmou a atualização da campanha.");
      } else {
        const insertPayload = isUuid ? { id, ...payload, video_url: finalMediaUrl || "" } : { ...payload, video_url: finalMediaUrl || "" };
        const { data, error } = await supabase.from("comercial_preroll").insert(insertPayload).select("id").single();
        if (error) throw error;
        if (!data?.id) throw new Error("O banco não confirmou o cadastro da campanha.");
      }

      toast({ title: editingId ? "Campanha atualizada com sucesso" : "Campanha salva com sucesso", description: "Já disponível para o player e streamings." });
      resetForm();
    } catch (e: any) {
      console.error("Falha ao salvar campanha:", e);
      setCampanhas(campanhas);
      saveStoredCampanhas(targetUserId, campanhas);
      toast({ title: "Campanha não foi salva", description: e?.message || "Falha ao gravar no servidor.", variant: "destructive" });
    } finally {
      setSalvandoCampanha(false);
    }
  }

  async function togglePausa(c: Campanha) {
    if (!targetUserId) return;
    const nextActive = c.status !== "Ativa";
    const nextStatus: Campanha["status"] = nextActive ? "Ativa" : "Pausada";

    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.id);
      if (isUuid) {
        const { data, error } = await supabase.from("comercial_preroll").update({ active: nextActive })
          .eq("id", c.id).eq("user_id", targetUserId).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("O banco não confirmou a alteração de status.");
      }
      const updated = campanhas.map(item => item.id === c.id ? { ...item, status: nextStatus } : item);
      setCampanhas(updated);
      saveStoredCampanhas(targetUserId, updated);
      toast({ title: nextActive ? "Campanha ativada" : "Campanha pausada" });
    } catch (err: any) {
      toast({ title: "Status não foi alterado", description: err?.message || "Falha ao atualizar no servidor.", variant: "destructive" });
    }
  }

  async function excluirCampanha(c: Campanha) {
    if (!targetUserId) return;
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.id);
      if (isUuid) {
        const { data, error } = await supabase.from("comercial_preroll").delete()
          .eq("id", c.id).eq("user_id", targetUserId).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("O banco não confirmou a exclusão da campanha.");
      }
      const updated = campanhas.filter(item => item.id !== c.id);
      setCampanhas(updated);
      saveStoredCampanhas(targetUserId, updated);
      toast({ title: "Campanha excluída" });
    } catch (err: any) {
      toast({ title: "Campanha não foi excluída", description: err?.message || "Falha ao excluir no servidor.", variant: "destructive" });
    }
  }

  function editCampanha(c: Campanha) {
    const parseCampaignDate = (value?: string | null) => {
      if (!value) return undefined;
      const date = new Date(`${value}T12:00:00`);
      return Number.isNaN(date.getTime()) ? undefined : date;
    };

    setEditingId(c.id);
    setEditingDates({ start: c.inicioData || null, end: c.fimData || null });
    setName(c.nome);
    setClient(c.cliente);
    setStartDate(parseCampaignDate(c.inicioData));
    setEndDate(parseCampaignDate(c.fimData));
    const restoredSlots: VideoSlot[] = c.slots?.length ? c.slots : ["preroll"];
    setChVideo(c.canais.some(x => x.startsWith("Vídeo") || x.toUpperCase() === "BREAK"));
    setChAudio(c.canais.some(x => x.startsWith("Áudio")));
    setChChatbot(c.canais.includes("Chatbot"));
    setVideoSlots(restoredSlots);
    setVideoLink(c.linkUrl || "");
    setBotLink(c.canais.includes("Chatbot") ? c.linkUrl || "" : "");
    setFile(null);
    setPreviewUrl(c.midiaUrl || "");
    setPreviewMediaType(c.mediaType || null);
    if (fileRef.current) fileRef.current.value = "";
    scrollToForm(formRef.current);
  }


  /* ---------------- RELATÓRIO ---------------- */
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<Campanha | null>(null);
  const [reportFreq, setReportFreq] = useState("semanal");
  const [reportMetrics, setReportMetrics] = useState<string[]>(["views", "clicks"]);
  const [reportFrom, setReportFrom] = useState<Date | undefined>();
  const [reportTo, setReportTo] = useState<Date | undefined>();
  const [reportEmail, setReportEmail] = useState("");

  /* ---------------- BREAKS ---------------- */
  const [breaksOn, setBreaksOn] = useState(true);
  const [triggerWord, setTriggerWord] = useState("BREAK");
  const [playlists, setPlaylists] = useState<BreakPlaylist[]>([{
    id: "pl-1",
    nome: "Break padrão",
    usarHorario: false,
    horaInicio: "12:00",
    horaFim: "13:00",
    dias: [1, 2, 3, 4, 5],
    itens: [],
  }]);
  const [selectedPl, setSelectedPl] = useState("pl-1");
  const breakFileRef = useRef<HTMLInputElement>(null);
  const [breakConfigLoaded, setBreakConfigLoaded] = useState(false);

  /* Biblioteca de mídias: arquivos das campanhas ativas */
  const biblioteca = useMemo<BreakItem[]>(
    () => campanhas
      .filter(c => c.status === "Ativa" && c.midia && c.midiaUrl)
      .map(c => ({
        id: `cmp-${c.id}`,
        titulo: c.nome,
        duracao: "--:--",
        campanha: c.nome,
        mediaUrl: c.midiaUrl,
        mediaType: c.mediaType,
      })),
    [campanhas],
  );

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    supabase.from("user_settings").select("dashboard_items").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (cancelled) return;
      const config = (data?.dashboard_items as any)?.break_commercial;
      if (config && Array.isArray(config.playlists)) {
        setBreaksOn(config.enabled !== false);
        setTriggerWord(typeof config.triggerWord === "string" ? config.triggerWord : "BREAK");
        setPlaylists(config.playlists);
        setSelectedPl(config.activePlaylistId || config.playlists[0]?.id || "");
      }
      setBreakConfigLoaded(true);
    });
    return () => { cancelled = true; };
  }, [user?.id]);
  const [dragOverPl, setDragOverPl] = useState(false);

  const currentPl = playlists.find(p => p.id === selectedPl) || null;

  function dropMidiaNaPlaylist(midiaId: string) {
    const pl = playlists.find(p => p.id === selectedPl);
    const midia = biblioteca.find(m => m.id === midiaId);
    if (!pl || !midia) return;
    if (pl.itens.some(i => i.origemId === midia.id)) return;

    const itemId = crypto.randomUUID();
    updatePl(pl.id, { itens: [...pl.itens, { ...midia, id: itemId, origemId: midia.id }] });

    if (midia.mediaUrl) {
      const media = document.createElement("video");
      media.preload = "metadata";
      media.src = midia.mediaUrl;
      media.onloadedmetadata = () => {
        const total = Math.max(0, Math.round(media.duration || 0));
        const duracao = total > 0 ? `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}` : "--:--";
        setPlaylists(list => list.map(playlist => playlist.id !== pl.id ? playlist : {
          ...playlist,
          itens: playlist.itens.map(item => item.id === itemId ? { ...item, duracao } : item),
        }));
        media.removeAttribute("src");
      };
      media.onerror = () => media.removeAttribute("src");
    }
  }

  /* Mídias de campanhas pausadas/excluídas saem das playlists */
  useEffect(() => {
    const validos = new Set(biblioteca.map(m => m.id));
    setPlaylists(list => list.map(p => {
      const itens = p.itens.filter(i => !i.origemId || validos.has(i.origemId));
      return itens.length === p.itens.length ? p : { ...p, itens };
    }));
  }, [biblioteca]);

  function updatePl(id: string, patch: Partial<BreakPlaylist>) {
    setPlaylists(list => list.map(p => p.id === id ? { ...p, ...patch } : p));
  }

  function novaPlaylist() {
    const id = crypto.randomUUID();
    setPlaylists(list => [...list, { id, nome: `Break ${list.length + 1}`, usarHorario: false, horaInicio: "12:00", horaFim: "13:00", dias: [1, 2, 3, 4, 5], itens: [] }]);
    setSelectedPl(id);
  }

  function excluirPlaylist(id: string) {
    setPlaylists(list => {
      const atualizada = list.filter(p => p.id !== id);
      if (selectedPl === id) setSelectedPl(atualizada[0]?.id || "");
      return atualizada;
    });
    toast({ title: "Break excluído" });
  }

  function addBreakFiles(files: FileList | null) {
    if (!files || !currentPl) return;
    const novos: BreakItem[] = Array.from(files).map(f => ({
      id: crypto.randomUUID(), titulo: f.name, duracao: "--:--",
    }));
    updatePl(currentPl.id, { itens: [...currentPl.itens, ...novos] });
    if (breakFileRef.current) breakFileRef.current.value = "";
  }

  const totals = useMemo(() => ({
    views: campanhas.reduce((a, r) => a + r.views, 0),
    clicks: campanhas.reduce((a, r) => a + r.clicks, 0),
  }), [campanhas]);

  const toggleCard = (active: boolean, onClick: () => void, Icon: any, label: string, hint: string) => (
    <button
      type="button"
      onClick={onClick}
      data-nexo-skip
      className="group relative min-h-[142px] overflow-hidden text-left p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00BFF0] focus-visible:ring-offset-2"
      style={{
        borderRadius: 0,
        background: active ? LIME : "#fff",
        border: `2px solid ${active ? INK : `${CYAN}45`}`,
        boxShadow: active ? `0 12px 28px ${LIME}66` : "0 5px 16px rgba(0,33,50,0.06)",
      }}><span
        aria-hidden="true"
        className="absolute bottom-0 left-0 top-0 w-1 transition-all duration-200"
        style={{ background: active ? INK : CYAN }}
      />
      <span
        className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center transition-all duration-200"
        style={{
          borderRadius: 0,
          background: active ? INK : "transparent",
          border: `2px solid ${active ? INK : `${CYAN}55`}`,
          color: LIME,
        }}
      >
        {active && <Check size={13} strokeWidth={4} />}
      </span>
      <div className="w-11 h-11 flex items-center justify-center mb-3 transition-transform duration-200 group-hover:scale-105"
        style={{ borderRadius: 0, background: active ? "rgba(0,33,50,0.12)" : `${CYAN}15`, color: active ? INK : CYAN }}>

        <Icon size={20} />
      </div>
      <div className="text-sm font-black uppercase tracking-[0.12em]" style={{ color: INK }}>{label}</div>
      <div className="text-[11px] mt-1 leading-relaxed" style={{ color: `${INK}99` }}>{hint}</div>
    </button>
  );

  const datePicker = (value: Date | undefined, onChange: (d?: Date) => void, placeholder: string) => (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(inputCls, "text-left flex items-center")}>
          <CalendarIcon className="mr-2 h-4 w-4 opacity-60" />
          {value ? format(value, "dd/MM/yyyy") : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className="p-3 pointer-events-auto" />
      </PopoverContent>
    </Popover>
  );

  const [clienteAberto, setClienteAberto] = useState(false);
  const clientesFiltrados = useMemo(() => {
    const q = client.trim().toLowerCase();
    if (!q) return clientes.slice(0, 8);
    return clientes.filter(c => c.nome.toLowerCase().includes(q)).slice(0, 8);
  }, [client, clientes]);

  return (
    <div className="nexo-scope animate-fade-in" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>


      <div className="rounded-3xl p-6" style={{ background: BG }}>
        <Tabs defaultValue="nova">
          <TabsList className="bg-white/70 rounded-full p-1 mb-5">
            <TabsTrigger value="nova" className="rounded-full text-xs font-bold uppercase tracking-wider data-[state=active]:bg-[#C6F03C] data-[state=active]:text-[#002132]">
              <Plus size={14} className="mr-1.5" /> Nova campanha
            </TabsTrigger>
            <TabsTrigger value="breaks" className="rounded-full text-xs font-bold uppercase tracking-wider data-[state=active]:bg-[#C6F03C] data-[state=active]:text-[#002132]">
              <Radio size={14} className="mr-1.5" /> Break comercial
            </TabsTrigger>
          <TabsTrigger value="player" className="rounded-full text-xs font-bold uppercase tracking-wider">PLAYER</TabsTrigger></TabsList>

          {/* ================= ABA 1 ================= */}
          <TabsContent value="nova" className="space-y-5 mt-0">
            {/* BLOCO 1 */}
            <div ref={formRef} className={cardCls} style={cardStyle}>
              <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: CYAN }}>1 · Dados básicos</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className={labelCls}>Nome da campanha</div>
                  <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Promoção Dia dos Pais" />
                </div>
                <div>
                  <div className={labelCls}>Cliente</div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        className={inputCls}
                        value={client}
                        onChange={e => { setClient(e.target.value); setClienteAberto(true); }}
                        onFocus={() => setClienteAberto(true)}
                        onBlur={() => setTimeout(() => setClienteAberto(false), 150)}
                        placeholder={loadingClientes ? "Carregando..." : "Digite o nome do cliente"}
                      />
                      {clienteAberto && clientesFiltrados.length > 0 && (
                        <div className="absolute left-0 right-0 top-[46px] z-50 rounded-2xl bg-white overflow-hidden max-h-56 overflow-y-auto"
                          style={{ border: `2px solid ${CYAN}33`, boxShadow: "0 12px 30px rgba(0,33,50,0.14)" }}>
                          {clientesFiltrados.map(c => (
                            <button key={c.id} type="button"
                              onMouseDown={e => { e.preventDefault(); setClient(c.nome); setClienteAberto(false); }}
                              className="w-full text-left px-4 py-2.5 text-[13px] font-bold hover:bg-[#00BFF0]/10"
                              style={{ color: INK }}>
                              {c.nome}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => setNovoClienteOpen(true)}
                      title="Cadastrar novo cliente"
                      className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center transition hover:brightness-95"
                      style={{ background: LIME, color: INK }}>
                      <UserPlus size={17} />
                    </button>
                  </div>
                  {!loadingClientes && client.trim().length > 1 && clientesFiltrados.length === 0 && (
                    <div className="text-[11px] mt-1.5" style={{ color: `${INK}99` }}>
                      Cliente não encontrado.{" "}
                      <button type="button" onClick={() => { setNovoCliente(n => ({ ...n, nome: client })); setNovoClienteOpen(true); }} className="font-black underline" style={{ color: CYAN }}>
                        Cadastrar cliente
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <div className={labelCls}><CalendarIcon size={14} /> Data de início</div>
                  {datePicker(startDate, setStartDate, "Selecionar data")}
                </div>
                <div>
                  <div className={labelCls}><CalendarIcon size={14} /> Data de término</div>
                  {datePicker(endDate, setEndDate, "Selecionar data")}
                </div>
              </div>
            </div>

            {/* BLOCO 2 */}
            <div className={cardCls} style={cardStyle}>
              <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: CYAN }}>2 · Posicionamentos</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {toggleCard(chVideo, () => setChVideo(v => !v), Film, "Vídeo", "Player de vídeo e lives")}
                {toggleCard(chAudio, () => setChAudio(v => !v), Music, "Áudio", "Streaming de rádio")}
                {toggleCard(chChatbot, () => setChChatbot(v => !v), MessageCircle, "Chatbot", "Disparo em massa")}
              </div>

              {(chVideo || chAudio || chChatbot) && (
                <div className="mt-5 space-y-4">
                  {chVideo && (
                    <div className="rounded-2xl p-4 space-y-3" style={{ background: `${CYAN}0F` }}>
                      <div>
                        <div className={labelCls}><Film size={14} /> Formatos do vídeo</div>
                        <div className="text-[11px]" style={{ color: `${INK}88` }}>Você pode selecionar mais de um formato para a mesma mídia.</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {([
                          { id: "preroll", label: "Pre-roll" },
                          { id: "midroll", label: "Mid-roll" },
                          { id: "break", label: "Break Comercial" },
                        ] as const).map(option => {
                          const active = videoSlots.includes(option.id);
                          return (
                            <button key={option.id} type="button"
                              onClick={() => {
                                if (option.id === "break" && !active) { setBreakPickerOpen(true); return; }
                                setVideoSlots(slots => active ? slots.filter(slot => slot !== option.id) : [...slots, option.id]);
                              }}
                              className="h-10 px-4 rounded-full text-[11px] font-black transition"
                              style={{ background: active ? LIME : "#fff", border: `2px solid ${active ? INK : `${CYAN}55`}`, color: INK }}>
                              {active && <Check size={13} className="inline mr-1.5 -mt-0.5" />}{option.label}
                            </button>
                          );
                        })}
                      </div>
                      <div>
                        <div className={labelCls}><Link2 size={14} /> Link do QR Code sobre o vídeo</div>
                        <input className={inputCls} value={videoLink} onChange={e => setVideoLink(e.target.value)} placeholder="https://destino-da-campanha.com" />
                        <div className="text-[10px] mt-1.5" style={{ color: `${INK}77` }}>O link é salvo na campanha como destino do QR Code exibido durante a reprodução.</div>
                      </div>
                    </div>
                  )}

                  {chAudio && (
                    <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: `${CYAN}0F` }}>
                      <div className={cn(labelCls, "mb-0")}><Music size={14} /> Áudio</div>
                      <span className="text-[10px] font-black px-3 py-1 rounded-full" style={{ background: LIME, color: INK }}>PRE-ROLL</span>
                      <span className="text-[11px]" style={{ color: `${INK}88` }}>formato fixo para streaming de áudio</span>
                    </div>
                  )}

                  {chChatbot && (
                    <div className="rounded-2xl p-4 space-y-3" style={{ background: `${CYAN}0F` }}>
                      <div>
                        <div className={labelCls}><MessageCircle size={14} /> Mensagem</div>
                        <textarea rows={4} className={textareaCls} value={botMessage} onChange={e => setBotMessage(e.target.value)}
                          placeholder="Digite a mensagem que será enviada..." maxLength={4096} />
                      </div>
                      <div>
                        <div className={labelCls}><Link2 size={14} /> Link de conversão</div>
                        <input className={inputCls} value={botLink} onChange={e => setBotLink(e.target.value)} placeholder="https://..." />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* BLOCO 3 */}
            <div className={cardCls} style={cardStyle}>
              <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: CYAN }}>3 · Mídia e pré-visualização</div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <label
                  htmlFor="ads-file"
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); attachFile(e.dataTransfer.files?.[0] || null); }}
                  className="min-h-[220px] rounded-2xl border-2 border-dashed cursor-pointer flex flex-col items-center justify-center text-center px-6 transition"
                  style={{ borderColor: dragging ? INK : `${CYAN}55`, background: dragging ? `${LIME}33` : "transparent" }}
                >
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: `${CYAN}15`, color: CYAN }}>
                    <Upload size={26} />
                  </div>
                  <div className="text-sm font-black" style={{ color: INK }}>Arraste o arquivo aqui</div>
                  <div className="text-[11px] mt-1" style={{ color: `${INK}88` }}>ou clique para selecionar · vídeo, imagem ou áudio</div>
                  {file && <div className="text-[11px] mt-3 font-bold" style={{ color: CYAN }}>{file.name}</div>}
                </label>
                <input id="ads-file" ref={fileRef} type="file" accept="video/*,image/*,audio/*" className="hidden"
                  onChange={e => attachFile(e.target.files?.[0] || null)} />

                <div className="rounded-2xl overflow-hidden flex flex-col" style={{ border: `2px solid ${CYAN}22` }}>
                  <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider flex items-center justify-between" style={{ background: `${CYAN}12`, color: INK }}>
                    Preview local
                    {file && (
                      <button type="button" onClick={clearFile} className="flex items-center gap-1 text-[10px] font-bold" style={{ color: "#dc2626" }}>
                        <X size={12} /> remover
                      </button>
                    )}
                  </div>
                  <div className="flex-1 min-h-[200px] flex items-center justify-center" style={{ background: "#0b1620" }}>
                    {!previewUrl ? (
                      <div className="text-[11px] text-white/50">Nenhuma mídia selecionada</div>
                    ) : isVideoMedia ? (
                      <video src={previewUrl} controls className="w-full max-h-[280px]" />
                    ) : previewMediaType === "audio" ? (
                      <audio key={previewUrl} src={previewUrl} controls autoPlay={chAudio} className="w-full px-4" />
                    ) : (
                      <img src={previewUrl} alt="preview" className="w-full max-h-[280px] object-contain" />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-5">
                {editingId && (
                  <button type="button" onClick={resetForm}
                    className="h-11 px-5 rounded-full text-sm font-bold"
                    style={{ background: "#fff", border: `2px solid ${CYAN}`, color: INK }}>
                    Cancelar edição
                  </button>
                )}
                <button type="button" onClick={saveCampaign}
                  className="h-11 px-6 rounded-full text-sm font-black flex items-center gap-2 transition hover:brightness-95"
                  style={{ background: LIME, color: INK, boxShadow: `0 6px 20px ${LIME}55` }}>
                  <Save size={16} /> {editingId ? "Atualizar campanha" : "Salvar campanha"}
                </button>
              </div>
            </div>

            {/* CAMPANHAS ATIVAS */}
            <div className="rounded-2xl bg-white overflow-hidden" style={cardStyle}>
              <div className="px-5 py-3.5 flex items-center gap-2 border-b" style={{ borderColor: `${INK}12` }}>
                <BarChart3 size={16} style={{ color: CYAN }} />
                <div className="text-sm font-black uppercase tracking-wide" style={{ color: INK }}>Campanhas ativas</div>
                <div className="ml-auto flex items-center gap-2 text-[11px] font-bold">
                  <span className="px-2.5 py-1 rounded-full" style={{ background: `${CYAN}15`, color: CYAN }}>{campanhas.length} campanhas</span>
                  <span className="px-2.5 py-1 rounded-full" style={{ background: `${LIME}55`, color: INK }}>{totals.views.toLocaleString("pt-BR")} views</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: CYAN }}>
                      {["Campanha", "Cliente", "Período", "Canais", "Views", "Status", "Ações", "Relatório"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[11px] font-black uppercase tracking-wider text-white whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campanhas.map(c => (
                      <tr key={c.id} className="border-b last:border-0" style={{ borderColor: `${INK}10` }}>
                        <td className="px-4 py-3 font-bold" style={{ color: INK }}>{c.nome}</td>
                        <td className="px-4 py-3" style={{ color: `${INK}CC` }}>{c.cliente}</td>
                        <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: `${INK}AA` }}>
                          {c.inicio || "—"} {c.fim ? `→ ${c.fim}` : ""}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(Array.isArray(c.canais) ? c.canais : []).map(x => (
                              <span key={x} className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${CYAN}15`, color: CYAN }}>{x}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums" style={{ color: INK }}>{(c.views ?? 0).toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                            style={{
                              background: c.status === "Ativa" ? `${LIME}55` : "rgba(234,179,8,0.2)",
                              color: c.status === "Pausada" ? "#a16207" : INK,
                            }}>{c.status}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button type="button" title="Editar" onClick={() => editCampanha(c)}
                              className="w-9 h-9 rounded-full inline-flex items-center justify-center" style={{ background: `${CYAN}15`, color: CYAN }}>
                              <Pencil size={15} />
                            </button>
                            <button type="button" title={c.status === "Ativa" ? "Pausar" : "Retomar"}
                              onClick={() => togglePausa(c)}
                              className="w-9 h-9 rounded-full inline-flex items-center justify-center" style={{ background: `${LIME}66`, color: INK }}>
                              {c.status === "Ativa" ? <Pause size={15} /> : <Play size={15} />}
                            </button>
                            <button type="button" title="Prévia de views" onClick={() => setPreviewCampanha(c)}
                              className="w-9 h-9 rounded-full inline-flex items-center justify-center" style={{ background: `${INK}0F`, color: INK }}>
                              <Eye size={15} />
                            </button>
                            <button type="button" title="Excluir" onClick={() => excluirCampanha(c)}
                              className="w-9 h-9 rounded-full inline-flex items-center justify-center" style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => { setReportTarget(c); setReportOpen(true); }}
                            className="h-9 px-4 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
                            style={{ background: `${CYAN}15`, color: CYAN }}>
                            <Settings2 size={13} /> Relatório
                          </button>
                        </td>
                      </tr>
                    ))}
                    {campanhas.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-sm" style={{ color: `${INK}66` }}>
                        Nenhuma campanha salva ainda.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* ================= ABA 2 · BREAK COMERCIAL ================= */}
          <TabsContent value="breaks" className="space-y-4 mt-0">
            <div className={cardCls} style={cardStyle}>
              <div className="flex flex-col md:flex-row md:items-end gap-4">
                <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: `${CYAN}0F` }}>
                  <Switch checked={breaksOn} onCheckedChange={setBreaksOn} />
                  <div>
                    <div className="text-sm font-black" style={{ color: INK }}>Ativar sistema de breaks</div>
                    <div className="text-[11px]" style={{ color: `${INK}88` }}>{breaksOn ? "Escutando metadados do streaming" : "Desativado"}</div>
                  </div>
                </div>
                <div className="flex-1">
                  <div className={labelCls}><ShieldCheck size={14} /> Palavra-chave do gatilho</div>
                  <input className={inputCls} value={triggerWord} onChange={e => setTriggerWord(e.target.value)} placeholder="BREAK" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
              <div className="space-y-4">
                {/* BIBLIOTECA DE MÍDIAS (das campanhas ativas) */}
                <div className="rounded-2xl bg-white overflow-hidden" style={cardStyle}>
                  <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ borderColor: `${INK}12` }}>
                    <ListMusic size={15} style={{ color: CYAN }} />
                    <div className="text-xs font-black uppercase tracking-wider" style={{ color: INK }}>Mídias cadastradas</div>
                    <div className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${CYAN}15`, color: CYAN }}>{biblioteca.length}</div>
                  </div>
                  <div className="p-3 space-y-2 overflow-y-auto" style={{ maxHeight: 5 * 56 + 16 }}>
                    {biblioteca.map(m => (
                      <div key={m.id} draggable
                        onDragStart={e => e.dataTransfer.setData("text/nexo-midia", m.id)}
                        onDoubleClick={() => dropMidiaNaPlaylist(m.id)}
                        title="Arraste para a playlist do break"
                        className="px-3 py-2.5 flex items-center gap-3 cursor-grab active:cursor-grabbing select-none"
                        style={{ background: `${CYAN}0F`, border: `2px solid ${CYAN}33`, color: INK, height: 48 }}>
                        {m.mediaType === "audio" ? (
                          <Music size={14} style={{ color: CYAN }} aria-label="Áudio" />
                        ) : m.mediaType === "image" ? (
                          <ImageIcon size={14} style={{ color: CYAN }} aria-label="Imagem" />
                        ) : (
                          <Film size={14} style={{ color: CYAN }} aria-label="Vídeo" />
                        )}
                        <span className="text-[12px] font-bold truncate flex-1">{m.titulo}</span>
                        <span className="text-[11px] tabular-nums" style={{ color: `${INK}77` }}>{m.duracao}</span>
                      </div>
                    ))}
                    {biblioteca.length === 0 && (
                      <div className="py-6 w-full text-center text-[12px]" style={{ color: `${INK}66` }}>
                        Nenhuma mídia. Cadastre um arquivo em uma campanha ativa na aba "Nova campanha".
                      </div>
                    )}
                  </div>
                </div>

                {/* LISTA DE PLAYLISTS */}
                <div className="rounded-2xl bg-white overflow-hidden h-fit" style={cardStyle}>
                <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ borderColor: `${INK}12` }}>
                  <ListMusic size={15} style={{ color: CYAN }} />
                  <div className="text-xs font-black uppercase tracking-wider" style={{ color: INK }}>Playlists</div>
                  <button type="button" onClick={novaPlaylist}
                    className="ml-auto h-8 px-3 rounded-full text-[11px] font-black inline-flex items-center gap-1"
                    style={{ background: LIME, color: INK }}>
                    <Plus size={13} /> Novo break
                  </button>
                </div>
                <div className="p-2 space-y-1">
                  {playlists.map(p => (
                    <button key={p.id} type="button" onClick={() => setSelectedPl(p.id)}
                      className="w-full text-left px-3 py-2.5 rounded-xl transition"
                      style={{
                        background: p.id === selectedPl ? `${CYAN}15` : "transparent",
                        border: `2px solid ${p.id === selectedPl ? CYAN : "transparent"}`,
                      }}>
                      <div className="text-sm font-bold" style={{ color: INK }}>{p.nome}</div>
                      <div className="text-[11px]" style={{ color: `${INK}88` }}>
                        {p.itens.length} arquivos · {p.usarHorario ? `${p.horaInicio}–${p.horaFim} · ${p.dias.map(d => DIAS[d]).join(" ")}` : "sem horário"}
                      </div>
                    </button>
                  ))}
                  {playlists.length === 0 && (
                    <div className="px-3 py-6 text-center text-[12px]" style={{ color: `${INK}66` }}>Nenhuma playlist.</div>
                  )}
                </div>
                </div>
              </div>

              {/* DETALHE DA PLAYLIST */}
              {currentPl ? (
                <div className="space-y-4">
                  <div className={cardCls} style={cardStyle}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <div className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: INK }}>Nome da playlist</div>
                          <button type="button" onClick={() => excluirPlaylist(currentPl.id)}
                            className="h-7 px-2.5 rounded-full text-[10px] font-black inline-flex items-center gap-1 transition hover:brightness-95"
                            style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}>
                            <Trash2 size={12} /> Excluir break
                          </button>
                        </div>
                        <input className={inputCls} value={currentPl.nome}
                          onChange={e => updatePl(currentPl.id, { nome: e.target.value })} placeholder="Ex: Break manhã" />
                      </div>
                      <div>
                        <div className={labelCls}><Clock size={14} /> Faixa de horário</div>
                        <div className="flex items-center gap-2 h-11">
                          <Switch checked={currentPl.usarHorario} onCheckedChange={v => updatePl(currentPl.id, { usarHorario: v })} />
                          <input type="time" disabled={!currentPl.usarHorario} value={currentPl.horaInicio}
                            onChange={e => updatePl(currentPl.id, { horaInicio: e.target.value })}
                            className={cn(inputCls, "w-28", !currentPl.usarHorario && "opacity-40")} />
                          <span className="text-xs font-black" style={{ color: `${INK}77` }}>até</span>
                          <input type="time" disabled={!currentPl.usarHorario} value={currentPl.horaFim}
                            onChange={e => updatePl(currentPl.id, { horaFim: e.target.value })}
                            className={cn(inputCls, "w-28", !currentPl.usarHorario && "opacity-40")} />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className={labelCls}>Dias da semana</div>
                      <div className="flex flex-wrap gap-2">
                        {DIAS.map((d, i) => {
                          const on = currentPl.dias.includes(i);
                          return (
                            <button key={d} type="button"
                              onClick={() => updatePl(currentPl.id, {
                                dias: on ? currentPl.dias.filter(x => x !== i) : [...currentPl.dias, i].sort(),
                              })}
                              className="h-9 px-4 rounded-full text-[11px] font-black transition"
                              style={{
                                background: on ? LIME : "#fff",
                                border: `2px solid ${on ? INK : `${CYAN}33`}`,
                                color: INK,
                              }}>{d}</button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div
                    className="rounded-2xl bg-white overflow-hidden"
                    style={{ ...cardStyle, outline: dragOverPl ? `2px dashed ${CYAN}` : "none", outlineOffset: -4 }}
                    onDragOver={e => { e.preventDefault(); setDragOverPl(true); }}
                    onDragLeave={() => setDragOverPl(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOverPl(false);
                      const id = e.dataTransfer.getData("text/nexo-midia");
                      if (id) dropMidiaNaPlaylist(id);
                    }}
                  >
                    <div className="px-5 py-3.5 flex items-center gap-2 border-b" style={{ borderColor: `${INK}12` }}>
                      <div className="text-sm font-black" style={{ color: INK }}>Arquivos da playlist</div>
                      <div className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${CYAN}15`, color: CYAN }}>{currentPl.itens.length}</div>
                      <div className="text-[11px] ml-2" style={{ color: `${INK}77` }}>Arraste as mídias para cá</div>
                      <button type="button" onClick={() => breakFileRef.current?.click()}
                        className="ml-auto h-9 px-4 rounded-full text-[11px] font-black inline-flex items-center gap-1.5"
                        style={{ background: LIME, color: INK }}>
                        <Plus size={13} /> Incluir arquivos
                      </button>
                      <input ref={breakFileRef} type="file" multiple accept="video/*,audio/*" className="hidden"
                        onChange={e => addBreakFiles(e.target.files)} />
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: `${INK}08` }}>
                            {["#", "Arquivo", "Duração", ""].map(h => (
                              <th key={h} className="text-left px-4 py-2.5 text-[11px] font-black uppercase tracking-wider" style={{ color: `${INK}99` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {currentPl.itens.map((p, i) => (
                            <tr key={p.id} className="border-b last:border-0" style={{ borderColor: `${INK}0F` }}>
                              <td className="px-4 py-3 tabular-nums" style={{ color: `${INK}66` }}>{i + 1}</td>
                              <td className="px-4 py-3 font-bold" style={{ color: INK }}>{p.titulo}</td>
                              <td className="px-4 py-3 tabular-nums" style={{ color: INK }}>{p.duracao}</td>
                              <td className="px-4 py-3 text-right">
                                <button type="button"
                                  onClick={() => updatePl(currentPl.id, { itens: currentPl.itens.filter(x => x.id !== p.id) })}
                                  className="w-9 h-9 rounded-full inline-flex items-center justify-center"
                                  style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}><Trash2 size={15} /></button>
                              </td>
                            </tr>
                          ))}
                          {currentPl.itens.length === 0 && (
                            <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: `${INK}66` }}>Playlist vazia.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button type="button" onClick={async () => {
                      if (!user?.id) return;
                      try {
                        const { data, error } = await supabase.from("user_settings").select("dashboard_items").eq("user_id", user.id).maybeSingle();
                        if (error) throw error;
                        const dashboardItems = { ...((data?.dashboard_items as Record<string, unknown>) || {}) };
                        dashboardItems.break_commercial = {
                          enabled: breaksOn,
                          triggerWord: triggerWord.trim(),
                          activePlaylistId: currentPl.id,
                          playlists,
                        };
                        const { error: saveError } = await supabase.from("user_settings").upsert({ user_id: user.id, dashboard_items: dashboardItems } as any, { onConflict: "user_id" });
                        if (saveError) throw saveError;
                        toast({ title: "Break salvo e ativado", description: `${currentPl.itens.length} mídia(s) prontas para o player.` });
                      } catch (error: any) {
                        toast({ title: "Não foi possível salvar o break", description: error.message, variant: "destructive" });
                      }
                    }}
                      disabled={!breakConfigLoaded}
                      className="h-11 px-6 rounded-full text-sm font-black flex items-center gap-2 disabled:opacity-60"
                      style={{ background: LIME, color: INK }}>
                      <Save size={16} /> Salvar e ativar break
                    </button>
                  </div>
                </div>
              ) : (
                <div className={cardCls} style={cardStyle}>
                  <div className="py-10 text-center text-sm" style={{ color: `${INK}66` }}>Crie um break para começar.</div>
                </div>
              )}
            </div>
          </TabsContent>
        <TabsContent value="player" className="mt-0"><PlayerAdsPage userId={targetUserId || undefined} /></TabsContent></Tabs>
      </div>

      <Dialog open={breakPickerOpen} onOpenChange={setBreakPickerOpen}>
        <DialogContent className="sm:max-w-md bg-white" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
          <DialogHeader>
            <DialogTitle style={{ color: INK }}>Selecionar break comercial</DialogTitle>
          </DialogHeader>
          <div className="text-[12px] leading-relaxed" style={{ color: `${INK}99` }}>
            Escolha a playlist de break que receberá esta mídia ao salvar a campanha.
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {playlists.map(playlist => (
              <button key={playlist.id} type="button"
                onClick={() => {
                  setSelectedPl(playlist.id);
                  setVideoSlots(slots => slots.includes("break") ? slots : [...slots, "break"]);
                  setBreakPickerOpen(false);
                }}
                className="w-full text-left rounded-2xl px-4 py-3 transition hover:bg-[#00BFF0]/10"
                style={{ background: playlist.id === selectedPl ? `${CYAN}15` : "#fff", border: `2px solid ${playlist.id === selectedPl ? CYAN : `${CYAN}33`}` }}>
                <div className="text-sm font-black" style={{ color: INK }}>{playlist.nome}</div>
                <div className="text-[11px] mt-0.5" style={{ color: `${INK}88` }}>{playlist.itens.length} arquivos · {playlist.usarHorario ? `${playlist.horaInicio}–${playlist.horaFim}` : "sem horário definido"}</div>
              </button>
            ))}
            {playlists.length === 0 && <div className="py-5 text-center text-sm" style={{ color: `${INK}77` }}>Crie um break na aba Break comercial antes de selecioná-lo.</div>}
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL NOVO CLIENTE */}
      <Dialog open={novoClienteOpen} onOpenChange={setNovoClienteOpen}>
        <DialogContent className="sm:max-w-2xl bg-white" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
          <DialogHeader>
            <DialogTitle style={{ color: INK }}>Cadastro de cliente</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <div className={labelCls}>Razão social</div>
              <input className={inputCls} value={novoCliente.nome} onChange={e => setNovoCliente(n => ({ ...n, nome: e.target.value }))} placeholder="Nome da empresa" />
            </div>
            <div>
              <div className={labelCls}>CNPJ</div>
              <input className={inputCls} value={novoCliente.cnpj} onChange={e => setNovoCliente(n => ({ ...n, cnpj: e.target.value }))} placeholder="00.000.000/0000-00" />
            </div>
            <div>
              <div className={labelCls}>Telefone</div>
              <input className={inputCls} value={novoCliente.telefone} onChange={e => setNovoCliente(n => ({ ...n, telefone: e.target.value }))} placeholder="(00) 00000-0000" />
            </div>
            <div className="md:col-span-2">
              <div className={labelCls}>Endereço</div>
              <input className={inputCls} value={novoCliente.endereco} onChange={e => setNovoCliente(n => ({ ...n, endereco: e.target.value }))} placeholder="Rua, número, bairro, cidade - UF" />
            </div>
            <div>
              <div className={labelCls}>Cliente desde</div>
              <DateInput className={inputCls} value={novoCliente.cliente_desde} onChange={e => setNovoCliente(n => ({ ...n, cliente_desde: e.target.value }))} />
            </div>
            <div>
              <div className={labelCls}>Gerente executiva</div>
              <input className={inputCls} value={novoCliente.executiva_venda} onChange={e => setNovoCliente(n => ({ ...n, executiva_venda: e.target.value }))} placeholder="Nome da gerente" />
            </div>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setNovoClienteOpen(false)}
              className="h-11 px-5 rounded-full text-sm font-bold" style={{ background: "#fff", border: `2px solid ${CYAN}`, color: INK }}>
              Cancelar
            </button>
            <button type="button" onClick={salvarNovoCliente} disabled={salvandoCliente}
              className="h-11 px-6 rounded-full text-sm font-black inline-flex items-center gap-2 disabled:opacity-60"
              style={{ background: LIME, color: INK }}>
              {salvandoCliente ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar cliente
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL PRÉVIA DE VIEWS */}
      <Dialog open={!!previewCampanha} onOpenChange={o => !o && setPreviewCampanha(null)}>
        <DialogContent className="sm:max-w-md bg-white" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
          <DialogHeader>
            <DialogTitle style={{ color: INK }}>Prévia · {previewCampanha?.nome}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: "Views", v: previewCampanha?.views ?? 0 },
              { l: "Clicks", v: previewCampanha?.clicks ?? 0 },
            ].map(k => (
              <div key={k.l} className="rounded-2xl p-4" style={{ background: `${CYAN}0F` }}>
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: `${INK}88` }}>{k.l}</div>
                <div className="text-2xl font-black" style={{ color: INK }}>{k.v.toLocaleString("pt-BR")}</div>
              </div>
            ))}
          </div>
          <div className="text-[11px]" style={{ color: `${INK}99` }}>
            Cliente: <b style={{ color: INK }}>{previewCampanha?.cliente}</b> · Mídia: {previewCampanha?.midia || "—"}
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL DE RELATÓRIO */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-lg bg-white" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
          <DialogHeader>
            <DialogTitle style={{ color: INK }}>Relatório da campanha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl p-3 text-[12px]" style={{ background: `${CYAN}0F`, color: INK }}>
              Campanha: <b>{reportTarget?.nome}</b> · Cliente: <b>{reportTarget?.cliente}</b>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={labelCls}>Período de</div>
                {datePicker(reportFrom, setReportFrom, "Início")}
              </div>
              <div>
                <div className={labelCls}>Período até</div>
                {datePicker(reportTo, setReportTo, "Fim")}
              </div>
            </div>
            <div>
              <div className={labelCls}>Métricas</div>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "views", label: "Views" },
                  { id: "clicks", label: "Clicks" },
                  { id: "ctr", label: "CTR" },
                  { id: "alcance", label: "Alcance" },
                  { id: "conversao", label: "Conversão" },
                ].map(m => {
                  const on = reportMetrics.includes(m.id);
                  return (
                    <button key={m.id} type="button"
                      onClick={() => setReportMetrics(l => on ? l.filter(x => x !== m.id) : [...l, m.id])}
                      className="h-9 px-4 rounded-full text-[11px] font-black transition"
                      style={{ background: on ? LIME : "#fff", border: `2px solid ${on ? INK : `${CYAN}33`}`, color: INK }}>
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className={labelCls}>Frequência de envio</div>
                <Select value={reportFreq} onValueChange={setReportFreq}>
                  <SelectTrigger className={cn(inputCls, "justify-between")}><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white z-50">
                    <SelectItem value="diario">Diário</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="quinzenal">Quinzenal</SelectItem>
                    <SelectItem value="fim">Fim da campanha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className={labelCls}>E-mail do cliente</div>
                <input className={inputCls} value={reportEmail} onChange={e => setReportEmail(e.target.value)} placeholder="cliente@email.com" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => {
              toast({ title: "Relatório configurado", description: `${reportMetrics.length} métricas · envio ${reportFreq}` });
              setReportOpen(false);
            }}
              className="h-11 px-6 rounded-full text-sm font-black"
              style={{ background: LIME, color: INK }}>Salvar relatório</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
