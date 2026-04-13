import { useState } from "react";
import { Pencil, Trash2, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
}

export default function BatalhaScheduleTable({ batalhas, onEdit, onRefresh }: Props) {
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const { error } = await supabase.from("batalhas_agendadas").delete().eq("id", id);
    setDeleting(null);
    if (error) {
      toast.error("Erro ao excluir batalha");
    } else {
      toast.success("Batalha excluída");
      onRefresh();
    }
  };

  if (!batalhas.length) return null;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--layout-widget-bg)", border: "1px solid var(--layout-border-color)" }}>
      <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: "1px solid var(--layout-border-color)" }}>
        <CalendarClock className="h-4 w-4" style={{ color: "var(--layout-accent-color)" }} />
        <h3 className="font-bold text-sm uppercase tracking-wider" style={{ color: "var(--layout-widget-text)" }}>Batalhas Agendadas</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider opacity-40" style={{ color: "var(--layout-widget-text)", borderBottom: "1px solid var(--layout-border-color)" }}>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Horário</th>
              <th className="px-4 py-3">Artista 1</th>
              <th className="px-4 py-3">Artista 2</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {batalhas.map((b) => (
              <tr key={b.id} className="transition-colors" style={{ borderBottom: "1px solid var(--layout-border-color)" }}>
                <td className="px-4 py-3 whitespace-nowrap opacity-80" style={{ color: "var(--layout-widget-text)" }}>
                  {new Date(b.data_batalha + "T12:00:00").toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-3 whitespace-nowrap opacity-80" style={{ color: "var(--layout-widget-text)" }}>
                  {b.horario_inicio} — {b.horario_fim}
                </td>
                <td className="px-4 py-3 font-medium" style={{ color: "var(--layout-widget-text)" }}>
                  {b.artista1_nome || "—"} <span className="font-normal opacity-40">({b.artista1_porcentagem}%)</span>
                </td>
                <td className="px-4 py-3 font-medium" style={{ color: "var(--layout-widget-text)" }}>
                  {b.artista2_nome || "—"} <span className="font-normal opacity-40">({b.artista2_porcentagem}%)</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onEdit(b)}
                      className="p-1.5 rounded-lg transition-colors opacity-50 hover:opacity-100"
                      style={{ color: "var(--layout-widget-text)" }}
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(b.id)}
                      disabled={deleting === b.id}
                      className="p-1.5 rounded-lg transition-colors opacity-50 hover:opacity-100 disabled:opacity-30"
                      style={{ color: "var(--layout-widget-text)" }}
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}