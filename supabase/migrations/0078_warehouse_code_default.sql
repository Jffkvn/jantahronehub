-- Preserve older trusted setup/import paths while inline forms provide human warehouse codes.

alter table public.warehouses
  alter column code set default (
    'WH-' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8))
  );
