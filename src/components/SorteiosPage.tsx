import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Save, X, Search, Gift, Package, Dice5, Truck, Plus, Shuffle, Check, Radio, Clock, AlertTriangle, History } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { useToast } from "@/hooks/use-toast";
import { findCurrentProgram } from "./OnAirWidget";
import { confirmDialog } from "@/lib/confirmDialog";


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

interface ProgramaLite {
  id: string;
  nome: string;
  apresentadorId?: string;
  selo?: string;
  diasSemana?: string[];
  horarioInicio?: string;
  horarioFim?: string;
  estudio?: string;
  classificacaoEtaria?: string;
}

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
  const [apresentadores, setApresentadores] = useState<Array<{ id: string; nome: string }>>([]);

  const refreshPremios = async () => {
    const { data, error } = await supabase.from("sorteio_premios").select("*").order("created_at", { ascending: false });
    if (!error) setPremios((data as any) || []);
  };

  const load = async () => {
    setLoading(true);
    // Expire overdue drawings before fetching
    if (user?.id) {
      await supabase.rpc("expire_overdue_sorteios", { _user_id: user.id });
    }
    const [p, s, o, pr, ap] = await Promise.all([
      supabase.from("sorteio_premios").select("*").order("created_at", { ascending: false }),
      supabase.from("sorteio_sorteios").select("*").order("data_sorteio", { ascending: false }),
      supabase.from("ouvintes").select("id, nome, telefone, cidade, pontuacao").order("pontuacao", { ascending: false }),
      supabase.from("programas").select("*").ilike("estudio", "%fm%").order("nome"),
      supabase.from("apresentadores").select("id, nome"),
    ]);
    if (p.error) toast({ title: "Erro ao carregar prêmios", description: p.error.message, variant: "destructive" });
    else setPremios((p.data as any) || []);
    if (s.error) toast({ title: "Erro ao carregar sorteios", description: s.error.message, variant: "destructive" });
    else setSorteios((s.data as any) || []);
    if (!o.error) setOuvintes((o.data as any) || []);
    if (!pr.error) setProgramas(((pr.data as any) || []).map((x: any) => ({
      id: x.id,
      nome: x.nome,
      apresentadorId: x.apresentador_id || "",
      selo: x.selo || "",
      diasSemana: x.dias_semana || [],
      horarioInicio: x.horario_inicio,
      horarioFim: x.horario_fim,
      estudio: x.estudio || "",
      classificacaoEtaria: x.classificacao_etaria || "",
    })));
    if (!ap.error) setApresentadores((ap.data as any) || []);
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

      {tab === "premios" && <PremiosTab premios={premios} userId={user?.id} onReload={load} />}
      {tab === "lista" && <ListaPremiosTab premios={premios} programas={programas} userId={user?.id} onStockChanged={refreshPremios} />}
      {tab === "sorteio" && <SorteioTab premios={premios} ouvintes={ouvintes} sorteios={sorteios} programas={programas} apresentadores={apresentadores} userId={user?.id} onReload={load} onGoTo={setTab} />}
      {tab === "entrega" && <EntregaTab sorteios={sorteios} premios={premios} onReload={load} />}
    </div>
  );
}


/* ═════════════════════ PRÊMIOS ═════════════════════ */
function PremiosTab({ premios, userId, onReload }: { premios: Premio[]; userId?: string; onReload: () => void }) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", descricao: "", imagem_url: "", quantidade_estoque: "1", dias_validade: "7" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const reset = () => { setForm({ nome: "", descricao: "", imagem_url: "", quantidade_estoque: "1", dias_validade: "7" }); setEditingId(null); };


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
    if (!(await confirmDialog("Excluir este prêmio?"))) return;
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

/* ═════════════════════ LISTA DE PRÊMIOS (drag & drop) ═════════════════════ */
interface PremioPrograma { id: string; premio_id: string; programa_id: string; quantidade: number; }

function ListaPremiosTab({ premios, programas, userId, onStockChanged }: { premios: Premio[]; programas: ProgramaLite[]; userId?: string; onStockChanged?: () => void }) {
  const { toast } = useToast();
  const [links, setLinks] = useState<PremioPrograma[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ premio: Premio; programa: ProgramaLite; existing?: PremioPrograma } | null>(null);
  const [qtyInput, setQtyInput] = useState("1");
  const [editingPrograma, setEditingPrograma] = useState<ProgramaLite | null>(null);
  const [savingQty, setSavingQty] = useState(false);

  const premioMap = useMemo(() => Object.fromEntries(premios.map(p => [p.id, p])), [premios]);

  // On-air detection + ordering (on-air first). Refresh every 60s.
  const [onAirId, setOnAirId] = useState<string | null>(null);
  useEffect(() => {
    const compute = () => {
      try {
        const cur = findCurrentProgram(programas.map(p => ({
          id: p.id,
          nome: p.nome,
          apresentadorId: p.apresentadorId || "",
          selo: p.selo || "",
          diasSemana: p.diasSemana || [],
          horarioInicio: p.horarioInicio,
          horarioFim: p.horarioFim,
          estudio: p.estudio || "",
          classificacaoEtaria: p.classificacaoEtaria || "",
        }) as any));
        setOnAirId(cur?.programa?.id || null);
      } catch { setOnAirId(null); }
    };
    compute();
    const i = setInterval(compute, 60000);
    return () => clearInterval(i);
  }, [programas]);

  const WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
  const WEEKEND = ["Sábado", "Domingo"];
  const isWeekend = (p: ProgramaLite) => {
    const d = p.diasSemana || [];
    return d.some(x => WEEKEND.includes(x)) && !d.some(x => WEEKDAYS.includes(x));
  };
  const groupedProgramas = useMemo(() => {
    const byTime = (a: ProgramaLite, b: ProgramaLite) => (a.horarioInicio || "").localeCompare(b.horarioInicio || "");
    const semana = programas.filter(p => !isWeekend(p)).sort(byTime);
    const fds = programas.filter(p => isWeekend(p)).sort(byTime);
    return { semana, fds };
  }, [programas]);

  const onAirRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!onAirId) return;
    const t = setTimeout(() => {
      const el = onAirRef.current;
      const container = scrollContainerRef.current;
      if (el && container) {
        container.scrollTo({ top: Math.max(0, el.offsetTop - container.offsetTop - 4), behavior: "smooth" });
      }
    }, 120);
    return () => clearTimeout(t);
  }, [onAirId, programas.length]);

  const loadLinks = async () => {
    if (!userId) return;
    setLoadingLinks(true);
    const { data, error } = await supabase.from("sorteio_premio_programas").select("*").eq("user_id", userId);
    if (!error) setLinks((data as any) || []);
    setLoadingLinks(false);
  };
  useEffect(() => { loadLinks(); }, [userId]);

  const linksByPrograma = useMemo(() => {
    const m = new Map<string, PremioPrograma[]>();
    for (const l of links) {
      if (!m.has(l.programa_id)) m.set(l.programa_id, []);
      m.get(l.programa_id)!.push(l);
    }
    return m;
  }, [links]);

  const onDropPremio = (programa: ProgramaLite, e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const premioId = e.dataTransfer.getData("text/premio-id");
    const premio = premios.find(p => p.id === premioId);
    if (!premio) return;
    const existing = links.find(l => l.premio_id === premio.id && l.programa_id === programa.id);
    setPendingDrop({ premio, programa, existing });
    setQtyInput(String(existing?.quantidade ?? 1));
  };

  const confirmQty = async () => {
    if (!pendingDrop || !userId) return;
    const qty = Math.max(1, parseInt(qtyInput || "1", 10) || 1);
    const { premio, programa, existing } = pendingDrop;
    const prevQty = existing?.quantidade ?? 0;
    const delta = qty - prevQty; // >0 debita, <0 devolve
    setSavingQty(true);
    // Ler estoque atual do banco para evitar estado obsoleto
    const { data: fresh, error: eRead } = await supabase
      .from("sorteio_premios")
      .select("quantidade_estoque")
      .eq("id", premio.id)
      .maybeSingle();
    if (eRead) { setSavingQty(false); toast({ title: "Erro ao ler estoque", description: eRead.message, variant: "destructive" }); return; }
    const estoqueAtual = fresh?.quantidade_estoque ?? 0;
    if (delta > 0 && estoqueAtual < delta) {
      setSavingQty(false);
      toast({ title: "Estoque insuficiente", description: `Disponível: ${estoqueAtual}. Necessário: ${delta}.`, variant: "destructive" });
      return;
    }
    const q = existing
      ? supabase.from("sorteio_premio_programas").update({ quantidade: qty }).eq("id", existing.id)
      : supabase.from("sorteio_premio_programas").insert({ user_id: userId, premio_id: premio.id, programa_id: programa.id, quantidade: qty });
    const { error } = await q;
    if (error) { setSavingQty(false); toast({ title: "Erro ao vincular", description: error.message, variant: "destructive" }); return; }
    if (delta !== 0) {
      const novoEstoque = Math.max(0, estoqueAtual - delta);
      const { error: eStock } = await supabase.from("sorteio_premios").update({ quantidade_estoque: novoEstoque }).eq("id", premio.id);
      if (eStock) { setSavingQty(false); toast({ title: "Erro no estoque", description: eStock.message, variant: "destructive" }); return; }
    }
    setSavingQty(false);
    toast({ title: existing ? "Quantidade atualizada" : "Prêmio vinculado ao programa", description: delta > 0 ? `Baixa de ${delta} unidade(s) no estoque` : delta < 0 ? `Devolvido ${Math.abs(delta)} ao estoque` : undefined });
    setPendingDrop(null);
    loadLinks();
    onStockChanged?.();
  };

  const removeLink = async (linkId: string) => {
    const link = links.find(l => l.id === linkId);
    const { error } = await supabase.from("sorteio_premio_programas").delete().eq("id", linkId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    if (link) {
      const premio = premios.find(p => p.id === link.premio_id);
      if (premio) {
        await supabase.from("sorteio_premios").update({ quantidade_estoque: (premio.quantidade_estoque ?? 0) + link.quantidade }).eq("id", premio.id);
      }
    }
    toast({ title: "Prêmio removido", description: link ? `Devolvido ${link.quantidade} ao estoque` : undefined });
    loadLinks();
    onStockChanged?.();
  };

  const clearPrograma = async (programa: ProgramaLite) => {
    if (!userId) return;
    if (!(await confirmDialog(`Limpar todos os prêmios de "${programa.nome}"? As quantidades voltarão ao estoque.`))) return;
    const toReturn = links.filter(l => l.programa_id === programa.id);
    const { error } = await supabase.from("sorteio_premio_programas").delete().eq("user_id", userId).eq("programa_id", programa.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    // devolve estoque agregando por prêmio
    const agg = new Map<string, number>();
    for (const l of toReturn) agg.set(l.premio_id, (agg.get(l.premio_id) || 0) + l.quantidade);
    for (const [premioId, qty] of agg) {
      const premio = premios.find(p => p.id === premioId);
      if (premio) await supabase.from("sorteio_premios").update({ quantidade_estoque: (premio.quantidade_estoque ?? 0) + qty }).eq("id", premioId);
    }
    toast({ title: "Lista limpa", description: toReturn.length ? "Quantidades devolvidas ao estoque" : undefined });
    loadLinks();
    onStockChanged?.();
  };

  const updateQty = async (linkId: string, qty: number) => {
    const newQty = Math.max(1, qty);
    const link = links.find(l => l.id === linkId);
    if (!link) return;
    const delta = newQty - link.quantidade;
    const premio = premios.find(p => p.id === link.premio_id);
    if (delta > 0 && premio && (premio.quantidade_estoque ?? 0) < delta) {
      toast({ title: "Estoque insuficiente", description: `Disponível: ${premio.quantidade_estoque}.`, variant: "destructive" });
      loadLinks();
      return;
    }
    const { error } = await supabase.from("sorteio_premio_programas").update({ quantidade: newQty }).eq("id", linkId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    if (delta !== 0 && premio) {
      await supabase.from("sorteio_premios").update({ quantidade_estoque: Math.max(0, (premio.quantidade_estoque ?? 0) - delta) }).eq("id", premio.id);
    }
    loadLinks();
    onStockChanged?.();
  };

  return (
    <>
      <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* LEFT — Programas (drop targets) */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: DARK, marginBottom: 4 }}>
            Programas
          </h2>
          <p style={{ fontSize: 11, color: "#64748B", marginBottom: 16 }}>
            Arraste um prêmio para dentro do programa. Use o scroll do mouse para navegar.
          </p>
          {programas.length === 0 ? (
            <p style={{ color: "#64748B", fontSize: 13 }}>Nenhum programa cadastrado.</p>
          ) : (
            <div
              ref={scrollContainerRef}
              className="grid gap-3"
              style={{
                maxHeight: 3 * 132 + 2 * 12, // ~3 boxes + gaps
                overflowY: "auto",
                paddingRight: 6,
              }}
            >
              {(() => {
                const renderCard = (pg: ProgramaLite) => {
                  const items = linksByPrograma.get(pg.id) || [];
                  const active = dropTarget === pg.id;
                  const isOnAir = pg.id === onAirId;
                  const horario = (pg.horarioInicio && pg.horarioFim) ? `${pg.horarioInicio}–${pg.horarioFim}` : "";
                  return (
                    <div
                      key={pg.id}
                      ref={isOnAir ? onAirRef : undefined}
                      onDragOver={e => { e.preventDefault(); setDropTarget(pg.id); }}
                      onDragLeave={() => setDropTarget(t => (t === pg.id ? null : t))}
                      onDrop={e => onDropPremio(pg, e)}
                      style={{
                        background: "#fff",
                        borderRadius: 16,
                        padding: 12,
                        border: active ? `2px dashed ${LIME}` : isOnAir ? `2px solid ${LIME}` : `1px solid ${CYAN}33`,
                        boxShadow: active ? `0 0 0 4px ${LIME}55` : isOnAir ? `0 0 0 3px ${LIME}44` : "none",
                        transition: "all .15s",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Radio size={13} color={isOnAir ? LIME : CYAN} />
                        <div style={{ fontWeight: 800, color: DARK, fontSize: 13, flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pg.nome}</span>
                          {horario && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#64748B", background: `${CYAN}14`, borderRadius: 999, padding: "2px 8px" }}>
                              {horario}
                            </span>
                          )}
                        </div>
                        {isOnAir && (
                          <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase", background: LIME, color: DARK, borderRadius: 999, padding: "2px 8px" }}>
                            No ar
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: "#64748B", fontWeight: 700 }}>{items.length} prêmio(s)</span>
                      </div>
                      {items.length === 0 ? (
                        <div style={{ fontSize: 11, color: "#94a3b8", padding: "18px 0", textAlign: "center", fontStyle: "italic" }}>
                          Solte um prêmio aqui
                        </div>
                      ) : (
                        <div className="grid gap-2">
                          {items.map(l => {
                            const pr = premioMap[l.premio_id];
                            if (!pr) return null;
                            return (
                              <div key={l.id} className="flex items-center gap-2" style={{ background: CARD_BG, borderRadius: 12, padding: "8px 10px" }}>
                                {pr.imagem_url ? (
                                  <img src={pr.imagem_url} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
                                ) : (
                                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <Gift size={14} color={CYAN} />
                                  </div>
                                )}
                                <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.nome}</div>
                                <div style={{ background: LIME, color: DARK, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 800 }}>×{l.quantidade}</div>
                                <button
                                  title="Editar quantidade"
                                  style={{ ...ghostBtn, height: 26, padding: "0 8px", fontSize: 10 }}
                                  onClick={() => {
                                    const raw = window.prompt(`Nova quantidade para "${pr.nome}":`, String(l.quantidade));
                                    if (raw == null) return;
                                    const n = parseInt(raw, 10);
                                    if (!Number.isFinite(n) || n < 1) { toast({ title: "Quantidade inválida", variant: "destructive" }); return; }
                                    updateQty(l.id, n);
                                  }}
                                >
                                  <Pencil size={11} /> Editar
                                </button>
                                <button
                                  title="Remover prêmio"
                                  style={{ ...ghostBtn, height: 26, padding: "0 8px", fontSize: 10, borderColor: "#ef4444", color: "#ef4444" }}
                                  onClick={async () => {
                                    if (!(await confirmDialog(`Remover "${pr.nome}" deste programa? A quantidade voltará ao estoque.`))) return;
                                    removeLink(l.id);
                                  }}
                                >
                                  <Trash2 size={11} /> Limpar
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                };
                const sectionHeader = (label: string) => (
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase", color: "#64748B", padding: "4px 2px", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
                    {label}
                  </div>
                );
                return (
                  <>
                    {groupedProgramas.semana.length > 0 && (
                      <>
                        {sectionHeader("Segunda a Sexta")}
                        {groupedProgramas.semana.map(renderCard)}
                      </>
                    )}
                    {groupedProgramas.fds.length > 0 && (
                      <>
                        {sectionHeader("Fim de Semana")}
                        {groupedProgramas.fds.map(renderCard)}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>


        {/* RIGHT — Prêmios (drag sources) */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: DARK, marginBottom: 4 }}>
            Prêmios cadastrados
          </h2>
          <p style={{ fontSize: 11, color: "#64748B", marginBottom: 16 }}>Arraste um item para o programa desejado.</p>
          {premios.length === 0 ? (
            <p style={{ color: "#64748B", fontSize: 13 }}>Nenhum prêmio cadastrado.</p>
          ) : (
            <div className="grid gap-2">
              {premios.map(p => {
                const semEstoque = (p.quantidade_estoque ?? 0) <= 0;
                return (
                <div
                  key={p.id}
                  draggable={!semEstoque}
                  onDragStart={e => {
                    if (semEstoque) { e.preventDefault(); return; }
                    e.dataTransfer.setData("text/premio-id", p.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="flex items-center gap-3"
                  style={{ background: "#fff", borderRadius: 14, padding: 10, border: `1px solid ${CYAN}33`, cursor: semEstoque ? "not-allowed" : "grab", position: "relative", overflow: "hidden", opacity: semEstoque ? 0.55 : 1 }}
                >
                  {p.imagem_url ? (
                    <img src={p.imagem_url} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: CARD_BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Gift size={18} color={CYAN} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div style={{ fontWeight: 700, color: DARK, fontSize: 13 }}>{p.nome}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>Estoque: {p.quantidade_estoque} · Validade: {p.dias_validade ?? 7}d</div>
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>arraste</div>
                  {semEstoque && (
                    <div style={{ position: "absolute", inset: 0, background: "rgba(239,68,68,0.92)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", borderRadius: 14 }}>
                      Sem estoque no momento
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
          {loadingLinks && <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 12 }}>Carregando vínculos…</p>}
        </div>
      </div>

      {/* Popup — pergunta quantidade */}
      {pendingDrop && (
        <div
          onClick={() => setPendingDrop(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(10,37,64,0.55)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 24, padding: 28, width: "100%", maxWidth: 420, fontFamily: FONT }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, fontWeight: 800, color: CYAN, marginBottom: 6 }}>
              {pendingDrop.existing ? "Atualizar quantidade" : "Vincular prêmio"}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: DARK }}>{pendingDrop.premio.nome}</div>
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 18 }}>Programa: <b>{pendingDrop.programa.nome}</b></div>
            <label style={labelStyle}>Qual a quantidade disponibilizada para esse programa?</label>
            <input
              type="number"
              min={1}
              autoFocus
              style={{ ...pillInput, textAlign: "center", fontSize: 18, fontWeight: 800 }}
              value={qtyInput}
              onChange={e => setQtyInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && confirmQty()}
            />
            <div className="flex gap-2 mt-5 justify-end">
              <button style={ghostBtn} onClick={() => setPendingDrop(null)}><X size={14} /> Cancelar</button>
              <button style={limeBtn} onClick={confirmQty} disabled={savingQty}>
                {savingQty ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup — editar lista de prêmios do programa */}
      {editingPrograma && (
        <div
          onClick={() => setEditingPrograma(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(10,37,64,0.55)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 24, padding: 28, width: "100%", maxWidth: 520, fontFamily: FONT, maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, fontWeight: 800, color: CYAN, marginBottom: 6 }}>Editar lista</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: DARK, marginBottom: 16 }}>{editingPrograma.nome}</div>
            <div className="grid gap-2">
              {(linksByPrograma.get(editingPrograma.id) || []).map(l => {
                const pr = premioMap[l.premio_id];
                if (!pr) return null;
                return (
                  <div key={l.id} className="flex items-center gap-2" style={{ background: CARD_BG, borderRadius: 12, padding: 10 }}>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: DARK }}>{pr.nome}</div>
                    <input
                      type="number"
                      min={1}
                      defaultValue={l.quantidade}
                      onBlur={e => {
                        const v = parseInt(e.target.value, 10);
                        if (v && v !== l.quantidade) updateQty(l.id, v);
                      }}
                      style={{ ...pillInput, height: 36, width: 80, textAlign: "center", fontSize: 12 }}
                    />
                    <button
                      style={{ ...ghostBtn, height: 36, padding: "0 10px", borderColor: "#ef4444", color: "#ef4444" }}
                      onClick={() => removeLink(l.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
              {(linksByPrograma.get(editingPrograma.id) || []).length === 0 && (
                <p style={{ fontSize: 12, color: "#94a3b8" }}>Sem prêmios neste programa.</p>
              )}
            </div>
            <div className="flex justify-end mt-5">
              <button style={primaryBtn} onClick={() => setEditingPrograma(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


/* ═════════════════════ SORTEIO ═════════════════════ */

function SorteioTab({ premios, ouvintes, sorteios, programas, apresentadores, userId, onReload, onGoTo }: {
  premios: Premio[]; ouvintes: Ouvinte[]; sorteios: Sorteio[]; programas: ProgramaLite[]; apresentadores: Array<{ id: string; nome: string }>; userId?: string; onReload: () => void; onGoTo: (t: Tab) => void;
}) {
  const { toast } = useToast();
  const [premioId, setPremioId] = useState<string>("");
  const [ganhador, setGanhador] = useState<Ouvinte | null>(null);
  const [manual, setManual] = useState({ nome: "", telefone: "" });
  const [saving, setSaving] = useState(false);
  const [obs, setObs] = useState("");
  const [now, setNow] = useState<Date>(new Date());
  const [programaNoAr, setProgramaNoAr] = useState<ProgramaLite | null>(null);
  const [links, setLinks] = useState<Array<{ id: string; premio_id: string; programa_id: string; quantidade: number }>>([]);

  const premioSelecionado = premios.find(p => p.id === premioId);
  const premioMap = useMemo(() => Object.fromEntries(premios.map(p => [p.id, p])), [premios]);
  const apresentadorMap = useMemo(() => Object.fromEntries(apresentadores.map(a => [a.id, a.nome])), [apresentadores]);
  const programaMap = useMemo(() => Object.fromEntries(programas.map(p => [p.id, p])), [programas]);

  const apresentadorNoAr = programaNoAr?.apresentadorId ? (apresentadorMap[programaNoAr.apresentadorId] || "") : "";

  // Relógio ao vivo
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Programa no ar (Estúdio FM)
  useEffect(() => {
    const compute = () => {
      try {
        const cur = findCurrentProgram(programas.map(p => ({
          id: p.id,
          nome: p.nome,
          apresentadorId: p.apresentadorId || "",
          selo: p.selo || "",
          diasSemana: p.diasSemana || [],
          horarioInicio: p.horarioInicio,
          horarioFim: p.horarioFim,
          estudio: p.estudio || "",
          classificacaoEtaria: p.classificacaoEtaria || "",
        }) as any));
        setProgramaNoAr(cur ? programas.find(p => p.id === cur.programa.id) || null : null);
      } catch { setProgramaNoAr(null); }
    };
    compute();
    const i = setInterval(compute, 60000);
    return () => clearInterval(i);
  }, [programas]);

  // Carrega prêmios vinculados ao programa
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase.from("sorteio_premio_programas").select("*").eq("user_id", userId);
      setLinks((data as any) || []);
    })();
  }, [userId, programaNoAr?.id]);

  const premiosDoPrograma = useMemo(() => {
    if (!programaNoAr) return [];
    return links
      .filter(l => l.programa_id === programaNoAr.id)
      .map(l => ({ link: l, premio: premioMap[l.premio_id] as Premio | undefined }))
      .filter(x => x.premio && x.premio.ativo);
  }, [links, programaNoAr, premioMap]);

  // Se prêmio selecionado deixa de fazer parte da lista do programa, limpa seleção
  useEffect(() => {
    if (premioId && !premiosDoPrograma.some(x => x.premio!.id === premioId)) setPremioId("");
  }, [premioId, premiosDoPrograma]);

  const pool = useMemo(() => {
    return [...ouvintes].sort((a, b) => (b.pontuacao ?? 0) - (a.pontuacao ?? 0));
  }, [ouvintes]);

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
      programa_id: programaNoAr?.id || null,
      programa_nome: programaNoAr?.nome || null,
      apresentador_nome: apresentadorNoAr || null,
    } as any);
    setSaving(false);
    if (error) { toast({ title: "Erro ao registrar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Sorteio registrado", description: "Acompanhe a entrega na aba Entregas." });
    setGanhador(null); setManual({ nome: "", telefone: "" }); setObs("");
    onReload();
  };

  // Relatório dos últimos 6 meses
  const relatorio = useMemo(() => {
    const seisMesesMs = 1000 * 60 * 60 * 24 * 30 * 6;
    const cutoff = Date.now() - seisMesesMs;
    return sorteios
      .filter(s => new Date(s.data_sorteio).getTime() >= cutoff)
      .sort((a, b) => new Date(b.data_sorteio).getTime() - new Date(a.data_sorteio).getTime());
  }, [sorteios]);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const getProgramaNome = (s: any): string => {
    if (s.programa_nome) return s.programa_nome;
    if (s.programa_id && programaMap[s.programa_id]) return programaMap[s.programa_id].nome;
    const m = /Programa no ar:\s*([^(·\n]+)/.exec(s.observacoes || "");
    return m ? m[1].trim() : "—";
  };
  const getLocutorNome = (s: any): string => {
    if (s.apresentador_nome) return s.apresentador_nome;
    if (s.programa_id && programaMap[s.programa_id]?.apresentadorId) {
      return apresentadorMap[programaMap[s.programa_id].apresentadorId!] || "—";
    }
    return "—";
  };

  return (
    <div className="grid gap-6">
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
                  {apresentadorNoAr && <span style={{ color: "#64748B" }}> · Locutor: <b style={{ color: DARK }}>{apresentadorNoAr}</b></span>}
                </div>
              ) : (
                <span style={{ fontSize: 12, color: "#64748B" }}>Nenhum programa no ar</span>
              )}
            </div>
          </div>

          {/* Lista de prêmios vinculados ao programa */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Prêmios do programa no ar</label>
            {!programaNoAr ? (
              <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: `1px dashed ${CYAN}55`, textAlign: "center", fontSize: 12, color: "#64748B" }}>
                Nenhum programa no ar no momento.
              </div>
            ) : premiosDoPrograma.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: `1px dashed ${CYAN}55`, textAlign: "center", fontSize: 12, color: "#64748B" }}>
                Nenhum prêmio vinculado a <b style={{ color: DARK }}>{programaNoAr.nome}</b>. Vá em <b>Lista de Prêmios</b> para vincular.
              </div>
            ) : (
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                {premiosDoPrograma.map(({ premio, link }) => {
                  const sel = premioId === premio!.id;
                  return (
                    <button
                      key={link.id}
                      onClick={() => setPremioId(premio!.id)}
                      style={{
                        background: sel ? LIME : "#fff",
                        borderRadius: 16,
                        padding: 12,
                        border: `2px solid ${sel ? DARK : CYAN}55`,
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: FONT,
                        transition: "all 0.15s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        {premio!.imagem_url && (
                          <img src={premio!.imagem_url} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
                        )}
                        <div style={{ fontSize: 12, fontWeight: 800, color: DARK, lineHeight: 1.2 }}>{premio!.nome}</div>
                      </div>
                      <div style={{ fontSize: 10, color: DARK, opacity: 0.7 }}>
                        Reservado: <b>{link.quantidade}</b> · Estoque: <b>{premio!.quantidade_estoque}</b>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pool com tabela */}
          <div style={{ background: "#fff", borderRadius: 16, padding: 12, border: `1px solid ${CYAN}33` }}>
            <div className="flex items-center justify-between mb-2">
              <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Pool de participantes</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: DARK }}>{pool.length}</div>
            </div>
            {pool.length === 0 ? (
              <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: 12 }}>Sem participantes</p>
            ) : (
              <div style={{ maxHeight: 220, overflowY: "auto", borderRadius: 12 }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: CARD_BG }}>
                    <tr>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: DARK }}>#</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: DARK }}>Nome</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: DARK }}>Pontos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pool.map((o, idx) => (
                      <tr key={o.id} style={{ borderTop: `1px solid ${CYAN}22` }}>
                        <td style={{ padding: "6px 10px", color: "#64748B" }}>{idx + 1}</td>
                        <td style={{ padding: "6px 10px", color: DARK, fontWeight: 600 }}>{o.nome}</td>
                        <td style={{ padding: "6px 10px", color: DARK, fontWeight: 800, textAlign: "right" }}>{o.pontuacao ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <button style={{ ...limeBtn, marginTop: 16 }} onClick={sortear} disabled={!premioId || pool.length === 0}>
            <Shuffle size={16} /> Sortear Ganhador
          </button>
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
                <div style={{ fontSize: 12, color: DARK, marginTop: 6 }}><b>Pontos:</b> {ganhador.pontuacao ?? 0}</div>
              </div>
              {premioSelecionado && (
                <div style={{ background: "#fff", borderRadius: 16, padding: 12, fontSize: 13, color: DARK }}>
                  <b>Prêmio:</b> {premioSelecionado.nome}
                </div>
              )}

              {jaGanhouEstePremio && (
                <div style={{ background: "#FEF3C7", border: "2px solid #F59E0B", borderRadius: 16, padding: 12, color: "#92400E", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertTriangle size={16} />
                  <span><b>Atenção:</b> este ouvinte já ganhou o prêmio <b>{premioSelecionado?.nome}</b> anteriormente.</span>
                </div>
              )}

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

      {/* Relatório: últimos 6 meses */}
      <div style={cardStyle}>
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: DARK, margin: 0 }}>
            Sorteios realizados
          </h2>
          <span style={{ fontSize: 11, color: "#64748B", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
            Últimos 6 meses · {relatorio.length}
          </span>
        </div>
        <div style={{ background: "#fff", borderRadius: 16, border: `1px solid ${CYAN}33`, overflow: "hidden" }}>
          {relatorio.length === 0 ? (
            <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: 24 }}>Nenhum sorteio nos últimos 6 meses.</p>
          ) : (
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: CARD_BG, zIndex: 1 }}>
                  <tr>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: DARK }}>Data</th>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: DARK }}>Horário</th>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: DARK }}>Programa</th>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: DARK }}>Locutor</th>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: DARK }}>Prêmio</th>
                    <th style={{ textAlign: "center", padding: "10px 12px", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: DARK }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.map((s: any) => {
                    const isEntregue = !!s.entregue;
                    const isExpirado = !!s.expirado;
                    return (
                      <tr key={s.id} style={{ borderTop: `1px solid ${CYAN}22` }}>
                        <td style={{ padding: "8px 12px", color: DARK, fontWeight: 600 }}>{fmtDate(s.data_sorteio)}</td>
                        <td style={{ padding: "8px 12px", color: "#64748B" }}>{fmtTime(s.data_sorteio)}</td>
                        <td style={{ padding: "8px 12px", color: DARK }}>{getProgramaNome(s)}</td>
                        <td style={{ padding: "8px 12px", color: DARK }}>{getLocutorNome(s)}</td>
                        <td style={{ padding: "8px 12px", color: DARK, fontWeight: 600 }}>{premioMap[s.premio_id]?.nome || "—"}</td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          {isEntregue ? (
                            <span style={{ background: LIME, color: DARK, borderRadius: 999, padding: "3px 10px", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <Check size={11} /> Entregue
                            </span>
                          ) : isExpirado ? (
                            <span style={{ background: "#FECACA", color: "#991B1B", borderRadius: 999, padding: "3px 10px", fontSize: 10, fontWeight: 800 }}>Expirado</span>
                          ) : (
                            <span style={{ background: "#FEF3C7", color: "#92400E", borderRadius: 999, padding: "3px 10px", fontSize: 10, fontWeight: 800 }}>Pendente</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
    if (!(await confirmDialog("Excluir este registro de sorteio?"))) return;
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

      <RelatorioEntregas sorteios={sorteios} premios={premios} />
    </div>
  );
}

function RelatorioEntregas({ sorteios, premios }: { sorteios: Sorteio[]; premios: Premio[] }) {
  const premioMap = useMemo(() => Object.fromEntries(premios.map(p => [p.id, p])), [premios]);

  const stats = useMemo(() => {
    const now = Date.now();
    const DAY = 86400000;
    const entregues = sorteios.filter(s => s.entregue && s.data_entrega);
    const total = entregues.length;
    const totalSorteios = sorteios.length;
    const expirados = sorteios.filter(s => s.expirado).length;
    const pendentes = sorteios.filter(s => !s.entregue && !s.expirado).length;

    const inWindow = (s: Sorteio, days: number) =>
      s.data_entrega && (now - new Date(s.data_entrega).getTime()) <= days * DAY;

    const hoje = entregues.filter(s => {
      if (!s.data_entrega) return false;
      const d = new Date(s.data_entrega);
      const n = new Date();
      return d.toDateString() === n.toDateString();
    }).length;
    const semana = entregues.filter(s => inWindow(s, 7)).length;
    const mes = entregues.filter(s => inWindow(s, 30)).length;

    const taxa = totalSorteios > 0 ? Math.round((total / totalSorteios) * 100) : 0;

    // Ranking prêmios mais entregues
    const rank = new Map<string, number>();
    entregues.forEach(s => rank.set(s.premio_id, (rank.get(s.premio_id) || 0) + 1));
    const ranking = Array.from(rank.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ premio: premioMap[id], count }));

    // Tempo médio de retirada (data_sorteio -> data_entrega) em horas
    const tempos = entregues
      .map(s => {
        if (!s.data_entrega) return null;
        return (new Date(s.data_entrega).getTime() - new Date(s.data_sorteio).getTime()) / 3600000;
      })
      .filter((v): v is number => v !== null && v >= 0);
    const tempoMedioH = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0;

    return { total, totalSorteios, expirados, pendentes, hoje, semana, mes, taxa, ranking, tempoMedioH };
  }, [sorteios, premioMap]);

  const kpi = (label: string, value: string | number, color: string, sub?: string) => (
    <div style={{ background: "#fff", borderRadius: 14, padding: 14, border: `1px solid ${CYAN}22` }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 4, fontFamily: "'Sora', system-ui, sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ marginTop: 24, background: CARD_BG, borderRadius: 18, padding: 20, border: `1px solid ${CYAN}22` }}>
      <div className="flex items-center gap-2 mb-4">
        <div style={{ width: 32, height: 32, borderRadius: 10, background: LIME, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Check size={18} color={DARK} strokeWidth={2.6} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: DARK, fontFamily: "'Sora', system-ui, sans-serif" }}>Relatório de Entregas</div>
          <div style={{ fontSize: 11, color: "#64748B" }}>Prêmios efetivamente entregues aos ganhadores</div>
        </div>
      </div>

      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {kpi("Total entregues", stats.total, DARK, `${stats.taxa}% dos ${stats.totalSorteios} sorteios`)}
        {kpi("Entregues hoje", stats.hoje, CYAN)}
        {kpi("Últimos 7 dias", stats.semana, CYAN)}
        {kpi("Últimos 30 dias", stats.mes, CYAN)}
        {kpi("Tempo médio de retirada", stats.tempoMedioH > 48 ? `${Math.round(stats.tempoMedioH / 24)}d` : `${stats.tempoMedioH}h`, DARK)}
        {kpi("Não retirados", stats.expirados, "#ef4444")}
      </div>

      <div style={{ background: "#fff", borderRadius: 14, padding: 16, border: `1px solid ${CYAN}22` }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: DARK, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Top prêmios entregues</div>
        {stats.ranking.length === 0 ? (
          <div style={{ fontSize: 12, color: "#94a3b8", padding: 12, textAlign: "center" }}>Nenhum prêmio entregue ainda.</div>
        ) : (
          <div className="grid gap-2">
            {stats.ranking.map((r, i) => {
              const max = stats.ranking[0].count;
              const pct = Math.round((r.count / max) * 100);
              return (
                <div key={r.premio?.id || i} className="flex items-center gap-3">
                  <div style={{ width: 22, height: 22, borderRadius: 999, background: i === 0 ? LIME : `${CYAN}22`, color: DARK, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>
                    {i + 1}
                  </div>
                  {r.premio?.imagem_url ? (
                    <img src={r.premio.imagem_url} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: CARD_BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Gift size={14} color={CYAN} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 12, fontWeight: 700, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.premio?.nome || "Prêmio removido"}
                    </div>
                    <div style={{ height: 6, background: `${CYAN}15`, borderRadius: 999, overflow: "hidden", marginTop: 4 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${CYAN}, ${LIME})`, borderRadius: 999 }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: DARK, fontFamily: "'Sora', system-ui, sans-serif", minWidth: 32, textAlign: "right" }}>
                    {r.count}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
