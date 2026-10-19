export default function FinanceiroPageSkeleton() {
  return (
    <div className="w-full max-w-none mx-0 space-y-6 pt-2 pb-12 font-sans animate-fade-in animate-pulse">
      {/* 1. Top Header Card */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(1,28,91,0.04)] border border-[#d0deff] flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-5 w-72 bg-slate-200 rounded-md" />
          <div className="h-3 w-96 max-w-full bg-slate-100 rounded-md" />
        </div>

        <div className="flex items-center flex-wrap gap-3">
          {/* Button + Cadastrar Cobrança */}
          <div className="h-9 w-44 rounded-full bg-[#0055ff]/30" />

          {/* Tabs Pill Container */}
          <div className="flex items-center p-1.5 rounded-full bg-[#d0deff]/20 border border-[#d0deff]/60 gap-1.5">
            <div className="h-7 w-36 rounded-full bg-[#0055ff]/25" />
            <div className="h-7 w-32 rounded-full bg-slate-100" />
            <div className="h-7 w-36 rounded-full bg-slate-100" />
          </div>
        </div>
      </section>

      {/* 2. Four KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Blue Gradient MRR Card */}
        <div className="rounded-3xl p-5 bg-gradient-to-br from-[#0055ff] to-[#011c5b] shadow-[0_8px_24px_rgba(0,85,255,0.2)] flex flex-col justify-between min-h-[140px] text-white">
          <div className="flex items-center justify-between">
            <div className="h-3 w-32 bg-white/30 rounded" />
            <div className="w-8 h-8 rounded-2xl bg-white/15" />
          </div>
          <div className="space-y-2 my-2">
            <div className="h-7 w-40 bg-white/40 rounded-lg" />
            <div className="h-2.5 w-28 bg-white/20 rounded" />
          </div>
          <div className="h-2 w-20 bg-white/25 rounded" />
        </div>

        {/* KPI 2: Clientes Faturados */}
        <div className="rounded-3xl p-5 bg-white border border-[#d0deff] shadow-[0_4px_20px_rgba(1,28,91,0.03)] flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between">
            <div className="h-3 w-32 bg-slate-200 rounded" />
            <div className="w-8 h-8 rounded-2xl bg-[#0055ff]/10" />
          </div>
          <div className="space-y-2 my-2">
            <div className="h-7 w-20 bg-slate-200 rounded-lg" />
            <div className="h-2.5 w-32 bg-slate-100 rounded" />
          </div>
          <div className="h-2 w-24 bg-emerald-100 rounded" />
        </div>

        {/* KPI 3: Cobranças Pendentes */}
        <div className="rounded-3xl p-5 bg-white border border-[#d0deff] shadow-[0_4px_20px_rgba(1,28,91,0.03)] flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between">
            <div className="h-3 w-36 bg-slate-200 rounded" />
            <div className="w-8 h-8 rounded-2xl bg-amber-500/10" />
          </div>
          <div className="space-y-2 my-2">
            <div className="h-7 w-16 bg-slate-200 rounded-lg" />
            <div className="h-2.5 w-36 bg-slate-100 rounded" />
          </div>
          <div className="h-2 w-20 bg-amber-100 rounded" />
        </div>

        {/* KPI 4: Disparo Automático */}
        <div className="rounded-3xl p-5 bg-white border border-[#d0deff] shadow-[0_4px_20px_rgba(1,28,91,0.03)] flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between">
            <div className="h-3 w-32 bg-slate-200 rounded" />
            <div className="w-8 h-8 rounded-2xl bg-emerald-500/10" />
          </div>
          <div className="space-y-2 my-2">
            <div className="h-6 w-24 bg-emerald-100 rounded-full" />
            <div className="h-2.5 w-32 bg-slate-100 rounded" />
          </div>
          <div className="h-2 w-28 bg-slate-100 rounded" />
        </div>
      </div>

      {/* 3. Search and Status Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="w-full sm:w-80 h-10 rounded-full bg-white border border-[#d0deff] px-4 flex items-center gap-3">
          <div className="w-4 h-4 rounded-full bg-slate-200 shrink-0" />
          <div className="h-3 w-36 bg-slate-200 rounded" />
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <div className="h-8 w-20 rounded-full bg-[#0055ff]/20" />
          <div className="h-8 w-20 rounded-full bg-slate-100" />
          <div className="h-8 w-24 rounded-full bg-slate-100" />
          <div className="h-8 w-24 rounded-full bg-slate-100" />
        </div>
      </div>

      {/* 4. Subscriptions Table Skeleton */}
      <div className="bg-white rounded-3xl border border-[#d0deff] shadow-[0_4px_24px_rgba(1,28,91,0.04)] overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-6 gap-4 px-6 py-4 border-b border-slate-100 bg-[#f8fafc]/80 text-[10px]">
          <div className="h-3 w-28 bg-slate-200 rounded" />
          <div className="h-3 w-32 bg-slate-200 rounded" />
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-3 w-20 bg-slate-200 rounded" />
          <div className="h-3 w-16 bg-slate-200 rounded ml-auto" />
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid grid-cols-6 gap-4 px-6 py-4 items-center">
              {/* Cliente */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-200 shrink-0" />
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="h-3.5 w-32 bg-slate-200 rounded" />
                  <div className="h-2.5 w-20 bg-slate-100 rounded" />
                </div>
              </div>

              {/* Produtos / Serviços */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="h-5 w-20 bg-blue-100/70 rounded-full" />
                {i % 2 === 0 && <div className="h-5 w-16 bg-emerald-100/70 rounded-full" />}
              </div>

              {/* Status */}
              <div>
                <div
                  className={`h-6 w-20 rounded-full ${
                    i % 3 === 0
                      ? "bg-amber-100/80"
                      : "bg-emerald-100/80"
                  }`}
                />
              </div>

              {/* Último Disparo */}
              <div className="space-y-1">
                <div className="h-3 w-24 bg-slate-200 rounded" />
                <div className="h-2.5 w-16 bg-slate-100 rounded" />
              </div>

              {/* Valor Mensal */}
              <div className="space-y-1">
                <div className="h-4 w-20 bg-slate-200 rounded font-bold" />
                <div className="h-2.5 w-12 bg-slate-100 rounded" />
              </div>

              {/* Ações */}
              <div className="flex items-center justify-end gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-100" />
                <div className="w-8 h-8 rounded-full bg-slate-100" />
                <div className="w-8 h-8 rounded-full bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
