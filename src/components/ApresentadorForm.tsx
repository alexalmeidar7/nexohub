export default function ApresentadorForm() {
  return (
    <div className="max-w-md space-y-4 animate-fade-in">
      <h3 className="text-xl mb-4 text-primary">Novo Apresentador</h3>
      <input
        placeholder="Nome Completo"
        className="w-full bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
      />
      <input
        placeholder="Cargo/Especialidade"
        className="w-full bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
      />
      <button className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-bold hover:brightness-95 transition-all">
        Salvar
      </button>
    </div>
  );
}
