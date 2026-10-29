import { test, expect, allowProtectedPreview, cleanupOwner, deferred, exportRows, fillPerson, ownerForPage, savePerson, seedPeople } from '../support/app'

const ada = { name: 'Ada Lovelace', email: 'ada@example.com', age: 36 }
const grace = { name: 'Grace Hopper', email: 'grace@example.com', age: 85 }
const peopleRoute = '**/rest/v1/people**'

test('a new visitor has a blank unsaved draft and an empty export', async ({ page, owner }) => {
  await expect(page.getByRole('heading', { name: 'People Manager', exact: true })).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Age', { exact: true })).toHaveValue('')
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
  const { count, error } = await owner.client.from('people').select('id', { count: 'exact', head: true })
  expect(error).toBeNull()
  expect(count).toBe(0)
  expect(await exportRows(page)).toEqual([['Name', 'Email', 'Age']])
})

test('create, update, and repeated saves retain one record ID; the list shows names only', async ({ page, owner }) => {
  const id = await savePerson(page, ada)
  await expect(page.getByRole('link', { name: ada.name, exact: true })).toBeVisible()
  await expect(page.getByText(ada.email, { exact: true })).toHaveCount(0)
  await page.getByLabel('Name', { exact: true }).fill('Ada Byron')
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ada Byron', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save person', exact: true })).toBeEnabled()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  const { data, error } = await owner.client.from('people').select('id,name,email,age')
  expect(error).toBeNull()
  expect(data).toEqual([{ id, name: 'Ada Byron', email: ada.email, age: ada.age }])
})

test('New discards edits and creates no row; reload restores saved selection and discards unsaved edits', async ({ page, owner }) => {
  const id = await savePerson(page, ada)
  await page.getByLabel('Name', { exact: true }).fill('Unsaved change')
  await page.reload()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(ada.name)
  await expect(page).toHaveURL(new RegExp(`person=${id}`))
  await page.getByRole('button', { name: 'New person', exact: true }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('')
  expect(new URL(page.url()).searchParams.has('person')).toBe(false)
  await fillPerson(page, grace)
  const { count } = await owner.client.from('people').select('id', { count: 'exact', head: true })
  expect(count).toBe(1)
  await page.getByRole('link', { name: ada.name, exact: true }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(ada.name)
  await page.goBack()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('')
  await page.goForward()
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(ada.email)
})

test('required fields, email, and integer age validate; 0 and 150 are valid', async ({ page, owner }) => {
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  for (const label of ['Name', 'Email', 'Age']) {
    await expect(page.getByLabel(label, { exact: true })).toHaveAttribute('aria-invalid', 'true')
  }
  await fillPerson(page, { ...ada, email: 'invalid-email' })
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await page.getByLabel('Email', { exact: true }).fill(ada.email)
  for (const invalid of ['1.5', '-1', '151']) {
    await page.getByLabel('Age', { exact: true }).fill(invalid)
    await page.getByRole('button', { name: 'Save person', exact: true }).click()
    await expect(page.getByLabel('Age', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  }
  const { count } = await owner.client.from('people').select('id', { count: 'exact', head: true })
  expect(count).toBe(0)
  await savePerson(page, { ...ada, age: 0 })
  await page.getByRole('button', { name: 'New person', exact: true }).click()
  await savePerson(page, { ...grace, age: 150 })
})

test('a lost save response retains the draft; retry uses the same ID without duplication', async ({ page, owner }) => {
  let loseResponse = true
  const attemptedIds: string[] = []
  await page.route(peopleRoute, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const payload = route.request().postDataJSON()
    attemptedIds.push((Array.isArray(payload) ? payload[0] : payload).id)
    if (!loseResponse) return route.fallback()
    loseResponse = false
    const response = await route.fetch()
    expect(response.ok()).toBeTruthy()
    await route.abort('failed')
  })
  await fillPerson(page, ada)
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(ada.name)
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  expect(attemptedIds).toHaveLength(2)
  expect(attemptedIds[1]).toBe(attemptedIds[0])
  const { count } = await owner.client.from('people').select('id', { count: 'exact', head: true })
  expect(count).toBe(1)
})

test('a pending write pauses editing, selection, New, and export', async ({ page, owner }) => {
  await seedPeople(owner, [grace])
  await page.reload()
  const entered = deferred()
  const release = deferred()
  await page.route(peopleRoute, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    entered.resolve()
    await release.promise
    await route.continue()
  })
  await fillPerson(page, ada)
  await page.getByRole('button', { name: 'Save person', exact: true }).click()
  try {
    await entered.promise
    for (const label of ['Name', 'Email', 'Age']) await expect(page.getByLabel(label, { exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'New person', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Export CSV', exact: true })).toBeDisabled()
    await expect(page.getByRole('link', { name: grace.name, exact: true })).toHaveAttribute('aria-disabled', 'true')
  } finally {
    release.resolve()
  }
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
})

test('a delayed previous selection never replaces the current person', async ({ page, owner }) => {
  const [first] = await seedPeople(owner, [ada, grace])
  await page.reload()
  const entered = deferred()
  const release = deferred()
  const finished = deferred()
  await page.route(peopleRoute, async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() !== 'GET' || url.searchParams.get('id') !== `eq.${first.id}`) return route.fallback()
    const response = await route.fetch()
    entered.resolve()
    await release.promise
    try { await route.fulfill({ response }) } catch { /* Aborting obsolete detail requests is valid. */ }
    finished.resolve()
  })
  await page.getByRole('link', { name: ada.name, exact: true }).click()
  try {
    await entered.promise
    await page.getByRole('link', { name: grace.name, exact: true }).click()
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(grace.email)
  } finally {
    release.resolve()
  }
  await finished.promise
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(grace.name)
})

test('list and detail loading failures show feedback and recover through Retry', async ({ page, owner }) => {
  const [row] = await seedPeople(owner, [ada])
  let fail = true
  await page.route(peopleRoute, async (route) => {
    if (route.request().method() === 'GET' && fail) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporarily unavailable' }) })
    } else await route.fallback()
  })
  await page.reload()
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
  expect(new URL(page.url()).searchParams.get('person')).toBe(row.id)
})

test('delete failure retains the record and retrying an already-completed deletion is a no-op', async ({ page }) => {
  await savePerson(page, ada)
  let loseResponse = true
  await page.route(peopleRoute, async (route) => {
    if (route.request().method() !== 'DELETE' || !loseResponse) return route.fallback()
    loseResponse = false
    expect((await route.fetch()).ok()).toBeTruthy()
    await route.abort('failed')
  })
  await page.getByRole('button', { name: 'Delete person', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('link', { name: ada.name, exact: true })).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(ada.name)
  await page.getByRole('button', { name: 'Delete person', exact: true }).click()
  await expect(page.getByRole('link', { name: ada.name, exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('')
  await page.reload()
  await expect(page.getByRole('link', { name: ada.name, exact: true })).toHaveCount(0)
})

test('CSV includes unopened saved records, quotes, newlines, Unicode, and formula protection; draft changes are excluded', async ({ page, owner }) => {
  const records = [
    { name: '=SUM(1,2)', email: 'formula@example.com', age: 10 },
    { name: 'Ada "A",\nLovelace', email: 'ada@example.com', age: 36 },
    { name: 'Ágnes', email: 'agnes@example.com', age: 42 },
  ]
  await seedPeople(owner, records)
  await page.reload()
  await page.getByRole('link', { name: 'Ágnes', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Unsaved draft')
  const rows = await exportRows(page)
  expect(rows[0]).toEqual(['Name', 'Email', 'Age'])
  expect(rows.slice(1)).toEqual(expect.arrayContaining([
    ["'=SUM(1,2)", 'formula@example.com', '10'],
    ['Ada "A",\nLovelace', 'ada@example.com', '36'],
    ['Ágnes', 'agnes@example.com', '42'],
  ]))
  expect(rows).toHaveLength(4)
  const { data: ordered, error } = await owner.client.from('people').select('name').order('name').order('id')
  expect(error).toBeNull()
  expect(rows.slice(1).map((row) => row[0])).toEqual(ordered!.map((row) => row.name.startsWith('=') ? `'${row.name}` : row.name))
})

test('export traverses multiple pages; a later-page failure creates no partial download and can be retried', async ({ page, owner }) => {
  test.setTimeout(90_000)
  await seedPeople(owner, Array.from({ length: 503 }, (_, index) => ({ name: `Person ${String(index).padStart(4, '0')}`, email: `person${index}@example.com`, age: index % 151 })))
  await page.reload()
  let fail = true
  let downloads = 0
  page.on('download', () => { downloads += 1 })
  await page.route(peopleRoute, async (route) => {
    const url = new URL(route.request().url())
    const fields = url.searchParams.get('select') || ''
    const offset = Number(url.searchParams.get('offset') || route.request().headers().range?.split('-')[0] || 0)
    if (route.request().method() === 'GET' && fields.includes('email') && offset > 0 && fail) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Export page unavailable' }) })
    } else await route.fallback()
  })
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(downloads).toBe(0)
  fail = false
  const rows = await exportRows(page)
  expect(rows).toHaveLength(504)
  expect(rows[1][0]).toBe('Person 0000')
  expect(rows.at(-1)![0]).toBe('Person 0502')
})

test('unavailable selection opens a blank draft', async ({ page }) => {
  await page.goto('/?person=22222222-2222-4222-8222-222222222222')
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('')
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
})

test('separate anonymous browser sessions list and export only their own records', async ({ page, browser, baseURL }) => {
  await savePerson(page, ada)
  const otherContext = await browser.newContext()
  let otherOwner
  try {
    await allowProtectedPreview(otherContext, baseURL!)
    const otherPage = await otherContext.newPage()
    await otherPage.goto(baseURL!)
    otherOwner = await ownerForPage(otherPage)
    await expect(otherPage.getByRole('link', { name: ada.name, exact: true })).toHaveCount(0)
    await savePerson(otherPage, grace)
    expect(await exportRows(otherPage)).toEqual([['Name', 'Email', 'Age'], [grace.name, grace.email, String(grace.age)]])
    await page.reload()
    await expect(page.getByRole('link', { name: grace.name, exact: true })).toHaveCount(0)
    expect(await exportRows(page)).toEqual([['Name', 'Email', 'Age'], [ada.name, ada.email, String(ada.age)]])
  } finally {
    if (otherOwner) await cleanupOwner(otherOwner)
    await otherContext.close()
  }
})
