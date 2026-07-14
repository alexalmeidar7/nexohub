
ALTER TABLE public.ouvintes
  ADD COLUMN origem_cadastro text NOT NULL DEFAULT 'manual'
  CHECK (origem_cadastro IN ('manual','chatbot'));
