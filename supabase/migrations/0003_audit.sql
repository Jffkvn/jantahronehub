create table public.audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_.-]*$'),
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_]*$'),
  entity_id text,
  previous_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  reason text,
  request_id uuid,
  check (jsonb_typeof(metadata) = 'object')
);

create index audit_events_occurred_at_idx on public.audit_events(occurred_at desc);
create index audit_events_entity_idx on public.audit_events(entity_type, entity_id);
create index audit_events_actor_idx on public.audit_events(actor_profile_id, occurred_at desc);

comment on table public.audit_events is
  'Append-only business audit ledger. Updates and deletes are rejected for every database role.';

create or replace function public.prevent_audit_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'audit events are append-only';
end;
$$;

create trigger audit_events_are_append_only
before update or delete on public.audit_events
for each row execute function public.prevent_audit_event_mutation();

alter table public.audit_events enable row level security;

create policy audit_events_read on public.audit_events
for select to authenticated
using (public.has_permission('audit.read'));

create policy audit_events_append on public.audit_events
for insert to authenticated
with check (
  actor_profile_id = auth.uid()
  and public.has_permission('audit.create')
);

revoke all on table public.audit_events from anon, authenticated;
grant select, insert on table public.audit_events to authenticated;

revoke all on function public.prevent_audit_event_mutation() from public, anon, authenticated;
