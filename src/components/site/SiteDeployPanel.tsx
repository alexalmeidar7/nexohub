import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Server, Upload, Wifi, CheckCircle2, XCircle, Clock, Save } from "lucide-react";
import { toast } from "sonner";

interface DeployCfg {
  protocol: "ftp" | "ftps" | "sftp";
  host: string;
  port: number;
  username: string;
  password: string;
  remote_path: string;
  auto_publish: boolean;
}

interface HistoryRow {
  id: string;
  status: "success" | "error" | "running";
  message: string;
  files_count: number;
  bytes_sent: number;
  duration_ms: number;
  created_at: string;
}

const empty: DeployCfg = {
  protocol: "ftp",
  host: "",
  port: 21,
  username: "",
  password: "",
  remote_path: "/public_html",
  auto_publish: false,
};

export default function SiteDeployPanel({ effectiveUserId }: { effectiveUserId: string }) {
  const [cfg, setCfg] = useState<DeployCfg>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("site_deploy_history")
      .select("*")
      .eq("user_id", effectiveUserId)
      .order("created_at", { ascending: false })
      .limit(10);
    setHistory((data as HistoryRow[]) || []);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("site_deploy_config").select("*").eq("user_id", effectiveUserId).maybeSingle();
      if (data) setCfg({ ...empty, ...(data as any) });
      await loadHistory();
      setLoading(false);
    })();
  }, [effectiveUserId]);

  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const { error } = await supabase.from("site_deploy_config")
        .upsert({ user_id: effectiveUserId, ...cfg }, { onConflict: "user_id" });
      if (error) throw error;
      toast.success("Credenciais salvas");
      return true;
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err?.message || "Falha ao gravar as credenciais."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      if (!(await save())) return;
      const { data, error } = await supabase.functions.invoke("site-publish", { body: { action: "test" } });
      if (error) throw error;
      if (data?.ok) toast.success(`Conexão OK · ${data.entries || 0} itens no diretório`);
      else toast.error("Falha: " + (data?.error || "erro desconhecido"));
    } catch (e: any) {
      toast.error(e?.message || "Falha na conexão");
    } finally {
      setTesting(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      if (!(await save())) return;
      const { data, error } = await supabase.functions.invoke("site-publish", { body: { action: "publish" } });
      if (error) throw error;
      if (data?.ok) toast.success(`Site publicado · ${data.files} arquivo(s) enviado(s)`);
      else toast.error("Falha: " + (data?.error || "erro"));
      await loadHistory();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao publicar");
    } finally {
      setPublishing(false);
    }
  };

  const F = (label: string, node: React.ReactNode) => (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider opacity-60 block mb-1.5">{label}</span>
      {node}
    </label>
  );

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="animate-spin" size={18} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs opacity-70">
        <Server size={14} /> Configure o servidor FTP/FTPS para publicar seu site.
      </div>

      <div className="grid grid-cols-2 gap-2">
        {F("Protocolo",
          <select value={cfg.protocol} onChange={(e) => setCfg({ ...cfg, protocol: e.target.value as any, port: e.target.value === "ftps" ? 21 : e.target.value === "sftp" ? 22 : 21 })}
            className="w-full h-9 rounded-md border px-2 text-sm bg-transparent">
            <option value="ftp">FTP</option>
            <option value="ftps">FTPS (TLS)</option>
            <option value="sftp" disabled>SFTP (em breve)</option>
          </select>
        )}
        {F("Porta", <Input type="number" value={cfg.port} onChange={(e) => setCfg({ ...cfg, port: Number(e.target.value) })} className="h-9" />)}
      </div>

      {F("Host", <Input placeholder="ftp.meusite.com.br" value={cfg.host} onChange={(e) => setCfg({ ...cfg, host: e.target.value })} className="h-9" />)}

      <div className="grid grid-cols-2 gap-2">
        {F("Usuário", <Input value={cfg.username} onChange={(e) => setCfg({ ...cfg, username: e.target.value })} className="h-9" />)}
        {F("Senha", <Input type="password" value={cfg.password} onChange={(e) => setCfg({ ...cfg, password: e.target.value })} className="h-9" />)}
      </div>

      {F("Pasta remota", <Input placeholder="/public_html" value={cfg.remote_path} onChange={(e) => setCfg({ ...cfg, remote_path: e.target.value })} className="h-9" />)}

      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input type="checkbox" checked={cfg.auto_publish} onChange={(e) => setCfg({ ...cfg, auto_publish: e.target.checked })} />
        Publicar automaticamente ao alterar notícias ou configurações
      </label>

      <div className="grid grid-cols-3 gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
        </Button>
        <Button size="sm" variant="outline" onClick={test} disabled={testing || !cfg.host} className="gap-1.5">
          {testing ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />} Testar
        </Button>
        <Button size="sm" onClick={publish} disabled={publishing || !cfg.host}
          className="gap-1.5" style={{ background: "var(--layout-accent-color, #268ffa)", color: "#fff" }}>
          {publishing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Publicar
        </Button>
      </div>

      <div className="pt-3 border-t" style={{ borderColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)" }}>
        <div className="text-[11px] font-semibold uppercase tracking-wider opacity-60 mb-2 flex items-center gap-1.5">
          <Clock size={11} /> Histórico de publicações
        </div>
        {history.length === 0 ? (
          <div className="text-xs opacity-50 py-3 text-center">Nenhuma publicação ainda.</div>
        ) : (
          <ul className="space-y-1.5">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded"
                style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)" }}>
                {h.status === "success" ? <CheckCircle2 size={12} className="text-emerald-500" />
                  : h.status === "error" ? <XCircle size={12} className="text-red-500" />
                  : <Loader2 size={12} className="animate-spin" />}
                <span className="flex-1 truncate">{h.message || h.status}</span>
                <span className="opacity-50 text-[10px]">{new Date(h.created_at).toLocaleString("pt-BR")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
