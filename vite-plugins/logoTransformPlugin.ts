import type { Plugin } from "vite";
import fs from "fs";
import path from "path";

interface SessionData {
  sessionId: string;
  originalBuffer: Buffer;
  originalMime: string;
  versions: Record<string, { buffer: Buffer; mime: string }>;
  createdAt: number;
}

const sessions = new Map<string, SessionData>();

// Helper to safely load OPENAI_API_KEY from environment or .env files
function getOpenAiApiKey(): string {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
    return process.env.OPENAI_API_KEY.trim();
  }

  // Check .env and .env.local
  const envFiles = [".env", ".env.local"];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, "utf8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const match = trimmed.match(/^OPENAI_API_KEY=(.+)$/);
          if (match && match[1]) {
            const val = match[1].trim().replace(/^["']|["']$/g, "");
            if (val) return val;
          }
        }
      } catch {}
    }
  }

  return "";
}

const TRANSFORM_PROMPT = `Use a logo enviada como referência obrigatória. Transforme-a em uma versão FLAT, branca e profissional, preservando rigorosamente a identidade visual original.

Preserve exatamente o desenho, geometria, proporções, símbolos, tipografia, espaçamento, espessura das linhas, contornos e detalhes da marca.

Transforme somente o tratamento visual.

A logo final deve ser:

* branca pura #FFFFFF
* FLAT
* limpa
* minimalista
* nítida
* com aparência vetorial profissional
* centralizada
* 1080 × 1080 pixels
* PNG
* RGBA
* fundo 100% transparente
* canal Alpha preservado

NÃO adicionar:

* 3D
* extrusão
* sombra
* brilho
* reflexos
* gradientes
* textura
* efeito metálico
* iluminação
* perspectiva
* profundidade
* elementos decorativos
* textos adicionais

NÃO alterar:

* letras
* tipografia
* símbolos
* geometria
* proporções
* identidade da marca

Não redesenhe criativamente a logo. Não simplifique detalhes importantes. Não invente elementos. A imagem original deve ser sempre a referência principal.

Nenhuma parte da logo pode ser cortada.`;

export function logoTransformPlugin(): Plugin {
  return {
    name: "vite-plugin-logo-transform",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === "/api/transform-logo" && req.method === "OPTIONS") {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.url === "/api/transform-logo" && req.method === "POST") {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });

          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}");
              const {
                originalDataUrl,
                sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                version = "version_01",
                isRetry = false,
              } = payload;

              // Ensure temp directory exists for session persistence
              const tempDir = path.resolve(process.cwd(), "tmp", "logo_transforms");
              if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
              }

              let session = sessions.get(sessionId);

              // 1. Process and save original image
              if (!session) {
                if (!originalDataUrl) {
                  res.writeHead(400);
                  res.end(JSON.stringify({ success: false, error: "Nenhuma imagem original enviada." }));
                  return;
                }

                const matches = originalDataUrl.match(/^data:([^;]+);base64,(.+)$/);
                const mime = matches ? matches[1] : "image/png";
                const base64Data = matches ? matches[2] : originalDataUrl;
                const buffer = Buffer.from(base64Data, "base64");

                session = {
                  sessionId,
                  originalBuffer: buffer,
                  originalMime: mime,
                  versions: {},
                  createdAt: Date.now(),
                };
                sessions.set(sessionId, session);

                // Save original to disk temporarily
                const origPath = path.join(tempDir, `${sessionId}_original.png`);
                fs.writeFileSync(origPath, buffer);
              }

              // Always use original buffer for transformation
              const originalBuf = session.originalBuffer;
              const apiKey = getOpenAiApiKey();

              if (!apiKey) {
                // If API key is not configured, inform clearly while providing helpful details
                res.writeHead(200);
                res.end(
                  JSON.stringify({
                    success: false,
                    error: "OPENAI_API_KEY não encontrada no backend (.env). Defina OPENAI_API_KEY no arquivo .env para processamento via OpenAI.",
                    code: "NO_API_KEY",
                    sessionId,
                    version,
                  })
                );
                return;
              }

              // Prepare multipart form-data for OpenAI image edits endpoint
              const formData = new FormData();
              const blob = new Blob([originalBuf], { type: "image/png" });
              formData.append("image", blob, "logo.png");
              formData.append("prompt", TRANSFORM_PROMPT);
              formData.append("model", "dall-e-2");
              formData.append("n", "1");
              formData.append("size", "1024x1024");

              // Call OpenAI API silently in the backend
              const openAiRes = await fetch("https://api.openai.com/v1/images/edits", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                },
                body: formData,
              });

              if (!openAiRes.ok) {
                const errJson: any = await openAiRes.json().catch(() => ({} as any));
                const errMsg = errJson?.error?.message || `Erro na API da OpenAI (Status ${openAiRes.status})`;
                console.warn("[LogoTransform] OpenAI API error:", errMsg);

                res.writeHead(200);
                res.end(
                  JSON.stringify({
                    success: false,
                    error: errMsg,
                    code: "OPENAI_API_ERROR",
                    sessionId,
                    version,
                  })
                );
                return;
              }

              const data: any = await openAiRes.json();
              let b64 = data?.data?.[0]?.b64_json;
              if (!b64 && data?.data?.[0]?.url) {
                const imgRes = await fetch(data.data[0].url);
                b64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
              }
              if (!b64) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, error: "A OpenAI não retornou a imagem processada." }));
                return;
              }

              const resultBuffer = Buffer.from(b64, "base64");
              session.versions[version] = { buffer: resultBuffer, mime: "image/png" };

              // Save version to disk temporarily
              const versionPath = path.join(tempDir, `${sessionId}_${version}.png`);
              fs.writeFileSync(versionPath, resultBuffer);

              res.writeHead(200);
              res.end(
                JSON.stringify({
                  success: true,
                  sessionId,
                  version,
                  imageBase64: `data:image/png;base64,${b64}`,
                  width: 1080,
                  height: 1080,
                  status: "APPROVED_CANDIDATE",
                })
              );
            } catch (err: any) {
              console.error("[LogoTransform] Server error:", err);
              res.writeHead(500);
              res.end(JSON.stringify({ success: false, error: err?.message || "Erro interno do servidor." }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}
