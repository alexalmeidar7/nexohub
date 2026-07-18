import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Save, Award, FileText, RotateCcw, ChevronDown, Radio } from "lucide-react";

const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const CARD_BG = "#D6F4FB";
const DARK = "#0A2540";

type TabKey = "cadastro" | "player";

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

const CAMPOS_PLAYER: CampoRegra[] = [
  { key: "login", label: "Número de Logins", hint: "por login efetuado" },
  { key: "curtida_musica", label: "Curtidas em Músicas", hint: "por curtida" },
  { key: "msg_chat", label: "Envio de Mensagem no Chat", hint: "por mensagem enviada" },
  { key: "video_ondemand", label: "Assistir Vídeo On Demand", hint: "por vídeo assistido" },
  { key: "tempo_logado", label: "Tempo Logado no Player", hint: "a cada 1 minuto" },
];

const DEFAULT_CADASTRO: Record<string, number> = {
  nome: 10, cpf: 15, telefone: 15, email: 10, sexo: 5,
  data_nascimento: 10, uf: 5, cidade: 5, setor: 5,
  escolaridade: 10, renda: 10,
};

const DEFAULT_PLAYER: Record<string, number> = {
  login: 2,
  curtida_musica: 1,
  msg_chat: 3,
  video_ondemand: 5,
  tempo_logado: 1,
};

const keyCadastro = (uid?: string) => `nexohub_pontuacao_rules_cadastro_${uid || "anon"}`;
const keyPlayer = (uid?: string) => `nexohub_pontuacao_rules_player_${uid || "anon"}`;

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
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("cadastro");
  const [rulesCadastro, setRulesCadastro] = useState<Record<string, number>>(DEFAULT_CADASTRO);
  const [rulesPlayer, setRulesPlayer] = useState<Record<string, number>>(DEFAULT_PLAYER);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const rc = localStorage.getItem(keyCadastro(user?.id));
      if (rc) {
        const p = JSON.parse(rc);
        if (p && typeof p === "object") setRulesCadastro({ ...DEFAULT_CADASTRO, ...p });
      }
      const rp = localStorage.getItem(keyPlayer(user?.id));
      if (rp) {
        const p = JSON.parse(rp);
        if (p && typeof p === "object") setRulesPlayer({ ...DEFAULT_PLAYER, ...p });
      }
    } catch {
      /* ignore */
    }
  }, [user?.id]);

  const currentCampos = tab === "cadastro" ? CAMPOS_CADASTRO : CAMPOS_PLAYER;
  const currentRules = tab === "cadastro" ? rulesCadastro : rulesPlayer;
  const setCurrentRules = tab === "cadastro" ? setRulesCadastro : setRulesPlayer;
  const currentDefaults = tab === "cadastro" ? DEFAULT_CADASTRO : DEFAULT_PLAYER;

  const total = useMemo(
    () => currentCampos.reduce((s, c) => s + (Number(currentRules[c.key]) || 0), 0),
    [currentCampos, currentRules]
  );

  const setPontos = (key: string, valor: string) => {
    const n = Math.max(0, Math.min(999, parseInt(valor || "0", 10) || 0));
    setCurrentRules((r) => ({ ...r, [key]: n }));
  };

  const handleSave = () => {
    setSaving(true);
    try {
      localStorage.setItem(keyCadastro(user?.id), JSON.stringify(rulesCadastro));
      localStorage.setItem(keyPlayer(user?.id), JSON.stringify(rulesPlayer));
      toast({ title: "Regras salvas", description: "Pontuação atualizada com sucesso." });
    } catch {
      toast({ title: "Erro", description: "Não foi possível salvar as regras.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setCurrentRules(currentDefaults);
    toast({ title: "Valores padrão restaurados", description: "Lembre-se de salvar." });
  };

  return (
    <section
      style={{
        background: CARD_BG,
        borderRadius: 28,
        padding: open ? "24px 32px 32px" : "18px 24px",
        boxShadow: "0 2px 12px rgba(10, 37, 64, 0.05)",
        fontFamily: "'Montserrat', sans-serif",
        transition: "padding 0.2s ease",
      }}
    >
      {/* HEADER — click to toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontFamily: "'Montserrat', sans-serif",
        }}
      >
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
              fontSize: 18, fontWeight: 800, letterSpacing: 2, color: DARK,
              textTransform: "uppercase", margin: 0, textAlign: "left",
            }}
          >
            Regras de Pontuação
          </h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {open && (
            <div
              style={{
                fontSize: 11, fontWeight: 700, color: DARK,
                background: "#FFFFFF", padding: "6px 16px", borderRadius: 999,
                border: `2px solid ${CYAN}`, letterSpacing: 1, textTransform: "uppercase",
              }}
            >
              Total desta aba: <span style={{ color: CYAN }}>{total} pts</span>
            </div>
          )}
          <div
            style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "#FFFFFF", border: `2px solid ${CYAN}`,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: CYAN,
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          >
            <ChevronDown size={16} />
          </div>
        </div>
      </button>

      {!open && null}

      {open && (
        <div style={{ marginTop: 24 }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
            <TabButton active={tab === "cadastro"} onClick={() => setTab("cadastro")}>
              <FileText size={14} /> Formulário de Cadastro
            </TabButton>
            <TabButton active={tab === "player"} onClick={() => setTab("player")}>
              <Radio size={14} /> Interação no Player
            </TabButton>
          </div>

          <p style={{ fontSize: 12, color: "#475569", marginBottom: 16, lineHeight: 1.6 }}>
            {tab === "cadastro"
              ? "Defina quantos pontos o ouvinte ganha ao preencher cada campo do formulário. A pontuação é aplicada uma única vez, no momento em que o campo é informado."
              : "Defina quantos pontos o ouvinte ganha ao interagir dentro do player (ouvindo ou assistindo). A pontuação é aplicada a cada ação realizada."}
          </p>

          <div
            style={{
              background: "#FFFFFF",
              borderRadius: 20,
              padding: "8px 4px",
              border: `1px solid ${CYAN}33`,
            }}
          >
            {currentCampos.map((c, i) => (
              <div
                key={c.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 20px",
                  borderBottom: i < currentCampos.length - 1 ? `1px solid ${CARD_BG}` : "none",
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
                    value={currentRules[c.key] ?? 0}
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
        </div>
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
