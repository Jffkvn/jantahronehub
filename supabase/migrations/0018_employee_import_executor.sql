alter function public.commit_employee_import(text,text,jsonb) security definer;

comment on function public.commit_employee_import(text,text,jsonb) is
  'Permission-checked atomic employee import. Definer rights are limited to the protected import ledger and nested audited employee workflows.';
