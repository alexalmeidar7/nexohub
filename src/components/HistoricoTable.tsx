import { useMemo } from "react";
import { format, subDays, isAfter } from "date-fns";

interface Props {
  historico: any[];
}

export default function HistoricoTable({ historico }: Props) {
  const rows = useMemo(() => {
    const cutoff = subDays(new Date(), 30);
    return historico
      .filter(r => {
        try { return isAfter(new Date(r.data_programa), cutoff); } catch { return false; }
      })
      .sort((a, b) => {
        const da = new Date(`${a.data_programa}T${a.horario || "00:00"}`).getTime();
        const db = new Date(`${b.data_programa}T${b.horario || "00:00"}`).getTime();
        return db - da;
      });
  }, [historico]);

  const getParticipantes = (r: any): string => {
    let parts: any = null;
    try {
      let raw = r.participantes;
      if (typeof raw === "string") raw = JSON.parse(raw);
      if (typeof raw === "string") raw = JSON.parse(raw);
      parts = raw;
    } catch { return ""; }
    const parsed = Array.isArray(parts) ? { participantes: parts } : (parts || {});
    const list: any[] = parsed.participantes || [];
    return list.map((p: any) => p.nome).filter(Boolean).join(", ");
  };

  const cellStyle: React.CSSProperties = {
    padding: "6px 8px",
    fontSize: "10px",
    color: "var(--layout-page-text, #1a1a1a)",
    borderBottom: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 10%, transparent)",
    verticalAlign: "top",
  };

  const headerStyle: React.CSSProperties = {
    ...cellStyle,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    fontSize: "9px",
    color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 55%, transparent)",
    backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 4%, transparent)",
    textAlign: "left",
    position: "sticky",
    top: 0,
  };

  return (
    <div className="overflow-x-auto rounded-lg" style={{ maxHeight: 420, overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={headerStyle}>Data</th>
            <th style={headerStyle}>Horário</th>
            <th style={headerStyle}>Programa</th>
            <th style={headerStyle}>Estúdio</th>
            <th style={headerStyle}>Título</th>
            <th style={headerStyle}>Participantes</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ ...cellStyle, textAlign: "center", padding: "20px", opacity: 0.6 }}>
                Nenhum roteiro nos últimos 30 dias.
              </td>
            </tr>
          )}
          {rows.map(r => {
            const isAuto = typeof r.titulo === "string" && r.titulo.includes("[AUTO]");
            return (
              <tr key={r.id} style={{ backgroundColor: isAuto ? "color-mix(in srgb, #8b5cf6 6%, transparent)" : undefined }}>
                <td style={cellStyle}>{format(new Date(r.data_programa), "dd/MM/yyyy")}</td>
                <td style={cellStyle}>{r.horario || "—"}</td>
                <td style={{ ...cellStyle, fontWeight: 600 }}>
                  {r.programa_nome || "—"}
                  {isAuto && <span style={{ marginLeft: 4, fontSize: 8, padding: "1px 4px", borderRadius: 4, backgroundColor: "#8b5cf6", color: "#fff" }}>AUTO</span>}
                </td>
                <td style={cellStyle}>{r.estudio || "—"}</td>
                <td style={cellStyle}>{(r.titulo || "").replace("[AUTO]", "").trim() || "—"}</td>
                <td style={cellStyle}>{getParticipantes(r) || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
