import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Home, Radio, Film, ShoppingBag, LogOut, UserCircle } from "lucide-react";

interface Channel {
  id: string;
  name: string;
  cover_url: string | null;
  logo_url: string | null;
  type: string;
}

type Section = "home" | "streaming" | "content" | "shop";

interface PlayerHomeProps {
  onBackToAccess?: () => void;
}

export default function PlayerHome({ onBackToAccess }: PlayerHomeProps = {}) {
  const { user, signOut } = useAuth();
  const { userSlug } = useParams();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<Section>("home");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);

  const userName = profileName || user?.email?.split("@")[0] || "Visitante";

  useEffect(() => {
    const fetchData = async () => {
      let userId = user?.id;

      if (userSlug && !userId) {
        const { data } = await supabase.functions.invoke("public-player-data", {
          body: { slug: userSlug },
        });
        if (data?.channels) setChannels(data.channels);
        if (data?.empresa?.logo) setLogoUrl(data.empresa.logo);
        if (data?.empresa?.nome) setChannelName(data.empresa.nome);
        return;
      }

      if (!userId) return;

      const [chRes, empRes] = await Promise.all([
        supabase.from("streaming_channels").select("id, name, cover_url, logo_url, type").eq("user_id", userId).eq("active", true),
        supabase.from("empresa_config").select("logo, nome").eq("user_id", userId).single(),
      ]);
      if (chRes.data) setChannels(chRes.data);
      if (empRes.data) {
        setLogoUrl(empRes.data.logo);
        setChannelName(empRes.data.nome || "");
      }
    };
    fetchData();
  }, [user, userSlug]);

  // Fetch profile
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("nome, avatar_url")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.nome) setProfileName(data.nome);
        if (data?.avatar_url) setProfileAvatar(data.avatar_url);
      });
  }, [user]);

  const goToPlayer = () => {
    if (userSlug) {
      navigate(`/user/${userSlug}/nexohub/player/watch`);
    } else {
      navigate("/user/nexohub/player/watch");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/user/nexohub/player");
  };

  const sidebarItems: { icon: typeof Home; label: string; section: Section }[] = [
    { icon: Home, label: "Home", section: "home" },
    { icon: Radio, label: "Streaming", section: "streaming" },
    { icon: Film, label: "Conteúdo", section: "content" },
    { icon: ShoppingBag, label: "Loja", section: "shop" },
  ];

  return (
    <div
      className="fixed inset-0 bg-player text-player-foreground flex"
      style={{ background: "var(--player-glow-corner)" }}
    >
      {/* Red border */}
      <div className="absolute inset-0 border border-player-accent/20 rounded-2xl pointer-events-none z-30" />

      {/* Sidebar */}
      <aside className="w-20 flex flex-col items-center py-6 gap-3 z-20">
        {sidebarItems.map(item => (
          <button
            key={item.section}
            onClick={() => {
              setActiveSection(item.section);
              if (item.section === "streaming") goToPlayer();
            }}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
              activeSection === item.section
                ? "bg-player-accent text-player-foreground"
                : "bg-player-surface text-player-muted-foreground hover:bg-player-surface-hover hover:text-player-foreground"
            }`}
            title={item.label}
          >
            <item.icon className="h-5 w-5" />
          </button>
        ))}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-8 py-6 z-10">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-player-surface flex items-center justify-center overflow-hidden">
              {profileAvatar ? (
                <img src={profileAvatar} alt={userName} className="w-full h-full object-cover" />
              ) : (
                <img src="/avatars/usr-default.png" alt="Visitante" className="w-full h-full object-cover" />
              )}
            </div>
            <div>
              <p className="text-sm">
                Bem vindo, <span className="text-player-accent font-semibold">{userName}</span>
              </p>
              {user ? (
                <button onClick={handleSignOut} className="text-player-accent text-xs hover:underline flex items-center gap-1">
                  <LogOut className="h-3 w-3" /> Sair
                </button>
              ) : onBackToAccess ? (
                <button onClick={onBackToAccess} className="text-player-accent text-xs hover:underline">
                  cadastre-se
                </button>
              ) : null}
              )}
            </div>
          </div>
          {logoUrl && <img src={logoUrl} alt={channelName} className="h-10 w-auto object-contain" />}
        </header>

        {/* Streamings ao vivo */}
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-4">streamings ao vivo</h2>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {channels.length === 0 && (
              <div className="w-72 h-40 rounded-xl bg-player-surface border border-player-border flex items-center justify-center text-player-muted-foreground text-sm">
                Nenhum canal disponível
              </div>
            )}
            {channels.map((ch, i) => (
              <button
                key={ch.id}
                onClick={goToPlayer}
                className={`flex-shrink-0 w-72 h-40 rounded-xl overflow-hidden relative transition-transform hover:scale-[1.02] ${
                  i === 0 ? "border-2 border-player-foreground ring-1 ring-player-muted" : "border border-player-border"
                }`}
              >
                {ch.cover_url ? (
                  <img src={ch.cover_url} alt={ch.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-player-accent/30 to-player flex items-center justify-center">
                    {ch.logo_url ? (
                      <img src={ch.logo_url} alt={ch.name} className="h-12 w-auto object-contain" />
                    ) : (
                      <Radio className="h-10 w-10 text-player-muted-foreground" />
                    )}
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-player/80 to-transparent p-3">
                  <p className="text-sm font-medium truncate">{ch.name}</p>
                  <span className="text-[10px] uppercase tracking-wider text-player-accent">● ao vivo</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Visto por último */}
        <section>
          <h2 className="text-lg font-bold mb-4">visto por último</h2>
          <div className="flex gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-48 h-28 rounded-xl bg-player-surface border border-player-border" />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
