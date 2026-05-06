import { useState, useEffect } from "react";
import { FileText, Plus, Check, Download, Send, Upload, Loader2, X, Eye, Image as ImageIcon, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";

type Status = "rascunho" | "arte_final" | "aprovacao" | "concluido";

export default function PropostasPage() {
  const [propostas, setPropostas] = useState<any[]>([]);
  const [mockups, setMockups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedProposta, setSelectedProposta] = useState<any>(null);
  const [step, setStep] = useState(1);
  const [selectedMockup, setSelectedMockup] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [uploadingArt, setUploadingArt] = useState(false);

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
      title: formData.cliente ? `Proposta - ${formData.cliente}` : "Nova Proposta",
      data: formData,
      status: "arte_final"
    }).select().single();

    if (error) {
      toast.error("Erro ao criar proposta");
    } else {
      toast.success("Proposta enviada para Arte Final!");
      setIsCreating(false);
      resetForm();
      fetchData();
    }
  };

  const resetForm = () => {
    setStep(1);
    setSelectedMockup(null);
    setFormData({});
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
        <Dialog open={isCreating} onOpenChange={(open) => { setIsCreating(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="btn-skyglass-accent h-9 text-xs">
              <Plus size={14} className="mr-1" />
              NOVA PROPOSTA
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] w-[1300px] h-[90vh] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="p-4 border-b">
              <DialogTitle>Criar Proposta - Passo {step}</DialogTitle>
            </DialogHeader>
            
            <div className="flex-1 flex overflow-hidden">
              {step === 1 ? (
                <div className="flex-1 p-6 overflow-y-auto">
                  <p className="text-xs font-semibold mb-4 uppercase text-slate-500">Selecione o Mockup base para sua proposta:</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {mockups.map(m => (
                      <div 
                        key={m.id} 
                        onClick={() => { setSelectedMockup(m); setStep(2); }}
                        className="group relative cursor-pointer overflow-hidden rounded-xl border transition-all hover:border-sky-500 hover:shadow-lg"
                      >
                        <div className="aspect-video relative overflow-hidden">
                          <img src={m.image_url} alt={m.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                        </div>
                        <div className="p-3 bg-white">
                          <p className="text-[10px] font-bold text-slate-700 uppercase truncate">{m.name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* Left Panel: Form */}
                  <div className="w-[350px] border-r bg-slate-50 p-6 flex flex-col gap-6 overflow-y-auto animate-in slide-in-from-left-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase text-sky-600">Mockup Selecionado</p>
                      <div className="flex items-center justify-between p-2 bg-white rounded border">
                        <span className="text-[11px] font-bold truncate pr-2 uppercase">{selectedMockup?.name}</span>
                        <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="h-6 px-2 text-[9px] font-bold">TROCAR</Button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <p className="text-[10px] font-bold uppercase text-slate-400">Preencha as informações</p>
                      {(selectedMockup?.fields as any[] || []).map((f: any) => (
                        <div key={f.name} className="space-y-1.5">
                          <Label className="text-[10px] font-bold uppercase text-slate-500">{f.label}</Label>
                          {f.type === "textarea" ? (
                            <Textarea 
                              value={formData[f.name] || ""} 
                              onChange={e => setFormData({...formData, [f.name]: e.target.value})}
                              placeholder={`Digite o ${f.label.toLowerCase()}...`}
                              className="text-xs min-h-[80px]"
                            />
                          ) : (
                            <Input 
                              type={f.type} 
                              value={formData[f.name] || ""} 
                              onChange={e => setFormData({...formData, [f.name]: e.target.value})}
                              placeholder={`Digite o ${f.label.toLowerCase()}...`}
                              className="text-xs h-9"
                            />
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="mt-auto pt-6 border-t">
                      <Button onClick={handleCreateProposta} className="w-full btn-skyglass-accent h-10 text-[11px] font-bold">
                        <Send size={14} className="mr-2" />
                        ENVIAR PARA ARTE FINAL
                      </Button>
                    </div>
                  </div>

                  {/* Right Panel: Canvas (Live Preview) */}
                  <div className="flex-1 bg-slate-200 p-8 flex items-center justify-center overflow-auto">
                    <div 
                      className="bg-white shadow-2xl relative overflow-hidden flex-shrink-0"
                      style={{ 
                        width: "1920px", 
                        height: "1080px", 
                        transform: "scale(0.4)", // Adjusted scale to fit in most views while maintaining high-res aspect
                        transformOrigin: "center center"
                      }}
                    >
                      {/* Background Mockup */}
                      <img 
                        src={selectedMockup?.image_url} 
                        className="absolute inset-0 w-full h-full object-cover"
                        alt="Mockup Preview"
                      />

                      {/* Content Overlay - This would be styled according to the mockup design */}
                      <div className="absolute inset-0 p-24 flex flex-col text-white pointer-events-none">
                        <div className="mt-auto max-w-[800px] space-y-8 drop-shadow-2xl">
                          {formData.cliente && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                              <p className="text-2xl font-bold uppercase tracking-[0.2em] text-sky-400">PROPOSTA PARA</p>
                              <h1 className="text-8xl font-black uppercase leading-tight">{formData.cliente}</h1>
                            </div>
                          )}
                          
                          <div className="flex gap-16 pt-8 animate-in fade-in slide-in-from-bottom-4 delay-150 duration-500">
                            {formData.vendedor && (
                              <div>
                                <p className="text-lg font-bold text-sky-400 uppercase tracking-widest">CONSULTOR</p>
                                <p className="text-3xl font-bold uppercase">{formData.vendedor}</p>
                              </div>
                            )}
                            {formData.valor && (
                              <div>
                                <p className="text-lg font-bold text-sky-400 uppercase tracking-widest">INVESTIMENTO</p>
                                <p className="text-3xl font-bold uppercase">R$ {parseFloat(formData.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                              </div>
                            )}
                          </div>

                          {formData.observacoes && (
                            <div className="pt-8 border-t border-white/20 animate-in fade-in delay-300 duration-500">
                              <p className="text-lg font-bold text-sky-400 uppercase tracking-widest mb-2">DETALHES</p>
                              <p className="text-2xl opacity-90 leading-relaxed max-w-[900px]">{formData.observacoes}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Guide/Resolution indicator */}
                      <div className="absolute top-4 right-4 bg-black/50 text-white px-3 py-1 rounded-full text-[20px] font-bold backdrop-blur-md">
                        1920 x 1080
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-sky-500" /></div>
      ) : propostas.length === 0 ? (
        <div className="rounded-xl p-12 text-center border bg-slate-50/50">
          <FileText size={40} className="mx-auto mb-4 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Nenhuma proposta cadastrada</p>
          <p className="text-xs text-slate-400 mt-1">Clique em "NOVA PROPOSTA" para começar seu fluxo</p>
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
                  <button onClick={() => setSelectedProposta(p)} className="p-1.5 rounded-full hover:bg-slate-100"><Eye size={14} /></button>
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

      {/* Details / Preview Modal */}
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
                </div>

                <div className="flex-1 bg-slate-100 rounded-xl flex items-center justify-center p-8 overflow-hidden relative">
                  <div 
                    id="proposal-render" 
                    className="relative bg-white shadow-2xl"
                    style={{ width: "400px", aspectRatio: "1/1.414" }}
                  >
                    {/* Background: Mockup if no art, or Final Art if available */}
                    <img 
                      src={selectedProposta.final_art_url || selectedProposta.mockup?.image_url} 
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                    />
                    
                    {/* Overlay dynamic fields if it's the draft/preview stage or if requested */}
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
