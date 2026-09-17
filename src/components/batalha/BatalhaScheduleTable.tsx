import { useState } from "react";
import { Pencil, Trash2, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getScheduleStatus } from "@/lib/scheduledItemUtils";

export interface BatalhaAgendada {
  id: string;
  artista1_nome: string;
  artista1_musica: string;
  artista1_porcentagem: number;
  artista1_imagem: string;
  artista2_nome: string;
  artista2_musica: string;
  artista2_porcentagem: number;
  artista2_imagem: string;
  data_batalha: string;
  horario_inicio: string;
  horario_fim: string;
}

interface Props {
  batalhas: BatalhaAgendada[];
  onEdit: (b: BatalhaAgendada) => void;
  onRefresh: () => void;
  onDelete?: (id: string) => Promise<void> | void;
}

export default function BatalhaScheduleTable({ batalhas, onEdit, onRefresh, onDelete }: Props) {
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      if (onDelete) {
        await onDelete(id);
      } else {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (isUuid) {
          const { error } = await supabase.from("batalhas_agendadas").delete().eq("id", id);
          if (error) console.warn("Supabase delete batalha warning:", error.message);
        }
        toast.success("Batalha excluída com sucesso");
        onRefresh();
      }
    } catch (err) {
      console.warn("Erro ao excluir batalha:", err);
    } finally {
      setDeleting(null);
    }
  };

  if (!batalhas.length) return null;

  const CYAN = "#00BFF0";
  const CARD_BG = "#D6F4FB";
  const DARK = "#0A2540";
  const FONT = "'Montserrat', sans-serif";

  return (
    <section
      style={{
        background: "#FFFFFF",
        borderRadius: 24,
        padding: 32,
        boxShadow: "0 2px 12px rgba(10, 37, 64, 0.05)",
        fontFamily: FONT,
      }}
    >
      <div className="flex items-center justify-between mb-8">
        <h2
          style={{
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: 2,
            color: DARK,
            textTransform: "uppercase",
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <CalendarClock size={24} style={{ color: CYAN }} />
          Batalhas Agendadas
        </h2>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: DARK,
            background: CARD_BG,
            padding: "6px 16px",
            borderRadius: 999,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Total: <span style={{ color: CYAN }}>{batalhas.length}</span>
        </div>
      </div>

      <div className="overflow-x-auto" style={{ borderRadius: 24, border: `1px solid ${CYAN}22` }}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr style={{ background: CYAN }}>
              <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none" }}>Data</th>
              <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none" }}>Horário</th>
              <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none" }}>Artista 1</th>
              <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none" }}>Artista 2</th>
              <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none" }}>Status</th>
              <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none", textAlign: "right" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {batalhas.map((b, idx) => {
              const status = getScheduleStatus(b.data_batalha, b.horario_inicio, b.horario_fim);
              return (
              <tr
                key={b.id}
                style={{
                  background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC",
                  transition: "background 0.2s ease"
                }}
                className="hover:bg-[#F1F5F9]"
              >
                <td style={{ padding: "14px 20px", fontSize: 13, color: DARK, whiteSpace: "nowrap" }}>
                  {new Date(b.data_batalha + "T12:00:00").toLocaleDateString("pt-BR")}
                </td>
                <td style={{ padding: "14px 20px", fontSize: 13, color: DARK, whiteSpace: "nowrap" }}>
                  {b.horario_inicio} — {b.horario_fim}
                </td>
                <td style={{ padding: "14px 20px", fontSize: 13, fontWeight: 700, color: DARK }}>
                  {b.artista1_nome || "—"} <span style={{ fontWeight: 500, color: CYAN, fontSize: 11 }}>({b.artista1_porcentagem}%)</span>
                </td>
                <td style={{ padding: "14px 20px", fontSize: 13, fontWeight: 700, color: DARK }}>
                  {b.artista2_nome || "—"} <span style={{ fontWeight: 500, color: CYAN, fontSize: 11 }}>({b.artista2_porcentagem}%)</span>
                </td>
                <td style={{ padding: "14px 20px", fontSize: 12 }}>
                  {status === "active" ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                      NO AR AGORA
                    </span>
                  ) : status === "scheduled" ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-blue-50 text-[#0055ff] border border-blue-200/80">
                      AGENDADA
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500">
                      ENCERRADA
                    </span>
                  )}
                </td>
                <td style={{ padding: "14px 20px", textAlign: "right" }}>
                  <div style={{ display: "inline-flex", gap: 8 }}>
                    <button
                      onClick={() => onEdit(b)}
                      style={{
                        width: 32, height: 32, borderRadius: 12,
                        background: CARD_BG, border: "none", cursor: "pointer",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        color: DARK, transition: "all 0.2s"
                      }}
                      className="hover:scale-110 active:scale-95"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(b.id)}
                      disabled={deleting === b.id}
                      style={{
                        width: 32, height: 32, borderRadius: 12,
                        background: "#FEE2E2", border: "none", cursor: "pointer",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        color: "#DC2626", transition: "all 0.2s",
                        opacity: deleting === b.id ? 0.5 : 1
                      }}
                      className="hover:scale-110 active:scale-95"
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
