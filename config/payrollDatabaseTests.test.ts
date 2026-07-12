import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

test('hosted payroll export tests initialize pgTAP and its schema search path', () => {
  const sql = readFileSync('supabase/tests/payroll_exports.sql', 'utf8')

  expect(sql).toContain('create extension if not exists pgtap with schema extensions;')
  expect(sql).toContain('set local search_path = public, extensions;')
  expect(sql).toContain("'get_my_payslips',array[]::text[],'authenticated',array['EXECUTE']::text[]")
  expect(sql).toContain("'record_payroll_export',array['uuid','uuid','text']::text[],'authenticated',array['EXECUTE']::text[]")
})
