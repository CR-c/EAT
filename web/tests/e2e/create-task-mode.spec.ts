import { test, expect } from '@playwright/test'

test('create task page toggles between normal and guided modes', async ({ page }) => {
  await page.goto('/projects/42309265-ae12-47c3-837c-0737800dc99e/tasks/new')

  await expect(page.getByText('任务类型')).toBeVisible()
  await expect(page.getByRole('button', { name: /普通任务/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /模板任务/ })).toBeVisible()

  await page.getByRole('button', { name: /普通任务/ }).click()
  await expect(page.getByText('当前为普通任务模式')).toBeVisible()
  await expect(page.getByText('任务模板（推荐）')).toHaveCount(0)

  await page.getByRole('button', { name: /模板任务/ }).click()
  await expect(page.getByText('任务模板（推荐）')).toBeVisible()
  await expect(page.getByText('模板任务会直接生成可审阅计划')).toBeVisible()
})
