import { Fragment } from "react";
import OttCommercialSlot from "./OttCommercialSlot";
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
  // NEXO_CHAT_SESSAO_TV_V1: ID estavel do aparelho TV. O QR permanece o mesmo apos reiniciar.
  const [chatTvDeviceId] = useState<string>(() => {
    try {
      const key = 'nexo_player_tv_chat_device_id_v1';
      const saved = localStorage.getItem(key);
      if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      const id = [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
      localStorage.setItem(key,id);
      return id;
    } catch { return ''; }
  });
  const [chatHasParticipant, setChatHasParticipant] = useState(false);
  const [error, setError] = useState("");
  const fetchSequence = useRef(0);
  const joinRef = useRef<HTMLButtonElement>(null);
  const returnRef = useRef<HTMLButtonElement>(null);
  const channelId = radioChatChannelId(resolvedRadioId);
  // Consulta apenas o estado desta TV; reiniciar o Player nao encerra o chat.
  useEffect(() => {
    setChatHasParticipant(false);
    if (!resolvedRadioId || !chatTvDeviceId) return;
    let mounted = true;
    const refresh = async () => {
      const { data, error } = await playerSupabase.rpc('player_tv_chat_is_active' as never, {
        p_radio_user_id: resolvedRadioId,
        p_tv_device_id: chatTvDeviceId,
      } as never);
      if (!mounted || error) return;
      const joined = data === true;
      setChatHasParticipant(joined);
      if (joined) setShowQr(false);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [resolvedRadioId, chatTvDeviceId]);

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
  const chatSessionPhoneUrl = phoneUrl && chatTvDeviceId
    ? phoneUrl + (phoneUrl.includes('?') ? '&' : '?') + 'tv=' + encodeURIComponent(chatTvDeviceId)
    : '';


  // NEXO_V7_1_CHAT_FOCUS: foco no entrar, ou voltar para mensagens apos QR.
  useEffect(()=>{const id=requestAnimationFrame(()=>{if(showQr)returnRef.current?.focus({preventScroll:true});else if(phoneUrl)joinRef.current?.focus({preventScroll:true});});return()=>cancelAnimationFrame(id);},[showQr,phoneUrl]);
  return (
    <aside className="ott-tv-chat" aria-label="Conversa ao vivo" onKeyDown={event => {
      if (event.key === "Escape" || event.key === "Backspace") { event.preventDefault(); onClose(); }
    }}>
      <div className="ott-tv-chat-top">
        <button type="button" className="ott-tv-chat-back" onClick={onClose} aria-label="Voltar">
          <Undo2 aria-hidden="true" />
        </button>
      </div>
      {showQr && !chatHasParticipant ? (
        <div className="ott-tv-chat-qr">
          <h2>Entre na conversa</h2>
          <p>Escaneie no celular, faça login e envie sua mensagem.</p>
          {chatSessionPhoneUrl ? <div className="ott-tv-chat-qr-code"><QRCodeSVG value={chatSessionPhoneUrl} size={240} level="M" includeMargin /></div> : <p role="status">{"Preparando QR Code..."}</p>}
          <button type="button" className="ott-tv-chat-qr-return" ref={returnRef} onClick={() => setShowQr(false)}>Ver mensagens</button>
        </div>
      ) : (
        <>
          <h2 className="ott-tv-chat-title">chat ao vivo</h2>
          <button type="button" className="ott-tv-chat-join" ref={joinRef} data-ott-initial style={{ display: chatHasParticipant ? "none" : undefined }} onClick={() => setShowQr(true)} disabled={!chatSessionPhoneUrl}>
            <span>entrar na conversa</span><MessagesSquare aria-hidden="true" />
          </button>
          <div className="ott-tv-chat-messages" aria-live="polite" aria-relevant="additions text">
            {messages.length === 0 && !error && <p className="ott-tv-chat-empty">Aguardando mensagens dos ouvintes.</p>}
            {messages.map((item,index) => (
              <Fragment key={item.id}><article className="ott-tv-chat-message">
                {item.avatar_url ? <img src={item.avatar_url} alt="" onError={e => { e.currentTarget.src = "/avatars/usr-default.png"; }} /> : <span className="ott-tv-chat-initial">{item.nome.slice(0,1).toUpperCase()}</span>}
                <div><strong>{item.nome}</strong><p>{item.message}</p></div>
              </article>{(index+1)%5===0&&<OttCommercialSlot radioId={radioUserId} placement="chat_ads"/>}</Fragment>
            ))}
          </div>
        </>
      )}
      {error && <p className="ott-tv-chat-error" role="alert"><RefreshCw aria-hidden="true" /> {error}</p>}
    </aside>
  );
}
