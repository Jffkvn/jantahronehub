-- Secure staff salary advances, repayments, payroll schedules, audit, and notifications.

insert into public.permissions (key, resource, action, description) values
  ('staff_advances.read_self', 'staff_advances', 'read_self', 'Read personal staff advances and repayments.'),
  ('staff_advances.manage', 'staff_advances', 'manage', 'Administer staff advances and repayments.'),
  ('staff_advances.report', 'staff_advances', 'report', 'Read privacy-safe staff advance reporting.')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.key = 'staff_advances.read_self'
where role.key in ('employee', 'coordinator', 'project_manager', 'warehouse_manager', 'cfo', 'managing_director', 'hr_admin', 'super_admin')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.key = 'staff_advances.manage'
where role.key in ('hr_admin', 'super_admin')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.key = 'staff_advances.report'
where role.key in ('hr_admin', 'super_admin', 'cfo', 'managing_director')
on conflict do nothing;

create table public.staff_advances (
  id uuid primary key default extensions.gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  amount numeric(16,2) not null check (amount > 0),
  reason text not null check (length(btrim(reason)) between 3 and 1000),
  date_issued date not null,
  deduction_start_month date not null check (deduction_start_month = date_trunc('month', deduction_start_month)::date),
  num_instalments integer not null check (num_instalments between 1 and 60),
  monthly_deduction numeric(16,2) not null check (monthly_deduction > 0),
  balance_remaining numeric(16,2) not null check (balance_remaining >= 0 and balance_remaining <= amount),
  status text not null check (status in ('pending', 'active', 'paid_off', 'written_off', 'flagged', 'rejected', 'voided')),
  source text not null check (source in ('employee', 'hr_on_behalf')),
  notes text check (notes is null or length(btrim(notes)) <= 2000),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or status <> 'pending'
  )
);

create unique index staff_advances_one_open_per_employee_idx
  on public.staff_advances(employee_id)
  where status in ('pending', 'active', 'flagged');
create index staff_advances_employee_created_idx on public.staff_advances(employee_id, created_at desc);
create index staff_advances_status_idx on public.staff_advances(status, created_at desc);

create table public.advance_repayments (
  id uuid primary key default extensions.gen_random_uuid(),
  advance_id uuid not null references public.staff_advances(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  payroll_period date not null check (payroll_period = date_trunc('month', payroll_period)::date),
  amount numeric(16,2) not null check (amount > 0),
  source text not null check (source in ('payroll', 'manual', 'exit')),
  notes text,
  payroll_run_id uuid references public.payroll_runs(id) on delete restrict,
  paid_at timestamptz not null default now(),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(advance_id, payroll_period, source, payroll_run_id)
);
create index advance_repayments_advance_idx on public.advance_repayments(advance_id, payroll_period);

create table public.staff_advance_events (
  id uuid primary key default extensions.gen_random_uuid(),
  advance_id uuid not null references public.staff_advances(id) on delete restrict,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]*$'),
  from_status text,
  to_status text not null,
  amount numeric(16,2),
  reason text,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now()
);
create index staff_advance_events_advance_idx on public.staff_advance_events(advance_id, occurred_at);

alter table public.staff_advances enable row level security;
alter table public.advance_repayments enable row level security;
alter table public.staff_advance_events enable row level security;
revoke all on public.staff_advances, public.advance_repayments, public.staff_advance_events from anon, authenticated;

create or replace function public._staff_advance_employee_for_profile(p_profile_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select employee.id from public.employees employee
  where employee.profile_id = p_profile_id and employee.archived_at is null
  limit 1
$$;

create or replace function public._record_staff_advance_event(
  p_advance_id uuid, p_event_type text, p_from_status text, p_to_status text,
  p_amount numeric, p_reason text, p_actor uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.staff_advance_events(advance_id, event_type, from_status, to_status, amount, reason, actor_profile_id)
  values (p_advance_id, p_event_type, p_from_status, p_to_status, p_amount, nullif(btrim(p_reason), ''), p_actor);
end
$$;

create or replace function public.rpc_list_my_staff_advances()
returns table (
  id uuid, employee_id uuid, employee_name text, amount numeric, reason text,
  date_issued date, deduction_start_month date, num_instalments integer,
  monthly_deduction numeric, balance_remaining numeric, status text, source text,
  notes text, submitted_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select advance.id, advance.employee_id, employee.legal_name, advance.amount, advance.reason,
    advance.date_issued, advance.deduction_start_month, advance.num_instalments,
    advance.monthly_deduction, advance.balance_remaining, advance.status, advance.source,
    advance.notes, advance.created_at
  from public.staff_advances advance
  join public.employees employee on employee.id = advance.employee_id
  where advance.employee_id = public._staff_advance_employee_for_profile(public.current_profile_id())
  order by advance.created_at desc
$$;

create or replace function public.rpc_list_hr_staff_advances()
returns table (
  id uuid, employee_id uuid, employee_number text, employee_name text, amount numeric,
  reason text, date_issued date, deduction_start_month date, num_instalments integer,
  monthly_deduction numeric, balance_remaining numeric, status text, source text,
  notes text, submitted_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('staff_advances.manage') then
    raise exception 'staff_advances.manage permission is required' using errcode = '42501';
  end if;
  return query select advance.id, advance.employee_id, employee.employee_number, employee.legal_name,
    advance.amount, advance.reason, advance.date_issued, advance.deduction_start_month,
    advance.num_instalments, advance.monthly_deduction, advance.balance_remaining,
    advance.status, advance.source, advance.notes, advance.created_at
  from public.staff_advances advance join public.employees employee on employee.id = advance.employee_id
  order by advance.created_at desc;
end
$$;

create or replace function public.rpc_submit_staff_advance(
  p_amount numeric, p_reason text, p_num_instalments integer, p_deduction_start_month date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.current_profile_id();
  v_employee uuid := public._staff_advance_employee_for_profile(v_actor);
  v_id uuid;
  v_monthly numeric;
  v_hr record;
begin
  if not public.has_permission('staff_advances.read_self') or v_employee is null then
    raise exception 'An active employee profile is required.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Advance amount must be greater than zero.' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'An advance reason of at least 3 characters is required.' using errcode = '22023'; end if;
  if p_num_instalments is null or p_num_instalments not between 1 and 60 then raise exception 'Instalments must be between 1 and 60.' using errcode = '22023'; end if;
  if p_deduction_start_month <> date_trunc('month', p_deduction_start_month)::date then raise exception 'Deduction start must be the first day of a month.' using errcode = '22023'; end if;
  if exists(select 1 from public.staff_advances where employee_id = v_employee and status in ('pending','active','flagged')) then
    raise exception 'You already have an open staff advance.' using errcode = '23505';
  end if;
  v_monthly := round(p_amount / p_num_instalments, 2);
  insert into public.staff_advances(employee_id, amount, reason, date_issued, deduction_start_month,
    num_instalments, monthly_deduction, balance_remaining, status, source, requested_by, updated_by)
  values(v_employee, p_amount, btrim(p_reason), current_date, p_deduction_start_month,
    p_num_instalments, v_monthly, p_amount, 'pending', 'employee', v_actor, v_actor)
  returning id into v_id;
  perform public._record_staff_advance_event(v_id, 'submitted', null, 'pending', p_amount, p_reason, v_actor);
  insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,new_values)
  values(v_actor,'staff_advance.submitted','staff_advance',v_id::text,jsonb_build_object('employee_id',v_employee,'amount',p_amount,'instalments',p_num_instalments));
  for v_hr in
    select distinct profile.id from public.profiles profile
    join public.user_roles user_role on user_role.profile_id = profile.id
    join public.roles role on role.id = user_role.role_id
    where role.key in ('hr_admin', 'super_admin') and profile.id <> v_actor
  loop
    insert into public.notifications(recipient_profile_id,title,message,category,event_key,action_path)
    values(v_hr.id,'New Staff Advance Request','A staff advance request is waiting for HR review.','hr','staff_advance_submitted_'||v_id||'_'||v_hr.id,'/hr/staff-advances/'||v_id)
    on conflict (event_key) do nothing;
  end loop;
  return v_id;
end
$$;

create or replace function public.rpc_log_staff_advance(
  p_employee_id uuid, p_amount numeric, p_reason text, p_date_issued date,
  p_num_instalments integer, p_deduction_start_month date, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.current_profile_id();
  v_id uuid;
  v_monthly numeric;
  v_employee_profile uuid;
begin
  if not public.has_permission('staff_advances.manage') then raise exception 'staff_advances.manage permission is required' using errcode = '42501'; end if;
  if not exists(select 1 from public.employees where id = p_employee_id and archived_at is null) then raise exception 'Employee not found.' using errcode = 'P0002'; end if;
  if exists(select 1 from public.staff_advances where employee_id = p_employee_id and status in ('pending','active','flagged')) then raise exception 'Employee already has an open staff advance.' using errcode = '23505'; end if;
  if p_amount is null or p_amount <= 0 or p_num_instalments is null or p_num_instalments not between 1 and 60 then raise exception 'Enter a valid amount and 1 to 60 instalments.' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'An advance reason of at least 3 characters is required.' using errcode = '22023'; end if;
  if p_deduction_start_month <> date_trunc('month', p_deduction_start_month)::date then raise exception 'Deduction start must be the first day of a month.' using errcode = '22023'; end if;
  v_monthly := round(p_amount / p_num_instalments, 2);
  insert into public.staff_advances(employee_id,amount,reason,date_issued,deduction_start_month,num_instalments,
    monthly_deduction,balance_remaining,status,source,notes,requested_by,decided_by,decided_at,decision_reason,updated_by)
  values(p_employee_id,p_amount,btrim(p_reason),p_date_issued,p_deduction_start_month,p_num_instalments,
    v_monthly,p_amount,'active','hr_on_behalf',nullif(btrim(p_notes),''),v_actor,v_actor,now(),'Recorded by HR after offline discussion',v_actor)
  returning id into v_id;
  perform public._record_staff_advance_event(v_id,'logged',null,'active',p_amount,p_notes,v_actor);
  insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,new_values,reason)
  values(v_actor,'staff_advance.logged','staff_advance',v_id::text,jsonb_build_object('employee_id',p_employee_id,'amount',p_amount,'instalments',p_num_instalments),p_notes);
  select profile_id into v_employee_profile from public.employees where id = p_employee_id;
  if v_employee_profile is not null then
    insert into public.notifications(recipient_profile_id,title,message,category,event_key,action_path)
    values(v_employee_profile,'Staff Advance Recorded','HR recorded a staff advance for you.','hr','staff_advance_logged_'||v_id,'/workspace/advances')
    on conflict (event_key) do nothing;
  end if;
  return v_id;
end
$$;

create or replace function public.rpc_decide_staff_advance(p_advance_id uuid, p_decision text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.current_profile_id();
  v_row public.staff_advances%rowtype;
  v_next text;
  v_profile uuid;
begin
  if not public.has_permission('staff_advances.manage') then raise exception 'staff_advances.manage permission is required' using errcode = '42501'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected.' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'A decision reason of at least 3 characters is required.' using errcode = '22023'; end if;
  select * into v_row from public.staff_advances where id = p_advance_id for update;
  if v_row is null then raise exception 'Staff advance not found.' using errcode = 'P0002'; end if;
  if v_row.status <> 'pending' then raise exception 'Only pending staff advances can be decided.' using errcode = '55000'; end if;
  v_next := case when p_decision = 'approved' then 'active' else 'rejected' end;
  update public.staff_advances set status=v_next,decided_by=v_actor,decided_at=now(),decision_reason=btrim(p_reason),updated_by=v_actor,updated_at=now() where id=p_advance_id;
  perform public._record_staff_advance_event(p_advance_id,p_decision,v_row.status,v_next,null,p_reason,v_actor);
  insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,previous_values,new_values,reason)
  values(v_actor,'staff_advance.'||p_decision,'staff_advance',p_advance_id::text,jsonb_build_object('status',v_row.status),jsonb_build_object('status',v_next),p_reason);
  select profile_id into v_profile from public.employees where id=v_row.employee_id;
  if v_profile is not null then
    insert into public.notifications(recipient_profile_id,title,message,category,event_key,action_path)
    values(v_profile,'Staff Advance '||initcap(p_decision),'Your staff advance request has been '||p_decision||'.','hr','staff_advance_decision_'||p_advance_id||'_'||p_decision,'/workspace/advances')
    on conflict (event_key) do nothing;
  end if;
end
$$;

create or replace function public.rpc_record_advance_repayment(
  p_advance_id uuid, p_payroll_period date, p_amount numeric, p_source text, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.current_profile_id();
  v_row public.staff_advances%rowtype;
  v_id uuid;
  v_balance numeric;
  v_next text;
begin
  if not public.has_permission('staff_advances.manage') then raise exception 'staff_advances.manage permission is required' using errcode = '42501'; end if;
  select * into v_row from public.staff_advances where id=p_advance_id for update;
  if v_row is null then raise exception 'Staff advance not found.' using errcode = 'P0002'; end if;
  if v_row.status not in ('active','flagged') then raise exception 'Repayments require an active or flagged advance.' using errcode = '55000'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_row.balance_remaining then raise exception 'Repayment must be greater than zero and no more than the outstanding balance.' using errcode = '22023'; end if;
  if p_source not in ('payroll','manual','exit') then raise exception 'Invalid repayment source.' using errcode = '22023'; end if;
  if p_payroll_period <> date_trunc('month',p_payroll_period)::date then raise exception 'Repayment period must be the first day of a month.' using errcode = '22023'; end if;
  insert into public.advance_repayments(advance_id,employee_id,payroll_period,amount,source,notes,recorded_by)
  values(p_advance_id,v_row.employee_id,p_payroll_period,p_amount,p_source,nullif(btrim(p_notes),''),v_actor) returning id into v_id;
  v_balance := v_row.balance_remaining-p_amount;
  v_next := case when v_balance=0 then 'paid_off' else v_row.status end;
  update public.staff_advances set balance_remaining=v_balance,status=v_next,updated_by=v_actor,updated_at=now() where id=p_advance_id;
  perform public._record_staff_advance_event(p_advance_id,'repayment',v_row.status,v_next,p_amount,p_notes,v_actor);
  insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,previous_values,new_values,reason)
  values(v_actor,'staff_advance.repayment','staff_advance',p_advance_id::text,jsonb_build_object('balance',v_row.balance_remaining),jsonb_build_object('balance',v_balance,'amount',p_amount,'source',p_source),p_notes);
  return v_id;
end
$$;

create or replace function public.rpc_transition_staff_advance(p_advance_id uuid, p_transition text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.current_profile_id();
  v_row public.staff_advances%rowtype;
  v_next text;
  v_balance numeric;
begin
  if not public.has_permission('staff_advances.manage') then raise exception 'staff_advances.manage permission is required' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'A reason of at least 3 characters is required.' using errcode = '22023'; end if;
  select * into v_row from public.staff_advances where id=p_advance_id for update;
  if v_row is null then raise exception 'Staff advance not found.' using errcode = 'P0002'; end if;
  v_next := case p_transition when 'flagged' then 'flagged' when 'reactivated' then 'active' when 'settled' then 'paid_off' when 'written_off' then 'written_off' when 'voided' then 'voided' else null end;
  if v_next is null then raise exception 'Invalid staff advance transition.' using errcode = '22023'; end if;
  if p_transition='flagged' and v_row.status<>'active' then raise exception 'Only active advances can be flagged.' using errcode='55000'; end if;
  if p_transition='reactivated' and v_row.status<>'flagged' then raise exception 'Only flagged advances can be reactivated.' using errcode='55000'; end if;
  if p_transition in ('settled','written_off') and v_row.status not in ('active','flagged') then raise exception 'Only active advances can be closed.' using errcode='55000'; end if;
  if p_transition='voided' and v_row.status not in ('pending','rejected') then raise exception 'Only pending or rejected advances can be voided.' using errcode='55000'; end if;
  v_balance := case when p_transition in ('settled','written_off') then 0 else v_row.balance_remaining end;
  update public.staff_advances set status=v_next,balance_remaining=v_balance,updated_by=v_actor,updated_at=now(),decision_reason=btrim(p_reason) where id=p_advance_id;
  perform public._record_staff_advance_event(p_advance_id,p_transition,v_row.status,v_next,null,p_reason,v_actor);
  insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,previous_values,new_values,reason)
  values(v_actor,'staff_advance.'||p_transition,'staff_advance',p_advance_id::text,jsonb_build_object('status',v_row.status,'balance',v_row.balance_remaining),jsonb_build_object('status',v_next,'balance',v_balance),p_reason);
end
$$;

create or replace function public.rpc_list_staff_advance_events(p_advance_id uuid)
returns table(id uuid,event_type text,from_status text,to_status text,amount numeric,reason text,actor_name text,occurred_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_employee uuid;
  v_own uuid := public._staff_advance_employee_for_profile(public.current_profile_id());
begin
  select employee_id into v_employee from public.staff_advances where staff_advances.id=p_advance_id;
  if v_employee is null then raise exception 'Staff advance not found.' using errcode='P0002'; end if;
  if not public.has_permission('staff_advances.manage') and v_employee<>v_own then raise exception 'You may only view your own staff advance history.' using errcode='42501'; end if;
  return query select event.id,event.event_type,event.from_status,event.to_status,event.amount,event.reason,profile.display_name,event.occurred_at
  from public.staff_advance_events event join public.profiles profile on profile.id=event.actor_profile_id
  where event.advance_id=p_advance_id order by event.occurred_at;
end
$$;

create or replace function public.rpc_staff_advance_payroll_deduction(p_employee_id uuid, p_payroll_period date)
returns numeric language plpgsql stable security definer set search_path = '' as $$
declare v_total numeric;
begin
  if not public.has_permission('payroll.prepare') and not public.has_permission('staff_advances.manage') then
    raise exception 'Payroll or staff advance permission is required.' using errcode='42501';
  end if;
  select coalesce(sum(least(advance.monthly_deduction,advance.balance_remaining)),0) into v_total
  from public.staff_advances advance
  where advance.employee_id=p_employee_id and advance.status in ('active','flagged')
    and advance.deduction_start_month<=date_trunc('month',p_payroll_period)::date
    and not exists(select 1 from public.advance_repayments repayment where repayment.advance_id=advance.id and repayment.payroll_period=date_trunc('month',p_payroll_period)::date and repayment.source='payroll');
  return v_total;
end
$$;

revoke all on function public._staff_advance_employee_for_profile(uuid) from public,anon,authenticated;
revoke all on function public._record_staff_advance_event(uuid,text,text,text,numeric,text,uuid) from public,anon,authenticated;
revoke all on function public.rpc_list_my_staff_advances() from public,anon;
revoke all on function public.rpc_list_hr_staff_advances() from public,anon;
revoke all on function public.rpc_submit_staff_advance(numeric,text,integer,date) from public,anon;
revoke all on function public.rpc_log_staff_advance(uuid,numeric,text,date,integer,date,text) from public,anon;
revoke all on function public.rpc_decide_staff_advance(uuid,text,text) from public,anon;
revoke all on function public.rpc_record_advance_repayment(uuid,date,numeric,text,text) from public,anon;
revoke all on function public.rpc_transition_staff_advance(uuid,text,text) from public,anon;
revoke all on function public.rpc_list_staff_advance_events(uuid) from public,anon;
revoke all on function public.rpc_staff_advance_payroll_deduction(uuid,date) from public,anon;
grant execute on function public.rpc_list_my_staff_advances() to authenticated;
grant execute on function public.rpc_list_hr_staff_advances() to authenticated;
grant execute on function public.rpc_submit_staff_advance(numeric,text,integer,date) to authenticated;
grant execute on function public.rpc_log_staff_advance(uuid,numeric,text,date,integer,date,text) to authenticated;
grant execute on function public.rpc_decide_staff_advance(uuid,text,text) to authenticated;
grant execute on function public.rpc_record_advance_repayment(uuid,date,numeric,text,text) to authenticated;
grant execute on function public.rpc_transition_staff_advance(uuid,text,text) to authenticated;
grant execute on function public.rpc_list_staff_advance_events(uuid) to authenticated;
grant execute on function public.rpc_staff_advance_payroll_deduction(uuid,date) to authenticated;
