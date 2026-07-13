delete from public.feature_settings
where key in ('notifications.webhook_url', 'notifications.webhook_secret');

insert into public.feature_settings(key, value, description)
values (
  'notifications.channels',
  '{"in_app":true,"email":false}'::jsonb,
  'Deployment notification channels. Email remains disabled until webhook and provider secrets are configured.'
)
on conflict (key) do update
set value = excluded.value,
  description = excluded.description,
  updated_at = now();

create table public.notification_preferences (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('general', 'hr', 'payroll', 'warehouse', 'project', 'cash')),
  email_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, category)
);

alter table public.notification_preferences enable row level security;

create policy notification_preferences_read_own
on public.notification_preferences for select to authenticated
using (profile_id = public.current_profile_id());

create policy notification_preferences_insert_own
on public.notification_preferences for insert to authenticated
with check (profile_id = public.current_profile_id());

create policy notification_preferences_update_own
on public.notification_preferences for update to authenticated
using (profile_id = public.current_profile_id())
with check (profile_id = public.current_profile_id());

revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;

create or replace function public.set_notification_email_preference(
  preference_category text,
  preference_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
begin
  if actor is null then
    raise insufficient_privilege using message = 'authentication is required';
  end if;
  if preference_category not in ('general', 'hr', 'payroll', 'warehouse', 'project', 'cash') then
    raise check_violation using message = 'invalid notification category';
  end if;

  insert into public.notification_preferences(profile_id, category, email_enabled)
  values (actor, preference_category, preference_enabled)
  on conflict (profile_id, category) do update
  set email_enabled = excluded.email_enabled,
    updated_at = now();
end
$$;

revoke all on function public.set_notification_email_preference(text, boolean)
from public, anon;
grant execute on function public.set_notification_email_preference(text, boolean)
to authenticated;

alter table public.notification_deliveries
  drop constraint notification_deliveries_status_check;

alter table public.notification_deliveries
  add column provider_idempotency_key text,
  add column claim_token uuid,
  add column processing_started_at timestamptz,
  add column next_attempt_at timestamptz not null default now(),
  add column provider_message_id text,
  add constraint notification_deliveries_status_check
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  add constraint notification_deliveries_attempt_count_check
    check (attempt_count between 0 and 5);

update public.notification_deliveries
set provider_idempotency_key = 'notification:' || notification_id || ':' || channel;

alter table public.notification_deliveries
  alter column provider_idempotency_key set not null,
  add constraint notification_deliveries_provider_idempotency_unique
    unique (provider_idempotency_key);

create or replace function public.claim_notification_delivery(
  target_notification_id uuid,
  target_channel text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.notification_deliveries%rowtype;
begin
  if target_channel not in ('email', 'sms', 'push') then
    raise check_violation using message = 'invalid notification channel';
  end if;

  update public.notification_deliveries delivery
  set status = 'processing',
    claim_token = extensions.gen_random_uuid(),
    processing_started_at = now(),
    attempt_count = delivery.attempt_count + 1,
    updated_at = now()
  where delivery.id = (
    select candidate.id
    from public.notification_deliveries candidate
    where candidate.notification_id = target_notification_id
      and candidate.channel = target_channel
      and (
        candidate.status in ('pending', 'failed')
        or (
          candidate.status = 'processing'
          and candidate.processing_started_at < now() - interval '15 minutes'
        )
      )
      and candidate.attempt_count < 5
      and candidate.next_attempt_at <= now()
    for update skip locked
    limit 1
  )
  returning delivery.* into claimed;

  if claimed.id is null then return null; end if;
  return jsonb_build_object(
    'id', claimed.id,
    'notification_id', claimed.notification_id,
    'channel', claimed.channel,
    'claim_token', claimed.claim_token,
    'attempt_count', claimed.attempt_count,
    'provider_idempotency_key', claimed.provider_idempotency_key
  );
end
$$;

create or replace function public.complete_notification_delivery(
  target_delivery_id uuid,
  target_claim_token uuid,
  completion_status text,
  completion_error_code text default null,
  completion_provider_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if completion_status not in ('sent', 'failed', 'skipped') then
    raise check_violation using message = 'invalid notification delivery completion status';
  end if;

  update public.notification_deliveries delivery
  set status = completion_status,
    last_error_code = nullif(btrim(completion_error_code), ''),
    provider_message_id = nullif(btrim(completion_provider_message_id), ''),
    next_attempt_at = case
      when completion_status = 'failed'
        then now() + make_interval(secs => least(3600, (power(2, delivery.attempt_count) * 60)::integer))
      else delivery.next_attempt_at
    end,
    claim_token = null,
    processing_started_at = null,
    updated_at = now()
  where delivery.id = target_delivery_id
    and delivery.status = 'processing'
    and delivery.claim_token = target_claim_token;

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end
$$;

revoke all on function public.claim_notification_delivery(uuid, text)
from public, anon, authenticated;
revoke all on function public.complete_notification_delivery(uuid, uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.claim_notification_delivery(uuid, text) to service_role;
grant execute on function public.complete_notification_delivery(uuid, uuid, text, text, text) to service_role;

create or replace function public.trigger_send_notification_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  deployment_email_enabled boolean := false;
  recipient_email_enabled boolean := true;
  webhook_url text;
  webhook_secret text;
  delivery_id uuid;
begin
  select coalesce((setting.value ->> 'email')::boolean, false)
  into deployment_email_enabled
  from public.feature_settings setting
  where setting.key = 'notifications.channels';

  if not coalesce(deployment_email_enabled, false) then return new; end if;

  select coalesce(preference.email_enabled, true)
  into recipient_email_enabled
  from public.notification_preferences preference
  where preference.profile_id = new.recipient_profile_id
    and preference.category = new.category;

  if not coalesce(recipient_email_enabled, true) then return new; end if;

  insert into public.notification_deliveries(
    notification_id, channel, status, provider_idempotency_key
  )
  values (
    new.id, 'email', 'pending', 'notification:' || new.id || ':email'
  )
  on conflict (notification_id, channel) do nothing
  returning id into delivery_id;

  if delivery_id is null then return new; end if;

  select nullif(btrim(setting.value ->> 'url'), '')
  into webhook_url
  from public.feature_settings setting
  where setting.key = 'notifications.webhook_url';

  begin
    if to_regclass('vault.decrypted_secrets') is not null then
      execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 order by created_at desc limit 1'
      into webhook_secret
      using 'notifications_webhook_secret';
    end if;
  exception when others then
    webhook_secret := null;
  end;

  if webhook_url is null or nullif(btrim(webhook_secret), '') is null then
    update public.notification_deliveries
    set status = 'failed',
      last_error_code = 'DELIVERY_CONFIGURATION_MISSING',
      next_attempt_at = now() + interval '1 hour',
      updated_at = now()
    where id = delivery_id;
    return new;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'net' and procedure.proname = 'http_post'
  ) then
    update public.notification_deliveries
    set status = 'failed',
      last_error_code = 'WEBHOOK_TRANSPORT_UNAVAILABLE',
      next_attempt_at = now() + interval '1 hour',
      updated_at = now()
    where id = delivery_id;
    return new;
  end if;

  begin
    execute 'select net.http_post(url := $1, headers := $2, body := $3)'
    using webhook_url,
      jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Webhook-Secret', webhook_secret
      ),
      jsonb_build_object('notification_id', new.id);
  exception when others then
    update public.notification_deliveries
    set status = 'failed',
      last_error_code = 'WEBHOOK_DISPATCH_FAILED',
      next_attempt_at = now() + interval '5 minutes',
      updated_at = now()
    where id = delivery_id;
  end;

  return new;
end
$$;

comment on table public.notification_preferences is
  'Per-user email preferences by notification category. In-app notifications remain enabled for operational reliability.';
comment on function public.claim_notification_delivery(uuid, text) is
  'Atomically moves one retry-eligible delivery to processing and returns its private claim token.';
