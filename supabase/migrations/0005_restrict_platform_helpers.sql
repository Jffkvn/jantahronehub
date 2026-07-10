do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable()
    from public, anon, authenticated;
  end if;
end
$$;

comment on schema public is
  'OneHub API schema. Security-definer helpers use explicit grants and fixed search paths.';
