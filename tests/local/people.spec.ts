import { test, expect } from '@playwright/test'
import { deferred, exportRows, fillPerson, savePerson } from '../support/app'
import { jsonResponse, mockOrigin, mockPerson, mockSupabase } from '../support/mock-supabase'

const ada = { name: 'Ada Lovelace', email: 'ada@example.com', age: 36 }
const grace = { name: 'Grace Hopper', email: 'grace@example.com', age: 85 }
const peopleRoute = `${mockOrigin}/rest/v1/people**`

test('anonymous startup is single-flight; CRUD, reload, and New preserve the expected saved state', async ({ page }) => {
  const backend = await mockSupabase(page)
  await page.goto('/')
  await expect(page.getByLabel('Name', { exact: true })).toBeEnabled()
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
  expect(backend.authCalls).toBe(1)
  const id = await savePerson(page, ada)
  expect(backend.people.size).toBe(1)
  await page.getByLabel('Name', { exact: true }).fill('Unsaved edit')
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(ada.name)
  expect(backend.authCalls).toBe(1)
  await page.getByLabel('Name', { exact: true }).fill('Ada Byron')
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ada Byron', exact: true })).toBeVisible()
  expect(backend.people.get(id)?.name).toBe('Ada Byron')
  await page.getByRole('button', { name: 'New person', exact: true }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('')
  expect(new URL(page.url()).searchParams.has('person')).toBe(false)
  expect(backend.people.size).toBe(1)
  await page.getByRole('link', { name: 'Ada Byron', exact: true }).click()
  await page.getByRole('button', { name: 'Delete person', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Ada Byron', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('')
  expect(backend.people.size).toBe(0)
})

test('Back after the first save opens a blank draft and Forward restores the saved record', async ({ page }) => {
  const backend = await mockSupabase(page)
  await page.goto('/')
  const id = await savePerson(page, ada)
  await page.goBack()
  expect(new URL(page.url()).searchParams.has('person')).toBe(false)
  for (const label of ['Name', 'Email', 'Age']) {
    await expect(page.getByLabel(label, { exact: true })).toHaveValue('')
  }
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
  expect(backend.people.size).toBe(1)
  expect(backend.people.get(id)).toMatchObject(ada)
  await page.goForward()
  await expect(page).toHaveURL(new RegExp(`person=${id}`))
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(ada.name)
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(ada.email)
  await expect(page.getByLabel('Age', { exact: true })).toHaveValue(String(ada.age))
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  expect(backend.people.size).toBe(1)
})

test('blank and invalid values never write; boundary ages and normalized fields save', async ({ page }) => {
  const backend = await mockSupabase(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  for (const label of ['Name', 'Email', 'Age']) {
    await expect(page.getByLabel(label, { exact: true })).toHaveAttribute('aria-invalid', 'true')
  }
  await fillPerson(page, { ...ada, email: 'invalid', age: 1.5 })
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByLabel('Age', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  expect(backend.writes).toHaveLength(0)
  const id = await savePerson(page, { name: '  Ada Lovelace  ', email: ' ada@example.com ', age: 0 })
  expect(backend.people.get(id)).toMatchObject({ ...ada, age: 0 })
  await page.getByRole('button', { name: 'New person', exact: true }).click()
  await savePerson(page, { ...grace, age: 150 })
})

test('save failure retains the draft UUID and recovers without marking an unconfirmed save as saved', async ({ page }) => {
  const backend = await mockSupabase(page)
  let fail = true
  let firstId = ''
  await page.route(peopleRoute, async (route) => {
    if (route.request().method() !== 'POST' || !fail) return route.fallback()
    const payload = route.request().postDataJSON()
    firstId = (Array.isArray(payload) ? payload[0] : payload).id
    await jsonResponse(route, { message: 'Save unavailable' }, 503)
  })
  await page.goto('/')
  await fillPerson(page, ada)
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(ada.email)
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
  expect(backend.people.size).toBe(0)
  fail = false
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  expect(backend.people.size).toBe(1)
  expect(backend.people.has(firstId)).toBe(true)
})

test('an uncertain committed save can be retried under the same ID', async ({ page }) => {
  const backend = await mockSupabase(page)
  let loseResponse = true
  let draftId = ''
  await page.route(peopleRoute, async (route) => {
    if (route.request().method() !== 'POST' || !loseResponse) return route.fallback()
    loseResponse = false
    const payload = route.request().postDataJSON()
    const row = Array.isArray(payload) ? payload[0] : payload
    draftId = row.id
    backend.people.set(row.id, mockPerson(row.name, 1, row))
    await route.abort('failed')
  })
  await page.goto('/')
  await fillPerson(page, ada)
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
  expect(backend.people.size).toBe(1)
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  expect(backend.people.size).toBe(1)
  expect(new URL(page.url()).searchParams.get('person')).toBe(draftId)
})

test('Retry resends the failed snapshot while newer edits stay unsaved until an ordinary Save', async ({ page }) => {
  const backend = await mockSupabase(page)
  const newerDraft = { name: 'Ada Byron', email: 'byron@example.com', age: 40 }
  const attempts: unknown[] = []
  await page.route(peopleRoute, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const payload = route.request().postDataJSON()
    const row = Array.isArray(payload) ? payload[0] : payload
    attempts.push(row)
    if (attempts.length !== 1) return route.fallback()
    backend.people.set(row.id, mockPerson(row.name, 1, row))
    await route.abort('failed')
  })
  await page.goto('/')
  await fillPerson(page, ada)
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  const id = [...backend.people.keys()][0]
  await fillPerson(page, newerDraft)
  await page.getByRole('button', { name: /Retry/ }).click()
  await expect(page.getByRole('button', { name: 'Save person', exact: true })).toBeEnabled()
  await expect(page).toHaveURL(new RegExp(`person=${id}`))
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(newerDraft.name)
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(newerDraft.email)
  await expect(page.getByLabel('Age', { exact: true })).toHaveValue(String(newerDraft.age))
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
  expect(attempts).toHaveLength(2)
  expect(attempts[1]).toEqual(attempts[0])
  expect(backend.people.get(id)).toMatchObject(ada)
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save person', exact: true })).toBeEnabled()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  expect(backend.people.size).toBe(1)
  expect(backend.people.get(id)).toMatchObject(newerDraft)
})

test('anonymous startup failures show Retry and do not render an apparently empty collection', async ({ page }) => {
  await mockSupabase(page)
  let fail = true
  await page.route(`${mockOrigin}/auth/v1/signup**`, async (route) => {
    if (fail) await jsonResponse(route, { message: 'Sign-in unavailable' }, 503)
    else await route.fallback()
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0)
  fail = false
  await page.getByRole('button', { name: /Retry/ }).click()
  await expect(page.getByLabel('Name', { exact: true })).toBeEnabled()
})

test('pending save disables edits and data actions until it completes', async ({ page }) => {
  await mockSupabase(page, [mockPerson(grace.name, 2, grace)])
  const entered = deferred()
  const release = deferred()
  await page.route(peopleRoute, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    entered.resolve()
    await release.promise
    await route.fallback()
  })
  await page.goto('/')
  await fillPerson(page, ada)
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  try {
    await entered.promise
    for (const label of ['Name', 'Email', 'Age']) await expect(page.getByLabel(label, { exact: true })).toBeDisabled()
    for (const button of ['New person', 'Export CSV']) await expect(page.getByRole('button', { name: button, exact: true })).toBeDisabled()
    await expect(page.getByRole('link', { name: grace.name, exact: true })).toHaveAttribute('aria-disabled', 'true')
  } finally {
    release.resolve()
  }
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
})

test('browser Back during a delayed save keeps the active selection and draft locked until confirmation', async ({ page }) => {
  const first = mockPerson(ada.name, 1, ada)
  const second = mockPerson(grace.name, 2, grace)
  const backend = await mockSupabase(page, [first, second])
  const entered = deferred()
  const release = deferred()
  await page.route(peopleRoute, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    entered.resolve()
    await release.promise
    await route.fallback()
  })
  await page.goto('/')
  await page.getByRole('link', { name: second.name, exact: true }).click()
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(second.email)
  await page.getByRole('link', { name: first.name, exact: true }).click()
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(first.email)
  await page.getByLabel('Name', { exact: true }).fill('Ada Byron')
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  try {
    await entered.promise
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`person=${first.id}`))
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ada Byron')
    await expect(page.getByLabel('Name', { exact: true })).toBeDisabled()
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(first.email)
  } finally {
    release.resolve()
  }
  await expect(page.getByRole('button', { name: 'Save person', exact: true })).toBeEnabled()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ada Byron')
  expect(backend.people.get(first.id)?.name).toBe('Ada Byron')
})

test('out-of-order detail responses cannot replace the current selection', async ({ page }) => {
  const first = mockPerson(ada.name, 1, ada)
  const second = mockPerson(grace.name, 2, grace)
  await mockSupabase(page, [first, second])
  const entered = deferred()
  const release = deferred()
  const finished = deferred()
  await page.route(peopleRoute, async (route) => {
    if (new URL(route.request().url()).searchParams.get('id') !== `eq.${first.id}`) return route.fallback()
    entered.resolve()
    await release.promise
    try { await jsonResponse(route, [first]) } catch { /* A cancelled obsolete request is safe. */ }
    finished.resolve()
  })
  await page.goto('/')
  await page.getByRole('link', { name: first.name, exact: true }).click()
  try {
    await entered.promise
    await page.getByRole('link', { name: second.name, exact: true }).click()
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(second.email)
  } finally {
    release.resolve()
  }
  await finished.promise
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(second.name)
  await page.screenshot({ path: 'test-results/local-desktop.png', fullPage: true })
})

test('list and detail failures have recoverable feedback', async ({ page }) => {
  await mockSupabase(page, [mockPerson(ada.name, 1, ada)])
  let fail = true
  await page.route(peopleRoute, async (route) => {
    if (route.request().method() === 'GET' && fail) await jsonResponse(route, { message: 'Load unavailable' }, 503)
    else await route.fallback()
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toBeVisible()
  fail = false
  await page.getByRole('button', { name: /Retry/ }).click()
  await expect(page.getByRole('link', { name: ada.name, exact: true })).toBeVisible()
  fail = true
  await page.getByRole('link', { name: ada.name, exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  fail = false
  await page.getByRole('button', { name: /Retry/ }).click()
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(ada.email)
})

test('failed deletion retains the record and form until a successful retry', async ({ page }) => {
  const person = mockPerson(ada.name, 1, ada)
  const backend = await mockSupabase(page, [person])
  let fail = true
  await page.route(peopleRoute, async (route) => {
    if (route.request().method() === 'DELETE' && fail) await jsonResponse(route, { message: 'Delete unavailable' }, 503)
    else await route.fallback()
  })
  await page.goto(`/?person=${person.id}`)
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(ada.name)
  await page.getByRole('button', { name: 'Delete person', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('link', { name: ada.name, exact: true })).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(ada.name)
  expect(backend.people.size).toBe(1)
  fail = false
  await page.getByRole('button', { name: 'Delete person', exact: true }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('')
  expect(backend.people.size).toBe(0)
})

test('CSV fetches every saved row under a smaller server cap and excludes draft changes', async ({ page }) => {
  const records = [
    mockPerson('=SUM(1,2)', 1, { email: 'formula@example.com' }),
    mockPerson('Ada "A",\nLovelace', 2),
    mockPerson('Ágnes', 3),
  ]
  await mockSupabase(page, records, 1)
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Ágnes', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Ágnes', exact: true }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ágnes')
  await page.getByLabel('Name', { exact: true }).fill('Unsaved draft')
  const rows = await exportRows(page)
  expect(rows).toHaveLength(4)
  expect(rows[0]).toEqual(['Name', 'Email', 'Age'])
  expect(rows.slice(1)).toEqual(expect.arrayContaining([
    ["'=SUM(1,2)", 'formula@example.com', '30'],
    ['Ada "A",\nLovelace', 'person2@example.com', '30'],
    ['Ágnes', 'person3@example.com', '30'],
  ]))
})

test('a later export-page failure produces no partial file and retry recovers', async ({ page }) => {
  await mockSupabase(page, [mockPerson(ada.name, 1), mockPerson(grace.name, 2)], 1)
  let fail = true
  let downloads = 0
  page.on('download', () => { downloads += 1 })
  await page.route(peopleRoute, async (route) => {
    const url = new URL(route.request().url())
    const offset = Number(url.searchParams.get('offset') || 0)
    if ((url.searchParams.get('select') || '').includes('email') && offset > 0 && fail) {
      await jsonResponse(route, { message: 'Second export page unavailable' }, 503)
    } else await route.fallback()
  })
  await page.goto('/')
  await expect(page.getByRole('link', { name: grace.name, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(downloads).toBe(0)
  fail = false
  expect(await exportRows(page)).toHaveLength(3)
})

test('empty export has only its header; unavailable and malformed selections yield a blank draft', async ({ page }) => {
  await mockSupabase(page)
  await page.goto('/?person=22222222-2222-4222-8222-000000000099')
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('')
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
  expect(await exportRows(page)).toEqual([['Name', 'Email', 'Age']])
  await page.goto('/?person=not-a-uuid')
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('')
})

test('mobile layout keeps all fields and actions accessible without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockSupabase(page, [mockPerson(ada.name, 1, ada)])
  await page.goto('/')
  await expect(page.getByRole('link', { name: ada.name, exact: true })).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save person', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/local-mobile.png', fullPage: true })
})
