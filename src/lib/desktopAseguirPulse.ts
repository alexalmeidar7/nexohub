/** Read absolute pulse metadata; no local guesswork or unnecessary polling. */
function tagValue(xml: string, name: string): string {
  return xml.match(new RegExp("<" + name + ">([^<]*)</" + name + ">", "i"))?.[1]?.trim() || "";
}
function timeOrNull(value: string): number | null {
  const n = value ? Date.parse(value) : NaN;
  return Number.isFinite(n) ? n : null;
}
export function readAseguirPulseTimes(xml: string): { expiresAt: number | null; nextTriggerAt: number | null } {
  return {
    expiresAt: timeOrNull(tagValue(xml, "aseguir_expira_em")),
    nextTriggerAt: timeOrNull(tagValue(xml, "aseguir_proximo_disparo_em")),
  };
}
/** Blank only pulse fields: preserve No Ar / advertising / music information. */
export function expireAseguirXml(xml: string): string {
  let output = xml;
  for (const tag of ["aseguir_t1", "aseguir_t2", "aseguir_t3", "aseguir_expira_em"]) {
    output = output.replace(new RegExp("<" + tag + ">[^<]*</" + tag + ">", "gi"), "<" + tag + "></" + tag + ">");
  }
  return output.replace(/<a_seguir>([\s\S]*?)<\/a_seguir>/i, (_whole, contents: string) => {
    let inner = contents;
    for (const tag of ["programa_nome", "nome_programa", "programa_logo",
      "locutor_nome", "locutor_foto", "horario", "texto"]) {
      inner = inner.replace(new RegExp("<" + tag + ">[^<]*</" + tag + ">", "gi"), "<" + tag + "></" + tag + ">");
    }
    return "<a_seguir>" + inner + "</a_seguir>";
  });
}
