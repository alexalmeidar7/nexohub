import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Pencil, Check, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface AvailableModule {
  key: string;
  name: string;
  icon: string;
}

interface ClientRow {
  user_id: string;
  nome: string;
  logo: string;
  endereco: string;
  telefone_comercial: string;
  telefone_participacao: string;
  site: string;
  instagram: string;
  facebook: string;
  youtube: string;
  modules: Record<string, boolean>;
}

interface ClientCardProps {
  client: ClientRow;
  modules: AvailableModule[];
  saving: string | null;
  onToggleModule: (userId: string, moduleKey: string, enabled: boolean) => void;
  onClientUpdated: () => void;
}

const inputStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#0d0446",
  border: "1px solid #d1d5db",
  borderRadius: "12px",
  backgroundColor: "#fff",
  padding: "6px 12px",
};

const fieldLabels: Record<string, string> = {
  nome: "Nome da empresa",
  endereco: "Endereço",
  telefone_comercial: "Tel. Comercial",
  telefone_participacao: "Tel. Participação",
  site: "Site",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
};

export default function ClientCard({ client, modules, saving, onToggleModule, onClientUpdated }: ClientCardProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [form, setForm] = useState({
    nome: client.nome,
    endereco: client.endereco,
    telefone_comercial: client.telefone_comercial,
    telefone_participacao: client.telefone_participacao,
    site: client.site,
    instagram: client.instagram,
    facebook: client.facebook,
    youtube: client.youtube,
  });

  const handleSave = async () => {
    setSavingEdit(true);
    const { error } = await supabase
      .from("empresa_config")
      .update(form)
      .eq("user_id", client.user_id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Dados atualizados!" });
      setEditing(false);
      onClientUpdated();
    }
    setSavingEdit(false);
  };

  return (
    <div
      className="rounded-xl p-5 space-y-4 transition-all duration-200"
      style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2ec0f6")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {client.logo ? (
            <img src={client.logo} alt="" className="w-10 h-10 rounded-lg object-contain" />
          ) : (
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold" style={{ backgroundColor: "#f0f4f8", color: "#0d0446" }}>
              {client.nome[0]}
            </div>
          )}
          <div>
            <p className="font-semibold" style={{ fontSize: "13px", color: "#0d0446" }}>{client.nome}</p>
            <p style={{ fontSize: "10px", color: "#9ca3af" }}>{client.user_id.slice(0, 8)}...</p>
          </div>
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-200"
          style={{
            fontSize: "11px",
            fontWeight: 500,
            backgroundColor: editing ? "#0d0446" : "transparent",
            color: editing ? "#fff" : "#0d0446",
            border: "1px solid #0d0446",
          }}
        >
          <Pencil size={12} /> {editing ? "Editando" : "Editar"}
        </button>
      </div>

      {/* Edit form */}
      <Collapsible open={editing}>
        <CollapsibleContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 pb-4 border-b" style={{ borderColor: "#e2e8f0" }}>
            {Object.entries(fieldLabels).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <label style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600 }}>{label}</label>
                <input
                  value={(form as any)[key] || ""}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full outline-none"
                  style={inputStyle}
                />
              </div>
            ))}
            <div className="md:col-span-2 flex gap-2 justify-end pt-2">
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-1 px-4 py-1.5 rounded-full transition-all"
                style={{ fontSize: "11px", border: "1px solid #d1d5db", color: "#6b7280" }}
              >
                <X size={12} /> Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={savingEdit}
                className="flex items-center gap-1 px-4 py-1.5 rounded-full transition-all disabled:opacity-50"
                style={{ fontSize: "11px", backgroundColor: "#0d0446", color: "#fff", border: "1px solid #0d0446" }}
              >
                {savingEdit ? <Loader2 className="animate-spin" size={12} /> : <Check size={12} />}
                Salvar
              </button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Modules */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {modules.map((mod) => {
          const isEnabled = client.modules[mod.key] || false;
          const isSaving = saving === `${client.user_id}-${mod.key}`;
          return (
            <div
              key={mod.key}
              className="flex items-center justify-between p-3 rounded-lg transition-colors"
              style={{
                border: isEnabled ? "1px solid rgba(46,192,246,0.3)" : "1px solid #e2e8f0",
                backgroundColor: isEnabled ? "rgba(46,192,246,0.05)" : "#ffffff",
              }}
            >
              <span className="truncate mr-2" style={{ fontSize: "11px", fontWeight: 500, color: "#0d0446" }}>
                {mod.name.replace("Módulo ", "")}
              </span>
              {isSaving ? (
                <Loader2 className="animate-spin" size={14} style={{ color: "#2ec0f6" }} />
              ) : (
                <Switch checked={isEnabled} onCheckedChange={(checked) => onToggleModule(client.user_id, mod.key, checked)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
