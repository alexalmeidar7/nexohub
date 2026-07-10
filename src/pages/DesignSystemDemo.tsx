import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BackButton } from "@/components/ui/back-button";
import { useNavigate } from "react-router-dom";

/**
 * Página de demonstração do design system Nexo.
 * Mostra Checkbox e Switch em todos os estados (default, hover, checked, disabled),
 * seguindo o padrão cyan #00BFF0 / cyan claro #D6F4FB / preto #0A0A0A.
 *
 * Acesse em: /design-system
 */
export default function DesignSystemDemo() {
  const navigate = useNavigate();
  const [chk1, setChk1] = useState(false);
  const [chk2, setChk2] = useState(true);
  const [sw1, setSw1] = useState(false);
  const [sw2, setSw2] = useState(true);

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "#D6F4FB" }}>
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        {/* Header */}
        <div className="flex items-center gap-4">
          <BackButton onClick={() => navigate(-1)} />
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#0A0A0A" }}>
              Design System — Estados
            </h1>
            <p className="text-sm opacity-70" style={{ color: "#0A0A0A" }}>
              Checkbox e Switch em default, hover, checked e disabled.
            </p>
          </div>
        </div>

        {/* Paleta */}
        <section className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_-8px_rgba(10,10,10,0.15)]">
          <h2 className="text-xs font-bold uppercase tracking-[0.15em] mb-4 opacity-60" style={{ color: "#0A0A0A" }}>
            Paleta
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { name: "Cyan", hex: "#00BFF0", fg: "#fff" },
              { name: "Cyan Claro", hex: "#D6F4FB", fg: "#0A0A0A" },
              { name: "Verde-Limão", hex: "#C6F03C", fg: "#0A0A0A" },
              { name: "Preto", hex: "#0A0A0A", fg: "#fff" },
            ].map((c) => (
              <div
                key={c.hex}
                className="rounded-2xl p-4 flex flex-col justify-between h-24"
                style={{ backgroundColor: c.hex, color: c.fg }}
              >
                <span className="text-xs font-bold uppercase tracking-widest">{c.name}</span>
                <span className="text-sm font-mono">{c.hex}</span>
              </div>
            ))}
          </div>
        </section>

        {/* CHECKBOX */}
        <section className="bg-white rounded-3xl p-8 shadow-[0_4px_20px_-8px_rgba(10,10,10,0.15)]">
          <h2 className="text-xl font-bold mb-6" style={{ color: "#0A0A0A" }}>
            Checkbox
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StateCell label="Default">
              <Checkbox id="cb-default" />
              <Label htmlFor="cb-default">Opção</Label>
            </StateCell>
            <StateCell label="Hover" hint="Passe o mouse">
              <Checkbox id="cb-hover" className="hover-preview" />
              <Label htmlFor="cb-hover">Opção</Label>
            </StateCell>
            <StateCell label="Checked">
              <Checkbox id="cb-checked" checked={chk2} onCheckedChange={(v) => setChk2(!!v)} />
              <Label htmlFor="cb-checked">Opção</Label>
            </StateCell>
            <StateCell label="Disabled">
              <Checkbox id="cb-disabled" disabled />
              <Label htmlFor="cb-disabled" className="opacity-50">Opção</Label>
            </StateCell>
            <StateCell label="Disabled + Checked">
              <Checkbox id="cb-dc" disabled checked />
              <Label htmlFor="cb-dc" className="opacity-50">Opção</Label>
            </StateCell>
            <StateCell label="Interativo">
              <Checkbox id="cb-int" checked={chk1} onCheckedChange={(v) => setChk1(!!v)} />
              <Label htmlFor="cb-int">{chk1 ? "Marcado" : "Desmarcado"}</Label>
            </StateCell>
          </div>
        </section>

        {/* SWITCH */}
        <section className="bg-white rounded-3xl p-8 shadow-[0_4px_20px_-8px_rgba(10,10,10,0.15)]">
          <h2 className="text-xl font-bold mb-6" style={{ color: "#0A0A0A" }}>
            Switch
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StateCell label="Default (off)">
              <Switch id="sw-off" />
              <Label htmlFor="sw-off">Ativo</Label>
            </StateCell>
            <StateCell label="Hover" hint="Passe o mouse">
              <Switch id="sw-hover" className="hover-preview" />
              <Label htmlFor="sw-hover">Ativo</Label>
            </StateCell>
            <StateCell label="Checked (on)">
              <Switch id="sw-on" checked={sw2} onCheckedChange={setSw2} />
              <Label htmlFor="sw-on">Ativo</Label>
            </StateCell>
            <StateCell label="Disabled (off)">
              <Switch id="sw-dis-off" disabled />
              <Label htmlFor="sw-dis-off" className="opacity-50">Ativo</Label>
            </StateCell>
            <StateCell label="Disabled (on)">
              <Switch id="sw-dis-on" disabled checked />
              <Label htmlFor="sw-dis-on" className="opacity-50">Ativo</Label>
            </StateCell>
            <StateCell label="Interativo">
              <Switch id="sw-int" checked={sw1} onCheckedChange={setSw1} />
              <Label htmlFor="sw-int">{sw1 ? "Ligado" : "Desligado"}</Label>
            </StateCell>
          </div>
        </section>

        <p className="text-xs opacity-50 text-center pb-6" style={{ color: "#0A0A0A" }}>
          Todos os componentes herdam o padrão cyan definido em <code>src/components/ui/*</code>.
        </p>
      </div>

      {/* Força visual de hover para as células "Hover" */}
      <style>{`
        .hover-preview[data-state="unchecked"] {
          box-shadow: 0 0 0 2px rgba(0, 191, 240, 0.35);
        }
      `}</style>
    </div>
  );
}

function StateCell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 border"
      style={{ backgroundColor: "#F7FDFF", borderColor: "rgba(10,10,10,0.08)" }}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-60" style={{ color: "#0A0A0A" }}>
        {label}
      </span>
      <div className="flex items-center gap-3">{children}</div>
      {hint && <span className="text-[10px] opacity-40" style={{ color: "#0A0A0A" }}>{hint}</span>}
    </div>
  );
}
