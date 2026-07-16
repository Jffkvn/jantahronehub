begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

select has_table('public','project_documents','project documents metadata exists');
select has_function('public','rpc_register_project_document',array['uuid','uuid','text','text','text','bigint'],'guarded document registration exists');
select has_function('public','rpc_get_project_history',array['uuid'],'project history RPC exists');
select has_function('public','rpc_check_project_completion',array['uuid'],'completion check RPC exists');
select has_function('public','rpc_transition_project_status',array['uuid','text','text','text','text'],'guarded status transition RPC exists');

insert into auth.users(id,email) values ('91000000-0000-4000-8000-000000000001','completion-admin@example.invalid');
insert into public.profiles(id,display_name) values ('91000000-0000-4000-8000-000000000001','Completion Admin');
insert into public.user_roles(profile_id,role_id) select '91000000-0000-4000-8000-000000000001',id from public.roles where key='super_admin';
insert into public.projects(id,project_code,name,status,health_status,created_by,updated_by) values ('91000000-0000-4000-8000-000000000010','COMP-001','Completion Project','active','on_track','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
insert into storage.objects(bucket_id,name,owner_id) values ('private-files','91000000-0000-4000-8000-000000000001/projects/91000000-0000-4000-8000-000000000010/91000000-0000-4000-8000-000000000020.pdf','91000000-0000-4000-8000-000000000001');
select lives_ok($$select public.rpc_register_project_document('91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000020','Contract.pdf','91000000-0000-4000-8000-000000000001/projects/91000000-0000-4000-8000-000000000010/91000000-0000-4000-8000-000000000020.pdf','application/pdf',1200)$$,'authorized project document is registered');
select is((select count(*) from public.project_documents where project_id='91000000-0000-4000-8000-000000000010'),1::bigint,'document metadata is project scoped');
select is((public.rpc_check_project_completion('91000000-0000-4000-8000-000000000010')->>'can_complete')::boolean,true,'clear canonical ledgers allow completion');
select lives_ok($$select public.rpc_transition_project_status('91000000-0000-4000-8000-000000000010','completed','All operational work accepted')$$,'authorized clear project can complete');
select is((select status from public.projects where id='91000000-0000-4000-8000-000000000010'),'completed','completion updates project status');
select is((select actual_completion_date from public.projects where id='91000000-0000-4000-8000-000000000010'),current_date,'completion records actual date');
select ok((select count(*)>0 from public.rpc_get_project_history('91000000-0000-4000-8000-000000000010') where event_type='projects.status_changed'),'history includes guarded status change');

select * from finish();
rollback;
