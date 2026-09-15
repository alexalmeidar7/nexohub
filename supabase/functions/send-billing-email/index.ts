import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      to,
      subject = "Fatura de cobrança - Nexo Soluções Visuais",
      clientName,
      valor,
      vencimento,
      servicoNome = "Pack House Mix Total",
      pixKey = "13.130.809/0001-80",
      pixPayload,
      numDoc,
      pdfBase64,
      pdfFilename,
      resendApiKey: customResendKey,
    } = await req.json();

    if (!to) {
      return new Response(JSON.stringify({ success: false, error: "E-mail de destino é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendApiKey = customResendKey || Deno.env.get("RESEND_API_KEY");

    // Email Marketing Template matching Image 3 faithfully
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
          .wrapper { width: 100%; padding: 40px 10px; background-color: #f1f5f9; }
          .container { max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 24px rgba(1, 28, 91, 0.06); }
          .header { background: linear-gradient(135deg, #011c5b 0%, #0055ff 100%); padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; border-radius: 24px 24px 0 0; }
          .logo-text { color: #ffffff; font-size: 22px; font-weight: 900; letter-spacing: -0.5px; }
          .logo-sub { font-weight: 400; font-size: 18px; margin-left: 4px; }
          .circle-icon { width: 36px; height: 36px; border: 2px solid #ffffff; border-radius: 50%; color: #ffffff; text-align: center; line-height: 34px; font-size: 18px; font-weight: bold; }
          .body { padding: 40px 32px 32px 32px; text-align: center; }
          .greeting { font-size: 20px; font-weight: 500; color: #0f172a; margin: 0; text-transform: lowercase; }
          .client-name { font-size: 28px; font-weight: 900; color: #0055ff; margin: 6px 0 28px 0; }
          .card { max-width: 340px; margin: 0 auto; border: 1px solid #d0deff; border-radius: 20px; overflow: hidden; }
          .card-top { background: #ffffff; padding: 24px 16px 16px 16px; text-align: center; }
          .card-label { font-size: 13px; font-weight: 800; color: #0f172a; margin: 0; }
          .card-val { font-size: 34px; font-weight: 900; color: #0055ff; margin: 12px 0 6px 0; }
          .card-due { font-size: 13px; font-weight: 600; color: #475569; margin: 0; }
          .card-attach { font-size: 12px; font-weight: 800; color: #0f172a; margin: 4px 0 0 0; }
          .card-bottom { background: #0055ff; padding: 16px 16px; text-align: center; }
          .serv-label { font-size: 11px; color: #d0deff; margin: 0; text-transform: lowercase; }
          .serv-name { font-size: 14px; font-weight: 900; color: #ffffff; margin: 2px 0 0 0; }
          .footer-url { text-align: center; padding: 24px 0 16px 0; }
          .footer-url a { font-size: 13px; font-weight: 800; color: #0055ff; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <!-- HEADER -->
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

            <!-- BODY -->
            <div class="body">
              <p class="greeting">olá,</p>
              <h2 class="client-name">${clientName || "Cliente"}</h2>

              <!-- CENTER CARD -->
              <table align="center" cellpadding="0" cellspacing="0" style="width: 320px; margin: 0 auto; border: 1px solid #d0deff; border-radius: 20px; overflow: hidden; border-collapse: separate;">
                <tr>
                  <td style="background: #ffffff; padding: 24px 16px 16px 16px; text-align: center; border-radius: 20px 20px 0 0;">
                    <div style="font-size: 13px; font-weight: 800; color: #0f172a;">segue sua fatura Nexo no valor de:</div>
                    <div style="font-size: 34px; font-weight: 900; color: #0055ff; margin: 12px 0 6px 0;">R$ ${valor || "0,00"}</div>
                    <div style="font-size: 13px; font-weight: 600; color: #475569;">com vencimento em ${vencimento || ""}</div>
                    <div style="font-size: 12px; font-weight: 900; color: #0f172a; margin-top: 4px;">boleto em anexo</div>
                  </td>
                </tr>
                <tr>
                  <td style="background: #0055ff; padding: 16px 16px; text-align: center; border-radius: 0 0 20px 20px;">
                    <div style="font-size: 11px; color: #d0deff;">serviço:</div>
                    <div style="font-size: 14px; font-weight: 900; color: #ffffff; margin-top: 2px;">${servicoNome || "Pack House Mix Total"}</div>
                  </td>
                </tr>
              </table>

              <!-- FOOTER URL -->
              <div class="footer-url">
                <a href="https://nexobrasil.net" target="_blank">nexobrasil.net</a>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Resend payload with attachment
    const attachments = pdfBase64
      ? [
          {
            filename: pdfFilename || `Boleto_Nexo_${numDoc || "FAT"}.pdf`,
            content: pdfBase64,
          },
        ]
      : [];

    if (resendApiKey) {
      // 1. Try sending from official alex@nexobrasil.net
      let resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Nexo Soluções Visuais <alex@nexobrasil.net>",
          reply_to: "alex@nexobrasil.net",
          to: [to],
          subject: subject,
          html: emailHtml,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      });

      let resendData = await resendRes.json();

      // If failed due to unverified domain, fallback to onboarding@resend.dev with reply_to alex@nexobrasil.net
      if (!resendRes.ok && (resendData?.message?.toLowerCase().includes("domain") || resendRes.status === 403)) {
        resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Nexo Soluções Visuais <onboarding@resend.dev>",
            reply_to: "alex@nexobrasil.net",
            to: [to],
            subject: subject,
            html: emailHtml,
            attachments: attachments.length > 0 ? attachments : undefined,
          }),
        });
        resendData = await resendRes.json();
      }

      if (!resendRes.ok) {
        return new Response(
          JSON.stringify({
            success: false,
            error: resendData.message || resendData.name || "Falha no envio pelo Resend",
            details: resendData,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(JSON.stringify({ success: true, resend: resendData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No Resend API key configured
    return new Response(
      JSON.stringify({
        success: false,
        no_api_key: true,
        error: "Chave de API do provedor de e-mail (Resend) não configurada.",
        message: "Para enviar e-mails reais diretamente aos clientes, configure sua chave do Resend na aba 'Disparo Automático' das configurações do Financeiro.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
