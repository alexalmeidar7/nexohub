// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client as FtpClient } from "npm:basic-ftp@5.0.5";
import { Readable } from "node:stream";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function escapeHtml(s: string) {
  return (s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]
  );
}

function renderIndexHtml(cfg: any, noticias: any[], banners: any[]) {
  const primary = cfg.cor_primaria || "#268ffa";
  const title = escapeHtml(cfg.site_nome || "Meu Site");
  const desc = escapeHtml(cfg.meta_description || cfg.site_descricao || "");
  const og = cfg.og_image_url || cfg.logo_url || "";
  const noticiasHtml = noticias.slice(0, 20).map((n) => `
    <article class="card">
      ${n.imagem_url ? `<img src="${escapeHtml(n.imagem_url)}" alt="${escapeHtml(n.titulo)}" loading="lazy" />` : ""}
      <div class="body">
        <h3>${escapeHtml(n.titulo)}</h3>
        <p>${escapeHtml(n.resumo || "")}</p>
      </div>
    </article>`).join("");

  const bannerTop = banners.find((b) => b.posicao === "topo");
  return `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${desc}" />
${cfg.meta_keywords ? `<meta name="keywords" content="${escapeHtml(cfg.meta_keywords)}" />` : ""}
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${desc}" />
${og ? `<meta property="og:image" content="${escapeHtml(og)}" />` : ""}
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
${cfg.favicon_url ? `<link rel="icon" href="${escapeHtml(cfg.favicon_url)}" />` : ""}
<style>
  :root{--p:${primary}}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;background:#fafafa}
  header{background:var(--p);color:#fff;padding:20px 24px;display:flex;align-items:center;gap:14px}
  header img{height:44px}
  header h1{margin:0;font-size:20px;font-weight:700}
  .banner{max-width:1200px;margin:16px auto;padding:0 16px}
  .banner img{width:100%;border-radius:10px;display:block}
  main{max-width:1200px;margin:24px auto;padding:0 16px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
  .card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  .card img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}
  .card .body{padding:12px 14px}
  .card h3{margin:0 0 6px;font-size:15px;line-height:1.3}
  .card p{margin:0;font-size:13px;color:#555;line-height:1.4}
  footer{text-align:center;padding:30px;color:#888;font-size:12px}
</style>
</head>
<body>
<header>
  ${cfg.logo_url ? `<img src="${escapeHtml(cfg.logo_url)}" alt="logo" />` : ""}
  <h1>${title}</h1>
</header>
${bannerTop ? `<div class="banner"><a href="${escapeHtml(bannerTop.link_url || "#")}"><img src="${escapeHtml(bannerTop.image_url)}" alt="${escapeHtml(bannerTop.nome)}" /></a></div>` : ""}
<main>
  ${noticiasHtml ? `<h2 style="margin:0 0 14px">Últimas notícias</h2><div class="grid">${noticiasHtml}</div>` : "<p>Sem notícias publicadas.</p>"}
</main>
<footer>© ${new Date().getFullYear()} ${title} · Publicado via Nexo</footer>
</body>
</html>`;
}

async function uploadViaFtp(cfg: any, files: { name: string; content: string }[]) {
  if (cfg.protocol === "sftp") {
    throw new Error("SFTP ainda não é suportado nesta versão. Use FTP ou FTPS.");
  }
  const client = new FtpClient(30000);
  client.ftp.verbose = false;
  let bytes = 0;
  try {
    await client.access({
      host: cfg.host,
      port: Number(cfg.port) || 21,
      user: cfg.username,
      password: cfg.password,
      secure: cfg.protocol === "ftps",
      secureOptions: { rejectUnauthorized: false },
    });
    if (cfg.remote_path && cfg.remote_path !== "/") {
      await client.ensureDir(cfg.remote_path);
    }
    for (const f of files) {
      const buf = Buffer.from(f.content, "utf-8");
      bytes += buf.length;
      await client.uploadFrom(Readable.from(buf), f.name);
    }
  } finally {
    client.close();
  }
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "publish";

    const { data: deployCfg } = await supabase
      .from("site_deploy_config")
      .select("*").eq("user_id", user.id).maybeSingle();
    if (!deployCfg?.host) {
      return new Response(JSON.stringify({ ok: false, error: "Configure o servidor primeiro." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "test") {
      const client = new FtpClient(15000);
      try {
        await client.access({
          host: deployCfg.host,
          port: Number(deployCfg.port) || 21,
          user: deployCfg.username,
          password: deployCfg.password,
          secure: deployCfg.protocol === "ftps",
          secureOptions: { rejectUnauthorized: false },
        });
        const list = await client.list();
        client.close();
        return new Response(JSON.stringify({ ok: true, entries: list.length }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e: any) {
        client.close();
        return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Publish
    const [cfgR, noticiasR, bannersR] = await Promise.all([
      supabase.from("site_config").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("site_noticias").select("*").eq("user_id", user.id).eq("publicado", true).order("created_at", { ascending: false }).limit(30),
      supabase.from("site_banners").select("*").eq("user_id", user.id).eq("ativo", true),
    ]);

    const html = renderIndexHtml(cfgR.data || {}, noticiasR.data || [], bannersR.data || []);
    const files = [{ name: "index.html", content: html }];

    let bytes = 0;
    try {
      bytes = await uploadViaFtp(deployCfg, files);
    } catch (e: any) {
      await supabase.from("site_deploy_history").insert({
        user_id: user.id, status: "error",
        message: String(e?.message || e).slice(0, 500),
        files_count: 0, bytes_sent: 0, duration_ms: Date.now() - started,
      });
      return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.from("site_deploy_history").insert({
      user_id: user.id, status: "success",
      message: `${files.length} arquivo(s) enviado(s)`,
      files_count: files.length, bytes_sent: bytes,
      duration_ms: Date.now() - started,
    });

    return new Response(JSON.stringify({ ok: true, files: files.length, bytes }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
