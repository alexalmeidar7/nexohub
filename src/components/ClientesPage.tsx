import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { 
  Building2, Search, Users, Mail, Phone, Calendar, 
  UserCog, Trash2, Plus, Loader2, X, MapPin, 
  Briefcase, Activity, Save 
} from "lucide-react";
import { Button } from "@/components/ui/button";

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 999,
  background: "#f8fafc",
  border: "1px solid rgba(226, 232, 240, 0.9)",
  padding: "0 20px",
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 12,
  color: "#0f172a",
  outline: "none",
  transition: "all 0.2s ease",
};

const labelStyle: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 6,
  display: "block",
};

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

interface Cliente {
  id: string;
  user_id: string;
  nome: string | null;
  cnpj: string | null;
  telefone_comercial: string | null;
  endereco: string | null;
  cliente_desde: string | null;
  executiva_venda: string | null;
  ativo: boolean | null;
  logo_url?: string | null;
}

interface Evento {
  id: string;
  user_id: string;
  cliente_id: string;
  tipo: string;
  data: string;
  status: string;
}

export default function ClientesPage() {
  const { role, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [novo, setNovo] = useState({
    nome: "",
    cnpj: "",
    endereco: "",
    telefone: "",
    cliente_desde: "",
    executiva_venda: ""
  });

  const load = async () => {
    setLoading(true);
    try {
      const isAlex = user?.email?.toLowerCase().includes("alex");

      const { data: logosData } = await supabase
        .from("logos_patrocinadores")
        .select("id, user_id, nome, logo_url, ativo, created_at")
        .eq("excluido", false)
        .order("nome");
      
      const { data: agendaData } = await supabase
        .from("blitz_promocionais")
        .select("*");

      const uniqueClients: Cliente[] = [];
      const seenNames = new Set();

      (logosData || []).forEach(item => {
        const name = item.nome?.trim().toUpperCase();
        if (isAlex && item.user_id === user?.id) return;

        if (name && !seenNames.has(name)) {
          seenNames.add(name);
          uniqueClients.push({
            id: item.id,
            user_id: item.user_id,
            nome: item.nome,
            logo_url: item.logo_url,
            ativo: item.ativo,
            cnpj: "00.000.000/0000-00",
            cliente_desde: item.created_at?.split('T')[0],
            telefone_comercial: "(00) 0000-0000",
            endereco: "Endereço não cadastrado",
            executiva_venda: "Não atribuída"
          });
        }
      });

      setClientes(uniqueClients);
      setEventos((agendaData as any[]) || []);
    } catch (err) {
      console.error("Erro ao carregar clientes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    if (!novo.nome || !novo.cnpj) {
      toast.error("Razão Social e CNPJ são obrigatórios.");
      return;
    }

    setCriando(true);
    try {
      const isAlex = user?.email?.toLowerCase().includes("alex");

      if (editingId) {
        const { error } = await supabase
          .from("logos_patrocinadores")
          .update({
            nome: novo.nome.trim().toUpperCase(),
          } as any)
          .eq("id", editingId);

        if (error) throw error;
        toast.success("Dados do cliente da agência atualizados!");
      } else {
        const { error } = await supabase.from("logos_patrocinadores").insert({
          nome: novo.nome.trim().toUpperCase(),
          user_id: user?.id,
          ativo: true,
          excluido: false,
          data_final: new Date(new Date().getFullYear() + 10, 11, 31).toISOString().split('T')[0] 
        } as any);

        if (error) throw error;
        toast.success(isAlex ? "Cliente da agência cadastrado com sucesso!" : "Cliente pré-cadastrado no sistema!");
      }

      setEditingId(null);
      setNovo({ nome: "", cnpj: "", endereco: "", telefone: "", cliente_desde: "", executiva_venda: "" });
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar cliente.");
    } finally {
      setCriando(false);
    }
  };

  const handleEdit = (cliente: Cliente) => {
    setEditingId(cliente.id);
    setNovo({
      nome: cliente.nome || "",
      cnpj: cliente.cnpj || "",
      endereco: cliente.endereco || "",
      telefone: cliente.telefone_comercial || "",
      cliente_desde: cliente.cliente_desde || "",
      executiva_venda: cliente.executiva_venda || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase();
    return clientes.filter(c => 
      c.nome?.toLowerCase().includes(q) || 
      (c.cnpj && c.cnpj.includes(q))
    );
  }, [clientes, busca]);

  const getEventosCliente = (clienteNome: string | null) => {
    if (!clienteNome) return 0;
    const q = clienteNome.trim().toUpperCase();
    return eventos.filter(e => (e as any).cliente?.trim().toUpperCase() === q).length;
  };

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center">
        <Loader2 className="animate-spin text-[#00BFF0]" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto w-full space-y-6 pt-2 pb-12 font-sans animate-fade-in">
      {/* 1. Form Section (Centered, Clean Flat Modern Style) */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-base md:text-lg font-black tracking-wider text-[#002132] uppercase leading-tight">
              {editingId ? "Editar Cliente da Agência" : "Cadastro de Cliente da Agência"}
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Gestão de clientes corporativos e contratos da Nexo Agência
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-[11px] font-bold text-slate-700 bg-[#f1f5f9] px-4 py-1.5 rounded-full uppercase tracking-wider">
              Data do cadastro: <span className="text-[#0055ff]">{editingId ? "—" : new Date().toLocaleDateString("pt-BR")}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          <div className="lg:col-span-2">
            <Field label="Razão Social">
              <input 
                style={inputStyle}
                value={novo.nome} 
                onChange={e => setNovo(n => ({...n, nome: e.target.value}))}
                placeholder="Nome da Empresa / Cliente Corporativo"
              />
            </Field>
          </div>
          <Field label="CNPJ">
            <input 
              style={inputStyle}
              value={novo.cnpj} 
              onChange={e => setNovo(n => ({...n, cnpj: e.target.value}))}
              placeholder="00.000.000/0000-00"
            />
          </Field>
          <Field label="Telefone">
            <input 
              style={inputStyle}
              value={novo.telefone} 
              onChange={e => setNovo(n => ({...n, telefone: e.target.value}))}
              placeholder="(00) 00000-0000"
            />
          </Field>
          <div className="lg:col-span-2">
            <Field label="Endereço">
              <input 
                style={inputStyle}
                value={novo.endereco} 
                onChange={e => setNovo(n => ({...n, endereco: e.target.value}))}
                placeholder="Rua, Número, Bairro, Cidade - UF"
              />
            </Field>
          </div>
          <Field label="Cliente Desde">
            <input 
              type="date"
              style={inputStyle}
              value={novo.cliente_desde} 
              onChange={e => setNovo(n => ({...n, cliente_desde: e.target.value}))}
            />
          </Field>
          <div className="lg:col-span-2">
            <Field label="Gerente Executiva Responsável">
              <input 
                style={inputStyle}
                value={novo.executiva_venda} 
                onChange={e => setNovo(n => ({...n, executiva_venda: e.target.value}))}
                placeholder="Nome da gerente executiva"
              />
            </Field>
          </div>
        </div>

        <div className="mt-7 pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setNovo({ nome: "", cnpj: "", endereco: "", telefone: "", cliente_desde: "", executiva_venda: "" });
              }}
              className="h-11 px-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all cursor-pointer"
            >
              <X size={15} /> Cancelar
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={criando}
            className="h-11 px-8 rounded-full bg-[#9FCA1D] hover:brightness-105 active:scale-95 text-black font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all cursor-pointer shadow-sm disabled:opacity-50"
          >
            {criando ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Save size={16} />
            )}
            {editingId ? "Atualizar Dados" : "Salvar Cliente"}
          </button>
        </div>
      </section>

      {/* 2. Registered Clients Section (Centered, Clean Flat Modern Style) */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5 text-[#002132]">
            <div className="w-9 h-9 rounded-xl bg-[#14161a] flex items-center justify-center text-[#9FCA1D]">
              <Building2 size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#002132]">
                Clientes da Agência Cadastrados
              </h3>
              <p className="text-xs text-slate-400">Total de contas corporativas da agência</p>
            </div>
            <span className="text-xs font-bold bg-[#f1f5f9] text-slate-700 px-3 py-1 rounded-full ml-1">
              {filtrados.length}
            </span>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar razão social ou CNPJ..."
              className="w-72 md:w-80 h-10 rounded-full bg-[#f8fafc] border border-slate-200/80 pl-10 pr-4 text-xs text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-[#0055ff] transition-all font-sans"
            />
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 font-medium">
            Nenhum cliente da agência encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full border-collapse text-xs font-sans">
              <thead>
                <tr className="bg-[#14161a] text-white">
                  {["Razão Social", "CNPJ", "Telefone", "Executiva Resp.", "Blitz/Eventos", "Ações"].map((h) => (
                    <th
                      key={h}
                      className={`p-3 text-[10px] font-bold uppercase tracking-wider ${
                        h === "Ações" ? "text-right pr-4" : "text-left pl-4"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map((cliente, idx) => (
                  <tr
                    key={cliente.id || idx}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="p-3 pl-4 font-semibold text-slate-800">
                      {cliente.nome}
                    </td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">{cliente.cnpj}</td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">{cliente.telefone_comercial}</td>
                    <td className="p-3 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <UserCog size={13} className="text-slate-400" />
                        <span>{cliente.executiva_venda || "—"}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">
                        <Activity size={11} className="text-[#0055ff]" />
                        {getEventosCliente(cliente.nome)} Eventos
                      </span>
                    </td>
                    <td className="p-3 pr-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleEdit(cliente)}
                          className="rounded-full text-slate-400 hover:text-[#0055ff] hover:bg-slate-100 h-8 w-8"
                          title="Editar dados"
                        >
                          <UserCog size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}