import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Siren, Save, Loader2, Pencil, Trash2, Check, X, Calendar, Clock, Users, Building2, FileText, CheckCircle2 } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { confirmDialog } from "@/lib/confirmDialog";

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
  cliente: string;
  equipe: string | null;
  observacoes: string | null;
  realizada: boolean;
  data_realizacao: string | null;
  created_at: string;
}

const emptyForm = { dia: "", horario: "", cliente: "", equipe: "", observacoes: "" };

export default function BlitzPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<Blitz[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"todos" | "pendentes" | "realizadas">("todos");

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
    setItems((data as Blitz[]) || []);
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
    setSaving(true);
    const payload = {
      user_id: user.id,
      dia: form.dia,
      horario: form.horario,
      cliente: form.cliente.trim(),
      equipe: form.equipe.trim() || null,
      observacoes: form.observacoes.trim() || null,
    };
    const q = editingId
      ? supabase.from("blitz_promocionais").update(payload).eq("id", editingId)
      : supabase.from("blitz_promocionais").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Blitz atualizada" : "Blitz cadastrada" });
    reset();
    load();
  };

  const edit = (b: Blitz) => {
    setEditingId(b.id);
    setForm({
      dia: b.dia,
      horario: b.horario?.slice(0, 5) || "",
      cliente: b.cliente,
      equipe: b.equipe || "",
      observacoes: b.observacoes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const del = async (id: string) => {
    if (!(await confirmDialog("Excluir esta blitz?"))) return;
    const { error } = await supabase.from("blitz_promocionais").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Blitz excluída" });
    load();
  };

  const toggleRealizada = async (b: Blitz) => {
    const next = !b.realizada;
    const { error } = await supabase.from("blitz_promocionais").update({
      realizada: next,
      data_realizacao: next ? new Date().toISOString() : null,
    }).eq("id", b.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const filtered = useMemo(() => {
    if (filter === "pendentes") return items.filter(i => !i.realizada);
    if (filter === "realizadas") return items.filter(i => i.realizada);
    return items;
  }, [items, filter]);

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
            <label style={labelStyle}><Clock size={11} style={{ display: "inline", marginRight: 4 }} /> Horário</label>
            <input type="time" style={pillInput} value={form.horario} onChange={e => setForm({ ...form, horario: e.target.value })} />
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

      {/* Relatório */}
      <div style={cardStyle}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: DARK }}>
            Relatório de blitz realizadas
          </h2>
          <div className="flex gap-2">
            {[
              { k: "todos", label: `Todas (${stats.total})` },
              { k: "pendentes", label: `Pendentes (${stats.pendentes})` },
              { k: "realizadas", label: `Realizadas (${stats.realizadas})` },
            ].map(t => (
              <button
                key={t.k}
                onClick={() => setFilter(t.k as any)}
                style={{
                  ...ghostBtn,
                  height: 34,
                  padding: "0 14px",
                  fontSize: 11,
                  background: filter === t.k ? CYAN : "#fff",
                  color: filter === t.k ? "#fff" : DARK,
                  borderColor: CYAN,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p style={{ color: "#64748B", fontSize: 13, textAlign: "center", padding: 24 }}>
            Nenhuma blitz {filter === "realizadas" ? "realizada" : filter === "pendentes" ? "pendente" : "cadastrada"}.
          </p>
        ) : (
          <div className="grid gap-2">
            {filtered.map(b => (
              <div key={b.id} className="flex items-center gap-3 flex-wrap" style={{ background: "#fff", borderRadius: 16, padding: 14, border: `1px solid ${CYAN}33` }}>
                <div style={{ minWidth: 90 }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", color: "#64748B", fontWeight: 700, letterSpacing: 1 }}>Dia</div>
                  <div style={{ fontWeight: 800, color: DARK, fontSize: 14 }}>{fmtDate(b.dia)}</div>
                </div>
                <div style={{ minWidth: 70 }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", color: "#64748B", fontWeight: 700, letterSpacing: 1 }}>Hora</div>
                  <div style={{ fontWeight: 800, color: DARK, fontSize: 14 }}>{fmtTime(b.horario)}</div>
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
                  background: b.realizada ? LIME : "#fef3c7",
                  color: b.realizada ? DARK : "#92400e",
                }}>
                  {b.realizada ? "Realizada" : "Pendente"}
                </div>
                <div className="flex gap-1">
                  <button
                    style={{ ...ghostBtn, height: 36, padding: "0 12px", borderColor: b.realizada ? "#94a3b8" : LIME, color: b.realizada ? "#64748B" : DARK, background: b.realizada ? "#fff" : LIME }}
                    onClick={() => toggleRealizada(b)}
                    title={b.realizada ? "Marcar como pendente" : "Marcar como realizada"}
                  >
                    {b.realizada ? <X size={14} /> : <Check size={14} />}
                  </button>
                  <button style={{ ...ghostBtn, height: 36, padding: "0 12px" }} onClick={() => edit(b)}><Pencil size={14} /></button>
                  <button style={{ ...ghostBtn, height: 36, padding: "0 12px", borderColor: "#ef4444", color: "#ef4444" }} onClick={() => del(b.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {stats.total > 0 && (
          <div className="mt-4 flex items-center gap-2" style={{ fontSize: 11, color: "#64748B" }}>
            <CheckCircle2 size={13} color={LIME} />
            <span>Taxa de execução: <b style={{ color: DARK }}>{stats.total ? Math.round((stats.realizadas / stats.total) * 100) : 0}%</b></span>
          </div>
        )}
      </div>
    </div>
  );
}
