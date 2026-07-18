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
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [bgColors, setBgColors] = useState<[string, string]>(["rgba(40,40,50,0.85)", "rgba(15,15,20,0.9)"]);

  useEffect(() => {
    if (!backgroundUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 32; c.height = 32;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 32, 32);
        const sample = (x: number, y: number) => {
          const d = ctx.getImageData(x, y, 1, 1).data;
          return `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
        };
        setBgColors([sample(6, 6), sample(26, 26)]);
      } catch {}
    };
    img.src = backgroundUrl;
  }, [backgroundUrl]);

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

      {/* Left-aligned welcome layout */}
      <div className="absolute inset-0 z-10 flex flex-col justify-start px-8 sm:px-14 pt-10 sm:pt-14 animate-fade-in">
        {/* Heading */}
        <h1
          className="font-semibold leading-tight lowercase"
          style={{
            fontSize: "clamp(22px, 2.4vw, 34px)",
            letterSpacing: "-0.01em",
            textShadow: "0 2px 20px rgba(0,0,0,0.55)",
          }}
        >
          {user ? "bem vindo de volta" : "bem vindo"}
        </h1>

        {/* Avatar + info row */}
        <div className="mt-8 sm:mt-10 flex items-start gap-5">
          {user ? (
            <>
              <button
                onClick={() => { cancelAutoAdvance(); onContinue(); }}
                className="group relative shrink-0 outline-none"
                aria-label="Entrar no player"
              >
                <div
                  className="relative rounded-[28px] overflow-hidden transition-all duration-500 ease-out group-hover:scale-[1.04]"
                  style={{
                    width: "clamp(110px, 11vw, 150px)",
                    height: "clamp(110px, 11vw, 150px)",
                    background: `linear-gradient(145deg, ${bgColors[0]}, ${bgColors[1]})`,
                    border: "1px solid rgba(255,255,255,0.14)",
                    boxShadow: "0 18px 50px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
                  }}
                >
                  <img
                    src={displayAvatar}
                    alt={displayName}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                  <span
                    onClick={(e) => { e.stopPropagation(); cancelAutoAdvance(); setEditOpen(true); }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background: "rgba(0,0,0,0.35)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      backdropFilter: "blur(6px)",
                    }}
                    aria-label="Editar perfil"
                    role="button"
                  >
                    <Pencil className="w-3 h-3 text-white/75" strokeWidth={1.5} />
                  </span>
                </div>
              </button>

              <div className="flex flex-col gap-2 pt-2">
                <div
                  className="font-medium leading-none"
                  style={{
                    fontSize: "clamp(20px, 1.9vw, 28px)",
                    textShadow: "0 2px 20px rgba(0,0,0,0.55)",
                  }}
                >
                  {displayName}
                </div>
                <div className="flex items-center gap-2 text-white/85">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => {
                      const rating = Math.min(5, Math.max(0, Math.round((points / 100) * 2) / 2));
                      const filled = i < Math.floor(rating);
                      const half = !filled && i < rating;
                      return (
                        <Star
                          key={i}
                          size={13}
                          fill={filled ? "#ffffff" : half ? "url(#half-star)" : "transparent"}
                          style={{ color: filled || half ? "#ffffff" : "rgba(255,255,255,0.35)" }}
                        />
                      );
                    })}
                  </div>
                  <span className="text-xs text-white/70">{points} pts</span>
                </div>
                <button
                  onClick={async () => { cancelAutoAdvance(); await signOut(); }}
                  className="mt-1 self-start text-[11px] lowercase px-3 py-1 rounded-full transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.10)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  sair
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setAuthMode("login")}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium lowercase transition-all hover:scale-[1.03]"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.20)",
                  backdropFilter: "blur(10px)",
                }}
              >
                <LogIn className="w-4 h-4" />
                entrar
              </button>
              <button
                onClick={() => setAuthMode("signup")}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium lowercase transition-all hover:scale-[1.03]"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  backdropFilter: "blur(10px)",
                }}
              >
                cadastre-se
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Login / Signup Popup */}
      <Dialog open={authMode !== null} onOpenChange={(v) => { if (!v) setAuthMode(null); }}>
        <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white lowercase">
              {authMode === "signup" ? "cadastre-se" : "entrar"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-white/70 text-sm text-center">
              {authMode === "signup"
                ? "crie sua conta usando o google para começar"
                : "acesse sua conta com o google"}
            </p>
            <button
              onClick={handleGoogleLogin}
              disabled={signingIn}
              className="w-full inline-flex items-center justify-center gap-3 px-5 py-3 rounded-full text-sm font-medium text-black bg-white hover:bg-white/90 transition-colors disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.7 6.4 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c10.8 0 19.5-8.7 19.5-19.5 0-1.2-.1-2.3-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.7 15.1 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.7 6.4 29.1 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.1z"/>
                <path fill="#4CAF50" d="M24 43.5c5.1 0 9.7-1.9 13.2-5l-6.1-5c-2 1.4-4.4 2.3-7.1 2.3-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39 16.2 43.5 24 43.5z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.1 5C41.7 34.9 43.5 30 43.5 24c0-1.2-.1-2.3-.4-3.5z"/>
              </svg>
              {signingIn
                ? "conectando..."
                : authMode === "signup" ? "cadastrar com google" : "entrar com google"}
            </button>
          </div>
        </DialogContent>
      </Dialog>



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
                className="rounded-full border-white/10 text-white placeholder:text-white/40"
                style={{ backgroundColor: "#323431" }} />
            </div>
            <div>
              <Label className="text-white/60 text-xs">E-mail</Label>
              <Input value={profile.email} disabled
                className="rounded-full border-white/10 text-white/70"
                style={{ backgroundColor: "#323431" }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-white/60 text-xs">Cidade</Label>
                <Input value={profile.cidade} onChange={e => setProfile(p => ({ ...p, cidade: e.target.value }))}
                  className="rounded-full border-white/10 text-white"
                  style={{ backgroundColor: "#323431" }} />
              </div>
              <div>
                <Label className="text-white/60 text-xs">Estado</Label>
                <Input value={profile.estado} onChange={e => setProfile(p => ({ ...p, estado: e.target.value }))}
                  className="rounded-full border-white/10 text-white"
                  style={{ backgroundColor: "#323431" }} />
              </div>
            </div>
            <div>
              <Label className="text-white/60 text-xs">País</Label>
              <Input value={profile.pais} onChange={e => setProfile(p => ({ ...p, pais: e.target.value }))}
                className="rounded-full border-white/10 text-white"
                style={{ backgroundColor: "#323431" }} />
            </div>
            <div>
              <Label className="text-white/60 text-xs">WhatsApp</Label>
              <Input value={profile.whatsapp} onChange={e => setProfile(p => ({ ...p, whatsapp: e.target.value }))}
                className="rounded-full border-white/10 text-white placeholder:text-white/40"
                style={{ backgroundColor: "#323431" }} placeholder="+55 11 99999-9999" />
            </div>
            <div>
              <Label className="text-white/60 text-xs">Sexo</Label>
              <Select value={profile.sexo} onValueChange={v => setProfile(p => ({ ...p, sexo: v }))}>
                <SelectTrigger className="rounded-full border-white/10 text-white" style={{ backgroundColor: "#323431" }}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="border-white/10 text-white" style={{ backgroundColor: "#323431" }}>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="feminino">Feminino</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                  <SelectItem value="prefiro_nao_dizer">Prefiro não dizer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="mt-5 rounded-full text-white border border-white/10 hover:opacity-90"
            style={{ backgroundColor: "#323431" }}
          >
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
