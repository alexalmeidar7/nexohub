import { Skeleton } from "@/components/ui/skeleton";
import vmixControlLogo from "@/assets/logo-mixcontrol.png";
import nexoLogo from "@/assets/logo-nxo.png";

export default function VmixControlSkeleton() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden flex flex-col" style={{ backgroundColor: "#151515" }}>
      <header className="w-full px-4 sm:px-8 pt-6 sm:pt-8 shrink-0">
        <div
          className="mx-auto w-full max-w-[1656px] min-h-[54px] sm:min-h-[56px] rounded-full flex items-center px-5 sm:px-8"
          style={{ backgroundColor: "#242424" }}
        >
          <img src={vmixControlLogo} alt="Nexo vMix Control" className="block h-auto max-h-[22px] w-auto max-w-full object-contain object-left" />
        </div>
      </header>

      <main className="relative flex-1 flex items-center justify-center px-4 py-8 sm:py-10">
        <div className="w-full max-w-[380px] min-h-[438px] rounded-[34px] px-8 py-9 flex flex-col" style={{ backgroundColor: "#aaa" }}>
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
