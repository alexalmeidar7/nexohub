-- Read-only. Verify the target and obtain authorization before running on a hosted project.
begin transaction read only;
set local statement_timeout = '10s';

select current_database() as database_name, current_user as candidate_migration_owner,
       current_setting('server_version') as server_version,
       r.rolsuper, r.rolbypassrls
from pg_roles r where r.rolname = current_user;

with expected(schema_name, table_name, column_name, type_name) as (
  values
    ('public','tv_pairing_codes','code','text'), ('public','tv_pairing_codes','slug_user_id','uuid'),
    ('public','tv_pairing_codes','paired_user_id','uuid'), ('public','tv_pairing_codes','status','text'),
    ('public','tv_pairing_codes','expires_at','timestamp with time zone'),
    ('public','ouvintes','id','uuid'), ('public','ouvintes','user_id','uuid'),
    ('public','ouvintes','nome','text'), ('public','ouvintes','email','text'),
    ('public','ouvintes','cpf','text'), ('public','ouvintes','telefone','text'),
    ('public','ouvintes','sexo','text'), ('public','ouvintes','cidade','text'),
    ('public','ouvintes','setor','text'), ('public','ouvintes','escolaridade','text'),
    ('public','ouvintes','renda','text'), ('public','ouvintes','data_nascimento','date'),
    ('public','ouvintes','pontuacao','numeric'), ('public','ouvintes','banido','boolean'),
    ('public','user_settings','user_id','uuid'), ('public','user_settings','dashboard_items','jsonb'),
    ('public','player_listener_profiles','auth_user_id','uuid'), ('public','player_listener_profiles','radio_user_id','uuid'),
    ('public','player_listener_profiles','avatar_url','text'), ('public','player_listener_profiles','sub_profiles','jsonb'),
    ('auth','sessions','id','uuid'), ('auth','sessions','user_id','uuid'),
    ('auth','sessions','not_after','timestamp with time zone'),
    ('auth','refresh_tokens','session_id','uuid'), ('auth','refresh_tokens','revoked','boolean'),
    ('auth','refresh_tokens','updated_at','timestamp with time zone')
)
select e.*, format_type(a.atttypid,a.atttypmod) as actual_type,
       coalesce(format_type(a.atttypid,a.atttypmod) = e.type_name,false) as matches,
       case when e.schema_name = 'auth' and a.attnum is not null then
         has_column_privilege(current_user,a.attrelid,a.attnum,'SELECT') end as owner_can_read_auth_column,
       case when e.schema_name = 'auth' and a.attnum is not null then
         has_column_privilege(current_user,a.attrelid,a.attnum,'UPDATE') end as owner_can_update_auth_column
from expected e
left join pg_attribute a on a.attrelid = to_regclass(format('%I.%I',e.schema_name,e.table_name))
  and a.attname = e.column_name and not a.attisdropped
order by e.schema_name,e.table_name,e.column_name;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in
  ('ouvintes','user_settings','tv_pairing_codes','player_listener_profiles',
   'nexo_tv_devices','nexo_player_listener_links','nexo_player_listener_field_credits'))
  or (schemaname = 'auth' and tablename in ('sessions','refresh_tokens'))
order by tablename,policyname;

select n.nspname, c.relname, pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity, c.relforcerowsecurity,
       has_schema_privilege(current_user,n.oid,'USAGE') as migration_owner_can_use_schema,
       has_table_privilege('anon',c.oid,'SELECT') as anon_can_select,
       has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_can_select,
       has_table_privilege('service_role',c.oid,'SELECT') as service_can_select,
       has_table_privilege('service_role',c.oid,'INSERT') as service_can_insert,
       has_table_privilege('service_role',c.oid,'UPDATE') as service_can_update
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.oid in (to_regclass('public.ouvintes'),to_regclass('public.user_settings'),
  to_regclass('public.tv_pairing_codes'),to_regclass('public.player_listener_profiles'),
  to_regclass('public.nexo_tv_devices'),to_regclass('public.nexo_player_listener_links'),
  to_regclass('public.nexo_player_listener_field_credits'),
  to_regclass('auth.sessions'),to_regclass('auth.refresh_tokens'))
order by n.nspname,c.relname;

select conrelid::regclass as relation, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (to_regclass('public.ouvintes'),to_regclass('public.tv_pairing_codes'),
  to_regclass('public.player_listener_profiles'),to_regclass('public.nexo_tv_devices'),
  to_regclass('public.nexo_player_listener_links'),to_regclass('public.nexo_player_listener_field_credits'))
order by conrelid::regclass::text,conname;

select p.oid::regprocedure as rpc, pg_get_userbyid(p.proowner) as owner, p.prosecdef,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('nexo_reserve_tv_session','nexo_revoke_tv_session','nexo_enroll_player_listener')
order by p.proname;

rollback;
