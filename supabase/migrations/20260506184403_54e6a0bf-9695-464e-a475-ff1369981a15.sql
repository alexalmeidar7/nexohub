-- Create commercial mockups table
CREATE TABLE public.comercial_mockups (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    image_url TEXT,
    fields JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for mockups (readable by all users)
ALTER TABLE public.comercial_mockups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mockups are viewable by all authenticated users" 
ON public.comercial_mockups FOR SELECT TO authenticated USING (true);

-- Create commercial proposals table
CREATE TABLE public.comercial_propostas (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mockup_id UUID REFERENCES public.comercial_mockups(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'rascunho', -- rascunho, arte_final, aprovacao, concluido
    final_art_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for proposals
ALTER TABLE public.comercial_propostas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own proposals" 
ON public.comercial_propostas FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own proposals" 
ON public.comercial_propostas FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own proposals" 
ON public.comercial_propostas FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own proposals" 
ON public.comercial_propostas FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_comercial_propostas_updated_at
BEFORE UPDATE ON public.comercial_propostas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the first mockup
INSERT INTO public.comercial_mockups (name, fields) VALUES 
('Mockup Padrão 1', '[
    {"name": "cliente", "label": "Nome do Cliente", "type": "text"},
    {"name": "valor", "label": "Valor da Proposta", "type": "number"},
    {"name": "vendedor", "label": "Vendedor", "type": "text"},
    {"name": "observacoes", "label": "Observações", "type": "textarea"}
]'::jsonb);
