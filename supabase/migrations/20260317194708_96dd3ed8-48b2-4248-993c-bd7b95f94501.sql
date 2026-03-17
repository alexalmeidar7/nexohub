
-- Add nome column for logo identification
ALTER TABLE public.logos_patrocinadores ADD COLUMN nome text NOT NULL DEFAULT '';

-- Add soft-delete columns
ALTER TABLE public.logos_patrocinadores ADD COLUMN excluido boolean NOT NULL DEFAULT false;
ALTER TABLE public.logos_patrocinadores ADD COLUMN excluido_at timestamp with time zone;
