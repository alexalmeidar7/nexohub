import { useEffect, useMemo, useState, useRef } from "react";
import { scrollToForm } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Siren, Save, Loader2, Pencil, Trash2, Check, X, Calendar, Clock, Users, Building2, FileText, CheckCircle2, History } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { confirmDialog } from "@/lib/confirmDialog";
import { logBlitzHistorico, type BlitzHistAcao } from "@/lib/blitzHistorico";

interface BlitzHistRow {
  id: string;
  blitz_id: string | null;
  cliente: string | null;
  acao: BlitzHistAcao;
  motivo: string | null;
  dados_antes: any;
  dados_depois: any;
  changed_by_email: string | null;
  created_at: string;
}

// Nexo palette (ClientesPage style)
const CYAN = "#0055ff";
const LIME = "#0055ff";
const CARD_BG = "#ffffff";
const DARK = "#002132";
const FONT = "'Montserrat', sans-serif";

const pillInput: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 999,
  background: "#f8fafc",
  border: "1px solid rgba(226, 232, 240, 0.9)",
  padding: "0 20px",
  fontFamily: FONT,
  fontSize: 12,
  color: "#0f172a",
  outline: "none",
  textTransform: "uppercase",
};

const labelStyle: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 6,
  display: "block",
};

const cardStyle: React.CSSProperties = {
  background: CARD_BG,
  borderRadius: 24,
  padding: 24,
  fontFamily: FONT,
};

const primaryBtn: React.CSSProperties = {
  height: 44,
  borderRadius: 999,
  background: "#0055ff",
  color: "#fff",
  fontFamily: FONT,
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  padding: "0 24px",
  border: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
  boxShadow: "0 4px 14px rgba(0, 85, 255, 0.25)",
};

const limeBtn: React.CSSProperties = { ...primaryBtn };
const ghostBtn: React.CSSProperties = {
  ...primaryBtn,
  background: "#f8fafc",
  color: "#334155",
  border: "1px solid #cbd5e1",
  boxShadow: "none",
};

interface Blitz {
  id: string;
  dia: string;
  horario: string;
  horario_fim: string | null;
  cliente: string;
  equipe: string | null;
  observacoes: string | null;
  realizada: boolean;
  data_realizacao: string | null;
  agenda_evento_id: string | null;
  created_at: string;
}

const emptyForm = { dia: "", horario: "", horario_fim: "", cliente: "", equipe: "", observacoes: "" };

async function buildAgendaPayload(userId: string, b: { dia: string; horario: string; horario_fim: string | null; cliente: string; equipe: string | null; observacoes: string | null }) {
  const desc = [b.equipe ? `Equipe: ${b.equipe}` : null, b.observacoes].filter(Boolean).join(" • ");
  return {
    user_id: userId,
    programa_id: null as any,
    data: b.dia,
    local: `Blitz ${b.cliente}`,
    descricao: desc || `Blitz ${b.cliente}`,
    recorrencia: "unico",
    prioridade: "alta",
    status: "confirmado",
    tipo_evento: "blitz",
    horario_gravacao: b.horario,
    horario_gravacao_fim: b.horario_fim || null,
  } as any;
}

export default function BlitzPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<Blitz[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<"todos" | "pendentes" | "realizadas">("todos");
  const [historico, setHistorico] = useState<BlitzHistRow[]>([]);
  const [showHistorico, setShowHistorico] = useState(false);
  const [nowTick, setNowTick] = useState(0);

  // Estados para busca de clientes e popup de cadastro
  const [clientesDisponiveis, setClientesDisponiveis] = useState<{ id: string; nome: string }[]>([]);
  const [sugestoesClientes, setSugestoesClientes] = useState<{ id: string; nome: string }[]>([]);
  const [showSugestoes, setShowSugestoes] = useState(false);
  const [activeSugestaoIndex, setActiveSugestaoIndex] = useState(-1);
  const [cadastroOpen, setCadastroOpen] = useState(false);
  const [confirmCadastroOpen, setConfirmCadastroOpen] = useState(false);
  const [novoClienteNome, setNovoClienteNome] = useState("");
  const [novoClienteData, setNovoClienteData] = useState({
    nome: "",
    cnpj: "",
    endereco: "",
    telefone: "",
    executiva_venda: ""
  });
  const [cadastrandoCliente, setCadastrandoCliente] = useState(false);
  const [cadastroErrors, setCadastroErrors] = useState<Record<string, string>>({});

  const getLocalStorageKey = (uId: string) => `nexohub_blitz_${uId}`;

  const getStoredBlitzes = (uId: string): Blitz[] => {
    try {
      const raw = localStorage.getItem(getLocalStorageKey(uId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  };

  const saveStoredBlitzes = (uId: string, blitzes: Blitz[]) => {
    try {
      localStorage.setItem(getLocalStorageKey(uId), JSON.stringify(blitzes));
    } catch {}
  };

  useEffect(() => {
    const iv = setInterval(() => setNowTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const loadHistorico = async () => {
    if (!targetUserId) return;
    try {
      const { data } = await supabase
        .from("blitz_promocionais_historico")
        .select("*")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false })
        .limit(200);
      setHistorico((data as BlitzHistRow[]) || []);
    } catch {}
  };

  const autoExpire = async (rows: Blitz[]) => {
    if (!targetUserId) return rows;
    const today = new Date();
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(today);
    const nowHM = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(today);
    const toExpire = rows.filter(b => !b.realizada && (b.dia < todayStr || (b.dia === todayStr && b.horario_fim && b.horario_fim.slice(0, 5) <= nowHM)));
    if (!toExpire.length) return rows;
    const ids = toExpire.map(b => b.id);
    const agendaIds = toExpire.map(b => b.agenda_evento_id).filter(Boolean) as string[];
    try {
      await supabase.from("blitz_promocionais").update({ realizada: true, data_realizacao: new Date().toISOString() }).in("id", ids);
      if (agendaIds.length) {
        await supabase.from("agenda_participantes").delete().in("evento_id", agendaIds);
        await supabase.from("agenda_eventos").delete().in("id", agendaIds);
      }
    } catch {}
    for (const b of toExpire) {
      void logBlitzHistorico({
        userId: targetUserId, blitzId: b.id, cliente: b.cliente, acao: "expirada",
        motivo: "Encerrada automaticamente por vencimento do horário final",
        dadosAntes: b, dadosDepois: { ...b, realizada: true },
      });
    }
    const updated = rows.map(r => ids.includes(r.id) ? { ...r, realizada: true } : r);
    saveStoredBlitzes(targetUserId, updated);
    return updated;
  };

  const load = async () => {
    if (!targetUserId) return;
    setLoading(true);
    let rows: Blitz[] = [];
    try {
      const { data, error } = await supabase
        .from("blitz_promocionais")
        .select("*")
        .eq("user_id", targetUserId)
        .order("dia", { ascending: false })
        .order("horario", { ascending: false });
      if (!error && data && data.length > 0) {
        rows = data as Blitz[];
      }
    } catch {}

    if (rows.length === 0) {
      rows = getStoredBlitzes(targetUserId);
    } else {
      saveStoredBlitzes(targetUserId, rows);
    }

    const processed = await autoExpire(rows);
    setItems(processed);
    setLoading(false);
  };

  const loadClientes = async () => {
    if (!targetUserId) return;
    const unique = new Map<string, { id: string; nome: string }>();
    try {
      const { data } = await supabase
        .from("logos_patrocinadores")
        .select("id, nome")
        .eq("excluido", false)
        .order("nome");
      
      if (data) {
        data.forEach(d => {
          if (d.nome) unique.set(d.nome.trim().toUpperCase(), { id: d.id, nome: d.nome });
        });
      }
    } catch {}

    try {
      const { DEFAULT_AGENCY_CLIENTS } = await import("./ClientesPage");
      Object.entries(DEFAULT_AGENCY_CLIENTS).forEach(([id, c]: [string, any]) => {
        const n = (c.nome_empresarial || c.razao_social || id).trim().toUpperCase();
        if (n && !unique.has(n)) unique.set(n, { id, nome: n });
      });
    } catch {}

    setClientesDisponiveis(Array.from(unique.values()));
  };

  useEffect(() => { 
    load(); 
    loadClientes();
  }, [targetUserId]);

  const handleClienteChange = (val: string) => {
    setForm(prev => ({ ...prev, cliente: val }));
    if (val.length > 0) {
      const matched = clientesDisponiveis.filter(c => 
        c.nome.toLowerCase().includes(val.toLowerCase())
      );
      setSugestoesClientes(matched);
      setShowSugestoes(true);
      setActiveSugestaoIndex(-1);
    } else {
      setShowSugestoes(false);
      setActiveSugestaoIndex(-1);
    }
  };

  const handleClienteKeyDown = (e: React.KeyboardEvent) => {
    if (!showSugestoes || sugestoesClientes.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSugestaoIndex(prev => (prev < sugestoesClientes.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSugestaoIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "Enter") {
      if (activeSugestaoIndex >= 0) {
        e.preventDefault();
        selectCliente(sugestoesClientes[activeSugestaoIndex]);
      }
    } else if (e.key === "Escape") {
      setShowSugestoes(false);
    }
  };

  const selectCliente = (c: { id: string; nome: string }) => {
    setForm(prev => ({ ...prev, cliente: c.nome }));
    setShowSugestoes(false);
  };

  const handleClienteBlur = () => {
    // Pequeno delay para permitir clique na sugestão
    setTimeout(async () => {
      setShowSugestoes(false);
      const val = form.cliente.trim();
      if (!val) return;
      
      const exists = clientesDisponiveis.some(c => c.nome.toUpperCase() === val.toUpperCase());
      // Só perguntar se não houver match exato E houver mais de 2 caracteres
      // Evitar perguntas desnecessárias quando o cliente já existir.
      if (!exists && val.length > 2) {
        setNovoClienteNome(val);
        setConfirmCadastroOpen(true);
      }
    }, 250);
  };

  const validateCadastro = () => {
    const errors: Record<string, string> = {};
    if (!novoClienteData.nome || novoClienteData.nome.trim().length < 3) {
      errors.nome = "Razão Social deve ter pelo menos 3 caracteres";
    }
    const cleanCnpj = novoClienteData.cnpj.replace(/\D/g, "");
    if (!cleanCnpj || cleanCnpj.length !== 14) {
      errors.cnpj = "CNPJ deve ter 14 dígitos";
    }
    setCadastroErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const saveNovoCliente = async () => {
    if (!validateCadastro()) return;

    const cleanNome = novoClienteData.nome.trim().toUpperCase();
    const cleanCnpj = novoClienteData.cnpj.replace(/\D/g, "");

    const alreadyExists = clientesDisponiveis.some(c => 
      c.nome.toUpperCase() === cleanNome
    );

    if (alreadyExists) {
      setCadastroErrors({ nome: "Cliente já cadastrado com esta Razão Social" });
      return;
    }

    setCadastrandoCliente(true);
    setCadastroErrors({});
    
    try {
      const query: any = supabase.from("logos_patrocinadores");
      const { data: cnpjExists } = await query
        .select("id")
        .eq("cnpj", cleanCnpj)
        .eq("excluido", false)
        .maybeSingle();

      if (cnpjExists) {
        setCadastroErrors({ cnpj: "Já existe um cliente cadastrado com este CNPJ" });
        setCadastrandoCliente(false);
        return;
      }

      const payload: any = {
        nome: cleanNome,
        cnpj: cleanCnpj,
        telefone: novoClienteData.telefone || null,
        endereco: novoClienteData.endereco || null,
        user_id: user?.id,
        ativo: true,
        excluido: false,
        data_final: new Date(new Date().getFullYear() + 10, 11, 31).toISOString().split('T')[0]
      };

      // @ts-ignore
      const { error } = await supabase.from("logos_patrocinadores").insert(payload);
      
      if (error) throw error;
      
      toast({ title: `Cliente ${cleanNome} cadastrado com sucesso!`, description: "Já vinculado a esta blitz." });
      setCadastroOpen(false);
      setConfirmCadastroOpen(false);
      setShowSugestoes(false);
      setSugestoesClientes([]);
      setClientesDisponiveis(prev => [...prev, { id: "novo", nome: cleanNome }]);
      setForm(prev => ({ ...prev, cliente: cleanNome }));
      await loadClientes();
    } catch (e: any) {
      toast({ title: "Erro ao cadastrar cliente", description: e.message, variant: "destructive" });
    } finally {
      setCadastrandoCliente(false);
    }
  };

  const reset = () => { setForm(emptyForm); setEditingId(null); };

  const save = async () => {
    if (!targetUserId) return;
    if (!form.dia || !form.horario || !form.cliente.trim()) {
      toast({ title: "Preencha dia, horário e cliente", variant: "destructive" });
      return;
    }
    if (form.horario_fim && form.horario_fim <= form.horario) {
      toast({ title: "Horário final deve ser depois do inicial", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      user_id: targetUserId,
      dia: form.dia,
      horario: form.horario,
      horario_fim: form.horario_fim || null,
      cliente: form.cliente.trim(),
      equipe: form.equipe.trim() || null,
      observacoes: form.observacoes.trim() || null,
    };

    try {
      const agendaPayload = await buildAgendaPayload(targetUserId, payload);
      let newId = editingId || "";
      let evtId: string | null = null;

      if (editingId) {
        const current = items.find(i => i.id === editingId);
        const { error: blitzError } = await supabase
          .from("blitz_promocionais")
          .update(payload)
          .eq("id", editingId)
          .eq("user_id", targetUserId);
        if (blitzError) throw blitzError;

        if (current?.agenda_evento_id) {
          const { error: agendaError } = await supabase
            .from("agenda_eventos")
            .update(agendaPayload)
            .eq("id", current.agenda_evento_id)
            .eq("user_id", targetUserId);
          if (agendaError) throw agendaError;
          evtId = current.agenda_evento_id;
        } else {
          const { data: evt, error: agendaError } = await supabase
            .from("agenda_eventos")
            .insert(agendaPayload)
            .select("id")
            .single();
          if (agendaError) throw agendaError;
          if (!evt?.id) throw new Error("A agenda não retornou o evento criado.");
          evtId = evt.id;
          const { error: linkError } = await supabase
            .from("blitz_promocionais")
            .update({ agenda_evento_id: evt.id })
            .eq("id", editingId)
            .eq("user_id", targetUserId);
          if (linkError) throw linkError;
        }

        void logBlitzHistorico({
          userId: targetUserId, blitzId: editingId, cliente: payload.cliente, acao: "editada",
          dadosAntes: current, dadosDepois: payload,
        });
      } else {
        const { data: evt, error: agendaError } = await supabase
          .from("agenda_eventos")
          .insert(agendaPayload)
          .select("id")
          .single();
        if (agendaError) throw agendaError;
        if (!evt?.id) throw new Error("A agenda não retornou o evento criado.");
        evtId = evt.id;

        const { data: created, error: blitzError } = await supabase
          .from("blitz_promocionais")
          .insert({ ...payload, agenda_evento_id: evtId })
          .select("id")
          .single();
        if (blitzError) throw blitzError;
        if (!created?.id) throw new Error("O banco não retornou a blitz cadastrada.");
        newId = created.id;
        void logBlitzHistorico({
          userId: targetUserId, blitzId: newId, cliente: payload.cliente, acao: "criada",
          dadosDepois: payload,
        });
      }

      // Update local storage fallback
      const currentList = getStoredBlitzes(targetUserId);
      let updatedList: Blitz[];
      if (editingId) {
        updatedList = currentList.map(item => item.id === editingId ? {
          ...item,
          ...payload,
          agenda_evento_id: evtId || item.agenda_evento_id,
        } : item);
      } else {
        const newBlitz: Blitz = {
          id: newId,
          ...payload,
          realizada: false,
          data_realizacao: null,
          agenda_evento_id: evtId,
          created_at: new Date().toISOString(),
        };
        updatedList = [newBlitz, ...currentList];
      }
      saveStoredBlitzes(targetUserId, updatedList);
      setItems(updatedList);

      toast({ title: editingId ? "Blitz atualizada" : "Blitz agendada e adicionada à agenda" });
      reset();
      load();
      if (showHistorico) loadHistorico();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message || "Tente novamente", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };


  const edit = (b: Blitz) => {
    setEditingId(b.id);
    setForm({
      dia: b.dia,
      horario: b.horario?.slice(0, 5) || "",
      horario_fim: b.horario_fim?.slice(0, 5) || "",
      cliente: b.cliente,
      equipe: b.equipe || "",
      observacoes: b.observacoes || "",
    });
    scrollToForm(formRef.current);
  };

  const del = async (id: string) => {
    const isConfirmed = await confirmDialog({
      title: "Excluir Blitz",
      message: "Deseja realmente excluir esta blitz? Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      destructive: true
    });

    if (!isConfirmed || !targetUserId) return;

    const b = items.find(i => i.id === id);
    try {
      if (b?.agenda_evento_id) {
        await supabase.from("agenda_participantes").delete().eq("evento_id", b.agenda_evento_id);
        await supabase.from("agenda_eventos").delete().eq("id", b.agenda_evento_id);
      }
      await supabase.from("blitz_promocionais").delete().eq("id", id);
    } catch {}

    const updated = getStoredBlitzes(targetUserId).filter(i => i.id !== id);
    saveStoredBlitzes(targetUserId, updated);
    setItems(updated);

    void logBlitzHistorico({
      userId: targetUserId, blitzId: id, cliente: b?.cliente ?? null, acao: "excluida",
      motivo: "Excluída pelo usuário", dadosAntes: b,
    });
    toast({ title: "Blitz excluída" });
    load();
    if (showHistorico) loadHistorico();
  };

  const toggleRealizada = async (b: Blitz) => {
    if (!targetUserId) return;
    const next = !b.realizada;
    try {
      await supabase.from("blitz_promocionais").update({
        realizada: next,
        data_realizacao: next ? new Date().toISOString() : null,
      }).eq("id", b.id);

      if (next && b.agenda_evento_id) {
        await supabase.from("agenda_participantes").delete().eq("evento_id", b.agenda_evento_id);
        await supabase.from("agenda_eventos").delete().eq("id", b.agenda_evento_id);
        await supabase.from("blitz_promocionais").update({ agenda_evento_id: null }).eq("id", b.id);
      } else if (!next && !b.agenda_evento_id) {
        const payload = await buildAgendaPayload(targetUserId, b);
        const { data: evt } = await supabase.from("agenda_eventos").insert(payload).select("id").maybeSingle();
        if (evt?.id) await supabase.from("blitz_promocionais").update({ agenda_evento_id: evt.id }).eq("id", b.id);
      }
    } catch {}

    const updated = getStoredBlitzes(targetUserId).map(i => i.id === b.id ? {
      ...i,
      realizada: next,
      data_realizacao: next ? new Date().toISOString() : null,
    } : i);
    saveStoredBlitzes(targetUserId, updated);
    setItems(updated);

    void logBlitzHistorico({
      userId: targetUserId, blitzId: b.id, cliente: b.cliente, acao: next ? "encerrada" : "reaberta",
      dadosAntes: b, dadosDepois: { ...b, realizada: next },
    });
    load();
    if (showHistorico) loadHistorico();
  };


  const agendadas = useMemo(
    () => items.filter(i => !i.realizada).sort((a, b) => (a.dia + a.horario).localeCompare(b.dia + b.horario)),
    [items],
  );
  const realizadas = useMemo(
    () => items.filter(i => i.realizada).sort((a, b) => (b.dia + b.horario).localeCompare(a.dia + a.horario)),
    [items],
  );

  const stats = useMemo(() => ({
    total: items.length,
    realizadas: items.filter(i => i.realizada).length,
    pendentes: items.filter(i => !i.realizada).length,
  }), [items]);

  const fmtDate = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };
  const fmtTime = (t: string) => t?.slice(0, 5);

  const isAcontecendo = (b: Blitz) => {
    void nowTick;
    if (b.realizada) return false;
    const now = new Date();
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const nowHM = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
    if (b.dia !== todayStr) return false;
    const ini = (b.horario || "").slice(0, 5);
    const fim = (b.horario_fim || "").slice(0, 5);
    if (ini && nowHM < ini) return false;
    if (fim && nowHM > fim) return false;
    return true;
  };
  const liveBlitz = useMemo(() => items.find(b => isAcontecendo(b)), [items, isAcontecendo]);

  if (loading) return <ModulePageSkeleton />;

  const secondsToEnd = (b: Blitz) => {
    void nowTick;
    const fim = (b.horario_fim || "").slice(0, 5);
    if (!fim) return null;
    const now = new Date();
    const hms = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now);
    const [h, m, s] = hms.split(":").map(Number);
    const [fh, fm] = fim.split(":").map(Number);
    return (fh * 3600 + fm * 60) - (h * 3600 + m * 60 + s);
  };

  const fmtCountdown = (total: number) => {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0
      ? `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`
      : `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  };


  const renderRow = (b: Blitz) => {
    const live = isAcontecendo(b);
    const restante = live ? secondsToEnd(b) : null;

    return (
    <div
      key={b.id}
      className={`flex items-center gap-3 flex-wrap${live ? " blitz-live-row" : ""}`}
      style={{ background: "#fff", borderRadius: 16, padding: 14, border: `1px solid ${live ? LIME : `${CYAN}33`}` }}
    >

      <div style={{ minWidth: 90 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", color: "#64748B", fontWeight: 700, letterSpacing: 1 }}>Dia</div>
        <div style={{ fontWeight: 800, color: DARK, fontSize: 14 }}>{fmtDate(b.dia)}</div>
      </div>
      <div style={{ minWidth: 70 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", color: "#64748B", fontWeight: 700, letterSpacing: 1 }}>Hora</div>
        <div style={{ fontWeight: 800, color: DARK, fontSize: 14 }}>{fmtTime(b.horario)}{b.horario_fim ? `–${fmtTime(b.horario_fim)}` : ""}</div>
      </div>
      <div className="flex-1 min-w-0" style={{ minWidth: 200 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", color: "#64748B", fontWeight: 700, letterSpacing: 1 }}>Cliente</div>
        <div style={{ fontWeight: 800, color: DARK, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.cliente}</div>
        {b.equipe && <div style={{ fontSize: 11, color: "#64748B" }}><Users size={10} style={{ display: "inline", marginRight: 3 }} />{b.equipe}</div>}
        {b.observacoes && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{b.observacoes}</div>}
      </div>
      <div style={{
        padding: "5px 12px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: 1,
        background: b.realizada ? LIME : live ? "#dcfce7" : "#fef3c7",
        color: b.realizada ? DARK : live ? "#166534" : "#92400e",
      }}>
        {b.realizada ? "Realizada" : live ? "Acontecendo agora" : "Agendada"}
      </div>
      {live && restante !== null && restante > 0 && (
        <div
          className="blitz-live-countdown"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 800,
            fontVariantNumeric: "tabular-nums",
            background: `${LIME}33`,
            border: `1px solid ${LIME}`,
            color: DARK,
          }}
          title={`Termina às ${fmtTime(b.horario_fim || "")}`}
        >
          <Clock size={12} />
          <span>termina em {fmtCountdown(restante)}</span>
        </div>
      )}

      <div className="flex gap-1">
        <button
          style={{ ...ghostBtn, height: 36, padding: "0 12px", borderColor: b.realizada ? "#94a3b8" : LIME, color: b.realizada ? "#64748B" : DARK, background: b.realizada ? "#fff" : LIME }}
          onClick={() => toggleRealizada(b)}
          title={b.realizada ? "Voltar para agendada" : "Marcar como realizada"}
        >
          {b.realizada ? <X size={14} /> : <Check size={14} />}
        </button>
        <button style={{ ...ghostBtn, height: 36, padding: "0 12px" }} onClick={() => edit(b)}><Pencil size={14} /></button>
        <button style={{ ...ghostBtn, height: 36, padding: "0 12px", borderColor: "#ef4444", color: "#ef4444" }} onClick={() => del(b.id)}><Trash2 size={14} /></button>
      </div>
    </div>
    );
  };

  const blitzLiveCss = `@keyframes blitzLiveBorder{0%,100%{border-color:${LIME};box-shadow:0 0 0 0 ${LIME}00}50%{border-color:${LIME};box-shadow:0 0 0 4px ${LIME}66}}
.blitz-live-row{animation:blitzLiveBorder 1.3s ease-in-out infinite}`;




  return (
    <div className="space-y-6 w-full max-w-none mx-0" style={{ fontFamily: FONT }}>
      <div id="module-header-title" style={{ display: "none" }}>
        Atendimento — Blitz
      </div>
      <style>{blitzLiveCss}</style>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div style={{ width: 48, height: 48, borderRadius: 16, background: CYAN, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Siren size={24} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: DARK, letterSpacing: -0.5 }}>Blitz Promocionais</h1>
          <p style={{ fontSize: 12, color: "#64748B" }}>Cadastro e relatório de ações promocionais de rua</p>
        </div>
      </div>

      {/* Formulário */}
      <div ref={formRef} style={cardStyle}>
        <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: DARK, marginBottom: 16 }}>
          {editingId ? "Editar blitz" : "Nova blitz"}
        </h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <div>
            <label style={labelStyle}><Calendar size={11} style={{ display: "inline", marginRight: 4 }} /> Dia</label>
            <input type="date" style={pillInput} value={form.dia} onChange={e => setForm({ ...form, dia: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}><Clock size={11} style={{ display: "inline", marginRight: 4 }} /> Horário inicial</label>
            <input type="time" style={pillInput} value={form.horario} onChange={e => setForm({ ...form, horario: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}><Clock size={11} style={{ display: "inline", marginRight: 4 }} /> Horário final</label>
            <input type="time" style={pillInput} value={form.horario_fim} onChange={e => setForm({ ...form, horario_fim: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}><Building2 size={11} style={{ display: "inline", marginRight: 4 }} /> Nome do cliente</label>
            <div className="relative">
              <input 
                type="text" 
                style={pillInput} 
                placeholder="Ex: Supermercado ABC" 
                value={form.cliente} 
                onChange={e => handleClienteChange(e.target.value)}
                onKeyDown={handleClienteKeyDown}
                onBlur={handleClienteBlur}
                maxLength={120} 
                autoComplete="off"
              />
              {showSugestoes && sugestoesClientes.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  {sugestoesClientes.map((c, index) => (
                    <button
                      key={c.id}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors border-b border-slate-100 last:border-0 ${
                        index === activeSugestaoIndex ? "bg-slate-100 font-bold" : "hover:bg-slate-50"
                      }`}
                      onClick={() => selectCliente(c)}
                      onMouseDown={(e) => e.preventDefault()} // Impede o blur de disparar antes do clique
                    >
                      {c.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label style={labelStyle}><Users size={11} style={{ display: "inline", marginRight: 4 }} /> Equipe</label>
            <input type="text" style={pillInput} placeholder="Ex: Ana, Bruno, Carla" value={form.equipe} onChange={e => setForm({ ...form, equipe: e.target.value })} maxLength={200} />
          </div>
        </div>
        <div className="mt-4">
          <label style={labelStyle}><FileText size={11} style={{ display: "inline", marginRight: 4 }} /> Observações (opcional)</label>
          <textarea
            style={{ ...pillInput, height: 90, borderRadius: 22, padding: "12px 20px", resize: "vertical" }}
            placeholder="Detalhes, brindes, roteiro..."
            value={form.observacoes}
            onChange={e => setForm({ ...form, observacoes: e.target.value })}
            maxLength={500}
          />
        </div>
        <div className="flex gap-2 mt-5">
          <button style={limeBtn} onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {editingId ? "Salvar alterações" : "Agendar blitz"}
          </button>
          {editingId && <button style={ghostBtn} onClick={reset}><X size={14} /> Cancelar</button>}
        </div>
      </div>

      {/* Blitz agendadas */}
      <div style={cardStyle}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: DARK }}>
            Blitz agendadas ({agendadas.length})
          </h2>
        </div>
        {agendadas.length === 0 ? (
          <p style={{ color: "#64748B", fontSize: 13, textAlign: "center", padding: 24 }}>
            Nenhuma blitz agendada.
          </p>
        ) : (
          <div className="grid gap-2">{agendadas.map(renderRow)}</div>
        )}
      </div>

      {/* Blitz realizadas */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: DARK, marginBottom: 16 }}>
          Blitz realizadas ({realizadas.length})
        </h2>
        {realizadas.length === 0 ? (
          <p style={{ color: "#64748B", fontSize: 13, textAlign: "center", padding: 24 }}>
            Nenhuma blitz realizada ainda.
          </p>
        ) : (
          <div className="grid gap-2">{realizadas.map(renderRow)}</div>
        )}
        {stats.total > 0 && (
          <div className="mt-4 flex items-center gap-2" style={{ fontSize: 11, color: "#64748B" }}>
            <CheckCircle2 size={13} color={LIME} />
            <span>Taxa de execução: <b style={{ color: DARK }}>{Math.round((stats.realizadas / stats.total) * 100)}%</b></span>
          </div>
        )}
      </div>

      {/* Popup de Cadastro de Cliente */}
      {cadastroOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
            style={{ fontFamily: FONT }}
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500 flex items-center justify-center">
                  <Building2 size={20} color="#fff" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Novo Cliente</h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Cadastrar para Blitz</p>
                </div>
              </div>
              <button 
                onClick={() => setCadastroOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1 md:col-span-2">
                  <label style={labelStyle}>Razão Social</label>
                  <input 
                    type="text" 
                    style={{ ...pillInput, borderColor: cadastroErrors.nome ? "#ef4444" : undefined }} 
                    value={novoClienteData.nome}
                    onChange={e => {
                      setNovoClienteData(prev => ({ ...prev, nome: e.target.value }));
                      if (cadastroErrors.nome) setCadastroErrors(prev => {
                        const next = { ...prev };
                        delete next.nome;
                        return next;
                      });
                    }}
                  />
                  {cadastroErrors.nome && <p className="text-[10px] text-red-500 font-medium pl-2">{cadastroErrors.nome}</p>}
                </div>
                <div className="space-y-1">
                  <label style={labelStyle}>CNPJ</label>
                  <input 
                    type="text" 
                    style={{ ...pillInput, borderColor: cadastroErrors.cnpj ? "#ef4444" : undefined }} 
                    placeholder="00.000.000/0000-00"
                    value={novoClienteData.cnpj}
                    onChange={e => {
                      setNovoClienteData(prev => ({ ...prev, cnpj: e.target.value }));
                      if (cadastroErrors.cnpj) setCadastroErrors(prev => {
                        const next = { ...prev };
                        delete next.cnpj;
                        return next;
                      });
                    }}
                  />
                  {cadastroErrors.cnpj && <p className="text-[10px] text-red-500 font-medium pl-2">{cadastroErrors.cnpj}</p>}
                </div>
                <div className="space-y-1">
                  <label style={labelStyle}>Telefone</label>
                  <input 
                    type="text" 
                    style={pillInput} 
                    placeholder="(00) 0000-0000"
                    value={novoClienteData.telefone}
                    onChange={e => setNovoClienteData(prev => ({ ...prev, telefone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label style={labelStyle}>Endereço</label>
                  <input 
                    type="text" 
                    style={pillInput} 
                    placeholder="Rua, Número, Bairro, Cidade"
                    value={novoClienteData.endereco}
                    onChange={e => setNovoClienteData(prev => ({ ...prev, endereco: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  style={{ ...ghostBtn, flex: 1, border: "none", background: "#f1f5f9" }}
                  onClick={() => {
                    setCadastroOpen(false);
                    setCadastroErrors({});
                  }}
                >
                  Cancelar
                </button>
                <button 
                  style={{ ...limeBtn, flex: 1 }}
                  onClick={saveNovoCliente}
                  disabled={cadastrandoCliente}
                >
                  {cadastrandoCliente ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Cadastrar Cliente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de cadastro */}
      {confirmCadastroOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div 
            className="bg-white rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300"
            style={{ fontFamily: FONT }}
          >
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-[#D6F4FB] rounded-full flex items-center justify-center mx-auto mb-6">
                <Building2 size={32} color={CYAN} />
              </div>
              <h3 className="text-xl font-extrabold text-[#0A2540] mb-4">
                Cliente não cadastrado
              </h3>
              <p className="text-[#64748B] text-sm leading-relaxed mb-8">
                O cliente <strong className="text-[#0A2540]">"{novoClienteNome}"</strong> não foi encontrado em nosso sistema. Deseja realizar o cadastro agora?
              </p>
              
              <div className="flex gap-3">
                <button 
                  style={{ ...ghostBtn, flex: 1, border: "none", background: "#f1f5f9" }}
                  onClick={() => setConfirmCadastroOpen(false)}
                >
                  <X size={16} className="mr-2" />
                  Agora não
                </button>
                <button 
                  style={{ ...limeBtn, flex: 1 }}
                  onClick={() => {
                    setConfirmCadastroOpen(false);
                    setNovoClienteData(prev => ({ ...prev, nome: novoClienteNome }));
                    setCadastroOpen(true);
                  }}
                >
                  <Check size={16} className="mr-2" />
                  Sim, cadastrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

