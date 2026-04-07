import { useState } from "react";
import {
  MoreHorizontal,
  Home,
  CreditCard,
  BarChart3,
  Settings,
  Bell,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  TrendingDown,
  Wallet,
  RefreshCw,
  ChevronRight,
  Plus,
  Clock,
  Shield,
  User,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

/* ─── mini icon-sidebar ─── */
const sidebarIcons = [
  { icon: MoreHorizontal, label: "Menu" },
  { icon: Home, label: "Home" },
  { icon: Wallet, label: "Carteira" },
  { icon: CreditCard, label: "Transações" },
  { icon: BarChart3, label: "Estatísticas" },
  { icon: Bell, label: "Notificações" },
  { icon: Settings, label: "Configurações" },
];

/* ─── dados mock ─── */
const recentTx = [
  { id: 1, name: "João Silva", amount: "+R$ 1.250,00", type: "in", time: "14:32", date: "07/04" },
  { id: 2, name: "Maria Santos", amount: "-R$ 480,00", type: "out", time: "13:10", date: "07/04" },
  { id: 3, name: "Pedro Lima", amount: "+R$ 3.600,00", type: "in", time: "11:45", date: "06/04" },
  { id: 4, name: "Ana Costa", amount: "-R$ 920,00", type: "out", time: "09:20", date: "06/04" },
  { id: 5, name: "Lucas Alves", amount: "+R$ 2.100,00", type: "in", time: "08:05", date: "05/04" },
];

const announcements = [
  { bank: "Banco A", last4: "4521", value: "R$ 89,00" },
  { bank: "Banco B", last4: "7832", value: "R$ 145,00" },
  { bank: "Banco C", last4: "1290", value: "R$ 67,50" },
];

export default function P2PDashboard() {
  const [activeIcon, setActiveIcon] = useState(1);

  return (
    <div className="flex h-full min-h-0 gap-4 p-4 overflow-auto">
      {/* ── Sidebar fina ── */}
      <aside className="hidden md:flex flex-col items-center gap-3 py-4 px-1.5 rounded-3xl bg-card/60 backdrop-blur-md border border-border min-w-[52px]">
        {sidebarIcons.map((item, i) => {
          const Icon = item.icon;
          const active = i === activeIcon;
          return (
            <button
              key={item.label}
              onClick={() => setActiveIcon(i)}
              title={item.label}
              className={`
                w-10 h-10 rounded-full flex items-center justify-center transition-all
                ${active
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                }
              `}
            >
              <Icon size={18} />
            </button>
          );
        })}
      </aside>

      {/* ── Conteúdo principal ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Row 1 — 3 cards topo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Saldo */}
          <div className="rounded-3xl bg-card/70 backdrop-blur-md border border-border p-6 flex flex-col gap-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Saldo Total</span>
            <p className="text-3xl font-bold text-foreground">R$ 12.486,08</p>
            <div className="flex gap-2 mt-auto pt-2">
              <button className="flex-1 rounded-xl bg-primary text-primary-foreground text-sm font-semibold py-2.5 hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5">
                <ArrowDownLeft size={14} /> Depositar
              </button>
              <button className="flex-1 rounded-xl bg-muted text-foreground text-sm font-semibold py-2.5 hover:bg-muted/80 transition-colors flex items-center justify-center gap-1.5">
                <ArrowUpRight size={14} /> Sacar
              </button>
            </div>
          </div>

          {/* Transações hoje */}
          <div className="rounded-3xl bg-card/70 backdrop-blur-md border border-border p-6 flex flex-col gap-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Transações Hoje</span>
            <div className="flex items-end gap-3">
              <p className="text-3xl font-bold text-foreground">456</p>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/15 rounded-full px-2 py-0.5 mb-1">
                <TrendingUp size={12} /> +12%
              </span>
            </div>
            <button className="mt-auto rounded-xl border border-border text-sm text-muted-foreground py-2.5 hover:bg-muted/40 transition-colors flex items-center justify-center gap-1.5">
              <Plus size={14} /> Adicionar anúncio
            </button>
          </div>

          {/* Volume */}
          <div className="rounded-3xl bg-card/70 backdrop-blur-md border border-border p-6 flex flex-col gap-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Volume de Trocas</span>
            <p className="text-3xl font-bold text-foreground">R$ 41.118,08</p>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-auto pt-2">
              <span className="flex items-center gap-1"><RefreshCw size={12} /> Média: R$ 325,84</span>
              <span className="flex items-center gap-1"><Clock size={12} /> Hoje</span>
            </div>
          </div>
        </div>

        {/* Row 2 — Nível + stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Nível da conta */}
          <div className="md:col-span-2 rounded-3xl bg-card/70 backdrop-blur-md border border-border p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Nível da Conta</span>
              <ChevronRight size={16} className="text-muted-foreground" />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-primary" />
                <span className="font-semibold text-foreground">Standard</span>
              </div>
              <span className="text-xs text-muted-foreground">R$ 1.533</span>
              <div className="flex-1">
                <Progress value={42} className="h-2 bg-muted [&>div]:bg-primary" />
              </div>
              <span className="text-xs text-muted-foreground">Premium</span>
            </div>
            <p className="text-xs text-muted-foreground">Movimentação nos últimos 30 dias: <span className="text-foreground font-medium">R$ 4.152,87</span></p>
          </div>

          {/* Mini stats */}
          <div className="rounded-3xl bg-card/70 backdrop-blur-md border border-border p-6 flex flex-col gap-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Total de Transações</span>
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center text-lg font-bold">12</span>
              <div>
                <p className="text-sm font-semibold text-foreground">R$ 2.155,03</p>
                <p className="text-xs text-muted-foreground">Volume total</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="w-10 h-10 rounded-full bg-destructive/15 text-destructive flex items-center justify-center text-lg font-bold">3</span>
              <div>
                <p className="text-sm font-semibold text-foreground">R$ 437,12</p>
                <p className="text-xs text-muted-foreground">Canceladas</p>
              </div>
            </div>
          </div>
        </div>

        {/* Row 3 — Anúncios + Transações recentes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Meus anúncios */}
          <div className="rounded-3xl bg-card/70 backdrop-blur-md border border-border p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Meus Anúncios</span>
              <ChevronRight size={16} className="text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-2">
              {announcements.map((a) => (
                <div key={a.last4} className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CreditCard size={16} className="text-primary" />
                    <span className="text-sm text-foreground font-medium">{a.bank}</span>
                    <span className="text-xs text-muted-foreground">•••• {a.last4}</span>
                  </div>
                  <span className="text-sm font-semibold text-primary">{a.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Últimas transações */}
          <div className="md:col-span-2 rounded-3xl bg-card/70 backdrop-blur-md border border-border p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Últimas Transações</span>
              <ChevronRight size={16} className="text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-1">
              {recentTx.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between rounded-xl px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type === "in" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                      {tx.type === "in" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{tx.name}</p>
                      <p className="text-xs text-muted-foreground">{tx.date} · {tx.time}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${tx.type === "in" ? "text-primary" : "text-destructive"}`}>
                    {tx.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
