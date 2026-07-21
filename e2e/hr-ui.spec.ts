import { expect, test } from '@playwright/test'

test('operational preview uses restrained titles and contained metrics', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/components/shell/hr')

  const title = page.getByRole('heading', { name: 'Employee directory' })
  await expect(title).toBeVisible()
  await expect(title).toHaveCSS('font-size', '32px')

  const metrics = page.getByTestId('employee-metrics')
  await expect(metrics).toHaveCSS('background-image', /linear-gradient/)
  await expect(metrics).toHaveCSS('border-radius', '18px')
})

test('operational preview remains contained on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/components/shell/hr')

  const pageSurface = page.getByTestId('hr-preview')
  const bounds = await pageSurface.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)

  await expect(page.getByRole('heading', { name: 'Employee directory' })).toHaveCSS(
    'font-size',
    '26.4px',
  )
})

test('button tabs do not expose native browser borders', async ({ page }) => {
  await page.goto('/components')

  const tab = page.getByRole('button', { name: 'Workforce Summary' })
  await expect(tab).toHaveCSS('border-top-width', '0px')
  await expect(tab).toHaveCSS('appearance', 'none')
})

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 1024, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`captures a contained HR review state on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/components/shell/hr')
    await expect(page.getByRole('heading', { name: 'Employee directory' })).toBeVisible()

    const width = await page.evaluate(() => {
      const client = document.documentElement.clientWidth
      return {
        client,
        scroll: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((element) => element.getBoundingClientRect().right > client + 1)
          .slice(0, 8)
          .map((element) => ({
            tag: element.tagName,
            className: element.className,
            right: Math.round(element.getBoundingClientRect().right),
            scrollWidth: element.scrollWidth,
          })),
      }
    })
    expect(width, JSON.stringify(width.offenders)).toMatchObject({ scroll: width.client })

    await page.screenshot({
      path: `docs/verification/task-10-hr-${viewport.name}.png`,
      fullPage: true,
    })
  })
}
