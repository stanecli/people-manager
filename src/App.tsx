import { lazy, Suspense } from 'react'
import { Loading } from '@/components/feedback'
import { WelcomePanel } from '@/components/welcome-panel'
import { configError } from '@/integrations/supabase/configuration'

const SessionBoundary = lazy(() => import('@/integrations/supabase/session-boundary'))

export default function App() {
  if (configError) return <WelcomePanel><div role="alert" className="rounded-xl border border-border bg-secondary/60 p-5">
    <h2 className="mb-2 text-sm font-semibold">Connect your collection</h2><p className="text-sm leading-relaxed text-muted-foreground">{configError}</p>
    <ul className="mt-4 space-y-2 text-xs text-foreground"><li><code>VITE_SUPABASE_URL</code></li><li><code>VITE_SUPABASE_PUBLISHABLE_KEY</code></li></ul>
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Follow the repository’s setup guide to enable anonymous sign-ins and create the database.</p>
  </div></WelcomePanel>
  return <Suspense fallback={<WelcomePanel><Loading>Opening your collection…</Loading></WelcomePanel>}><SessionBoundary /></Suspense>
}
