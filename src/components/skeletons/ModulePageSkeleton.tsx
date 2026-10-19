import FinanceiroPageSkeleton from "./FinanceiroPageSkeleton";
import ClientesPageSkeleton from "./ClientesPageSkeleton";
import ConfiguracoesPageSkeleton from "./ConfiguracoesPageSkeleton";
import ProdutosPageSkeleton from "./ProdutosPageSkeleton";
import AdminDashboardSkeleton from "./AdminDashboardSkeleton";
import AgendaPageSkeleton from "./AgendaPageSkeleton";
import DashboardSkeleton from "./DashboardSkeleton";
import MusicaNoArSkeleton from "./MusicaNoArSkeleton";

export type SkeletonVariant =
  | "financeiro"
  | "clientes"
  | "configuracoes"
  | "empresa"
  | "produtos"
  | "agenda"
  | "dashboard"
  | "musica"
  | "form"
  | "list"
  | "housemix"
  | "table";

interface Props {
  variant?: SkeletonVariant;
}

/** Header Block no padrão da Agenda/House Mix */
function ModernHeaderBlock() {
  return (
    <section className="bg-white rounded-3xl p-6 lg:p-7 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 flex items-center justify-between gap-4 flex-wrap animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-2xl bg-[#0055ff]/10 shrink-0" />
        <div className="space-y-2">
          <div className="h-4.5 w-48 bg-slate-200 rounded-md" />
          <div className="h-3 w-72 max-w-full bg-slate-100 rounded-md" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-9 w-28 rounded-full bg-slate-100" />
        <div className="h-9 w-36 rounded-full bg-[#0055ff]/25" />
      </div>
    </section>
  );
}

/** Action Bar com botões pílula */
function ModernActionBar() {
  return (
    <div className="flex flex-wrap gap-2.5 animate-pulse">
      <div className="h-9 w-36 rounded-full bg-[#0055ff]/25" />
      <div className="h-9 w-28 rounded-full bg-slate-100" />
      <div className="h-9 w-28 rounded-full bg-slate-100" />
    </div>
  );
}

/** Lista de cards com rounded-3xl */
function ModernCardsList() {
  return (
    <div className="space-y-3.5 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="rounded-3xl p-5 bg-white border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] flex items-center gap-4"
        >
          <div className="w-11 h-11 rounded-2xl bg-slate-100 shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="h-3.5 w-2/5 bg-slate-200 rounded" />
            <div className="h-2.5 w-3/5 bg-slate-100 rounded" />
          </div>
          <div className="h-6 w-20 rounded-full bg-[#0055ff]/10" />
          <div className="w-8 h-8 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

/** Tabela com linhas rounded-3xl */
function ModernTableRows() {
  return (
    <div className="bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden animate-pulse">
      <div className="flex gap-4 px-6 py-4 border-b border-slate-100 bg-[#f8fafc]/80 text-[10px]">
        {[100, 180, 120, 80, 60].map((w, i) => (
          <div key={i} className="h-3 bg-slate-200 rounded" style={{ width: w }} />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4">
            <div className="w-8 h-8 rounded-xl bg-slate-100 shrink-0" />
            <div className="h-3.5 flex-1 max-w-[220px] bg-slate-200 rounded" />
            <div className="h-3 w-28 bg-slate-100 rounded" />
            <div className="h-3 w-20 bg-slate-100 rounded" />
            <div className="flex gap-2 ml-auto">
              <div className="w-7 h-7 rounded-full bg-slate-100" />
              <div className="w-7 h-7 rounded-full bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Bloco de formulário com estética da Agenda */
function ModernFormBlock() {
  return (
    <div className="bg-white rounded-3xl p-6 lg:p-7 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 space-y-5 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-2.5 w-24 bg-slate-200 rounded" />
            <div className="h-10 w-full rounded-xl bg-slate-50 border border-slate-200" />
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <div className="h-2.5 w-20 bg-slate-200 rounded" />
        <div className="h-20 w-full rounded-2xl bg-slate-50 border border-slate-200" />
      </div>
      <div className="flex items-center justify-end gap-3 pt-2">
        <div className="h-9 w-28 rounded-full bg-slate-100" />
        <div className="h-9 w-36 rounded-full bg-[#0055ff]/30" />
      </div>
    </div>
  );
}

export default function ModulePageSkeleton({ variant = "list" }: Props) {
  switch (variant) {
    case "financeiro":
      return <FinanceiroPageSkeleton />;
    case "clientes":
      return <ClientesPageSkeleton />;
    case "configuracoes":
    case "empresa":
      return <ConfiguracoesPageSkeleton />;
    case "produtos":
    case "housemix":
      return <ProdutosPageSkeleton />;
    case "agenda":
      return <AgendaPageSkeleton />;
    case "dashboard":
      return <DashboardSkeleton />;
    case "musica":
      return <MusicaNoArSkeleton />;
    case "form":
      return (
        <div className="w-full max-w-none mx-0 space-y-6 pt-2 pb-12 font-sans animate-fade-in">
          <ModernHeaderBlock />
          <ModernFormBlock />
          <ModernTableRows />
        </div>
      );
    case "table":
      return (
        <div className="w-full max-w-none mx-0 space-y-6 pt-2 pb-12 font-sans animate-fade-in">
          <ModernHeaderBlock />
          <ModernTableRows />
        </div>
      );
    case "list":
    default:
      return (
        <div className="w-full max-w-none mx-0 space-y-6 pt-2 pb-12 font-sans animate-fade-in">
          <ModernHeaderBlock />
          <ModernActionBar />
          <ModernCardsList />
        </div>
      );
  }
}

export {
  ModernFormBlock as FormSkeleton,
  ModernTableRows as TableRowsSkeleton,
  FinanceiroPageSkeleton,
  ClientesPageSkeleton,
  ConfiguracoesPageSkeleton,
  ProdutosPageSkeleton,
  AdminDashboardSkeleton,
  AgendaPageSkeleton,
  DashboardSkeleton,
  MusicaNoArSkeleton,
};
