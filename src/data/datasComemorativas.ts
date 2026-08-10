// Datas comemorativas nacionais brasileiras
export interface DataComemorativa {
  dia: number;
  mes: number; // 1-12
  nome: string;
  categoria?: "religiosa" | "civica" | "cultural" | "familia" | "profissao";
  estado?: string; // UF (ex: "MS", "GO") para datas estaduais
}

export const DATAS_COMEMORATIVAS: DataComemorativa[] = [
  { dia: 6, mes: 1, nome: "Dia de Reis", categoria: "religiosa" },
  { dia: 20, mes: 1, nome: "Dia de São Sebastião", categoria: "religiosa" },
  { dia: 30, mes: 1, nome: "Dia da Saudade", categoria: "cultural" },
  { dia: 2, mes: 2, nome: "Dia de Iemanjá", categoria: "religiosa" },
  { dia: 14, mes: 2, nome: "Dia de São Valentim", categoria: "familia" },
  { dia: 8, mes: 3, nome: "Dia Internacional da Mulher", categoria: "civica" },
  { dia: 15, mes: 3, nome: "Dia do Consumidor", categoria: "civica" },
  { dia: 19, mes: 3, nome: "Dia de São José / Dia do Carpinteiro", categoria: "profissao" },
  { dia: 22, mes: 3, nome: "Dia Mundial da Água", categoria: "civica" },
  { dia: 25, mes: 3, nome: "Dia do Especialista", categoria: "profissao" },
  { dia: 1, mes: 4, nome: "Dia da Mentira", categoria: "cultural" },
  { dia: 7, mes: 4, nome: "Dia Mundial da Saúde", categoria: "civica" },
  { dia: 19, mes: 4, nome: "Dia do Índio / Povos Indígenas", categoria: "cultural" },
  { dia: 22, mes: 4, nome: "Descobrimento do Brasil", categoria: "civica" },
  { dia: 23, mes: 4, nome: "Dia de São Jorge", categoria: "religiosa" },
  { dia: 1, mes: 5, nome: "Dia do Trabalho", categoria: "civica" },
  { dia: 8, mes: 5, nome: "Dia das Mães (2º domingo)", categoria: "familia" },
  { dia: 13, mes: 5, nome: "Abolição da Escravatura", categoria: "civica" },
  { dia: 18, mes: 5, nome: "Dia Nacional de Combate ao Abuso Infantil", categoria: "civica" },
  { dia: 12, mes: 6, nome: "Dia dos Namorados", categoria: "familia" },
  { dia: 13, mes: 6, nome: "Dia de Santo Antônio", categoria: "religiosa" },
  { dia: 24, mes: 6, nome: "Dia de São João", categoria: "religiosa" },
  { dia: 29, mes: 6, nome: "Dia de São Pedro", categoria: "religiosa" },
  { dia: 2, mes: 7, nome: "Independência da Bahia", categoria: "civica" },
  { dia: 16, mes: 7, nome: "Dia de Nossa Senhora do Carmo", categoria: "religiosa" },
  { dia: 20, mes: 7, nome: "Dia do Amigo", categoria: "familia" },
  { dia: 26, mes: 7, nome: "Dia dos Avós", categoria: "familia" },
  { dia: 8, mes: 8, nome: "Dia dos Pais (2º domingo)", categoria: "familia" },
  { dia: 11, mes: 8, nome: "Dia do Estudante / Dia do Advogado", categoria: "profissao" },
  { dia: 22, mes: 8, nome: "Dia do Folclore", categoria: "cultural" },
  { dia: 25, mes: 8, nome: "Dia do Soldado", categoria: "profissao" },
  { dia: 7, mes: 9, nome: "Independência do Brasil", categoria: "civica" },
  { dia: 21, mes: 9, nome: "Dia da Árvore", categoria: "civica" },
  { dia: 27, mes: 9, nome: "Dia do Doador de Sangue", categoria: "civica" },
  { dia: 12, mes: 10, nome: "Nossa Senhora Aparecida / Dia das Crianças", categoria: "religiosa" },
  { dia: 15, mes: 10, nome: "Dia do Professor", categoria: "profissao" },
  { dia: 24, mes: 10, nome: "Dia das Nações Unidas", categoria: "civica" },
  { dia: 28, mes: 10, nome: "Dia do Servidor Público", categoria: "profissao" },
  { dia: 2, mes: 11, nome: "Dia de Finados", categoria: "religiosa" },
  { dia: 15, mes: 11, nome: "Proclamação da República", categoria: "civica" },
  { dia: 19, mes: 11, nome: "Dia da Bandeira", categoria: "civica" },
  { dia: 20, mes: 11, nome: "Dia da Consciência Negra", categoria: "civica" },
  { dia: 8, mes: 12, nome: "Dia da Família", categoria: "familia" },
  { dia: 24, mes: 12, nome: "Véspera de Natal", categoria: "religiosa" },
  { dia: 25, mes: 12, nome: "Natal", categoria: "religiosa" },
  { dia: 31, mes: 12, nome: "Réveillon", categoria: "cultural" },
];
