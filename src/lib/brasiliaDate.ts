/**
 * Utilitários de data no fuso horário oficial de Brasília (America/Sao_Paulo).
 *
 * Usar SEMPRE estas funções ao invés de `new Date().toISOString().slice(0,10)`,
 * que retorna a data em UTC e, à noite (após 21h no horário local), já mostra o
 * dia seguinte. Isso causava, por exemplo, "hoje" aparecer como 15/07 quando
 * ainda eram 21:38 de 14/07 no Brasil.
 */

const BR_TZ = "America/Sao_Paulo";

/** Retorna a data "hoje" no fuso de Brasília no formato YYYY-MM-DD. */
export function todayInBrasilia(): string {
  // en-CA formata como "YYYY-MM-DD" nativamente
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Retorna a data (YYYY-MM-DD) do timestamp informado no fuso de Brasília. */
export function toBrasiliaDateString(date: Date | string | number): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
