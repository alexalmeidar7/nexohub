import { useState, useEffect, useRef } from "react";
import { UserCircle, Pencil, LogIn, Star } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { getMusicData } from "@/lib/musicData";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const AVATARS = [
  "/avatars/usr-default.png",
  "/avatars/usr-1.png",
  "/avatars/usr-2.png",
  "/avatars/usr-3.png",
  "/avatars/usr-4.png",
  "/avatars/usr-5.png",
  "/avatars/usr-6.png",
  "/avatars/usr-7.png",
  "/avatars/usr-8.png",
];

interface Profile {
  nome: string;
  email: string;
  cpf: string;
  whatsapp: string;
  sexo: string;
  estado: string;
  cidade: string;
  setor: string;
  data_nascimento: string;
  avatar_url: string;
}

interface WelcomeScreenProps {
  userName: string;
  avatarUrl?: string | null;
  backgroundUrl?: string | null;
  channelName?: string;
  logoUrl?: string | null;
  onContinue: () => void;
  onLoginSuccess?: () => void;
}

const COUNTDOWN_SECONDS = 3;

export default function WelcomeScreen({
  userName,
  avatarUrl,
  backgroundUrl,
  channelName,
  logoUrl,
  onContinue,
  onLoginSuccess,
}: WelcomeScreenProps) {
  const { user, signOut } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const interactedRef = useRef(false);
  const [points, setPoints] = useState(0);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [bgColors, setBgColors] = useState<[string, string]>(["rgba(40,40,50,0.85)", "rgba(15,15,20,0.9)"]);

  useEffect(() => {
    if (!backgroundUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 32; c.height = 32;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 32, 32);
        const sample = (x: number, y: number) => {
          const d = ctx.getImageData(x, y, 1, 1).data;
          return `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
        };
        setBgColors([sample(6, 6), sample(26, 26)]);
      } catch {}
    };
    img.src = backgroundUrl;
  }, [backgroundUrl]);

  const [profile, setProfile] = useState<Profile>({
    nome: userName,
    email: user?.email || "",
    cpf: "", whatsapp: "", sexo: "",
    estado: "", cidade: "", setor: "", data_nascimento: "",
    avatar_url: avatarUrl || "/avatars/usr-default.png",
  });


  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("user_id", user.id).single().then(({ data }) => {
      if (data) {
        const d = data as any;
        setProfile({
          nome: d.nome || userName,
          email: d.email || user.email || "",
          cpf: d.cpf || "",
          whatsapp: d.whatsapp || "",
          sexo: d.sexo || "",
          estado: d.estado || "",
          cidade: d.cidade || "",
          setor: d.setor || "",
          data_nascimento: d.data_nascimento || "",
          avatar_url: d.avatar_url || "/avatars/usr-default.png",
        });
      }
    });
    // Simple points tally from music likes
    supabase.from("music_likes").select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => setPoints(((count ?? 0) as number) * 4));
  }, [user, userName]);

  // === Background sequence: delayed reveal + intercalated artist image ===
  const [bgVisible, setBgVisible] = useState(false);
  const [artistImg, setArtistImg] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<{ titulo: string; artista: string } | null>(null);
  const [showArtistBg, setShowArtistBg] = useState(false);
  const artistImgCacheRef = useRef<Record<string, string>>({});

  // Delay background reveal by 1.5s so text/avatar show first
  useEffect(() => {
    const t = setTimeout(() => setBgVisible(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Poll now-playing every 4s
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const tick = async () => {
      const d = getMusicData(user.id);
      if (!d?.music) { if (!cancelled) { setNowPlaying(null); setArtistImg(null); } return; }
      const { titulo, artista } = d.music;
      const isBreak = ["break", "vinhetas", "hora certa", "desconhecido"].includes((artista || "").toLowerCase());
      if (!artista || isBreak) { if (!cancelled) { setNowPlaying(null); setArtistImg(null); } return; }
      if (!cancelled) setNowPlaying({ titulo, artista });
      const key = artista.toLowerCase();
      if (artistImgCacheRef.current[key]) {
        if (!cancelled) setArtistImg(artistImgCacheRef.current[key]);
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("fetch-artist-image", { body: { artist: artista } });
        if (cancelled) return;
        if (!error && data?.ok && data?.url) {
          artistImgCacheRef.current[key] = data.url;
          setArtistImg(data.url);
        } else {
          setArtistImg(null);
        }
      } catch { if (!cancelled) setArtistImg(null); }
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user?.id]);

  // Alternate channel bg <-> artist bg every 5s (only when artist image available)
  useEffect(() => {
    if (!artistImg) { setShowArtistBg(false); return; }
    const id = setInterval(() => setShowArtistBg((v) => !v), 5000);
    return () => clearInterval(id);
  }, [artistImg]);



  const cancelAutoAdvance = () => {
    interactedRef.current = true;
    setInteracted(true);
  };


  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      user_id: user.id,
      nome: profile.nome, email: profile.email,
      cpf: profile.cpf || null,
      whatsapp: profile.whatsapp, sexo: profile.sexo,
      estado: profile.estado, cidade: profile.cidade,
      setor: profile.setor || null,
      data_nascimento: profile.data_nascimento || null,
      avatar_url: profile.avatar_url,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error("Erro ao salvar perfil");
    else { toast.success("Perfil atualizado!"); setEditOpen(false); }
  };

  const [authError, setAuthError] = useState<string | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const confirmLogout = async () => {
    setLoggingOut(true);
    try {
      // Player é um sistema à parte: deslogar localmente SEM redirecionar
      // para a tela de login do admin. Permanecemos nesta tela de boas-vindas,
      // que então mostrará o estado "não autenticado" com botões entrar/cadastre-se.
      try { localStorage.setItem("nexohub_keep_connected", "false"); } catch {}
      try { localStorage.removeItem("nexohub_backup_session"); } catch {}
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch { /* ignore */ }
      // Força o estado local imediatamente para não depender do refresh do provider
      setAuthMode(null);
      setAuthError(null);
    } catch (e) {
      toast.error("Não foi possível sair. Tente novamente.");
    } finally {
      setLoggingOut(false);
      setLogoutConfirmOpen(false);
    }
  };

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + window.location.pathname,
      });
      if (result?.error) {
        const msg = (result.error as any)?.message || "não foi possível conectar com o google. tente novamente.";
        setAuthError(msg);
        toast.error("Falha ao entrar com Google");
        setSigningIn(false);
        return;
      }
      if (result?.redirected) return;
      onLoginSuccess?.();
    } catch (e: any) {
      const msg = e?.message || "erro inesperado ao conectar com o google.";
      setAuthError(msg);
      toast.error("Falha ao entrar com Google");
      setSigningIn(false);
    }
  };

  const displayName = profile.nome || userName;
  const displayAvatar = profile.avatar_url || "/avatars/usr-default.png";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black text-white">
      {/* Background: channel thumb intercalated with artist image (Ken Burns) */}
      <style>{`
        @keyframes ws-kenburns {
          0%   { transform: scale(1.05) translateX(0%); }
          100% { transform: scale(1.22) translateX(-6%); }
        }
        .ws-kenburns { animation: ws-kenburns 30s ease-in-out infinite alternate; will-change: transform; }
        .ws-bg-layer { transition: opacity 1.6s ease-in-out; }
      `}</style>
      <div className="absolute inset-0">
        {backgroundUrl ? (
          <>
            {/* Channel thumb layer */}
            <img
              src={backgroundUrl}
              alt=""
              className={`ws-kenburns ws-bg-layer absolute inset-0 w-full h-full object-cover`}
              style={{
                filter: "brightness(0.55) saturate(1.05)",
                opacity: bgVisible && !showArtistBg ? 1 : 0,
              }}
              draggable={false}
            />
            {/* Artist image layer */}
            {artistImg && (
              <img
                src={artistImg}
                alt=""
                className={`ws-kenburns ws-bg-layer absolute inset-0 w-full h-full object-cover`}
                style={{
                  filter: "brightness(0.5) saturate(1.1) grayscale(0.15)",
                  opacity: bgVisible && showArtistBg ? 1 : 0,
                  animationDirection: "alternate-reverse",
                }}
                draggable={false}
              />
            )}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.9) 100%)",
              }}
            />
          </>
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 80% at 30% 20%, #1e2430 0%, #131519 55%, #08090b 100%)",
            }}
          />
        )}
      </div>

      {/* Bottom-left: now-playing overlay (visible while artist bg is showing) */}
      {nowPlaying && (
        <div
          className="absolute bottom-8 left-8 z-20 ws-bg-layer"
          style={{ opacity: showArtistBg && artistImg ? 1 : 0 }}
        >
          <div className="text-[11px] uppercase tracking-[0.28em] text-white/60 mb-1">
            tocando agora
          </div>
          <div className="text-white text-lg font-medium leading-tight max-w-[520px] truncate">
            {nowPlaying.titulo}
          </div>
          <div className="text-white/70 text-sm leading-tight max-w-[520px] truncate">
            {nowPlaying.artista}
          </div>
        </div>
      )}


      {/* Top-right: Google identity pill */}
      {user && (() => {
        const meta: any = (user as any).user_metadata || {};
        const googleName = meta.full_name || meta.name || displayName;
        const googlePic = meta.avatar_url || meta.picture || displayAvatar;
        return (
          <div className="absolute top-6 right-8 z-20 animate-fade-in">
            <div
              className="flex items-center gap-3 pl-2 pr-4 py-2 rounded-full"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(255,255,255,0.14)",
                backdropFilter: "blur(14px)",
                boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
              }}
            >
              <img
                src={googlePic}
                alt={googleName}
                referrerPolicy="no-referrer"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = displayAvatar; }}
                className="w-8 h-8 rounded-full object-cover"
                style={{ border: "1px solid rgba(255,255,255,0.2)" }}
                draggable={false}
              />
              <div className="flex flex-col leading-tight">
                <span className="text-[13px] font-medium text-white">{googleName}</span>
                {user.email && (
                  <span className="text-[10px] text-white/55">{user.email}</span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Left-aligned welcome layout */}
      <div className="absolute inset-0 z-10 flex flex-col justify-start px-8 sm:px-14 pt-10 sm:pt-14 animate-fade-in">
        {/* Heading */}
        <h1
          className="font-semibold leading-tight lowercase"
          style={{
            fontSize: "clamp(22px, 2.4vw, 34px)",
            letterSpacing: "-0.01em",
            textShadow: "0 2px 20px rgba(0,0,0,0.55)",
          }}
        >
          {user ? "bem vindo de volta" : "bem vindo"}
        </h1>

        {/* Avatar + info row */}
        <div className="mt-8 sm:mt-10 flex items-start gap-5">
          {user ? (
            <>
              <button
                onClick={() => { cancelAutoAdvance(); onContinue(); }}
                className="group relative shrink-0 outline-none"
                aria-label="Entrar no player"
              >
                <div
                  className="relative rounded-[28px] overflow-hidden transition-all duration-500 ease-out group-hover:scale-[1.04]"
                  style={{
                    width: "clamp(110px, 11vw, 150px)",
                    height: "clamp(110px, 11vw, 150px)",
                    background: `linear-gradient(145deg, ${bgColors[0]}, ${bgColors[1]})`,
                    border: "1px solid rgba(255,255,255,0.14)",
                    boxShadow: "0 18px 50px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
                  }}
                >
                  <img
                    src={displayAvatar}
                    alt={displayName}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                  <span
                    onClick={(e) => { e.stopPropagation(); cancelAutoAdvance(); setEditOpen(true); }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background: "rgba(0,0,0,0.35)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      backdropFilter: "blur(6px)",
                    }}
                    aria-label="Editar perfil"
                    role="button"
                  >
                    <Pencil className="w-3 h-3 text-white/75" strokeWidth={1.5} />
                  </span>
                </div>
              </button>

              <div className="flex flex-col gap-2 pt-2">
                <div
                  className="font-medium leading-none"
                  style={{
                    fontSize: "clamp(20px, 1.9vw, 28px)",
                    textShadow: "0 2px 20px rgba(0,0,0,0.55)",
                  }}
                >
                  {displayName}
                </div>
                <div className="flex items-center gap-2 text-white/85">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => {
                      const rating = Math.min(5, Math.max(0, Math.round((points / 100) * 2) / 2));
                      const filled = i < Math.floor(rating);
                      const half = !filled && i < rating;
                      return (
                        <Star
                          key={i}
                          size={13}
                          fill={filled ? "#ffffff" : half ? "url(#half-star)" : "transparent"}
                          style={{ color: filled || half ? "#ffffff" : "rgba(255,255,255,0.35)" }}
                        />
                      );
                    })}
                  </div>
                  <span className="text-xs text-white/70">{points} pts</span>
                </div>
                <button
                  onClick={() => { cancelAutoAdvance(); setLogoutConfirmOpen(true); }}
                  className="mt-1 self-start text-[11px] lowercase px-3 py-1 rounded-full transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.10)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  sair
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setAuthMode("login")}
                disabled={signingIn}
                aria-busy={signingIn}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium lowercase transition-all hover:scale-[1.03] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.20)",
                  backdropFilter: "blur(10px)",
                }}
              >
                {signingIn ? (
                  <span className="inline-block w-4 h-4 rounded-full border-2 border-white/25 border-t-white animate-spin" aria-hidden />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                {signingIn ? "autenticando..." : "entrar"}
              </button>
              <button
                onClick={() => setAuthMode("signup")}
                disabled={signingIn}
                aria-busy={signingIn}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium lowercase transition-all hover:scale-[1.03] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  backdropFilter: "blur(10px)",
                }}
              >
                {signingIn && (
                  <span className="inline-block w-4 h-4 rounded-full border-2 border-white/25 border-t-white animate-spin" aria-hidden />
                )}
                cadastre-se
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Logout Confirmation */}
      <Dialog open={logoutConfirmOpen} onOpenChange={(v) => { if (!loggingOut) setLogoutConfirmOpen(v); }}>
        <DialogContent
          className="max-w-sm p-0"
          style={{ backgroundColor: "#1f1f1f", border: "1px solid #323431", color: "#d9d9d9" }}
        >
          <div className="px-6 pt-6 pb-4">
            <DialogHeader>
              <DialogTitle className="text-[15px] font-semibold" style={{ color: "#d9d9d9" }}>
                sair da conta?
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs mt-2" style={{ color: "#d9d9d9", opacity: 0.65 }}>
              você continuará nesta tela e precisará entrar novamente para acessar seu perfil.
            </p>
          </div>
          <div className="px-6 pb-6 pt-2 flex items-center justify-end gap-2">
            <button
              onClick={() => setLogoutConfirmOpen(false)}
              disabled={loggingOut}
              className="px-5 h-10 rounded-full text-sm transition-colors disabled:opacity-60"
              style={{ backgroundColor: "transparent", color: "#d9d9d9", border: "1px solid #323431" }}
            >
              cancelar
            </button>
            <button
              onClick={confirmLogout}
              disabled={loggingOut}
              className="px-6 h-10 rounded-full text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60 inline-flex items-center gap-2"
              style={{ backgroundColor: "#323431", color: "#d9d9d9", border: "1px solid #3d3f3c" }}
            >
              {loggingOut && (
                <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin" aria-hidden />
              )}
              {loggingOut ? "saindo..." : "sim, sair"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Login / Signup Popup */}
      <Dialog
        open={authMode !== null}
        onOpenChange={(v) => {
          if (signingIn) return; // block close during auth
          if (!v) { setAuthMode(null); setAuthError(null); }
        }}
      >
        <DialogContent
          className="bg-neutral-950 border-white/10 text-white max-w-sm"
          onInteractOutside={(e) => { if (signingIn) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (signingIn) e.preventDefault(); }}
          onPointerDownOutside={(e) => { if (signingIn) e.preventDefault(); }}
          {...(signingIn ? { "aria-busy": true } : {})}
        >
          <DialogHeader>
            <DialogTitle className="text-white lowercase">
              {authMode === "signup" ? "cadastre-se" : "entrar"}
            </DialogTitle>
          </DialogHeader>
          <fieldset
            disabled={signingIn}
            className="relative border-0 p-0 m-0 min-w-0 disabled:opacity-95"
            style={signingIn ? { pointerEvents: "auto" } : undefined}
          >
            <div className="flex flex-col items-center gap-4 py-4">
              <p className="text-white/70 text-sm text-center">
                {authMode === "signup"
                  ? "crie sua conta usando o google para começar"
                  : "acesse sua conta com o google"}
              </p>

              {authError && (
                <div
                  role="alert"
                  className="w-full rounded-lg px-3 py-2 text-xs text-red-200 border border-red-500/30 bg-red-500/10"
                >
                  <div className="font-medium mb-0.5">não foi possível conectar</div>
                  <div className="opacity-80 break-words">{authError}</div>
                </div>
              )}

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={signingIn}
                aria-busy={signingIn}
                className="w-full inline-flex items-center justify-center gap-3 px-5 py-3 rounded-full text-sm font-medium text-black bg-white hover:bg-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {signingIn ? (
                  <span className="inline-block w-4 h-4 rounded-full border-2 border-black/20 border-t-black animate-spin" aria-hidden />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.7 6.4 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c10.8 0 19.5-8.7 19.5-19.5 0-1.2-.1-2.3-.4-3.5z"/>
                    <path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.7 15.1 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.7 6.4 29.1 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.1z"/>
                    <path fill="#4CAF50" d="M24 43.5c5.1 0 9.7-1.9 13.2-5l-6.1-5c-2 1.4-4.4 2.3-7.1 2.3-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39 16.2 43.5 24 43.5z"/>
                    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.1 5C41.7 34.9 43.5 30 43.5 24c0-1.2-.1-2.3-.4-3.5z"/>
                  </svg>
                )}
                {signingIn
                  ? (authError ? "tentando novamente..." : "conectando ao google...")
                  : authError
                    ? "tentar novamente"
                    : authMode === "signup" ? "cadastrar com google" : "entrar com google"}
              </button>

              {signingIn && (
                <p className="text-[11px] text-white/40 text-center">
                  uma janela do google será aberta. conclua o login por lá.
                </p>
              )}
            </div>

            {signingIn && (
              <div
                aria-hidden
                className="absolute inset-0 cursor-wait"
                style={{ background: "transparent" }}
                onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onPointerDownCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
              />
            )}
          </fieldset>
        </DialogContent>
      </Dialog>



      {/* Edit Profile Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (v) cancelAutoAdvance(); }}>
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto p-0"
          style={{ backgroundColor: "#1f1f1f", border: "1px solid #323431", color: "#d9d9d9" }}
        >
          <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: "#323431" }}>
            <DialogHeader>
              <DialogTitle className="text-[15px] font-semibold uppercase tracking-wide" style={{ color: "#d9d9d9" }}>
                Editar Perfil
              </DialogTitle>
              <p className="text-xs mt-1" style={{ color: "#d9d9d9", opacity: 0.55 }}>
                complete seus dados para uma experiência personalizada
              </p>
            </DialogHeader>
          </div>

          <div className="px-6 py-5">
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={() => setAvatarPickerOpen(true)}
                className="w-20 h-20 rounded-2xl overflow-hidden transition-all shrink-0"
                style={{ border: "1px solid #323431", backgroundColor: "#323431" }}
              >
                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              </button>
              <div className="flex flex-col">
                <span className="text-sm font-medium" style={{ color: "#d9d9d9" }}>{profile.nome || "seu perfil"}</span>
                <button
                  onClick={() => setAvatarPickerOpen(true)}
                  className="text-xs mt-1 self-start px-3 py-1 rounded-full transition-colors"
                  style={{ backgroundColor: "#323431", color: "#d9d9d9" }}
                >
                  alterar avatar
                </button>
              </div>
            </div>

            {(() => {
              const inputStyle: React.CSSProperties = {
                backgroundColor: "#323431",
                border: "1px solid #323431",
                color: "#d9d9d9",
                height: 40,
                borderRadius: 10,
                padding: "0 14px",
                fontSize: 13,
                width: "100%",
                outline: "none",
              };
              const labelCls = "text-[11px] uppercase tracking-wider mb-1.5 block";
              const labelStyle: React.CSSProperties = { color: "#d9d9d9", opacity: 0.55 };
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls} style={labelStyle}>Nome</label>
                      <input style={inputStyle} value={profile.nome}
                        onChange={e => setProfile(p => ({ ...p, nome: e.target.value }))} />
                    </div>
                    <div>
                      <label className={labelCls} style={labelStyle}>CPF</label>
                      <input style={inputStyle} value={profile.cpf}
                        onChange={e => setProfile(p => ({ ...p, cpf: e.target.value }))}
                        placeholder="000.000.000-00" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls} style={labelStyle}>WhatsApp</label>
                      <input style={inputStyle} value={profile.whatsapp}
                        onChange={e => setProfile(p => ({ ...p, whatsapp: e.target.value }))}
                        placeholder="(00) 00000-0000" />
                    </div>
                    <div>
                      <label className={labelCls} style={labelStyle}>E-mail</label>
                      <input style={{ ...inputStyle, opacity: 0.7 }} value={profile.email} disabled />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls} style={labelStyle}>Sexo</label>
                      <select style={inputStyle} value={profile.sexo}
                        onChange={e => setProfile(p => ({ ...p, sexo: e.target.value }))}>
                        <option value="">Selecione</option>
                        <option value="masculino">Masculino</option>
                        <option value="feminino">Feminino</option>
                        <option value="outro">Outro</option>
                        <option value="prefiro_nao_dizer">Prefiro não dizer</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls} style={labelStyle}>Data de nascimento</label>
                      <input type="date" style={inputStyle} value={profile.data_nascimento}
                        onChange={e => setProfile(p => ({ ...p, data_nascimento: e.target.value }))} />
                    </div>
                  </div>

                  <div className="grid grid-cols-[90px_1fr] gap-3">
                    <div>
                      <label className={labelCls} style={labelStyle}>UF</label>
                      <input style={inputStyle} value={profile.estado} maxLength={2}
                        onChange={e => setProfile(p => ({ ...p, estado: e.target.value.toUpperCase() }))}
                        placeholder="SP" />
                    </div>
                    <div>
                      <label className={labelCls} style={labelStyle}>Cidade</label>
                      <input style={inputStyle} value={profile.cidade}
                        onChange={e => setProfile(p => ({ ...p, cidade: e.target.value }))} />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls} style={labelStyle}>Bairro / Setor</label>
                    <input style={inputStyle} value={profile.setor}
                      onChange={e => setProfile(p => ({ ...p, setor: e.target.value }))}
                      placeholder="Bairro ou região" />
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="px-6 pb-6 pt-2 flex items-center justify-end gap-2">
            <button
              onClick={() => setEditOpen(false)}
              className="px-5 h-10 rounded-full text-sm transition-colors"
              style={{ backgroundColor: "transparent", color: "#d9d9d9", border: "1px solid #323431" }}
            >
              cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 h-10 rounded-full text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: "#323431", color: "#d9d9d9", border: "1px solid #3d3f3c" }}
            >
              {saving ? "salvando..." : "salvar"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Avatar Picker */}
      <Dialog open={avatarPickerOpen} onOpenChange={setAvatarPickerOpen}>
        <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Escolha seu avatar</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 py-2">
            {AVATARS.map(av => (
              <button
                key={av}
                onClick={() => { setProfile(p => ({ ...p, avatar_url: av })); setAvatarPickerOpen(false); }}
                className={`w-20 h-20 rounded-2xl overflow-hidden border-2 transition-colors mx-auto ${
                  profile.avatar_url === av ? "border-white" : "border-transparent hover:border-white/40"
                }`}
              >
                <img src={av} alt="Avatar" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
