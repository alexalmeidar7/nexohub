export const CADASTRO_FIELD_KEYS = [
  "nome", "cpf", "telefone", "email", "sexo", "data_nascimento", "uf",
  "cidade", "setor", "escolaridade", "renda",
] as const;

export type CadastroFieldKey = typeof CADASTRO_FIELD_KEYS[number];

export const DEFAULT_CADASTRO_RULES: Record<CadastroFieldKey, number> = {
  nome: 10, cpf: 15, telefone: 15, email: 10, sexo: 5,
  data_nascimento: 10, uf: 5, cidade: 5, setor: 5,
  escolaridade: 10, renda: 10,
};
