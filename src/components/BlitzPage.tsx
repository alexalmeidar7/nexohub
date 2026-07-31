import { useEffect, useMemo, useState } from "react";
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

// Nexo palette
const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const CARD_BG = "#D6F4FB";
const DARK = "#0A2540";
const FONT = "'Montserrat', sans-serif";

const pillInput: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 999,
  background: "#FFFFFF",
  border: `2px solid ${CYAN}`,
  padding: "0 20px",
  fontFamily: FONT,
  fontSize: 13,
  color: DARK,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: DARK,
  marginBottom: 8,
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
  background: CYAN,
  color: "#fff",
  fontFamily: FONT,
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: 1,
  textTransform: "uppercase",
  padding: "0 22px",
  border: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};

const limeBtn: React.CSSProperties = { ...primaryBtn, background: LIME, color: DARK };
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: "#fff", color: DARK, border: `2px solid ${CYAN}` };

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

export default function BlitzPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<Blitz[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"todos" | "pendentes" | "realizadas">("todos");
  const [historico, setHistorico] = useState<BlitzHistRow[]>([]);
  const [showHistorico, setShowHistorico] = useState(false);

  const loadHistorico = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("blitz_promocionais_historico")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    setHistorico((data as BlitzHistRow[]) || []);
  };

  const autoExpire = async (rows: Blitz[]) => {
    if (!user?.id) return rows;
    const today = new Date();
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(today);
    const nowHM = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(today);
    const toExpire = rows.filter(b => !b.realizada && (b.dia < todayStr || (b.dia === todayStr && b.horario_fim && b.horario_fim.slice(0, 5) <= nowHM)));
    if (!toExpire.length) return rows;
    const ids = toExpire.map(b => b.id);
    const agendaIds = toExpire.map(b => b.agenda_evento_id).filter(Boolean) as string[];
    await supabase.from("blitz_promocionais").update({ realizada: true, data_realizacao: new Date().toISOString() }).in("id", ids);
    if (agendaIds.length) {
      await supabase.from("agenda_participantes").delete().in("evento_id", agendaIds);
      await supabase.from("agenda_eventos").delete().in("id", agendaIds);
    }
    for (const b of toExpire) {
      await logBlitzHistorico({
        userId: user.id, blitzId: b.id, cliente: b.cliente, acao: "expirada",
        motivo: "Encerrada automaticamente por vencimento do horário final",
        dadosAntes: b, dadosDepois: { ...b, realizada: true },
      });
    }
    return rows.map(r => ids.includes(r.id) ? { ...r, realizada: true } : r);
  };

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("blitz_promocionais")
      .select("*")
      .eq("user_id", user.id)
      .order("dia", { ascending: false })
      .order("horario", { ascending: false });
    if (error) toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    const rows = (data as Blitz[]) || [];
    setItems(await autoExpire(rows));
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const reset = () => { setForm(emptyForm); setEditingId(null); };

  const save = async () => {
    if (!user?.id) return;
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
      user_id: user.id,
      dia: form.dia,
      horario: form.horario,
      horario_fim: form.horario_fim || null,
      cliente: form.cliente.trim(),
      equipe: form.equipe.trim() || null,
      observacoes: form.observacoes.trim() || null,
    };
    const agendaPayload = await buildAgendaPayload(user.id, payload);

    if (editingId) {
      const current = items.find(i => i.id === editingId);
      const { error } = await supabase.from("blitz_promocionais").update(payload).eq("id", editingId);
      if (error) { setSaving(false); toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
      if (current?.agenda_evento_id) {
        await supabase.from("agenda_eventos").update(agendaPayload).eq("id", current.agenda_evento_id);
      } else {
        const { data: evt } = await supabase.from("agenda_eventos").insert(agendaPayload).select("id").single();
        if (evt?.id) await supabase.from("blitz_promocionais").update({ agenda_evento_id: evt.id }).eq("id", editingId);
      }
      await logBlitzHistorico({
        userId: user.id, blitzId: editingId, cliente: payload.cliente, acao: "editada",
        dadosAntes: current, dadosDepois: payload,
      });
    } else {
      const { data: evt } = await supabase.from("agenda_eventos").insert(agendaPayload).select("id").single();
      const { data: created, error } = await supabase
        .from("blitz_promocionais")
        .insert({ ...payload, agenda_evento_id: evt?.id || null })
        .select("id")
        .single();
      if (error) { setSaving(false); toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
      await logBlitzHistorico({
        userId: user.id, blitzId: created?.id ?? null, cliente: payload.cliente, acao: "criada",
        dadosDepois: payload,
      });
    }
    setSaving(false);
    toast({ title: editingId ? "Blitz atualizada" : "Blitz cadastrada e adicionada à agenda" });
    reset();
    load();
    if (showHistorico) loadHistorico();
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const del = async (id: string) => {
    const motivo = window.prompt("Excluir esta blitz?\n\nInforme um motivo (opcional) para o histórico:", "");
    if (motivo === null) return;
    const b = items.find(i => i.id === id);
    if (b?.agenda_evento_id) {
      await supabase.from("agenda_participantes").delete().eq("evento_id", b.agenda_evento_id);
      await supabase.from("agenda_eventos").delete().eq("id", b.agenda_evento_id);
    }
    const { error } = await supabase.from("blitz_promocionais").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    await logBlitzHistorico({
      userId: user!.id, blitzId: id, cliente: b?.cliente ?? null, acao: "excluida",
      motivo: motivo.trim() || null, dadosAntes: b,
    });
    toast({ title: "Blitz excluída" });
    load();
    if (showHistorico) loadHistorico();
  };

  const toggleRealizada = async (b: Blitz) => {
    const next = !b.realizada;
    const { error } = await supabase.from("blitz_promocionais").update({
      realizada: next,
      data_realizacao: next ? new Date().toISOString() : null,
    }).eq("id", b.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    if (next && b.agenda_evento_id) {
      // Encerrada: remove da agenda e da lista do locutor
      await supabase.from("agenda_participantes").delete().eq("evento_id", b.agenda_evento_id);
      await supabase.from("agenda_eventos").delete().eq("id", b.agenda_evento_id);
      await supabase.from("blitz_promocionais").update({ agenda_evento_id: null }).eq("id", b.id);
    } else if (!next && !b.agenda_evento_id) {
      // Reabrir: recria evento na agenda
      const payload = await buildAgendaPayload(user!.id, b);
      const { data: evt } = await supabase.from("agenda_eventos").insert(payload).select("id").single();
      if (evt?.id) await supabase.from("blitz_promocionais").update({ agenda_evento_id: evt.id }).eq("id", b.id);
    }
    await logBlitzHistorico({
      userId: user!.id, blitzId: b.id, cliente: b.cliente, acao: next ? "encerrada" : "reaberta",
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

  if (loading) return <ModulePageSkeleton />;

  const fmtDate = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };
  const fmtTime = (t: string) => t?.slice(0, 5);

  return (
    <div className="space-y-6 max-w-6xl mx-auto" style={{ fontFamily: FONT }}>
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
      <div style={cardStyle}>
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
            <input type="text" style={pillInput} placeholder="Ex: Supermercado ABC" value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })} maxLength={120} />
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
            {editingId ? "Salvar alterações" : "Cadastrar blitz"}
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


      {/* Histórico / Auditoria */}
      <div style={cardStyle}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: DARK, display: "flex", alignItems: "center", gap: 8 }}>
            <History size={14} /> Histórico de alterações
          </h2>
          <button
            style={{ ...ghostBtn, height: 34, padding: "0 14px", fontSize: 11 }}
            onClick={() => {
              const next = !showHistorico;
              setShowHistorico(next);
              if (next) loadHistorico();
            }}
          >
            {showHistorico ? "Ocultar" : "Mostrar histórico"}
          </button>
        </div>

        {showHistorico && (
          <div className="mt-4">
            {historico.length === 0 ? (
              <p style={{ color: "#64748B", fontSize: 13, textAlign: "center", padding: 24 }}>
                Nenhuma alteração registrada ainda.
              </p>
            ) : (
              <div className="grid gap-2">
                {historico.map(h => {
                  const cores: Record<BlitzHistAcao, { bg: string; fg: string; label: string }> = {
                    criada:   { bg: "#DCFCE7", fg: "#166534", label: "Criada" },
                    editada:  { bg: "#DBEAFE", fg: "#1E40AF", label: "Editada" },
                    encerrada:{ bg: LIME,      fg: DARK,      label: "Encerrada" },
                    reaberta: { bg: "#FEF9C3", fg: "#854D0E", label: "Reaberta" },
                    excluida: { bg: "#FEE2E2", fg: "#991B1B", label: "Excluída" },
                    expirada: { bg: "#F1F5F9", fg: "#334155", label: "Expirada" },
                  };
                  const c = cores[h.acao] || cores.editada;
                  const dt = new Date(h.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
                  return (
                    <div key={h.id} className="flex items-start gap-3 flex-wrap" style={{ background: "#fff", borderRadius: 14, padding: 12, border: `1px solid ${CYAN}33` }}>
                      <div style={{
                        padding: "4px 10px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                        textTransform: "uppercase", letterSpacing: 1, background: c.bg, color: c.fg,
                        whiteSpace: "nowrap",
                      }}>
                        {c.label}
                      </div>
                      <div className="flex-1 min-w-0" style={{ minWidth: 200 }}>
                        <div style={{ fontWeight: 800, color: DARK, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {h.cliente || "(sem cliente)"}
                        </div>
                        <div style={{ fontSize: 11, color: "#64748B" }}>
                          {dt}
                          {h.changed_by_email ? ` • ${h.changed_by_email}` : ""}
                        </div>
                        {h.motivo && (
                          <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
                            <b>Motivo:</b> {h.motivo}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
