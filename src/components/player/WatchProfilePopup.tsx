import { useEffect, useState, useRef } from "react";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { Heart, Music, Film, MessageSquare, Clock, Star, LogOut, User, Users, X } from "lucide-react";
import { onProfileChanged } from "@/lib/profileSync";
import { fetchPlayerListenerProfile } from "@/lib/playerListenerProfile";

interface LikedSong {
  titulo: string;
  artista: string;
  capa: string;
}

interface WatchProfilePopupProps {
  userId: string;
  userName: string;
  userEmail?: string | null;
  avatarUrl: string | null;
  radioName?: string;
  radioUserId?: string | null;
  openToRight?: boolean;
  onClose: () => void;
  onEditProfile?: () => void;
  onSwitchProfile?: () => void;
  onAvatarChange?: (url: string | null) => void;
  onLogout?: () => void;
}

function computeFanRating(likes: number, hours: number, messages: number, vodCount: number): number {
  // Score: likes*1 + hours*2 + messages*0.5 + vod*1, mapped to 0-5 stars
  const score = likes + hours * 2 + messages * 0.5 + vodCount;
  if (score >= 100) return 5;
  if (score >= 50) return 4;
  if (score >= 20) return 3;
  if (score >= 5) return 2;
  if (score >= 1) return 1;
  return 0;
}

function fanLabel(stars: number): string {
  if (stars >= 5) return "Super FÃ£";
  if (stars >= 4) return "Grande FÃ£";
  if (stars >= 3) return "FÃ£";
  if (stars >= 2) return "Ouvinte Fiel";
  if (stars >= 1) return "Ouvinte";
  return "Novo Ouvinte";
}

export default function WatchProfilePopup({
  userId,
  userName,
  userEmail,
  avatarUrl,
  radioName,
  radioUserId,
  openToRight = false,
  onClose,
  onEditProfile,
  onSwitchProfile,
  onLogout,
}: WatchProfilePopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [likedSongs, setLikedSongs] = useState<LikedSong[]>([]);
  const [lastVod, setLastVod] = useState<{ name: string; logo: string | null } | null>(null);
  const [totalHours, setTotalHours] = useState(0);
  const [chatCount, setChatCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // Contador que forÃ§a refetch quando o perfil ou avatar mudam externamente.
  const [refreshTick, setRefreshTick] = useState(0);
  // CÃ³pias locais reativas dos campos exibidos â€” permitem atualizaÃ§Ã£o instantÃ¢nea
  // ao receber `nexo:profile:changed` sem esperar props do parent.
  const [displayName, setDisplayName] = useState(userName);
  const [displayEmail, setDisplayEmail] = useState<string | null | undefined>(userEmail);

  useEffect(() => { setDisplayName(userName); }, [userName]);
  useEffect(() => { setDisplayEmail(userEmail); }, [userEmail]);

  // Refetch quando prop `userName` ou `avatarUrl` mudarem (troca de subperfil).
  useEffect(() => { setRefreshTick(t => t + 1); }, [userName, avatarUrl]);

  // Escuta o barramento global de perfil e atualiza tudo em tempo real.
  useEffect(() => {
    const off = onProfileChanged((detail) => {
      if (detail.nome != null) setDisplayName(detail.nome);
      if (detail.email !== undefined) setDisplayEmail(detail.email);
      setRefreshTick(t => t + 1);
    });
    return off;
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    if (!userId) return;

    const fetchAll = async () => {
      // Liked songs â€” last 10
      let likesP: any = playerSupabase
        .from("music_likes")
        .select("titulo, artista, capa")
        .eq("user_id", userId);
      likesP = radioUserId ? likesP.eq("radio_user_id", radioUserId) : likesP.is("radio_user_id", null);
      likesP = likesP
        .order("created_at", { ascending: false })
        .limit(10);

      // Last VOD watched
      let vodP: any = playerSupabase
        .from("watch_history")
        .select("channel_name, channel_logo_url")
        .eq("user_id", userId);
      vodP = radioUserId ? vodP.eq("radio_user_id", radioUserId) : vodP.is("radio_user_id", null);
      vodP = vodP
        .order("watched_at", { ascending: false })
        .limit(1);

      // Total watch history entries (estimate hours â€” 1 entry â‰ˆ 30 min)
      let hoursP: any = playerSupabase
        .from("watch_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      hoursP = radioUserId ? hoursP.eq("radio_user_id", radioUserId) : hoursP.is("radio_user_id", null);

      // Chat message count
      // player_chat_messages doesn't have user_id, uses nome â€” approximate by profile name
      const profileP = radioUserId
        ? fetchPlayerListenerProfile({ id: userId } as any, radioUserId)
        : playerSupabase.from("profiles").select("nome, avatar_url").eq("user_id", userId).maybeSingle().then(({ data }) => data || null);

      const [likesRes, vodRes, hoursRes, profileRes] = await Promise.all([likesP, vodP, hoursP, profileP]);

      if (likesRes.data) {
        setLikedSongs(likesRes.data.map(r => ({
          titulo: r.titulo,
          artista: r.artista,
          capa: r.capa || "",
        })));
      }

      if (vodRes.data && vodRes.data.length > 0) {
        setLastVod({ name: vodRes.data[0].channel_name, logo: vodRes.data[0].channel_logo_url });
      }

      const entryCount = hoursRes.count ?? 0;
      setTotalHours(Math.round(entryCount * 0.5 * 10) / 10); // 30 min per entry

      // MantÃ©m nome/avatar exibidos sincronizados com o que estÃ¡ no banco,
      // caso tenham mudado em outra aba/tela.
      const savedName = String((profileRes as any)?.nome || "").trim();
      if (savedName) {
        const chatRes = await playerSupabase
          .from("player_chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("nome", savedName);
        setChatCount(chatRes.count ?? 0);
      }
      setLoading(false);
    };

    fetchAll();
  }, [userId, radioUserId, refreshTick]);

  const stars = computeFanRating(likedSongs.length, totalHours, chatCount, lastVod ? 1 : 0);
  const label = fanLabel(stars);

  return (
    <div
      ref={ref}
      className={`absolute ${openToRight ? "left-0 right-auto" : "right-0"} top-[calc(100%+8px)] z-[60] animate-fade-in`}
      style={{ width: "min(356px, calc(100vw - 24px))", maxHeight: "80vh" }}
    >
      <div
        className="rounded-2xl flex flex-col overflow-hidden"
        style={{
          background: "#24262b",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.42)",
          color: "#fff",
        }}
      >
        {/* Header */}
        <div className="relative px-5 pt-5 pb-4 pr-14">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar perfil"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/75 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <X size={16} />
          </button>
          <div className="min-w-0">
            <span className="block truncate text-base font-bold leading-tight text-white">{displayName}</span>
            {displayEmail && <span className="mt-1 block truncate text-[11px] text-white/65">{displayEmail}</span>}
            <div className="mt-2 flex items-center gap-1" aria-label={`${stars} de 5 estrelas, ${label}`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={13} fill={i < stars ? "#ffffff" : "transparent"} style={{ color: i < stars ? "#ffffff" : "rgba(255,255,255,0.3)" }} />
              ))}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="mx-4 grid grid-cols-3 divide-x divide-white/10 rounded-xl border border-white/10 bg-black/10 px-1 py-3">
          <div className="flex flex-col items-center gap-0.5">
            <Clock size={14} className="text-white/40" />
            <span className="text-xs font-bold text-white">{totalHours}h</span>
            <span className="text-[9px] text-white/40">ouvindo</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <Heart size={14} fill="#ffffff" style={{ color: "#ffffff" }} />
            <span className="text-xs font-bold text-white">{likedSongs.length}</span>
            <span className="text-[9px] text-white/40">curtidas</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <MessageSquare size={14} className="text-white/40" />
            <span className="text-xs font-bold text-white">{chatCount}</span>
            <span className="text-[9px] text-white/40">mensagens</span>
          </div>
        </div>

        <div className="mx-4 h-px bg-white/10" />

        {/* Last VOD */}
        {lastVod && (
          <>
            <div className="px-5 py-3 flex items-center gap-2">
              <Film size={13} className="text-white/40 shrink-0" />
              <span className="text-[10px] text-white/50">Ãšltimo on demand:</span>
              {lastVod.logo && (
                <img src={lastVod.logo} alt="" className="w-5 h-5 rounded object-cover shrink-0" />
              )}
              <span className="text-[11px] font-semibold text-white truncate">{lastVod.name}</span>
            </div>
            <div className="mx-4 h-px bg-white/10" />
          </>
        )}

        {/* Liked songs */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Heart size={12} fill="#ffffff" style={{ color: "#ffffff" }} />
            <span className="text-[10px] font-bold uppercase tracking-wide text-white/60">Ãšltimas Curtidas</span>
          </div>
          {loading ? (
            <div className="space-y-1.5 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5">
                  <div className="w-6 h-6 rounded bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-0.5">
                    <div className="h-2 w-3/4 rounded bg-white/10" />
                    <div className="h-1.5 w-1/2 rounded bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : likedSongs.length === 0 ? (
            <p className="text-[10px] text-white/30">Nenhuma curtida ainda</p>
          ) : (
            <div className="space-y-0.5 max-h-[180px] overflow-y-auto scrollbar-hide">
              {likedSongs.map((song, i) => (
                <div key={`${song.artista}-${song.titulo}-${i}`} className="flex items-center gap-2 py-0.5 rounded-lg">
                  {song.capa ? (
                    <img src={song.capa} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded flex items-center justify-center shrink-0 bg-white/10">
                      <Music size={10} className="text-white/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold truncate text-white">{song.titulo}</p>
                    <p className="text-[8px] truncate text-white/40">{song.artista}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mx-4 h-px bg-white/10" />

        {/* Actions */}
        <div className="px-4 py-3 flex flex-col gap-1">
          {onEditProfile && (
            <button
              onClick={() => { onClose(); onEditProfile(); }}
              className="flex min-h-9 items-center gap-3 text-white/75 text-xs hover:text-white transition-colors rounded-lg px-3 py-2 hover:bg-white/10"
            >
              <User size={13} /> Editar perfil
            </button>
          )}
          {onSwitchProfile && (
            <button
              onClick={() => { onClose(); onSwitchProfile(); }}
              className="flex min-h-9 items-center gap-3 text-white/75 text-xs hover:text-white transition-colors rounded-lg px-3 py-2 hover:bg-white/10"
            >
              <Users size={13} /> Trocar de perfil
            </button>
          )}
          {onLogout && (
            <button
              onClick={() => { onClose(); onLogout(); }}
              className="flex min-h-9 items-center gap-3 text-white/65 text-xs hover:text-white transition-colors rounded-lg px-3 py-2 hover:bg-white/10"
            >
              <LogOut size={13} /> Sair
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

