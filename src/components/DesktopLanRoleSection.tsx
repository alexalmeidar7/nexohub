import { useEffect, useState } from "react";
import { Loader2, Monitor, Server, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
type RoleStatus = {
  selected: "principal" | "secondary";
  effective: "cloud" | "lan";
  lanActive: boolean;
  transport: string;
  message: string;
};
export default function DesktopLanRoleSection({ stationId }: { stationId: string }) {
  const [status, setStatus] = useState<RoleStatus | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const desktop = window.houseMixDesktop;
    if (!desktop?.getLanRole || !stationId) return;
    let alive = true;
    void desktop.getLanRole(stationId).then(s => { if(alive) setStatus(s); })
      .catch(() => { if(alive) toast.error("Não foi possível carregar a configuração deste PC."); });
    const unlisten=desktop.onLanRoleChanged?.(change => {
      if(alive && change.stationId === stationId) setStatus(change);
    });
    return () => {alive=false; unlisten?.();};
  },[stationId]);
  async function select(role: "principal" | "secondary") {
    if(saving || !window.houseMixDesktop?.setLanRole) return;
    setSaving(true);
    try {
      const result = await window.houseMixDesktop.setLanRole(stationId,role);
      setStatus(result);
      toast.success("Preferência salva neste computador.");
    } catch(e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally {setSaving(false);}
  }
  const choices = [
    {role:"principal" as const,title:"Computador principal",subtitle:"Origem online e futuro servidor da rádio",Icon:Server},
    {role:"secondary" as const,title:"Computador secundário",subtitle:"Receberá atualizações locais após o pareamento seguro",Icon:Monitor}
  ];
  return <div className="space-y-4">
    <p className="text-sm text-slate-600">Defina a função deste HMD. A preferência é individual de cada computador e emissora.</p>
    <div className="grid gap-3 sm:grid-cols-2">{choices.map(({role,title,subtitle,Icon})=>
      <button type="button" key={role} aria-pressed={status?.selected===role}
        disabled={!status || saving} onClick={()=>void select(role)}
        className={`flex items-start gap-3 rounded-xl p-4 text-left transition-colors disabled:opacity-60 ${status?.selected===role ? "bg-blue-50 ring-2 ring-[#0055ff]" : "bg-slate-50 hover:bg-slate-100"}`}>
        <Icon size={21} className="shrink-0 text-[#0055ff]"/>
        <span className="flex-1"><span className="block text-sm font-bold text-slate-900">{title}</span>
        <span className="mt-1 block text-xs text-slate-500">{subtitle}</span></span>
        {saving && <Loader2 size={15} className="animate-spin text-[#0055ff]"/>}
      </button>)}</div>
    <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-4 text-amber-900">
      <ShieldAlert size={18} className="shrink-0"/>
      <div className="text-xs leading-relaxed"><strong className="block mb-1">Rede local ainda não ativada</strong>
      {status?.message || "Carregando..."} O servidor local continua isolado no próprio PC. Não haverá sincronização com o principal até validar autenticação, TLS, isolamento da rádio e prevenção de conflitos.</div>
    </div>
  </div>;
}