import { test as base, expect } from '@playwright/test'
import type { BrowserContext, Download, Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import Papa from 'papaparse'

export type PersonInput = { name: string; email: string; age: number }
export type Owner = { client: SupabaseClient; id: string }

export async function allowProtectedPreview(context: BrowserContext, baseURL: string) {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (!secret) return
  const response = await context.request.get(baseURL, {
    headers: {
      'x-vercel-protection-bypass': secret,
      'x-vercel-set-bypass-cookie': 'true',
    },
    maxRedirects: 0,
  })
  expect(response.status(), 'Vercel automation access should succeed').toBeLessThan(400)
}

export async function ownerForPage(page: Page): Promise<Owner> {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error('Real UI tests require VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. See docs/setup.md; use npm run test:local for intercepted UI checks.')
  }
  await expect.poll(async () => page.evaluate(() => {
    const stored = localStorage.getItem('people-manager-auth')
    return stored ? JSON.parse(stored).user?.id : null
  }), { message: 'The application should establish an anonymous session' }).toBeTruthy()
  const session: Session = await page.evaluate(() => JSON.parse(localStorage.getItem('people-manager-auth')!))
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
  if (error) throw error
  return { client, id: session.user.id }
}

export async function cleanupOwner(owner: Owner) {
  const { error } = await owner.client.from('people').delete().eq('owner_id', owner.id)
  if (error) throw new Error(`Could not clean up this test's records: ${error.message}`)
  owner.client.auth.stopAutoRefresh()
}

export const test = base.extend<{ owner: Owner }>({
  owner: [async ({ page, context, baseURL }, runFixture) => {
    if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before running the real Supabase UI suite. See docs/setup.md.')
    }
    await allowProtectedPreview(context, baseURL!)
    await page.goto('/')
    const owner = await ownerForPage(page)
    try {
      await expect(page.getByLabel('Name', { exact: true })).toBeEnabled()
      await runFixture(owner)
    } finally {
      await context.unrouteAll({ behavior: 'ignoreErrors' })
      await cleanupOwner(owner)
    }
  }, { auto: true }],
})

export { expect }

export async function fillPerson(page: Page, person: PersonInput) {
  await page.getByLabel('Name', { exact: true }).fill(person.name)
  await page.getByLabel('Email', { exact: true }).fill(person.email)
  await page.getByLabel('Age', { exact: true }).fill(String(person.age))
}

export async function savePerson(page: Page, person: PersonInput) {
  await fillPerson(page, person)
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save person', exact: true })).toBeEnabled()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/person=[0-9a-f-]{36}/)
  return new URL(page.url()).searchParams.get('person')!
}

export async function seedPeople(owner: Owner, people: PersonInput[]) {
  const rows = people.map((person) => ({ id: crypto.randomUUID(), owner_id: owner.id, ...person }))
  const { error } = await owner.client.from('people').insert(rows)
  if (error) throw error
  return rows
}

export async function csvRows(download: Download): Promise<string[][]> {
  expect(download.suggestedFilename()).toBe('people.csv')
  const file = await download.path()
  if (!file) throw new Error('Downloaded CSV is unavailable')
  const text = await readFile(file, 'utf8')
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true })
  expect(parsed.errors).toEqual([])
  return parsed.data
}

export async function exportRows(page: Page) {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
  return csvRows(await download)
}

export function isPeopleRequest(url: string) {
  return new URL(url).pathname === '/rest/v1/people'
}

export function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
