import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Save, X, Search, Gift, Package, Dice5, Truck, Plus, Shuffle, Check, Radio, Clock, AlertTriangle, History } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { useToast } from "@/hooks/use-toast";
import { findCurrentProgram } from "./OnAirWidget";


// Palette (nexo-form-design-system)
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

const pillSelect: React.CSSProperties = {
  ...pillInput,
  appearance: "none",
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2300BFF0' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 18px center",
  paddingRight: 44,
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
  padding: "0 22px",
  fontFamily: FONT,
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: 1,
  textTransform: "uppercase",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "none",
  cursor: "pointer",
};

const limeBtn: React.CSSProperties = { ...primaryBtn, background: LIME, color: DARK };
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: "#fff", color: DARK, border: `2px solid ${CYAN}` };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

interface Premio {
  id: string;
  nome: string;
  descricao: string | null;
  imagem_url: string | null;
  quantidade_estoque: number;
  ativo: boolean;
  created_at: string;
  programa_id: string | null;
  dias_validade: number;
}

interface Sorteio {
  id: string;
  premio_id: string;
  ouvinte_id: string | null;
  nome_ganhador: string;
  telefone_ganhador: string | null;
  data_sorteio: string;
  entregue: boolean;
  data_entrega: string | null;
  observacoes: string | null;
  expirado?: boolean;
  data_expiracao?: string | null;
}

interface Ouvinte {
  id: string;
  nome: string;
  telefone: string | null;
  cidade: string | null;
  pontuacao: number | null;
}

interface ProgramaLite { id: string; nome: string; }

type Tab = "premios" | "lista" | "sorteio" | "entrega";


export default function SorteiosPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("premios");
  const [loading, setLoading] = useState(true);
  const [premios, setPremios] = useState<Premio[]>([]);
  const [sorteios, setSorteios] = useState<Sorteio[]>([]);
  const [ouvintes, setOuvintes] = useState<Ouvinte[]>([]);
  const [programas, setProgramas] = useState<ProgramaLite[]>([]);

  const load = async () => {
    setLoading(true);
    // Expire overdue drawings before fetching
    if (user?.id) {
      await supabase.rpc("expire_overdue_sorteios", { _user_id: user.id });
    }
    const [p, s, o, pr] = await Promise.all([
      supabase.from("sorteio_premios").select("*").order("created_at", { ascending: false }),
      supabase.from("sorteio_sorteios").select("*").order("data_sorteio", { ascending: false }),
      supabase.from("ouvintes").select("id, nome, telefone, cidade, pontuacao").order("pontuacao", { ascending: false }),
      supabase.from("programas").select("id, nome").ilike("estudio", "%fm%").order("nome"),
    ]);
    if (p.error) toast({ title: "Erro ao carregar prêmios", description: p.error.message, variant: "destructive" });
    else setPremios((p.data as any) || []);
    if (s.error) toast({ title: "Erro ao carregar sorteios", description: s.error.message, variant: "destructive" });
    else setSorteios((s.data as any) || []);
    if (!o.error) setOuvintes((o.data as any) || []);
    if (!pr.error) setProgramas((pr.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  if (loading) return <ModulePageSkeleton />;

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div style={{ width: 44, height: 44, borderRadius: 12, background: CYAN, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Gift size={22} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: DARK, margin: 0 }}>Sorteios</h1>
          <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>Gestão de prêmios, sorteios e entregas</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          { k: "premios", label: "Prêmios & Estoque", icon: Package },
          { k: "lista", label: "Lista de Prêmios", icon: Radio },
          { k: "sorteio", label: "Realizar Sorteio", icon: Dice5 },
          { k: "entrega", label: "Entregas", icon: Truck },
        ] as const).map(({ k, label, icon: Icon }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              ...primaryBtn,
              background: tab === k ? CYAN : "#fff",
              color: tab === k ? "#fff" : DARK,
              border: tab === k ? "none" : `2px solid ${CYAN}`,
            }}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === "premios" && <PremiosTab premios={premios} programas={programas} userId={user?.id} onReload={load} />}
      {tab === "lista" && <ListaPremiosTab premios={premios} programas={programas} onReload={load} />}
      {tab === "sorteio" && <SorteioTab premios={premios} ouvintes={ouvintes} sorteios={sorteios} userId={user?.id} onReload={load} onGoTo={setTab} />}
      {tab === "entrega" && <EntregaTab sorteios={sorteios} premios={premios} onReload={load} />}
    </div>
  );
}


/* ═════════════════════ PRÊMIOS ═════════════════════ */
function PremiosTab({ premios, programas, userId, onReload }: { premios: Premio[]; programas: ProgramaLite[]; userId?: string; onReload: () => void }) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", descricao: "", imagem_url: "", quantidade_estoque: "1", dias_validade: "7", programa_id: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const reset = () => { setForm({ nome: "", descricao: "", imagem_url: "", quantidade_estoque: "1", dias_validade: "7", programa_id: "" }); setEditingId(null); };


  const save = async () => {
    if (!userId) return;
    if (!form.nome.trim()) { toast({ title: "Nome do prêmio é obrigatório", variant: "destructive" }); return; }
    setSaving(true);
    const payload = {
      user_id: userId,
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || null,
      imagem_url: form.imagem_url || null,
      quantidade_estoque: parseInt(form.quantidade_estoque || "0", 10) || 0,
      dias_validade: Math.max(1, parseInt(form.dias_validade || "7", 10) || 7),
      programa_id: form.programa_id || null,
    };

    const q = editingId
      ? supabase.from("sorteio_premios").update(payload).eq("id", editingId)
      : supabase.from("sorteio_premios").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Prêmio atualizado" : "Prêmio cadastrado" });
    reset();
    onReload();
  };

  const handleUpload = async (file: File) => {
    if (!userId) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${userId}/sorteios/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("comercial").upload(path, file, { upsert: true });
    if (error) { toast({ title: "Erro no upload", description: error.message, variant: "destructive" }); setUploading(false); return; }
    const { data } = supabase.storage.from("comercial").getPublicUrl(path);
    setForm(f => ({ ...f, imagem_url: data.publicUrl }));
    setUploading(false);
  };

  const del = async (id: string) => {
    if (!confirm("Excluir este prêmio?")) return;
    const { error } = await supabase.from("sorteio_premios").delete().eq("id", id);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Prêmio excluído" });
    onReload();
  };

  const edit = (p: Premio) => {
    setEditingId(p.id);
    setForm({
      nome: p.nome,
      descricao: p.descricao || "",
      imagem_url: p.imagem_url || "",
      quantidade_estoque: String(p.quantidade_estoque),
      dias_validade: String(p.dias_validade ?? 7),
      programa_id: p.programa_id || "",
    });
  };


  return (
    <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
      {/* Form */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: DARK, marginBottom: 16 }}>
          {editingId ? "Editar Prêmio" : "Novo Prêmio"}
        </h2>
        <div className="grid gap-4">
          <Field label="Nome do prêmio">
            <input style={pillInput} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
          </Field>
          <Field label="Descrição">
            <textarea
              style={{ ...pillInput, height: 88, borderRadius: 22, padding: 14, resize: "none" }}
              value={form.descricao}
              onChange={e => setForm({ ...form, descricao: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantidade em estoque">
              <input type="number" min={0} style={pillInput} value={form.quantidade_estoque}
                onChange={e => setForm({ ...form, quantidade_estoque: e.target.value })} />
            </Field>
            <Field label="Validade para entregar (dias)">
              <input type="number" min={1} style={pillInput} value={form.dias_validade}
                onChange={e => setForm({ ...form, dias_validade: e.target.value })} />
            </Field>
          </div>
          <Field label="Programa vinculado (opcional)">
            <select style={pillSelect} value={form.programa_id} onChange={e => setForm({ ...form, programa_id: e.target.value })}>
              <option value="">— SEM PROGRAMA —</option>
              {programas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Field>

          <Field label="Imagem do prêmio">
            <div className="flex items-center gap-3">
              {form.imagem_url && (
                <img src={form.imagem_url} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover", border: `2px solid ${CYAN}` }} />
              )}
              <label style={{ ...ghostBtn, cursor: "pointer" }}>
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {form.imagem_url ? "Trocar" : "Enviar"}
                <input type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
              </label>
              {form.imagem_url && (
                <button style={ghostBtn} onClick={() => setForm({ ...form, imagem_url: "" })}><X size={16} /></button>
              )}
            </div>
          </Field>
          <div className="flex gap-2 pt-2">
            <button style={limeBtn} onClick={save} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {editingId ? "Atualizar" : "Cadastrar"}
            </button>
            {editingId && <button style={ghostBtn} onClick={reset}><X size={16} /> Cancelar</button>}
          </div>
        </div>
      </div>

      {/* List */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: DARK, marginBottom: 16 }}>
          Prêmios Cadastrados ({premios.length})
        </h2>
        {premios.length === 0 ? (
          <p style={{ color: "#64748B", fontSize: 13 }}>Nenhum prêmio cadastrado.</p>
        ) : (
          <div className="grid gap-3">
            {premios.map(p => (
              <div key={p.id} className="flex items-center gap-4" style={{ background: "#fff", borderRadius: 16, padding: 12, border: `1px solid ${CYAN}33` }}>
                {p.imagem_url ? (
                  <img src={p.imagem_url} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: 12, background: CARD_BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Gift size={22} color={CYAN} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div style={{ fontWeight: 700, color: DARK, fontSize: 14 }}>{p.nome}</div>
                  {p.descricao && <div style={{ fontSize: 12, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.descricao}</div>}
                  <div style={{ fontSize: 10, color: "#64748B", marginTop: 3 }}>
                    <b>Validade:</b> {p.dias_validade ?? 7}d
                    {p.programa_id && programas.find(pg => pg.id === p.programa_id) && (
                      <> · <b>Programa:</b> {programas.find(pg => pg.id === p.programa_id)?.nome}</>
                    )}
                  </div>
                </div>
                <div className="text-center px-3">
                  <div style={{ fontSize: 20, fontWeight: 800, color: p.quantidade_estoque > 0 ? DARK : "#ef4444" }}>{p.quantidade_estoque}</div>
                  <div style={{ fontSize: 9, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 }}>Estoque</div>
                </div>

                <div className="flex gap-1">
                  <button style={{ ...ghostBtn, height: 36, padding: "0 12px" }} onClick={() => edit(p)}><Pencil size={14} /></button>
                  <button style={{ ...ghostBtn, height: 36, padding: "0 12px", borderColor: "#ef4444", color: "#ef4444" }} onClick={() => del(p.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═════════════════════ LISTA DE PRÊMIOS ═════════════════════ */
function ListaPremiosTab({ premios, programas, onReload }: { premios: Premio[]; programas: ProgramaLite[]; onReload: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { programa_id: string; dias_validade: string }>>({});

  const getDraft = (p: Premio) =>
    drafts[p.id] ?? { programa_id: p.programa_id || "", dias_validade: String(p.dias_validade ?? 7) };

  const setDraft = (id: string, patch: Partial<{ programa_id: string; dias_validade: string }>) =>
    setDrafts(d => ({ ...d, [id]: { ...(d[id] ?? { programa_id: "", dias_validade: "7" }), ...patch } }));

  const save = async (p: Premio) => {
    const d = getDraft(p);
    setSaving(p.id);
    const { error } = await supabase.from("sorteio_premios").update({
      programa_id: d.programa_id || null,
      dias_validade: Math.max(1, parseInt(d.dias_validade || "7", 10) || 7),
    }).eq("id", p.id);
    setSaving(null);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Prêmio atualizado" });
    setDrafts(dr => { const { [p.id]: _, ...rest } = dr; return rest; });
    onReload();
  };

  // Group by programa
  const grouped = useMemo(() => {
    const map = new Map<string, { programa: ProgramaLite | null; items: Premio[] }>();
    const noneKey = "__none__";
    for (const p of premios) {
      const key = p.programa_id || noneKey;
      if (!map.has(key)) {
        map.set(key, { programa: p.programa_id ? programas.find(pg => pg.id === p.programa_id) || null : null, items: [] });
      }
      map.get(key)!.items.push(p);
    }
    return Array.from(map.entries());
  }, [premios, programas]);

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: DARK, marginBottom: 16 }}>
        Lista de Prêmios por Programa
      </h2>
      {premios.length === 0 ? (
        <p style={{ color: "#64748B", fontSize: 13 }}>Nenhum prêmio cadastrado.</p>
      ) : (
        <div className="grid gap-5">
          {grouped.map(([key, group]) => (
            <div key={key}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: CYAN, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <Radio size={13} />
                {group.programa ? group.programa.nome : "— SEM PROGRAMA —"}
                <span style={{ color: "#64748B", fontWeight: 600 }}>· {group.items.length} prêmio(s)</span>
              </div>
              <div className="grid gap-2">
                {group.items.map(p => {
                  const d = getDraft(p);
                  const dirty = d.programa_id !== (p.programa_id || "") || d.dias_validade !== String(p.dias_validade ?? 7);
                  return (
                    <div key={p.id} className="flex items-center gap-3" style={{ background: "#fff", borderRadius: 16, padding: 10, border: `1px solid ${CYAN}33` }}>
                      {p.imagem_url ? (
                        <img src={p.imagem_url} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: CARD_BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Gift size={18} color={CYAN} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div style={{ fontWeight: 700, color: DARK, fontSize: 13 }}>{p.nome}</div>
                        <div style={{ fontSize: 10, color: "#64748B" }}>Estoque: {p.quantidade_estoque}</div>
                      </div>
                      <select
                        style={{ ...pillSelect, height: 36, fontSize: 11, minWidth: 180 }}
                        value={d.programa_id}
                        onChange={e => setDraft(p.id, { programa_id: e.target.value })}
                      >
                        <option value="">— SEM PROGRAMA —</option>
                        {programas.map(pg => <option key={pg.id} value={pg.id}>{pg.nome}</option>)}
                      </select>
                      <input
                        type="number"
                        min={1}
                        style={{ ...pillInput, height: 36, fontSize: 11, width: 90, textAlign: "center" }}
                        value={d.dias_validade}
                        onChange={e => setDraft(p.id, { dias_validade: e.target.value })}
                        title="Dias para retirar"
                      />
                      <button
                        style={{ ...limeBtn, height: 36, padding: "0 14px", opacity: dirty ? 1 : 0.4, cursor: dirty ? "pointer" : "not-allowed" }}
                        disabled={!dirty || saving === p.id}
                        onClick={() => save(p)}
                      >
                        {saving === p.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Salvar
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═════════════════════ SORTEIO ═════════════════════ */

function SorteioTab({ premios, ouvintes, sorteios, userId, onReload, onGoTo }: {
  premios: Premio[]; ouvintes: Ouvinte[]; sorteios: Sorteio[]; userId?: string; onReload: () => void; onGoTo: (t: Tab) => void;
}) {
  const { toast } = useToast();
  const [premioId, setPremioId] = useState<string>("");
  const [filtroCidade, setFiltroCidade] = useState("");
  const [ganhador, setGanhador] = useState<Ouvinte | null>(null);
  const [manual, setManual] = useState({ nome: "", telefone: "" });
  const [saving, setSaving] = useState(false);
  const [obs, setObs] = useState("");
  const [now, setNow] = useState<Date>(new Date());
  const [programaNoAr, setProgramaNoAr] = useState<{ nome: string; horarioInicio: string; horarioFim: string } | null>(null);

  const premioSelecionado = premios.find(p => p.id === premioId);
  const premioMap = useMemo(() => Object.fromEntries(premios.map(p => [p.id, p])), [premios]);
  const disponivel = premios.filter(p => p.ativo && p.quantidade_estoque > 0);

  // Relógio ao vivo
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Programa no ar (Estúdio FM)
  useEffect(() => {
    let cancelled = false;
    const fetchNoAr = async () => {
      const { data } = await supabase.from("programas").select("*").ilike("estudio", "%fm%");
      if (!data || cancelled) return;
      const programas = data.map((p: any) => ({
        id: p.id,
        nome: p.nome,
        apresentadorId: p.apresentador_id || "",
        selo: p.selo || "",
        diasSemana: p.dias_semana || [],
        horarioInicio: p.horario_inicio,
        horarioFim: p.horario_fim,
        estudio: p.estudio || "",
        classificacaoEtaria: p.classificacao_etaria || "",
      }));
      const cur = findCurrentProgram(programas);
      setProgramaNoAr(cur ? { nome: cur.programa.nome, horarioInicio: cur.programa.horarioInicio, horarioFim: cur.programa.horarioFim } : null);
    };
    fetchNoAr();
    const i = setInterval(fetchNoAr, 60000);
    return () => { cancelled = true; clearInterval(i); };
  }, []);

  const pool = useMemo(() => {
    const cidadeQ = filtroCidade.trim().toLowerCase();
    return ouvintes
      .filter(o => !cidadeQ || (o.cidade || "").toLowerCase().includes(cidadeQ))
      .sort((a, b) => (b.pontuacao ?? 0) - (a.pontuacao ?? 0));
  }, [ouvintes, filtroCidade]);

  const sortear = () => {
    if (!premioId) { toast({ title: "Selecione um prêmio", variant: "destructive" }); return; }
    if (pool.length === 0) { toast({ title: "Nenhum ouvinte no pool", variant: "destructive" }); return; }
    const winner = pool[Math.floor(Math.random() * pool.length)];
    setGanhador(winner);
    setManual({ nome: "", telefone: "" });
  };

  // Histórico do ganhador
  const historicoGanhador = useMemo(() => {
    if (!ganhador) return [];
    return sorteios.filter(s =>
      s.ouvinte_id === ganhador.id ||
      (s.nome_ganhador || "").trim().toLowerCase() === ganhador.nome.trim().toLowerCase()
    );
  }, [ganhador, sorteios]);
  const jaGanhouEstePremio = historicoGanhador.some(s => s.premio_id === premioId);

  const registrar = async () => {
    if (!userId || !premioId) return;
    const nome = ganhador?.nome || manual.nome.trim();
    const tel = ganhador?.telefone || manual.telefone.trim() || null;
    if (!nome) { toast({ title: "Informe o ganhador", variant: "destructive" }); return; }
    setSaving(true);
    const ctxParts: string[] = [];
    ctxParts.push(`Sorteio em ${now.toLocaleString("pt-BR")}`);
    if (programaNoAr) ctxParts.push(`Programa no ar: ${programaNoAr.nome} (${programaNoAr.horarioInicio}—${programaNoAr.horarioFim})`);
    const obsFinal = [obs.trim(), ctxParts.join(" · ")].filter(Boolean).join("\n");
    const { error } = await supabase.from("sorteio_sorteios").insert({
      user_id: userId,
      premio_id: premioId,
      ouvinte_id: ganhador?.id || null,
      nome_ganhador: nome,
      telefone_ganhador: tel,
      observacoes: obsFinal || null,
    });
    setSaving(false);
    if (error) { toast({ title: "Erro ao registrar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Sorteio registrado", description: "Acompanhe a entrega na aba Entregas." });
    setGanhador(null); setManual({ nome: "", telefone: "" }); setObs("");
    onReload();
    onGoTo("entrega");
  };

  return (
    <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div style={cardStyle}>
        <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: DARK, marginBottom: 16 }}>
          Configurar Sorteio
        </h2>

        {/* Contexto: data/hora + programa no ar */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 14, border: `1px solid ${CYAN}33`, marginBottom: 16 }}>
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} color={CYAN} />
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, color: DARK }}>Momento do sorteio</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: DARK }}>{now.toLocaleString("pt-BR")}</div>
          <div className="flex items-center gap-2 mt-3">
            <Radio size={14} color={CYAN} />
            {programaNoAr ? (
              <div style={{ fontSize: 12, color: DARK }}>
                <b>{programaNoAr.nome}</b> <span style={{ color: "#64748B" }}>· {programaNoAr.horarioInicio}—{programaNoAr.horarioFim}</span>
              </div>
            ) : (
              <span style={{ fontSize: 12, color: "#64748B" }}>Nenhum programa no ar</span>
            )}
          </div>
        </div>

        <div className="grid gap-4">
          <Field label="Prêmio (com estoque)">
            <select style={pillSelect} value={premioId} onChange={e => setPremioId(e.target.value)}>
              <option value="">Selecione...</option>
              {disponivel.map(p => (
                <option key={p.id} value={p.id}>{p.nome} — estoque: {p.quantidade_estoque}</option>
              ))}
            </select>
          </Field>
          <Field label="Filtrar ouvintes por cidade (opcional)">
            <input style={pillInput} value={filtroCidade} onChange={e => setFiltroCidade(e.target.value)} placeholder="Ex: São Paulo" />
          </Field>

          {/* Pool com tabela */}
          <div style={{ background: "#fff", borderRadius: 16, padding: 12, border: `1px solid ${CYAN}33` }}>
            <div className="flex items-center justify-between mb-2">
              <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Pool de participantes</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: DARK }}>{pool.length}</div>
            </div>
            {pool.length === 0 ? (
              <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: 12 }}>Sem participantes</p>
            ) : (
              <div style={{ maxHeight: 260, overflowY: "auto", borderRadius: 12 }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: CARD_BG }}>
                    <tr>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: DARK }}>#</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: DARK }}>Nome</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: DARK }}>Cidade</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: DARK }}>Pontos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pool.map((o, idx) => (
                      <tr key={o.id} style={{ borderTop: `1px solid ${CYAN}22` }}>
                        <td style={{ padding: "6px 10px", color: "#64748B" }}>{idx + 1}</td>
                        <td style={{ padding: "6px 10px", color: DARK, fontWeight: 600 }}>{o.nome}</td>
                        <td style={{ padding: "6px 10px", color: "#64748B" }}>{o.cidade || "—"}</td>
                        <td style={{ padding: "6px 10px", color: DARK, fontWeight: 800, textAlign: "right" }}>{o.pontuacao ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <button style={limeBtn} onClick={sortear} disabled={!premioId || pool.length === 0}>
            <Shuffle size={16} /> Sortear Ganhador
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: DARK, marginBottom: 16 }}>
          Ganhador
        </h2>
        {ganhador ? (
          <div className="grid gap-3">
            <div style={{ background: LIME, borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: DARK, fontWeight: 700 }}>Sorteado</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: DARK }}>{ganhador.nome}</div>
              {ganhador.telefone && <div style={{ fontSize: 13, color: DARK }}>{ganhador.telefone}</div>}
              {ganhador.cidade && <div style={{ fontSize: 12, color: DARK, opacity: 0.7 }}>{ganhador.cidade}</div>}
              <div style={{ fontSize: 12, color: DARK, marginTop: 6 }}><b>Pontos:</b> {ganhador.pontuacao ?? 0}</div>
            </div>
            {premioSelecionado && (
              <div style={{ background: "#fff", borderRadius: 16, padding: 12, fontSize: 13, color: DARK }}>
                <b>Prêmio:</b> {premioSelecionado.nome}
              </div>
            )}

            {/* Alerta se já ganhou este prêmio */}
            {jaGanhouEstePremio && (
              <div style={{ background: "#FEF3C7", border: "2px solid #F59E0B", borderRadius: 16, padding: 12, color: "#92400E", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={16} />
                <span><b>Atenção:</b> este ouvinte já ganhou o prêmio <b>{premioSelecionado?.nome}</b> anteriormente.</span>
              </div>
            )}

            {/* Histórico do ouvinte */}
            <div style={{ background: "#fff", borderRadius: 16, padding: 12, border: `1px solid ${CYAN}33` }}>
              <div className="flex items-center gap-2 mb-2">
                <History size={14} color={CYAN} />
                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, color: DARK }}>
                  Histórico de prêmios ({historicoGanhador.length})
                </span>
              </div>
              {historicoGanhador.length === 0 ? (
                <p style={{ fontSize: 12, color: "#94a3b8" }}>Nenhum prêmio anterior.</p>
              ) : (
                <div style={{ maxHeight: 180, overflowY: "auto" }}>
                  <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "#64748B" }}>Prêmio</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "#64748B" }}>Data</th>
                        <th style={{ textAlign: "center", padding: "6px 8px", fontSize: 9, textTransform: "uppercase", color: "#64748B" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historicoGanhador.map(h => (
                        <tr key={h.id} style={{ borderTop: `1px solid ${CYAN}22` }}>
                          <td style={{ padding: "6px 8px", color: DARK, fontWeight: 600 }}>{premioMap[h.premio_id]?.nome || "—"}</td>
                          <td style={{ padding: "6px 8px", color: "#64748B" }}>{new Date(h.data_sorteio).toLocaleDateString("pt-BR")}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center" }}>
                            {h.entregue ? (
                              <span style={{ background: LIME, color: DARK, borderRadius: 999, padding: "2px 8px", fontSize: 9, fontWeight: 800 }}>Retirado</span>
                            ) : (
                              <span style={{ background: "#FEF3C7", color: "#92400E", borderRadius: 999, padding: "2px 8px", fontSize: 9, fontWeight: 800 }}>Pendente</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <p style={{ fontSize: 12, color: "#64748B" }}>Sorteie automaticamente ou informe manualmente:</p>
            <Field label="Nome do ganhador (manual)">
              <input style={pillInput} value={manual.nome} onChange={e => setManual({ ...manual, nome: e.target.value })} />
            </Field>
            <Field label="Telefone">
              <input style={pillInput} value={manual.telefone} onChange={e => setManual({ ...manual, telefone: e.target.value })} />
            </Field>
          </div>
        )}
        <div className="mt-4">
          <Field label="Observações">
            <textarea style={{ ...pillInput, height: 72, borderRadius: 22, padding: 14, resize: "none" }} value={obs} onChange={e => setObs(e.target.value)} />
          </Field>
        </div>
        <div className="flex gap-2 mt-4">
          <button style={primaryBtn} onClick={registrar} disabled={saving || !premioId || (!ganhador && !manual.nome.trim())}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Registrar Sorteio
          </button>
          {ganhador && <button style={ghostBtn} onClick={sortear}><Shuffle size={16} /> Sortear outro</button>}
        </div>
      </div>
    </div>
  );
}


/* ═════════════════════ ENTREGA ═════════════════════ */
function EntregaTab({ sorteios, premios, onReload }: { sorteios: Sorteio[]; premios: Premio[]; onReload: () => void }) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<"pendentes" | "entregues" | "expirados" | "todos">("pendentes");
  const [search, setSearch] = useState("");

  const premioMap = useMemo(() => Object.fromEntries(premios.map(p => [p.id, p])), [premios]);

  const rows = sorteios.filter(s => {
    if (filter === "pendentes" && (s.entregue || s.expirado)) return false;
    if (filter === "entregues" && !s.entregue) return false;
    if (filter === "expirados" && !s.expirado) return false;
    const q = search.trim().toLowerCase();
    if (q && !s.nome_ganhador.toLowerCase().includes(q) && !(premioMap[s.premio_id]?.nome || "").toLowerCase().includes(q)) return false;
    return true;
  });


  const marcarEntregue = async (s: Sorteio, entregue: boolean) => {
    const { error } = await supabase.from("sorteio_sorteios")
      .update({ entregue, data_entrega: entregue ? new Date().toISOString() : null })
      .eq("id", s.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: entregue ? "Marcado como entregue — estoque atualizado" : "Entrega revertida — estoque restaurado" });
    onReload();
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir este registro de sorteio?")) return;
    const { error } = await supabase.from("sorteio_sorteios").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    onReload();
  };

  return (
    <div style={cardStyle}>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {(["pendentes", "entregues", "expirados", "todos"] as const).map(k => (
          <button key={k} onClick={() => setFilter(k)}
            style={{ ...primaryBtn, height: 36, background: filter === k ? CYAN : "#fff", color: filter === k ? "#fff" : DARK, border: filter === k ? "none" : `2px solid ${CYAN}` }}>
            {k === "pendentes" ? "Pendentes" : k === "entregues" ? "Entregues" : k === "expirados" ? "Não retirados" : "Todos"}
          </button>
        ))}

        <div className="flex-1" />
        <div style={{ position: "relative", minWidth: 240 }}>
          <Search size={16} style={{ position: "absolute", top: 14, left: 14, color: CYAN }} />
          <input style={{ ...pillInput, paddingLeft: 40 }} placeholder="Buscar ganhador/prêmio..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={{ color: "#64748B", fontSize: 13, textAlign: "center", padding: 32 }}>Nenhum sorteio {filter !== "todos" ? filter : ""}.</p>
      ) : (
        <div className="grid gap-3">
          {rows.map(s => {
            const premio = premioMap[s.premio_id];
            return (
              <div key={s.id} className="flex items-center gap-4" style={{ background: "#fff", borderRadius: 16, padding: 14, border: `1px solid ${CYAN}33` }}>
                {premio?.imagem_url ? (
                  <img src={premio.imagem_url} alt="" style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: 12, background: CARD_BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Gift size={20} color={CYAN} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div style={{ fontWeight: 700, color: DARK, fontSize: 14 }}>{s.nome_ganhador}</div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>
                    {premio?.nome || "—"} · {new Date(s.data_sorteio).toLocaleString("pt-BR")}
                    {s.telefone_ganhador && ` · ${s.telefone_ganhador}`}
                  </div>
                  {s.observacoes && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{s.observacoes}</div>}
                </div>
                {s.entregue ? (
                  <div className="flex flex-col items-end gap-1">
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: LIME, color: DARK, borderRadius: 999, padding: "6px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>
                      <Check size={14} /> Entregue
                    </div>
                    {s.data_entrega && <div style={{ fontSize: 10, color: "#64748B" }}>{new Date(s.data_entrega).toLocaleString("pt-BR")}</div>}
                    <button style={{ ...ghostBtn, height: 30, padding: "0 10px", fontSize: 10 }} onClick={() => marcarEntregue(s, false)}>Reverter</button>
                  </div>
                ) : s.expirado ? (
                  <div className="flex flex-col items-end gap-1">
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#FEE2E2", color: "#991B1B", borderRadius: 999, padding: "6px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>
                      <AlertTriangle size={14} /> Não retirado
                    </div>
                    {s.data_expiracao && <div style={{ fontSize: 10, color: "#64748B" }}>Expirou em {new Date(s.data_expiracao).toLocaleString("pt-BR")}</div>}
                  </div>
                ) : (
                  <button style={limeBtn} onClick={() => marcarEntregue(s, true)}>
                    <Truck size={16} /> Marcar Entregue
                  </button>
                )}

                <button style={{ ...ghostBtn, height: 36, padding: "0 10px", borderColor: "#ef4444", color: "#ef4444" }} onClick={() => excluir(s.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
