/* NEXO_CHAT_PHONE_PRODUCAO_V5 */
import { useEffect, useMemo, useState, type FormEvent, type CSSProperties } from "react";
import type { User } from "@supabase/supabase-js";
import { Undo2, Loader2, MessagesSquare, Send } from "lucide-react";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { isRadioId, radioChatChannelId } from "@/lib/playerRadioChatScope";
import { clearChatOAuthReturn, saveChatOAuthReturn } from "@/lib/chatOAuthReturn";
import "@/styles/ott-tv-chat.css";

interface ChatMessage { id: string; channel_id: string; nome: string; message: string; created_at: string }

/** Formulário mobile do QR do chat. Não altera o fluxo de login/pareamento da TV. */
export default function TvChatPhone({ userSlug }: { userSlug: string }) {
  // O chat pertence ao Player, não à conta administrativa do House Mix.
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const { data: { subscription } } = playerSupabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user || null);
      setLoading(false);
      if (session?.user) clearChatOAuthReturn();
    });
    void playerSupabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setUser(data.session?.user || null);
      setLoading(false);
      if (data.session?.user) clearChatOAuthReturn();
      if (error) console.warn("Nexo Chat: failed to restore player login", error.message);
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestedRadio = params.get("radio") || "";
  const [validatedRadio, setValidatedRadio] = useState<string | null>(null);
  const [validating, setValidating] = useState(true);
  const [brandColor, setBrandColor] = useState("#e20a12");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const channelId = radioChatChannelId(validatedRadio);
  const displayName = String(user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "Ouvinte").slice(0, 100);


  useEffect(() => {
    let active = true;
    const validate = async () => {
      setValidating(true);
      setValidatedRadio(null);
      if (!isRadioId(requestedRadio) || !/^[a-z0-9_-]+$/.test(userSlug)) {
        setError("QR Code inválido para esta rádio.");
        setValidating(false);
        return;
      }
      try {
        const { data, error: lookupError } = await playerSupabase.functions.invoke("public-player-data", { body: { slug: userSlug } });
        if (!active) return;
        if (lookupError || (data as { userId?: string })?.userId?.toLowerCase() !== requestedRadio.toLowerCase()) {
          setError("Este QR Code não pertence à rádio selecionada.");
          return;
        }
        const playerColors = (data as { playerColors?: { dominantColor?: string; homeAccent?: string } })?.playerColors;
        const candidate = playerColors?.dominantColor || playerColors?.homeAccent || "";
        if (/^#[0-9a-f]{6}$/i.test(candidate)) setBrandColor(candidate);
        setValidatedRadio(requestedRadio);
        setError("");
      } catch {
        if (active) setError("Não foi possível confirmar a rádio. Tente novamente.");
      } finally { if (active) setValidating(false); }
    };
    void validate();
    return () => { active = false; };
  }, [userSlug, requestedRadio]);

  useEffect(() => {
    setMessages([]);
    if (!channelId) return;
    let active = true;
    const load = async () => {
      const { data } = await playerSupabase.from("player_chat_messages")
        .select("id,channel_id,nome,message,created_at")
        .eq("channel_id", channelId)
        .gte("created_at", new Date(Date.now() - 86400000).toISOString())
        .order("created_at", { ascending: false }).limit(5);
      if (active && data) setMessages((data as ChatMessage[]).filter(m => m.channel_id === channelId).reverse());
    };
    const realtime = playerSupabase.channel(`phone-chat-${channelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "player_chat_messages", filter: `channel_id=eq.${channelId}` }, payload => {
        const incoming = payload.new as ChatMessage;
        if (incoming.channel_id !== channelId) return;
        setMessages(prev => [...prev.filter(m => m.id !== incoming.id), incoming]
          .sort((a,b) => a.created_at.localeCompare(b.created_at)).slice(-5));
      }).subscribe();
    void load();
    const poll = window.setInterval(() => void load(), 5000);
    return () => { active = false; clearInterval(poll); void playerSupabase.removeChannel(realtime); };
  }, [channelId]);

  const loginGoogle = async () => {
    setSigningIn(true);
    setError("");
    try {
      const returnTo = `/${userSlug}/pair?mode=chat&radio=${encodeURIComponent(requestedRadio)}`;
      // Login do Player no site publicado; apos Google, retorna ao chat da mesma radio.
      saveChatOAuthReturn(returnTo);
      const { error: loginError } = await playerSupabase.auth.signInWithOAuth({ provider: "google", options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: { prompt: "select_account" },
      }});
      if (loginError) { clearChatOAuthReturn(); setError(loginError.message); }
    } catch { setError("Não foi possível iniciar o login Google."); }
    finally { setSigningIn(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = message.trim();
    if (!user || !channelId || !text || sending) return;
    setSending(true); setError("");
    try {
      const { data: sessionData } = await playerSupabase.auth.getUser();
      if (sessionData.user?.id !== user.id) throw new Error("Faça login novamente para enviar mensagens.");
      const { error: insertError } = await playerSupabase.from("player_chat_messages").insert({
        channel_id: channelId, nome: displayName, cidade: "", message: text,
      });
      if (insertError) throw insertError;
      setMessage("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao enviar. Tente novamente."); }
    finally { setSending(false); }
  };

  return (
    <main className="tv-chat-phone" style={{ "--player-dominant-color": brandColor, fontFamily: "'Montserrat', Arial, sans-serif", minHeight: "100svh", background: "#111", color: "#fff", padding: "24px 20px" } as CSSProperties}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
          <button type="button" aria-label="Voltar" onClick={() => window.history.back()} style={{ width: 44, height: 44, borderRadius: "50%", background: "#303030", display: "grid", placeItems: "center" }}><Undo2 size={23} /></button>
          <MessagesSquare size={28} color="var(--player-dominant-color, #e20a12)" />
          <div><small style={{ opacity:.65 }}>NEXO PLAYER</small><h1 style={{ fontSize: 21, fontWeight: 700 }}>{userSlug.toUpperCase()} · CHAT</h1></div>
        </header>
        {validating ? <p role="status">Confirmando a rádio...</p> : !validatedRadio ? <p role="alert">{error}</p> : (
          <>
            {messages.length > 0 && <section aria-label="Mensagens recentes" style={{ display: "grid", gap: 9, marginBottom: 24 }}>
              {messages.map(m => <div key={m.id} style={{ background: "#303030", borderRadius: 18, padding: "14px 18px" }}><strong>{m.nome}</strong><p style={{ marginTop: 4, overflowWrap:"anywhere" }}>{m.message}</p></div>)}
            </section>}
            {loading ? <p>Verificando login...</p> : !user ? (
              <div style={{ background: "#292929", borderRadius: 22, padding: 22 }}>
                <p style={{ marginBottom: 18 }}>Entre com o Google para enviar mensagens que aparecem na televisão.</p>
                <button type="button" onClick={() => void loginGoogle()} disabled={signingIn} style={{ width: "100%", minHeight: 52, color: "#111", background: "#fff", borderRadius: 14, fontWeight: 700 }}>
                  {signingIn ? "Conectando..." : "Entrar com Google"}
                </button>
              </div>
            ) : (
              <form onSubmit={event => void submit(event)} style={{ background: "#292929", borderRadius: 22, padding: 18 }}>
                <p style={{ marginBottom: 12, fontWeight: 700 }}>Participando como {displayName}</p>
                <label htmlFor="tv-chat-phone-text" style={{ display: "block", opacity:.8, fontSize: 14, marginBottom: 8 }}>Sua mensagem</label>
                <textarea id="tv-chat-phone-text" maxLength={400} rows={4} value={message} onChange={e => setMessage(e.target.value)} placeholder="Escreva aqui..." style={{ display: "block", width: "100%", resize: "vertical", border: 0, outline: 0, borderRadius: 14, background: "#444", padding: 14, color: "#fff" }} />
                <button type="submit" disabled={sending || !message.trim()} style={{ marginTop: 14, width: "100%", minHeight: 50, borderRadius: 15, background: "var(--player-dominant-color, #e20a12)", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
                  {sending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />} {sending ? "Enviando..." : "Enviar mensagem"}
                </button>
              </form>
            )}
          </>
        )}
        {error && validatedRadio && <p role="alert" style={{ color: "#ffb5b5", marginTop: 16 }}>{error}</p>}
      </div>
    </main>
  );
}
