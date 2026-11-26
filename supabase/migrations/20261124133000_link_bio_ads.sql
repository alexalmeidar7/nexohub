create table if not exists public.link_bio_ads (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,
 client_id uuid not null, program_id uuid, start_date date not null, end_date date not null,
 image_url text not null check (image_url ~ '^https://'), link_url text not null check (link_url ~ '^https?://'),
 views bigint not null default 0, clicks bigint not null default 0, active boolean not null default true,
 created_at timestamptz not null default now(), check(end_date >= start_date)
);
alter table public.link_bio_ads enable row level security;
revoke all on public.link_bio_ads from anon, authenticated;
grant select, delete on public.link_bio_ads to authenticated;
grant insert(user_id,client_id,program_id,start_date,end_date,image_url,link_url,active) on public.link_bio_ads to authenticated;
grant update(client_id,program_id,start_date,end_date,image_url,link_url,active) on public.link_bio_ads to authenticated;
grant all on public.link_bio_ads to service_role;
create policy link_bio_ads_owner on public.link_bio_ads for all to authenticated using (user_id = auth.uid()) with check (
 user_id = auth.uid() and exists(select 1 from public.logos_patrocinadores c where c.id=client_id and c.user_id=auth.uid() and not c.excluido)
 and (program_id is null or exists(select 1 from public.programas p where p.id=program_id and p.user_id=auth.uid()))
);
create index if not exists link_bio_ads_owner_dates on public.link_bio_ads(user_id,start_date,end_date) where active;
create table if not exists public.link_bio_ad_visits (
 id uuid primary key default gen_random_uuid(), ad_id uuid not null references public.link_bio_ads(id) on delete cascade,
 created_at timestamptz not null default now(), viewed boolean not null default false, clicked boolean not null default false
);
alter table public.link_bio_ad_visits enable row level security;
revoke all on public.link_bio_ad_visits from anon,authenticated;
grant all on public.link_bio_ad_visits to service_role;
create or replace function public.link_bio_ad_track(visit uuid, campaign uuid, event_type text) returns boolean language plpgsql security invoker set search_path='' as $$
declare changed uuid;
begin
 if event_type='view' then
  update public.link_bio_ad_visits set viewed=true where id=visit and ad_id=campaign and not viewed and created_at > now()-interval '1 day' returning ad_id into changed;
  if changed is not null then update public.link_bio_ads set views=views+1 where id=changed; end if;
 elsif event_type='click' then
  update public.link_bio_ad_visits set clicked=true where id=visit and ad_id=campaign and not clicked and created_at > now()-interval '1 day' returning ad_id into changed;
  if changed is not null then update public.link_bio_ads set clicks=clicks+1 where id=changed; end if;
 end if;
 return changed is not null;
end $$;
revoke all on function public.link_bio_ad_track(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.link_bio_ad_track(uuid,uuid,text) to service_role;
