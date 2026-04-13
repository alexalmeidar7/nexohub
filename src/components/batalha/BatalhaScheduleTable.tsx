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
    <div className="rounded-2xl overflow-hidden" style={{ background: "color-mix(in srgb, var(--layout-page-bg) 92%, white)", border: "1px solid color-mix(in srgb, var(--layout-border-color) 30%, transparent)" }}>
      <div className="flex items-center gap-2 px-5 py-3" style={{ background: "color-mix(in srgb, var(--layout-page-bg) 85%, white)", borderBottom: "1px solid color-mix(in srgb, var(--layout-border-color) 25%, transparent)" }}>
        <CalendarClock className="h-4 w-4" style={{ color: "color-mix(in srgb, var(--layout-page-text) 50%, transparent)" }} />
        <h3 className="font-semibold text-xs uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text) 60%, transparent)" }}>Batalhas Agendadas</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text) 35%, transparent)", borderBottom: "1px solid color-mix(in srgb, var(--layout-border-color) 20%, transparent)" }}>
              <th className="px-4 py-2.5 font-medium">Data</th>
              <th className="px-4 py-2.5 font-medium">Horário</th>
              <th className="px-4 py-2.5 font-medium">Artista 1</th>
              <th className="px-4 py-2.5 font-medium">Artista 2</th>
              <th className="px-4 py-2.5 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {batalhas.map((b) => (
              <tr key={b.id} className="transition-colors" style={{ borderBottom: "1px solid color-mix(in srgb, var(--layout-border-color) 15%, transparent)" }}>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "color-mix(in srgb, var(--layout-page-text) 70%, transparent)" }}>
                  {new Date(b.data_batalha + "T12:00:00").toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "color-mix(in srgb, var(--layout-page-text) 70%, transparent)" }}>
                  {b.horario_inicio} — {b.horario_fim}
                </td>
                <td className="px-4 py-3 font-medium" style={{ color: "color-mix(in srgb, var(--layout-page-text) 80%, transparent)" }}>
                  {b.artista1_nome || "—"} <span className="font-normal" style={{ color: "color-mix(in srgb, var(--layout-page-text) 35%, transparent)" }}>({b.artista1_porcentagem}%)</span>
                </td>
                <td className="px-4 py-3 font-medium" style={{ color: "color-mix(in srgb, var(--layout-page-text) 80%, transparent)" }}>
                  {b.artista2_nome || "—"} <span className="font-normal" style={{ color: "color-mix(in srgb, var(--layout-page-text) 35%, transparent)" }}>({b.artista2_porcentagem}%)</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onEdit(b)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
                      style={{ color: "color-mix(in srgb, var(--layout-page-text) 40%, transparent)" }}
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(b.id)}
                      disabled={deleting === b.id}
                      className="p-1.5 rounded-lg transition-colors hover:bg-black/5 disabled:opacity-30"
                      style={{ color: "color-mix(in srgb, var(--layout-page-text) 40%, transparent)" }}
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