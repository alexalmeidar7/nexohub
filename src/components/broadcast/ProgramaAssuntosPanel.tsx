import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Check, Loader2, Smile, Save } from "lucide-react";

const CYAN = "#00BFF0";
const NAVY_BORDER = "rgba(255,255,255,0.08)";
const NAVY_DEEP = "#0b1220";

// 5 fontes disponíveis (inclui SINK)
export const ASSUNTO_FONTS = [
  "Sink",
  "Bebas Neue",
  "Anton",
  "Playfair Display",
  "Montserrat",
];

// Emojis coloridos rápidos
const QUICK_EMOJIS = [
  "🔥", "🎧", "🎙️", "📻", "📢", "🚨", "⚡", "⭐", "✨", "🎉",
  "❤️", "💚", "💙", "💛", "🧡", "💜", "🎵", "🎶", "🏆", "🥇",
  "😂", "😍", "🤩", "🙌", "👏", "👍", "🙏", "💯", "☀️", "🌧️",
];

interface Props {
  activeProgramaId: string | null;
  programaNome: string;
  userId: string | undefined;
}

export default function ProgramaAssuntosPanel({ activeProgramaId, programaNome, userId }: Props) {
  const [mensagens, setMensagens] = useState<string[]>(["", "", ""]);
  const [fontFamily, setFontFamily] = useState<string>("Inter");
  const [rotationSec, setRotationSec] = useState<number>(7);
  const [bgColor, setBgColor] = useState<string>("#ffffff");
  const [textColor, setTextColor] = useState<string>("#000000");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emojiOpenIdx, setEmojiOpenIdx] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([null, null, null]);
  const [previewIdx, setPreviewIdx] = useState(0);

  // Load required web fonts once for preview
  useEffect(() => {
    const id = "assunto-preview-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Anton&family=Playfair+Display:wght@700&family=Montserrat:wght@700&family=Noto+Color+Emoji&display=swap";
    document.head.appendChild(link);
    const sink = document.createElement("link");
    sink.rel = "stylesheet";
    sink.href = "https://fonts.cdnfonts.com/css/sink";
    document.head.appendChild(sink);
  }, []);

  // Rotate preview messages every 7s
  const visibleMensagens = useMemo(
    () => mensagens.map((m) => m.trim()).filter((m) => m.length > 0),
    [mensagens],
  );
  useEffect(() => {
    if (visibleMensagens.length <= 1) {
      setPreviewIdx(0);
      return;
    }
    const ms = Math.max(1, rotationSec) * 1000;
    const t = setInterval(() => {
      setPreviewIdx((i) => (i + 1) % visibleMensagens.length);
    }, ms);
    return () => clearInterval(t);
  }, [visibleMensagens.length, rotationSec]);
  useEffect(() => {
    if (previewIdx >= visibleMensagens.length) setPreviewIdx(0);
  }, [visibleMensagens.length, previewIdx]);

  // Load current program assuntos
  useEffect(() => {
    if (!userId || !activeProgramaId) {
      setMensagens(["", "", ""]);
      setFontFamily("Inter");
      return;
    }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("broadcast_assuntos")
        .select("mensagens, font_family, rotation_seconds, bg_color, text_color")
        .eq("user_id", userId)
        .eq("programa_id", activeProgramaId)
        .maybeSingle();
      const arr = Array.isArray(data?.mensagens) ? (data!.mensagens as string[]) : [];
      setMensagens([arr[0] || "", arr[1] || "", arr[2] || ""]);
      setFontFamily(data?.font_family || "Inter");
      const rs = Number((data as any)?.rotation_seconds);
      setRotationSec(Number.isFinite(rs) && rs >= 1 ? rs : 7);
      setLoading(false);
    })();
  }, [userId, activeProgramaId]);

  const publicUrl = useMemo(() => {
    if (!userId) return "";
    return `${window.location.origin}/vmix/assunto/${userId}`;
  }, [userId]);

  const copyUrl = async () => {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const insertEmoji = (idx: number, emoji: string) => {
    const input = inputRefs.current[idx];
    const current = mensagens[idx] || "";
    if (input && typeof input.selectionStart === "number") {
      const start = input.selectionStart;
      const end = input.selectionEnd ?? start;
      const next = current.slice(0, start) + emoji + current.slice(end);
      const arr = [...mensagens];
      arr[idx] = next;
      setMensagens(arr);
      requestAnimationFrame(() => {
        input.focus();
        const pos = start + emoji.length;
        input.setSelectionRange(pos, pos);
      });
    } else {
      const arr = [...mensagens];
      arr[idx] = current + emoji;
      setMensagens(arr);
    }
    setEmojiOpenIdx(null);
  };

  const handleSave = async () => {
    if (!userId || !activeProgramaId) {
      toast.error("Nenhum programa no ar. Cadastre/programe um programa ativo.");
      return;
    }
    setSaving(true);
    const payload = mensagens.map((m) => m.trim());
    const { error } = await supabase
      .from("broadcast_assuntos")
      .upsert(
        {
          user_id: userId,
          programa_id: activeProgramaId,
          mensagens: payload,
          font_family: fontFamily,
          rotation_seconds: Math.max(1, Math.min(120, Math.round(rotationSec))),
        } as any,
        { onConflict: "user_id,programa_id" },
      );
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar assuntos");
      console.error(error);
    } else {
      toast.success("Assuntos salvos");
    }
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: NAVY_DEEP,
    border: `1px solid ${NAVY_BORDER}`,
    color: "#fff",
  };

  return (
    <div className="rounded-lg" style={{ backgroundColor: NAVY_DEEP, border: `1px solid ${NAVY_BORDER}` }}>
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: `1px solid ${NAVY_BORDER}` }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#ffffff80" }}>
            Assuntos do Programa
          </span>
          {programaNome && (
            <span className="text-[10px] font-bold truncate" style={{ color: CYAN }}>
              · {programaNome}
            </span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !activeProgramaId}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider disabled:opacity-40"
          style={{ backgroundColor: CYAN, color: "#001018" }}
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
          Salvar
        </button>
      </div>

      <div className="p-3 space-y-2">
        {loading && (
          <div className="text-[10px]" style={{ color: "#ffffff60" }}>Carregando...</div>
        )}
        {[0, 1, 2].map((i) => (
          <div key={i} className="relative">
            <label className="text-[9px] font-bold uppercase mb-1 block" style={{ color: "#ffffff60" }}>
              Mensagem {i + 1}
            </label>
            <div className="flex items-center gap-1">
              <input
                ref={(el) => (inputRefs.current[i] = el)}
                type="text"
                value={mensagens[i] || ""}
                onChange={(e) => {
                  const arr = [...mensagens];
                  arr[i] = e.target.value;
                  setMensagens(arr);
                }}
                placeholder={`Assunto ${i + 1} (opcional)`}
                className="flex-1 px-2 py-1.5 rounded text-xs"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => setEmojiOpenIdx(emojiOpenIdx === i ? null : i)}
                className="p-1.5 rounded"
                style={{ ...inputStyle, color: "#ffffff80" }}
                title="Inserir emoji"
              >
                <Smile size={13} />
              </button>
            </div>
            {emojiOpenIdx === i && (
              <div
                className="absolute right-0 top-full mt-1 z-50 p-2 rounded-lg shadow-xl grid grid-cols-10 gap-1"
                style={{ backgroundColor: NAVY_DEEP, border: `1px solid ${NAVY_BORDER}`, width: 300 }}
              >
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => insertEmoji(i, em)}
                    className="text-lg hover:bg-white/10 rounded"
                    style={{ padding: 2 }}
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="pt-2" style={{ borderTop: `1px solid ${NAVY_BORDER}` }}>
          <label className="text-[9px] font-bold uppercase mb-1 block" style={{ color: "#ffffff60" }}>
            Fonte de exibição
          </label>
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className="w-full px-2 py-1.5 rounded text-xs"
            style={inputStyle}
          >
            {ASSUNTO_FONTS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div className="pt-2" style={{ borderTop: `1px solid ${NAVY_BORDER}` }}>
          <label className="text-[9px] font-bold uppercase mb-1 flex items-center justify-between" style={{ color: "#ffffff60" }}>
            <span>Intervalo de rotação</span>
            <span style={{ color: CYAN }}>{rotationSec}s</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={60}
              step={1}
              value={rotationSec}
              onChange={(e) => setRotationSec(Number(e.target.value))}
              className="flex-1 accent-cyan-400"
            />
            <input
              type="number"
              min={1}
              max={120}
              value={rotationSec}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setRotationSec(Math.max(1, Math.min(120, Math.round(n))));
              }}
              className="w-16 px-2 py-1 rounded text-xs text-center"
              style={inputStyle}
            />
          </div>
          <p className="text-[9px] mt-1" style={{ color: "#ffffff40" }}>
            Tempo (segundos) que cada mensagem fica na tela antes de trocar.
          </p>
        </div>

        <div className="pt-2" style={{ borderTop: `1px solid ${NAVY_BORDER}` }}>
          <label className="text-[9px] font-bold uppercase mb-1 block" style={{ color: "#ffffff60" }}>
            Pré-visualização ao vivo (navegador do vMix)
          </label>
          <div
            className="w-full rounded overflow-hidden relative flex items-center justify-center"
            style={{
              backgroundColor: "#ffffff",
              border: `1px solid ${NAVY_BORDER}`,
              aspectRatio: "16 / 9",
            }}
          >
            {visibleMensagens.length === 0 ? (
              <span style={{ color: "#00000040", fontSize: 12, fontFamily: "Inter, sans-serif" }}>
                Nenhuma mensagem para pré-visualizar
              </span>
            ) : (
              <div
                key={previewIdx}
                className="px-6 text-center leading-tight"
                style={{
                  color: "#000",
                  fontFamily: `"${fontFamily}", "Noto Color Emoji", sans-serif`,
                  fontSize: "clamp(18px, 4.5vw, 44px)",
                  fontWeight: 700,
                  animation: "assuntoFade 500ms ease-out",
                  wordBreak: "break-word",
                }}
              >
                {visibleMensagens[previewIdx]}
              </div>
            )}
            {visibleMensagens.length > 1 && (
              <div className="absolute bottom-1 right-2 flex gap-1">
                {visibleMensagens.map((_, i) => (
                  <span
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      backgroundColor: i === previewIdx ? "#000" : "#00000030",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          <style>{`@keyframes assuntoFade { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: none;} }`}</style>
        </div>

        <div className="pt-2" style={{ borderTop: `1px solid ${NAVY_BORDER}` }}>
          <label className="text-[9px] font-bold uppercase mb-1 block" style={{ color: "#ffffff60" }}>
            URL para o navegador do vMix
          </label>
          <div className="flex items-center gap-1">
            <input
              type="text"
              readOnly
              value={publicUrl}
              className="flex-1 px-2 py-1.5 rounded text-[10px]"
              style={inputStyle}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={copyUrl}
              className="p-1.5 rounded"
              style={{ ...inputStyle, color: copied ? CYAN : "#ffffff80" }}
              title="Copiar URL"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <p className="text-[9px] mt-1" style={{ color: "#ffffff40" }}>
            Fundo branco, texto preto. Mensagens rotacionam a cada 7s. Suporta emojis coloridos.
          </p>
        </div>
      </div>
    </div>
  );
}
