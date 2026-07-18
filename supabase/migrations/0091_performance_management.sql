-- Secure performance cycles, KPI reviews, HR release, employee acknowledgment and history.

insert into public.permissions(key,resource,action,description) values
 ('performance.read_self','performance','read_self','Read personal released performance reviews and assigned manager reviews.'),
 ('performance.manage','performance','manage','Create cycles, assign reviewers and approve performance reviews.'),
 ('performance.review','performance','review','Complete performance reviews assigned by HR.'),
 ('performance.report','performance','report','Read executive performance summaries.')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select role.id,permission.id from public.roles role join public.permissions permission on permission.key='performance.read_self'
where role.key in ('employee','coordinator','project_manager','warehouse_manager','cfo','managing_director','hr_admin','super_admin') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select role.id,permission.id from public.roles role join public.permissions permission on permission.key='performance.review'
where role.key in ('project_manager','managing_director','hr_admin','super_admin') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select role.id,permission.id from public.roles role join public.permissions permission on permission.key='performance.manage'
where role.key in ('hr_admin','super_admin') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select role.id,permission.id from public.roles role join public.permissions permission on permission.key='performance.report'
where role.key in ('hr_admin','super_admin','managing_director') on conflict do nothing;

create table public.performance_cycles(
 id uuid primary key default extensions.gen_random_uuid(), name text not null check(length(btrim(name)) between 2 and 160),
 start_date date not null, end_date date not null check(end_date>=start_date), status text not null default 'draft' check(status in ('draft','active','closed')),
 created_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(), updated_by uuid not null references public.profiles(id) on delete restrict, updated_at timestamptz not null default now()
);
create unique index performance_cycles_name_dates_idx on public.performance_cycles(lower(name),start_date,end_date);

create table public.performance_reviews(
 id uuid primary key default extensions.gen_random_uuid(), cycle_id uuid not null references public.performance_cycles(id) on delete restrict,
 employee_id uuid not null references public.employees(id) on delete restrict, reviewer_profile_id uuid not null references public.profiles(id) on delete restrict,
 status text not null default 'draft' check(status in ('draft','manager_submitted','hr_approved','employee_acknowledged','reopened')),
 overall_score numeric(3,2) check(overall_score is null or overall_score between 1 and 5), manager_comments text check(manager_comments is null or length(btrim(manager_comments))<=4000),
 recommend_increment boolean not null default false, recommend_promotion boolean not null default false,
 submitted_at timestamptz, hr_decided_by uuid references public.profiles(id) on delete restrict, hr_decided_at timestamptz, hr_reason text,
 acknowledged_at timestamptz, acknowledgment_comment text,
 created_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(), updated_by uuid not null references public.profiles(id) on delete restrict, updated_at timestamptz not null default now(),
 unique(cycle_id,employee_id)
);
create index performance_reviews_reviewer_idx on public.performance_reviews(reviewer_profile_id,status);
create index performance_reviews_employee_idx on public.performance_reviews(employee_id,status);

create table public.performance_goals(
 id uuid primary key default extensions.gen_random_uuid(), review_id uuid not null references public.performance_reviews(id) on delete restrict,
 description text not null check(length(btrim(description)) between 2 and 1000), manager_rating numeric(2,1) not null check(manager_rating between 1 and 5),
 sort_order integer not null default 0, created_at timestamptz not null default now(), unique(review_id,sort_order)
);
create index performance_goals_review_idx on public.performance_goals(review_id,sort_order);

create table public.performance_review_events(
 id uuid primary key default extensions.gen_random_uuid(), review_id uuid not null references public.performance_reviews(id) on delete restrict,
 event_type text not null check(event_type ~ '^[a-z][a-z0-9_]*$'), from_status text, to_status text not null,
 reason text, actor_profile_id uuid not null references public.profiles(id) on delete restrict, occurred_at timestamptz not null default now()
);
create index performance_review_events_review_idx on public.performance_review_events(review_id,occurred_at);

alter table public.performance_cycles enable row level security;
alter table public.performance_reviews enable row level security;
alter table public.performance_goals enable row level security;
alter table public.performance_review_events enable row level security;
revoke all on public.performance_cycles,public.performance_reviews,public.performance_goals,public.performance_review_events from anon,authenticated;

alter table public.notifications drop constraint if exists notifications_action_path_check;
alter table public.notifications add constraint notifications_action_path_check check(action_path is null or (action_path ~ '^/[A-Za-z0-9_/-]+(\?(request|advance|review)=[0-9a-f-]{36})?$' and action_path !~ '//' and action_path !~ '\.\.'));

create or replace function public._performance_employee_for_profile(p_profile_id uuid) returns uuid language sql stable security definer set search_path='' as $$
 select employee.id from public.employees employee where employee.profile_id=p_profile_id and employee.archived_at is null limit 1
$$;

create or replace function public._record_performance_event(p_review_id uuid,p_event_type text,p_from text,p_to text,p_reason text,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin insert into public.performance_review_events(review_id,event_type,from_status,to_status,reason,actor_profile_id) values(p_review_id,p_event_type,p_from,p_to,nullif(btrim(p_reason),''),p_actor); end
$$;
revoke all on function public._record_performance_event(uuid,text,text,text,text,uuid) from public,anon,authenticated;

create or replace function public.rpc_list_performance_cycles()
returns table(id uuid,name text,start_date date,end_date date,status text,total_reviews bigint,completed_reviews bigint)
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=public.current_profile_id();
begin
 if not public.has_permission('performance.manage') and not public.has_permission('performance.review') then raise exception 'Performance access is required.' using errcode='42501'; end if;
 return query select cycle.id,cycle.name,cycle.start_date,cycle.end_date,cycle.status,count(review.id),count(review.id) filter(where review.status in ('hr_approved','employee_acknowledged'))
 from public.performance_cycles cycle left join public.performance_reviews review on review.cycle_id=cycle.id and (public.has_permission('performance.manage') or review.reviewer_profile_id=v_actor)
 group by cycle.id order by cycle.start_date desc;
end $$;

create or replace function public.rpc_create_performance_cycle(p_name text,p_start_date date,p_end_date date) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.current_profile_id(); v_id uuid;
begin
 if not public.has_permission('performance.manage') then raise exception 'performance.manage permission is required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_name,'')))<2 or p_end_date<p_start_date then raise exception 'Enter a valid cycle name and date range.' using errcode='22023'; end if;
 insert into public.performance_cycles(name,start_date,end_date,created_by,updated_by) values(btrim(p_name),p_start_date,p_end_date,v_actor,v_actor) returning id into v_id;
 insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,new_values) values(v_actor,'performance_cycle.created','performance_cycle',v_id::text,jsonb_build_object('name',btrim(p_name),'start_date',p_start_date,'end_date',p_end_date));
 return v_id;
end $$;

create or replace function public.rpc_set_performance_cycle_status(p_cycle_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.current_profile_id(); v_old text;
begin
 if not public.has_permission('performance.manage') then raise exception 'performance.manage permission is required' using errcode='42501'; end if;
 if p_status not in ('draft','active','closed') then raise exception 'Invalid cycle status.' using errcode='22023'; end if;
 select status into v_old from public.performance_cycles where id=p_cycle_id for update; if v_old is null then raise exception 'Performance cycle not found.' using errcode='P0002'; end if;
 update public.performance_cycles set status=p_status,updated_by=v_actor,updated_at=now() where id=p_cycle_id;
 insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,previous_values,new_values) values(v_actor,'performance_cycle.status_changed','performance_cycle',p_cycle_id::text,jsonb_build_object('status',v_old),jsonb_build_object('status',p_status));
end $$;

create or replace function public.rpc_list_performance_reviewers() returns table(profile_id uuid,display_name text,role_label text) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_permission('performance.manage') then raise exception 'performance.manage permission is required' using errcode='42501'; end if;
 return query select profile.id,profile.display_name,string_agg(distinct initcap(replace(role.key,'_',' ')),', ' order by initcap(replace(role.key,'_',' ')))
 from public.profiles profile join public.user_roles user_role on user_role.profile_id=profile.id join public.roles role on role.id=user_role.role_id
 where role.key in ('project_manager','managing_director','hr_admin','super_admin') group by profile.id order by profile.display_name;
end $$;

create or replace function public.rpc_start_performance_review(p_employee_id uuid,p_cycle_id uuid,p_reviewer_profile_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.current_profile_id(); v_id uuid; v_employee text;
begin
 if not public.has_permission('performance.manage') then raise exception 'performance.manage permission is required' using errcode='42501'; end if;
 if not exists(select 1 from public.performance_cycles where id=p_cycle_id and status='active') then raise exception 'An active performance cycle is required.' using errcode='55000'; end if;
 select legal_name into v_employee from public.employees where id=p_employee_id and archived_at is null; if v_employee is null then raise exception 'Employee not found.' using errcode='P0002'; end if;
 if not exists(select 1 from public.user_roles ur join public.roles role on role.id=ur.role_id where ur.profile_id=p_reviewer_profile_id and role.key in ('project_manager','managing_director','hr_admin','super_admin')) then raise exception 'Select an eligible reviewer.' using errcode='22023'; end if;
 if exists(select 1 from public.performance_reviews where cycle_id=p_cycle_id and employee_id=p_employee_id) then raise exception 'This employee already has a review in the cycle.' using errcode='23505'; end if;
 insert into public.performance_reviews(cycle_id,employee_id,reviewer_profile_id,created_by,updated_by) values(p_cycle_id,p_employee_id,p_reviewer_profile_id,v_actor,v_actor) returning id into v_id;
 perform public._record_performance_event(v_id,'started',null,'draft','Reviewer assigned',v_actor);
 insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,new_values) values(v_actor,'performance_review.started','performance_review',v_id::text,jsonb_build_object('employee_id',p_employee_id,'cycle_id',p_cycle_id,'reviewer_profile_id',p_reviewer_profile_id));
 if p_reviewer_profile_id<>v_actor then insert into public.notifications(recipient_profile_id,title,message,category,event_key,action_path) values(p_reviewer_profile_id,'Performance Review Assigned','You have been assigned the performance review for '||v_employee||'.','hr','performance_assigned_'||v_id,'/my/performance?review='||v_id) on conflict(event_key) do nothing; end if;
 return v_id;
end $$;

create or replace function public._performance_review_rows(p_cycle_id uuid,p_self_only boolean)
returns table(id uuid,cycle_id uuid,cycle_name text,employee_id uuid,employee_number text,employee_name text,reviewer_profile_id uuid,reviewer_name text,status text,overall_score numeric,manager_comments text,recommend_increment boolean,recommend_promotion boolean,hr_reason text,acknowledged_at timestamptz,acknowledgment_comment text,goals jsonb)
language sql stable security definer set search_path='' as $$
 select review.id,review.cycle_id,cycle.name,review.employee_id,employee.employee_number,employee.legal_name,review.reviewer_profile_id,reviewer.display_name,review.status,review.overall_score,review.manager_comments,review.recommend_increment,review.recommend_promotion,review.hr_reason,review.acknowledged_at,review.acknowledgment_comment,
 coalesce((select jsonb_agg(jsonb_build_object('id',goal.id,'description',goal.description,'manager_rating',goal.manager_rating) order by goal.sort_order) from public.performance_goals goal where goal.review_id=review.id),'[]'::jsonb)
 from public.performance_reviews review join public.performance_cycles cycle on cycle.id=review.cycle_id join public.employees employee on employee.id=review.employee_id join public.profiles reviewer on reviewer.id=review.reviewer_profile_id
 where (p_cycle_id is null or review.cycle_id=p_cycle_id) and (
  (p_self_only and review.employee_id=public._performance_employee_for_profile(public.current_profile_id()) and review.status in ('hr_approved','employee_acknowledged'))
  or (not p_self_only and (public.has_permission('performance.manage') or review.reviewer_profile_id=public.current_profile_id()))
 ) order by cycle.start_date desc,employee.legal_name
$$;
revoke all on function public._performance_review_rows(uuid,boolean) from public,anon,authenticated;

create or replace function public.rpc_list_performance_reviews(p_cycle_id uuid default null)
returns table(id uuid,cycle_id uuid,cycle_name text,employee_id uuid,employee_number text,employee_name text,reviewer_profile_id uuid,reviewer_name text,status text,overall_score numeric,manager_comments text,recommend_increment boolean,recommend_promotion boolean,hr_reason text,acknowledged_at timestamptz,acknowledgment_comment text,goals jsonb)
language plpgsql stable security definer set search_path='' as $$
begin if not public.has_permission('performance.manage') and not public.has_permission('performance.review') then raise exception 'Performance access is required.' using errcode='42501'; end if; return query select * from public._performance_review_rows(p_cycle_id,false); end $$;

create or replace function public.rpc_list_my_assigned_performance_reviews()
returns table(id uuid,cycle_id uuid,cycle_name text,employee_id uuid,employee_number text,employee_name text,reviewer_profile_id uuid,reviewer_name text,status text,overall_score numeric,manager_comments text,recommend_increment boolean,recommend_promotion boolean,hr_reason text,acknowledged_at timestamptz,acknowledgment_comment text,goals jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_permission('performance.read_self') then raise exception 'performance.read_self permission is required' using errcode='42501'; end if;
 return query select * from public._performance_review_rows(null,false) rows where rows.reviewer_profile_id=public.current_profile_id();
end $$;

create or replace function public.rpc_list_my_performance_reviews()
returns table(id uuid,cycle_id uuid,cycle_name text,employee_id uuid,employee_number text,employee_name text,reviewer_profile_id uuid,reviewer_name text,status text,overall_score numeric,manager_comments text,recommend_increment boolean,recommend_promotion boolean,hr_reason text,acknowledged_at timestamptz,acknowledgment_comment text,goals jsonb)
language plpgsql stable security definer set search_path='' as $$
begin if not public.has_permission('performance.read_self') then raise exception 'performance.read_self permission is required' using errcode='42501'; end if; return query select * from public._performance_review_rows(null,true); end $$;

create or replace function public.rpc_save_performance_review(p_review_id uuid,p_manager_comments text,p_recommend_increment boolean,p_recommend_promotion boolean,p_goals jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.current_profile_id(); v_review public.performance_reviews%rowtype; v_goal jsonb; v_order integer:=0; v_sum numeric:=0; v_count integer:=0; v_rating numeric;
begin
 select * into v_review from public.performance_reviews where id=p_review_id for update; if v_review is null then raise exception 'Performance review not found.' using errcode='P0002'; end if;
 if v_review.reviewer_profile_id<>v_actor then raise exception 'Only an assigned reviewer can edit this review.' using errcode='42501'; end if;
 if v_review.status not in ('draft','reopened') then raise exception 'Only draft or reopened reviews can be edited.' using errcode='55000'; end if;
 if length(btrim(coalesce(p_manager_comments,'')))<3 or jsonb_typeof(p_goals)<>'array' or jsonb_array_length(p_goals)<1 then raise exception 'Comments and at least one rated goal are required.' using errcode='22023'; end if;
 delete from public.performance_goals where review_id=p_review_id;
 for v_goal in select * from jsonb_array_elements(p_goals) loop
  v_rating:=coalesce(nullif(v_goal->>'managerRating','')::numeric,nullif(v_goal->>'manager_rating','')::numeric);
  if length(btrim(coalesce(v_goal->>'description','')))<2 or v_rating not between 1 and 5 then raise exception 'Each goal needs a description and rating from 1 to 5.' using errcode='22023'; end if;
  insert into public.performance_goals(review_id,description,manager_rating,sort_order) values(p_review_id,btrim(v_goal->>'description'),v_rating,v_order);
  v_sum:=v_sum+v_rating; v_count:=v_count+1; v_order:=v_order+1;
 end loop;
 update public.performance_reviews set overall_score=round(v_sum/v_count,2),manager_comments=btrim(p_manager_comments),recommend_increment=coalesce(p_recommend_increment,false),recommend_promotion=coalesce(p_recommend_promotion,false),updated_by=v_actor,updated_at=now() where id=p_review_id;
 perform public._record_performance_event(p_review_id,'draft_saved',v_review.status,v_review.status,'Manager draft saved',v_actor);
 insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,new_values) values(v_actor,'performance_review.saved','performance_review',p_review_id::text,jsonb_build_object('goal_count',v_count,'overall_score',round(v_sum/v_count,2),'recommend_increment',p_recommend_increment,'recommend_promotion',p_recommend_promotion));
end $$;

create or replace function public.rpc_import_performance_review(p_employee_id uuid,p_cycle_id uuid,p_reviewer_profile_id uuid,p_manager_comments text,p_recommend_increment boolean,p_recommend_promotion boolean,p_goals jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.current_profile_id(); v_review_id uuid; v_goal jsonb; v_order integer:=0; v_sum numeric:=0; v_count integer:=0; v_rating numeric; v_old text;
begin
 if not public.has_permission('performance.manage') then raise exception 'performance.manage permission is required' using errcode='42501'; end if;
 if not exists(select 1 from public.performance_cycles where id=p_cycle_id and status='active') then raise exception 'An active performance cycle is required.' using errcode='55000'; end if;
 if not exists(select 1 from public.employees where id=p_employee_id and archived_at is null) then raise exception 'Employee not found.' using errcode='P0002'; end if;
 if not exists(select 1 from public.user_roles ur join public.roles role on role.id=ur.role_id where ur.profile_id=p_reviewer_profile_id and role.key in ('project_manager','managing_director','hr_admin','super_admin')) then raise exception 'Select an eligible reviewer.' using errcode='22023'; end if;
 if length(btrim(coalesce(p_manager_comments,'')))<3 or jsonb_typeof(p_goals)<>'array' or jsonb_array_length(p_goals)<1 then raise exception 'Comments and rated goals are required.' using errcode='22023'; end if;
 select id,status into v_review_id,v_old from public.performance_reviews where cycle_id=p_cycle_id and employee_id=p_employee_id for update;
 if v_review_id is null then
  insert into public.performance_reviews(cycle_id,employee_id,reviewer_profile_id,status,created_by,updated_by) values(p_cycle_id,p_employee_id,p_reviewer_profile_id,'manager_submitted',v_actor,v_actor) returning id into v_review_id;
  v_old:=null;
 else
  if v_old not in ('draft','reopened','manager_submitted') then raise exception 'A released review cannot be overwritten by import.' using errcode='55000'; end if;
  update public.performance_reviews set reviewer_profile_id=p_reviewer_profile_id,status='manager_submitted',updated_by=v_actor,updated_at=now() where id=v_review_id;
 end if;
 delete from public.performance_goals where review_id=v_review_id;
 for v_goal in select * from jsonb_array_elements(p_goals) loop
  v_rating:=coalesce(nullif(v_goal->>'managerRating','')::numeric,nullif(v_goal->>'manager_rating','')::numeric);
  if length(btrim(coalesce(v_goal->>'description','')))<2 or v_rating not between 1 and 5 then raise exception 'Each goal needs a description and rating from 1 to 5.' using errcode='22023'; end if;
  insert into public.performance_goals(review_id,description,manager_rating,sort_order) values(v_review_id,btrim(v_goal->>'description'),v_rating,v_order);
  v_sum:=v_sum+v_rating; v_count:=v_count+1; v_order:=v_order+1;
 end loop;
 update public.performance_reviews set overall_score=round(v_sum/v_count,2),manager_comments=btrim(p_manager_comments),recommend_increment=coalesce(p_recommend_increment,false),recommend_promotion=coalesce(p_recommend_promotion,false),submitted_at=now(),updated_by=v_actor,updated_at=now() where id=v_review_id;
 perform public._record_performance_event(v_review_id,'spreadsheet_imported',v_old,'manager_submitted','Imported by HR from workbook',v_actor);
 insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,new_values) values(v_actor,'performance_review.imported','performance_review',v_review_id::text,jsonb_build_object('employee_id',p_employee_id,'reviewer_profile_id',p_reviewer_profile_id,'goal_count',v_count,'overall_score',round(v_sum/v_count,2)));
 return v_review_id;
end $$;

create or replace function public.rpc_submit_performance_review(p_review_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.current_profile_id(); v_review public.performance_reviews%rowtype; v_hr record;
begin
 select * into v_review from public.performance_reviews where id=p_review_id for update; if v_review is null then raise exception 'Performance review not found.' using errcode='P0002'; end if;
 if v_review.reviewer_profile_id<>v_actor then raise exception 'Only an assigned reviewer can edit this review.' using errcode='42501'; end if;
 if v_review.status not in ('draft','reopened') or v_review.overall_score is null or not exists(select 1 from public.performance_goals where review_id=p_review_id) then raise exception 'Complete and save the review before submitting.' using errcode='55000'; end if;
 update public.performance_reviews set status='manager_submitted',submitted_at=now(),updated_by=v_actor,updated_at=now() where id=p_review_id;
 perform public._record_performance_event(p_review_id,'submitted',v_review.status,'manager_submitted','Submitted for HR approval',v_actor);
 insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,previous_values,new_values) values(v_actor,'performance_review.submitted','performance_review',p_review_id::text,jsonb_build_object('status',v_review.status),jsonb_build_object('status','manager_submitted'));
 for v_hr in select distinct p.id from public.profiles p join public.user_roles ur on ur.profile_id=p.id join public.roles r on r.id=ur.role_id where r.key in ('hr_admin','super_admin') loop
  insert into public.notifications(recipient_profile_id,title,message,category,event_key,action_path) values(v_hr.id,'Performance Review Awaiting Approval','A manager-submitted performance review is ready for HR.','hr','performance_submitted_'||p_review_id||'_'||v_hr.id,'/hr/performance?review='||p_review_id) on conflict(event_key) do nothing;
 end loop;
end $$;

create or replace function public.rpc_decide_performance_review(p_review_id uuid,p_decision text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.current_profile_id(); v_review public.performance_reviews%rowtype; v_next text; v_employee_profile uuid;
begin
 if not public.has_permission('performance.manage') then raise exception 'performance.manage permission is required' using errcode='42501'; end if;
 if p_decision not in ('approved','reopened') or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'A valid decision and reason are required.' using errcode='22023'; end if;
 select * into v_review from public.performance_reviews where id=p_review_id for update; if v_review is null then raise exception 'Performance review not found.' using errcode='P0002'; end if;
 if v_review.status<>'manager_submitted' then raise exception 'Only submitted reviews can be approved.' using errcode='55000'; end if;
 v_next:=case when p_decision='approved' then 'hr_approved' else 'reopened' end;
 update public.performance_reviews set status=v_next,hr_decided_by=v_actor,hr_decided_at=now(),hr_reason=btrim(p_reason),updated_by=v_actor,updated_at=now() where id=p_review_id;
 perform public._record_performance_event(p_review_id,p_decision,v_review.status,v_next,p_reason,v_actor);
 insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,previous_values,new_values,reason) values(v_actor,'performance_review.'||p_decision,'performance_review',p_review_id::text,jsonb_build_object('status',v_review.status),jsonb_build_object('status',v_next),p_reason);
 if p_decision='approved' then
  select profile_id into v_employee_profile from public.employees where id=v_review.employee_id;
  if v_employee_profile is not null then insert into public.notifications(recipient_profile_id,title,message,category,event_key,action_path) values(v_employee_profile,'Performance Review Released','HR has released your performance review for acknowledgment.','hr','performance_approved_'||p_review_id,'/my/performance?review='||p_review_id) on conflict(event_key) do nothing; end if;
 else insert into public.notifications(recipient_profile_id,title,message,category,event_key,action_path) values(v_review.reviewer_profile_id,'Performance Review Reopened','HR requested changes to a performance review.','hr','performance_reopened_'||p_review_id,'/my/performance?review='||p_review_id) on conflict(event_key) do nothing;
 end if;
end $$;

create or replace function public.rpc_acknowledge_performance_review(p_review_id uuid,p_comment text) returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.current_profile_id(); v_employee uuid:=public._performance_employee_for_profile(v_actor); v_review public.performance_reviews%rowtype;
begin
 select * into v_review from public.performance_reviews where id=p_review_id for update; if v_review is null then raise exception 'Performance review not found.' using errcode='P0002'; end if;
 if v_review.employee_id<>v_employee then raise exception 'You may only acknowledge your own review.' using errcode='42501'; end if;
 if v_review.status<>'hr_approved' then raise exception 'Only released reviews can be acknowledged.' using errcode='55000'; end if;
 update public.performance_reviews set status='employee_acknowledged',acknowledged_at=now(),acknowledgment_comment=nullif(btrim(p_comment),''),updated_by=v_actor,updated_at=now() where id=p_review_id;
 perform public._record_performance_event(p_review_id,'acknowledged',v_review.status,'employee_acknowledged',p_comment,v_actor);
 insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,previous_values,new_values,reason) values(v_actor,'performance_review.acknowledged','performance_review',p_review_id::text,jsonb_build_object('status',v_review.status),jsonb_build_object('status','employee_acknowledged'),nullif(btrim(p_comment),''));
 insert into public.notifications(recipient_profile_id,title,message,category,event_key,action_path) values(v_review.reviewer_profile_id,'Performance Review Acknowledged','The employee acknowledged the released performance review.','hr','performance_acknowledged_'||p_review_id,'/my/performance?review='||p_review_id) on conflict(event_key) do nothing;
end $$;

create or replace function public.rpc_list_performance_review_events(p_review_id uuid)
returns table(id uuid,event_type text,from_status text,to_status text,reason text,actor_name text,occurred_at timestamptz) language plpgsql stable security definer set search_path='' as $$
declare v_review public.performance_reviews%rowtype; v_employee uuid:=public._performance_employee_for_profile(public.current_profile_id());
begin
 select * into v_review from public.performance_reviews where id=p_review_id;
 if v_review is null then raise exception 'Performance review not found.' using errcode='P0002'; end if;
 if not public.has_permission('performance.manage') and v_review.reviewer_profile_id<>public.current_profile_id() and not(v_review.employee_id=v_employee and v_review.status in ('hr_approved','employee_acknowledged')) then raise exception 'You cannot view this review history.' using errcode='42501'; end if;
 return query select event.id,event.event_type,event.from_status,event.to_status,event.reason,profile.display_name,event.occurred_at from public.performance_review_events event join public.profiles profile on profile.id=event.actor_profile_id where event.review_id=p_review_id order by event.occurred_at;
end $$;

revoke all on function public._performance_employee_for_profile(uuid) from public,anon,authenticated;
grant execute on function public.rpc_list_performance_cycles(),public.rpc_create_performance_cycle(text,date,date),public.rpc_set_performance_cycle_status(uuid,text),public.rpc_list_performance_reviewers(),public.rpc_start_performance_review(uuid,uuid,uuid),public.rpc_list_performance_reviews(uuid),public.rpc_list_my_assigned_performance_reviews(),public.rpc_list_my_performance_reviews(),public.rpc_save_performance_review(uuid,text,boolean,boolean,jsonb),public.rpc_import_performance_review(uuid,uuid,uuid,text,boolean,boolean,jsonb),public.rpc_submit_performance_review(uuid),public.rpc_decide_performance_review(uuid,text,text),public.rpc_acknowledge_performance_review(uuid,text),public.rpc_list_performance_review_events(uuid) to authenticated;
