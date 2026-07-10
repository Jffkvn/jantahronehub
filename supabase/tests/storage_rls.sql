begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select is(
  (select public from storage.buckets where id = 'private-files'),
  false,
  'the private file bucket is not public'
);
select is(
  (select file_size_limit from storage.buckets where id = 'private-files'),
  10485760::bigint,
  'the private file bucket enforces the 10 MiB limit'
);
select ok(
  public.is_valid_private_file_path(
    '10000000-0000-4000-8000-000000000001/employee-documents/20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000003.pdf'
  ),
  'canonical UUID-based paths are accepted'
);
select ok(
  not public.is_valid_private_file_path('../payroll.xlsx'),
  'path traversal and unsupported extensions are rejected'
);
select ok(
  to_regprocedure('public.rls_auto_enable()') is null
  or not has_function_privilege('anon', 'public.rls_auto_enable()', 'execute'),
  'anonymous users cannot execute the platform RLS event-trigger helper'
);
select ok(
  to_regprocedure('public.rls_auto_enable()') is null
  or not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute'),
  'authenticated users cannot execute the platform RLS event-trigger helper directly'
);

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'owner@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'other@example.invalid'),
  ('10000000-0000-4000-8000-000000000003', 'admin@example.invalid');

insert into public.profiles (id, display_name)
values
  ('10000000-0000-4000-8000-000000000001', 'File Owner'),
  ('10000000-0000-4000-8000-000000000002', 'Other Employee'),
  ('10000000-0000-4000-8000-000000000003', 'File Administrator');

insert into public.user_roles (profile_id, role_id)
select '10000000-0000-4000-8000-000000000003', id
from public.roles
where key = 'super_admin';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into storage.objects (bucket_id, name, owner_id)
values (
  'private-files',
  '10000000-0000-4000-8000-000000000001/employee-documents/20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000003.pdf',
  '10000000-0000-4000-8000-000000000001'
);

select is(
  (select count(*) from storage.objects where bucket_id = 'private-files'),
  1::bigint,
  'an owner can create and read a canonical object in their folder'
);
select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'private-files',
      '10000000-0000-4000-8000-000000000002/employee-documents/20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000004.pdf',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'an owner cannot create an object in another profile folder'
);
select lives_ok(
  $$
    update storage.objects
    set metadata = '{"attempted":"replacement"}'::jsonb
    where bucket_id = 'private-files'
  $$,
  'an ordinary update matches no rows because no update policy exists'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*) from storage.objects where bucket_id = 'private-files'),
  0::bigint,
  'another employee cannot read the owner object'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',
  true
);
select is(
  (select count(*) from storage.objects where bucket_id = 'private-files'),
  0::bigint,
  'super_admin cannot read private files at aal1'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',
  true
);
select is(
  (select count(*) from storage.objects where bucket_id = 'private-files'),
  1::bigint,
  'super_admin can read private files at aal2'
);
select is(
  (
    select cmd
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'private_files_remove'
  ),
  'DELETE'::text,
  'private file removal is exposed only through the scoped DELETE policy and Storage API'
);

select * from finish();
rollback;
