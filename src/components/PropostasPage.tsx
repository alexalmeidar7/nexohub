import { useState, useEffect } from "react";
import { FileText, Plus, Check, Download, Send, Upload, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function PropostasPage() {
  const [propostas, setPropostas] = useState<any[]>([]);
  const [mockups, setMockups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [step, setStep] = useState(1);
  const [selectedMockup, setSelectedMockup] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

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

  const createProposta = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data, error } = await supabase.from("comercial_propostas").insert({
      user_id: user.id,
      mockup_id: selectedMockup.id,
      title: `Proposta - ${formData.cliente || "Nova"}`,
      data: formData,
      status: "rascunho"
    }).select().single();

    if (error) {
      toast.error("Erro ao criar proposta");
    } else {
      toast.success("Proposta criada com sucesso");
      setIsCreating(false);
      fetchData();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Propostas Comerciais</h2>
          <p className="text-[11px] mt-0.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Gerencie suas propostas comerciais</p>
        </div>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <button className="btn-skyglass-accent px-4 py-2 text-xs">
              <Plus size={14} />
              nova proposta
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Proposta Comercial</DialogTitle>
            </DialogHeader>
            {step === 1 && (
              <div className="grid grid-cols-2 gap-4">
                {mockups.map(m => (
                  <button key={m.id} onClick={() => { setSelectedMockup(m); setStep(2); }} className="p-4 border rounded-lg hover:bg-slate-100">
                    <img src={m.image_url} alt={m.name} className="w-full h-32 object-cover mb-2" />
                    <p className="text-xs font-bold">{m.name}</p>
                  </button>
                ))}
              </div>
            )}
            {step === 2 && (
              <div className="space-y-4">
                {(selectedMockup.fields as any[]).map((f: any) => (
                  <div key={f.name}>
                    <label className="text-xs font-bold">{f.label}</label>
                    {f.type === "textarea" ? (
                      <textarea className="w-full border rounded p-2 text-xs" onChange={e => setFormData({...formData, [f.name]: e.target.value})} />
                    ) : (
                      <input type={f.type} className="w-full border rounded p-2 text-xs" onChange={e => setFormData({...formData, [f.name]: e.target.value})} />
                    )}
                  </div>
                ))}
                <button onClick={createProposta} className="w-full btn-skyglass-accent py-2 text-xs">Enviar para Arte Final</button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {propostas.map(p => (
          <div key={p.id} className="p-4 border rounded-lg flex items-center justify-between">
            <div>
              <p className="text-xs font-bold">{p.title}</p>
              <p className="text-[10px] uppercase text-sky-600">{p.status}</p>
            </div>
            <div className="flex gap-2">
              {p.status === "concluido" && <button className="p-2 border rounded"><Download size={14} /></button>}
              <button className="p-2 border rounded"><FileText size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
