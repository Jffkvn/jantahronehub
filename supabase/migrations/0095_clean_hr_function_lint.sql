-- Resolve static analysis findings in the completed HR verticals.
create or replace function public.rpc_log_training_records(p_employee_ids uuid[],p_topic text,p_provider text,p_completion_date date,p_duration_hours numeric,p_cost_ugx numeric,p_status text,p_expiry_date date,p_certificate_reference text)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=public.current_profile_id();
  v_employee uuid;
  v_ids uuid[]:=array[]::uuid[];
  v_id uuid;
  v_profile uuid;
  v_name text;
begin
  if not public.has_permission('training.manage') then raise exception 'training.manage permission is required' using errcode='42501';end if;
  if coalesce(array_length(p_employee_ids,1),0)=0 or length(btrim(coalesce(p_topic,'')))<2 or p_status not in ('scheduled','attended','passed','failed') or (p_expiry_date is not null and p_expiry_date<p_completion_date) then raise exception 'Enter valid training details and at least one employee.' using errcode='22023';end if;
  foreach v_employee in array p_employee_ids loop
    select employee.profile_id,employee.legal_name into v_profile,v_name from public.employees employee where employee.id=v_employee and employee.archived_at is null;
    if v_name is null then raise exception 'Employee not found.' using errcode='P0002';end if;
    insert into public.training_records(employee_id,topic,provider,completion_date,duration_hours,cost_ugx,status,expiry_date,certificate_reference,created_by,updated_by)
    values(v_employee,btrim(p_topic),nullif(btrim(p_provider),''),p_completion_date,p_duration_hours,p_cost_ugx,p_status,p_expiry_date,nullif(btrim(p_certificate_reference),''),v_actor,v_actor)
    returning id into v_id;
    v_ids:=array_append(v_ids,v_id);
    insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,new_values)
    values(v_actor,'training_record.created','training_record',v_id::text,jsonb_build_object('employee_id',v_employee,'topic',btrim(p_topic),'status',p_status,'expiry_date',p_expiry_date));
    if v_profile is not null then
      insert into public.notifications(recipient_profile_id,title,message,category,event_key,action_path)
      values(v_profile,'Training Record Added',btrim(p_topic)||' was added to your training history.','hr','training_added_'||v_id,'/my/training?training='||v_id)
      on conflict(event_key) do nothing;
    end if;
  end loop;
  return v_ids;
end $$;

create or replace function public.rpc_list_performance_review_events(p_review_id uuid)
returns table(id uuid,event_type text,from_status text,to_status text,reason text,actor_name text,occurred_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare v_review public.performance_reviews%rowtype;v_employee uuid:=public._performance_employee_for_profile(public.current_profile_id());
begin
  select review.* into v_review from public.performance_reviews review where review.id=p_review_id;
  if v_review.id is null then raise exception 'Performance review not found.' using errcode='P0002';end if;
  if not public.has_permission('performance.manage') and v_review.reviewer_profile_id<>public.current_profile_id() and not(v_review.employee_id=v_employee and v_review.status in ('hr_approved','employee_acknowledged')) then raise exception 'You cannot view this review history.' using errcode='42501';end if;
  return query select event.id,event.event_type,event.from_status,event.to_status,event.reason,profile.display_name,event.occurred_at
  from public.performance_review_events event join public.profiles profile on profile.id=event.actor_profile_id
  where event.review_id=p_review_id order by event.occurred_at;
end $$;

revoke all on function public.rpc_log_training_records(uuid[],text,text,date,numeric,numeric,text,date,text),public.rpc_list_performance_review_events(uuid) from public,anon;
grant execute on function public.rpc_log_training_records(uuid[],text,text,date,numeric,numeric,text,date,text),public.rpc_list_performance_review_events(uuid) to authenticated;
