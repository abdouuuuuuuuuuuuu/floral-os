import { createContext, useContext } from 'react'

// Pages the user has visited stay mounted (hidden) so they keep their data,
// filters and scroll when the user comes back. This tells a page whether it
// is the one on screen, so app-wide side effects (new-order chime, keyboard
// shortcuts) run only once, from the visible page.
export const PageActiveContext = createContext(true)

export function usePageActive() {
  return useContext(PageActiveContext)
}
