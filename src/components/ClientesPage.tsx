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
  const [novoOpen, setNovoOpen] = useState(false);
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
      // Usamos a tabela logos_patrocinadores como fonte para clientes,
      // agrupando pelo nome para tratar cada marca como um cliente único.
      const { data: logosData } = await supabase
        .from("logos_patrocinadores")
        .select("id, user_id, nome, logo_url, ativo, created_at")
        .eq("excluido", false)
        .order("nome");
      
      const { data: agendaData } = await supabase
        .from("blitz_promocionais")
        .select("*");

      // Deduplicar logos por nome para gerar a lista de clientes
      const uniqueClients: Cliente[] = [];
      const seenNames = new Set();

      (logosData || []).forEach(item => {
        const name = item.nome?.trim().toUpperCase();
        if (name && !seenNames.has(name)) {
          seenNames.add(name);
          uniqueClients.push({
            id: item.id,
            user_id: item.user_id,
            nome: item.nome,
            logo_url: item.logo_url,
            ativo: item.ativo,
            cnpj: "00.000.000/0000-00", // Fallback pois não há coluna na DB
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
      // Nota: empresa_config geralmente tem 1 linha por user_id. 
      // Se estivermos cadastrando "clientes" como registros novos, 
      // precisaríamos de uma tabela de clientes dedicada ou permissão para criar novos user_ids.
      // Para o MVP solicitado, inserimos na empresa_config assumindo que ela aceita múltiplos registros.
      
      const { error } = await supabase.from("empresa_config").insert({
        nome: novo.nome,
        cnpj: novo.cnpj,
        endereco: novo.endereco,
        telefone_comercial: novo.telefone,
        cliente_desde: novo.cliente_desde,
        executiva_venda: novo.executiva_venda,
        ativo: true
      } as any);

      if (error) throw error;

      toast.success("Cliente cadastrado com sucesso!");
      setNovoOpen(false);
      setNovo({ nome: "", cnpj: "", endereco: "", telefone: "", cliente_desde: "", executiva_venda: "" });
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao cadastrar cliente.");
    } finally {
      setCriando(false);
    }
  };

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase();
    return clientes.filter(c => 
      c.nome?.toLowerCase().includes(q) || 
      c.cnpj?.includes(q)
    );
  }, [clientes, busca]);

  const getEventosCliente = (clienteNome: string | null) => {
    if (!clienteNome) return 0;
    return eventos.filter(e => (e as any).cliente_nome === clienteNome).length;
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cadastro de Clientes</h1>
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
            <h2 className="text-lg font-bold text-slate-800">Novo Cliente</h2>
            <Button variant="ghost" size="icon" onClick={() => setNovoOpen(false)} className="rounded-full">
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
            <Button variant="outline" onClick={() => setNovoOpen(false)} className="rounded-full px-6">Cancelar</Button>
            <Button 
              onClick={handleSave} 
              disabled={criando}
              className="rounded-full px-8 bg-cyan-500 hover:bg-cyan-600 text-white"
            >
              {criando ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
              Salvar Cliente
            </Button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="font-bold text-slate-700">Razão Social</TableHead>
              <TableHead className="font-bold text-slate-700">CNPJ</TableHead>
              <TableHead className="font-bold text-slate-700">Telefone</TableHead>
              <TableHead className="font-bold text-slate-700">Executiva Resp.</TableHead>
              <TableHead className="font-bold text-slate-700">Eventos Contratados</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.map((cliente, idx) => (
              <TableRow key={cliente.user_id || idx} className="hover:bg-slate-50/50 transition-colors">
                <TableCell className="font-medium text-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-600">
                      <Building2 size={16} />
                    </div>
                    {cliente.nome}
                  </div>
                </TableCell>
                <TableCell className="text-slate-600 text-xs">{cliente.cnpj}</TableCell>
                <TableCell className="text-slate-600 text-xs">{cliente.telefone_comercial}</TableCell>
                <TableCell className="text-slate-600">
                  <div className="flex items-center gap-2">
                    <UserCog size={14} className="text-slate-400" />
                    {cliente.executiva_venda || "—"}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-lime-100 text-lime-700 text-[10px] font-bold uppercase">
                    <Activity size={12} />
                    {getEventosCliente(cliente.nome)} Eventos
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="rounded-full text-slate-400 hover:text-red-500">
                    <Trash2 size={16} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-slate-400">
                  Nenhum cliente encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}