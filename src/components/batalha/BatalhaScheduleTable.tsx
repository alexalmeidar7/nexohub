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
    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10">
        <CalendarClock className="h-4 w-4 text-yellow-400" />
        <h3 className="text-white font-bold text-sm uppercase tracking-wider">Batalhas Agendadas</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="text-white/40 text-[11px] uppercase tracking-wider border-b border-white/5">
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Horário</th>
              <th className="px-4 py-3">Artista 1</th>
              <th className="px-4 py-3">Artista 2</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {batalhas.map((b) => (
              <tr key={b.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 text-white/80 whitespace-nowrap">
                  {new Date(b.data_batalha + "T12:00:00").toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-white/80 whitespace-nowrap">
                  {b.horario_inicio} — {b.horario_fim}
                </td>
                <td className="px-4 py-3 text-white font-medium">
                  {b.artista1_nome || "—"} <span className="text-white/40 font-normal">({b.artista1_porcentagem}%)</span>
                </td>
                <td className="px-4 py-3 text-white font-medium">
                  {b.artista2_nome || "—"} <span className="text-white/40 font-normal">({b.artista2_porcentagem}%)</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onEdit(b)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(b.id)}
                      disabled={deleting === b.id}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors disabled:opacity-50"
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