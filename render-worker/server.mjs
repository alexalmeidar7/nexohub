import express from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const app = express();
const port = Number(process.env.PORT || 8080);
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 300);
const renderTimeoutMs = Number(process.env.RENDER_TIMEOUT_MS || 30 * 60 * 1000);
const appOrigins = new Set(
  (process.env.APP_ORIGINS || "https://nexohub.lovable.app,https://lovable.dev,http://localhost:5173")
    .split(",").map((value) => value.trim()).filter(Boolean),
);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.warn("SUPABASE_URL / SUPABASE_ANON_KEY not configured; authenticated rendering will fail.");
}
const supabase = createClient(
  process.env.SUPABASE_URL || "https://example.supabase.co",
  process.env.SUPABASE_ANON_KEY || "missing-anon-key",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

app.disable("x-powered-by");
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && appOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

async function requireUser(req, res, next) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Sessão ausente. Entre novamente no NexoHub." });
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Sessão inválida ou expirada." });
    req.authUser = data.user;
    next();
  } catch (error) {
    console.error("Auth validation failed:", error);
    return res.status(503).json({ error: "Não foi possível validar a sessão agora." });
  }
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "nexohub-video-render", encoder: "ffmpeg-native" }));

const upload = multer({
  dest: path.join(os.tmpdir(), "nexohub-render-uploads"),
  limits: { fileSize: maxUploadMb * 1024 * 1024, files: 1 },
});

function encodeMp4(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner", "-y", "-i", inputPath,
      "-map", "0:v:0", "-map", "0:a?",
      "-c:v", "libx264", "-preset", "veryfast",
      "-b:v", "5000k", "-maxrate", "5000k", "-bufsize", "10000k",
      "-pix_fmt", "yuv420p", "-r", "30",
      "-c:a", "aac", "-b:a", "96k", "-ar", "48000",
      "-movflags", "+faststart", outputPath,
    ];
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderrTail = "";
    const timeout = setTimeout(() => child.kill("SIGKILL"), renderTimeoutMs);
    child.stderr.on("data", (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-6000);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Não foi possível iniciar o FFmpeg nativo: ${error.message}`));
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(signal === "SIGKILL" ? "O render excedeu o tempo máximo permitido." : `FFmpeg encerrou com código ${code}. ${stderrTail.slice(-1800)}`));
    });
  });
}

app.post("/render", requireUser, upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Envie o arquivo intermediário do vídeo." });
  const jobDir = path.join(os.tmpdir(), "nexohub-render-jobs", randomUUID());
  const inputPath = req.file.path;
  const outputPath = path.join(jobDir, "render.mp4");
  try {
    await mkdir(jobDir, { recursive: true });
    await encodeMp4(inputPath, outputPath);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", 'attachment; filename="nexohub-render.mp4"');
    res.setHeader("Cache-Control", "no-store");
    await pipeline(createReadStream(outputPath), res);
  } catch (error) {
    console.error(`Render failed for user ${req.authUser.id}:`, error);
    if (!res.headersSent) {
      const message = error instanceof Error ? error.message : "Falha desconhecida durante o render.";
      res.status(message.includes("tempo máximo") ? 408 : 500).json({ error: message });
    } else {
      res.destroy(error);
    }
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ error: status === 413 ? `Arquivo excede o limite de ${maxUploadMb} MB.` : "Upload inválido." });
  }
  console.error("Unhandled API error:", error);
  return res.status(500).json({ error: "Erro interno no serviço de render." });
});

await mkdir(path.join(os.tmpdir(), "nexohub-render-uploads"), { recursive: true });
app.listen(port, "0.0.0.0", () => console.log(`NexoHub native video render listening on ${port}`));
