begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(37);

insert into auth.users(id,email) values
 ('93000000-0000-4000-8000-000000000001','performance-employee@example.invalid'),
 ('93000000-0000-4000-8000-000000000002','performance-manager@example.invalid'),
 ('93000000-0000-4000-8000-000000000003','performance-hr@example.invalid'),
 ('93000000-0000-4000-8000-000000000004','performance-other@example.invalid') on conflict(id) do nothing;
insert into public.profiles(id,display_name) values
 ('93000000-0000-4000-8000-000000000001','Performance Employee'),
 ('93000000-0000-4000-8000-000000000002','Performance Manager'),
 ('93000000-0000-4000-8000-000000000003','Performance HR'),
 ('93000000-0000-4000-8000-000000000004','Performance Other') on conflict(id) do nothing;
insert into public.user_roles(profile_id,role_id)
select assigned.profile_id, role.id from (values
 ('93000000-0000-4000-8000-000000000001'::uuid,'employee'),
 ('93000000-0000-4000-8000-000000000002'::uuid,'project_manager'),
 ('93000000-0000-4000-8000-000000000003'::uuid,'hr_admin'),
 ('93000000-0000-4000-8000-000000000004'::uuid,'employee')
) assigned(profile_id,role_key) join public.roles role on role.key=assigned.role_key on conflict do nothing;
insert into public.employees(id,profile_id,employee_number,legal_name,created_by,updated_by) values
 ('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','PERF-001','Performance Employee','93000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000003'),
 ('94000000-0000-4000-8000-000000000004','93000000-0000-4000-8000-000000000004','PERF-004','Performance Other','93000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000003') on conflict(id) do nothing;

select has_table('public','performance_cycles','cycles table exists');
select has_table('public','performance_reviews','reviews table exists');
select has_table('public','performance_goals','goals table exists');
select has_table('public','performance_review_events','review event history exists');
select has_function('public','rpc_create_performance_cycle',array['text','date','date'],'HR can create cycles through an RPC');
select has_function('public','rpc_start_performance_review',array['uuid','uuid','uuid'],'HR can assign a reviewer');
select has_function('public','rpc_save_performance_review',array['uuid','text','boolean','boolean','jsonb'],'review draft RPC exists');
select has_function('public','rpc_import_performance_review',array['uuid','uuid','uuid','text','boolean','boolean','jsonb'],'legacy workbook import RPC exists');
select has_function('public','rpc_submit_performance_review',array['uuid'],'manager submit RPC exists');
select has_function('public','rpc_decide_performance_review',array['uuid','text','text'],'HR decision RPC exists');
select has_function('public','rpc_acknowledge_performance_review',array['uuid','text'],'employee acknowledgment RPC exists');
select ok(not has_table_privilege('authenticated','public.performance_reviews','insert'),'browser cannot insert reviews directly');
select ok(not has_table_privilege('authenticated','public.performance_goals','update'),'browser cannot update ratings directly');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok($$select set_config('test.cycle_id',public.rpc_create_performance_cycle('Mid-year 2026','2026-01-01','2026-06-30')::text,true)$$,'HR creates a cycle');
select lives_ok($$select public.rpc_set_performance_cycle_status(current_setting('test.cycle_id')::uuid,'active')$$,'HR activates the cycle');
select lives_ok($$select set_config('test.review_id',public.rpc_start_performance_review('94000000-0000-4000-8000-000000000001',current_setting('test.cycle_id')::uuid,'93000000-0000-4000-8000-000000000002')::text,true)$$,'HR starts and assigns a review');
select throws_ok($$select public.rpc_start_performance_review('94000000-0000-4000-8000-000000000001',current_setting('test.cycle_id')::uuid,'93000000-0000-4000-8000-000000000002')$$,'23505','This employee already has a review in the cycle.','one review per employee and cycle');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select public.rpc_save_performance_review(current_setting('test.review_id')::uuid,'Not my review',false,false,'[{"description":"Goal","managerRating":3}]'::jsonb)$$,'42501','Only an assigned reviewer can edit this review.','unassigned staff cannot edit a review');
select is((select count(*)::integer from public.rpc_list_my_performance_reviews()),0,'other employee cannot see a review');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.rpc_save_performance_review(current_setting('test.review_id')::uuid,'Strong delivery',true,false,'[{"description":"Deliver sites","managerRating":4},{"description":"Safety compliance","managerRating":5}]'::jsonb)$$,'assigned manager saves goals and ratings');
select is((select overall_score from public.rpc_list_performance_reviews(current_setting('test.cycle_id')::uuid) where id=current_setting('test.review_id')::uuid),4.5::numeric,'overall score averages manager ratings');
select lives_ok($$select public.rpc_submit_performance_review(current_setting('test.review_id')::uuid)$$,'manager submits review to HR');
reset role;

select ok((select count(*) from public.notifications where recipient_profile_id='93000000-0000-4000-8000-000000000003' and event_key like 'performance_submitted_%')=1,'manager submission notifies HR');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok($$select public.rpc_decide_performance_review(current_setting('test.review_id')::uuid,'approved','Released after HR review')$$,'HR approves and releases review');
select is((select status from public.rpc_list_performance_reviews(current_setting('test.cycle_id')::uuid) where id=current_setting('test.review_id')::uuid),'hr_approved','approved review is released');
reset role;

select ok((select count(*) from public.notifications where recipient_profile_id='93000000-0000-4000-8000-000000000001' and event_key like 'performance_approved_%')=1,'release notifies employee');
select is((select action_path from public.notifications where recipient_profile_id='93000000-0000-4000-8000-000000000001' and event_key like 'performance_approved_%' limit 1),'/my/performance?review='||current_setting('test.review_id'),'notification opens the employee review');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::integer from public.rpc_list_my_performance_reviews()),1,'employee sees their released review');
select lives_ok($$select public.rpc_acknowledge_performance_review(current_setting('test.review_id')::uuid,'Discussed with manager')$$,'employee acknowledges their review');
select is((select status from public.rpc_list_my_performance_reviews() limit 1),'employee_acknowledged','acknowledgment closes employee action');
reset role;

select ok((select count(*) from public.performance_review_events where review_id=current_setting('test.review_id')::uuid)>=5,'workflow history is append-only');
select ok((select count(*) from public.audit_events where entity_type='performance_review' and entity_id=current_setting('test.review_id'))>=4,'review transitions are audited');
select is((select recommend_increment from public.performance_reviews where id=current_setting('test.review_id')::uuid),true,'legacy increment recommendation is retained');
select is((select recommend_promotion from public.performance_reviews where id=current_setting('test.review_id')::uuid),false,'legacy promotion recommendation is retained');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok($$select set_config('test.imported_review_id',public.rpc_import_performance_review('94000000-0000-4000-8000-000000000004',current_setting('test.cycle_id')::uuid,'93000000-0000-4000-8000-000000000002','Imported legacy assessment',false,true,'[{"description":"Complete rollout","managerRating":5}]'::jsonb)::text,true)$$,'HR imports a legacy workbook assessment');
select is((select status from public.rpc_list_performance_reviews(current_setting('test.cycle_id')::uuid) where id=current_setting('test.imported_review_id')::uuid),'manager_submitted','imported assessment enters HR calibration');
reset role;
select ok((select count(*) from public.audit_events where event_type='performance_review.imported' and entity_id=current_setting('test.imported_review_id'))=1,'spreadsheet import is audited');

select * from finish();
rollback;
