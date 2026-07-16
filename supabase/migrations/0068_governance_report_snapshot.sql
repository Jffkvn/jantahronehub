-- Curated company-wide reporting for authorized governance viewers.
-- The function intentionally returns report shapes rather than raw employee,
-- payroll or inventory rows so executive oversight does not imply mutation or
-- confidential dossier access.

create or replace function public.get_governance_report_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
begin
  if not public.has_permission('reports.view') then
    raise insufficient_privilege using message = 'reports.view permission is required';
  end if;

  select jsonb_build_object(
    'workforce', (
      select jsonb_build_object(
        'totalHeadcount', (
          select count(*)::integer
          from public.employees employee
          where employee.archived_at is null
        ),
        'activeCount', coalesce(sum(department_count.employee_count), 0)::integer,
        'departmentCounts', coalesce(
          jsonb_agg(
            jsonb_build_object(
              'departmentName', department_count.department_name,
              'count', department_count.employee_count
            )
            order by department_count.department_name
          ) filter (where department_count.department_name is not null),
          '[]'::jsonb
        )
      )
      from (
        select
          coalesce(department.name, 'Unassigned') as department_name,
          count(*)::integer as employee_count
        from public.employees employee
        join lateral (
          select period.department_id
          from public.employment_periods period
          where period.employee_id = employee.id
            and period.start_date <= current_date
            and (period.end_date is null or period.end_date >= current_date)
          order by period.start_date desc, period.created_at desc
          limit 1
        ) current_period on true
        left join public.departments department on department.id = current_period.department_id
        where employee.archived_at is null
        group by coalesce(department.name, 'Unassigned')
      ) department_count
    ),
    'payrollSummaries', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', run.id,
            'label', period.label,
            'periodStart', period.period_start,
            'periodEnd', period.period_end,
            'runNumber', run.run_number,
            'runType', run.run_type,
            'status', run.status,
            'totalGross', run.total_gross,
            'totalPaye', run.total_paye,
            'totalNssfEmployee', run.total_nssf_employee,
            'totalNssfEmployer', run.total_nssf_employer,
            'totalWht', run.total_wht,
            'totalDeductions', run.total_deductions,
            'totalNet', run.total_net,
            'approvedAt', run.approved_at
          )
          order by run.approved_at desc nulls last, period.period_start desc, run.run_number desc
        ),
        '[]'::jsonb
      )
      from public.payroll_runs run
      join public.payroll_periods period on period.id = run.period_id
    ),
    'inventory', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'warehouseName', balance.warehouse_name,
            'itemName', balance.item_name,
            'sku', balance.sku,
            'unitOfMeasure', balance.unit_of_measure,
            'categoryName', balance.category_name,
            'balance', balance.quantity_balance
          )
          order by balance.warehouse_name, balance.item_name
        ),
        '[]'::jsonb
      )
      from (
        select
          warehouse.name as warehouse_name,
          item.name as item_name,
          item.sku,
          item.unit_of_measure,
          category.name as category_name,
          sum(movement.quantity)::integer as quantity_balance
        from public.stock_movements movement
        join public.warehouses warehouse on warehouse.id = movement.warehouse_id
        join public.consumable_items item on item.id = movement.consumable_item_id
        join public.item_categories category on category.id = item.category_id
        group by warehouse.name, item.id, item.name, item.sku, item.unit_of_measure, category.name
        having sum(movement.quantity) > 0
      ) balance
    ),
    'assets', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'serialNumber', asset.serial_number,
            'modelName', asset.model_name,
            'categoryName', category.name,
            'status', asset.status,
            'custodianName', custodian.display_name,
            'checkedOutAt', custody.issued_at,
            'warehouseName', case
              when custody.id is not null then issued_warehouse.name
              else current_warehouse.name
            end,
            'conditionNotes', asset.condition_notes
          )
          order by asset.model_name, asset.serial_number
        ),
        '[]'::jsonb
      )
      from public.equipment_assets asset
      join public.item_categories category on category.id = asset.category_id
      left join public.warehouses current_warehouse on current_warehouse.id = asset.current_warehouse_id
      left join lateral (
        select active_custody.*
        from public.asset_custody active_custody
        where active_custody.equipment_asset_id = asset.id
          and active_custody.ended_at is null
        order by active_custody.issued_at desc
        limit 1
      ) custody on true
      left join public.profiles custodian on custodian.id = custody.custodian_profile_id
      left join public.warehouses issued_warehouse on issued_warehouse.id = custody.issued_from_warehouse_id
    ),
    'projects', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', project.id,
            'name', project.name,
            'siteLocation', coalesce(project.site_location, ''),
            'status', project.status,
            'pmName', project_pm.display_name,
            'coordinatorName', project_coordinator.display_name,
            'healthStatus', project.health_status,
            'totalUpdates', coalesce(update_summary.total_updates, 0),
            'lastUpdateDate', update_summary.last_update_date
          )
          order by project.name
        ),
        '[]'::jsonb
      )
      from public.projects project
      left join lateral (
        select profile.display_name
        from public.project_assignments assignment
        join public.profiles profile on profile.id = assignment.user_id
        where assignment.project_id = project.id
          and assignment.role_on_project = 'pm'
          and assignment.unassigned_at is null
        order by assignment.assigned_at
        limit 1
      ) project_pm on true
      left join lateral (
        select profile.display_name
        from public.project_assignments assignment
        join public.profiles profile on profile.id = assignment.user_id
        where assignment.project_id = project.id
          and assignment.role_on_project = 'coordinator'
          and assignment.unassigned_at is null
        order by assignment.assigned_at
        limit 1
      ) project_coordinator on true
      left join lateral (
        select
          count(*)::integer as total_updates,
          max(update.update_date) as last_update_date
        from public.daily_updates update
        where update.project_id = project.id
          and update.status in ('submitted', 'endorsed')
      ) update_summary on true
    ),
    'cashReconciliation', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', advance.id,
            'projectName', project.name,
            'recipientName', recipient.display_name,
            'purpose', advance.purpose,
            'status', advance.status,
            'requestedAt', advance.requested_at,
            'amountRequested', advance.amount_requested,
            'amountDisbursed', coalesce(advance.amount_disbursed, 0),
            'acceptedExpenses', coalesce(expense_summary.accepted_expenses, 0),
            'returnedCash', coalesce(return_summary.returned_cash, 0),
            'outstandingBalance',
              coalesce(advance.amount_disbursed, 0)
              - coalesce(expense_summary.accepted_expenses, 0)
              - coalesce(return_summary.returned_cash, 0)
          )
          order by advance.requested_at desc
        ),
        '[]'::jsonb
      )
      from public.cash_advance_requests advance
      join public.projects project on project.id = advance.project_id
      join public.profiles recipient on recipient.id = advance.user_id
      left join lateral (
        select coalesce(sum(expense.amount), 0) as accepted_expenses
        from public.cash_advance_expenses expense
        where expense.cash_advance_id = advance.id
          and expense.status = 'accepted'
      ) expense_summary on true
      left join lateral (
        select coalesce(sum(returned.amount), 0) as returned_cash
        from public.cash_advance_returns returned
        where returned.cash_advance_id = advance.id
      ) return_summary on true
    ),
    'exceptions', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', expense.id,
            'advanceId', expense.cash_advance_id,
            'projectName', project.name,
            'recipientName', recipient.display_name,
            'expenseDate', expense.expense_date,
            'category', expense.category,
            'amount', expense.amount,
            'vendor', expense.vendor,
            'explanation', expense.explanation,
            'receiptUnavailableExplanation', coalesce(expense.receipt_unavailable_explanation, ''),
            'status', expense.status,
            'reviewedBy', reviewer.display_name,
            'reviewedAt', expense.reviewed_at
          )
          order by expense.expense_date desc, expense.created_at desc
        ),
        '[]'::jsonb
      )
      from public.cash_advance_expenses expense
      join public.cash_advance_requests advance on advance.id = expense.cash_advance_id
      join public.projects project on project.id = advance.project_id
      join public.profiles recipient on recipient.id = advance.user_id
      left join public.profiles reviewer on reviewer.id = expense.reviewed_by
      where expense.receipt_unavailable is true
    )
  ) into snapshot;

  return snapshot;
end
$$;

revoke all on function public.get_governance_report_snapshot() from public, anon, authenticated;
grant execute on function public.get_governance_report_snapshot() to authenticated;

comment on function public.get_governance_report_snapshot() is
  'Returns curated company-wide governance report data to reports.view users without granting raw employee, payroll or inventory table authority.';
