-- Permit a tightly-scoped request identifier on in-app notification links.
-- Other query strings, external URLs, traversal and protocol-relative paths remain invalid.

alter table public.notifications
  drop constraint if exists notifications_action_path_check;

alter table public.notifications
  add constraint notifications_action_path_check check (
    action_path is null or (
      action_path ~ '^/[A-Za-z0-9_/-]+(\?request=[0-9a-f-]{36})?$'
      and action_path !~ '//'
      and action_path !~ '\.\.'
    )
  );
