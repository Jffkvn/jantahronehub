import { expect, test } from '@playwright/test'

test('payroll draft is responsive and exposes controlled HR actions',async({page})=>{
 await page.setViewportSize({width:1440,height:1000}); await page.goto('/components/shell/payroll')
 await expect(page.getByRole('heading',{name:'June 2026'})).toBeVisible(); await expect(page.getByText('Draft — review every employee before HR approval.')).toBeVisible(); await expect(page.getByRole('button',{name:'Approve payroll'})).toBeVisible(); await expect(page.getByLabel('Percentage worked for Moses Okello')).toHaveValue('75')
 await page.setViewportSize({width:390,height:844}); await expect(page.getByLabel('Mobile navigation')).toBeVisible(); await expect(page.getByRole('heading',{name:'June 2026'})).toBeVisible()
})
