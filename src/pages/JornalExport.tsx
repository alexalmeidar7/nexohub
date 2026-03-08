import { useEffect, useState } from "react";
import JornalExportView from "@/components/JornalExportView";
import type { JornalConfig } from "@/components/MontarJornalInline";
import type { JornalNewsItem } from "@/components/JornalBlockBuilder";

export default function JornalExportPage() {
  const [data, setData] = useState<{ config: JornalConfig; blocks: Record<number, JornalNewsItem[]> } | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("jornal_export_data");
    if (raw) {
      try {
        setData(JSON.parse(raw));
      } catch { /* ignore */ }
    }
  }, []);

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: "#ffffff", color: "#0d0446" }}>
        <p className="text-sm">Nenhum jornal para exibir. Exporte a partir da tela de Notícias.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#ffffff" }}>
      <JornalExportView config={data.config} blocks={data.blocks} onClose={() => window.close()} />
    </div>
  );
}
