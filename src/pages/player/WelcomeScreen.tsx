import { useState, useEffect } from "react";
import { UserCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const AVATARS = [
  "/avatars/usr-default.png",
  "/avatars/usr-1.png",
  "/avatars/usr-2.png",
  "/avatars/usr-3.png",
  "/avatars/usr-4.png",
  "/avatars/usr-5.png",
  "/avatars/usr-6.png",
  "/avatars/usr-7.png",
  "/avatars/usr-8.png",
];

interface Profile {
  nome: string;
  email: string;
  cidade: string;
  estado: string;
  pais: string;
  whatsapp: string;
  sexo: string;
  avatar_url: string;
}

interface WelcomeScreenProps {
  userName: string;
  avatarUrl?: string | null;
  onContinue: () => void;
}

export default function WelcomeScreen({ userName, avatarUrl, onContinue }: WelcomeScreenProps) {
  const [pressing, setPressing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { user, signOut } = useAuth();

  const [profile, setProfile] = useState<Profile>({
    nome: userName,
    email: user?.email || "",
    cidade: "",
    estado: "",
    pais: "",
    whatsapp: "",
    sexo: "",
    avatar_url: avatarUrl || "/avatars/usr-default.png",
  });

  // Load profile from DB
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile({
            nome: data.nome || userName,
            email: data.email || user.email || "",
            cidade: data.cidade || "",
            estado: data.estado || "",
            pais: data.pais || "",
            whatsapp: data.whatsapp || "",
            sexo: data.sexo || "",
            avatar_url: data.avatar_url || "/avatars/usr-default.png",
          });
        }
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({
        user_id: user.id,
        nome: profile.nome,
        email: profile.email,
        cidade: profile.cidade,
        estado: profile.estado,
        pais: profile.pais,
        whatsapp: profile.whatsapp,
        sexo: profile.sexo,
        avatar_url: profile.avatar_url,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar perfil");
    } else {
      toast.success("Perfil atualizado!");
      setEditOpen(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
  };

  const displayName = profile.nome || userName;
  const displayAvatar = profile.avatar_url || "/avatars/usr-default.png";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-player"
      style={{ background: "var(--player-glow)" }}
    >
      <h1 className="text-player-foreground text-2xl font-semibold mb-8">
        Bem vindo de volta, <span className="text-player-accent">{displayName}</span>
      </h1>

      <button
        onClick={onContinue}
        onMouseDown={() => setPressing(true)}
        onMouseUp={() => setPressing(false)}
        className={`w-40 h-40 rounded-full bg-player-accent-soft flex items-center justify-center overflow-hidden mb-4 cursor-pointer transition-transform hover:scale-105 ${pressing ? "scale-95" : ""}`}
      >
        <img src={displayAvatar} alt={displayName} className="w-full h-full object-cover" />
      </button>

      <p className="text-player-muted-foreground text-xs">clique para continuar</p>

      <div className="flex items-center gap-1 mt-3">
        <button
          onClick={() => setEditOpen(true)}
          className="text-player-accent text-sm hover:underline"
        >
          editar perfil
        </button>
        <span className="text-player-muted-foreground text-sm">|</span>
        <button
          onClick={handleLogout}
          className="text-player-accent text-sm hover:underline"
        >
          sair
        </button>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-player border-player-border text-player-foreground max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-player-foreground">Editar Perfil</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center mb-4">
            <button
              onClick={() => setAvatarPickerOpen(true)}
              className="w-24 h-24 rounded-full overflow-hidden border-2 border-player-accent hover:border-player-accent-hover transition-colors cursor-pointer"
            >
              <img src={profile.avatar_url || "/avatars/usr-default.png"} alt="Avatar" className="w-full h-full object-cover" />
            </button>
            <span className="text-player-muted-foreground text-xs mt-1">clique para alterar</span>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-player-muted-foreground text-xs">Nome</Label>
              <Input
                value={profile.nome}
                onChange={e => setProfile(p => ({ ...p, nome: e.target.value }))}
                className="bg-player-card border-player-border text-player-foreground"
              />
            </div>
            <div>
              <Label className="text-player-muted-foreground text-xs">E-mail</Label>
              <Input
                value={profile.email}
                onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                className="bg-player-card border-player-border text-player-foreground"
                disabled
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-player-muted-foreground text-xs">Cidade</Label>
                <Input
                  value={profile.cidade}
                  onChange={e => setProfile(p => ({ ...p, cidade: e.target.value }))}
                  className="bg-player-card border-player-border text-player-foreground"
                />
              </div>
              <div>
                <Label className="text-player-muted-foreground text-xs">Estado</Label>
                <Input
                  value={profile.estado}
                  onChange={e => setProfile(p => ({ ...p, estado: e.target.value }))}
                  className="bg-player-card border-player-border text-player-foreground"
                />
              </div>
            </div>
            <div>
              <Label className="text-player-muted-foreground text-xs">País</Label>
              <Input
                value={profile.pais}
                onChange={e => setProfile(p => ({ ...p, pais: e.target.value }))}
                className="bg-player-card border-player-border text-player-foreground"
              />
            </div>
            <div>
              <Label className="text-player-muted-foreground text-xs">WhatsApp</Label>
              <Input
                value={profile.whatsapp}
                onChange={e => setProfile(p => ({ ...p, whatsapp: e.target.value }))}
                className="bg-player-card border-player-border text-player-foreground"
                placeholder="+55 11 99999-9999"
              />
            </div>
            <div>
              <Label className="text-player-muted-foreground text-xs">Sexo</Label>
              <Select value={profile.sexo} onValueChange={v => setProfile(p => ({ ...p, sexo: v }))}>
                <SelectTrigger className="bg-player-card border-player-border text-player-foreground">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="bg-player-card border-player-border text-player-foreground">
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="feminino">Feminino</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                  <SelectItem value="prefiro_nao_dizer">Prefiro não dizer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full mt-4 py-2 rounded-lg bg-player-accent text-player-foreground font-semibold hover:bg-player-accent-hover transition-colors disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </DialogContent>
      </Dialog>

      {/* Avatar Picker Dialog */}
      <Dialog open={avatarPickerOpen} onOpenChange={setAvatarPickerOpen}>
        <DialogContent className="bg-player border-player-border text-player-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-player-foreground">Escolha seu avatar</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 py-2">
            {AVATARS.map(av => (
              <button
                key={av}
                onClick={() => {
                  setProfile(p => ({ ...p, avatar_url: av }));
                  setAvatarPickerOpen(false);
                }}
                className={`w-20 h-20 rounded-full overflow-hidden border-2 transition-colors mx-auto ${
                  profile.avatar_url === av ? "border-player-accent" : "border-transparent hover:border-player-accent-hover"
                }`}
              >
                <img src={av} alt="Avatar" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
