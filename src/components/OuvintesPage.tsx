import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Trash2, Pencil, UserPlus, X, Search } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { useToast } from "@/hooks/use-toast";

interface Ouvinte {
  id: string;
  created_at: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  setor: string | null;
  cidade: string | null;
  data_nascimento: string | null;
  escolaridade: string | null;
  renda: string | null;
  pontuacao: number | null;
}

const ESCOLARIDADE_OPTIONS = [
  "Fundamental Incompleto",
  "Fundamental Completo",
  "Médio Incompleto",
  "Médio Completo",
  "Superior Incompleto",
  "Superior Completo",
  "Pós-graduação",
  "Mestrado",
  "Doutorado",
];

const RENDA_OPTIONS = [
  "Até 1 salário mínimo",
  "1 a 2 salários mínimos",
  "2 a 4 salários mínimos",
  "4 a 10 salários mínimos",
  "10 a 20 salários mínimos",
  "Acima de 20 salários mínimos",
];

const emptyForm = {
  nome: "",
  cpf: "",
  telefone: "",
  email: "",
  setor: "",
  cidade: "",
  data_nascimento: "",
  escolaridade: "",
  renda: "",
  pontuacao: "0",
};

export default function OuvintesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ouvintes, setOuvintes] = useState<Ouvinte[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ouvintes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar ouvintes", description: error.message, variant: "destructive" });
    } else {
      setOuvintes((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.nome.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      user_id: user.id,
      nome: form.nome.trim(),
      cpf: form.cpf.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      setor: form.setor.trim() || null,
      cidade: form.cidade.trim() || null,
      data_nascimento: form.data_nascimento || null,
      escolaridade: form.escolaridade || null,
      renda: form.renda || null,
      pontuacao: Number(form.pontuacao) || 0,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("ouvintes").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("ouvintes").insert(payload));
    }

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingId ? "Ouvinte atualizado" : "Ouvinte cadastrado" });
      resetForm();
      load();
    }
    setSaving(false);
  };

  const handleEdit = (o: Ouvinte) => {
    setEditingId(o.id);
    setForm({
      nome: o.nome || "",
      cpf: o.cpf || "",
      telefone: o.telefone || "",
      email: o.email || "",
      setor: o.setor || "",
      cidade: o.cidade || "",
      data_nascimento: o.data_nascimento || "",
      escolaridade: o.escolaridade || "",
      renda: o.renda || "",
      pontuacao: String(o.pontuacao ?? 0),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este ouvinte?")) return;
    const { error } = await supabase.from("ouvintes").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ouvinte excluído" });
      load();
    }
  };

  const filtered = ouvintes.filter((o) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      o.nome?.toLowerCase().includes(s) ||
      o.cpf?.toLowerCase().includes(s) ||
      o.email?.toLowerCase().includes(s) ||
      o.cidade?.toLowerCase().includes(s)
    );
  });

  if (loading) return <ModulePageSkeleton />;

  const today = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Form */}
      <section className="rounded-2xl p-6 bg-card border border-border">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              {editingId ? "Editar Ouvinte" : "Cadastrar Ouvinte"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Data do cadastro: <span className="font-medium">{editingId ? "—" : today}</span>
            </p>
          </div>
          {editingId && (
            <Button variant="outline" size="sm" onClick={resetForm}>
              <X className="w-4 h-4 mr-1" /> Cancelar edição
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" />
          </div>
          <div>
            <Label htmlFor="cpf">CPF</Label>
            <Input id="cpf" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
          </div>
          <div>
            <Label htmlFor="telefone">Telefone</Label>
            <Input id="telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(00) 00000-0000" />
          </div>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@exemplo.com" />
          </div>
          <div>
            <Label htmlFor="setor">Setor</Label>
            <Input id="setor" value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })} placeholder="Ex.: Bairro / região" />
          </div>
          <div>
            <Label htmlFor="cidade">Cidade</Label>
            <Input id="cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} placeholder="Cidade" />
          </div>
          <div>
            <Label htmlFor="nasc">Data de nascimento</Label>
            <Input id="nasc" type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
          </div>
          <div>
            <Label>Escolaridade</Label>
            <Select value={form.escolaridade} onValueChange={(v) => setForm({ ...form, escolaridade: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {ESCOLARIDADE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Renda</Label>
            <Select value={form.renda} onValueChange={(v) => setForm({ ...form, renda: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {RENDA_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="pontos">Pontuação</Label>
            <Input id="pontos" type="number" step="1" value={form.pontuacao} onChange={(e) => setForm({ ...form, pontuacao: e.target.value })} />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editingId ? "Atualizar Ouvinte" : "Cadastrar Ouvinte"}
          </Button>
        </div>
      </section>

      {/* List */}
      <section className="rounded-2xl p-6 bg-card border border-border">
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <h3 className="text-lg font-semibold text-foreground">
            Ouvintes cadastrados <span className="text-muted-foreground text-sm font-normal">({filtered.length})</span>
          </h3>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, CPF, e-mail ou cidade"
              className="pl-9 w-72"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhum ouvinte cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Nascimento</TableHead>
                  <TableHead>Escolaridade</TableHead>
                  <TableHead>Renda</TableHead>
                  <TableHead className="text-right">Pontos</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {o.created_at ? new Date(o.created_at).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="font-medium">{o.nome}</TableCell>
                    <TableCell>{o.cpf || "—"}</TableCell>
                    <TableCell>{o.telefone || "—"}</TableCell>
                    <TableCell>{o.email || "—"}</TableCell>
                    <TableCell>{o.setor || "—"}</TableCell>
                    <TableCell>{o.cidade || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {o.data_nascimento ? new Date(o.data_nascimento + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell>{o.escolaridade || "—"}</TableCell>
                    <TableCell>{o.renda || "—"}</TableCell>
                    <TableCell className="text-right">{o.pontuacao ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(o)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(o.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
