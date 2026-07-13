-- 1. Create notifications table
create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  recipient_profile_id uuid references public.profiles(id) on delete cascade not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  message text not null check (length(btrim(message)) >= 1),
  is_read boolean not null default false,
  category text not null check (category in ('general', 'hr', 'payroll', 'warehouse', 'project', 'cash')) default 'general',
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.notifications enable row level security;

-- Setup RLS Policies
create policy "Users can view their own notifications"
  on public.notifications for select
  using (recipient_profile_id = public.current_profile_id());

create policy "Users can update their own notifications"
  on public.notifications for update
  using (recipient_profile_id = public.current_profile_id())
  with check (recipient_profile_id = public.current_profile_id());

-- Grant access
grant select, update on public.notifications to authenticated;

-- 2. Define create_notification helper function (security definer)
create or replace function public.create_notification(
  p_recipient_id uuid,
  p_title text,
  p_message text,
  p_category text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_notification_id uuid;
begin
  insert into public.notifications (recipient_profile_id, title, message, category)
  values (p_recipient_id, p_title, p_message, p_category)
  returning id into v_notification_id;
  return v_notification_id;
end;
$$;

-- 3. Define mark_notification_as_read helper function (security definer)
create or replace function public.mark_notification_as_read(p_notification_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications
  set is_read = true
  where id = p_notification_id
    and recipient_profile_id = public.current_profile_id();
end;
$$;

-- 4. Define mark_all_notifications_as_read helper function (security definer)
create or replace function public.mark_all_notifications_as_read()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications
  set is_read = true
  where recipient_profile_id = public.current_profile_id()
    and is_read = false;
end;
$$;

grant execute on function public.create_notification to authenticated, service_role;
grant execute on function public.mark_notification_as_read to authenticated;
grant execute on function public.mark_all_notifications_as_read to authenticated;

-- 5. Create trigger notifications function for Cash Advances
create or replace function public.trigger_cash_advance_request_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_project_name text;
  r record;
begin
  -- Get project name
  select name into v_project_name from public.projects where id = new.project_id;
  if v_project_name is null then
    v_project_name := 'Unknown Project';
  end if;

  if (tg_op = 'INSERT' and new.status = 'pending_approval') or (tg_op = 'UPDATE' and new.status = 'pending_approval' and old.status <> 'pending_approval') then
    -- Notify all CFOs and Super Admins
    for r in (
      select p.id
      from public.profiles p
      join public.user_roles ur on ur.profile_id = p.id
      join public.roles ro on ur.role_id = ro.id
      where ro.name in ('cfo', 'super_admin')
    ) loop
      perform public.create_notification(
        r.id,
        'New Cash Advance Request',
        'A new cash advance has been requested for project ' || v_project_name || '.',
        'cash'
      );
    end loop;
  elsif tg_op = 'UPDATE' and new.status <> old.status then
    if new.status = 'approved' then
      perform public.create_notification(
        new.user_id,
        'Cash Advance Approved',
        'Your cash advance request for project ' || v_project_name || ' has been approved.',
        'cash'
      );
    elsif new.status = 'disbursed' then
      perform public.create_notification(
        new.user_id,
        'Cash Advance Disbursed',
        'Your cash advance request for project ' || v_project_name || ' has been disbursed.',
        'cash'
      );
    elsif new.status = 'rejected' then
      perform public.create_notification(
        new.user_id,
        'Cash Advance Rejected',
        'Your cash advance request for project ' || v_project_name || ' has been rejected.',
        'cash'
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger tr_cash_advance_request_notification
  after insert or update of status on public.cash_advance_requests
  for each row execute function public.trigger_cash_advance_request_notification();

-- 6. Create trigger notifications function for Cash Expenses
create or replace function public.trigger_cash_advance_expense_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_requester_id uuid;
  v_project_name text;
  r record;
begin
  -- Get requester and project name
  select car.user_id, p.name into v_requester_id, v_project_name
  from public.cash_advance_requests car
  join public.projects p on car.project_id = p.id
  where car.id = new.cash_advance_id;

  if tg_op = 'INSERT' then
    -- Notify all CFOs and Super Admins
    for r in (
      select p.id
      from public.profiles p
      join public.user_roles ur on ur.profile_id = p.id
      join public.roles ro on ur.role_id = ro.id
      where ro.name in ('cfo', 'super_admin')
    ) loop
      perform public.create_notification(
        r.id,
        'New Cash Expense Submitted',
        'A cash advance expense of ' || new.amount || ' UGX has been submitted for review.',
        'cash'
      );
    end loop;
  elsif tg_op = 'UPDATE' and new.status <> old.status then
    perform public.create_notification(
      v_requester_id,
      'Cash Expense Reviewed',
      'Your cash advance expense for project ' || coalesce(v_project_name, 'Unknown') || ' has been ' || new.status || '.',
      'cash'
    );
  end if;
  return new;
end;
$$;

create trigger tr_cash_advance_expense_notification
  after insert or update of status on public.cash_advance_expenses
  for each row execute function public.trigger_cash_advance_expense_notification();

-- 7. Create trigger notifications function for Stock Requests
create or replace function public.trigger_stock_request_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if (tg_op = 'INSERT' and new.status = 'pending_approval') or (tg_op = 'UPDATE' and new.status = 'pending_approval' and old.status <> 'pending_approval') then
    -- Notify warehouse managers and CFOs/Super Admins
    for r in (
      select p.id
      from public.profiles p
      join public.user_roles ur on ur.profile_id = p.id
      join public.roles ro on ur.role_id = ro.id
      where ro.name in ('warehouse_manager', 'cfo', 'super_admin')
    ) loop
      perform public.create_notification(
        r.id,
        'New Stock Request',
        'A new stock request has been submitted for project ' || new.project_name || '.',
        'warehouse'
      );
    end loop;
  elsif tg_op = 'UPDATE' and new.status <> old.status then
    if new.status = 'approved' then
      perform public.create_notification(
        new.requested_by,
        'Stock Request Approved',
        'Your stock request for project ' || new.project_name || ' has been approved.',
        'warehouse'
      );
    elsif new.status = 'fulfilled' then
      perform public.create_notification(
        new.requested_by,
        'Stock Request Fulfilled',
        'Your stock request for project ' || new.project_name || ' has been fulfilled.',
        'warehouse'
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger tr_stock_request_notification
  after insert or update of status on public.stock_requests
  for each row execute function public.trigger_stock_request_notification();

-- 8. Create trigger notifications function for Daily Updates
create or replace function public.trigger_daily_update_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_project_name text;
  v_pm_profile_id uuid;
begin
  -- Get project name
  select name into v_project_name from public.projects where id = new.project_id;
  if v_project_name is null then
    v_project_name := 'Unknown Project';
  end if;

  if (tg_op = 'INSERT' and new.status = 'submitted') or (tg_op = 'UPDATE' and new.status = 'submitted' and old.status <> 'submitted') then
    -- Find assigned Project Manager
    select user_id into v_pm_profile_id
    from public.project_assignments
    where project_id = new.project_id and role_on_project = 'pm'
    limit 1;

    if v_pm_profile_id is not null then
      perform public.create_notification(
        v_pm_profile_id,
        'New Daily Update Submitted',
        'A new daily update has been submitted for project ' || v_project_name || '.',
        'project'
      );
    end if;
  elsif tg_op = 'UPDATE' and new.status <> old.status then
    if new.status = 'endorsed' then
      perform public.create_notification(
        new.submitted_by,
        'Daily Update Endorsed',
        'Your daily update for project ' || v_project_name || ' has been endorsed.',
        'project'
      );
    elsif new.status = 'revision_requested' then
      perform public.create_notification(
        new.submitted_by,
        'Revision Requested on Daily Update',
        'Your daily update for project ' || v_project_name || ' requires revisions: ' || coalesce(new.pm_feedback, ''),
        'project'
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger tr_daily_update_notification
  after insert or update of status on public.daily_updates
  for each row execute function public.trigger_daily_update_notification();

-- 9. Create trigger notifications function for Payroll Publication
create or replace function public.trigger_payroll_run_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_period_label text;
  r record;
begin
  select label into v_period_label from public.payroll_periods where id = new.period_id;
  if v_period_label is null then
    v_period_label := 'Unknown Period';
  end if;

  if tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved' then
    -- Notify all active employees
    for r in (
      select profile_id
      from public.employees
      where profile_id is not null and archived_at is null
    ) loop
      perform public.create_notification(
        r.profile_id,
        'Payslip Published',
        'Your payslip for the period ' || v_period_label || ' is now available in the portal.',
        'payroll'
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger tr_payroll_run_notification
  after update of status on public.payroll_runs
  for each row execute function public.trigger_payroll_run_notification();

-- 10. Create webhook for notification insertion
create or replace function public.trigger_send_notification_webhook()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- In-app delivery is the safe baseline. A later migration installs the
  -- configurable outbox webhook after deployment settings are available.
  return new;
end;
$$;

create trigger tr_notifications_send_webhook
  after insert on public.notifications
  for each row execute function public.trigger_send_notification_webhook();
