import { useState } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logoNexo from "@/assets/logo-nexo.png";

interface TpLoginProps {
  authLoading: boolean;
  onLoginSuccess: () => void;
}

export default function TpLogin({ authLoading, onLoginSuccess }: TpLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Preencha todos os campos");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError("E-mail ou senha inválidos");
    } else {
      onLoginSuccess();
    }
  }

  if (authLoading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#0f1058" }}>
        <Loader2 size={32} color="#268ffa" className="animate-spin" />
      </div>
    );
  }

  return (
    <div style={{
      height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: "#0f1058", fontFamily: "'Poppins', 'Inter', sans-serif",
    }}>
      <form onSubmit={handleLogin} style={{
        background: "#fff", borderRadius: "2rem", padding: "40px 36px", width: "min(400px, 90%)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: "16px",
      }}>
        <img src={logoNexo} alt="Nexo" style={{ height: "40px", marginBottom: "8px" }} />
        <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#0d0446", margin: 0 }}>Acesso ao Teleprompter</h2>
        <input
          type="email" placeholder="E-mail" value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid #c7d2e0",
            fontSize: "12px", outline: "none", color: "#0d0446",
          }}
        />
        <input
          type="password" placeholder="Senha" value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid #c7d2e0",
            fontSize: "12px", outline: "none", color: "#0d0446",
          }}
        />
        {error && <span style={{ fontSize: "11px", color: "#ef4444" }}>{error}</span>}
        <button type="submit" disabled={loading} style={{
          width: "100%", padding: "10px", borderRadius: "10px", border: "none",
          backgroundColor: "#268ffa", color: "#fff", fontSize: "12px", fontWeight: 700,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        }}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <>Entrar <ArrowRight size={14} /></>}
        </button>
        <span style={{ fontSize: "10px", color: "rgba(13,4,70,0.4)", marginTop: "8px" }}>© Nexo Soluções Visuais</span>
      </form>
    </div>
  );
}
