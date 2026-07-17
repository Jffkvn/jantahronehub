-- Egypro currently operates one inventory store at headquarters.

insert into public.warehouses (code, name, location, status)
select 'HQ-01', 'Egypro HQ Warehouse', 'Egypro HQ', 'active'
where not exists (select 1 from public.warehouses);
