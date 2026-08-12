import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Siren, Minus, Check, ChevronUp, Clock, Users, Building2, X, Maximize2 } from "lucide-react";
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
    return items.filter(b => {
      if (b.horario_fim && b.horario_fim.slice(0, 5) <= hm) return false;
      return true;
    });
  }, [items, tick]);

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
          title="Restaurar e fechar a janela"
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
        position: "fixed", left: "var(--onair-left, 18px)", bottom: 18, zIndex: 60, width: 320, paddingLeft: "var(--onair-left-offset, 0px)",
        background: "rgba(255,255,255,0.96)", backdropFilter: "blur(8px)",
        borderRadius: 22, boxShadow: "0 24px 60px rgba(10,37,64,0.35)",
        border: `2px solid ${CYAN}`, fontFamily: FONT, overflow: "hidden",
      }}
    >
      <div style={{ background: CYAN, color: "#fff", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>
          <Siren size={14} /> Blitz de hoje
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setMinimized(true)}
            style={{ background: "#00BFF0", border: "none", borderRadius: 999, width: 26, height: 26, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px -4px rgba(0,191,240,0.55)" }}
            title="Minimizar"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => setDismissed(true)}
            style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 999, width: 26, height: 26, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            title="Fechar"
          >
            <X size={14} />
          </button>
        </div>

      </div>
      <div style={{ maxHeight: 340, overflowY: "auto", padding: 10 }}>
        {active.map(b => (
          <div key={b.id} style={{ background: "#fff", border: `1px solid ${CYAN}33`, borderRadius: 14, padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: DARK, fontWeight: 900, fontSize: 13 }}>
              <Building2 size={12} color={CYAN} /> {b.cliente}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6, fontSize: 11, color: "#475569" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <Clock size={10} /> {b.horario?.slice(0, 5)}{b.horario_fim ? `–${b.horario_fim.slice(0, 5)}` : ""}
              </span>
              {b.equipe && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Users size={10} /> {b.equipe}</span>}
            </div>
            {b.observacoes && <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748B" }}>{b.observacoes}</p>}
            <button
              onClick={() => encerrar(b)}
              style={{
                marginTop: 8, width: "100%", height: 34, borderRadius: 999,
                background: LIME, color: DARK, border: "none", fontWeight: 800,
                fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer",
              }}
            >
              <Check size={14} /> Dar blitz como encerrada
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
