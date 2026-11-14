import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import type { ClientSubscription } from "./financeiroService";
import { BOLETO_TEMPLATE_BG_BASE64 } from "./boletoTemplateBase64";

// Helper for EMV TLV formatting
function formatEMV(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

// Compute CRC16-CCITT (0x1021) for official Pix BR Code
function computeCRC16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function requirePixKey(pixKey?: string): string {
  const value = pixKey?.trim();
  if (!value) throw new Error("Cadastre a chave PIX da agência antes de gerar a cobrança.");
  return value;
}

/**
 * Generates an official Banco Central do Brasil Pix EMV BR Code string.
 */
export function generatePixBRCode({
  pixKey,
  merchantName = "NEXO AGENCIA",
  merchantCity = "SAO PAULO",
  amount,
  txid = "***",
}: {
  pixKey: string;
  merchantName?: string;
  merchantCity?: string;
  amount: number;
  txid?: string;
}): string {
  const formattedAmount = amount > 0 ? amount.toFixed(2) : "";
  const payloadFormat = formatEMV("00", "01");
  const gui = formatEMV("00", "br.gov.bcb.pix");
  const key = formatEMV("01", pixKey.trim());
  const merchantAccountInfo = formatEMV("26", `${gui}${key}`);
  const mcc = formatEMV("52", "0000");
  const currency = formatEMV("53", "986");
  const transactionAmount = formattedAmount ? formatEMV("54", formattedAmount) : "";
  const countryCode = formatEMV("58", "BR");
  const cleanName = merchantName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .slice(0, 25);
  const nameField = formatEMV("59", cleanName || "NEXO AGENCIA");
  const cleanCity = merchantCity
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .slice(0, 15);
  const cityField = formatEMV("60", cleanCity || "SAO PAULO");
  const cleanTxid =
    (txid || "***")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 25) || "***";
  const txidField = formatEMV("05", cleanTxid);
  const additionalData = formatEMV("62", txidField);
  const payloadWithoutCRC = `${payloadFormat}${merchantAccountInfo}${mcc}${currency}${transactionAmount}${countryCode}${nameField}${cityField}${additionalData}6304`;
  const crc = computeCRC16(payloadWithoutCRC);
  return `${payloadWithoutCRC}${crc}`;
}

/**
 * Builds offscreen printable Boleto DOM element matching the exact vector design in 100% pure CSS & HTML.
 */
function buildBoletoElement(
  client: ClientSubscription,
  config: {
    pixKey: string;
    bankInfo?: string;
  },
  pixPayload: string,
  numDoc: string,
  vencimentoStr: string
): HTMLElement {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "794px";
  container.style.height = "1123px";
  container.style.backgroundColor = "#ffffff";
  container.style.overflow = "hidden";
  container.style.boxSizing = "border-box";
  container.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.justifyContent = "space-between";

  const valorFormatado = (client.valorMensal || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const nomeExibicao = (client.nome_empresarial || client.nome || "Cliente").toUpperCase();
  const cnpjExibicao = client.cnpj || client.razao_social || "CNPJ Não informado";
  const produtosList =
    client.produtos && client.produtos.length > 0
      ? client.produtos.join(", ")
      : "House Mix Streaming, Painel Web e Módulos Integrados";

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(pixPayload)}&margin=0`;

  container.innerHTML = `
    <div style="width: 794px; height: 1123px; background: #ffffff; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden; box-sizing: border-box;">
      
      <!-- TOP SECTION -->
      <div>
        <!-- TOP HEADER -->
        <div style="height: 195px; width: 100%; position: relative; overflow: hidden; background: #0055ff;">
          
          <!-- LEFT DARK NAVY CURVED BACKGROUND -->
          <div style="position: absolute; left: 0; top: 0; width: 50%; height: 100%; background: #011c5b; border-bottom-left-radius: 40px; border-bottom-right-radius: 0; z-index: 1;"></div>
          
          <!-- RIGHT VIBRANT BLUE BLOCK WITH ROUNDED BOTTOM CORNER -->
          <div style="position: absolute; right: 0; top: 0; width: 52%; height: 100%; background: #0055ff; border-bottom-right-radius: 40px; z-index: 0;"></div>
          
          <!-- WATERMARK $ ON RIGHT -->
          <div style="position: absolute; right: 28px; top: -20px; font-size: 200px; font-weight: 900; color: rgba(255,255,255,0.08); font-family: 'Segoe UI', Arial, sans-serif; line-height: 1; user-select: none; z-index: 1;">
            $
          </div>

          <!-- LOGO AND BRANDING -->
          <div style="position: absolute; left: 52px; top: 38px; z-index: 10; display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 32px; font-weight: 900; color: #ffffff; letter-spacing: -1px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">nx.</span>
            <span style="font-size: 24px; font-weight: 300; color: #ffffff; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin-left: 2px;">financeiro</span>
            <div style="width: 30px; height: 30px; border-radius: 50%; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 16px; font-weight: 800; margin-left: 6px;">$</div>
          </div>
        </div>

        <!-- FLOATING TOP CARD: VALOR & VENCIMENTO -->
        <div style="margin: -65px 48px 0 48px; position: relative; z-index: 10; background: #ffffff; border-radius: 24px; border: 1.5px solid #d0deff; box-shadow: 0 10px 32px rgba(1,28,91,0.06); padding: 16px 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <!-- VALOR -->
          <div style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 18px; padding: 14px 20px; display: flex; align-items: center; gap: 14px;">
            <div style="width: 38px; height: 38px; border-radius: 50%; border: 1.5px solid #0055ff; display: flex; align-items: center; justify-content: center; color: #0055ff; font-size: 18px; font-weight: 800;">$</div>
            <div>
              <div style="font-size: 11px; font-weight: 800; color: #0055ff; text-transform: lowercase;">valor:</div>
              <div style="font-size: 18px; font-weight: 900; color: #011c5b; font-family: 'Segoe UI', Arial, sans-serif; margin-top: 1px;">R$ ${valorFormatado}</div>
            </div>
          </div>
          <!-- VENCIMENTO -->
          <div style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 18px; padding: 14px 20px; display: flex; align-items: center; gap: 14px;">
            <div style="width: 38px; height: 38px; border-radius: 12px; border: 1.5px solid #0055ff; display: flex; align-items: center; justify-content: center; color: #0055ff; font-size: 16px; font-weight: 800;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0055ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
                <polyline points="9 16 11 18 15 14"></polyline>
              </svg>
            </div>
            <div>
              <div style="font-size: 11px; font-weight: 800; color: #0055ff; text-transform: lowercase;">vencimento:</div>
              <div style="font-size: 18px; font-weight: 900; color: #011c5b; font-family: 'Segoe UI', Arial, sans-serif; margin-top: 1px;">${vencimentoStr}</div>
            </div>
          </div>
        </div>

        <!-- BENEFICIARIO E PAGADOR -->
        <div style="padding: 30px 52px 0 52px; display: grid; grid-template-columns: 1.15fr 1fr; gap: 32px;">
          <div>
            <div style="font-size: 11.5px; font-weight: 800; color: #0055ff; margin-bottom: 3px;">nome do beneficiário:</div>
            <div style="font-size: 13px; font-weight: 800; color: #011c5b;">ALEXSANDRO DE ALMEIDA ROSA</div>
            <div style="font-size: 12px; font-weight: 600; color: #011c5b; margin-top: 1px;">${config.bankInfo || "Dados bancários não cadastrados"}</div>
            
            <div style="font-size: 11.5px; font-weight: 800; color: #0055ff; margin-top: 22px; margin-bottom: 4px;">após vencimento</div>
            <div style="display: flex; gap: 40px; font-size: 11.5px; color: #64748b;">
              <div>multa<br /><strong style="color: #011c5b; font-size: 13px;">—</strong></div>
              <div>juros<br /><strong style="color: #011c5b; font-size: 13px;">—</strong></div>
            </div>
          </div>
          <div>
            <div style="font-size: 11.5px; font-weight: 800; color: #0055ff; margin-bottom: 3px;">dados do pagador:</div>
            <div style="font-size: 13px; font-weight: 800; color: #011c5b; text-transform: uppercase;">${nomeExibicao}</div>
            <div style="font-size: 12px; font-weight: 600; color: #334155; margin-top: 1px;">${cnpjExibicao}</div>
            
            <div style="font-size: 11.5px; font-weight: 800; color: #0055ff; margin-top: 22px; margin-bottom: 4px;">desconto</div>
            <div style="font-size: 11.5px; color: #64748b;">
              até data limite<br /><strong style="color: #011c5b; font-size: 13px;">—</strong>
            </div>
          </div>
        </div>

        <!-- COMO PAGAR (PIX CARD) -->
        <div style="margin: 28px 48px 0 48px; background: #eef4ff; border-radius: 28px; padding: 28px 36px; display: flex; justify-content: space-between; align-items: center; gap: 24px;">
          <div style="flex: 1;">
            <div style="font-size: 26px; font-weight: 900; color: #011c5b; letter-spacing: -0.5px;">como pagar</div>
            <div style="font-size: 12.5px; font-weight: 800; color: #011c5b; margin-top: 12px;">Pix:</div>
            <div style="font-size: 12.5px; color: #475569; margin-top: 2px;">escaneie o qr code ao lado</div>

            <div style="margin-top: 36px; display: flex; align-items: center; gap: 8px;">
              <svg width="28" height="28" viewBox="0 0 512 512" fill="#0055ff">
                <path d="M112.5 124.7l67.8 67.8c12.5 12.5 32.8 12.5 45.3 0l30.4-30.4-67.8-67.8c-12.5-12.5-32.8-12.5-45.3 0l-30.4 30.4zm287 0l-30.4-30.4c-12.5-12.5-32.8-12.5-45.3 0l-67.8 67.8 30.4 30.4c12.5 12.5 32.8 12.5 45.3 0l67.8-67.8zm0 262.6l-67.8-67.8c-12.5-12.5-32.8-12.5-45.3 0l-30.4 30.4 67.8 67.8c12.5 12.5 32.8 12.5 45.3 0l30.4-30.4zm-287 0l30.4 30.4c12.5 12.5 32.8 12.5 45.3 0l67.8-67.8-30.4-30.4c-12.5-12.5-32.8-12.5-45.3 0l-67.8 67.8z"/>
              </svg>
              <span style="font-size: 24px; font-weight: 900; color: #0055ff; letter-spacing: -0.5px;">pix</span>
            </div>
          </div>

          <div style="background: #ffffff; border-radius: 24px; padding: 14px; box-shadow: 0 4px 24px rgba(0,85,255,0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <img src="${qrCodeUrl}" crossorigin="anonymous" style="width: 176px; height: 176px; border-radius: 14px; display: block;" />
          </div>
        </div>

        <!-- DESCRIÇÃO DO SERVIÇO -->
        <div style="padding: 28px 52px 24px 52px;">
          <div style="font-size: 12px; font-weight: 800; color: #0055ff; margin-bottom: 6px;">descrição do serviço:</div>
          <div style="font-size: 15px; font-weight: 800; color: #011c5b;">${client.plano || "Assinatura Mensal Nexo Soluções"}</div>
          <div style="font-size: 12px; color: #475569; margin-top: 4px;">Serviços inclusos: <strong style="color: #0f172a;">${produtosList}</strong></div>
          <div style="font-size: 11px; color: #64748b; margin-top: 6px; display: flex; gap: 16px;">
            <span>Modalidade: <strong style="color: #334155;">${client.tipoCobranca === "avulsa" ? "Cobrança Avulsa" : "Recorrência Mensal"}</strong></span>
            <span>•</span>
            <span>Documento: <strong style="color: #334155;">${numDoc}</strong></span>
          </div>
        </div>
      </div>

      <!-- FOOTER BOTTOM BAR -->
      <div style="background: #011c5b; width: 100%; padding: 20px 0; text-align: center; margin-top: auto;">
        <span style="color: #ffffff; font-size: 13px; font-weight: 700; letter-spacing: 0.5px;">nexobrasil.net</span>
      </div>

    </div>
  `;

  return container;
}

/**
 * Creates and downloads the Boleto Bancário & Fatura Pix PDF
 */
export async function generateAndDownloadBoletoPdf(
  client: ClientSubscription,
  config: {
    pixKey: string;
    bankInfo?: string;
    daysBeforeDue?: number;
  }
): Promise<{ blob: Blob; filename: string; pixPayload: string }> {
  const pixKey = requirePixKey(config.pixKey);
  const now = new Date();

  let vencimentoStr = "";
  if (client.tipoCobranca === "avulsa" && client.dataVencimentoAvulsa) {
    const parts = client.dataVencimentoAvulsa.split("-").map(Number);
    vencimentoStr = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1).toLocaleDateString("pt-BR");
  } else {
    const dueDay = Number(client.diaVencimento) || 10;
    let dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
    if (now.getTime() > dueDate.getTime() && client.status !== "atrasado") {
      dueDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
    }
    vencimentoStr = dueDate.toLocaleDateString("pt-BR");
  }

  const numDoc = `FAT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;
  const pixPayload = generatePixBRCode({
    pixKey,
    merchantName: "NEXO AGENCIA PUBLICIDADE",
    merchantCity: "SAO PAULO",
    amount: client.valorMensal || 0,
    txid: numDoc.replace(/[^a-zA-Z0-9]/g, ""),
  });

  const container = buildBoletoElement(client, config, pixPayload, numDoc, vencimentoStr);
  document.body.appendChild(container);

  try {
    // Wait for QR code image to load
    await new Promise((resolve) => setTimeout(resolve, 400));

    const canvas = await html2canvas(container, {
      scale: 3, // Ultra-sharp 300 DPI high resolution
      useCORS: true,
      backgroundColor: "#ffffff",
      width: 794,
      height: 1123,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    pdf.addImage(imgData, "PNG", 0, 0, 210, 297, undefined, "FAST");
    const blob = pdf.output("blob");

    const sanitizedName = (client.nome_empresarial || client.nome || "Cliente").replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `Boleto_Nexo_${sanitizedName}_${now.getMonth() + 1}_${now.getFullYear()}.pdf`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { blob, filename, pixPayload };
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Converts a Blob to Base64 string without data URL prefix
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Generates PDF Blob and Base64 without triggering download (for email attachment)
 */
export async function generateBoletoPdfBlob(
  client: ClientSubscription,
  config: {
    pixKey: string;
    bankInfo?: string;
    daysBeforeDue?: number;
  }
): Promise<{ blob: Blob; filename: string; pixPayload: string; base64: string }> {
  const pixKey = requirePixKey(config.pixKey);
  const now = new Date();

  let vencimentoStr = "";
  if (client.tipoCobranca === "avulsa" && client.dataVencimentoAvulsa) {
    const parts = client.dataVencimentoAvulsa.split("-").map(Number);
    vencimentoStr = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1).toLocaleDateString("pt-BR");
  } else {
    const dueDay = Number(client.diaVencimento) || 10;
    let dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
    if (now.getTime() > dueDate.getTime() && client.status !== "atrasado") {
      dueDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
    }
    vencimentoStr = dueDate.toLocaleDateString("pt-BR");
  }

  const numDoc = `FAT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;
  const pixPayload = generatePixBRCode({
    pixKey,
    merchantName: "NEXO AGENCIA PUBLICIDADE",
    merchantCity: "SAO PAULO",
    amount: client.valorMensal || 0,
    txid: numDoc.replace(/[^a-zA-Z0-9]/g, ""),
  });

  const container = buildBoletoElement(client, config, pixPayload, numDoc, vencimentoStr);
  document.body.appendChild(container);

  try {
    await new Promise((resolve) => setTimeout(resolve, 400));

    const canvas = await html2canvas(container, {
      scale: 3, // Ultra-sharp 300 DPI high resolution
      useCORS: true,
      backgroundColor: "#ffffff",
      width: 794,
      height: 1123,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    pdf.addImage(imgData, "PNG", 0, 0, 210, 297, undefined, "FAST");
    const blob = pdf.output("blob");
    const base64 = await blobToBase64(blob);

    const sanitizedName = (client.nome_empresarial || client.nome || "Cliente").replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `Boleto_Nexo_${sanitizedName}_${now.getMonth() + 1}_${now.getFullYear()}.pdf`;

    return { blob, filename, pixPayload, base64 };
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Builds HTML template for billing email marketing
 */
export function buildBillingEmailHtml({
  clientName,
  valor,
  vencimento,
  servicoNome,
}: {
  clientName: string;
  valor: string;
  vencimento: string;
  servicoNome: string;
}): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
        .wrapper { width: 100%; padding: 40px 10px; background-color: #f1f5f9; }
        .container { max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 24px rgba(1, 28, 91, 0.06); }
        .body { padding: 40px 32px 32px 32px; text-align: center; }
        .greeting { font-size: 20px; font-weight: 500; color: #0f172a; margin: 0; text-transform: lowercase; }
        .client-name { font-size: 28px; font-weight: 900; color: #0055ff; margin: 6px 0 28px 0; }
        .footer-url { text-align: center; padding: 24px 0 16px 0; }
        .footer-url a { font-size: 13px; font-weight: 800; color: #0055ff; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #011c5b 0%, #0055ff 100%); padding: 24px 28px; border-radius: 24px 24px 0 0;">
            <tr>
              <td style="color: #ffffff; font-size: 22px; font-weight: 900; letter-spacing: -0.5px;">
                nx. <span style="font-weight: 400; font-size: 18px;">financeiro</span>
              </td>
              <td align="right">
                <div style="display: inline-block; width: 34px; height: 34px; border: 2px solid #ffffff; border-radius: 50%; color: #ffffff; text-align: center; line-height: 32px; font-size: 17px; font-weight: 900;">
                  $
                </div>
              </td>
            </tr>
          </table>

          <div class="body">
            <p class="greeting">olá,</p>
            <h2 class="client-name">${clientName}</h2>

            <table align="center" cellpadding="0" cellspacing="0" style="width: 320px; margin: 0 auto; border: 1px solid #d0deff; border-radius: 20px; overflow: hidden; border-collapse: separate;">
              <tr>
                <td style="background: #ffffff; padding: 24px 16px 16px 16px; text-align: center; border-radius: 20px 20px 0 0;">
                  <div style="font-size: 13px; font-weight: 800; color: #0f172a;">segue sua fatura Nexo no valor de:</div>
                  <div style="font-size: 34px; font-weight: 900; color: #0055ff; margin: 12px 0 6px 0;">R$ ${valor}</div>
                  <div style="font-size: 13px; font-weight: 600; color: #475569;">com vencimento em ${vencimento}</div>
                  <div style="font-size: 12px; font-weight: 900; color: #0f172a; margin-top: 4px;">boleto em anexo</div>
                </td>
              </tr>
              <tr>
                <td style="background: #0055ff; padding: 16px 16px; text-align: center; border-radius: 0 0 20px 20px;">
                  <div style="font-size: 11px; color: #d0deff;">serviço:</div>
                  <div style="font-size: 14px; font-weight: 900; color: #ffffff; margin-top: 2px;">${servicoNome}</div>
                </td>
              </tr>
            </table>

            <div class="footer-url">
              <a href="https://nexobrasil.net" target="_blank">nexobrasil.net</a>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Backend dispatch function for sending billing boleto via email.
 * Configured with sender alex@nexobrasil.net and real PDF attachment.
 */
export async function sendBoletoByEmailBackend(
  client: ClientSubscription,
  config: {
    pixKey: string;
    bankInfo?: string;
    daysBeforeDue?: number;
    customMessage?: string;
    senderEmail?: string;
  }
): Promise<{ success: boolean; message: string; method?: "edge" | "mailto" }> {
  if (!client.email) {
    throw new Error(`O cliente ${client.nome} não possui e-mail cadastrado.`);
  }
  const pixKey = requirePixKey(config.pixKey);

  // Generate payload details
  const now = new Date();
  const vencimentoStr =
    client.tipoCobranca === "avulsa" && client.dataVencimentoAvulsa
      ? new Date(client.dataVencimentoAvulsa).toLocaleDateString("pt-BR")
      : `${String(client.diaVencimento || 10).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  const numDoc = `FAT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;
  const pixPayload = generatePixBRCode({
    pixKey,
    merchantName: "NEXO AGENCIA PUBLICIDADE",
    merchantCity: "SAO PAULO",
    amount: client.valorMensal || 0,
    txid: numDoc.replace(/[^a-zA-Z0-9]/g, ""),
  });

  const subject = "Fatura de cobrança - Nexo Soluções Visuais";
  const nomeCliente = client.nome_empresarial || client.nome || "Cliente";
  const valorFormatado = (client.valorMensal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  const servicoNome = client.plano || "Pack House Mix Total";

  // Generate PDF attachment in base64 & Blob
  let pdfBase64 = "";
  let pdfBlob: Blob | null = null;
  let pdfFilename = `Boleto_Nexo_${nomeCliente.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

  try {
    const pdfRes = await generateBoletoPdfBlob(client, config);
    pdfBase64 = pdfRes.base64;
    pdfFilename = pdfRes.filename;
    pdfBlob = pdfRes.blob;
  } catch (err) {
    console.warn("Erro ao gerar base64 do PDF para anexo:", err);
  }

  // Resend stays on the server; no API key is read from client storage or sent by the browser.
  let edgeSuccess = false;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const res = await supabase.functions.invoke("send-billing-email", {
      body: {
        to: client.email,
        from: "Nexo Soluções Visuais <alex@nexobrasil.net>",
        subject,
        clientName: nomeCliente,
        valor: valorFormatado,
        vencimento: vencimentoStr,
        servicoNome,
        pixKey,
        pixPayload,
        numDoc,
        pdfBase64,
        pdfFilename,
      },
    });

    if (!res?.error && res?.data?.success) {
      edgeSuccess = true;
    }
  } catch (e) {
    console.warn("Edge function not available, proceeding to the email-client fallback:", e);
  }

  // 2. If Edge function succeeded
  if (edgeSuccess) {
    logEmailDispatch(client, vencimentoStr, numDoc, subject);
    return {
      success: true,
      method: "edge",
      message: `Fatura ${numDoc} com boleto em anexo enviada para ${client.email}!`,
    };
  }

  // If the backend is unavailable, download the PDF and open the default email client.
  if (pdfBlob) {
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = pdfFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const mailtoBody = encodeURIComponent(
    `Olá ${nomeCliente},\n\nSegue sua fatura Nexo Soluções Visuais no valor de R$ ${valorFormatado} com vencimento em ${vencimentoStr}.\n\nServiço: ${servicoNome}\nIdentificador: ${numDoc}\n\nChave PIX: ${pixKey}\nPIX Copia e Cola:\n${pixPayload}\n\nO arquivo PDF do boleto bancário foi baixado em seu computador e está pronto para ser anexado.\n\nAtenciosamente,\nNexo Soluções Visuais\nalex@nexobrasil.net`
  );

  const mailtoUrl = `mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${mailtoBody}`;
  window.open(mailtoUrl, "_blank");

  logEmailDispatch(client, vencimentoStr, numDoc, subject);

  return {
    success: true,
    method: "mailto",
    message: `Boleto PDF baixado! E-mail de cobrança para ${client.email} aberto no seu aplicativo padrão.`,
  };
}

function logEmailDispatch(client: ClientSubscription, vencimentoStr: string, numDoc: string, subject: string) {
  try {
    const historyKey = "nexo_email_dispatch_logs";
    const currentLogs = JSON.parse(localStorage.getItem(historyKey) || "[]");
    currentLogs.unshift({
      timestamp: new Date().toISOString(),
      clientId: client.user_id,
      clientName: client.nome,
      clientEmail: client.email,
      amount: client.valorMensal,
      vencimento: vencimentoStr,
      numDoc,
      subject,
      status: "sent",
    });
    localStorage.setItem(historyKey, JSON.stringify(currentLogs.slice(0, 100)));
  } catch {
    /* ignore storage fail */
  }
}
