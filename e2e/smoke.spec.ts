import { expect, test } from '@playwright/test'

test('shows the OneHub login entry point', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.getByText('Egypro OneHub')).toBeVisible()
  await expect(page.getByText('Powered by JantaHR')).toBeVisible()
})
