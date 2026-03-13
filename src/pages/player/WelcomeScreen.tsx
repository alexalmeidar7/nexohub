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
  "/avatars/usr-9.png",
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

  // Staggered animation states
  const [showTitle, setShowTitle] = useState(false);
  const [showAvatar, setShowAvatar] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowTitle(true), 200);
    const t2 = setTimeout(() => setShowAvatar(true), 900);
    const t3 = setTimeout(() => setShowBottom(true), 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

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
      <h1
        className={`text-player-foreground text-2xl font-semibold mb-8 transition-all duration-700 ease-out ${
          showTitle ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        Bem vindo de volta, <span className="text-player-accent">{displayName}</span>
      </h1>

      <button
        onClick={() => {
          // Play login chime immediately in user gesture context
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const now = ctx.currentTime;
            const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
            notes.forEach((freq, i) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = "sine";
              osc.frequency.value = freq;
              gain.gain.setValueAtTime(0, now + i * 0.12);
              gain.gain.linearRampToValueAtTime(0.15, now + i * 0.12 + 0.04);
              gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.35);
              osc.connect(gain).connect(ctx.destination);
              osc.start(now + i * 0.12);
              osc.stop(now + i * 0.12 + 0.4);
            });
          } catch {}
          onContinue();
        }}
        onMouseDown={() => setPressing(true)}
        onMouseUp={() => setPressing(false)}
        className={`w-40 h-40 rounded-full bg-player-accent-soft flex items-center justify-center overflow-hidden mb-4 cursor-pointer transition-all duration-700 ease-out hover:scale-105 ${
          showAvatar ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
        } ${pressing ? "scale-95" : ""}`}
      >
        <img src={displayAvatar} alt={displayName} className="w-full h-full object-cover" />
      </button>

      <p className={`text-player-muted-foreground text-xs transition-all duration-500 ease-out ${showBottom ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        clique para continuar
      </p>

      <div className={`flex items-center gap-1 mt-3 transition-all duration-500 ease-out delay-100 ${showBottom ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
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
                className="rounded-full bg-player-card border-player-border text-black text-[14px] focus:border-[#e10000] focus:ring-[#e10000]"
              />
            </div>
            <div>
              <Label className="text-player-muted-foreground text-xs">E-mail</Label>
              <Input
                value={profile.email}
                onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                className="rounded-full bg-player-card border-player-border text-black text-[14px] focus:border-[#e10000] focus:ring-[#e10000]"
                disabled
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-player-muted-foreground text-xs">Cidade</Label>
                <Input
                  value={profile.cidade}
                  onChange={e => setProfile(p => ({ ...p, cidade: e.target.value }))}
                  className="rounded-full bg-player-card border-player-border text-black text-[14px] focus:border-[#e10000] focus:ring-[#e10000]"
                />
              </div>
              <div>
                <Label className="text-player-muted-foreground text-xs">Estado</Label>
                <Input
                  value={profile.estado}
                  onChange={e => setProfile(p => ({ ...p, estado: e.target.value }))}
                  className="rounded-full bg-player-card border-player-border text-black text-[14px] focus:border-[#e10000] focus:ring-[#e10000]"
                />
              </div>
            </div>
            <div>
              <Label className="text-player-muted-foreground text-xs">País</Label>
              <Input
                value={profile.pais}
                onChange={e => setProfile(p => ({ ...p, pais: e.target.value }))}
                className="rounded-full bg-player-card border-player-border text-black text-[14px] focus:border-[#e10000] focus:ring-[#e10000]"
              />
            </div>
            <div>
              <Label className="text-player-muted-foreground text-xs">WhatsApp</Label>
              <Input
                value={profile.whatsapp}
                onChange={e => setProfile(p => ({ ...p, whatsapp: e.target.value }))}
                className="rounded-full bg-player-card border-player-border text-black text-[14px] focus:border-[#e10000] focus:ring-[#e10000]"
                placeholder="+55 11 99999-9999"
              />
            </div>
            <div>
              <Label className="text-player-muted-foreground text-xs">Sexo</Label>
              <Select value={profile.sexo} onValueChange={v => setProfile(p => ({ ...p, sexo: v }))}>
                <SelectTrigger className="rounded-full bg-player-card border-player-border text-black text-[14px] focus:border-[#e10000] focus:ring-[#e10000]">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="bg-[#e10000] border-[#e10000] text-white text-[14px]">
                  <SelectItem value="masculino" className="text-white text-[14px] focus:bg-white/20 focus:text-white">Masculino</SelectItem>
                  <SelectItem value="feminino" className="text-white text-[14px] focus:bg-white/20 focus:text-white">Feminino</SelectItem>
                  <SelectItem value="outro" className="text-white text-[14px] focus:bg-white/20 focus:text-white">Outro</SelectItem>
                  <SelectItem value="prefiro_nao_dizer" className="text-white text-[14px] focus:bg-white/20 focus:text-white">Prefiro não dizer</SelectItem>
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
