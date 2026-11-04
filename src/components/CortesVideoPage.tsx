import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Scissors, Play, Pause, RotateCcw, RotateCw, Download, Upload,
  Type, Video, Image as ImageIcon, Sliders, Settings, Search, Folder,
  ChevronDown, ZoomIn, ZoomOut, Maximize2, Trash2, Plus, Volume2,
  Sparkles, Check, X, AlertCircle, Loader2, HardDrive
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

// Aspect Ratio Presets
interface AspectPreset {
  id: string;
  name: string;
  ratio: number; // width / height
  width: number;
  height: number;
  iconLabel: string;
}

const ASPECT_RATIOS: AspectPreset[] = [
  { id: "16:9", name: "Paisagem ampla (16:9)", ratio: 16 / 9, width: 1920, height: 1080, iconLabel: "16:9" },
  { id: "9:16", name: "Retrato alto (9:16)", ratio: 9 / 16, width: 1080, height: 1920, iconLabel: "9:16" },
  { id: "4:5",  name: "Retrato (4:5)", ratio: 4 / 5, width: 1080, height: 1350, iconLabel: "4:5" },
  { id: "1:1",  name: "Quadrado (1:1)", ratio: 1, width: 1080, height: 1080, iconLabel: "1:1" },
  { id: "4:3",  name: "Paisagem quadrada (4:3)", ratio: 4 / 3, width: 1440, height: 1080, iconLabel: "4:3" },
  { id: "5:4",  name: "Paisagem (5:4)", ratio: 5 / 4, width: 1350, height: 1080, iconLabel: "5:4" },
];

// Media Asset in Bin
interface MediaAsset {
  id: string;
  type: "video" | "image";
  name: string;
  url: string;
  duration: number; // in seconds
  width: number;
  height: number;
  thumbnail?: string;
  waveform?: number[];
  file?: File;
  storagePath?: string;
  sizeBytes?: number;
  persisted?: boolean;
}

// Timeline Media Clip
interface TimelineClip {
  id: string;
  mediaId: string;
  type: "video" | "image";
  name: string;
  url: string;
  start: number;       // timeline start in seconds
  duration: number;    // visible length on timeline
  mediaStart: number;  // offset inside source media
  color: string;
  thumbnail?: string;
  waveform?: number[];
}

// Text Overlay
interface TextOverlay {
  id: string;
  text: string;
  start: number;       // timeline start
  duration: number;    // duration
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  bgColor: string;
  x: number;           // 0..100 percentage
  y: number;           // 0..100 percentage
  textAlign: "left" | "center" | "right";
}

// Helpers
function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${ms}`;
}

const VIDEO_LIBRARY_LIMIT = 50 * 1024 * 1024;
const VIDEO_LIBRARY_BUCKET = "video-editor-media";

async function extractWaveform(file: File, sampleCount = 320): Promise<number[]> {
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) throw new Error("Web Audio indisponível");
  const context: AudioContext = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    const channel = decoded.getChannelData(0);
    const samplesPerBucket = Math.max(1, Math.floor(channel.length / sampleCount));
    const peaks: number[] = [];
    for (let bucket = 0; bucket < sampleCount; bucket++) {
      const start = bucket * samplesPerBucket;
      const end = Math.min(channel.length, start + samplesPerBucket);
      let peak = 0;
      let sumSquares = 0;
      let count = 0;
      for (let i = start; i < end; i++) {
        const sample = channel[i] || 0;
        const absolute = Math.abs(sample);
        if (absolute > peak) peak = absolute;
        sumSquares += sample * sample;
        count++;
      }
      const rms = count ? Math.sqrt(sumSquares / count) : 0;
      // Blend transient peaks with average loudness so the waveform shows quiet details too.
      const detailedLevel = Math.max(rms * 1.45, peak * 0.62);
      peaks.push(Math.max(0.015, Math.min(1, detailedLevel)));
    }
    return peaks;
  } finally {
    void context.close().catch(() => {});
  }
}

async function fetchFFmpegAsset(url: string, mimeType: string): Promise<string> {
  const alternateUrl = url.replace("https://cdn.jsdelivr.net/npm/", "https://unpkg.com/");
  let lastError: unknown;
  for (const candidate of [...new Set([url, alternateUrl])]) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(candidate, { signal: controller.signal, cache: "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status} ao baixar ${candidate.includes("unpkg.com") ? "o servidor alternativo" : "o codificador"}.`);
      const buffer = await response.arrayBuffer();
      if (!buffer.byteLength) throw new Error("O arquivo do codificador veio vazio.");
      return URL.createObjectURL(new Blob([buffer], { type: mimeType }));
    } catch (error: any) {
      lastError = error;
      if (error?.name === "AbortError") lastError = new Error("O download do codificador excedeu 60 segundos.");
      console.warn("Falha ao baixar recurso FFmpeg:", candidate, lastError);
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw new Error(`Não foi possível baixar o FFmpeg dos dois servidores. ${lastError instanceof Error ? lastError.message : "Verifique a conexão, bloqueadores e permissões de rede."}`);
}

const CLIP_COLORS = [
  "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4"
];

const FONT_OPTIONS = [
  { label: "Montserrat", value: "Montserrat, sans-serif" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Roboto", value: "Roboto, sans-serif" },
  { label: "Impact", value: "Impact, sans-serif" },
  { label: "Playfair Display", value: "'Playfair Display', serif" },
  { label: "Poppins", value: "Poppins, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
];

export default function CortesVideoPage() {
  const { user } = useAuth();

  // Project settings
  const [projectName, setProjectName] = useState("Project Name");
  const [isEditingName, setIsEditingName] = useState(false);
  const [selectedAspect, setSelectedAspect] = useState<AspectPreset>(ASPECT_RATIOS[0]);
  const [isAspectMenuOpen, setIsAspectMenuOpen] = useState(false);
  const [aspectSearch, setAspectSearch] = useState("");
  const [bgColor, setBgColor] = useState("#000000");

  // Navigation / Sidebar
  const [activeTab, setActiveTab] = useState<"video" | "texto" | "ajustes" | "biblioteca">("video");

  // Media Library
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [libraryAssets, setLibraryAssets] = useState<MediaAsset[]>([]);
  const [libraryUsageBytes, setLibraryUsageBytes] = useState(0);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [isUploadingLibrary, setIsUploadingLibrary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  // Timeline State
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(30); // pixels per second

  // Trimming & Dragging state
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  const [trimmingClip, setTrimmingClip] = useState<{ id: string; edge: "start" | "end"; initialX: number; initialTime: number; initialDur: number; initialMediaStart: number } | null>(null);
  const [draggingClip, setDraggingClip] = useState<{ id: string; initialX: number; initialStart: number } | null>(null);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportPhase, setExportPhase] = useState("");
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false);
  const [exportNameDraft, setExportNameDraft] = useState("");
  const exportingRef = useRef(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioSourcesRef = useRef<Map<string, MediaElementAudioSourceNode>>(new Map());
  const [exportStart, setExportStart] = useState(0);
  const [exportEnd, setExportEnd] = useState(0);

  // Canvas & Preview Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const timelineRulerRef = useRef<HTMLDivElement>(null);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(Date.now());

  // Real content duration is separate from the ruler's minimum display width.
  const contentDuration = useMemo(() => {
    let maxTime = 0;
    clips.forEach(clip => { maxTime = Math.max(maxTime, clip.start + clip.duration); });
    textOverlays.forEach(item => { maxTime = Math.max(maxTime, item.start + item.duration); });
    return maxTime;
  }, [clips, textOverlays]);

  const totalDuration = useMemo(() => {
    return Math.ceil(Math.max(60, contentDuration) / 6) * 6;
  }, [contentDuration]);

  useEffect(() => {
    setExportStart(prev => Math.min(Math.max(0, prev), contentDuration));
    setExportEnd(prev => prev === 0 ? contentDuration : Math.min(Math.max(0, prev), contentDuration));
  }, [contentDuration]);

  // Load this user's saved video library from private Supabase Storage.
  useEffect(() => {
    let cancelled = false;
    async function loadLibrary() {
      if (!user?.id) {
        setLibraryAssets([]);
        setLibraryUsageBytes(0);
        return;
      }
      setLibraryLoading(true);
      try {
        const { data, error } = await (supabase.from("video_editor_assets" as any) as any)
          .select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        if (error) throw error;
        const rows = data || [];
        const hydrated: MediaAsset[] = await Promise.all(rows.map(async (row: any) => {
          const { data: signed, error: signedError } = await supabase.storage
            .from(VIDEO_LIBRARY_BUCKET).createSignedUrl(row.storage_path, 7 * 24 * 60 * 60);
          if (signedError || !signed?.signedUrl) throw signedError || new Error("Não foi possível abrir um vídeo salvo.");
          return {
            id: row.id, type: "video" as const, name: row.name, url: signed.signedUrl,
            duration: Number(row.duration) || 10, width: Number(row.width) || 1920,
            height: Number(row.height) || 1080, thumbnail: row.thumbnail || undefined,
            waveform: Array.isArray(row.waveform) ? row.waveform.map(Number) : undefined,
            storagePath: row.storage_path, sizeBytes: Number(row.size_bytes) || 0, persisted: true,
          };
        }));
        if (!cancelled) {
          setLibraryAssets(hydrated);
          setLibraryUsageBytes(rows.reduce((sum: number, row: any) => sum + (Number(row.size_bytes) || 0), 0));
        }
      } catch (error: any) {
        console.error("Falha ao carregar biblioteca de vídeos:", error);
        if (!cancelled) toast.error("Não foi possível carregar a biblioteca salva: " + (error?.message || "verifique sua conexão."));
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    }
    void loadLibrary();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Pre-load / maintain HTML5 video elements for clips
  useEffect(() => {
    clips.forEach(clip => {
      if (clip.type === "video" && !videoElementsRef.current.has(clip.url)) {
        const v = document.createElement("video");
        v.src = clip.url;
        v.crossOrigin = "anonymous";
        v.preload = "auto";
        v.muted = false;
        videoElementsRef.current.set(clip.url, v);
      } else if (clip.type === "image" && !imageElementsRef.current.has(clip.url)) {
        const img = new Image();
        img.src = clip.url;
        imageElementsRef.current.set(clip.url, img);
      }
    });
  }, [clips]);

  // Upload handler for videos and images
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      if (!isVideo && !isImage) {
        toast.error(`Formato não suportado: ${file.name}`);
        return;
      }

      const url = URL.createObjectURL(file);
      const id = "asset_" + Math.random().toString(36).substring(2, 9);

      if (isVideo) {
        const tempVid = document.createElement("video");
        tempVid.src = url;
        tempVid.preload = "metadata";
        tempVid.onloadedmetadata = () => {
          const duration = tempVid.duration || 10;
          const width = tempVid.videoWidth || 1920;
          const height = tempVid.videoHeight || 1080;

          // generate thumbnail at 0.5s
          tempVid.currentTime = Math.min(0.5, duration / 2);
          tempVid.onseeked = () => {
            const thumbCanvas = document.createElement("canvas");
            thumbCanvas.width = 160;
            thumbCanvas.height = 90;
            const ctx = thumbCanvas.getContext("2d");
            ctx?.drawImage(tempVid, 0, 0, 160, 90);
            const thumbUrl = thumbCanvas.toDataURL("image/jpeg", 0.7);

            const newAsset: MediaAsset = {
              id,
              type: "video",
              name: file.name,
              url,
              duration,
              width,
              height,
              thumbnail: thumbUrl,
              file,
            };

            setMediaAssets(prev => [newAsset, ...prev]);
            void extractWaveform(file).then(waveform => {
              setMediaAssets(prev => prev.map(asset => asset.id === id ? { ...asset, waveform } : asset));
              setClips(prev => prev.map(clip => clip.mediaId === id ? { ...clip, waveform } : clip));
            }).catch(() => { /* some video codecs cannot be decoded by Web Audio */ });
            toast.success(`Vídeo importado: ${file.name}`);
          };
        };
      } else {
        // Image
        const img = new Image();
        img.src = url;
        img.onload = () => {
          const newAsset: MediaAsset = {
            id,
            type: "image",
            name: file.name,
            url,
            duration: 5, // default 5 seconds
            width: img.naturalWidth || 1080,
            height: img.naturalHeight || 1080,
            thumbnail: url,
            file,
          };
          setMediaAssets(prev => [newAsset, ...prev]);
          toast.success(`Imagem importada: ${file.name}`);
        };
      }
    });

    e.target.value = "";
  };

  // Add asset to timeline
  const addAssetToTimeline = (asset: MediaAsset) => {
    // Find first available start time on the media track (or append to end)
    let nextStart = 0;
    if (clips.length > 0) {
      const lastClip = clips.reduce((prev, current) => 
        (prev.start + prev.duration > current.start + current.duration) ? prev : current
      );
      nextStart = lastClip.start + lastClip.duration;
    }

    const newClip: TimelineClip = {
      id: "clip_" + Math.random().toString(36).substring(2, 9),
      mediaId: asset.id,
      type: asset.type,
      name: asset.name,
      url: asset.url,
      start: nextStart,
      duration: asset.duration,
      mediaStart: 0,
      color: CLIP_COLORS[clips.length % CLIP_COLORS.length],
      thumbnail: asset.thumbnail,
      waveform: asset.waveform,
    };

    setClips(prev => [...prev, newClip]);
    setSelectedClipId(newClip.id);
    toast.success(`Adicionado à timeline: ${asset.name}`);
  };

  const handleLibraryUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    if (!user?.id) {
      toast.error("Entre na sua conta para salvar vídeos na biblioteca.");
      return;
    }
    const videos = files.filter(file => file.type.startsWith("video/"));
    if (videos.length !== files.length) toast.error("A biblioteca aceita apenas arquivos de vídeo.");
    if (!videos.length) return;
    const incomingBytes = videos.reduce((sum, file) => sum + file.size, 0);
    if (incomingBytes + libraryUsageBytes > VIDEO_LIBRARY_LIMIT) {
      const remaining = Math.max(0, VIDEO_LIBRARY_LIMIT - libraryUsageBytes);
      toast.error(`Limite de 50 MB por usuário. Espaço restante: ${(remaining / (1024 * 1024)).toFixed(1)} MB.`);
      return;
    }

    setIsUploadingLibrary(true);
    let addedBytes = 0;
    try {
      for (const file of videos) {
        if (libraryUsageBytes + addedBytes + file.size > VIDEO_LIBRARY_LIMIT) {
          toast.error(`O vídeo "${file.name}" ultrapassa o limite restante de 50 MB.`);
          continue;
        }
        const tempUrl = URL.createObjectURL(file);
        let metadata: { duration: number; width: number; height: number; thumbnail?: string; waveform?: number[] };
        try {
          metadata = await new Promise<{ duration: number; width: number; height: number; thumbnail?: string; waveform?: number[] }>((resolve, reject) => {
            const video = document.createElement("video");
            video.preload = "metadata";
            video.muted = true;
            video.src = tempUrl;
            video.onloadedmetadata = async () => {
              const result: any = { duration: Number.isFinite(video.duration) ? video.duration : 10, width: video.videoWidth || 1920, height: video.videoHeight || 1080 };
              try {
                video.currentTime = Math.min(0.5, result.duration / 2);
                await new Promise<void>(done => { video.onseeked = () => done(); video.onerror = () => done(); });
                const thumb = document.createElement("canvas");
                thumb.width = 160; thumb.height = 90;
                thumb.getContext("2d")?.drawImage(video, 0, 0, 160, 90);
                result.thumbnail = thumb.toDataURL("image/jpeg", 0.65);
              } catch {}
              try { result.waveform = await extractWaveform(file); } catch {}
              resolve(result);
            };
            video.onerror = () => reject(new Error(`Não foi possível ler os metadados de ${file.name}.`));
          });
        } finally {
          URL.revokeObjectURL(tempUrl);
        }

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "video.mp4";
        const storagePath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from(VIDEO_LIBRARY_BUCKET).upload(storagePath, file, {
          upsert: false, contentType: file.type, cacheControl: "3600",
        });
        if (uploadError) throw uploadError;

        const { data: signed, error: signedError } = await supabase.storage.from(VIDEO_LIBRARY_BUCKET)
          .createSignedUrl(storagePath, 7 * 24 * 60 * 60);
        if (signedError || !signed?.signedUrl) {
          await supabase.storage.from(VIDEO_LIBRARY_BUCKET).remove([storagePath]);
          throw signedError || new Error("Não foi possível criar o link do vídeo.");
        }

        const { data: row, error: insertError } = await (supabase.from("video_editor_assets" as any) as any)
          .insert({
            user_id: user.id, name: file.name, storage_path: storagePath, size_bytes: file.size,
            duration: metadata.duration, width: metadata.width, height: metadata.height,
            thumbnail: metadata.thumbnail || null, waveform: metadata.waveform || null,
          }).select("*").single();
        if (insertError) {
          await supabase.storage.from(VIDEO_LIBRARY_BUCKET).remove([storagePath]);
          throw insertError;
        }
        const asset: MediaAsset = {
          id: row.id, type: "video", name: row.name, url: signed.signedUrl, duration: metadata.duration,
          width: metadata.width, height: metadata.height, thumbnail: metadata.thumbnail,
          waveform: metadata.waveform, storagePath, sizeBytes: file.size, persisted: true,
        };
        setLibraryAssets(prev => [asset, ...prev]);
        addedBytes += file.size;
      }
      if (addedBytes > 0) {
        setLibraryUsageBytes(prev => prev + addedBytes);
        toast.success("Vídeo(s) salvo(s) na sua biblioteca.");
      }
    } catch (error: any) {
      console.error("Falha ao salvar vídeo:", error);
      toast.error("Falha ao salvar na biblioteca: " + (error?.message || "tente novamente."));
    } finally {
      setIsUploadingLibrary(false);
    }
  };

  const handleDeleteLibraryAsset = async (asset: MediaAsset) => {
    if (!user?.id || !asset.storagePath) return;
    const confirmed = window.confirm(`Excluir "${asset.name}" da biblioteca? Os clipes já adicionados à timeline não serão removidos automaticamente.`);
    if (!confirmed) return;
    const { error: rowError } = await (supabase.from("video_editor_assets" as any) as any)
      .delete().eq("id", asset.id).eq("user_id", user.id);
    if (rowError) {
      toast.error("Não foi possível excluir o registro: " + rowError.message);
      return;
    }
    const { error: storageError } = await supabase.storage.from(VIDEO_LIBRARY_BUCKET).remove([asset.storagePath]);
    if (storageError) console.warn("Arquivo removido do catálogo, mas a limpeza do Storage falhou:", storageError);
    setLibraryAssets(prev => prev.filter(item => item.id !== asset.id));
    setLibraryUsageBytes(prev => Math.max(0, prev - (asset.sizeBytes || 0)));
    toast.success("Vídeo removido da biblioteca.");
  };

  const addLibraryAssetToTimeline = (asset: MediaAsset) => {
    addAssetToTimeline(asset);
    setActiveTab("video");
  };

  // Split Clip Action ("Dividir")
  const handleSplitClip = () => {
    // Find active clip under currentTime (or the selected clip)
    let targetClip = clips.find(c => c.id === selectedClipId);
    if (!targetClip || currentTime <= targetClip.start || currentTime >= targetClip.start + targetClip.duration) {
      targetClip = clips.find(c => currentTime > c.start && currentTime < c.start + c.duration);
    }

    if (!targetClip) {
      toast.error("Posicione a agulha sobre um clipe para dividir.");
      return;
    }

    const splitOffset = currentTime - targetClip.start;
    const clipADur = splitOffset;
    const clipBDur = targetClip.duration - splitOffset;

    if (clipADur < 0.2 || clipBDur < 0.2) {
      toast.warning("Corte muito próximo das extremidades do clipe.");
      return;
    }

    const clipA: TimelineClip = {
      ...targetClip,
      duration: clipADur,
    };

    const clipB: TimelineClip = {
      ...targetClip,
      id: "clip_" + Math.random().toString(36).substring(2, 9),
      start: currentTime,
      duration: clipBDur,
      mediaStart: targetClip.mediaStart + splitOffset,
      color: CLIP_COLORS[(clips.indexOf(targetClip) + 1) % CLIP_COLORS.length],
    };

    setClips(prev => prev.map(c => c.id === targetClip!.id ? clipA : c).concat(clipB));
    setSelectedClipId(clipB.id);
    toast.success("Clipe dividido com sucesso!");
  };

  // Delete active clip or text
  const handleDeleteSelected = () => {
    if (selectedClipId) {
      setClips(prev => prev.filter(c => c.id !== selectedClipId));
      setSelectedClipId(null);
      toast.success("Clipe removido da linha do tempo.");
    } else if (selectedTextId) {
      setTextOverlays(prev => prev.filter(t => t.id !== selectedTextId));
      setSelectedTextId(null);
      toast.success("Texto removido.");
    }
  };

  // Add new Text Overlay
  const handleAddText = (preset = "Título") => {
    if (textOverlays.length >= 1) {
      setSelectedTextId(textOverlays[0].id);
      setActiveTab("texto");
      toast.info("O editor permite apenas um texto por vídeo. Edite o texto existente ou exclua-o para criar outro.");
      return;
    }
    const newText: TextOverlay = {
      id: "text_" + Math.random().toString(36).substring(2, 9),
      text: preset === "Título" ? "Seu Título Aqui" : preset === "Subtítulo" ? "Texto descritivo do vídeo" : "Legenda em destaque",
      start: currentTime,
      duration: 5,
      fontFamily: "Montserrat, sans-serif",
      fontSize: preset === "Título" ? 48 : preset === "Subtítulo" ? 32 : 24,
      fontWeight: preset === "Título" ? "700" : "600",
      color: "#ffffff",
      bgColor: "rgba(0,0,0,0.5)",
      x: 50,
      y: preset === "Título" ? 40 : preset === "Subtítulo" ? 55 : 80,
      textAlign: "center",
    };

    setTextOverlays(prev => [...prev, newText]);
    setSelectedTextId(newText.id);
    setActiveTab("texto");
    toast.success("Texto adicionado!");
  };

  // Update selected text properties
  const updateSelectedText = (patch: Partial<TextOverlay>) => {
    if (!selectedTextId) return;
    setTextOverlays(prev => prev.map(t => t.id === selectedTextId ? { ...t, ...patch } : t));
  };

  // Draw current frame on canvas
  const renderCanvasFrame = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = selectedAspect.width;
    const height = selectedAspect.height;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    // 1. Clear with background color
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // 2. Find active clip at current time
    const activeClip = clips.find(c => time >= c.start && time < c.start + c.duration);
    if (activeClip) {
      if (activeClip.type === "video") {
        const vid = videoElementsRef.current.get(activeClip.url);
        if (vid && vid.readyState >= 2) {
          const clipInternalTime = activeClip.mediaStart + (time - activeClip.start);
          // Sync video time if not actively playing or slightly off
          // During export the source video must play continuously so its audio remains
          // synchronized; the export loop performs larger seeks only at clip boundaries.
          if (!exportingRef.current && Math.abs(vid.currentTime - clipInternalTime) > 0.15) {
            vid.currentTime = clipInternalTime;
          }

          // Fill the selected canvas like Premiere's "Scale to Fill":
          // scale by height/width as needed and crop overflow instead of shrinking the whole frame.
          const sourceWidth = vid.videoWidth || width;
          const sourceHeight = vid.videoHeight || height;
          const scale = Math.max(width / sourceWidth, height / sourceHeight);
          const drawW = sourceWidth * scale;
          const drawH = sourceHeight * scale;
          const drawX = (width - drawW) / 2;
          const drawY = (height - drawH) / 2;
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, width, height);
          ctx.clip();
          ctx.drawImage(vid, drawX, drawY, drawW, drawH);
          ctx.restore();
        }
      } else if (activeClip.type === "image") {
        const img = imageElementsRef.current.get(activeClip.url);
        if (img && img.complete) {
          const sourceWidth = img.naturalWidth || width;
          const sourceHeight = img.naturalHeight || height;
          const scale = Math.max(width / sourceWidth, height / sourceHeight);
          const drawW = sourceWidth * scale;
          const drawH = sourceHeight * scale;
          const drawX = (width - drawW) / 2;
          const drawY = (height - drawH) / 2;
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, width, height);
          ctx.clip();
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
          ctx.restore();
        }
      }
    }

    // 3. Draw active Text Overlays
    textOverlays.forEach(t => {
      if (time >= t.start && time <= t.start + t.duration) {
        ctx.save();
        ctx.font = `${t.fontWeight} ${t.fontSize}px ${t.fontFamily}`;
        ctx.textAlign = t.textAlign;
        ctx.textBaseline = "middle";

        const posX = (t.x / 100) * width;
        const posY = (t.y / 100) * height;

        // Background pill behind text if set
        if (t.bgColor && t.bgColor !== "transparent") {
          const metrics = ctx.measureText(t.text);
          const padX = 16;
          const padY = 10;
          const textW = metrics.width;
          const textH = t.fontSize;

          let rectX = posX - padX;
          if (t.textAlign === "center") rectX = posX - textW / 2 - padX;
          else if (t.textAlign === "right") rectX = posX - textW - padX;

          ctx.fillStyle = t.bgColor;
          ctx.beginPath();
          ctx.roundRect(rectX, posY - textH / 2 - padY / 2, textW + padX * 2, textH + padY, 8);
          ctx.fill();
        }

        // Draw text
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, posX, posY);
        ctx.restore();
      }
    });
  }, [selectedAspect, bgColor, clips, textOverlays]);

  // Main playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      // Pause all video elements
      videoElementsRef.current.forEach(v => v.pause());
      renderCanvasFrame(currentTime);
      return;
    }

    lastTimeRef.current = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      setCurrentTime(prevTime => {
        const nextTime = prevTime + dt;
        if (nextTime >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }

        // Sync active video playback
        const activeClip = clips.find(c => nextTime >= c.start && nextTime < c.start + c.duration);
        if (activeClip && activeClip.type === "video") {
          const vid = videoElementsRef.current.get(activeClip.url);
          if (vid) {
            const expectedTime = activeClip.mediaStart + (nextTime - activeClip.start);
            if (vid.paused) vid.play().catch(() => {});
            if (Math.abs(vid.currentTime - expectedTime) > 0.25) {
              vid.currentTime = expectedTime;
            }
          }
        } else {
          // Pause all videos if no video active
          videoElementsRef.current.forEach(v => {
            if (!v.paused) v.pause();
          });
        }

        renderCanvasFrame(nextTime);
        return nextTime;
      });

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, totalDuration, clips, renderCanvasFrame]);

  // Handle scrubber drag on ruler
  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRulerRef.current) return;
    const rect = timelineRulerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = Math.max(0, Math.min(totalDuration, clickX / zoom));
    setCurrentTime(newTime);
    renderCanvasFrame(newTime);
    setDraggingPlayhead(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (trimmingClip) {
        const deltaSeconds = (e.clientX - trimmingClip.initialX) / zoom;
        setClips(prev => prev.map(clip => {
          if (clip.id !== trimmingClip.id) return clip;
          if (trimmingClip.edge === "end") {
            const nextDuration = Math.max(0.2, Math.min(contentDuration + Math.max(0, deltaSeconds), trimmingClip.initialDur + deltaSeconds));
            return { ...clip, duration: nextDuration };
          }
          const originalEnd = trimmingClip.initialTime + trimmingClip.initialDur;
          const nextStart = Math.max(0, Math.min(originalEnd - 0.2, trimmingClip.initialTime + deltaSeconds));
          const shift = nextStart - trimmingClip.initialTime;
          return {
            ...clip,
            start: nextStart,
            duration: Math.max(0.2, originalEnd - nextStart),
            mediaStart: Math.max(0, trimmingClip.initialMediaStart + shift),
          };
        }));
        return;
      }
      if (draggingClip) {
        const deltaSeconds = (e.clientX - draggingClip.initialX) / zoom;
        setClips(prev => {
          const moving = prev.find(clip => clip.id === draggingClip.id);
          if (!moving) return prev;
          let nextStart = Math.max(0, draggingClip.initialStart + deltaSeconds);
          // Snap the moving clip to nearby clip edges so cut segments can be joined cleanly.
          const snapDistance = 0.28;
          const movingEnd = nextStart + moving.duration;
          for (const other of prev) {
            if (other.id === moving.id) continue;
            const candidates = [
              { distance: Math.abs(nextStart - (other.start + other.duration)), value: other.start + other.duration },
              { distance: Math.abs(movingEnd - other.start), value: other.start - moving.duration },
            ];
            const nearest = candidates.sort((a, b) => a.distance - b.distance)[0];
            if (nearest && nearest.distance <= snapDistance) nextStart = Math.max(0, nearest.value);
          }
          return prev.map(clip => clip.id === moving.id ? { ...clip, start: nextStart } : clip);
        });
        return;
      }
      if (draggingPlayhead && timelineRulerRef.current) {
        const rect = timelineRulerRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const newTime = Math.max(0, Math.min(totalDuration, clickX / zoom));
        setCurrentTime(newTime);
        renderCanvasFrame(newTime);
      }
    };

    const handleMouseUp = () => {
      if (draggingPlayhead) setDraggingPlayhead(false);
      if (trimmingClip) setTrimmingClip(null);
      if (draggingClip) setDraggingClip(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingPlayhead, trimmingClip, draggingClip, totalDuration, contentDuration, zoom, renderCanvasFrame]);

  // Export Video (Canvas + Audio to WebM / MP4)
  const handleExportVideo = async (confirmedName?: string) => {
    if (clips.length === 0) {
      toast.error("Adicione pelo menos um vídeo ou imagem antes de exportar.");
      return;
    }
    if (!confirmedName) {
      setExportNameDraft(projectName === "Project Name" ? "" : projectName);
      setIsNameDialogOpen(true);
      return;
    }
    const exportProjectName = confirmedName.trim();
    if (!exportProjectName) {
      toast.error("Digite um nome para o projeto antes de renderizar.");
      setIsNameDialogOpen(true);
      return;
    }
    setProjectName(exportProjectName);
    setIsNameDialogOpen(false);

    const normalizedExportStart = Math.max(0, Math.min(exportStart, contentDuration));
    const normalizedExportEnd = Math.max(0, Math.min(exportEnd, contentDuration));
    if (normalizedExportEnd <= normalizedExportStart) {
      toast.error("O fim da exportação precisa ser maior que o início.");
      return;
    }
    if (!canvasRef.current || typeof MediaRecorder === "undefined") {
      toast.error("Este navegador não oferece suporte à captura necessária para renderizar.");
      return;
    }

    exportingRef.current = true;
    setIsPlaying(false);
    setIsExporting(true);
    setExportProgress(0);
    setExportPhase("Preparando projeto…");

    let captureStream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let renderTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      const canvas = canvasRef.current;
      const exportFps = 30;
      const step = 1 / exportFps;
      const totalSteps = Math.max(1, Math.ceil((normalizedExportEnd - normalizedExportStart) * exportFps));

      // Prepare a persistent Web Audio graph. MediaElementAudioSourceNode can only
      // be created once for each HTMLMediaElement, so reuse the same nodes between exports.
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) throw new Error("O navegador não oferece suporte ao áudio do render.");
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextCtor();
        audioDestinationRef.current = audioContextRef.current.createMediaStreamDestination();
      }
      const audioCtx = audioContextRef.current;
      const audioDestination = audioDestinationRef.current;
      if (!audioDestination) throw new Error("Não foi possível preparar a trilha de áudio.");
      await audioCtx.resume();

      for (const clip of clips) {
        if (clip.type !== "video") continue;
        let video = videoElementsRef.current.get(clip.url);
        if (!video) {
          video = document.createElement("video");
          video.src = clip.url;
          video.crossOrigin = "anonymous";
          video.preload = "auto";
          video.playsInline = true;
          videoElementsRef.current.set(clip.url, video);
        }
        if (video.readyState < 1) {
          await new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(() => reject(new Error(`Tempo esgotado ao carregar o vídeo: ${clip.name}`)), 15000);
            video!.addEventListener("loadedmetadata", () => { window.clearTimeout(timeout); resolve(); }, { once: true });
            video!.addEventListener("error", () => { window.clearTimeout(timeout); reject(new Error(`Não foi possível ler o vídeo: ${clip.name}`)); }, { once: true });
            video!.load();
          });
        }
        if (!audioSourcesRef.current.has(clip.url)) {
          try {
            const source = audioCtx.createMediaElementSource(video);
            source.connect(audioDestination);
            source.connect(audioCtx.destination);
            audioSourcesRef.current.set(clip.url, source);
          } catch (error) {
            console.warn("Não foi possível conectar o áudio de", clip.name, error);
          }
        }
      }

      // Record a broadly supported intermediate format, then encode a real MP4 with
      // fixed H.264/AAC settings. MediaRecorder MP4 support is inconsistent by browser.
      const webmType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
        .find(type => MediaRecorder.isTypeSupported(type));
      if (!webmType) throw new Error("Este navegador não consegue gerar o arquivo intermediário para renderização.");
      captureStream = canvas.captureStream(exportFps);
      audioDestination.stream.getAudioTracks().forEach(track => captureStream!.addTrack(track));
      recorder = new MediaRecorder(captureStream, {
        mimeType: webmType,
        videoBitsPerSecond: 5_000_000,
        audioBitsPerSecond: 96_000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };

      const recordedBlobPromise = new Promise<Blob>((resolve, reject) => {
        recorder!.addEventListener("stop", () => resolve(new Blob(chunks, { type: webmType })), { once: true });
        recorder!.addEventListener("error", () => reject(new Error("O navegador interrompeu a captura do vídeo.")), { once: true });
      });

      setExportPhase("Renderizando vídeo e áudio…");
      recorder.start(250);

      let stepCount = 0;
      let renderTime = normalizedExportStart;
      await new Promise<void>((resolve, reject) => {
        const tick = async () => {
          try {
            if (renderTime >= normalizedExportEnd) {
              renderCanvasFrame(normalizedExportEnd);
              setCurrentTime(normalizedExportEnd);
              // Allow the last canvas frame to reach MediaRecorder before stopping.
              renderTimer = setTimeout(() => {
                if (recorder?.state === "recording") recorder.stop();
                resolve();
              }, 180);
              return;
            }

            const activeClip = clips.find(clip => renderTime >= clip.start && renderTime < clip.start + clip.duration);
            for (const [url, video] of videoElementsRef.current.entries()) {
              const active = !!activeClip && activeClip.type === "video" && activeClip.url === url;
              if (!active) {
                if (!video.paused) video.pause();
                continue;
              }
              const expectedTime = activeClip!.mediaStart + (renderTime - activeClip!.start);
              if (Math.abs(video.currentTime - expectedTime) > 0.35) {
                video.currentTime = Math.min(expectedTime, Math.max(0, (video.duration || expectedTime) - 0.03));
              }
              if (video.paused) {
                try { await video.play(); } catch { /* frame rendering can continue even if autoplay is blocked */ }
              }
            }

            renderCanvasFrame(renderTime);
            setCurrentTime(renderTime);
            stepCount++;
            setExportProgress(Math.min(64, Math.round((stepCount / totalSteps) * 64)));
            renderTime = Math.min(normalizedExportEnd, renderTime + step);
            renderTimer = setTimeout(tick, 1000 / exportFps);
          } catch (error) {
            reject(error);
          }
        };
        void tick();
      });

      const webmBlob = await recordedBlobPromise;
      videoElementsRef.current.forEach(video => video.pause());
      if (webmBlob.size === 0) throw new Error("A captura terminou vazia. Tente novamente.");
      setExportProgress(66);
      setExportPhase("Codificando MP4 (H.264 + AAC)…");

      // Load FFmpeg only when needed. The core is fetched as blobs to satisfy worker/CORS rules.
      if (!ffmpegRef.current) {
        const ffmpeg = new FFmpeg();
        ffmpeg.on("log", ({ message }) => {
          console.info("[NexoHub FFmpeg]", message);
        });
        ffmpeg.on("progress", ({ progress }) => {
          setExportProgress(Math.min(98, 66 + Math.round(Math.max(0, Math.min(1, progress)) * 32)));
        });
        // Keep the FFmpeg core version aligned with @ffmpeg/ffmpeg 0.12.10
        // installed in package.json. A mismatched core can leave load() waiting forever.
        const coreBase = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
        let coreURL: string | null = null;
        let wasmURL: string | null = null;
        let loadTimeout: number | null = null;
        try {
          setExportPhase("Baixando codificador FFmpeg (1/2)…");
          setExportProgress(67);
          coreURL = await fetchFFmpegAsset(`${coreBase}/ffmpeg-core.js`, "text/javascript");
          setExportPhase("Baixando codificador FFmpeg (2/2)…");
          setExportProgress(68);
          wasmURL = await fetchFFmpegAsset(`${coreBase}/ffmpeg-core.wasm`, "application/wasm");
          setExportPhase("Inicializando codificador…");
          setExportProgress(69);
          await Promise.race([
            ffmpeg.load({ coreURL, wasmURL }),
            new Promise<never>((_, reject) => {
              loadTimeout = window.setTimeout(
                () => reject(new Error("O FFmpeg não conseguiu iniciar. O navegador pode estar bloqueando Worker/WASM ou a rede pode estar impedindo o carregamento. Atualize a prévia e tente novamente; se persistir, precisamos verificar o console do navegador.")),
                90000,
              );
            }),
          ]);
          ffmpegRef.current = ffmpeg;
        } catch (loadError) {
          // A timed-out worker must be terminated before a new export attempt.
          try { ffmpeg.terminate(); } catch {}
          throw loadError;
        } finally {
          if (loadTimeout) window.clearTimeout(loadTimeout);
          if (coreURL) URL.revokeObjectURL(coreURL);
          if (wasmURL) URL.revokeObjectURL(wasmURL);
        }
      }

      const ffmpeg = ffmpegRef.current;
      const inputName = `nexohub-render-${Date.now()}.webm`;
      const outputName = `nexohub-render-${Date.now()}.mp4`;
      await ffmpeg.writeFile(inputName, await fetchFile(webmBlob));
      await ffmpeg.exec([
        "-i", inputName,
        "-map", "0:v:0",
        "-map", "0:a?",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-b:v", "5000k",
        "-maxrate", "5000k",
        "-bufsize", "10000k",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-c:a", "aac",
        "-b:a", "96k",
        "-ar", "48000",
        "-movflags", "+faststart",
        outputName,
      ]);
      const outputData = await ffmpeg.readFile(outputName);
      const mp4Blob = new Blob([outputData as unknown as BlobPart], { type: "video/mp4" });
      if (mp4Blob.size < 1024) throw new Error("O arquivo MP4 gerado ficou vazio ou incompleto.");
      await Promise.all([
        ffmpeg.deleteFile(inputName).catch(() => undefined),
        ffmpeg.deleteFile(outputName).catch(() => undefined),
      ]);

      setExportPhase("Preparando download…");
      setExportProgress(100);
      const url = URL.createObjectURL(mp4Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${exportProjectName.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "corte_video"}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("Render concluído! MP4 H.264, vídeo 5 Mbps e áudio AAC 96 kbps.");
    } catch (err: any) {
      console.error("Export error during phase:", exportPhase, err);
      const details = err?.message || "Erro sem detalhes. Abra o console do navegador para ver o log do FFmpeg.";
      toast.error(`Falha no render — ${exportPhase || "preparação"}: ${details}`, { duration: 12000 });
      setExportProgress(0);
    } finally {
      if (renderTimer) clearTimeout(renderTimer);
      if (recorder?.state === "recording") {
        try { recorder.stop(); } catch { /* already stopped */ }
      }
      captureStream?.getTracks().forEach(track => track.stop());
      videoElementsRef.current.forEach(video => video.pause());
      setIsPlaying(false);
      exportingRef.current = false;
      setIsExporting(false);
      setExportPhase("");
      // Keep 100% only on successful completion; a failed render resets for a clean retry.
    }
  };

  // Find currently selected text
  const currentSelectedText = textOverlays.find(t => t.id === selectedTextId);

  return (
    <div className="fixed inset-x-2 top-[72px] bottom-2 z-[80] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-[#f8fafc] text-slate-900 shadow-2xl select-none">
      {/* ════════ TOP HEADER BAR (Matching reference image) ════════ */}
      <header className="relative h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0 z-20">
        {/* Left: Project Name & Undo/Redo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-slate-400" />
            {isEditingName ? (
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onBlur={() => setIsEditingName(false)}
                onKeyDown={(e) => e.key === "Enter" && setIsEditingName(false)}
                autoFocus
                className="text-sm font-semibold border-b border-blue-500 bg-transparent outline-none px-1"
              />
            ) : (
              <span
                onClick={() => setIsEditingName(true)}
                className="text-sm font-semibold text-slate-800 hover:text-blue-600 cursor-pointer transition-colors"
                title="Clique para renomear"
              >
                {projectName}
              </span>
            )}
          </div>

          <div className="h-4 w-[1px] bg-slate-200 mx-1" />

          <button
            type="button"
            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition-colors"
            title="Desfazer (Ctrl+Z)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition-colors"
            title="Refazer (Ctrl+Y)"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Center: Editar badge */}
        <div className="flex items-center">
          <div className="px-4 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-800 border border-slate-200 shadow-xs">
            Editar
          </div>
        </div>

        {/* Right: Export Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { void handleExportVideo(); }}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#0055ff] hover:bg-[#0047d4] transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{exportPhase || "Renderizando…"} {exportProgress}%</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Exportar MP4</span>
              </>
            )}
          </button>
        </div>
        {isExporting && (
          <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-blue-100 overflow-hidden" aria-live="polite">
            <div className="h-full bg-[#0055ff] transition-all duration-200" style={{ width: `${exportProgress}%` }} />
            <span className="sr-only">{exportPhase} {exportProgress}%</span>
          </div>
        )}
      </header>

      {/* ════════ MAIN WORKSPACE (Sidebar + Canvas Player) ════════ */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Icon Bar */}
        <nav className="w-16 border-r border-slate-200 bg-white flex flex-col items-center py-4 gap-4 shrink-0 z-10">
          <button
            type="button"
            onClick={() => setActiveTab("video")}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-12 ${activeTab === "video" ? "bg-slate-100 text-blue-600 font-bold" : "text-slate-400 hover:text-slate-700"}`}
            title="Mídia / Vídeo"
          >
            <Video className="w-5 h-5" />
            <span className="text-[10px]">Vídeo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("texto")}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-12 ${activeTab === "texto" ? "bg-slate-100 text-blue-600 font-bold" : "text-slate-400 hover:text-slate-700"}`}
            title="Texto"
          >
            <Type className="w-5 h-5" />
            <span className="text-[10px]">Texto</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ajustes")}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-12 ${activeTab === "ajustes" ? "bg-slate-100 text-blue-600 font-bold" : "text-slate-400 hover:text-slate-700"}`}
            title="Ajustes"
          >
            <Sliders className="w-5 h-5" />
            <span className="text-[10px]">Ajustes</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("biblioteca")}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-12 ${activeTab === "biblioteca" ? "bg-slate-100 text-blue-600 font-bold" : "text-slate-400 hover:text-slate-700"}`}
            title="Biblioteca de vídeos salvos"
          >
            <Folder className="w-5 h-5" />
            <span className="text-[10px]">Biblioteca</span>
          </button>
        </nav>

        {/* Left Drawer / Tool Panel */}
        <aside className="w-72 border-r border-slate-200 bg-white flex flex-col shrink-0 overflow-y-auto">
          {/* ── TAB: VÍDEO / MÍDIA ── */}
          {activeTab === "video" && (
            <div className="p-4 flex flex-col gap-4 flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800">Vídeo</h3>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Carregar vídeos ou imagens"
                  aria-label="Carregar vídeos ou imagens"
                >
                  <Upload className="w-4 h-4" />
                </button>
              </div>

              {/* Carregar Mídia - Paleta Nexo azul/branca */}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,image/*"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />


              <div className="text-[11px] text-slate-400 text-center font-medium">
                Clique em uma mídia para adicionar ou arraste-a até a timeline
              </div>

              {/* Media Asset List */}
              <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto pt-2">
                {mediaAssets.length === 0 ? (
                  <div className="border border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-center text-slate-400 gap-2 my-auto">
                    <Video className="w-8 h-8 opacity-30" />
                    <span className="text-xs">Nenhuma mídia importada ainda.</span>
                  </div>
                ) : (
                  mediaAssets.map((asset) => (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/x-nexohub-media", asset.id);
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      className="group relative border border-slate-200 hover:border-blue-400 bg-white rounded-xl p-2 flex items-center gap-3 transition-all cursor-grab active:cursor-grabbing shadow-xs"
                      onClick={() => addAssetToTimeline(asset)}
                      title="Clique para adicionar à timeline ou arraste para a faixa"
                    >
                      <div className="w-16 h-12 rounded-lg bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center relative">
                        {asset.thumbnail ? (
                          <img src={asset.thumbnail} alt={asset.name} className="w-full h-full object-cover" />
                        ) : asset.type === "video" ? (
                          <Video className="w-5 h-5 text-white/50" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-white/50" />
                        )}
                        <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-black/70 text-[9px] text-white font-mono">
                          {formatTime(asset.duration)}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-800 truncate" title={asset.name}>
                          {asset.name}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">
                          {asset.type === "video" ? "Vídeo" : "Imagem"} • {asset.width}x{asset.height}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          addAssetToTimeline(asset);
                        }}
                        className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-colors"
                        title="Adicionar à linha do tempo"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── TAB: BIBLIOTECA PERSISTENTE ── */}
          {activeTab === "biblioteca" && (
            <div className="p-4 flex flex-col gap-3 flex-1 min-h-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-800">Biblioteca</h3>
                  <p className="text-[10px] text-slate-500">Vídeos salvos na sua conta</p>
                </div>
                <button
                  type="button"
                  onClick={() => libraryInputRef.current?.click()}
                  disabled={isUploadingLibrary || !user?.id}
                  className="w-9 h-9 shrink-0 rounded-lg bg-[#0055ff] text-white flex items-center justify-center hover:bg-[#0047d4] disabled:opacity-50"
                  title="Salvar vídeo na biblioteca"
                  aria-label="Salvar vídeo na biblioteca"
                >
                  {isUploadingLibrary ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
                <input ref={libraryInputRef} type="file" accept="video/*" multiple className="hidden" onChange={handleLibraryUpload} />
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600 mb-2">
                  <span className="flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5" /> Espaço utilizado</span>
                  <span>{(libraryUsageBytes / (1024 * 1024)).toFixed(1)} / 50 MB</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${libraryUsageBytes >= VIDEO_LIBRARY_LIMIT ? "bg-red-500" : "bg-blue-600"}`} style={{ width: `${Math.min(100, (libraryUsageBytes / VIDEO_LIBRARY_LIMIT) * 100)}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-2">Os arquivos ficam salvos na nuvem e podem ser reutilizados em novas edições.</p>
              </div>

              {!user?.id ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">Entre na sua conta para usar a biblioteca persistente.</div>
              ) : libraryLoading ? (
                <div className="py-8 flex items-center justify-center text-slate-400 gap-2 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Carregando vídeos salvos…</div>
              ) : libraryAssets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-5 flex flex-col items-center text-center gap-2 text-slate-400">
                  <Folder className="w-8 h-8 opacity-40" />
                  <span className="text-xs">Sua biblioteca ainda está vazia.</span>
                  <span className="text-[10px]">Use o botão + para salvar vídeos de até 50 MB no total.</span>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                  {libraryAssets.map(asset => (
                    <div key={asset.id} className="border border-slate-200 rounded-xl p-2 flex items-center gap-2 group hover:border-blue-300">
                      {asset.thumbnail ? <img src={asset.thumbnail} alt="" className="w-14 h-10 object-cover rounded bg-slate-100 shrink-0" /> : <Video className="w-7 h-7 text-blue-500 shrink-0" />}
                      <button type="button" onClick={() => addLibraryAssetToTimeline(asset)} className="min-w-0 flex-1 text-left" title="Adicionar à timeline">
                        <span className="block text-[11px] font-bold text-slate-700 truncate">{asset.name}</span>
                        <span className="block text-[10px] text-slate-400">{(Math.max(0, asset.sizeBytes || 0) / (1024 * 1024)).toFixed(1)} MB · {formatTime(asset.duration)}</span>
                      </button>
                      <button type="button" onClick={() => void handleDeleteLibraryAsset(asset)} className="w-7 h-7 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center" title="Excluir da biblioteca" aria-label={`Excluir ${asset.name}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TAB: TEXTO ── */}
          {activeTab === "texto" && (
            <div className="p-4 flex flex-col gap-4 flex-1">
              <h3 className="text-base font-bold text-slate-800">Texto</h3>

              {/* O fluxo de cortes permite somente um texto por vídeo */}
              {textOverlays.length === 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddText("Título")}
                    className="py-2.5 px-3 rounded-xl border border-slate-200 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/50 text-xs font-bold text-slate-800 flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-600" />
                    + Texto
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddText("Subtítulo")}
                    className="py-2.5 px-3 rounded-xl border border-slate-200 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/50 text-xs font-bold text-slate-800 flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-600" />
                    + Texto menor
                  </button>
                </div>
              ) : (
                <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-[11px] text-blue-800">
                  Um texto já foi adicionado. Edite-o abaixo ou exclua-o para inserir outro.
                </div>
              )}

              {/* Text Customizer for selected text */}
              {currentSelectedText ? (
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Editar Texto Selecionado</span>
                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                      title="Excluir texto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Conteúdo</label>
                    <textarea
                      rows={2}
                      value={currentSelectedText.text}
                      onChange={(e) => updateSelectedText({ text: e.target.value })}
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Font Family */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Fonte</label>
                    <select
                      value={currentSelectedText.fontFamily}
                      onChange={(e) => updateSelectedText({ fontFamily: e.target.value })}
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white outline-none"
                    >
                      {FONT_OPTIONS.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Font Size & Weight */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Tamanho: {currentSelectedText.fontSize}px
                      </label>
                      <input
                        type="range"
                        min={16}
                        max={120}
                        value={currentSelectedText.fontSize}
                        onChange={(e) => updateSelectedText({ fontSize: Number(e.target.value) })}
                        className="w-full accent-blue-600"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Peso</label>
                      <select
                        value={currentSelectedText.fontWeight}
                        onChange={(e) => updateSelectedText({ fontWeight: e.target.value })}
                        className="w-full text-xs p-1.5 rounded-lg border border-slate-200 bg-white outline-none"
                      >
                        <option value="400">Normal (400)</option>
                        <option value="600">Semibold (600)</option>
                        <option value="700">Bold (700)</option>
                        <option value="900">Black (900)</option>
                      </select>
                    </div>
                  </div>

                  {/* Text Color & Background */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Cor Texto</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={currentSelectedText.color}
                          onChange={(e) => updateSelectedText({ color: e.target.value })}
                          className="w-8 h-8 rounded border border-slate-200 cursor-pointer p-0.5"
                        />
                        <span className="text-[11px] font-mono">{currentSelectedText.color}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Fundo / Tarja</label>
                      <select
                        value={currentSelectedText.bgColor}
                        onChange={(e) => updateSelectedText({ bgColor: e.target.value })}
                        className="w-full text-xs p-1.5 rounded-lg border border-slate-200 bg-white outline-none"
                      >
                        <option value="transparent">Transparente</option>
                        <option value="rgba(0,0,0,0.6)">Preto Translúcido</option>
                        <option value="#000000">Preto Sólido</option>
                        <option value="#0055ff">Azul Destaque</option>
                        <option value="#bef264">Verde Limão</option>
                      </select>
                    </div>
                  </div>

                  {/* Alignment */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Alinhamento</label>
                    <div className="grid grid-cols-3 gap-1">
                      {(["left", "center", "right"] as const).map(align => (
                        <button
                          key={align}
                          type="button"
                          onClick={() => updateSelectedText({ textAlign: align })}
                          className={`py-1 text-xs rounded border capitalize ${currentSelectedText.textAlign === align ? "bg-blue-600 text-white border-blue-600 font-bold" : "bg-white border-slate-200 text-slate-600"}`}
                        >
                          {align === "left" ? "Esq." : align === "center" ? "Centro" : "Dir."}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-slate-200 rounded-xl p-5 text-center text-slate-400 text-xs">
                  Selecione um bloco de texto na timeline ou adicione um novo para personalizar.
                </div>
              )}
            </div>
          )}

          {/* ── TAB: AJUSTES ── */}
          {activeTab === "ajustes" && (
            <div className="p-4 flex flex-col gap-4 flex-1">
              <h3 className="text-base font-bold text-slate-800">Ajustes do Projeto</h3>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Cor de Fundo (Canvas)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                  />
                  <span className="text-xs font-mono font-bold text-slate-700">{bgColor}</span>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <label className="text-xs font-bold text-slate-700 block mb-1">Resolução Ativa</label>
                <div className="text-xs text-slate-500">
                  {selectedAspect.name} ({selectedAspect.width} x {selectedAspect.height} px)
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-2">Formato de exportação</label>
                  <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <Video className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-800">MP4 · H.264</div>
                      <div className="text-[10px] text-slate-500">Compatível com redes sociais e players</div>
                    </div>
                    <Check className="w-4 h-4 text-blue-600 ml-auto shrink-0" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                    <div className="text-[10px] text-slate-500 mb-1">Bitrate de vídeo</div>
                    <div className="text-sm font-extrabold text-slate-800">5 Mbps</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                    <div className="text-[10px] text-slate-500 mb-1">Bitrate de áudio</div>
                    <div className="text-sm font-extrabold text-slate-800">96 kbps</div>
                  </div>
                </div>
                <p className="text-[10px] leading-relaxed text-slate-500">O render grava a prévia em tempo real e converte o arquivo para MP4 antes do download. Mantenha esta aba aberta até o término.</p>
              </div>
            </div>
          )}
        </aside>

        {/* ════════ CENTER PLAYER & CANVAS AREA ════════ */}
        <main className="flex-1 min-w-0 flex flex-col bg-[#e2e8f0]/40 relative overflow-hidden">
          {/* Canvas Container */}
          <div ref={previewContainerRef} className="flex-1 min-h-0 flex items-center justify-center p-6 relative">
            <div
              className="relative shadow-2xl rounded-lg overflow-hidden bg-black flex items-center justify-center"
              style={{
                aspectRatio: `${selectedAspect.ratio}`,
                maxHeight: "100%",
                maxWidth: "100%",
              }}
            >
              <canvas
                ref={canvasRef}
                className="w-full h-full object-contain block"
              />
            </div>
          </div>

          {/* Floating Player Toolbar (Directly beneath preview, matching reference image) */}
          <div className="h-12 flex items-center justify-center pb-2 shrink-0 z-10">
            <div className="inline-flex items-center gap-1 bg-white/95 backdrop-blur px-3 py-1.5 rounded-full border border-slate-200 shadow-sm text-xs font-semibold text-slate-700 relative">
              {/* Aspect Ratio Dropdown Trigger */}
              <button
                type="button"
                onClick={() => setIsAspectMenuOpen(!isAspectMenuOpen)}
                className="inline-flex items-center gap-2 hover:text-blue-600 px-2 py-1 rounded-md transition-colors"
              >
                <div className="w-3.5 h-3.5 border-2 border-current rounded-xs" />
                <span>{selectedAspect.name}</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              </button>

              {/* Aspect Ratio Menu Popover (Matching screenshot popup) */}
              {isAspectMenuOpen && (
                <div className="absolute bottom-full mb-2 left-0 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 flex flex-col gap-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                  {/* Search bar */}
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 mb-1">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Procurar..."
                      value={aspectSearch}
                      onChange={(e) => setAspectSearch(e.target.value)}
                      className="w-full bg-transparent text-xs outline-none"
                    />
                  </div>

                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Custom
                  </div>

                  <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto">
                    {ASPECT_RATIOS.filter(a => a.name.toLowerCase().includes(aspectSearch.toLowerCase())).map((aspect) => {
                      const isSelected = selectedAspect.id === aspect.id;
                      return (
                        <button
                          key={aspect.id}
                          type="button"
                          onClick={() => {
                            setSelectedAspect(aspect);
                            setIsAspectMenuOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-center gap-2.5 transition-colors ${isSelected ? "bg-slate-100 font-bold text-slate-900" : "hover:bg-slate-50 text-slate-600"}`}
                        >
                          <div className="w-3.5 h-3.5 border-2 border-slate-400 rounded-xs" />
                          <span className="flex-1">{aspect.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="border-t border-slate-100 pt-1 mt-1">
                    <button
                      type="button"
                      onClick={() => setIsAspectMenuOpen(false)}
                      className="w-full text-left px-2.5 py-2 rounded-xl text-xs text-blue-600 font-bold hover:bg-blue-50 flex items-center gap-2 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Redimensionar para as redes sociais</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* ════════ BOTTOM TIMELINE (Matching reference image) ════════ */}
      <footer className="h-64 border-t border-slate-200 bg-white flex flex-col shrink-0 z-10 overflow-hidden">
        {/* Timeline Control Bar (Dividir, Transport, Time, Zoom) */}
        <div className="h-11 border-b border-slate-200 px-4 flex items-center justify-between shrink-0 bg-slate-50/50">
          {/* Left: Dividir Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSplitClip}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-200/80 hover:text-slate-900 transition-colors"
              title="Cortar clipe na posição da agulha (S)"
            >
              <Scissors className="w-4 h-4 text-blue-600" />
              <span>Dividir</span>
            </button>

            {(selectedClipId || selectedTextId) && (
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                title="Excluir selecionado (Delete)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </button>
            )}
          </div>

          {/* Center: Transport & Time Code */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const prev = Math.max(0, currentTime - 1);
                setCurrentTime(prev);
                renderCanvasFrame(prev);
              }}
              className="p-1 text-slate-500 hover:text-slate-900 rounded"
              title="Recuar 1s"
            >
              ◀◀
            </button>

            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-7 h-7 rounded-full bg-slate-900 hover:bg-blue-600 text-white flex items-center justify-center transition-colors shadow-xs"
              title={isPlaying ? "Pausar (Espaço)" : "Reproduzir (Espaço)"}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                const next = Math.min(totalDuration, currentTime + 1);
                setCurrentTime(next);
                renderCanvasFrame(next);
              }}
              className="p-1 text-slate-500 hover:text-slate-900 rounded"
              title="Avançar 1s"
            >
              ▶▶
            </button>

            <span className="text-xs font-mono font-bold text-slate-700 ml-2">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>

            <div className="flex items-center gap-2 ml-3 pl-3 border-l border-slate-200">
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <button type="button" onClick={() => {
                  const next = Math.max(0, Math.min(currentTime, Math.max(0, contentDuration - 0.1)));
                  setExportStart(next);
                  if (exportEnd <= next) setExportEnd(Math.min(contentDuration, next + 1));
                }} className="rounded bg-blue-50 px-1.5 py-1 text-blue-700 hover:bg-blue-100" title="Marcar entrada na posição atual">I</button>
                Início
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, contentDuration)}
                  step={0.1}
                  value={exportStart}
                  onChange={(e) => {
                    const value = Math.max(0, Math.min(Number(e.target.value) || 0, contentDuration));
                    setExportStart(value);
                  }}
                  className="w-16 rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-mono font-normal text-slate-700 outline-none focus:border-blue-500"
                  aria-label="Ponto inicial da exportação em segundos"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <button type="button" onClick={() => {
                  const next = Math.max(exportStart + 0.1, Math.min(currentTime, contentDuration));
                  setExportEnd(next);
                  if (exportStart >= next) setExportStart(0);
                }} className="rounded bg-blue-50 px-1.5 py-1 text-blue-700 hover:bg-blue-100" title="Marcar saída na posição atual">O</button>
                Fim
                <input
                  type="number"
                  min={Math.max(0, exportStart)}
                  max={contentDuration}
                  step={0.1}
                  value={exportEnd}
                  onChange={(e) => {
                    const value = Math.max(exportStart, Math.min(Number(e.target.value) || 0, contentDuration));
                    setExportEnd(value);
                  }}
                  className="w-16 rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-mono font-normal text-slate-700 outline-none focus:border-blue-500"
                  aria-label="Ponto final da exportação em segundos"
                />
              </label>
            </div>
          </div>

          {/* Right: Zoom Controls & Em Forma */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(10, z - 5))}
              className="p-1 text-slate-400 hover:text-slate-700"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <input
              type="range"
              min={10}
              max={100}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-20 accent-blue-600"
            />

            <button
              type="button"
              onClick={() => setZoom(z => Math.min(100, z + 5))}
              className="p-1 text-slate-400 hover:text-slate-700"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setZoom(30)}
              className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 rounded-md transition-colors ml-1"
            >
              Em forma
            </button>
          </div>
        </div>

        {/* Tracks Area & Ruler */}
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden relative flex flex-col bg-white">
          {/* Time Ruler */}
          <div
            ref={timelineRulerRef}
            onMouseDown={handleRulerMouseDown}
            className="h-6 border-b border-slate-200 bg-slate-50/80 relative cursor-pointer select-none shrink-0"
            style={{ width: `${totalDuration * zoom + 120}px` }}
          >
            <div className="absolute top-0 bottom-0 bg-blue-100/70 border-l border-r border-blue-300 pointer-events-none" style={{ left: `${exportStart * zoom}px`, width: `${Math.max(0, exportEnd - exportStart) * zoom}px` }} title="Intervalo de renderização In/Out" />
            {Array.from({ length: Math.ceil(totalDuration / 6) + 1 }).map((_, i) => {
              const sec = i * 6;
              const left = sec * zoom;
              return (
                <div
                  key={sec}
                  className="absolute top-0 bottom-0 border-l border-slate-300 text-[10px] font-mono text-slate-400 pl-1 pt-0.5"
                  style={{ left: `${left}px` }}
                >
                  {sec >= 60 ? `${Math.floor(sec / 60)}m` : `${sec}s`}
                </div>
              );
            })}

            {/* Playhead Indicator Needle */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-30 pointer-events-none"
              style={{ left: `${currentTime * zoom}px` }}
            >
              <div className="w-3 h-3 bg-red-500 rounded-b-sm -translate-x-[5px]" />
            </div>
          </div>

          {/* Tracks Container */}
          <div
            className="flex-1 relative flex flex-col py-2 gap-2 overflow-y-auto"
            style={{ width: `${totalDuration * zoom + 120}px` }}
          >
            {/* Playhead Vertical Line across all tracks */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-30 pointer-events-none"
              style={{ left: `${currentTime * zoom}px` }}
            />

            {/* TRACK 1: TEXT OVERLAYS */}
            {textOverlays.length > 0 && (
              <div className="h-10 relative bg-slate-50/50 rounded-lg border border-slate-100 flex items-center">
                <div className="absolute left-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none z-10">
                  Textos
                </div>
                {textOverlays.map(textItem => {
                  const left = textItem.start * zoom;
                  const width = textItem.duration * zoom;
                  const isSelected = selectedTextId === textItem.id;
                  return (
                    <div
                      key={textItem.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTextId(textItem.id);
                        setSelectedClipId(null);
                        setActiveTab("texto");
                      }}
                      className={`absolute h-8 rounded-lg px-2 flex items-center gap-1.5 cursor-pointer transition-all ${isSelected ? "ring-2 ring-blue-500 bg-blue-500 text-white shadow-md z-20" : "bg-purple-600/90 text-white hover:bg-purple-600 z-10"}`}
                      style={{ left: `${left}px`, width: `${width}px` }}
                    >
                      <Type className="w-3 h-3 shrink-0" />
                      <span className="text-xs font-bold truncate">{textItem.text}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TRACK 2: VIDEO / IMAGE CLIPS */}
            <div
              className="h-20 relative bg-slate-50/50 rounded-xl border border-slate-100 flex items-center transition-colors"
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes("application/x-nexohub-media")) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                const assetId = event.dataTransfer.getData("application/x-nexohub-media");
                const asset = mediaAssets.find(item => item.id === assetId);
                if (asset) addAssetToTimeline(asset);
              }}
            >
              {clips.length === 0 ? (
                /* Empty state prompt matching reference screenshot */
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-full flex items-center justify-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar meios de comunicação a este projeto</span>
                </button>
              ) : (
                clips.map((clip) => {
                  const left = clip.start * zoom;
                  const width = clip.duration * zoom;
                  const isSelected = selectedClipId === clip.id;

                  return (
                    <div
                      key={clip.id}
                      onMouseDown={(event) => {
                        if (event.button !== 0) return;
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedClipId(clip.id);
                        setSelectedTextId(null);
                        setDraggingClip({ id: clip.id, initialX: event.clientX, initialStart: clip.start });
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedClipId(clip.id);
                        setSelectedTextId(null);
                      }}
                      className={`absolute h-16 rounded-xl overflow-hidden cursor-grab active:cursor-grabbing transition-all select-none group ${isSelected ? "ring-3 ring-blue-500 z-20 shadow-lg" : "ring-1 ring-black/10 hover:ring-slate-400 z-10"}`}
                      style={{
                        left: `${left}px`,
                        width: `${width}px`,
                        backgroundColor: clip.color,
                      }}
                    >
                      {/* Left Trim Handle */}
                      <div
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setSelectedClipId(clip.id);
                          setTrimmingClip({ id: clip.id, edge: "start", initialX: event.clientX, initialTime: clip.start, initialDur: clip.duration, initialMediaStart: clip.mediaStart });
                        }}
                        className="absolute left-0 top-0 bottom-0 w-3 bg-black/25 hover:bg-black/60 cursor-ew-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Segure e arraste para ajustar o início"
                      ><span className="w-0.5 h-5 rounded-full bg-white/90" /></div>

                      {/* Clip Content Thumbnail & Name */}
                      <div className="w-full h-full p-2 flex items-center gap-2 text-white relative">
                        {clip.thumbnail ? (
                          <img src={clip.thumbnail} alt="" className="w-12 h-10 object-cover rounded bg-black/40 shrink-0" />
                        ) : clip.type === "video" ? (
                          <Video className="w-5 h-5 shrink-0 opacity-70" />
                        ) : (
                          <ImageIcon className="w-5 h-5 shrink-0 opacity-70" />
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold truncate drop-shadow-sm">{clip.name}</div>
                          <div className="text-[10px] opacity-80 font-mono mt-0.5">
                            {formatTime(clip.duration)}
                          </div>
                        </div>
                      </div>

                      {/* Right Trim Handle */}
                      <div
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setSelectedClipId(clip.id);
                          setTrimmingClip({ id: clip.id, edge: "end", initialX: event.clientX, initialTime: clip.start, initialDur: clip.duration, initialMediaStart: clip.mediaStart });
                        }}
                        className="absolute right-0 top-0 bottom-0 w-3 bg-black/25 hover:bg-black/60 cursor-ew-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Segure e arraste para ajustar o fim"
                      ><span className="w-0.5 h-5 rounded-full bg-white/90" /></div>
                    </div>
                  );
                })
              )}
            </div>

            {/* TRACK 3: AUDIO WAVEFORM */}
            <div className="h-16 relative rounded-lg border border-[#344d32] bg-[#17251a] overflow-hidden">
              <div className="absolute left-0 right-0 bottom-1.5 border-t border-[#0b160d] pointer-events-none z-[1]" />
              {clips.filter(clip => clip.type === "video").map(clip => {
                const left = clip.start * zoom;
                const width = clip.duration * zoom;
                const peaks = clip.waveform || [];
                return (
                  <div key={`wave-${clip.id}`} className="absolute top-0 bottom-0 overflow-hidden flex items-end gap-0 px-0 opacity-100" style={{ left: `${left}px`, width: `${Math.max(2, width)}px` }} title={peaks.length ? "Forma de onda do áudio" : "Forma de onda indisponível para este codec"}>
                    {peaks.length ? peaks.map((peak, index) => {
                      const amplitude = Math.max(0.025, Math.min(1, peak));
                      return (
                        <span key={index} className="flex-1 min-w-[1px] bg-[#a8e889] border-t border-[#d5ffc1]/90" style={{ height: `${Math.max(2, amplitude * 53)}px`, minWidth: "1px", opacity: 0.96 }} />
                      );
                    }) : <span className="text-[9px] font-medium text-emerald-200 ml-2 self-center">Forma de onda indisponível para este vídeo</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </footer>

      {isNameDialogOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="render-name-title">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><Video className="w-5 h-5" /></div>
              <div>
                <h2 id="render-name-title" className="text-base font-extrabold text-slate-900">Nomeie seu projeto</h2>
                <p className="text-xs text-slate-500 mt-1">Esse nome será usado no arquivo MP4 exportado.</p>
              </div>
            </div>
            <input autoFocus value={exportNameDraft} onChange={event => setExportNameDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void handleExportVideo(exportNameDraft); if (event.key === "Escape") setIsNameDialogOpen(false); }} placeholder="Ex.: Chamada programa da manhã" maxLength={100} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            <div className="flex items-center justify-end gap-2 mt-4">
              <button type="button" onClick={() => setIsNameDialogOpen(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button type="button" disabled={!exportNameDraft.trim()} onClick={() => void handleExportVideo(exportNameDraft)} className="rounded-xl px-4 py-2 text-xs font-bold bg-[#0055ff] text-white hover:bg-[#0047d4] disabled:opacity-40 flex items-center gap-2"><Download className="w-3.5 h-3.5" /> Renderizar MP4</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
