import { useState, useEffect } from "react";
import { FileText, Plus, Check, Download, Send, Upload, Loader2, X, Eye, Image as ImageIcon, MessageSquare, Trash2, ChevronDown } from "lucide-react";
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
  const [isNamingProject, setIsCreatingProject] = useState(false);
  const [tempMockup, setTempMockup] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [uploadingArt, setUploadingArt] = useState(false);
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
      case "aprovacao": return <Badge className="bg-blue-500">Aprovação</Badge>;
      case "concluido": return <Badge className="bg-green-600 text-white">Aprovado</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Propostas Comerciais</h2>
          <p className="text-[11px] mt-0.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Crie e gerencie suas propostas</p>
        </div>
        
        <Popover>
          <PopoverTrigger asChild>
            <Button className="btn-skyglass-accent h-9 text-xs">
              <Plus size={14} className="mr-1" />
              NOVA PROPOSTA
              <ChevronDown size={14} className="ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-1.5" align="end" style={{ backgroundColor: "var(--layout-widget-bg, #ffffff)", border: "1px solid var(--layout-border-color, #e2e8f0)" }}>
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 px-2 pt-1">Selecione um mockup:</p>
            <div className="flex flex-col gap-0.5">
              {mockups.map(m => (
                <button 
                  key={m.id} 
                  onClick={() => { setTempMockup(m); setIsCreatingProject(true); }}
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
        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-sky-500" /></div>
      ) : selectedMockup ? (
        <div className="animate-in fade-in zoom-in-95 duration-500 bg-slate-200 p-4 md:p-8 rounded-2xl border-4 border-dashed border-slate-300 min-h-[700px] flex flex-col items-center relative overflow-hidden">
          <button 
            onClick={() => setSelectedMockup(null)} 
            className="absolute top-4 right-4 z-20 p-2 bg-white/80 hover:bg-white rounded-full shadow-md text-slate-500 transition-all"
            title="Cancelar edição"
          >
            <X size={20} />
          </button>

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
                  backgroundImage: "url('/mockup-bg-v4.png')",
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }}
              />

              {/* Editable Overlay */}
              <div className="absolute inset-0 p-[5%] flex flex-col pointer-events-auto">
                <div className="grid grid-cols-4 gap-[2%] h-full pb-[10%] text-white">
                  <div className="space-y-[1vw]">
                    <textarea 
                      value={formData.descricao || ""} 
                      onChange={e => setFormData({...formData, descricao: e.target.value})}
                      placeholder="01 DESCRIÇÃO"
                      className="bg-black/40 hover:bg-black/60 focus:bg-black/70 text-[1.1vw] font-bold leading-relaxed text-white border-2 border-white/20 outline-none w-full h-[18vw] p-[1.2vw] rounded-xl transition-all placeholder:text-white/80 shadow-2xl resize-none"
                    />
                  </div>

                  <div className="space-y-[1vw]">
                    <textarea 
                      value={formData.entrega_comercial || ""} 
                      onChange={e => setFormData({...formData, entrega_comercial: e.target.value})}
                      placeholder="02 ENTREGA COMERCIAL"
                      className="bg-black/40 hover:bg-black/60 focus:bg-black/70 text-[1.1vw] font-bold leading-relaxed text-white border-2 border-white/20 outline-none w-full h-[18vw] p-[1.2vw] rounded-xl transition-all placeholder:text-white/80 shadow-2xl resize-none"
                    />
                  </div>

                  <div className="space-y-[1vw]">
                    <textarea 
                      value={formData.entrega_digital || ""} 
                      onChange={e => setFormData({...formData, entrega_digital: e.target.value})}
                      placeholder="03 ENTREGA DIGITAL"
                      className="bg-black/40 hover:bg-black/60 focus:bg-black/70 text-[1.1vw] font-bold leading-relaxed text-white border-2 border-white/20 outline-none w-full h-[18vw] p-[1.2vw] rounded-xl transition-all placeholder:text-white/80 shadow-2xl resize-none"
                    />
                  </div>

                  <div className="space-y-[1vw]">
                    <div className="flex items-center gap-[0.5vw] bg-black/40 p-[1vw] rounded-xl border-2 border-white/20 shadow-2xl">
                      <span className="text-[1.8vw] font-black text-white">R$</span>
                      <input 
                        type="number"
                        value={formData.valor || ""} 
                        onChange={e => setFormData({...formData, valor: e.target.value})}
                        placeholder="04 INVESTIMENTO"
                        className="bg-transparent text-[2.2vw] font-black text-white border-none outline-none w-full placeholder:text-white/80"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setSelectedMockup(null)} className="h-12 px-6 font-bold uppercase text-[11px] bg-white shadow-xl">
                CANCELAR
              </Button>
              <Button onClick={handleCreateProposta} className="h-12 px-10 btn-skyglass-accent font-bold uppercase text-[11px] shadow-xl">
                <Send size={16} className="mr-2" />
                SALVAR E ENVIAR PARA ARTE FINAL
              </Button>
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
                    <Button onClick={() => handleApprove(p.id)} className="w-full h-8 text-[10px] font-bold bg-green-600 hover:bg-green-700">
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
                      <Button onClick={shareWhatsApp} className="w-full text-xs h-9 bg-green-600 hover:bg-green-700">
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
