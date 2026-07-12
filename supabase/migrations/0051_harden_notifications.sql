-- 1. Truncate table to clean any un-keyed entries and add constraints
truncate table public.notifications cascade;

-- Alter table to add event_key and check constraints
alter table public.notifications add column event_key text unique;
alter table public.notifications add constraint notifications_message_length_check check (length(btrim(message)) <= 1000);

-- Revoke general table update access
revoke update on table public.notifications from authenticated;
drop policy if exists "Users can update their own notifications" on public.notifications;

-- 2. Revoke execute privileges from PUBLIC, anon, and authenticated
revoke execute on function public.create_notification(uuid, text, text, text) from public, anon, authenticated;
drop function if exists public.create_notification(uuid, text, text, text);
revoke execute on function public.create_notification(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.mark_notification_as_read(uuid) from public, anon, authenticated;
revoke execute on function public.mark_all_notifications_as_read() from public, anon, authenticated;

-- 3. Create or replace secure notification functions
create or replace function public.create_notification(
  p_recipient_id uuid,
  p_title text,
  p_message text,
  p_category text,
  p_event_key text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_notification_id uuid;
begin
  insert into public.notifications (recipient_profile_id, title, message, category, event_key)
  values (p_recipient_id, p_title, p_message, p_category, p_event_key)
  on conflict (event_key) do nothing
  returning id into v_notification_id;
  return v_notification_id;
end;
$$;

create or replace function public.mark_notification_as_read(p_notification_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications
  set is_read = true
  where id = p_notification_id
    and recipient_profile_id = public.current_profile_id();
end;
$$;

create or replace function public.mark_all_notifications_as_read()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications
  set is_read = true
  where recipient_profile_id = public.current_profile_id()
    and is_read = false;
end;
$$;

-- Grant execution privileges to correct roles
grant execute on function public.create_notification(uuid, text, text, text, text) to service_role;
grant execute on function public.mark_notification_as_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_as_read() to authenticated;

-- 4. Correct triggers to use roles.key and non-sensitive notifications text
create or replace function public.trigger_cash_advance_request_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_project_name text;
  v_event_key text;
  r record;
begin
  select name into v_project_name from public.projects where id = new.project_id;
  if v_project_name is null then
    v_project_name := 'Unknown Project';
  end if;

  v_event_key := 'cash_advance_request_' || new.id || '_' || new.status;

  if (tg_op = 'INSERT' and new.status = 'pending_approval') or (tg_op = 'UPDATE' and new.status = 'pending_approval' and old.status <> 'pending_approval') then
    for r in (
      select p.id
      from public.profiles p
      join public.user_roles ur on ur.profile_id = p.id
      join public.roles ro on ur.role_id = ro.id
      where ro.key in ('cfo', 'super_admin')
    ) loop
      perform public.create_notification(
        r.id,
        'New Cash Advance Request',
        'A new cash advance has been requested for project ' || v_project_name || '.',
        'cash',
        v_event_key || '_' || r.id
      );
    end loop;
  elsif tg_op = 'UPDATE' and new.status <> old.status then
    if new.status = 'approved' then
      perform public.create_notification(
        new.user_id,
        'Cash Advance Approved',
        'Your cash advance request for project ' || v_project_name || ' has been approved.',
        'cash',
        v_event_key
      );
    elsif new.status = 'disbursed' then
      perform public.create_notification(
        new.user_id,
        'Cash Advance Disbursed',
        'Your cash advance request for project ' || v_project_name || ' has been disbursed.',
        'cash',
        v_event_key
      );
    elsif new.status = 'rejected' then
      perform public.create_notification(
        new.user_id,
        'Cash Advance Rejected',
        'Your cash advance request for project ' || v_project_name || ' has been rejected.',
        'cash',
        v_event_key
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.trigger_cash_advance_expense_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_requester_id uuid;
  v_project_name text;
  v_event_key text;
  r record;
begin
  select car.user_id, p.name into v_requester_id, v_project_name
  from public.cash_advance_requests car
  join public.projects p on car.project_id = p.id
  where car.id = new.cash_advance_id;

  v_event_key := 'cash_advance_expense_' || new.id || '_' || new.status;

  if tg_op = 'INSERT' then
    for r in (
      select p.id
      from public.profiles p
      join public.user_roles ur on ur.profile_id = p.id
      join public.roles ro on ur.role_id = ro.id
      where ro.key in ('cfo', 'super_admin')
    ) loop
      perform public.create_notification(
        r.id,
        'New Cash Expense Submitted',
        'A cash advance expense was submitted for review.',
        'cash',
        v_event_key || '_' || r.id
      );
    end loop;
  elsif tg_op = 'UPDATE' and new.status <> old.status then
    perform public.create_notification(
      v_requester_id,
      'Cash Expense Reviewed',
      'Your cash advance expense for project ' || coalesce(v_project_name, 'Unknown') || ' has been ' || new.status || '.',
      'cash',
      v_event_key
    );
  end if;
  return new;
end;
$$;

create or replace function public.trigger_stock_request_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_event_key text;
  r record;
begin
  v_event_key := 'stock_request_' || new.id || '_' || new.status;

  if (tg_op = 'INSERT' and new.status = 'pending_approval') or (tg_op = 'UPDATE' and new.status = 'pending_approval' and old.status <> 'pending_approval') then
    for r in (
      select p.id
      from public.profiles p
      join public.user_roles ur on ur.profile_id = p.id
      join public.roles ro on ur.role_id = ro.id
      where ro.key in ('warehouse_manager', 'cfo', 'super_admin')
    ) loop
      perform public.create_notification(
        r.id,
        'New Stock Request',
        'A new stock request has been submitted for project ' || new.project_name || '.',
        'warehouse',
        v_event_key || '_' || r.id
      );
    end loop;
  elsif tg_op = 'UPDATE' and new.status <> old.status then
    if new.status = 'approved' then
      perform public.create_notification(
        new.requested_by,
        'Stock Request Approved',
        'Your stock request for project ' || new.project_name || ' has been approved.',
        'warehouse',
        v_event_key
      );
    elsif new.status = 'fulfilled' then
      perform public.create_notification(
        new.requested_by,
        'Stock Request Fulfilled',
        'Your stock request for project ' || new.project_name || ' has been fulfilled.',
        'warehouse',
        v_event_key
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.trigger_daily_update_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_project_name text;
  v_pm_profile_id uuid;
  v_event_key text;
begin
  select name into v_project_name from public.projects where id = new.project_id;
  if v_project_name is null then
    v_project_name := 'Unknown Project';
  end if;

  v_event_key := 'daily_update_' || new.id || '_' || new.status;

  if (tg_op = 'INSERT' and new.status = 'submitted') or (tg_op = 'UPDATE' and new.status = 'submitted' and old.status <> 'submitted') then
    select user_id into v_pm_profile_id
    from public.project_assignments
    where project_id = new.project_id and role_on_project = 'pm'
    limit 1;

    if v_pm_profile_id is not null then
      perform public.create_notification(
        v_pm_profile_id,
        'New Daily Update Submitted',
        'A new daily update has been submitted for project ' || v_project_name || '.',
        'project',
        v_event_key
      );
    end if;
  elsif tg_op = 'UPDATE' and new.status <> old.status then
    if new.status = 'endorsed' then
      perform public.create_notification(
        new.submitted_by,
        'Daily Update Endorsed',
        'Your daily update for project ' || v_project_name || ' has been endorsed.',
        'project',
        v_event_key
      );
    elsif new.status = 'revision_requested' then
      perform public.create_notification(
        new.submitted_by,
        'Revision Requested on Daily Update',
        'Your daily update for project ' || v_project_name || ' requires revisions: ' || coalesce(new.pm_feedback, ''),
        'project',
        v_event_key
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.trigger_payroll_run_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_period_label text;
  v_event_key text;
  r record;
begin
  select label into v_period_label from public.payroll_periods where id = new.period_id;
  if v_period_label is null then
    v_period_label := 'Unknown Period';
  end if;

  v_event_key := 'payroll_run_approved_' || new.id;

  if tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved' then
    for r in (
      select profile_id
      from public.employees
      where profile_id is not null and archived_at is null
    ) loop
      perform public.create_notification(
        r.profile_id,
        'Payslip Published',
        'Your payslip for the period ' || v_period_label || ' is now available in the portal.',
        'payroll',
        v_event_key || '_' || r.profile_id
      );
    end loop;
  end if;
  return new;
end;
$$;

-- 5. Create outbox delivery status table
create table public.notification_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  notification_id uuid references public.notifications(id) on delete cascade not null,
  channel text check (channel in ('email', 'sms', 'push')) not null,
  status text check (status in ('pending', 'sent', 'failed', 'skipped')) not null default 'pending',
  attempt_count integer not null default 0,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_notification_channel unique (notification_id, channel)
);

alter table public.notification_deliveries enable row level security;
revoke all on table public.notification_deliveries from anon, authenticated;
grant select, insert, update on table public.notification_deliveries to service_role;

-- 6. Add dynamic edge function webhook settings
insert into public.feature_settings (key, value, description)
values
  (
    'notifications.webhook_url',
    '{"url": "http://localhost:54321/functions/v1/send-notification"}'::jsonb,
    'Webhook URL for notification email delivery dispatch.'
  ),
  (
    'notifications.webhook_secret',
    '{"secret": "secret_notifications_webhook_2026"}'::jsonb,
    'Security verification secret header for notifying edge functions.'
  )
on conflict (key) do nothing;

-- 7. Update send-notification webhook trigger
create or replace function public.trigger_send_notification_webhook()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_url_json jsonb;
  v_secret_json jsonb;
  v_webhook_url text;
  v_webhook_secret text;
begin
  select value into v_url_json from public.feature_settings where key = 'notifications.webhook_url';
  select value into v_secret_json from public.feature_settings where key = 'notifications.webhook_secret';
  v_webhook_url := v_url_json->>'url';
  v_webhook_secret := v_secret_json->>'secret';

  if v_webhook_url is not null then
    -- Automatically record a pending email delivery outbox line for this notification
    insert into public.notification_deliveries (notification_id, channel, status)
    values (new.id, 'email', 'pending')
    on conflict (notification_id, channel) do nothing;

    begin
      if exists (
        select 1 from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on p.pronamespace = n.oid
        where n.nspname = 'net' and p.proname = 'http_post'
      ) then
        execute 'select net.http_post(
          url := $1,
          headers := $2,
          body := $3
        )' using
          v_webhook_url,
          jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Webhook-Secret', v_webhook_secret
          ),
          jsonb_build_object(
            'notification_id', new.id
          )::text;
      end if;
    exception when others then
      -- Suppress webhook error so user transaction doesn't fail
      null;
    end;
  end if;
  return new;
end;
$$;
