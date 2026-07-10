create extension if not exists pgcrypto with schema extensions;

create table public.company_profile (
  id uuid primary key default extensions.gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  name text not null check (length(btrim(name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  logo_path text,
  timezone text not null default 'Africa/Kampala',
  currency_code text not null default 'UGX' check (currency_code ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 160),
  avatar_path text,
  status text not null default 'active' check (status in ('active', 'deactivated')),
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'active' and deactivated_at is null)
    or (status = 'deactivated' and deactivated_at is not null)
  )
);

create table public.feature_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_.-]*$'),
  value jsonb not null,
  description text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.feature_settings is
  'Deployment-level feature and security policy configuration. No user metadata is authoritative.';

insert into public.feature_settings (key, value, description)
values
  (
    'modules.enabled',
    '["home","my_workspace","hr","inventory","cash","tracker","reports","admin"]'::jsonb,
    'Modules enabled for this single-company deployment.'
  ),
  (
    'auth.mfa_policy',
    '{"method":"totp","enforced_roles":["super_admin"],"optional_for_other_roles":true}'::jsonb,
    'TOTP is mandatory for super_admin and optional for all other roles initially.'
  );

alter table public.company_profile enable row level security;
alter table public.profiles enable row level security;
alter table public.feature_settings enable row level security;

revoke all on table public.company_profile from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.feature_settings from anon, authenticated;
