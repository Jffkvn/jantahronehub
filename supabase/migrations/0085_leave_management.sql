-- Secure whole-day leave management for employee self-service and HR operations.

insert into public.permissions (key, resource, action, description) values
  ('leave.read_self', 'leave', 'read_self', 'Read personal leave balances and requests.'),
  ('leave.manage', 'leave', 'manage', 'Administer leave requests, setup, and balances.'),
  ('leave.report', 'leave', 'report', 'Read privacy-safe aggregate leave reporting.')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.key = 'leave.read_self'
where role.key in ('employee', 'coordinator', 'project_manager', 'warehouse_manager', 'cfo', 'managing_director', 'hr_admin', 'super_admin')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.key = 'leave.manage'
where role.key in ('hr_admin', 'super_admin')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.key = 'leave.report'
where role.key in ('hr_admin', 'super_admin', 'cfo', 'managing_director')
on conflict do nothing;

create table public.leave_types (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text not null check (length(btrim(name)) between 2 and 100),
  is_paid boolean not null default true,
  default_entitlement_days numeric(6,2) check (default_entitlement_days is null or default_entitlement_days >= 0),
  requires_evidence boolean not null default false,
  color text not null default '#128f76' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  display_order integer not null default 0 check (display_order >= 0),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  archive_reason text,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (
    (archived_at is null and archived_by is null and archive_reason is null)
    or (archived_at is not null and archived_by is not null and length(btrim(archive_reason)) >= 3)
  )
);
create unique index leave_types_code_unique_idx on public.leave_types(lower(code));
create unique index leave_types_name_unique_idx on public.leave_types(lower(name));

create table public.public_holidays (
  id uuid primary key default extensions.gen_random_uuid(),
  holiday_date date not null unique,
  name text not null check (length(btrim(name)) between 2 and 120),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.leave_entitlements (
  id uuid primary key default extensions.gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  leave_year integer not null check (leave_year between 2000 and 2200),
  entitled_days numeric(6,2) not null check (entitled_days >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique(employee_id, leave_type_id, leave_year)
);
create index leave_entitlements_employee_year_idx on public.leave_entitlements(employee_id, leave_year);

create table public.leave_balance_adjustments (
  id uuid primary key default extensions.gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  leave_year integer not null check (leave_year between 2000 and 2200),
  adjustment_days numeric(6,2) not null check (adjustment_days <> 0),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index leave_adjustments_employee_year_idx on public.leave_balance_adjustments(employee_id, leave_year);

create table public.leave_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  working_days integer not null check (working_days > 0),
  reason text not null check (length(btrim(reason)) between 3 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'cancelled')),
  source text not null default 'employee' check (source in ('employee', 'hr_on_behalf')),
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  decision_reason text,
  withdrawn_by uuid references public.profiles(id) on delete restrict,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (extract(year from start_date) = extract(year from end_date)),
  check ((status in ('approved', 'rejected') and decided_by is not null and decided_at is not null) or status not in ('approved', 'rejected')),
  check ((status = 'withdrawn' and withdrawn_by is not null and withdrawn_at is not null) or status <> 'withdrawn'),
  check ((status = 'cancelled' and cancelled_by is not null and cancelled_at is not null) or status <> 'cancelled')
);
create index leave_requests_employee_dates_idx on public.leave_requests(employee_id, start_date, end_date);
create index leave_requests_status_dates_idx on public.leave_requests(status, start_date, end_date);

create table public.leave_request_events (
  id uuid primary key default extensions.gen_random_uuid(),
  leave_request_id uuid not null references public.leave_requests(id) on delete restrict,
  event_type text not null check (event_type in ('submitted', 'approved', 'rejected', 'withdrawn', 'cancelled', 'logged_on_behalf')),
  from_status text,
  to_status text not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  reason text,
  occurred_at timestamptz not null default now()
);
create index leave_request_events_request_idx on public.leave_request_events(leave_request_id, occurred_at);

insert into public.leave_types
  (code, name, is_paid, default_entitlement_days, requires_evidence, color, display_order)
values
  ('annual', 'Annual Leave', true, 21, false, '#128f76', 1),
  ('sick', 'Sick Leave', true, 30, true, '#ef4444', 2),
  ('day_off', 'Day Off', true, null, false, '#0ea5e9', 3),
  ('unpaid', 'Unpaid Leave', false, null, false, '#64748b', 4),
  ('maternity', 'Maternity Leave', true, 60, false, '#a855f7', 5),
  ('paternity', 'Paternity Leave', true, 4, false, '#3b82f6', 6),
  ('compassionate', 'Compassionate Leave', true, 5, false, '#f59e0b', 7)
on conflict do nothing;

alter table public.leave_types enable row level security;
alter table public.public_holidays enable row level security;
alter table public.leave_entitlements enable row level security;
alter table public.leave_balance_adjustments enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_request_events enable row level security;

create policy leave_types_read on public.leave_types for select to authenticated
using (public.current_profile_id() is not null);
create policy public_holidays_read on public.public_holidays for select to authenticated
using (public.current_profile_id() is not null);
create policy leave_entitlements_scoped_read on public.leave_entitlements for select to authenticated
using (
  public.has_permission('leave.manage')
  or exists (select 1 from public.employees employee where employee.id = employee_id and employee.profile_id = auth.uid())
);
create policy leave_adjustments_scoped_read on public.leave_balance_adjustments for select to authenticated
using (
  public.has_permission('leave.manage')
  or exists (select 1 from public.employees employee where employee.id = employee_id and employee.profile_id = auth.uid())
);
create policy leave_requests_scoped_read on public.leave_requests for select to authenticated
using (
  public.has_permission('leave.manage')
  or exists (select 1 from public.employees employee where employee.id = employee_id and employee.profile_id = auth.uid())
);
create policy leave_events_scoped_read on public.leave_request_events for select to authenticated
using (
  public.has_permission('leave.manage')
  or exists (
    select 1 from public.leave_requests request_row
    join public.employees employee on employee.id = request_row.employee_id
    where request_row.id = leave_request_id and employee.profile_id = auth.uid()
  )
);

revoke all on public.leave_types, public.public_holidays, public.leave_entitlements,
  public.leave_balance_adjustments, public.leave_requests, public.leave_request_events
from public, anon, authenticated;
grant select on public.leave_types, public.public_holidays, public.leave_entitlements,
  public.leave_balance_adjustments, public.leave_requests, public.leave_request_events
to authenticated;

create or replace function public.leave_assert_hr()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.current_profile_id();
begin
  if actor is null or not public.has_permission('leave.manage') then
    raise insufficient_privilege using message = 'leave.manage permission is required';
  end if;
  return actor;
end
$$;
revoke all on function public.leave_assert_hr() from public, anon, authenticated;

create or replace function public.rpc_calculate_leave_working_days(p_start_date date, p_end_date date)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare result integer;
begin
  if p_start_date is null or p_end_date is null then
    raise invalid_parameter_value using message = 'Leave start and end dates are required.';
  end if;
  if p_end_date < p_start_date then
    raise invalid_parameter_value using message = 'Leave end date cannot be before start date.';
  end if;
  if extract(year from p_start_date) <> extract(year from p_end_date) then
    raise invalid_parameter_value using message = 'Leave dates must fall within one calendar year.';
  end if;
  select count(*)::integer into result
  from generate_series(p_start_date, p_end_date, interval '1 day') day_value
  where extract(isodow from day_value) between 1 and 5
    and not exists (
      select 1 from public.public_holidays holiday
      where holiday.holiday_date = day_value::date and holiday.is_active
    );
  return result;
end
$$;
revoke all on function public.rpc_calculate_leave_working_days(date, date) from public, anon;
grant execute on function public.rpc_calculate_leave_working_days(date, date) to authenticated;

create or replace function public.rpc_list_leave_types()
returns table (
  id uuid, code text, name text, is_paid boolean, default_entitlement_days numeric,
  requires_evidence boolean, color text, display_order integer
) language sql stable security definer set search_path = '' as $$
  select type_row.id, type_row.code, type_row.name, type_row.is_paid,
    type_row.default_entitlement_days, type_row.requires_evidence, type_row.color, type_row.display_order
  from public.leave_types type_row
  where type_row.archived_at is null
  order by type_row.display_order, type_row.name
$$;
revoke all on function public.rpc_list_leave_types() from public, anon;
grant execute on function public.rpc_list_leave_types() to authenticated;

create or replace function public.rpc_list_my_leave_requests()
returns table (
  id uuid, employee_id uuid, leave_type_id uuid, leave_type_code text, leave_type_name text,
  start_date date, end_date date, working_days integer, reason text, status text, source text,
  submitted_at timestamptz, decision_reason text, cancellation_reason text
) language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.current_profile_id();
begin
  if actor is null then raise insufficient_privilege using message = 'Authentication is required.'; end if;
  return query
  select request_row.id, request_row.employee_id, request_row.leave_type_id, type_row.code, type_row.name,
    request_row.start_date, request_row.end_date, request_row.working_days, request_row.reason,
    request_row.status, request_row.source, request_row.submitted_at, request_row.decision_reason,
    request_row.cancellation_reason
  from public.leave_requests request_row
  join public.employees employee on employee.id = request_row.employee_id and employee.profile_id = actor
  join public.leave_types type_row on type_row.id = request_row.leave_type_id
  order by request_row.submitted_at desc;
end
$$;
revoke all on function public.rpc_list_my_leave_requests() from public, anon;
grant execute on function public.rpc_list_my_leave_requests() to authenticated;

create or replace function public.rpc_list_hr_leave_requests()
returns table (
  id uuid, employee_id uuid, employee_name text, leave_type_id uuid, leave_type_code text,
  leave_type_name text, start_date date, end_date date, working_days integer, reason text,
  status text, source text, submitted_at timestamptz, decision_reason text, cancellation_reason text
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.leave_assert_hr();
  return query
  select request_row.id, employee.id, employee.legal_name, request_row.leave_type_id, type_row.code,
    type_row.name, request_row.start_date, request_row.end_date, request_row.working_days,
    request_row.reason, request_row.status, request_row.source, request_row.submitted_at,
    request_row.decision_reason, request_row.cancellation_reason
  from public.leave_requests request_row
  join public.employees employee on employee.id = request_row.employee_id
  join public.leave_types type_row on type_row.id = request_row.leave_type_id
  order by request_row.submitted_at desc;
end
$$;
revoke all on function public.rpc_list_hr_leave_requests() from public, anon;
grant execute on function public.rpc_list_hr_leave_requests() to authenticated;

create or replace function public.rpc_list_leave_balances(p_employee_id uuid, p_leave_year integer)
returns table (
  leave_type_id uuid, leave_type_code text, leave_type_name text, entitled_days numeric,
  adjustment_days numeric, approved_days numeric, remaining_days numeric, is_paid boolean
) language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.current_profile_id(); own_employee uuid;
begin
  select employee.id into own_employee from public.employees employee
  where employee.profile_id = actor and employee.id = p_employee_id;
  if actor is null or (own_employee is null and not public.has_permission('leave.manage')) then
    raise insufficient_privilege using message = 'You may only view your own leave balances.';
  end if;
  if p_leave_year not between 2000 and 2200 then
    raise invalid_parameter_value using message = 'A valid leave year is required.';
  end if;
  return query
  with values_by_type as (
    select type_row.id, type_row.code, type_row.name, type_row.is_paid,
      coalesce(entitlement.entitled_days, type_row.default_entitlement_days, 0)::numeric as entitlement,
      coalesce((select sum(adjustment.adjustment_days) from public.leave_balance_adjustments adjustment
        where adjustment.employee_id = p_employee_id and adjustment.leave_type_id = type_row.id
          and adjustment.leave_year = p_leave_year), 0)::numeric as adjustments,
      coalesce((select sum(request_row.working_days) from public.leave_requests request_row
        where request_row.employee_id = p_employee_id and request_row.leave_type_id = type_row.id
          and extract(year from request_row.start_date)::integer = p_leave_year
          and request_row.status = 'approved'), 0)::numeric as approved
    from public.leave_types type_row
    left join public.leave_entitlements entitlement
      on entitlement.employee_id = p_employee_id and entitlement.leave_type_id = type_row.id
      and entitlement.leave_year = p_leave_year
    where type_row.archived_at is null
  )
  select value_row.id, value_row.code, value_row.name, value_row.entitlement,
    value_row.adjustments, value_row.approved,
    value_row.entitlement + value_row.adjustments - value_row.approved, value_row.is_paid
  from values_by_type value_row
  order by (select display_order from public.leave_types where id = value_row.id);
end
$$;
revoke all on function public.rpc_list_leave_balances(uuid, integer) from public, anon;
grant execute on function public.rpc_list_leave_balances(uuid, integer) to authenticated;

create or replace function public.rpc_submit_leave_request(
  p_leave_type_id uuid, p_start_date date, p_end_date date, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.current_profile_id(); target_employee uuid; day_count integer; request_id uuid; hr_row record;
begin
  if actor is null then raise insufficient_privilege using message = 'Authentication is required.'; end if;
  select employee.id into target_employee from public.employees employee
  where employee.profile_id = actor and employee.archived_at is null;
  if target_employee is null then raise insufficient_privilege using message = 'An active employee profile is required.'; end if;
  if not exists(select 1 from public.leave_types type_row where type_row.id = p_leave_type_id and type_row.archived_at is null) then
    raise invalid_parameter_value using message = 'Select an active leave type.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise invalid_parameter_value using message = 'A leave reason of at least 3 characters is required.';
  end if;
  day_count := public.rpc_calculate_leave_working_days(p_start_date, p_end_date);
  if day_count < 1 then raise invalid_parameter_value using message = 'The selected dates contain no working days.'; end if;
  if exists(select 1 from public.leave_requests request_row where request_row.employee_id = target_employee
    and request_row.status in ('pending', 'approved')
    and daterange(request_row.start_date, request_row.end_date, '[]') && daterange(p_start_date, p_end_date, '[]')) then
    raise unique_violation using message = 'This leave overlaps an existing pending or approved request.';
  end if;
  insert into public.leave_requests
    (employee_id, leave_type_id, start_date, end_date, working_days, reason, status, source, submitted_by)
  values (target_employee, p_leave_type_id, p_start_date, p_end_date, day_count, btrim(p_reason), 'pending', 'employee', actor)
  returning id into request_id;
  insert into public.leave_request_events
    (leave_request_id, event_type, from_status, to_status, actor_profile_id, reason)
  values (request_id, 'submitted', null, 'pending', actor, btrim(p_reason));
  for hr_row in
    select distinct profile.id from public.profiles profile
    join public.user_roles user_role on user_role.profile_id = profile.id
    join public.role_permissions role_permission on role_permission.role_id = user_role.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where permission.key = 'leave.manage' and profile.status = 'active'
  loop
    insert into public.notifications (recipient_profile_id, title, message, category, event_key, action_path)
    values (hr_row.id, 'New Leave Request', 'A new leave request is ready for HR review.', 'hr',
      'leave_submitted_' || request_id || '_' || hr_row.id, '/hr/leave?request=' || request_id) on conflict (event_key) do nothing;
  end loop;
  return request_id;
end
$$;
revoke all on function public.rpc_submit_leave_request(uuid, date, date, text) from public, anon;
grant execute on function public.rpc_submit_leave_request(uuid, date, date, text) to authenticated;

create or replace function public.rpc_log_leave_for_employee(
  p_employee_id uuid, p_leave_type_id uuid, p_start_date date, p_end_date date, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.leave_assert_hr(); day_count integer; request_id uuid; employee_profile uuid;
begin
  if not exists(select 1 from public.employees employee where employee.id = p_employee_id and employee.archived_at is null) then
    raise invalid_parameter_value using message = 'Select an active employee.';
  end if;
  if not exists(select 1 from public.leave_types type_row where type_row.id = p_leave_type_id and type_row.archived_at is null) then
    raise invalid_parameter_value using message = 'Select an active leave type.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise invalid_parameter_value using message = 'A leave reason of at least 3 characters is required.'; end if;
  day_count := public.rpc_calculate_leave_working_days(p_start_date, p_end_date);
  if day_count < 1 then raise invalid_parameter_value using message = 'The selected dates contain no working days.'; end if;
  if exists(select 1 from public.leave_requests request_row where request_row.employee_id = p_employee_id
    and request_row.status in ('pending', 'approved')
    and daterange(request_row.start_date, request_row.end_date, '[]') && daterange(p_start_date, p_end_date, '[]')) then
    raise unique_violation using message = 'This leave overlaps an existing pending or approved request.';
  end if;
  insert into public.leave_requests
    (employee_id, leave_type_id, start_date, end_date, working_days, reason, status, source, submitted_by)
  values (p_employee_id, p_leave_type_id, p_start_date, p_end_date, day_count, btrim(p_reason), 'pending',
    'hr_on_behalf', actor)
  returning id into request_id;
  insert into public.leave_request_events
    (leave_request_id, event_type, from_status, to_status, actor_profile_id, reason)
  values (request_id, 'logged_on_behalf', null, 'pending', actor, btrim(p_reason));
  select employee.profile_id into employee_profile
  from public.employees employee where employee.id = p_employee_id;
  if employee_profile is not null then
    insert into public.notifications (recipient_profile_id, title, message, category, event_key, action_path)
    values (employee_profile, 'Leave Logged by HR', 'HR has started a leave record on your behalf.', 'hr',
      'leave_on_behalf_' || request_id, '/my/leave?request=' || request_id) on conflict (event_key) do nothing;
  end if;
  return request_id;
end
$$;
revoke all on function public.rpc_log_leave_for_employee(uuid, uuid, date, date, text) from public, anon;
grant execute on function public.rpc_log_leave_for_employee(uuid, uuid, date, date, text) to authenticated;

create or replace function public.rpc_decide_leave_request(p_request_id uuid, p_decision text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.leave_assert_hr(); request_row public.leave_requests%rowtype; employee_profile uuid;
begin
  if p_decision not in ('approved', 'rejected') then raise invalid_parameter_value using message = 'Decision must be approved or rejected.'; end if;
  if p_decision = 'rejected' and length(btrim(coalesce(p_reason, ''))) < 3 then
    raise invalid_parameter_value using message = 'A rejection reason of at least 3 characters is required.';
  end if;
  select * into request_row from public.leave_requests where id = p_request_id for update;
  if request_row.id is null then raise no_data_found using message = 'Leave request not found.'; end if;
  if request_row.status = p_decision then return; end if;
  if request_row.status <> 'pending' then raise invalid_parameter_value using message = 'Only pending leave can be decided.'; end if;
  update public.leave_requests set status = p_decision, decided_by = actor, decided_at = now(),
    decision_reason = nullif(btrim(coalesce(p_reason, '')), ''), updated_at = now() where id = p_request_id;
  insert into public.leave_request_events
    (leave_request_id, event_type, from_status, to_status, actor_profile_id, reason)
  values (p_request_id, p_decision, 'pending', p_decision, actor, nullif(btrim(coalesce(p_reason, '')), ''));
  select employee.profile_id into employee_profile from public.employees employee where employee.id = request_row.employee_id;
  if employee_profile is not null then
    insert into public.notifications (recipient_profile_id, title, message, category, event_key, action_path)
    values (employee_profile, 'Leave Request ' || initcap(p_decision), 'HR has ' || p_decision || ' your leave request.', 'hr',
      'leave_decision_' || p_request_id || '_' || p_decision, '/my/leave?request=' || p_request_id) on conflict (event_key) do nothing;
  end if;
end
$$;
revoke all on function public.rpc_decide_leave_request(uuid, text, text) from public, anon;
grant execute on function public.rpc_decide_leave_request(uuid, text, text) to authenticated;

create or replace function public.rpc_withdraw_leave_request(p_request_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.current_profile_id(); request_row public.leave_requests%rowtype;
begin
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise invalid_parameter_value using message = 'A withdrawal reason of at least 3 characters is required.'; end if;
  select request_value.* into request_row from public.leave_requests request_value
  join public.employees employee on employee.id = request_value.employee_id and employee.profile_id = actor
  where request_value.id = p_request_id for update of request_value;
  if request_row.id is null then raise insufficient_privilege using message = 'You may only withdraw your own leave request.'; end if;
  if request_row.status = 'withdrawn' then return; end if;
  if request_row.status <> 'pending' then raise invalid_parameter_value using message = 'Only pending leave can be withdrawn.'; end if;
  update public.leave_requests set status = 'withdrawn', withdrawn_by = actor, withdrawn_at = now(),
    withdrawal_reason = btrim(p_reason), updated_at = now() where id = p_request_id;
  insert into public.leave_request_events
    (leave_request_id, event_type, from_status, to_status, actor_profile_id, reason)
  values (p_request_id, 'withdrawn', 'pending', 'withdrawn', actor, btrim(p_reason));
end
$$;
revoke all on function public.rpc_withdraw_leave_request(uuid, text) from public, anon;
grant execute on function public.rpc_withdraw_leave_request(uuid, text) to authenticated;

create or replace function public.rpc_cancel_leave_request(p_request_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.leave_assert_hr(); request_row public.leave_requests%rowtype;
begin
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise invalid_parameter_value using message = 'A cancellation reason of at least 3 characters is required.'; end if;
  select * into request_row from public.leave_requests where id = p_request_id for update;
  if request_row.id is null then raise no_data_found using message = 'Leave request not found.'; end if;
  if request_row.status = 'cancelled' then return; end if;
  if request_row.status <> 'approved' then raise invalid_parameter_value using message = 'Only approved leave can be cancelled.'; end if;
  update public.leave_requests set status = 'cancelled', cancelled_by = actor, cancelled_at = now(),
    cancellation_reason = btrim(p_reason), updated_at = now() where id = p_request_id;
  insert into public.leave_request_events
    (leave_request_id, event_type, from_status, to_status, actor_profile_id, reason)
  values (p_request_id, 'cancelled', 'approved', 'cancelled', actor, btrim(p_reason));
end
$$;
revoke all on function public.rpc_cancel_leave_request(uuid, text) from public, anon;
grant execute on function public.rpc_cancel_leave_request(uuid, text) to authenticated;

create or replace function public.rpc_adjust_leave_balance(
  p_employee_id uuid, p_leave_type_id uuid, p_leave_year integer, p_adjustment_days numeric, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.leave_assert_hr(); adjustment_id uuid;
begin
  if p_adjustment_days is null or p_adjustment_days = 0 then raise invalid_parameter_value using message = 'Adjustment days cannot be zero.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise invalid_parameter_value using message = 'An adjustment reason of at least 3 characters is required.'; end if;
  insert into public.leave_balance_adjustments
    (employee_id, leave_type_id, leave_year, adjustment_days, reason, created_by)
  values (p_employee_id, p_leave_type_id, p_leave_year, p_adjustment_days, btrim(p_reason), actor)
  returning id into adjustment_id;
  return adjustment_id;
end
$$;
revoke all on function public.rpc_adjust_leave_balance(uuid, uuid, integer, numeric, text) from public, anon;
grant execute on function public.rpc_adjust_leave_balance(uuid, uuid, integer, numeric, text) to authenticated;

create or replace function public.rpc_list_public_holidays()
returns table (id uuid, holiday_date date, name text, is_active boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.leave_assert_hr();
  return query select holiday.id, holiday.holiday_date, holiday.name, holiday.is_active
  from public.public_holidays holiday order by holiday.holiday_date desc;
end
$$;
revoke all on function public.rpc_list_public_holidays() from public, anon;
grant execute on function public.rpc_list_public_holidays() to authenticated;

create or replace function public.rpc_save_leave_type(
  p_code text, p_name text, p_is_paid boolean, p_default_entitlement_days numeric, p_requires_evidence boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.leave_assert_hr(); result_id uuid;
begin
  if coalesce(p_code, '') !~ '^[a-z][a-z0-9_]{1,39}$' then raise invalid_parameter_value using message = 'Use a valid leave type code.'; end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then raise invalid_parameter_value using message = 'Leave type name is required.'; end if;
  insert into public.leave_types (code, name, is_paid, default_entitlement_days, requires_evidence, display_order, created_by, updated_by)
  values (p_code, btrim(p_name), p_is_paid, p_default_entitlement_days, p_requires_evidence,
    coalesce((select max(display_order) + 1 from public.leave_types), 1), actor, actor)
  on conflict ((lower(code))) do update set name = excluded.name, is_paid = excluded.is_paid,
    default_entitlement_days = excluded.default_entitlement_days, requires_evidence = excluded.requires_evidence,
    archived_at = null, archived_by = null, archive_reason = null, updated_by = actor, updated_at = now()
  returning id into result_id;
  return result_id;
end
$$;
revoke all on function public.rpc_save_leave_type(text, text, boolean, numeric, boolean) from public, anon;
grant execute on function public.rpc_save_leave_type(text, text, boolean, numeric, boolean) to authenticated;

create or replace function public.rpc_save_public_holiday(p_holiday_date date, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.leave_assert_hr(); result_id uuid;
begin
  if p_holiday_date is null or length(btrim(coalesce(p_name, ''))) < 2 then raise invalid_parameter_value using message = 'Holiday date and name are required.'; end if;
  insert into public.public_holidays (holiday_date, name, is_active, created_by, updated_by)
  values (p_holiday_date, btrim(p_name), true, actor, actor)
  on conflict (holiday_date) do update set name = excluded.name, is_active = true, updated_by = actor, updated_at = now()
  returning id into result_id;
  return result_id;
end
$$;
revoke all on function public.rpc_save_public_holiday(date, text) from public, anon;
grant execute on function public.rpc_save_public_holiday(date, text) to authenticated;

create or replace function public.rpc_set_leave_entitlement(p_employee_id uuid, p_leave_type_id uuid, p_leave_year integer, p_entitled_days numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.leave_assert_hr(); result_id uuid;
begin
  if p_leave_year not between 2000 and 2200 or p_entitled_days < 0 then raise invalid_parameter_value using message = 'Use a valid leave year and entitlement.'; end if;
  insert into public.leave_entitlements (employee_id, leave_type_id, leave_year, entitled_days, created_by, updated_by)
  values (p_employee_id, p_leave_type_id, p_leave_year, p_entitled_days, actor, actor)
  on conflict (employee_id, leave_type_id, leave_year) do update set entitled_days = excluded.entitled_days, updated_by = actor, updated_at = now()
  returning id into result_id;
  return result_id;
end
$$;
revoke all on function public.rpc_set_leave_entitlement(uuid, uuid, integer, numeric) from public, anon;
grant execute on function public.rpc_set_leave_entitlement(uuid, uuid, integer, numeric) to authenticated;

create or replace function public.rpc_list_leave_request_events(p_leave_request_id uuid)
returns table (id uuid, event_type text, from_status text, to_status text, actor_name text, reason text, occurred_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.leave_assert_hr();
  return query select event.id, event.event_type, event.from_status, event.to_status,
    coalesce(profile.display_name, 'System user'), event.reason, event.occurred_at
  from public.leave_request_events event join public.profiles profile on profile.id = event.actor_profile_id
  where event.leave_request_id = p_leave_request_id order by event.occurred_at desc;
end
$$;
revoke all on function public.rpc_list_leave_request_events(uuid) from public, anon;
grant execute on function public.rpc_list_leave_request_events(uuid) to authenticated;
