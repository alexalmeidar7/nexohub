import { useState } from "react";
import { FileText, Plus } from "lucide-react";

export default function PropostasPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase" style={{ color: "#0d0446" }}>Propostas Comerciais</h2>
          <p className="text-[11px] mt-0.5" style={{ color: "rgba(13,4,70,0.5)" }}>Gerencie suas propostas comerciais</p>
        </div>
        <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)" }}>
          <Plus size={14} />
          nova proposta
        </button>
      </div>

      <div className="rounded-xl p-8 text-center" style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid rgba(13,4,70,0.08)" }}>
        <FileText size={32} style={{ color: "rgba(13,4,70,0.2)" }} className="mx-auto mb-3" />
        <p className="text-xs font-semibold" style={{ color: "rgba(13,4,70,0.4)" }}>Nenhuma proposta cadastrada</p>
        <p className="text-[10px] mt-1" style={{ color: "rgba(13,4,70,0.3)" }}>Clique em "nova proposta" para começar</p>
      </div>
    </div>
  );
}
