import { useEffect, useRef, useState } from "react";
import { Undo2, MessagesSquare, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { isRadioId, radioChatChannelId } from "@/lib/playerRadioChatScope";
import "@/styles/ott-tv-chat.css";

interface ChatMessage {
  id: string;
  channel_id: string;
  nome: string;
  message: string;
  created_at: string;
  avatar_url?: string | null;
}

interface Props {
  radioUserId?: string | null;
  onClose: () => void;
}

const validRadio = (id?: string | null) => isRadioId(id) ? id : null;

/** Chat TV: leitura pública e participação apenas pelo celular autenticado.
 * A chave é sempre a rádio, NUNCA o canal, a estação padrão nem o domínio.
 */
export default function OttTvChat({ radioUserId, onClose }: Props) {
  const slug = window.location.pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
  const [resolvedRadioId, setResolvedRadioId] = useState<string | null>(() => validRadio(radioUserId));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showQr, setShowQr] = useState(false);
  const [error, setError] = useState("");
  const fetchSequence = useRef(0);
  const channelId = radioChatChannelId(resolvedRadioId);

  useEffect(() => {
    const suppliedId = validRadio(radioUserId);
    if (suppliedId) {
      setResolvedRadioId(suppliedId);
      return;
    }
    let active = true;
    setResolvedRadioId(null);
    if (!/^[a-z0-9_-]+$/.test(slug)) return;
    const getRadio = async () => {
      const { data, error: loadError } = await playerSupabase.functions.invoke("public-player-data", { body: { slug } });
      if (!active) return;
      const found = validRadio((data as { userId?: string })?.userId);
      if (loadError || !found) setError("Rádio não identificada. Não é possível abrir um chat compartilhado.");
      else { setResolvedRadioId(found); setError(""); }
    };
    void getRadio();
    return () => { active = false; };
  }, [radioUserId, slug]);

  useEffect(() => {
    setMessages([]);
    setShowQr(false);
    if (!channelId) return;
    let active = true;
    let latest = 0;
    const loadMessages = async () => {
      const current = ++latest;
      const expiration = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data, error: readError } = await playerSupabase.from("player_chat_messages")
        .select("*")
        .eq("channel_id", channelId)
        .gte("created_at", expiration)
        .order("created_at", { ascending: false })
        .limit(5);
      if (!active || current !== latest) return;
      if (readError) { setError("Não foi possível carregar as conversas."); return; }
      setError("");
      setMessages(((data || []) as ChatMessage[]).filter(m => m.channel_id === channelId).reverse());
    };
    const realtime = playerSupabase.channel(`ott-tv-chat-${channelId}-${++fetchSequence.current}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "player_chat_messages", filter: `channel_id=eq.${channelId}` }, payload => {
        const message = payload.new as ChatMessage;
        if (message.channel_id !== channelId) return;
        setMessages(previous => [...previous.filter(item => item.id !== message.id), message]
          .sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(-5));
      })
      .subscribe();
    void loadMessages();
    const interval = window.setInterval(() => void loadMessages(), 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
      void playerSupabase.removeChannel(realtime);
    };
  }, [channelId]);

  /* NEXO_CHAT_QR_PRODUCAO_V5: celular acessa site publico, Player permanece local */
  const phoneUrl = channelId && slug && resolvedRadioId
    ? `https://housemix.nexobrasil.net/${encodeURIComponent(slug)}/pair?mode=chat&radio=${encodeURIComponent(resolvedRadioId)}`
    : "";

  return (
    <aside className="ott-tv-chat" aria-label="Conversa ao vivo" onKeyDown={event => {
      if (event.key === "Escape" || event.key === "Backspace") { event.preventDefault(); onClose(); }
    }}>
      <div className="ott-tv-chat-top">
        <button type="button" className="ott-tv-chat-back" onClick={onClose} aria-label="Voltar" data-ott-initial>
          <Undo2 aria-hidden="true" />
        </button>
      </div>
      {showQr ? (
        <div className="ott-tv-chat-qr">
          <h2>Entre na conversa</h2>
          <p>Escaneie no celular, faça login e envie sua mensagem.</p>
          {phoneUrl ? <div className="ott-tv-chat-qr-code"><QRCodeSVG value={phoneUrl} size={240} level="M" includeMargin /></div> : <p role="status">{"Preparando QR Code..."}</p>}
          <button type="button" className="ott-tv-chat-qr-return" onClick={() => setShowQr(false)}>Ver mensagens</button>
        </div>
      ) : (
        <>
          <button type="button" className="ott-tv-chat-join" onClick={() => setShowQr(true)} disabled={!phoneUrl}>
            <span>entrar na conversa</span><MessagesSquare aria-hidden="true" />
          </button>
          <div className="ott-tv-chat-messages" aria-live="polite" aria-relevant="additions text">
            {messages.length === 0 && !error && <p className="ott-tv-chat-empty">Aguardando mensagens da rádio.</p>}
            {messages.map(item => (
              <article key={item.id} className="ott-tv-chat-message">
                {item.avatar_url ? <img src={item.avatar_url} alt="" onError={e => { e.currentTarget.src = "/avatars/usr-default.png"; }} /> : <span className="ott-tv-chat-initial">{item.nome.slice(0,1).toUpperCase()}</span>}
                <div><strong>{item.nome}</strong><p>{item.message}</p></div>
              </article>
            ))}
          </div>
        </>
      )}
      {error && <p className="ott-tv-chat-error" role="alert"><RefreshCw aria-hidden="true" /> {error}</p>}
    </aside>
  );
}
