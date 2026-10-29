import { lazy, Suspense } from 'react'
import { ErrorNotice, Loading } from '@/components/feedback'
import { WelcomePanel } from '@/components/welcome-panel'
import { useAnonymousSession } from './session'

const PeoplePage = lazy(() => import('@/features/people/people-page').then((module) => ({ default: module.PeoplePage })))

export default function SessionBoundary() {
  const { state, retry } = useAnonymousSession()
  if (state.status === 'ready') return <Suspense fallback={<WelcomePanel><Loading>Opening your collection…</Loading></WelcomePanel>}><PeoplePage key={state.session.user.id} ownerId={state.session.user.id} /></Suspense>
  return <WelcomePanel>
    {state.status === 'loading' ? <Loading>Opening your collection…</Loading> : <ErrorNotice onRetry={retry}>Could not restore your private session. Please retry to continue.</ErrorNotice>}
  </WelcomePanel>
}
