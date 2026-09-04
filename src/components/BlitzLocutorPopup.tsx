import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Siren, Minus, Check, ChevronLeft, ChevronRight, Clock, Users, Building2, X, Maximize2 } from "lucide-react";
import { todayInBrasilia } from "@/lib/brasiliaDate";
import { logBlitzHistorico } from "@/lib/blitzHistorico";

interface Blitz {
  id: string;
  dia: string;
  horario: string;
  horario_fim: string | null;
  cliente: string;
  equipe: string | null;
  observacoes: string | null;
  realizada: boolean;
  agenda_evento_id: string | null;
}

const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const DARK = "#0A2540";
const FONT = "'Montserrat', sans-serif";

function nowHM() {
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" };
  return new Intl.DateTimeFormat("en-GB", opts).format(now);
}

export default function BlitzLocutorPopup({ userId }: { userId: string | null }) {
  const [items, setItems] = useState<Blitz[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [today, setToday] = useState(todayInBrasilia());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => { setTick(t => t + 1); setToday(todayInBrasilia()); }, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.functions.invoke("public-blitz-data", {
        body: { userId, mode: "today" },
      });
      if (cancelled) return;
      setItems((data?.ok ? (data.rows as Blitz[]) : []) || []);
    };
    load();
    const ch = supabase
      .channel(`blitz-locutor-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "blitz_promocionais", filter: `user_id=eq.${userId}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [userId, today, tick]);

  const active = useMemo(() => {
    const hm = nowHM();
    return items
      .filter(b => {
        if (b.horario_fim && b.horario_fim.slice(0, 5) <= hm) return false;
        return true;
      })
      .sort((a, b) => (a.horario || "").localeCompare(b.horario || ""));
  }, [items, tick]);

  useEffect(() => {
    setActiveIndex(index => active.length > 0 ? Math.min(index, active.length - 1) : 0);
  }, [active.length]);

  const currentBlitz = active[activeIndex] ?? active[0];
  const navigateBlitz = (direction: -1 | 1) => {
    setActiveIndex(index => (index + direction + active.length) % active.length);
  };

  const encerrar = async (b: Blitz) => {
    await supabase.from("blitz_promocionais")
      .update({ realizada: true, data_realizacao: new Date().toISOString() })
      .eq("id", b.id);
    if (b.agenda_evento_id) {
      await supabase.from("agenda_participantes").delete().eq("evento_id", b.agenda_evento_id);
      await supabase.from("agenda_eventos").delete().eq("id", b.agenda_evento_id);
    }
    if (userId) {
      await logBlitzHistorico({
        userId, blitzId: b.id, cliente: b.cliente, acao: "encerrada",
        motivo: "Encerrada manualmente pelo locutor",
        dadosAntes: b, dadosDepois: { ...b, realizada: true },
      });
    }
  };

  if (!userId || active.length === 0 || dismissed) return null;

  if (minimized) {
    return (
      <div
        style={{
          position: "fixed", left: "var(--onair-left, 18px)", bottom: 18, zIndex: 60,
          display: "flex", alignItems: "center", gap: 6,
          background: CYAN, borderRadius: 999, padding: "4px 6px 4px 4px",
          boxShadow: "0 12px 30px rgba(0,191,240,0.45)", fontFamily: FONT,
          paddingLeft: "var(--onair-left-offset, 0px)",
        }}
      >
        <button
          onClick={() => setMinimized(false)}
          style={{
            background: "transparent", color: "#fff", border: "none", borderRadius: 999,
            padding: "6px 10px", fontFamily: FONT, fontWeight: 800, fontSize: 12,
            textTransform: "uppercase", letterSpacing: 1, display: "flex", alignItems: "center", gap: 8,
            cursor: "pointer",
          }}
          title="Restaurar a janela"
        >
          <Siren size={14} /> Blitz ({active.length}) <Maximize2 size={14} />
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: "rgba(255,255,255,0.22)", border: "none", borderRadius: 999,
            width: 22, height: 22, color: "#fff", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
          title="Fechar a janela"
        >
          <X size={12} />
        </button>
      </div>
    );
  }


  return (
    <div
      style={{
        position: "fixed",
        left: "var(--onair-left, 18px)",
        bottom: 18,
        zIndex: 60,
        width: 360,
        maxWidth: "calc(100vw - 36px)",
        paddingLeft: "var(--onair-left-offset, 0px)",
        background: "rgba(255,255,255,0.94)",
        backdropFilter: "blur(18px) saturate(1.25)",
        WebkitBackdropFilter: "blur(18px) saturate(1.25)",
        borderRadius: 24,
        boxShadow: "0 28px 70px rgba(10,37,64,0.28), 0 8px 24px rgba(0,191,240,0.14)",
        border: `1px solid ${CYAN}66`,
        fontFamily: FONT,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, ${CYAN} 0%, #009FC8 100%)`,
          color: "#fff",
          padding: "13px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 12,
              background: "rgba(255,255,255,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
          >
            <Siren size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", lineHeight: 1.2 }}>
              Blitz promocional
            </div>
            <div style={{ marginTop: 3, fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", opacity: 0.78 }}>
              Agenda de hoje
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              minWidth: 28,
              height: 24,
              padding: "0 8px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.18)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 900,
            }}
            title={`${active.length} blitz agendada${active.length === 1 ? "" : "s"}`}
          >
            {active.length}
          </span>
          <button
            onClick={() => setMinimized(true)}
            style={{ background: "rgba(255,255,255,0.16)", border: "none", borderRadius: 999, width: 28, height: 28, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s ease" }}
            title="Minimizar"
            aria-label="Minimizar box de blitz"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => setDismissed(true)}
            style={{ background: "rgba(255,255,255,0.16)", border: "none", borderRadius: 999, width: 28, height: 28, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s ease" }}
            title="Fechar"
            aria-label="Fechar box de blitz"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div style={{ padding: 14 }}>
        <div
          key={currentBlitz.id}
          className="animate-in fade-in slide-in-from-right-2 duration-300"
          style={{
            position: "relative",
            background: "linear-gradient(145deg, #FFFFFF 0%, #F4FCFE 100%)",
            border: `1px solid ${CYAN}33`,
            borderRadius: 18,
            padding: 16,
            boxShadow: "0 10px 30px rgba(10,37,64,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: -35, right: -30, width: 100, height: 100, borderRadius: 999, background: `${CYAN}10`, pointerEvents: "none" }} />

          <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                <span style={{ color: CYAN, fontSize: 9, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" }}>
                  Cliente
                </span>
                <span style={{ width: 18, height: 1, background: `${CYAN}66` }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: DARK, fontWeight: 900, fontSize: 16, lineHeight: 1.2 }}>
                <Building2 size={16} color={CYAN} style={{ flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{currentBlitz.cliente}</span>
              </div>
            </div>
            <span
              style={{
                flexShrink: 0,
                padding: "5px 9px",
                borderRadius: 999,
                background: `${LIME}33`,
                border: `1px solid ${LIME}`,
                color: DARK,
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: 0.7,
                textTransform: "uppercase",
              }}
            >
              Agendada
            </span>
          </div>

          <div style={{ position: "relative", display: "grid", gridTemplateColumns: currentBlitz.equipe ? "1fr 1fr" : "1fr", gap: 8, marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 12, background: `${CYAN}0D`, border: `1px solid ${CYAN}1F` }}>
              <div style={{ width: 28, height: 28, borderRadius: 9, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: CYAN, boxShadow: "0 3px 10px rgba(10,37,64,0.07)" }}>
                <Clock size={14} />
              </div>
              <div>
                <div style={{ color: "#64748B", fontSize: 8, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>Horário</div>
                <div style={{ marginTop: 2, color: DARK, fontSize: 12, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
                  {currentBlitz.horario?.slice(0, 5)}{currentBlitz.horario_fim ? ` – ${currentBlitz.horario_fim.slice(0, 5)}` : ""}
                </div>
              </div>
            </div>

            {currentBlitz.equipe && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 12, background: `${CYAN}0D`, border: `1px solid ${CYAN}1F`, minWidth: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: 9, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: CYAN, boxShadow: "0 3px 10px rgba(10,37,64,0.07)", flexShrink: 0 }}>
                  <Users size={14} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#64748B", fontSize: 8, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>Equipe</div>
                  <div style={{ marginTop: 2, color: DARK, fontSize: 11, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {currentBlitz.equipe}
                  </div>
                </div>
              </div>
            )}
          </div>

          {currentBlitz.observacoes && (
            <div style={{ position: "relative", marginTop: 10, padding: "10px 12px", borderRadius: 12, background: "#F8FAFC", borderLeft: `3px solid ${CYAN}` }}>
              <div style={{ color: "#64748B", fontSize: 8, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>
                Observações
              </div>
              <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: "#475569" }}>{currentBlitz.observacoes}</p>
            </div>
          )}

          <button
            onClick={() => encerrar(currentBlitz)}
            style={{
              position: "relative",
              marginTop: 12,
              width: "100%",
              height: 38,
              borderRadius: 999,
              background: `linear-gradient(135deg, ${LIME} 0%, #B8E82D 100%)`,
              color: DARK,
              border: "none",
              fontWeight: 900,
              fontSize: 10,
              letterSpacing: 1,
              textTransform: "uppercase",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              cursor: "pointer",
              boxShadow: "0 7px 18px rgba(198,240,60,0.3)",
              transition: "all 0.2s ease",
            }}
          >
            <Check size={14} /> Marcar blitz como encerrada
          </button>
        </div>

        {active.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
            <button
              onClick={() => navigateBlitz(-1)}
              style={{ width: 36, height: 36, borderRadius: 999, background: "#FFFFFF", border: `1px solid ${CYAN}40`, color: DARK, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 12px rgba(10,37,64,0.08)", transition: "all 0.2s ease" }}
              title="Blitz anterior"
              aria-label="Mostrar blitz anterior"
            >
              <ChevronLeft size={18} />
            </button>

            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              {active.map((b, index) => (
                <button
                  key={b.id}
                  onClick={() => setActiveIndex(index)}
                  aria-label={`Mostrar blitz ${index + 1}`}
                  title={`Blitz ${index + 1}: ${b.cliente}`}
                  style={{
                    width: index === activeIndex ? 22 : 6,
                    height: 6,
                    padding: 0,
                    border: "none",
                    borderRadius: 999,
                    background: index === activeIndex ? CYAN : `${CYAN}33`,
                    cursor: "pointer",
                    transition: "all 0.25s ease",
                  }}
                />
              ))}
              <span style={{ marginLeft: 5, color: "#64748B", fontSize: 9, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                {activeIndex + 1} de {active.length}
              </span>
            </div>

            <button
              onClick={() => navigateBlitz(1)}
              style={{ width: 36, height: 36, borderRadius: 999, background: CYAN, border: "none", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 6px 16px rgba(0,191,240,0.28)", transition: "all 0.2s ease" }}
              title="Próxima blitz"
              aria-label="Mostrar próxima blitz"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
