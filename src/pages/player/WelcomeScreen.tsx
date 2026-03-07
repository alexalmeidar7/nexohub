import { useState } from "react";
import { UserCircle } from "lucide-react";

interface WelcomeScreenProps {
  userName: string;
  avatarUrl?: string | null;
  onContinue: () => void;
}

export default function WelcomeScreen({ userName, avatarUrl, onContinue }: WelcomeScreenProps) {
  const [pressing, setPressing] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-player"
      style={{ background: "var(--player-glow)" }}
    >
      <h1 className="text-player-foreground text-2xl font-semibold mb-8">
        Bem vindo de volta, <span className="text-player-accent">{userName}</span>
      </h1>

      <button
        onClick={onContinue}
        onMouseDown={() => setPressing(true)}
        onMouseUp={() => setPressing(false)}
        className={`w-40 h-40 rounded-full bg-player-accent-soft flex items-center justify-center overflow-hidden mb-4 cursor-pointer transition-transform hover:scale-105 ${pressing ? "scale-95" : ""}`}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" />
        ) : (
          <UserCircle className="h-24 w-24 text-player-muted-foreground" />
        )}
      </button>

      <p className="text-player-muted-foreground text-xs">clique para continuar</p>

      <button className="text-player-accent text-sm hover:underline mt-3">editar perfil</button>
    </div>
  );
}
