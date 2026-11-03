import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://housemix.nexobrasil.net";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const entries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/home", changefreq: "weekly", priority: "0.9" },
  { path: "/telapromo", changefreq: "weekly", priority: "0.8" },
  { path: "/player", changefreq: "weekly", priority: "0.8" },
  { path: "/player/watch", changefreq: "weekly", priority: "0.7" },
  { path: "/player/catalog", changefreq: "weekly", priority: "0.7" },
  { path: "/player/app", changefreq: "weekly", priority: "0.7" },
  { path: "/telainterativatelao", changefreq: "weekly", priority: "0.7" },
  { path: "/cenario-tela", changefreq: "weekly", priority: "0.6" },
  { path: "/cenario-tela-full", changefreq: "weekly", priority: "0.6" },
  { path: "/vmix-control", changefreq: "monthly", priority: "0.5" },
  { path: "/intercom", changefreq: "monthly", priority: "0.5" },
  { path: "/tp-externo", changefreq: "monthly", priority: "0.5" },
  { path: "/reset-password", changefreq: "yearly", priority: "0.3" },
];

function generateSitemap(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n")
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

writeFileSync(resolve("public/sitemap.xml"), generateSitemap(entries));
console.log(`sitemap.xml written (${entries.length} entries)`);
