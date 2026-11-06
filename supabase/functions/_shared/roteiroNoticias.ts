export function noticiasComCampoFixo<T extends { titulo: string; imagemUrl: string; escalada: boolean; resumo?: string; texto_materia?: string }>(
  noticias: T[],
  campoFixo: unknown,
  primeiroBloco: boolean,
) {
  const fixo = primeiroBloco && typeof campoFixo === "string" ? campoFixo.trim() : "";
  return fixo
    ? [{ titulo: fixo, imagemUrl: "", resumo: "", texto_materia: "", escalada: false }, ...noticias]
    : noticias;
}
