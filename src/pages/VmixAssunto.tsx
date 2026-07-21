import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// 5 fontes suportadas (uma delas SINK)
const FONT_CDN: Record<string, string> = {
  Sink: "https://fonts.cdnfonts.com/css/sink",
  "Bebas Neue": "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap",
  Anton: "https://fonts.googleapis.com/css2?family=Anton&display=swap",
  "Playfair Display": "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&display=swap",
  Montserrat: "https://fonts.googleapis.com/css2?family=Montserrat:wght@800;900&display=swap",
};

const NOTO_EMOJI_HREF = "https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap";

const timeToSec = (v: string | null | undefined) => {
  if (!v) return -1;
  const [h = "0", m = "0", s = "0"] = v.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
};

const DAY_MAP: Record<number, string> = {
  0: "domingo", 1: "segunda", 2: "terca", 3: "quarta", 4: "quinta", 5: "sexta", 6: "sabado",
};

const normDay = (s: string) =>
  (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/-feira$/, "")
    .trim();

async function loadActiveProgramId(userId: string): Promise<string | null> {
  const now = new Date();
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const dayName = DAY_MAP[now.getDay()];
  const { data: progs } = await supabase
    .from("programas")
    .select("id, horario_inicio, horario_fim, dias_semana, variavel, data_variavel")
    .eq("user_id", userId)
    .eq("ativo", true);
  if (!progs) return null;
  const today = now.toISOString().slice(0, 10);
  for (const p of progs) {
    const start = timeToSec(p.horario_inicio);
    const end = timeToSec(p.horario_fim);
    if (start < 0 || end < 0) continue;
    const runsToday = p.variavel
      ? String(p.data_variavel || "").slice(0, 10) === today
      : (p.dias_semana || []).some((d: string) => normDay(d) === dayName);
    if (!runsToday) continue;
    if (end > start ? nowSec >= start && nowSec < end : nowSec >= start || nowSec < end) {
      return p.id;
    }
  }
  return null;
}

export default function VmixAssunto() {
  const { userId } = useParams<{ userId: string }>();
  const [mensagens, setMensagens] = useState<string[]>([]);
  const [fontFamily, setFontFamily] = useState<string>("Inter");
  const [rotationSec, setRotationSec] = useState<number>(7);
  const [bgColor, setBgColor] = useState<string>("#ffffff");
  const [textColor, setTextColor] = useState<string>("#000000");
  const [idx, setIdx] = useState(0);

  // Injeta as fontes uma vez
  useEffect(() => {
    const hrefs = [...Object.values(FONT_CDN), NOTO_EMOJI_HREF];
    const created: HTMLLinkElement[] = [];
    hrefs.forEach((href) => {
      if (document.querySelector(`link[href="${href}"]`)) return;
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
      created.push(l);
    });
    document.body.style.margin = "0";
    document.body.style.background = bgColor;
    return () => { created.forEach((l) => l.remove()); };
  }, [bgColor]);

  // Carrega e recarrega a cada 8s (troca de programa / mensagens editadas)
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      const programaId = await loadActiveProgramId(userId);
      let query = supabase
        .from("broadcast_assuntos")
        .select("mensagens, mensagens_enabled, font_family, rotation_seconds, bg_color, text_color, updated_at")
        .eq("user_id", userId);
      const { data } = programaId
        ? await query.eq("programa_id", programaId).maybeSingle()
        : await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (cancelled) return;
      const raw = Array.isArray(data?.mensagens) ? (data!.mensagens as string[]) : [];
      const en = Array.isArray((data as any)?.mensagens_enabled)
        ? ((data as any).mensagens_enabled as boolean[])
        : [];
      const arr = raw
        .map((s, i) => ({ s: (s || "").trim(), on: en[i] ?? true }))
        .filter((x) => x.on && x.s.length > 0)
        .map((x) => x.s);
      setMensagens(arr);
      setFontFamily(data?.font_family || "Inter");
      const rs = Number((data as any)?.rotation_seconds);
      setRotationSec(Number.isFinite(rs) && rs >= 1 ? rs : 7);
      // Defaults: fundo branco, texto preto
      setBgColor(((data as any)?.bg_color as string) || "#ffffff");
      setTextColor(((data as any)?.text_color as string) || "#000000");
    };
    load();
    const t = setInterval(load, 8000);
    return () => { cancelled = true; clearInterval(t); };
  }, [userId]);

  // Rotaciona mensagens
  useEffect(() => {
    if (mensagens.length <= 1) { setIdx(0); return; }
    const ms = Math.max(1, rotationSec) * 1000;
    const t = setInterval(() => setIdx((i) => (i + 1) % mensagens.length), ms);
    return () => clearInterval(t);
  }, [mensagens.length, rotationSec]);

  const texto = mensagens[idx] || "";

  const fontStack = useMemo(() => {
    // Emojis renderizam via Noto Color Emoji como fallback
    return `"${fontFamily}", "Noto Color Emoji", system-ui, sans-serif`;
  }, [fontFamily]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: bgColor,
        color: textColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4vh 6vw",
        overflow: "hidden",
      }}
    >
      <div
        key={idx + texto}
        style={{
          fontFamily: fontStack,
          fontWeight: 800,
          fontSize: "clamp(48px, 9vw, 220px)",
          lineHeight: 1.05,
          textAlign: "center",
          letterSpacing: "-0.01em",
          animation: "assuntoFade 500ms ease-out",
          maxWidth: "100%",
        }}
      >
        {texto}
      </div>
      <style>{`
        @keyframes assuntoFade {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
