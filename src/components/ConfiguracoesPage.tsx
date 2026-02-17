import { useState, useEffect } from "react";
import { Save } from "lucide-react";

export interface EmpresaConfig {
  nome: string;
  logo: string;
  endereco: string;
  telefoneComercial: string;
  telefoneParticipacao: string;
  site: string;
  instagram: string;
  facebook: string;
  youtube: string;
}

const CONFIG_KEY = "masterview_empresa_config";

export function getEmpresaConfig(): EmpresaConfig {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
  } catch {
    return {} as EmpresaConfig;
  }
}

export default function ConfiguracoesPage() {
  const [config, setConfig] = useState<EmpresaConfig>(() => getEmpresaConfig());

  useEffect(() => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }, [config]);

  const handleLogoUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setConfig(prev => ({ ...prev, logo: ev.target?.result as string }));
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const field = (label: string, key: keyof EmpresaConfig, placeholder: string) => (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      <input
        value={(config[key] as string) || ""}
        onChange={(e) => setConfig(prev => ({ ...prev, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary text-sm"
      />
    </div>
  );

  return (
    <div className="animate-fade-in space-y-6 max-w-2xl">
      <h3 className="text-xl text-primary">Configurações da Empresa</h3>

      <div className="space-y-4">
        {field("Nome da Empresa", "nome", "Nome da empresa")}

        {/* Logo */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Logo da Empresa</label>
          <div className="flex items-center gap-4">
            {config.logo && (
              <img src={config.logo} alt="Logo" className="w-16 h-16 rounded-lg object-contain border border-border" />
            )}
            <button
              onClick={handleLogoUpload}
              className="bg-muted border border-border px-4 py-2 rounded-lg text-foreground hover:bg-muted/80 transition-all text-xs"
            >
              {config.logo ? "Trocar Logo" : "Carregar Logo"}
            </button>
          </div>
        </div>

        {field("Endereço", "endereco", "Endereço completo")}
        {field("Telefone Comercial", "telefoneComercial", "(00) 0000-0000")}
        {field("Telefone Participação", "telefoneParticipacao", "(00) 0000-0000")}
        {field("Site", "site", "https://www.exemplo.com")}
        {field("Instagram", "instagram", "https://instagram.com/empresa")}
        {field("Facebook", "facebook", "https://facebook.com/empresa")}
        {field("YouTube", "youtube", "https://youtube.com/empresa")}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Save size={12} />
        <span>As configurações são salvas automaticamente.</span>
      </div>
    </div>
  );
}
