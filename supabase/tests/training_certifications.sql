begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(32);

insert into auth.users(id,email) values
 ('95000000-0000-4000-8000-000000000001','training-employee@example.invalid'),
 ('95000000-0000-4000-8000-000000000002','training-other@example.invalid'),
 ('95000000-0000-4000-8000-000000000003','training-hr@example.invalid') on conflict(id) do nothing;
insert into public.profiles(id,display_name) values
 ('95000000-0000-4000-8000-000000000001','Training Employee'),
 ('95000000-0000-4000-8000-000000000002','Training Other'),
 ('95000000-0000-4000-8000-000000000003','Training HR') on conflict(id) do nothing;
insert into public.user_roles(profile_id,role_id)
select assigned.profile_id,role.id from (values
 ('95000000-0000-4000-8000-000000000001'::uuid,'employee'),
 ('95000000-0000-4000-8000-000000000002'::uuid,'employee'),
 ('95000000-0000-4000-8000-000000000003'::uuid,'hr_admin')
) assigned(profile_id,role_key) join public.roles role on role.key=assigned.role_key on conflict do nothing;
insert into public.employees(id,profile_id,employee_number,legal_name,created_by,updated_by) values
 ('96000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','TRN-001','Training Employee','95000000-0000-4000-8000-000000000003','95000000-0000-4000-8000-000000000003'),
 ('96000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000002','TRN-002','Training Other','95000000-0000-4000-8000-000000000003','95000000-0000-4000-8000-000000000003') on conflict(id) do nothing;

select has_table('public','training_records','training records table exists');
select has_table('public','training_documents','training documents table exists');
select has_function('public','rpc_log_training_records',array['uuid[]','text','text','date','numeric','numeric','text','date','text'],'bulk training log RPC exists');
select has_function('public','rpc_update_training_record',array['uuid','text','text','date','numeric','numeric','text','date','text'],'training update RPC exists');
select has_function('public','rpc_list_training_records',array[]::text[],'HR training history RPC exists');
select has_function('public','rpc_list_my_training_records',array[]::text[],'employee training history RPC exists');
select has_function('public','rpc_attach_training_document',array['uuid','text','text','text','bigint'],'certificate attachment RPC exists');
select has_function('public','rpc_remove_training_document',array['uuid'],'certificate removal RPC exists');
select ok(not has_table_privilege('authenticated','public.training_records','insert'),'browser cannot insert training directly');
select ok(not has_table_privilege('authenticated','public.training_documents','insert'),'browser cannot attach certificate metadata directly');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok($$select set_config('test.training_ids',public.rpc_log_training_records(
 array['96000000-0000-4000-8000-000000000001'::uuid,'96000000-0000-4000-8000-000000000002'::uuid],
 'First Aid','Red Cross','2026-07-18',8,150000,'passed','2027-07-18','CERT-2026')::text,true)$$,'HR logs one course for multiple employees');
select is((select count(*)::integer from public.rpc_list_training_records()),2,'HR sees both bulk records');
select is((select sum(cost_ugx) from public.rpc_list_training_records()),300000::numeric,'cost per employee is retained');
select lives_ok($$select public.rpc_update_training_record(
 ((current_setting('test.training_ids')::uuid[])[1]),'Advanced First Aid','Red Cross','2026-07-18',10,175000,'passed','2027-07-18','CERT-2026-A')$$,'HR updates a training record');
select is((select topic from public.rpc_list_training_records() where employee_id='96000000-0000-4000-8000-000000000001'),'Advanced First Aid','updated topic is visible');
select throws_ok($$select public.rpc_log_training_records(array[]::uuid[],'Safety','Provider','2026-07-18',1,0,'passed',null,null)$$,'22023','Enter valid training details and at least one employee.','at least one employee is required');
select throws_ok($$select public.rpc_log_training_records(array['96000000-0000-4000-8000-000000000001'::uuid],'Safety','Provider','2026-07-18',1,0,'passed','2026-07-17',null)$$,'22023','Enter valid training details and at least one employee.','expiry cannot predate completion');
reset role;

select is((select count(*)::integer from public.notifications where recipient_profile_id in ('95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002') and event_key like 'training_added_%'),2,'bulk logging notifies each employee');
select is((select count(*)::integer from public.audit_events where event_type='training_record.created'),2,'bulk logging is audited per employee');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::integer from public.rpc_list_my_training_records()),1,'employee sees only their own training');
select is((select topic from public.rpc_list_my_training_records()),'Advanced First Aid','employee sees the corrected record');
select throws_ok($$select * from public.rpc_list_training_records()$$,'42501','training.manage permission is required','employee cannot open HR history');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::integer from public.rpc_list_my_training_records()),1,'second employee sees only their record');
reset role;

insert into storage.objects(bucket_id,name,owner_id) values(
 'private-files','95000000-0000-4000-8000-000000000003/training-certificates/'||((current_setting('test.training_ids')::uuid[])[1])||'/97000000-0000-4000-8000-000000000001.pdf','95000000-0000-4000-8000-000000000003');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok($$select set_config('test.training_document_id',public.rpc_attach_training_document(
 ((current_setting('test.training_ids')::uuid[])[1]),
 '95000000-0000-4000-8000-000000000003/training-certificates/'||((current_setting('test.training_ids')::uuid[])[1])||'/97000000-0000-4000-8000-000000000001.pdf',
 'first-aid.pdf','application/pdf',1200)::text,true)$$,'HR attaches an uploaded certificate');
select is((select count(*)::integer from public.rpc_list_training_documents(((current_setting('test.training_ids')::uuid[])[1]))),1,'HR lists certificate evidence');
select throws_ok($$select public.rpc_attach_training_document(
 ((current_setting('test.training_ids')::uuid[])[1]),
 '95000000-0000-4000-8000-000000000003/training-certificates/'||((current_setting('test.training_ids')::uuid[])[1])||'/97000000-0000-4000-8000-000000000002.pdf',
 'missing.pdf','application/pdf',1200)$$,'22023','Invalid certificate file metadata.','metadata cannot point to a missing object');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::integer from public.rpc_list_training_documents(((current_setting('test.training_ids')::uuid[])[1]))),1,'employee lists their own certificate');
select is((select count(*)::integer from storage.objects where name like '95000000-0000-4000-8000-000000000003/training-certificates/%'),1,'employee can read the private certificate object through scoped policy');
select throws_ok($$select public.rpc_remove_training_document(current_setting('test.training_document_id')::uuid)$$,'42501','training.manage permission is required','employee cannot remove certificate evidence');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok($$select public.rpc_remove_training_document(current_setting('test.training_document_id')::uuid)$$,'HR removes certificate metadata safely');
select is((select count(*)::integer from public.rpc_list_training_documents(((current_setting('test.training_ids')::uuid[])[1]))),0,'removed certificate is hidden');
select lives_ok($$select public.rpc_refresh_training_expiry_alerts()$$,'HR refreshes certificate expiry alerts');
reset role;

select * from finish();
rollback;
