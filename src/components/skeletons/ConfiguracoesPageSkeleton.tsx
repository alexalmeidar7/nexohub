export default function ConfiguracoesPageSkeleton() {
  return (
    <div className="w-full max-w-none mx-0 space-y-6 pt-2 pb-12 font-sans animate-fade-in animate-pulse">
      {/* 1. Top Header Card */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(1,28,91,0.04)] border border-[#d0deff] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#0055ff]/10 shrink-0" />
          <div className="space-y-2">
            <div className="h-5 w-60 bg-slate-200 rounded-md" />
            <div className="h-3 w-80 max-w-full bg-slate-100 rounded-md" />
          </div>
        </div>

        <div className="h-8 w-44 rounded-full bg-emerald-100/70" />
      </section>

      {/* 2. Grid de Configurações: 1/3 e 2/3 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (1 Col): Logo, Credenciais, PIX */}
        <div className="lg:col-span-1 space-y-6">
          {/* Card: Logo da Empresa */}
          <section className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgba(1,28,91,0.04)] border border-[#d0deff] flex flex-col items-center">
            <div className="w-full flex items-center justify-between pb-4 mb-5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#0055ff]/10" />
                <div className="h-3.5 w-28 bg-slate-200 rounded" />
              </div>
              <div className="h-5 w-16 bg-slate-100 rounded-full" />
            </div>

            {/* Dashed preview box */}
            <div className="w-full h-44 rounded-2xl bg-slate-50 border-2 border-dashed border-[#d0deff] p-4 flex flex-col items-center justify-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-slate-200" />
              <div className="h-3 w-32 bg-slate-200 rounded" />
            </div>

            <div className="w-full flex gap-2 mt-4">
              <div className="h-10 flex-1 rounded-xl bg-[#0055ff]/30" />
            </div>
          </section>

          {/* Card: Credenciais de Acesso */}
          <section className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgba(1,28,91,0.04)] border border-[#d0deff] space-y-4">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-[#0055ff]/10" />
              <div className="space-y-1">
                <div className="h-3.5 w-32 bg-slate-200 rounded" />
                <div className="h-2.5 w-40 bg-slate-100 rounded" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="h-2.5 w-14 bg-slate-200 rounded" />
                <div className="h-10 w-full rounded-xl bg-slate-50 border border-slate-200" />
              </div>
              <div className="space-y-1.5">
                <div className="h-2.5 w-20 bg-slate-200 rounded" />
                <div className="h-10 w-full rounded-xl bg-slate-50 border border-slate-200" />
              </div>
            </div>
          </section>

          {/* Card: Chave PIX */}
          <section className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgba(1,28,91,0.04)] border border-[#d0deff] space-y-4">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-[#0055ff]/10" />
              <div className="h-3.5 w-32 bg-slate-200 rounded" />
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="h-2.5 w-20 bg-slate-200 rounded" />
                <div className="h-10 w-full rounded-xl bg-slate-50 border border-slate-200" />
              </div>
              <div className="space-y-1.5">
                <div className="h-2.5 w-16 bg-slate-200 rounded" />
                <div className="h-10 w-full rounded-xl bg-slate-50 border border-slate-200" />
              </div>
            </div>
          </section>
        </div>

        {/* Right Column (2 Cols): Dados Cadastrais da Empresa */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(1,28,91,0.04)] border border-[#d0deff] space-y-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-[#0055ff]/10" />
              <div className="space-y-1">
                <div className="h-4 w-48 bg-slate-200 rounded" />
                <div className="h-2.5 w-64 bg-slate-100 rounded" />
              </div>
            </div>

            {/* Inputs 2-Column Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-2.5 w-24 bg-slate-200 rounded" />
                  <div className="h-11 w-full rounded-2xl bg-slate-50 border border-slate-200" />
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <div className="h-11 w-52 rounded-2xl bg-[#0055ff]/30" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
