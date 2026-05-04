-- Check if column exists in roteiros and add if not
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roteiros' AND column_name = 'configuracoes') THEN
        ALTER TABLE public.roteiros ADD COLUMN configuracoes JSONB DEFAULT '{"producao_ai_habilitada": true}'::jsonb;
    END IF;
END $$;