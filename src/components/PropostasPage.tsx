import { useState, useEffect } from "react";
import { FileText, Plus, Check, Download, Send, Upload, Loader2, X, Eye, Image as ImageIcon, MessageSquare, Trash2, ChevronDown, Layout, Type, List, Pencil, DollarSign, GripVertical, AlignLeft, AlignCenter, AlignRight, Settings2, Type as TypeIcon, Copy, ClipboardCheck, Bold, Italic, Lock, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";

type Status = "rascunho" | "arte_final" | "aprovacao" | "concluido";

export default function PropostasPage() {
  const [propostas, setPropostas] = useState<any[]>([]);
  const [mockups, setMockups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProposta, setSelectedProposta] = useState<any>(null);
  const [selectedMockup, setSelectedMockup] = useState<any>(null);
  const [isEditingMockup, setIsEditingMockup] = useState(false);
  const [isNamingProject, setIsCreatingProject] = useState(false);
  const [tempMockup, setTempMockup] = useState<any>(null);
  const [formData, setFormData] = useState<any>({
    descricaoStyle: { color: "#ffffff", fontSize: 12, fontWeight: "400" },
    entregaComercialStyle: { color: "#ffffff", fontSize: 12, fontWeight: "400" },
    entregaDigitalStyle: { color: "#ffffff", fontSize: 12, fontWeight: "400" },
    valorStyle: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  });
  const [overlayY, setOverlayY] = useState(5); // % from top
  const [proposalItems, setProposalItems] = useState<any[]>([]);
  const [editingDigital, setEditingDigital] = useState<{ id: string, type: 'digital_1' | 'digital_2' } | null>(null);
  const [resizingItem, setResizingItem] = useState<{ id: string, startWidth: number, startX: number } | null>(null);
  const [resizingHeight, setResizingHeight] = useState<{ id: string, startHeight: number, startY: number } | null>(null);
  const [draggingItem, setDraggingItem] = useState<{ id: string, startX: number, startY: number, initialLeft: number, initialTop: number } | null>(null);
  const [copiedStyle, setCopiedStyle] = useState<any>(null);
  const [namingSection, setNamingSection] = useState<{ id: string, content: string } | null>(null);




  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startOverlayY, setStartOverlayY] = useState(5);
  const [uploadingArt, setUploadingArt] = useState(false);
  const [editingItemStyle, setEditingItemStyle] = useState<string | null>(null);

  const [customBg, setCustomBg] = useState<string | null>(null);
  const [uploadingBg, setUploadingBg] = useState(false);

  const handleUploadBg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBg(true);
    const fileName = `custom_bg_${Date.now()}.${file.name.split('.').pop()}`;
    const path = `backgrounds/${fileName}`;

    const { error: uploadError } = await supabase.storage.from("comercial").upload(path, file);

    if (uploadError) {
      toast.error("Erro ao enviar imagem de fundo");
      setUploadingBg(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("comercial").getPublicUrl(path);
    setCustomBg(publicUrl);
    setUploadingBg(false);
    toast.success("Imagem de fundo aplicada!");
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const { data: m } = await supabase.from("comercial_mockups").select("*");
    const { data: p } = await supabase.from("comercial_propostas").select("*, mockup:comercial_mockups(*)");
    setMockups(m || []);
    setPropostas(p || []);
    setIsLoading(false);
  };

  const handleCreateProposta = async () => {
    if (!selectedMockup) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data, error } = await supabase.from("comercial_propostas").insert({
      user_id: user.id,
      mockup_id: selectedMockup.id,
      title: formData.projeto || (formData.cliente ? `Proposta - ${formData.cliente}` : "Nova Proposta"),
      data: {
        ...formData,
        proposalItems,
        cliente: formData.cliente || "Cliente Não Informado"
      },
      status: "arte_final"
    }).select().single();

    if (error) {
      toast.error("Erro ao criar proposta");
    } else {
      toast.success("Proposta enviada para Arte Final!");
      setSelectedMockup(null);
      setFormData({});
      fetchData();
    }
  };

  const handleUploadArt = async (e: React.ChangeEvent<HTMLInputElement>, propostaId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingArt(true);
    const fileName = `${propostaId}_art_${Date.now()}.${file.name.split('.').pop()}`;
    const path = `artes/${fileName}`;

    const { error: uploadError } = await supabase.storage.from("comercial").upload(path, file);

    if (uploadError) {
      toast.error("Erro ao enviar arte");
      setUploadingArt(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("comercial").getPublicUrl(path);

    const { error: updateError } = await supabase.from("comercial_propostas").update({
      final_art_url: publicUrl,
      status: "aprovacao"
    }).eq("id", propostaId);

    if (updateError) {
      toast.error("Erro ao atualizar status");
    } else {
      toast.success("Arte enviada para aprovação!");
      fetchData();
      if (selectedProposta?.id === propostaId) {
        setSelectedProposta(prev => ({ ...prev, status: "aprovacao", final_art_url: publicUrl }));
      }
    }
    setUploadingArt(false);
  };

  const handleDeleteProposta = async (propostaId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta proposta? Esta ação não pode ser desfeita.")) return;

    const { error } = await supabase.from("comercial_propostas").delete().eq("id", propostaId);

    if (error) {
      toast.error("Erro ao excluir proposta");
    } else {
      toast.success("Proposta excluída com sucesso");
      fetchData();
      if (selectedProposta?.id === propostaId) {
        setSelectedProposta(null);
      }
    }
  };

  const handleApprove = async (propostaId: string) => {
    const { error } = await supabase.from("comercial_propostas").update({
      status: "concluido"
    }).eq("id", propostaId);

    if (error) {
      toast.error("Erro ao aprovar proposta");
    } else {
      toast.success("Proposta aprovada!");
      fetchData();
      if (selectedProposta?.id === propostaId) {
        setSelectedProposta(prev => ({ ...prev, status: "concluido" }));
      }
    }
  };

  const downloadPNG = async () => {
    const element = document.getElementById("proposal-render");
    if (!element) return;
    const canvas = await html2canvas(element, { useCORS: true, scale: 2 });
    const link = document.createElement("a");
    link.download = `${selectedProposta.title}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const downloadPDF = async () => {
    const element = document.getElementById("proposal-render");
    if (!element) return;
    const canvas = await html2canvas(element, { useCORS: true, scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: [canvas.width, canvas.height]
    });
    pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save(`${selectedProposta.title}.pdf`);
  };

  const shareWhatsApp = async () => {
    const text = encodeURIComponent(`Olá, segue a proposta comercial: ${selectedProposta.title}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const getStatusBadge = (status: Status) => {
    switch (status) {
      case "rascunho": return <Badge variant="outline">Rascunho</Badge>;
      case "arte_final": return <Badge className="bg-orange-500">Arte Final</Badge>;
      case "aprovacao": return <Badge style={{ backgroundColor: "var(--layout-accent-hex, #0ea5e9)", color: "white" }}>Aprovação</Badge>;
      case "concluido": return <Badge style={{ backgroundColor: "var(--layout-accent-hex, #0ea5e9)", color: "white" }}>Aprovado</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-sm font-bold uppercase" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Propostas Comerciais</h2>
            <p className="text-[11px] mt-0.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Crie e gerencie suas propostas</p>
          </div>

          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  className="h-9 text-xs"
                  style={{ backgroundColor: "var(--layout-accent-hex, #0ea5e9)", color: "white" }}
                >
                  <Plus size={14} className="mr-1" />
                  NOVA PROPOSTA
                  <ChevronDown size={14} className="ml-1 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-1.5" align="start" style={{ backgroundColor: "var(--layout-widget-bg, #ffffff)", border: "1px solid var(--layout-border-color, #e2e8f0)" }}>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 px-2 pt-1">Selecione um mockup:</p>
                <div className="flex flex-col gap-0.5">
                  {mockups.map(m => (
                    <button 
                      key={m.id} 
                      onClick={() => { setTempMockup(m); setIsCreatingProject(true); setIsEditingMockup(false); }}
                      className="flex items-center justify-between group px-3 py-2.5 rounded-md transition-all hover:bg-sky-500/10 text-left"
                      style={{ color: "var(--layout-widget-text, #1a1a1a)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--layout-accent-hex, #0ea5e9)22";
                        e.currentTarget.style.color = "var(--layout-accent-hex, #0ea5e9)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = "var(--layout-widget-text, #1a1a1a)";
                      }}
                    >
                      <span className="text-[11px] font-bold uppercase truncate">{m.name}</span>
                      <Plus size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  className="h-9 text-xs"
                  style={{ 
                    backgroundColor: "var(--layout-widget-bg, #ffffff)",
                    borderColor: "var(--layout-border-color, #e2e8f0)",
                    color: "var(--layout-widget-text, #1a1a1a)"
                  }}
                >
                  MOCKUPS
                  <ChevronDown size={14} className="ml-1 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-1.5" align="start" style={{ backgroundColor: "var(--layout-widget-bg, #ffffff)", border: "1px solid var(--layout-border-color, #e2e8f0)" }}>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 px-2 pt-1">Gerenciar Mockups:</p>
                <div className="flex flex-col gap-0.5">
                  <button 
                    onClick={() => {
                      const name = prompt("Nome do novo mockup:");
                      if (name) {
                        const newMockup = { 
                          id: `temp-${Date.now()}`, 
                          name, 
                          image_url: '/mockup-bg-v5.png',
                          config: { overlayY: 5 }
                        };
                        setMockups([...mockups, newMockup]);
                        setSelectedMockup(newMockup);
                        setIsEditingMockup(true);
                        setOverlayY(5);
                        setProposalItems([]);
                        setCustomBg(null);
                      }
                    }}
                    className="flex items-center justify-between group px-3 py-2.5 rounded-md transition-all text-left w-full"
                    style={{ color: "var(--layout-widget-text, #1a1a1a)" }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--layout-accent-hex, #0ea5e9)22"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <span className="text-[11px] font-bold uppercase">Criar Novo Mockup</span>
                    <Plus size={12} />
                  </button>
                  <div className="border-t my-1 border-slate-100" />
                  {mockups.map(m => (
                    <button 
                      key={m.id} 
                      onClick={() => { 
                        setSelectedMockup(m);
                        setIsEditingMockup(true);
                        setOverlayY(m.config?.overlayY || 5);
                        setProposalItems(m.config?.proposalItems || []);
                        setCustomBg(m.image_url);
                      }}
                      className="flex items-center justify-between group px-3 py-2.5 rounded-md transition-all text-left"
                      style={{ color: "var(--layout-widget-text, #1a1a1a)" }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--layout-accent-hex, #0ea5e9)22"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                    >
                      <span className="text-[11px] font-bold uppercase truncate">{m.name}</span>
                      <span className="text-[9px] opacity-50 uppercase">Editar</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      <Dialog open={isNamingProject} onOpenChange={setIsCreatingProject}>
        <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden border-none shadow-2xl rounded-2xl">
          <div className="p-8 space-y-6" style={{ backgroundColor: "var(--layout-widget-bg, #ffffff)" }}>
            <div className="space-y-2 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "var(--layout-accent-hex, #0ea5e9)15" }}>
                <FileText size={24} style={{ color: "var(--layout-accent-hex, #0ea5e9)" }} />
              </div>
              <DialogTitle className="text-lg font-black uppercase tracking-tight" style={{ color: "var(--layout-widget-text, #1a1a1a)" }}>
                Nomear Nova Proposta
              </DialogTitle>
              <p className="text-xs opacity-60" style={{ color: "var(--layout-widget-text, #1a1a1a)" }}>
                Identifique seu projeto para facilitar o gerenciamento posterior.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider opacity-70" style={{ color: "var(--layout-widget-text, #1a1a1a)" }}>Título do Projeto</Label>
                <Input 
                  placeholder="Ex: Campanha Verão 2024 - Cliente XPTO" 
                  value={formData.projeto || ""}
                  onChange={e => setFormData({...formData, projeto: e.target.value})}
                  className="h-12 text-sm bg-slate-500/5 border-slate-200 focus:ring-0 focus:ring-offset-0 focus:border-sky-500 transition-all"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button 
                  variant="ghost" 
                  className="flex-1 h-11 text-[11px] font-bold uppercase" 
                  onClick={() => setIsCreatingProject(false)}
                >
                  Cancelar
                </Button>
                <Button 
                  className="flex-[2] h-11 text-[11px] font-bold uppercase shadow-lg transition-transform active:scale-95" 
                  style={{ 
                    backgroundColor: "var(--layout-accent-hex, #0ea5e9)",
                    color: "white" 
                  }}
                  onClick={() => {
                    if (!formData.projeto) {
                      toast.error("Por favor, digite um nome para o projeto");
                      return;
                    }
                    setSelectedMockup(tempMockup);
                    setIsCreatingProject(false);
                  }}
                >
                  <Check size={16} className="mr-2" />
                  Iniciar Edição
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="animate-spin" style={{ color: "var(--layout-accent-hex, #0ea5e9)" }} /></div>
      ) : selectedMockup ? (
        <div className="animate-in fade-in zoom-in-95 duration-500 bg-slate-200 p-4 md:p-8 rounded-2xl border-4 border-dashed border-slate-300 min-h-[700px] flex flex-col items-center relative overflow-hidden group/overlay">
          {/* Mockup Toolbar */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3 p-3 bg-white/90 backdrop-blur shadow-2xl rounded-2xl border border-white/50">
            <div 
              draggable 
              onDragStart={(e) => e.dataTransfer.setData("type", "section")}
              className="p-3 bg-slate-50 hover:bg-sky-500 hover:text-white rounded-xl transition-all cursor-grab active:cursor-grabbing group/tool relative"
              title="CRIAR SEÇÃO"
            >
              <Layout size={20} />
              <span className="absolute left-full ml-3 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover/tool:opacity-100 whitespace-nowrap pointer-events-none transition-opacity font-bold uppercase">CRIAR SEÇÃO</span>
            </div>
            <div 
              draggable 
              onDragStart={(e) => e.dataTransfer.setData("type", "text")}
              className="p-3 bg-slate-50 hover:bg-sky-500 hover:text-white rounded-xl transition-all cursor-grab active:cursor-grabbing group/tool relative"
              title="CAMPO DE TEXTO"
            >
              <Type size={20} />
              <span className="absolute left-full ml-3 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover/tool:opacity-100 whitespace-nowrap pointer-events-none transition-opacity font-bold uppercase">CAMPO DE TEXTO</span>
            </div>
            <div 
              draggable 
              onDragStart={(e) => e.dataTransfer.setData("type", "commercial_line")}
              className="p-3 bg-slate-50 hover:bg-sky-500 hover:text-white rounded-xl transition-all cursor-grab active:cursor-grabbing group/tool relative"
              title="LINHA COMERCIAL"
            >
              <List size={20} />
              <span className="absolute left-full ml-3 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover/tool:opacity-100 whitespace-nowrap pointer-events-none transition-opacity font-bold uppercase">LINHA COMERCIAL</span>
            </div>
            <div 
              draggable 
              onDragStart={(e) => e.dataTransfer.setData("type", "digital_1")}
              className="p-3 bg-slate-50 hover:bg-sky-500 hover:text-white rounded-xl transition-all cursor-grab active:cursor-grabbing group/tool relative"
              title="DIGITAL 1"
            >
              <div className="relative">
                <Layout size={20} />
                <Pencil size={10} className="absolute -bottom-1 -right-1" />
              </div>
              <span className="absolute left-full ml-3 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover/tool:opacity-100 whitespace-nowrap pointer-events-none transition-opacity font-bold uppercase">DIGITAL 1</span>
            </div>
            <div 
              draggable 
              onDragStart={(e) => e.dataTransfer.setData("type", "digital_2")}
              className="p-3 bg-slate-50 hover:bg-sky-500 hover:text-white rounded-xl transition-all cursor-grab active:cursor-grabbing group/tool relative"
              title="DIGITAL 2"
            >
              <div className="relative">
                <Layout size={20} className="opacity-70" />
                <Pencil size={10} className="absolute -bottom-1 -right-1" />
              </div>
              <span className="absolute left-full ml-3 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover/tool:opacity-100 whitespace-nowrap pointer-events-none transition-opacity font-bold uppercase">DIGITAL 2</span>
            </div>
            <div 
              draggable 
              onDragStart={(e) => e.dataTransfer.setData("type", "value")}
              className="p-3 bg-slate-50 hover:bg-sky-500 hover:text-white rounded-xl transition-all cursor-grab active:cursor-grabbing group/tool relative"
              title="VALOR"
            >
              <DollarSign size={20} />
              <span className="absolute left-full ml-3 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover/tool:opacity-100 whitespace-nowrap pointer-events-none transition-opacity font-bold uppercase">VALOR</span>
            </div>
          </div>

          <div className="absolute top-4 right-4 z-20 flex gap-2">
            <Label 
              htmlFor="bg-upload" 
              className="p-2 bg-white/80 hover:bg-white rounded-full shadow-md text-slate-500 transition-all cursor-pointer flex items-center justify-center"
              title="Trocar imagem de fundo"
            >
              {uploadingBg ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
              <input 
                id="bg-upload" 
                type="file" 
                className="hidden" 
                accept="image/*" 
                onChange={handleUploadBg} 
                disabled={uploadingBg}
              />
            </Label>
            <button 
              onClick={() => setSelectedMockup(null)} 
              className="p-2 bg-white/80 hover:bg-white rounded-full shadow-md text-slate-500 transition-all"
              title="Cancelar edição"
            >
              <X size={20} />
            </button>
          </div>

          <div className="w-full max-w-[1400px] mx-auto flex flex-col items-center">
            <div 
              className="bg-white shadow-2xl relative overflow-hidden w-full h-auto"
              style={{ 
                aspectRatio: "1920 / 1080",
              }}
            >
              {/* Fundo da Proposta - Imagem Default e Temporária */}
              <div 
                className="absolute inset-0 w-full h-full"
                style={{ 
                  backgroundImage: `url('${customBg || '/mockup-bg-v5.png'}')`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }}
              />

              {/* Editable Overlay */}
              <div 
                className="absolute inset-0 flex flex-col pointer-events-auto"
                style={{ paddingTop: `${overlayY}%` }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const type = e.dataTransfer.getData("type");
                  if (type) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    
                    const newItem = {
                      id: `item-${Date.now()}`,
                      type,
                      content: type === 'commercial_line' ? { qty: '', time: '', desc: '' } : '',
                      style: { 
                        color: "#ffffff", 
                        fontSizeVw: 1.2,
                        fontWeight: "400",
                        width: type === 'value' ? 15 : 40,
                        height: type === 'text' ? 5 : (type === 'section' ? 2 : 'auto'),
                        left: Math.max(0, Math.min(90, x)),
                        top: Math.max(0, Math.min(90, y)),
                        textAlign: 'left',
                        padding: 0.5,
                        borderRadius: 0,
                        backgroundColor: type === 'section' ? '#ffffff' : 'transparent',
                        borderColor: 'transparent',
                        borderWidth: 0,
                      }
                    };
                    setProposalItems([...proposalItems, newItem]);
                  }
                }}
                onMouseMove={(e) => {
                  if (resizingItem) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const currentX = ((e.clientX - rect.left) / rect.width) * 100;
                    const deltaX = currentX - resizingItem.startX;
                    const newWidth = Math.max(5, resizingItem.startWidth + deltaX);
                    
                    setProposalItems(prev => prev.map(item => 
                      item.id === resizingItem.id 
                        ? { ...item, style: { ...item.style, width: newWidth } }
                        : item
                    ));
                  }
                  if (resizingHeight) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const currentY = ((e.clientY - rect.top) / rect.height) * 100;
                    const deltaY = currentY - resizingHeight.startY;
                    const newHeight = Math.max(2, resizingHeight.startHeight + deltaY);
                    
                    setProposalItems(prev => prev.map(item => 
                      item.id === resizingHeight.id 
                        ? { ...item, style: { ...item.style, height: newHeight } }
                        : item
                    ));
                  }
                  if (draggingItem) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const currentX = ((e.clientX - rect.left) / rect.width) * 100;
                    const currentY = ((e.clientY - rect.top) / rect.height) * 100;
                    const deltaX = currentX - draggingItem.startX;
                    const deltaY = currentY - draggingItem.startY;
                    
                    setProposalItems(prev => prev.map(item => 
                      item.id === draggingItem.id && !item.locked 
                        ? { ...item, style: { 
                            ...item.style, 
                            left: Math.max(0, Math.min(100 - (item.style.width || 0), draggingItem.initialLeft + deltaX)),
                            top: Math.max(0, Math.min(100, draggingItem.initialTop + deltaY))
                          }}
                        : item
                    ));
                  }
                }}
                onMouseUp={() => {
                  setResizingItem(null);
                  setResizingHeight(null);
                  setDraggingItem(null);
                }}
              >
                <div 
                  className="absolute top-0 left-0 right-0 h-8 cursor-ns-resize hover:bg-sky-500/20 flex items-center justify-center transition-colors z-10"
                  onMouseDown={(e) => {
                    setIsDragging(true);
                    setStartY(e.clientY);
                    setStartOverlayY(overlayY);
                  }}
                >
                  <GripVertical size={16} className="text-sky-500 rotate-90" />
                </div>

                <div className="w-full h-full relative">
                  {proposalItems.length === 0 && (
                    <div className="h-full flex items-center justify-center border-2 border-dashed border-white/20 rounded-2xl mx-[5%]">
                      <p className="text-white/40 text-[1.5vw] font-bold uppercase">Arraste as ferramentas para aqui</p>
                    </div>
                  )}
                  
                  {proposalItems.map((item, index) => (
                    <div 
                      key={item.id} 
                      className="absolute group/item border-none shadow-none"
                      style={{ 
                        left: `${item.style.left}%`, 
                        top: `${item.style.top}%`,
                        width: `${item.style.width}%`,
                        zIndex: draggingItem?.id === item.id ? 50 : 10,
                        backgroundColor: 'transparent',
                        background: 'none'
                      }}
                    >
                      {/* Controls */}
                      <div className="absolute -top-8 left-0 opacity-0 group-hover/item:opacity-100 transition-opacity flex gap-1 z-50 bg-black/60 p-1 rounded-t-lg">
                        <div 
                          className={`p-1 bg-sky-500 rounded cursor-move ${item.locked ? 'opacity-30 cursor-not-allowed grayscale' : ''}`}
                          onMouseDown={(e) => {
                            if (item.locked) return;
                            e.stopPropagation();
                            const rect = e.currentTarget.closest('.pointer-events-auto')?.getBoundingClientRect();
                            if (!rect) return;
                            setDraggingItem({
                              id: item.id,
                              startX: ((e.clientX - rect.left) / rect.width) * 100,
                              startY: ((e.clientY - rect.top) / rect.height) * 100,
                              initialLeft: item.style.left,
                              initialTop: item.style.top
                            });
                          }}
                        >
                          <GripVertical size={12} className="text-white" />
                        </div>
                        <Popover open={editingItemStyle === item.id} onOpenChange={(open) => setEditingItemStyle(open ? item.id : null)}>
                          <PopoverTrigger asChild>
                            <button className="p-1 bg-slate-600 rounded text-white">
                              <Settings2 size={12} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-3 space-y-4 bg-slate-900 border-slate-700 text-white">
                            <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2">
                              <span className="text-[10px] font-bold uppercase opacity-50">Estilo do Item</span>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => {
                                    const newItems = [...proposalItems];
                                    newItems[index].locked = !newItems[index].locked;
                                    setProposalItems(newItems);
                                    toast.success(newItems[index].locked ? "Item bloqueado!" : "Item desbloqueado!");
                                  }}
                                  className={`p-1.5 hover:bg-slate-800 rounded transition-colors ${item.locked ? 'text-amber-400' : 'text-white'}`}
                                  title={item.locked ? "Desbloquear Item" : "Bloquear Item"}
                                >
                                  {item.locked ? <Lock size={12} /> : <Unlock size={12} />}
                                </button>
                                 {item.type === 'section' && (
                                  <button 
                                    onClick={() => {
                                      setNamingSection({ id: item.id, content: item.content || "" });
                                    }}
                                    className="p-1.5 hover:bg-slate-800 rounded transition-colors text-white"
                                    title="Nomear Seção"
                                  >
                                    <TypeIcon size={12} />
                                  </button>
                                )}
                                <button 
                                  onClick={() => {
                                    setCopiedStyle({
                                      fontFamily: item.style.fontFamily,
                                      fontSizeVw: item.style.fontSizeVw,
                                      color: item.style.color,
                                      textAlign: item.style.textAlign,
                                      padding: item.style.padding,
                                      fontWeight: item.style.fontWeight,
                                      fontStyle: item.style.fontStyle,
                                      borderRadius: item.style.borderRadius,
                                      backgroundColor: item.style.backgroundColor,
                                      borderColor: item.style.borderColor,
                                      borderWidth: item.style.borderWidth
                                    });
                                    toast.success("Estilo copiado!");
                                  }}
                                  className="p-1.5 hover:bg-slate-800 rounded transition-colors text-white"
                                  title="Copiar Estilo"
                                >
                                  <Copy size={12} />
                                </button>
                                <button 
                                  onClick={() => {
                                    if (!copiedStyle) {
                                      toast.error("Nenhum estilo copiado");
                                      return;
                                    }
                                    const newItems = [...proposalItems];
                                    newItems[index].style = {
                                      ...newItems[index].style,
                                      ...copiedStyle
                                    };
                                    setProposalItems(newItems);
                                    toast.success("Estilo aplicado!");
                                  }}
                                  className={`p-1.5 hover:bg-slate-800 rounded transition-colors ${!copiedStyle ? 'opacity-30 cursor-not-allowed' : 'text-sky-400'}`}
                                  title="Colar Estilo"
                                  disabled={!copiedStyle}
                                >
                                  <ClipboardCheck size={12} />
                                </button>
                              </div>
                            </div>
                            <div className="space-y-4">
                              {item.type !== 'section' ? (
                                <>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase opacity-50">Estilo do Texto</label>
                                    <div className="flex gap-1">
                                      <button
                                        onClick={() => {
                                          const newItems = [...proposalItems];
                                          newItems[index].style.fontWeight = item.style.fontWeight === 'bold' ? 'normal' : 'bold';
                                          setProposalItems(newItems);
                                        }}
                                        className={`flex-1 p-1.5 rounded flex justify-center ${item.style.fontWeight === 'bold' ? 'bg-sky-500' : 'bg-slate-800 hover:bg-slate-700'}`}
                                      >
                                        <Bold size={14} />
                                      </button>
                                      <button
                                        onClick={() => {
                                          const newItems = [...proposalItems];
                                          newItems[index].style.fontStyle = item.style.fontStyle === 'italic' ? 'normal' : 'italic';
                                          setProposalItems(newItems);
                                        }}
                                        className={`flex-1 p-1.5 rounded flex justify-center ${item.style.fontStyle === 'italic' ? 'bg-sky-500' : 'bg-slate-800 hover:bg-slate-700'}`}
                                      >
                                        <Italic size={14} />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase opacity-50">Fonte</label>
                                    <select 
                                      value={item.style.fontFamily || 'Inter'}
                                      onChange={(e) => {
                                        const newItems = [...proposalItems];
                                        newItems[index].style.fontFamily = e.target.value;
                                        setProposalItems(newItems);
                                      }}
                                      className="w-full bg-slate-800 border-none text-[11px] rounded p-1.5 focus:ring-1 focus:ring-sky-500"
                                    >
                                      {['Inter', 'Roboto', 'Montserrat', 'Open Sans', 'Poppins', 'Playfair Display', 'Oswald'].map(f => (
                                        <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase opacity-50">Tamanho (vw)</label>
                                    <div className="flex items-center gap-2">
                                      <input 
                                        type="range" min="0.5" max="5" step="0.1"
                                        value={item.style.fontSizeVw || (item.type === 'value' ? 1.8 : 1.0)}
                                        onChange={(e) => {
                                          const newItems = [...proposalItems];
                                          newItems[index].style.fontSizeVw = parseFloat(e.target.value);
                                          setProposalItems(newItems);
                                        }}
                                        className="flex-1 accent-sky-500"
                                      />
                                      <span className="text-[10px] w-8 text-right">{(item.style.fontSizeVw || (item.type === 'value' ? 1.8 : 1.0)).toFixed(1)}</span>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase opacity-50">Cor do Fundo</label>
                                    <div className="flex gap-2">
                                      <input 
                                        type="color"
                                        value={item.style.backgroundColor || "#ffffff"}
                                        onChange={(e) => {
                                          const newItems = [...proposalItems];
                                          newItems[index].style.backgroundColor = e.target.value;
                                          setProposalItems(newItems);
                                        }}
                                        className="flex-1 h-8 bg-slate-800 rounded p-0.5 cursor-pointer border-none"
                                      />
                                      <button 
                                        onClick={() => {
                                          const newItems = [...proposalItems];
                                          newItems[index].style.backgroundColor = 'transparent';
                                          setProposalItems(newItems);
                                        }}
                                        className="px-2 bg-slate-800 rounded text-[10px] uppercase font-bold"
                                      >
                                        Transp.
                                      </button>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase opacity-50">Cor do Texto</label>
                                    <div className="flex gap-2">
                                      <input 
                                        type="color"
                                        value={item.style.color || "#ffffff"}
                                        onChange={(e) => {
                                          const newItems = [...proposalItems];
                                          newItems[index].style.color = e.target.value;
                                          setProposalItems(newItems);
                                        }}
                                        className="flex-1 h-8 bg-slate-800 rounded p-0.5 cursor-pointer border-none"
                                      />
                                      <input 
                                        type="text"
                                        value={item.style.color || "#ffffff"}
                                        onChange={(e) => {
                                          const newItems = [...proposalItems];
                                          newItems[index].style.color = e.target.value;
                                          setProposalItems(newItems);
                                        }}
                                        className="w-16 bg-slate-800 text-[10px] rounded px-1 border-none uppercase"
                                      />
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase opacity-50">Título (Fonte e Tamanho)</label>
                                    <div className="flex gap-2">
                                      <select 
                                        value={item.style.fontFamily || 'Inter'}
                                        onChange={(e) => {
                                          const newItems = [...proposalItems];
                                          newItems[index].style.fontFamily = e.target.value;
                                          setProposalItems(newItems);
                                        }}
                                        className="flex-1 bg-slate-800 border-none text-[11px] rounded p-1.5 focus:ring-1 focus:ring-sky-500"
                                      >
                                        {['Inter', 'Roboto', 'Montserrat', 'Open Sans', 'Poppins', 'Playfair Display', 'Oswald'].map(f => (
                                          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                                        ))}
                                      </select>
                                      <input 
                                        type="number"
                                        min="0.5" max="5" step="0.1"
                                        value={item.style.fontSizeVw || 1.2}
                                        onChange={(e) => {
                                          const newItems = [...proposalItems];
                                          newItems[index].style.fontSizeVw = parseFloat(e.target.value);
                                          setProposalItems(newItems);
                                        }}
                                        className="w-12 bg-slate-800 text-[11px] rounded px-1 border-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase opacity-50">Cantos Arredondados (px)</label>
                                    <input 
                                      type="range" min="0" max="100" step="1"
                                      value={item.style.borderRadius || 0}
                                      onChange={(e) => {
                                        const newItems = [...proposalItems];
                                        newItems[index].style.borderRadius = parseInt(e.target.value);
                                        setProposalItems(newItems);
                                      }}
                                      className="w-full accent-sky-500"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase opacity-50">Cor do Fundo</label>
                                    <div className="flex gap-2">
                                      <input 
                                        type="color"
                                        value={item.style.backgroundColor || "#ffffff"}
                                        onChange={(e) => {
                                          const newItems = [...proposalItems];
                                          newItems[index].style.backgroundColor = e.target.value;
                                          setProposalItems(newItems);
                                        }}
                                        className="flex-1 h-8 bg-slate-800 rounded p-0.5 cursor-pointer border-none"
                                      />
                                      <button 
                                        onClick={() => {
                                          const newItems = [...proposalItems];
                                          newItems[index].style.backgroundColor = 'transparent';
                                          setProposalItems(newItems);
                                        }}
                                        className="px-2 bg-slate-800 rounded text-[10px] uppercase font-bold"
                                      >
                                        Transp.
                                      </button>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase opacity-50">Borda (Cor e Espessura)</label>
                                    <div className="flex gap-2">
                                      <input 
                                        type="color"
                                        value={item.style.borderColor || "transparent"}
                                        onChange={(e) => {
                                          const newItems = [...proposalItems];
                                          newItems[index].style.borderColor = e.target.value;
                                          if (!item.style.borderWidth) newItems[index].style.borderWidth = 1;
                                          setProposalItems(newItems);
                                        }}
                                        className="flex-1 h-8 bg-slate-800 rounded p-0.5 cursor-pointer border-none"
                                      />
                                      <input 
                                        type="number"
                                        min="0" max="20"
                                        value={item.style.borderWidth || 0}
                                        onChange={(e) => {
                                          const newItems = [...proposalItems];
                                          newItems[index].style.borderWidth = parseInt(e.target.value);
                                          setProposalItems(newItems);
                                        }}
                                        className="w-12 bg-slate-800 text-[11px] rounded px-1 border-none"
                                      />
                                    </div>
                                  </div>
                                </>
                              )}
                              
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase opacity-50">Alinhamento</label>
                                <div className="flex gap-1">
                                  {(['left', 'center', 'right'] as const).map((align) => (
                                    <button
                                      key={align}
                                      onClick={() => {
                                        const newItems = [...proposalItems];
                                        newItems[index].style.textAlign = align;
                                        setProposalItems(newItems);
                                      }}
                                      className={`flex-1 p-1.5 rounded flex justify-center ${item.style.textAlign === align ? 'bg-sky-500' : 'bg-slate-800 hover:bg-slate-700'}`}
                                    >
                                      {align === 'left' && <AlignLeft size={14} />}
                                      {align === 'center' && <AlignCenter size={14} />}
                                      {align === 'right' && <AlignRight size={14} />}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase opacity-50">Espaçamento (vw)</label>
                                <input 
                                  type="range" min="0" max="5" step="0.1"
                                  value={item.style.padding || 0.5}
                                  onChange={(e) => {
                                    const newItems = [...proposalItems];
                                    newItems[index].style.padding = parseFloat(e.target.value);
                                    setProposalItems(newItems);
                                  }}
                                  className="w-full accent-sky-500"
                                />
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <button 
                          onClick={() => setProposalItems(proposalItems.filter(i => i.id !== item.id))}
                          className="p-1 bg-red-500 rounded text-white"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {/* Resize Handle Width */}
                      {!item.locked && (
                        <div 
                          className="absolute -right-1 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover/item:opacity-100 bg-sky-500/50 hover:bg-sky-500 transition-all z-50"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.closest('.pointer-events-auto')?.getBoundingClientRect();
                            if (!rect) return;
                            setResizingItem({
                              id: item.id,
                              startWidth: item.style.width,
                              startX: ((e.clientX - rect.left) / rect.width) * 100
                            });
                          }}
                        />
                      )}

                      {/* Resize Handle Height (Only for Text fields or Sections) */}
                      {(item.type === 'text' || item.type === 'section') && !item.locked && (
                        <div 
                          className="absolute left-0 right-0 -bottom-1 h-2 cursor-ns-resize opacity-0 group-hover/item:opacity-100 bg-sky-500/50 hover:bg-sky-500 transition-all z-50"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.closest('.pointer-events-auto')?.getBoundingClientRect();
                            if (!rect) return;
                            setResizingHeight({
                              id: item.id,
                              startHeight: typeof item.style.height === 'number' ? item.style.height : (item.type === 'section' ? 0.2 : 5),
                              startY: ((e.clientY - rect.top) / rect.height) * 100
                            });
                          }}
                        />
                      )}


                      {item.type === 'section' && (
                        <div style={{ padding: `${item.style.padding || 0.5}vw 0`, textAlign: item.style.textAlign as any }}>
                          <div 
                            className="w-full transition-all relative"
                            style={{ 
                              height: item.style.height ? `${item.style.height}vw` : '0.2vw',
                              backgroundColor: item.style.backgroundColor || '#ffffff',
                              borderRadius: `${item.style.borderRadius || 0}px`,
                              border: item.style.borderWidth ? `${item.style.borderWidth}px solid ${item.style.borderColor || 'transparent'}` : 'none'
                            }}
                          >
                            {item.content && (
                              <div 
                                className="absolute top-1 left-2 font-black uppercase whitespace-nowrap"
                                style={{ 
                                  color: item.style.color,
                                  fontFamily: item.style.fontFamily || 'Inter',
                                  fontSize: `${item.style.fontSizeVw || 1.2}vw`,
                                  fontWeight: item.style.fontWeight || 'black',
                                  fontStyle: item.style.fontStyle || 'normal',
                                  transform: 'translateY(-120%)'
                                }}
                              >
                                {item.content}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {item.type === 'text' && (
                        <div style={{ 
                          padding: `${item.style.padding || 0.5}vw`, 
                          textAlign: item.style.textAlign as any, 
                          background: 'none',
                          backgroundColor: 'transparent',
                          borderRadius: `${item.style.borderRadius || 0}px`
                        }}>
                          <textarea 
                            value={item.content}
                            onChange={(e) => {
                              const newItems = [...proposalItems];
                              newItems[index].content = e.target.value;
                              setProposalItems(newItems);
                            }}
                            readOnly={item.locked}
                            placeholder="DESCRIÇÃO DA PROPOSTA..."
                            className="bg-transparent border-none w-full outline-none placeholder:text-white/20 resize-none shadow-none focus:ring-0 focus-visible:ring-0 focus:outline-none focus:bg-transparent p-0 m-0 ring-0 ring-offset-0 ring-transparent active:bg-transparent hover:bg-transparent selection:bg-sky-500/30 text-current !ring-0 !ring-offset-0 !outline-none !border-0 !border-transparent !bg-transparent !bg-none !shadow-none !bg-opacity-0"
                            style={{ 
                              color: item.style.color, 
                              textAlign: item.style.textAlign as any,
                              fontFamily: item.style.fontFamily || 'Inter',
                              fontSize: `${item.style.fontSizeVw || 1.0}vw`,
                              height: item.style.height ? `${item.style.height}vw` : 'auto',
                              fontWeight: item.style.fontWeight || 'normal',
                              fontStyle: item.style.fontStyle || 'normal',
                              background: 'none !important',
                              backgroundColor: 'transparent !important',
                              border: 'none !important',
                              borderWidth: '0 !important',
                              boxShadow: 'none !important',
                              outline: 'none !important',
                              appearance: 'none',
                              WebkitAppearance: 'none',
                              position: 'relative',
                              zIndex: 1,
                              resize: 'none',
                              cursor: item.locked ? 'not-allowed' : 'text'
                            }}
                          />
                        </div>
                      )}

                      {item.type === 'commercial_line' && (
                        <div className="flex gap-[0.8vw] items-center bg-transparent" style={{ padding: `${item.style.padding || 0.5}vw 0`, justifyContent: item.style.textAlign === 'center' ? 'center' : item.style.textAlign === 'right' ? 'flex-end' : 'flex-start' }}>
                          <input 
                            placeholder="QNT"
                            className="bg-transparent border-none outline-none w-[3vw] text-center focus:ring-0 shadow-none focus:bg-transparent"
                            value={item.content.qty}
                            onChange={(e) => {
                              const newItems = [...proposalItems];
                              newItems[index].content.qty = e.target.value;
                              setProposalItems(newItems);
                            }}
                            style={{ 
                              color: item.style.color,
                              fontFamily: item.style.fontFamily || 'Inter',
                              fontSize: `${item.style.fontSizeVw || 1.0}vw`,
                              fontWeight: item.style.fontWeight || 'normal',
                              fontStyle: item.style.fontStyle || 'normal',
                              background: 'transparent'
                            }}
                          />
                          <input 
                            placeholder="TEMPO"
                            className="bg-transparent border-none outline-none w-[5vw] text-center focus:ring-0 shadow-none focus:bg-transparent"
                            value={item.content.time}
                            onChange={(e) => {
                              const newItems = [...proposalItems];
                              newItems[index].content.time = e.target.value;
                              setProposalItems(newItems);
                            }}
                            style={{ 
                              color: item.style.color,
                              fontFamily: item.style.fontFamily || 'Inter',
                              fontSize: `${item.style.fontSizeVw || 1.0}vw`,
                              fontWeight: item.style.fontWeight || 'normal',
                              fontStyle: item.style.fontStyle || 'normal',
                              background: 'transparent'
                            }}
                          />
                          <input 
                            placeholder="DESCRIÇÃO"
                            className="bg-transparent border-none outline-none flex-1 focus:ring-0 shadow-none focus:bg-transparent"
                            value={item.content.desc}
                            onChange={(e) => {
                              const newItems = [...proposalItems];
                              newItems[index].content.desc = e.target.value;
                              setProposalItems(newItems);
                            }}
                            style={{ 
                              color: item.style.color, 
                              textAlign: item.style.textAlign as any,
                              fontFamily: item.style.fontFamily || 'Inter',
                              fontSize: `${item.style.fontSizeVw || 1.0}vw`,
                              fontWeight: item.style.fontWeight || 'normal',
                              fontStyle: item.style.fontStyle || 'normal',
                              background: 'transparent'
                            }}
                          />
                        </div>
                      )}

                      {(item.type === 'digital_1' || item.type === 'digital_2') && (
                        <div style={{ padding: `${item.style.padding || 0.5}vw 0`, textAlign: item.style.textAlign as any }}>
                          <button 
                            onClick={() => setEditingDigital({ id: item.id, type: item.type })}
                            className="flex items-center gap-2 bg-transparent w-full transition-all group/digital"
                            style={{ justifyContent: item.style.textAlign === 'center' ? 'center' : item.style.textAlign === 'right' ? 'flex-end' : 'flex-start' }}
                          >
                            <div style={{ color: item.style.color, textAlign: item.style.textAlign as any }}>
                              <Pencil size={14} className="inline mr-2 opacity-50" />
                              <span style={{ 
                                fontFamily: item.style.fontFamily || 'Inter',
                                fontSize: `${item.style.fontSizeVw || 1.0}vw`,
                                fontWeight: item.style.fontWeight || 'medium',
                                fontStyle: item.style.fontStyle || 'normal'
                              }} className="uppercase">
                                {item.content || (item.type === 'digital_1' ? 'ENTREGA DIGITAL 1' : 'ENTREGA DIGITAL 2')}
                              </span>
                            </div>
                          </button>
                        </div>
                      )}

                      {item.type === 'value' && (
                        <div className="flex items-center gap-[0.3vw] bg-transparent w-full" style={{ padding: `${item.style.padding || 0.5}vw 0`, justifyContent: item.style.textAlign === 'center' ? 'center' : item.style.textAlign === 'right' ? 'flex-end' : 'flex-start' }}>
                          <span className="font-black" style={{ 
                            color: item.style.color,
                            fontSize: `${(item.style.fontSizeVw || 1.8) * 0.8}vw`,
                            fontWeight: item.style.fontWeight || 'black',
                            fontStyle: item.style.fontStyle || 'normal'
                          }}>R$</span>
                          <input 
                            type="number"
                            value={item.content} 
                            onChange={(e) => {
                              const newItems = [...proposalItems];
                              newItems[index].content = e.target.value;
                              setProposalItems(newItems);
                            }}
                            placeholder="0,00"
                            className="bg-transparent border-none outline-none w-full font-black placeholder:text-white/20 focus:ring-0 shadow-none focus:bg-transparent"
                            style={{ 
                              color: item.style.color, 
                              textAlign: item.style.textAlign as any,
                              fontFamily: item.style.fontFamily || 'Inter',
                              fontSize: `${item.style.fontSizeVw || 1.8}vw`,
                              fontWeight: item.style.fontWeight || 'black',
                              fontStyle: item.style.fontStyle || 'normal',
                              background: 'transparent'
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>


                <Dialog open={!!editingDigital} onOpenChange={() => setEditingDigital(null)}>
                  <DialogContent className="bg-white p-6">
                    <DialogHeader>
                      <DialogTitle className="uppercase font-black text-slate-800">
                        {editingDigital?.type === 'digital_1' ? 'Configurar Digital 1' : 'Configurar Digital 2'}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <Label className="text-[10px] font-bold uppercase text-slate-400">Descrição da Entrega</Label>
                      <Textarea 
                        placeholder="Descreva aqui o que será entregue digitalmente..."
                        className="min-h-[150px]"
                        value={proposalItems.find(i => i.id === editingDigital?.id)?.content || ''}
                        onChange={(e) => {
                          const newItems = [...proposalItems];
                          const idx = newItems.findIndex(i => i.id === editingDigital?.id);
                          if (idx !== -1) {
                            newItems[idx].content = e.target.value;
                            setProposalItems(newItems);
                          }
                        }}
                      />
                      <Button 
                        onClick={() => setEditingDigital(null)}
                        className="w-full bg-sky-500 text-white font-bold uppercase h-12"
                      >
                        Salvar Entrega Digital
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={!!namingSection} onOpenChange={() => setNamingSection(null)}>
                  <DialogContent className="bg-white p-6 max-w-sm">
                    <DialogHeader>
                      <DialogTitle className="uppercase font-black text-slate-800">
                        Nome da Seção
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <Input 
                        placeholder="Ex: Entrega Comercial"
                        value={namingSection?.content || ''}
                        onChange={(e) => setNamingSection(prev => prev ? { ...prev, content: e.target.value } : null)}
                        autoFocus
                      />
                      <Button 
                        onClick={() => {
                          if (namingSection) {
                            const newItems = [...proposalItems];
                            const idx = newItems.findIndex(i => i.id === namingSection.id);
                            if (idx !== -1) {
                              newItems[idx].content = namingSection.content;
                              setProposalItems(newItems);
                            }
                            setNamingSection(null);
                          }
                        }}
                        className="w-full bg-sky-500 text-white font-bold uppercase h-11"
                      >
                        Aplicar Nome
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <div className="grid grid-cols-4 gap-[2%] h-full pb-[10%] px-[5%] text-white hidden">

                  <div className="space-y-[1vw] relative group">
...
                    <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 p-2 rounded-bl-lg flex gap-2 z-30">
                      <input 
                        type="color" 
                        value={formData.entregaDigitalStyle?.color || "#ffffff"} 
                        onChange={(e) => setFormData({...formData, entregaDigitalStyle: {...formData.entregaDigitalStyle, color: e.target.value}})}
                        className="w-5 h-5 cursor-pointer bg-transparent border-none"
                      />
                      <select 
                        value={formData.entregaDigitalStyle?.fontSize || 14}
                        onChange={(e) => setFormData({...formData, entregaDigitalStyle: {...formData.entregaDigitalStyle, fontSize: parseInt(e.target.value)}})}
                        className="bg-transparent text-[10px] text-white border border-white/20 rounded"
                      >
                        {[10, 12, 14, 16, 18, 20, 24, 28, 32].map(s => <option key={s} value={s} className="bg-slate-800">{s}px</option>)}
                      </select>
                      <button 
                        onClick={() => setFormData({...formData, entregaDigitalStyle: {...formData.entregaDigitalStyle, fontWeight: formData.entregaDigitalStyle?.fontWeight === "900" ? "400" : "900"}})}
                        className="bg-transparent text-[10px] text-white border border-white/20 rounded px-1"
                      >
                        B
                      </button>
                    </div>
                  </div>


                  <div className="space-y-[1vw] relative group">
                    <div className="flex items-center gap-[0.5vw] bg-transparent p-[1vw] rounded-xl border-none">
                      <span className="text-[1.8vw] font-black" style={{ color: formData.valorStyle?.color || "#ffffff" }}>R$</span>
                      <input 
                        type="number"
                        value={formData.valor || ""} 
                        onChange={e => setFormData({...formData, valor: e.target.value})}
                        placeholder="04 INVESTIMENTO"
                        className="bg-transparent border-none outline-none w-full placeholder:text-white/40"
                        style={{ 
                          color: formData.valorStyle?.color || "#ffffff",
                          fontSize: `${(formData.valorStyle?.fontSize || 14) / 14 * 2.2}vw`,
                          fontWeight: formData.valorStyle?.fontWeight || "900"
                        }}
                      />
                    </div>
                    <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 p-2 rounded-bl-lg flex gap-2 z-30">
                      <input 
                        type="color" 
                        value={formData.valorStyle?.color || "#ffffff"} 
                        onChange={(e) => setFormData({...formData, valorStyle: {...formData.valorStyle, color: e.target.value}})}
                        className="w-5 h-5 cursor-pointer bg-transparent border-none"
                      />
                      <select 
                        value={formData.valorStyle?.fontSize || 14}
                        onChange={(e) => setFormData({...formData, valorStyle: {...formData.valorStyle, fontSize: parseInt(e.target.value)}})}
                        className="bg-transparent text-[10px] text-white border border-white/20 rounded"
                      >
                        {[10, 12, 14, 16, 18, 20, 24, 28, 32].map(s => <option key={s} value={s} className="bg-slate-800">{s}px</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full flex justify-end gap-3 mt-6">
              <Button 
                variant="outline" 
                onClick={() => {
                  const saveMockup = async () => {
                    try {
                      const isNew = selectedMockup.id.toString().startsWith('temp-');
                      const mockupData = {
                        name: selectedMockup.name,
                        image_url: customBg || selectedMockup.image_url,
                        config: { 
                          ...(selectedMockup.config || {}),
                          overlayY,
                          proposalItems 
                        }
                      };

                      console.log("Salvando mockup:", mockupData);

                      if (isNew) {
                        const { data, error } = await supabase.from("comercial_mockups").insert(mockupData).select().single();
                        if (!error) {
                          toast.success("Mockup criado com sucesso!");
                          fetchData();
                        } else {
                          console.error("Erro insert mockup:", error);
                          toast.error(`Erro ao criar mockup: ${error.message}`);
                        }
                      } else {
                        const { error } = await supabase.from("comercial_mockups").update(mockupData).eq("id", selectedMockup.id);
                        if (!error) {
                          toast.success("Mockup atualizado com sucesso!");
                          fetchData();
                        } else {
                          console.error("Erro update mockup:", error);
                          toast.error(`Erro ao atualizar mockup: ${error.message}`);
                        }
                      }
                    } catch (err) {
                      console.error("Erro inesperado:", err);
                      toast.error("Erro inesperado ao salvar");
                    }
                  };
                  saveMockup();
                }} 
                className="h-12 px-6 font-bold uppercase text-[11px] bg-white shadow-xl"
                style={{ borderColor: "var(--layout-accent-hex, #0ea5e9)", color: "var(--layout-accent-hex, #0ea5e9)" }}
              >
                SALVAR ALTERAÇÕES NO MOCKUP
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setSelectedMockup(null)} 
                className="h-12 px-6 font-bold uppercase text-[11px] shadow-xl"
                style={{ 
                  backgroundColor: "var(--layout-widget-bg, #ffffff)",
                  borderColor: "var(--layout-border-color, #e2e8f0)",
                  color: "var(--layout-widget-text, #1a1a1a)"
                }}
              >
                CANCELAR
              </Button>
              {!isEditingMockup && (
                <Button 
                  onClick={handleCreateProposta} 
                  className="h-12 px-10 font-bold uppercase text-[11px] shadow-xl"
                  style={{ backgroundColor: "var(--layout-accent-hex, #0ea5e9)", color: "white" }}
                >
                  <Send size={16} className="mr-2" />
                  SALVAR E ENVIAR PARA ARTE FINAL
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : propostas.length === 0 ? (
        <div className="rounded-xl p-12 text-center border bg-slate-50/50">
          <FileText size={40} className="mx-auto mb-4 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Nenhuma proposta cadastrada</p>
          <p className="text-xs text-slate-400 mt-1">Clique em "NOVA PROPOSTA" e escolha um mockup para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {propostas.map(p => (
            <div key={p.id} className="group relative rounded-xl border bg-white overflow-hidden transition-all hover:shadow-md">
              <div className="aspect-[4/3] bg-slate-100 relative">
                {p.final_art_url ? (
                  <img src={p.final_art_url} className="w-full h-full object-cover" />
                ) : p.mockup?.image_url ? (
                  <img src={p.mockup.image_url} className="w-full h-full object-cover opacity-50 grayscale" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><ImageIcon size={32} className="text-slate-300" /></div>
                )}
                <div className="absolute top-2 right-2">{getStatusBadge(p.status as Status)}</div>
              </div>
              
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold truncate pr-2">{p.title}</h3>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setSelectedProposta(p)} className="p-1.5 rounded-full hover:bg-slate-100" title="Visualizar"><Eye size={14} /></button>
                    <button onClick={() => handleDeleteProposta(p.id)} className="p-1.5 rounded-full hover:bg-red-50 text-red-500" title="Excluir"><Trash2 size={14} /></button>
                  </div>
                </div>

                {p.status === "arte_final" && (
                  <div className="pt-2 border-t">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Ação: Enviar Arte Final</p>
                    <Label htmlFor={`upload-${p.id}`} className="cursor-pointer">
                      <div className="flex items-center justify-center gap-2 w-full py-2 border-2 border-dashed rounded-lg text-[10px] font-bold hover:bg-slate-50 transition-colors">
                        {uploadingArt ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                        UPLOAD DA ARTE
                      </div>
                      <input 
                        id={`upload-${p.id}`} 
                        type="file" 
                        className="hidden" 
                        accept="image/*" 
                        onChange={(e) => handleUploadArt(e, p.id)} 
                        disabled={uploadingArt}
                      />
                    </Label>
                  </div>
                )}

                {p.status === "aprovacao" && (
                  <div className="pt-2 border-t">
                    <Button onClick={() => handleApprove(p.id)} className="w-full h-8 text-[10px] font-bold" style={{ backgroundColor: "var(--layout-accent-hex, #0ea5e9)", color: "white" }}>
                      <Check size={12} className="mr-1" /> APROVAR PROPOSTA
                    </Button>
                  </div>
                )}

                {p.status === "concluido" && (
                  <div className="pt-2 border-t flex gap-2">
                    <Button variant="outline" className="flex-1 h-8 text-[10px] font-bold" onClick={() => { setSelectedProposta(p); setTimeout(downloadPDF, 100); }}>
                      <Download size={12} className="mr-1" /> PDF
                    </Button>
                    <Button variant="outline" className="h-8 w-8 p-0" onClick={() => { setSelectedProposta(p); shareWhatsApp(); }}>
                      <MessageSquare size={12} />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!selectedProposta} onOpenChange={(open) => !open && setSelectedProposta(null)}>
        <DialogContent className="max-w-4xl max-h-[95vh] flex flex-col p-0">
          {selectedProposta && (
            <>
              <DialogHeader className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-sm font-bold">{selectedProposta.title}</DialogTitle>
                    <p className="text-[10px] text-slate-500">ID: {selectedProposta.id}</p>
                  </div>
                  <div className="flex gap-2">
                    {getStatusBadge(selectedProposta.status)}
                    <button onClick={() => setSelectedProposta(null)} className="p-1 rounded-full hover:bg-slate-100"><X size={16} /></button>
                  </div>
                </div>
              </DialogHeader>
              
              <div className="flex-1 overflow-y-auto p-4 flex gap-6">
                <div className="w-1/3 space-y-6">
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase text-slate-400 border-b pb-1">Dados da Proposta</p>
                    <div className="space-y-3">
                      {Object.entries(selectedProposta.data || {}).map(([key, value]: [string, any]) => {
                        const field = selectedProposta.mockup?.fields?.find((f: any) => f.name === key);
                        return (
                          <div key={key}>
                            <p className="text-[10px] font-bold text-slate-500 uppercase">{field?.label || key}</p>
                            <p className="text-xs font-semibold">{String(value)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {selectedProposta.status === "concluido" && (
                    <div className="space-y-3 pt-4 border-t">
                      <p className="text-[10px] font-bold uppercase text-slate-400">Downloads Disponíveis</p>
                      <Button onClick={downloadPNG} className="w-full text-xs h-9" variant="secondary">
                        <Download size={14} className="mr-2" /> Baixar PNG
                      </Button>
                      <Button onClick={downloadPDF} className="w-full text-xs h-9" variant="secondary">
                        <Download size={14} className="mr-2" /> Baixar PDF
                      </Button>
                      <Button onClick={shareWhatsApp} className="w-full text-xs h-9" style={{ backgroundColor: "var(--layout-accent-hex, #0ea5e9)", color: "white" }}>
                        <MessageSquare size={14} className="mr-2" /> Enviar WhatsApp
                      </Button>
                    </div>
                  )}

                  <div className="pt-6 border-t">
                    <Button 
                      onClick={() => handleDeleteProposta(selectedProposta.id)} 
                      variant="ghost" 
                      className="w-full text-red-500 hover:text-red-700 hover:bg-red-50 text-[10px] font-bold uppercase h-8"
                    >
                      <Trash2 size={12} className="mr-2" /> Excluir permanentemente
                    </Button>
                  </div>
                </div>

                <div className="flex-1 bg-slate-100 rounded-xl flex items-center justify-center p-8 overflow-hidden relative">
                  <div 
                    id="proposal-render" 
                    className="relative bg-white shadow-2xl"
                    style={{ width: "400px", aspectRatio: "1/1.414" }}
                  >
                    <img 
                      src={selectedProposta.final_art_url || "/mockup-bg-v4.png"} 
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                    />

                    {!selectedProposta.final_art_url && (
                      <div className="absolute inset-0 p-8 flex flex-col justify-center items-center text-center">
                        <div className="bg-white/90 p-6 rounded-lg shadow-lg border">
                          <p className="text-[10px] font-bold text-sky-600 uppercase mb-4">Pré-visualização de Dados</p>
                          {Object.entries(selectedProposta.data || {}).map(([key, value]: [string, any]) => (
                            <div key={key} className="mb-2">
                              <p className="text-xs font-bold">{String(value)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
