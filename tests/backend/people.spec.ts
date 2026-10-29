import { randomUUID } from 'node:crypto'
import { test as base, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type Owner = { client: SupabaseClient; id: string }
type Owners = { first: Owner; second: Owner }

function configuredClient() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error(
      'Backend checks require VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Run supabase/setup.sql and enable anonymous sign-ins first.',
    )
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

async function newOwner(): Promise<Owner> {
  const client = configuredClient()
  const { data, error } = await client.auth.signInAnonymously()
  if (error) throw error
  if (!data.user) throw new Error('Anonymous sign-in did not return an identity.')
  return { client, id: data.user.id }
}

async function cleanup(owner: Owner) {
  const { error } = await owner.client.from('people').delete().eq('owner_id', owner.id)
  if (error) throw error
  await owner.client.auth.signOut({ scope: 'local' })
}

const test = base.extend<{ owners: Owners }>({
  owners: async ({ playwright: _playwright }, run) => {
    const owners: Owner[] = []
    let failure: unknown
    try {
      owners.push(await newOwner())
      owners.push(await newOwner())
      await run({ first: owners[0], second: owners[1] })
    } catch (error) {
      failure = error
    }
    // Try every owner even if one cleanup fails, while preserving the original
    // fixture error when setup or execution already failed.
    const results = await Promise.allSettled(owners.map(cleanup))
    if (failure) throw failure
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason
    }
  },
})

function person(owner: Owner, overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    owner_id: owner.id,
    name: 'Backend verification person',
    email: 'backend@example.test',
    age: 35,
    ...overrides,
  }
}

test('owned CRUD, stable-ID retries, and conditional timestamps', async ({ owners }) => {
  const owner = owners.first
  const payload = person(owner)
  const { data: created, error: createError } = await owner.client
    .from('people').upsert(payload, { onConflict: 'id' }).select().single()
  expect(createError).toBeNull()
  expect(created).toMatchObject(payload)
  expect(created.created_at).toBe(created.updated_at)

  const { data: repeated, error: repeatError } = await owner.client
    .from('people').upsert(payload, { onConflict: 'id' }).select().single()
  expect(repeatError).toBeNull()
  expect(repeated).toEqual(created)

  const { data: changed, error: changeError } = await owner.client
    .from('people').upsert({ ...payload, name: 'Changed name' }, { onConflict: 'id' }).select().single()
  expect(changeError).toBeNull()
  expect(changed.id).toBe(payload.id)
  expect(changed.created_at).toBe(created.created_at)
  expect(Date.parse(changed.updated_at)).toBeGreaterThan(Date.parse(created.updated_at))

  const { data: rows, error: listError } = await owner.client.from('people').select('id').eq('owner_id', owner.id)
  expect(listError).toBeNull()
  expect(rows).toEqual([{ id: payload.id }])

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await owner.client.from('people').delete().eq('id', payload.id)
    expect(error).toBeNull()
  }
  const { data: absent, error: absentError } = await owner.client.from('people').select('id').eq('id', payload.id)
  expect(absentError).toBeNull()
  expect(absent).toEqual([])
})

test('RLS prevents foreign reads, writes, forged ownership, and unauthenticated access', async ({ owners }) => {
  const { first, second } = owners
  const own = person(first)
  const foreign = person(second, { name: 'Other owner' })
  expect((await first.client.from('people').insert(own)).error).toBeNull()
  expect((await second.client.from('people').insert(foreign)).error).toBeNull()

  const { data: visible, error: visibleError } = await first.client.from('people').select('id')
  expect(visibleError).toBeNull()
  expect(visible).toEqual([{ id: own.id }])

  const { data: hidden, error: hiddenError } = await first.client.from('people').select('*').eq('id', foreign.id)
  expect(hiddenError).toBeNull()
  expect(hidden).toEqual([])

  // RLS may hide a row and report a zero-row update/delete instead of raising.
  const foreignUpdate = await first.client.from('people').update({ name: 'Stolen' }).eq('id', foreign.id).select('id')
  expect(foreignUpdate.error).toBeNull()
  expect(foreignUpdate.data).toEqual([])
  const foreignDelete = await first.client.from('people').delete().eq('id', foreign.id).select('id')
  expect(foreignDelete.error).toBeNull()
  expect(foreignDelete.data).toEqual([])
  const { data: intact, error: intactError } = await second.client.from('people').select('*').eq('id', foreign.id).single()
  expect(intactError).toBeNull()
  expect(intact).toMatchObject(foreign)

  const forged = person(first, { owner_id: second.id })
  expect((await first.client.from('people').insert(forged)).error).not.toBeNull()
  const { data: forgedRows } = await second.client.from('people').select('id').eq('id', forged.id)
  expect(forgedRows).toEqual([])

  expect((await first.client.from('people').upsert({ ...foreign, name: 'Stolen through upsert' }, { onConflict: 'id' })).error).not.toBeNull()
  expect((await second.client.from('people').select('*').eq('id', foreign.id).single()).data).toMatchObject(foreign)

  const unauthenticated = configuredClient()
  expect((await unauthenticated.from('people').select('*')).error).not.toBeNull()
  expect((await unauthenticated.from('people').insert(person(first))).error).not.toBeNull()
  expect((await unauthenticated.from('people').update({ name: 'Unauthenticated' }).eq('id', own.id)).error).not.toBeNull()
  expect((await unauthenticated.from('people').delete().eq('id', own.id)).error).not.toBeNull()
})

test('ownership and immutable metadata cannot be reassigned; timestamps are database-owned', async ({ owners }) => {
  const owner = owners.first
  const payload = person(owner)
  const { data: saved, error } = await owner.client.from('people')
    .insert({ ...payload, created_at: '2000-01-01T00:00:00Z', updated_at: '2000-01-01T00:00:00Z' })
    .select().single()
  expect(error).toBeNull()
  expect(Date.parse(saved.created_at)).toBeGreaterThan(Date.parse('2000-01-01T00:00:00Z'))
  expect(saved.updated_at).toBe(saved.created_at)

  const attempts = [
    { id: randomUUID() },
    { owner_id: owners.second.id },
    { created_at: '2001-01-01T00:00:00Z' },
  ]
  for (const update of attempts) {
    expect((await owner.client.from('people').update(update).eq('id', payload.id)).error).not.toBeNull()
  }

  const { data: metadataOnly, error: metadataError } = await owner.client.from('people')
    .update({ updated_at: '2002-01-01T00:00:00Z' }).eq('id', payload.id).select().single()
  expect(metadataError).toBeNull()
  expect(metadataOnly).toEqual(saved)

  const { data: untouched, error: untouchedError } = await owner.client.from('people').select('*').eq('id', payload.id).single()
  expect(untouchedError).toBeNull()
  expect(untouched).toEqual(saved)
})

test('database constraints reject invalid stored values and accept boundary ages', async ({ owners }) => {
  const owner = owners.first
  const invalidValues: Record<string, unknown>[] = [
    { name: null }, { name: '' }, { name: ' \t\n' }, { name: 'n'.repeat(201) },
    { email: null }, { email: '' }, { email: ' '.repeat(3) }, { email: 'e'.repeat(255) },
    { age: null }, { age: -1 }, { age: 151 }, { age: 'not-a-number' },
  ]
  for (const values of invalidValues) {
    const { error } = await owner.client.from('people').insert(person(owner, values))
    expect(error, `Expected database rejection for ${JSON.stringify(values)}`).not.toBeNull()
  }

  // A textual fractional integer is rejected at PostgREST's integer boundary.
  expect((await owner.client.from('people').insert(person(owner, { age: '1.5' }))).error).not.toBeNull()

  for (const age of [0, 150]) {
    const { data, error } = await owner.client.from('people')
      .insert(person(owner, { age, name: 'n'.repeat(200), email: 'e'.repeat(254) })).select('age').single()
    expect(error).toBeNull()
    expect(data?.age).toBe(age)
  }
})
