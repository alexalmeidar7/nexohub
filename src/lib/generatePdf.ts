import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

export async function generatePdfBlob(element: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const usableWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * usableWidth) / canvas.width;

  let position = 0;
  const usableHeight = pageHeight - margin * 2;

  while (position < imgHeight) {
    if (position > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", margin, margin - position, usableWidth, imgHeight);
    position += usableHeight;
  }

  return pdf.output("blob");
}
