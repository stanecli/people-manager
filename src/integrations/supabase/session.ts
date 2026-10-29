import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './client'

let bootstrap: Promise<Session> | undefined

function restoreAnonymousSession() {
  if (!bootstrap) {
    bootstrap = (async () => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const restored = await supabase.auth.getSession()
      if (restored.error) throw restored.error
      if (restored.data.session) return restored.data.session
      const created = await supabase.auth.signInAnonymously()
      if (created.error) throw created.error
      if (!created.data.session) throw new Error('The session could not be confirmed.')
      return created.data.session
    })().finally(() => { bootstrap = undefined })
  }
  return bootstrap
}

type SessionState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; session: Session }

export function useAnonymousSession() {
  const [state, setState] = useState<SessionState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      if (!active || event === 'INITIAL_SESSION') return
      if (event === 'SIGNED_OUT') setState({ status: 'error' })
      else if (session) setState({ status: 'ready', session })
    })
    void restoreAnonymousSession().then(
      (session) => { if (active) setState({ status: 'ready', session }) },
      () => { if (active) setState({ status: 'error' }) },
    )
    return () => {
      active = false
      subscription?.data.subscription.unsubscribe()
    }
  }, [attempt])

  function retry() {
    setState({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  return { state, retry }
}
