import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Scissors, Play, Pause, RotateCcw, RotateCw, Download, Upload,
  Type, Video, Image as ImageIcon, Sliders, Settings, Search,
  ChevronDown, ZoomIn, ZoomOut, Maximize2, Trash2, Plus, Volume2,
  Home, Sparkles, Check, X, AlertCircle, Loader2
} from "lucide-react";
import { toast } from "sonner";

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
  file?: File;
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
  // Project settings
  const [projectName, setProjectName] = useState("Project Name");
  const [isEditingName, setIsEditingName] = useState(false);
  const [selectedAspect, setSelectedAspect] = useState<AspectPreset>(ASPECT_RATIOS[0]);
  const [isAspectMenuOpen, setIsAspectMenuOpen] = useState(false);
  const [aspectSearch, setAspectSearch] = useState("");
  const [bgColor, setBgColor] = useState("#000000");
  const [showBgPicker, setShowBgPicker] = useState(false);

  // Navigation / Sidebar
  const [activeTab, setActiveTab] = useState<"video" | "texto" | "ajustes">("video");
  const [activeMode, setActiveMode] = useState<"editar" | "home">("editar");

  // Media Library
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Canvas & Preview Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const timelineRulerRef = useRef<HTMLDivElement>(null);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(Date.now());

  // Compute total duration of the timeline
  const totalDuration = useMemo(() => {
    let maxTime = 60; // minimum ruler 60s
    clips.forEach(c => {
      const end = c.start + c.duration;
      if (end > maxTime) maxTime = end;
    });
    textOverlays.forEach(t => {
      const end = t.start + t.duration;
      if (end > maxTime) maxTime = end;
    });
    return Math.ceil(maxTime / 6) * 6; // snap to 6-second increments for ruler
  }, [clips, textOverlays]);

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
    };

    setClips(prev => [...prev, newClip]);
    setSelectedClipId(newClip.id);
    toast.success(`Adicionado à timeline: ${asset.name}`);
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
          if (Math.abs(vid.currentTime - clipInternalTime) > 0.15) {
            vid.currentTime = clipInternalTime;
          }

          // Draw video frame letterboxed/fitted
          const vidAspect = (vid.videoWidth || 16) / (vid.videoHeight || 9);
          const canvasAspect = width / height;
          let drawW = width;
          let drawH = height;
          let drawX = 0;
          let drawY = 0;

          if (vidAspect > canvasAspect) {
            drawW = width;
            drawH = width / vidAspect;
            drawY = (height - drawH) / 2;
          } else {
            drawH = height;
            drawW = height * vidAspect;
            drawX = (width - drawW) / 2;
          }

          ctx.drawImage(vid, drawX, drawY, drawW, drawH);
        }
      } else if (activeClip.type === "image") {
        const img = imageElementsRef.current.get(activeClip.url);
        if (img && img.complete) {
          const imgAspect = img.naturalWidth / img.naturalHeight;
          const canvasAspect = width / height;
          let drawW = width;
          let drawH = height;
          let drawX = 0;
          let drawY = 0;

          if (imgAspect > canvasAspect) {
            drawW = width;
            drawH = width / imgAspect;
            drawY = (height - drawH) / 2;
          } else {
            drawH = height;
            drawW = height * imgAspect;
            drawX = (width - drawW) / 2;
          }

          ctx.drawImage(img, drawX, drawY, drawW, drawH);
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
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingPlayhead, totalDuration, zoom, renderCanvasFrame]);

  // Export Video (Canvas + Audio to WebM / MP4)
  const handleExportVideo = async () => {
    if (clips.length === 0) {
      toast.error("Adicione pelo menos um vídeo ou imagem antes de exportar.");
      return;
    }

    setIsPlaying(false);
    setIsExporting(true);
    setExportProgress(0);

    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas indisponível");

      // Setup Canvas Stream at 30 FPS
      const stream = canvas.captureStream(30);

      // Setup Web Audio context for mixing audio tracks from active video clips
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();
      let hasAudio = false;

      // Connect video elements to audio destination
      videoElementsRef.current.forEach(vid => {
        try {
          const source = audioCtx.createMediaElementSource(vid);
          source.connect(dest);
          source.connect(audioCtx.destination);
          hasAudio = true;
        } catch {}
      });

      if (hasAudio && dest.stream.getAudioTracks().length > 0) {
        dest.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      }

      // Check supported MIME types
      let mimeType = "video/webm;codecs=vp9,opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/webm;codecs=vp8,opus";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "video/webm";
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = "video/mp4";
          }
        }
      }

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8000000, // 8 Mbps
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${projectName.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "corte_video"}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        setIsExporting(false);
        setExportProgress(100);
        toast.success("Vídeo exportado e baixado com sucesso!");
      };

      // Start recording
      recorder.start(100);

      // Render through the project step by step
      const exportFps = 30;
      const step = 1 / exportFps;
      const totalSteps = Math.ceil(totalDuration / step);
      let stepCount = 0;
      let renderTime = 0;

      const exportLoop = () => {
        if (renderTime >= totalDuration) {
          recorder.stop();
          return;
        }

        renderCanvasFrame(renderTime);
        setCurrentTime(renderTime);
        stepCount++;
        setExportProgress(Math.min(99, Math.round((stepCount / totalSteps) * 100)));
        renderTime += step;

        setTimeout(exportLoop, 1000 / exportFps);
      };

      exportLoop();
    } catch (err: any) {
      console.error("Export error:", err);
      setIsExporting(false);
      toast.error("Erro na exportação: " + (err.message || "Tente novamente."));
    }
  };

  // Find currently selected text
  const currentSelectedText = textOverlays.find(t => t.id === selectedTextId);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[#f8fafc] text-slate-900 select-none">
      {/* ════════ TOP HEADER BAR (Matching reference image) ════════ */}
      <header className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0 z-20">
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

        {/* Center: Home / Editar pill toggle */}
        <div className="flex items-center">
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-full border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveMode("home")}
              className={`p-1.5 rounded-full transition-all ${activeMode === "home" ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-800"}`}
              title="Home"
            >
              <Home className="w-4 h-4" />
            </button>
            <div className="h-3 w-[1px] bg-slate-300 mx-1" />
            <button
              type="button"
              onClick={() => setActiveMode("editar")}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${activeMode === "editar" ? "bg-white shadow-sm text-slate-900 font-bold" : "text-slate-500 hover:text-slate-800"}`}
            >
              Editar
            </button>
          </div>
        </div>

        {/* Right: Export Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExportVideo}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#0055ff] hover:bg-[#0047d4] transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Exportando... {exportProgress}%</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Exportar Vídeo</span>
              </>
            )}
          </button>
        </div>
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
        </nav>

        {/* Left Drawer / Tool Panel */}
        <aside className="w-72 border-r border-slate-200 bg-white flex flex-col shrink-0 overflow-y-auto">
          {/* ── TAB: VÍDEO / MÍDIA ── */}
          {activeTab === "video" && (
            <div className="p-4 flex flex-col gap-4 flex-1">
              <h3 className="text-base font-bold text-slate-800">Vídeo</h3>

              {/* Lime Green "+ Carregar" button matching reference image */}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,image/*"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 rounded-xl bg-[#bef264] hover:bg-[#a3e635] text-slate-900 font-extrabold text-sm flex items-center justify-center gap-2 transition-all shadow-sm active:scale-98"
              >
                <Upload className="w-4 h-4 text-slate-900 stroke-[2.5]" />
                <span>Carregar</span>
              </button>

              <div className="text-[11px] text-slate-400 text-center font-medium">
                Arraste vídeos ou imagens aqui (.mp4, .mov, .png, .jpg)
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
                      className="group relative border border-slate-200 hover:border-blue-400 bg-white rounded-xl p-2 flex items-center gap-3 transition-all cursor-pointer shadow-xs"
                      onClick={() => addAssetToTimeline(asset)}
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

          {/* ── TAB: TEXTO ── */}
          {activeTab === "texto" && (
            <div className="p-4 flex flex-col gap-4 flex-1">
              <h3 className="text-base font-bold text-slate-800">Texto</h3>

              {/* Add Text Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleAddText("Título")}
                  className="py-2.5 px-3 rounded-xl border border-slate-200 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/50 text-xs font-bold text-slate-800 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                  + Título
                </button>
                <button
                  type="button"
                  onClick={() => handleAddText("Subtítulo")}
                  className="py-2.5 px-3 rounded-xl border border-slate-200 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/50 text-xs font-bold text-slate-800 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                  + Subtítulo
                </button>
              </div>

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

              <div className="h-3.5 w-[1px] bg-slate-200 mx-1" />

              {/* Antecedentes (Background) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowBgPicker(!showBgPicker)}
                  className="inline-flex items-center gap-2 hover:text-blue-600 px-2 py-1 rounded-md transition-colors"
                >
                  <span className="w-3.5 h-3.5 rounded-full border border-slate-300" style={{ backgroundColor: bgColor }} />
                  <span>Antecedentes</span>
                </button>
                {showBgPicker && (
                  <div className="absolute bottom-full mb-2 left-0 bg-white p-3 rounded-xl shadow-xl border border-slate-200 flex flex-col gap-2 z-50">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Cor do Fundo</span>
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-28 h-8 rounded cursor-pointer"
                    />
                  </div>
                )}
              </div>

              <div className="h-3.5 w-[1px] bg-slate-200 mx-1" />

              {/* Definições (Settings) */}
              <button
                type="button"
                onClick={() => setActiveTab("ajustes")}
                className="inline-flex items-center gap-1.5 hover:text-blue-600 px-2 py-1 rounded-md transition-colors"
              >
                <Settings className="w-3.5 h-3.5 opacity-70" />
                <span>Definições</span>
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
            <div className="h-20 relative bg-slate-50/50 rounded-xl border border-slate-100 flex items-center">
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
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedClipId(clip.id);
                        setSelectedTextId(null);
                      }}
                      className={`absolute h-16 rounded-xl overflow-hidden cursor-pointer transition-all select-none group ${isSelected ? "ring-3 ring-blue-500 z-20 shadow-lg" : "ring-1 ring-black/10 hover:ring-slate-400 z-10"}`}
                      style={{
                        left: `${left}px`,
                        width: `${width}px`,
                        backgroundColor: clip.color,
                      }}
                    >
                      {/* Left Trim Handle */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-2.5 bg-black/20 hover:bg-black/50 cursor-ew-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Ajustar início"
                      />

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
                        className="absolute right-0 top-0 bottom-0 w-2.5 bg-black/20 hover:bg-black/50 cursor-ew-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Ajustar fim"
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
