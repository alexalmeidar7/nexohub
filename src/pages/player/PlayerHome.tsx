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

export default function PlayerHome() {
  const { user, signOut } = useAuth();
  const { userSlug } = useParams();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<Section>("home");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");

  const userName = user?.email?.split("@")[0] || "Visitante";

  useEffect(() => {
    const fetchData = async () => {
      let userId = user?.id;

      // If accessing via slug, resolve the user
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
      className="fixed inset-0 bg-black text-white flex"
      style={{ background: "radial-gradient(ellipse at 90% 90%, rgba(180,20,20,0.15) 0%, #000 70%)" }}
    >
      {/* Red border around entire screen */}
      <div className="absolute inset-0 border border-red-800/40 rounded-2xl pointer-events-none z-30" />

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
                ? "bg-red-600 text-white"
                : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
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
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
              <UserCircle className="h-7 w-7 text-white/60" />
            </div>
            <div>
              <p className="text-sm">
                Bem vindo, <span className="text-red-500 font-semibold">{userName}</span>
              </p>
              {user && (
                <button onClick={handleSignOut} className="text-red-500 text-xs hover:underline flex items-center gap-1">
                  <LogOut className="h-3 w-3" /> Sair
                </button>
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
              <div className="w-72 h-40 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/30 text-sm">
                Nenhum canal disponível
              </div>
            )}
            {channels.map((ch, i) => (
              <button
                key={ch.id}
                onClick={goToPlayer}
                className={`flex-shrink-0 w-72 h-40 rounded-xl overflow-hidden relative transition-transform hover:scale-[1.02] ${
                  i === 0 ? "border-2 border-white ring-1 ring-white/20" : "border border-white/10"
                }`}
              >
                {ch.cover_url ? (
                  <img src={ch.cover_url} alt={ch.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-red-900/40 to-black flex items-center justify-center">
                    {ch.logo_url ? (
                      <img src={ch.logo_url} alt={ch.name} className="h-12 w-auto object-contain" />
                    ) : (
                      <Radio className="h-10 w-10 text-white/30" />
                    )}
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                  <p className="text-sm font-medium truncate">{ch.name}</p>
                  <span className="text-[10px] uppercase tracking-wider text-red-400">● ao vivo</span>
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
              <div key={i} className="w-48 h-28 rounded-xl bg-white/5 border border-white/10" />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
