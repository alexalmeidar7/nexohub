export default function ProdutosPageSkeleton() {
  return (
    <div className="w-full max-w-none mx-0 space-y-6 pt-2 pb-12 font-sans animate-fade-in animate-pulse">
      {/* 1. Header Card */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#0055ff]/10 shrink-0" />
          <div className="space-y-2">
            <div className="h-5 w-64 bg-slate-200 rounded-md" />
            <div className="h-3 w-80 max-w-full bg-slate-100 rounded-md" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-9 w-32 rounded-full bg-slate-100" />
          <div className="h-9 w-36 rounded-full bg-[#0055ff]/30" />
        </div>
      </section>

      {/* 2. Product Form Section */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="h-4 w-44 bg-slate-200 rounded" />
          <div className="h-6 w-20 bg-slate-100 rounded-full" />
        </div>

        {/* Inputs */}
        <div className="space-y-4">
          {/* Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
            <div className="md:col-span-3 space-y-1.5">
              <div className="h-2.5 w-16 bg-slate-200 rounded" />
              <div className="h-11 w-full rounded-full bg-slate-50 border border-slate-200" />
            </div>
            <div className="md:col-span-6 space-y-1.5">
              <div className="h-2.5 w-24 bg-slate-200 rounded" />
              <div className="h-11 w-full rounded-full bg-slate-50 border border-slate-200" />
            </div>
            <div className="md:col-span-3 space-y-1.5">
              <div className="h-2.5 w-20 bg-slate-200 rounded" />
              <div className="h-11 w-full rounded-full bg-slate-50 border border-slate-200" />
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
            <div className="md:col-span-3 space-y-1.5">
              <div className="h-2.5 w-24 bg-slate-200 rounded" />
              <div className="h-11 w-full rounded-full bg-slate-50 border border-slate-200" />
            </div>
            <div className="md:col-span-3 space-y-1.5">
              <div className="h-2.5 w-28 bg-slate-200 rounded" />
              <div className="h-11 w-full rounded-full bg-slate-50 border border-slate-200" />
            </div>
            <div className="md:col-span-3 space-y-1.5">
              <div className="h-2.5 w-20 bg-slate-200 rounded" />
              <div className="h-11 w-full rounded-full bg-slate-50 border border-slate-200" />
            </div>
            <div className="md:col-span-3 space-y-1.5">
              <div className="h-2.5 w-24 bg-slate-200 rounded" />
              <div className="h-11 w-full rounded-full bg-slate-50 border border-slate-200" />
            </div>
          </div>

          {/* Row 3 */}
          <div className="space-y-1.5">
            <div className="h-2.5 w-36 bg-slate-200 rounded" />
            <div className="h-20 w-full rounded-2xl bg-slate-50 border border-slate-200" />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <div className="h-10 w-28 rounded-full bg-slate-100" />
          <div className="h-10 w-36 rounded-full bg-[#0055ff]/30" />
        </div>
      </section>

      {/* 3. Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`h-8 w-32 rounded-full shrink-0 ${
              i === 0 ? "bg-[#0055ff]/25" : "bg-slate-100"
            }`}
          />
        ))}
      </div>

      {/* 4. Products Table */}
      <div className="bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="grid grid-cols-6 gap-4 px-6 py-4 border-b border-slate-100 bg-[#f8fafc]/80 text-[10px]">
          <div className="h-3 w-16 bg-slate-200 rounded" />
          <div className="h-3 w-36 bg-slate-200 rounded" />
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-3 w-20 bg-slate-200 rounded" />
          <div className="h-3 w-20 bg-slate-200 rounded" />
          <div className="h-3 w-14 bg-slate-200 rounded ml-auto" />
        </div>

        <div className="divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-6 gap-4 px-6 py-4 items-center">
              <div className="h-6 w-20 bg-slate-200 rounded-md" />
              <div className="space-y-1 min-w-0">
                <div className="h-3.5 w-36 bg-slate-200 rounded" />
                <div className="h-2.5 w-48 bg-slate-100 rounded" />
              </div>
              <div className="h-5 w-24 bg-blue-100/60 rounded-full" />
              <div className="h-3 w-16 bg-slate-200 rounded" />
              <div className="h-4 w-20 bg-slate-200 rounded font-bold" />
              <div className="flex items-center justify-end gap-2">
                <div className="w-7 h-7 rounded-full bg-slate-100" />
                <div className="w-7 h-7 rounded-full bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
