import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Download, Upload, Loader2, MessageSquareQuote, Tag, Image as ImageIcon,
  Swords, HelpCircle, DatabaseBackup,
} from "lucide-react";

const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const CARD_BG = "#D6F4FB";
const DARK = "#0A2540";
const FONT = "'Montserrat', sans-serif";

type DatasetId = "citacoes" | "promocoes" | "logos" | "batalha" | "enquete";

interface Programa { id: string; nome: string }

/* ---------------- helpers ---------------- */

const pad = (n: number) => String(n).padStart(2, "0");

const toBR = (iso?: string | null) => {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : String(iso);
};

const parseDate = (raw: unknown): string | null => {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    // Excel serial date
    const base = Date.UTC(1899, 11, 30) + raw * 86400000;
    const d = new Date(base);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(raw).trim();
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (br) return `${br[3]}-${pad(+br[2])}-${pad(+br[1])}`;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`;
  return null;
};

const parseTime = (raw: unknown, fallback: string): string => {
  if (raw === null || raw === undefined || raw === "") return fallback;
  if (typeof raw === "number") {
    const total = Math.round(raw * 24 * 60);
    return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
  }
  const m = String(raw).trim().match(/^(\d{1,2})\D(\d{2})/);
  return m ? `${pad(+m[1])}:${m[2]}` : fallback;
};

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

const sheetToBlob = (rows: Record<string, unknown>[], sheetName: string) => {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 30));
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
};

const readSheet = async (file: File): Promise<Record<string, unknown>[]> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
};

/** Reads a column tolerating accents/casing variations. */
const pick = (row: Record<string, unknown>, ...names: string[]) => {
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  const map = new Map(Object.keys(row).map((k) => [normalize(k), k]));
  for (const n of names) {
    const hit = map.get(normalize(n));
    if (hit !== undefined) return row[hit];
  }
  return "";
};

const safeFolder = (s: string) => (s || "Sem programa").replace(/[\\/:*?"<>|]/g, "-").slice(0, 60);

/* ---------------- UI atoms ---------------- */

const pillBtn = (bg: string, color: string): React.CSSProperties => ({
  height: 40,
  borderRadius: 999,
  padding: "0 18px",
  background: bg,
  color,
  border: "none",
  fontFamily: FONT,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 1,
  textTransform: "uppercase",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
});

/* ---------------- page ---------------- */

export default function BackupPage({ effectiveUserId }: { effectiveUserId?: string | null }) {
  const { user } = useAuth();
  const ownerId = effectiveUserId || user?.id || null;
  const { toast } = useToast();
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      const { data } = await supabase.from("programas").select("id,nome").eq("user_id", ownerId).order("nome");
      setProgramas((data || []) as Programa[]);
    })();
  }, [ownerId]);

  const programaNames = (ids?: string[] | null, legacy?: string | null) => {
    const list = (ids && ids.length ? ids : legacy ? [legacy] : []) as string[];
    return list.map((id) => programas.find((p) => p.id === id)?.nome).filter(Boolean).join(", ");
  };

  const idsFromNames = (raw: unknown) => {
    const wanted = str(raw).split(/[,;|]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const found: string[] = [];
    const missing: string[] = [];
    for (const w of wanted) {
      const p = programas.find((x) => x.nome.toLowerCase() === w);
      if (p) found.push(p.id); else missing.push(w);
    }
    return { found, missing };
  };

  const run = async (key: string, fn: () => Promise<string>) => {
    if (!ownerId) return;
    setBusy(key);
    try {
      const msg = await fn();
      setLog((l) => [msg, ...l].slice(0, 12));
      toast({ title: msg });
    } catch (e: any) {
      const msg = e?.message || "Falha na operação";
      setLog((l) => [`Erro: ${msg}`, ...l].slice(0, 12));
      toast({ title: "Não foi possível concluir", description: msg, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  /* ---------- Citações ---------- */

  const exportCitacoes = async () => {
    const { data, error } = await supabase.from("testemunhais")
      .select("texto,programa_id,programa_ids,data_inicio,data_fim")
      .eq("user_id", ownerId).order("data_inicio", { ascending: false });
    if (error) throw error;
    const rows = (data || []).map((r: any) => ({
      "Texto": String(r.texto || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
      "Programas": programaNames(r.programa_ids, r.programa_id),
      "Início": toBR(r.data_inicio),
      "Fim": toBR(r.data_fim),
    }));
    downloadBlob(sheetToBlob(rows, "Citações"), `citacoes-${Date.now()}.xlsx`);
    return `${rows.length} citações exportadas.`;
  };

  const importCitacoes = async (file: File) => {
    const rows = await readSheet(file);
    const payload: any[] = [];
    let skipped = 0;
    for (const row of rows) {
      const texto = str(pick(row, "Texto", "Citação"));
      const inicio = parseDate(pick(row, "Início", "Inicio", "Data início"));
      const fim = parseDate(pick(row, "Fim", "Data fim"));
      if (!texto || !inicio || !fim) { skipped++; continue; }
      const { found } = idsFromNames(pick(row, "Programas", "Programa"));
      payload.push({
        user_id: ownerId, texto, data_inicio: inicio, data_fim: fim,
        programa_ids: found, programa_id: found[0] || null,
      });
    }
    if (payload.length) {
      const { error } = await supabase.from("testemunhais").insert(payload);
      if (error) throw error;
    }
    return `${payload.length} citações importadas${skipped ? ` · ${skipped} linhas ignoradas` : ""}.`;
  };

  /* ---------- Promoções ---------- */

  const exportPromocoes = async () => {
    const { data, error } = await supabase.from("promocoes")
      .select("nome,texto,oferecimento,imagem_url,banner_l_url,botao_url,programa_ids,data_inicio,data_fim")
      .eq("user_id", ownerId).order("data_inicio", { ascending: false });
    if (error) throw error;
    const rows = (data || []).map((r: any) => ({
      "Nome": str(r.nome),
      "Texto": String(r.texto || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
      "Oferecimento": str(r.oferecimento),
      "banner": str(r.imagem_url),
      "banner L": str(r.banner_l_url),
      "Botão": str(r.botao_url),
      "Programas": programaNames(r.programa_ids),
      "Início": toBR(r.data_inicio),
      "Fim": toBR(r.data_fim),
    }));
    downloadBlob(sheetToBlob(rows, "Promoções"), `promocoes-${Date.now()}.xlsx`);
    return `${rows.length} promoções exportadas.`;
  };

  const importPromocoes = async (file: File) => {
    const rows = await readSheet(file);
    const payload: any[] = [];
    let skipped = 0;
    for (const row of rows) {
      const inicio = parseDate(pick(row, "Início", "Inicio"));
      const fim = parseDate(pick(row, "Fim"));
      const texto = str(pick(row, "Texto"));
      const nome = str(pick(row, "Nome"));
      if (!inicio || !fim || (!texto && !nome)) { skipped++; continue; }
      const { found } = idsFromNames(pick(row, "Programas", "Programa"));
      payload.push({
        user_id: ownerId,
        nome: nome || null,
        texto,
        oferecimento: str(pick(row, "Oferecimento")) || null,
        imagem_url: str(pick(row, "banner", "Banner", "Imagem")) || null,
        banner_l_url: str(pick(row, "banner L", "Banner L", "banner_l")) || null,
        botao_url: str(pick(row, "Botão", "Botao", "Botão (link)")) || null,
        programa_ids: found,
        data_inicio: inicio,
        data_fim: fim,
      });
    }
    if (payload.length) {
      const { error } = await supabase.from("promocoes").insert(payload);
      if (error) throw error;
    }
    return `${payload.length} promoções importadas${skipped ? ` · ${skipped} linhas ignoradas` : ""}.`;
  };

  /* ---------- Logos (ZIP) ---------- */

  const exportLogos = async () => {
    const jszipMod = await import("jszip");
    const JSZip = (jszipMod as any)?.default || jszipMod;
    const { data, error } = await supabase.from("logos_patrocinadores")
      .select("programa_id,logo_url,nome,data_final,ativo")
      .eq("user_id", ownerId).eq("excluido", false);
    if (error) throw error;
    const zip = new JSZip();
    const manifest: string[] = ["pasta;arquivo;nome;data_final;ativo"];
    let ok = 0;
    for (const l of (data || []) as any[]) {
      const folder = safeFolder(programas.find((p) => p.id === l.programa_id)?.nome || "Sem programa");
      const urlName = decodeURIComponent(String(l.logo_url || "").split("/").pop()?.split("?")[0] || "");
      const filename = urlName || `logo-${ok + 1}.png`;
      try {
        const res = await fetch(l.logo_url);
        if (!res.ok) throw new Error(String(res.status));
        zip.folder(folder)!.file(filename, await res.blob());
        manifest.push([folder, filename, str(l.nome), str(l.data_final), l.ativo ? "1" : "0"].join(";"));
        ok++;
      } catch {
        /* imagem indisponível — segue com as demais */
      }
    }
    zip.file("dados.csv", manifest.join("\n"));
    downloadBlob(await zip.generateAsync({ type: "blob" }), `logos-${Date.now()}.zip`);
    return `${ok} logos exportadas em pastas por programa.`;
  };

  const importLogos = async (file: File) => {
    const jszipMod = await import("jszip");
    const JSZip = (jszipMod as any)?.default || jszipMod;
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id;
    if (!uid) throw new Error("Sessão expirada. Entre novamente.");

    const zip = await JSZip.loadAsync(file);
    const meta = new Map<string, { nome: string; data_final: string; ativo: boolean }>();
    const csv = zip.file("dados.csv");
    if (csv) {
      const lines = (await csv.async("string")).split(/\r?\n/).slice(1);
      for (const line of lines) {
        const [pasta, arquivo, nome, dataFinal, ativo] = line.split(";");
        if (pasta && arquivo) meta.set(`${pasta}/${arquivo}`, { nome: nome || "", data_final: dataFinal || "", ativo: ativo !== "0" });
      }
    }

    const defaultFinal = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
    const entries = Object.values(zip.files).filter(
      (f: any) => !f.dir && /\.(png|jpe?g|webp|gif|svg)$/i.test(f.name) && f.name.includes("/")
    ) as any[];

    const payload: any[] = [];
    const unknownFolders = new Set<string>();
    const uploadedPaths: string[] = [];
    try {
    for (const entry of entries) {
      const parts = entry.name.split("/").filter(Boolean);
      const filename = parts.pop() as string;
      const folder = parts.pop() as string;
      const programa = programas.find((p) => safeFolder(p.nome).toLowerCase() === folder.toLowerCase());
      if (!programa) { unknownFolders.add(folder); continue; }

      const blob = await entry.async("blob");
      const ext = filename.split(".").pop() || "png";
      const path = `${uid}/logos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("comercial")
        .upload(path, blob, { upsert: true, contentType: blob.type || `image/${ext}` });
      if (upErr) throw upErr;
      uploadedPaths.push(path);
      const { data: pub } = supabase.storage.from("comercial").getPublicUrl(path);

      const info = meta.get(`${folder}/${filename}`);
      payload.push({
        user_id: ownerId,
        programa_id: programa.id,
        logo_url: pub.publicUrl,
        nome: info?.nome || filename.replace(/\.[^.]+$/, ""),
        data_final: parseDate(info?.data_final) || defaultFinal,
        ativo: info?.ativo ?? true,
        excluido: false,
      });
    }
    if (payload.length) {
      const { error } = await supabase.from("logos_patrocinadores").insert(payload);
      if (error) throw error;
    }
    } catch (error) {
      // Roll back uploaded files when the metadata insert fails, preventing
      // orphaned Storage objects after a partial ZIP import.
      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage.from("comercial").remove(uploadedPaths);
        if (cleanupError) console.warn("Falha ao limpar imagens após importação cancelada:", cleanupError);
      }
      throw error;
    }
    const extra = unknownFolders.size ? ` · pastas sem programa correspondente: ${[...unknownFolders].join(", ")}` : "";
    return `${payload.length} logos importadas${extra}.`;
  };

  /* ---------- Batalha ---------- */

  const exportBatalha = async () => {
    const { data, error } = await supabase.from("batalhas_agendadas").select("*")
      .eq("user_id", ownerId).order("data_batalha", { ascending: false });
    if (error) throw error;
    const rows = (data || []).map((r: any) => ({
      "Artista 1": str(r.artista1_nome),
      "Música 1": str(r.artista1_musica),
      "% 1": r.artista1_porcentagem ?? 50,
      "Imagem 1": str(r.artista1_imagem),
      "Artista 2": str(r.artista2_nome),
      "Música 2": str(r.artista2_musica),
      "% 2": r.artista2_porcentagem ?? 50,
      "Imagem 2": str(r.artista2_imagem),
      "Data": toBR(r.data_batalha),
      "Início": str(r.horario_inicio),
      "Fim": str(r.horario_fim),
    }));
    downloadBlob(sheetToBlob(rows, "Batalha"), `batalha-musical-${Date.now()}.xlsx`);
    return `${rows.length} batalhas exportadas.`;
  };

  const importBatalha = async (file: File) => {
    const rows = await readSheet(file);
    const payload: any[] = [];
    let skipped = 0;
    for (const row of rows) {
      const a1 = str(pick(row, "Artista 1", "Artista1"));
      const a2 = str(pick(row, "Artista 2", "Artista2"));
      const data = parseDate(pick(row, "Data", "Data batalha"));
      if (!a1 || !a2 || !data) { skipped++; continue; }
      payload.push({
        user_id: ownerId,
        artista1_nome: a1,
        artista1_musica: str(pick(row, "Música 1", "Musica 1")),
        artista1_porcentagem: num(pick(row, "% 1", "Porcentagem 1")) || 50,
        artista1_imagem: str(pick(row, "Imagem 1")) || null,
        artista2_nome: a2,
        artista2_musica: str(pick(row, "Música 2", "Musica 2")),
        artista2_porcentagem: num(pick(row, "% 2", "Porcentagem 2")) || 50,
        artista2_imagem: str(pick(row, "Imagem 2")) || null,
        data_batalha: data,
        horario_inicio: parseTime(pick(row, "Início", "Inicio"), "00:00"),
        horario_fim: parseTime(pick(row, "Fim"), "23:59"),
      });
    }
    if (payload.length) {
      const { error } = await supabase.from("batalhas_agendadas").insert(payload);
      if (error) throw error;
    }
    return `${payload.length} batalhas importadas${skipped ? ` · ${skipped} linhas ignoradas` : ""}.`;
  };

  /* ---------- Enquete ---------- */

  const exportEnquete = async () => {
    const { data, error } = await supabase.from("enquetes_agendadas").select("*")
      .eq("user_id", ownerId).order("data_enquete", { ascending: false });
    if (error) throw error;
    const rows = (data || []).map((r: any) => ({
      "Pergunta": str(r.pergunta),
      "Resposta 1": str(r.resposta1),
      "Resposta 2": str(r.resposta2),
      "Resposta 3": str(r.resposta3),
      "Resposta 4": str(r.resposta4),
      "Resposta correta": r.resposta_correta ?? "",
      "Data": toBR(r.data_enquete),
      "Início": str(r.horario_inicio),
      "Fim": str(r.horario_fim),
    }));
    downloadBlob(sheetToBlob(rows, "Enquete"), `enquetes-${Date.now()}.xlsx`);
    return `${rows.length} enquetes exportadas.`;
  };

  const importEnquete = async (file: File) => {
    const rows = await readSheet(file);
    const payload: any[] = [];
    let skipped = 0;
    for (const row of rows) {
      const pergunta = str(pick(row, "Pergunta"));
      const data = parseDate(pick(row, "Data", "Data enquete"));
      const r1 = str(pick(row, "Resposta 1", "Resposta1"));
      const r2 = str(pick(row, "Resposta 2", "Resposta2"));
      if (!pergunta || !data || !r1 || !r2) { skipped++; continue; }
      const correta = num(pick(row, "Resposta correta", "Correta"));
      payload.push({
        user_id: ownerId,
        pergunta,
        resposta1: r1,
        resposta2: r2,
        resposta3: str(pick(row, "Resposta 3", "Resposta3")) || null,
        resposta4: str(pick(row, "Resposta 4", "Resposta4")) || null,
        resposta_correta: correta >= 1 && correta <= 4 ? correta : null,
        data_enquete: data,
        horario_inicio: parseTime(pick(row, "Início", "Inicio"), "00:00"),
        horario_fim: parseTime(pick(row, "Fim"), "23:59"),
      });
    }
    if (payload.length) {
      const { error } = await supabase.from("enquetes_agendadas").insert(payload);
      if (error) throw error;
    }
    return `${payload.length} enquetes importadas${skipped ? ` · ${skipped} linhas ignoradas` : ""}.`;
  };

  /* ---------- cards config ---------- */

  const cards: {
    id: DatasetId; label: string; desc: string; icon: any; accept: string;
    onExport: () => Promise<string>; onImport: (f: File) => Promise<string>;
  }[] = [
    { id: "citacoes", label: "Citações cadastradas", desc: "Planilha Excel (.xlsx)", icon: MessageSquareQuote, accept: ".xlsx,.xls", onExport: exportCitacoes, onImport: importCitacoes },
    { id: "promocoes", label: "Promoções cadastradas", desc: "Planilha Excel (.xlsx) — banner e banner L pelo endereço da imagem", icon: Tag, accept: ".xlsx,.xls", onExport: exportPromocoes, onImport: importPromocoes },
    { id: "logos", label: "Logos cadastradas", desc: "Arquivo .zip com uma pasta por programa", icon: ImageIcon, accept: ".zip", onExport: exportLogos, onImport: importLogos },
    { id: "batalha", label: "Batalha musical", desc: "Planilha Excel (.xlsx)", icon: Swords, accept: ".xlsx,.xls", onExport: exportBatalha, onImport: importBatalha },
    { id: "enquete", label: "Enquete", desc: "Planilha Excel (.xlsx)", icon: HelpCircle, accept: ".xlsx,.xls", onExport: exportEnquete, onImport: importEnquete },
  ];

  if (!ownerId) {
    return <div className="flex items-center justify-center h-64 text-sm opacity-70">Aguarde a sessão carregar…</div>;
  }

  return (
    <div className="nexo-scope animate-fade-in space-y-4" style={{ fontFamily: FONT }}>
      <div id="module-header-title" style={{ display: "none" }}>Ferramentas — Backup / Importar</div>

      <div className="flex items-center gap-3 px-5 py-4 rounded-2xl" style={{ background: "#fff", border: `2px solid ${CYAN}` }} data-nexo-skip>
        <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: CYAN, color: "#fff" }}>
          <DatabaseBackup size={20} />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: DARK }}>Importar e exportar dados</h1>
          <p className="text-[11px] font-semibold" style={{ color: "#64748B" }}>
            Baixe uma cópia dos seus cadastros ou restaure a partir de um arquivo. A importação adiciona registros, sem apagar os existentes.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const loadingExport = busy === `${c.id}-export`;
          const loadingImport = busy === `${c.id}-import`;
          return (
            <div key={c.id} className="rounded-2xl p-4 flex flex-col gap-3"
              style={{ background: CARD_BG, border: `2px solid ${CYAN}` }} data-nexo-skip>
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: CYAN, color: "#fff" }}>
                  <Icon size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-[12px] font-extrabold uppercase tracking-wider" style={{ color: DARK }}>{c.label}</div>
                  <div className="text-[11px] font-semibold mt-0.5" style={{ color: "#64748B" }}>{c.desc}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-auto">
                <button type="button" disabled={!!busy} style={{ ...pillBtn(LIME, DARK), opacity: busy ? 0.6 : 1 }}
                  onClick={() => run(`${c.id}-export`, c.onExport)}>
                  {loadingExport ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Exportar
                </button>
                <button type="button" disabled={!!busy} style={{ ...pillBtn("#fff", DARK), border: `2px solid ${CYAN}`, opacity: busy ? 0.6 : 1 }}
                  onClick={() => inputs.current[c.id]?.click()}>
                  {loadingImport ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Importar
                </button>
                <input ref={(el) => { inputs.current[c.id] = el; }} type="file" accept={c.accept} className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) run(`${c.id}-import`, () => c.onImport(f));
                  }} />
              </div>
            </div>
          );
        })}
      </div>

      {log.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: "#fff", border: `2px solid ${CYAN}` }} data-nexo-skip>
          <div className="text-[11px] font-extrabold uppercase tracking-wider mb-2" style={{ color: DARK }}>Últimas operações</div>
          <ul className="space-y-1">
            {log.map((l, i) => (
              <li key={i} className="text-[11px] font-semibold" style={{ color: l.startsWith("Erro") ? "#DC2626" : "#64748B" }}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
