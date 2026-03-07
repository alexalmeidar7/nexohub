import { useEffect, useState } from "react";
import { UserCircle } from "lucide-react";

interface WelcomeScreenProps {
  userName: string;
  avatarUrl?: string | null;
  onContinue: () => void;
}

export default function WelcomeScreen({ userName, avatarUrl, onContinue }: WelcomeScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFadeOut(true), 2000);
    const t2 = setTimeout(onContinue, 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onContinue]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-600 ${fadeOut ? "opacity-0" : "opacity-100"}`}
      style={{ background: "radial-gradient(ellipse at 50% 90%, rgba(180,20,20,0.25) 0%, #000 70%)" }}
    >
      <h1 className="text-white text-2xl font-semibold mb-8">
        Bem vindo de volta, <span className="text-red-500">{userName}</span>
      </h1>

      <div className="w-40 h-40 rounded-full bg-red-700/60 flex items-center justify-center overflow-hidden mb-4">
        {avatarUrl ? (
          <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" />
        ) : (
          <UserCircle className="h-24 w-24 text-white/70" />
        )}
      </div>

      <button className="text-red-500 text-sm hover:underline">editar perfil</button>
    </div>
  );
}
