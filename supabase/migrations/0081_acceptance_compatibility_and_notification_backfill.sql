-- Keep the legacy name-based stock request entry point safe by delegating to
-- the canonical, warehouse-valued implementation. Also make existing
-- operational notifications navigable without changing their read state.

create or replace function public.rpc_request_stock(p_project_name text, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_match_count integer;
begin
  select count(*), (array_agg(project.id order by project.id))[1]
  into v_match_count, v_project_id
  from public.projects project
  where lower(regexp_replace(btrim(project.name), '\s+', ' ', 'g'))
      = lower(regexp_replace(btrim(p_project_name), '\s+', ' ', 'g'));

  if v_match_count <> 1 then
    raise invalid_parameter_value using message = 'Project name must resolve to exactly one canonical project.';
  end if;

  return public.rpc_request_stock(v_project_id, p_items);
end
$$;

revoke all on function public.rpc_request_stock(text, jsonb) from public, anon;
grant execute on function public.rpc_request_stock(text, jsonb) to authenticated;

create or replace function public.set_notification_action_path()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_entity_id uuid;
  v_project_id uuid;
  v_advance_id uuid;
begin
  if new.action_path is not null then return new; end if;

  if new.event_key ~ '^cash_advance_request_[0-9a-f-]{36}_' then
    v_entity_id := substring(new.event_key from '^cash_advance_request_([0-9a-f-]{36})_')::uuid;
    new.action_path := '/cash/advances/' || v_entity_id;
  elsif new.event_key ~ '^cash_advance_expense_[0-9a-f-]{36}_' then
    v_entity_id := substring(new.event_key from '^cash_advance_expense_([0-9a-f-]{36})_')::uuid;
    select expense.cash_advance_id into v_advance_id
    from public.cash_advance_expenses expense where expense.id = v_entity_id;
    if v_advance_id is not null then new.action_path := '/cash/advances/' || v_advance_id; end if;
  elsif new.event_key ~ '^stock_request_[0-9a-f-]{36}_' then
    v_entity_id := substring(new.event_key from '^stock_request_([0-9a-f-]{36})_')::uuid;
    new.action_path := '/inventory/requests/' || v_entity_id;
  elsif new.event_key ~ '^daily_update_[0-9a-f-]{36}_' then
    v_entity_id := substring(new.event_key from '^daily_update_([0-9a-f-]{36})_')::uuid;
    select update_row.project_id into v_project_id
    from public.daily_updates update_row where update_row.id = v_entity_id;
    if v_project_id is not null then new.action_path := '/projects/' || v_project_id || '/updates'; end if;
  elsif new.event_key ~ '^project_assignment_[0-9a-f-]{36}$' then
    v_entity_id := substring(new.event_key from '^project_assignment_([0-9a-f-]{36})$')::uuid;
    select assignment.project_id into v_project_id
    from public.project_assignments assignment where assignment.id = v_entity_id;
    if v_project_id is not null then new.action_path := '/projects/' || v_project_id || '/team'; end if;
  end if;
  return new;
end
$$;

update public.notifications notification
set action_path = candidate.action_path
from (
  select source.id,
    case
      when source.event_key ~ '^cash_advance_request_[0-9a-f-]{36}_'
        then '/cash/advances/' || substring(source.event_key from '^cash_advance_request_([0-9a-f-]{36})_')
      when source.event_key ~ '^stock_request_[0-9a-f-]{36}_'
        then '/inventory/requests/' || substring(source.event_key from '^stock_request_([0-9a-f-]{36})_')
      when source.event_key ~ '^daily_update_[0-9a-f-]{36}_'
        then '/projects/' || update_row.project_id || '/updates'
      when source.event_key ~ '^project_assignment_[0-9a-f-]{36}$'
        then '/projects/' || assignment.project_id || '/team'
      when source.event_key ~ '^cash_advance_expense_[0-9a-f-]{36}_'
        then '/cash/advances/' || expense.cash_advance_id
      else null
    end as action_path
  from public.notifications source
  left join public.daily_updates update_row
    on update_row.id = case when source.event_key ~ '^daily_update_[0-9a-f-]{36}_'
      then substring(source.event_key from '^daily_update_([0-9a-f-]{36})_')::uuid end
  left join public.project_assignments assignment
    on assignment.id = case when source.event_key ~ '^project_assignment_[0-9a-f-]{36}$'
      then substring(source.event_key from '^project_assignment_([0-9a-f-]{36})$')::uuid end
  left join public.cash_advance_expenses expense
    on expense.id = case when source.event_key ~ '^cash_advance_expense_[0-9a-f-]{36}_'
      then substring(source.event_key from '^cash_advance_expense_([0-9a-f-]{36})_')::uuid end
  where source.action_path is null
) candidate
where notification.id = candidate.id and candidate.action_path is not null;
