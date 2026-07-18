import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Save, Award, FileText, RotateCcw } from "lucide-react";

const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const CARD_BG = "#D6F4FB";
const DARK = "#0A2540";

type TabKey = "cadastro";

interface CampoRegra {
  key: string;
  label: string;
  hint?: string;
}

const CAMPOS_CADASTRO: CampoRegra[] = [
  { key: "nome", label: "Nome Completo", hint: "obrigatório" },
  { key: "cpf", label: "CPF" },
  { key: "telefone", label: "Telefone / WhatsApp" },
  { key: "email", label: "E-mail" },
  { key: "sexo", label: "Sexo" },
  { key: "data_nascimento", label: "Data de Nascimento" },
  { key: "uf", label: "UF" },
  { key: "cidade", label: "Cidade" },
  { key: "setor", label: "Bairro / Setor" },
  { key: "escolaridade", label: "Escolaridade" },
  { key: "renda", label: "Renda" },
];

const DEFAULT_POINTS: Record<string, number> = {
  nome: 10,
  cpf: 15,
  telefone: 15,
  email: 10,
  sexo: 5,
  data_nascimento: 10,
  uf: 5,
  cidade: 5,
  setor: 5,
  escolaridade: 10,
  renda: 10,
};

const storageKey = (uid: string | undefined) =>
  `nexohub_pontuacao_rules_cadastro_${uid || "anon"}`;

const pill: React.CSSProperties = {
  height: 40,
  borderRadius: 999,
  background: "#FFFFFF",
  border: `2px solid ${CYAN}`,
  padding: "0 16px",
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 13,
  color: DARK,
  outline: "none",
  width: 110,
  textAlign: "center",
  fontWeight: 700,
};

export default function PontuacaoRulesSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("cadastro");
  const [rules, setRules] = useState<Record<string, number>>(DEFAULT_POINTS);
  const [saving, setSaving] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(user?.id));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setRules({ ...DEFAULT_POINTS, ...parsed });
        }
      }
    } catch {
      /* ignore */
    }
  }, [user?.id]);

  const total = useMemo(
    () => CAMPOS_CADASTRO.reduce((s, c) => s + (Number(rules[c.key]) || 0), 0),
    [rules]
  );

  const setPontos = (key: string, valor: string) => {
    const n = Math.max(0, Math.min(999, parseInt(valor || "0", 10) || 0));
    setRules((r) => ({ ...r, [key]: n }));
  };

  const handleSave = () => {
    setSaving(true);
    try {
      localStorage.setItem(storageKey(user?.id), JSON.stringify(rules));
      toast({ title: "Regras salvas", description: "Pontuação por campo atualizada." });
    } catch {
      toast({ title: "Erro", description: "Não foi possível salvar as regras.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setRules(DEFAULT_POINTS);
    toast({ title: "Valores padrão restaurados", description: "Lembre-se de salvar." });
  };

  return (
    <section
      style={{
        background: CARD_BG,
        borderRadius: 28,
        padding: "28px 32px 32px",
        boxShadow: "0 2px 12px rgba(10, 37, 64, 0.05)",
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "#FFFFFF", border: `2px solid ${CYAN}`,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: CYAN,
            }}
          >
            <Award size={18} />
          </div>
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
            Regras de Pontuação
          </h3>
        </div>
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
          Total possível: <span style={{ color: CYAN }}>{total} pts</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        <TabButton active={tab === "cadastro"} onClick={() => setTab("cadastro")}>
          <FileText size={14} /> Formulário de Cadastro
        </TabButton>
        {/* Futuras abas podem ser adicionadas aqui */}
      </div>

      {tab === "cadastro" && (
        <>
          <p style={{ fontSize: 12, color: "#475569", marginBottom: 16, lineHeight: 1.6 }}>
            Defina quantos pontos o ouvinte ganha ao preencher cada campo do formulário de cadastro.
            A pontuação é aplicada uma única vez, no momento em que o campo é informado.
          </p>

          <div
            style={{
              background: "#FFFFFF",
              borderRadius: 20,
              padding: "8px 4px",
              border: `1px solid ${CYAN}33`,
            }}
          >
            {CAMPOS_CADASTRO.map((c, i) => (
              <div
                key={c.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 20px",
                  borderBottom: i < CAMPOS_CADASTRO.length - 1 ? `1px solid ${CARD_BG}` : "none",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{c.label}</div>
                  {c.hint && (
                    <div style={{ fontSize: 10, color: "#64748B", letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
                      {c.hint}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={rules[c.key] ?? 0}
                    onChange={(e) => setPontos(c.key, e.target.value)}
                    style={pill}
                  />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", letterSpacing: 1, textTransform: "uppercase" }}>
                    pts
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 flex-wrap">
            <button
              onClick={handleReset}
              style={{
                height: 40, padding: "0 18px", borderRadius: 999,
                background: "#FFFFFF", border: `2px solid ${CYAN}`,
                color: DARK, fontWeight: 700, fontSize: 11, letterSpacing: 1.5,
                textTransform: "uppercase",
                display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
              }}
            >
              <RotateCcw size={14} /> Restaurar padrão
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                height: 44, padding: "0 28px", borderRadius: 999,
                background: LIME, border: "none", color: DARK,
                fontWeight: 800, fontSize: 12, letterSpacing: 2, textTransform: "uppercase",
                display: "inline-flex", alignItems: "center", gap: 10,
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1,
                boxShadow: "0 4px 14px rgba(198, 240, 60, 0.35)",
              }}
            >
              <Save size={16} /> Salvar Regras
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 38,
        padding: "0 18px",
        borderRadius: 999,
        background: active ? CYAN : "#FFFFFF",
        border: `2px solid ${CYAN}`,
        color: active ? "#FFFFFF" : DARK,
        fontWeight: 800,
        fontSize: 11,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      {children}
    </button>
  );
}
