/**
 * Skeleton ultra moderno da Home (Dashboard) House Mix.
 * Alinhado com o visual da Agenda (cards rounded-3xl, bg-white, border-slate-100, shimmer azul suave).
 */
export default function DashboardSkeleton() {
  return (
    <div className="w-full max-w-none mx-0 px-4 lg:px-8 pt-4 pb-12 space-y-6 font-sans animate-fade-in">
      {/* 1. Header Navigation Bar Pill Skeleton */}
      <div className="bg-white/80 backdrop-blur-md rounded-full px-6 py-3.5 flex items-center justify-between border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.03)] animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-200" />
          <div className="h-4 w-28 bg-slate-200 rounded-md" />
        </div>
        <div className="hidden md:flex items-center gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-7 w-20 rounded-full bg-slate-100" />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-100" />
          <div className="h-8 w-24 rounded-full bg-[#0055ff]/20" />
        </div>
      </div>


      {/* 3. Main Bento Grid Widgets Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-pulse">
        {/* Large Widget (Programação / No Ar) */}
        <div className="md:col-span-2 bg-white rounded-3xl p-6 border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#0055ff]/10" />
              <div className="h-4 w-36 bg-slate-200 rounded" />
            </div>
            <div className="h-6 w-20 rounded-full bg-slate-100" />
          </div>
          <div className="h-36 rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-3">
            <div className="h-5 w-1/3 bg-slate-200 rounded" />
            <div className="h-3 w-2/3 bg-slate-100 rounded" />
            <div className="h-10 w-full rounded-xl bg-slate-200/60 mt-4" />
          </div>
        </div>

        {/* Small Widget (Weather / Stats) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#0055ff]/10" />
            <div className="h-4 w-28 bg-slate-200 rounded" />
          </div>
          <div className="h-36 rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-3">
            <div className="h-8 w-1/2 bg-slate-200 rounded" />
            <div className="h-3 w-3/4 bg-slate-100 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
