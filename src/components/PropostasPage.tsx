import { useState } from "react";
import { FileText, Plus } from "lucide-react";

export default function PropostasPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Propostas Comerciais</h2>
          <p className="text-[11px] mt-0.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Gerencie suas propostas comerciais</p>
        </div>
        <button className="btn-skyglass-accent px-4 py-2 text-xs">
          <Plus size={14} />
          nova proposta
        </button>
      </div>

      <div className="rounded-xl p-8 text-center" style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
        <FileText size={32} style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 20%, transparent)" }} className="mx-auto mb-3" />
        <p className="text-xs font-semibold" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Nenhuma proposta cadastrada</p>
        <p className="text-[10px] mt-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 30%, transparent)" }}>Clique em "nova proposta" para começar</p>
      </div>
    </div>
  );
}
