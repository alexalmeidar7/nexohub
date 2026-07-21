import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// 5 fontes suportadas — cada uma com seu peso ótimo.
// "Sink" é servida via Google Fonts (Alfa Slab One) por confiabilidade em CEF/vMix;
// o cdnfonts.com estava fora do ar e a família não era aplicada.
const FONT_CDN: Record<string, string> = {
  Sink: "https://fonts.googleapis.com/css2?family=Alfa+Slab+One&display=swap",
  "Bebas Neue": "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap",
  Anton: "https://fonts.googleapis.com/css2?family=Anton&display=swap",
  "Playfair Display": "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&display=swap",
  Montserrat: "https://fonts.googleapis.com/css2?family=Montserrat:wght@800;900&display=swap",
};

// Nome real da família CSS (para os casos onde o rótulo salvo difere do family name servido)
const FONT_CSS_FAMILY: Record<string, string> = {
  Sink: "Alfa Slab One",
};

// Peso ideal por família (algumas só têm 400)
const FONT_WEIGHT: Record<string, number> = {
  Sink: 400,
  "Bebas Neue": 400,
  Anton: 400,
  "Playfair Display": 900,
  Montserrat: 900,
  Inter: 800,
};

// Razão cap-height / em-box de cada família (medido empiricamente).
// Emojis são desenhados no em-box inteiro; escalamos para casar com a altura das letras maiúsculas.
const FONT_CAP_RATIO: Record<string, number> = {
  Sink: 0.72,             // Alfa Slab One
  "Bebas Neue": 0.74,
  Anton: 0.72,
  "Playfair Display": 0.68,
  Montserrat: 0.70,
  Inter: 0.72,
};
// Deslocamento vertical do emoji (em unidades em) para alinhar ao meio da cap-height.
const FONT_EMOJI_SHIFT: Record<string, number> = {
  Sink: 0.08,
  "Bebas Neue": 0.06,
  Anton: 0.08,
  "Playfair Display": 0.10,
  Montserrat: 0.08,
  Inter: 0.08,
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
  const [fontsTick, setFontsTick] = useState(0);

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
    document.documentElement.style.background = bgColor;
    document.documentElement.style.color = textColor;
    document.body.style.margin = "0";
    document.body.style.background = bgColor;
    document.body.style.color = textColor;
    return () => { created.forEach((l) => l.remove()); };
  }, [bgColor, textColor]);

  // Aguarda fontes específicas carregarem e força re-fit
  useEffect(() => {
    const resolved = FONT_CSS_FAMILY[fontFamily] || fontFamily;
    const weight = FONT_WEIGHT[fontFamily] ?? 800;
    const fonts = (document as any).fonts;
    if (!fonts?.load) return;
    Promise.all([
      fonts.load(`${weight} 100px "${resolved}"`).catch(() => null),
      fonts.load(`400 100px "Noto Color Emoji"`).catch(() => null),
    ]).then(() => setFontsTick((n) => n + 1));
  }, [fontFamily]);

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
    const resolved = FONT_CSS_FAMILY[fontFamily] || fontFamily;
    return `"${resolved}", "${fontFamily}", "Noto Color Emoji", system-ui, sans-serif`;
  }, [fontFamily]);

  const fontWeight = FONT_WEIGHT[fontFamily] ?? 800;
  const emojiScale = FONT_CAP_RATIO[fontFamily] ?? 0.72;
  const emojiShiftEm = FONT_EMOJI_SHIFT[fontFamily] ?? 0.08;

  // Quebra o texto em "tokens" preservando emojis e espaços para animar caractere-a-caractere
  const tokens = useMemo(() => Array.from(texto), [texto]);

  // Detecta emoji / símbolos pictográficos para normalizar tamanho vs. glifos alfanuméricos
  const isEmoji = (ch: string) => /\p{Extended_Pictographic}/u.test(ch);

  // Auto-fit: reduz o font-size até o texto caber em UMA linha na largura disponível.
  // Medimos a partir de um "mirror" oculto (texto plano, sem animação/spans) para evitar
  // que transforms de entrada dos caracteres distorçam a largura durante o fit.
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLSpanElement>(null);
  const [fitFontPx, setFitFontPx] = useState<number>(140);

  useLayoutEffect(() => {
    const fit = () => {
      const container = containerRef.current;
      const mirror = mirrorRef.current;
      if (!container || !mirror) return;
      const available = container.clientWidth;
      if (available <= 0) return;
      const safe = Math.floor(available * 0.99);
      const maxByHeight = Math.floor(container.clientHeight * 0.7);
      let size = Math.min(240, maxByHeight);
      mirror.style.fontSize = `${size}px`;
      let guard = 80;
      while (mirror.scrollWidth > safe && size > 16 && guard-- > 0) {
        size -= Math.max(2, Math.floor(size * 0.05));
        mirror.style.fontSize = `${size}px`;
      }
      setFitFontPx(size);
    };
    fit();
    const t1 = setTimeout(fit, 150);
    const t2 = setTimeout(fit, 600);
    const t3 = setTimeout(fit, 1500);
    const ro = new ResizeObserver(fit);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => { ro.disconnect(); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [texto, fontStack, fontWeight, fontsTick]);

  // Constrói o texto para o mirror já com emojis reduzidos (mesma escala do visível)
  const mirrorNodes = useMemo(() => tokens.map((ch, i) => {
    const emoji = isEmoji(ch);
    if (!emoji) return ch === " " ? "\u00A0" : ch;
    return (
      <span
        key={`m-${i}`}
        style={{
          fontSize: `${emojiScale}em`,
          fontFamily: '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
        }}
      >{ch}</span>
    );
  }), [tokens, emojiScale]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        background: bgColor,
        color: textColor,
        fontFamily: fontStack,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "4vh 5vw",
        overflow: "hidden",
      }}
    >
      {/* Mirror invisível usado apenas para medir a largura real do texto */}
      <span
        ref={mirrorRef}
        aria-hidden
        style={{
          position: "absolute",
          left: -99999,
          top: 0,
          visibility: "hidden",
          whiteSpace: "nowrap",
          fontFamily: fontStack,
          fontWeight,
          letterSpacing: "-0.01em",
          lineHeight: 1.1,
          pointerEvents: "none",
        }}
      >
        {mirrorNodes}
      </span>

      <div
        key={idx + texto}
        ref={textRef}
        style={{
          fontFamily: fontStack,
          fontWeight,
          color: textColor,
          fontSize: `${fitFontPx}px`,
          lineHeight: 1.1,
          textAlign: "left",
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
          display: "block",
          maxWidth: "100%",
        }}
      >
        {tokens.map((ch, i) => {
          const emoji = isEmoji(ch);
          return (
            <span
              key={`${idx}-${i}`}
              style={{
                display: "inline-block",
                whiteSpace: "pre",
                animation: `assuntoCharIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both`,
                animationDelay: `${i * 28}ms`,
                transformOrigin: "50% 100%",
              }}
            >
              {emoji ? (
                // Span interno faz o dimensionamento e deslocamento do emoji
                // sem conflitar com o transform da animação do span externo.
                <span
                  style={{
                    display: "inline-block",
                    fontSize: `${emojiScale}em`,
                    lineHeight: 0,
                    verticalAlign: "baseline",
                    transform: `translateY(${emojiShiftEm}em)`,
                    fontFamily: '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
                  }}
                >
                  {ch}
                </span>
              ) : (
                ch === " " ? "\u00A0" : ch
              )}
            </span>
          );
        })}
      </div>


      <style>{`
        @keyframes assuntoCharIn {
          0%   { opacity: 0; transform: translateY(0.6em) rotate(-6deg) scale(0.85); filter: blur(6px); }
          60%  { opacity: 1; filter: blur(0); }
          100% { opacity: 1; transform: translateY(0) rotate(0) scale(1); filter: blur(0); }
        }
      `}</style>
    </div>
  );
}


