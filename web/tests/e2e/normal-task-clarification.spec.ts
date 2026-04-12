import { test, expect } from '@playwright/test'

test('normal task workbench can send clarification message and stay on same project/task context', async ({ page }) => {
  await page.goto('/projects/42309265-ae12-47c3-837c-0737800dc99e/tasks/new')

  await page.getByRole('button', { name: /普通任务/ }).click()
  await page.getByRole('button', { name: /codex-cli/ }).click()
  await page.getByPlaceholder(/实现用户鉴权模块/).fill('E2E 普通任务澄清')
  await page.getByPlaceholder(/详细描述本次任务/).fill('不要使用模板。请先进入澄清并返回一句简短问题。')
  await page.getByRole('button', { name: '确认发布' }).click()

  await expect(page).toHaveURL(/\/projects\/42309265-ae12-47c3-837c-0737800dc99e\/workbench\?taskId=/)
  await expect(page.getByText('evat-todo-benchmark')).toBeVisible()

  const urlBefore = page.url()
  await page.getByPlaceholder('继续对话以修改规格，无需打回...').fill('请先给出一个简短澄清问题。')
  await page.keyboard.press('Enter')

  await expect.poll(() => page.url()).toBe(urlBefore)
  await expect(page.getByText('Lead Agent: codex-cli')).toBeVisible()
  await expect(page.getByText('任务 ID:')).toBeVisible()
  await expect.poll(async () => {
    const body = await page.locator('body').innerText()
    return body.includes('请先给出一个简短澄清问题。') || body.includes('你希望我重点验证') || body.includes('请补充') || body.includes('这次“')
  }, { timeout: 15000 }).toBe(true)
})
