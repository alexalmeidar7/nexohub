import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Star, Heart, Clock, MessageSquare, Film, Music, Loader2 } from "lucide-react";
import ModulePageSkeleton from "@/components/skeletons/ModulePageSkeleton";

interface FanProfile {
  user_id: string;
  nome: string;
  avatar_url: string | null;
  cidade: string | null;
  likes: number;
  hours: number;
  messages: number;
  vodCount: number;
  stars: number;
  label: string;
}

function computeStars(likes: number, hours: number, messages: number, vodCount: number): number {
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

interface FansPageProps {
  radioName?: string;
}

export default function FansPage({ radioName }: FansPageProps) {
  const { user } = useAuth();
  const [fans, setFans] = useState<FanProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStars, setFilterStars] = useState<number | null>(null);

  const fetchFans = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Get all profiles (listeners who have interacted)
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, nome, avatar_url, cidade");

    if (!profiles || profiles.length === 0) {
      setLoading(false);
      return;
    }

    // Get aggregated data
    const [likesRes, historyRes, chatRes] = await Promise.all([
      supabase.from("music_likes").select("user_id"),
      supabase.from("watch_history").select("user_id"),
      supabase.from("player_chat_messages").select("nome"),
    ]);

    // Count likes per user
    const likesMap = new Map<string, number>();
    (likesRes.data || []).forEach(r => {
      likesMap.set(r.user_id, (likesMap.get(r.user_id) || 0) + 1);
    });

    // Count watch history per user (each entry ≈ 0.5h)
    const historyMap = new Map<string, number>();
    (historyRes.data || []).forEach(r => {
      historyMap.set(r.user_id, (historyMap.get(r.user_id) || 0) + 1);
    });

    // Count chat messages per nome → map to user_id via profiles
    const nameToUserId = new Map<string, string>();
    profiles.forEach(p => {
      if (p.nome) nameToUserId.set(p.nome, p.user_id);
    });
    const chatMap = new Map<string, number>();
    (chatRes.data || []).forEach(r => {
      const uid = nameToUserId.get(r.nome);
      if (uid) chatMap.set(uid, (chatMap.get(uid) || 0) + 1);
    });

    // Build fan list — only include profiles with some activity
    const fanList: FanProfile[] = [];
    for (const p of profiles) {
      // Skip the owner
      if (p.user_id === user.id) continue;

      const likes = likesMap.get(p.user_id) || 0;
      const entries = historyMap.get(p.user_id) || 0;
      const hours = Math.round(entries * 0.5 * 10) / 10;
      const messages = chatMap.get(p.user_id) || 0;
      const vodCount = entries > 0 ? 1 : 0;

      if (likes === 0 && entries === 0 && messages === 0) continue;

      const stars = computeStars(likes, hours, messages, vodCount);
      fanList.push({
        user_id: p.user_id,
        nome: p.nome || "Anônimo",
        avatar_url: p.avatar_url,
        cidade: p.cidade,
        likes,
        hours,
        messages,
        vodCount,
        stars,
        label: fanLabel(stars),
      });
    }

    fanList.sort((a, b) => b.stars - a.stars || (b.likes + b.hours + b.messages) - (a.likes + a.hours + a.messages));
    setFans(fanList);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchFans();
  }, [fetchFans]);

  const filtered = filterStars !== null ? fans.filter(f => f.stars === filterStars) : fans;

  const starCounts = [5, 4, 3, 2, 1, 0].map(s => ({
    stars: s,
    count: fans.filter(f => f.stars === s).length,
    label: fanLabel(s),
  }));

  if (loading) return <ModulePageSkeleton variant="table" />;

  const title = radioName ? `Fãs ${radioName}` : "Fãs";

  return (
    <div className="space-y-6 w-full max-w-none mx-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Star size={24} style={{ color: "var(--layout-accent-color, #e2b714)" }} fill="currentColor" />
        <h2 className="text-xl font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{title}</h2>
        <span className="text-sm" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>({fans.length} ouvintes)</span>
      </div>

      {/* Star filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterStars(null)}
          className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
          style={filterStars === null
            ? { background: "var(--layout-accent-color, #dc2626)", color: "#fff" }
            : { background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)", color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }
          }
        >
          Todos ({fans.length})
        </button>
        {starCounts.map(sc => (
          <button
            key={sc.stars}
            onClick={() => setFilterStars(sc.stars === filterStars ? null : sc.stars)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1"
            style={filterStars === sc.stars
              ? { background: "var(--layout-accent-color, #dc2626)", color: "#fff" }
              : { background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)", color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }
            }
          >
            {Array.from({ length: sc.stars }).map((_, i) => (
              <Star key={i} size={10} fill="currentColor" />
            ))}
            {sc.stars === 0 && <span>☆</span>}
            <span className="ml-1">{sc.label} ({sc.count})</span>
          </button>
        ))}
      </div>

      {/* Fan list */}
      {filtered.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Nenhum fã encontrado nesta categoria.</p>
      ) : (
        <div className="grid gap-3">
          {filtered.map((fan, idx) => (
            <div
              key={fan.user_id}
              className="flex items-center gap-4 p-4 rounded-xl transition-colors"
              style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }}
            >
              {/* Rank */}
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={idx < 3
                  ? { background: "var(--layout-accent-color, #dc2626)", color: "#fff" }
                  : { background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)", color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }
                }
              >
                {idx + 1}
              </span>

              {/* Avatar */}
              <div className="w-10 h-10 rounded-full overflow-hidden shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
                <img
                  src={fan.avatar_url || "/avatars/usr-default.png"}
                  alt={fan.nome}
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{fan.nome}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "color-mix(in srgb, var(--layout-accent-color, #dc2626) 12%, transparent)", color: "var(--layout-accent-color, #dc2626)" }}>{fan.label}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={11}
                      fill={i < fan.stars ? "var(--layout-accent-color, #e2b714)" : "transparent"}
                      style={{ color: i < fan.stars ? "var(--layout-accent-color, #e2b714)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 20%, transparent)" }}
                    />
                  ))}
                  {fan.cidade && <span className="text-[10px] ml-2" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>{fan.cidade}</span>}
                </div>
              </div>

              {/* Stats */}
              <div className="hidden sm:flex items-center gap-4 shrink-0" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                <div className="flex items-center gap-1" title="Curtidas">
                  <Heart size={13} />
                  <span className="text-xs font-semibold">{fan.likes}</span>
                </div>
                <div className="flex items-center gap-1" title="Horas ouvindo">
                  <Clock size={13} />
                  <span className="text-xs font-semibold">{fan.hours}h</span>
                </div>
                <div className="flex items-center gap-1" title="Mensagens no chat">
                  <MessageSquare size={13} />
                  <span className="text-xs font-semibold">{fan.messages}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
