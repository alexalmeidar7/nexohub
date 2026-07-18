import { useState, useEffect, useRef } from "react";
import { UserCircle, Pencil, LogIn, Star } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
  backgroundUrl?: string | null;
  channelName?: string;
  logoUrl?: string | null;
  onContinue: () => void;
  onLoginSuccess?: () => void;
}

const COUNTDOWN_SECONDS = 3;

export default function WelcomeScreen({
  userName,
  avatarUrl,
  backgroundUrl,
  channelName,
  logoUrl,
  onContinue,
  onLoginSuccess,
}: WelcomeScreenProps) {
  const { user, signOut } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const interactedRef = useRef(false);
  const [points, setPoints] = useState(0);

  const [profile, setProfile] = useState<Profile>({
    nome: userName,
    email: user?.email || "",
    cidade: "", estado: "", pais: "", whatsapp: "", sexo: "",
    avatar_url: avatarUrl || "/avatars/usr-default.png",
  });


  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("user_id", user.id).single().then(({ data }) => {
      if (data) {
        setProfile({
          nome: data.nome || userName,
          email: data.email || user.email || "",
          cidade: data.cidade || "", estado: data.estado || "",
          pais: data.pais || "", whatsapp: data.whatsapp || "",
          sexo: data.sexo || "",
          avatar_url: data.avatar_url || "/avatars/usr-default.png",
        });
      }
    });
    // Simple points tally from music likes
    supabase.from("music_likes").select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => setPoints(((count ?? 0) as number) * 4));
  }, [user, userName]);


  const cancelAutoAdvance = () => {
    interactedRef.current = true;
    setInteracted(true);
  };


  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      user_id: user.id,
      nome: profile.nome, email: profile.email,
      cidade: profile.cidade, estado: profile.estado, pais: profile.pais,
      whatsapp: profile.whatsapp, sexo: profile.sexo,
      avatar_url: profile.avatar_url,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error("Erro ao salvar perfil");
    else { toast.success("Perfil atualizado!"); setEditOpen(false); }
  };

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + window.location.pathname,
      });
      if (result?.error) {
        toast.error("Falha ao entrar com Google");
        setSigningIn(false);
        return;
      }
      if (result?.redirected) return;
      onLoginSuccess?.();
    } catch (e) {
      toast.error("Falha ao entrar com Google");
      setSigningIn(false);
    }
  };

  const displayName = profile.nome || userName;
  const displayAvatar = profile.avatar_url || "/avatars/usr-default.png";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black text-white">
      {/* Background: channel thumb */}
      <div className="absolute inset-0">
        {backgroundUrl ? (
          <>
            <img
              src={backgroundUrl}
              alt=""
              className="w-full h-full object-cover"
              style={{ filter: "brightness(0.55) saturate(1.05)" }}
              draggable={false}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.9) 100%)",
              }}
            />
          </>
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 80% at 30% 20%, #1e2430 0%, #131519 55%, #08090b 100%)",
            }}
          />
        )}
      </div>

      {/* Top-right: channel title + subtitle */}
      <div className="absolute top-0 right-0 z-10 px-10 sm:px-14 pt-10 text-right animate-fade-in">
        <div className="text-[10px] uppercase tracking-[0.28em] text-white/60">
          {user ? "bem vindo de volta" : "bem vindo"}
        </div>
        <div
          className="mt-2 font-semibold leading-tight"
          style={{
            fontSize: "clamp(28px, 3.6vw, 52px)",
            letterSpacing: "-0.02em",
            textShadow: "0 2px 24px rgba(0,0,0,0.55)",
          }}
        >
          {channelName || "Nexo Player"}
        </div>
      </div>

      {/* Center avatar card */}
      <div className="absolute inset-0 flex items-center justify-center">
        {user ? (
          <button
            onClick={() => { cancelAutoAdvance(); onContinue(); }}
            className="group relative flex flex-col items-center gap-5 outline-none"
            aria-label="Entrar no player"
          >
            <div
              className="relative rounded-[36px] overflow-hidden transition-all duration-500 ease-out group-hover:scale-[1.04]"
              style={{
                width: "clamp(180px, 22vw, 260px)",
                height: "clamp(180px, 22vw, 260px)",
                background: "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
                border: "1px solid rgba(255,255,255,0.14)",
                boxShadow:
                  "0 24px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
                backdropFilter: "blur(14px) saturate(1.2)",
                WebkitBackdropFilter: "blur(14px) saturate(1.2)",
              }}
            >
              <img
                src={displayAvatar}
                alt={displayName}
                className="w-full h-full object-cover"
                draggable={false}
              />
              {/* Edit hover chip (top-right of the avatar card) */}
              <span
                onClick={(e) => { e.stopPropagation(); cancelAutoAdvance(); setEditOpen(true); }}
                className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0 cursor-pointer"
                style={{
                  background: "rgba(0,0,0,0.55)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  backdropFilter: "blur(8px)",
                }}
                aria-label="Editar perfil"
                role="button"
              >
                <Pencil className="w-4 h-4 text-white" />
              </span>
            </div>
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/55">continuar como</div>
              <div className="mt-1 text-xl sm:text-2xl font-medium">{displayName}</div>
            </div>
          </button>
        ) : (
          <button
            onClick={handleGoogleLogin}
            disabled={signingIn}
            className="group flex flex-col items-center gap-5 outline-none"
          >
            <div
              className="relative rounded-[36px] flex items-center justify-center transition-all duration-500 ease-out group-hover:scale-[1.04]"
              style={{
                width: "clamp(180px, 22vw, 260px)",
                height: "clamp(180px, 22vw, 260px)",
                background: "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))",
                border: "1px solid rgba(255,255,255,0.16)",
                boxShadow:
                  "0 24px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
                backdropFilter: "blur(14px) saturate(1.2)",
                WebkitBackdropFilter: "blur(14px) saturate(1.2)",
              }}
            >
              <UserCircle className="w-20 h-20 text-white/85" strokeWidth={1.2} />
            </div>
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/55">acesso</div>
              <div className="mt-1 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium"
                style={{
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  backdropFilter: "blur(10px)",
                }}
              >
                <LogIn className="w-4 h-4" />
                {signingIn ? "Conectando..." : "Entrar com Google"}
              </div>
            </div>
          </button>
        )}
      </div>




      {/* Bottom-left: logout link for logged users */}
      {user && (
        <div className="absolute bottom-8 left-8 sm:bottom-10 sm:left-10 z-10">
          <button
            onClick={async () => { cancelAutoAdvance(); await signOut(); }}
            className="text-xs uppercase tracking-[0.24em] text-white/50 hover:text-white/85 transition-colors"
          >
            sair
          </button>
        </div>
      )}

      {/* Edit Profile Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (v) cancelAutoAdvance(); }}>
        <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Editar Perfil</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center mb-4">
            <button
              onClick={() => setAvatarPickerOpen(true)}
              className="w-24 h-24 rounded-2xl overflow-hidden border border-white/15 hover:border-white/40 transition-colors cursor-pointer"
            >
              <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            </button>
            <span className="text-white/50 text-xs mt-2">clique para alterar</span>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-white/60 text-xs">Nome</Label>
              <Input value={profile.nome} onChange={e => setProfile(p => ({ ...p, nome: e.target.value }))}
                className="rounded-full bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <Label className="text-white/60 text-xs">E-mail</Label>
              <Input value={profile.email} disabled
                className="rounded-full bg-white/5 border-white/10 text-white/70" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-white/60 text-xs">Cidade</Label>
                <Input value={profile.cidade} onChange={e => setProfile(p => ({ ...p, cidade: e.target.value }))}
                  className="rounded-full bg-white/5 border-white/10 text-white" />
              </div>
              <div>
                <Label className="text-white/60 text-xs">Estado</Label>
                <Input value={profile.estado} onChange={e => setProfile(p => ({ ...p, estado: e.target.value }))}
                  className="rounded-full bg-white/5 border-white/10 text-white" />
              </div>
            </div>
            <div>
              <Label className="text-white/60 text-xs">País</Label>
              <Input value={profile.pais} onChange={e => setProfile(p => ({ ...p, pais: e.target.value }))}
                className="rounded-full bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <Label className="text-white/60 text-xs">WhatsApp</Label>
              <Input value={profile.whatsapp} onChange={e => setProfile(p => ({ ...p, whatsapp: e.target.value }))}
                className="rounded-full bg-white/5 border-white/10 text-white" placeholder="+55 11 99999-9999" />
            </div>
            <div>
              <Label className="text-white/60 text-xs">Sexo</Label>
              <Select value={profile.sexo} onValueChange={v => setProfile(p => ({ ...p, sexo: v }))}>
                <SelectTrigger className="rounded-full bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-white/10 text-white">
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="feminino">Feminino</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                  <SelectItem value="prefiro_nao_dizer">Prefiro não dizer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="mt-4 rounded-full">
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Avatar Picker */}
      <Dialog open={avatarPickerOpen} onOpenChange={setAvatarPickerOpen}>
        <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Escolha seu avatar</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 py-2">
            {AVATARS.map(av => (
              <button
                key={av}
                onClick={() => { setProfile(p => ({ ...p, avatar_url: av })); setAvatarPickerOpen(false); }}
                className={`w-20 h-20 rounded-2xl overflow-hidden border-2 transition-colors mx-auto ${
                  profile.avatar_url === av ? "border-white" : "border-transparent hover:border-white/40"
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
