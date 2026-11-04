import { DateInput } from "@/components/ui/date-input";
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Check,
  RotateCw,
  Sparkles,
  Settings2,
  Layers,
  AlertCircle,
  Loader2,
  Tv,
  Calendar,
  Eye,
  CheckCircle2,
  X,
  Radio,
} from "lucide-react";
import {
  transformLogoWithBackend,
  dataUrlToFile,
  uploadToPngDataUrl,
} from "@/services/logoTransformService";


export interface ProgramItem {
  id: string;
  nome: string;
  estudio?: string;
}

export interface LogoTransformVersion {
  id: string; // 'original', 'version_01', 'version_02', ...
  name: string;
  dataUrl: string;
  status: "original" | "ready" | "approved";
  isAiGenerated?: boolean;
}

interface LogoTransformModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFile: File | null;
  programas: ProgramItem[];
  defaultExpirationDate?: string;
  preselectedProgramIds?: string[];
  onApproveAndSave: (result: {
    file: File;
    nome: string;
    programaIds: string[];
    dataFinal: string;
    version: string;
  }) => Promise<void> | void;
}

export function LogoTransformModal({
  isOpen,
  onClose,
  initialFile,
  programas,
  defaultExpirationDate = "2026-12-31",
  preselectedProgramIds,
  onApproveAndSave,
}: LogoTransformModalProps) {
  // Step state: 'preview' (review & retry) -> 'select_program' (pick target program)
  const [step, setStep] = useState<"preview" | "select_program">("preview");

  const [sessionId, setSessionId] = useState("");
  const [originalDataUrl, setOriginalDataUrl] = useState<string>("");
  const [versions, setVersions] = useState<LogoTransformVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string>("version_01");
  const [approvedVersionId, setApprovedVersionId] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [transformFailed, setTransformFailed] = useState(false);


  // Background style for previewing white logo
  const [previewBg, setPreviewBg] = useState<"dark" | "checker" | "black">("dark");

  // Selection step form state
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>(["__none__"]);
  const [logoName, setLogoName] = useState("");
  const [expirationDate, setExpirationDate] = useState(defaultExpirationDate);
  const [savingFinal, setSavingFinal] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current < 35) return Math.min(35, current + 3);
        if (current < 70) return Math.min(70, current + 2);
        if (current < 92) return Math.min(92, current + 1);
        return current;
      });
    }, 700);
    return () => window.clearInterval(timer);
  }, [loading]);

  // Initialize session when a new initialFile is passed
  useEffect(() => {
    if (!isOpen || !initialFile) return;

    const init = async () => {
      setStep("preview");
      setErrorMessage(null);
      setInfoNotice(null);
      setTransformFailed(false);
      setSavingFinal(false);
      setSelectedPrograms(["__none__"]);

      const cleanName = initialFile.name.replace(/\.[^.]+$/, "").trim().toUpperCase();
      setLogoName(cleanName);

      const sid = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setSessionId(sid);

      try {
        setProgress(4);
        setLoading(true);
        const origUrl = await uploadToPngDataUrl(initialFile);
        setProgress(12);
        setOriginalDataUrl(origUrl);


        const initialVersionsList: LogoTransformVersion[] = [
          {
            id: "original",
            name: "Original",
            dataUrl: origUrl,
            status: "original",
          },
        ];

        // Processamento pela API oficial da OpenAI via Edge Function própria.
        // Não usa o gateway de IA nem os créditos da Lovable.
        setProgress(24);
        const transformed = await transformLogoWithBackend({
          originalDataUrl: origUrl,
          sessionId: sid,
          version: "version_01",
        });
        if (!transformed.success || !transformed.imageBase64) {
          throw new Error(transformed.error || "Não foi possível ajustar a logo pela API da OpenAI.");
        }
        setProgress(100);

        const v1: LogoTransformVersion = {
          id: "version_01",
          name: "Versão preparada",
          dataUrl: transformed.imageBase64,
          status: "ready",
          isAiGenerated: true,
        };

        setVersions([...initialVersionsList, v1]);
        setActiveVersionId("version_01");
      } catch (err: any) {
        setTransformFailed(true);
        setErrorMessage(err?.message || "Erro ao processar imagem da logo.");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [isOpen, initialFile]);

  const currentVersion = versions.find((v) => v.id === activeVersionId) || versions[versions.length - 1];

  // Action: TENTAR OUTRA OPÇÃO (Generates version_02, version_03, always using ORIGINAL image)
  const handleTryAnother = async () => {
    if (!originalDataUrl || loading) return;

    setLoading(true);
    setProgress(8);
    setErrorMessage(null);
    setInfoNotice(null);
    setTransformFailed(false);


    try {
      // Calculate next version index based on existing versions
      const versionCount = versions.filter((v) => v.id.startsWith("version_")).length;
      const nextIndex = versionCount + 1;
      const versionKey = `version_${nextIndex.toString().padStart(2, "0")}`;
      const versionName = `Versão ${nextIndex.toString().padStart(2, "0")}`;

      // Nova tentativa usa novamente a imagem ORIGINAL pela API oficial da OpenAI.
      // Não usa o gateway de IA nem os créditos da Lovable.
      const transformed = await transformLogoWithBackend({
        originalDataUrl,
        sessionId,
        version: versionKey,
        isRetry: true,
      });
      if (!transformed.success || !transformed.imageBase64) {
        throw new Error(transformed.error || "Não foi possível gerar outra opção pela API da OpenAI.");
      }
      setProgress(100);

      const newVersion: LogoTransformVersion = {
        id: versionKey,
        name: versionName,
        dataUrl: transformed.imageBase64,
        status: "ready",
        isAiGenerated: true,
      };

      setVersions((prev) => [...prev, newVersion]);
      setActiveVersionId(versionKey);
    } catch (err: any) {
      setTransformFailed(true);
      setErrorMessage(err?.message || "Erro ao gerar nova opção com a IA.");
    } finally {
      setLoading(false);
    }
  };

  // Action: APROVAR — salva direto no(s) programa(s) já escolhido(s) no campo PROGRAMA
  const handleApprove = async () => {
    if (!currentVersion || currentVersion.id === "original") return;
    const approved = currentVersion;
    setApprovedVersionId(approved.id);
    setVersions((prev) =>
      prev.map((v) => (v.id === approved.id ? { ...v, status: "approved" } : v))
    );
    const targets = (preselectedProgramIds || []).filter((p) => p && p !== "__none__");
    setSavingFinal(true);
    try {
      const finalFileName = `${(logoName || "LOGO_PATROCINADOR").toLowerCase().replace(/[^a-z0-9]/g, "_")}_1080.png`;
      await onApproveAndSave({
        file: dataUrlToFile(approved.dataUrl, finalFileName),
        nome: logoName.trim().toUpperCase() || "PATROCINADOR",
        programaIds: targets.length ? targets : ["__none__"],
        dataFinal: expirationDate,
        version: approved.id,
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || "Erro ao salvar a logo.");
    } finally {
      setSavingFinal(false);
    }
  };

  // Toggle program in multi-selection
  const handleToggleProgram = (pid: string) => {
    setSelectedPrograms((prev) => {
      if (pid === "__none__") {
        return ["__none__"];
      }
      const withoutNone = prev.filter((p) => p !== "__none__");
      if (withoutNone.includes(pid)) {
        const next = withoutNone.filter((p) => p !== pid);
        return next.length === 0 ? ["__none__"] : next;
      } else {
        return [...withoutNone, pid];
      }
    });
  };

  // Final confirmation and save
  const handleFinish = async () => {
    const approved = versions.find((v) => v.id === approvedVersionId) || currentVersion;
    if (!approved) return;

    setSavingFinal(true);
    try {
      const finalFileName = `${(logoName || "LOGO_PATROCINADOR").toLowerCase().replace(/[^a-z0-9]/g, "_")}_1080.png`;
      const file = dataUrlToFile(approved.dataUrl, finalFileName);

      await onApproveAndSave({
        file,
        nome: logoName.trim().toUpperCase() || "PATROCINADOR",
        programaIds: selectedPrograms,
        dataFinal: expirationDate,
        version: approved.id,
      });

      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || "Erro ao salvar a logo.");
    } finally {
      setSavingFinal(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-3xl w-full p-0 overflow-hidden border border-slate-200/90 rounded-3xl bg-white shadow-2xl"
        style={{ maxHeight: "92vh" }}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-[#001738] to-[#002b66] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <Sparkles size={18} />
            </div>
            <div>
              <DialogTitle className="text-sm font-black uppercase tracking-wider text-white m-0">
                Transformação Automática de Logo
              </DialogTitle>
              <DialogDescription className="text-xs text-blue-200/80 m-0">
                {step === "preview"
                  ? "Logo flat branca #FFFFFF • PNG 1080×1080 • Fundo transparente"
                  : "Vincule a logo aprovada aos programas da emissora"}
              </DialogDescription>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto max-h-[calc(92vh-130px)]">
          {infoNotice && (
            <div className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs flex items-start gap-2.5">
              <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{infoNotice}</div>
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {/* STEP 1: PREVIEW & RETRY */}
          {step === "preview" && (
            <div className="space-y-6">
              {/* Version Navigation Tabs */}
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mr-1">
                    <Layers size={13} /> Versões:
                  </span>
                  {versions.map((ver) => {
                    const isActive = ver.id === activeVersionId;
                    const isAppr = ver.status === "approved";
                    return (
                      <button
                        key={ver.id}
                        type="button"
                        onClick={() => setActiveVersionId(ver.id)}
                        className={`px-3 py-1 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 ${
                          isActive
                            ? "bg-[#0055ff] text-white shadow-sm"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                        }`}
                      >
                        {isAppr && <CheckCircle2 size={12} className="text-emerald-300" />}
                        {ver.name}
                        {ver.id === "original" && (
                          <span className="text-[9px] opacity-70 font-normal">(Base)</span>
                        )}
                      </button>
                    );
                  })}
                </div>

              </div>

              {/* Large Preview Area */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-full max-w-[300px] sm:max-w-[320px] aspect-square rounded-3xl border-2 flex items-center justify-center p-6 relative overflow-hidden transition-all shadow-md ${
                    previewBg === "dark"
                      ? "bg-[#0f172a] border-slate-700"
                      : previewBg === "black"
                      ? "bg-black border-slate-800"
                      : "bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%),linear-gradient(-45deg,#f1f5f9_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f1f5f9_75%),linear-gradient(-45deg,transparent_75%,#f1f5f9_75%)] [background-size:20px_20px] [background-position:0_0,0_10px,10px_-10px,-10px_0px] bg-white border-slate-300"
                  }`}
                >
                  {loading ? (
                    <div className="flex w-full flex-col items-center text-center gap-3 p-4 text-slate-300">
                      <div className="relative flex h-16 w-16 items-center justify-center">
                        <Loader2 className="animate-spin text-blue-400" size={58} strokeWidth={1.5} />
                        <span className="absolute text-xs font-black text-white">{progress}%</span>
                      </div>
                      <span className="text-xs font-black uppercase tracking-wider text-white">
                        {progress < 20
                          ? "Preparando a imagem..."
                          : progress < 70
                            ? "Convertendo para flat branco..."
                            : "Finalizando PNG transparente..."}
                      </span>
                      <span className="text-[11px] text-slate-400 max-w-xs">
                        Removendo o fundo e convertendo a arte para branco puro com transparência.
                      </span>
                      <div className="h-2 w-full max-w-[220px] overflow-hidden rounded-full bg-slate-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Progresso do ajuste da logo">
                        <div
                          className="h-full rounded-full bg-blue-400 transition-[width] duration-500 ease-out"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  ) : currentVersion ? (
                    <img
                      src={currentVersion.dataUrl}
                      alt={currentVersion.name}
                      className="max-w-full max-h-full object-contain filter drop-shadow-sm transition-transform duration-200 hover:scale-105"
                    />
                  ) : (
                    <div className="text-xs text-slate-400">Nenhuma visualização disponível</div>
                  )}

                  {/* Active version badge */}
                  <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 border border-white/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    {currentVersion?.name || "Prévia"}
                  </div>
                </div>

                {/* Mandatory Specification Label */}
                <div className="mt-3 px-4 py-1 rounded-full bg-slate-100 border border-slate-200/80 flex items-center gap-2 shadow-2xs">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                    1080 × 1080 • PNG • FUNDO TRANSPARENTE
                  </span>
                </div>
              </div>

              {/* Action Buttons: [ ✓ APROVAR ] and [ ↻ TENTAR OUTRA OPÇÃO ] */}
              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleTryAnother}
                  disabled={loading}
                  className="w-full sm:w-auto min-w-[190px] h-11 px-6 rounded-full font-black text-xs uppercase tracking-wider border-2 border-slate-300 bg-white hover:bg-slate-50 hover:border-[#0055ff] text-[#002132] transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <RotateCw size={14} className={loading ? "animate-spin" : ""} />
                  ↻ Tentar Outra Opção
                </button>

                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={loading || savingFinal || transformFailed || !currentVersion || currentVersion.id === "original"}
                  title={transformFailed ? "O ajuste falhou. Tente outra opção antes de aprovar." : "Aprovar"}

                  className="w-full sm:w-auto min-w-[190px] h-11 px-8 rounded-full font-black text-xs uppercase tracking-wider text-white transition-all duration-200 hover:brightness-110 active:scale-95 flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(0,85,255,0.35)] disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: "#0055ff" }}
                >
                  <Check size={15} strokeWidth={3} />✓ Aprovar
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: SELECIONE O PROGRAMA */}
          {step === "select_program" && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center pb-2">
                <h3 className="text-base font-black uppercase tracking-wider text-[#002132]">
                  SELECIONE O PROGRAMA
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Vincule a logo aprovada ao(s) programa(s) desejados ou defina como exibição geral.
                </p>
              </div>

              {/* Logo Details Overview */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-[#0f172a] p-2 flex items-center justify-center shrink-0 border border-slate-800">
                  <img
                    src={currentVersion?.dataUrl}
                    alt="Logo Aprovada"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Nome do Patrocinador *
                    </label>
                    <input
                      type="text"
                      value={logoName}
                      onChange={(e) => setLogoName(e.target.value)}
                      placeholder="Ex: COCA COLA"
                      className="w-full px-3.5 py-1.5 text-xs font-bold uppercase rounded-full bg-white border border-slate-200 text-[#002132] focus:border-[#0055ff] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Data de Expiração *
                    </label>
                    <DateInput
                                          value={expirationDate}
                      onChange={(e) => setExpirationDate(e.target.value)}
                      className="w-full px-3.5 py-1.5 text-xs font-bold rounded-full bg-white border border-slate-200 text-[#002132] focus:border-[#0055ff] outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Program Selection Cards Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Programas Disponíveis
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPrograms(programas.map((p) => p.id))}
                      className="text-[11px] font-bold text-[#0055ff] hover:underline"
                    >
                      Todos
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPrograms(["__none__"])}
                      className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
                    >
                      Apenas Geral
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto p-1">
                  {/* Geral / Sem Programa Card */}
                  <div
                    onClick={() => handleToggleProgram("__none__")}
                    className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                      selectedPrograms.includes("__none__")
                        ? "border-[#0055ff] bg-blue-50/60 shadow-xs"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="truncate">
                      <span className="text-xs font-black uppercase text-[#002132] block truncate">
                        [ SEM PROGRAMA ]
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">Exibição contínua geral</span>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                        selectedPrograms.includes("__none__")
                          ? "bg-[#0055ff] border-[#0055ff] text-white"
                          : "border-slate-300"
                      }`}
                    >
                      {selectedPrograms.includes("__none__") && <Check size={12} strokeWidth={3} />}
                    </div>
                  </div>

                  {/* Available Station Programs */}
                  {programas.map((prog, idx) => {
                    const isSelected = selectedPrograms.includes(prog.id);
                    return (
                      <div
                        key={prog.id}
                        onClick={() => handleToggleProgram(prog.id)}
                        className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? "border-[#0055ff] bg-blue-50/60 shadow-xs"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="truncate pr-2">
                          <span className="text-xs font-black uppercase text-[#002132] block truncate">
                            [ {prog.nome.toUpperCase()} ]
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium truncate block">
                            {prog.estudio || "Estúdio FM"}
                          </span>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                            isSelected
                              ? "bg-[#0055ff] border-[#0055ff] text-white"
                              : "border-slate-300"
                          }`}
                        >
                          {isSelected && <Check size={12} strokeWidth={3} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Actions for Step 2 */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep("preview")}
                  className="px-5 py-2.5 rounded-full text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  ← Voltar para Prévia
                </button>

                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={savingFinal}
                  className="h-11 px-8 rounded-full font-black text-xs uppercase tracking-wider text-white transition-all duration-200 hover:brightness-110 active:scale-95 flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(0,85,255,0.35)] disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: "#0055ff" }}
                >
                  {savingFinal ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Salvando...
                    </>
                  ) : (
                    <>
                      <Check size={16} strokeWidth={3} /> Salvar e Concluir
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
