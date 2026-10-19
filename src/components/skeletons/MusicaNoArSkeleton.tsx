import React from "react";
import { Music } from "lucide-react";

export default function MusicaNoArSkeleton() {
  return (
    <div className="w-full max-w-none mx-0 space-y-6 pt-2 pb-12 font-sans animate-fade-in animate-pulse">
      {/* 1. Header do Módulo Música no Ar (Padrão Nexo Card / Agenda) */}
      <section
        className="rounded-3xl p-6 lg:p-7 shadow-[0_4px_24px_rgba(0,191,240,0.08)] border border-[#00BFF0]/20 flex items-center justify-between gap-4 flex-wrap"
        style={{ background: "#D6F4FB" }}
      >
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-full bg-white border-2 border-[#00BFF0] flex items-center justify-center shadow-sm shrink-0">
            <Music size={20} className="text-[#00BFF0]" />
          </div>
          <div className="space-y-2">
            <div className="h-5 w-44 bg-[#0A2540]/20 rounded-md" />
            <div className="h-3 w-64 max-w-full bg-[#0A2540]/10 rounded-md" />
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="h-8 w-24 rounded-full bg-white/80 border border-[#00BFF0]/30" />
          <div className="h-8 w-32 rounded-full bg-white/80 border border-[#00BFF0]/30" />
        </div>
      </section>

      {/* 2. Player Principal No Ar Skeleton */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 space-y-5">
        <div className="flex items-center justify-between gap-4 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0055ff]/10 shrink-0" />
            <div className="space-y-1.5">
              <div className="h-4 w-32 bg-slate-200 rounded" />
              <div className="h-2.5 w-48 bg-slate-100 rounded" />
            </div>
          </div>
          <div className="h-7 w-28 rounded-full bg-slate-100" />
        </div>

        {/* Player Dark Card Shimmer */}
        <div
          className="rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6"
          style={{ background: "linear-gradient(135deg, #0A2540 0%, #0F2D4A 50%, #081B2E 100%)" }}
        >
          {/* Capa */}
          <div className="w-32 h-32 rounded-xl bg-white/10 shrink-0 flex items-center justify-center">
            <Music size={32} className="text-white/20" />
          </div>

          {/* Info + Barra de Progresso */}
          <div className="flex-1 w-full space-y-4">
            <div className="space-y-2">
              <div className="h-6 w-3/5 bg-white/20 rounded-md" />
              <div className="h-4 w-2/5 bg-white/10 rounded-md" />
            </div>

            {/* Barra de Progresso */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <div className="h-3 w-12 bg-white/15 rounded" />
                <div className="h-3 w-12 bg-white/15 rounded" />
              </div>
              <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-[#00BFF0] to-[#C6F03C]" />
              </div>
            </div>
          </div>

          {/* Aurora Soundwave */}
          <div className="hidden lg:flex flex-col items-end gap-2 shrink-0 pl-6 border-l border-white/15">
            <div className="h-3 w-24 bg-white/20 rounded" />
            <div className="h-16 w-52 rounded-xl bg-black/40 border border-white/10 p-2 flex items-center justify-between gap-1">
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full bg-white/20"
                  style={{ height: `${20 + (i % 5) * 16}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Configuração de Origens & Fontes Skeleton */}
      <section className="bg-white rounded-3xl p-6 lg:p-7 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 shrink-0" />
            <div className="h-4 w-44 bg-slate-200 rounded" />
          </div>
          <div className="h-7 w-20 rounded-full bg-slate-100" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="h-24 rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-2">
            <div className="h-3.5 w-32 bg-slate-200 rounded" />
            <div className="h-8 w-full bg-slate-200/60 rounded-full" />
          </div>
          <div className="h-24 rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-2">
            <div className="h-3.5 w-32 bg-slate-200 rounded" />
            <div className="h-8 w-full bg-slate-200/60 rounded-full" />
          </div>
        </div>
      </section>
    </div>
  );
}