alter table public.daily_updates
  drop constraint if exists unique_project_user_date;

create or replace function public.rpc_save_daily_update(
  p_update_id uuid, p_project_id uuid, p_update_date date, p_summary text,
  p_photo_urls text[], p_submit boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.current_profile_id();
  saved_id uuid;
  existing public.daily_updates%rowtype;
  evidence_path text;
begin
  if actor is null or not (
    public.is_coordinator_on_project(p_project_id, actor)
    or public.is_pm_on_project(p_project_id, actor)
  ) then
    raise insufficient_privilege using message = 'an active coordinator or primary PM assignment is required';
  end if;
  if length(btrim(coalesce(p_summary, ''))) < 1 then raise check_violation using message = 'daily update summary is required'; end if;
  if p_update_date is null then raise not_null_violation using message = 'daily update date is required'; end if;
  if coalesce(cardinality(p_photo_urls), 0) > 10 then raise check_violation using message = 'A daily update can contain up to 10 photos.'; end if;

  if p_update_id is not null then
    select * into existing from public.daily_updates where id = p_update_id for update;
    if not found then raise no_data_found using message = 'daily update not found'; end if;
    if existing.submitted_by <> actor or existing.project_id <> p_project_id or existing.status not in ('draft', 'revision_requested') then
      raise insufficient_privilege using message = 'only the assigned original coordinator may revise this update';
    end if;
  end if;

  foreach evidence_path in array coalesce(p_photo_urls, array[]::text[]) loop
    if evidence_path = any(coalesce(existing.photo_urls, array[]::text[])) then continue; end if;
    if evidence_path !~ ('^' || actor::text || '/daily-evidence/' || p_project_id::text || '/[0-9a-f-]+[.](jpe?g|png|webp)$')
       or not public.is_valid_private_file_path(evidence_path)
       or not exists (select 1 from storage.objects object where object.bucket_id = 'private-files' and object.name = evidence_path) then
      raise check_violation using message = 'A valid uploaded daily-update photo is required.';
    end if;
  end loop;

  if p_update_id is null then
    insert into public.daily_updates (project_id, submitted_by, update_date, summary, photo_urls, status)
    values (p_project_id, actor, p_update_date, btrim(p_summary), coalesce(p_photo_urls, array[]::text[]),
      case when coalesce(p_submit, false) then 'submitted' else 'draft' end) returning id into saved_id;
  else
    update public.daily_updates set update_date = p_update_date, summary = btrim(p_summary),
      photo_urls = coalesce(p_photo_urls, array[]::text[]), status = case when coalesce(p_submit, false) then 'submitted' else 'draft' end,
      pm_feedback = case when coalesce(p_submit, false) then null else pm_feedback end,
      endorsed_by = null, endorsed_at = null, updated_at = now()
    where id = p_update_id returning id into saved_id;
  end if;

  insert into public.audit_events (actor_profile_id, event_type, entity_type, entity_id, new_values)
  values (actor, case when p_update_id is null then 'daily_updates.created' else 'daily_updates.revised' end,
    'daily_update', saved_id::text, jsonb_build_object('project_id', p_project_id, 'update_date', p_update_date,
      'submitted', coalesce(p_submit, false), 'photo_count', coalesce(cardinality(p_photo_urls), 0)));
  return saved_id;
end
$$;

revoke all on function public.rpc_save_daily_update(uuid, uuid, date, text, text[], boolean) from public, anon;
grant execute on function public.rpc_save_daily_update(uuid, uuid, date, text, text[], boolean) to authenticated;
