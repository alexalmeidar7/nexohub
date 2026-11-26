create table if not exists public.player_ads_campaigns (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 client text not null, name text not null, start_date date not null, end_date date not null,
 program_ids uuid[] not null default '{}', active boolean not null default true,
 deleted_at timestamptz, media jsonb not null default '[]', created_at timestamptz not null default now(),
 check (end_date >= start_date), check (jsonb_typeof(media)='array')
);
create index if not exists player_ads_campaigns_owner on public.player_ads_campaigns(user_id,active,start_date,end_date);
alter table public.player_ads_campaigns enable row level security;
create policy player_ads_owner on public.player_ads_campaigns for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create table if not exists public.player_ads_events (
 id uuid primary key, campaign_id uuid not null references public.player_ads_campaigns(id),
 placement text not null, event_type text not null check(event_type in ('impression','click','qr_open','started','completed','interrupted')),
 device text not null, occurred_at timestamptz not null default now()
);
create index if not exists player_ads_events_campaign on public.player_ads_events(campaign_id,occurred_at);
alter table public.player_ads_events enable row level security;
create policy player_ads_events_owner on public.player_ads_events for select to authenticated using (exists(select 1 from public.player_ads_campaigns c where c.id=campaign_id and c.user_id=auth.uid()));
-- Public delivery and event ingestion deliberately deferred to the TV integration.
