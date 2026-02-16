import { useState } from "react";
import { ArrowRight } from "lucide-react";

interface LoginScreenProps {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="bg-login w-full max-w-md rounded-4xl p-10 shadow-2xl animate-fade-in">
        <h1 className="text-center text-login-foreground font-medium tracking-[0.2em] mb-8 text-xs">
          MASTERVIEW / LOGIN
        </h1>
        <div className="space-y-4">
          <input
            type="text"
            placeholder="usuário"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="w-full bg-foreground text-muted-foreground rounded-full px-6 py-4 outline-none placeholder:text-muted-foreground/50" />

          <input
            type="password"
            placeholder="senha"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="w-full bg-foreground text-muted-foreground rounded-full px-6 py-4 outline-none placeholder:text-muted-foreground/50" />

          <div className="flex justify-end pt-2">
            <button
              onClick={onLogin}
              className="bg-primary hover:brightness-95 transition-all flex items-center gap-3 px-8 py-3 rounded-full font-medium text-primary-foreground text-sm">

              entrar
              <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </div>
      <div className="mt-20">
        <span className="text-foreground font-bold text-2xl tracking-tighter flex items-center gap-1">
          svn<span className="text-sm">✦</span>broadcast
        </span>
      </div>
    </div>);

}