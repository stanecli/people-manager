import { z } from 'zod'
import { supabase } from '@/integrations/supabase/client'
import { personSummarySchema, savedPersonSchema, type PersonInput } from './model'

const DETAIL_FIELDS = 'id,owner_id,name,email,age,created_at,updated_at'

export function createPeopleRepository(ownerId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const client = supabase

  async function readAll<T extends { id: string }>(projection: string, schema: z.ZodType<T>, signal?: AbortSignal) {
    const records: T[] = []
    const ids = new Set<string>()
    let expectedTotal: number | undefined
    while (true) {
      let query = client.from('people').select(projection, { count: 'exact' })
        .eq('owner_id', ownerId).order('name').order('id').range(records.length, records.length + 499)
      if (signal) query = query.abortSignal(signal)
      const { data, error, count } = await query
      if (error) throw error
      if (count === null || (expectedTotal !== undefined && expectedTotal !== count)) {
        throw new Error('The complete collection could not be confirmed. Please retry.')
      }
      expectedTotal = count
      const page = z.array(schema).parse(data)
      for (const record of page) {
        if (ids.has(record.id)) throw new Error('The collection changed while loading. Please retry.')
        ids.add(record.id)
        records.push(record)
      }
      if (records.length === count) return records
      if (page.length === 0 || records.length > count) throw new Error('The complete collection could not be loaded. Please retry.')
    }
  }

  return {
    list: (signal?: AbortSignal) => readAll('id,name', personSummarySchema, signal),
    exportAll: () => readAll(DETAIL_FIELDS, savedPersonSchema),
    async get(id: string, signal?: AbortSignal) {
      let query = client.from('people').select(DETAIL_FIELDS).eq('owner_id', ownerId).eq('id', id)
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query.maybeSingle()
      if (error) throw error
      return data === null ? null : savedPersonSchema.parse(data)
    },
    async save(id: string, input: PersonInput) {
      const { data, error } = await client.from('people')
        .upsert({ id, owner_id: ownerId, ...input }, { onConflict: 'id' }).select(DETAIL_FIELDS).single()
      if (error) throw error
      return savedPersonSchema.parse(data)
    },
    async remove(id: string) {
      const { error } = await client.from('people').delete().eq('owner_id', ownerId).eq('id', id)
      if (error) throw error
    },
  }
}

export type PeopleRepository = ReturnType<typeof createPeopleRepository>
