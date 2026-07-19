import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Heart, Music, Film, MessageSquare, Clock, Star, LogOut, User, X } from "lucide-react";

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
  onClose: () => void;
  onEditProfile?: () => void;
  onSwitchProfile?: () => void;
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
  if (stars >= 5) return "Super Fã";
  if (stars >= 4) return "Grande Fã";
  if (stars >= 3) return "Fã";
  if (stars >= 2) return "Ouvinte Fiel";
  if (stars >= 1) return "Ouvinte";
  return "Novo Ouvinte";
}

export default function WatchProfilePopup({
  userId,
  userName,
  avatarUrl,
  radioName,
  onClose,
  onEditProfile,
  onLogout,
}: WatchProfilePopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [likedSongs, setLikedSongs] = useState<LikedSong[]>([]);
  const [lastVod, setLastVod] = useState<{ name: string; logo: string | null } | null>(null);
  const [totalHours, setTotalHours] = useState(0);
  const [chatCount, setChatCount] = useState(0);
  const [loading, setLoading] = useState(true);

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
      // Liked songs — last 10
      const likesP = supabase
        .from("music_likes")
        .select("titulo, artista, capa")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      // Last VOD watched
      const vodP = supabase
        .from("watch_history")
        .select("channel_name, channel_logo_url")
        .eq("user_id", userId)
        .order("watched_at", { ascending: false })
        .limit(1);

      // Total watch history entries (estimate hours — 1 entry ≈ 30 min)
      const hoursP = supabase
        .from("watch_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      // Chat message count
      // player_chat_messages doesn't have user_id, uses nome — approximate by profile name
      const profileP = supabase
        .from("profiles")
        .select("nome")
        .eq("user_id", userId)
        .maybeSingle();

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

      // Chat count by name
      if (profileRes.data?.nome) {
        const chatRes = await supabase
          .from("player_chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("nome", profileRes.data.nome);
        setChatCount(chatRes.count ?? 0);
      }

      setLoading(false);
    };

    fetchAll();
  }, [userId]);

  const stars = computeFanRating(likedSongs.length, totalHours, chatCount, lastVod ? 1 : 0);
  const label = fanLabel(stars);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-[calc(100%+8px)] z-[60] animate-fade-in"
      style={{ width: "320px", maxHeight: "80vh" }}
    >
      <div
        className="rounded-2xl flex flex-col overflow-hidden"
        style={{
          background: "rgba(10,10,10,0.96)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full overflow-hidden shrink-0"
            style={{ border: "2px solid hsla(var(--player-accent) / 0.5)" }}
          >
            <img
              src={avatarUrl || "/avatars/usr-default.png"}
              alt={userName}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-bold text-white truncate">{userName}</span>
            {/* Fan rating */}
            <div className="flex items-center gap-1 mt-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={12}
                  className="transition-colors"
                  fill={i < stars ? "hsl(var(--player-accent))" : "transparent"}
                  style={{ color: i < stars ? "hsl(var(--player-accent))" : "rgba(255,255,255,0.2)" }}
                />
              ))}
              <span className="text-[10px] font-semibold ml-1" style={{ color: "hsl(var(--player-accent))" }}>
                {label}{radioName ? ` ${radioName}` : ""}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1">
            <X size={16} />
          </button>
        </div>

        <div className="w-full h-px bg-white/8" />

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-1 px-4 py-3">
          <div className="flex flex-col items-center gap-0.5">
            <Clock size={14} className="text-white/40" />
            <span className="text-xs font-bold text-white">{totalHours}h</span>
            <span className="text-[9px] text-white/40">ouvindo</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <Heart size={14} style={{ color: "hsl(var(--player-accent))" }} />
            <span className="text-xs font-bold text-white">{likedSongs.length}</span>
            <span className="text-[9px] text-white/40">curtidas</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <MessageSquare size={14} className="text-white/40" />
            <span className="text-xs font-bold text-white">{chatCount}</span>
            <span className="text-[9px] text-white/40">mensagens</span>
          </div>
        </div>

        <div className="w-full h-px bg-white/8" />

        {/* Last VOD */}
        {lastVod && (
          <>
            <div className="px-4 py-2.5 flex items-center gap-2">
              <Film size={13} className="text-white/40 shrink-0" />
              <span className="text-[10px] text-white/50">Último on demand:</span>
              {lastVod.logo && (
                <img src={lastVod.logo} alt="" className="w-5 h-5 rounded object-cover shrink-0" />
              )}
              <span className="text-[11px] font-semibold text-white truncate">{lastVod.name}</span>
            </div>
            <div className="w-full h-px bg-white/8" />
          </>
        )}

        {/* Liked songs */}
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Heart size={12} fill="hsl(var(--player-accent))" style={{ color: "hsl(var(--player-accent))" }} />
            <span className="text-[10px] font-bold uppercase tracking-wide text-white/60">Últimas Curtidas</span>
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

        <div className="w-full h-px bg-white/8" />

        {/* Actions */}
        <div className="px-4 py-2.5 flex flex-col gap-1">
          {onEditProfile && (
            <button
              onClick={() => { onClose(); onEditProfile(); }}
              className="flex items-center gap-2 text-white/60 text-[11px] hover:text-white transition-colors rounded-lg px-2 py-1.5 hover:bg-white/5"
            >
              <User size={13} /> Editar perfil
            </button>
          )}
          {onLogout && (
            <button
              onClick={() => { onClose(); onLogout(); }}
              className="flex items-center gap-2 text-white/40 text-[11px] hover:text-red-400 transition-colors rounded-lg px-2 py-1.5 hover:bg-white/5"
            >
              <LogOut size={13} /> Sair
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
