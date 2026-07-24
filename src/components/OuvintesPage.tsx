import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Save, X, Search, Users, MessageCircle, User as UserIcon, Smartphone, Radio as RadioIcon } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { useToast } from "@/hooks/use-toast";
import PontuacaoRulesSection from "./ouvintes/PontuacaoRulesSection";
import { confirmDialog } from "@/lib/confirmDialog";
import { DEFAULT_CADASTRO_RULES, computePontuacaoFromRules } from "@/lib/ouvintesUpsert";

interface Ouvinte {
  id: string;
  created_at: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  setor: string | null;
  cidade: string | null;
  data_nascimento: string | null;
  escolaridade: string | null;
  renda: string | null;
  pontuacao: number | null;
  sexo: string | null;
  origem_cadastro: string | null;
}

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

// Palette (nexo-form-design-system)
const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const CARD_BG = "#D6F4FB";
const DARK = "#0A2540";

const pillInput: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 999,
  background: "#FFFFFF",
  border: `2px solid ${CYAN}`,
  padding: "0 20px",
  fontFamily: "'Montserrat', sans-serif",
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
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: DARK,
  marginBottom: 8,
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

export default function OuvintesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ouvintes, setOuvintes] = useState<Ouvinte[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cidadesUF, setCidadesUF] = useState<string[]>([]);
  const [showCidadeSug, setShowCidadeSug] = useState(false);
  const [rulesCadastro, setRulesCadastro] = useState<Record<string, number>>(DEFAULT_CADASTRO_RULES);
  const cidadeWrapRef = useRef<HTMLDivElement>(null);

  // Load Pontuação rules (Cadastro tab) from localStorage — kept in sync by PontuacaoRulesSection.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`nexohub_pontuacao_rules_cadastro_${user?.id || "anon"}`);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === "object") setRulesCadastro({ ...DEFAULT_CADASTRO_RULES, ...p });
      }
    } catch { /* ignore */ }
  }, [user?.id]);

  // Live pontuação: calculada em tempo real conforme os campos preenchidos.
  const pontuacaoAuto = useMemo(
    () => computePontuacaoFromRules(
      {
        nome: form.nome, cpf: form.cpf, telefone: form.telefone, email: form.email,
        sexo: form.sexo, data_nascimento: form.data_nascimento, uf: form.uf,
        cidade: form.cidade, setor: form.setor, escolaridade: form.escolaridade,
        renda: form.renda,
      },
      rulesCadastro,
    ),
    [form, rulesCadastro],
  );
  const cidadeWrapRef = useRef<HTMLDivElement>(null);

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
    const { data, error } = await supabase
      .from("ouvintes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar ouvintes", description: error.message, variant: "destructive" });
    } else {
      setOuvintes((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.nome.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      user_id: user.id,
      nome: form.nome.trim(),
      cpf: form.cpf.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      setor: form.setor.trim() || null,
      cidade: form.cidade.trim()
        ? (form.uf ? `${form.cidade.trim()}/${form.uf}` : form.cidade.trim())
        : null,
      data_nascimento: form.data_nascimento || null,
      escolaridade: form.escolaridade || null,
      renda: form.renda || null,
      sexo: form.sexo || null,
      // pontuacao NÃO é editada manualmente — é calculada pela participação do ouvinte
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("ouvintes").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("ouvintes").insert(payload));
    }

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingId ? "Ouvinte atualizado" : "Ouvinte cadastrado" });
      resetForm();
      load();
    }
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog("Excluir este ouvinte?"))) return;
    const { error } = await supabase.from("ouvintes").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ouvinte excluído" });
      load();
    }
  };

  const filtered = ouvintes.filter((o) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      o.nome?.toLowerCase().includes(s) ||
      o.cpf?.toLowerCase().includes(s) ||
      o.email?.toLowerCase().includes(s) ||
      o.cidade?.toLowerCase().includes(s)
    );
  });

  if (loading) return <ModulePageSkeleton />;

  const today = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="space-y-8 animate-fade-in" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* PONTUAÇÃO RULES (collapsed by default, above form) */}
      <PontuacaoRulesSection />

      {/* FORM CARD */}

      <section
        style={{
          background: CARD_BG,
          borderRadius: 28,
          padding: "28px 32px 32px",
          boxShadow: "0 2px 12px rgba(10, 37, 64, 0.05)",
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
              <span style={{ fontSize: 16, color: CYAN, fontWeight: 800 }}>{editingId ? (form.pontuacao || "0") : "0"}</span>
              <span style={{ fontSize: 10, color: "#64748B", letterSpacing: 1, textTransform: "uppercase" }}>
                gerado pela participação
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
              background: LIME,
              border: "none",
              color: DARK,
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 2,
              textTransform: "uppercase",
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.7 : 1,
              boxShadow: "0 4px 14px rgba(198, 240, 60, 0.35)",
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
              placeholder="Buscar nome, CPF, e-mail ou cidade"
              style={{ ...pillInput, width: 320, paddingLeft: 40, height: 40, fontSize: 12 }}
            />
          </div>
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
                  {["Data", "Nome", "CPF", "Telefone", "E-mail", "Sexo", "Setor", "Cidade", "Nascimento", "Idade", "Escolaridade", "Renda", "Pontos", "Ações"].map((h, i) => (
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
                      background: idx % 2 === 0 ? "#FFFFFF" : "#F7FCFE",
                      color: DARK,
                    }}
                  >
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                      {o.created_at ? new Date(o.created_at).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td style={{ padding: "12px 14px", minWidth: 200 }}>
                      {(() => {
                        const isBot = o.origem_cadastro === "chatbot";
                        return (
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span
                              title={isBot ? "Origem: Chatbot" : "Origem: Manual"}
                              style={{
                                flexShrink: 0,
                                width: 26, height: 26, borderRadius: "50%",
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                background: isBot ? "#25D36622" : CARD_BG,
                                color: isBot ? "#128C7E" : DARK,
                              }}
                            >
                              {isBot ? <MessageCircle size={13} /> : <UserIcon size={13} />}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>{o.nome}</span>
                          </div>
                        );
                      })()}
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
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>
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
