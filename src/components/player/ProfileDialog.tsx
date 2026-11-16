import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Save, User } from "lucide-react";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import type { User as AuthUser } from "@supabase/supabase-js";
import { upsertPlayerListenerProfile } from "@/lib/playerListenerProfile";

interface ProfileDialogProps {
  user: AuthUser;
  profileName: string;
  profileEmail: string;
  profileCity: string;
  profileAvatar: string | null;
  radioUserId?: string | null;
  onClose: () => void;
  onSaved: (data: { nome: string; email: string; cidade: string; estado: string; avatar_url: string }) => void;
}

export default function ProfileDialog({
  user,
  profileName,
  profileEmail,
  profileCity,
  profileAvatar,
  radioUserId,
  onClose,
  onSaved,
}: ProfileDialogProps) {
  const cityParts = profileCity.split(", ");
  const [nome, setNome] = useState(profileName);
  const [email, setEmail] = useState(profileEmail);
  const [cidade, setCidade] = useState(cityParts[0] || "");
  const [estado, setEstado] = useState(cityParts[1] || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    if (radioUserId) {
      await upsertPlayerListenerProfile(user.id, radioUserId, { nome, email, cidade, estado, avatar_url: profileAvatar || "" });
    } else {
      await playerSupabase
        .from("profiles")
        .update({ nome, email, cidade, estado })
        .eq("user_id", user.id);
    }
    setSaving(false);
    onSaved({ nome, email, cidade, estado, avatar_url: profileAvatar || "" });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4 animate-fade-in"
        style={{
          background: "rgba(10,10,10,0.95)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
        >
          <X size={16} />
        </button>

        {/* Avatar + Title */}
        <div className="flex items-center gap-3">
          <div
            className="w-14 h-14 rounded-full overflow-hidden shrink-0"
            style={{ border: "2px solid rgba(255,255,255,0.15)" }}
          >
            <img
              src={profileAvatar || "/avatars/usr-default.png"}
              alt={nome}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">Meu Perfil</h3>
            <p className="text-white/40 text-xs">Edite suas informações</p>
          </div>
        </div>

        <div className="w-full h-px" style={{ background: "rgba(255,255,255,0.08)" }} />

        {/* Fields */}
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-white/50 font-medium uppercase tracking-wider">Nome</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-white/50 font-medium uppercase tracking-wider">E-mail</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-white/50 font-medium uppercase tracking-wider">Cidade</span>
              <input
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-white/50 font-medium uppercase tracking-wider">Estado</span>
              <input
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              />
            </label>
          </div>
        </div>

        {/* Save button */}
        <Button variant="save"
          onClick={handleSave}
          disabled={saving}
        >
          <Save size={14} />
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
