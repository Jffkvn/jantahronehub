-- Follow-up hardening discovered after 0060 was applied to the hosted project.
-- Fresh databases already receive this behavior from 0060; this migration
-- brings the hosted database to the same reviewed state.

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

revoke all on function public.claim_notification_delivery(uuid, text)
from public, anon, authenticated;
grant execute on function public.claim_notification_delivery(uuid, text) to service_role;

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
