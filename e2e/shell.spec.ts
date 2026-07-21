import { expect, test } from '@playwright/test'

test('presents the full navigation shell on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/components/shell')

  await expect(page.getByLabel('Primary navigation')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Welcome back, OneHub' })).toBeVisible()
  await expect(page.getByLabel('Mobile navigation')).toBeHidden()
})

test('uses a bottom bar and accessible drawer on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/components/shell')

  await expect(page.getByLabel('Mobile navigation')).toBeVisible()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.getByRole('dialog', { name: 'Main navigation' })).toBeVisible()

  await page.getByRole('button', { name: 'Close navigation' }).click()
  await expect(page.getByRole('dialog', { name: 'Main navigation' })).toBeHidden()
})

test('keeps module tabs on one safely scrollable line on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/components')

  const tabs = page.getByRole('navigation', { name: 'Module navigation preview' })
  await expect(tabs).toBeVisible()
  await expect(tabs).toHaveCSS('flex-wrap', 'nowrap')
  await expect(tabs).toHaveCSS('overflow-x', 'auto')

  const dimensions = await tabs.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth)
})
