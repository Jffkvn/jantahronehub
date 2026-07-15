-- The permission assertion only reads the authenticated actor's effective
-- permissions. Marking it stable allows the read-only administration RPCs to
-- remain stable without PostgreSQL reporting a volatility mismatch.
alter function public.admin_assert_permission(text) stable;
