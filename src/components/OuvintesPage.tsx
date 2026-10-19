import { useState, useEffect, useRef, useMemo } from "react";
import { scrollToForm } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Save, X, Search, Users, MessageCircle, User as UserIcon, Smartphone, Radio as RadioIcon, Ban, ShieldCheck } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { useToast } from "@/hooks/use-toast";
import PontuacaoRulesSection from "./ouvintes/PontuacaoRulesSection";
import { confirmDialog } from "@/lib/confirmDialog";
import { promptDialog } from "@/lib/promptDialog";
import { DEFAULT_CADASTRO_RULES, computePontuacaoFromRules, getStoredOuvintes, saveStoredOuvintes, OuvinteRecord } from "@/lib/ouvintesUpsert";

type Ouvinte = OuvinteRecord;

const ESCOLARIDADE_OPTIONS = [
  "Fundamental Incompleto",
  "Fundamental Completo",
  "Médio Incompleto",
  "Médio Completo",
  "Superior Incompleto",
  "Superior Completo",
  "Pós-graduação",
  "Mestrado",
  "Doutorado",
];

const RENDA_OPTIONS = [
  "Até 1 salário mínimo",
  "1 a 2 salários mínimos",
  "2 a 4 salários mínimos",
  "4 a 10 salários mínimos",
  "10 a 20 salários mínimos",
  "Acima de 20 salários mínimos",
];

const SEXO_OPTIONS = ["Feminino", "Masculino", "Outro", "Prefere não informar"];

const UF_OPTIONS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const emptyForm = {
  nome: "",
  cpf: "",
  telefone: "",
  email: "",
  setor: "",
  uf: "",
  cidade: "",
  data_nascimento: "",
  escolaridade: "",
  renda: "",
  pontuacao: "0",
  sexo: "",
};

// Palette (nexo-form-design-system - ClientesPage style)
const CYAN = "#0055ff";
const LIME = "#0055ff";
const CARD_BG = "#FFFFFF";
const DARK = "#002132";

const pillInput: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 999,
  background: "#f8fafc",
  border: "1px solid rgba(226, 232, 240, 0.9)",
  padding: "0 20px",
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 12,
  color: "#0f172a",
  outline: "none",
  textTransform: "uppercase",
};

const pillSelect: React.CSSProperties = {
  ...pillInput,
  appearance: "none",
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%230055ff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 18px center",
  paddingRight: 44,
};

const labelStyle: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 6,
  display: "block",
};

function formatPhone(v: string | null | undefined): string {
  if (!v) return "";
  const d = String(v).replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

export default function OuvintesPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const { toast } = useToast();
  const formRef = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ouvintes, setOuvintes] = useState<Ouvinte[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [origemFilter, setOrigemFilter] = useState<"all" | "manual" | "player_site" | "app" | "chatbot">("all");
  const [cidadesUF, setCidadesUF] = useState<string[]>([]);
  const [showCidadeSug, setShowCidadeSug] = useState(false);
  const [rulesCadastro, setRulesCadastro] = useState<Record<string, number>>(DEFAULT_CADASTRO_RULES);
  const cidadeWrapRef = useRef<HTMLDivElement>(null);

  // Load Pontuação rules (Cadastro tab) from localStorage — kept in sync by PontuacaoRulesSection.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`nexohub_pontuacao_rules_cadastro_${targetUserId || user?.id || "anon"}`);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === "object") setRulesCadastro({ ...DEFAULT_CADASTRO_RULES, ...p });
      }
    } catch { /* ignore */ }
  }, [targetUserId, user?.id]);

  // Live pontuação: calculada em tempo real conforme os campos preenchidos.
  const pontuacaoAuto = useMemo(
    () => computePontuacaoFromRules(
      {
        nome: form.nome, cpf: form.cpf, telefone: form.telefone, email: form.email,
        sexo: form.sexo, data_nascimento: form.data_nascimento, uf: form.uf,
        cidade: form.cidade, setor: form.setor, escolaridade: form.escolaridade,
        renda: form.renda,
      },
      rulesCadastro
    ),
    [form, rulesCadastro]
  );

  // Load IBGE cities whenever UF changes
  useEffect(() => {
    if (!form.uf) { setCidadesUF([]); return; }
    let cancelled = false;
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${form.uf}/municipios`)
      .then((r) => r.json())
      .then((data: Array<{ nome: string }>) => {
        if (!cancelled) setCidadesUF((data || []).map((d) => d.nome));
      })
      .catch(() => { if (!cancelled) setCidadesUF([]); });
    return () => { cancelled = true; };
  }, [form.uf]);

  // Close autocomplete when clicking outside
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (cidadeWrapRef.current && !cidadeWrapRef.current.contains(e.target as Node)) {
        setShowCidadeSug(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);



  const load = async () => {
    setLoading(true);
    const ownerId = targetUserId || user?.id;
    let serverOuvintes: Ouvinte[] = [];
    try {
      let query = supabase
        .from("ouvintes")
        .select("*")
        .order("created_at", { ascending: false });
      if (ownerId) {
        query = query.eq("user_id", ownerId);
      }
      const { data, error } = await query;
      if (error) {
        console.warn("Supabase fetch ouvintes aviso (usando cache local):", error.message);
      } else if (data) {
        serverOuvintes = data as Ouvinte[];
      }
    } catch (e) {
      console.warn("Supabase fetch ouvintes exceção:", e);
    }

    const localList = getStoredOuvintes(ownerId);
    const map = new Map<string, Ouvinte>();
    // Primeiramente adiciona os dados vindos do servidor
    serverOuvintes.forEach((o) => map.set(o.id, o));
    // Sobrepõe os dados locais (que incluem cadastros e edições recentes)
    localList.forEach((o) => map.set(o.id, o));

    const merged = Array.from(map.values()).sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return tb - ta;
    });

    setOuvintes(merged);
    if (merged.length > 0 && ownerId) {
      saveStoredOuvintes(ownerId, merged);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [targetUserId, user?.id]);

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
  };

  const handleSave = async () => {
    const ownerId = targetUserId || user?.id;
    if (!ownerId) {
      toast({ title: "Sessão inválida", description: "Faça login novamente para continuar.", variant: "destructive" });
      return;
    }
    if (!form.nome.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);

    const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const id = editingId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ouv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

    const existingRecord = editingId ? ouvintes.find(o => o.id === editingId) : null;
    const cidadeFinal = form.cidade.trim()
      ? (form.uf ? `${form.cidade.trim()}/${form.uf}` : form.cidade.trim())
      : null;

    const newRecord: Ouvinte = {
      id,
      user_id: ownerId,
      nome: form.nome.trim(),
      cpf: form.cpf.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      setor: form.setor.trim() || null,
      cidade: cidadeFinal,
      data_nascimento: form.data_nascimento || null,
      escolaridade: form.escolaridade || null,
      renda: form.renda || null,
      sexo: form.sexo || null,
      pontuacao: pontuacaoAuto,
      origem_cadastro: existingRecord?.origem_cadastro || "manual",
      created_at: existingRecord?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      banido: existingRecord?.banido ?? false,
      banido_at: existingRecord?.banido_at || null,
      banido_motivo: existingRecord?.banido_motivo || null,
    };

    // Update state and localStorage immediately (guarantees record is saved and visible)
    const currentStored = getStoredOuvintes(ownerId);
    const map = new Map<string, Ouvinte>();
    ouvintes.forEach(o => map.set(o.id, o));
    currentStored.forEach(o => map.set(o.id, o));
    map.set(id, newRecord);

    const updatedList = editingId
      ? Array.from(map.values()).map(o => o.id === editingId ? newRecord : o)
      : [newRecord, ...Array.from(map.values()).filter(o => o.id !== id)];

    setOuvintes(updatedList);
    saveStoredOuvintes(ownerId, updatedList);

    // Sync to Supabase in background
    const payload: any = {
      user_id: ownerId,
      nome: newRecord.nome,
      cpf: newRecord.cpf,
      telefone: newRecord.telefone,
      email: newRecord.email,
      setor: newRecord.setor,
      cidade: newRecord.cidade,
      data_nascimento: newRecord.data_nascimento,
      escolaridade: newRecord.escolaridade,
      renda: newRecord.renda,
      sexo: newRecord.sexo,
      pontuacao: newRecord.pontuacao,
    };
    if (!editingId) payload.origem_cadastro = "manual";

    try {
      if (editingId && isUuid(editingId)) {
        const { error } = await supabase.from("ouvintes").update(payload).eq("id", editingId);
        if (error) console.warn("Aviso ao atualizar ouvinte no Supabase:", error.message);
      } else {
        if (isUuid(id)) payload.id = id;
        const { error } = await supabase.from("ouvintes").insert(payload);
        if (error) console.warn("Aviso ao salvar ouvinte no Supabase (mantido com sucesso no cache local):", error.message);
      }
    } catch (err) {
      console.warn("Exceção ao sincronizar ouvinte com Supabase:", err);
    }

    toast({ title: editingId ? "Ouvinte atualizado com sucesso" : "Ouvinte cadastrado com sucesso" });
    resetForm();
    setSaving(false);
  };

  const handleEdit = (o: Ouvinte) => {
    setEditingId(o.id);
    // Cidade is persisted as "Cidade/UF" — split on edit so the two fields hydrate correctly.
    const raw = o.cidade || "";
    const m = raw.match(/^(.*)\/([A-Z]{2})$/);
    const cidadeOnly = m ? m[1].trim() : raw;
    const ufOnly = m ? m[2] : "";
    setForm({
      nome: o.nome || "",
      cpf: o.cpf || "",
      telefone: o.telefone || "",
      email: o.email || "",
      setor: o.setor || "",
      uf: ufOnly,
      cidade: cidadeOnly,
      data_nascimento: o.data_nascimento || "",
      escolaridade: o.escolaridade || "",
      renda: o.renda || "",
      sexo: o.sexo || "",
      pontuacao: String(o.pontuacao ?? 0),
    });
    scrollToForm(formRef.current);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog({ title: "Excluir ouvinte", message: "Excluir este ouvinte? Esta ação não pode ser desfeita.", destructive: true, confirmLabel: "Excluir" }))) return;
    const ownerId = targetUserId || user?.id;
    const updated = ouvintes.filter((o) => o.id !== id);
    setOuvintes(updated);
    if (ownerId) saveStoredOuvintes(ownerId, updated);

    try {
      const { error } = await supabase.from("ouvintes").delete().eq("id", id);
      if (error) console.warn("Aviso ao excluir ouvinte no Supabase:", error.message);
    } catch (e) {
      console.warn("Exceção ao excluir ouvinte no Supabase:", e);
    }
    toast({ title: "Ouvinte excluído" });
  };

  const handleToggleBan = async (o: Ouvinte) => {
    const isBanned = o.banido === true;
    let motivo: string | null = null;
    if (isBanned) {
      const ok = await confirmDialog({
        title: "Remover banimento",
        message: `Remover o banimento de ${o.nome}? Ele voltará a participar de promoções, receber mensagens e acessar o player/site.${o.banido_motivo ? `\n\nMotivo registrado: ${o.banido_motivo}` : ""}`,
        confirmLabel: "Remover banimento",
      });
      if (!ok) return;
    } else {
      motivo = await promptDialog({
        title: "Banir ouvinte",
        message: `Banir ${o.nome}? Informe o motivo do banimento — ele ficará registrado junto com a data/hora. Enquanto banido, o ouvinte não poderá participar de promoções, receber mensagens nem acessar o player/site.`,
        placeholder: "Ex.: linguagem ofensiva no chat em 20/03",
        confirmLabel: "Banir",
        cancelLabel: "Cancelar",
        destructive: true,
        required: true,
        multiline: true,
        maxLength: 500,
      });
      if (motivo === null) return;
      motivo = motivo.trim();
      if (!motivo) return;
    }

    const ownerId = targetUserId || user?.id;
    const payload: Record<string, unknown> = isBanned
      ? { banido: false, banido_at: null, banido_motivo: null }
      : { banido: true, banido_at: new Date().toISOString(), banido_motivo: motivo };

    const updated = ouvintes.map(item => item.id === o.id ? { ...item, ...payload } : item);
    setOuvintes(updated);
    if (ownerId) saveStoredOuvintes(ownerId, updated);

    try {
      const { error } = await (supabase as any).from("ouvintes").update(payload).eq("id", o.id);
      if (error) console.warn("Aviso ao atualizar banimento no Supabase:", error.message);
    } catch (e) {
      console.warn("Exceção ao atualizar banimento no Supabase:", e);
    }

    toast({ title: isBanned ? "Banimento removido" : "Ouvinte banido" });
  };

  const filtered = ouvintes.filter((o) => {
    // Filtro por origem (modo de preenchimento)
    if (origemFilter !== "all") {
      const src = (o.origem_cadastro || "manual") as typeof origemFilter;
      if (src !== origemFilter) return false;
    }
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      o.nome?.toLowerCase().includes(s) ||
      o.cpf?.toLowerCase().includes(s) ||
      o.email?.toLowerCase().includes(s) ||
      o.telefone?.toLowerCase().includes(s) ||
      o.cidade?.toLowerCase().includes(s) ||
      o.whatsapp_message_id?.toLowerCase().includes(s)
    );
  });

  const origemCounts = ouvintes.reduce<Record<string, number>>((acc, o) => {
    const k = o.origem_cadastro || "manual";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  if (loading) return <ModulePageSkeleton variant="form" />;

  const today = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="space-y-8 animate-fade-in w-full max-w-none mx-0" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        Cadastro de Ouvintes
      </div>

      {/* PONTUAÇÃO RULES (collapsed by default, above form) */}
      <PontuacaoRulesSection />

      {/* FORM CARD */}

      <section
        ref={formRef}
        style={{
          background: "#FFFFFF",
          borderRadius: 24,
          padding: "28px 32px 32px",
          border: "1px solid rgba(226, 232, 240, 0.9)",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.03)",
        }}
      >
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h3
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 2,
              color: DARK,
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            {editingId ? "Editar Ouvinte" : "Cadastro de Ouvinte"}
          </h3>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: DARK,
              background: "#FFFFFF",
              padding: "6px 16px",
              borderRadius: 999,
              border: `2px solid ${CYAN}`,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Data do cadastro: <span style={{ color: CYAN }}>{editingId ? "—" : today}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
          <div className="lg:col-span-2">
            <Field label="Nome Completo">
              <input style={pillInput} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" />
            </Field>
          </div>
          <Field label="CPF">
            <input style={pillInput} value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
          </Field>

          <Field label="Telefone">
            <input style={pillInput} value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(00) 00000-0000" />
          </Field>
          <Field label="E-mail">
            <input style={pillInput} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@exemplo.com" />
          </Field>
          <Field label="Sexo">
            <select style={pillSelect} value={form.sexo} onChange={(e) => setForm({ ...form, sexo: e.target.value })}>
              <option value="">Selecione</option>
              {SEXO_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>

          <Field label="UF">
            <select
              style={pillSelect}
              value={form.uf}
              onChange={(e) => setForm({ ...form, uf: e.target.value, cidade: "" })}
            >
              <option value="">Selecione</option>
              {UF_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Cidade">
            <div ref={cidadeWrapRef} style={{ position: "relative" }}>
              <input
                style={pillInput}
                value={form.cidade}
                onChange={(e) => { setForm({ ...form, cidade: e.target.value }); setShowCidadeSug(true); }}
                onFocus={() => setShowCidadeSug(true)}
                placeholder={form.uf ? "Digite para buscar..." : "Selecione a UF primeiro"}
                disabled={!form.uf}
                autoComplete="off"
              />
              {showCidadeSug && form.uf && form.cidade.trim().length > 0 && (() => {
                const q = form.cidade.trim().toLowerCase();
                const matches = cidadesUF
                  .filter((c) => c.toLowerCase().includes(q))
                  .slice(0, 8);
                if (matches.length === 0) return null;
                // Hide list if the current value exactly matches the only match
                if (matches.length === 1 && matches[0].toLowerCase() === q) return null;
                return (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      right: 0,
                      background: "#FFFFFF",
                      border: `2px solid ${CYAN}`,
                      borderRadius: 20,
                      overflow: "hidden",
                      zIndex: 50,
                      boxShadow: "0 10px 30px rgba(10,37,64,0.15)",
                      maxHeight: 260,
                      overflowY: "auto",
                    }}
                  >
                    {matches.map((c, i) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => { setForm({ ...form, cidade: c }); setShowCidadeSug(false); }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 16px",
                          background: "transparent",
                          border: "none",
                          borderBottom: i < matches.length - 1 ? `1px solid ${CARD_BG}` : "none",
                          color: DARK,
                          fontFamily: "'Montserrat', sans-serif",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          </Field>
          <Field label="Setor">
            <input style={pillInput} value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })} placeholder="Bairro / região" />
          </Field>
          <Field label="Data de Nascimento">
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...pillInput, flex: 1 }}
                type="date"
                value={form.data_nascimento}
                onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })}
              />
              <div
                style={{
                  ...pillInput,
                  width: 90,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#F1FAFD",
                  fontWeight: 800,
                  color: form.data_nascimento ? CYAN : "#94A3B8",
                  fontSize: 14,
                }}
                title="Idade"
              >
                {(() => {
                  if (!form.data_nascimento) return "— anos";
                  const d = new Date(form.data_nascimento + "T00:00:00");
                  if (isNaN(d.getTime())) return "— anos";
                  const now = new Date();
                  let age = now.getFullYear() - d.getFullYear();
                  const m = now.getMonth() - d.getMonth();
                  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
                  if (age < 0 || age > 130) return "—";
                  return `${age} anos`;
                })()}
              </div>
            </div>
          </Field>


          <Field label="Escolaridade">
            <select style={pillSelect} value={form.escolaridade} onChange={(e) => setForm({ ...form, escolaridade: e.target.value })}>
              <option value="">Selecione</option>
              {ESCOLARIDADE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Renda">
            <select style={pillSelect} value={form.renda} onChange={(e) => setForm({ ...form, renda: e.target.value })}>
              <option value="">Selecione</option>
              {RENDA_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Pontuação (automática)">
            <div
              style={{
                ...pillInput,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#F1FAFD",
                color: DARK,
                fontWeight: 700,
              }}
              title="Calculada automaticamente conforme a participação do ouvinte"
            >
              <span style={{ fontSize: 16, color: CYAN, fontWeight: 800 }}>{pontuacaoAuto}</span>
              <span style={{ fontSize: 10, color: "#64748B", letterSpacing: 1, textTransform: "uppercase" }}>
                calculado pelas regras
              </span>
            </div>
          </Field>

        </div>

        <div className="mt-8 flex items-center justify-end gap-3">
          {editingId && (
            <button
              onClick={resetForm}
              style={{
                height: 44,
                padding: "0 22px",
                borderRadius: 999,
                background: "#FFFFFF",
                border: `2px solid ${CYAN}`,
                color: DARK,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <X size={16} /> Cancelar
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              height: 44,
              padding: "0 28px",
              borderRadius: 999,
              background: "#0055ff",
              border: "none",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 2,
              textTransform: "uppercase",
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.7 : 1,
              boxShadow: "0 4px 14px rgba(0, 85, 255, 0.25)",
            }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar
          </button>
        </div>
      </section>




      {/* LIST CARD */}
      <section
        style={{
          background: "#FFFFFF",
          borderRadius: 28,
          padding: "20px 24px 28px",
          border: "1px solid #E5F5FB",
          boxShadow: "0 2px 12px rgba(10, 37, 64, 0.04)",
        }}
      >
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div className="flex items-center gap-2" style={{ color: DARK }}>
            <Users size={18} style={{ color: CYAN }} />
            <h3 style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>
              Ouvintes Cadastrados
            </h3>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                background: CARD_BG,
                color: DARK,
                padding: "3px 12px",
                borderRadius: 999,
              }}
            >
              {filtered.length}
            </span>
          </div>

          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: CYAN }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome, CPF, telefone, e-mail, cidade ou ID WhatsApp"
              style={{ ...pillInput, width: 360, paddingLeft: 40, height: 40, fontSize: 12 }}
            />
          </div>
        </div>

        {/* Filtro por modo de preenchimento (origem do cadastro) */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: "#64748B" }}>
            Modo:
          </span>
          {([
            { key: "all",         label: "Todos",         bg: CARD_BG,     fg: DARK,      Icon: Users },
            { key: "manual",      label: "Manual",        bg: CARD_BG,     fg: DARK,      Icon: UserIcon },
            { key: "player_site", label: "Player / Site", bg: "#DBEAFE",   fg: "#1D4ED8", Icon: RadioIcon },
            { key: "app",         label: "Aplicativo",    bg: "#EDE9FE",   fg: "#6D28D9", Icon: Smartphone },
            { key: "chatbot",     label: "WhatsApp",      bg: "#25D36622", fg: "#128C7E", Icon: MessageCircle },
          ] as const).map((opt) => {
            const active = origemFilter === opt.key;
            const count = opt.key === "all" ? ouvintes.length : (origemCounts[opt.key] || 0);
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setOrigemFilter(opt.key as typeof origemFilter)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 999,
                  background: active ? opt.fg : opt.bg,
                  color: active ? "#FFFFFF" : opt.fg,
                  fontSize: 11, fontWeight: 800, letterSpacing: 0.6,
                  textTransform: "uppercase",
                  border: active ? `1px solid ${opt.fg}` : `1px solid transparent`,
                  boxShadow: active ? "0 2px 8px rgba(10, 37, 64, 0.12)" : "none",
                  cursor: "pointer",
                  transition: "all .15s ease",
                }}
              >
                <opt.Icon size={12} />
                {opt.label}
                <span
                  style={{
                    background: active ? "rgba(255,255,255,0.25)" : "rgba(15,23,42,0.08)",
                    color: active ? "#FFFFFF" : opt.fg,
                    padding: "1px 8px", borderRadius: 999,
                    fontSize: 10, fontWeight: 800, marginLeft: 2,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>


        {filtered.length === 0 ? (
          <p style={{ fontSize: 13, color: "#64748B", textAlign: "center", padding: "40px 0", fontFamily: "'Montserrat', sans-serif" }}>
            Nenhum ouvinte cadastrado.
          </p>
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 16, border: `1px solid ${CARD_BG}` }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
              <thead>
                <tr style={{ background: CYAN, color: "#FFFFFF" }}>
                  {["Origem", "Data", "Nome", "CPF", "Telefone", "E-mail", "Sexo", "Setor", "Cidade", "Nascimento", "Idade", "Escolaridade", "Renda", "Pontos", "Ações"].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 14px",
                        textAlign: h === "Pontos" || h === "Ações" ? "right" : "left",
                        fontWeight: 800,
                        letterSpacing: 1.2,
                        textTransform: "uppercase",
                        fontSize: 10,
                        whiteSpace: "nowrap",
                        position: h === "Ações" ? "sticky" : undefined,
                        right: h === "Ações" ? 0 : undefined,
                        background: h === "Ações" ? CYAN : undefined,
                        zIndex: h === "Ações" ? 2 : undefined,
                        boxShadow: h === "Ações" ? "-8px 0 12px -8px rgba(10,37,64,0.15)" : undefined,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((o, idx) => (
                  <tr
                    key={o.id}
                    style={{
                      background: o.banido ? "#FEF2F2" : (idx % 2 === 0 ? "#FFFFFF" : "#F7FCFE"),
                      color: DARK,
                      opacity: o.banido ? 0.85 : 1,
                    }}
                  >
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                      {(() => {
                        const origem = o.origem_cadastro || "manual";
                        const meta: Record<string, { label: string; bg: string; fg: string; Icon: typeof UserIcon }> = {
                          manual:      { label: "Manual",        bg: CARD_BG,     fg: DARK,      Icon: UserIcon },
                          player_site: { label: "Player / Site", bg: "#DBEAFE",   fg: "#1D4ED8", Icon: RadioIcon },
                          app:         { label: "Aplicativo",    bg: "#EDE9FE",   fg: "#6D28D9", Icon: Smartphone },
                          chatbot:     { label: "WhatsApp",      bg: "#25D36622", fg: "#128C7E", Icon: MessageCircle },
                        };
                        const m = meta[origem] || meta.manual;
                        return (
                          <span
                            title={`Origem: ${m.label}`}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              padding: "4px 10px", borderRadius: 999,
                              background: m.bg, color: m.fg,
                              fontSize: 10, fontWeight: 800, letterSpacing: 0.6,
                              textTransform: "uppercase",
                            }}
                          >
                            <m.Icon size={12} />
                            {m.label}
                          </span>
                        );
                      })()}
                      {o.origem_cadastro === "chatbot" && o.whatsapp_message_id ? (
                        <span
                          title={`ID mensagem WhatsApp: ${o.whatsapp_message_id}\n(clique para copiar)`}
                          onClick={() => { navigator.clipboard?.writeText(o.whatsapp_message_id || ""); }}
                          style={{
                            marginLeft: 6,
                            display: "inline-flex", alignItems: "center",
                            padding: "3px 8px", borderRadius: 999,
                            background: "#0F172A", color: "#25D366",
                            fontSize: 9, fontWeight: 800, letterSpacing: 0.4,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                            cursor: "pointer", maxWidth: 120, overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          #{String(o.whatsapp_message_id).slice(-8)}
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                      {o.created_at ? new Date(o.created_at).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td style={{ padding: "12px 14px", minWidth: 200, fontWeight: 700, fontSize: 13 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ textDecoration: o.banido ? "line-through" : "none" }}>{o.nome}</span>
                        {o.banido ? (
                          <span
                            title={[
                              o.banido_at ? `Banido em ${new Date(o.banido_at).toLocaleString("pt-BR")}` : "Banido",
                              o.banido_motivo ? `Motivo: ${o.banido_motivo}` : null,
                            ].filter(Boolean).join(" — ")}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "3px 8px", borderRadius: 999,
                              background: "#DC2626", color: "#fff",
                              fontSize: 9, fontWeight: 900, letterSpacing: 0.6,
                              textTransform: "uppercase",
                            }}
                          >
                            <Ban size={10} /> Banido
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>{o.cpf || "—"}</td>
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>{formatPhone(o.telefone) || "—"}</td>

                    <td style={{ padding: "12px 14px" }}>{o.email || "—"}</td>
                    <td style={{ padding: "12px 14px" }}>{o.sexo || "—"}</td>
                    <td style={{ padding: "12px 14px" }}>{o.setor || "—"}</td>
                    <td style={{ padding: "12px 14px" }}>{o.cidade || "—"}</td>
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                      {o.data_nascimento ? new Date(o.data_nascimento + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap", fontWeight: 700, color: CYAN }}>
                      {(() => {
                        if (!o.data_nascimento) return "—";
                        const d = new Date(o.data_nascimento + "T00:00:00");
                        if (isNaN(d.getTime())) return "—";
                        const now = new Date();
                        let age = now.getFullYear() - d.getFullYear();
                        const m = now.getMonth() - d.getMonth();
                        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
                        if (age < 0 || age > 130) return "—";
                        return age;
                      })()}
                    </td>
                    <td style={{ padding: "12px 14px" }}>{o.escolaridade || "—"}</td>

                    <td style={{ padding: "12px 14px" }}>{o.renda || "—"}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800, color: CYAN }}>
                      {o.pontuacao ?? 0}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", position: "sticky", right: 0, background: o.banido ? "#FEF2F2" : (idx % 2 === 0 ? "#FFFFFF" : "#F7FCFE"), boxShadow: "-8px 0 12px -8px rgba(10,37,64,0.15)" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button
                          onClick={() => handleEdit(o)}
                          title="Editar"
                          style={{
                            width: 30, height: 30, borderRadius: "50%",
                            background: CARD_BG, border: "none", cursor: "pointer",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            color: DARK,
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleToggleBan(o)}
                          title={o.banido ? "Remover banimento" : "Banir ouvinte"}
                          style={{
                            width: 30, height: 30, borderRadius: "50%",
                            background: o.banido ? "#DCFCE7" : "#FEF3C7",
                            border: "none", cursor: "pointer",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            color: o.banido ? "#166534" : "#B45309",
                          }}
                        >
                          {o.banido ? <ShieldCheck size={14} /> : <Ban size={14} />}
                        </button>
                        <button
                          onClick={() => handleDelete(o.id)}
                          title="Excluir"
                          style={{
                            width: 30, height: 30, borderRadius: "50%",
                            background: "#FEE2E2", border: "none", cursor: "pointer",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            color: "#DC2626",
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
