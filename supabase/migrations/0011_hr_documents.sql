create table public.employee_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  employment_period_id uuid,
  document_type text not null check (
    document_type in (
      'contract', 'offer_letter', 'identity', 'nssf', 'tin', 'medical',
      'performance', 'disciplinary', 'warning', 'termination', 'clearance', 'other'
    )
  ),
  display_name text not null check (length(btrim(display_name)) between 1 and 180),
  storage_path text not null unique check (
    storage_path = btrim(storage_path)
    and storage_path !~ '(^|/)\.\.(/|$)'
    and storage_path ~ '^employees/[0-9a-f-]+/[0-9a-f-]+/[A-Za-z0-9._-]+$'
  ),
  mime_type text not null check (length(btrim(mime_type)) between 3 and 120),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  employee_visible boolean not null default false,
  notes text check (notes is null or length(btrim(notes)) <= 1000),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  archive_reason text,
  updated_at timestamptz not null default now(),
  check (
    (archived_at is null and archived_by is null and archive_reason is null)
    or (
      archived_at is not null
      and archived_by is not null
      and length(btrim(archive_reason)) between 3 and 500
    )
  ),
  foreign key (employment_period_id, employee_id)
    references public.employment_periods(id, employee_id) on delete restrict
);

create index employee_documents_employee_id_idx on public.employee_documents(employee_id);
create index employee_documents_employment_period_id_idx on public.employee_documents(employment_period_id)
where employment_period_id is not null;
create index employee_documents_type_idx on public.employee_documents(document_type);
create index employee_documents_visible_idx on public.employee_documents(employee_id)
where employee_visible and archived_at is null;

alter table public.employee_documents enable row level security;

create policy employee_documents_read on public.employee_documents
for select to authenticated
using (
  public.has_permission('employee_documents.read')
  or (
    employee_visible
    and archived_at is null
    and exists (
      select 1 from public.employees employee
      where employee.id = employee_documents.employee_id
        and employee.profile_id = auth.uid()
        and employee.archived_at is null
    )
  )
);

create policy employee_documents_create on public.employee_documents
for insert to authenticated
with check (
  public.has_permission('employee_documents.manage')
  and uploaded_by = auth.uid()
);

create policy employee_documents_update on public.employee_documents
for update to authenticated
using (public.has_permission('employee_documents.manage'))
with check (public.has_permission('employee_documents.manage'));

revoke all on table public.employee_documents from anon, authenticated;
grant select, insert, update on table public.employee_documents to authenticated;

comment on table public.employee_documents is
  'Private employee document metadata. Objects remain in private Storage and employee visibility is explicit per document.';
