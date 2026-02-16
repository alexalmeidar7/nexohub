export default function ProgramaForm() {
  return (
    <div className="max-w-md space-y-4 animate-fade-in">
      <h3 className="text-xl mb-4 text-primary">Cadastro de Programa</h3>
      <input
        placeholder="Nome do Programa"
        className="w-full bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
      />
      <select className="w-full bg-muted border border-border p-3 rounded-lg text-muted-foreground outline-none focus:ring-1 focus:ring-primary">
        <option>Selecionar Apresentador Responsável</option>
        <option>Apresentador 1</option>
        <option>Apresentador 2</option>
      </select>
      <button className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-bold hover:brightness-95 transition-all">
        Vincular e Criar
      </button>
    </div>
  );
}
