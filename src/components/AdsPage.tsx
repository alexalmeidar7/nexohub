import PlayerAdsPage from './PlayerAdsPage';
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Preserve the existing metadata helper for compatibility.
export function handleMetadataTick(
  nomeDoArtista: string,
  palavraChave: string,
  playlist: { id: string; titulo: string }[],
) {
  if (nomeDoArtista.trim().toUpperCase() === palavraChave.trim().toUpperCase()) {
    const randomizada = [...playlist].sort(() => Math.random() - 0.5);
    return { action: "PLAY_BREAK" as const, playlist: randomizada };
  }
  return { action: "RESUME_LIVE" as const, playlist: [] };
}

export default function AdsPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const targetUserId = effectiveUserId || user?.id;

  return (
    <div className="nexo-scope animate-fade-in" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
      <div className="rounded-3xl p-6" style={{ background: "#ffffff" }}>
        <Tabs defaultValue="player">
          <TabsList className="bg-white/70 rounded-full p-1 mb-5">
            <TabsTrigger value="player" className="rounded-full text-xs font-bold uppercase tracking-wider data-[state=active]:bg-[#C6F03C] data-[state=active]:text-[#002132]">PLAYER</TabsTrigger>
          </TabsList>
          <TabsContent value="player" className="mt-0">
            <PlayerAdsPage userId={targetUserId || undefined} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
