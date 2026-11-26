import {selectReminderProfile} from "@/components/player/tv/TvProgramReminders";
import { peekTvProfile, warmTvProfile } from "@/components/player/tv/tvProfileWarm";
// NEXO_V717_QR_GOOGLE_POSITIVA
import "@/components/player/tv/OttProfilesV74.css";
import { useNavigate } from "react-router-dom";
import { unlockTvRadio } from "@/components/player/tv/tvAudio";
import { DateInput } from "@/components/ui/date-input";
import { useState, useEffect, useRef } from "react";
import { Pencil, Star, Plus } from "lucide-react";

import { usePlayerAuth } from "@/hooks/usePlayerAuth";
import { useGlobalMusicSync } from "@/hooks/useGlobalMusicSync";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { getMusicData } from "@/lib/musicData";
import { MUSIC_DATA_EVENT } from "@/lib/musicStorageKeys";
import { fetchArtistImageCached, getArtistImageSync } from "@/lib/artistImageCache";
import { emitProfileChanged } from "@/lib/profileSync";
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
import { fetchPlayerListenerProfile, upsertPlayerListenerProfile } from "@/lib/playerListenerProfile";
import { playerSignOut } from "@/lib/playerSignOut";
import { readLinkedTv } from "@/lib/nexoTvDevice";
import { startPlayerGoogleLogin } from "@/lib/playerGoogleLogin";
import { markPlayerSession } from "@/lib/playerSession";
import PlayerBrandCorner from "@/components/player/PlayerBrandCorner";
import { ANIVERSARIOS_CIDADES } from "@/data/aniversariosCidades";
import { isPlayerOtt, isPlayerTvApp } from "@/lib/playerTvApp";
import OttProfiles, { type OttProfileData } from "@/components/player/tv/OttProfiles";
import { OttFrame } from "@/components/player/tv/OttFrame";


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
  avatarAccent?: string;
  onContinue: () => void;
  onSelectTvProfile?: (profile: { name: string; avatar: string | null }) => void;
  onLoginSuccess?: () => void;
  onSignedOut?: () => void;
  initialEditOpen?: boolean;
  userSlug?: string | null;
  publicUserId?: string | null;
  guestMode?: boolean;
}


const COUNTDOWN_SECONDS = 3;

// NEXO_V7_3_TV_ID: randomUUID is unavailable on non-HTTPS TV WebViews.
function createLocalTvProfileId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") throw new Error("Gerador seguro indisponível na TV.");
  const buf = new Uint8Array(16); crypto.getRandomValues(buf);
  buf[6] = (buf[6] & 15) | 64; buf[8] = (buf[8] & 63) | 128;
  const x = Array.from(buf, n => n.toString(16).padStart(2,"0")).join("");
  return [x.slice(0,8),x.slice(8,12),x.slice(12,16),x.slice(16,20),x.slice(20)].join("-");
}

export default function WelcomeScreen({
  userName,
  avatarUrl,
  backgroundUrl,
  channelName,
  logoUrl,
  avatarAccent = "#e00012",
  onContinue,
  onSelectTvProfile,
  onLoginSuccess,
  onSignedOut,
  initialEditOpen = false,
  userSlug = null,
  publicUserId = null,
  guestMode = false,
}: WelcomeScreenProps) {

  const navigate = useNavigate();
  const { user } = usePlayerAuth();
  const [ottProfileError, setOttProfileError] = useState(false);
  const radioUserId = publicUserId || (/^(positivafm|positiva)$/i.test(String(userSlug || "")) ? "452ebd1e-61a0-42dd-bf80-231a3f426c83" : null) || user?.id || null;
  const cachedTvProfile = isPlayerOtt() ? peekTvProfile(user,radioUserId) : undefined;
  const [ottProfileReady, setOttProfileReady] = useState(!!cachedTvProfile);
  // Mantém a sincronização da "música no ar" ativa também na tela de boas-vindas,
  // para que a imagem do artista (Deezer) apareça sem depender do PlayerHome.
  useGlobalMusicSync(undefined, true, true);
  const [editOpen, setEditOpen] = useState(initialEditOpen);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [addProfileOpen, setAddProfileOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileAvatar, setNewProfileAvatar] = useState<string>("/avatars/usr-default.png");
  const [subProfiles, setSubProfiles] = useState<Array<{ id: string; name: string; avatar_url: string }>>(()=>cachedTvProfile?.sub_profiles || []);
  const [profilesLoading, setProfilesLoading] = useState(false);
  // Permite recarregar a lista de perfis após o login com Google.
  const [profilesReloadKey, setProfilesReloadKey] = useState(0);

  // Load sub-profiles scoped by radio so the same listener can belong to multiple stations.
  useEffect(() => {
    if (!user || !radioUserId) { setSubProfiles([]); setProfilesLoading(false); return; }
    const cacheKey = `nexohub_sub_profiles_${user.id}_${radioUserId}`;
    let hadCache = false;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) { setSubProfiles(parsed); hadCache = true; }
      }
    } catch { /* ignore */ }
    let cancelled = false;
    setProfilesLoading(!hadCache);
    (isPlayerOtt() ? warmTvProfile(user,radioUserId,userName) : fetchPlayerListenerProfile(user, radioUserId, userName))
      .then((data) => {
        if (cancelled) return;
        const remote = Array.isArray(data.sub_profiles) ? data.sub_profiles : [];
        // NEXO_V7_3_PENDING_MERGE: pending local profiles must not disappear on a remote refresh.
        const pendingKey=`nexohub_pending_sub_profiles_${user.id}_${radioUserId}`;
        let pending:Array<{id:string;name:string;avatar_url:string}>=[];
        try { const raw=JSON.parse(localStorage.getItem(pendingKey)||"[]"); if(Array.isArray(raw)) pending=raw; } catch {}
        const merged=[...remote,...pending.filter(x=>x&&typeof x.id==="string"&&!remote.some((r:{id:string})=>r.id===x.id))];
        // Só sobrescreve o cache quando o backend retornou perfis, evitando
        // "piscar" uma lista vazia logo após o login com o Google.
        if (merged.length || !hadCache) {
          setSubProfiles(merged);
          try { localStorage.setItem(cacheKey, JSON.stringify(merged)); } catch { /* ignore */ }
        }
      })
      .finally(() => { if (!cancelled) setProfilesLoading(false); });
    return () => { cancelled = true; };
  }, [user, radioUserId, userName, profilesReloadKey]);


  // Após autenticar com o Google, verifica se o e-mail já possui cadastro na
  // base de ouvintes da rádio. Se sim, avisa o usuário e mantém/leva ele para a
  // tela de perfis do player (welcome) em vez de criar um novo cadastro.
  const existingCheckRef = useRef(false);
  useEffect(() => {
    if (!user?.email || existingCheckRef.current) return;
    let pending = false;
    try { pending = sessionStorage.getItem("nexohub_player_signup_check") === "1"; } catch { /* ignore */ }
    if (!pending) return;
    existingCheckRef.current = true;
    try { sessionStorage.removeItem("nexohub_player_signup_check"); } catch { /* ignore */ }

    (async () => {
      try {
        const { data } = await playerSupabase.functions.invoke("check-listener-registration", {
          body: { email: user.email, radio_user_id: radioUserId },
        });
        if ((data as any)?.exists) {
          const nome = (data as any)?.listener?.nome as string | null;
          toast.success("Você já tem cadastro com a gente", {
            description: nome
              ? `bem-vindo de volta, ${String(nome).split(" ")[0].toLowerCase()}! entramos com a sua conta existente.`
              : "entramos com a sua conta existente. escolha seu perfil para continuar.",
            duration: 6000,
          });
          // Garante que o usuário fique na tela de perfis do player.
          try {
            const slug = userSlug && userSlug !== ":userSlug" ? userSlug : "root";
            window.localStorage.removeItem(`player-step-home:${slug}`);
          } catch { /* ignore */ }
        }
        // Recarrega a lista de perfis do usuário logado após o login com Google.
        setProfilesReloadKey((k) => k + 1);
        if (onLoginSuccess) onLoginSuccess();
      } catch { /* silencioso: não bloqueia o login */ }
    })();
  }, [user?.email, radioUserId, userSlug, onLoginSuccess]);


  const persistSubProfiles = async (next: Array<{ id: string; name: string; avatar_url: string }>) => {
    setSubProfiles(next);
    if (!user || !radioUserId) return;
    try { localStorage.setItem(`nexohub_sub_profiles_${user.id}_${radioUserId}`, JSON.stringify(next)); } catch { /* ignore */ }
    await upsertPlayerListenerProfile(user.id, radioUserId, { sub_profiles: next as any });
  };

  const [saving, setSaving] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const interactedRef = useRef(false);
  // Spatial keyboard navigation (arrows) + Enter/Space to activate
  useEffect(() => {
    if (isPlayerOtt()) return;
    const getNodes = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-ws-focusable="true"]'))
        .filter(el => el.offsetParent !== null && !el.hasAttribute("disabled"));

    const pickSpatial = (
      from: HTMLElement,
      dir: "up" | "down" | "left" | "right",
      nodes: HTMLElement[],
    ): HTMLElement | null => {
      const a = from.getBoundingClientRect();
      const ax = a.left + a.width / 2;
      const ay = a.top + a.height / 2;
      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      for (const n of nodes) {
        if (n === from) continue;
        const b = n.getBoundingClientRect();
        const bx = b.left + b.width / 2;
        const by = b.top + b.height / 2;
        const dx = bx - ax;
        const dy = by - ay;
        let primary = 0;
        let cross = 0;
        if (dir === "right") { if (dx <= 4) continue; primary = dx; cross = Math.abs(dy); }
        else if (dir === "left") { if (dx >= -4) continue; primary = -dx; cross = Math.abs(dy); }
        else if (dir === "down") { if (dy <= 4) continue; primary = dy; cross = Math.abs(dx); }
        else { if (dy >= -4) continue; primary = -dy; cross = Math.abs(dx); }
        // heavy penalty on cross-axis so we stay in the same row/column when possible
        const score = primary + cross * 2.2;
        if (score < bestScore) { bestScore = score; best = n; }
      }
      // Fallback: wrap-around — closest node overall in that half
      if (!best) {
        for (const n of nodes) {
          if (n === from) continue;
          const b = n.getBoundingClientRect();
          const bx = b.left + b.width / 2;
          const by = b.top + b.height / 2;
          const score = Math.hypot(bx - ax, by - ay);
          if (score < bestScore) { bestScore = score; best = n; }
        }
      }
      return best;
    };

    const onKey = (e: KeyboardEvent) => {
      if (!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter"," "].includes(e.key)) return;
      
      const isProfileStep = document.querySelector('[data-ws-profile-main="true"]');
      if (isProfileStep && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const nodes = getNodes();
        const active = document.activeElement as HTMLElement | null;
        if (active && nodes.includes(active)) {
          const isMain = active.hasAttribute("data-ws-profile-main");
          const subId = active.getAttribute("data-ws-profile-sub");
          
          if (e.key === "ArrowDown") {
            if (isMain && subProfiles.length > 0) {
              e.preventDefault();
              const firstSub = document.querySelector<HTMLElement>('[data-ws-profile-sub]');
              firstSub?.focus();
              return;
            }
            if (subId) {
              const currentSubs = Array.from(document.querySelectorAll<HTMLElement>('[data-ws-profile-sub]'));
              const idx = currentSubs.indexOf(active);
              if (idx < currentSubs.length - 1) {
                e.preventDefault();
                currentSubs[idx + 1].focus();
                return;
              }
            }
          } else if (e.key === "ArrowUp") {
            if (subId) {
              const currentSubs = Array.from(document.querySelectorAll<HTMLElement>('[data-ws-profile-sub]'));
              const idx = currentSubs.indexOf(active);
              e.preventDefault();
              if (idx === 0) {
                const main = document.querySelector<HTMLElement>('[data-ws-profile-main="true"]');
                main?.focus();
              } else {
                currentSubs[idx - 1].focus();
              }
              return;
            }
          }
        }
      }

      const nodes = getNodes();
      if (nodes.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const current = active && nodes.includes(active) ? active : null;

      if (e.key === "Enter" || e.key === " ") {
        if (current) { e.preventDefault(); current.click(); }
        return;
      }
      e.preventDefault();
      if (!current) { nodes[0].focus(); return; }
      const dir =
        e.key === "ArrowUp" ? "up" :
        e.key === "ArrowDown" ? "down" :
        e.key === "ArrowLeft" ? "left" : "right";
      const next = pickSpatial(current, dir as any, nodes);
      next?.focus();
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      if (document.activeElement && (document.activeElement as HTMLElement).matches?.('[data-ws-focusable="true"]')) return;
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
    ...(cachedTvProfile || {}),
  });

  // UFs brasileiras + cidades (IBGE)
  const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
  const [ufCities, setUfCities] = useState<string[]>([]);
  const [cityFocused, setCityFocused] = useState(false);
  const [cityLoading, setCityLoading] = useState(false);

  useEffect(() => {
    const uf = (profile.estado || "").toUpperCase();
    if (uf.length !== 2) { setUfCities([]); return; }
    let cancelled = false;
    setCityLoading(true);
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
      .then(r => r.json())
      .then((list: any[]) => {
        if (cancelled) return;
        const nomes = (list || []).map(m => m.nome);
        // cidades "mais relevantes" da UF primeiro (capital e principais municípios)
        const prio = (ANIVERSARIOS_CIDADES[uf] || []).map(c => c.cidade);
        const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const rank = (n: string) => {
          const i = prio.findIndex(p => norm(p) === norm(n));
          return i === -1 ? 999 : i;
        };
        setUfCities([...nomes].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "pt-BR")));
      })
      .catch(() => { if (!cancelled) setUfCities([]); })
      .finally(() => { if (!cancelled) setCityLoading(false); });
    return () => { cancelled = true; };
  }, [profile.estado]);

  const citySuggestions = (() => {
    const q = (profile.cidade || "").trim().toLowerCase();
    if (!ufCities.length) return [];
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const nq = norm(q);
    return (nq ? ufCities.filter(c => norm(c).includes(nq)) : ufCities).slice(0, 12);
  })();





  useEffect(() => {
    if (!user || !radioUserId) return;
    let cancelled = false;
    if(!cachedTvProfile) setOttProfileReady(false);
    setOttProfileError(false);
    // Foto da conta Google (identidade OAuth ou metadados do usuário)
    const gIdentity = (user as any)?.identities?.find?.((i: any) => i.provider === "google");
    const gData: any = gIdentity?.identity_data || {};
    const meta: any = (user as any)?.user_metadata || {};
    const googlePhoto: string | null =
      gData.avatar_url || gData.picture || meta.avatar_url || meta.picture || null;


    (isPlayerOtt() ? warmTvProfile(user,radioUserId,userName) : fetchPlayerListenerProfile(user, radioUserId, userName)).then(async (data) => {
      const d = (data || {}) as any;
      // Dados do CADASTRO DE OUVINTE (fonte oficial) via função pública
      let listener: any = null;
      if (readLinkedTv()?.userId !== user.id) try {
        const { data: res } = await playerSupabase.functions.invoke("check-listener-registration", {
          body: { email: user.email, radio_user_id: radioUserId },
        });
        if ((res as any)?.exists) listener = (res as any).listener;
      } catch { /* ignore */ }

      if (cancelled) return;
      setProfile({
        nome: listener?.nome || d.nome || userName,
        email: listener?.email || d.email || user.email || "",
        cpf: listener?.cpf || d.cpf || "",
        whatsapp: listener?.telefone || d.whatsapp || "",
        sexo: listener?.sexo || d.sexo || "",
        estado: d.estado || "",
        cidade: listener?.cidade || d.cidade || "",
        setor: listener?.setor || d.setor || "",
        data_nascimento: listener?.data_nascimento || d.data_nascimento || "",
        avatar_url: googlePhoto || d.avatar_url || "/avatars/usr-default.png",
      });
      setOttProfileReady(true);
    }).catch(() => { if (!cancelled) setOttProfileError(true); });
    return () => { cancelled = true; };

  }, [user, userName, radioUserId]);


  // === Background sequence: delayed reveal + intercalated artist image ===
  const [bgVisible, setBgVisible] = useState(false);
  const [artistImg, setArtistImg] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<{ titulo: string; artista: string; capa?: string } | null>(null);
  const [showArtistBg, setShowArtistBg] = useState(false);
  const artistImgCacheRef = useRef<Record<string, string>>({});
  const lastArtistRef = useRef<string | null>(null);
  const alternateTimerRef = useRef<number | null>(null);

  // Small delay so text/avatar animate in first, but keep bg reveal snappy
  useEffect(() => {
    const t = setTimeout(() => setBgVisible(true), 300);
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
      let url = getArtistImageSync(artista) || artistImgCacheRef.current[key] || null;
      if (!url) {
        url = await fetchArtistImageCached(artista);
        if (url) artistImgCacheRef.current[key] = url;
      }
      if (cancelled) return;
      if (!url) { if (lastArtistRef.current?.toLowerCase() === key) setArtistImg(null); return; }
      try { await preloadImage(url); } catch {}
      if (cancelled || lastArtistRef.current?.toLowerCase() !== key) return;
      setArtistImg(url);
      setShowArtistBg(true);
    };

    const readCurrent = async (): Promise<{ titulo: string; artista: string; capa?: string } | null> => {
      // Prefer public endpoint whenever we're on a tenant slug — the auth
      // user's local music data may belong to a different tenant.
      if (hasSlug) {
        try {
          const { data } = await playerSupabase.functions.invoke("public-player-data", {
            body: { slug: userSlug, section: "now_playing" },
          });
          if (data?.artista || data?.musica) {
            return { titulo: String(data.musica || ""), artista: String(data.artista || ""), capa: String(data.capa || data.capa_url || "") };
          }
        } catch {}
        return null;
      }
      if (user?.id) {
        const d = getMusicData(user.id);
        if (d?.music) return { titulo: d.music.titulo, artista: d.music.artista, capa: d.music.capa };
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
      const { titulo, artista, capa } = cur;
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
          return { titulo, artista, capa };
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


  // Alternate the artist image for 10s with the configured gradient for 7s.
  useEffect(() => {
    if (alternateTimerRef.current) { clearTimeout(alternateTimerRef.current); alternateTimerRef.current = null; }
    if (!artistImg) { setShowArtistBg(false); return; }
    let showArtist = true;
    const cycle = () => {
      setShowArtistBg(showArtist);
      alternateTimerRef.current = window.setTimeout(cycle, showArtist ? 20000 : 10000);
      showArtist = !showArtist;
    };
    cycle();
    return () => {
      if (alternateTimerRef.current) { clearTimeout(alternateTimerRef.current); alternateTimerRef.current = null; }
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
      if (artistImgCacheRef.current[key] || getArtistImageSync(artista)) return;
      const url = await fetchArtistImageCached(artista);
      if (!url) return;
      artistImgCacheRef.current[key] = url;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      try { await (img as any).decode?.(); } catch {}
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


  const handleSave = async (nextProfile?: OttProfileData) => {
    if (!user) return;
    const data = nextProfile || profile;
    setSaving(true);
    const presentationOnly = readLinkedTv()?.userId === user.id;
    const { error } = await upsertPlayerListenerProfile(user.id, radioUserId || user.id, {
      nome: data.nome, avatar_url: data.avatar_url,
      ...(presentationOnly ? {} : { email: data.email,
      cpf: data.cpf || null,
      whatsapp: data.whatsapp, sexo: data.sexo,
      estado: data.estado, cidade: data.cidade,
      setor: data.setor || null,
      data_nascimento: data.data_nascimento || null }),
    } as any);

    // Atualiza a pontuação conforme as REGRAS DE PONTUAÇÃO do cadastro de ouvinte
    let novaPontuacao: number | null = null;
    if (!presentationOnly && !error) try {
      const { data: res } = await playerSupabase.functions.invoke("sync-listener-points", {
        body: {
          radio_user_id: radioUserId || user.id,
          profile: {
            nome: data.nome, email: data.email, cpf: data.cpf,
            telefone: data.whatsapp, sexo: data.sexo,
            data_nascimento: data.data_nascimento,
            estado: data.estado, cidade: data.cidade, setor: data.setor,
          },
        },
      });
      if ((res as any)?.ok && typeof (res as any).pontuacao === "number") {
        novaPontuacao = (res as any).pontuacao as number;
      }
    } catch { /* ignore */ }

    setSaving(false);
    if (error) toast.error("Erro ao salvar perfil");
    else {
      toast.success(
        novaPontuacao != null ? `Perfil atualizado! ${novaPontuacao} pts` : "Perfil atualizado!",
      );
      setProfile(data);
      setEditOpen(false);
    }
    return !error;
  };


  const [authError, setAuthError] = useState<string | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const confirmLogout = async () => {
    setLoggingOut(true);
    try {
      // Player é um sistema à parte: deslogar SEM redirecionar para o /admin.
      // Encerra somente a sessão do Player; a autenticação do House Mix fica separada.
      await playerSignOut();
      setAuthMode(null);
      setAuthError(null);
      onSignedOut?.();
    } catch (e) {
      toast.error("Não foi possível sair. Tente novamente.");
    } finally {
      setLoggingOut(false);
      setLogoutConfirmOpen(false);
    }
  };


  const authWatchdogRef = useRef<number | undefined>(undefined);
  const clearAuthWatchdog = () => {
    if (authWatchdogRef.current) window.clearTimeout(authWatchdogRef.current);
    authWatchdogRef.current = undefined;
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
    authWatchdogRef.current = window.setTimeout(() => {
      resetAuthUI("tempo esgotado ao conectar com o google. tente novamente.");
      toast.error("Tempo esgotado no login Google");
    }, 120_000);
    try {
      try { sessionStorage.setItem("nexohub_player_signup_check", "1"); } catch { /* ignore */ }
      const userId = await startPlayerGoogleLogin();
      markPlayerSession(userId);
      clearAuthWatchdog();
      setSigningIn(false);
      setAuthMode(null);
      onLoginSuccess?.();
    } catch (e: any) {
      resetAuthUI(e?.message || "erro inesperado ao conectar com o google.");
      toast.error("Falha ao entrar com Google");
    }
  };

  const displayName = profile.nome || userName;
  const displayAvatar = profile.avatar_url || "/avatars/usr-default.png";

  if (isPlayerOtt() && user && !guestMode && !ottProfileReady) return <OttFrame className="ott-black" loading={!ottProfileError} skeletonVariant="profiles">{ottProfileError ? <div className="ott-profile-load-error" role="alert"><p>Não foi possível carregar seu perfil.</p><button onClick={()=>window.location.reload()}>Tentar novamente</button><button onClick={onContinue}>Voltar ao player</button></div>:<span className="sr-only" role="status" aria-label="Carregando perfis" />}</OttFrame>;

  const tvGooglePhoto = user?.identities?.find(i=>i.provider==="google")?.identity_data?.avatar_url || user?.identities?.find(i=>i.provider==="google")?.identity_data?.picture || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const tvMainProfile = {...profile, avatar_url: typeof tvGooglePhoto === "string" && tvGooglePhoto ? tvGooglePhoto : profile.avatar_url};
  if (isPlayerOtt()) return <OttProfiles userSlug={userSlug} radioUserId={radioUserId}
    profile={guestMode ? { ...profile, nome: "Visitante", avatar_url: "/avatars/usr-default.png" } : tvMainProfile}
    authenticated={!!user && !guestMode} logo={logoUrl} radioName={channelName} background={showArtistBg && artistImg ? artistImg : null} accent={avatarAccent}
    presentationOnly={!!user && readLinkedTv()?.userId === user.id}
    initialEdit={initialEditOpen} profiles={guestMode ? [] : subProfiles} avatars={AVATARS}
    onContinue={()=>{selectReminderProfile("main");if (user && !guestMode) onSelectTvProfile?.({ name: profile.nome, avatar: tvMainProfile.avatar_url });unlockTvRadio();onContinue();}}
    onSwitch={sp=>{selectReminderProfile(sp.id);if (user && !guestMode) onSelectTvProfile?.({ name: sp.name, avatar: sp.avatar_url });setProfile(p=>({...p,nome:sp.name,avatar_url:sp.avatar_url}));emitProfileChanged({userId:user?.id ?? null,radioUserId,nome:sp.name,avatar_url:sp.avatar_url,reason:"switch"});unlockTvRadio();onContinue();}}
    onSave={async draft=>!!(await handleSave(draft))}
    onAdd={async(name,avatar)=>{
      // NEXO_V7_3_LOCAL_FALLBACK: cloud RLS may deny listener writes. Never fake cloud persistence.
      if(!user || guestMode)throw new Error("Entre com a conta Google para criar perfis.");
      const id=createLocalTvProfileId();
      const next=[...subProfiles,{id,name,avatar_url:avatar}];
      const cacheKey=`nexohub_sub_profiles_${user.id}_${radioUserId}`;
      const pendingKey=`nexohub_pending_sub_profiles_${user.id}_${radioUserId}`;
      let storedLocally=false;
      const store=()=>{ localStorage.setItem(cacheKey,JSON.stringify(next));storedLocally=true;setSubProfiles(next); };
      try {
        const {error}=await upsertPlayerListenerProfile(user.id,radioUserId || user.id,{sub_profiles:next as any});
        if(error)throw error;
        store();
        try{localStorage.removeItem(pendingKey)}catch{}
      }catch(e){
        // Do not loosen database security or call privileged APIs from the TV.
        try {
          const existing:unknown=JSON.parse(localStorage.getItem(pendingKey)||"[]");
          const pending=Array.isArray(existing)?existing:[];
          localStorage.setItem(pendingKey,JSON.stringify([...pending,{id,name,avatar_url:avatar}]));
          store();
        }catch(storageError){throw e;}
        console.warn("[Nexo TV] Perfil salvo apenas neste aparelho; sincronizacao pendente:",e);
        return "local" as const;
      }
    }}
    // NEXO_V7_4_WELCOME: cloud first, no accidental edits to the primary Google profile.
    onUpdateSub={async(updated)=>{
      if(!user || guestMode)throw new Error("Entre com Google para editar perfis.");
      const next=subProfiles.map(item=>item.id===updated.id?updated:item);
      if(!subProfiles.some(item=>item.id===updated.id))throw new Error("Perfil não encontrado.");
      const cacheKey=`nexohub_sub_profiles_${user.id}_${radioUserId}`;
      const pendingKey=`nexohub_pending_sub_profiles_${user.id}_${radioUserId}`;
      const {error}=await upsertPlayerListenerProfile(user.id,radioUserId || user.id,{sub_profiles:next as any});
      if(error)throw new Error("Não foi possível salvar as mudanças no Supabase. Tente novamente.");
      setSubProfiles(next);
      try{localStorage.setItem(cacheKey,JSON.stringify(next));localStorage.removeItem(pendingKey);}catch{}
    }}
    onDeleteSub={async(selected)=>{
      if(!user || guestMode)throw new Error("Entre com Google para excluir perfis.");
      if(!subProfiles.some(item=>item.id===selected.id))throw new Error("Perfil não encontrado.");
      const next=subProfiles.filter(item=>item.id!==selected.id);
      const cacheKey=`nexohub_sub_profiles_${user.id}_${radioUserId}`;
      const pendingKey=`nexohub_pending_sub_profiles_${user.id}_${radioUserId}`;
      const {error}=await upsertPlayerListenerProfile(user.id,radioUserId || user.id,{sub_profiles:next as any});
      if(error)throw new Error("Não foi possível excluir no Supabase. O perfil foi preservado.");
      setSubProfiles(next);
      try{localStorage.setItem(cacheKey,JSON.stringify(next));localStorage.removeItem(pendingKey);}catch{}
    }}
    onLogin={isPlayerTvApp() ? ()=>navigate(`/${userSlug}/player/tv?tv=1`) : handleGoogleLogin} onLogout={confirmLogout}
  />;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black text-white">
      {/* Background: channel thumb intercalated with artist image (Ken Burns) */}
      <style>{`
        @keyframes ws-kenburns {
          0%   { transform: scale(1.06) translate3d(-1.2%, 0, 0); }
          100% { transform: scale(1.14) translate3d(1.2%, 0, 0); }
        }
        .ws-kenburns { animation: ws-kenburns 36s ease-in-out infinite alternate; transform-origin: center top; will-change: transform; }
        .ws-bg-layer { transition: opacity 1.6s ease-in-out; }
      `}</style>
      <div className="absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, #171717 0%, #242424 24%, color-mix(in srgb, ${avatarAccent} 68%, #252525) 68%, ${avatarAccent} 100%)`,
          }}
        />
        {artistImg && (
          <img
            src={artistImg}
            alt=""
            className="ws-kenburns ws-bg-layer absolute inset-0 w-full h-full object-cover"
            style={{
              objectPosition: "center -200px",
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
            background: "linear-gradient(180deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.12) 30%, rgba(0,0,0,0.5) 75%, rgba(0,0,0,0.84) 100%)",
          }}
        />
      </div>

      {/* Bottom-left: now-playing overlay, independent of the rotating background */}
      {nowPlaying && (
        <div className="absolute bottom-24 sm:bottom-28 left-6 sm:left-[6vw] z-20 flex items-center gap-4 max-w-[min(520px,85vw)]">
          {nowPlaying.capa && <img src={nowPlaying.capa} alt="Capa da música" className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl object-cover shadow-xl" draggable={false} />}
          <div className="min-w-0">
            <div className="text-xl sm:text-[28px] leading-tight text-white/90 mb-1">tocando agora:</div>
            <div className="text-white text-lg sm:text-[28px] font-medium leading-tight truncate">{nowPlaying.titulo}</div>
            <div className="text-white/80 text-base sm:text-[24px] leading-tight truncate">{nowPlaying.artista}</div>
          </div>
        </div>
      )}


      {/* Brand marks frame the welcome screen; background remains the live player artwork. */}
      <PlayerBrandCorner radioUserId={radioUserId} logoUrl={logoUrl} logoAlt={channelName || "Logo da empresa"} className="absolute right-[4.5vw] top-[3vh] z-20" />
      <div className="absolute bottom-5 left-6 sm:left-[6vw] z-20">
        <img src="/images/player-seal.png" alt="Nexo OTT Player" className="w-16 sm:w-20 h-auto object-contain opacity-50" draggable={false} />
      </div>
      <div className="absolute bottom-6 right-6 sm:right-12 z-20 text-[10px] sm:text-xs text-white/90 opacity-50 drop-shadow-lg">desenvolvido por : Nexo Brasil</div>

      {/* Welcome layout — left when logged in, centered for guests */}
      <div
        className={`absolute inset-0 z-10 flex flex-col ${user ? "justify-start px-[6vw] pt-[54px] sm:pt-[70px] items-start" : "justify-center items-center px-6 sm:px-10"} animate-fade-in`}
      >
        {/* Heading */}
        <h1
          className={`font-semibold leading-tight ${user ? "" : "lowercase"}`}
          style={{
            fontSize: user ? "clamp(18px, 1.6vw, 24px)" : "clamp(22px, 2.4vw, 34px)",
            letterSpacing: "-0.01em",
            textShadow: "0 2px 20px rgba(0,0,0,0.55)",
            textAlign: user ? "left" : "center",
          }}
        >
          {user ? "BEM VINDO!" : "bem vindo"}
        </h1>

        {/* Avatar + info row (or centered login buttons for guests) */}
        <div className={`mt-4 sm:mt-5 flex ${user ? "items-start gap-5" : "items-center justify-center w-full"}`}>

          {user ? (
            <>
              <div className="flex flex-col gap-3 shrink-0">
                <div className="flex items-center gap-4 shrink-0">
                  <button
                    onClick={() => { cancelAutoAdvance(); onContinue(); }}
                    className="group relative shrink-0 outline-none rounded-full after:pointer-events-none after:absolute after:-inset-[6px] after:rounded-full after:border-2 after:border-white after:opacity-0 after:transition-opacity hover:after:opacity-100 focus-visible:after:opacity-100"
                    aria-label="Entrar no player"
                    data-ws-focusable="true"
                    data-ws-profile-main="true"
                  >
                    <div
                      className="relative rounded-full overflow-hidden transition-all duration-300 ease-out"
                      style={{
                        width: "clamp(90px, 9vw, 114px)",
                        height: "clamp(90px, 9vw, 114px)",
                        background: `linear-gradient(145deg, color-mix(in srgb, ${avatarAccent} 55%, #ff1838), color-mix(in srgb, ${avatarAccent} 35%, #c9001b))`,
                        boxShadow: "0 18px 50px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
                      }}
                    >
                      <img
                        key={displayAvatar}
                        src={displayAvatar}
                        alt={displayName}
                        className="relative w-full h-full rounded-full object-cover animate-avatar-in"
                        draggable={false}
                      />
                    </div>
                  </button>

                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div
                      className="text-white font-semibold leading-tight truncate"
                      style={{
                        fontSize: "clamp(26px, 2.4vw, 38px)",
                        textShadow: "0 2px 20px rgba(0,0,0,0.55)",
                        maxWidth: "clamp(140px, 16vw, 240px)",
                      }}
                    >
                      {displayName}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        onClick={() => { cancelAutoAdvance(); setEditOpen(true); }}
                        data-ws-focusable="true"
                        className="text-sm lowercase px-2.5 py-1 rounded-md transition-colors"
                        style={{ background: "rgba(0,0,0,0.38)", border: "1px solid rgba(255,255,255,0.12)" }}
                      >editar perfil <Pencil className="inline w-3 h-3 ml-1" /></button>
                      <button
                        onClick={() => { cancelAutoAdvance(); setLogoutConfirmOpen(true); }}
                        data-ws-focusable="true"
                        disabled={loggingOut}
                        aria-busy={loggingOut}
                        className="self-start text-sm lowercase px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
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
                  </div>
                </div>


                {subProfiles.map((sp, spIdx) => {
                  const spPoints = Number((sp as any).points) || 0;
                  const spRating = Math.min(5, Math.max(0, Math.round((spPoints / 100) * 2) / 2));
                  return (
                    <div key={sp.id} className="flex items-center gap-4 shrink-0">
                      <button
                        data-ws-focusable="true"
                        data-ws-profile-sub={sp.id}
                        onClick={() => {
                          cancelAutoAdvance();
                          setProfile(p => ({ ...p, nome: sp.name, avatar_url: sp.avatar_url }));
                          emitProfileChanged({
                            userId: user?.id ?? null,
                            radioUserId,
                            nome: sp.name,
                            avatar_url: sp.avatar_url,
                            reason: "switch",
                          });
                          onContinue();
                        }}
                        title={sp.name}
                        aria-label={`Entrar como ${sp.name}`}
                        className="group relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-[28px]"
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
                            key={sp.avatar_url}
                            src={sp.avatar_url}
                            alt={sp.name}
                            className="relative w-full h-full object-cover animate-avatar-in"
                            style={{ animationDelay: `${250 + spIdx * 180}ms` }}
                            draggable={false}
                          />
                        </div>
                      </button>

                      <div className="flex flex-col gap-1.5 min-w-0">
                        <div className="text-white font-semibold text-lg leading-tight truncate" style={{ maxWidth: "clamp(140px, 16vw, 240px)" }}>
                          {sp.name}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-0.5">
                            {[0, 1, 2, 3, 4].map(i => {
                              const filled = spRating >= i + 1;
                              const half = !filled && spRating >= i + 0.5;
                              return (
                                <Star
                                  key={i}
                                  className="w-3.5 h-3.5"
                                  strokeWidth={1.5}
                                  fill={filled ? "#ffffff" : half ? "url(#half-star-sub)" : "none"}
                                  color="rgba(255,255,255,0.85)"
                                />
                              );
                            })}
                          </div>
                          <span className="text-xs text-white/70 tabular-nums">{spPoints} pts</span>
                        </div>
                        <button
                          type="button"
                          data-ws-focusable="true"
                          onClick={(e) => {
                            e.stopPropagation();
                            persistSubProfiles(subProfiles.filter(p => p.id !== sp.id));
                          }}
                          className="self-start mt-1 text-xs px-2.5 py-1 rounded-md text-white/80 hover:text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                          style={{
                            background: "rgba(0,0,0,0.35)",
                            border: "1px solid rgba(255,255,255,0.15)",
                            backdropFilter: "blur(6px)",
                          }}
                          aria-label={`Excluir perfil ${sp.name}`}
                        >
                          excluir perfil
                        </button>
                      </div>
                    </div>
                  );
                })}

                {profilesLoading && subProfiles.length === 0 && (
                  <div
                    className="shrink-0 rounded-[28px] flex items-center justify-center"
                    style={{
                      width: "clamp(110px, 11vw, 150px)",
                      height: "clamp(110px, 11vw, 150px)",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      backdropFilter: "blur(6px)",
                    }}
                    aria-label="Carregando perfis"
                  >
                    <span className="inline-block w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" aria-hidden />
                  </div>
                )}

                <button

                  onClick={() => { cancelAutoAdvance(); setAddProfileOpen(true); }}
                  data-ws-focusable="true"
                  aria-label="Adicionar novo perfil"
                  className="group relative shrink-0 outline-none rounded-full overflow-visible flex items-center justify-center transition-all duration-300 ease-out after:pointer-events-none after:absolute after:-inset-[6px] after:rounded-full after:border-2 after:border-white after:opacity-0 after:transition-opacity hover:after:opacity-100 focus-visible:after:opacity-100"
                  style={{
                    width: "clamp(90px, 9vw, 114px)",
                    height: "clamp(90px, 9vw, 114px)",
                    background: "rgba(255,255,255,0.10)",
                    border: "1px solid rgba(255,255,255,0.24)",
                    backdropFilter: "blur(18px)",
                    WebkitBackdropFilter: "blur(18px)",
                    boxShadow: "0 18px 50px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
                  }}
                  title="Adicionar novo perfil"
                >
                  <Plus className="relative w-8 h-8 text-white/85 transition-transform duration-300 group-hover:rotate-90" strokeWidth={1.5} />
                </button>
              </div>


            </>
          ) : guestMode ? (
            <div className="flex items-center gap-5 shrink-0">
              <button
                onClick={() => { cancelAutoAdvance(); onContinue(); }}
                data-ws-focusable="true"
                aria-label="Entrar como visitante"
                className="group relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-[28px]"
              >
                <div
                  className="relative rounded-[28px] overflow-hidden transition-all duration-500 ease-out group-hover:scale-[1.04]"
                  style={{
                    width: "clamp(120px, 12vw, 160px)",
                    height: "clamp(120px, 12vw, 160px)",
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
                    src="/avatars/usr-default.png"
                    alt="Visitante"
                    className="relative w-full h-full object-cover animate-avatar-in"
                    draggable={false}
                  />
                </div>
              </button>

              <div className="flex flex-col gap-1.5 min-w-0">
                <div
                  className="text-white font-semibold leading-tight truncate"
                  style={{
                    fontSize: "clamp(22px, 2vw, 30px)",
                    textShadow: "0 2px 20px rgba(0,0,0,0.55)",
                    maxWidth: "clamp(160px, 18vw, 260px)",
                  }}
                >
                  Visitante
                </div>
                <div className="text-sm text-white/70">perfil de visitante</div>
              </div>
            </div>
          ) : (
            <div className="w-full flex items-center justify-center gap-5">
              {[
                
                {
                  key: "google",
                  label: "entrar com google",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
                      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.7 6.4 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c10.8 0 19.5-8.7 19.5-19.5 0-1.2-.1-2.3-.4-3.5z"/>
                      <path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.7 15.1 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.7 6.4 29.1 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.1z"/>
                      <path fill="#4CAF50" d="M24 43.5c5.1 0 9.7-1.9 13.2-5l-6.1-5c-2 1.4-4.4 2.3-7.1 2.3-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39 16.2 43.5 24 43.5z"/>
                      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.1 5C41.7 34.9 43.5 30 43.5 24c0-1.2-.1-2.3-.4-3.5z"/>
                    </svg>
                  ),
                  primary: true,
                },
                { key: "signup", label: "cadastre-se", icon: <Plus className="w-5 h-5 text-white/90" strokeWidth={1.6} />, primary: false },
              ].map((btn) => (
                <button
                  key={btn.key}
                  onClick={() => {
                    if (btn.key === "google") { void handleGoogleLogin(); return; }
                    setAuthMode(btn.key as "login" | "signup");
                  }}
                  data-ws-focusable="true"
                  disabled={signingIn}
                  aria-busy={signingIn}
                  aria-label={btn.label}
                  className="group relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-[28px] disabled:opacity-60 disabled:cursor-not-allowed"
                >

                  <div
                    className="relative rounded-[28px] overflow-hidden transition-all duration-500 ease-out group-hover:scale-[1.04] flex flex-col items-center justify-center gap-2"
                    style={{
                      width: "clamp(140px, 13vw, 180px)",
                      height: "clamp(140px, 13vw, 180px)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      boxShadow: "0 18px 50px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
                    }}
                  >
                    {prevBgColors && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: btn.primary
                            ? `linear-gradient(145deg, ${prevBgColors[0]}, ${prevBgColors[1]})`
                            : `linear-gradient(145deg, ${prevBgColors[1]}, ${prevBgColors[0]})`,
                        }}
                      />
                    )}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: btn.primary
                          ? `linear-gradient(145deg, ${bgColors[0]}, ${bgColors[1]})`
                          : `linear-gradient(145deg, ${bgColors[1]}, ${bgColors[0]})`,
                        opacity: prevBgColors ? (fadeIn ? 1 : 0) : 1,
                        transition: "opacity 1400ms cubic-bezier(0.4, 0, 0.2, 1)",
                      }}
                    />
                    <div className="relative flex items-center justify-center w-11 h-11 rounded-full" style={{ background: "rgba(0,0,0,0.22)", border: "1px solid rgba(255,255,255,0.16)", backdropFilter: "blur(6px)" }}>
                      {signingIn && btn.key === "google" ? (
                        <span className="inline-block w-4 h-4 rounded-full border-2 border-white/25 border-t-white animate-spin" aria-hidden />
                      ) : btn.icon}
                    </div>
                    <span className="relative text-white text-sm font-medium lowercase text-center px-2" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.55)" }}>
                      {signingIn && btn.key === "google" ? "autenticando..." : btn.label}
                    </span>

                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>


      {/* Logout Confirmation */}
      <Dialog open={logoutConfirmOpen} onOpenChange={(v) => { if (!loggingOut) setLogoutConfirmOpen(v); }}>
        <DialogContent
          hideCloseButton
          className="top-1/2 max-h-[90vh] -translate-y-1/2 max-w-sm p-0"
          style={{ top: "50%", maxHeight: "90vh", backgroundColor: "#1f1f1f", border: "1px solid #323431", color: "#d9d9d9" }}
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
                        <DateInput className="wsp-input" style={inputStyle} value={profile.data_nascimento}
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
                        <select className="wsp-input" style={inputStyle} value={profile.estado}
                          onChange={e => { setProfile(p => ({ ...p, estado: e.target.value, cidade: "" })); setCityFocused(!!e.target.value); }}>
                          <option value="">--</option>
                          {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                        </select>
                      </div>
                      <div className="relative">
                        <label className={labelCls} style={labelStyle}>Cidade</label>
                        <input className="wsp-input" style={inputStyle} value={profile.cidade}
                          placeholder={!profile.estado ? "selecione a UF" : cityLoading ? "carregando cidades..." : "escolha ou digite"}
                          disabled={!profile.estado}
                          autoComplete="off"
                          readOnly={cityLoading}
                          onFocus={() => setCityFocused(true)}
                          onClick={() => setCityFocused(true)}
                          onBlur={() => setTimeout(() => setCityFocused(false), 150)}
                          onChange={e => { setProfile(p => ({ ...p, cidade: e.target.value })); setCityFocused(true); }} />
                        {cityFocused && citySuggestions.length > 0 && (
                          <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-xl overflow-hidden backdrop-blur-xl max-h-56 overflow-y-auto"
                            style={{ background: "rgba(20,20,20,0.92)", border: "1px solid rgba(255,255,255,0.14)" }}>
                            {citySuggestions.map(c => (
                              <button key={c} type="button"
                                className="w-full text-left px-3 py-2 text-xs hover:bg-white/10"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => { setProfile(p => ({ ...p, cidade: c })); setCityFocused(false); }}>
                                {c}
                              </button>
                            ))}
                          </div>
                        )}
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
              onClick={() => void handleSave()}
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
            {(() => {
              const gIdentity = (user as any)?.identities?.find?.((i: any) => i.provider === "google");
              const gData: any = gIdentity?.identity_data || {};
              const meta: any = (user as any)?.user_metadata || {};
              const googlePhoto: string | null =
                gData.avatar_url || gData.picture || meta.avatar_url || meta.picture || null;
              const options = googlePhoto ? [googlePhoto, ...AVATARS] : AVATARS;
              return options.map((av, i) => (
                <button
                  key={`${av}-${i}`}
                  onClick={() => { setProfile(p => ({ ...p, avatar_url: av })); setAvatarPickerOpen(false); }}
                  className={`relative w-20 h-20 rounded-2xl overflow-hidden border-2 transition-colors mx-auto ${
                    profile.avatar_url === av ? "border-white" : "border-transparent hover:border-white/40"
                  }`}
                  title={googlePhoto && i === 0 ? "foto da conta google" : "avatar"}
                >
                  <img src={av} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  {googlePhoto && i === 0 && (
                    <span className="absolute bottom-0 inset-x-0 text-[9px] py-0.5 bg-black/60 lowercase">google</span>
                  )}
                </button>
              ));
            })()}
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
                          persistSubProfiles(next);
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
                  const next = [...subProfiles, { id: createLocalTvProfileId(), name, avatar_url: newProfileAvatar }];
                  persistSubProfiles(next);
                  setNewProfileName("");
                  setNewProfileAvatar("/avatars/usr-default.png");
                  setAddProfileOpen(false);
                }}
                disabled={!newProfileName.trim()}
                className="px-4 py-2 rounded-lg text-sm bg-[#323431] text-white border border-white/10 hover:bg-[#3a3c39] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                adicionar perfil
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
