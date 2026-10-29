alter table public.apresentadores
  add column if not exists background_url text,
  add column if not exists categoria text,
  add column if not exists whatsapp text;
