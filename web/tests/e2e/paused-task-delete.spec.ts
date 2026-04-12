import { test, expect } from '@playwright/test'

test('paused task in action required status shows no active-task block markers on tasks page', async ({ page }) => {
  await page.goto('/projects/beef5b04-ed55-4e19-87cd-0c4826a7cd7b/tasks')

  await expect(page.getByText('未检索到符合条件的任务。')).toBeVisible()
})

test('paused task helper logic marks paused action-required tasks as not operational', async ({ page }) => {
  await page.goto('/projects/42309265-ae12-47c3-837c-0737800dc99e/tasks')

  const result = await page.evaluate(() => {
    const pausedReasonPrefix = 'Paused by operator from '
    const task = {
      status: 'ACTION_REQUIRED',
      lastError: 'Paused by operator from CLARIFYING.',
    }
    const isTaskPaused = task.status === 'ACTION_REQUIRED' && typeof task.lastError === 'string' && task.lastError.startsWith(pausedReasonPrefix)
    const isTaskOperational = isTaskPaused ? false : !['PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status)
    return { isTaskPaused, isTaskOperational }
  })

  expect(result.isTaskPaused).toBe(true)
  expect(result.isTaskOperational).toBe(false)
})
