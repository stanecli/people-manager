import type { Page, Route } from '@playwright/test'

export type MockPerson = {
  id: string
  owner_id: string
  name: string
  email: string
  age: number
  created_at: string
  updated_at: string
}

export const mockOwnerId = '11111111-1111-4111-8111-111111111111'
export const mockOrigin = 'https://people-test.supabase.co'

const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': 'content-range',
  'content-type': 'application/json',
}

export async function jsonResponse(route: Route, data: unknown, status = 200, extra: Record<string, string> = {}) {
  await route.fulfill({ status, headers: { ...headers, ...extra }, body: JSON.stringify(data) })
}

function session() {
  const now = Math.floor(Date.now() / 1000)
  const user = {
    id: mockOwnerId,
    aud: 'authenticated', role: 'authenticated', email: '',
    app_metadata: { provider: 'anonymous', providers: [] },
    user_metadata: {}, identities: [], is_anonymous: true,
    created_at: new Date().toISOString(),
  }
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: mockOwnerId, aud: 'authenticated', role: 'authenticated', is_anonymous: true, iat: now, exp: now + 3600 })}.local-test-signature`,
    refresh_token: 'local-refresh-token', token_type: 'bearer',
    expires_in: 3600, expires_at: now + 3600, user,
  }
}

export function mockPerson(name: string, index = 1, fields: Partial<MockPerson> = {}): MockPerson {
  return {
    id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
    owner_id: mockOwnerId,
    name,
    email: `person${index}@example.com`,
    age: 30,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...fields,
  }
}

export async function mockSupabase(page: Page, initial: MockPerson[] = [], pageCap = 500) {
  const people = new Map(initial.map((person) => [person.id, person]))
  const writes: { method: string; id: string; body: unknown }[] = []
  let authCalls = 0
  await page.route(`${mockOrigin}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers })
      return
    }
    if (url.pathname.startsWith('/auth/v1/')) {
      if (url.pathname.endsWith('/signup')) authCalls += 1
      await jsonResponse(route, url.pathname.endsWith('/user') ? session().user : session())
      return
    }
    if (url.pathname !== '/rest/v1/people') {
      await route.abort('failed')
      return
    }
    const idFilter = url.searchParams.get('id')?.replace(/^eq\./, '')
    if (request.method() === 'POST') {
      const payload = request.postDataJSON()
      const row = Array.isArray(payload) ? payload[0] : payload
      const existing = people.get(row.id)
      const unchanged = existing && ['name', 'email', 'age'].every((key) => row[key] === existing[key as keyof MockPerson])
      const saved: MockPerson = {
        ...row,
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: unchanged ? existing.updated_at : new Date().toISOString(),
      }
      people.set(row.id, saved)
      writes.push({ method: 'POST', id: row.id, body: row })
      await jsonResponse(route, request.headers().accept?.includes('object+json') ? saved : [saved], existing ? 200 : 201)
      return
    }
    if (request.method() === 'DELETE') {
      if (idFilter) people.delete(idFilter)
      writes.push({ method: 'DELETE', id: idFilter || '', body: null })
      await route.fulfill({ status: 204, headers })
      return
    }
    const matching = [...people.values()]
      .filter((person) => !idFilter || person.id === idFilter)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    const range = request.headers().range?.split('-').map(Number)
    const offset = Number(url.searchParams.get('offset') || range?.[0] || 0)
    const limit = Math.min(Number(url.searchParams.get('limit') || (range ? range[1] - offset + 1 : pageCap)), pageCap)
    const fields = (url.searchParams.get('select') || '*').split(',').map((field) => field.trim())
    const selected = matching.slice(offset, offset + limit).map((person) => fields.includes('*')
      ? person
      : Object.fromEntries(fields.map((field) => [field, person[field as keyof MockPerson]])))
    const count = matching.length
    const contentRange = selected.length ? `${offset}-${offset + selected.length - 1}/${count}` : `*/${count}`
    if (request.headers().accept?.includes('object+json')) {
      if (selected.length === 1) await jsonResponse(route, selected[0], 200, { 'content-range': contentRange })
      else await jsonResponse(route, { code: 'PGRST116', details: 'The result contains 0 rows', message: 'JSON object requested, multiple (or no) rows returned' }, 406)
    } else {
      await jsonResponse(route, selected, 200, { 'content-range': contentRange })
    }
  })
  return { people, writes, get authCalls() { return authCalls } }
}
