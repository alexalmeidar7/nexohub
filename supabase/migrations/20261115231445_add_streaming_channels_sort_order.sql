-- Add channel ordering without replacing or modifying existing channel records.
alter table public.streaming_channels
  add column if not exists sort_order integer not null default 0;

create index if not exists streaming_channels_user_sort_order_idx
  on public.streaming_channels (user_id, sort_order, numero_canal);
