-- 1. Create permissions
insert into public.permissions (key, resource, action, description)
values
  ('cash_advances.request', 'cash_advances', 'request', 'Can request project cash advances'),
  ('cash_advances.manage', 'cash_advances', 'manage', 'Can approve, disburse, review, and close project cash advances'),
  ('cash_advances.view_all', 'cash_advances', 'view_all', 'Can view all project cash advances globally'),
  ('cash_advances.view_own', 'cash_advances', 'view_own', 'Can view own cash advances')
on conflict (key) do nothing;

-- 2. Assign permissions to roles
-- CFO gets manage, request, view_all
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'cfo'
  and p.key in ('cash_advances.request', 'cash_advances.manage', 'cash_advances.view_all', 'cash_advances.view_own')
on conflict do nothing;

-- Managing Director gets view_all
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'managing_director'
  and p.key in ('cash_advances.view_all')
on conflict do nothing;

-- PM gets request and view_own
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'project_manager'
  and p.key in ('cash_advances.request', 'cash_advances.view_own')
on conflict do nothing;

-- Coordinator gets request and view_own
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'coordinator'
  and p.key in ('cash_advances.request', 'cash_advances.view_own')
on conflict do nothing;

-- 3. Create tables
create table public.cash_advance_requests (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) not null,
  user_id uuid references public.profiles(id) not null,
  amount_requested numeric(15,2) check (amount_requested > 0) not null,
  purpose text not null,
  status text not null default 'pending_approval' check (status in ('pending_approval', 'approved', 'disbursed', 'completed', 'rejected')),
  requested_at timestamp with time zone default now() not null,
  entered_by uuid references public.profiles(id) not null,
  approved_by uuid references public.profiles(id),
  approved_at timestamp with time zone,
  disbursed_by uuid references public.profiles(id),
  disbursed_at timestamp with time zone,
  amount_disbursed numeric(15,2) check (amount_disbursed >= 0),
  disbursement_reference text,
  closed_by uuid references public.profiles(id),
  closed_at timestamp with time zone,
  override_reason text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.cash_advance_expenses (
  id uuid default gen_random_uuid() primary key,
  cash_advance_id uuid references public.cash_advance_requests(id) on delete cascade not null,
  expense_date date not null,
  category text not null,
  amount numeric(15,2) check (amount > 0) not null,
  vendor text not null,
  explanation text not null,
  receipt_url text,
  receipt_unavailable boolean default false not null,
  receipt_unavailable_explanation text,
  status text not null default 'pending_review' check (status in ('pending_review', 'accepted', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamp with time zone,
  rejection_reason text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.cash_advance_returns (
  id uuid default gen_random_uuid() primary key,
  cash_advance_id uuid references public.cash_advance_requests(id) on delete cascade not null,
  return_date date not null,
  amount numeric(15,2) check (amount > 0) not null,
  returned_by uuid references public.profiles(id) not null,
  received_by uuid references public.profiles(id) not null,
  receipt_reference text not null,
  notes text,
  created_at timestamp with time zone default now() not null
);

-- Indexes for performance
create index idx_cash_advances_user_id on public.cash_advance_requests(user_id);
create index idx_cash_advances_project_id on public.cash_advance_requests(project_id);
create index idx_cash_advances_status on public.cash_advance_requests(status);
create index idx_cash_advance_expenses_parent on public.cash_advance_expenses(cash_advance_id);
create index idx_cash_advance_returns_parent on public.cash_advance_returns(cash_advance_id);

-- Enable RLS
alter table public.cash_advance_requests enable row level security;
alter table public.cash_advance_expenses enable row level security;
alter table public.cash_advance_returns enable row level security;

-- Helper security definer function to avoid recursive policies
create or replace function public.is_advance_owner(p_advance_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.cash_advance_requests
    where id = p_advance_id
      and (user_id = p_user_id or entered_by = p_user_id)
  );
$$;

-- RLS Policies for cash_advance_requests
create policy cash_advance_requests_select_policy on public.cash_advance_requests
  for select using (
    public.has_permission('cash_advances.view_all') or
    user_id = auth.uid() or
    entered_by = auth.uid()
  );

create policy cash_advance_requests_insert_policy on public.cash_advance_requests
  for insert with check (
    public.has_permission('cash_advances.request') and (
      user_id = auth.uid() or
      public.has_permission('cash_advances.manage')
    )
  );

create policy cash_advance_requests_update_policy on public.cash_advance_requests
  for update using (
    public.has_permission('cash_advances.manage') or
    (user_id = auth.uid() and status = 'pending_approval')
  ) with check (
    public.has_permission('cash_advances.manage') or
    (user_id = auth.uid() and status = 'pending_approval')
  );

-- RLS Policies for cash_advance_expenses
create policy cash_advance_expenses_select_policy on public.cash_advance_expenses
  for select using (
    public.has_permission('cash_advances.view_all') or
    public.is_advance_owner(cash_advance_id, auth.uid())
  );

create policy cash_advance_expenses_insert_policy on public.cash_advance_expenses
  for insert with check (
    public.is_advance_owner(cash_advance_id, auth.uid())
  );

create policy cash_advance_expenses_update_policy on public.cash_advance_expenses
  for update using (
    public.has_permission('cash_advances.manage') or
    (public.is_advance_owner(cash_advance_id, auth.uid()) and status = 'pending_review')
  ) with check (
    public.has_permission('cash_advances.manage') or
    (public.is_advance_owner(cash_advance_id, auth.uid()) and status = 'pending_review')
  );

-- RLS Policies for cash_advance_returns
create policy cash_advance_returns_select_policy on public.cash_advance_returns
  for select using (
    public.has_permission('cash_advances.view_all') or
    public.is_advance_owner(cash_advance_id, auth.uid())
  );

create policy cash_advance_returns_insert_policy on public.cash_advance_returns
  for insert with check (
    public.has_permission('cash_advances.manage')
  );

create policy cash_advance_returns_update_policy on public.cash_advance_returns
  for update using (
    public.has_permission('cash_advances.manage')
  ) with check (
    public.has_permission('cash_advances.manage')
  );

-- Grant table privileges to authenticated users
revoke all on table public.cash_advance_requests from anon, authenticated;
revoke all on table public.cash_advance_expenses from anon, authenticated;
revoke all on table public.cash_advance_returns from anon, authenticated;

grant select, insert, update on table public.cash_advance_requests to authenticated;
grant select, insert, update on table public.cash_advance_expenses to authenticated;
grant select, insert, update on table public.cash_advance_returns to authenticated;
