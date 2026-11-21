import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const fields = [
  ["cpf", "CPF", "text"], ["telefone", "Telefone", "tel"], ["sexo", "Sexo", "text"],
  ["data_nascimento", "Data de nascimento", "date"], ["uf", "UF", "text"], ["cidade", "Cidade", "text"],
  ["setor", "Bairro ou setor", "text"], ["escolaridade", "Escolaridade", "text"], ["renda", "Renda", "text"],
] as const;
type Enrollment = { fields: Record<string, string | null>; total: number; earned: number; rules: Record<string, number> };

export default function TvListenerEnrollment({ deviceId, onUnlinked }: { deviceId: string; onUnlinked: () => void }) {
  const [registration, setRegistration] = useState<Enrollment | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [continued, setContinued] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.functions.invoke("nexo-tv-device", { body: { action: "enroll", deviceId } }).then(({ data, error }) => {
      if (!active) return;
      if (error || !data?.ok) setError(data?.reason === "ambiguous_listener"
        ? "Há mais de um cadastro com este e-mail. A rádio precisa conferir os registros."
        : "Não foi possível carregar o cadastro da rádio.");
      else setRegistration(data);
    }).catch(() => { if (active) setError("Não foi possível carregar o cadastro da rádio."); });
    return () => { active = false; };
  }, [deviceId]);

  const saveField = async (field: string) => {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.functions.invoke("nexo-tv-device", {
        body: { action: "enroll", deviceId, fields: { [field]: draft[field] } },
      });
      if (error || !data?.ok) throw new Error("invalid_field");
      setRegistration(data);
      setDraft(previous => ({ ...previous, [field]: "" }));
    } catch {
      setError("Confira o valor informado e tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.functions.invoke("nexo-tv-device", { body: { action: "revoke", deviceId } });
      if (error || !data?.ok) throw new Error("unlink_failed");
      onUnlinked();
    } catch {
      setError("Não foi possível desvincular a TV. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="w-full max-w-xl space-y-4 rounded-3xl bg-white/10 p-5 text-left">
    <h2 className="text-xl font-semibold">{continued ? "Central de Interatividade" : "Complete seu cadastro na rádio"}</h2>
    {!registration && !error && <p role="status">Carregando cadastro…</p>}
    {registration && <p role="status">{registration.total} pontos{registration.earned > 0 ? ` · +${registration.earned} nesta atualização` : ""}</p>}
    {registration && !continued && fields.filter(([key]) => !registration.fields[key]).map(([key, label, type]) =>
      <form key={key} className="space-y-1" onSubmit={(event) => { event.preventDefault(); void saveField(key); }}>
        <label htmlFor={`nexo-enroll-${key}`} className="block text-sm">{label}{registration.rules[key] > 0 ? ` · ${registration.rules[key]} pontos` : ""}</label>
        <div className="flex gap-2">
          <input id={`nexo-enroll-${key}`} type={type} maxLength={key === "uf" ? 2 : 160}
            className="min-w-0 flex-1 rounded-lg bg-white/10 p-2" value={draft[key] || ""}
            inputMode={key === "cpf" ? "numeric" : undefined}
            onChange={(event) => setDraft(previous => ({ ...previous, [key]: event.target.value }))} />
          <button type="submit" aria-label={`Salvar ${label}`} disabled={busy || !draft[key]?.trim()} className="rounded-lg bg-primary px-3 disabled:opacity-50">Salvar</button>
        </div>
      </form>
    )}
    {error && <p role="alert" className="text-red-200">{error}</p>}
    {!continued && <button type="button" onClick={() => setContinued(true)} className="block font-semibold">Continuar para a Central de Interatividade</button>}
    <button type="button" disabled={busy} onClick={() => void unlink()} className="underline disabled:opacity-50">Desvincular esta TV</button>
  </section>;
}
