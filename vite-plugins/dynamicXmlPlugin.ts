import type { Plugin } from "vite";
import fs from "fs";
import path from "path";

// Helper to get Brasilia date and time
function getBrasiliaDateTime(): { today: string; currentTime: string } {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";
    const today = `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
    const currentTime = `${getPart("hour")}:${getPart("minute")}`;
    return { today, currentTime };
  } catch {
    const now = new Date(Date.now() - 3 * 3600 * 1000);
    return {
      today: now.toISOString().slice(0, 10),
      currentTime: now.toISOString().slice(11, 16),
    };
  }
}

function escapeXml(str: any): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isScheduleActive(
  itemDate: string,
  startTime: string,
  endTime: string,
  targetDate: string,
  targetTime: string
): boolean {
  if (!itemDate || !startTime || !endTime) return false;
  if (itemDate !== targetDate) return false;
  const start = startTime.slice(0, 5);
  const end = endTime.slice(0, 5);
  if (start <= end) {
    return targetTime >= start && targetTime <= end;
  }
  return targetTime >= start || targetTime <= end;
}

function buildEnqueteXml(enquete?: any): string {
  if (!enquete || !enquete.pergunta) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <enquete>
    <pergunta></pergunta>
    <resposta1></resposta1>
    <resposta2></resposta2>
    <resposta3></resposta3>
    <resposta4></resposta4>
  </enquete>
</items>
`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <enquete>
    <pergunta>${escapeXml(enquete.pergunta)}</pergunta>
    <resposta1>${escapeXml(enquete.resposta1)}</resposta1>
    <resposta2>${escapeXml(enquete.resposta2)}</resposta2>
    <resposta3>${escapeXml(enquete.resposta3 || "")}</resposta3>
    <resposta4>${escapeXml(enquete.resposta4 || "")}</resposta4>
    <resposta_correta>${escapeXml(enquete.resposta_correta || 1)}</resposta_correta>
    <horario_inicio>${escapeXml(enquete.horario_inicio || "")}</horario_inicio>
    <horario_fim>${escapeXml(enquete.horario_fim || "")}</horario_fim>
  </enquete>
</items>
`;
}

function buildQuizXml(quiz?: any): string {
  if (!quiz || !quiz.pergunta) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <dados>
    <pergunta></pergunta>
    <resposta1></resposta1>
    <resposta2></resposta2>
    <resposta3></resposta3>
    <resposta4></resposta4>
    <resposta_correta></resposta_correta>
    <resposta_correta_texto></resposta_correta_texto>
    <horario_inicio></horario_inicio>
    <horario_fim></horario_fim>
    <explicacao></explicacao>
    <imagem_resposta></imagem_resposta>
  </dados>
</items>
`;
  }
  const corretaNum = Number(quiz.resposta_correta) || 1;
  const corretaTexto =
    corretaNum === 1
      ? quiz.resposta1
      : corretaNum === 2
      ? quiz.resposta2
      : corretaNum === 3
      ? quiz.resposta3
      : quiz.resposta4;

  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <dados>
    <pergunta>${escapeXml(quiz.pergunta)}</pergunta>
    <resposta1>${escapeXml(quiz.resposta1)}</resposta1>
    <resposta2>${escapeXml(quiz.resposta2)}</resposta2>
    <resposta3>${escapeXml(quiz.resposta3 || "")}</resposta3>
    <resposta4>${escapeXml(quiz.resposta4 || "")}</resposta4>
    <resposta_correta>${escapeXml(quiz.resposta_correta || 1)}</resposta_correta>
    <resposta_correta_texto>${escapeXml(corretaTexto || "")}</resposta_correta_texto>
    <horario_inicio>${escapeXml(quiz.horario_inicio || "")}</horario_inicio>
    <horario_fim>${escapeXml(quiz.horario_fim || "")}</horario_fim>
    <explicacao>${escapeXml(quiz.explicacao || "")}</explicacao>
    <imagem_resposta>${escapeXml(quiz.imagem_resposta || "")}</imagem_resposta>
  </dados>
</items>
`;
}

function buildBatalhaXml(batalha?: any): string {
  if (!batalha || (!batalha.artista1_nome && !batalha.artista2_nome)) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <batalha>
    <artista1_nome></artista1_nome>
    <artista1_musica></artista1_musica>
    <artista1_porcentagem>0%</artista1_porcentagem>
    <artista1_imagem></artista1_imagem>
    <artista2_nome></artista2_nome>
    <artista2_musica></artista2_musica>
    <artista2_porcentagem>0%</artista2_porcentagem>
    <artista2_imagem></artista2_imagem>
  </batalha>
</items>
`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <batalha>
    <artista1_nome>${escapeXml(batalha.artista1_nome)}</artista1_nome>
    <artista1_musica>${escapeXml(batalha.artista1_musica)}</artista1_musica>
    <artista1_porcentagem>${escapeXml(batalha.artista1_porcentagem ?? 50)}%</artista1_porcentagem>
    <artista1_imagem>${escapeXml(batalha.artista1_imagem || "")}</artista1_imagem>
    <artista2_nome>${escapeXml(batalha.artista2_nome)}</artista2_nome>
    <artista2_musica>${escapeXml(batalha.artista2_musica)}</artista2_musica>
    <artista2_porcentagem>${escapeXml(batalha.artista2_porcentagem ?? 50)}%</artista2_porcentagem>
    <artista2_imagem>${escapeXml(batalha.artista2_imagem || "")}</artista2_imagem>
    <horario_inicio>${escapeXml(batalha.horario_inicio || "")}</horario_inicio>
    <horario_fim>${escapeXml(batalha.horario_fim || "")}</horario_fim>
  </batalha>
</items>
`;
}

const SLUG_MAP: Record<string, string> = {
  positiva: "positivafm",
  p: "positivafm",
  "d17e65af-e407-466f-9b60-b55c43399513": "positivafm",
  interativa: "interativafm",
  "b2f70324-d086-4a5d-a407-cbc4acf98dce": "interativafm",
  jornal: "transmissao",
  "48423cc6-f3b1-4bea-8729-dd0ae76a89c3": "transmissao",
  cultura: "culturafm973",
  "66337743-4e4f-4950-b58f-750b0c76861e": "culturafm973",
  superadmin: "alex",
  "29b1107b-3eb0-4eb3-a7f8-d9ca93be24b5": "alex",
};

function normalizeSlug(slug: string): string {
  const clean = (slug || "").toLowerCase().trim();
  return SLUG_MAP[clean] || clean;
}

export function dynamicXmlPlugin(): Plugin {
  const rootDir = process.cwd();
  const enquetesFile = path.join(rootDir, "src", "data", "xml_enquetes_sync.json");
  const quizzesFile = path.join(rootDir, "src", "data", "xml_quizzes_sync.json");
  const batalhasFile = path.join(rootDir, "src", "data", "xml_batalhas_sync.json");

  function readSyncData(filePath: string): Record<string, any[]> {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
      }
    } catch {}
    return {};
  }

  function writeSyncData(filePath: string, data: Record<string, any[]>) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("Error writing sync file:", filePath, err);
    }
  }

  function writeStaticXml(slug: string, filename: string, content: string) {
    try {
      const dir = path.join(rootDir, "public", "xml", slug);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), content.trim() + "\n", "utf-8");
    } catch {}
  }

  return {
    name: "vite-plugin-dynamic-xml",
    configureServer(server) {
      // 1. POST /api/sync-xml-enquete
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "";
        if (req.method === "POST" && url.startsWith("/api/sync-xml-enquete")) {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              const slug = normalizeSlug(parsed.slug || "positivafm");
              const userId = parsed.userId || slug;
              const enquetes = Array.isArray(parsed.enquetes) ? parsed.enquetes : [];

              const store = readSyncData(enquetesFile);
              store[slug] = enquetes;
              if (userId) store[userId] = enquetes;
              writeSyncData(enquetesFile, store);

              // Update static file on disk immediately
              const { today, currentTime } = getBrasiliaDateTime();
              const active = enquetes.find((e: any) =>
                isScheduleActive(e.data_enquete, e.horario_inicio, e.horario_fim, today, currentTime)
              );
              const xml = buildEnqueteXml(active);
              writeStaticXml(slug, "enquete.xml", xml);

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true, count: enquetes.length, active: !!active }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }

        // 2. POST /api/sync-xml-quiz
        if (req.method === "POST" && url.startsWith("/api/sync-xml-quiz")) {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              const slug = normalizeSlug(parsed.slug || "positivafm");
              const userId = parsed.userId || slug;
              const quizzes = Array.isArray(parsed.quizzes) ? parsed.quizzes : [];

              const store = readSyncData(quizzesFile);
              store[slug] = quizzes;
              if (userId) store[userId] = quizzes;
              writeSyncData(quizzesFile, store);

              // Update static file on disk immediately
              const { today, currentTime } = getBrasiliaDateTime();
              const active = quizzes.find((q: any) =>
                isScheduleActive(q.data_quiz, q.horario_inicio, q.horario_fim, today, currentTime)
              );
              const xml = buildQuizXml(active);
              writeStaticXml(slug, "quiz.xml", xml);

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true, count: quizzes.length, active: !!active }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }

        // 3. POST /api/sync-xml-batalha
        if (req.method === "POST" && url.startsWith("/api/sync-xml-batalha")) {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              const slug = normalizeSlug(parsed.slug || "positivafm");
              const userId = parsed.userId || slug;
              const batalhas = Array.isArray(parsed.batalhas) ? parsed.batalhas : [];

              const store = readSyncData(batalhasFile);
              store[slug] = batalhas;
              if (userId) store[userId] = batalhas;
              writeSyncData(batalhasFile, store);

              // Update static file on disk immediately
              const { today, currentTime } = getBrasiliaDateTime();
              const active = batalhas.find((b: any) =>
                isScheduleActive(b.data_batalha, b.horario_inicio, b.horario_fim, today, currentTime)
              );
              const xml = buildBatalhaXml(active);
              writeStaticXml(slug, "batalha.xml", xml);

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true, count: batalhas.length, active: !!active }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }

        // 4. Intercept GET requests for enquete.xml, quiz.xml, batalha.xml, and geral.xml
        if (req.method === "GET") {
          const cleanUrl = url.split("?")[0];
          const matchEnquete = cleanUrl.match(/^(?:\/xml)?\/([^/]+)\/enquete\.xml$/i);
          const matchQuiz = cleanUrl.match(/^(?:\/xml)?\/([^/]+)\/quiz\.xml$/i);
          const matchBatalha = cleanUrl.match(/^(?:\/xml)?\/([^/]+)\/batalha\.xml$/i);
          const matchGeral = cleanUrl.match(/^(?:\/xml)?\/([^/]+)\/geral\.xml$/i);

          if (matchEnquete) {
            const rawSlug = matchEnquete[1];
            const slug = normalizeSlug(rawSlug);
            const { today, currentTime } = getBrasiliaDateTime();

            const store = readSyncData(enquetesFile);
            const list = store[slug] || store[rawSlug] || [];
            const active = list.find((e: any) =>
              isScheduleActive(e.data_enquete, e.horario_inicio, e.horario_fim, today, currentTime)
            );

            const xml = buildEnqueteXml(active);
            writeStaticXml(slug, "enquete.xml", xml);

            res.setHeader("Content-Type", "application/xml; charset=utf-8");
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(xml);
            return;
          }

          if (matchQuiz) {
            const rawSlug = matchQuiz[1];
            const slug = normalizeSlug(rawSlug);
            const { today, currentTime } = getBrasiliaDateTime();

            const store = readSyncData(quizzesFile);
            const list = store[slug] || store[rawSlug] || [];
            const active = list.find((q: any) =>
              isScheduleActive(q.data_quiz, q.horario_inicio, q.horario_fim, today, currentTime)
            );

            const xml = buildQuizXml(active);
            writeStaticXml(slug, "quiz.xml", xml);

            res.setHeader("Content-Type", "application/xml; charset=utf-8");
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(xml);
            return;
          }

          if (matchBatalha) {
            const rawSlug = matchBatalha[1];
            const slug = normalizeSlug(rawSlug);
            const { today, currentTime } = getBrasiliaDateTime();

            const store = readSyncData(batalhasFile);
            const list = store[slug] || store[rawSlug] || [];
            const active = list.find((b: any) =>
              isScheduleActive(b.data_batalha, b.horario_inicio, b.horario_fim, today, currentTime)
            );

            const xml = buildBatalhaXml(active);
            writeStaticXml(slug, "batalha.xml", xml);

            res.setHeader("Content-Type", "application/xml; charset=utf-8");
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(xml);
            return;
          }

          if (matchGeral) {
            const rawSlug = matchGeral[1];
            const slug = normalizeSlug(rawSlug);
            const { today, currentTime } = getBrasiliaDateTime();

            const enqStore = readSyncData(enquetesFile);
            const enqList = enqStore[slug] || enqStore[rawSlug] || [];
            const activeEnq = enqList.find((e: any) =>
              isScheduleActive(e.data_enquete, e.horario_inicio, e.horario_fim, today, currentTime)
            );

            const quizStore = readSyncData(quizzesFile);
            const quizList = quizStore[slug] || quizStore[rawSlug] || [];
            const activeQuiz = quizList.find((q: any) =>
              isScheduleActive(q.data_quiz, q.horario_inicio, q.horario_fim, today, currentTime)
            );

            const batStore = readSyncData(batalhasFile);
            const batList = batStore[slug] || batStore[rawSlug] || [];
            const activeBat = batList.find((b: any) =>
              isScheduleActive(b.data_batalha, b.horario_inicio, b.horario_fim, today, currentTime)
            );

            // Read base geral.xml from disk if exists
            const geralPath = path.join(rootDir, "public", "xml", slug, "geral.xml");
            let geralXml = "";
            if (fs.existsSync(geralPath)) {
              geralXml = fs.readFileSync(geralPath, "utf-8");
            }

            if (geralXml) {
              // Inject active enquete
              const enqueteBlock = activeEnq
                ? `<enquete ativa="1">
      <pergunta>${escapeXml(activeEnq.pergunta)}</pergunta>
      <opcao_a>${escapeXml(activeEnq.resposta1)}</opcao_a>
      <votos_a>0</votos_a>
      <opcao_b>${escapeXml(activeEnq.resposta2)}</opcao_b>
      <votos_b>0</votos_b>
      <resposta1>${escapeXml(activeEnq.resposta1)}</resposta1>
      <resposta2>${escapeXml(activeEnq.resposta2)}</resposta2>
      <resposta3>${escapeXml(activeEnq.resposta3 || "")}</resposta3>
      <resposta4>${escapeXml(activeEnq.resposta4 || "")}</resposta4>
    </enquete>`
                : `<enquete ativa="0"></enquete>`;

              geralXml = geralXml.replace(/<enquete[\s\S]*?<\/enquete>/i, enqueteBlock);

              // Inject active quiz
              const corretaNum = Number(activeQuiz?.resposta_correta) || 1;
              const corretaTexto =
                corretaNum === 1
                  ? activeQuiz?.resposta1
                  : corretaNum === 2
                  ? activeQuiz?.resposta2
                  : corretaNum === 3
                  ? activeQuiz?.resposta3
                  : activeQuiz?.resposta4;

              const quizBlock = activeQuiz
                ? `<quiz ativo="1">
      <pergunta>${escapeXml(activeQuiz.pergunta)}</pergunta>
      <alternativa_a>${escapeXml(activeQuiz.resposta1)}</alternativa_a>
      <alternativa_b>${escapeXml(activeQuiz.resposta2)}</alternativa_b>
      <alternativa_c>${escapeXml(activeQuiz.resposta3 || "")}</alternativa_c>
      <alternativa_d>${escapeXml(activeQuiz.resposta4 || "")}</alternativa_d>
      <resposta1>${escapeXml(activeQuiz.resposta1)}</resposta1>
      <resposta2>${escapeXml(activeQuiz.resposta2)}</resposta2>
      <resposta3>${escapeXml(activeQuiz.resposta3 || "")}</resposta3>
      <resposta4>${escapeXml(activeQuiz.resposta4 || "")}</resposta4>
      <resposta_correta>${escapeXml(activeQuiz.resposta_correta || 1)}</resposta_correta>
      <resposta_correta_texto>${escapeXml(corretaTexto || "")}</resposta_correta_texto>
      <horario_inicio>${escapeXml(activeQuiz.horario_inicio || "")}</horario_inicio>
      <horario_fim>${escapeXml(activeQuiz.horario_fim || "")}</horario_fim>
      <explicacao>${escapeXml(activeQuiz.explicacao || "")}</explicacao>
      <imagem_resposta>${escapeXml(activeQuiz.imagem_resposta || "")}</imagem_resposta>
    </quiz>`
                : `<quiz ativo="0"></quiz>`;

              geralXml = geralXml.replace(/<quiz[\s\S]*?<\/quiz>/i, quizBlock);

              // Inject active batalha
              const batalhaBlock = activeBat
                ? `<batalha ativa="1">
      <titulo>Batalha Musical</titulo>
      <musica_a>
        <nome>${escapeXml(activeBat.artista1_musica || "")}</nome>
        <artista>${escapeXml(activeBat.artista1_nome || "")}</artista>
        <votos>0</votos>
        <porcentagem>${escapeXml(activeBat.artista1_porcentagem ?? 50)}%</porcentagem>
        <capa_url>${escapeXml(activeBat.artista1_imagem || "")}</capa_url>
      </musica_a>
      <musica_b>
        <nome>${escapeXml(activeBat.artista2_musica || "")}</nome>
        <artista>${escapeXml(activeBat.artista2_nome || "")}</artista>
        <votos>0</votos>
        <porcentagem>${escapeXml(activeBat.artista2_porcentagem ?? 50)}%</porcentagem>
        <capa_url>${escapeXml(activeBat.artista2_imagem || "")}</capa_url>
      </musica_b>
      <artista1_nome>${escapeXml(activeBat.artista1_nome || "")}</artista1_nome>
      <artista1_musica>${escapeXml(activeBat.artista1_musica || "")}</artista1_musica>
      <artista1_porcentagem>${escapeXml(activeBat.artista1_porcentagem ?? 50)}%</artista1_porcentagem>
      <artista1_imagem>${escapeXml(activeBat.artista1_imagem || "")}</artista1_imagem>
      <artista2_nome>${escapeXml(activeBat.artista2_nome || "")}</artista2_nome>
      <artista2_musica>${escapeXml(activeBat.artista2_musica || "")}</artista2_musica>
      <artista2_porcentagem>${escapeXml(activeBat.artista2_porcentagem ?? 50)}%</artista2_porcentagem>
      <artista2_imagem>${escapeXml(activeBat.artista2_imagem || "")}</artista2_imagem>
      <horario_inicio>${escapeXml(activeBat.horario_inicio || "")}</horario_inicio>
      <horario_fim>${escapeXml(activeBat.horario_fim || "")}</horario_fim>
    </batalha>`
                : `<batalha ativa="0"></batalha>`;

              geralXml = geralXml.replace(/<batalha[\s\S]*?<\/batalha>/i, batalhaBlock);

              res.setHeader("Content-Type", "application/xml; charset=utf-8");
              res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(geralXml);
              return;
            }
          }
        }

        next();
      });
    },
  };
}
