-- Drop the old 4-argument create_notification function signature
drop function if exists public.create_notification(uuid, text, text, text);

-- Revoke execute permissions on the 5-argument create_notification function
revoke execute on function public.create_notification(uuid, text, text, text, text) from public, anon, authenticated;

-- Explicitly grant execute to service_role only
grant execute on function public.create_notification(uuid, text, text, text, text) to service_role;
