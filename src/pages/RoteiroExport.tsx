import { useLocation, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Download } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { usePdfPopup, PdfPopup } from "@/components/PdfPopup";

export default function RoteiroExport() {
  usePageTitle("Roteiro Export");
  const location = useLocation();
  const navigate = useNavigate();
  const pdfPopup = usePdfPopup();
  const data = location.state as {
    titulo: string;
    programaNome: string;
    estudio: string;
    data: string;
    horario: string;
    assuntoTitulo: string;
    assuntoSubtitulo: string;
    participantes: { nome: string; categoria: string; cargo: string; instagram: string }[];
    conteudoHtml: string;
    numeroRoteiro?: number | null;
    logoUrl?: string | null;
  } | null;

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f4f6fb" }}>
        <div className="text-center">
          <p className="text-sm" style={{ color: "#0d0446" }}>Nenhum roteiro para exibir.</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-xs font-semibold" style={{ color: "#268ffa" }}>
            ← voltar
          </button>
        </div>
      </div>
    );
  }

  const dataFormatada = (() => {
    try {
      return format(new Date(data.data), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return data.data;
    }
  })();

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f4f6fb" }}>
      {/* Top bar - hidden on print */}
      <div className="print:hidden flex items-center justify-between px-6 py-4" style={{ backgroundColor: "#0d0446" }}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-xs font-semibold text-white hover:opacity-80 transition">
          <ArrowLeft size={14} />
          voltar
        </button>
        <button onClick={() => {
          const el = document.getElementById("roteiro-export-page-content");
          if (el) {
            const safeName = (data.programaNome || "roteiro").replace(/\s+/g, "_").toLowerCase();
            pdfPopup.generate(el, `roteiro_${safeName}.pdf`);
          }
        }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white hover:opacity-90 transition" style={{ backgroundColor: "#268ffa" }}>
          <Download size={14} />
          gerar PDF
        </button>
      </div>

      {/* Content */}
      <div id="roteiro-export-page-content" className="max-w-3xl mx-auto px-6 py-8 print:px-0 print:py-4 print:max-w-none">
        {/* Header */}
        <div className="mb-8 print:mb-6">
          <h1 className="text-2xl font-bold uppercase mb-2" style={{ color: "#0d0446" }}>
            {data.titulo || "Roteiro"}
          </h1>
          <div className="space-y-1">
            <p className="text-sm" style={{ color: "rgba(13,4,70,0.7)" }}>
              <span className="font-semibold" style={{ color: "#0d0446" }}>{data.programaNome}</span>
              {data.estudio && <span> · Estúdio {data.estudio}</span>}
            </p>
            <p className="text-sm" style={{ color: "rgba(13,4,70,0.6)" }}>
              {dataFormatada} {data.horario && `às ${data.horario}`}
            </p>
          </div>

          {/* Assunto da entrevista */}
          {(data.assuntoTitulo || data.assuntoSubtitulo) && (
            <div className="mt-4 px-4 py-3 rounded-lg" style={{ backgroundColor: "rgba(38,143,250,0.06)", borderLeft: "3px solid #268ffa" }}>
              <p className="text-xs font-bold uppercase mb-0.5" style={{ color: "#268ffa" }}>Assunto da entrevista</p>
              {data.assuntoTitulo && (
                <p className="text-sm font-bold" style={{ color: "#0d0446" }}>{data.assuntoTitulo}</p>
              )}
              {data.assuntoSubtitulo && (
                <p className="text-xs" style={{ color: "rgba(13,4,70,0.6)" }}>{data.assuntoSubtitulo}</p>
              )}
            </div>
          )}

          {/* Participantes */}
          {data.participantes && data.participantes.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase mb-2" style={{ color: "rgba(13,4,70,0.5)" }}>Participantes</p>
              <div className="flex flex-wrap gap-2">
                {data.participantes.map((p, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: "rgba(13,4,70,0.05)", color: "#0d0446" }}>
                    {p.nome}
                    {p.cargo && <span style={{ color: "rgba(13,4,70,0.4)" }}> · {p.cargo}</span>}
                    {!p.cargo && p.categoria && <span style={{ color: "rgba(13,4,70,0.4)" }}> · {p.categoria}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px mb-6" style={{ backgroundColor: "rgba(13,4,70,0.1)" }} />

        {/* Roteiro do programa */}
        <div>
          <h2 className="text-sm font-bold uppercase mb-4" style={{ color: "#0d0446" }}>Roteiro do programa</h2>
          <div
            className="text-sm leading-relaxed"
            style={{ color: "#0d0446" }}
            dangerouslySetInnerHTML={{ __html: data.conteudoHtml }}
          />
        </div>

        {/* Mensagem final */}
        <div className="mt-10 pt-6 text-center" style={{ borderTop: "1px solid rgba(13,4,70,0.1)" }}>
          <p className="text-lg font-bold italic" style={{ color: "#268ffa" }}>Bom programa! 🎙️</p>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>
      <PdfPopup status={pdfPopup.status} blobUrl={pdfPopup.blobUrl} filename={pdfPopup.filename} onClose={pdfPopup.close} anchorId="roteiro-export-page-content" />
    </div>
  );
}
