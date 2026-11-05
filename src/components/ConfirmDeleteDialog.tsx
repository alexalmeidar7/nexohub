import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmDeleteDialogProps {
  /** Nome do registro a excluir; o diálogo fica aberto enquanto houver um nome. */
  name: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** Ex.: "o registro de", "o participante". */
  prefix?: string;
}

export default function ConfirmDeleteDialog({ name, onConfirm, onCancel, prefix = "o registro de" }: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog open={name !== null} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
          <AlertDialogDescription>
            Você realmente deseja excluir {prefix} <strong className="text-[#002132]">{name}</strong>? Esta ação não poderá ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={onCancel}
            className="hover:bg-[#0055ff]/10 hover:text-[#0055ff] hover:border-[#0055ff]/40"
          >
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-[#dc2626] hover:bg-[#b91c1c]">Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
