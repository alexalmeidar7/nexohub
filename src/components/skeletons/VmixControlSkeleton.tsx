import { Skeleton } from "@/components/ui/skeleton";
import nexoLogo from "@/assets/logo-nxo.png";
import cleanVmixControlLogo from "@/assets/logo-vmixcontrol-clean.png";

export default function VmixControlSkeleton({ cleanLayout = false }: { cleanLayout?: boolean }) {
  if (cleanLayout) {
    return (
      <div className="vmix-flat-palette relative min-h-screen w-full overflow-hidden flex flex-col" style={{ backgroundColor: "#111111" }}>
        <header className="w-full px-4 sm:px-8 pt-6 sm:pt-8 shrink-0">
          <div className="mx-auto w-full max-w-[1656px] min-h-[54px] sm:min-h-[56px] rounded-full flex items-center px-5 sm:px-8" style={{ backgroundColor: "#242424" }}>
            <img src={cleanVmixControlLogo} alt="Nexo vMix Control" className="block h-auto max-h-[22px] w-auto max-w-full object-contain object-left" />
          </div>
        </header>
        <main className="relative flex-1 flex items-center justify-center px-4 py-8 sm:py-10">
          <div className="w-full max-w-[380px] min-h-[438px] rounded-[28px] px-8 py-9 flex flex-col" style={{ backgroundColor: "#aaa" }}>
            <Skeleton className="mb-7 h-5 w-36 rounded bg-black/10" />
            <Skeleton className="mb-3 h-[51px] w-full rounded-full bg-white/80" />
            <Skeleton className="mb-3 h-[51px] w-full rounded-full bg-white/80" />
            <Skeleton className="h-[51px] w-[101px] rounded-full bg-black/70" />
            <div className="mt-auto pt-10 space-y-2">
              <Skeleton className="h-4 w-44 rounded bg-black/15" />
              <Skeleton className="h-4 w-32 rounded bg-black/15" />
            </div>
          </div>
        </main>
        <footer className="pointer-events-none absolute bottom-5 sm:bottom-7 left-5 sm:left-8 z-10">
          <img src={nexoLogo} alt="Nexo soluções visuais" className="block h-auto w-[104px] sm:w-[119px] object-contain" />
        </footer>
      </div>
    );
  }

  // Keep the original loading view for /vmix-control/switcher.
  return (
    <div className="vmix-flat-palette min-h-screen flex flex-col" style={{ backgroundColor: "#111111" }}>
      <header className="relative flex items-center justify-between px-6 py-3" style={{ backgroundColor: "#242424" }}>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <img src={cleanVmixControlLogo} alt="NEXO VMIX CONTROL" className="h-6 w-auto max-w-full object-contain" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="w-2 h-2 rounded-full bg-white/10" />
          <div className="flex flex-col items-end gap-1">
            <Skeleton className="h-5 w-28 rounded bg-white/10" />
            <Skeleton className="h-2 w-16 rounded bg-white/5" />
          </div>
        </div>
        <Skeleton className="h-5 w-32 rounded bg-white/10" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-36 rounded bg-white/5" />
          <Skeleton className="w-4 h-4 rounded bg-white/5" />
        </div>
      </header>
      <main className="flex-1 p-6 space-y-4" style={{ backgroundColor: "#191919" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Skeleton className="h-9 w-64 rounded-lg bg-white/5" />
          <Skeleton className="h-9 w-16 rounded-lg bg-white/5" />
          <Skeleton className="h-9 w-24 rounded-lg bg-white/5" />
          <div className="flex-1" />
          <Skeleton className="h-9 w-24 rounded-lg bg-white/5" />
          <Skeleton className="h-9 w-24 rounded-lg bg-white/5" />
        </div>
        <Skeleton className="h-10 w-full rounded-lg bg-white/5" />
        <div className="flex gap-1">
          <Skeleton className="h-8 w-24 rounded-lg bg-white/8" />
          <Skeleton className="h-8 w-24 rounded-lg bg-white/5" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl p-4" style={{ backgroundColor: "#1e1e24", border: "1px solid #ffffff08" }}>
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg bg-white/5" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 rounded bg-white/10" style={{ width: `${120 + i * 30}px` }} />
                  <Skeleton className="h-2.5 w-20 rounded bg-white/5" />
                </div>
                <div className="flex gap-1.5">
                  <Skeleton className="h-7 w-12 rounded bg-white/5" />
                  <Skeleton className="h-7 w-12 rounded bg-white/5" />
                  <Skeleton className="h-7 w-12 rounded bg-white/5" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-28 rounded-xl bg-white/5" />
          <Skeleton className="h-28 rounded-xl bg-white/5" />
        </div>
      </main>
    </div>
  );
}
