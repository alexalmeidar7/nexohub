alter table public.link_bio_ads add column if not exists program_ids uuid[] not null default '{}';
update public.link_bio_ads set program_ids=array[program_id] where program_id is not null and cardinality(program_ids)=0;
grant insert(program_ids), update(program_ids) on public.link_bio_ads to authenticated;
drop policy if exists link_bio_ads_owner on public.link_bio_ads;
create policy link_bio_ads_owner on public.link_bio_ads for all to authenticated
using (user_id=auth.uid())
with check (
 user_id=auth.uid()
 and exists(select 1 from public.logos_patrocinadores c where c.id=client_id and c.user_id=auth.uid() and not c.excluido)
 and (program_id is null or exists(select 1 from public.programas p where p.id=program_id and p.user_id=auth.uid()))
 and not exists(select 1 from unnest(program_ids) as chosen(id) where not exists(select 1 from public.programas p where p.id=chosen.id and p.user_id=auth.uid()))
);
