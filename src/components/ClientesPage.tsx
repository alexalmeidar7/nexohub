import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { 
  Building2, Search, Users, Mail, Phone, Calendar, 
  UserCog, Trash2, Plus, Loader2, X, MapPin, 
  Briefcase, Activity 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const CARD_BG = "#D6F4FB";
const DARK = "#0A2540";

const pillInput: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 999,
  background: "#FFFFFF",
  border: `2px solid ${CYAN}`,
  padding: "0 20px",
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 13,
  color: DARK,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: DARK,
  marginBottom: 8,
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
  const [novoOpen, setNovoOpen] = useState(true);
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

      // Se for Alex, não fazemos o pré-cadastro automático via logos
      // Se não for Alex, mantemos a regra de carregar logos como clientes por enquanto
      // até que a tabela definitiva esteja 100% operacional em todas as instâncias.
      
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
        // Filtro para não aplicar a regra automática no Alex
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
        // Lógica de edição
        const { error } = await supabase
          .from("logos_patrocinadores")
          .update({
            nome: novo.nome.trim().toUpperCase(),
          } as any)
          .eq("id", editingId);

        if (error) throw error;
        toast.success("Dados do cliente atualizados!");
      } else {
        // Lógica de inserção
        const { error } = await supabase.from("logos_patrocinadores").insert({
          nome: novo.nome.trim().toUpperCase(),
          user_id: user?.id,
          ativo: true,
          excluido: false,
          data_final: new Date(new Date().getFullYear() + 10, 11, 31).toISOString().split('T')[0] 
        } as any);

        if (error) throw error;
        toast.success(isAlex ? "Cliente cadastrado manualmente." : "Cliente pré-cadastrado no sistema!");
      }

      setNovoOpen(false);
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
    setNovoOpen(true);
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
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="animate-spin text-cyan-500" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        Cadastro de Clientes
      </div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-slate-500 text-sm">Gerencie os clientes e seus contratos.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input 
              placeholder="Buscar cliente..." 
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 w-64 rounded-full border-slate-200"
            />
          </div>
          <Button 
            onClick={() => setNovoOpen(true)}
            className="rounded-full bg-cyan-500 hover:bg-cyan-600 text-white gap-2"
          >
            <Plus size={18} /> Novo Cliente
          </Button>
        </div>
      </div>

      {novoOpen && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-800">
              {editingId ? "Editar Cliente" : "Novo Cliente"}
            </h2>
            <Button variant="ghost" size="icon" onClick={() => { setNovoOpen(false); setEditingId(null); }} className="rounded-full">
              <X size={20} />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Razão Social</label>
              <Input 
                value={novo.nome} 
                onChange={e => setNovo(n => ({...n, nome: e.target.value}))}
                placeholder="Nome da Empresa"
                className="rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">CNPJ</label>
              <Input 
                value={novo.cnpj} 
                onChange={e => setNovo(n => ({...n, cnpj: e.target.value}))}
                placeholder="00.000.000/0000-00"
                className="rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Telefone</label>
              <Input 
                value={novo.telefone} 
                onChange={e => setNovo(n => ({...n, telefone: e.target.value}))}
                placeholder="(00) 00000-0000"
                className="rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Endereço</label>
              <Input 
                value={novo.endereco} 
                onChange={e => setNovo(n => ({...n, endereco: e.target.value}))}
                placeholder="Rua, Número, Bairro, Cidade - UF"
                className="rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Cliente Desde</label>
              <Input 
                type="date"
                value={novo.cliente_desde} 
                onChange={e => setNovo(n => ({...n, cliente_desde: e.target.value}))}
                className="rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Gerente Executiva Responsável</label>
              <Input 
                value={novo.executiva_venda} 
                onChange={e => setNovo(n => ({...n, executiva_venda: e.target.value}))}
                placeholder="Nome da gerente"
                className="rounded-xl border-slate-200"
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setNovoOpen(false); setEditingId(null); }} className="rounded-full px-6">Cancelar</Button>
            <Button 
              onClick={handleSave} 
              disabled={criando}
              className="rounded-full px-8 bg-cyan-500 hover:bg-cyan-600 text-white"
            >
              {criando ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
              {editingId ? "Atualizar Dados" : "Salvar Cliente"}
            </Button>
          </div>
        </div>
      )}

      <section
        style={{
          background: "#D6F4FB",
          borderRadius: 28,
          padding: "20px 24px 28px",
          border: "1px solid #E5F5FB",
          boxShadow: "0 2px 12px rgba(10, 37, 64, 0.04)",
        }}
      >
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div className="flex items-center gap-2" style={{ color: "#0A2540" }}>
            <Building2 size={18} style={{ color: "#00BFF0" }} />
            <h3 style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>
              Clientes Cadastrados
            </h3>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                background: "#D6F4FB",
                color: "#0A2540",
                padding: "3px 12px",
                borderRadius: 999,
              }}
            >
              {filtrados.length}
            </span>
          </div>

          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "#00BFF0" }} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar razão social ou CNPJ..."
              style={{
                width: 360,
                height: 40,
                borderRadius: 999,
                background: "#FFFFFF",
                border: "2px solid #00BFF0",
                padding: "0 20px 0 40px",
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 12,
                color: "#0A2540",
                outline: "none",
              }}
            />
          </div>
        </div>

        {filtrados.length === 0 ? (
          <p style={{ fontSize: 13, color: "#64748B", textAlign: "center", padding: "40px 0", fontFamily: "'Montserrat', sans-serif" }}>
            Nenhum cliente encontrado.
          </p>
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 16, border: "1px solid #D6F4FB" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#00BFF0", color: "#FFFFFF" }}>
                  {["Razão Social", "CNPJ", "Telefone", "Executiva Resp.", "Blitz/Eventos", "Ações"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 14px",
                        textAlign: h === "Ações" ? "right" : "left",
                        fontWeight: 800,
                        letterSpacing: 1.2,
                        textTransform: "uppercase",
                        fontSize: 10,
                        whiteSpace: "nowrap",
                        position: h === "Ações" ? "sticky" : undefined,
                        right: h === "Ações" ? 0 : undefined,
                        background: h === "Ações" ? "#00BFF0" : undefined,
                        zIndex: h === "Ações" ? 2 : undefined,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((cliente, idx) => (
                  <tr
                    key={cliente.id || idx}
                    style={{
                      background: idx % 2 === 0 ? "#FFFFFF" : "#F7FCFE",
                      color: "#0A2540",
                    }}
                  >
                    <td style={{ padding: "12px 14px", minWidth: 200, fontWeight: 700, fontSize: 13 }}>
                      {cliente.nome}
                    </td>
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>{cliente.cnpj}</td>
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>{cliente.telefone_comercial}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <div className="flex items-center gap-2">
                        <UserCog size={14} className="text-slate-400" />
                        {cliente.executiva_venda || "—"}
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 10px",
                          borderRadius: 999,
                          background: "#D6F4FB",
                          color: "#0A2540",
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: 0.6,
                          textTransform: "uppercase",
                        }}
                      >
                        <Activity size={12} />
                        {getEventosCliente(cliente.nome)} Eventos
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "12px 14px",
                        textAlign: "right",
                        position: "sticky",
                        right: 0,
                        background: idx % 2 === 0 ? "#FFFFFF" : "#F7FCFE",
                        zIndex: 1,
                      }}
                    >
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleEdit(cliente)}
                          className="rounded-full text-slate-400 hover:text-cyan-600 h-8 w-8"
                        >
                          <UserCog size={16} />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="rounded-full text-slate-400 hover:text-red-500 h-8 w-8"
                        >
                          <Trash2 size={16} />
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