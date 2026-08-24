import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Camera, Check, Gift, RefreshCw, AlertTriangle, Upload } from "lucide-react";

const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const DARK = "#0A2540";
const BG = "#D6F4FB";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/entrega-premio`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

interface Info {
  premio_nome: string;
  premio_descricao: string | null;
  premio_imagem: string | null;
  nome_ganhador: string;
  telefone_ganhador: string | null;
  programa_nome: string | null;
  apresentador_nome: string | null;
  data_sorteio: string;
  entregue: boolean;
  data_entrega: string | null;
  expirado: boolean;
  tem_foto: boolean;
}

const call = async (payload: Record<string, unknown>) => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(payload),
  });
  return res.json();
};

export default function EntregaPremio() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [agora, setAgora] = useState(new Date());
  const [pin, setPin] = useState("");
  const [pinOk, setPinOk] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    document.title = "Registrar entrega de prêmio";
  }, []);

  const autenticar = async () => {
    const p = pin.replace(/\D/g, "");
    if (p.length !== 4) return setErro("Digite os 4 dígitos");
    setErro(null);
    setLoading(true);
    const r = await call({ token, pin: p });
    setLoading(false);
    if (r?.ok && r.info) {
      setPinOk(p);
      setInfo(r.info);
    } else {
      setErro(r?.error || "Código inválido");
    }
  };


  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }, []);

  useEffect(() => () => stopCam(), [stopCam]);

  const startCam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      setCamOn(true);
      setPhoto(null);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      fileRef.current?.click();
    }
  };

  const snap = () => {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 720;
    canvas.height = v.videoHeight || 960;
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL("image/jpeg", 0.82));
    stopCam();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(f);
  };

  const confirmar = async () => {
    if (!photo) return;
    setSaving(true);
    const r = await call({ action: "confirm", token, pin: pinOk, photoBase64: photo });
    setSaving(false);
    if (r?.ok) setInfo(r.info);
    else setErro(r?.error || "Erro ao salvar a foto");
  };


  const card: React.CSSProperties = {
    background: "#fff", borderRadius: 20, padding: 18, border: `1px solid ${CYAN}33`,
    boxShadow: "0 6px 24px rgba(10,37,64,0.08)",
  };
  const btn: React.CSSProperties = {
    width: "100%", height: 54, borderRadius: 999, border: "none", background: CYAN, color: "#fff",
    fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    fontFamily: "'Montserrat', system-ui, sans-serif", cursor: "pointer",
  };

  return (
    <div style={{ minHeight: "100vh", background: BG, padding: 16, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", display: "grid", gap: 14 }}>
        <header style={{ textAlign: "center", padding: "8px 0 0" }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: CYAN, fontWeight: 800 }}>Entrega de prêmio</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: DARK, margin: "4px 0 0" }}>Registro de retirada</h1>
        </header>

        {loading && <div style={card}>Carregando...</div>}

        {erro && !info && (
          <div style={{ ...card, borderColor: "#fca5a5", color: "#991B1B", display: "flex", gap: 10, alignItems: "center" }}>
            <AlertTriangle size={18} /> {erro}
          </div>
        )}

        {info && (
          <>
            <div style={card}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                {info.premio_imagem ? (
                  <img src={info.premio_imagem} alt={info.premio_nome} style={{ width: 68, height: 68, borderRadius: 16, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 68, height: 68, borderRadius: 16, background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Gift size={26} color={CYAN} />
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#64748B", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Prêmio</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: DARK }}>{info.premio_nome}</div>
                  {info.premio_descricao && <div style={{ fontSize: 12, color: "#64748B" }}>{info.premio_descricao}</div>}
                </div>
              </div>

              <div style={{ height: 1, background: `${CYAN}22`, margin: "14px 0" }} />

              <Row label="Ganhador" value={info.nome_ganhador} />
              {info.telefone_ganhador && <Row label="Telefone" value={info.telefone_ganhador} />}
              <Row label="Programa" value={info.programa_nome || "—"} />
              {info.apresentador_nome && <Row label="Locutor" value={info.apresentador_nome} />}
              <Row label="Sorteado em" value={new Date(info.data_sorteio).toLocaleString("pt-BR")} />
              <Row label="Resgate agora" value={agora.toLocaleString("pt-BR")} highlight />
            </div>

            {info.entregue ? (
              <div style={{ ...card, background: LIME, border: "none", textAlign: "center" }}>
                <Check size={28} color={DARK} style={{ margin: "0 auto 6px" }} />
                <div style={{ fontWeight: 800, color: DARK }}>Entrega registrada</div>
                <div style={{ fontSize: 12, color: DARK, opacity: 0.75 }}>
                  {info.data_entrega ? new Date(info.data_entrega).toLocaleString("pt-BR") : ""}
                </div>
                {photo && <img src={photo} alt="Foto da entrega" style={{ width: "100%", borderRadius: 16, marginTop: 12 }} />}
              </div>
            ) : (
              <div style={{ ...card, display: "grid", gap: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: DARK }}>Foto do ouvinte recebendo o prêmio</div>

                {camOn && (
                  <video ref={videoRef} playsInline muted style={{ width: "100%", borderRadius: 16, background: "#000" }} />
                )}
                {!camOn && photo && (
                  <img src={photo} alt="Pré-visualização" style={{ width: "100%", borderRadius: 16 }} />
                )}
                {!camOn && !photo && (
                  <div style={{ width: "100%", paddingBottom: "75%", position: "relative", borderRadius: 16, background: BG }}>
                    <Camera size={34} color={CYAN} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
                  </div>
                )}

                <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} />

                {camOn ? (
                  <button style={btn} onClick={snap}><Camera size={18} /> Bater a foto</button>
                ) : photo ? (
                  <>
                    <button style={{ ...btn, background: LIME, color: DARK }} disabled={saving} onClick={confirmar}>
                      <Check size={18} /> {saving ? "Salvando..." : "Confirmar entrega"}
                    </button>
                    <button style={{ ...btn, background: "#fff", color: DARK, border: `2px solid ${CYAN}`, height: 46 }} onClick={startCam}>
                      <RefreshCw size={16} /> Tirar outra foto
                    </button>
                  </>
                ) : (
                  <>
                    <button style={btn} onClick={startCam}><Camera size={18} /> Abrir câmera</button>
                    <button style={{ ...btn, background: "#fff", color: DARK, border: `2px solid ${CYAN}`, height: 46 }} onClick={() => fileRef.current?.click()}>
                      <Upload size={16} /> Escolher da galeria
                    </button>
                  </>
                )}

                {erro && <div style={{ color: "#991B1B", fontSize: 12 }}>{erro}</div>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0" }}>
      <span style={{ fontSize: 12, color: "#64748B", fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: highlight ? CYAN : DARK, textAlign: "right" }}>{value}</span>
    </div>
  );
}
