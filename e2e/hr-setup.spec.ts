import { expect, test } from '@playwright/test'

test('HR creates setup data that becomes available for employee assignment', async ({ page }) => {
  await page.goto('/components/shell/hr-setup')

  await expect(page.getByRole('heading', { name: 'HR Setup' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Setup' })).toBeVisible()

  await page.getByRole('button', { name: 'Add department' }).click()
  await page.getByLabel('Code').fill('FIELD')
  await page.getByLabel('Name').fill('Field Operations')
  await page.getByLabel('Reason for change').fill('Approved operating structure')
  await page.getByRole('button', { name: 'Save department' }).click()

  await expect(page.getByText('Field Operations', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open employee assignment' }).click()
  await expect(page.getByLabel('Department')).toContainText('Field Operations')
})

test('ordinary employees do not see the HR Setup navigation', async ({ page }) => {
  await page.goto('/components/shell/hr-setup')
  await page.getByRole('button', { name: 'Preview employee permissions' }).click()

  await expect(page.getByRole('link', { name: 'Setup' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Employee assignment preview' })).toBeVisible()
})
