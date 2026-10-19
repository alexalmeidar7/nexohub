export default function ClientesPageSkeleton() {
  return (
    <div className="w-full max-w-none mx-0 space-y-6 pt-2 pb-12 font-sans animate-fade-in animate-pulse">
      {/* 1. Form Section Card */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 space-y-6">
        {/* Form Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-2">
            <div className="h-5 w-48 bg-slate-200 rounded-md" />
            <div className="h-3 w-80 max-w-full bg-slate-100 rounded-md" />
          </div>

          <div className="flex items-center gap-3">
            {/* Status Pill */}
            <div className="h-8 w-36 rounded-full bg-emerald-100/70" />
            {/* Save Button */}
            <div className="h-8 w-36 rounded-full bg-[#0055ff]/30" />
          </div>
        </div>

        {/* Inputs Grid */}
        <div className="space-y-4">
          {/* Row 1: CNPJ, Razão Social, Nome Fantasia */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
            <div className="md:col-span-3 space-y-1.5">
              <div className="h-2.5 w-16 bg-slate-200 rounded" />
              <div className="h-11 w-full rounded-full bg-slate-50 border border-slate-200" />
            </div>
            <div className="md:col-span-5 space-y-1.5">
              <div className="h-2.5 w-24 bg-slate-200 rounded" />
              <div className="h-11 w-full rounded-full bg-slate-50 border border-slate-200" />
            </div>
            <div className="md:col-span-4 space-y-1.5">
              <div className="h-2.5 w-32 bg-slate-200 rounded" />
              <div className="h-11 w-full rounded-full bg-slate-50 border border-slate-200" />
            </div>
          </div>

          {/* Row 2: CEP, Endereço, Cidade, Estado */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
            <div className="md:col-span-2 space-y-1.5">
              <div className="h-2.5 w-12 bg-slate-200 rounded" />
              <div className="h-11 w-full rounded-full bg-slate-50 border border-slate-200" />
            </div>
            <div className="md:col-span-6 space-y-1.5">
              <div className="h-2.5 w-20 bg-slate-200 rounded" />
              <div className="h-11 w-full rounded-full bg-slate-50 border border-slate-200" />
            </div>
            <div className="md:col-span-3 space-y-1.5">
              <div className="h-2.5 w-16 bg-slate-200 rounded" />
              <div className="h-11 w-full rounded-full bg-slate-50 border border-slate-200" />
            </div>
            <div className="md:col-span-1 space-y-1.5">
              <div className="h-2.5 w-8 bg-slate-200 rounded" />
              <div className="h-11 w-full rounded-full bg-slate-50 border border-slate-200" />
            </div>
          </div>

          {/* Row 3: Telefone Comercial, WhatsApp, Cliente Desde, Contato */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-2.5 w-28 bg-slate-200 rounded" />
                <div className="h-11 w-full rounded-full bg-slate-50 border border-slate-200" />
              </div>
            ))}
          </div>

          {/* Row 4: E-mail de Cobrança */}
          <div className="space-y-1.5">
            <div className="h-2.5 w-36 bg-slate-200 rounded" />
            <div className="h-11 w-full rounded-full bg-slate-50 border border-slate-200" />
          </div>
        </div>

        {/* Form Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <div className="h-10 w-28 rounded-full bg-slate-100" />
          <div className="h-10 w-36 rounded-full bg-[#0055ff]/30" />
        </div>
      </section>

      {/* 2. Registered Clients Table Section */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 space-y-6">
        {/* Table Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-5 w-44 bg-slate-200 rounded-md" />
            <div className="h-5 w-8 bg-slate-100 rounded-full" />
          </div>

          {/* Search Bar */}
          <div className="w-full sm:w-80 h-10 rounded-full bg-slate-50 border border-slate-200 px-4 flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-slate-200 shrink-0" />
            <div className="h-3 w-40 bg-slate-200 rounded" />
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-hidden rounded-2xl border border-slate-100">
          {/* Table Header */}
          <div className="grid grid-cols-7 gap-3 px-5 py-3.5 bg-slate-50 border-b border-slate-100 text-[10px]">
            <div className="h-3 w-28 bg-slate-200 rounded" />
            <div className="h-3 w-28 bg-slate-200 rounded" />
            <div className="h-3 w-24 bg-slate-200 rounded" />
            <div className="h-3 w-20 bg-slate-200 rounded" />
            <div className="h-3 w-16 bg-slate-200 rounded" />
            <div className="h-3 w-14 bg-slate-200 rounded" />
            <div className="h-3 w-12 bg-slate-200 rounded ml-auto" />
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid grid-cols-7 gap-3 px-5 py-3.5 items-center">
                {/* Cliente / Razão Social */}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0" />
                  <div className="space-y-1 min-w-0">
                    <div className="h-3 w-28 bg-slate-200 rounded" />
                    <div className="h-2 w-20 bg-slate-100 rounded" />
                  </div>
                </div>

                {/* Nome Fantasia */}
                <div className="h-3 w-24 bg-slate-200 rounded" />

                {/* Contato & Telefone */}
                <div className="space-y-1">
                  <div className="h-3 w-20 bg-slate-200 rounded" />
                  <div className="h-2 w-24 bg-slate-100 rounded" />
                </div>

                {/* Localização */}
                <div className="h-3 w-20 bg-slate-200 rounded" />

                {/* Desde */}
                <div className="h-3 w-16 bg-slate-200 rounded" />

                {/* Status */}
                <div>
                  <div className="h-6 w-16 rounded-full bg-emerald-100" />
                </div>

                {/* Ações */}
                <div className="flex items-center justify-end gap-2">
                  <div className="w-7 h-7 rounded-full bg-slate-100" />
                  <div className="w-7 h-7 rounded-full bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
