import { useState, useCallback, useRef } from "react";
import { Download, Loader2, X, FileText } from "lucide-react";

type PdfStatus = "idle" | "generating" | "ready" | "error";

interface PdfPopupState {
  status: PdfStatus;
  blobUrl: string | null;
  filename: string;
}

export function usePdfPopup() {
  const [state, setState] = useState<PdfPopupState>({ status: "idle", blobUrl: null, filename: "roteiro.pdf" });
  const blobUrlRef = useRef<string | null>(null);

  const generate = useCallback(async (element: HTMLElement, filename = "roteiro.pdf", logoUrl?: string | null) => {
    // Cleanup previous blob
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);

    setState({ status: "generating", blobUrl: null, filename });

    try {
      const { generatePdfBlob } = await import("@/lib/generatePdf");
      const blob = await generatePdfBlob(element, logoUrl);
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      setState({ status: "ready", blobUrl: url, filename });
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      setState({ status: "error", blobUrl: null, filename });
    }
  }, []);

  const close = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setState({ status: "idle", blobUrl: null, filename: "roteiro.pdf" });
  }, []);

  return { ...state, generate, close };
}

export function PdfPopup({ status, blobUrl, filename, onClose, anchorId }: {
  status: PdfStatus;
  blobUrl: string | null;
  filename: string;
  onClose: () => void;
  anchorId?: string;
}) {
  if (status === "idle") return null;

  const anchorEl = anchorId ? document.getElementById(anchorId) : null;
  const anchorRect = anchorEl?.getBoundingClientRect();

  const popupStyle: React.CSSProperties = anchorRect
    ? {
        position: "fixed",
        top: Math.max(anchorRect.top + 40, 80),
        left: anchorRect.left + anchorRect.width / 2,
        transform: "translateX(-50%)",
        zIndex: 9999,
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 9999,
      };

  return (
    <div className="fixed inset-0 z-[9998]" style={{ backgroundColor: "rgba(0,0,0,0.3)" }} onClick={onClose}>
      <div
        className="rounded-2xl shadow-2xl flex flex-col items-center justify-center gap-4 px-8 py-6"
        style={{ ...popupStyle, width: 420, minHeight: 160, backgroundColor: "rgba(13,4,70,0.94)" }}
        onClick={(e) => e.stopPropagation()}
      >
        
        <button onClick={onClose} className="absolute top-3 right-3 text-white/50 hover:text-white transition">
          <X size={16} />
        </button>

        {status === "generating" && (
          <>
            <Loader2 size={32} className="animate-spin" style={{ color: "#2dbff4" }} />
            <p className="text-white text-sm font-semibold">Gerando PDF...</p>
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
              <div className="h-full rounded-full animate-pulse" style={{ backgroundColor: "#2dbff4", width: "60%" }} />
            </div>
          </>
        )}

        {status === "ready" && blobUrl && (
          <>
            <FileText size={32} style={{ color: "#2dbff4" }} />
            <p className="text-white text-sm font-semibold">PDF gerado com sucesso!</p>
            <a
              href={blobUrl}
              download={filename}
              onClick={() => setTimeout(onClose, 500)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white hover:opacity-90 transition"
              style={{ backgroundColor: "#268ffa" }}
            >
              <Download size={14} />
              Download do PDF
            </a>
          </>
        )}

        {status === "error" && (
          <>
            <p className="text-white text-sm font-semibold">Erro ao gerar o PDF</p>
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold text-white hover:opacity-90 transition" style={{ backgroundColor: "#ef4444" }}>
              fechar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
