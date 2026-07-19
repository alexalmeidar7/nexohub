import { useState, useEffect, useRef } from "react";
import { UserCircle, Pencil, LogIn, Star, Plus } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useGlobalMusicSync } from "@/hooks/useGlobalMusicSync";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { getMusicData } from "@/lib/musicData";
import { MUSIC_DATA_EVENT } from "@/lib/musicStorageKeys";
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
  initialEditOpen?: boolean;
  userSlug?: string | null;
  publicUserId?: string | null;
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
  initialEditOpen = false,
  userSlug = null,
  publicUserId = null,
}: WelcomeScreenProps) {

  const { user, signOut } = useAuth();
  // Mantém a sincronização da "música no ar" ativa também na tela de boas-vindas,
  // para que a imagem do artista (Deezer) apareça sem depender do PlayerHome.
  useGlobalMusicSync();
  const [editOpen, setEditOpen] = useState(initialEditOpen);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [addProfileOpen, setAddProfileOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileAvatar, setNewProfileAvatar] = useState<string>("/avatars/usr-default.png");
  const [subProfiles, setSubProfiles] = useState<Array<{ id: string; name: string; avatar_url: string }>>([]);

  useEffect(() => {
    if (!user) { setSubProfiles([]); return; }
    try {
      const raw = localStorage.getItem(`nexohub_sub_profiles_${user.id}`);
      setSubProfiles(raw ? JSON.parse(raw) : []);
    } catch { setSubProfiles([]); }
  }, [user?.id]);
  const [saving, setSaving] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const interactedRef = useRef(false);
  const [points, setPoints] = useState(0);
  const [displayedPoints, setDisplayedPoints] = useState(0);

  // Count-up animation for points
  useEffect(() => {
    if (points <= 0) { setDisplayedPoints(0); return; }
    const duration = 1200;
    const start = performance.now();
    const from = 0;
    const to = points;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayedPoints(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [points]);

  // Keyboard navigation on welcome screen (arrows + Enter)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter"," "].includes(e.key)) return;
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-ws-focusable="true"]'))
        .filter(el => el.offsetParent !== null && !el.hasAttribute("disabled"));
      if (nodes.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      let idx = nodes.findIndex(n => n === active);
      if (e.key === "Enter" || e.key === " ") {
        if (idx >= 0) { e.preventDefault(); nodes[idx].click(); }
        return;
      }
      e.preventDefault();
      if (idx < 0) { nodes[0].focus(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") idx = (idx + 1) % nodes.length;
      else idx = (idx - 1 + nodes.length) % nodes.length;
      nodes[idx].focus();
    };
    window.addEventListener("keydown", onKey);
    // auto-focus first item shortly after mount
    const t = window.setTimeout(() => {
      const first = document.querySelector<HTMLElement>('[data-ws-focusable="true"]');
      first?.focus();
    }, 400);
    return () => { window.removeEventListener("keydown", onKey); window.clearTimeout(t); };
  }, [user]);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [bgColors, setBgColors] = useState<[string, string]>(["rgba(40,40,50,0.85)", "rgba(15,15,20,0.9)"]);
  const [prevBgColors, setPrevBgColors] = useState<[string, string] | null>(null);
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    if (!backgroundUrl) return;
    let cancelled = false;
    let blobUrl: string | null = null;

    const applyFromImage = (img: HTMLImageElement) => {
      try {
        const c = document.createElement("canvas");
        c.width = 40; c.height = 40;
        const ctx = c.getContext("2d");
        if (!ctx) return false;
        ctx.drawImage(img, 0, 0, 40, 40);
        const sample = (x: number, y: number) => {
          const d = ctx.getImageData(x, y, 1, 1).data;
          // Boost saturation slightly for richer gradient
          return `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
        };
        // Take samples from opposite quadrants to maximise contrast between the two stops
        const next: [string, string] = [sample(8, 10), sample(30, 28)];
        if (cancelled) return true;
        setBgColors((current) => {
          if (current[0] === next[0] && current[1] === next[1]) return current;
          setPrevBgColors(current);
          setFadeIn(false);
          requestAnimationFrame(() => requestAnimationFrame(() => setFadeIn(true)));
          window.setTimeout(() => { if (!cancelled) { setPrevBgColors(null); setFadeIn(false); } }, 1500);
          return next;
        });
        return true;
      } catch {
        return false;
      }
    };

    // 1st attempt: crossOrigin=anonymous (works when CDN sends CORS headers)
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      if (applyFromImage(img)) return;
      // 2nd attempt: fetch as blob → object URL (same-origin, avoids canvas taint)
      fetch(backgroundUrl, { mode: "cors", cache: "force-cache" })
        .then(r => r.ok ? r.blob() : Promise.reject())
        .then(blob => {
          if (cancelled) return;
          blobUrl = URL.createObjectURL(blob);
          const img2 = new Image();
          img2.onload = () => { if (!cancelled) applyFromImage(img2); };
          img2.src = blobUrl;
        })
        .catch(() => { /* keep previous colors */ });
    };
    img.onerror = () => { /* ignore */ };
    img.src = backgroundUrl;

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
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
  const lastArtistRef = useRef<string | null>(null);
  const alternateTimerRef = useRef<number | null>(null);

  // Delay background reveal by 1.5s so text/avatar show first
  useEffect(() => {
    const t = setTimeout(() => setBgVisible(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Preload an image and only resolve after decode to prevent flicker
  const preloadImage = (url: string) =>
    new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = async () => {
        try { await (img as any).decode?.(); } catch {}
        resolve(url);
      };
      img.onerror = () => reject(new Error("preload failed"));
      img.src = url;
    });

  // Poll now-playing every 4s and react instantly to artist changes.
  // Works for authenticated owner (via localStorage populated by useGlobalMusicSync)
  // AND for public/slug flow (via public-player-data edge function on the tenant).
  useEffect(() => {
    const hasSlug = !!(userSlug && userSlug !== ":userSlug");
    if (!user?.id && !hasSlug && !publicUserId) return;
    let cancelled = false;

    const applyArtistImage = async (artista: string) => {
      const key = artista.toLowerCase();
      let url = artistImgCacheRef.current[key] || null;
      if (!url) {
        try {
          const { data, error } = await supabase.functions.invoke("fetch-artist-image", { body: { artist: artista } });
          if (!error && data?.ok && data?.url) {
            url = data.url as string;
            artistImgCacheRef.current[key] = url;
          }
        } catch {}
      }
      if (cancelled) return;
      if (!url) { setArtistImg(null); return; }
      try { await preloadImage(url); } catch {}
      if (cancelled || lastArtistRef.current?.toLowerCase() !== key) return;
      setArtistImg(url);
      setShowArtistBg(true);
    };

    const readCurrent = async (): Promise<{ titulo: string; artista: string } | null> => {
      // Prefer public endpoint whenever we're on a tenant slug — the auth
      // user's local music data may belong to a different tenant.
      if (hasSlug) {
        try {
          const { data } = await supabase.functions.invoke("public-player-data", {
            body: { slug: userSlug, section: "now_playing" },
          });
          if (data?.artista || data?.musica) {
            return { titulo: String(data.musica || ""), artista: String(data.artista || "") };
          }
        } catch {}
        return null;
      }
      if (user?.id) {
        const d = getMusicData(user.id);
        if (d?.music) return { titulo: d.music.titulo, artista: d.music.artista };
      }
      return null;
    };

    const tick = async () => {
      const cur = await readCurrent();
      if (!cur) {
        if (!cancelled) {
          setNowPlaying((prev) => (prev === null ? prev : null));
          setArtistImg((prev) => (prev === null ? prev : null));
          lastArtistRef.current = null;
        }
        return;
      }
      const { titulo, artista } = cur;
      const isBreak = ["break", "vinhetas", "hora certa", "desconhecido"].includes((artista || "").toLowerCase());
      if (!artista || isBreak) {
        if (!cancelled) {
          setNowPlaying((prev) => (prev === null ? prev : null));
          setArtistImg((prev) => (prev === null ? prev : null));
          lastArtistRef.current = null;
        }
        return;
      }
      const key = artista.toLowerCase();
      const sameArtist = lastArtistRef.current?.toLowerCase() === key;
      if (!cancelled) {
        setNowPlaying((prev) => {
          if (prev && prev.titulo === titulo && prev.artista === artista) return prev;
          return { titulo, artista };
        });
      }
      if (sameArtist) return;
      lastArtistRef.current = artista;
      if (!cancelled) setShowArtistBg(false);
      setTimeout(() => { if (!cancelled) applyArtistImage(artista); }, 250);
    };

    tick();
    const id = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user?.id, userSlug, publicUserId]);


  // Alternate channel bg <-> artist bg every 5s (only when artist image available)
  useEffect(() => {
    if (alternateTimerRef.current) { clearInterval(alternateTimerRef.current); alternateTimerRef.current = null; }
    if (!artistImg) { setShowArtistBg(false); return; }
    alternateTimerRef.current = window.setInterval(() => setShowArtistBg((v) => !v), 5000);
    return () => {
      if (alternateTimerRef.current) { clearInterval(alternateTimerRef.current); alternateTimerRef.current = null; }
    };
  }, [artistImg]);

  // Pré-carregar próximo artista: assim que uma nova música é escrita no
  // localStorage (via useGlobalMusicSync), busca a imagem do novo artista e
  // decodifica em background, mantendo o cache quente antes do próximo tick.
  useEffect(() => {
    if (!user?.id) return;
    const prewarm = async (artista: string) => {
      const key = artista.toLowerCase();
      const isBreak = ["break", "vinhetas", "hora certa", "desconhecido"].includes(key);
      if (!artista || isBreak) return;
      if (artistImgCacheRef.current[key]) return;
      try {
        const { data, error } = await supabase.functions.invoke("fetch-artist-image", { body: { artist: artista } });
        if (error || !data?.ok || !data?.url) return;
        artistImgCacheRef.current[key] = data.url as string;
        // decode em background — resultado só é usado no próximo tick
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = data.url as string;
        try { await (img as any).decode?.(); } catch {}
      } catch {}
    };

    const onMusic = (e: Event) => {
      const detail = (e as CustomEvent).detail as { userId?: string; data?: { artista?: string } } | undefined;
      if (!detail || detail.userId !== user.id) return;
      const artista = detail.data?.artista;
      if (artista) prewarm(artista);
    };
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !e.newValue) return;
      if (!e.key.endsWith(`::${user.id}`)) return;
      if (!e.key.startsWith("masterview_music_data::")) return;
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed?.artista) prewarm(parsed.artista);
      } catch {}
    };

    window.addEventListener(MUSIC_DATA_EVENT, onMusic as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MUSIC_DATA_EVENT, onMusic as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [user?.id]);






  const cancelAutoAdvance = () => {
    interactedRef.current = true;
    setInteracted(true);
  };

  // Se abrimos a WelcomeScreen já com o dialog de edição (vindo do Home > Editar perfil),
  // cancelamos o auto-advance para o usuário editar com calma.
  useEffect(() => {
    if (initialEditOpen) cancelAutoAdvance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditOpen]);


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
      // Player é um sistema à parte: deslogar SEM redirecionar para o /admin.
      // Usa o signOut do contexto (marca manualSignOutRef para o listener não
      // restaurar a sessão do backup) e permanece nesta tela de boas-vindas.
      await signOut({ redirect: false });
      setAuthMode(null);
      setAuthError(null);
    } catch (e) {
      toast.error("Não foi possível sair. Tente novamente.");
    } finally {
      setLoggingOut(false);
      setLogoutConfirmOpen(false);
    }
  };


  // Watchdog para o fluxo do Google (timeout + retorno sem sessão)
  const authWatchdogRef = useRef<{ timer?: number; onVis?: () => void; onFocus?: () => void }>({});
  const signingInRef = useRef(false);
  useEffect(() => { signingInRef.current = signingIn; }, [signingIn]);

  const clearAuthWatchdog = () => {
    const w = authWatchdogRef.current;
    if (w.timer) { clearTimeout(w.timer); w.timer = undefined; }
    if (w.onVis) { document.removeEventListener("visibilitychange", w.onVis); w.onVis = undefined; }
    if (w.onFocus) { window.removeEventListener("focus", w.onFocus); w.onFocus = undefined; }
  };
  const resetAuthUI = (msg?: string) => {
    clearAuthWatchdog();
    setSigningIn(false);
    if (msg) setAuthError(msg);
  };
  useEffect(() => () => clearAuthWatchdog(), []);

  const handleGoogleLogin = async () => {
    clearAuthWatchdog();
    setSigningIn(true);
    setAuthError(null);

    // Preflight: em domínios customizados que não estão registrados na Lovable,
    // a rota /~oauth/initiate retorna 404 e o login com Google não funciona.
    try {
      const probe = await fetch(window.location.origin + "/~oauth/initiate", {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
      });
      // 404 real (não é opaqueredirect) => domínio não configurado
      if (probe.status === 404) {
        const msg =
          "este domínio não está configurado para login com google. peça ao administrador para conectar o domínio em lovable › settings › domains.";
        resetAuthUI(msg);
        toast.error("Domínio não configurado para login Google", {
          description:
            "o domínio precisa ser adicionado como custom domain no painel da lovable para o google login funcionar aqui.",
          duration: 8000,
        });
        return;
      }
    } catch {
      // rede/opaqueredirect => segue o fluxo normal
    }

    // Timeout de segurança: se não concluir em 90s, reabilita a UI
    authWatchdogRef.current.timer = window.setTimeout(() => {
      if (signingInRef.current) {
        resetAuthUI("tempo esgotado ao conectar com o google. tente novamente.");
        toast.error("Tempo esgotado no login Google");
      }
    }, 90_000) as unknown as number;


    // Se o usuário fechar o popup / voltar para a aba sem sessão, libera a UI
    const checkReturned = () => {
      setTimeout(async () => {
        if (!signingInRef.current) return;
        try {
          const { data } = await supabase.auth.getSession();
          if (!data?.session && signingInRef.current) {
            resetAuthUI("login cancelado ou não concluído. tente novamente.");
          }
        } catch {
          if (signingInRef.current) resetAuthUI("falha ao verificar sessão. tente novamente.");
        }
      }, 1500);
    };
    const onVis = () => { if (document.visibilityState === "visible") checkReturned(); };
    const onFocus = () => checkReturned();
    authWatchdogRef.current.onVis = onVis;
    authWatchdogRef.current.onFocus = onFocus;
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);

    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + window.location.pathname,
      });
      if (result?.error) {
        const msg = (result.error as any)?.message || "não foi possível conectar com o google. tente novamente.";
        resetAuthUI(msg);
        toast.error("Falha ao entrar com Google");
        return;
      }
      if (result?.redirected) return; // navegação em curso; watchdog cuida do retorno
      clearAuthWatchdog();
      setSigningIn(false);
      onLoginSuccess?.();
    } catch (e: any) {
      const msg = e?.message || "erro inesperado ao conectar com o google.";
      resetAuthUI(msg);
      toast.error("Falha ao entrar com Google");
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
              <div className="flex flex-col gap-3 shrink-0">
                <button
                  onClick={() => { cancelAutoAdvance(); onContinue(); }}
                  className="group relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-[28px]"
                  aria-label="Entrar no player"
                  data-ws-focusable="true"
                >
                  <div
                    className="relative rounded-[28px] overflow-hidden transition-all duration-500 ease-out group-hover:scale-[1.04]"
                    style={{
                      width: "clamp(110px, 11vw, 150px)",
                      height: "clamp(110px, 11vw, 150px)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      boxShadow: "0 18px 50px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
                    }}
                  >
                    {prevBgColors && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: `linear-gradient(145deg, ${prevBgColors[0]}, ${prevBgColors[1]})` }}
                      />
                    )}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: `linear-gradient(145deg, ${bgColors[0]}, ${bgColors[1]})`,
                        opacity: prevBgColors ? (fadeIn ? 1 : 0) : 1,
                        transition: "opacity 1400ms cubic-bezier(0.4, 0, 0.2, 1)",
                      }}
                    />
                    <img
                      src={displayAvatar}
                      alt={displayName}
                      className="relative w-full h-full object-cover"
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

                <button
                  onClick={() => { cancelAutoAdvance(); setAddProfileOpen(true); }}
                  data-ws-focusable="true"
                  aria-label="Adicionar novo perfil"
                  className="group relative shrink-0 outline-none rounded-[28px] overflow-hidden flex items-center justify-center transition-all duration-500 ease-out hover:scale-[1.04]"
                  style={{
                    width: "clamp(110px, 11vw, 150px)",
                    height: "clamp(110px, 11vw, 150px)",
                    border: "1px dashed rgba(255,255,255,0.22)",
                    boxShadow: "0 18px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.10)",
                  }}
                  aria-label="Adicionar novo perfil"
                  title="Adicionar novo perfil"
                >
                  {prevBgColors && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{ background: `linear-gradient(145deg, ${prevBgColors[1]}, ${prevBgColors[0]})` }}
                    />
                  )}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: `linear-gradient(145deg, ${bgColors[1]}, ${bgColors[0]})`,
                      opacity: prevBgColors ? (fadeIn ? 1 : 0) : 1,
                      transition: "opacity 1400ms cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  />
                  <Plus className="relative w-8 h-8 text-white/85 transition-transform duration-300 group-hover:rotate-90" strokeWidth={1.5} />
                </button>
              </div>


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
                  disabled={loggingOut}
                  aria-busy={loggingOut}
                  className="mt-1 self-start text-[11px] lowercase px-3 py-1 rounded-full transition-colors inline-flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    background: "rgba(255,255,255,0.10)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {loggingOut && (
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-white/25 border-t-white animate-spin" aria-hidden />
                  )}
                  {loggingOut ? "saindo..." : "sair"}
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
                border: "1px solid #d9d9d9",
                color: "#d9d9d9",
                height: 44,
                borderRadius: 10,
                padding: "0 14px",
                fontSize: 13,
                width: "100%",
                outline: "none",
                boxShadow: "0 0 0 1px rgba(217,217,217,0.15)",
                transition: "border-color .15s ease, box-shadow .15s ease",
              };
              const formatWhatsapp = (raw: string) => {
                const digits = raw.replace(/\D/g, "").replace(/^55/, "").slice(0, 11);
                const ddd = digits.slice(0, 2);
                const p1 = digits.slice(2, 7);
                const p2 = digits.slice(7, 11);
                if (!digits) return "";
                let out = "+55";
                if (ddd) out += ` (${ddd}`;
                if (ddd.length === 2) out += ")";
                if (p1) out += ` ${p1}`;
                if (p2) out += `-${p2}`;
                return out;
              };

              const labelCls = "text-[10px] uppercase tracking-[0.12em] mb-1.5 block font-medium";
              const labelStyle: React.CSSProperties = { color: "#d9d9d9", opacity: 0.5 };
              const sectionTitle: React.CSSProperties = {
                color: "#d9d9d9", opacity: 0.4,
                fontSize: 10, letterSpacing: "0.18em",
                textTransform: "uppercase", fontWeight: 600,
                marginBottom: 10, paddingLeft: 2,
              };
              return (
                <div className="space-y-5">
                  <style>{`
                    .wsp-input {
                      transition: border-color 200ms ease, box-shadow 200ms ease, background-color 200ms ease, color 200ms ease !important;
                    }
                    .wsp-input:hover:not(:focus) { border-color: #ffffff !important; }
                    .wsp-input:focus {
                      border-color: #ffffff !important;
                      background-color: #323431 !important;
                      color: #ffffff !important;
                      box-shadow: 0 0 0 3px rgba(255,255,255,0.18), 0 0 12px rgba(255,255,255,0.08) !important;
                    }
                    .wsp-input::placeholder { color: #d9d9d9; opacity: 0.28; }
                  `}</style>

                  {/* Identificação */}
                  <div>
                    <div style={sectionTitle}>identificação</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls} style={labelStyle}>Nome completo</label>
                        <input className="wsp-input" style={inputStyle} value={profile.nome}
                          onChange={e => setProfile(p => ({ ...p, nome: e.target.value }))} />
                      </div>
                      <div>
                        <label className={labelCls} style={labelStyle}>CPF</label>
                        <input className="wsp-input" style={inputStyle} value={profile.cpf}
                          onChange={e => setProfile(p => ({ ...p, cpf: e.target.value }))}
                          placeholder="000.000.000-00" />
                      </div>
                      <div>
                        <label className={labelCls} style={labelStyle}>Sexo</label>
                        <select className="wsp-input" style={inputStyle} value={profile.sexo}
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
                        <input type="date" className="wsp-input" style={inputStyle} value={profile.data_nascimento}
                          onChange={e => setProfile(p => ({ ...p, data_nascimento: e.target.value }))} />
                      </div>
                    </div>
                  </div>

                  {/* Contato */}
                  <div>
                    <div style={sectionTitle}>contato</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls} style={labelStyle}>WhatsApp</label>
                        <input className="wsp-input" style={inputStyle} value={profile.whatsapp}
                          onChange={e => setProfile(p => ({ ...p, whatsapp: formatWhatsapp(e.target.value) }))}
                          placeholder="+55 (00) 00000-0000" inputMode="tel" maxLength={19} />

                      </div>
                      <div>
                        <label className={labelCls} style={labelStyle}>E-mail</label>
                        <input className="wsp-input" style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} value={profile.email} disabled />
                      </div>
                    </div>
                  </div>

                  {/* Localização */}
                  <div>
                    <div style={sectionTitle}>localização</div>
                    <div className="grid grid-cols-[80px_1fr] gap-3">
                      <div>
                        <label className={labelCls} style={labelStyle}>UF</label>
                        <input className="wsp-input" style={inputStyle} value={profile.estado} maxLength={2}
                          onChange={e => setProfile(p => ({ ...p, estado: e.target.value.toUpperCase() }))}
                          placeholder="SP" />
                      </div>
                      <div>
                        <label className={labelCls} style={labelStyle}>Cidade</label>
                        <input className="wsp-input" style={inputStyle} value={profile.cidade}
                          onChange={e => setProfile(p => ({ ...p, cidade: e.target.value }))} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className={labelCls} style={labelStyle}>Bairro / Setor</label>
                      <input className="wsp-input" style={inputStyle} value={profile.setor}
                        onChange={e => setProfile(p => ({ ...p, setor: e.target.value }))}
                        placeholder="Bairro ou região" />
                    </div>
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

      {/* Add Sub-Profile Dialog */}
      <Dialog open={addProfileOpen} onOpenChange={(v) => { setAddProfileOpen(v); if (v) cancelAutoAdvance(); }}>
        <DialogContent className="bg-[#1f1f1f] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Adicionar novo perfil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-white/60 lowercase">nome do perfil</label>
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="ex: filho, esposa, quarto..."
                className="mt-1 w-full px-3 py-2 rounded-lg bg-[#323431] text-white placeholder-white/30 border border-white/5 outline-none focus:border-white/20"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-white/60 lowercase">escolha um avatar</label>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {AVATARS.map(av => (
                  <button
                    key={av}
                    onClick={() => setNewProfileAvatar(av)}
                    className={`w-full aspect-square rounded-2xl overflow-hidden border-2 transition-colors ${
                      newProfileAvatar === av ? "border-white" : "border-transparent hover:border-white/40"
                    }`}
                  >
                    <img src={av} alt="Avatar" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
            {subProfiles.length > 0 && (
              <div>
                <label className="text-xs text-white/60 lowercase">perfis vinculados</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {subProfiles.map(sp => (
                    <div key={sp.id} className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full bg-[#323431] border border-white/5">
                      <img src={sp.avatar_url} alt={sp.name} className="w-6 h-6 rounded-full object-cover" />
                      <span className="text-xs text-white/85">{sp.name}</span>
                      <button
                        onClick={() => {
                          const next = subProfiles.filter(p => p.id !== sp.id);
                          setSubProfiles(next);
                          if (user) localStorage.setItem(`nexohub_sub_profiles_${user.id}`, JSON.stringify(next));
                        }}
                        className="text-white/50 hover:text-white/90 text-xs leading-none pl-1"
                        aria-label="Remover perfil"
                      >×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setAddProfileOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-white/70 hover:text-white transition-colors"
              >
                cancelar
              </button>
              <button
                onClick={() => {
                  const name = newProfileName.trim();
                  if (!name || !user) return;
                  const next = [...subProfiles, { id: crypto.randomUUID(), name, avatar_url: newProfileAvatar }];
                  setSubProfiles(next);
                  localStorage.setItem(`nexohub_sub_profiles_${user.id}`, JSON.stringify(next));
                  setNewProfileName("");
                  setNewProfileAvatar("/avatars/usr-default.png");
                  setAddProfileOpen(false);
                }}
                disabled={!newProfileName.trim()}
                className="px-4 py-2 rounded-lg text-sm bg-[#323431] text-white border border-white/10 hover:bg-[#3a3c39] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                salvar perfil
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
