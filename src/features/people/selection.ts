import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'

function readSelection() {
  const value = new URL(window.location.href).searchParams.get('person')
  return value && z.uuid().safeParse(value).success ? value : null
}

export function usePersonSelection(locked: boolean) {
  const [selectedId, setSelectedId] = useState(readSelection)
  const navigate = useCallback((id: string | null, replace = false) => {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('person', id)
    else url.searchParams.delete('person')
    if (url.href !== window.location.href) {
      if (replace) window.history.replaceState(null, '', url)
      else window.history.pushState(null, '', url)
    }
    setSelectedId(id)
  }, [])

  useEffect(() => {
    function sync() {
      // popstate cannot be cancelled. Restore the active selection in history
      // instead of remounting another editor while a write is unresolved.
      if (locked) { navigate(selectedId); return }
      const id = readSelection()
      navigate(id, true)
    }
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [navigate, selectedId, locked])

  return { selectedId, navigate }
}
