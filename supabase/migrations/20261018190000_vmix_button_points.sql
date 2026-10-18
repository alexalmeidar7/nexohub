-- Add category and scoring to vMix button interaction analytics.
-- Safe additive migration: existing interaction history is preserved.
alter table public.vmix_button_interactions
  add column if not exists button_category text,
  add column if not exists points numeric(5,2) not null default 0;
