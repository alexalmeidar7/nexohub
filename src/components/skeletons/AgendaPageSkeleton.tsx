export default function AgendaPageSkeleton() {
  return (
    <div className="w-full max-w-none mx-0 space-y-6 pt-2 pb-12 font-sans animate-fade-in">
      {/* 1. Top Header Card Skeleton */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 flex items-center justify-between gap-4 flex-wrap animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-200" />
          <div className="space-y-2">
            <div className="h-5 w-48 rounded-md bg-slate-200" />
            <div className="h-3 w-72 rounded-md bg-slate-100" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-10 w-36 rounded-full bg-slate-100" />
          <div className="h-10 w-36 rounded-full bg-[#0055ff]/20" />
        </div>
      </section>

      {/* 2. Main Three Columns Skeleton (Matching AgendaPage 3-column grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] xl:grid-cols-[280px_1fr_320px] 2xl:grid-cols-[300px_1fr_340px] gap-5 items-stretch animate-pulse">
        {/* Left Column: Mini Calendar & Upcoming Events */}
        <div className="w-full space-y-5">
          {/* Mini Calendar Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="h-4 w-28 bg-slate-200 rounded" />
              <div className="flex gap-1">
                <div className="w-6 h-6 rounded-full bg-slate-100" />
                <div className="w-6 h-6 rounded-full bg-slate-100" />
              </div>
            </div>

            {/* Week days row */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-3 w-6 mx-auto bg-slate-100 rounded" />
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-7 w-7 mx-auto rounded-full ${
                    i === 12
                      ? "bg-[#0055ff]/30"
                      : i % 8 === 0
                      ? "bg-slate-200"
                      : "bg-slate-50"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Próximos 7 Dias Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] space-y-3">
            <div className="h-4 w-32 bg-slate-200 rounded" />
            <div className="space-y-2.5 pt-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl p-3 bg-slate-50 border border-slate-100 space-y-2">
                  <div className="h-3.5 w-3/4 bg-slate-200 rounded" />
                  <div className="h-2.5 w-1/2 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center Column: GoogleWeekGrid Skeleton */}
        <div className="overflow-hidden h-full flex flex-col bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
          {/* Toolbar */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-16 rounded-full bg-slate-100" />
              <div className="w-8 h-8 rounded-full bg-slate-100" />
              <div className="w-8 h-8 rounded-full bg-slate-100" />
              <div className="h-4 w-36 bg-slate-200 rounded ml-2" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-7 w-20 rounded-full bg-slate-100" />
              <div className="h-7 w-24 rounded-full bg-slate-100" />
            </div>
          </div>

          {/* 7 Days Column Headers */}
          <div className="grid grid-cols-8 border-b border-slate-100 p-2 text-center bg-slate-50/50">
            <div className="h-4 w-8 mx-auto bg-transparent" />
            {["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((d, i) => (
              <div key={d} className="space-y-1 py-1">
                <div className="h-2.5 w-8 mx-auto bg-slate-200 rounded" />
                <div className={`h-6 w-6 mx-auto rounded-full ${i === 3 ? "bg-[#0055ff]/30" : "bg-slate-100"}`} />
              </div>
            ))}
          </div>

          {/* Hourly Grid Rows */}
          <div className="divide-y divide-slate-50 p-2 space-y-2 flex-1">
            {Array.from({ length: 8 }).map((_, r) => (
              <div key={r} className="grid grid-cols-8 items-center h-12 relative">
                <div className="h-2.5 w-10 bg-slate-200/70 rounded text-[10px]" />
                <div className="col-span-7 h-full border-l border-slate-100 grid grid-cols-7 relative">
                  {r === 1 && (
                    <div className="col-start-2 col-span-2 h-9 my-auto rounded-xl bg-[#0055ff]/15 border border-[#0055ff]/30 p-2">
                      <div className="h-2 w-16 bg-[#0055ff]/40 rounded" />
                    </div>
                  )}
                  {r === 3 && (
                    <div className="col-start-4 col-span-1 h-9 my-auto rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-2">
                      <div className="h-2 w-14 bg-emerald-500/40 rounded" />
                    </div>
                  )}
                  {r === 5 && (
                    <div className="col-start-5 col-span-2 h-9 my-auto rounded-xl bg-purple-500/15 border border-purple-500/30 p-2">
                      <div className="h-2 w-12 bg-purple-500/40 rounded" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Today's Feed Skeleton (With Client Logo circles) */}
        <div className="w-full flex flex-col">
          <div className="overflow-hidden h-full flex flex-col bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 bg-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-28 bg-slate-200 rounded" />
                <div className="h-4 w-6 bg-slate-100 rounded-full" />
              </div>
              <div className="h-4 w-12 bg-blue-100 rounded-full" />
            </div>

            {/* Subheader: Selected date */}
            <div className="px-5 py-2.5 bg-slate-50/60 border-b border-slate-100/80 flex items-center justify-between">
              <div className="h-3 w-36 bg-slate-200 rounded" />
              <div className="h-3 w-12 bg-blue-200 rounded" />
            </div>

            {/* Feed Timeline Items */}
            <div className="p-5 flex-1 space-y-6 relative">
              {/* Vertical timeline line */}
              <div className="absolute left-[33px] top-6 bottom-6 w-[2px] bg-slate-100" />

              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="relative flex items-start gap-3 pl-1">
                  {/* Timeline dot */}
                  <div className="w-4 h-4 rounded-full bg-[#0055ff]/20 border-2 border-[#0055ff] shrink-0 mt-0.5 relative z-10" />

                  {/* Event item box */}
                  <div className="flex-1 rounded-2xl p-3.5 bg-slate-50/80 border border-slate-100 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="h-3 w-16 bg-blue-100 rounded" />
                      <div className="h-3 w-14 bg-slate-200 rounded-full" />
                    </div>

                    <div className="h-3.5 w-3/4 bg-slate-200 rounded" />
                    <div className="h-2.5 w-1/2 bg-slate-100 rounded" />

                    {/* Circle logo do cliente underneath */}
                    <div className="pt-1 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-200 shrink-0 border border-slate-100 shadow-sm" />
                      <div className="h-2.5 w-24 bg-slate-200 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
