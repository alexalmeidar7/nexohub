export default function AdminDashboardSkeleton() {
  return (
    <div className="w-full max-w-none mx-0 space-y-6 pt-2 pb-12 font-sans animate-fade-in animate-pulse">
      {/* 1. TOP BANNER: Dark Living Aurora Banner Skeleton */}
      <div className="relative rounded-3xl p-6 lg:p-8 bg-[#0a0c10] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden min-h-[220px] flex flex-col justify-between">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left: Section Title */}
          <div className="shrink-0 space-y-2">
            <div className="h-8 w-32 bg-white/20 rounded-lg" />
            <div className="h-8 w-24 bg-white/15 rounded-lg" />
            <div className="h-3 w-40 bg-white/10 rounded mt-2" />
          </div>

          {/* Cards Row inside Banner */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Card 1: Resumo Financeiro */}
            <div className="rounded-2xl bg-[#141720] p-5 text-white min-w-[250px] flex-1 sm:flex-initial flex flex-col justify-between h-36 relative border border-white/5">
              <div className="space-y-1.5">
                <div className="h-3 w-20 bg-white/20 rounded" />
                <div className="h-3 w-24 bg-white/20 rounded" />
                <div className="h-2.5 w-16 bg-[#0055ff]/50 rounded mt-1" />
              </div>

              <div className="space-y-1.5">
                <div className="h-6 w-36 bg-white/30 rounded" />
                <div className="h-2 w-28 bg-white/15 rounded" />
              </div>

              <div className="absolute bottom-3 right-3 w-5 h-5 rounded-full bg-[#0055ff]/40" />
            </div>

            {/* Card 2: Suporte Aberto */}
            <div className="rounded-2xl bg-[#141720] p-5 text-white min-w-[240px] flex-1 sm:flex-initial flex flex-col justify-between h-36 relative border border-white/5">
              <div className="space-y-1.5">
                <div className="h-3 w-24 bg-[#0055ff]/50 rounded" />
                <div className="h-3 w-28 bg-white/20 rounded" />
              </div>

              <div className="h-8 w-12 bg-white/30 rounded" />

              <div className="absolute bottom-3 right-3 w-5 h-5 rounded-full bg-[#0055ff]/40" />
            </div>

            {/* Card 3: Narrow plus action box */}
            <div className="rounded-2xl bg-[#141720] w-14 h-36 flex items-center justify-center border border-white/5">
              <div className="w-5 h-5 rounded bg-white/20" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. LOWER SECTION: Info Music Card + Agora nas Rádios */}
      <div className="flex items-start gap-5 flex-wrap lg:flex-nowrap w-full">
        {/* Info Music Card */}
        <div className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/80 flex flex-col justify-between w-full sm:w-[320px] shrink-0 h-[280px]">
          <div>
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <div className="h-4 w-16 bg-slate-300 rounded" />
                <div className="h-4 w-20 bg-slate-300 rounded" />
                <div className="h-2.5 w-24 bg-slate-200 rounded mt-1" />
              </div>
              <div className="w-9 h-9 rounded-xl bg-slate-100" />
            </div>

            <div className="my-5 space-y-1.5">
              <div className="h-10 w-36 bg-[#0047e1]/25 rounded-xl" />
              <div className="h-2.5 w-28 bg-slate-200 rounded" />
            </div>
          </div>

          <div>
            <div className="h-8 w-44 rounded-full bg-[#0047e1]/25" />
          </div>
        </div>

        {/* Agora nas Rádios Card Skeleton */}
        <div className="bg-[#090D15] rounded-3xl p-6 border border-slate-800/80 flex flex-col justify-between w-full flex-1 h-[280px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-5 w-20 bg-rose-500/20 rounded-full" />
              <div className="h-4 w-32 bg-slate-800 rounded" />
            </div>
            <div className="h-6 w-36 bg-slate-800 rounded-full" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center my-auto">
            <div className="space-y-3">
              <div className="h-3 w-28 bg-slate-800 rounded" />
              <div className="h-5 w-48 bg-slate-700 rounded" />
              <div className="h-12 w-full bg-slate-800/50 rounded-2xl" />
            </div>
            <div className="h-20 w-full bg-slate-800/50 rounded-2xl" />
          </div>

          <div className="h-1.5 w-full bg-slate-800 rounded-full" />
        </div>
      </div>
    </div>
  );
}
