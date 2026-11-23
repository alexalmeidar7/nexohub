import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Clock3, Loader2, Monitor, RefreshCw, Server, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";

type Device = { station_id: string; device_id: string; display_name: string; registered_at: string; last_seen_at: string };
type Identity = { deviceId: string; deviceName: string };
type Registry = { devices: Device[]; principalId: string | null };
const db = supabase as any;
const validUuid = (value: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const formatLastSeen = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "Não disponível";
};

export default function DesktopLanRoleSection({ stationId }: { stationId: string }) {
  const { user } = useAuth();
  const client = findClientAccountById(stationId) || findClientAccountByEmail(user?.email || "");
  const ownerId = client?.parentUserId || client?.id || stationId;
  const canChangePrincipal = user?.id === ownerId;
  const [identity, setIdentity] = useState<Identity | null>(null);
  const identityRef = useRef<Identity | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const nameIsDirtyRef = useRef(false);
  const [name, setName] = useState("");
  const [registry, setRegistry] = useState<Registry>({ devices: [], principalId: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async (current?: Identity | null) => {
    if (!validUuid(ownerId)) return;
    const [devicesResult, primaryResult] = await Promise.all([
      db.from("housemix_station_devices").select("station_id,device_id,display_name,registered_at,last_seen_at")
        .eq("station_id", ownerId).order("registered_at", { ascending: true }),
      db.from("housemix_station_primary").select("device_id").eq("station_id", ownerId).maybeSingle(),
    ]);
    if (devicesResult.error) throw devicesResult.error;
    if (primaryResult.error) throw primaryResult.error;
    const devices = (devicesResult.data || []) as Device[];
    const principalId = (primaryResult.data?.device_id as string | null) || null;
    setRegistry({ devices, principalId });
    const me = current || identityRef.current;
    const record = me && devices.find(device => device.device_id === me.deviceId);
    if (record && !nameIsDirtyRef.current) setName(record.display_name);
    // Mirror central election in legacy settings without changing the cloud transport.
    if (record && me && window.houseMixDesktop?.getLanRole && window.houseMixDesktop?.setLanRole) {
      const desired = principalId === me.deviceId ? "principal" : "secondary";
      try {
        const local = await window.houseMixDesktop.getLanRole(ownerId);
        if (local.selected !== desired) await window.houseMixDesktop.setLanRole(ownerId, desired);
      } catch (err) { console.warn("HMD local role mirror failed", err); }
    }
  }, [ownerId]);

  useEffect(() => {
    const native = window.houseMixDesktop;
    if (!native?.getDeviceIdentity || !validUuid(ownerId) || !user?.id) {
      setLoading(false);
      setError("Identificação nativa do HMD indisponível.");
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const device = await native.getDeviceIdentity!();
        if (!active) return;
        if (!validUuid(device.deviceId)) throw new Error("Identificação inválida");
        identityRef.current = device;
        setIdentity(device);
        const result = await db.rpc("housemix_register_station_device", {
          p_station_id: ownerId, p_device_id: device.deviceId, p_display_name: device.deviceName,
        });
        if (result.error) throw result.error;
        if (active) await reload(device);
      } catch (err) {
        if (active) setError("Não foi possível consultar os computadores. Verifique a conexão e a atualização do servidor.");
        console.warn("HMD device registry unavailable", err);
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; identityRef.current = null; };
  }, [ownerId, user?.id, reload]);

  useEffect(() => {
    if (!validUuid(ownerId)) return;
    // Database changes update the visible list; no interval polling when idle.
    const channel = supabase.channel("hmd-device-list-" + ownerId + "-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "housemix_station_devices",
        filter: "station_id=eq." + ownerId },
      () => { void reload().catch(err => console.warn("Device realtime", err)); })
      .on("postgres_changes", { event: "*", schema: "public", table: "housemix_station_primary",
        filter: "station_id=eq." + ownerId },
      () => { void reload().catch(err => console.warn("Primary realtime", err)); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [ownerId, reload]);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (!identity || busy) return;
    const value = name.trim();
    if (value.length < 2 || value.length > 64) { toast.error("Use um nome de 2 a 64 caracteres."); return; }
    setBusy(true);
    try {
      const result = await db.rpc("housemix_rename_station_device", {
        p_station_id: ownerId, p_device_id: identity.deviceId, p_display_name: value,
      });
      if (result.error) throw result.error;
      nameIsDirtyRef.current = false;
      await reload(identity);
      toast.success("Nome deste computador salvo.");
    } catch (err) {
      toast.error("Não foi possível salvar o nome no banco.");
      console.warn("HMD name save", err);
    } finally { setBusy(false); }
  }
  async function promote(deviceId: string) {
    if (!canChangePrincipal || busy || registry.principalId === deviceId) return;
    setBusy(true);
    try {
      const result = await db.rpc("housemix_select_station_primary", {
        p_station_id: ownerId, p_device_id: deviceId,
      });
      if (result.error) throw result.error;
      await reload();
      toast.success("Novo principal definido. Todos os demais são secundários.");
    } catch (err) {
      toast.error("Não foi possível mudar o principal.");
      console.warn("HMD primary election", err);
    } finally { setBusy(false); }
  }

  const myRecord = identity && registry.devices.find(d => d.device_id === identity.deviceId);
  return <div className="space-y-5">
    <p className="text-sm text-slate-600">
      Um principal por emissora. Os demais computadores são automaticamente secundários.
    </p>
    <form onSubmit={e => void saveName(e)} className="space-y-2">
      <label htmlFor="hmd-device-name" className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">
        Nome deste computador
      </label>
      <div className="flex flex-wrap gap-2">
        <input id="hmd-device-name" ref={nameInputRef} value={name} maxLength={64}
          onChange={e => { nameIsDirtyRef.current = true; setName(e.target.value); }}
          disabled={!identity || busy || loading}
          placeholder="Ex.: Estúdio Principal"
          className="min-w-[180px] flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#0055ff] disabled:opacity-50"/>
        <button type="submit" disabled={!identity || busy || loading || name.trim() === myRecord?.display_name}
          className="rounded-xl bg-[#0055ff] px-5 py-3 text-xs font-bold text-white hover:bg-[#0049dd] disabled:opacity-40">
          {busy ? <Loader2 size={15} className="animate-spin"/> : "Salvar nome"}
        </button>
      </div>
    </form>
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
        Computadores da emissora ({registry.devices.length})
      </span>
      <button type="button" disabled={loading || busy}
        onClick={() => void reload().catch(() => toast.error("Falha ao atualizar a lista."))}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40">
        <RefreshCw size={13}/> Atualizar
      </button>
    </div>
    {loading && <p className="flex items-center gap-2 text-xs text-slate-500">
      <Loader2 size={15} className="animate-spin"/> Carregando computadores...
    </p>}
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{error}</p>}
    {!loading && !error && <div className="space-y-2">
      {registry.devices.map(device => {
        const isMine = identity?.deviceId === device.device_id;
        const primary = registry.principalId === device.device_id;
        return <div key={device.device_id} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
          {primary ? <Server size={20} className="shrink-0 text-[#0055ff]"/> :
            <Monitor size={20} className="shrink-0 text-slate-500"/>}
          <div className="min-w-[150px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm text-slate-900">{device.display_name}</strong>
              {isMine && <span className="text-[10px] font-semibold text-slate-500">Este computador</span>}
              {isMine && <button type="button" disabled={busy}
                onClick={() => {
                  nameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                  nameInputRef.current?.focus();
                  nameInputRef.current?.select();
                }}
                className="rounded-md bg-[#0055ff]/10 px-2 py-1 text-[10px] font-bold text-[#0055ff] hover:bg-[#0055ff]/20 disabled:opacity-40"
              >Renomear</button>}
            </div>
            <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
              <Clock3 size={11}/> Último acesso ao painel: {formatLastSeen(device.last_seen_at)}
            </span>
          </div>
          <span className={"rounded-full px-3 py-1.5 text-[10px] font-bold " +
            (primary ? "bg-blue-100 text-[#0055ff]" : "bg-slate-200 text-slate-600")}>
            {primary ? "Principal" : "Secundário"}
          </span>
          {!primary && canChangePrincipal &&
            <button type="button" disabled={busy} onClick={() => void promote(device.device_id)}
              className="rounded-lg bg-[#0055ff] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#0049dd] disabled:opacity-40">
              Definir principal
            </button>}
        </div>;
      })}
      {registry.devices.length === 0 && <p className="text-xs text-slate-500">Nenhum computador cadastrado.</p>}
      {!registry.principalId && <p className="text-xs text-amber-700">
        Nenhum principal definido. Selecione um computador acima.
      </p>}
      {registry.principalId && <p className="flex items-center gap-1.5 text-xs text-slate-600">
        <Check size={15} className="text-[#0055ff]"/> Apenas o computador indicado é o principal da emissora.
      </p>}
    </div>}
    <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-4 text-amber-900">
      <ShieldAlert size={18} className="mt-0.5 shrink-0"/>
      <p className="text-xs leading-relaxed"><strong>Conexão LAN ainda não ativada.</strong>
        A seleção organiza os computadores, mas a sincronização atual permanece online até a comunicação
        entre PCs ser validada com autenticação, TLS e segurança dos dados.
        O status “Lendo/gravando do principal” só aparecerá quando a transferência local estiver ativa.
      </p>
    </div>
  </div>;
}
