import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";

import { Loader2 } from "lucide-react";

/**
 * Tela de "Bem-vindo" para acesso via TV: gera um código de 4 dígitos e um
 * QR code que aponta para /:userSlug/pair?code=XXXX. Ao ser confirmado no
 * celular, um canal Realtime notifica esta tela para entrar no player.
 */
export default function PlayerTvWelcome() {
  const { userSlug: rawSlug } = useParams();
  const userSlug = (rawSlug || "").toLowerCase();
  const navigate = useNavigate();

  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [radioName, setRadioName] = useState<string>("");
  const [radioLogo, setRadioLogo] = useState<string>("");
  const [claimedName, setClaimedName] = useState<string | null>(null);
  const tvSessionId = useMemo(() => {
    try {
      const k = `nexohub_tv_session_${userSlug}`;
      let v = localStorage.getItem(k);
      if (!v) {
        v = crypto.randomUUID();
        localStorage.setItem(k, v);
      }
      return v;
    } catch {
      return crypto.randomUUID();
    }
  }, [userSlug]);
  const claimedRef = useRef(false);

  // Busca metadata pública da rádio (logo + nome).
  useEffect(() => {
    if (!userSlug) return;
    (async () => {
      try {
        const data = await fetchPublicPlayerData(userSlug, "bootstrap");
        const nome = data?.empresa?.nome_empresa || data?.empresa?.nome || userSlug;
        const logo = data?.empresa?.logo_url || data?.empresa?.logo || "";
        setRadioName(String(nome).toUpperCase());
        setRadioLogo(String(logo || ""));
      } catch {
        setRadioName(userSlug.toUpperCase());
      }
    })();
  }, [userSlug]);

  // Gera código de pareamento.
  useEffect(() => {
    if (!userSlug) return;
    let cancelled = false;
    (async () => {
      setError(null);
      const { data, error: fnErr } = await supabase.functions.invoke("tv-pair-create", {
        body: { userSlug, tvSessionId },
      });
      if (cancelled) return;
      if (fnErr || !data?.ok) {
        setError("Não foi possível gerar o código. Tente novamente.");
        return;
      }
      setCode(data.code);
      setExpiresAt(data.expiresAt);
    })();
    return () => { cancelled = true; };
  }, [userSlug, tvSessionId]);

  // Escuta Realtime aguardando o claim.
  useEffect(() => {
    if (!code) return;
    const channel = supabase
      .channel(`tv-pair-${code}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tv_pairing_codes", filter: `code=eq.${code}` },
        (payload: any) => {
          const row = payload?.new;
          if (!row || claimedRef.current) return;
          if (row.status === "claimed") {
            claimedRef.current = true;
            try {
              const guest = {
                name: row.paired_name || row.paired_email || "Convidado",
                email: row.paired_email || null,
                avatar_url: row.paired_avatar || "/avatars/usr-default.png",
                pairedAt: Date.now(),
              };
              localStorage.setItem(`nexohub_tv_guest_${userSlug}`, JSON.stringify(guest));
            } catch { /* ignore */ }
            setClaimedName(row.paired_name || row.paired_email || "Convidado");
            setTimeout(() => {
              navigate(`/${userSlug}/player`, { replace: true });
            }, 1200);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [code, userSlug, navigate]);

  // Regenera automaticamente ao expirar.
  useEffect(() => {
    if (!expiresAt) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(() => {
      setCode(null);
      setExpiresAt(null);
    }, ms + 500);
    return () => clearTimeout(t);
  }, [expiresAt]);

  const pairUrl = code
    ? `${window.location.origin}/${userSlug}/pair?code=${code}`
    : `${window.location.origin}/${userSlug}/pair`;

  return (
    <div className="min-h-screen w-full antialiased bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col p-tv-safe">
      {/* Cabeçalho da rádio */}
      <div className="flex items-center gap-tv-4">
        {radioLogo ? (
          <img src={radioLogo} alt={radioName} className="h-20 w-20 rounded-2xl object-contain bg-white/5 p-2" />
        ) : null}
        <div>
          <div className="text-tv-caption uppercase tracking-widest text-slate-400">Player</div>
          <div className="text-tv-h1 font-tv-bold">{radioName || userSlug.toUpperCase()}</div>
        </div>
      </div>

      {/* Corpo */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-tv-6 items-center mt-tv-8">
        {/* Coluna esquerda: mensagem */}
        <div className="max-w-2xl">
          <div className="text-tv-h2 font-tv-bold leading-tight">
            Bem-vindo ao player da <span className="text-primary">{radioName || userSlug.toUpperCase()}</span>.
          </div>
          <p className="text-tv-body text-slate-300 mt-tv-3">
            Para uma melhor interação, faça login lendo o QR code ao lado com a câmera do seu celular.
          </p>
          <p className="text-tv-caption text-slate-400 mt-tv-2">
            Ou digite no navegador: <span className="text-slate-200 font-medium">{window.location.host}/{userSlug}/pair</span>
          </p>

          {claimedName && (
            <div className="mt-tv-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 px-tv-4 py-tv-3 text-emerald-200">
              <div className="text-tv-body font-tv-bold">Olá, {claimedName}!</div>
              <div className="text-tv-caption opacity-80">Entrando no player…</div>
            </div>
          )}
        </div>

        {/* Coluna direita: QR + código */}
        <div className="flex flex-col items-center justify-center gap-tv-4">
          <div className="rounded-3xl bg-white p-6 shadow-2xl">
            {code ? (
              <QRCodeSVG value={pairUrl} size={280} level="M" includeMargin={false} />
            ) : (
              <div className="w-[280px] h-[280px] flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-slate-500" />
              </div>
            )}
          </div>
          <div className="text-center">
            <div className="text-tv-caption uppercase tracking-widest text-slate-400">Código de pareamento</div>
            <div className="text-6xl font-tv-bold tracking-[0.4em] mt-2 text-white">
              {code ? code : "----"}
            </div>
          </div>
          {error && <div className="text-tv-caption text-red-400">{error}</div>}
        </div>
      </div>

      <div className="mt-tv-6 text-tv-caption text-slate-500">
        O código expira em 15 minutos. Gere um novo aguardando a atualização automática.
      </div>
    </div>
  );
}
